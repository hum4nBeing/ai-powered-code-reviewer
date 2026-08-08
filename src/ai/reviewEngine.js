/**
 * 2-Pass AI Code Review Engine with Token-Aware Batching & Adaptive Auto-Retry
 */

export const PASS1_SYSTEM_PROMPT = `Review the git diff for bugs, security vulnerabilities, and performance flaws.
Ignore style/formatting nitpicks. Output ONLY a valid JSON array:
[{"fileName":"str","lineNumber":123,"severity":"High"|"Medium"|"Low","category":"Security"|"Performance"|"Bug"|"Architecture","message":"explanation and fix"}]
Return [] if no issues found. No text outside JSON.`;

export const PASS2_SYSTEM_PROMPT = `Filter candidate findings against the git diff. Remove false positives and hallucinated line numbers.
Return ONLY verified issues in a valid JSON array:
[{"fileName":"str","lineNumber":123,"severity":"High"|"Medium"|"Low","category":"Security"|"Performance"|"Bug"|"Architecture","message":"verified message"}]
Return [] if all candidates were invalid. No text outside JSON.`;

const MAX_BATCH_TOKENS = 3500; // Safe prompt limit per batch to leave headroom for completion tokens

/**
 * Formats parsed diff structures into a prompt-friendly string.
 * @param {Array} parsedDiff - Output from parseRawDiff
 * @returns {string}
 */
export function formatDiffForPrompt(parsedDiff) {
  if (!Array.isArray(parsedDiff) || parsedDiff.length === 0) {
    return 'No git diff changes found.';
  }

  const lines = [];

  for (const file of parsedDiff) {
    lines.push(`File: ${file.fileName} (+${file.additions}, -${file.deletions})`);
    for (const chunk of file.chunks || []) {
      lines.push(chunk.content);
      for (const change of chunk.changes || []) {
        const lineNo = change.ln || change.ln2 || change.ln1 || '';
        const typeSymbol = change.type === 'add' ? '+' : change.type === 'del' ? '-' : ' ';
        lines.push(`${typeSymbol} L${lineNo}: ${change.content}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Estimates token count for a single parsed file diff.
 * @param {Object} fileDiff 
 * @returns {number}
 */
export function estimateFileTokens(fileDiff) {
  const text = formatDiffForPrompt([fileDiff]);
  return Math.ceil(text.length / 4);
}

/**
 * Groups parsed git diff files into token-bounded batches.
 * @param {Array} parsedDiff 
 * @param {number} [maxBatchTokens=MAX_BATCH_TOKENS] 
 * @returns {Array<Array>}
 */
export function groupDiffsIntoBatches(parsedDiff, maxBatchTokens = MAX_BATCH_TOKENS) {
  const batches = [];
  let currentBatch = [];
  let currentTokens = 0;

  for (const file of parsedDiff) {
    const fileTokens = estimateFileTokens(file);

    if (currentBatch.length > 0 && currentTokens + fileTokens > maxBatchTokens) {
      batches.push(currentBatch);
      currentBatch = [file];
      currentTokens = fileTokens;
    } else {
      currentBatch.push(file);
      currentTokens += fileTokens;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Helper to extract retry wait time (in seconds) from API rate limit error messages.
 * Example Groq message: "Please try again in 33.965s." -> returns 35s
 * @param {Error} err 
 * @returns {number} Wait time in seconds
 */
function extractRetryWaitSeconds(err) {
  const msg = err ? err.message || '' : '';
  const match = msg.match(/try again in ([0-9.]+)\s*s/i) || msg.match(/retry after ([0-9.]+)\s*s/i);
  if (match) {
    const parsedSec = parseFloat(match[1]);
    if (!isNaN(parsedSec) && parsedSec > 0) {
      return Math.ceil(parsedSec) + 1; // Add 1s safety buffer
    }
  }
  return 30; // Default fallback wait time on 429/413 errors
}

/**
 * Reviews a single batch of diff files.
 * @param {Array} batchDiff 
 * @param {import('../providers/baseProvider.js').BaseProvider} provider 
 * @param {Object} options 
 * @returns {Promise<{findings: Array, usage: {promptTokens: number, completionTokens: number}}>}
 */
async function runReviewPipelineSingleBatch(batchDiff, provider, options = {}) {
  const { onProgress = () => {} } = options;

  const diffText = formatDiffForPrompt(batchDiff);

  // Pass 1: Candidate Issue Extraction
  onProgress('pass1_start', 'Pass 1: Extracting candidate issues from git diff...');

  const pass1UserPrompt = `Perform code review on the following git diff:\n\n${diffText}`;
  const pass1Result = await provider.review(PASS1_SYSTEM_PROMPT, pass1UserPrompt);
  if (!pass1Result || !Array.isArray(pass1Result.json)) {
    throw new Error('LLM returned malformed JSON: Pass 1 response is not a valid JSON array');
  }
  const draftFindings = pass1Result.json;
  const pass1Usage = pass1Result.usage || { promptTokens: 0, completionTokens: 0 };

  onProgress('pass1_complete', `Pass 1 Complete: Found ${draftFindings.length} candidate issue(s).`, draftFindings);

  if (draftFindings.length === 0) {
    return {
      findings: [],
      usage: pass1Usage
    };
  }

  // Pass 2 Circuit Breaker: Skip Pass 2 for small diffs (< 500 chars) to save tokens
  if (diffText.length < 500) {
    onProgress('circuit_breaker', '⚡ Small diff detected. Skipping Pass 2 revalidation to optimize token usage.');
    return {
      findings: draftFindings,
      usage: pass1Usage
    };
  }

  // Pass 2: Revalidation & False Positive Filtering
  onProgress('pass2_start', 'Pass 2: Revalidating candidate issues against raw diff...');

  const pass2UserPrompt = `Original Git Diff:\n${diffText}\n\nPass 1 Candidate Findings:\n${JSON.stringify(draftFindings, null, 2)}\n\nRe-evaluate all candidate findings and return only verified issues in JSON.`;
  const pass2Result = await provider.review(PASS2_SYSTEM_PROMPT, pass2UserPrompt);
  if (!pass2Result || !Array.isArray(pass2Result.json)) {
    throw new Error('LLM returned malformed JSON: Pass 2 response is not a valid JSON array');
  }
  const verifiedFindings = pass2Result.json;
  const pass2Usage = pass2Result.usage || { promptTokens: 0, completionTokens: 0 };

  onProgress('pass2_complete', `Pass 2 Complete: Retained ${verifiedFindings.length} verified issue(s).`, verifiedFindings);

  return {
    findings: verifiedFindings,
    usage: {
      promptTokens: pass1Usage.promptTokens + pass2Usage.promptTokens,
      completionTokens: pass1Usage.completionTokens + pass2Usage.completionTokens
    }
  };
}

/**
 * Reviews a single batch with automatic adaptive retry on 429/413 rate limits.
 */
async function runReviewPipelineSingleBatchWithRetry(batchDiff, provider, options = {}) {
  const { onProgress = () => {}, maxRetries = 3 } = options;

  let attempts = 0;
  while (attempts <= maxRetries) {
    try {
      return await runReviewPipelineSingleBatch(batchDiff, provider, options);
    } catch (err) {
      const errMsg = err.message || '';
      const isRateLimit = errMsg.includes('429') || errMsg.includes('413') || errMsg.includes('rate_limit') || errMsg.includes('Tokens Per Minute');

      if (isRateLimit && attempts < maxRetries) {
        attempts++;
        const waitSec = extractRetryWaitSeconds(err);
        onProgress(
          'rate_limit_retry',
          `⚠️  Rate limit reached. Pausing for ${waitSec}s before retrying batch (attempt ${attempts}/${maxRetries})...`
        );
        await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Executes the full code review pipeline with Token-Aware File Batching and Adaptive Auto-Retry.
 * @param {Array} parsedDiff - Array of parsed git diff files
 * @param {import('../providers/baseProvider.js').BaseProvider} provider - AI provider instance
 * @param {Object} [options]
 * @param {Function} [options.onProgress] - Callback for stage and batch updates
 * @param {number} [options.cooldown] - Cool-down pause in seconds between batches (defaults to 2s, or config.cooldown)
 * @returns {Promise<{findings: Array, usage: {promptTokens: number, completionTokens: number, totalTokens: number}}>}
 */
export async function runReviewPipeline(parsedDiff, provider, options = {}) {
  const { onProgress = () => {} } = options;

  if (!parsedDiff || parsedDiff.length === 0) {
    return {
      findings: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    };
  }

  const cooldownSec = typeof options.cooldown === 'number'
    ? options.cooldown
    : (typeof options.configCooldown === 'number' ? options.configCooldown : 2);

  const batches = groupDiffsIntoBatches(parsedDiff);
  const totalBatches = batches.length;

  let allFindings = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (let i = 0; i < totalBatches; i++) {
    const currentBatch = batches[i];
    const batchFileNames = currentBatch.map(f => f.fileName).join(', ');

    if (totalBatches > 1) {
      onProgress(
        'batch_start',
        `⏳ Batch [${i + 1}/${totalBatches}]: Reviewing ${currentBatch.length} file(s) (${batchFileNames})...`
      );
    }

    const batchResult = await runReviewPipelineSingleBatchWithRetry(currentBatch, provider, options);

    if (batchResult.findings && batchResult.findings.length > 0) {
      allFindings.push(...batchResult.findings);
    }

    if (batchResult.usage) {
      totalPromptTokens += batchResult.usage.promptTokens || 0;
      totalCompletionTokens += batchResult.usage.completionTokens || 0;
    }

    // Configured cool-down pause between batches (defaults to 2s for fast performance, auto-retries on 429)
    if (totalBatches > 1 && i < totalBatches - 1 && cooldownSec > 0) {
      onProgress(
        'rate_limit_pause',
        `⏳ Batch cool-down: waiting ${cooldownSec}s before batch ${i + 2} of ${totalBatches}...`
      );
      await new Promise(resolve => setTimeout(resolve, cooldownSec * 1000));
    }
  }

  return {
    findings: allFindings,
    usage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens
    }
  };
}

/**
 * Abstract Base Class for AI Code Review Providers.
 */
export class BaseProvider {
  constructor(config = {}) {
    this.config = config;
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '';
    this.baseUrl = config.baseUrl;
  }

  /**
   * Abstract method to call the underlying AI model.
   * Must be overridden by subclasses.
   * @param {string} systemPrompt 
   * @param {string} userPrompt 
   * @returns {Promise<{text: string, usage: {promptTokens: number, completionTokens: number}}>} Raw output text and token usage from model
   */
  async callModel(systemPrompt, userPrompt) {
    throw new Error('callModel method must be implemented by subclass');
  }

  /**
   * Abstract method to fetch available models from provider API.
   * Must be overridden by subclasses.
   * @returns {Promise<string[]>} List of available model names/IDs
   */
  async getAvailableModels() {
    throw new Error('getAvailableModels method must be implemented by subclass');
  }

  /**
   * Helper to format detailed error message including cause if available.
   * @param {Error} err 
   * @returns {string}
   */
  formatErrorMessage(err) {
    if (!err) return 'Unknown error';
    const cause = err.cause ? (err.cause.message || String(err.cause)) : '';
    if (cause && !err.message.includes(cause)) {
      return `${err.message} (${cause})`;
    }
    return err.message;
  }

  /**
   * Cleans markdown formatting and parses response into standard JSON array.
   * Output schema: [{ fileName, lineNumber, severity, category, message }]
   * @param {string} responseText 
   * @returns {Array<{fileName: string, lineNumber: number, severity: string, category: string, message: string}>}
   */
  cleanAndParseJson(responseText) {
    if (!responseText || typeof responseText !== 'string' || !responseText.trim()) {
      throw new Error('LLM returned malformed JSON: Empty response received');
    }

    let cleaned = responseText.trim();

    // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    // Isolate JSON array if wrapped in additional commentary
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');

    if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
      throw new Error('LLM returned malformed JSON: Output does not contain a JSON array');
    }

    cleaned = cleaned.substring(firstBracket, lastBracket + 1);

    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) {
        throw new Error('LLM returned malformed JSON: Response is not a JSON array');
      }

      return parsed.map(item => ({
        fileName: String(item.fileName || 'unknown'),
        lineNumber: typeof item.lineNumber === 'number' ? item.lineNumber : parseInt(item.lineNumber, 10) || 1,
        severity: this.normalizeSeverity(item.severity),
        category: String(item.category || 'General'),
        message: String(item.message || '').trim()
      }));
    } catch (err) {
      if (err.message && err.message.startsWith('LLM returned malformed JSON')) {
        throw err;
      }
      throw new Error(`LLM returned malformed JSON: ${err.message}`);
    }
  }

  /**
   * Normalizes severity string.
   */
  normalizeSeverity(severity) {
    if (!severity) return 'Medium';
    const s = String(severity).toLowerCase();
    if (s.includes('critical') || s.includes('high')) return 'High';
    if (s.includes('low') || s.includes('info')) return 'Low';
    return 'Medium';
  }

  /**
   * Executes the review call against the AI model and parses findings with usage metrics.
   * @param {string} systemPrompt 
   * @param {string} userPrompt 
   * @returns {Promise<{json: Array, usage: {promptTokens: number, completionTokens: number}}>}
   */
  async review(systemPrompt, userPrompt) {
    const res = await this.callModel(systemPrompt, userPrompt);
    const text = typeof res === 'string' ? res : res.text || '';
    const usage = res.usage || { promptTokens: 0, completionTokens: 0 };
    return {
      json: this.cleanAndParseJson(text),
      usage
    };
  }
}

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import parseDiff from 'parse-diff';

const execAsync = promisify(exec);

const DEFAULT_IGNORE_PATTERNS = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'node_modules/',
  'dist/',
  'build/',
  '.min.js',
  '.min.css',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico'
];

/**
 * Checks if a filename should be ignored.
 * @param {string} fileName 
 * @returns {boolean}
 */
export function isIgnoredFile(fileName) {
  if (!fileName || fileName === '/dev/null') return true;
  return DEFAULT_IGNORE_PATTERNS.some(pattern => {
    if (pattern.endsWith('/')) {
      return fileName.includes(pattern);
    }
    return fileName.endsWith(pattern) || fileName.includes(pattern);
  });
}

/**
 * Executes git diff command and returns raw diff string.
 * @param {string} [ref='HEAD'] - Git ref to diff against (e.g. 'HEAD', 'main', '--staged').
 * @param {string} [cwd=process.cwd()] - Current working directory.
 * @returns {Promise<string>}
 */
export async function fetchRawGitDiff(ref = 'HEAD', cwd = process.cwd()) {
  // 1. Try explicit ref diff if provided and not default HEAD
  if (ref && ref !== 'HEAD') {
    try {
      const { stdout } = await execAsync(`git diff -U1 ${ref}`, { cwd, maxBuffer: 10 * 1024 * 1024 });
      if (stdout && stdout.trim()) return stdout;
    } catch (error) {
      // Try git show -U1 ref if git diff ref failed
      try {
        const { stdout: showStdout } = await execAsync(`git show -U1 --format="" ${ref}`, { cwd, maxBuffer: 10 * 1024 * 1024 });
        if (showStdout && showStdout.trim()) return showStdout;
      } catch (e) {
        // Ignore fallback
      }
      throw new Error(`Git ref '${ref}' not found. (The repository may only have 1 commit, or the ref is invalid).`);
    }
  }

  // 2. Try git diff -U1 HEAD (uncommitted changes vs HEAD)
  try {
    const { stdout } = await execAsync('git diff -U1 HEAD', { cwd, maxBuffer: 10 * 1024 * 1024 });
    if (stdout && stdout.trim()) return stdout;
  } catch (err) {
    // HEAD ref may not exist yet in newly initialized repo
  }

  // 3. Fallback to combining unstaged + staged diffs (-U1 context)
  try {
    const { stdout: unstaged } = await execAsync('git diff -U1', { cwd, maxBuffer: 10 * 1024 * 1024 });
    const { stdout: staged } = await execAsync('git diff -U1 --cached', { cwd, maxBuffer: 10 * 1024 * 1024 });
    const combined = [unstaged, staged].filter(Boolean).join('\n');
    if (combined && combined.trim()) return combined;
  } catch (err) {
    // Ignore fallback
  }

  // 4. Fallback for single-commit repository or reviewing latest commit when working tree is clean
  try {
    const { stdout: showHead } = await execAsync('git show -U1 --format="" HEAD', { cwd, maxBuffer: 10 * 1024 * 1024 });
    if (showHead && showHead.trim()) return showHead;
  } catch (err) {
    // Ignore fallback
  }

  return '';
}

/**
 * Parses raw git diff string using parse-diff and filters ignored files.
 * @param {string} rawDiff 
 * @returns {Array<{fileName: string, fromPath: string, toPath: string, additions: number, deletions: number, chunks: Array}>}
 */
export function parseRawDiff(rawDiff) {
  if (!rawDiff || !rawDiff.trim()) {
    return [];
  }

  const files = parseDiff(rawDiff);
  const parsedFiles = [];

  for (const file of files) {
    const fileName = file.to && file.to !== '/dev/null' ? file.to : file.from;

    if (!fileName || isIgnoredFile(fileName)) {
      continue;
    }

    parsedFiles.push({
      fileName,
      fromPath: file.from,
      toPath: file.to,
      additions: file.additions,
      deletions: file.deletions,
      chunks: file.chunks
    });
  }

  return parsedFiles;
}

/**
 * Fetches and parses the git diff in one step.
 * @param {string} [ref='HEAD'] 
 * @param {string} [cwd=process.cwd()] 
 */
export async function getGitDiff(ref = 'HEAD', cwd = process.cwd()) {
  const rawDiff = await fetchRawGitDiff(ref, cwd);
  return parseRawDiff(rawDiff);
}

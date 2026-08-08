import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const STATS_FILE_NAME = '.ai-reviewer-stats.json';

/**
 * Returns the absolute path to the stats file in user's home directory.
 */
export function getStatsFilePath() {
  return path.join(os.homedir(), STATS_FILE_NAME);
}

/**
 * Loads stats object from ~/.ai-reviewer-stats.json.
 * @returns {Promise<{runs: Array<{timestamp: string, provider: string, model: string, promptTokens: number, completionTokens: number, totalTokens: number}>}>}
 */
export async function loadStats() {
  const filePath = getStatsFilePath();
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data);
    if (!parsed || !Array.isArray(parsed.runs)) {
      return { runs: [] };
    }
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { runs: [] };
    }
    return { runs: [] };
  }
}

/**
 * Saves stats object to ~/.ai-reviewer-stats.json.
 * @param {Object} statsData 
 */
export async function saveStats(statsData) {
  const filePath = getStatsFilePath();
  const jsonString = JSON.stringify(statsData, null, 2);
  await fs.writeFile(filePath, jsonString, 'utf-8');
}

/**
 * Logs a single review run to stats storage.
 * @param {string} provider 
 * @param {string} model 
 * @param {number} promptTokens 
 * @param {number} completionTokens 
 */
export async function logRun(provider, model, promptTokens = 0, completionTokens = 0) {
  const stats = await loadStats();
  const pTokens = Number(promptTokens) || 0;
  const cTokens = Number(completionTokens) || 0;

  const newRun = {
    timestamp: new Date().toISOString(),
    provider: String(provider || 'unknown'),
    model: String(model || 'unknown'),
    promptTokens: pTokens,
    completionTokens: cTokens,
    totalTokens: pTokens + cTokens
  };

  stats.runs.push(newRun);
  await saveStats(stats);
  return newRun;
}

/**
 * Aggregates token stats for Today, This Week, and All Time.
 */
export async function getStats() {
  const { runs } = await loadStats();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Start of current week (Sunday)
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - todayStart.getDay());

  const totals = {
    today: { promptTokens: 0, completionTokens: 0, totalTokens: 0, runCount: 0 },
    thisWeek: { promptTokens: 0, completionTokens: 0, totalTokens: 0, runCount: 0 },
    allTime: { promptTokens: 0, completionTokens: 0, totalTokens: 0, runCount: 0 }
  };

  for (const run of runs) {
    const runDate = new Date(run.timestamp);

    const p = Number(run.promptTokens) || 0;
    const c = Number(run.completionTokens) || 0;
    const t = Number(run.totalTokens) || (p + c);

    // All Time
    totals.allTime.promptTokens += p;
    totals.allTime.completionTokens += c;
    totals.allTime.totalTokens += t;
    totals.allTime.runCount += 1;

    // This Week
    if (runDate >= weekStart) {
      totals.thisWeek.promptTokens += p;
      totals.thisWeek.completionTokens += c;
      totals.thisWeek.totalTokens += t;
      totals.thisWeek.runCount += 1;
    }

    // Today
    if (runDate >= todayStart) {
      totals.today.promptTokens += p;
      totals.today.completionTokens += c;
      totals.today.totalTokens += t;
      totals.today.runCount += 1;
    }
  }

  return totals;
}

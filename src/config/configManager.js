import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const CONFIG_FILE_NAME = '.ai-reviewer-config.json';

/**
 * Returns the absolute path to the global config file in user's home directory.
 */
export function getConfigPath() {
  return path.join(os.homedir(), CONFIG_FILE_NAME);
}

/**
 * @typedef {Object} Config
 * @property {string} provider - Provider name (gemini, openai, ollama)
 * @property {string} [model] - Specific model name (e.g. gemini-1.5-flash, gpt-4o, llama3)
 * @property {string} [apiKey] - API key for provider
 * @property {string} [baseUrl] - Base URL (for Ollama or custom OpenAI endpoint)
 * @property {number} [cooldown] - Cool-down pause between batches in seconds (default 2s)
 */

/**
 * Loads configuration from ~/.ai-reviewer-config.json.
 * @returns {Promise<Config|null>} The config object or null if not found/invalid.
 */
export async function loadConfig() {
  const configPath = getConfigPath();
  try {
    const data = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw new Error(`Failed to read config file at ${configPath}: ${error.message}`);
  }
}

/**
 * Saves configuration object to ~/.ai-reviewer-config.json.
 * @param {Object} config 
 */
export async function saveConfig(config) {
  const configPath = getConfigPath();
  const data = JSON.stringify(config, null, 2);
  await fs.writeFile(configPath, data, 'utf-8');
}

/**
 * Updates existing configuration by merging partial updates.
 * @param {Object} updates 
 * @returns {Promise<Object>} The updated config object.
 */
export async function updateConfig(updates) {
  const existing = (await loadConfig()) || {};
  const newConfig = { ...existing, ...updates };
  await saveConfig(newConfig);
  return newConfig;
}

/**
 * Checks if configuration file exists.
 * @returns {Promise<boolean>}
 */
export async function hasConfig() {
  const config = await loadConfig();
  return config !== null;
}


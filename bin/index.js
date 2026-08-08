#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import readline from 'node:readline/promises';
import Table from 'cli-table3';
import { stdin as input, stdout as output } from 'node:process';
import { saveConfig, loadConfig, updateConfig, getConfigPath } from '../src/config/configManager.js';
import { getGitDiff } from '../src/git/diffParser.js';
import { createProvider } from '../src/providers/providerFactory.js';
import { runReviewPipeline } from '../src/ai/reviewEngine.js';
import { createSpinner, renderResults } from '../src/ui/renderer.js';
import { logRun, getStats, getStatsFilePath } from '../src/analytics/statsTracker.js';

const program = new Command();

/**
 * Mask API key for secure display
 * @param {string} key 
 * @returns {string}
 */
function maskKey(key) {
  if (!key) return chalk.gray('(none)');
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

program
  .name('ai-reviewer')
  .description('AI-powered Code Review CLI with automated 2-Pass revalidation')
  .version('1.0.0');

// Default review command (or explicitly 'review')
program
  .command('run', { isDefault: true })
  .description('Run AI code review on current git diff')
  .option('-r, --ref <gitRef>', 'Git commit ref or target branch to diff against', 'HEAD')
  .option('-c, --cooldown <seconds>', 'Batch cool-down pause in seconds (e.g. 0 for paid, 60 for free)', parseInt)
  .action(async (options) => {
    try {
      const config = await loadConfig();
      if (!config || !config.provider) {
        console.log(chalk.yellow('\n⚠️  No configuration found.'));
        console.log(chalk.white('Please run ') + chalk.bold.cyan('review init') + chalk.white(' to set up your AI provider and API key.\n'));
        process.exit(1);
      }

      console.log(chalk.bold.cyan('\n🔍 Starting AI Code Review...'));

      const spinner = createSpinner('Fetching git diff changes...');
      spinner.start();

      let parsedDiff;
      try {
        parsedDiff = await getGitDiff(options.ref);
      } catch (err) {
        spinner.fail(chalk.red(`Git Error: ${err.message}`));
        process.exit(1);
      }

      if (!parsedDiff || parsedDiff.length === 0) {
        spinner.info(chalk.yellow('No modified files or diff changes found to review.'));
        console.log(chalk.gray('\nHow to review your code:'));
        console.log(chalk.gray('  • Uncommitted changes: Stage/edit files and run ') + chalk.bold.cyan('review'));
        console.log(chalk.gray('  • Review your last commit: Run ') + chalk.bold.cyan('review --ref HEAD~1'));
        console.log(chalk.gray('  • Review your last N commits: Run ') + chalk.bold.cyan('review --ref HEAD~3'));
        console.log(chalk.gray('  • Review a feature branch against main: Run ') + chalk.bold.cyan('review --ref main') + chalk.gray(' (from feature branch)\n'));
        return;
      }

      spinner.succeed(chalk.green(`Extracted git diff for ${parsedDiff.length} file(s).`));

      let provider;
      try {
        provider = createProvider(config);
      } catch (err) {
        console.error(chalk.red(`\n❌ Provider Error: ${err.message}\n`));
        process.exit(1);
      }

      const reviewSpinner = createSpinner('Pass 1: Extracting draft findings from git diff...');
      reviewSpinner.start();

      const { findings, usage } = await runReviewPipeline(parsedDiff, provider, {
        cooldown: options.cooldown,
        configCooldown: config.cooldown,
        onProgress: (stage, message) => {
          if (stage === 'pass2_start') {
            reviewSpinner.text = chalk.cyan('Pass 2: Revalidating findings to eliminate false positives...');
          } else if (stage === 'circuit_breaker') {
            reviewSpinner.info(chalk.yellow(message));
          } else if (stage === 'batch_start' || stage === 'rate_limit_pause') {
            reviewSpinner.text = chalk.cyan(message);
          } else if (stage === 'rate_limit_retry') {
            reviewSpinner.text = chalk.yellow(message);
          }
        }
      });

      reviewSpinner.succeed(chalk.green('2-Pass AI Code Review completed successfully!'));

      const modelDisplayName = provider.modelName || config.model || '';
      renderResults(findings, {
        provider: modelDisplayName ? `${config.provider} (${modelDisplayName})` : config.provider,
        fileCount: parsedDiff.length
      });

      if (usage) {
        await logRun(config.provider, modelDisplayName || config.provider, usage.promptTokens, usage.completionTokens);
        console.log(chalk.gray(`📊 Run Token Usage: ${chalk.white(usage.promptTokens)} prompt + ${chalk.white(usage.completionTokens)} completion = ${chalk.bold.cyan(usage.totalTokens)} total tokens\n`));
      }

    } catch (err) {
      console.error(chalk.red(`\n❌ Review failed: ${err.message}\n`));
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Interactively initialize or overwrite configuration (AI provider, model, and API key)')
  .action(async () => {
    const rl = readline.createInterface({ input, output });
    try {
      console.log(chalk.bold.cyan('\n⚙️  AI Code Reviewer Configuration Setup\n'));

      const existing = await loadConfig();
      if (existing) {
        console.log(chalk.yellow(`Existing config found at ${getConfigPath()}`));
        console.log(chalk.gray(`Current provider: ${existing.provider} | Model: ${existing.model || '(default)'} | Key: ${maskKey(existing.apiKey)}\n`));
      }

      console.log(chalk.white('Select your AI Provider:'));
      console.log('  1) Gemini (Google)');
      console.log('  2) OpenAI');
      console.log('  3) Ollama (Local)\n');

      let providerChoice = await rl.question(chalk.bold('Choice (1-3) [1]: '));
      providerChoice = providerChoice.trim() || '1';

      let provider = 'gemini';

      if (providerChoice === '2' || providerChoice.toLowerCase() === 'openai') {
        provider = 'openai';
      } else if (providerChoice === '3' || providerChoice.toLowerCase() === 'ollama') {
        provider = 'ollama';
      }

      let apiKey = '';
      let baseUrl = undefined;

      if (provider === 'gemini') {
        apiKey = await rl.question(chalk.bold('\nEnter your Gemini API Key: '));
        apiKey = apiKey.trim();
        if (!apiKey) {
          console.log(chalk.red('\n❌ Gemini API Key is required. Setup aborted.'));
          rl.close();
          process.exit(1);
        }
      } else if (provider === 'openai') {
        apiKey = await rl.question(chalk.bold('\nEnter your OpenAI API Key: '));
        apiKey = apiKey.trim();
        if (!apiKey) {
          console.log(chalk.red('\n❌ OpenAI API Key is required. Setup aborted.'));
          rl.close();
          process.exit(1);
        }

        const existingUrl = existing?.baseUrl || '';
        const urlPrompt = existingUrl ? `\nEnter Base URL (optional, e.g. https://api.groq.com/openai/v1) [${existingUrl}]: ` : '\nEnter Base URL (optional, e.g. https://api.groq.com/openai/v1, press Enter to skip): ';
        const urlInput = await rl.question(chalk.bold(urlPrompt));
        baseUrl = urlInput.trim() || existingUrl || undefined;
      } else if (provider === 'ollama') {
        const defaultUrl = existing?.baseUrl || 'http://localhost:11434';
        const urlInput = await rl.question(chalk.bold(`\nEnter Ollama Base URL [${defaultUrl}]: `));
        baseUrl = urlInput.trim() || defaultUrl;
      }

      console.log(chalk.cyan(`\n🔍 Fetching available models from ${provider}...`));

      let availableModels = [];
      try {
        const tempProvider = createProvider({ provider, apiKey, baseUrl });
        availableModels = await tempProvider.getAvailableModels();
        console.log(chalk.green(`✔ Fetched ${availableModels.length} model(s) from ${provider}.`));
      } catch (err) {
        console.log(chalk.yellow(`⚠️  Could not fetch models automatically: ${err.message}`));
      }

      let selectedModel = '';

      if (availableModels && availableModels.length > 0) {
        console.log(chalk.white(`\nAvailable Models for ${chalk.bold(provider)}:`));
        const displayList = availableModels.slice(0, 30);
        displayList.forEach((m, idx) => {
          console.log(`  ${idx + 1}) ${m}`);
        });
        if (availableModels.length > 30) {
          console.log(chalk.gray(`  ... and ${availableModels.length - 30} more`));
        }

        const choice = await rl.question(chalk.bold(`\nSelect model number (1-${displayList.length}) [1]: `));
        const trimmedChoice = choice.trim();

        const num = parseInt(trimmedChoice, 10);
        if (!isNaN(num) && num >= 1 && num <= displayList.length) {
          selectedModel = displayList[num - 1];
        } else if (trimmedChoice !== '') {
          selectedModel = trimmedChoice;
        } else {
          selectedModel = displayList[0];
        }
      } else {
        const fallbackModel = provider === 'openai' ? 'gpt-4o' : provider === 'ollama' ? 'llama3' : 'gemini-2.0-flash';
        const customModel = await rl.question(chalk.bold(`\nEnter model name manually [${fallbackModel}]: `));
        selectedModel = customModel.trim() || fallbackModel;
      }

      console.log(chalk.green(`\nSelected Model: ${chalk.bold(selectedModel)}`));

      const defaultCooldown = existing?.cooldown !== undefined ? existing.cooldown : 2;
      const cooldownInput = await rl.question(chalk.bold(`\nEnter Batch Cool-down in seconds (0 for paid, 2-60 for free) [${defaultCooldown}]: `));
      const parsedCooldown = parseInt(cooldownInput.trim(), 10);
      const cooldown = !isNaN(parsedCooldown) && parsedCooldown >= 0 ? parsedCooldown : defaultCooldown;

      const config = {
        provider,
        model: selectedModel,
        cooldown,
        ...(apiKey && { apiKey }),
        ...(baseUrl && { baseUrl })
      };

      await saveConfig(config);
      console.log(chalk.bold.green(`\n✅ Configuration saved successfully to ${getConfigPath()}\n`));
    } catch (err) {
      console.error(chalk.red(`\n❌ Error during setup: ${err.message}`));
      process.exit(1);
    } finally {
      rl.close();
    }
  });

program
  .command('config')
  .description('View or directly update AI reviewer configuration')
  .option('-p, --provider <provider>', 'Set provider (gemini, openai, ollama)')
  .option('-m, --model <modelName>', 'Set AI model version (e.g. gemini-1.5-flash, gpt-4o, llama3)')
  .option('-k, --key <key>', 'Set API key')
  .option('-u, --url <url>', 'Set base URL (for Ollama)')
  .option('-c, --cooldown <seconds>', 'Set batch cool-down pause in seconds', parseInt)
  .action(async (options) => {
    try {
      const hasFlags = options.provider !== undefined || options.model !== undefined || options.key !== undefined || options.url !== undefined || options.cooldown !== undefined;

      if (hasFlags) {
        const updates = {};
        if (options.provider) {
          const validProviders = ['gemini', 'openai', 'ollama'];
          const normProvider = options.provider.toLowerCase();
          if (!validProviders.includes(normProvider)) {
            console.log(chalk.red(`❌ Invalid provider "${options.provider}". Must be one of: ${validProviders.join(', ')}`));
            process.exit(1);
          }
          updates.provider = normProvider;
        }

        if (options.model !== undefined) {
          updates.model = options.model;
        }

        if (options.key !== undefined) {
          updates.apiKey = options.key;
        }

        if (options.url !== undefined) {
          updates.baseUrl = options.url;
        }

        if (options.cooldown !== undefined) {
          updates.cooldown = options.cooldown;
        }

        const updated = await updateConfig(updates);
        console.log(chalk.bold.green('\n✅ Configuration updated successfully!'));
        console.log(chalk.cyan(`Config file: ${getConfigPath()}`));
        console.log(`Provider : ${chalk.bold(updated.provider)}`);
        console.log(`Model    : ${chalk.bold(updated.model || '(default)')}`);
        console.log(`Cool-down: ${chalk.bold(updated.cooldown ?? 2)}s`);
        console.log(`API Key  : ${maskKey(updated.apiKey)}`);
        if (updated.baseUrl) {
          console.log(`Base URL : ${updated.baseUrl}`);
        }
        console.log();
      } else {
        const current = await loadConfig();
        if (!current) {
          console.log(chalk.yellow(`\n⚠️  No configuration found at ${getConfigPath()}`));
          console.log(chalk.white('Run ') + chalk.bold.cyan('review init') + chalk.white(' or pass flags like ') + chalk.bold.cyan('review config -p gemini -m gemini-1.5-flash -k YOUR_KEY\n'));
          return;
        }

        console.log(chalk.bold.cyan('\n⚙️  Current AI Code Reviewer Configuration\n'));
        console.log(`Config file : ${getConfigPath()}`);
        console.log(`Provider    : ${chalk.bold(current.provider)}`);
        console.log(`Model       : ${chalk.bold(current.model || '(default)')}`);
        console.log(`API Key     : ${maskKey(current.apiKey)}`);
        if (current.baseUrl) {
          console.log(`Base URL    : ${current.baseUrl}`);
        }
        console.log();
      }
    } catch (err) {
      console.error(chalk.red(`\n❌ Config error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('View local token usage analytics dashboard')
  .action(async () => {
    try {
      const totals = await getStats();

      console.log('\n' + chalk.bold.cyan('======================================================'));
      console.log(chalk.bold.white('          📊  AI REVIEWER TOKEN USAGE DASHBOARD       '));
      console.log(chalk.bold.cyan('======================================================\n'));

      const table = new Table({
        head: [
          chalk.bold.white('Time Period'),
          chalk.bold.white('Runs'),
          chalk.bold.white('Prompt Tokens'),
          chalk.bold.white('Completion Tokens'),
          chalk.bold.white('Total Tokens')
        ],
        colWidths: [16, 10, 18, 20, 16],
        style: {
          head: [],
          border: ['gray']
        }
      });

      table.push(
        [chalk.cyan('Today'), totals.today.runCount, totals.today.promptTokens.toLocaleString(), totals.today.completionTokens.toLocaleString(), chalk.bold.yellow(totals.today.totalTokens.toLocaleString())],
        [chalk.cyan('This Week'), totals.thisWeek.runCount, totals.thisWeek.promptTokens.toLocaleString(), totals.thisWeek.completionTokens.toLocaleString(), chalk.bold.yellow(totals.thisWeek.totalTokens.toLocaleString())],
        [chalk.cyan('All Time'), totals.allTime.runCount, totals.allTime.promptTokens.toLocaleString(), totals.allTime.completionTokens.toLocaleString(), chalk.bold.green(totals.allTime.totalTokens.toLocaleString())]
      );

      console.log(table.toString());
      console.log(chalk.gray(`\nStats file: ${getStatsFilePath()}\n`));

    } catch (err) {
      console.error(chalk.red(`\n❌ Failed to display usage stats: ${err.message}\n`));
      process.exit(1);
    }
  });

program.parse(process.argv);

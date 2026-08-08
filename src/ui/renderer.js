import Table from 'cli-table3';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Creates an ora spinner instance with blue/cyan styling.
 * @param {string} text 
 * @returns {import('ora').Ora}
 */
export function createSpinner(text) {
  return ora({
    text: chalk.cyan(text),
    spinner: 'dots'
  });
}

/**
 * Formats severity label into a color-coded terminal badge.
 * @param {string} severity 
 * @returns {string}
 */
export function formatSeverity(severity = 'Medium') {
  const sev = String(severity).toUpperCase();
  switch (sev) {
    case 'HIGH':
    case 'CRITICAL':
      return chalk.bgRed.white.bold(` ${sev} `);
    case 'MEDIUM':
      return chalk.bgYellow.black.bold(` ${sev} `);
    case 'LOW':
    default:
      return chalk.bgCyan.black.bold(` ${sev} `);
  }
}

/**
 * Renders verified review findings into a formatted CLI table with statistics.
 * @param {Array} findings 
 * @param {Object} [meta] 
 */
export function renderResults(findings = [], meta = {}) {
  const { provider = '', fileCount = 0 } = meta;

  console.log('\n' + chalk.bold.cyan('======================================================'));
  console.log(chalk.bold.white('            🤖  AI CODE REVIEW REPORT                '));
  console.log(chalk.bold.cyan('======================================================'));

  if (provider) {
    console.log(chalk.gray(`  Provider : ${chalk.bold.white(provider.toUpperCase())}`));
    console.log(chalk.gray(`  Files    : ${chalk.bold.white(fileCount)} file(s) analyzed\n`));
  }

  if (!findings || findings.length === 0) {
    console.log(chalk.bold.green('✨ No code defects or security vulnerabilities found! Your changes look clean! 🎉\n'));
    return;
  }

  const table = new Table({
    head: [
      chalk.bold.white('File'),
      chalk.bold.white('Line'),
      chalk.bold.white('Severity'),
      chalk.bold.white('Category'),
      chalk.bold.white('Finding & Recommendation')
    ],
    colWidths: [22, 8, 12, 16, 45],
    wordWrap: true,
    style: {
      head: [],
      border: ['gray']
    }
  });

  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  for (const item of findings) {
    const sev = String(item.severity || 'Medium').toUpperCase();
    if (sev === 'HIGH' || sev === 'CRITICAL') highCount++;
    else if (sev === 'MEDIUM') mediumCount++;
    else lowCount++;

    table.push([
      chalk.cyan(item.fileName),
      chalk.yellow(`L${item.lineNumber}`),
      formatSeverity(item.severity),
      chalk.magenta(item.category || 'General'),
      item.message
    ]);
  }

  console.log(table.toString());

  // Render Summary Statistics
  console.log('\n' + chalk.bold('Summary Findings:'));
  if (highCount > 0) {
    console.log(`  ${chalk.red('●')} High / Critical : ${chalk.bold.red(highCount)}`);
  }
  if (mediumCount > 0) {
    console.log(`  ${chalk.yellow('●')} Medium          : ${chalk.bold.yellow(mediumCount)}`);
  }
  if (lowCount > 0) {
    console.log(`  ${chalk.cyan('●')} Low             : ${chalk.bold.cyan(lowCount)}`);
  }
  console.log(`  ${chalk.bold('Total Issues')}     : ${chalk.bold.white(findings.length)}\n`);
}

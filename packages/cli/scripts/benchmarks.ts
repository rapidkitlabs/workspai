#!/usr/bin/env node
/**
 * Performance benchmarks for Workspai CLI
 * Measures startup time for common commands
 */

import { performance } from 'perf_hooks';
import { execSync } from 'child_process';
import chalk from 'chalk';

interface BenchmarkResult {
  command: string;
  time: number;
  success: boolean;
}

const commands = [
  'node dist/index.js --version',
  'node dist/index.js --help',
  'node dist/index.js list --help',
  'node dist/index.js workspace list --help',
];

console.log(chalk.bold.blue('\n🚀 Workspai CLI Performance Benchmarks\n'));
console.log(chalk.gray('Measuring startup time for common commands...\n'));

const results: BenchmarkResult[] = [];

for (const command of commands) {
  try {
    const start = performance.now();
    execSync(command, { stdio: 'pipe' });
    const end = performance.now();
    const time = end - start;

    results.push({ command, time, success: true });

    const displayCmd = command.replace('node dist/index.js', 'workspai');
    const timeStr = time.toFixed(2);
    const color = time < 100 ? chalk.green : time < 200 ? chalk.yellow : chalk.red;

    console.log(`${color('●')} ${chalk.cyan(displayCmd.padEnd(40))} ${color(timeStr + 'ms')}`);
  } catch (error) {
    results.push({ command, time: 0, success: false });
    console.log(`${chalk.red('✗')} ${command} ${chalk.red('FAILED')}`);
  }
}

// Summary
const successfulResults = results.filter((r) => r.success);
if (successfulResults.length > 0) {
  const avgTime = successfulResults.reduce((sum, r) => sum + r.time, 0) / successfulResults.length;
  const minTime = Math.min(...successfulResults.map((r) => r.time));
  const maxTime = Math.max(...successfulResults.map((r) => r.time));

  console.log(chalk.bold.blue('\n📊 Summary:\n'));
  console.log(`  ${chalk.gray('Average:')} ${chalk.yellow(avgTime.toFixed(2) + 'ms')}`);
  console.log(`  ${chalk.gray('Fastest:')} ${chalk.green(minTime.toFixed(2) + 'ms')}`);
  console.log(`  ${chalk.gray('Slowest:')} ${chalk.red(maxTime.toFixed(2) + 'ms')}`);

  // Performance rating
  if (avgTime < 100) {
    console.log(chalk.bold.green('\n✨ Excellent performance!'));
  } else if (avgTime < 200) {
    console.log(chalk.bold.yellow('\n⚠️  Good, but could be faster'));
  } else {
    console.log(chalk.bold.red('\n🐌 Needs optimization'));
  }
}

console.log('');

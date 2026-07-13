import { Command } from 'commander';
import chalk from 'chalk';
import { prompt } from '../cli-ui/prompts.js';
import { setUserConfig, getUserConfig, getConfigPath } from '../config/user-config.js';

export function registerConfigCommands(program: Command): void {
  const config = program.command('config').description('Configure Workspai settings');

  // Set OpenAI API key
  config
    .command('set-api-key')
    .description('Set OpenAI API key for AI features')
    .option('--key <key>', 'API key (or enter interactively)')
    .action(async (options) => {
      let apiKey = options.key;

      // If not provided via option, prompt for it
      if (!apiKey) {
        const answers = await prompt([
          {
            type: 'password',
            name: 'apiKey',
            message: 'Enter your OpenAI API key:',
            validate: (input: string) => {
              if (!input) {
                return 'API key is required';
              }
              if (!input.startsWith('sk-')) {
                return 'Invalid API key format (should start with sk-)';
              }
              if (input.length < 20) {
                return 'API key seems too short';
              }
              return true;
            },
          },
        ]);
        apiKey = answers.apiKey;
      } else {
        // Validate if provided via option
        if (!apiKey.startsWith('sk-')) {
          console.log(chalk.red('\n❌ Invalid API key format (should start with sk-)\n'));
          process.exit(1);
        }
      }

      // Save to config
      setUserConfig({ openaiApiKey: apiKey });

      console.log(chalk.green('\n✅ OpenAI API key saved successfully!\n'));
      console.log(chalk.gray(`Stored in: ${getConfigPath()}`));
      console.log(chalk.cyan('\n🎉 You can now use AI features:'));
      console.log(chalk.white('   workspai ai recommend "I need user authentication"'));
      console.log(chalk.gray('\n💡 To generate module embeddings (one-time):'));
      console.log(chalk.white('   cd packages/cli'));
      console.log(chalk.white('   npx tsx src/ai/generate-embeddings.ts\n'));
    });

  // Show current configuration
  config
    .command('show')
    .description('Show current configuration')
    .action(() => {
      const userConfig = getUserConfig();

      console.log(chalk.bold('\n⚙️  Workspai Configuration\n'));

      if (userConfig.openaiApiKey) {
        const masked =
          userConfig.openaiApiKey.substring(0, 8) + '...' + userConfig.openaiApiKey.slice(-4);
        console.log(chalk.cyan('OpenAI API Key:'), chalk.white(masked));
      } else {
        console.log(chalk.cyan('OpenAI API Key:'), chalk.red('Not set'));
        console.log(chalk.gray('   Set with: workspai config set-api-key'));
      }

      console.log(
        chalk.cyan('AI Features:'),
        userConfig.aiEnabled !== false ? chalk.green('Enabled') : chalk.red('Disabled')
      );

      console.log(chalk.gray(`\n📁 Config file: ${getConfigPath()}\n`));
    });

  // Remove API key
  config
    .command('remove-api-key')
    .description('Remove stored OpenAI API key')
    .option('--yes', 'Remove without an interactive confirmation prompt')
    .action(async (options: { yes?: boolean }) => {
      const userConfig = getUserConfig();

      if (!userConfig.openaiApiKey) {
        console.log(chalk.yellow('\n⚠️  No API key is currently stored\n'));
        return;
      }

      const confirmedWithoutPrompt = options.yes === true || process.argv.includes('--yes');
      if (!confirmedWithoutPrompt && (!process.stdin.isTTY || !process.stdout.isTTY)) {
        console.error(
          chalk.red('Cannot confirm API key removal in a non-interactive session. Use --yes.')
        );
        process.exit(1);
      }

      const answers = confirmedWithoutPrompt
        ? { confirm: true }
        : await prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Are you sure you want to remove your OpenAI API key?',
              default: false,
            },
          ]);

      if (answers.confirm) {
        setUserConfig({ openaiApiKey: undefined });
        console.log(chalk.green('\n✅ API key removed successfully\n'));
      } else {
        console.log(chalk.gray('\nCancelled\n'));
      }
    });

  // Enable/disable AI features
  config
    .command('ai <action>')
    .description('Enable or disable AI features (enable|disable)')
    .action((action: string) => {
      if (action !== 'enable' && action !== 'disable') {
        console.log(chalk.red(`\n❌ Invalid action: ${action}`));
        console.log(chalk.gray('Use: workspai config ai enable|disable\n'));
        process.exit(1);
      }

      const enabled = action === 'enable';
      setUserConfig({ aiEnabled: enabled });

      console.log(chalk.green(`\n✅ AI features ${enabled ? 'enabled' : 'disabled'}\n`));
    });
}

import { Command, Option } from 'commander';

export const addCommonOptions = (command: Command): Command =>
  command
    .addOption(new Option('--config <path>', 'Path to config file'))
    .addOption(new Option('--url <url>', 'Target URL'))
    .addOption(new Option('--app-name <name>', 'Application name'))
    .addOption(new Option('--env-name <name>', 'Environment name'))
    .addOption(new Option('--spec-id <id>', 'Spec id'))
    .addOption(new Option('--run-id <id>', 'Run id'))
    .addOption(new Option('--session-id <id>', 'Session id'))
    .addOption(new Option('--git-sha <sha>', 'Git SHA'))
    .addOption(new Option('--user-intent <intent>', 'User intent'))
    .addOption(new Option('--trace-endpoint <url>', 'OTLP trace endpoint'))
    .addOption(new Option('--trace-output <mode>', 'Trace output mode').choices(['otlp', 'jsonl', 'both']))
    .addOption(new Option('--trace-output-path <path>', 'Local JSONL trace output path'))
    .addOption(new Option('--artifacts-dir <path>', 'Artifacts output directory'))
    .addOption(new Option('--json', 'Render JSON output'));


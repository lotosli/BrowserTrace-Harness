import { Command } from 'commander';
import { addCommonOptions } from '../shared.js';
import { runCommand } from '../command-runner.js';
import { runE2eSpec } from '../../e2e/run-orchestrator.js';
import { HarnessError } from '../../types/errors.js';

export const buildRunCommand = (): Command =>
  addCommonOptions(
    new Command('run')
      .description('Run an agent-native E2E spec')
      .argument('<spec>', 'Path to a YAML or JSON run spec')
  ).action(async (spec: string, options) => {
    if (!spec) {
      throw new HarnessError('spec_invalid', 'A run spec path is required.');
    }

    await runCommand('run', options, 'run_failed', async (runContext) => runE2eSpec(runContext, spec));
  });

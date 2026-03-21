import { Command, Option } from 'commander';
import { addCommonOptions } from '../shared.js';
import { runCommand } from '../command-runner.js';
import { runE2eSpec } from '../../e2e/run-orchestrator.js';
import { HarnessError } from '../../types/errors.js';

export const buildStepCommands = (): Command => {
  const step = new Command('step').description('Agent-friendly step commands');

  addCommonOptions(
    step
      .command('execute')
      .description('Execute a target step, optionally replaying the prefix to build state')
      .argument('<spec>', 'Path to a YAML or JSON run spec')
      .requiredOption('--step-id <id>', 'Target step id from the spec')
      .addOption(new Option('--mode <mode>', 'Execution mode').choices(['prefix', 'only']).default('prefix'))
  ).action(async (spec: string, options) => {
    if (!options.stepId) {
      throw new HarnessError('spec_invalid', '--step-id is required for step execute');
    }

    await runCommand('step.execute', options, 'run_failed', async (runContext) =>
      runE2eSpec(runContext, spec, {
        stepId: String(options.stepId),
        stepMode: (options.mode as 'prefix' | 'only') ?? 'prefix'
      })
    );
  });

  return step;
};

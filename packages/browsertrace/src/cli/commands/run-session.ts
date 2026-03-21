import { Command } from 'commander';
import { addCommonOptions } from '../shared.js';
import { runCommand } from '../command-runner.js';
import {
  startPersistentRunSession,
  getPersistentRunSessionStatus,
  resumePersistentRunSessionStep,
  judgePersistentRunSessionById,
  stopPersistentRunSession
} from '../../e2e/persistent-run-session.js';
import { HarnessError } from '../../types/errors.js';

export const buildRunSessionCommands = (): Command => {
  const runSession = new Command('run-session').description('Persistent run sessions for step-by-step agent control');

  addCommonOptions(
    runSession
      .command('start')
      .description('Start a persistent run session and keep browser/services alive across commands')
      .argument('<spec>', 'Path to a YAML or JSON run spec')
  ).action(async (spec: string, options) => {
    if (!spec) {
      throw new HarnessError('spec_invalid', 'A run spec path is required.');
    }
    await runCommand('run-session.start', options, 'run_failed', async (runContext) =>
      startPersistentRunSession(runContext, spec, options.sessionId ? String(options.sessionId) : undefined)
    );
  });

  addCommonOptions(
    runSession
      .command('resume')
      .description('Resume a persistent run session by executing the next or specified step')
      .argument('<session>', 'Persistent run session id')
      .option('--step-id <id>', 'Explicit step id to execute')
      .option('--through-step <id>', 'Execute the contiguous pending range through the target step')
  ).action(async (sessionId: string, options) => {
    if (!sessionId) {
      throw new HarnessError('run_session_not_found', 'A run session id is required.');
    }
    if (options.stepId && options.throughStep) {
      throw new HarnessError('run_failed', '--step-id and --through-step are mutually exclusive');
    }
    await runCommand('run-session.resume', options, 'run_failed', async (runContext) =>
      resumePersistentRunSessionStep(
        runContext,
        sessionId,
        options.stepId ? String(options.stepId) : undefined,
        options.throughStep ? String(options.throughStep) : undefined
      )
    );
  });

  addCommonOptions(
    runSession
      .command('judge')
      .description('Compute a session-level scenario verdict from persistent session history')
      .argument('<session>', 'Persistent run session id')
  ).action(async (sessionId: string, options) => {
    if (!sessionId) {
      throw new HarnessError('run_session_not_found', 'A run session id is required.');
    }
    await runCommand('run-session.judge', options, 'run_failed', async (runContext) =>
      judgePersistentRunSessionById(runContext, sessionId)
    );
  });

  addCommonOptions(
    runSession
      .command('status')
      .description('Inspect the current state of a persistent run session')
      .argument('<session>', 'Persistent run session id')
  ).action(async (sessionId: string, options) => {
    if (!sessionId) {
      throw new HarnessError('run_session_not_found', 'A run session id is required.');
    }
    await runCommand('run-session.status', options, 'run_failed', async (runContext) =>
      getPersistentRunSessionStatus(runContext, sessionId)
    );
  });

  addCommonOptions(
    runSession
      .command('stop')
      .description('Stop a persistent run session and terminate its browser/services')
      .argument('<session>', 'Persistent run session id')
  ).action(async (sessionId: string, options) => {
    if (!sessionId) {
      throw new HarnessError('run_session_not_found', 'A run session id is required.');
    }
    await runCommand('run-session.stop', options, 'run_failed', async (runContext) =>
      stopPersistentRunSession(runContext, sessionId)
    );
  });

  return runSession;
};

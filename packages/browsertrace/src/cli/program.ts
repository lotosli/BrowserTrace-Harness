import { Command } from 'commander';
import { buildSessionCommands } from './commands/session.js';
import { buildBrowserCommands } from './commands/browser.js';
import { buildDebugCommands } from './commands/debug.js';
import { buildJavaDebugCommands } from './commands/java-debug.js';
import { buildTraceCommands } from './commands/trace.js';
import { buildDoctorCommand } from './commands/doctor.js';
import { buildRunCommand } from './commands/run.js';
import { buildStepCommands } from './commands/step.js';
import { buildJudgeCommand } from './commands/judge.js';
import { buildDiagnoseCommand } from './commands/diagnose.js';
import { buildRunSessionCommands } from './commands/run-session.js';

export const buildProgram = (): Command => {
  const program = new Command();
  program.name('browsertrace').description('BrowserTrace local CLI harness');
  program.addCommand(buildRunCommand());
  program.addCommand(buildRunSessionCommands());
  program.addCommand(buildStepCommands());
  program.addCommand(buildJudgeCommand());
  program.addCommand(buildDiagnoseCommand());
  program.addCommand(buildSessionCommands());
  program.addCommand(buildBrowserCommands());
  program.addCommand(buildDebugCommands());
  program.addCommand(buildJavaDebugCommands());
  program.addCommand(buildTraceCommands());
  program.addCommand(buildDoctorCommand());
  return program;
};

export const runCli = async (): Promise<void> => {
  await buildProgram().parseAsync(process.argv);
};

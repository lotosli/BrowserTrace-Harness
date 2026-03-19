import { spawn } from 'node:child_process';
import { ensureDirectory, writeJsonFile } from '../utils/fs.js';
import { quoteCommandArgument } from '../utils/os.js';
import { HarnessError } from '../types/errors.js';
import { writeFile } from 'node:fs/promises';

export type LaunchJavaOptions = {
  javaAgentPath: string;
  agentPropertiesPath: string;
  appJar: string;
  logbackConfigPath: string;
  cwd: string;
  artifactsDir: string;
};

export const launchJavaProcess = async (options: LaunchJavaOptions): Promise<{ pid: number; command: string }> => {
  await ensureDirectory(options.artifactsDir);
  const args = [
    `-javaagent:${options.javaAgentPath}=config=${options.agentPropertiesPath}`,
    `-Dlogging.config=${options.logbackConfigPath}`,
    '-jar',
    options.appJar
  ];
  const command = ['java', ...args.map(quoteCommandArgument)].join(' ');
  const child = spawn('java', args, {
    cwd: options.cwd,
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  if (!child.pid) {
    throw new HarnessError('java_launch_failed', 'Java process did not start');
  }

  await writeFile(`${options.artifactsDir}/java-command.txt`, `${command}\n`, 'utf8');
  await writeJsonFile(`${options.artifactsDir}/java-launch.json`, { pid: child.pid, command });
  return {
    pid: child.pid,
    command
  };
};

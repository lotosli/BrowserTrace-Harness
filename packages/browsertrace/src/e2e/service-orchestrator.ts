import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { appendTextFile, writeTextFile } from '../utils/fs.js';
import type { LoadedServiceSpec } from './spec-loader.js';
import type { ArtifactWriter } from '../artifacts/artifact-writer.js';
import { HarnessError } from '../types/errors.js';

export type RunningService = {
  id: string;
  child: ChildProcess;
  stdoutPath: string;
  stderrPath: string;
  command: string;
};

const delay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const waitForHttpHealth = async (service: LoadedServiceSpec, child: ChildProcess): Promise<void> => {
  if (service.healthcheck.type !== 'http') {
    return;
  }

  const deadline = Date.now() + service.healthcheck.timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new HarnessError(
        'service_launch_failed',
        `Service ${service.id} exited before becoming healthy with code ${child.exitCode}`
      );
    }

    try {
      const response = await fetch(service.healthcheck.url);
      if (response.status === service.healthcheck.expectStatus) {
        return;
      }
    } catch {
      // Ignore connection errors until the timeout expires.
    }

    await delay(service.healthcheck.intervalMs);
  }

  throw new HarnessError(
    'service_launch_failed',
    `Service ${service.id} did not pass healthcheck ${service.healthcheck.url} within ${service.healthcheck.timeoutMs}ms`
  );
};

const waitForExit = async (child: ChildProcess, timeoutMs: number): Promise<void> => {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.removeAllListeners('exit');
      resolve();
    }, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
};

export const launchServices = async (
  services: LoadedServiceSpec[],
  artifactWriter: ArtifactWriter
): Promise<RunningService[]> => {
  const started: RunningService[] = [];

  try {
    for (const service of services) {
      const stdoutPath = path.join(artifactWriter.paths.runtimeDir, 'services', `${service.id}.stdout.log`);
      const stderrPath = path.join(artifactWriter.paths.runtimeDir, 'services', `${service.id}.stderr.log`);
      await Promise.all([writeTextFile(stdoutPath, ''), writeTextFile(stderrPath, '')]);

      const child = spawn(service.run, {
        cwd: service.cwd,
        env: {
          ...process.env,
          ...service.env
        },
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      child.stdout?.on('data', (chunk) => {
        void appendTextFile(stdoutPath, chunk.toString());
      });
      child.stderr?.on('data', (chunk) => {
        void appendTextFile(stderrPath, chunk.toString());
      });

      child.on('error', (error) => {
        void appendTextFile(stderrPath, `${error.message}\n`);
      });

      started.push({
        id: service.id,
        child,
        stdoutPath,
        stderrPath,
        command: service.run
      });

      await waitForHttpHealth(service, child);
    }

    return started;
  } catch (error) {
    await stopServices(started);
    throw error;
  }
};

export const stopServices = async (services: RunningService[]): Promise<void> => {
  for (const service of [...services].reverse()) {
    if (service.child.exitCode === null) {
      service.child.kill('SIGTERM');
      await waitForExit(service.child, 5_000);
    }
    if (service.child.exitCode === null) {
      service.child.kill('SIGKILL');
      await waitForExit(service.child, 2_000);
    }
  }
};

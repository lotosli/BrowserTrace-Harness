import { openSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { LoadedServiceSpec } from './spec-loader.js';
import { writeTextFile } from '../utils/fs.js';
import { HarnessError } from '../types/errors.js';

export type PersistentServiceHandle = {
  id: string;
  pid: number;
  stdoutPath: string;
  stderrPath: string;
  command: string;
  cwd: string;
};

const delay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const isPidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitForHttpHealth = async (service: LoadedServiceSpec, pid: number): Promise<void> => {
  if (service.healthcheck.type !== 'http') {
    return;
  }

  const deadline = Date.now() + service.healthcheck.timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      throw new HarnessError('service_launch_failed', `Service ${service.id} exited before becoming healthy.`);
    }

    try {
      const response = await fetch(service.healthcheck.url);
      if (response.status === service.healthcheck.expectStatus) {
        return;
      }
    } catch {
      // Ignore connection errors until timeout.
    }

    await delay(service.healthcheck.intervalMs);
  }

  throw new HarnessError(
    'service_launch_failed',
    `Service ${service.id} did not pass healthcheck ${service.healthcheck.url} within ${service.healthcheck.timeoutMs}ms`
  );
};

export const launchPersistentServices = async (
  services: LoadedServiceSpec[],
  sessionRoot: string
): Promise<PersistentServiceHandle[]> => {
  const handles: PersistentServiceHandle[] = [];
  const servicesRoot = path.join(sessionRoot, 'services');

  try {
    for (const service of services) {
      const stdoutPath = path.join(servicesRoot, `${service.id}.stdout.log`);
      const stderrPath = path.join(servicesRoot, `${service.id}.stderr.log`);
      await Promise.all([writeTextFile(stdoutPath, ''), writeTextFile(stderrPath, '')]);

      const stdoutFd = openSync(stdoutPath, 'a');
      const stderrFd = openSync(stderrPath, 'a');

      const child = spawn(service.run, {
        cwd: service.cwd,
        env: {
          ...process.env,
          ...service.env
        },
        shell: true,
        detached: true,
        stdio: ['ignore', stdoutFd, stderrFd]
      });
      child.unref();

      if (!child.pid) {
        throw new HarnessError('service_launch_failed', `Service ${service.id} failed to produce a process id.`);
      }

      await waitForHttpHealth(service, child.pid);

      handles.push({
        id: service.id,
        pid: child.pid,
        stdoutPath,
        stderrPath,
        command: service.run,
        cwd: service.cwd
      });
    }

    return handles;
  } catch (error) {
    await stopPersistentServices(handles);
    throw error;
  }
};

export const stopPersistentServices = async (services: Array<{ pid: number }>): Promise<void> => {
  for (const service of [...services].reverse()) {
    try {
      process.kill(-service.pid, 'SIGTERM');
    } catch {
      try {
        process.kill(service.pid, 'SIGTERM');
      } catch {
        // Ignore dead processes.
      }
    }
  }

  await delay(500);

  for (const service of [...services].reverse()) {
    if (isPidAlive(service.pid)) {
      try {
        process.kill(-service.pid, 'SIGKILL');
      } catch {
        try {
          process.kill(service.pid, 'SIGKILL');
        } catch {
          // Ignore dead processes.
        }
      }
    }
  }
};

export const isServiceRunning = (pid: number): boolean => isPidAlive(pid);

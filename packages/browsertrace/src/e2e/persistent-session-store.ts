import path from 'node:path';
import type { BrowserTraceConfig } from '../config/config-schema.js';
import { ensureDirectory, exists, readJsonFile, writeJsonFile } from '../utils/fs.js';
import { HarnessError } from '../types/errors.js';

export type PersistentRunSessionManifest = {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'stopped';
  specPath: string;
  specId: string;
  scenarioId: string;
  appName: string;
  envName: string;
  currentUrl?: string;
  browser: {
    cdpUrl?: string;
    browserPid?: number;
    executablePath?: string;
    userDataDir?: string;
    headless?: boolean;
  };
  services: Array<{
    id: string;
    pid: number;
    stdoutPath: string;
    stderrPath: string;
    command: string;
    cwd: string;
  }>;
  completedStepIds: string[];
  history: Array<{
    runId: string;
    stepId: string;
    ok: boolean;
    verdictCategory: string;
    traceId?: string;
    artifactsDir: string;
    createdAt: string;
  }>;
};

export class PersistentRunSessionStore {
  private readonly rootDir: string;

  public constructor(config: BrowserTraceConfig) {
    this.rootDir = path.join(path.dirname(config.artifacts.base_dir), 'run-sessions');
  }

  public async ensure(): Promise<void> {
    await ensureDirectory(this.rootDir);
  }

  public sessionRoot(sessionId: string): string {
    return path.join(this.rootDir, sessionId);
  }

  public manifestPath(sessionId: string): string {
    return path.join(this.sessionRoot(sessionId), 'manifest.json');
  }

  public async save(manifest: PersistentRunSessionManifest): Promise<string> {
    await ensureDirectory(this.sessionRoot(manifest.sessionId));
    const targetPath = this.manifestPath(manifest.sessionId);
    await writeJsonFile(targetPath, manifest);
    return targetPath;
  }

  public async load(sessionId: string): Promise<PersistentRunSessionManifest> {
    const manifestPath = this.manifestPath(sessionId);
    if (!(await exists(manifestPath))) {
      throw new HarnessError('run_session_not_found', `Run session ${sessionId} was not found`, {
        session_id: sessionId
      });
    }
    return readJsonFile<PersistentRunSessionManifest>(manifestPath);
  }
}

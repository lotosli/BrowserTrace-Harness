import path from 'node:path';
import type { SessionManifest, ShadowBundle } from '../types/session.js';
import { ensureDirectory, exists, readJsonFile, writeJsonFile } from '../utils/fs.js';
import { resolveStatePath } from '../utils/os.js';
import { HarnessError } from '../types/errors.js';

const manifestFileName = 'manifest.json';
const bundleFileName = 'bundle.json';

export class SessionStore {
  private readonly rootDir = resolveStatePath('sessions');

  public async save(sessionId: string, manifest: SessionManifest, bundle: ShadowBundle): Promise<void> {
    const sessionDir = path.join(this.rootDir, sessionId);
    await ensureDirectory(sessionDir);
    await writeJsonFile(path.join(sessionDir, manifestFileName), manifest);
    await writeJsonFile(path.join(sessionDir, bundleFileName), bundle);
  }

  public async load(sessionId: string): Promise<{ manifest: SessionManifest; bundle: ShadowBundle }> {
    const sessionDir = path.join(this.rootDir, sessionId);
    const manifestPath = path.join(sessionDir, manifestFileName);
    const bundlePath = path.join(sessionDir, bundleFileName);

    if (!(await exists(manifestPath)) || !(await exists(bundlePath))) {
      throw new HarnessError('session_not_found', `Session ${sessionId} was not found`, { sessionId });
    }

    return {
      manifest: await readJsonFile<SessionManifest>(manifestPath),
      bundle: await readJsonFile<ShadowBundle>(bundlePath)
    };
  }
}


import path from 'node:path';
import { buildArtifactPaths, type ArtifactPaths } from './artifact-paths.js';
import { ensureDirectory, writeJsonFile, writeTextFile } from '../utils/fs.js';

export class ArtifactWriter {
  public readonly paths: ArtifactPaths;

  public constructor(rootPath: string) {
    this.paths = buildArtifactPaths(rootPath);
  }

  public async ensure(): Promise<void> {
    await Promise.all(Object.values(this.paths).map((entry) => ensureDirectory(entry)));
  }

  public async writeJson(relativePath: string, value: unknown): Promise<string> {
    const targetPath = path.join(this.paths.root, relativePath);
    await writeJsonFile(targetPath, value);
    return targetPath;
  }

  public async writeText(relativePath: string, value: string): Promise<string> {
    const targetPath = path.join(this.paths.root, relativePath);
    await writeTextFile(targetPath, value);
    return targetPath;
  }
}

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export const expandHome = (value: string): string => {
  if (value === '~') {
    return homedir();
  }

  if (value.startsWith('~/')) {
    return path.join(homedir(), value.slice(2));
  }

  return value;
};

export const ensureDirectory = async (directoryPath: string): Promise<string> => {
  await mkdir(directoryPath, { recursive: true });
  return directoryPath;
};

export const writeJsonFile = async (filePath: string, value: unknown): Promise<void> => {
  await ensureDirectory(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

export const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
};

export const appendTextFile = async (filePath: string, value: string): Promise<void> => {
  await ensureDirectory(path.dirname(filePath));
  await writeFile(filePath, value, { encoding: 'utf8', flag: 'a' });
};

export const listFilesRecursive = async (directoryPath: string): Promise<string[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursive(entryPath);
      }

      return entryPath;
    })
  );

  return files.flat();
};

export const exists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};


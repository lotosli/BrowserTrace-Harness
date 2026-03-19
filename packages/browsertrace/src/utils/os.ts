import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { platform } from 'node:os';

const macChromeCandidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
];

const linuxChromeCandidates = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
];

const windowsChromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Chromium\\Application\\chrome.exe'
];

export const detectChromeExecutable = async (configuredPath?: string): Promise<string | undefined> => {
  const candidates = configuredPath
    ? [configuredPath]
    : platform() === 'darwin'
      ? macChromeCandidates
      : platform() === 'win32'
        ? windowsChromeCandidates
        : linuxChromeCandidates;

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return undefined;
};

export const quoteCommandArgument = (value: string): string => {
  if (platform() === 'win32') {
    return `"${value.replaceAll('"', '\\"')}"`;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
};

export const resolveStatePath = (...segments: string[]): string => path.join(process.env.HOME ?? process.cwd(), '.browsertrace', ...segments);


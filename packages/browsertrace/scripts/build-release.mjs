import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, '..');
const outputDir = path.join(packageDir, 'releases');
const entrypoint = path.join(packageDir, 'dist-pkg', 'pkg-main.cjs');
const checksumFile = path.join(outputDir, 'SHA256SUMS.txt');
const cliArgs = process.argv.slice(2);

const targets = [
  { platform: 'darwin', pkgTarget: 'node18-macos-x64', name: 'browsertrace-darwin-x64' },
  { platform: 'darwin', pkgTarget: 'node18-macos-arm64', name: 'browsertrace-darwin-arm64' },
  { platform: 'linux', pkgTarget: 'node18-linux-x64', name: 'browsertrace-linux-x64' },
  { platform: 'linux', pkgTarget: 'node18-linux-arm64', name: 'browsertrace-linux-arm64' },
  { platform: 'windows', pkgTarget: 'node18-win-x64', name: 'browsertrace-win-x64.exe' },
  { platform: 'windows', pkgTarget: 'node18-win-arm64', name: 'browsertrace-win-arm64.exe' }
];

const options = {
  platform: 'all',
  skipChecksums: false
};

for (let index = 0; index < cliArgs.length; index += 1) {
  const argument = cliArgs[index];
  if (argument === '--platform') {
    options.platform = cliArgs[index + 1] ?? 'all';
    index += 1;
    continue;
  }

  if (argument === '--skip-checksums') {
    options.skipChecksums = true;
  }
}

const selectedTargets =
  options.platform === 'all' ? targets : targets.filter((target) => target.platform === options.platform);

if (selectedTargets.length === 0) {
  throw new Error(`Unsupported platform filter: ${options.platform}`);
}

const shouldSuppressPkgNoise = (line) =>
  line.includes("Warning Babel parse has failed: Unexpected character '�'. (1:0)") ||
  (line.includes('Warning Failed to make bytecode') &&
    (line.includes('playwright-core/lib/server/chromium/appIcon.png') ||
      line.includes('playwright-core\\lib\\server\\chromium\\appIcon.png')));

const forwardStream = (stream, writer) =>
  new Promise((resolve) => {
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!shouldSuppressPkgNoise(line)) {
          writer.write(`${line}\n`);
        }
      }
    });
    stream.on('end', () => {
      if (buffer.length > 0 && !shouldSuppressPkgNoise(buffer)) {
        writer.write(buffer);
      }
      resolve();
    });
  });

const run = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    const commandToRun = process.platform === 'win32' ? 'cmd.exe' : command;
    const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', command, ...args] : args;

    const child = spawn(commandToRun, commandArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    });

    const stdoutDone = forwardStream(child.stdout, process.stdout);
    const stderrDone = forwardStream(child.stderr, process.stderr);

    child.on('close', async (code) => {
      await Promise.all([stdoutDone, stderrDone]);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${commandToRun} ${commandArgs.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const target of selectedTargets) {
  await run(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    [
      'exec',
      'pkg',
      entrypoint,
      '--targets',
      target.pkgTarget,
      '--output',
      path.join(outputDir, target.name),
      '--public',
      '--public-packages',
      '*',
      '--no-bytecode'
    ],
    packageDir
  );
}

if (options.skipChecksums) {
  process.exit(0);
}

const checksums = [];
for (const target of selectedTargets) {
  const artifact = path.join(outputDir, target.name);
  const digest = createHash('sha256').update(await readFile(artifact)).digest('hex');
  checksums.push(`${digest}  ${target.name}`);
}

await writeFile(checksumFile, `${checksums.join('\n')}\n`, 'utf8');

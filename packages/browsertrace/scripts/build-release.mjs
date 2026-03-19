import { mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, '..');
const outputDir = path.join(packageDir, 'releases');
const entrypoint = path.join(packageDir, 'dist-pkg', 'pkg-main.cjs');

const targets = [
  { pkgTarget: 'node18-macos-x64', name: 'browsertrace-darwin-x64' },
  { pkgTarget: 'node18-macos-arm64', name: 'browsertrace-darwin-arm64' },
  { pkgTarget: 'node18-linux-x64', name: 'browsertrace-linux-x64' },
  { pkgTarget: 'node18-linux-arm64', name: 'browsertrace-linux-arm64' },
  { pkgTarget: 'node18-win-x64', name: 'browsertrace-win-x64.exe' },
  { pkgTarget: 'node18-win-arm64', name: 'browsertrace-win-arm64.exe' }
];

const run = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const target of targets) {
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
      '--public-packages',
      '*'
    ],
    packageDir
  );
}

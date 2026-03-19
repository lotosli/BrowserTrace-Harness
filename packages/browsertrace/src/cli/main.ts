#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
export { buildProgram, runCli } from './program.js';
import { runCli } from './program.js';

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { exists } from '../utils/fs.js';
import type { RunContext } from '../cli/run-context.js';
import type { LoadedRunSpec } from './spec-loader.js';
import { HarnessError } from '../types/errors.js';

export type PersistentBrowserSessionResult = {
  cdpUrl?: string;
  browserPid?: number;
  userDataDir?: string;
  headless?: boolean;
  executablePath?: string;
};

const detectPythonExecutable = async (explicit?: string): Promise<string> => {
  const candidates = [
    explicit,
    process.env.BROWSERTRACE_PYTHON,
    path.resolve(process.cwd(), '.venv/bin/python'),
    path.resolve(process.cwd(), '.venv/Scripts/python.exe'),
    'python3',
    'python'
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (candidate.includes(path.sep)) {
      if (await exists(candidate)) {
        return candidate;
      }
      continue;
    }
    return candidate;
  }

  throw new HarnessError('engine_not_available', 'No Python executable could be resolved for persistent browser sessions.');
};

const resolveSessionScriptPath = (): string => {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '../../python/browsertrace_browser_use_session.py');
};

export const startPersistentBrowserSession = async (
  runContext: RunContext,
  spec: LoadedRunSpec
): Promise<PersistentBrowserSessionResult> => {
  const pythonExecutable = await detectPythonExecutable(spec.engine.pythonExecutable ?? runContext.config.browser_use.python_executable);
  const scriptPath = resolveSessionScriptPath();
  if (!(await exists(scriptPath))) {
    throw new HarnessError('engine_not_available', `Persistent browser session script not found at ${scriptPath}`);
  }

  const executablePath = spec.engine.executablePath ?? runContext.config.browser_use.executable_path ?? runContext.config.chrome.executable_path;
  const headless = spec.engine.headless ?? runContext.config.browser_use.headless ?? false;
  const userDataDir = spec.engine.userDataDir ?? runContext.config.browser_use.user_data_dir;
  const cdpUrl = spec.engine.cdpUrl ?? runContext.config.browser_use.cdp_url;
  const waitBetweenActionsMs =
    spec.engine.waitBetweenActionsMs ?? runContext.config.browser_use.wait_between_actions_ms ?? 250;

  const inputPath = await runContext.artifactWriter.writeJson('runtime/persistent-browser-session-input.json', {
    cdpUrl,
    executablePath,
    headless,
    userDataDir,
    waitBetweenActionsMs
  });

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(pythonExecutable, [scriptPath, 'start', inputPath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk.toString()));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk.toString()));
    child.on('error', reject);
    child.on('exit', (code) => resolve(code));
  });

  const stderr = stderrChunks.join('').trim();
  if (exitCode !== 0) {
    throw new HarnessError(
      'engine_execution_failed',
      stderr || `Persistent browser session helper exited with code ${String(exitCode)}`,
      {
        python_executable: pythonExecutable,
        script_path: scriptPath
      }
    );
  }

  try {
    return JSON.parse(stdoutChunks.join('')) as PersistentBrowserSessionResult;
  } catch (error) {
    throw new HarnessError(
      'engine_execution_failed',
      `Failed to parse persistent browser session helper output: ${error instanceof Error ? error.message : 'unknown error'}`,
      {
        stderr
      }
    );
  }
};

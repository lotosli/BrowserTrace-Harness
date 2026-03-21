import type { AppRuntimeConfig } from '../config/config-schema.js';
import type { RunContext } from '../cli/run-context.js';
import type { ConsoleEntryRecord, NetworkDetailedRecord, PageStateProbe } from '../types/runtime.js';
import type { LoadedRunSpec } from './spec-loader.js';

export type BrowserEngineStepResult = {
  id: string;
  action: string;
  status: 'ok' | 'error';
  currentUrl: string;
  pageTitle: string;
  pageHtmlPath: string;
  pageStatePath: string;
  screenshotPath?: string;
  evalResult?: string;
  errorMessage?: string;
  pageState: PageStateProbe;
  consoleEntries: ConsoleEntryRecord[];
  actionConsoleEntries: ConsoleEntryRecord[];
  networkDetailed: NetworkDetailedRecord[];
  actionNetworkDetailed: NetworkDetailedRecord[];
  exceptions: string[];
  actionExceptions: string[];
};

export type BrowserEngineRunResult = {
  engine: 'browser_use_python';
  currentUrl: string;
  pageTitle: string;
  pageStatePath: string;
  pageHtmlPath: string;
  screenshotPath?: string;
  steps: BrowserEngineStepResult[];
};

export type BrowserEngineRunInput = {
  spec: LoadedRunSpec;
  runContext: RunContext;
  appConfig?: AppRuntimeConfig;
};

export interface BrowserEngine {
  run(input: BrowserEngineRunInput): Promise<BrowserEngineRunResult>;
}

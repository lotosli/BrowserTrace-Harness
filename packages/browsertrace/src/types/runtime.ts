import type { ValidationStatus } from './session.js';

export type BrowserAction =
  | { type: 'goto'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'wait'; durationMs?: number; selector?: string }
  | { type: 'screenshot'; path?: string; fullPage?: boolean };

export type NetworkSummaryRecord = {
  url: string;
  method: string;
  status?: number;
  ok?: boolean;
  traceId?: string;
  spanId?: string;
};

export type RuntimeArtifacts = {
  consolePath: string;
  networkPath: string;
  exceptionsPath: string;
  screenshotPath?: string;
  resultPath: string;
};

export type ValidationResult = {
  status: ValidationStatus;
  currentUrl: string;
  selectorVisible: boolean;
  apiStatus?: number;
  criticalRequestMatched?: string;
};


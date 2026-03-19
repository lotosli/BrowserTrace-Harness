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

export type ConsoleEntryRecord = {
  type: string;
  text: string;
  timestamp: string;
  location?: {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
};

export type NetworkDetailedRecord = {
  sequence: number;
  url: string;
  method: string;
  resourceType: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  status?: number;
  statusText?: string;
  ok?: boolean;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBodyText?: string;
  responseBodyText?: string;
  responseBodyJson?: unknown;
  failureText?: string;
  traceId?: string;
  spanId?: string;
};

export type PageProbeElement = {
  testId: string;
  tagName: string;
  text: string;
  visible: boolean;
  className?: string;
  value?: string;
  selectedText?: string;
  disabled?: boolean;
  checked?: boolean;
  href?: string;
};

export type PageStateProbe = {
  title: string;
  url: string;
  textExcerpt: string;
  headings: string[];
  buttons: string[];
  forms: Array<{
    name: string;
    type: string;
    value: string;
    checked?: boolean;
    disabled?: boolean;
  }>;
  elementsByTestId: Record<string, PageProbeElement>;
  responsePanelText?: string;
  responsePanelJson?: unknown;
  failureTitle?: string;
  failureDetail?: string;
  statusChips: Record<string, string>;
};

export type AiDebugOutcome =
  | 'success'
  | 'http_error'
  | 'client_timeout'
  | 'invalid_response_shape'
  | 'network_error'
  | 'ui_error'
  | 'unknown';

export type AiDebugSummary = {
  schemaVersion: string;
  generatedAt: string;
  action: BrowserAction;
  currentUrl: string;
  pageTitle: string;
  shadowValidation: ValidationResult;
  actionRequestCount: number;
  actionErrorCount: number;
  actionExceptionCount: number;
  outcome: {
    category: AiDebugOutcome;
    reason: string;
    confidence: number;
  };
  page: {
    appId?: string;
    appLabel?: string;
    scenarioId?: string;
    scenarioLabel?: string;
    apiBase?: string;
    observedHttpStatus?: string;
    expectedStatus?: string;
    failureTitle?: string;
    failureDetail?: string;
    responsePanelJson?: unknown;
    responsePanelText?: string;
    textExcerpt: string;
  };
  rootRequest?: NetworkDetailedRecord;
  failedRequests: NetworkDetailedRecord[];
  consoleErrors: ConsoleEntryRecord[];
  exceptions: string[];
  trace: {
    traceId?: string;
    traceparent?: string;
    tracestate?: string;
    baggage: Record<string, string>;
  };
  artifacts: {
    pageStatePath: string;
    pageHtmlPath: string;
    postActionScreenshotPath: string;
    consoleDetailedPath: string;
    actionConsoleDetailedPath?: string;
    networkDetailedPath: string;
    actionNetworkDetailedPath?: string;
    aiSummaryPath: string;
    tempoTracePath?: string;
    lokiLogsPath?: string;
  };
};

export type RuntimeArtifacts = {
  consolePath: string;
  networkPath: string;
  exceptionsPath: string;
  consoleDetailedPath?: string;
  networkDetailedPath?: string;
  pageStatePath?: string;
  pageHtmlPath?: string;
  aiSummaryPath?: string;
  postActionScreenshotPath?: string;
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

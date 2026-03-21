export type BaggageContext = {
  specId: string;
  runId: string;
  stepId?: string;
  sessionId: string;
  shadowSessionId?: string;
  appName: string;
  envName: string;
  gitSha?: string;
  userIntent?: string;
  pageUrl: string;
};

export type BaggageHeaderMap = Record<string, string>;

export type TraceOutputMode = 'otlp' | 'jsonl' | 'both';

export type TraceJsonlRecord = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  statusCode: string;
  statusMessage?: string;
  attributes: Record<string, unknown>;
  resource: Record<string, unknown>;
  baggage: Record<string, string>;
};

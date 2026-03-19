import { appendTextFile } from '../utils/fs.js';
import type { BaggageContext, TraceJsonlRecord } from '../types/baggage.js';
import type { ExportResult, ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

const hrTimeToIso = (time: [number, number]): string => new Date((time[0] * 1_000 + time[1] / 1_000_000) * 1_000).toISOString();
const hrTimeToMs = (time: [number, number]): number => time[0] * 1_000 + time[1] / 1_000_000;

export class JsonlTraceExporter implements SpanExporter {
  public constructor(
    private readonly outputPath: string,
    private readonly baggageContext: BaggageContext
  ) {}

  public async export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): Promise<void> {
    try {
      for (const span of spans) {
        const record: TraceJsonlRecord = {
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          parentSpanId: span.parentSpanContext?.spanId,
          name: span.name,
          kind: String(span.kind),
          startTime: hrTimeToIso(span.startTime),
          endTime: hrTimeToIso(span.endTime),
          durationMs: Math.max(0, hrTimeToMs(span.endTime) - hrTimeToMs(span.startTime)),
          statusCode: String(span.status.code),
          statusMessage: span.status.message,
          attributes: span.attributes,
          resource: span.resource.attributes,
          baggage: {
            'spec.id': this.baggageContext.specId,
            'run.id': this.baggageContext.runId,
            'session.id': this.baggageContext.sessionId,
            ...(this.baggageContext.shadowSessionId ? { 'shadow.session.id': this.baggageContext.shadowSessionId } : {}),
            'app.name': this.baggageContext.appName,
            'env.name': this.baggageContext.envName,
            ...(this.baggageContext.gitSha ? { 'git.sha': this.baggageContext.gitSha } : {}),
            ...(this.baggageContext.userIntent ? { 'user.intent': this.baggageContext.userIntent } : {}),
            'page.url': this.baggageContext.pageUrl
          }
        };

        await appendTextFile(this.outputPath, `${JSON.stringify(record)}\n`);
      }

      resultCallback({ code: 0 });
    } catch (error) {
      resultCallback({
        code: 1,
        error: error instanceof Error ? error : undefined
      });
    }
  }

  public async shutdown(): Promise<void> {}
  public async forceFlush(): Promise<void> {}
}


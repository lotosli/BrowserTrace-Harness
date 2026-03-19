import * as otelApi from '@opentelemetry/api';
import * as otelCore from '@opentelemetry/core';
import type { Context, Span } from '@opentelemetry/api';

export const injectHeadersFromContext = (context: Context): Record<string, string> => {
  const carrier: Record<string, string> = {};
  new otelCore.W3CTraceContextPropagator().inject(context, carrier, {
    set(target, key, value) {
      target[key] = value;
    }
  });
  new otelCore.W3CBaggagePropagator().inject(context, carrier, {
    set(target, key, value) {
      target[key] = value;
    }
  });
  return carrier;
};

export const spanContextToHeaders = (span: Span): Record<string, string> =>
  injectHeadersFromContext(otelApi.trace.setSpan(otelApi.context.active(), span));

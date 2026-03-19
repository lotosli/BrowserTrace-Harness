import * as otelApi from '@opentelemetry/api';
import type { Baggage, Context } from '@opentelemetry/api';
import type { BaggageContext, BaggageHeaderMap } from '../types/baggage.js';

const toBaggageHeaders = (context: BaggageContext): BaggageHeaderMap => ({
  'spec.id': context.specId,
  'run.id': context.runId,
  'session.id': context.sessionId,
  ...(context.shadowSessionId ? { 'shadow.session.id': context.shadowSessionId } : {}),
  'app.name': context.appName,
  'env.name': context.envName,
  ...(context.gitSha ? { 'git.sha': context.gitSha } : {}),
  ...(context.userIntent ? { 'user.intent': context.userIntent } : {}),
  'page.url': context.pageUrl
});

export const baggageContextToHeaders = (context: BaggageContext): BaggageHeaderMap => toBaggageHeaders(context);

export const buildBaggage = (context: BaggageContext): Baggage => {
  const entries = Object.entries(toBaggageHeaders(context)).map(([key, value]) => [
    key,
    { value, metadata: otelApi.baggageEntryMetadataFromString('browsertrace') }
  ]);

  return otelApi.propagation.createBaggage(Object.fromEntries(entries));
};

export const serializeBaggage = (baggageContext: BaggageContext): string => {
  const carrier: Record<string, string> = {};
  const context = otelApi.propagation.setBaggage(otelApi.ROOT_CONTEXT, buildBaggage(baggageContext));
  otelApi.propagation.inject(context, carrier);
  return carrier.baggage ?? '';
};

export const baggageFromContext = (context: Context): Record<string, string> => {
  const baggage = otelApi.propagation.getBaggage(context);
  if (!baggage) {
    return {};
  }

  return Object.fromEntries(
    baggage.getAllEntries().map(([key, entry]) => [key, entry.value])
  );
};

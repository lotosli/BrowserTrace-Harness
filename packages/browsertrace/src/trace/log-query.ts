import { HarnessError } from '../types/errors.js';
import type { LookupBackendConfig } from '../types/lookup.js';

const buildSelector = (labels: Record<string, string>): string => {
  const items = Object.entries(labels).map(([key, value]) => `${key}="${value}"`);
  return `{${items.join(',')}}`;
};

export const lookupLogs = async (config: LookupBackendConfig, traceId: string): Promise<unknown> => {
  const selector = buildSelector(config.lokiQueryLabels);
  const endpoint = new URL('/loki/api/v1/query', config.lokiBaseUrl);
  endpoint.searchParams.set('query', `${selector} |= "${traceId}"`);
  const response = await fetch(endpoint).catch((error) => {
    throw new HarnessError('log_lookup_failed', error instanceof Error ? error.message : 'Failed to query Loki');
  });
  if (!response.ok) {
    throw new HarnessError('log_lookup_failed', `Loki returned ${response.status} for trace ${traceId}`);
  }
  return response.json();
};


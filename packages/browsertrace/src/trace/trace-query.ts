import { HarnessError } from '../types/errors.js';
import type { LookupBackendConfig } from '../types/lookup.js';

export const lookupTrace = async (config: LookupBackendConfig, traceId: string): Promise<unknown> => {
  const endpoint = new URL(`/api/traces/${traceId}`, config.tempoBaseUrl).toString();
  const response = await fetch(endpoint).catch((error) => {
    throw new HarnessError('trace_lookup_failed', error instanceof Error ? error.message : 'Failed to query Tempo');
  });
  if (!response.ok) {
    throw new HarnessError('trace_lookup_failed', `Tempo returned ${response.status} for trace ${traceId}`);
  }
  return response.json();
};


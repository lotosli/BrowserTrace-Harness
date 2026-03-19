import { writeJsonFile } from '../utils/fs.js';
import { HarnessError } from '../types/errors.js';
import type { RunContext } from '../cli/run-context.js';

export const callLocalApi = async (runContext: RunContext, url: string): Promise<{ status: number; body: unknown }> => {
  const response = await fetch(url, {
    headers: runContext.traceHeaders
  }).catch((error) => {
    throw new HarnessError('local_api_call_failed', error instanceof Error ? error.message : 'Failed to call local API');
  });

  let body: unknown;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  await writeJsonFile(runContext.artifactWriter.paths.runtimeDir + '/result.json', {
    url,
    status: response.status,
    body
  });
  await writeJsonFile(runContext.artifactWriter.paths.correlationDir + '/request-trace-map.json', [
    {
      request_url: url,
      method: 'GET',
      trace_id: runContext.traceHeaders.traceparent?.split('-')[1],
      span_id: runContext.traceHeaders.traceparent?.split('-')[2],
      status: response.status
    }
  ]);
  return {
    status: response.status,
    body
  };
};


import { findRootRequest } from '../runtime/ai-debug-artifacts.js';
import type { OraclesSpec } from './spec-schema.js';
import type { BrowserEngineRunResult } from './browser-engine.js';

const extractTestId = (selector: string): string | undefined => {
  const trimmed = selector.trim();
  if (!trimmed) {
    return undefined;
  }
  const directMatch = trimmed.match(/^\[data-testid=['"]([^'"]+)['"]\]$/);
  if (directMatch) {
    return directMatch[1];
  }
  if (!trimmed.includes('[') && !trimmed.includes('.') && !trimmed.includes('#')) {
    return trimmed;
  }
  return undefined;
};

export type OracleCheck = {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
};

export type RunVerdict = {
  status: 'passed' | 'failed';
  category:
    | 'success'
    | 'browser_action_failed'
    | 'ui_assertion_failed'
    | 'http_error'
    | 'trace_missing'
    | 'trace_lookup_failed'
    | 'log_lookup_failed';
  reason: string;
  failedStepId?: string;
  checks: OracleCheck[];
};

export const judgeRun = (input: {
  engineResult: BrowserEngineRunResult;
  oracles: OraclesSpec;
  traceId?: string;
  traceLookupError?: string;
  logLookupError?: string;
}): RunVerdict => {
  const checks: OracleCheck[] = [];
  const failedStep = input.engineResult.steps.find((step) => step.status === 'error');
  if (failedStep) {
    checks.push({
      name: 'step_execution',
      status: 'failed',
      message: failedStep.errorMessage ?? `Step ${failedStep.id} failed`
    });
    return {
      status: 'failed',
      category: 'browser_action_failed',
      reason: failedStep.errorMessage ?? `Step ${failedStep.id} failed`,
      failedStepId: failedStep.id,
      checks
    };
  }

  const allRequests = input.engineResult.steps.flatMap((step) => step.actionNetworkDetailed);
  const rootRequest = findRootRequest(allRequests);
  const httpFailure = allRequests.find((request) => (request.status ?? 0) >= input.oracles.network.failOnHttpStatusGte);
  checks.push({
    name: 'network',
    status: httpFailure ? 'failed' : 'passed',
    message: httpFailure
      ? `Observed ${httpFailure.status} from ${httpFailure.method} ${httpFailure.url}`
      : 'No network failures above the configured threshold were observed.'
  });
  if (httpFailure) {
    return {
      status: 'failed',
      category: 'http_error',
      reason: `Observed ${httpFailure.status} from ${httpFailure.method} ${httpFailure.url}`,
      failedStepId: input.engineResult.steps.find((step) => step.actionNetworkDetailed.includes(httpFailure))?.id,
      checks
    };
  }

  const finalStep = input.engineResult.steps[input.engineResult.steps.length - 1];
  for (const assertion of input.oracles.ui) {
    const testId = extractTestId(assertion.selector);
    const element = testId ? finalStep.pageState.elementsByTestId[testId] : undefined;
    const elementText = element?.text;
    if (assertion.visible && !element?.visible) {
      checks.push({
        name: `ui:${assertion.selector}`,
        status: 'failed',
        message: `Expected ${assertion.selector} to be visible`
      });
      return {
        status: 'failed',
        category: 'ui_assertion_failed',
        reason: `Expected ${assertion.selector} to be visible`,
        failedStepId: finalStep.id,
        checks
      };
    }
    if (assertion.textIncludes && !(elementText ?? '').includes(assertion.textIncludes)) {
      checks.push({
        name: `ui:${assertion.selector}`,
        status: 'failed',
        message: `Expected ${assertion.selector} text to include "${assertion.textIncludes}"`
      });
      return {
        status: 'failed',
        category: 'ui_assertion_failed',
        reason: `Expected ${assertion.selector} text to include "${assertion.textIncludes}"`,
        failedStepId: finalStep.id,
        checks
      };
    }
    checks.push({
      name: `ui:${assertion.selector}`,
      status: 'passed',
      message: `Assertion passed for ${assertion.selector}`
    });
  }

  if (input.oracles.trace.failOnMissingTrace && !input.traceId) {
    checks.push({
      name: 'trace',
      status: 'failed',
      message: 'Trace id is missing'
    });
    return {
      status: 'failed',
      category: 'trace_missing',
      reason: 'Trace id is missing',
      failedStepId: finalStep.id,
      checks
    };
  }
  if (input.oracles.trace.requireLookup && input.traceLookupError) {
    checks.push({
      name: 'trace_lookup',
      status: 'failed',
      message: input.traceLookupError
    });
    return {
      status: 'failed',
      category: 'trace_lookup_failed',
      reason: input.traceLookupError,
      failedStepId: finalStep.id,
      checks
    };
  }
  if (input.oracles.logs.requireLookup && input.logLookupError) {
    checks.push({
      name: 'log_lookup',
      status: 'failed',
      message: input.logLookupError
    });
    return {
      status: 'failed',
      category: 'log_lookup_failed',
      reason: input.logLookupError,
      failedStepId: finalStep.id,
      checks
    };
  }

  checks.push({
    name: 'root_request',
    status: 'passed',
    message: rootRequest ? `${rootRequest.method} ${rootRequest.url}` : 'No root request identified.'
  });

  return {
    status: 'passed',
    category: 'success',
    reason: 'Run completed successfully and all configured oracles passed.',
    checks
  };
};

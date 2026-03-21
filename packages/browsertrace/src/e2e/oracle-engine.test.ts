import { describe, expect, it } from 'vitest';
import { judgeRun } from './oracle-engine.js';
import type { BrowserEngineRunResult } from './browser-engine.js';
import type { OraclesSpec } from './spec-schema.js';

const baseEngineResult: BrowserEngineRunResult = {
  engine: 'browser_use_python',
  currentUrl: 'http://127.0.0.1:3000',
  pageTitle: 'Shop',
  pageStatePath: '/tmp/page-state.json',
  pageHtmlPath: '/tmp/page.html',
  screenshotPath: '/tmp/post-action.png',
  steps: [
    {
      id: 'submit',
      action: 'click',
      status: 'ok',
      currentUrl: 'http://127.0.0.1:3000',
      pageTitle: 'Shop',
      pageHtmlPath: '/tmp/page.html',
      pageStatePath: '/tmp/page-state.json',
      screenshotPath: '/tmp/post-action.png',
      pageState: {
        title: 'Shop',
        url: 'http://127.0.0.1:3000',
        textExcerpt: 'Order created',
        headings: [],
        buttons: [],
        forms: [],
        elementsByTestId: {
          'order-success': {
            testId: 'order-success',
            tagName: 'div',
            text: 'Order created',
            visible: true
          }
        },
        statusChips: {}
      },
      consoleEntries: [],
      actionConsoleEntries: [],
      networkDetailed: [],
      actionNetworkDetailed: [],
      exceptions: [],
      actionExceptions: []
    }
  ]
};

describe('judgeRun', () => {
  it('fails when a step reports an execution error', () => {
    const verdict = judgeRun({
      engineResult: {
        ...baseEngineResult,
        steps: [
          {
            ...baseEngineResult.steps[0],
            status: 'error',
            errorMessage: 'selector not found'
          }
        ]
      },
      oracles: {
        ui: [],
        network: { failOnHttpStatusGte: 500 },
        trace: { failOnMissingTrace: false, requireLookup: false },
        logs: { requireLookup: false }
      }
    });

    expect(verdict.status).toBe('failed');
    expect(verdict.category).toBe('browser_action_failed');
  });

  it('passes when ui assertions and network checks pass', () => {
    const verdict = judgeRun({
      engineResult: {
        ...baseEngineResult,
        steps: [
          {
            ...baseEngineResult.steps[0],
            actionNetworkDetailed: [
              {
                sequence: 1,
                url: 'http://127.0.0.1:8080/api/orders',
                method: 'POST',
                resourceType: 'fetch',
                startedAt: new Date().toISOString(),
                status: 201,
                ok: true
              }
            ]
          }
        ]
      },
      oracles: {
        ui: [
          {
            selector: '[data-testid="order-success"]',
            visible: true,
            textIncludes: 'Order created'
          }
        ],
        network: { failOnHttpStatusGte: 500 },
        trace: { failOnMissingTrace: false, requireLookup: false },
        logs: { requireLookup: false }
      } satisfies OraclesSpec,
      traceId: 'trace-1'
    });

    expect(verdict.status).toBe('passed');
    expect(verdict.category).toBe('success');
  });
});

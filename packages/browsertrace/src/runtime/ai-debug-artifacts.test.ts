import { describe, expect, it } from 'vitest';
import { buildAiDebugSummary, classifyAiOutcome, findRootRequest } from './ai-debug-artifacts.js';
import type { ConsoleEntryRecord, NetworkDetailedRecord, PageStateProbe, ValidationResult } from '../types/runtime.js';

const baseValidation: ValidationResult = {
  status: 'validated',
  currentUrl: 'http://127.0.0.1:5173/?appId=orders&scenarioId=profile_ok',
  selectorVisible: true,
  apiStatus: 200
};

const basePageState: PageStateProbe = {
  title: 'BrowserTrace React Demo',
  url: 'http://127.0.0.1:5173/?appId=orders&scenarioId=profile_ok',
  textExcerpt: 'Demo page',
  headings: ['BrowserTrace React Demo'],
  buttons: ['调用后端 API'],
  forms: [],
  elementsByTestId: {
    'app-select': {
      testId: 'app-select',
      tagName: 'select',
      text: '订单模块',
      visible: true,
      value: 'orders',
      selectedText: '订单模块'
    },
    'scenario-select': {
      testId: 'scenario-select',
      tagName: 'select',
      text: '400 参数错误',
      visible: true,
      value: 'bad_request',
      selectedText: '400 参数错误'
    }
  },
  responsePanelText: '{"message":"缺少业务过滤条件"}',
  responsePanelJson: { message: '缺少业务过滤条件' },
  failureTitle: '后端返回错误 400',
  failureDetail: '缺少业务过滤条件，无法处理请求。',
  statusChips: {
    'api-base-chip': 'API Base: http://127.0.0.1:8084',
    'http-status-chip': 'HTTP: 400',
    'expected-status-chip': '预期: 400'
  }
};

const request = (overrides: Partial<NetworkDetailedRecord> = {}): NetworkDetailedRecord => ({
  sequence: 1,
  url: 'http://127.0.0.1:8084/api/demo/run',
  method: 'POST',
  resourceType: 'fetch',
  startedAt: '2026-03-20T00:00:00.000Z',
  finishedAt: '2026-03-20T00:00:00.050Z',
  durationMs: 50,
  status: 400,
  statusText: 'Bad Request',
  ok: false,
  requestBodyText: '{"appId":"orders","scenarioId":"bad_request"}',
  responseBodyText: '{"message":"缺少业务过滤条件"}',
  responseBodyJson: { message: '缺少业务过滤条件' },
  traceId: 'trace-id',
  spanId: 'span-id',
  ...overrides
});

describe('findRootRequest', () => {
  it('prefers the latest non-GET API request', () => {
    const records = [
      request({ sequence: 1, method: 'GET', status: 200, ok: true, url: 'http://127.0.0.1:8084/api/demo/options/apps' }),
      request({ sequence: 2, method: 'POST', status: 400, ok: false }),
      request({ sequence: 3, method: 'GET', status: 404, ok: false, url: 'http://127.0.0.1:5174/favicon.ico', resourceType: 'image' })
    ];

    expect(findRootRequest(records)?.method).toBe('POST');
    expect(findRootRequest(records)?.status).toBe(400);
  });
});

describe('classifyAiOutcome', () => {
  it('returns invalid_response_shape when the UI says the payload shape is wrong', () => {
    const outcome = classifyAiOutcome({
      pageState: {
        ...basePageState,
        failureTitle: '返回结构错误',
        failureDetail: 'HTTP 200，但响应缺少 ok=true 或 data 字段。'
      },
      rootRequest: request({ status: 200, ok: true }),
      consoleEntries: [],
      exceptions: []
    });

    expect(outcome.category).toBe('invalid_response_shape');
  });
});

describe('buildAiDebugSummary', () => {
  it('produces a top-level summary with the root request and UI state', () => {
    const consoleEntries: ConsoleEntryRecord[] = [
      {
        type: 'error',
        text: 'Failed to load resource: the server responded with a status of 400 ()',
        timestamp: '2026-03-20T00:00:00.060Z'
      }
    ];

    const summary = buildAiDebugSummary({
      action: { type: 'click', selector: "[data-testid='run-button']" },
      currentUrl: basePageState.url,
      shadowValidation: baseValidation,
      pageState: basePageState,
      allRequests: [request()],
      actionRequests: [request()],
      consoleEntries,
      exceptions: [],
      traceId: 'trace-id',
      traceparent: '00-trace-id-span-id-01',
      tracestate: '',
      baggage: { 'run.id': 'run_123' },
      artifactPaths: {
        pageStatePath: '/tmp/page-state.json',
        pageHtmlPath: '/tmp/page.html',
        postActionScreenshotPath: '/tmp/post-action.png',
        consoleDetailedPath: '/tmp/console-detailed.json',
        networkDetailedPath: '/tmp/network-detailed.json',
        aiSummaryPath: '/tmp/ai-summary.json'
      }
    });

    expect(summary.outcome.category).toBe('http_error');
    expect(summary.rootRequest?.status).toBe(400);
    expect(summary.page.observedHttpStatus).toBe('400');
    expect(summary.page.failureTitle).toBe('后端返回错误 400');
  });
});

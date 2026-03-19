import { useEffect, useMemo, useState } from 'react';

type PageMeta = {
  title: string;
  subtitle: string;
  defaultAppId: string;
};

type AppOption = {
  id: string;
  label: string;
  description: string;
};

type ScenarioOption = {
  id: string;
  label: string;
  expectedStatus: string;
  description: string;
};

type SuccessPayload = {
  ok: true;
  appId: string;
  scenarioId: string;
  message: string;
  data: unknown;
  diagnostics: {
    traceparent: string;
    baggage: string;
    requestId: string;
  };
};

type FailureState = {
  title: string;
  detail: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8083';
const REQUEST_TIMEOUT_MS = 1200;

const buildUrl = (pathname: string): string => `${API_BASE_URL}${pathname}`;

const readJson = async <T,>(response: Response): Promise<T> => {
  const body = await response.json();
  return body as T;
};

const isSuccessPayload = (value: unknown): value is SuccessPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return candidate.ok === true && typeof candidate.message === 'string' && 'data' in candidate;
};

export default function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedAppId = params.get('appId') ?? '';
  const requestedScenarioId = params.get('scenarioId') ?? '';

  const [pageMeta, setPageMeta] = useState<PageMeta | null>(null);
  const [apps, setApps] = useState<AppOption[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioOption[]>([]);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [failure, setFailure] = useState<FailureState | null>(null);
  const [responseBody, setResponseBody] = useState<unknown>(null);
  const [httpStatus, setHttpStatus] = useState<string>('未请求');

  useEffect(() => {
    let cancelled = false;
    async function loadInitialData() {
      setLoading(true);
      setFailure(null);
      try {
        const [metaResponse, appsResponse] = await Promise.all([
          fetch(buildUrl('/api/demo/page')),
          fetch(buildUrl('/api/demo/options/apps'))
        ]);
        const [meta, appList] = await Promise.all([
          readJson<PageMeta>(metaResponse),
          readJson<AppOption[]>(appsResponse)
        ]);
        if (cancelled) {
          return;
        }
        setPageMeta(meta);
        setApps(appList);
        const initialAppId = appList.some((item) => item.id === requestedAppId)
          ? requestedAppId
          : (meta.defaultAppId || appList[0]?.id || '');
        setSelectedAppId(initialAppId);
      } catch (error) {
        if (!cancelled) {
          setFailure({
            title: '初始化失败',
            detail: error instanceof Error ? error.message : '页面元数据或模块列表拉取失败。'
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitialData();
    return () => {
      cancelled = true;
    };
  }, [requestedAppId]);

  useEffect(() => {
    let cancelled = false;
    async function loadScenarios() {
      if (!selectedAppId) {
        setScenarios([]);
        setSelectedScenarioId('');
        return;
      }

      try {
        const response = await fetch(buildUrl(`/api/demo/options/scenarios?appId=${encodeURIComponent(selectedAppId)}`));
        const scenarioList = await readJson<ScenarioOption[]>(response);
        if (cancelled) {
          return;
        }
        setScenarios(scenarioList);
        const initialScenarioId = scenarioList.some((item) => item.id === requestedScenarioId)
          ? requestedScenarioId
          : (scenarioList[0]?.id || '');
        setSelectedScenarioId(initialScenarioId);
      } catch (error) {
        if (!cancelled) {
          setFailure({
            title: '场景列表加载失败',
            detail: error instanceof Error ? error.message : '无法从后端加载场景列表。'
          });
        }
      }
    }

    void loadScenarios();
    return () => {
      cancelled = true;
    };
  }, [requestedScenarioId, selectedAppId]);

  const selectedScenario = scenarios.find((item) => item.id === selectedScenarioId) ?? null;

  async function executeScenario() {
    if (!selectedAppId || !selectedScenarioId) {
      setFailure({
        title: '无法执行',
        detail: '请先选择模块和场景。'
      });
      return;
    }

    setRequesting(true);
    setFailure(null);
    setResponseBody(null);
    setHttpStatus('请求中');

    const controller = new AbortController();
    const timeoutHandle = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(buildUrl('/api/demo/run'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          appId: selectedAppId,
          scenarioId: selectedScenarioId
        }),
        signal: controller.signal
      });

      const body = await response.json();
      setHttpStatus(String(response.status));
      setResponseBody(body);

      if (!response.ok) {
        const message = typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`;
        setFailure({
          title: `后端返回错误 ${response.status}`,
          detail: message
        });
        return;
      }

      if (!isSuccessPayload(body)) {
        setFailure({
          title: '返回结构错误',
          detail: 'HTTP 200，但响应缺少 ok=true 或 data 字段。'
        });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setHttpStatus('timeout');
        setFailure({
          title: '客户端超时',
          detail: `请求超过 ${REQUEST_TIMEOUT_MS}ms，前端已主动取消。`
        });
      } else {
        setHttpStatus('network-error');
        setFailure({
          title: '请求失败',
          detail: error instanceof Error ? error.message : '未知网络错误。'
        });
      }
    } finally {
      window.clearTimeout(timeoutHandle);
      setRequesting(false);
    }
  }

  return (
    <main className="page-shell" data-testid="demo-app">
      <section className="hero-card">
        <div className="eyebrow">BrowserTrace Example</div>
        <h1>{pageMeta?.title ?? 'React + Spring Boot 最小示例'}</h1>
        <p className="subtitle">{pageMeta?.subtitle ?? '演示后端菜单加载、API 调用和常见错误。'}</p>

        <div className="grid">
          <label className="field">
            <span>上层模块菜单</span>
            <select
              data-testid="app-select"
              value={selectedAppId}
              onChange={(event) => setSelectedAppId(event.target.value)}
              disabled={loading || apps.length === 0}
            >
              {apps.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <small>{apps.find((item) => item.id === selectedAppId)?.description ?? '从后端拉取模块列表'}</small>
          </label>

          <label className="field">
            <span>下层场景菜单</span>
            <select
              data-testid="scenario-select"
              value={selectedScenarioId}
              onChange={(event) => setSelectedScenarioId(event.target.value)}
              disabled={loading || scenarios.length === 0}
            >
              {scenarios.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <small>{selectedScenario?.description ?? '从后端拉取场景列表'}</small>
          </label>
        </div>

        <div className="status-row">
          <span className="status-chip">API Base: {API_BASE_URL}</span>
          <span className="status-chip">HTTP: {httpStatus}</span>
          <span className="status-chip">预期: {selectedScenario?.expectedStatus ?? '未选择'}</span>
        </div>

        <button
          type="button"
          className="primary-button"
          data-testid="run-button"
          onClick={executeScenario}
          disabled={requesting || !selectedAppId || !selectedScenarioId}
        >
          {requesting ? '执行中...' : '调用后端 API'}
        </button>
      </section>

      <section className="result-card">
        <div className="result-header">
          <h2>调用结果</h2>
          {failure ? <span className="error-badge">{failure.title}</span> : <span className="success-badge">状态稳定</span>}
        </div>
        <p className="result-hint">
          预置场景包括 200 正确、400、404、500、客户端超时，以及 HTTP 200 但返回结构错误。
        </p>
        <pre data-testid="response-panel">{JSON.stringify(responseBody ?? { message: '点击按钮后查看结果。' }, null, 2)}</pre>
        {failure ? <p className="error-detail">{failure.detail}</p> : null}
      </section>
    </main>
  );
}

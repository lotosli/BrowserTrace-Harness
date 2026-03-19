# BrowserTrace React 示例使用说明

这个示例包含两个独立进程：

- Java 后端：[apps/demo-service](/Users/lotosli/Documents/BrowserTrace%20Harness/apps/demo-service)
- React 前端：[apps/demo-frontend](/Users/lotosli/Documents/BrowserTrace%20Harness/apps/demo-frontend)

后端提供两级下拉菜单数据和场景执行接口，前端负责加载菜单、发起 API 调用，并展示成功或常见错误。

## 场景说明

前端第二个下拉菜单会从后端拉取以下场景：

- `profile_ok`：HTTP 200，返回正确结构
- `servicegraph_ok`：HTTP 200，返回正确结构
- `bad_request`：HTTP 400
- `not_found`：HTTP 404
- `server_error`：HTTP 500
- `slow_timeout`：后端故意慢响应，前端 1200ms 后主动超时
- `bad_payload`：HTTP 200，但返回 JSON 结构错误

## 启动方式

1. 安装前端依赖

```bash
pnpm install
```

2. 启动 Java 后端

```bash
cd apps/demo-service
mvn spring-boot:run
```

默认地址是 `http://127.0.0.1:8083`。

3. 启动 React 前端

```bash
cd apps/demo-frontend
cp .env.example .env
pnpm dev
```

默认地址是 `http://127.0.0.1:5173`。

## 页面说明

页面包含：

- 上层下拉菜单：业务模块，来自 `GET /api/demo/options/apps`
- 下层下拉菜单：场景列表，来自 `GET /api/demo/options/scenarios?appId=...`
- 执行按钮：调用 `POST /api/demo/run`
- 结果面板：展示成功返回、HTTP 错误、客户端超时、200 结构错误

也支持通过 URL 预选场景，便于 CLI 自动化：

- 成功场景：
  - `http://127.0.0.1:5173/?appId=orders&scenarioId=profile_ok`
- 500 场景：
  - `http://127.0.0.1:5173/?appId=orders&scenarioId=server_error`
- 结构错误场景：
  - `http://127.0.0.1:5173/?appId=orders&scenarioId=bad_payload`

## 用 BrowserTrace CLI 调试

先启动带 CDP 的 Chrome：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/browsertrace-demo-chrome \
  --no-first-run \
  --no-default-browser-check \
  "http://127.0.0.1:5173/?appId=orders&scenarioId=profile_ok"
```

然后执行 CLI：

1. 健康检查

```bash
node packages/browsertrace/dist/cli/main.js doctor \
  --config ./config.example.yaml \
  --json
```

2. 直接调用后端 API 并输出本地 trace JSONL

```bash
node packages/browsertrace/dist/cli/main.js debug call-api \
  --config ./config.example.yaml \
  --app-name demo-react \
  --url "http://127.0.0.1:8083/api/demo/options/apps" \
  --trace-output jsonl \
  --json
```

3. 通过 CDP 绑定当前 Chrome 页面

```bash
node packages/browsertrace/dist/cli/main.js session ensure \
  --config ./config.example.yaml \
  --app-name demo-react \
  --url "http://127.0.0.1:5173/?appId=orders&scenarioId=profile_ok" \
  --trace-output jsonl \
  --json
```

4. 让影子浏览器点击页面按钮，触发真实前端请求

```bash
node packages/browsertrace/dist/cli/main.js browser click \
  --config ./config.example.yaml \
  --app-name demo-react \
  --session-id <上一步的 session_id> \
  --selector "[data-testid='run-button']" \
  --trace-output jsonl \
  --json
```

## 重点产物

CLI 跑完后，可以重点看这些产物目录：

- `attach/pages.json`：CDP 发现的页面列表
- `attach/match-result.json`：命中的页面
- `bundle/extract-summary.json`：提取到的 Cookie 和 Storage 摘要
- `shadow/propagation.json`：注入到页面的 `traceparent` 和 `baggage`
- `runtime/network.json`：浏览器动作期间的网络记录
- `runtime/console.json`：页面 console 输出
- `correlation/request-trace-map.json`：请求到 trace 的映射
- `trace-events.jsonl`：本地 JSONL trace 文件

如果你要把结果直接喂给大模型，优先看下面这些新产物：

- `runtime/ai-summary.json`：AI 友好的单文件摘要，直接给出 `outcome.category`、失败原因、根请求、页面错误标题、trace 信息
- `runtime/page-state.json`：点击后页面状态快照，包含 `data-testid` 元素、下拉框选中值、HTTP 状态 chip、错误文案、响应面板 JSON
- `runtime/action-network-detailed.json`：只保留这次动作触发的请求，避免初始化流量干扰
- `runtime/action-console-detailed.json`：只保留这次动作窗口内的 console 错误
- `runtime/page.html`：点击后的完整页面 HTML
- `runtime/post-action.png`：点击后的页面截图
- `correlation/tempo-trace.json`：自动拉取到的 Tempo trace
- `correlation/loki-trace-logs.json`：自动拉取到的 Loki 日志

推荐排查顺序：

1. 先看 `runtime/ai-summary.json`
2. 再看 `runtime/action-network-detailed.json`
3. 然后看 `runtime/page-state.json`
4. 需要时再下钻 `correlation/tempo-trace.json` 和 `correlation/loki-trace-logs.json`

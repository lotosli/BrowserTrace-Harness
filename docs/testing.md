# Testing Guide

## Scenario matrix

The React demo pulls both dropdowns from the Java backend and exposes these scenarios:

- `profile_ok`: `200`, valid payload
- `servicegraph_ok`: `200`, valid payload with backend method spans
- `bad_request`: `400`
- `not_found`: `404`
- `server_error`: `500`
- `slow_timeout`: frontend aborts after timeout
- `bad_payload`: `200`, invalid response shape

The scenario definitions live in `apps/demo-service/src/main/java/com/browsertrace/demo/service/DemoScenarioService.java`.

## Local stack

Start the observability stack:

```bash
docker compose -f ops/docker-compose.yaml up -d
```

Start the demo backend and frontend:

```bash
cd apps/demo-service && java -jar target/demo-service-0.1.0.jar
cd apps/demo-frontend && pnpm dev
```

If you want method-level Java spans, start the backend through the CLI:

```bash
node packages/browsertrace/dist/cli/main.js java-debug run \
  --config config.example.yaml \
  --classes-dir apps/demo-service/target/classes \
  --app-jar apps/demo-service/target/demo-service-0.1.0.jar \
  --service-name demo-service \
  --module demo-service-agent \
  --base-package com.browsertrace.demo \
  --java-agent ~/.browsertrace/java-debug/agents/opentelemetry-javaagent.jar \
  --profile-dir ~/.browsertrace/java-debug/profiles/demo-service-agent \
  --cwd apps/demo-service \
  --json
```

## Sample browser tests

### 400

```bash
node packages/browsertrace/dist/cli/main.js browser click \
  --config config.example.yaml \
  --app-name demo-react \
  --session-id demo-react-bad-request-5174 \
  --selector "[data-testid='run-button']" \
  --trace-output jsonl \
  --json
```

### 500

```bash
node packages/browsertrace/dist/cli/main.js browser click \
  --config config.example.yaml \
  --app-name demo-react \
  --session-id demo-react-server-error-5174 \
  --selector "[data-testid='run-button']" \
  --trace-output jsonl \
  --json
```

### Invalid 200 payload

```bash
node packages/browsertrace/dist/cli/main.js browser click \
  --config config.example.yaml \
  --app-name demo-react \
  --session-id demo-react-bad-payload-5174 \
  --selector "[data-testid='run-button']" \
  --trace-output jsonl \
  --json
```

## What to inspect

For AI-assisted debugging, inspect files in this order:

1. `runtime/ai-summary.json`
2. `runtime/action-network-detailed.json`
3. `runtime/page-state.json`
4. `runtime/action-console-detailed.json`
5. `correlation/tempo-trace.json`
6. `correlation/loki-trace-logs.json`

## Expected interpretation

`ai-summary.json` should be enough to classify:

- `http_error`
- `invalid_response_shape`
- `client_timeout`
- `network_error`
- `success`

It also records:

- selected app and scenario
- expected vs observed HTTP status
- root request URL and response body
- UI failure title and detail
- trace identifiers and linked trace/log artifacts

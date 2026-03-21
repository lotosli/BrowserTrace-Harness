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

Build the demo backend:

```bash
mvn -f apps/demo-service/pom.xml package
```

You can either start backend/frontend manually or let the V2 specs do it for you.

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

## Sample V2 runs

### One-shot success run

```bash
node packages/browsertrace/dist/cli/main.js run \
  docs/examples/v2/demo-profile-ok.yaml \
  --config config.example.yaml \
  --json
```

### One-shot failure run

```bash
node packages/browsertrace/dist/cli/main.js run \
  docs/examples/v2/demo-server-error.yaml \
  --config config.example.yaml \
  --json
```

### Persistent session through-step run

```bash
node packages/browsertrace/dist/cli/main.js run-session start \
  docs/examples/v2/demo-profile-ok.yaml \
  --session-id demo-v2 \
  --config config.example.yaml \
  --json
```

```bash
node packages/browsertrace/dist/cli/main.js run-session resume \
  demo-v2 \
  --through-step select-scenario \
  --config config.example.yaml \
  --json
```

```bash
node packages/browsertrace/dist/cli/main.js run-session judge \
  demo-v2 \
  --config config.example.yaml \
  --json
```

## What to inspect

For AI-assisted debugging, inspect outputs in this order:

1. `verdict`
2. `diagnosis`
3. `runtime/page-state.json`
4. `runtime/action-network-detailed.json`
5. `correlation/tempo-trace.json`
6. `correlation/loki-trace-logs.json`

Repository examples are available under `docs/examples/ai-debug-runs/`.

## Expected interpretation

The V2 JSON outputs should be enough to classify:

- `http_error`
- `invalid_response_shape`
- `client_timeout`
- `network_error`
- `success`

They also record:

- selected app and scenario
- expected vs observed HTTP status
- root request URL and response body
- UI failure title and detail
- trace identifiers and linked trace/log artifacts
- session-level tainting failures for persistent runs

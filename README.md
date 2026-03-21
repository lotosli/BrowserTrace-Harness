# BrowserTrace Harness

BrowserTrace is an agent-native CLI for running full-stack browser scenarios, propagating W3C trace context, and correlating frontend behavior with backend traces, logs, screenshots, and DOM state.

## What is in this repo

- `packages/browsertrace`: the TypeScript CLI
- `apps/demo-service`: a Spring Boot demo backend
- `apps/demo-frontend`: a React demo frontend
- `ops`: a local Tempo + Loki + Collector + Promtail stack

## Core workflow

1. Define a scenario spec in YAML or JSON
2. Let `browsertrace run` or `browsertrace run-session` start the target services
3. Execute browser steps through the internal `browser-use` backend
4. Inject `traceparent` and `baggage` into frontend requests
5. Pull correlated traces and logs from Tempo and Loki
6. Return machine-readable `verdict`, `diagnosis`, and `artifacts`

## AI-friendly runtime output

Each browser run writes a compact debugging bundle under `~/.browsertrace/artifacts/<run-id>/runtime`, including:

- `ai-summary.json`: top-level conclusion for the run
- `page-state.json`: UI state after the action
- `action-network-detailed.json`: only the requests triggered by the action
- `action-console-detailed.json`: only the console output from the action window
- `page.html`: final DOM snapshot
- `post-action.png`: final screenshot

## Quick start

```bash
pnpm install
pnpm build
cd apps/demo-service && mvn package
docker compose -f ops/docker-compose.yaml up -d
```

`browsertrace run` and `run-session start` can also start the demo apps directly from the provided V2 specs.

## Useful commands

- `browsertrace run specs/example.yaml --json`
- `browsertrace run-session start specs/example.yaml --json`
- `browsertrace run-session resume <session-id> --json`
- `browsertrace run-session resume <session-id> --through-step <id> --json`
- `browsertrace run-session judge <session-id> --json`
- `browsertrace run-session status <session-id> --json`
- `browsertrace run-session stop <session-id> --json`
- `browsertrace step execute specs/example.yaml --step-id click-run --mode prefix --json`
- `browsertrace judge <run-id> --json`
- `browsertrace diagnose <run-id> --json`
- `browsertrace doctor`
- `browsertrace debug call-api`
- `browsertrace java-debug scan-methods|gen-profile|run`
- `browsertrace trace lookup|grep-logs`

## Agent-native V2 flow

The preferred V2 entrypoints are `browsertrace run <spec> --json` and `browsertrace run-session ... --json`.

- The agent starts or lets `browsertrace` start the target services
- `browsertrace` uses the internal `browser-use` backend to drive the browser
- the harness injects trace context into frontend requests
- the harness correlates Tempo and Loki results back into one run report

For agent loops that need finer control:

- `browsertrace step execute <spec> --step-id <id> --mode prefix --json`
- `browsertrace judge <run-id> --json`
- `browsertrace diagnose <run-id> --json`

For persistent step-by-step sessions:

- `browsertrace run-session start <spec> --json`
- `browsertrace run-session resume <session-id> --json`
- `browsertrace run-session resume <session-id> --step-id <id> --json`
- `browsertrace run-session resume <session-id> --through-step <id> --json`
- `browsertrace run-session judge <session-id> --json`
- `browsertrace run-session status <session-id> --json`
- `browsertrace run-session stop <session-id> --json`

This mode keeps browser and service state alive across commands so an agent can:

1. start one session
2. inspect status and history
3. resume one step at a time or advance through a target step range
4. compute a session-level scenario verdict from accumulated history
5. diagnose individual step runs
6. stop the session when finished

The recommended split is:

- `run`: one-shot scenario execution and diagnosis
- `run-session`: persistent, stepwise execution for iterative coding/debugging loops
- `judge`: recompute a single run verdict from stored artifacts
- `run-session judge`: compute a scenario verdict from accumulated session history

Sample V2 specs live at:

- `docs/examples/v2/demo-profile-ok.yaml`
- `docs/examples/v2/demo-server-error.yaml`

## Release builds

Build standalone CLI binaries:

```bash
pnpm build:release
```

Artifacts are written to `packages/browsertrace/releases`.

## Docs

- [Architecture](docs/architecture.md)
- [Testing Guide](docs/testing.md)
- [Latest Local Test Results](docs/test-results.md)
- [AI Debug Run Samples](docs/examples/ai-debug-runs/README.md)
- [New Java Project Onboarding](docs/java-project-onboarding.md)
- [LLM Guide for Unfamiliar Java Codebases](docs/llm-unfamiliar-java-codebase.md)
- [Chinese Demo Guide](docs/demo-react-usage.zh-CN.md)

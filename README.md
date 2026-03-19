# BrowserTrace Harness

BrowserTrace is a local CLI for replaying browser flows in a shadow headless browser, propagating W3C trace context, and correlating frontend requests with Java traces and logs.

## What is in this repo

- `packages/browsertrace`: the TypeScript CLI
- `apps/demo-service`: a Spring Boot demo backend
- `apps/demo-frontend`: a React demo frontend
- `ops`: a local Tempo + Loki + Collector + Promtail stack

## Core workflow

1. Attach to a real Chrome tab with `session ensure`
2. Recreate the session in a fresh headless browser with `browser goto|click|fill|wait|screenshot`
3. Export traces to OTLP, JSONL, or both
4. Pull correlated traces and logs from Tempo and Loki

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

Then start the demo apps:

```bash
cd apps/demo-service && java -jar target/demo-service-0.1.0.jar
cd apps/demo-frontend && pnpm dev
```

## Useful commands

- `browsertrace doctor`
- `browsertrace session ensure`
- `browsertrace browser click`
- `browsertrace debug call-api`
- `browsertrace java-debug scan-methods|gen-profile|run`
- `browsertrace trace lookup|grep-logs`

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

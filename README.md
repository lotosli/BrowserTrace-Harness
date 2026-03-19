# BrowserTrace Harness

`browsertrace` is a local CLI for shadow-headless browser debugging, W3C trace propagation, Java OTel debug setup, and trace/log correlation.

## Workspace

- `packages/browsertrace`: TypeScript CLI implementation
- `apps/demo-service`: Spring Boot demo app for end-to-end verification
- `apps/demo-frontend`: React demo UI for dropdowns, API calls, and error scenarios
- `ops`: local observability stack examples for Tempo, Loki, Promtail, and the OTel Collector

## Quick Start

1. Install dependencies: `pnpm install`
2. Copy the example config to `~/.browsertrace/config.yaml`
3. Build the CLI: `pnpm build`
4. Build the demo app: `cd apps/demo-service && mvn package`
5. Start the React demo: `cd apps/demo-frontend && pnpm dev`

## Release Builds

Build standalone CLI binaries for the supported OS and CPU targets:

- `pnpm build:release`

Artifacts are written to `packages/browsertrace/releases`:

- `browsertrace-darwin-arm64`
- `browsertrace-darwin-x64`
- `browsertrace-linux-arm64`
- `browsertrace-linux-x64`
- `browsertrace-win-arm64.exe`
- `browsertrace-win-x64.exe`

## CLI Highlights

- `browsertrace session ensure`
- `browsertrace browser goto|click|fill|wait|screenshot`
- `browsertrace debug call-api`
- `browsertrace java-debug scan-methods|gen-profile|run`
- `browsertrace trace lookup|grep-logs`
- `browsertrace doctor`

## Trace Output

Every root-run command supports:

- `--trace-output otlp|jsonl|both`
- `--trace-output-path /path/to/file.jsonl`

When `jsonl` output is enabled, spans are written as one JSON object per line either under the run artifact directory or to the explicit output path.

## Local Stack

The `ops/docker-compose.yaml` file provides a reference local stack:

- Tempo for traces
- Loki for logs
- Promtail to ingest demo-service logs
- OpenTelemetry Collector to receive OTLP traces

## Chinese Demo Guide

See [docs/demo-react-usage.zh-CN.md](/Users/lotosli/Documents/BrowserTrace%20Harness/docs/demo-react-usage.zh-CN.md) for the Java + React example and BrowserTrace CLI walkthrough in Chinese.

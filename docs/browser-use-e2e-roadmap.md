# Browser-Use E2E Roadmap

Preferred direction note:
if a full rewrite is acceptable, read `docs/clean-slate-browser-use-architecture.md` first.
This roadmap is the lower-risk incremental path.

## Goal

Turn BrowserTrace into a full-stack E2E harness that:

- drives the browser with `browser-use`
- injects and correlates OpenTelemetry trace context across frontend and backend
- captures runtime artifacts for debugging
- judges runs with UI, API, trace, and log oracles

The browser control layer should stop being the product moat. The moat should be:

- trace-aware execution
- full-stack failure diagnosis
- regression detection from runtime evidence

## Why This Direction

The repository already has the valuable parts of the loop:

- trace context generation and propagation
- runtime artifact writing
- Tempo and Loki correlation
- session extraction and rehydration

What it does not need to keep owning end-to-end is the browser interaction substrate.

`browser-use` now provides a practical execution layer for browser actions, session reuse,
real browser connectivity, and agent-side observability. That makes it a good fit as the
execution engine while BrowserTrace remains the observability and diagnosis layer.

## Research Signals

Recent work from `2025-12-21` to `2026-03-21` supports the direction, even though no paper
was found that already combines browser-agent E2E, frontend-backend distributed tracing, and
automatic root-cause analysis in one system.

- `WebTestPilot` (`2026-02-12`): browser E2E should infer preconditions and postconditions,
  not only replay actions.
- `SpecOps` (`2026-03-10`): separate planning, environment setup, execution, and validation.
- `Automated structural testing of LLM-based agents` (`2026-01-25`): traces are a first-class
  testing artifact; OpenTelemetry fits naturally in the loop.
- `AgentAssay` (`2026-03-03`): regression testing should compare execution traces and not rely
  on simple pass/fail alone.
- `AgentTrace` (`2026-02-07`) and `TraceSIR` (`2026-02-28`): structured traces should feed
  automated diagnosis and reporting.

## Proposed System

### 1. Spec Plane

Input should evolve from raw CLI arguments into a structured test spec:

- scenario metadata
- step list
- selectors or stable identifiers
- expected UI state
- expected API behavior
- expected trace invariants
- expected log constraints

Natural-language scenarios can still be supported, but the execution path should normalize them
into a stable internal representation.

### 2. Execution Plane

Use `browser-use` as the browser executor.

Recommended mode for the first milestone:

- BrowserTrace owns the browser lifecycle and CDP endpoint
- `browser-use` connects to that browser through `--cdp-url`
- BrowserTrace connects to the same CDP endpoint as an observer

This avoids depending on internal `browser-use` daemon state while preserving:

- real browser/profile reuse
- deterministic action execution
- shared visibility over the same browsing session

### 3. Telemetry Plane

BrowserTrace should continue to own trace propagation and evidence collection.

Responsibilities:

- inject `traceparent` and `baggage` into same-origin or allowlisted requests
- record action-scoped network activity
- record console output and page exceptions
- capture DOM, page state, and screenshots
- query Tempo and Loki with the resulting `trace_id`

This plane should be independent from the executor implementation.

### 4. Validation Plane

Each step should produce a verdict from four oracles:

- UI oracle: expected visible state
- API oracle: expected response or contract
- trace oracle: expected spans, statuses, service hops, timing bounds
- log oracle: expected absence or presence of backend errors

The final test verdict should not depend on UI evidence alone.

### 5. Reporting Plane

Every run should emit:

- raw evidence
- a structured summary
- a root-cause hint
- regression deltas against the last known-good baseline

This is where trace-driven diagnosis becomes user-visible product value.

## Current Repository Mapping

### Keep

- `src/cli/run-context.ts`
- `src/trace/*`
- `src/artifacts/*`
- `src/runtime/ai-debug-artifacts.ts`
- `src/trace/trace-query.ts`
- `src/trace/log-query.ts`

### Refactor

- `src/browser/playwright-adapter.ts`
  into an executor abstraction
- `src/runtime/step-runner.ts`
  so browser actions do not depend directly on Playwright APIs
- `src/session/shadow-bootstrapper.ts`
  into:
  - session materialization
  - runtime observation
  - propagation installation

### Add

- `src/browser/browser-driver.ts`
  common executor interface
- `src/browser/browser-use-cli-driver.ts`
  wraps `browser-use` CLI or daemon access
- `src/browser/cdp-observer.ts`
  action-scoped network, console, exception capture
- `src/trace/trace-bridge.ts`
  installs propagation and run/step metadata into the browser session
- `src/testing/test-spec.ts`
  internal representation of E2E scenarios
- `src/testing/oracles.ts`
  UI, API, trace, and log validation

## Recommended Milestones

### Milestone 1: Swap the Executor, Keep the Evidence Model

Objective:

- keep existing artifact and trace flow intact
- replace only the browser action executor

Scope:

- add driver abstraction
- implement a `browser-use` driver using `--cdp-url`
- preserve current artifact paths and JSON outputs

Success criteria:

- `browser goto/click/fill/wait/screenshot` still work
- existing Tempo/Loki correlation remains unchanged
- one action yields the same trace and artifact bundle shape as today

### Milestone 2: Introduce Trace-Aware Test Specs

Objective:

- move from imperative CLI steps to scenario-based E2E specs

Scope:

- add YAML or JSON spec format
- allow per-step assertions and per-scenario trace invariants

Examples:

- no backend `error` logs after submit
- no span with status `ERROR`
- root API span under `2s`
- specific service hop exists

### Milestone 3: Add Regression Fingerprints

Objective:

- detect drift even when the page still appears to work

Scope:

- baseline network shape
- baseline span counts or service graph
- baseline log signatures
- baseline DOM markers

This milestone should follow the `AgentAssay` style of trace-first regression analysis.

### Milestone 4: Add Automatic Failure Reports

Objective:

- produce structured, high-signal failure summaries

Scope:

- root request detection
- likely failing backend span
- linked console or exception evidence
- linked Tempo and Loki artifacts
- likely root cause category

## Key Risks

### Agent Trace vs App Trace

`browser-use` observability traces describe agent and browser actions.
BrowserTrace traces describe the application under test.
These are different trace spaces and should be explicitly linked by:

- `run_id`
- `step_id`
- `session_id`
- `trace_id`

Do not assume they will share a trace tree automatically.

### Session Storage Gap

The current BrowserTrace session bundle captures:

- cookies
- local storage
- session storage

When reusing browser profiles or generic storage-state formats, session storage may not be
preserved. This matters for authenticated apps that rely on it.

### Element Identity Drift

`browser-use` state views can expose numbered elements, but test specs should prefer stable:

- `data-testid`
- role + accessible name
- explicit selectors only as fallback

### Verdict Bias Toward UI

A visually successful page can still hide backend errors. The test harness should fail runs on:

- backend `5xx`
- error spans
- explicit backend error logs
- contract mismatches

even if the browser interaction itself succeeded.

## Immediate Next Step

The first implementation step should be:

1. introduce a browser driver abstraction
2. move Playwright behind that abstraction without behavior changes
3. add a `browser-use` driver that connects through CDP
4. keep the current artifact and trace pipeline unchanged

That sequence minimizes risk while preserving the current debugging value of the repository.

## References

- WebTestPilot: https://arxiv.org/abs/2602.11724
- SpecOps: https://arxiv.org/abs/2603.10268
- Automated structural testing of LLM-based agents: https://arxiv.org/abs/2601.18827
- AgentAssay: https://arxiv.org/abs/2603.02601
- AgentTrace: https://arxiv.org/abs/2602.10133
- TraceSIR: https://arxiv.org/abs/2603.00623
- TDAD: https://arxiv.org/abs/2603.17973
- Testing with AI Agents: https://arxiv.org/abs/2603.13724
- Browser Use real browser: https://docs.browser-use.com/open-source/customize/browser/real-browser
- Browser Use authentication: https://docs.browser-use.com/open-source/customize/browser/authentication
- Browser Use browser infrastructure: https://docs.browser-use.com/cloud/guides/browser-api
- Browser Use OpenLIT: https://docs.browser-use.com/open-source/development/monitoring/openlit
- Browser Use observability: https://docs.browser-use.com/open-source/development/monitoring/observability

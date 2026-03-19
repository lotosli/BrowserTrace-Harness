# BrowserTrace Best Practices for a New Java Project

This guide describes the recommended onboarding flow for a new Java-based project that wants to use BrowserTrace for targeted browser replay, trace propagation, and Java method-level debugging.

BrowserTrace is most effective when you treat it as a trace-aware debugging harness, not as a full autonomous test platform. The current model is:

1. Open the real page in Chrome and sign in manually if needed.
2. Capture the active session with `browsertrace session ensure`.
3. Replay a small set of high-value actions in a headless shadow browser.
4. Correlate frontend requests with Java traces, Java method spans, logs, and AI-friendly runtime artifacts.

## What BrowserTrace Is Good At

- Reproducing a known user flow with the same browser session state.
- Injecting `traceparent`, `tracestate`, and `baggage` into browser requests.
- Connecting frontend requests to Java traces and logs.
- Producing a compact debugging bundle that an engineer or an LLM can inspect.

## What BrowserTrace Is Not

- It does not discover your full UI automatically.
- It does not infer your business-critical scenarios by reading arbitrary code.
- It does not replace a full regression suite.

The best onboarding strategy is to start with one or two important flows and make them clean, observable, and repeatable.

## Recommended Project Conventions

Before you wire BrowserTrace into a new Java project, standardize a few things.

### Frontend

Add stable `data-testid` attributes to every important control and result surface:

- page shell
- primary form fields
- submit buttons
- result panel
- error banner
- success badge

Example IDs for an order search page:

- `order-type-select`
- `order-id-input`
- `search-button`
- `result-panel`
- `error-banner`

These IDs should be stable across refactors. BrowserTrace and downstream LLM workflows should target these semantic IDs instead of CSS classes or layout selectors.

### Java Backend

Expose a predictable API contract:

- stable endpoint paths
- predictable success shape
- predictable error shape
- clear HTTP status codes

Recommended error response fields:

- `status`
- `error`
- `message`
- `path`
- `timestamp`

### Observability

For the best results:

- export traces to OTLP
- include `trace_id` in logs
- keep service names stable
- compile classes locally so BrowserTrace can scan methods

## Minimum Assumptions

This guide assumes:

- your backend is a Java application packaged as a JAR
- compiled classes are available under a directory such as `target/classes`
- your frontend runs in Chrome or Chromium
- Chrome can be started with a CDP endpoint
- you can run the BrowserTrace CLI locally

## Suggested Onboarding Sequence

Use one high-value flow first. For example:

- Page: `http://localhost:3000/orders`
- Backend API: `POST /api/orders/query`
- Goal: search for an order and inspect success, `400`, `404`, `500`, or timeout behavior

Do not start with full coverage. Start with a single flow that crosses frontend, HTTP, and Java logic.

## Step 1: Add Observable UI Semantics

Assume a page with:

- a dropdown for order type
- an input for order ID
- a search button
- a result panel
- an error banner

Make the important nodes machine-addressable:

```tsx
<select data-testid="order-type-select" />
<input data-testid="order-id-input" />
<button data-testid="search-button">Search</button>
<pre data-testid="result-panel" />
<div data-testid="error-banner" />
```

This is the minimum UI contract BrowserTrace needs for stable replay and post-action inspection.

## Step 2: Start Chrome with CDP Enabled

BrowserTrace needs a real tab for session capture. Start Chrome or Chromium with remote debugging enabled.

Example:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222
```

Then open your target page in that browser and log in manually if the flow requires authentication.

## Step 3: Create a BrowserTrace Config

Create a local config file such as `config.browsertrace.yaml`.

Example:

```yaml
chrome:
  cdp_url: http://127.0.0.1:9222

artifacts:
  base_dir: ~/.browsertrace/artifacts

otel:
  endpoint: http://127.0.0.1:4318/v1/traces
  service_name: browsertrace

trace:
  output_default: both

lookup:
  tempo:
    base_url: http://127.0.0.1:3200
  loki:
    base_url: http://127.0.0.1:3100
    query_labels:
      service_name: my-java-service

apps:
  orders-ui:
    allow_api_origins:
      - http://127.0.0.1:8080
    validation:
      page_selector: "[data-testid='search-button']"
      api_url: http://127.0.0.1:8080/api/orders/query
      critical_api_patterns:
        - /api/orders/query

java_debug:
  java_agent: ~/.browsertrace/java-debug/agents/opentelemetry-javaagent.jar
  default_profile_dir: ~/.browsertrace/java-debug/profiles
  log_format: json
```

## Step 4: Build the Java Project

BrowserTrace Java scanning needs compiled classes.

For a Maven project:

```bash
mvn package
```

At this point you should have both:

- an application JAR such as `target/my-service.jar`
- compiled classes such as `target/classes`

## Step 5: Use Java Method Scanning First

Before launching the service with the Java agent, scan candidate methods.

Example:

```bash
browsertrace java-debug scan-methods \
  --config config.browsertrace.yaml \
  --classes-dir target/classes \
  --base-package com.example.orders \
  --json
```

This is important. It lets BrowserTrace discover methods that are worth instrumenting for method-level spans without forcing you to hand-maintain a method list.

Use the scan output to confirm:

- your base package is correct
- the expected controllers and services are included
- framework noise is excluded

## Step 6: Generate a Java Debug Profile

Once method scanning looks correct, generate a profile.

Example:

```bash
browsertrace java-debug gen-profile \
  --config config.browsertrace.yaml \
  --classes-dir target/classes \
  --service-name orders-service \
  --base-package com.example.orders \
  --profile-dir .browsertrace/java-profile \
  --json
```

This produces the files BrowserTrace needs for Java-side debugging, including:

- included methods
- agent configuration
- logback configuration for JSON logs

## Step 7: Launch the Java Service Through BrowserTrace

If you want method-level spans, launch the service through BrowserTrace instead of running `java -jar` directly.

Example:

```bash
browsertrace java-debug run \
  --config config.browsertrace.yaml \
  --classes-dir target/classes \
  --app-jar target/my-service.jar \
  --service-name orders-service \
  --module orders-service-debug \
  --base-package com.example.orders \
  --cwd . \
  --json
```

This is the recommended path because it combines:

- Java agent wiring
- generated debug profile
- method include rules from `scan-methods`
- JSON log setup

## Step 8: Capture the Real Browser Session

With the page open in Chrome and the Java service running, capture the active session.

Example:

```bash
browsertrace session ensure \
  --config config.browsertrace.yaml \
  --app-name orders-ui \
  --url http://127.0.0.1:3000/orders \
  --session-id orders-ui-main \
  --json
```

This stores the session bundle that later `browser` commands will reuse in a headless shadow browser.

## Step 9: Replay a Small Set of High-Value Actions

Do not start with exhaustive coverage. Start with the main happy path and one or two failure modes.

Example:

```bash
browsertrace browser fill \
  --config config.browsertrace.yaml \
  --app-name orders-ui \
  --session-id orders-ui-main \
  --selector "[data-testid='order-id-input']" \
  --value ORD-1001 \
  --trace-output both \
  --json
```

```bash
browsertrace browser click \
  --config config.browsertrace.yaml \
  --app-name orders-ui \
  --session-id orders-ui-main \
  --selector "[data-testid='search-button']" \
  --trace-output both \
  --json
```

Useful action set:

- `goto`
- `fill`
- `click`
- `wait`
- `screenshot`

## Step 10: Inspect the AI-Friendly Runtime Bundle

After each browser action, inspect artifacts under `~/.browsertrace/artifacts/<run-id>/runtime`.

Recommended reading order:

1. `ai-summary.json`
2. `page-state.json`
3. `action-network-detailed.json`
4. `action-console-detailed.json`
5. `page.html`
6. `post-action.png`

These files let both engineers and LLMs answer:

- Which request failed?
- Was it an HTTP error, timeout, shape mismatch, or UI issue?
- What did the page show after the action?
- Which trace ID should be followed downstream?

## Step 11: Pull Trace and Log Correlation

Once you have a trace ID, query the observability backends.

Example:

```bash
browsertrace trace lookup \
  --config config.browsertrace.yaml \
  --trace-id <trace-id> \
  --json
```

```bash
browsertrace trace grep-logs \
  --config config.browsertrace.yaml \
  --trace-id <trace-id> \
  --json
```

This is where BrowserTrace becomes much more useful than a normal UI script: the browser request, Java trace, Java method spans, and logs all point to the same execution.

## Step 12: Recommended First Test Matrix

For a new project, do not try to automate every combination on day one.

Start with:

- 1 happy path
- 1 validation error such as `400`
- 1 missing resource case such as `404`
- 1 backend failure such as `500`
- 1 timeout or slow-path case

That is enough to validate:

- session hydration
- trace propagation
- Java method scanning
- Java agent wiring
- trace and log lookup
- AI-friendly runtime output

## Best Practices Summary

- Start with one page and one critical flow.
- Add stable `data-testid` values before attempting replay.
- Use `java-debug scan-methods` before `gen-profile` or `run`.
- Launch the Java app through `browsertrace java-debug run` for method-level spans.
- Treat BrowserTrace as targeted replay plus observability, not as whole-site autonomous testing.
- Keep your success and error API shapes stable.
- Prefer a small, high-value scenario set before expanding coverage.

## A Practical First Milestone

Your first successful onboarding should prove all of the following:

- BrowserTrace can attach to a real logged-in page.
- A shadow browser can replay a meaningful user action.
- The action triggers a traced backend request.
- Java method spans appear for your own service code.
- The runtime bundle clearly explains the outcome.

Once that is stable, you can add higher-level spec-driven generation and broader scenario coverage.

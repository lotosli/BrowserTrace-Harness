# How an LLM Should Use BrowserTrace in an Unfamiliar Java Codebase

This guide describes the right operating model for an LLM that is dropped into a Java codebase it did not write.

The goal is not to brute-force every page or every parameter combination. The goal is to:

1. discover the smallest useful set of flows
2. replay one targeted action at a time
3. connect browser behavior to Java traces, Java methods, and logs

## Start with Discovery, Not Execution

An unfamiliar codebase usually does not tell you directly:

- which pages matter most
- which APIs are critical
- which selectors are stable
- which Java methods are important
- which error cases are intentional

Before running BrowserTrace, the LLM should discover:

- main frontend routes
- user-visible buttons, forms, and result areas
- key backend endpoints
- Java base packages and service modules
- the compiled classes directory

## Build a Minimal Flow Map

Do not try to enumerate the entire application.

For each important page, identify only:

- entry URL
- one primary user action
- one success signal
- one or two representative failure signals
- the backend endpoint that action is expected to hit

Example:

- page: `/orders`
- action: click `Search`
- success: result panel shows order payload
- failure: error banner or `400/404/500`
- backend endpoint: `POST /api/orders/query`

That is enough to start.

## Selector Strategy

Prefer selectors in this order:

1. `data-testid`
2. stable `id`
3. stable `name`
4. `aria-label`
5. stable button text or nearby label text

Do not depend on fragile layout selectors unless nothing else exists.

## Java Strategy

For a Java service, the LLM should not guess the method list manually.

Use BrowserTrace's scanning flow:

1. compile the project
2. run `browsertrace java-debug scan-methods`
3. verify the detected package scope
4. run `browsertrace java-debug gen-profile`
5. run `browsertrace java-debug run`

This turns unfamiliar code into a method-level trace surface without requiring hand-curated instrumentation.

## Recommended Execution Order

### 1. Make sure the Java project is built

Typical Maven flow:

```bash
mvn package
```

### 2. Scan methods

```bash
browsertrace java-debug scan-methods \
  --config config.browsertrace.yaml \
  --classes-dir target/classes \
  --base-package com.example \
  --json
```

### 3. Launch the Java service with BrowserTrace

```bash
browsertrace java-debug run \
  --config config.browsertrace.yaml \
  --classes-dir target/classes \
  --app-jar target/my-service.jar \
  --service-name my-service \
  --module my-service-debug \
  --base-package com.example \
  --cwd . \
  --json
```

### 4. Capture the real browser session

The LLM should assume a human has already opened the page and signed in if needed.

```bash
browsertrace session ensure \
  --config config.browsertrace.yaml \
  --app-name my-ui \
  --url http://127.0.0.1:3000/orders \
  --session-id my-ui-main \
  --json
```

### 5. Replay one action

```bash
browsertrace browser click \
  --config config.browsertrace.yaml \
  --app-name my-ui \
  --session-id my-ui-main \
  --selector "#search-button" \
  --trace-output both \
  --json
```

## How to Read the Result

The LLM should read artifacts in this order:

1. `runtime/ai-summary.json`
2. `runtime/page-state.json`
3. `runtime/action-network-detailed.json`
4. `runtime/action-console-detailed.json`
5. Tempo trace output
6. Loki log output

This order answers:

- what action was taken
- what request it triggered
- whether the page reported success, error, timeout, or schema mismatch
- which trace ID should be followed into Java
- which Java methods were executed

## Do Not Brute-Force the UI

An LLM should not click every button or try every dropdown combination in an unfamiliar system.

Instead:

- start with one happy path
- add one validation error
- add one missing-resource case
- add one backend-failure case
- add one timeout case if relevant

This small matrix is enough to validate propagation, runtime output, and Java trace correlation.

## Decision Rule

If the LLM does not know what to test next, it should not guess randomly.

It should first answer:

- which page is business-critical
- which user action is primary
- which backend endpoint that action should hit
- what success looks like
- what one representative failure looks like

Only after that should it run BrowserTrace.

import type { BaggageHeaderMap } from './baggage.js';

export type BrowserCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
};

export type ExtractedToken = {
  source: 'cookie' | 'localStorage' | 'sessionStorage';
  key: string;
  value: string;
};

export type SessionProviderInput = {
  cdpUrl: string;
  targetUrl: string;
  headless: true;
  ttlSeconds: number;
  specId?: string;
  runId?: string;
  sessionId?: string;
  appName?: string;
  envName?: string;
  gitSha?: string;
  userIntent?: string;
};

export type ShadowBundle = {
  bundleId: string;
  source: {
    browserKind: 'chromium';
    pageUrl: string;
    pageTitle: string;
    origin: string;
  };
  auth: {
    cookies: BrowserCookie[];
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
    token?: ExtractedToken;
  };
  metadata: {
    extractedAt: string;
    ttlSeconds: number;
    authSource: string[];
    targetUrl: string;
  };
};

export type ValidationStatus = 'validated' | 'expired' | 'rehydration_failed';

export type ShadowSessionHandle = {
  shadowSessionId: string;
  targetUrl: string;
  targetOrigin: string;
  traceId: string;
  traceparent: string;
  tracestate?: string;
  baggage: BaggageHeaderMap;
  validationStatus: ValidationStatus;
};

export type SessionManifest = {
  sessionId: string;
  bundlePath: string;
  targetUrl: string;
  targetOrigin: string;
  appName: string;
  envName: string;
  specId: string;
  runId: string;
  gitSha?: string;
  userIntent?: string;
  createdAt: string;
  updatedAt: string;
  validationStatus: ValidationStatus;
  lastShadowSessionId?: string;
};

export type MatchedPageMetadata = {
  url: string;
  title: string;
  origin: string;
  visibilityState?: string;
  hasFocus?: boolean;
  closenessScore: number;
};


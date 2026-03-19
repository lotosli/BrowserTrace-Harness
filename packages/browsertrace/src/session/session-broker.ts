import { collectPages, connectToChromeOverCdp } from '../browser/cdp-client.js';
import type { AppRuntimeConfig } from '../config/config-schema.js';
import { HarnessError } from '../types/errors.js';
import type { MatchedPageMetadata, SessionProviderInput, ShadowBundle } from '../types/session.js';
import type { RunContext } from '../cli/run-context.js';

const storageToObject = (storage: Storage): Record<string, string> => {
  const result: Record<string, string> = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) {
      continue;
    }
    result[key] = storage.getItem(key) ?? '';
  }
  return result;
};

const extractToken = (
  cookies: ShadowBundle['auth']['cookies'],
  localStorage: Record<string, string>,
  sessionStorage: Record<string, string>
): ShadowBundle['auth']['token'] => {
  const storageCandidates = [
    ...Object.entries(localStorage).map(([key, value]) => ({ source: 'localStorage' as const, key, value })),
    ...Object.entries(sessionStorage).map(([key, value]) => ({ source: 'sessionStorage' as const, key, value })),
    ...cookies.map((cookie) => ({ source: 'cookie' as const, key: cookie.name, value: cookie.value }))
  ];
  return storageCandidates.find((candidate) => /token|auth|jwt|session/i.test(candidate.key));
};

const closenessScore = (candidateUrl: string, targetUrl: string): number => {
  let score = 0;
  for (let index = 0; index < Math.min(candidateUrl.length, targetUrl.length); index += 1) {
    if (candidateUrl[index] !== targetUrl[index]) {
      break;
    }
    score += 1;
  }
  return score;
};

export class SessionBroker {
  public async createShadowBundle(
    input: SessionProviderInput,
    appConfig: AppRuntimeConfig | undefined,
    runContext: RunContext
  ): Promise<{ bundle: ShadowBundle; matchedPage: MatchedPageMetadata; pages: MatchedPageMetadata[] }> {
    const browser = await connectToChromeOverCdp(input.cdpUrl);
    try {
      const targetOrigin = new URL(input.targetUrl).origin;
      const pages = collectPages(browser);
      const candidates = await Promise.all(
        pages.map(async (page) => {
          const metadata = await page.evaluate(() => ({
            url: window.location.href,
            title: document.title,
            visibilityState: document.visibilityState,
            hasFocus: document.hasFocus()
          })).catch(() => ({
            url: page.url(),
            title: '',
            visibilityState: 'unknown',
            hasFocus: false
          }));

          const origin = new URL(metadata.url).origin;
          return {
            url: metadata.url,
            title: metadata.title,
            origin,
            visibilityState: metadata.visibilityState,
            hasFocus: metadata.hasFocus,
            closenessScore: origin === targetOrigin ? closenessScore(metadata.url, input.targetUrl) : -1,
            page
          };
        })
      );

      await runContext.artifactWriter.writeJson('attach/pages.json', candidates.map(({ page: _, ...rest }) => rest));
      const matched = candidates
        .filter((candidate) => candidate.origin === targetOrigin)
        .sort((left, right) => {
          if ((right.hasFocus ? 1 : 0) !== (left.hasFocus ? 1 : 0)) {
            return (right.hasFocus ? 1 : 0) - (left.hasFocus ? 1 : 0);
          }
          return right.closenessScore - left.closenessScore;
        })[0];

      if (!matched) {
        throw new HarnessError('no_page_matched', `No page matched origin ${targetOrigin}`, {
          targetOrigin
        });
      }

      const cookies = await matched.page.context().cookies([targetOrigin]);
      const [localStorage, sessionStorage] = await Promise.all([
        matched.page.evaluate(() => {
          const result: Record<string, string> = {};
          for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (key) {
              result[key] = window.localStorage.getItem(key) ?? '';
            }
          }
          return result;
        }),
        matched.page.evaluate(() => {
          const result: Record<string, string> = {};
          for (let index = 0; index < window.sessionStorage.length; index += 1) {
            const key = window.sessionStorage.key(index);
            if (key) {
              result[key] = window.sessionStorage.getItem(key) ?? '';
            }
          }
          return result;
        })
      ]);
      const bundle: ShadowBundle = {
        bundleId: `${input.sessionId ?? runContext.baggageContext.sessionId}-${Date.now()}`,
        source: {
          browserKind: 'chromium',
          pageUrl: matched.url,
          pageTitle: matched.title,
          origin: targetOrigin
        },
        auth: {
          cookies,
          localStorage,
          sessionStorage,
          token: extractToken(cookies, localStorage, sessionStorage)
        },
        metadata: {
          extractedAt: new Date().toISOString(),
          ttlSeconds: input.ttlSeconds,
          authSource: ['cookies', 'localStorage', 'sessionStorage', 'token'],
          targetUrl: input.targetUrl
        }
      };

      await runContext.artifactWriter.writeJson('attach/match-result.json', { appConfig, matched });
      await runContext.artifactWriter.writeJson('bundle/bundle.json', bundle);
      await runContext.artifactWriter.writeJson('bundle/extract-summary.json', {
        cookieCount: cookies.length,
        localStorageKeys: Object.keys(localStorage),
        sessionStorageKeys: Object.keys(sessionStorage),
        tokenKey: bundle.auth.token?.key
      });

      return {
        bundle,
        matchedPage: {
          url: matched.url,
          title: matched.title,
          origin: matched.origin,
          visibilityState: matched.visibilityState,
          hasFocus: matched.hasFocus,
          closenessScore: matched.closenessScore
        },
        pages: candidates.map(({ page: _, ...rest }) => rest)
      };
    } catch (error) {
      if (error instanceof HarnessError) {
        throw error;
      }
      throw new HarnessError('auth_extract_failed', error instanceof Error ? error.message : 'Failed to extract auth state');
    } finally {
      await browser.close().catch(() => undefined);
    }
  }
}


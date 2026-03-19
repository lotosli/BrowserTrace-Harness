import { describe, expect, test } from 'vitest';
import { shouldInjectHeaders } from './http-header-injector.js';
import { pickCriticalRequest } from '../session/shadow-validator.js';

describe('shouldInjectHeaders', () => {
  test('injects same-origin requests', () => {
    expect(shouldInjectHeaders('http://127.0.0.1:8083/api/me', 'http://127.0.0.1:8083', [])).toBe(true);
  });

  test('injects allowlisted origins', () => {
    expect(
      shouldInjectHeaders(
        'https://api.example.test/data',
        'http://127.0.0.1:8083',
        ['https://api.example.test']
      )
    ).toBe(true);
  });

  test('skips unrelated origins', () => {
    expect(
      shouldInjectHeaders(
        'https://other.example.test/data',
        'http://127.0.0.1:8083',
        ['https://api.example.test']
      )
    ).toBe(false);
  });
});

describe('pickCriticalRequest', () => {
  test('prefers matching configured patterns', () => {
    const result = pickCriticalRequest(
      [
        { url: 'http://127.0.0.1:8083/api/me', status: 200 },
        { url: 'http://127.0.0.1:8083/api/servicegraph', status: 200 }
      ],
      ['/api/servicegraph']
    );
    expect(result?.url).toContain('/api/servicegraph');
  });
});


export const shouldInjectHeaders = (
  requestUrl: string,
  targetOrigin: string,
  allowlist: string[]
): boolean => {
  const url = new URL(requestUrl, targetOrigin);
  return url.origin === targetOrigin || allowlist.includes(url.origin);
};

export const buildPropagationScript = (
  headers: Record<string, string>,
  targetOrigin: string,
  allowOrigins: string[]
): string => `(() => {
  const TRACE_HEADERS = ${JSON.stringify(headers)};
  const TARGET_ORIGIN = ${JSON.stringify(targetOrigin)};
  const ALLOW_ORIGINS = new Set(${JSON.stringify(allowOrigins)});
  const shouldInject = (input) => {
    try {
      const resolved = new URL(input, window.location.href);
      return resolved.origin === TARGET_ORIGIN || ALLOW_ORIGINS.has(resolved.origin);
    } catch {
      return false;
    }
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : undefined;
    const url = request ? request.url : String(input);
    if (shouldInject(url)) {
      const nextHeaders = new Headers(request ? request.headers : init.headers || {});
      for (const [key, value] of Object.entries(TRACE_HEADERS)) {
        nextHeaders.set(key, value);
      }
      if (request) {
        return originalFetch(new Request(request, { headers: nextHeaders }), init);
      }
      return originalFetch(input, { ...init, headers: nextHeaders });
    }
    return originalFetch(input, init);
  };

  const OriginalXhrOpen = XMLHttpRequest.prototype.open;
  const OriginalXhrSend = XMLHttpRequest.prototype.send;
  const OriginalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    this.__browsertraceUrl = url;
    return OriginalXhrOpen.call(this, method, url, async, user, password);
  };
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (!this.__browsertraceHeaders) {
      this.__browsertraceHeaders = {};
    }
    this.__browsertraceHeaders[name] = value;
    return OriginalSetRequestHeader.call(this, name, value);
  };
  XMLHttpRequest.prototype.send = function(body) {
    if (this.__browsertraceUrl && shouldInject(this.__browsertraceUrl)) {
      for (const [key, value] of Object.entries(TRACE_HEADERS)) {
        OriginalSetRequestHeader.call(this, key, value);
      }
    }
    return OriginalXhrSend.call(this, body);
  };
})();`;


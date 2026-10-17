/**
 * Safe fetch helper to prevent "Unexpected token '<', <!doctype ... is not valid JSON"
 * and handle "TypeError: Failed to fetch" gracefully across the application.
 */

export interface SafeFetchResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  isHtmlFallback?: boolean;
}

export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<SafeFetchResult<T>> {
  try {
    const res = await fetch(input, init);
    const contentType = res.headers.get('content-type') || '';

    // If server returned HTML (e.g. 404/500 SPA fallback or <!doctype ...)
    if (contentType.includes('text/html')) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: `Server returned HTML instead of JSON (${res.status})`,
        isHtmlFallback: true
      };
    }

    const text = await res.text();
    if (!text || !text.trim()) {
      return {
        ok: res.ok,
        status: res.status,
        data: null
      };
    }

    if (text.trim().startsWith('<')) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: 'Response starts with HTML token',
        isHtmlFallback: true
      };
    }

    try {
      const parsed = JSON.parse(text);
      return {
        ok: res.ok,
        status: res.status,
        data: parsed
      };
    } catch (jsonErr: any) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: `JSON Parse Error: ${jsonErr?.message || 'Invalid JSON'}`
      };
    }
  } catch (networkErr: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: networkErr?.message || 'TypeError: Failed to fetch'
    };
  }
}

/**
 * Safely parse JSON from a fetch Response or string without throwing SyntaxError.
 */
export async function safeResponseJson<T = any>(res: Response): Promise<T | null> {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return null;
    }
    const text = await res.text();
    if (!text || text.trim().startsWith('<')) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export const parseResponseJson = safeResponseJson;

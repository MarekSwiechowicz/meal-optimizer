// Minimalny klient JSON: timeout, czytelne błędy, nagłówki wspólne dla providera
function createClient({ baseUrl, headers = {} }) {
  const state = { headers: { ...headers } };
  async function request(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: AbortSignal.timeout(options.timeout || 30000),
      headers: { accept: 'application/json', 'content-type': 'application/json', ...state.headers, ...(options.headers || {}) },
    });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok && !options.allowError) {
      throw new Error(`${options.method || 'GET'} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    }
    return { body, res, status: res.status };
  }
  return { request, setHeader: (k, v) => { state.headers[k] = v; } };
}

module.exports = { createClient };

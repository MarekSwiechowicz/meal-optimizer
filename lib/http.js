// Minimalny klient JSON: timeout, czytelne błędy (err.status), nagłówki wspólne dla providera
function createClient({ baseUrl, headers = {} }) {
  const state = { headers: { ...headers } };
  async function request(path, options = {}) {
    let res;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        ...options,
        signal: AbortSignal.timeout(options.timeout || 30000),
        headers: { accept: 'application/json', 'content-type': 'application/json', ...state.headers, ...(options.headers || {}) },
      });
    } catch (e) {
      const err = new Error(`Brak połączenia z ${baseUrl} (${e.cause && e.cause.code ? e.cause.code : e.message})`);
      err.status = 0;
      throw err;
    }
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok && !options.allowError) {
      const err = new Error(`${options.method || 'GET'} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return { body, res, status: res.status };
  }
  return { request, setHeader: (k, v) => { state.headers[k] = v; } };
}

// Wspólne tłumaczenie błędu logowania na komunikat dla człowieka
function loginError(err, panel) {
  if (err.status === 401 || err.status === 400 || err.status === 403) {
    return new Error(`Logowanie do ${panel} odrzucone (HTTP ${err.status}): sprawdź e-mail i hasło w .env`);
  }
  if (err.status === 429) return new Error(`${panel}: za dużo prób logowania, odczekaj kilka minut`);
  return err;
}

module.exports = { createClient, loginError };

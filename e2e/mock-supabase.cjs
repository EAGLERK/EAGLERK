// A small stand-in for a Supabase project, for browser tests. It speaks the same HTTP protocol the
// supabase-js client uses (GoTrue auth + PostgREST), including the version/conflict behaviour of
// supabase/schema.sql. It checks the app's client logic, not Supabase itself.
const http = require('node:http');
const crypto = require('node:crypto');

function start(port) {
  const users = new Map(); // id -> { id, email, phone, password, confirmed, providers }
  const access = new Map(); // access token -> user id
  const refresh = new Map(); // refresh token -> user id
  const rows = new Map(); // user id -> { data, version }
  const log = [];
  const flags = { failRest: false };
  let pkceUser = null;

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (u) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), session_id: crypto.randomUUID(), app_metadata: { provider: 'email' } })}.sig`;
  const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email || '', phone: u.phone || '', email_confirmed_at: u.confirmed ? new Date().toISOString() : null, app_metadata: { provider: u.provider || (u.phone && !u.email ? 'phone' : 'email'), providers: [u.provider || (u.phone && !u.email ? 'phone' : 'email')] }, user_metadata: {}, identities: [{ id: u.id, user_id: u.id, identity_data: { email: u.email }, provider: u.provider || 'email' }], created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const session = (u) => {
    const a = jwt(u);
    const r = crypto.randomUUID();
    access.set(a, u.id);
    refresh.set(r, u.id);
    return { access_token: a, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: r, user: userJson(u) };
  };
  const authErr = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg, message: msg });
  const byEmail = (e) => [...users.values()].find((u) => u.email && u.email.toLowerCase() === String(e).toLowerCase());
  const authedUser = (req) => {
    const t = (req.headers.authorization || '').replace(/^Bearer /i, '');
    return users.get(access.get(t));
  };

  function send(res, status, body, extra = {}) {
    res.writeHead(status, { 'content-type': 'application/json', ...extra });
    res.end(body === undefined ? '' : JSON.stringify(body));
  }

  const server = http.createServer((req, res) => {
    res.setHeader('access-control-allow-origin', req.headers.origin || '*');
    res.setHeader('access-control-allow-headers', 'authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, accept, accept-profile, content-profile, range');
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('access-control-expose-headers', 'content-range');
    if (req.method === 'OPTIONS') return send(res, 204);

    const url = new URL(req.url, `http://localhost:${port}`);
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { /* not json */ }
      const path = url.pathname;
      log.push({ method: req.method, path, query: Object.fromEntries(url.searchParams) });

      // ---- test controls ----
      if (path === '/__state') {
        return send(res, 200, { users: [...users.values()].map((u) => ({ id: u.id, email: u.email, phone: u.phone, password: u.password })), rows: [...rows.entries()].map(([id, r]) => ({ id, version: r.version, data: r.data })), log });
      }
      if (path === '/__reset') { users.clear(); access.clear(); refresh.clear(); rows.clear(); log.length = 0; flags.failRest = false; return send(res, 200, {}); }
      if (path === '/__pkce') {
        const email = url.searchParams.get('email');
        let u = byEmail(email);
        if (!u) { u = { id: crypto.randomUUID(), email, password: 'unused', confirmed: true }; users.set(u.id, u); }
        if (url.searchParams.get('provider')) u.provider = url.searchParams.get('provider');
        pkceUser = u;
        return send(res, 200, {});
      }
      if (path === '/__fail') { flags.failRest = url.searchParams.get('on') === '1'; return send(res, 200, {}); }

      // ---- auth ----
      if (path === '/auth/v1/signup') {
        const email = body.email;
        const existing = email && byEmail(email);
        if (existing) return send(res, 200, { ...userJson({ ...existing, confirmed: false }), identities: [] }); // looks like a fresh sign-up on purpose
        const u = { id: crypto.randomUUID(), email, phone: body.phone, password: body.password, confirmed: email ? !(email || '').startsWith('confirm+') : false };
        users.set(u.id, u);
        return send(res, 200, u.confirmed ? session(u) : userJson(u));
      }
      if (path === '/auth/v1/token') {
        const grant = url.searchParams.get('grant_type');
        if (grant === 'pkce') {
          // Stands in for the callback after Google or a password-reset link: the browser comes back with ?code=.
          return pkceUser ? send(res, 200, session(pkceUser)) : authErr(res, 400, 'flow_state_not_found', 'invalid flow state');
        }
        if (grant === 'refresh_token') {
          const id = refresh.get(body.refresh_token);
          const u = users.get(id);
          return u ? send(res, 200, session(u)) : authErr(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token');
        }
        const u = body.email ? byEmail(body.email) : [...users.values()].find((x) => x.phone === body.phone);
        if (!u || u.password !== body.password) return authErr(res, 400, 'invalid_credentials', 'Invalid login credentials');
        if (!u.confirmed) return authErr(res, 400, 'email_not_confirmed', 'Email not confirmed');
        return send(res, 200, session(u));
      }
      if (path === '/auth/v1/user') {
        const u = authedUser(req);
        if (!u) return authErr(res, 401, 'bad_jwt', 'invalid JWT');
        if (req.method === 'PUT') { if (body.password) u.password = body.password; }
        return send(res, 200, userJson(u));
      }
      if (path === '/auth/v1/verify') {
        const u = [...users.values()].find((x) => x.phone === body.phone);
        if (!u || body.token !== '123456') return authErr(res, 403, 'otp_expired', 'Token has expired or is invalid');
        u.confirmed = true;
        return send(res, 200, session(u));
      }
      if (path === '/auth/v1/logout') return send(res, 204);
      if (path === '/auth/v1/recover') return send(res, 200, {});
      if (path === '/auth/v1/authorize') {
        res.writeHead(200, { 'content-type': 'text/html' });
        return res.end('<!doctype html><title>mock google</title><h1>Mock Google consent</h1>');
      }

      // ---- data (PostgREST) ----
      if (path.startsWith('/rest/v1/')) {
        if (flags.failRest) return send(res, 503, { message: 'down for test' });
        const u = authedUser(req);
        if (!u) return send(res, 401, { code: 'PGRST301', message: 'JWT required' });
        if (path === '/rest/v1/rpc/delete_my_account') {
          users.delete(u.id); rows.delete(u.id);
          return send(res, 204);
        }
        if (path === '/rest/v1/user_data') {
          const wantObject = (req.headers.accept || '').includes('vnd.pgrst.object');
          const row = rows.get(u.id);
          if (req.method === 'GET') {
            const list = row && (!url.searchParams.get('user_id') || url.searchParams.get('user_id') === `eq.${u.id}`) ? [{ user_id: u.id, data: row.data, version: row.version }] : [];
            if (wantObject) return list.length === 1 ? send(res, 200, list[0]) : send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
            return send(res, 200, list);
          }
          if (req.method === 'POST') {
            if (body.user_id !== u.id) return send(res, 403, { code: '42501', message: 'new row violates row-level security policy for table "user_data"' });
            if (row) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint "user_data_pkey"' });
            rows.set(u.id, { data: body.data, version: 1 });
            const out = { user_id: u.id, data: body.data, version: 1 };
            return wantObject ? send(res, 201, out) : send(res, 201, [out]);
          }
          if (req.method === 'PATCH') {
            const q = url.searchParams;
            const matchesUser = q.get('user_id') === `eq.${u.id}`;
            const v = q.get('version');
            const versionOk = !v || v === `eq.${row && row.version}`;
            if (!row || !matchesUser || !versionOk) return send(res, 200, []);
            row.data = body.data; row.version += 1; // the database trigger owns the version
            return send(res, 200, [{ version: row.version }]);
          }
        }
      }
      send(res, 404, { message: `no mock for ${req.method} ${path}` });
    });
  });

  return new Promise((resolve) => server.listen(port, () => resolve({ server, close: () => new Promise((r) => server.close(r)) })));
}

module.exports = { start };
if (require.main === module) start(Number(process.env.PORT || 54321)).then(() => console.log('mock supabase on', process.env.PORT || 54321));

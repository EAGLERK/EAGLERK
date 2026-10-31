// Checks a Supabase project against what MyMoney needs, without signing anyone in or changing anything.
// Run it on a machine that can reach your project:  npm run check:supabase
// It reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the environment or from .env.local.
// Every line is OK, WARN or FAIL, and each WARN/FAIL says what to change. Exit code 1 if anything FAILs.
const fs = require('node:fs');
const path = require('node:path');

function readEnvFile(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no file */ }
  return out;
}

function jwtPayload(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { return null; }
}

/** Returns [{ level: 'OK'|'WARN'|'FAIL', text }]. `fetchFn` is injectable so the logic can be tested without a network. */
async function check({ url, key, google, phone }, fetchFn = fetch) {
  const res = [];
  const add = (level, text) => res.push({ level, text });

  if (!url || !key) {
    add('FAIL', 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not both set. Put them in .env.local (see .env.example).');
    return res;
  }
  const base = url.replace(/\/+$/, '');
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(base);
  if (!isLocal && !/^https:\/\/[a-z0-9]{10,}\.supabase\.(co|in)$/.test(base)) add('WARN', `The URL ${base} does not look like https://<project-ref>.supabase.co. Copy it from Project Settings > API.`);

  const claims = jwtPayload(key);
  if (claims && claims.role === 'service_role') {
    add('FAIL', 'This key has the service_role role. It bypasses all security and must never be in front-end code or .env.local. Rotate it in Supabase now and use the anon public key instead.');
    return res;
  }
  if (claims && claims.role !== 'anon') add('WARN', `The key's role is "${claims.role}", expected "anon".`);
  else if (claims) add('OK', 'The key is the public anon key.');
  else add('WARN', 'The key is not a JWT I can read (newer "publishable" keys look different). Continuing.');

  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async (p) => {
    try {
      const r = await fetchFn(base + p, { headers });
      let body = null;
      try { body = await r.json(); } catch { /* not json */ }
      return { status: r.status, body };
    } catch (e) { return { error: e.cause?.code || e.message }; }
  };

  const settings = await get('/auth/v1/settings');
  if (settings.error) { add('FAIL', `Cannot reach ${base} (${settings.error}). Check the URL, your network and that the project is not paused.`); return res; }
  if (settings.status === 401 || settings.status === 403) { add('FAIL', 'Supabase rejected the key. Re-copy the anon public key from Project Settings > API.'); return res; }
  if (settings.status !== 200 || !settings.body) { add('FAIL', `Unexpected answer from the auth service (HTTP ${settings.status}).`); return res; }
  add('OK', 'The project is reachable and accepts the key.');

  const s = settings.body;
  const ext = s.external || {};
  if (ext.email === false) add('FAIL', 'Email sign-in is turned off. Authentication > Providers > Email.');
  else add('OK', 'Email sign-in is on.');
  if (s.mailer_autoconfirm === true) add('WARN', 'Email confirmation is OFF, so anyone can sign up with an email address they do not own. Turn "Confirm email" on under Authentication > Providers > Email.');
  else if (s.mailer_autoconfirm === false) add('OK', 'Confirm email is on.');
  if (s.disable_signup === true) add('WARN', 'New sign-ups are disabled, so nobody can create an account. Authentication > Sign In / Providers.');
  if (google !== false) {
    if (ext.google === true) add('OK', 'Google sign-in is enabled.');
    else add('WARN', 'Google sign-in is not enabled in Supabase, but the app shows the Google button. Enable it (Authentication > Providers > Google) or set VITE_AUTH_GOOGLE=0.');
  }
  if (phone) {
    if (ext.phone === true) add('OK', 'Phone sign-in is enabled.');
    else add('WARN', 'VITE_AUTH_PHONE=1 but the Phone provider is not enabled in Supabase.');
  }

  // Anonymous callers must not read the data table.
  const t = await get('/rest/v1/user_data?select=user_id&limit=1');
  const code = t.body && t.body.code;
  if (t.status === 200 && Array.isArray(t.body) && t.body.length > 0) add('FAIL', 'Anyone without signing in can read rows of user_data. Re-run supabase/schema.sql (it turns on row-level security) before sharing the site.');
  else if (t.status === 200) add('WARN', 'The anonymous role can query user_data (no rows came back, so security is holding). supabase/schema.sql revokes this; re-run it to be safe.');
  else if (t.status === 404 || code === 'PGRST205' || code === '42P01') add('FAIL', 'The user_data table does not exist yet. Run supabase/schema.sql in the SQL Editor.');
  else if (t.status === 401 || t.status === 403 || code === '42501' || code === 'PGRST301') add('OK', 'The user_data table exists and refuses anonymous access.');
  else add('WARN', `Could not tell whether user_data is protected (HTTP ${t.status}${code ? ', ' + code : ''}).`);

  add('WARN', 'Not checked from outside: Google client ID and redirect URIs, the Site URL and redirect list, CAPTCHA, and per-user row isolation. Test those once by signing up two accounts (see README, "Set it up").');
  return res;
}

module.exports = { check, jwtPayload, readEnvFile };

if (require.main === module) {
  const file = readEnvFile(path.join(process.cwd(), '.env.local'));
  const get = (k) => process.env[k] ?? file[k];
  check({ url: get('VITE_SUPABASE_URL'), key: get('VITE_SUPABASE_ANON_KEY'), google: !['0', 'false'].includes(get('VITE_AUTH_GOOGLE')), phone: get('VITE_AUTH_PHONE') === '1' })
    .then((rows) => {
      for (const r of rows) console.log(`${r.level.padEnd(4)} ${r.text}`);
      const fails = rows.filter((r) => r.level === 'FAIL').length;
      console.log(fails ? `\n${fails} problem(s) to fix.` : '\nNo blocking problems found.');
      process.exit(fails ? 1 : 0);
    })
    .catch((e) => { console.error('check crashed:', e.message); process.exit(2); });
}

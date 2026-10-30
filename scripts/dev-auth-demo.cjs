// Try the sign-in screens locally without a Supabase project.
// Starts the mock Supabase server (e2e/mock-supabase.cjs) and the app wired to it.
// Usage: npm run dev:auth-demo  then open http://localhost:5177
// Any email works for sign-up; use a password of 8+ characters. Emails starting "confirm+" show the check-your-inbox step.
// Mobile-number sign-up works too; the SMS code is always 123456. Data lives only in memory and is lost on restart.
const { spawn } = require('node:child_process');
const mock = require('../e2e/mock-supabase.cjs');

const MOCK_PORT = 54321;
const APP_PORT = 5177;

(async () => {
  const m = await mock.start(MOCK_PORT);
  const app = spawn('npx', ['vite', '--port', String(APP_PORT), '--strictPort'], {
    stdio: 'inherit',
    detached: true,
    env: { ...process.env, VITE_SUPABASE_URL: `http://localhost:${MOCK_PORT}`, VITE_SUPABASE_ANON_KEY: 'demo-key', VITE_AUTH_PHONE: '1' },
  });
  const quit = async () => {
    try { process.kill(-app.pid, 'SIGTERM'); } catch { /* already gone */ }
    await m.close();
    process.exit(0);
  };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
  console.log(`\nMock Supabase on :${MOCK_PORT}. Open http://localhost:${APP_PORT}`);
})();

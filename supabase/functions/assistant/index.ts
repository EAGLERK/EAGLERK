// Mitra's AI layer: turns one sentence into one app command. Runs as a Supabase Edge Function so the API key stays on the server.
//
// Deploy:   supabase functions deploy assistant
// Secret:   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Then build the app with VITE_VOICE_AI=1.
//
// It only answers signed-in users (the platform checks the JWT, and getUser() checks it again), caps the input, and sends the model
// nothing but the sentence, the date, the note titles and the setting names. The app checks the answer again before using it.

import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'claude-haiku-5-5';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });

const SYSTEM = `You are Mitra, the voice assistant inside MyMoney, a personal-finance app for people in India. Turn the user's sentence into exactly one command by calling the run tool.
Rules:
- Amounts are in rupees. "2k" is 2000, "1.5 lakh" is 150000, "2 crore" is 20000000.
- Dates are YYYY-MM-DD and never in the future. Resolve words like "yesterday" or "last Friday" from today's date, which is given.
- Choose t="unknown" with a short friendly "reply" when the sentence is not a request you can do, is unclear, or is a question you cannot answer from these commands. Never invent amounts or dates the user did not say.
- Adding a transaction without an amount: set amount to null.
- You cannot read the user's data. Do not guess numbers.
Commands (field t): navigate{tab: dashboard|transactions|goals|notes|settings}, theme{theme: auto|light|dark}, summary{what: spend|income|saved, period: this|last}, addTxn{type: income|expense, amount|null, description, date|null}, txnEdit{target, field: amount|category|date|description, value, amount?, date?}, txnDelete{target: "last" or words from its description}, noteAddItems{list, items[]}, noteCreate{title, kind: buy|sell|todo|text}, noteQuick{text, as: todo|text}, noteTick{text, done}, noteRemoveItem{text, list}, noteOpen{name}, noteDelete{name}, setProfile{field: name|age|monthlyIncome|monthlyExpenses|annualGrossIncome, value}, setAssumption{label, value}, goalPrice{goal: car|house|bike, price}, goalMonth{goal, month: YYYY-MM}, goalAdd{kind: car|house|bike}, goalDelete{goal}, undo, help, saveDrafts, discardDrafts, unknown{reply}.`;

const TOOL = {
  name: 'run',
  description: 'The one command to run in the app.',
  input_schema: {
    type: 'object',
    properties: {
      t: { type: 'string' },
      reply: { type: 'string', description: 'Only for t="unknown": one short sentence.' },
      tab: { type: 'string' }, theme: { type: 'string' }, what: { type: 'string' }, period: { type: 'string' },
      type: { type: 'string' }, amount: { type: ['number', 'null'] }, description: { type: 'string' }, date: { type: ['string', 'null'] },
      target: { type: 'string' }, field: { type: 'string' }, value: { type: ['string', 'number'] },
      list: { type: 'string' }, items: { type: 'array', items: { type: 'string' } }, title: { type: 'string' }, kind: { type: 'string' },
      text: { type: 'string' }, as: { type: 'string' }, done: { type: 'boolean' }, name: { type: 'string' },
      label: { type: 'string' }, goal: { type: 'string' }, price: { type: 'number' }, month: { type: 'string' },
    },
    required: ['t'],
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return json({ error: 'signin' }, 401);

  let body: { text?: unknown; today?: unknown; notes?: unknown; assumptions?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'body' }, 400); }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 300) : '';
  const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  const list = (x: unknown, n: number) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string').slice(0, n).map((s) => s.slice(0, 60)) : []);
  if (!text) return json({ error: 'empty' }, 400);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'not configured' }, 500);

  const context = `Today: ${today}\nNote titles: ${list(body.notes, 30).join('; ') || '(none)'}\nPlanner settings: ${list(body.assumptions, 40).join('; ') || '(none)'}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 300, system: `${SYSTEM}\n\n${context}`, tools: [TOOL], tool_choice: { type: 'tool', name: 'run' }, messages: [{ role: 'user', content: text }] }),
  });
  if (!res.ok) return json({ error: 'model' }, 502);
  const out = await res.json();
  const call = (out.content ?? []).find((b: { type: string }) => b.type === 'tool_use');
  if (!call?.input) return json({ error: 'model' }, 502);
  const { reply, ...command } = call.input as Record<string, unknown>;
  if (command.t === 'unknown') return json({ reply: typeof reply === 'string' ? reply : 'I did not understand that.' });
  return json({ command });
});

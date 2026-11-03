import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { uid } from '../lib/format';
import { pulse, popIn } from '../motion';
import { useStore } from '../store';
import { requestOpenNote } from '../voice/bus';
import { parseAmountPhrase } from '../voice/numbers';
import { parseAnswer, parseCommand, type Tab } from '../voice/parse';
import { plan as makePlan, withAmount, type Effect, type Plan, type PlanCtx } from '../voice/plan';
import { createListener, listeningSupported, speak, speakingSupported, stopSpeaking, type ListenError, type Listener } from '../voice/speech';
import { inverse } from '../voice/undo';
import { useDrafts } from './Drafts';
import { Icon } from './icons';

type Theme = 'auto' | 'light' | 'dark';
interface Line { id: number; who: 'me' | 'bot'; text: string }

const HELP = [
  'Add: "Spent 450 on lunch yesterday", "Got salary 85000"',
  'Notes: "Add milk and eggs to my shopping list", "Note down call the bank", "Tick off milk"',
  'Go: "Open goals", "Show my notes"',
  'Change: "Set my age to 32", "Change the amount of Swiggy to 500", "Set house price to 80 lakh", "Dark mode"',
  'Ask: "How much did I spend this month?"',
  'Say "save" to keep new transactions and "undo" to take back the last change.',
].join('\n');

const EXAMPLES = ['Spent 450 on lunch', 'Add milk to my shopping list', 'Open goals'];

const ERRORS: Record<ListenError, string> = {
  denied: 'The microphone is blocked. Allow it in your browser’s site settings, or type instead.',
  'no-speech': 'I did not hear anything. Tap the microphone and try again.',
  network: 'Speech recognition needs an internet connection in this browser. You can type instead.',
  unsupported: 'This browser cannot listen. You can type instead.',
  other: 'Listening stopped. Tap the microphone to try again.',
};

const prefGet = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const prefSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export function Voice({ go, theme, setTheme, tabs }: { go: (tab: string) => void; theme: Theme; setTheme: (t: Theme) => void; tabs: Tab[] }) {
  const { state, dispatch, d } = useStore();
  const drafts = useDrafts();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [heard, setHeard] = useState('');
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState<Plan['ask'] | null>(null);
  const [speakOn, setSpeakOn] = useState(() => prefGet('mymoney:voice-speak', '1') === '1');
  const [canUndo, setCanUndo] = useState(false);
  const supported = useMemo(() => listeningSupported(), []);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const logBox = useRef<HTMLDivElement>(null);
  const listener = useRef<Listener | null>(null);
  const undoStack = useRef<Array<() => void>>([]);
  const nextLine = useRef(1);
  const viaMic = useRef(false);

  // Everything the handlers read lives in one ref, so a command always sees the latest data without re-creating the listener.
  const live = useRef({ state, d, drafts, theme, tabs, go, setTheme, speakOn, pending, open });
  live.current = { state, d, drafts, theme, tabs, go, setTheme, speakOn, pending, open };

  const say = useCallback((who: Line['who'], text: string) => setLines((l) => [...l.slice(-7), { id: nextLine.current++, who, text }]), []);

  const listen = useCallback(() => {
    if (!listener.current) return;
    setHeard('');
    listener.current.start();
  }, []);

  /* ----- applying a plan ----- */

  const context = (): PlanCtx => {
    const { state: s, d: dd, drafts: dr, tabs: tb } = live.current;
    return { state: s, today: dd.today, rates: dd.rates, assumptions: dd.assumptions, staged: dr.added, edits: dr.edits, tabs: tb, newId: uid, now: new Date().toISOString() };
  };

  const apply = (effects: Effect[]): { undo: Array<() => void>; blocked?: string } => {
    const L = live.current;
    const undo: Array<() => void> = [];
    let blocked: string | undefined;
    for (const e of effects) {
      switch (e.k) {
        case 'nav':
          if (L.drafts.isDirty() && e.tab !== 'transactions') blocked = 'You have unsaved transactions. Choose what to do with them in the box on screen.';
          L.go(e.tab);
          break;
        case 'theme': { const prev = L.theme; L.setTheme(e.theme); undo.push(() => live.current.setTheme(prev)); break; }
        case 'stage': L.drafts.stage([e.txn]); undo.push(() => live.current.drafts.dropAdded([e.txn.id])); break;
        case 'editTxn': {
          const was = L.drafts.added.find((t) => t.id === e.id) ?? L.state.txns.find((t) => t.id === e.id);
          const back = Object.fromEntries(Object.keys(e.patch).map((k) => [k, was ? (was as unknown as Record<string, unknown>)[k] : undefined])) as Partial<typeof e.patch>;
          const savedEdit = L.drafts.edits[e.id];
          const prior = savedEdit ? Object.fromEntries(Object.keys(e.patch).filter((k) => k in savedEdit).map((k) => [k, (savedEdit as Record<string, unknown>)[k]])) : {};
          L.drafts.edit(e.id, e.patch);
          undo.push(() => live.current.drafts.edit(e.id, { ...back, ...prior }));
          break;
        }
        case 'dropStaged': {
          const row = L.drafts.added.find((t) => t.id === e.id);
          L.drafts.dropAdded([e.id]);
          if (row) undo.push(() => live.current.drafts.stage([row]));
          break;
        }
        case 'deleteTxn': {
          const original = L.state.txns.find((t) => t.id === e.txn.id) ?? e.txn;
          dispatch({ type: 'deleteTxn', id: original.id });
          L.drafts.forget(original.id);
          undo.push(() => dispatch({ type: 'addTxns', txns: [original] }));
          break;
        }
        case 'dispatch': { const back = inverse(e.action, L.state); dispatch(e.action); if (back) undo.push(() => dispatch(back)); break; }
        case 'save': if (!L.drafts.save()) blocked = 'Some rows still need a date and an amount above 0 before they can be saved.'; break;
        case 'discard': L.drafts.discard(); break;
        case 'openNote': requestOpenNote(e.id); break;
      }
    }
    return { undo, blocked };
  };

  const finish = (p: Plan) => {
    if (p.special === 'undo') {
      const fns = undoStack.current.pop();
      setCanUndo(undoStack.current.length > 0);
      if (!fns) { reply('There is nothing to undo.'); return; }
      fns();
      reply('Undone.');
      return;
    }
    if (p.special === 'help') { reply(HELP); return; }
    let text = p.say;
    if (p.effects?.length) {
      const r = apply(p.effects);
      if (r.undo.length) { const all = r.undo; undoStack.current.push(() => [...all].reverse().forEach((f) => f())); undoStack.current = undoStack.current.slice(-20); setCanUndo(true); }
      if (r.blocked) text = r.blocked;
    }
    setPending(p.ask ?? null);
    reply(text, !!p.ask);
  };

  /** Says the reply (aloud when the question came by voice), then listens again if an answer is expected. */
  const reply = (text: string, expectAnswer = false) => {
    if (text) say('bot', text);
    const aloud = viaMic.current && live.current.speakOn && speakingSupported() && text && text !== HELP;
    const next = () => { if (expectAnswer && viaMic.current && live.current.open) listen(); };
    if (aloud) speak(text, next); else next();
  };

  const handle = (text: string, mic: boolean) => {
    const said = text.trim();
    if (!said) return;
    viaMic.current = mic;
    say('me', said);
    const L = live.current;
    const ctx = context();
    const ask = L.pending;
    if (ask) {
      if (ask.kind === 'confirm') {
        const a = parseAnswer(said);
        if (a === 'yes') { setPending(null); finish(ask.then); return; }
        if (a === 'no') { setPending(null); reply('Okay, I left it as it was.'); return; }
      } else {
        const n = parseAmountPhrase(said);
        if (n !== null) { setPending(null); finish(makePlan(withAmount(ask.cmd, n), ctx)); return; }
        if (parseAnswer(said) === 'no') { setPending(null); reply('Okay, nothing added.'); return; }
      }
      setPending(null); // They said something else: treat it as a new command.
    }
    finish(makePlan(parseCommand(said, ctx.today), ctx));
  };
  const handleRef = useRef(handle);
  handleRef.current = handle;

  /* ----- the microphone ----- */

  useEffect(() => {
    listener.current = createListener({
      onStart: () => { setListening(true); setHeard(''); },
      onInterim: setHeard,
      onFinal: (t) => { setHeard(''); handleRef.current(t, true); },
      onEnd: () => setListening(false),
      onError: (e) => { setListening(false); say('bot', ERRORS[e]); },
    });
    return () => { listener.current?.stop(); listener.current = null; stopSpeaking(); };
  }, [say]);

  const toggleMic = () => {
    stopSpeaking();
    if (listening) { listener.current?.stop(); return; }
    if (!supported) { say('bot', ERRORS.unsupported); return; }
    viaMic.current = true;
    listen();
  };

  const mic = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!listening) return;
    const stops = [btn.current, mic.current].filter((el): el is HTMLButtonElement => !!el).map((el) => pulse(el));
    return () => stops.forEach((s) => s());
  }, [listening, open]);

  /* ----- opening and closing ----- */

  const close = (refocus = true) => {
    listener.current?.stop();
    stopSpeaking();
    setOpen(false);
    if (refocus) btn.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    if (panel.current) popIn(panel.current, { y: -6 });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: PointerEvent) => { if (!(e.target instanceof Node)) return; if (!panel.current?.contains(e.target) && !btn.current?.contains(e.target)) close(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { const el = logBox.current; if (el) el.scrollTop = el.scrollHeight; }, [lines, heard, open]);

  const opener = () => {
    if (open) { close(); return; }
    setOpen(true);
    if (supported) { viaMic.current = true; window.setTimeout(listen, 120); } else window.setTimeout(() => field.current?.focus(), 50);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = typed.trim();
    if (!t) return;
    setTyped('');
    listener.current?.stop();
    stopSpeaking();
    handle(t, false);
  };

  const lastMe = [...lines].reverse().find((l) => l.who === 'me');
  const lastBot = [...lines].reverse().find((l) => l.who === 'bot');
  const noteText = 'Your browser turns speech into text. In Chrome the audio goes to Google to do that. MyMoney keeps no recordings.';

  return (
    <div className="bell-wrap voice-wrap">
      <button ref={btn} className={`btn icon ghost voice-btn${listening ? ' live' : ''}`} data-tour="voice" aria-label="Voice assistant" aria-haspopup="dialog" aria-expanded={open} title="Voice assistant" onClick={opener}>
        <Icon name="mic" size={18} />
      </button>
      {open && (
        <div ref={panel} className="notif-panel voice-panel" role="dialog" aria-label="Voice assistant">
          <div className="notif-head">
            <h2>Voice assistant</h2>
            <button className="btn small ghost" onClick={() => close()}>Close</button>
          </div>

          {supported && (
            <button ref={mic} className={`btn voice-mic${listening ? ' live' : ''}`} aria-pressed={listening} onClick={toggleMic}>
              <Icon name="mic" size={20} />{listening ? 'Stop' : 'Speak'}
            </button>
          )}

          <div ref={logBox} className="voice-log" role="log" aria-live="polite" aria-label="Conversation">
            {listening && <p className="voice-line me live" role="status">{heard || 'Listening...'}</p>}
            {!listening && lastMe && <p className="voice-line me"><span className="sr-only">You said: </span>{lastMe.text}</p>}
            {lastBot && <p className="voice-line bot"><span className="sr-only">Assistant: </span>{lastBot.text}</p>}
            {!lastMe && !lastBot && !listening && <p className="sub">{supported ? 'Say what you want to do, or type it below.' : 'This browser cannot listen, but you can type the same commands below.'}</p>}
          </div>

          {pending?.kind === 'confirm' && (
            <div className="voice-confirm">
              <button className="btn small" onClick={() => handle('no', false)}>No</button>
              <button className="btn small primary" onClick={() => handle('yes', false)}>Yes</button>
            </div>
          )}
          {canUndo && !pending && lastBot && <button className="linkbtn voice-undo" onClick={() => handle('undo', false)}>Undo that</button>}

          <form className="voice-form" onSubmit={submit}>
            <label className="sr-only" htmlFor="voice-text">Type a command</label>
            <input id="voice-text" ref={field} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type: spent 450 on lunch" autoComplete="off" />
            <button className="btn icon" type="submit" aria-label="Send" disabled={!typed.trim()}><Icon name="send" size={18} /></button>
          </form>

          {!lastMe && !lastBot && (
            <div className="voice-chips" aria-label="Examples">
              {EXAMPLES.map((x) => <button key={x} className="btn small" onClick={() => { setTyped(x); field.current?.focus(); }}>{x}</button>)}
            </div>
          )}

          <div className="notif-foot voice-foot">
            {speakingSupported() ? (
              <label className="check"><input type="checkbox" checked={speakOn} onChange={(e) => { setSpeakOn(e.target.checked); prefSet('mymoney:voice-speak', e.target.checked ? '1' : '0'); if (!e.target.checked) stopSpeaking(); }} />Speak replies</label>
            ) : <span />}
            <button className="linkbtn" onClick={() => handle('help', false)}>What can I say?</button>
          </div>
          <p className="field-note">{noteText}</p>
        </div>
      )}
    </div>
  );
}

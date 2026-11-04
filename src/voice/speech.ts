import { isNative } from '../platform';
import { createNativeListener } from './native-speech';

/**
 * Thin wrapper over the browser's speech recognition and speech synthesis.
 * Recognition is Chrome, Edge and Safari only (Firefox has none). In Chrome the audio is sent to Google to be turned into text;
 * the app itself never records or stores audio. Everything after the text arrives happens on this device.
 */

interface RecResult { readonly isFinal: boolean; readonly 0: { transcript: string } }
interface RecEvent { resultIndex: number; results: ArrayLike<RecResult> }
interface Rec {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: RecEvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; onstart: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecCtor = new () => Rec;

const ctor = (): RecCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Inside the phone apps the phone's own recogniser is used, so listening is assumed; a missing one is reported when it starts. */
export const listeningSupported = (): boolean => isNative() || !!ctor();
export const speakingSupported = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

export type ListenError = 'denied' | 'no-speech' | 'network' | 'unsupported' | 'other';

export interface Listener {
  start(): void;
  stop(): void;
}

export interface ListenHandlers {
  onStart(): void;
  onInterim(text: string): void;
  onFinal(text: string): void;
  onEnd(): void;
  onError(e: ListenError): void;
}

/** The phone plugin is loaded the first time it is needed, so the web build never pays for it. */
function nativeListener(h: ListenHandlers, lang: string): Listener {
  let inner: Listener | null = null;
  const load = import('@capacitor-community/speech-recognition').then(({ SpeechRecognition }) => { inner = createNativeListener(SpeechRecognition, h, lang); return inner; });
  return {
    start() { void load.then((l) => l.start()).catch(() => { h.onError('unsupported'); h.onEnd(); }); },
    stop() { inner?.stop(); },
  };
}

export function createListener(h: ListenHandlers, lang = 'en-IN'): Listener | null {
  if (isNative()) return nativeListener(h, lang);
  const C = ctor();
  if (!C) return null;
  let rec: Rec | null = null;
  let finalText = '';
  return {
    start() {
      rec?.abort();
      rec = new C();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      finalText = '';
      rec.onstart = () => h.onStart();
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += `${r[0].transcript} `; else interim += r[0].transcript;
        }
        if (interim) h.onInterim(`${finalText}${interim}`.trim());
      };
      rec.onerror = (e) => {
        h.onError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'no-speech' || e.error === 'aborted' ? 'no-speech' : e.error === 'network' ? 'network' : 'other');
      };
      rec.onend = () => {
        const text = finalText.trim();
        finalText = '';
        if (text) h.onFinal(text);
        h.onEnd();
      };
      try { rec.start(); } catch { h.onError('other'); h.onEnd(); }
    },
    stop() { rec?.stop(); },
  };
}

/** Reads a sentence aloud. A new sentence cuts off the old one. */
export function speak(text: string, onEnd?: () => void): void {
  if (!speakingSupported() || !text) { onEnd?.(); return; }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-IN';
    u.rate = 1.02;
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.speak(u);
  } catch { onEnd?.(); }
}

export function stopSpeaking(): void {
  try { if (speakingSupported()) window.speechSynthesis.cancel(); } catch { /* ignore */ }
}

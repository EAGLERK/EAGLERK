import type { SpeechRecognitionPlugin } from '@capacitor-community/speech-recognition';
import type { ListenError, ListenHandlers, Listener } from './speech';

/**
 * Listening inside the Android and iOS apps. The web view has no speech recognition of its own, so this uses the phone's
 * recogniser through a Capacitor plugin. It takes the plugin as an argument so the logic can be tested without a phone.
 * Partial results stream in while the person talks; when the phone stops listening (silence, or Stop), the last one is the sentence.
 */
export function createNativeListener(plugin: SpeechRecognitionPlugin, h: ListenHandlers, lang = 'en-IN'): Listener {
  let last = '';
  let live = false;
  let busy = false; // from the tap until the phone stops, so a second tap cannot start a second recogniser

  const end = () => {
    if (!live) return;
    live = false;
    busy = false;
    const text = last.trim();
    last = '';
    if (text) h.onFinal(text);
    h.onEnd();
  };
  const fail = (e: ListenError) => { live = false; busy = false; h.onError(e); h.onEnd(); };

  return {
    start() {
      if (busy) return;
      busy = true;
      void (async () => {
        try {
          if (!(await plugin.available()).available) return fail('unsupported');
          let perm = await plugin.checkPermissions();
          if (perm.speechRecognition !== 'granted') perm = await plugin.requestPermissions();
          if (perm.speechRecognition !== 'granted') return fail('denied');
          await plugin.removeAllListeners();
          last = '';
          live = true;
          await plugin.addListener('partialResults', (d) => { last = d.matches?.[0] ?? last; if (last) h.onInterim(last); });
          await plugin.addListener('listeningState', (d) => { if (d.status === 'stopped') end(); });
          h.onStart();
          await plugin.start({ language: lang, maxResults: 1, partialResults: true, popup: false });
        } catch {
          fail('other');
        }
      })();
    },
    stop() {
      void plugin.stop().catch(() => { /* already stopped */ });
    },
  };
}

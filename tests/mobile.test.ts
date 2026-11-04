import type { SpeechRecognitionPlugin } from '@capacitor-community/speech-recognition';
import { describe, expect, it, vi } from 'vitest';
import { redirectFor } from '../src/auth/redirect';
import { createNativeListener } from '../src/voice/native-speech';

describe('redirectFor: where email links lead', () => {
  it('is the page itself in a browser', () => {
    expect(redirectFor(false, 'https://mymoney.example', 'http://localhost:5173', '/')).toBe('http://localhost:5173/');
    expect(redirectFor(false, undefined, 'https://app.example', '/app/')).toBe('https://app.example/app/');
  });
  it('is the public website inside the phone app, with a trailing slash', () => {
    expect(redirectFor(true, 'https://mymoney.example', 'https://localhost', '/')).toBe('https://mymoney.example/');
    expect(redirectFor(true, ' https://mymoney.example/ ', 'https://localhost', '/')).toBe('https://mymoney.example/');
  });
  it('falls back to the page when no website is set', () => {
    expect(redirectFor(true, undefined, 'https://localhost', '/')).toBe('https://localhost/');
    expect(redirectFor(true, '  ', 'https://localhost', '/')).toBe('https://localhost/');
  });
});

/** A phone recogniser that does what the plugin documents: events come from the phone, `start` resolves later. */
function fakePlugin(over: Partial<{ available: boolean; permission: 'granted' | 'denied' | 'prompt'; grantOnRequest: boolean }> = {}) {
  const o = { available: true, permission: 'granted', grantOnRequest: true, ...over };
  const handlers: Record<string, (d: unknown) => void> = {};
  const plugin = {
    available: vi.fn(async () => ({ available: o.available })),
    checkPermissions: vi.fn(async () => ({ speechRecognition: o.permission })),
    requestPermissions: vi.fn(async () => ({ speechRecognition: o.grantOnRequest ? 'granted' : 'denied' })),
    removeAllListeners: vi.fn(async () => {}),
    addListener: vi.fn(async (name: string, fn: (d: unknown) => void) => { handlers[name] = fn; return { remove: async () => {} }; }),
    start: vi.fn(async () => ({})),
    stop: vi.fn(async () => {}),
  };
  return { plugin: plugin as unknown as SpeechRecognitionPlugin, mock: plugin, emit: (name: string, d: unknown) => handlers[name]?.(d) };
}
const handlers = () => ({ onStart: vi.fn(), onInterim: vi.fn(), onFinal: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('createNativeListener: listening inside the phone app', () => {
  it('streams what is heard and gives the last version as the sentence when the phone stops', async () => {
    const { plugin, mock, emit } = fakePlugin();
    const h = handlers();
    createNativeListener(plugin, h, 'en-IN').start();
    await settle();
    expect(mock.start).toHaveBeenCalledWith(expect.objectContaining({ language: 'en-IN', partialResults: true, popup: false }));
    expect(h.onStart).toHaveBeenCalledOnce();
    emit('partialResults', { matches: ['spent'] });
    emit('partialResults', { matches: ['spent 450 on lunch'] });
    expect(h.onInterim).toHaveBeenLastCalledWith('spent 450 on lunch');
    emit('listeningState', { status: 'stopped' });
    expect(h.onFinal).toHaveBeenCalledWith('spent 450 on lunch');
    expect(h.onEnd).toHaveBeenCalledOnce();
  });
  it('reports the end only once, even if the phone says stopped twice', async () => {
    const { plugin, emit } = fakePlugin();
    const h = handlers();
    createNativeListener(plugin, h).start();
    await settle();
    emit('partialResults', { matches: ['dark mode'] });
    emit('listeningState', { status: 'stopped' });
    emit('listeningState', { status: 'stopped' });
    expect(h.onFinal).toHaveBeenCalledTimes(1);
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });
  it('ends quietly when nothing was heard', async () => {
    const { plugin, emit } = fakePlugin();
    const h = handlers();
    createNativeListener(plugin, h).start();
    await settle();
    emit('listeningState', { status: 'stopped' });
    expect(h.onFinal).not.toHaveBeenCalled();
    expect(h.onEnd).toHaveBeenCalledOnce();
  });
  it('asks for the microphone once and says so when it is refused', async () => {
    const { plugin, mock } = fakePlugin({ permission: 'prompt', grantOnRequest: false });
    const h = handlers();
    createNativeListener(plugin, h).start();
    await settle();
    expect(mock.requestPermissions).toHaveBeenCalledOnce();
    expect(h.onError).toHaveBeenCalledWith('denied');
    expect(mock.start).not.toHaveBeenCalled();
    expect(h.onEnd).toHaveBeenCalledOnce();
  });
  it('does not ask again when the permission is already granted', async () => {
    const { plugin, mock } = fakePlugin();
    createNativeListener(plugin, handlers()).start();
    await settle();
    expect(mock.requestPermissions).not.toHaveBeenCalled();
  });
  it('says so when the phone has no recogniser', async () => {
    const { plugin } = fakePlugin({ available: false });
    const h = handlers();
    createNativeListener(plugin, h).start();
    await settle();
    expect(h.onError).toHaveBeenCalledWith('unsupported');
  });
  it('turns a plugin failure into a plain error', async () => {
    const { plugin, mock } = fakePlugin();
    mock.start.mockRejectedValueOnce(new Error('busy'));
    const h = handlers();
    createNativeListener(plugin, h).start();
    await settle();
    expect(h.onError).toHaveBeenCalledWith('other');
  });
  it('ignores a second tap while it is already listening', async () => {
    const { plugin, mock, emit } = fakePlugin();
    const h = handlers();
    const l = createNativeListener(plugin, h);
    l.start();
    l.start();
    await settle();
    expect(mock.start).toHaveBeenCalledOnce();
    emit('partialResults', { matches: ['undo'] });
    emit('listeningState', { status: 'stopped' });
    l.start(); // and can listen again once the first is over
    await settle();
    expect(mock.start).toHaveBeenCalledTimes(2);
  });
  it('stop asks the phone to stop', async () => {
    const { plugin, mock } = fakePlugin();
    const l = createNativeListener(plugin, handlers());
    l.start();
    await settle();
    l.stop();
    expect(mock.stop).toHaveBeenCalledOnce();
  });
});

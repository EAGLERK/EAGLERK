/**
 * One note to open the next time the Notes screen is on show. The voice assistant sets it, then the Notes screen
 * picks it up when it mounts (or straight away, if it is already open).
 */
let pending: string | null = null;
const listeners = new Set<(id: string) => void>();

export function requestOpenNote(id: string): void {
  pending = id;
  listeners.forEach((l) => l(id));
}

/** Returns the waiting note id once, then forgets it. */
export function takePendingNote(): string | null {
  const id = pending;
  pending = null;
  return id;
}

export function onOpenNote(fn: (id: string) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

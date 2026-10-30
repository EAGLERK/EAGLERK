import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

/* ---------- Toasts: brief confirmation, with Undo for single deletes ---------- */

interface ToastItem {
  id: number;
  message: string;
  undo?: () => void;
}

export interface ToastApi {
  /** Shows a short message. Pass `undo` to offer taking the action back. */
  toast(message: string, opts?: { undo?: () => void }): void;
}

const ToastCtx = createContext<ToastApi>({ toast: () => {} });
export const useToast = (): ToastApi => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const toast = useCallback<ToastApi['toast']>(
    (message, opts = {}) => {
      const id = next.current++;
      setItems((l) => [...l.slice(-2), { id, message, undo: opts.undo }]);
      // Long enough to hit Undo, short enough not to pile up (3-5 s is the usual range).
      window.setTimeout(() => dismiss(id), opts.undo ? 6000 : 4000);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {/* The live region exists before any message does, so screen readers announce new toasts without stealing focus. */}
      <div className="toasts" aria-live="polite" aria-label="Notifications">
        {items.map((t) => (
          <div className="toast" key={t.id}>
            <span>{t.message}</span>
            {t.undo && (
              <button className="toast-btn" onClick={() => { t.undo?.(); dismiss(t.id); }}>Undo</button>
            )}
            <button className="toast-x" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}><Icon name="close" size={16} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Confirm dialog: replaces the browser's confirm(), which embedded viewers silently refuse ---------- */

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive and focuses Cancel first. */
  danger?: boolean;
}

type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn>(async () => false);
export const useConfirm = (): ConfirmFn => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const confirm = useCallback<ConfirmFn>((opts) => new Promise<boolean>((resolve) => setState({ opts, resolve })), []);

  useEffect(() => {
    const d = dialog.current;
    if (state && d && !d.open) d.showModal(); // native modal: traps focus, Esc cancels, page behind is inert
  }, [state]);

  const close = (answer: boolean) => {
    dialog.current?.close();
    state?.resolve(answer);
    setState(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <dialog
          ref={dialog}
          className="modal"
          aria-labelledby="confirm-title"
          onCancel={(e) => { e.preventDefault(); close(false); }}
          onClick={(e) => { if (e.target === dialog.current) close(false); }}
        >
          <div className="modal-body">
            <h2 id="confirm-title">{state.opts.title}</h2>
            {state.opts.body && <div className="sub">{state.opts.body}</div>}
            <div className="modal-actions">
              <button className="btn" autoFocus onClick={() => close(false)}>{state.opts.cancelLabel ?? 'Cancel'}</button>
              <button className={`btn ${state.opts.danger ? 'danger-solid' : 'primary'}`} onClick={() => close(true)}>{state.opts.confirmLabel}</button>
            </div>
          </div>
        </dialog>
      )}
    </ConfirmCtx.Provider>
  );
}

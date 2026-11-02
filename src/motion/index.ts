import { gsap } from 'gsap';

/**
 * Every animation in the app goes through this file, so the timings and curves live in one place.
 * Nothing here is decoration: press and hover confirm a pointer is on a control, and enter/exit show where something came from.
 * Motion is skipped entirely when the person has asked their device for reduced motion.
 */

export const DUR = { press: 0.12, release: 0.22, hover: 0.16, enter: 0.22, exit: 0.16, route: 0.2, cascade: 0.32 } as const;
export const EASE = { out: 'power3.out', in: 'power2.in', settle: 'back.out(2)' } as const;

gsap.defaults({ ease: EASE.out, duration: DUR.enter });

export const reducedMotion = (): boolean => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ---------- Press and hover feedback, for every control, from one set of listeners ---------- */

/** What gets hover feedback. CSS reads `--hv` (0 to 1) and decides how the control looks at that value. */
const HOVERABLE = '.btn, .side-link, .choice, .sumcard .foot, .toast-btn, .toast-x, .gbtn';
/** What shrinks slightly while pressed, and by how much. */
const PRESSABLE: Array<[string, number]> = [['.btn, .gbtn, .choice', 0.97], ['.side-link', 0.985], ['.tab', 0.94]];

const off = (el: Element) => el.matches(':disabled, [aria-disabled="true"]');

/** Installs the delegated listeners once. Returns a function that removes them. */
export function installControlMotion(): () => void {
  let pressed: { el: HTMLElement; scale: number } | null = null;

  const release = () => {
    if (!pressed) return;
    const { el } = pressed;
    pressed = null;
    gsap.to(el, { scale: 1, duration: DUR.release, ease: EASE.settle, overwrite: 'auto', clearProps: 'transform' });
  };

  const down = (e: PointerEvent) => {
    if (reducedMotion() || e.button > 0 || !(e.target instanceof Element)) return;
    for (const [selector, scale] of PRESSABLE) {
      const el = e.target.closest<HTMLElement>(selector);
      if (el && !off(el)) {
        release();
        pressed = { el, scale };
        gsap.to(el, { scale, duration: DUR.press, overwrite: 'auto' });
        return;
      }
    }
  };

  const hover = (e: PointerEvent, to: 0 | 1) => {
    if (reducedMotion() || e.pointerType === 'touch' || !(e.target instanceof Element)) return;
    const el = e.target.closest<HTMLElement>(HOVERABLE);
    if (!el || off(el)) return;
    // pointerover/out also fire when moving between a control's own children; ignore those.
    const other = e.relatedTarget instanceof Node ? e.relatedTarget : null;
    if (other && el.contains(other)) return;
    gsap.to(el, { '--hv': to, duration: DUR.hover, overwrite: 'auto', ease: 'power1.out', onComplete: to === 0 ? () => { gsap.set(el, { clearProps: '--hv' }); } : undefined });
  };

  const over = (e: PointerEvent) => hover(e, 1);
  const out = (e: PointerEvent) => hover(e, 0);
  document.addEventListener('pointerdown', down);
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  document.addEventListener('dragend', release);
  document.addEventListener('pointerover', over);
  document.addEventListener('pointerout', out);
  return () => {
    document.removeEventListener('pointerdown', down);
    document.removeEventListener('pointerup', release);
    document.removeEventListener('pointercancel', release);
    document.removeEventListener('dragend', release);
    document.removeEventListener('pointerover', over);
    document.removeEventListener('pointerout', out);
  };
}

/* ---------- Things that appear and disappear ---------- */

/** A new screen: the content fades in. Opacity only, so nothing shifts while someone is already reaching for it. */
export function routeIn(el: HTMLElement | null) {
  if (!el || reducedMotion()) return;
  gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: DUR.route, ease: 'power1.out', clearProps: 'opacity' });
}

/** Summary cards arrive one after another, once per visit. Opacity only, for the same reason. */
export function cascade(els: ArrayLike<Element>) {
  if (!els.length || reducedMotion()) return;
  gsap.fromTo(els, { opacity: 0 }, { opacity: 1, duration: DUR.cascade, stagger: 0.06, ease: 'power1.out', clearProps: 'opacity' });
}

/** A toast slides up from where it will rest. */
export function toastIn(el: HTMLElement) {
  if (reducedMotion()) return;
  gsap.from(el, { opacity: 0, y: 10, duration: DUR.enter, clearProps: 'opacity,transform' });
}

/** A toast leaves faster than it arrives, then `done` removes it from the page. */
export function toastOut(el: HTMLElement | undefined, done: () => void) {
  if (!el || reducedMotion()) return done();
  gsap.to(el, { opacity: 0, y: 6, duration: DUR.exit, ease: EASE.in, overwrite: 'auto', onComplete: done });
}

/** The confirm dialog grows from slightly smaller while the dimmed backdrop fades up (CSS reads `--bd` for the backdrop). */
export function dialogIn(el: HTMLElement) {
  if (reducedMotion()) return;
  gsap.fromTo(el, { opacity: 0, y: 12, scale: 0.97, '--bd': 0 }, { opacity: 1, y: 0, scale: 1, '--bd': 1, duration: DUR.enter, clearProps: 'opacity,transform,--bd' });
}

export { gsap };

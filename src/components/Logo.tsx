/**
 * The MyMoney mark: a blocky "M" (two pillars under a stepped bar, with a short stem hanging between them),
 * drawn on a 100-unit grid so it stays crisp at any size. It is an original construction inspired by the owner's reference,
 * and carries no registered-trademark sign.
 */
export const LOGO_PATH = 'M6 94V34h16V14h56v20h16v60H70V46H60v34H40V46H30v48z';

/** The M on its own, filled with the current text colour. */
export function LogoMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden fill="currentColor">
      <path d={LOGO_PATH} />
    </svg>
  );
}

/** The app icon: the M in brand mint on a near-black tile (same in light and dark mode, like an app icon). */
export function Logo() {
  return (
    <span className="brand-mark" aria-hidden>
      <LogoMark size={22} />
    </span>
  );
}

// fx.ts — lightweight DOM visual effects (no libraries).
//   - sparkBurst(el): a small particle burst flying up from a button (Run).
//   - glowPulse(el): a one-shot orange glow pulse on the stage when a tensor renders.
// All effects are CSS-driven; classes/styles live in style.css.

const reduceMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Spawn a burst of small spark particles centered on `el`. The particles are
 * appended to <body> and removed when their animation ends.
 */
export function sparkBurst(el: HTMLElement, count = 12): void {
  if (reduceMotion()) return;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'fx-spark';
    const angle = (Math.PI * (0.15 + Math.random() * 0.7)) * -1; // mostly upward
    const dist = 28 + Math.random() * 46;
    const dx = Math.cos(angle) * dist * (Math.random() < 0.5 ? -1 : 1);
    const dy = -Math.abs(Math.sin(angle) * dist) - 18;
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    p.style.setProperty('--dx', `${dx}px`);
    p.style.setProperty('--dy', `${dy}px`);
    p.style.animationDelay = `${Math.random() * 60}ms`;
    document.body.appendChild(p);
    p.addEventListener('animationend', () => p.remove(), { once: true });
    // Safety cleanup in case animationend doesn't fire.
    window.setTimeout(() => p.remove(), 1200);
  }
}

/** One-shot glow pulse on the stage (or any element). */
export function glowPulse(el: HTMLElement): void {
  if (reduceMotion()) return;
  el.classList.remove('fx-glow');
  // Force reflow so the animation can restart if triggered rapidly.
  void el.offsetWidth;
  el.classList.add('fx-glow');
  el.addEventListener(
    'animationend',
    () => el.classList.remove('fx-glow'),
    { once: true },
  );
}

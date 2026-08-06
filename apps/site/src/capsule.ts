import { useEffect } from 'react';

/*
 * Pointer-tracked specular highlight for the Liquid Capsule.
 *
 * One delegated `pointermove` listener on the document rather than a handler
 * per control: the number of buttons on a page is not bounded, and the site's
 * Content-Security-Policy is `script-src 'self'` with no `'unsafe-inline'`, so
 * this cannot be an inline attribute either way.
 *
 * The highlight is a progressive enhancement. Without it the capsule keeps the
 * fixed sheen position declared in CSS, which is why the control still looks
 * lit in server-rendered HTML and on a touch device that never sends a
 * pointermove.
 */

export function useCapsuleSheen() {
  useEffect(() => {
    // A fine pointer is the only input that can produce a meaningful highlight
    // position. On touch, tracking would light the capsule under the finger
    // that is already covering it.
    if (!matchMedia('(pointer: fine)').matches) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    let pending: { target: HTMLElement; x: number; y: number } | null = null;

    const flush = () => {
      frame = 0;
      if (pending === null) return;
      const { target, x, y } = pending;
      pending = null;
      target.style.setProperty('--sheen-x', `${x}%`);
      target.style.setProperty('--sheen-y', `${y}%`);
    };

    const onPointerMove = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>('.button');
      if (target === null || target === undefined) return;
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      pending = {
        target,
        x: Math.round(((event.clientX - rect.left) / rect.width) * 100),
        y: Math.round(((event.clientY - rect.top) / rect.height) * 100),
      };
      // Coalesced to one write per frame: pointermove fires far faster than the
      // compositor can paint, and an unthrottled style write on every event is
      // a measurable input-latency cost on a low-end device.
      if (frame === 0) frame = requestAnimationFrame(flush);
    };

    const onPointerLeave = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>('.button');
      if (target === null || target === undefined) return;
      target.style.removeProperty('--sheen-x');
      target.style.removeProperty('--sheen-y');
    };

    addEventListener('pointermove', onPointerMove, { passive: true });
    addEventListener('pointerout', onPointerLeave, { passive: true });
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('pointerout', onPointerLeave);
    };
  }, []);
}

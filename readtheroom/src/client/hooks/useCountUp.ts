import { useEffect, useState } from 'react';

/**
 * Counts from 0 up to `target` with an ease-out curve once `active` flips
 * true. Powers the score reveal.
 */
export const useCountUp = (
  target: number,
  active: boolean,
  durationMs = 1200
): number => {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durationMs]);

  return value;
};

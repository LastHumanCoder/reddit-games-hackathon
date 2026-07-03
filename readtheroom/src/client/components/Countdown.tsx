import { useEffect, useState } from 'react';

const msUntilNextUtcMidnight = (): number => {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  return next.getTime() - now.getTime();
};

const format = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

/** Ticking countdown to the next daily prompt (00:00 UTC). */
export const Countdown = () => {
  const [remaining, setRemaining] = useState(msUntilNextUtcMidnight);

  useEffect(() => {
    const id = setInterval(() => setRemaining(msUntilNextUtcMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className="rtr-countdown">
      Next room opens in <strong>{format(remaining)}</strong>
    </p>
  );
};

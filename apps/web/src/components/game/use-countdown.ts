import { useEffect, useState } from 'react';

export function useCountdown(deadline: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;

    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    const onVisibility = () => setNow(Date.now());

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [deadline]);

  if (!deadline) return null;

  const target = new Date(deadline).getTime();

  if (!Number.isFinite(target)) return null;

  return Math.max(0, (target - now) / 1000);
}

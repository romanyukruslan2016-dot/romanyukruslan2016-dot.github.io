import { useEffect, useState } from 'react';

function getElapsedMinutes(createdAt: string): number {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(diffMs / 60_000));
}

export function useOrderTimer(createdAt: string): number {
  const [minutes, setMinutes] = useState(() => getElapsedMinutes(createdAt));

  useEffect(() => {
    const tick = () => setMinutes(getElapsedMinutes(createdAt));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [createdAt]);

  return minutes;
}

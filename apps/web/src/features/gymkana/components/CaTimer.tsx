// The time left at a station, as a bar that empties; at zero, the station is answered with what was written.
import { useEffect, useEffectEvent, useState } from 'react';
import { caTimerStrings as s } from './strings/CaTimer.strings';

const TICK_MS = 250;

export function CaTimer({ seconds, onTimeout }: { seconds: number; onTimeout: () => void }) {
  const [left, setLeft] = useState(seconds * 1000);
  const timeout = useEffectEvent(onTimeout);
  useEffect(() => {
    const end = Date.now() + seconds * 1000;
    const id = setInterval(() => {
      const ms = Math.max(0, end - Date.now());
      setLeft(ms);
      if (!ms) {
        clearInterval(id);
        timeout();
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [seconds]);
  const secondsLeft = Math.ceil(left / 1000);
  return (
    <div
      role="progressbar"
      aria-label={s.left}
      aria-valuemin={0}
      aria-valuemax={seconds}
      aria-valuenow={secondsLeft}
      aria-valuetext={s.seconds(secondsLeft)}
      className="h-1.5 overflow-hidden rounded-full bg-surface-2"
    >
      <div
        className={`h-full rounded-full ${left < 10_000 ? 'bg-[#c62828] dark:bg-[#ff8a80]' : 'bg-brand'}`}
        style={{ width: `${(100 * left) / (seconds * 1000)}%` }}
      />
    </div>
  );
}

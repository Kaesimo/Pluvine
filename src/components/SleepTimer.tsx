/**
 * Sleep timer: a header button that shows the countdown while running, and a
 * small popover with four durations. While the timer runs, App.tsx fades the
 * chrome away so only the rain and this countdown remain. Expiry behavior is
 * stated in the popover so the timer never needs explaining: the last minute
 * fades out, then playback stops.
 */

import { useEffect, useRef, useState } from 'react';
import { IconCheck } from './icons';

interface Props {
  /** seconds remaining; 0 = timer off */
  remaining: number;
  /** keep the countdown on screen while the chrome is faded away */
  keepVisible: boolean;
  /** set keep-visible (persisted by the caller) */
  onToggleKeepVisible: (value: boolean) => void;
  onStart: (minutes: number) => void;
  onAdd: (minutes: number) => void;
  onCancel: () => void;
  /** extra class for the root (App adds pl-timerband / pl-ui for fade control) */
  className?: string;
}

const DURATIONS = [30, 60, 120, 240];

export function SleepTimer({
  remaining,
  keepVisible,
  onToggleKeepVisible,
  onStart,
  onAdd,
  onCancel,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = remaining > 0;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`relative ${className ?? ''}`} ref={containerRef}>
      <button
        type="button"
        className={`pl-btn is-brass ${active ? 'is-active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          active
            ? `Sleep timer: ${formatTime(remaining)} left. Open sleep timer`
            : 'Open sleep timer'
        }
        onClick={() => setOpen((o) => !o)}
      >
        <span className={active ? 'pl-num' : undefined}>
          {active ? formatTime(remaining) : 'Sleep'}
        </span>
      </button>

      {open && (
        <div
          className="pl-pop absolute right-0 top-[calc(100%+8px)] z-50 w-64 p-4"
          role="dialog"
          aria-label="Sleep timer"
        >
          {active ? (
            <>
              <div className="pl-num text-[24px] leading-none text-brass">
                {formatTime(remaining)}
              </div>
              <div className="mt-1.5 text-[12px] text-faint">until playback stops</div>

              <div className="mt-3.5 flex gap-1.5">
                <button
                  type="button"
                  className="pl-btn flex-1 justify-center"
                  onClick={() => onAdd(15)}
                >
                  +15 min
                </button>
                <button
                  type="button"
                  className="pl-btn flex-1 justify-center"
                  onClick={() => {
                    onCancel();
                    setOpen(false);
                  }}
                >
                  Cancel
                </button>
              </div>

              <p className="mt-3 text-[12px] leading-snug text-faint">
                The screen fades to the rain — move the mouse to bring the
                controls back. The last minute fades out, then playback stops.
              </p>

              <KeepTimerSwitch keepVisible={keepVisible} onToggle={onToggleKeepVisible} />
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                {DURATIONS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className="pl-btn justify-center"
                    onClick={() => {
                      onStart(minutes);
                      setOpen(false);
                    }}
                  >
                    {minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[12px] leading-snug text-faint">
                Starts playback if it is off. The screen fades to the rain —
                move the mouse to bring the controls back. The last minute
                fades out, then playback stops.
              </p>

              <KeepTimerSwitch keepVisible={keepVisible} onToggle={onToggleKeepVisible} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Does the countdown stay on screen while the chrome fades away? */
function KeepTimerSwitch({
  keepVisible,
  onToggle,
}: {
  keepVisible: boolean;
  onToggle: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={keepVisible}
      className="mt-3 flex w-full items-center gap-2 text-left text-[12px] font-medium text-dim transition-colors hover:text-text"
      onClick={() => onToggle(!keepVisible)}
    >
      <span className={`pl-check ${keepVisible ? 'is-on' : ''}`}>
        {keepVisible && <IconCheck size={10} />}
      </span>
      Keep countdown on screen
    </button>
  );
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

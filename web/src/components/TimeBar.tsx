import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

interface Props {
  t: number;
  durationMin: number;
  playing: boolean;
  disabled: boolean;
  onChange: (t: number) => void;
  onPlayingChange: (playing: boolean) => void;
  /** Ticks on the track, e.g. when each action starts. */
  marks?: { min: number; className: string }[];
}

const DISABLED_REASON = "Sem tempo no modo Cenários: mostra a probabilidade final";

/** Seconds of real time to play the whole simulated duration. */
const PLAY_SECONDS = 12;

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")} min`;
}

/** Shared time slider (0..durationMin) with a play button. */
export function TimeBar({ t, durationMin, playing, disabled, onChange, onPlayingChange, marks = [] }: Props) {
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    if (tRef.current >= durationMin) onChange(0);
    const step = (now: number) => {
      const next = Math.min(durationMin, tRef.current + ((now - last) / 1000) * (durationMin / PLAY_SECONDS));
      last = now;
      onChange(next);
      if (next >= durationMin) onPlayingChange(false);
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, durationMin, onChange, onPlayingChange]);

  // At the end the button replays from the start (playing from the end already rewinds to 0, see above).
  const ended = !playing && t >= durationMin;
  return (
    <div className="timebar" title={disabled ? DISABLED_REASON : undefined}>
      <button
        className="play"
        disabled={disabled}
        onClick={() => onPlayingChange(!playing)}
        aria-label={playing ? "Pausa" : ended ? "Recomeçar" : "Reproduzir"}
        title={ended ? "Recomeçar" : undefined}
        aria-keyshortcuts="Space"
        aria-description={disabled ? DISABLED_REASON : undefined}
      >
        <Icon name={playing ? "pause" : ended ? "refresh" : "play"} />
      </button>
      <span className="track">
        {marks
          .filter((m) => m.min > 0 && m.min < durationMin)
          .map((m, i) => (
            <i key={i} className={`tick ${m.className}`} style={{ left: `${(m.min / durationMin) * 100}%` }} />
          ))}
        <input
          type="range"
          aria-label="Tempo simulado"
          min={0}
          max={durationMin}
          step={1}
          value={t}
          disabled={disabled}
          aria-description={disabled ? DISABLED_REASON : undefined}
          onChange={(e) => {
            onPlayingChange(false);
            onChange(Number(e.target.value));
          }}
        />
      </span>
      <span className="time-label">
        {formatMinutes(t)} / {formatMinutes(durationMin)}
      </span>
    </div>
  );
}

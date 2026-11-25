import React from 'react';
import { parseTimestampStringToSeconds } from './SimulatorTypes';

interface TimestampTextProps {
  text: string;
  onSeek: (tsStr: string, seconds: number) => void;
  activeSeekSec?: number | null;
  compact?: boolean;
}

const TS_SPLIT_REGEX = /(\[(?:\d{1,2}:)?\d{1,2}:\d{2}\])/g;
const TS_EXACT_REGEX = /^\[(?:\d{1,2}:)?\d{1,2}:\d{2}\]$/;

export const TimestampText: React.FC<TimestampTextProps> = ({
  text,
  onSeek,
  activeSeekSec = null,
  compact = false
}) => {
  if (!text) return null;
  const parts = text.split(TS_SPLIT_REGEX);

  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;
        if (TS_EXACT_REGEX.test(part)) {
          const sec = parseTimestampStringToSeconds(part);
          if (sec !== null) {
            const isCurrent = activeSeekSec !== null && Math.abs(activeSeekSec - sec) <= 1;
            return (
              <button
                key={`${part}-${idx}`}
                type="button"
                data-seek-sec={sec}
                data-seek-ts={part}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(part, sec);
                }}
                title={`Seek player & transcript cue to ${part}`}
                className={`yt-ts-jump-btn inline-flex items-center font-mono tabular-nums rounded-md border transition-colors cursor-pointer mx-0.5 align-baseline ${
                  compact ? 'px-1 py-0 text-[10px]' : 'px-1.5 py-0.5 text-[11px]'
                } ${
                  isCurrent
                    ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] border-[var(--md-sys-color-primary)] font-bold shadow-xs'
                    : 'bg-[var(--md-sys-color-primary-container)] hover:opacity-85 text-[var(--md-sys-color-on-primary-container)] border-[var(--md-sys-color-outline-variant)]'
                }`}
              >
                {part}
              </button>
            );
          }
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </>
  );
};

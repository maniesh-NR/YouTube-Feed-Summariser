import React from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import {
  buildResponseRatingKey,
  type ResponseRatingRecord
} from '../utils/userscript-helpers';

interface ResponseRatingBarProps {
  videoId: string;
  targetType: 'summary' | 'transcript' | 'followup';
  targetId?: string;
  label?: string;
  compact?: boolean;
  theme?: 'system' | 'light' | 'sepia' | 'dark';
  responseRatings: Record<string, ResponseRatingRecord>;
  openRatingNoteKey: string | null;
  setOpenRatingNoteKey: React.Dispatch<React.SetStateAction<string | null>>;
  onRateResponse: (
    videoId: string,
    targetType: 'summary' | 'transcript' | 'followup',
    rating: 'up' | 'down',
    targetId: string,
    note?: string
  ) => void;
  onShowToast: (msg: string, targetVideoId?: string | null) => void;
}

export const ResponseRatingBar: React.FC<ResponseRatingBarProps> = ({
  videoId,
  targetType,
  targetId = 'main',
  label = 'Rate this summary',
  compact = false,
  responseRatings,
  openRatingNoteKey,
  setOpenRatingNoteKey,
  onRateResponse,
  onShowToast
}) => {
  const key = buildResponseRatingKey(videoId, targetType, targetId);
  const current = responseRatings[key];

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] yt-rating-bar ${
        compact ? 'px-2.5 py-1.5 text-[11px] mt-1.5 compact' : 'px-3.5 py-2.5 text-xs mt-4'
      }`}
      data-rating-target={targetType}
      data-rating-id={targetId}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium yt-rating-label">{label}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onRateResponse(videoId, targetType, 'up', targetId)}
            aria-pressed={current?.rating === 'up'}
            data-rating="up"
            title="Helpful response (Thumbs Up)"
            className={`inline-flex items-center gap-1 rounded-full border font-medium transition-colors cursor-pointer yt-rating-btn yt-rating-up ${
              compact ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
            } ${
              current?.rating === 'up'
                ? 'bg-[var(--md-sys-color-success-container)] text-[var(--md-sys-color-on-success-container)] border-[var(--md-sys-color-success)] active'
                : 'bg-[var(--md-sys-color-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)] border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <ThumbsUp className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            <span>Helpful</span>
          </button>
          <button
            type="button"
            onClick={() => onRateResponse(videoId, targetType, 'down', targetId)}
            aria-pressed={current?.rating === 'down'}
            data-rating="down"
            title="Needs improvement (Thumbs Down)"
            className={`inline-flex items-center gap-1 rounded-full border font-medium transition-colors cursor-pointer yt-rating-btn yt-rating-down ${
              compact ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
            } ${
              current?.rating === 'down'
                ? 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] border-[var(--md-sys-color-error)] active'
                : 'bg-[var(--md-sys-color-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)] border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <ThumbsDown className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            <span>Not helpful</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {current && (
          <span className="text-[11px] font-medium text-[var(--md-sys-color-primary)] yt-rating-status">
            {current.rating === 'up' ? 'Rated Helpful' : 'Feedback saved'}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpenRatingNoteKey((prev) => (prev === key ? null : key))}
          className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] underline cursor-pointer yt-rating-note-toggle"
        >
          {openRatingNoteKey === key ? 'Hide note' : current?.note ? 'Edit note' : 'Add note'}
        </button>
      </div>

      {openRatingNoteKey === key && (
        <div className="w-full flex items-center gap-2 pt-1.5 border-t border-[var(--md-sys-color-outline-variant)]">
          <input
            type="text"
            defaultValue={current?.note || ''}
            placeholder="Optional feedback note..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const val = (e.currentTarget as HTMLInputElement).value.trim();
                onRateResponse(videoId, targetType, current?.rating || 'up', targetId, val);
                setOpenRatingNoteKey(null);
                onShowToast('✓ Rating feedback saved', videoId);
              }
            }}
            onBlur={(e) => {
              const val = e.currentTarget.value.trim();
              if (val || current?.note) {
                onRateResponse(videoId, targetType, current?.rating || 'up', targetId, val);
              }
            }}
            className="flex-1 bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1 text-xs text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)] focus:outline-none focus:border-[var(--md-sys-color-primary)] yt-rating-note-input"
          />
        </div>
      )}
    </div>
  );
};

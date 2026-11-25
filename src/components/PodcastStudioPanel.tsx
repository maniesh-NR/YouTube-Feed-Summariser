import React from 'react';
import {
  Headphones,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Square,
  Mic,
  MicOff,
  Send,
  Sparkles,
  RefreshCw,
  Clock
} from 'lucide-react';
import {
  formatMathSymbolsInText,
  formatSecondsToTimestamp,
  type AdaptiveWindowFlags,
  type GeminiPrebuiltVoice,
  type PodcastEpisode,
  type PodcastHost
} from '../utils/userscript-helpers';

const GEMINI_VOICE_OPTIONS: Array<{ voiceName: GeminiPrebuiltVoice; label: string }> = [
  { voiceName: 'Kore', label: 'Kore (Female)' },
  { voiceName: 'Puck', label: 'Puck (Male)' },
  { voiceName: 'Zephyr', label: 'Zephyr (Female)' },
  { voiceName: 'Fenrir', label: 'Fenrir (Male)' },
  { voiceName: 'Charon', label: 'Charon (Male)' }
];

interface PodcastStudioPanelProps {
  videoId: string;
  videoTitle: string;
  adaptive: AdaptiveWindowFlags;
  hostCount: number;
  hosts: PodcastHost[];
  episode: PodcastEpisode | null;
  isGenerating: boolean;
  isInteracting: boolean;
  isListeningVoice: boolean;
  playbackStatus: 'idle' | 'playing' | 'paused';
  activeTurnIdx: number;
  playbackRate: number;
  qaDraft: string;
  onChangeHostCount: (count: number) => void;
  onUpdateHost: (index: number, field: 'name' | 'voiceName', value: string) => void;
  onGenerateEpisode: () => void;
  onTogglePlayback: () => void;
  onStepTurn: (delta: number) => void;
  onStopPlayback: () => void;
  onChangeRate: (rate: number) => void;
  onPlayFromTurn: (idx: number) => void;
  onChangeQaDraft: (val: string) => void;
  onSubmitInteraction: (query?: string, isVoice?: boolean) => void;
  onToggleVoiceQuestion: () => void;
  onSeekTimestamp: (tsStr: string, seconds: number) => void;
}

export const PodcastStudioPanel: React.FC<PodcastStudioPanelProps> = ({
  videoId,
  videoTitle,
  adaptive,
  hostCount,
  hosts,
  episode,
  isGenerating,
  isInteracting,
  isListeningVoice,
  playbackStatus,
  activeTurnIdx,
  playbackRate,
  qaDraft,
  onChangeHostCount,
  onUpdateHost,
  onGenerateEpisode,
  onTogglePlayback,
  onStepTurn,
  onStopPlayback,
  onChangeRate,
  onPlayFromTurn,
  onChangeQaDraft,
  onSubmitInteraction,
  onToggleVoiceQuestion,
  onSeekTimestamp
}) => {
  const safeIdx =
    episode && episode.turns.length > 0
      ? Math.max(0, Math.min(activeTurnIdx, episode.turns.length - 1))
      : 0;
  const activeTurn = episode?.turns?.[safeIdx] || null;
  const statusLabel = isInteracting
    ? 'Hosts are responding to your question...'
    : playbackStatus === 'playing' && activeTurn
    ? `Speaking: ${activeTurn.speaker} (${activeTurn.voiceName || 'Kore'}) · ${safeIdx + 1}/${episode?.turns.length || 0}`
    : playbackStatus === 'paused' && activeTurn
    ? `Paused at ${activeTurn.speaker} · ${safeIdx + 1}/${episode?.turns.length || 0}`
    : episode
    ? `Ready · ${episode.turns.length} turns · ${episode.hostCount} hosts`
    : 'Configure hosts and generate your roundtable audio overview.';

  return (
    <div className="space-y-3 min-w-0 yt-podcast-studio" data-podcast-video-id={videoId}>
      {/* Host Configuration & Generate Card */}
      <div className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-3.5 space-y-3 yt-podcast-setup-card">
        <div className="flex flex-wrap items-center justify-between gap-2.5 yt-podcast-setup-top">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--md-sys-color-on-surface)] yt-podcast-title">
              <Headphones className="w-4 h-4 text-[var(--md-sys-color-primary)] flex-shrink-0" />
              <span>Audio Overview &middot; Interactive Podcast</span>
            </div>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5 yt-podcast-subtitle">
              Multi-host discussion generated from the video summary — interrupt anytime by text or voice.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 yt-podcast-host-controls">
            <label
              htmlFor={`sim-pod-hosts-${videoId}`}
              className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)] yt-podcast-host-label"
            >
              Hosts:
            </label>
            <button
              type="button"
              onClick={() => onChangeHostCount(hostCount - 1)}
              disabled={hostCount <= 2 || isGenerating}
              aria-label="Decrease host count"
              className="w-7 h-7 rounded-full bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] disabled:opacity-40 border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-xs font-semibold cursor-pointer yt-podcast-count-btn yt-podcast-count-minus"
            >
              -
            </button>
            <select
              id={`sim-pod-hosts-${videoId}`}
              aria-label="Number of podcast hosts"
              value={hostCount}
              onChange={(e) => onChangeHostCount(parseInt(e.target.value, 10))}
              disabled={isGenerating}
              className="m3-select bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-2.5 py-1 text-xs focus:outline-none cursor-pointer yt-podcast-host-count-select"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option
                  key={n}
                  value={n}
                  className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                >
                  {n} Hosts
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onChangeHostCount(hostCount + 1)}
              disabled={hostCount >= 6 || isGenerating}
              aria-label="Increase host count"
              className="w-7 h-7 rounded-full bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] disabled:opacity-40 border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-xs font-semibold cursor-pointer yt-podcast-count-btn yt-podcast-count-plus"
            >
              +
            </button>

            <button
              type="button"
              onClick={onGenerateEpisode}
              disabled={isGenerating}
              className="px-3.5 py-1.5 rounded-full bg-[var(--md-sys-color-primary)] hover:opacity-90 disabled:opacity-50 text-[var(--md-sys-color-on-primary)] font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-opacity yt-podcast-generate-btn"
            >
              {isGenerating ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>
                {isGenerating
                  ? 'Composing Show...'
                  : episode
                  ? 'Regenerate Podcast'
                  : 'Generate Podcast'}
              </span>
            </button>
          </div>
        </div>

        {/* Editable Host Roster */}
        <div
          className={`grid gap-2 yt-podcast-hosts-grid ${
            adaptive.isCompact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          {hosts.map((host, idx) => (
            <div
              key={host.id}
              data-host-index={idx}
              className="flex items-center gap-2 p-2.5 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] min-w-0 yt-podcast-host-card"
            >
              <div
                style={{
                  borderColor: host.color,
                  color: host.color
                }}
                className="w-7 h-7 rounded-full border bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-center text-xs font-bold flex-shrink-0 yt-podcast-host-avatar"
              >
                {(host.name || 'H').slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 yt-podcast-host-meta">
                <input
                  type="text"
                  value={host.name}
                  maxLength={28}
                  aria-label={`Host ${idx + 1} name`}
                  onChange={(e) => onUpdateHost(idx, 'name', e.target.value)}
                  className="w-full bg-transparent text-xs font-semibold text-[var(--md-sys-color-on-surface)] border-b border-transparent focus:border-[var(--md-sys-color-primary)] focus:outline-none truncate yt-podcast-host-name-input"
                />
                <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate yt-podcast-host-role">
                  {host.role}
                </div>
              </div>
              <select
                aria-label={`Host ${idx + 1} voice`}
                value={host.voiceName}
                onChange={(e) => onUpdateHost(idx, 'voiceName', e.target.value)}
                className="m3-select bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-2 py-1 text-[11px] focus:outline-none cursor-pointer flex-shrink-0 max-w-[138px] yt-podcast-host-voice-select"
              >
                {GEMINI_VOICE_OPTIONS.map((v) => (
                  <option
                    key={v.voiceName}
                    value={v.voiceName}
                    className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                  >
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {!episode ? (
        <div className="bg-[var(--md-sys-color-surface-container-low)] border border-dashed border-[var(--md-sys-color-outline-variant)] rounded-2xl p-6 text-center space-y-2 yt-podcast-empty">
          <div className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
            Ready to turn &ldquo;{videoTitle}&rdquo; into a {hostCount}-host interactive podcast
          </div>
          <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] max-w-md mx-auto">
            Customize the number of hosts (2&ndash;6), names, and neural voices above, then click{' '}
            <strong>Generate Podcast</strong>. You can interrupt with typed or spoken questions at any point.
          </p>
        </div>
      ) : (
        <>
          {/* Player Bar */}
          <div className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-3 space-y-2.5 yt-podcast-player-card">
            <div className="flex flex-wrap items-center justify-between gap-2 min-w-0 yt-podcast-player-info">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] truncate yt-podcast-ep-title">
                  {episode.title}
                </div>
                <div className="text-[11px] text-[var(--md-sys-color-primary)] mt-0.5 truncate yt-podcast-now-playing">
                  {statusLabel}
                </div>
              </div>
              {typeof episode.totalParts === 'number' && episode.totalParts >= 1 && (
                <span
                  data-testid="podcast-gen-badge"
                  className={`yt-podcast-gen-badge inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium border flex-shrink-0 ${
                    episode.isComplete
                      ? 'bg-[var(--md-sys-color-success-container)] text-[var(--md-sys-color-on-success-container)] border-[var(--md-sys-color-success)]/35 complete'
                      : 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-[var(--md-sys-color-primary)]/35 streaming'
                  }`}
                >
                  {episode.isComplete
                    ? `Full summary (${episode.totalParts} ${episode.totalParts === 1 ? 'part' : 'parts'} · ${episode.turns.length} turns)`
                    : `Streaming Part ${episode.generatedParts || 1} of ${episode.totalParts}…`}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 yt-podcast-player-controls">
              <button
                type="button"
                onClick={() => onStepTurn(-1)}
                title="Previous speaker turn"
                aria-label="Previous speaker turn"
                className="p-1.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] cursor-pointer yt-podcast-prev-btn"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onTogglePlayback}
                className={`px-3.5 py-1.5 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors yt-podcast-play-btn ${
                  playbackStatus === 'playing'
                    ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] border-[var(--md-sys-color-primary)] active'
                    : 'bg-[var(--md-sys-color-secondary-container)] hover:opacity-90 text-[var(--md-sys-color-on-secondary-container)] border-[var(--md-sys-color-outline-variant)]'
                }`}
              >
                {playbackStatus === 'playing' ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{playbackStatus === 'paused' ? 'Resume' : 'Play Episode'}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => onStepTurn(1)}
                title="Next speaker turn"
                aria-label="Next speaker turn"
                className="p-1.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] cursor-pointer yt-podcast-next-btn"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onStopPlayback}
                title="Stop podcast playback"
                aria-label="Stop podcast playback"
                className="p-1.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] cursor-pointer yt-podcast-stop-btn"
              >
                <Square className="w-3.5 h-3.5" />
              </button>

              <select
                aria-label="Podcast playback speed"
                value={playbackRate}
                onChange={(e) => onChangeRate(parseFloat(e.target.value))}
                className="m3-select ml-auto bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-2.5 py-1 text-[11px] focus:outline-none cursor-pointer yt-podcast-speed-select"
              >
                {[0.85, 1.0, 1.15, 1.25, 1.5].map((r) => (
                  <option
                    key={r}
                    value={r}
                    className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                  >
                    {r}x speed
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Interactive Listener Join-In Bar (Typed + Voice) */}
          <div className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-primary)]/40 rounded-2xl p-2.5 flex items-center gap-2 min-w-0 yt-podcast-qa-bar">
            <input
              type="text"
              value={qaDraft}
              onChange={(e) => onChangeQaDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!isInteracting && qaDraft.trim()) {
                    onSubmitInteraction(qaDraft, false);
                  }
                }
              }}
              placeholder="Interrupt hosts with a typed or voice question (Enter to ask)..."
              className="flex-1 min-w-0 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-3.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)] focus:outline-none focus:border-[var(--md-sys-color-primary)] yt-podcast-qa-input"
            />
            <button
              type="button"
              onClick={onToggleVoiceQuestion}
              aria-label="Voice question to podcast hosts"
              title={
                isListeningVoice
                  ? 'Listening... click to cancel'
                  : 'Speak a live question (pauses show & sends to hosts)'
              }
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all cursor-pointer yt-podcast-mic-btn ${
                isListeningVoice
                  ? 'bg-[var(--md-sys-color-error)] text-[var(--md-sys-color-on-primary)] ring-2 ring-[var(--md-sys-color-error)]/40 yt-mic-recording'
                  : 'bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)]'
              }`}
            >
              {isListeningVoice ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => onSubmitInteraction(qaDraft, false)}
              disabled={isInteracting || !qaDraft.trim()}
              className="px-3.5 py-1.5 rounded-full bg-[var(--md-sys-color-primary)] hover:opacity-90 disabled:opacity-40 text-[var(--md-sys-color-on-primary)] font-semibold text-xs inline-flex items-center gap-1.5 flex-shrink-0 cursor-pointer yt-podcast-ask-btn"
            >
              <Send className="w-3 h-3" />
              <span>{isInteracting ? 'Asking...' : 'Ask Hosts'}</span>
            </button>
          </div>

          {/* Multi-Host Dialogue Timeline */}
          <div className="space-y-2 yt-podcast-dialogue-list">
            {episode.turns.map((turn, idx) => {
              const matchedHost = episode.hosts.find(
                (h) => h.name.toLowerCase() === turn.speaker.toLowerCase()
              );
              const accent = turn.isUser
                ? 'var(--md-sys-color-primary)'
                : matchedHost?.color || 'var(--md-sys-color-tertiary)';
              const isCurrent = idx === safeIdx;
              return (
                <div
                  key={turn.id}
                  data-turn-idx={idx}
                  onClick={() => onPlayFromTurn(idx)}
                  className={`rounded-2xl p-3 border text-xs transition-colors cursor-pointer yt-podcast-turn ${
                    turn.isUser
                      ? 'bg-[var(--md-sys-color-primary-container)]/50 border-[var(--md-sys-color-primary)]/40 yt-podcast-turn-user'
                      : turn.isResponse
                      ? 'bg-[var(--md-sys-color-tertiary-container)]/50 border-[var(--md-sys-color-tertiary)]/40 yt-podcast-turn-reply'
                      : isCurrent
                      ? 'bg-[var(--md-sys-color-surface-container-high)] border-[var(--md-sys-color-primary)] shadow-xs'
                      : 'bg-[var(--md-sys-color-surface-container-low)] border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-outline)]'
                  } ${isCurrent ? 'active' : ''}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1 yt-podcast-turn-head">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        style={{ color: accent }}
                        className="font-semibold text-xs yt-podcast-turn-speaker"
                      >
                        {turn.speaker}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] yt-podcast-turn-role">
                        {turn.isVoiceInput ? 'Voice Interruption' : turn.role}
                      </span>
                    </div>
                    {typeof turn.timestampSec === 'number' && Number.isFinite(turn.timestampSec) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const tsStr = `[${formatSecondsToTimestamp(turn.timestampSec!)}]`;
                          onSeekTimestamp(tsStr, turn.timestampSec!);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--md-sys-color-primary-container)] hover:opacity-90 text-[var(--md-sys-color-on-primary-container)] border border-[var(--md-sys-color-primary)]/30 font-mono text-[10px] tabular-nums cursor-pointer yt-podcast-ts-jump"
                        title={`Jump player to ${formatSecondsToTimestamp(turn.timestampSec)}`}
                      >
                        <Clock className="w-2.5 h-2.5" />
                        <span>{formatSecondsToTimestamp(turn.timestampSec)}</span>
                      </button>
                    )}
                  </div>
                  <div className="text-[var(--md-sys-color-on-surface)] leading-relaxed yt-podcast-turn-text">
                    {formatMathSymbolsInText(turn.text)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

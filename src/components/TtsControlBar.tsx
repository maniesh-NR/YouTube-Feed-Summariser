import React from 'react';
import {
  Play,
  Pause,
  Square,
  Volume2,
  RotateCcw,
  RotateCw,
  Music,
  FastForward
} from 'lucide-react';
import { TtsWaveformVisualizer } from './TtsWaveformVisualizer';
import { getGranularTtsRates, type AdaptiveWindowFlags, type EffectiveTheme } from '../utils/userscript-helpers';

interface TtsControlBarProps {
  videoId: string;
  mode: 'summary' | 'transcript' | 'podcast';
  contentText: string;
  tts: { status: 'idle' | 'playing' | 'paused'; rate: number };
  currentVol: number;
  currentPitch: number;
  skipSilence: boolean;
  selectedVoice: string;
  browserVoices: SpeechSynthesisVoice[];
  activeTtsTs: string | null;
  adaptive: AdaptiveWindowFlags;
  effectiveTheme?: EffectiveTheme;
  onSelectVoice: (voice: string) => void;
  onToggleTts: () => void;
  onRewindTts: () => void;
  onSkipTts: () => void;
  onStopTts: () => void;
  onSetRate: (rate: number) => void;
  onCycleRate: () => void;
  onSetVolume: (vol: number) => void;
  onSetPitch: (pitch: number) => void;
  onToggleSkipSilence: () => void;
}

export const TtsControlBar: React.FC<TtsControlBarProps> = ({
  mode,
  tts,
  currentVol,
  currentPitch,
  skipSilence,
  selectedVoice,
  browserVoices,
  activeTtsTs,
  adaptive,
  effectiveTheme = 'light',
  onSelectVoice,
  onToggleTts,
  onRewindTts,
  onSkipTts,
  onStopTts,
  onSetRate,
  onCycleRate,
  onSetVolume,
  onSetPitch,
  onToggleSkipSilence
}) => {
  const isPlaying = tts.status === 'playing';
  const isPaused = tts.status === 'paused';
  const granularRates = getGranularTtsRates();

  return (
    <div
      data-compact-tts={adaptive.compactTtsBar ? 'true' : 'false'}
      className={`flex flex-wrap items-center bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] max-w-full min-w-0 box-border yt-tts-control-bar ${
        adaptive.isCompact
          ? 'gap-x-1 gap-y-1 p-1 px-1.5 rounded-2xl'
          : adaptive.compactTtsBar
          ? 'gap-x-1.5 gap-y-1 p-1.5 px-2 rounded-2xl'
          : 'gap-x-1.5 gap-y-1 p-1.5 px-2.5 rounded-full'
      }`}
    >
      {/* Voice Selector */}
      <select
        aria-label="Speech Voice"
        value={selectedVoice}
        onChange={(e) => onSelectVoice(e.target.value)}
        className={`m3-select bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-2.5 py-0.5 text-[11px] focus:outline-none cursor-pointer truncate min-w-0 max-w-full yt-tts-voice-select ${
          adaptive.isCompact ? 'flex-1 basis-[110px]' : 'max-w-[140px] flex-shrink'
        }`}
        title="Select TTS Voice (Google AI Studio Neural Voice or Browser Voice)"
      >
        <optgroup label="Google AI Studio (Studio Neural)">
          <option value="ai:Kore">Kore (Warm)</option>
          <option value="ai:Puck">Puck (Narrator)</option>
          <option value="ai:Zephyr">Zephyr (Bright)</option>
          <option value="ai:Fenrir">Fenrir (Deep)</option>
          <option value="ai:Charon">Charon (Calm)</option>
        </optgroup>
        <optgroup label="Browser Voices (Web Speech)">
          {browserVoices.length > 0 ? (
            browserVoices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name.slice(0, 18)}
              </option>
            ))
          ) : (
            <option value="browser:default">System Voice</option>
          )}
        </optgroup>
      </select>

      <button
        type="button"
        onClick={onToggleTts}
        className={`flex items-center gap-1 rounded-full text-xs font-medium transition-all flex-shrink-0 whitespace-nowrap cursor-pointer ${
          adaptive.isCompact ? 'px-2 py-0.5' : 'px-3 py-1 gap-1.5'
        } ${
          isPlaying
            ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-semibold shadow-xs'
            : isPaused
            ? 'bg-[var(--md-sys-color-warning-container)] text-[var(--md-sys-color-on-warning-container)] border border-[var(--md-sys-color-warning)]/40'
            : 'text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)]'
        }`}
        title={isPlaying ? 'Pause speech' : isPaused ? 'Resume speech' : 'Listen to summary (Web Speech / AI Studio TTS)'}
      >
        {isPlaying ? (
          <Pause className="w-3.5 h-3.5 fill-current" />
        ) : isPaused ? (
          <Play className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Volume2 className="w-3.5 h-3.5" />
        )}
        <span>{isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Listen'}</span>
      </button>

      <button
        type="button"
        onClick={onRewindTts}
        disabled={tts.status === 'idle'}
        aria-label="Rewind 5 seconds"
        className={`flex items-center gap-0.5 rounded-full text-xs text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)] disabled:opacity-30 disabled:hover:bg-transparent transition-all flex-shrink-0 whitespace-nowrap yt-tts-rewind-btn cursor-pointer ${
          adaptive.isCompact ? 'px-1.5 py-0.5' : 'px-2 py-1'
        }`}
        title="Rewind 5s (Left Arrow or J)"
      >
        <RotateCcw className="w-3 h-3" />
        <span className={adaptive.isCompact ? 'hidden' : 'text-[10px] font-mono tabular-nums'}>5s</span>
      </button>

      <button
        type="button"
        onClick={onSkipTts}
        disabled={tts.status === 'idle'}
        aria-label="Skip forward 5 seconds"
        className={`flex items-center gap-0.5 rounded-full text-xs text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)] disabled:opacity-30 disabled:hover:bg-transparent transition-all flex-shrink-0 whitespace-nowrap yt-tts-skip-btn cursor-pointer ${
          adaptive.isCompact ? 'px-1.5 py-0.5' : 'px-2 py-1'
        }`}
        title="Skip 5s (Right Arrow or L)"
      >
        <RotateCw className="w-3 h-3" />
        <span className={adaptive.isCompact ? 'hidden' : 'text-[10px] font-mono tabular-nums'}>5s</span>
      </button>

      <button
        type="button"
        onClick={onStopTts}
        disabled={tts.status === 'idle'}
        className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] disabled:opacity-30 disabled:hover:bg-transparent flex-shrink-0 cursor-pointer"
        title="Stop speech"
        aria-label="Stop speech"
      >
        <Square className="w-3.5 h-3.5 fill-current" />
      </button>

      <TtsWaveformVisualizer
        isPlaying={isPlaying}
        volume={currentVol}
        pitch={currentPitch}
        rate={tts.rate}
        compact={adaptive.isCompact}
        effectiveTheme={effectiveTheme}
      />

      {/* Playback Speed Controls */}
      <div
        className={`flex flex-wrap items-center gap-1.5 px-1.5 max-w-full min-w-0 ${
          adaptive.compactTtsBar ? '' : 'border-l border-[var(--md-sys-color-outline-variant)] ml-0.5'
        } yt-tts-speed-wrap`}
      >
        <button
          type="button"
          onClick={onCycleRate}
          className="px-2 py-0.5 text-[10px] font-mono tabular-nums font-semibold rounded-full transition-all flex items-center gap-1.5 bg-[var(--md-sys-color-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] flex-shrink-0 whitespace-nowrap yt-tts-speed-btn cursor-pointer"
          title={`Playback speed: ${tts.rate}x (click to cycle 0.25x steps)`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full yt-tts-speed-indicator ${
              Math.abs(tts.rate - 1.0) < 0.01
                ? 'bg-[var(--md-sys-color-primary)]'
                : tts.rate > 1.0
                ? 'bg-amber-500'
                : 'bg-[var(--md-sys-color-tertiary)]'
            }`}
          />
          <span className="font-bold text-[var(--md-sys-color-primary)] yt-tts-speed-text">{tts.rate}x</span>
        </button>
        <div
          className={`items-center gap-0.5 yt-tts-speed-btns ${
            adaptive.isCompact ? 'hidden' : 'inline-flex flex-wrap max-w-full min-w-0'
          }`}
        >
          {granularRates.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onSetRate(r)}
              className={`px-1.5 py-0.5 text-[10px] font-mono tabular-nums font-semibold rounded-full transition-all whitespace-nowrap flex-shrink-0 yt-tts-rate-pill yt-tts-rate-btn cursor-pointer ${
                Math.abs(tts.rate - r) < 0.01
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-bold active'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)]'
              }`}
              title={`Set speed to ${r}x`}
              data-rate={String(r)}
            >
              {r}x
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 pl-1 border-l border-[var(--md-sys-color-outline-variant)] min-w-0 max-w-full yt-tts-slider-row">
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.05"
            aria-label="Speech playback speed"
            value={tts.rate}
            onChange={(e) => onSetRate(parseFloat(e.target.value))}
            className={`${adaptive.isCompact ? 'w-10' : 'w-12'} h-1 bg-[var(--md-sys-color-outline-variant)] rounded-lg appearance-none cursor-pointer accent-[var(--md-sys-color-primary)] yt-tts-speed-slider`}
            title={`Playback speed: ${tts.rate}x`}
          />
          <span className="text-[10px] font-mono tabular-nums text-[var(--md-sys-color-on-surface-variant)] min-w-[24px] text-right yt-tts-speed-label">
            {tts.rate}x
          </span>
        </div>
      </div>

      {/* Volume Control Slider */}
      <div
        className={`flex items-center gap-1.5 px-1.5 min-w-0 max-w-full yt-tts-volume-wrap ${
          adaptive.compactTtsBar ? '' : 'border-l border-[var(--md-sys-color-outline-variant)] ml-0.5'
        }`}
        title={`Speech volume: ${Math.round(currentVol * 100)}%`}
      >
        <Volume2 className="w-3 h-3 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          aria-label="Speech volume"
          value={currentVol}
          onChange={(e) => onSetVolume(parseFloat(e.target.value))}
          className={`${adaptive.isCompact ? 'w-10' : adaptive.compactTtsBar ? 'w-12' : 'w-14'} h-1 bg-[var(--md-sys-color-outline-variant)] rounded-lg appearance-none cursor-pointer accent-[var(--md-sys-color-primary)] yt-tts-volume-slider`}
          title={`Speech volume: ${Math.round(currentVol * 100)}%`}
        />
        <span className="text-[10px] font-mono tabular-nums text-[var(--md-sys-color-on-surface-variant)] min-w-[28px] text-right yt-tts-volume-label">
          {Math.round(currentVol * 100)}%
        </span>
      </div>

      {/* Pitch Control Slider */}
      <div
        className={`flex items-center gap-1.5 px-1.5 min-w-0 max-w-full yt-tts-pitch-wrap ${
          adaptive.compactTtsBar ? '' : 'border-l border-[var(--md-sys-color-outline-variant)] ml-0.5'
        }`}
        title={`Voice pitch: ${currentPitch}x`}
      >
        <Music className="w-3 h-3 text-[var(--md-sys-color-tertiary)] flex-shrink-0 yt-tts-pitch-icon" />
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.05"
          aria-label="Speech voice pitch"
          value={currentPitch}
          onChange={(e) => onSetPitch(parseFloat(e.target.value))}
          className={`${adaptive.isCompact ? 'w-10' : adaptive.compactTtsBar ? 'w-12' : 'w-14'} h-1 bg-[var(--md-sys-color-outline-variant)] rounded-lg appearance-none cursor-pointer accent-[var(--md-sys-color-tertiary)] yt-tts-pitch-slider`}
          title={`Voice pitch: ${currentPitch}x`}
        />
        <span className="text-[10px] font-mono tabular-nums text-[var(--md-sys-color-on-surface-variant)] min-w-[24px] text-right yt-tts-pitch-label">
          {currentPitch}x
        </span>
      </div>

      {/* Skip Silence Toggle */}
      <button
        type="button"
        onClick={onToggleSkipSilence}
        aria-label={`Skip Silence: ${skipSilence ? 'ON' : 'OFF'}`}
        className={`flex items-center gap-1 py-0.5 rounded-full text-xs font-medium transition-all border flex-shrink-0 whitespace-nowrap yt-tts-btn yt-tts-skip-silence-btn cursor-pointer ${
          adaptive.isCompact ? 'px-2' : 'px-2.5'
        } ${
          skipSilence
            ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] border-[var(--md-sys-color-primary)]/40 active'
            : 'text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline-variant)] hover:text-[var(--md-sys-color-on-surface)]'
        }`}
        title={
          skipSilence
            ? 'Skip Silence: ON (Automatically detecting and skipping long pauses or gap segments in transcript)'
            : 'Skip Silence: OFF (Click to automatically detect and skip segments with long pauses)'
        }
      >
        <FastForward className="w-3 h-3 text-[var(--md-sys-color-primary)]" />
        <span className={`${adaptive.isCompact ? 'hidden' : 'text-[10px] font-medium'} yt-tts-skip-silence-label`}>
          Skip Silence
        </span>
      </button>

      {!adaptive.compactTtsBar && (
        <span
          className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] px-2 py-0.5 cursor-help hover:text-[var(--md-sys-color-primary)] transition-colors ml-0.5 flex-shrink-0 whitespace-nowrap yt-tts-shortcuts-hint hidden sm:inline-flex items-center"
          title="Global TTS Shortcuts:
• Space or K: Play / Pause
• ← or J: Rewind 5s
• → or L: Skip 5s
• ↑ / ↓: Volume Up / Down"
        >
          Space · &larr; · &rarr;
        </span>
      )}

      {mode === 'transcript' && activeTtsTs && (isPlaying || isPaused) && (
        <span
          className="text-[10px] text-[var(--md-sys-color-on-primary-container)] bg-[var(--md-sys-color-primary-container)] px-2 py-0.5 rounded-full flex items-center gap-1 font-mono tabular-nums yt-tts-speaking-pill"
          title={`Currently speaking line at timestamp ${activeTtsTs}`}
        >
          <Volume2 className="w-2.5 h-2.5" />
          <span>Speaking {activeTtsTs}</span>
        </span>
      )}
    </div>
  );
};

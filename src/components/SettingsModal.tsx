import React, { useRef, useState } from 'react';
import {
  X,
  Sun,
  Moon,
  Monitor,
  SlidersHorizontal,
  RotateCcw,
  Type,
  GripVertical,
  Sparkles,
  Tag,
  Mic,
  Volume2,
  Clock,
  KeyRound,
  Plus,
  Trash2,
  RefreshCw,
  Palette
} from 'lucide-react';
import {
  DEFAULT_GENERATED_TEXT_PREFS,
  DEFAULT_UI_FORMATTING_PREFS,
  SUMMARY_PERSONA_PRESETS,
  PASTEL_ACCENT_PRESETS,
  normalizePodcastHostCount,
  normalizeAccentColorHex,
  hexToRgb,
  rgbToHsl,
  hslToHex,
  colorWheelPointToHex,
  hexToColorWheelPoint,
  type AltTitleGenerationMode,
  type AppThemeMode,
  type ChannelTitleRule,
  type EffectiveTheme,
  type GeneratedFontFamily,
  type GeneratedParagraphSpacing,
  type GeneratedTextFormattingPrefs,
  type HistoryPageScope,
  type HistoryTabVisibility,
  type PodcastHost,
  type PodcastSynthesisMode,
  type ResizeDirection,
  type SummaryPersona,
  type UiDensity,
  type UiFontFamily,
  type UiFormattingPrefs,
  type VoiceInputEngine,
  type WindowBounds
} from '../utils/userscript-helpers';

export interface SummaryDefaultOpts {
  transcriptMode: 'fast' | 'deep';
  fc: boolean;
  autoFactCheck: boolean;
  src: boolean;
  img: boolean;
  gen: boolean;
  gsearch: boolean;
  gmaps: boolean;
  code: boolean;
  fallback: boolean;
  txFallback: boolean;
  think: '' | 'low' | 'medium' | 'high';
  mres: '' | 'MEDIA_RESOLUTION_LOW' | 'MEDIA_RESOLUTION_MEDIUM' | 'MEDIA_RESOLUTION_HIGH';
  retries: number;
  factModel: string;
  imgModel: string;
  imgAspect: string;
}

export interface StoredApiKeyEntry {
  id: string;
  name: string;
  key: string;
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  bounds: WindowBounds;
  zIndex: number;
  onFocus: () => void;
  onStartDrag: (e: React.MouseEvent) => void;
  onStartResize: (dir: ResizeDirection) => (e: React.MouseEvent) => void;
  onResizeKeyDown: (dir: ResizeDirection) => (e: React.KeyboardEvent) => void;
  onGripKeyDown: (e: React.KeyboardEvent) => void;
  // Appearance
  appThemeMode: AppThemeMode;
  effectiveTheme: EffectiveTheme;
  onSetAppThemeMode: (mode: AppThemeMode) => void;
  uiAccentColor: string;
  onChangeUiAccentColor: (hex: string) => void;
  uiFormatting: UiFormattingPrefs;
  onChangeUiFormatting: (patch: Partial<UiFormattingPrefs>) => void;
  genFormatting: GeneratedTextFormattingPrefs;
  onChangeGenFormatting: (patch: Partial<GeneratedTextFormattingPrefs>) => void;
  onResetFormattingDefaults: () => void;
  defaultReadabilityTheme: 'system' | 'light' | 'sepia' | 'dark';
  onSetDefaultReadabilityTheme: (theme: 'system' | 'light' | 'sepia' | 'dark') => void;
  defaultSyncYouTubeTheme: boolean;
  onSetDefaultSyncYouTubeTheme: (sync: boolean) => void;
  // Video Summaries
  defaultSummaryModel: string;
  onSetDefaultSummaryModel: (model: string) => void;
  defaultSummarySource: 'video' | 'text';
  onSetDefaultSummarySource: (source: 'video' | 'text') => void;
  summaryPersona: SummaryPersona;
  onSetSummaryPersona: (persona: SummaryPersona) => void;
  outputLanguage: string;
  onSetOutputLanguage: (lang: string) => void;
  autoStartSummary: boolean;
  onSetAutoStartSummary: (enabled: boolean) => void;
  summaryDefaults: SummaryDefaultOpts;
  onChangeSummaryDefaults: (patch: Partial<SummaryDefaultOpts>) => void;
  // Video Titles
  altTitleMode: AltTitleGenerationMode;
  onSetAltTitleMode: (mode: AltTitleGenerationMode) => void;
  channelTitleRules: Record<string, 'exempt' | 'force_ai'>;
  onSetChannelTitleRule: (channelName: string, rule: ChannelTitleRule) => void;
  onClearCachedTitles: () => void;
  // Podcast
  defaultPodcastHostCount: number;
  onSetDefaultPodcastHostCount: (count: number) => void;
  defaultPodcastHosts: PodcastHost[];
  onUpdateDefaultPodcastHost: (idx: number, field: 'name' | 'voiceName', value: string) => void;
  podcastSynthesisMode: PodcastSynthesisMode;
  onSetPodcastSynthesisMode: (mode: PodcastSynthesisMode) => void;
  defaultPodcastRate: number;
  onSetDefaultPodcastRate: (rate: number) => void;
  // Transcript & TTS
  continueAudioOnMinimize: boolean;
  onSetContinueAudioOnMinimize: (enabled: boolean) => void;
  followAlong: boolean;
  onToggleFollowAlong: () => void;
  defaultSkipSilence: boolean;
  onSetDefaultSkipSilence: (skip: boolean) => void;
  voiceInputEngine: VoiceInputEngine;
  onSetVoiceInputEngine: (engine: VoiceInputEngine) => void;
  defaultTtsVoice: string;
  onSetDefaultTtsVoice: (voiceId: string) => void;
  browserVoices: SpeechSynthesisVoice[];
  defaultTtsRate: number;
  onSetDefaultTtsRate: (rate: number) => void;
  defaultTtsPitch: number;
  onSetDefaultTtsPitch: (pitch: number) => void;
  defaultTtsVolume: number;
  onSetDefaultTtsVolume: (volume: number) => void;
  // History & Dock
  showHistoryBottomTab: boolean;
  onSetShowHistoryBottomTab: (show: boolean) => void;
  historyPageScope: HistoryPageScope;
  onSetHistoryPageScope: (scope: HistoryPageScope) => void;
  historyTabVisibility: HistoryTabVisibility;
  onSetHistoryTabVisibility: (vis: HistoryTabVisibility) => void;
  currentSimPage: string;
  onSetCurrentSimPage: (path: string) => void;
  closedSummariesCount: number;
  onClearAllHistory: () => void;
  // Keys & Models
  apiKeys: StoredApiKeyEntry[];
  onAddApiKey: (name: string, key: string) => void;
  onRenameApiKey: (id: string, name: string) => void;
  onDeleteApiKey: (id: string) => void;
  customModels: string[];
  onAddCustomModel: (modelId: string) => void;
  onRemoveCustomModel: (modelId: string) => void;
  onRefreshModels: () => void;
  onResetAllSettings: () => void;
}

type SettingsCategory =
  | 'all'
  | 'appearance'
  | 'summaries'
  | 'titles'
  | 'podcast'
  | 'transcript_tts'
  | 'history'
  | 'keys';

const SETTINGS_CATEGORIES: Array<{ id: SettingsCategory; label: string }> = [
  { id: 'all', label: 'All Settings' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'summaries', label: 'Summaries' },
  { id: 'titles', label: 'Video Titles' },
  { id: 'podcast', label: 'Podcast' },
  { id: 'transcript_tts', label: 'Transcript & TTS' },
  { id: 'history', label: 'History & Dock' },
  { id: 'keys', label: 'Keys & Models' }
];

const SETTINGS_RESIZE_HANDLES: Array<{
  dir: ResizeDirection;
  orientation: 'horizontal' | 'vertical';
  label: string;
  cls: string;
}> = [
  { dir: 'n', orientation: 'horizontal', label: 'Resize settings top', cls: 'left-3 right-3 top-0 h-1.5 cursor-ns-resize z-30 yt-resize-n' },
  { dir: 's', orientation: 'horizontal', label: 'Resize settings bottom', cls: 'left-3 right-3 bottom-0 h-1.5 cursor-ns-resize z-30 yt-resize-s' },
  { dir: 'e', orientation: 'vertical', label: 'Resize settings right', cls: 'top-3 bottom-3 right-0 w-1.5 cursor-ew-resize z-30 yt-resize-e' },
  { dir: 'w', orientation: 'vertical', label: 'Resize settings left', cls: 'top-3 bottom-3 left-0 w-1.5 cursor-ew-resize z-30 yt-resize-w' },
  { dir: 'nw', orientation: 'horizontal', label: 'Resize settings top-left corner', cls: 'left-0 top-0 w-3.5 h-3.5 cursor-nwse-resize z-40 yt-resize-nw' },
  { dir: 'ne', orientation: 'horizontal', label: 'Resize settings top-right corner', cls: 'right-0 top-0 w-3.5 h-3.5 cursor-nesw-resize z-40 yt-resize-ne' },
  { dir: 'sw', orientation: 'horizontal', label: 'Resize settings bottom-left corner', cls: 'left-0 bottom-0 w-3.5 h-3.5 cursor-nesw-resize z-40 yt-resize-sw' },
  { dir: 'se', orientation: 'horizontal', label: 'Resize settings bottom-right corner', cls: 'right-0 bottom-0 w-3.5 h-3.5 cursor-nwse-resize z-40 yt-resize-se' }
];

const BUILTIN_SUMMARY_MODELS = [
  'gemini-4-argon',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-flash-latest',
  'Ask'
];

const AI_VOICE_OPTIONS = [
  { id: 'ai:Kore', name: 'Gemini Kore (Natural Female)' },
  { id: 'ai:Puck', name: 'Gemini Puck (Natural Male)' },
  { id: 'ai:Zephyr', name: 'Gemini Zephyr (Warm Female)' },
  { id: 'ai:Fenrir', name: 'Gemini Fenrir (Deep Male)' },
  { id: 'ai:Charon', name: 'Gemini Charon (Calm Male)' }
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  bounds,
  zIndex,
  onFocus,
  onStartDrag,
  onStartResize,
  onResizeKeyDown,
  onGripKeyDown,
  appThemeMode,
  effectiveTheme,
  onSetAppThemeMode,
  uiAccentColor,
  onChangeUiAccentColor,
  uiFormatting,
  onChangeUiFormatting,
  genFormatting,
  onChangeGenFormatting,
  onResetFormattingDefaults,
  defaultReadabilityTheme,
  onSetDefaultReadabilityTheme,
  defaultSyncYouTubeTheme,
  onSetDefaultSyncYouTubeTheme,
  defaultSummaryModel,
  onSetDefaultSummaryModel,
  defaultSummarySource,
  onSetDefaultSummarySource,
  summaryPersona,
  onSetSummaryPersona,
  outputLanguage,
  onSetOutputLanguage,
  autoStartSummary,
  onSetAutoStartSummary,
  summaryDefaults,
  onChangeSummaryDefaults,
  altTitleMode,
  onSetAltTitleMode,
  channelTitleRules,
  onSetChannelTitleRule,
  onClearCachedTitles,
  defaultPodcastHostCount,
  onSetDefaultPodcastHostCount,
  defaultPodcastHosts,
  onUpdateDefaultPodcastHost,
  podcastSynthesisMode,
  onSetPodcastSynthesisMode,
  defaultPodcastRate,
  onSetDefaultPodcastRate,
  continueAudioOnMinimize,
  onSetContinueAudioOnMinimize,
  followAlong,
  onToggleFollowAlong,
  defaultSkipSilence,
  onSetDefaultSkipSilence,
  voiceInputEngine,
  onSetVoiceInputEngine,
  defaultTtsVoice,
  onSetDefaultTtsVoice,
  browserVoices,
  defaultTtsRate,
  onSetDefaultTtsRate,
  defaultTtsPitch,
  onSetDefaultTtsPitch,
  defaultTtsVolume,
  onSetDefaultTtsVolume,
  showHistoryBottomTab,
  onSetShowHistoryBottomTab,
  historyPageScope,
  onSetHistoryPageScope,
  historyTabVisibility,
  onSetHistoryTabVisibility,
  currentSimPage,
  onSetCurrentSimPage,
  closedSummariesCount,
  onClearAllHistory,
  apiKeys,
  onAddApiKey,
  onRenameApiKey,
  onDeleteApiKey,
  customModels,
  onAddCustomModel,
  onRemoveCustomModel,
  onRefreshModels,
  onResetAllSettings
}) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('all');
  const [newRuleChannel, setNewRuleChannel] = useState('');
  const [newRuleAction, setNewRuleAction] = useState<'exempt' | 'force_ai'>('exempt');
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newCustomModel, setNewCustomModel] = useState('');
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);

  if (!open) return null;

  const normalizedAccent = normalizeAccentColorHex(uiAccentColor);
  const wheelPoint = hexToColorWheelPoint(normalizedAccent || '#93C5FD');
  const pickAccentAtClientPos = (clientX: number, clientY: number) => {
    const el = wheelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = Math.min(rect.width, rect.height) / 2;
    let nx = (clientX - cx) / r;
    let ny = (clientY - cy) / r;
    const dist = Math.hypot(nx, ny);
    if (dist > 1) {
      nx /= dist;
      ny /= dist;
    }
    setHexDraft(null);
    onChangeUiAccentColor(colorWheelPointToHex(nx, ny, 76));
  };

  const showSection = (cat: SettingsCategory) => activeCategory === 'all' || activeCategory === cat;
  const allSummaryModels = Array.from(new Set([...BUILTIN_SUMMARY_MODELS, ...customModels, defaultSummaryModel]));
  const isVideoPage = currentSimPage.startsWith('/watch') || currentSimPage.startsWith('/shorts') || currentSimPage.startsWith('/live');

  return (
    <div
      className="fixed inset-0 bg-black/45 backdrop-blur-[1px] yt-key-dialog-scrim yt-settings-dialog-scrim"
      style={{ zIndex: Math.max(100, zIndex) }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Settings & Control Center"
    >
      <div
        onMouseDown={onFocus}
        onClick={(e) => e.stopPropagation()}
        style={{
          left: `${bounds.left}px`,
          top: `${bounds.top}px`,
          width: `${bounds.width}px`,
          height: `${bounds.height}px`,
          zIndex,
          fontFamily: 'var(--yt-ui-font, var(--font-sans))',
          fontSize: 'var(--yt-ui-font-size, 14px)'
        }}
        className="fixed bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-primary)]/40 rounded-[24px] shadow-2xl flex flex-col overflow-hidden text-[var(--md-sys-color-on-surface)] yt-key-dialog-box yt-floating-window yt-settings-dialog-box"
      >
        {/* 8-Direction Resize Handles */}
        {SETTINGS_RESIZE_HANDLES.map((h) => (
          <div
            key={h.dir}
            role="separator"
            tabIndex={0}
            data-resize-dir={h.dir}
            aria-orientation={h.orientation}
            aria-label={h.label}
            onMouseDown={onStartResize(h.dir)}
            onKeyDown={onResizeKeyDown(h.dir)}
            className={`absolute focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary)]/25 transition-colors yt-resize-handle ${h.cls}`}
          />
        ))}

        {/* Draggable Titlebar */}
        <div
          onMouseDown={onStartDrag}
          className="px-5 py-3.5 border-b border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-2 bg-[var(--md-sys-color-surface-container)] cursor-move select-none yt-win-header"
          title="Drag header or use arrow keys on grip to move Settings window"
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              tabIndex={0}
              onKeyDown={onGripKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] cursor-grab active:cursor-grabbing yt-win-drag-grip"
              aria-label="Move Settings window with arrow keys"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-base text-[var(--md-sys-color-on-surface)] flex items-center gap-2 truncate">
                <SlidersHorizontal className="w-4 h-4 text-[var(--md-sys-color-primary)] flex-shrink-0" />
                <span className="truncate">Settings &amp; Control Center</span>
              </h2>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5 truncate">
                Theme ({effectiveTheme}), summaries, AI titles, podcast, TTS &amp; history dock
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={onResetAllSettings}
              className="px-2.5 py-1 rounded-full border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[11px] font-medium text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer yt-reset-all-settings-btn"
              title="Reset all settings to defaults"
            >
              Reset All
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors yt-win-btn yt-win-close-btn cursor-pointer"
              title="Close settings"
              aria-label="Close settings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div
          className="px-5 py-2.5 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] flex items-center gap-1.5 flex-wrap yt-settings-tabs"
          role="tablist"
          aria-label="Settings categories"
        >
          {SETTINGS_CATEGORIES.map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                data-settings-tab={cat.id}
                aria-selected={active}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap yt-settings-tab ${
                  active
                    ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-semibold active'
                    : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)]'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* 1. Appearance & Formatting */}
          {showSection('appearance') && (
            <section
              data-settings-cat="appearance"
              className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-4 space-y-4 yt-settings-section-card"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-primary)] flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5" />
                  <span>Appearance &amp; Typography</span>
                </h3>
                <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] tabular-nums">
                  Active: {effectiveTheme === 'dark' ? 'Dark' : 'Light'}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--md-sys-color-on-surface)]">Material You UI Theme</span>
                <div
                  className="inline-flex items-center bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-full p-1 gap-1"
                  role="group"
                  aria-label="Settings Material You theme selector"
                >
                  {(
                    [
                      { id: 'system', label: 'System', Icon: Monitor },
                      { id: 'light', label: 'Light', Icon: Sun },
                      { id: 'dark', label: 'Dark', Icon: Moon }
                    ] as const
                  ).map(({ id, label, Icon }) => {
                    const active = appThemeMode === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        data-app-theme={id}
                        aria-pressed={active}
                        onClick={() => onSetAppThemeMode(id)}
                        className={`yt-app-theme-btn inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-semibold'
                            : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* UI Accent Color: Color Wheel + 12 Pastel Swatches */}
              <div
                data-testid="sim-accent-picker"
                className="bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-xs font-medium text-[var(--md-sys-color-on-surface)]">
                    <Palette className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
                    <span>UI Accent Color (Wheel &amp; 12 Pastel Presets)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)]"
                      title="Active UI Primary Token"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/40"
                        style={{ backgroundColor: 'var(--md-sys-color-primary)' }}
                      />
                      <span>{normalizedAccent || 'Default Blue'}</span>
                    </span>
                    <button
                      type="button"
                      data-action="reset-accent"
                      onClick={() => {
                        setHexDraft(null);
                        onChangeUiAccentColor('');
                      }}
                      disabled={!normalizedAccent}
                      className="px-2.5 py-1 rounded-full border border-[var(--md-sys-color-outline-variant)] text-[11px] font-medium hover:bg-[var(--md-sys-color-surface-container-highest)] disabled:opacity-40 cursor-pointer"
                    >
                      Reset Accent
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div
                    ref={wheelRef}
                    data-testid="sim-accent-color-wheel"
                    role="slider"
                    tabIndex={0}
                    aria-label="UI Accent Color Wheel"
                    aria-valuetext={normalizedAccent || 'Default Blue'}
                    title="Click or drag anywhere on the wheel to pick an accent hue"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      pickAccentAtClientPos(e.clientX, e.clientY);
                      const onMove = (ev: MouseEvent) => pickAccentAtClientPos(ev.clientX, ev.clientY);
                      const onUp = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                      };
                      document.addEventListener('mousemove', onMove);
                      document.addEventListener('mouseup', onUp);
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'ArrowRight' ||
                        e.key === 'ArrowLeft' ||
                        e.key === 'ArrowUp' ||
                        e.key === 'ArrowDown'
                      ) {
                        e.preventDefault();
                        const base = normalizedAccent || '#93C5FD';
                        const rgb = hexToRgb(base) || { r: 147, g: 197, b: 253 };
                        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
                        const nextH =
                          (hsl.h + (e.key === 'ArrowRight' ? 15 : e.key === 'ArrowLeft' ? -15 : 0) + 360) % 360;
                        const nextS = Math.max(
                          10,
                          Math.min(100, hsl.s + (e.key === 'ArrowUp' ? 10 : e.key === 'ArrowDown' ? -10 : 0))
                        );
                        setHexDraft(null);
                        onChangeUiAccentColor(hslToHex(nextH, nextS, 76));
                      }
                    }}
                    className="relative w-32 h-32 rounded-full flex-shrink-0 cursor-crosshair border-2 border-[var(--md-sys-color-outline-variant)] shadow-inner select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--md-sys-color-primary)]"
                    style={{
                      background:
                        'radial-gradient(circle closest-side, #ffffff 0%, rgba(255,255,255,0) 100%), conic-gradient(from 90deg, #ff0000 0deg, #ffff00 60deg, #00ff00 120deg, #00ffff 180deg, #0000ff 240deg, #ff00ff 300deg, #ff0000 360deg)'
                    }}
                  >
                    <div
                      data-testid="sim-accent-wheel-thumb"
                      className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.65)] pointer-events-none -translate-x-1/2 -translate-y-1/2"
                      style={{
                        left: `${((0.5 + wheelPoint.nx * 0.5) * 100).toFixed(2)}%`,
                        top: `${((0.5 + wheelPoint.ny * 0.5) * 100).toFixed(2)}%`,
                        backgroundColor: normalizedAccent || '#93C5FD'
                      }}
                    />
                  </div>

                  <div className="flex-1 w-full space-y-3 min-w-0">
                    <div
                      className="grid grid-cols-6 gap-2"
                      role="group"
                      aria-label="12 Preset Pastel Colors"
                      data-testid="sim-pastel-swatches"
                    >
                      {PASTEL_ACCENT_PRESETS.map((preset) => {
                        const active = normalizedAccent === preset.hex;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            data-accent-hex={preset.hex}
                            data-accent-id={preset.id}
                            aria-label={`Pastel accent ${preset.name} (${preset.hex})`}
                            aria-pressed={active}
                            title={`${preset.name} (${preset.hex})`}
                            onClick={() => {
                              setHexDraft(null);
                              onChangeUiAccentColor(preset.hex);
                            }}
                            style={{ backgroundColor: preset.hex }}
                            className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer hover:scale-110 ${
                              active
                                ? 'border-[var(--md-sys-color-on-surface)] ring-2 ring-[var(--md-sys-color-primary)] scale-110 shadow-md'
                                : 'border-white/40 dark:border-white/25'
                            }`}
                          />
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label="Native UI Accent Color Picker"
                        data-testid="sim-accent-native-input"
                        value={normalizedAccent || '#93C5FD'}
                        onChange={(e) => {
                          setHexDraft(null);
                          onChangeUiAccentColor(e.target.value);
                        }}
                        className="w-9 h-7 p-0.5 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        aria-label="UI Accent Hex Code"
                        data-testid="sim-accent-hex-input"
                        value={hexDraft !== null ? hexDraft : normalizedAccent || 'Default (#a3c9ff)'}
                        onFocus={() => setHexDraft(normalizedAccent || '')}
                        onChange={(e) => setHexDraft(e.target.value)}
                        onBlur={() => {
                          if (hexDraft === null) return;
                          const raw = hexDraft.trim();
                          setHexDraft(null);
                          if (!raw || raw.toLowerCase().startsWith('default')) {
                            onChangeUiAccentColor('');
                            return;
                          }
                          const parsed = normalizeAccentColorHex(raw);
                          if (parsed) onChangeUiAccentColor(parsed);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur();
                          }
                        }}
                        placeholder="#93C5FD"
                        className="flex-1 min-w-0 font-mono text-xs bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1 text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">UI Font Family</span>
                  <select
                    aria-label="UI Font Family"
                    data-setting="ui-font-family"
                    value={uiFormatting.fontFamily}
                    onChange={(e) => onChangeUiFormatting({ fontFamily: e.target.value as UiFontFamily })}
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  >
                    <option value="system">System Default (DM Sans)</option>
                    <option value="dm-sans">DM Sans / Geometric</option>
                    <option value="serif">Editorial Serif</option>
                    <option value="mono">Monospace Technical</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium flex items-center justify-between">
                    <span>UI Font Size</span>
                    <span className="font-mono tabular-nums text-[var(--md-sys-color-primary)] font-semibold">
                      {uiFormatting.fontSizePx}px
                    </span>
                  </span>
                  <input
                    type="range"
                    aria-label="UI Font Size"
                    data-setting="ui-font-size"
                    min={11}
                    max={18}
                    step={1}
                    value={uiFormatting.fontSizePx}
                    onChange={(e) => onChangeUiFormatting({ fontSizePx: Number(e.target.value) })}
                    className="accent-[var(--md-sys-color-primary)] cursor-pointer mt-2"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">UI Density</span>
                  <select
                    aria-label="UI Density"
                    data-setting="ui-density"
                    value={uiFormatting.density}
                    onChange={(e) => onChangeUiFormatting({ density: e.target.value as UiDensity })}
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  >
                    <option value="compact">Compact (8px pad)</option>
                    <option value="comfortable">Comfortable (12px pad)</option>
                    <option value="relaxed">Relaxed (16px pad)</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Summary Font</span>
                  <select
                    aria-label="Generated Summary Font"
                    data-setting="gen-font-family"
                    value={genFormatting.fontFamily}
                    onChange={(e) => onChangeGenFormatting({ fontFamily: e.target.value as GeneratedFontFamily })}
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  >
                    <option value="sans">Modern Sans (DM Sans)</option>
                    <option value="serif">Reading Serif (Georgia)</option>
                    <option value="mono">Fixed Code (JetBrains Mono)</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Paragraph Spacing</span>
                  <select
                    aria-label="Generated Paragraph Spacing"
                    data-setting="gen-paragraph-spacing"
                    value={genFormatting.paragraphSpacing}
                    onChange={(e) =>
                      onChangeGenFormatting({ paragraphSpacing: e.target.value as GeneratedParagraphSpacing })
                    }
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  >
                    <option value="compact">Compact (6px gap)</option>
                    <option value="normal">Normal (11px gap)</option>
                    <option value="relaxed">Relaxed (18px gap)</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium flex items-center justify-between">
                    <span>Generated Text Size</span>
                    <span className="font-mono tabular-nums text-[var(--md-sys-color-primary)] font-semibold">
                      {genFormatting.fontSizePx}px
                    </span>
                  </span>
                  <input
                    type="range"
                    aria-label="Generated Text Size"
                    data-setting="gen-font-size"
                    min={12}
                    max={22}
                    step={1}
                    value={genFormatting.fontSizePx}
                    onChange={(e) => onChangeGenFormatting({ fontSizePx: Number(e.target.value) })}
                    className="accent-[var(--md-sys-color-primary)] cursor-pointer mt-1"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium flex items-center justify-between">
                    <span>Line Height</span>
                    <span className="font-mono tabular-nums text-[var(--md-sys-color-primary)] font-semibold">
                      {genFormatting.lineHeight.toFixed(2)}
                    </span>
                  </span>
                  <input
                    type="range"
                    aria-label="Generated Line Height"
                    data-setting="gen-line-height"
                    min={1.3}
                    max={2.0}
                    step={0.05}
                    value={genFormatting.lineHeight}
                    onChange={(e) => onChangeGenFormatting({ lineHeight: Number(e.target.value) })}
                    className="accent-[var(--md-sys-color-primary)] cursor-pointer mt-1"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Default Reader View Theme</span>
                  <select
                    aria-label="Default Reader View Theme"
                    data-setting="default-readability-theme"
                    value={defaultReadabilityTheme}
                    onChange={(e) =>
                      onSetDefaultReadabilityTheme(e.target.value as 'system' | 'light' | 'sepia' | 'dark')
                    }
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  >
                    <option value="system">System / Match UI</option>
                    <option value="light">Light</option>
                    <option value="sepia">Sepia</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>

                <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none pt-4">
                  <input
                    type="checkbox"
                    data-setting="default-sync-yt-theme"
                    checked={defaultSyncYouTubeTheme}
                    onChange={(e) => onSetDefaultSyncYouTubeTheme(e.target.checked)}
                    className="rounded accent-[var(--md-sys-color-primary)]"
                  />
                  <span className="text-[var(--md-sys-color-on-surface)] font-medium">
                    Sync Reader View with YouTube Dark/Light mode
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-setting="gen-rich-formatting"
                    checked={genFormatting.richFormatting}
                    onChange={(e) => onChangeGenFormatting({ richFormatting: e.target.checked })}
                    className="rounded accent-[var(--md-sys-color-primary)]"
                  />
                  <span className="text-[var(--md-sys-color-on-surface)] font-medium">
                    Rich Markdown formatting (uncheck for plain-text paragraphs)
                  </span>
                </label>

                <button
                  type="button"
                  onClick={onResetFormattingDefaults}
                  disabled={
                    uiFormatting.fontFamily === DEFAULT_UI_FORMATTING_PREFS.fontFamily &&
                    uiFormatting.fontSizePx === DEFAULT_UI_FORMATTING_PREFS.fontSizePx &&
                    uiFormatting.density === DEFAULT_UI_FORMATTING_PREFS.density &&
                    genFormatting.fontFamily === DEFAULT_GENERATED_TEXT_PREFS.fontFamily &&
                    genFormatting.fontSizePx === DEFAULT_GENERATED_TEXT_PREFS.fontSizePx &&
                    genFormatting.lineHeight === DEFAULT_GENERATED_TEXT_PREFS.lineHeight &&
                    genFormatting.paragraphSpacing === DEFAULT_GENERATED_TEXT_PREFS.paragraphSpacing &&
                    genFormatting.richFormatting === DEFAULT_GENERATED_TEXT_PREFS.richFormatting
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--md-sys-color-outline-variant)] text-xs font-medium text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)] disabled:opacity-40 transition-colors cursor-pointer yt-reset-formatting-btn"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Formatting Defaults</span>
                </button>
              </div>
            </section>
          )}

          {/* 2. Video Summaries */}
          {showSection('summaries') && (
            <section
              data-settings-cat="summaries"
              className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-4 space-y-4 yt-settings-section-card"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-primary)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Video Summary Generation Defaults</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Default Model</span>
                  <select
                    aria-label="Default Summary Model"
                    data-setting="default-summary-model"
                    value={defaultSummaryModel}
                    onChange={(e) => onSetDefaultSummaryModel(e.target.value)}
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  >
                    {allSummaryModels.map((m) => (
                      <option key={m} value={m}>
                        {m === 'Ask' ? 'YouTube Ask (Gemini in page)' : m}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Default Input Source</span>
                  <select
                    aria-label="Default Input Source"
                    data-setting="default-summary-source"
                    value={defaultSummarySource}
                    onChange={(e) => onSetDefaultSummarySource(e.target.value === 'text' ? 'text' : 'video')}
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  >
                    <option value="video">Video Stream (Audio + Visuals)</option>
                    <option value="text">Transcript / Captions</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Processing Mode</span>
                  <select
                    aria-label="Default Processing Mode"
                    data-setting="default-processing-mode"
                    value={summaryDefaults.transcriptMode}
                    onChange={(e) =>
                      onChangeSummaryDefaults({ transcriptMode: e.target.value === 'deep' ? 'deep' : 'fast' })
                    }
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  >
                    <option value="fast">Fast (Concise Brief)</option>
                    <option value="deep">Deep (Exhaustive + Timestamps)</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Default Persona</span>
                  <select
                    aria-label="Default Summary Persona"
                    data-setting="default-summary-persona"
                    value={summaryPersona}
                    onChange={(e) => onSetSummaryPersona(e.target.value as SummaryPersona)}
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  >
                    {(Object.keys(SUMMARY_PERSONA_PRESETS) as SummaryPersona[]).map((key) => (
                      <option key={key} value={key}>
                        {SUMMARY_PERSONA_PRESETS[key].label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Output Language</span>
                  <input
                    type="text"
                    aria-label="Summary Output Language"
                    data-setting="output-language"
                    value={outputLanguage}
                    onChange={(e) => onSetOutputLanguage(e.target.value)}
                    placeholder="English"
                    className="bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Auto-Retry Count</span>
                  <select
                    aria-label="Auto-Retry Count"
                    data-setting="default-retries"
                    value={summaryDefaults.retries}
                    onChange={(e) => onChangeSummaryDefaults({ retries: Number(e.target.value) })}
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  >
                    {[0, 1, 2, 3, 5, 10].map((r) => (
                      <option key={r} value={r}>
                        {r} retries
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Thinking Level</span>
                  <select
                    aria-label="Default Thinking Level"
                    data-setting="default-thinking-level"
                    value={summaryDefaults.think}
                    onChange={(e) =>
                      onChangeSummaryDefaults({ think: e.target.value as SummaryDefaultOpts['think'] })
                    }
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  >
                    <option value="">Auto</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Media Resolution</span>
                  <select
                    aria-label="Default Media Resolution"
                    data-setting="default-media-resolution"
                    value={summaryDefaults.mres}
                    onChange={(e) =>
                      onChangeSummaryDefaults({ mres: e.target.value as SummaryDefaultOpts['mres'] })
                    }
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  >
                    <option value="">Default</option>
                    <option value="MEDIA_RESOLUTION_LOW">Low</option>
                    <option value="MEDIA_RESOLUTION_MEDIUM">Medium</option>
                    <option value="MEDIA_RESOLUTION_HIGH">High</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Fact-Check Model</span>
                  <select
                    aria-label="Fact-Check Model"
                    data-setting="default-fact-model"
                    value={summaryDefaults.factModel}
                    onChange={(e) => onChangeSummaryDefaults({ factModel: e.target.value })}
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  >
                    <option value="">Auto</option>
                    <option value="gemini-3.8-flash">gemini-3.8-flash</option>
                    <option value="gemini-3.7-flash">gemini-3.7-flash</option>
                    <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">AI Image Model &amp; Aspect</span>
                  <div className="flex gap-1.5">
                    <select
                      aria-label="AI Image Model"
                      data-setting="default-img-model"
                      value={summaryDefaults.imgModel}
                      onChange={(e) => onChangeSummaryDefaults({ imgModel: e.target.value })}
                      className="m3-select flex-1 min-w-0 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2 py-1.5 text-xs text-[var(--md-sys-color-on-surface)]"
                    >
                      <option value="">Auto</option>
                      <option value="gemini-3-pro-image">Nano Banana Pro</option>
                      <option value="gemini-nano-banana-2.1">Nano Banana 2.1</option>
                      <option value="gemini-3.1-flash-image">Nano Banana 2</option>
                    </select>
                    <select
                      aria-label="AI Image Aspect Ratio"
                      data-setting="default-img-aspect"
                      value={summaryDefaults.imgAspect}
                      onChange={(e) => onChangeSummaryDefaults({ imgAspect: e.target.value })}
                      className="m3-select w-20 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2 py-1.5 text-xs text-[var(--md-sys-color-on-surface)]"
                    >
                      <option value="">Auto</option>
                      <option value="1:1">1:1</option>
                      <option value="16:9">16:9</option>
                      <option value="4:3">4:3</option>
                      <option value="9:16">9:16</option>
                    </select>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                {(
                  [
                    {
                      key: 'autostart',
                      label: 'Auto-start summary on Summarize click',
                      checked: autoStartSummary,
                      onChange: (v: boolean) => onSetAutoStartSummary(v),
                      attr: 'auto-start-summary'
                    },
                    {
                      key: 'fc',
                      label: 'Include Fact-Check verification pass',
                      checked: summaryDefaults.fc,
                      onChange: (v: boolean) => onChangeSummaryDefaults({ fc: v }),
                      attr: 'default-opt-fc'
                    },
                    {
                      key: 'autoFactCheck',
                      label: 'Automatically run Fact-Check after summary is generated',
                      checked: summaryDefaults.autoFactCheck !== false,
                      onChange: (v: boolean) => onChangeSummaryDefaults({ autoFactCheck: v }),
                      attr: 'default-opt-autofc'
                    },
                    {
                      key: 'src',
                      label: 'Include clickable Source citations',
                      checked: summaryDefaults.src,
                      onChange: (v: boolean) => onChangeSummaryDefaults({ src: v }),
                      attr: 'default-opt-src'
                    },
                    {
                      key: 'img',
                      label: 'Include Visual frame & diagram markers',
                      checked: summaryDefaults.img,
                      onChange: (v: boolean) => onChangeSummaryDefaults({ img: v }),
                      attr: 'default-opt-img'
                    },
                    {
                      key: 'gen',
                      label: 'Generate AI illustrations (Nano Banana)',
                      checked: summaryDefaults.gen,
                      onChange: (v: boolean) => onChangeSummaryDefaults({ gen: v }),
                      attr: 'default-opt-gen'
                    },
                    {
                      key: 'gsearch',
                      label: 'Google Search grounding by default',
                      checked: summaryDefaults.gsearch,
                      onChange: (v: boolean) => onChangeSummaryDefaults({ gsearch: v }),
                      attr: 'default-opt-gsearch'
                    },
                    {
                      key: 'gmaps',
                      label: 'Google Maps grounding by default',
                      checked: summaryDefaults.gmaps,
                      onChange: (v: boolean) => onChangeSummaryDefaults({ gmaps: v }),
                      attr: 'default-opt-gmaps'
                    },
                    {
                      key: 'code',
                      label: 'Code Execution tool by default',
                      checked: summaryDefaults.code,
                      onChange: (v: boolean) => onChangeSummaryDefaults({ code: v }),
                      attr: 'default-opt-code'
                    },
                    {
                      key: 'fallback',
                      label: 'Auto-fallback down model ladder if unavailable',
                      checked: summaryDefaults.fallback,
                      onChange: (v: boolean) => onChangeSummaryDefaults({ fallback: v }),
                      attr: 'default-opt-fallback'
                    },
                    {
                      key: 'txFallback',
                      label: 'Fallback to Transcript on quota/duration error',
                      checked: summaryDefaults.txFallback,
                      onChange: (v: boolean) => onChangeSummaryDefaults({ txFallback: v }),
                      attr: 'default-opt-txfallback'
                    }
                  ] as const
                ).map((item) => (
                  <label key={item.key} className="flex items-center gap-2 cursor-pointer select-none py-0.5">
                    <input
                      type="checkbox"
                      data-setting={item.attr}
                      checked={item.checked}
                      onChange={(e) => item.onChange(e.target.checked)}
                      className="rounded accent-[var(--md-sys-color-primary)]"
                    />
                    <span className="text-[var(--md-sys-color-on-surface)]">{item.label}</span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* 3. Video Title Generation */}
          {showSection('titles') && (
            <section
              data-settings-cat="titles"
              className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-4 space-y-4 yt-settings-section-card"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-primary)] flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Video Title Generation</span>
                </h3>
                <div
                  className="inline-flex items-center bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-full p-1 gap-1"
                  role="group"
                  aria-label="AI Video Title Generation Mode"
                >
                  {(
                    [
                      { id: 'on', label: 'On (Auto)' },
                      { id: 'manual', label: 'Manual' },
                      { id: 'off', label: 'Off' }
                    ] as const
                  ).map((opt) => {
                    const active = altTitleMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-alt-title-mode={opt.id}
                        aria-pressed={active}
                        onClick={() => onSetAltTitleMode(opt.id)}
                        className={`yt-alt-title-mode-btn px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-semibold active'
                            : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Auto replaces clickbait titles automatically at page load (yielding to DeArrow &amp; Music videos). Manual disables auto-fetching on load while keeping each card&apos;s toggle button active. Off turns off AI title generation.
              </p>

              {/* Channel Rules */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-[var(--md-sys-color-on-surface)]">Per-Channel Title Rules</div>
                <div className="space-y-1.5">
                  {Object.entries(channelTitleRules).length === 0 ? (
                    <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] italic">
                      No per-channel overrides saved yet.
                    </div>
                  ) : (
                    Object.entries(channelTitleRules).map(([ch, rule]) => (
                      <div
                        key={ch}
                        className="flex items-center justify-between gap-2 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 py-1.5 text-xs"
                      >
                        <span className="font-medium truncate">{ch}</span>
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Rule for ${ch}`}
                            value={rule}
                            onChange={(e) => onSetChannelTitleRule(ch, e.target.value as ChannelTitleRule)}
                            className="m3-select bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-lg px-2 py-1 text-xs"
                          >
                            <option value="exempt">Exempt</option>
                            <option value="force_ai">Always AI</option>
                            <option value="default">Default (Remove)</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => onSetChannelTitleRule(ch, 'default')}
                            className="text-[var(--md-sys-color-error)] hover:underline cursor-pointer"
                            aria-label={`Remove rule for ${ch}`}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newRuleChannel}
                    onChange={(e) => setNewRuleChannel(e.target.value)}
                    placeholder="Channel name (e.g. Veritasium)"
                    aria-label="Add channel rule name"
                    className="flex-1 min-w-[160px] bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  />
                  <select
                    value={newRuleAction}
                    onChange={(e) => setNewRuleAction(e.target.value === 'force_ai' ? 'force_ai' : 'exempt')}
                    aria-label="Add channel rule behavior"
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs"
                  >
                    <option value="exempt">Exempt</option>
                    <option value="force_ai">Always AI</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const clean = newRuleChannel.trim();
                      if (!clean) return;
                      onSetChannelTitleRule(clean, newRuleAction);
                      setNewRuleChannel('');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] text-xs font-semibold cursor-pointer hover:opacity-90"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Rule</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClearCachedTitles}
                    className="px-3 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] text-xs font-medium hover:bg-[var(--md-sys-color-surface-container-highest)] cursor-pointer yt-clear-alt-titles-btn"
                  >
                    Clear Cached AI Titles
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* 4. Podcast Generation */}
          {showSection('podcast') && (
            <section
              data-settings-cat="podcast"
              className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-4 space-y-4 yt-settings-section-card"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-primary)] flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" />
                <span>Podcast Generation</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Default Host Count</span>
                  <select
                    aria-label="Default Podcast Host Count"
                    data-setting="default-podcast-host-count"
                    value={normalizePodcastHostCount(defaultPodcastHostCount)}
                    onChange={(e) => onSetDefaultPodcastHostCount(Number(e.target.value))}
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)]"
                  >
                    {[2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} Hosts
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Audio Synthesis Engine</span>
                  <select
                    aria-label="Podcast Audio Synthesis Engine"
                    data-setting="podcast-synthesis-mode"
                    value={podcastSynthesisMode}
                    onChange={(e) => onSetPodcastSynthesisMode(e.target.value as PodcastSynthesisMode)}
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)]"
                  >
                    <option value="gemini_tts">Gemini Multi-Speaker TTS Audio</option>
                    <option value="webspeech">Browser Web Speech API (Instant)</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium flex items-center justify-between">
                    <span>Default Playback Speed</span>
                    <span className="font-mono tabular-nums text-[var(--md-sys-color-primary)] font-semibold">
                      {defaultPodcastRate.toFixed(2)}x
                    </span>
                  </span>
                  <input
                    type="range"
                    aria-label="Default Podcast Playback Speed"
                    data-setting="default-podcast-rate"
                    min={0.75}
                    max={2.0}
                    step={0.05}
                    value={defaultPodcastRate}
                    onChange={(e) => onSetDefaultPodcastRate(Number(e.target.value))}
                    className="accent-[var(--md-sys-color-primary)] cursor-pointer mt-2"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {defaultPodcastHosts.map((hostItem, idx) => (
                  <div
                    key={hostItem.id || idx}
                    className="flex items-center gap-2 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-[11px] font-semibold text-[var(--md-sys-color-primary)] w-12">
                      Host {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={hostItem.name}
                      onChange={(e) => onUpdateDefaultPodcastHost(idx, 'name', e.target.value)}
                      aria-label={`Default Podcast Host ${idx + 1} Name`}
                      className="flex-1 min-w-0 bg-transparent border-b border-transparent focus:border-[var(--md-sys-color-primary)] focus:outline-none text-xs"
                    />
                    <select
                      value={hostItem.voiceName}
                      onChange={(e) => onUpdateDefaultPodcastHost(idx, 'voiceName', e.target.value)}
                      aria-label={`Default Podcast Host ${idx + 1} Voice`}
                      className="m3-select bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-lg px-2 py-1 text-xs"
                    >
                      {['Kore', 'Puck', 'Zephyr', 'Fenrir', 'Charon'].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  data-setting="continue-audio-on-minimize"
                  aria-label="Continue podcast and TTS playback when window is minimized"
                  checked={continueAudioOnMinimize}
                  onChange={(e) => onSetContinueAudioOnMinimize(e.target.checked)}
                  className="rounded accent-[var(--md-sys-color-primary)] yt-continue-audio-minimize-checkbox"
                />
                <span className="font-medium text-[var(--md-sys-color-on-surface)]">
                  Continue Podcast / TTS playback in background when window is minimized
                </span>
              </label>
            </section>
          )}

          {/* 5. Transcription & TTS */}
          {showSection('transcript_tts') && (
            <section
              data-settings-cat="transcript_tts"
              className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-4 space-y-4 yt-settings-section-card"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-primary)] flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5" />
                <span>Transcription, Voice Input &amp; TTS</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-setting="follow-along"
                    checked={followAlong}
                    onChange={onToggleFollowAlong}
                    className="rounded accent-[var(--md-sys-color-primary)]"
                  />
                  <span>Follow-Along auto-scroll lock during playback</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-setting="default-skip-silence"
                    checked={defaultSkipSilence}
                    onChange={(e) => onSetDefaultSkipSilence(e.target.checked)}
                    className="rounded accent-[var(--md-sys-color-primary)]"
                  />
                  <span>Skip Silence &amp; non-speech cue brackets ([Music])</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none sm:col-span-2">
                  <input
                    type="checkbox"
                    data-setting="continue-audio-on-minimize-tts"
                    aria-label="Continue TTS and podcast playback when window is minimized"
                    checked={continueAudioOnMinimize}
                    onChange={(e) => onSetContinueAudioOnMinimize(e.target.checked)}
                    className="rounded accent-[var(--md-sys-color-primary)] yt-continue-audio-minimize-checkbox"
                  />
                  <span className="font-medium text-[var(--md-sys-color-on-surface)]">
                    Continue Podcast / TTS playback when window is minimized
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Voice Question Input Engine</span>
                  <select
                    aria-label="Voice Question Input Engine"
                    data-setting="voice-input-engine"
                    value={voiceInputEngine}
                    onChange={(e) => onSetVoiceInputEngine(e.target.value as VoiceInputEngine)}
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)]"
                  >
                    <option value="browser">Browser Web Speech Recognition</option>
                    <option value="gemini">Gemini Audio Transcribe (gemini-3.5-transcribe)</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">Default TTS Voice</span>
                  <select
                    aria-label="Default TTS Voice"
                    data-setting="default-tts-voice"
                    value={defaultTtsVoice}
                    onChange={(e) => onSetDefaultTtsVoice(e.target.value)}
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)]"
                  >
                    {AI_VOICE_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                    {browserVoices.slice(0, 12).map((bv) => (
                      <option key={bv.voiceURI} value={bv.voiceURI}>
                        {bv.name} ({bv.lang})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium flex items-center justify-between">
                    <span>Default TTS Speed</span>
                    <span className="font-mono tabular-nums text-[var(--md-sys-color-primary)] font-semibold">
                      {defaultTtsRate.toFixed(2)}x
                    </span>
                  </span>
                  <input
                    type="range"
                    aria-label="Default TTS Speed"
                    data-setting="default-tts-rate"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={defaultTtsRate}
                    onChange={(e) => onSetDefaultTtsRate(Number(e.target.value))}
                    className="accent-[var(--md-sys-color-primary)] cursor-pointer mt-1"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium flex items-center justify-between">
                    <span>Default TTS Pitch</span>
                    <span className="font-mono tabular-nums text-[var(--md-sys-color-primary)] font-semibold">
                      {defaultTtsPitch.toFixed(2)}x
                    </span>
                  </span>
                  <input
                    type="range"
                    aria-label="Default TTS Pitch"
                    data-setting="default-tts-pitch"
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    value={defaultTtsPitch}
                    onChange={(e) => onSetDefaultTtsPitch(Number(e.target.value))}
                    className="accent-[var(--md-sys-color-primary)] cursor-pointer mt-1"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium flex items-center justify-between">
                    <span>Default TTS Volume</span>
                    <span className="font-mono tabular-nums text-[var(--md-sys-color-primary)] font-semibold">
                      {Math.round(defaultTtsVolume * 100)}%
                    </span>
                  </span>
                  <input
                    type="range"
                    aria-label="Default TTS Volume"
                    data-setting="default-tts-volume"
                    min={0}
                    max={1}
                    step={0.05}
                    value={defaultTtsVolume}
                    onChange={(e) => onSetDefaultTtsVolume(Number(e.target.value))}
                    className="accent-[var(--md-sys-color-primary)] cursor-pointer mt-1"
                  />
                </label>
              </div>
            </section>
          )}

          {/* 6. History & Lower-Right Dock */}
          {showSection('history') && (
            <section
              data-settings-cat="history"
              className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-4 space-y-4 yt-settings-section-card"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-primary)] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>History &amp; Lower-Right Dock</span>
              </h3>

              <label className="flex items-center justify-between gap-3 text-xs cursor-pointer select-none">
                <span className="font-medium text-[var(--md-sys-color-on-surface)]">
                  Show History tab in the lower-right of the page
                </span>
                <input
                  type="checkbox"
                  aria-label="Show History tab in the lower-right of the page"
                  data-setting="show-history-bottom-tab"
                  checked={showHistoryBottomTab}
                  onChange={(e) => onSetShowHistoryBottomTab(e.target.checked)}
                  className="rounded accent-[var(--md-sys-color-primary)] yt-show-history-tab-checkbox"
                />
              </label>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-[var(--md-sys-color-on-surface)]">
                    History Dock Page Visibility Scope
                  </div>
                  <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    Choose between Home feed only or showing the History dock pill on every YouTube page
                  </div>
                </div>
                <div
                  className="inline-flex items-center bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-full p-1 gap-1 shrink-0"
                  role="group"
                  aria-label="History Dock Page Scope"
                >
                  {(
                    [
                      { id: 'all_pages', label: 'Every Page' },
                      { id: 'home_only', label: 'Home Feed Only' }
                    ] as const
                  ).map((opt) => {
                    const active = historyPageScope === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-history-scope={opt.id}
                        aria-pressed={active}
                        onClick={() => onSetHistoryPageScope(opt.id)}
                        className={`yt-history-scope-btn px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-semibold active'
                            : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium">
                    History dock display condition
                  </span>
                  <select
                    aria-label="History dock visibility setting"
                    data-setting="history-tab-visibility"
                    value={historyTabVisibility}
                    onChange={(e) => onSetHistoryTabVisibility(e.target.value as HistoryTabVisibility)}
                    className="m3-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  >
                    <option value="always">Always show when saved</option>
                    <option value="with_tabs">Only when other tabs are open</option>
                    <option value="never">Hidden (launcher &amp; windows only)</option>
                  </select>
                </label>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-[var(--md-sys-color-on-surface-variant)]">Preview page:</span>
                    <button
                      type="button"
                      data-settings-sim-page={isVideoPage ? 'home' : 'video'}
                      onClick={() => onSetCurrentSimPage(isVideoPage ? '/' : '/watch?v=D_clickbait_chip')}
                      className="px-2.5 py-1 rounded-full border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-xs cursor-pointer"
                    >
                      {isVideoPage ? 'Video Page (/watch)' : 'Home Feed (/)'}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={onClearAllHistory}
                    disabled={closedSummariesCount === 0}
                    className="px-3 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] text-xs font-medium text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)] hover:text-[var(--md-sys-color-on-error-container)] disabled:opacity-40 cursor-pointer yt-settings-clear-history-btn"
                  >
                    Clear All History ({closedSummariesCount})
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* 7. API Keys & Custom Models */}
          {showSection('keys') && (
            <section
              data-settings-cat="keys"
              className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-4 space-y-4 yt-settings-section-card"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-primary)] flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>API Keys &amp; Custom Gemini Models</span>
                </h3>
                <button
                  type="button"
                  onClick={onRefreshModels}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-xs font-medium cursor-pointer yt-refresh-models-btn"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh Models</span>
                </button>
              </div>

              {/* Stored API Keys */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-[var(--md-sys-color-on-surface)]">Local API Key Profiles</div>
                {apiKeys.length === 0 ? (
                  <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] italic">
                    No API key profiles configured in this browser.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {apiKeys.map((k) => (
                      <div
                        key={k.id}
                        className="flex items-center gap-2 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 py-1.5 text-xs"
                      >
                        <input
                          type="text"
                          value={k.name}
                          onChange={(e) => onRenameApiKey(k.id, e.target.value)}
                          aria-label={`API key nickname ${k.name}`}
                          className="flex-1 min-w-0 bg-transparent border-b border-transparent focus:border-[var(--md-sys-color-primary)] focus:outline-none text-xs"
                        />
                        <span className="font-mono text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                          ••••{k.key.slice(-4)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onDeleteApiKey(k.id)}
                          aria-label={`Delete API key ${k.name}`}
                          className="p-1 text-[var(--md-sys-color-error)] hover:opacity-80 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Key nickname (e.g. Personal)"
                    aria-label="New API key nickname"
                    className="flex-1 min-w-[130px] bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  />
                  <input
                    type="password"
                    value={newKeyValue}
                    onChange={(e) => setNewKeyValue(e.target.value)}
                    placeholder="AIzaSy..."
                    aria-label="New API key secret"
                    className="flex-1 min-w-[160px] bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const raw = newKeyValue.trim();
                      if (!raw) return;
                      onAddApiKey(newKeyName.trim() || `Key ${apiKeys.length + 1}`, raw);
                      setNewKeyName('');
                      setNewKeyValue('');
                    }}
                    className="px-3 py-1.5 rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] text-xs font-semibold cursor-pointer hover:opacity-90"
                  >
                    Add Key
                  </button>
                </div>
              </div>

              {/* Custom Gemini Models */}
              <div className="space-y-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                <div className="text-xs font-medium text-[var(--md-sys-color-on-surface)]">Custom Gemini Models</div>
                {customModels.length === 0 ? (
                  <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] italic">
                    No custom model IDs added.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {customModels.map((mid) => (
                      <div
                        key={mid}
                        className="inline-flex items-center gap-1.5 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-3 py-1 text-xs"
                      >
                        <span className="font-mono">{mid}</span>
                        <button
                          type="button"
                          onClick={() => onRemoveCustomModel(mid)}
                          aria-label={`Remove custom model ${mid}`}
                          className="text-[var(--md-sys-color-error)] hover:opacity-80 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCustomModel}
                    onChange={(e) => setNewCustomModel(e.target.value)}
                    placeholder="Custom model ID (e.g. gemini-3.9-pro-exp)"
                    aria-label="Custom Gemini model ID"
                    data-setting="custom-model-input"
                    className="flex-1 min-w-0 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                  />
                  <button
                    type="button"
                    data-setting="add-custom-model-btn"
                    onClick={() => {
                      const clean = newCustomModel.trim();
                      if (!clean) return;
                      onAddCustomModel(clean);
                      setNewCustomModel('');
                    }}
                    className="px-3 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-xs font-medium cursor-pointer"
                  >
                    Add Model
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            Changes save automatically to browser storage
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-full bg-[var(--md-sys-color-primary)] hover:opacity-90 text-[var(--md-sys-color-on-primary)] text-xs font-semibold transition-opacity cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

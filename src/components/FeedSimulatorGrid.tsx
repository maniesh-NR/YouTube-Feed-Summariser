import React from 'react';
import {
  Sparkles,
  Play,
  Layers,
  Clock,
  Zap,
  Sun,
  Moon,
  Monitor,
  RefreshCw,
  FileText,
  Music,
  Shield,
  SlidersHorizontal
} from 'lucide-react';
import {
  isYouTubeVideoPage,
  normalizeHistoryTabVisibility,
  normalizeSummaryPersona,
  resolveAutoTitleDecision,
  SUMMARY_PERSONA_PRESETS,
  type AltTitleGenerationMode,
  type AppThemeMode,
  type ChannelTitleRule,
  type EffectiveTheme,
  type HistoryTabVisibility,
  type SummaryPersona
} from '../utils/userscript-helpers';
import type { MockVideo } from './SimulatorTypes';

interface FeedSimulatorGridProps {
  videos: MockVideo[];
  appThemeMode: AppThemeMode;
  effectiveTheme: EffectiveTheme;
  onSetAppThemeMode: (mode: AppThemeMode) => void;
  altTitlesEnabled: boolean;
  onSetAltTitlesEnabled: (enabled: boolean) => void;
  altTitleMode: AltTitleGenerationMode;
  onSetAltTitleMode: (mode: AltTitleGenerationMode) => void;
  currentSimPage: string;
  onSetCurrentSimPage: (path: string) => void;
  dearrowSimulated: boolean;
  onSetDearrowSimulated: (enabled: boolean) => void;
  simulatedYouTubeTheme: 'dark' | 'light';
  onSetSimulatedYouTubeTheme: (theme: 'dark' | 'light') => void;
  historyTabVisibility: HistoryTabVisibility;
  onSetHistoryTabVisibility: (vis: HistoryTabVisibility) => void;
  summaryPersona: SummaryPersona;
  onSetSummaryPersona: (persona: SummaryPersona) => void;
  channelTitleRules: Record<string, 'exempt' | 'force_ai'>;
  onSetChannelTitleRule: (channelName: string, rule: ChannelTitleRule) => void;
  ruleMenuOpenId: string | null;
  setRuleMenuOpenId: React.Dispatch<React.SetStateAction<string | null>>;
  dearrowToggledOriginal: Record<string, boolean>;
  setDearrowToggledOriginal: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  cardTitleModes: Record<string, 'original' | 'dearrow' | 'ai'>;
  onToggleCardTitle: (videoId: string, video: MockVideo, allowMusicManual?: boolean) => void;
  activeMenuId: string | null;
  setActiveMenuId: React.Dispatch<React.SetStateAction<string | null>>;
  onOpenVideoWindow: (video: MockVideo) => void;
}

export const FeedSimulatorGrid: React.FC<FeedSimulatorGridProps> = ({
  videos,
  appThemeMode,
  effectiveTheme,
  onSetAppThemeMode,
  altTitlesEnabled,
  onSetAltTitlesEnabled,
  altTitleMode,
  onSetAltTitleMode,
  currentSimPage,
  onSetCurrentSimPage,
  dearrowSimulated,
  onSetDearrowSimulated,
  simulatedYouTubeTheme,
  onSetSimulatedYouTubeTheme,
  historyTabVisibility,
  onSetHistoryTabVisibility,
  summaryPersona,
  onSetSummaryPersona,
  channelTitleRules,
  onSetChannelTitleRule,
  ruleMenuOpenId,
  setRuleMenuOpenId,
  dearrowToggledOriginal,
  setDearrowToggledOriginal,
  cardTitleModes,
  onToggleCardTitle,
  activeMenuId,
  setActiveMenuId,
  onOpenVideoWindow
}) => {
  const isVideoPage = isYouTubeVideoPage(currentSimPage);
  const resolveCardState = (video: MockVideo) => {
    const hasDearrow = Boolean(dearrowSimulated && video.dearrowTitle);
    const manualOverride = cardTitleModes[video.id] || null;
    const decision = resolveAutoTitleDecision({
      altTitlesEnabled,
      altTitleMode,
      isMusic: video.isMusic,
      hasDeArrowTitle: hasDearrow,
      channelName: video.channel,
      channelRules: channelTitleRules,
      manualOverride
    });

    let displayTitle = video.originalTitle || video.title;
    if (video.isMusic && manualOverride === 'ai') {
      displayTitle = video.aiTitle || video.title;
    } else if (decision.mode === 'music') {
      displayTitle = video.title;
    } else if (decision.mode === 'ai') {
      displayTitle = video.aiTitle || video.title;
    } else if (decision.mode === 'dearrow') {
      displayTitle = dearrowToggledOriginal[video.id]
        ? (video.originalTitle || video.title)
        : (video.dearrowTitle || video.title);
    }

    return { decision, displayTitle, hasDearrow, isMusicAiActive: Boolean(video.isMusic && manualOverride === 'ai') };
  };

  return (
    <>
      <div className="bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-[24px] p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-lg sm:text-xl font-display font-semibold text-[var(--md-sys-color-on-surface)]">
              Interactive YouTube Feed Simulator
            </h1>
            <span className="text-xs text-[var(--md-sys-color-success)] font-semibold">
              Userscript v2.12.0 Active
            </span>
          </div>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] max-w-2xl">
            Click the 3-dot menu on any video card to test the injected{' '}
            <strong className="text-[var(--md-sys-color-on-surface)]">Summarize</strong> action, inspect per-channel title rules next to any title, or jump directly to timestamped sections inside floating windows.
          </p>
        </div>

        {/* Material You 3-state UI Theme Switcher (System / Light / Dark) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
              UI Theme:
            </span>
            <div
              data-testid="app-theme-toggle"
              role="group"
              aria-label="Material You UI Theme Mode"
              className="inline-flex items-center rounded-full bg-[var(--md-sys-color-surface-container-high)] p-1 border border-[var(--md-sys-color-outline-variant)]"
            >
              {(
                [
                  { id: 'system', label: 'System', Icon: Monitor },
                  { id: 'light', label: 'Light', Icon: Sun },
                  { id: 'dark', label: 'Dark', Icon: Moon }
                ] as const
              ).map(({ id, label, Icon }) => {
                const isSelected = appThemeMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    data-app-theme-option={id}
                    aria-pressed={isSelected}
                    onClick={() => onSetAppThemeMode(id)}
                    title={
                      id === 'system'
                        ? `Follow OS theme (currently ${effectiveTheme})`
                        : `Switch UI to ${label} mode`
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-semibold shadow-xs'
                        : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Alternative AI Titles, DeArrow & Global Simulator Controls */}
      <div className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-[24px] p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-2xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-[var(--md-sys-color-on-surface)]">
                Alternative Non-Clickbait AI Titles
              </span>
              <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                ON by default · Yields to DeArrow · Per-channel rules persisted
              </span>
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5 max-w-2xl">
              Generates concise factual titles (strictly &le; 150 chars). Use the shield button next to any card title to configure per-channel Exempt or Always AI rules.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Simulated YouTube Page Context (Home Feed vs Video Page) */}
          <div
            data-testid="sim-page-toggle"
            role="group"
            aria-label="Simulated YouTube page context"
            className="inline-flex items-center rounded-full bg-[var(--md-sys-color-surface-container-high)] p-1 border border-[var(--md-sys-color-outline-variant)]"
          >
            <button
              type="button"
              data-sim-page="home"
              aria-pressed={!isVideoPage}
              onClick={() => onSetCurrentSimPage('/')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                !isVideoPage
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-semibold'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
              }`}
            >
              Home Feed
            </button>
            <button
              type="button"
              data-sim-page="video"
              aria-pressed={isVideoPage}
              onClick={() => onSetCurrentSimPage('/watch?v=D_clickbait_chip')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isVideoPage
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-semibold'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
              }`}
            >
              Video Page
            </button>
          </div>

          {/* Global Auto-Title Setting (3-way mode + checkbox parity) */}
          <label className="flex items-center gap-2 cursor-pointer bg-[var(--md-sys-color-surface-container-high)] px-3.5 py-2 rounded-full border border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-outline)] transition-colors">
            <input
              type="checkbox"
              checked={altTitleMode === 'on'}
              onChange={(e) => onSetAltTitlesEnabled(e.target.checked)}
              aria-label="Alternative AI Titles Setting"
              className="rounded accent-[var(--md-sys-color-primary)] focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer yt-alt-titles-setting-toggle"
            />
            <span className="text-xs font-medium text-[var(--md-sys-color-on-surface)] whitespace-nowrap">
              Alternative AI Titles Setting
            </span>
          </label>
          <div
            role="group"
            aria-label="AI Title Mode"
            className="inline-flex items-center rounded-full bg-[var(--md-sys-color-surface-container-high)] p-1 border border-[var(--md-sys-color-outline-variant)]"
          >
            {(
              [
                { id: 'on', label: 'Auto' },
                { id: 'manual', label: 'Manual' },
                { id: 'off', label: 'Off' }
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-feed-alt-title-mode={opt.id}
                aria-pressed={altTitleMode === opt.id}
                onClick={() => onSetAltTitleMode(opt.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  altTitleMode === opt.id
                    ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-semibold'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* DeArrow Simulation Toggle */}
          <label className="flex items-center gap-2 cursor-pointer bg-[var(--md-sys-color-surface-container-high)] px-3.5 py-2 rounded-full border border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-outline)] transition-colors">
            <input
              type="checkbox"
              checked={dearrowSimulated}
              onChange={(e) => onSetDearrowSimulated(e.target.checked)}
              className="rounded accent-[var(--md-sys-color-primary)] focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-xs font-medium text-[var(--md-sys-color-on-surface)] whitespace-nowrap">
              Simulate DeArrow Installed
            </span>
          </label>

          {/* YouTube Theme Simulation Toggle */}
          <button
            type="button"
            onClick={() => onSetSimulatedYouTubeTheme(simulatedYouTubeTheme === 'dark' ? 'light' : 'dark')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              simulatedYouTubeTheme === 'dark'
                ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] border-[var(--md-sys-color-outline-variant)] hover:opacity-90'
                : 'bg-[var(--md-sys-color-warning-container)] text-[var(--md-sys-color-on-warning-container)] border-[var(--md-sys-color-warning)]/40 hover:opacity-90'
            }`}
            title="Toggle YouTube theme between Dark and Light mode to test automatic Reader View synchronization"
          >
            {simulatedYouTubeTheme === 'dark' ? (
              <>
                <Moon className="w-3.5 h-3.5" />
                <span>YouTube: Dark Mode</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5" />
                <span>YouTube: Light Mode</span>
              </>
            )}
          </button>

          {/* Summary Persona Default */}
          <label className="flex items-center gap-2 bg-[var(--md-sys-color-surface-container-high)] px-3.5 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] text-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)] flex-shrink-0" />
            <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium whitespace-nowrap">Persona:</span>
            <select
              aria-label="Default Summary Persona"
              value={summaryPersona}
              onChange={(e) => onSetSummaryPersona(normalizeSummaryPersona(e.target.value))}
              className="m3-select bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-2.5 py-0.5 text-xs focus:outline-none cursor-pointer yt-global-persona-select"
            >
              {(Object.keys(SUMMARY_PERSONA_PRESETS) as SummaryPersona[]).map((key) => (
                <option
                  key={key}
                  value={key}
                  className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                >
                  {SUMMARY_PERSONA_PRESETS[key].label}
                </option>
              ))}
            </select>
          </label>

          {/* History Dock Tab Visibility Setting */}
          <label className="flex items-center gap-2 bg-[var(--md-sys-color-surface-container-high)] px-3.5 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] text-xs">
            <Clock className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)] flex-shrink-0" />
            <span className="text-[var(--md-sys-color-on-surface-variant)] font-medium whitespace-nowrap">
              History tab:
            </span>
            <select
              aria-label="History dock tab visibility"
              value={historyTabVisibility}
              onChange={(e) => onSetHistoryTabVisibility(normalizeHistoryTabVisibility(e.target.value))}
              className="m3-select bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-2.5 py-0.5 text-xs focus:outline-none cursor-pointer yt-history-visibility-select"
            >
              <option
                value="always"
                className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
              >
                Always shown
              </option>
              <option
                value="with_tabs"
                className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
              >
                Only with open/minimized tabs
              </option>
              <option
                value="never"
                className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
              >
                Never shown
              </option>
            </select>
          </label>
        </div>
      </div>

      {/* Video Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {videos.map((video) => {
          const { decision, displayTitle, hasDearrow } = resolveCardState(video);
          const ruleMenuOpen = ruleMenuOpenId === video.id;

          return (
            <div
              key={video.id}
              data-card-video-id={video.id}
              data-channel-name={video.channel}
              className="bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-[24px] hover:border-[var(--md-sys-color-outline)] transition-colors flex flex-col group relative shadow-xs"
            >
              {/* Thumbnail */}
              <div className="w-full aspect-video bg-gradient-to-br from-slate-800 to-slate-950 relative flex items-center justify-center rounded-t-[24px] overflow-hidden">
                <div className="absolute inset-0 bg-black/15 group-hover:bg-transparent transition-colors"></div>
                <div className="w-12 h-12 rounded-full bg-black/65 flex items-center justify-center text-white group-hover:scale-110 group-hover:bg-[var(--md-sys-color-primary)] group-hover:text-[var(--md-sys-color-on-primary)] transition-all shadow-lg">
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </div>
                <span className="absolute bottom-2.5 right-2.5 bg-black/80 text-white text-[11px] font-medium font-mono tabular-nums px-2 py-0.5 rounded-full">
                  {video.duration}
                </span>
                <span className="absolute top-2.5 left-2.5 bg-black/75 text-white border border-white/15 text-[10px] font-medium px-2.5 py-0.5 rounded-full">
                  {video.badge}
                </span>
                {hasDearrow && !video.isMusic && (
                  <div
                    className="cbThumbnailButtonContainer absolute top-2.5 right-2.5 z-10 flex items-center gap-1 bg-black/75 backdrop-blur-sm border border-indigo-400/50 rounded-full px-2 py-0.5 text-indigo-200 text-[10px]"
                    title="DeArrow: Thumbnail overlay (no collision with summariser)"
                  >
                    <Zap className="w-3 h-3 text-indigo-300 fill-indigo-300/20" />
                    <span>DeArrow</span>
                  </div>
                )}
              </div>

              {/* Metadata & 3-Dot Menu */}
              <div className="p-4 flex gap-3 flex-1">
                <div className="w-9 h-9 rounded-full bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] flex-shrink-0 flex items-center justify-center text-xs font-semibold">
                  {video.channel[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-1.5 flex-wrap relative">
                    <h3 className="font-medium text-sm text-[var(--md-sys-color-on-surface)] line-clamp-2 leading-snug group-hover:text-[var(--md-sys-color-primary)] transition-colors inline yt-card-display-title">
                      {displayTitle}
                    </h3>

                    {/* DeArrow Native Title Button Container */}
                    {hasDearrow && !video.isMusic && (
                      <div
                        className="cbTitleButtonContainer inline-flex items-center gap-1 flex-shrink-0"
                        title="DeArrow: Show original title / Submit title"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDearrowToggledOriginal((prev) => ({
                              ...prev,
                              [video.id]: !prev[video.id]
                            }));
                          }}
                          className="cbButton cbTitleButton inline-flex items-center justify-center p-1 rounded-full transition-colors border bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] border-[var(--md-sys-color-outline-variant)] hover:opacity-85 cursor-pointer"
                          title={dearrowToggledOriginal[video.id] ? 'DeArrow: Show DeArrow title' : 'DeArrow: Show original title'}
                          aria-label="DeArrow title toggle"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Alternative Title Toggle + Per-Channel Rule Selector */}
                    {!video.isMusic ? (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleCardTitle(video.id, video);
                          }}
                          className={`inline-flex items-center justify-center p-1 rounded-full transition-colors border yt-alt-title-btn flex-shrink-0 cursor-pointer ${
                            decision.mode === 'ai'
                              ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-[var(--md-sys-color-primary)]/40 hover:opacity-90'
                              : decision.mode === 'dearrow'
                              ? 'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] border-[var(--md-sys-color-tertiary)]/40 hover:opacity-90'
                              : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                          }`}
                          title={
                            decision.mode === 'ai'
                              ? hasDearrow
                                ? 'Showing AI summary title (Click to switch to DeArrow title)'
                                : 'Showing AI summary title (Click to switch to original title)'
                              : decision.mode === 'dearrow'
                              ? 'Showing DeArrow title (Click to switch to AI summary title)'
                              : 'Showing original title (Click to switch to AI summary title)'
                          }
                          aria-label={`Switch title mode for ${video.channel}`}
                        >
                          {decision.mode === 'ai' ? (
                            <Sparkles className="w-3.5 h-3.5" />
                          ) : decision.mode === 'dearrow' ? (
                            <Zap className="w-3.5 h-3.5" />
                          ) : (
                            <FileText className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* FEAT-02 Per-Channel Auto-Title Rule Button & Inline Menu */}
                        <div className="relative inline-flex">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              setRuleMenuOpenId((prev) => (prev === video.id ? null : video.id));
                            }}
                            data-channel-rule={decision.rule}
                            aria-expanded={ruleMenuOpen}
                            aria-label={`Channel title rule for ${video.channel}`}
                            title={
                              decision.rule === 'exempt'
                                ? `Channel rule: Exempt (${video.channel} keeps original / DeArrow)`
                                : decision.rule === 'force_ai'
                                ? `Channel rule: Always AI (${video.channel} prefers AI title)`
                                : `Channel title rule for ${video.channel}: Default (click to configure)`
                            }
                            className={`inline-flex items-center justify-center p-1 rounded-full transition-colors border yt-channel-rule-btn flex-shrink-0 cursor-pointer ${
                              decision.rule === 'exempt'
                                ? 'bg-[var(--md-sys-color-warning-container)] text-[var(--md-sys-color-on-warning-container)] border-[var(--md-sys-color-warning)]/40 hover:opacity-90'
                                : decision.rule === 'force_ai'
                                ? 'bg-[var(--md-sys-color-success-container)] text-[var(--md-sys-color-on-success-container)] border-[var(--md-sys-color-success)]/40 hover:opacity-90'
                                : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                            }`}
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>

                          {ruleMenuOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              role="menu"
                              aria-label={`Auto-title rule options for ${video.channel}`}
                              className="yt-channel-rule-menu absolute right-0 top-8 w-60 bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl shadow-xl p-1.5 z-50 text-xs text-[var(--md-sys-color-on-surface)] space-y-0.5"
                            >
                              <div className="px-2.5 py-1 text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)] border-b border-[var(--md-sys-color-outline-variant)] mb-1 truncate">
                                Channel rule: {video.channel}
                              </div>
                              {(
                                [
                                  { id: 'default', label: 'Default (yields to DeArrow)' },
                                  { id: 'exempt', label: 'Exempt (keep original / DeArrow)' },
                                  { id: 'force_ai', label: 'Always AI title' }
                                ] as const
                              ).map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  role="menuitemradio"
                                  aria-checked={decision.rule === opt.id}
                                  data-rule-option={opt.id}
                                  onClick={() => onSetChannelTitleRule(video.channel, opt.id)}
                                  className={`w-full text-left px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                    decision.rule === opt.id
                                      ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-semibold'
                                      : 'hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)]'
                                  }`}
                                >
                                  <span>{opt.label}</span>
                                  {decision.rule === opt.id && <span aria-hidden="true">✓</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCardTitle(video.id, video, true);
                        }}
                        aria-label={`Manually generate or toggle AI title for ${video.channel}`}
                        aria-pressed={cardTitleModes[video.id] === 'ai'}
                        className={`inline-flex items-center justify-center p-1 rounded-full border cursor-pointer yt-music-exempt-icon flex-shrink-0 transition-colors ${
                          cardTitleModes[video.id] === 'ai'
                            ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-[var(--md-sys-color-primary)]/40'
                            : 'text-[var(--md-sys-color-tertiary)] bg-[var(--md-sys-color-tertiary-container)] border-[var(--md-sys-color-outline-variant)] hover:opacity-85'
                        }`}
                        title={
                          cardTitleModes[video.id] === 'ai'
                            ? 'Music video: Showing manually generated AI title (Click to revert to original)'
                            : 'Music video (exempt from title replacement) — Click to manually generate AI summary title'
                        }
                      >
                        <Music className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                    <span>{video.channel}</span>
                    {decision.rule !== 'default' && !video.isMusic && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            decision.rule === 'exempt'
                              ? 'text-[var(--md-sys-color-warning)] font-medium'
                              : 'text-[var(--md-sys-color-success)] font-medium'
                          }
                        >
                          {decision.rule === 'exempt' ? 'Rule: Exempt' : 'Rule: Always AI'}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] tabular-nums">{video.views}</p>
                </div>

                {/* 3-Dot Action Button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRuleMenuOpenId(null);
                      setActiveMenuId(activeMenuId === video.id ? null : video.id);
                    }}
                    className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer"
                    title="Action menu"
                  >
                    <span className="text-lg leading-none font-bold">⋮</span>
                  </button>

                  {activeMenuId === video.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-8 w-56 bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl shadow-xl py-1.5 z-40 text-xs text-[var(--md-sys-color-on-surface)]"
                    >
                      <div className="px-3.5 py-2 hover:bg-[var(--md-sys-color-surface-container-highest)] cursor-pointer flex items-center gap-2.5">
                        <Layers className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)]" />
                        <span>Save to playlist</span>
                      </div>

                      <div
                        onClick={() => onOpenVideoWindow(video)}
                        className="px-3.5 py-2.5 bg-[var(--md-sys-color-primary-container)] hover:opacity-95 text-[var(--md-sys-color-on-primary-container)] font-medium cursor-pointer flex items-center gap-2.5 border-y border-[var(--md-sys-color-outline-variant)] transition-opacity"
                      >
                        <Sparkles className="w-5 h-5" />
                        <span className="text-[15px] font-medium tracking-tight">Summarize</span>
                        <span className="ml-auto text-[10px] bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] px-2 py-0.5 rounded-full font-mono">
                          Gemini
                        </span>
                      </div>

                      <div className="px-3.5 py-2 hover:bg-[var(--md-sys-color-surface-container-highest)] cursor-pointer flex items-center gap-2.5">
                        <span className="text-sm">↓</span>
                        <span>Download</span>
                      </div>
                      <div className="px-3.5 py-2 hover:bg-[var(--md-sys-color-surface-container-highest)] cursor-pointer flex items-center gap-2.5">
                        <Clock className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)]" />
                        <span>Watch later</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

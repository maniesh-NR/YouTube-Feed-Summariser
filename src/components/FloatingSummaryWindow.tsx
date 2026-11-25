import React from 'react';
import {
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  Terminal,
  Play,
  Volume2,
  ShieldAlert,
  FileCode,
  ExternalLink,
  RefreshCw,
  X,
  Minus,
  Search,
  ChevronUp,
  ChevronDown,
  BookOpen,
  Download,
  FileText,
  Printer,
  Mic,
  MicOff,
  Send,
  Globe,
  MapPin,
  Bot,
  Image as ImageIcon,
  MoreHorizontal,
  GripVertical,
  Clock,
  Lock,
  Unlock,
  SlidersHorizontal,
  ArrowLeftRight,
  Pencil,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import {
  formatMathSymbolsInText,
  resolveSummaryPersonaInstruction,
  normalizeSummaryPersona,
  extractSummaryChapters,
  buildLongVideoTranscriptChunks,
  parseTimestampToSeconds,
  tokenizeSummaryTextWithVisuals,
  ensureFallbackVisualMarkers,
  resolveSummaryWindowDisplayTitle,
  normalizeFollowUpTurn,
  getActiveFollowUpVersion,
  SUMMARY_PERSONA_PRESETS,
  type AdaptiveWindowFlags,
  type EffectiveTheme,
  type GeneratedTextFormattingPrefs,
  type ResizeDirection,
  type ResponseRatingRecord,
  type SummaryPersona,
  type SummaryWindowTitleMode,
  type WindowBounds,
  type PodcastHost,
  type PodcastEpisode
} from '../utils/userscript-helpers';
import {
  getLocalDiagramDataUri,
  getLocalFramePreviewDataUri,
  type ActiveSeekState,
  type ChatTurn,
  type FactCheckData,
  type MockVideo
} from './SimulatorTypes';
import { TimestampText } from './TimestampText';
import { ResponseRatingBar } from './ResponseRatingBar';
import { TtsControlBar } from './TtsControlBar';
import { ReadabilityModal } from './ReadabilityModal';
import { PodcastStudioPanel } from './PodcastStudioPanel';

interface FloatingSummaryWindowProps {
  video: MockVideo;
  winState: { minimized: boolean; mode: 'summary' | 'transcript' | 'podcast'; source: 'video' | 'text' };
  bounds: WindowBounds;
  zIndex: number;
  isFocused: boolean;
  adaptive: AdaptiveWindowFlags;
  showOptionsRow: boolean;
  compactOptionsExpanded: boolean;
  setContainerRef: (el: HTMLDivElement | null) => void;
  onFocus: () => void;
  onStartDrag: (e: React.MouseEvent) => void;
  onStartResize: (dir: ResizeDirection) => (e: React.MouseEvent) => void;
  onResizeKeyDown: (dir: ResizeDirection) => (e: React.KeyboardEvent) => void;
  onGripKeyDown: (e: React.KeyboardEvent) => void;
  toast?: { message: string; visible: boolean };
  effectiveTheme?: EffectiveTheme;
  readabilityMode: boolean;
  readabilityTheme: 'system' | 'light' | 'sepia' | 'dark';
  readabilityFont: 'serif' | 'sans';
  readabilitySize: number;
  syncYouTubeTheme: boolean;
  simulatedYouTubeTheme: 'dark' | 'light';
  onToggleReadabilityMode: () => void;
  onExitReadability: () => void;
  onToggleSyncYouTubeTheme: () => void;
  onSelectReadabilityTheme: (theme: 'system' | 'light' | 'sepia' | 'dark') => void;
  onToggleReadabilityFont: () => void;
  onChangeReadabilitySize: (delta: number) => void;
  exportMenuOpen: boolean;
  onToggleExportMenu: () => void;
  headerOverflowOpen: boolean;
  onToggleHeaderOverflow: (e: React.MouseEvent) => void;
  onCloseHeaderOverflow: () => void;
  copiedVideoUrl: boolean;
  onCopyVideoUrl: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  genFormatting: GeneratedTextFormattingPrefs;
  onMinimize: () => void;
  onClose: () => void;
  onExportTxt: () => void;
  onExportPdf: () => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onChangeWinMode: (mode: 'summary' | 'transcript' | 'podcast') => void;
  onChangeWinSource: (source: 'video' | 'text') => void;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  simAskFailure: boolean;
  onToggleSimAskFailure: (val: boolean) => void;
  fallbackNote: string | null;
  onRegenerate: () => void;
  onToggleCompactOptions: () => void;
  transcriptMode: 'fast' | 'deep';
  onSetTranscriptMode: (mode: 'fast' | 'deep') => void;
  persona: SummaryPersona;
  onSelectPersona: (persona: SummaryPersona) => void;
  altTitlesEnabled: boolean;
  onSetAltTitlesEnabled: (enabled: boolean) => void;
  headerTitleMode?: SummaryWindowTitleMode;
  onToggleHeaderTitleMode?: () => void;
  showFactCheck?: boolean;
  autoFactCheck?: boolean;
  showSources?: boolean;
  showVisuals?: boolean;
  factModel?: string;
  factCheckResult?: FactCheckData | null;
  simFactCheckUnavailable?: boolean;
  onToggleSimFactCheckUnavailable?: (val: boolean) => void;
  isRunningFactCheck?: boolean;
  onRerunFactCheck?: () => void;
  onToggleSummaryOpt?: (patch: { fc?: boolean; src?: boolean; img?: boolean }) => void;
  // TTS Props
  tts: { status: 'idle' | 'playing' | 'paused'; rate: number };
  currentVol: number;
  currentPitch: number;
  skipSilence: boolean;
  selectedVoice: string;
  browserVoices: SpeechSynthesisVoice[];
  activeTtsLine: number | null;
  activeTtsTs: string | null;
  onSelectVoice: (voice: string) => void;
  onToggleTts: (contentText: string) => void;
  onRewindTts: (contentText: string) => void;
  onSkipTts: (contentText: string) => void;
  onStopTts: () => void;
  onSetTtsRate: (rate: number) => void;
  onCycleTtsRate: (contentText: string) => void;
  onSetTtsVolume: (vol: number) => void;
  onSetTtsPitch: (pitch: number) => void;
  onToggleSkipSilence: (contentText: string) => void;
  // FEAT-01 Seek & Follow-Along
  activeSeek: ActiveSeekState | null;
  followAlong: boolean;
  onToggleFollowAlong: () => void;
  onSeekTimestamp: (tsStr: string, seconds: number) => void;
  // Transcript Search
  transcriptSearchQuery: string;
  onChangeTranscriptSearch: (q: string) => void;
  transcriptFilterOnly: boolean;
  onChangeTranscriptFilterOnly: (checked: boolean) => void;
  activeMatchIndex: number;
  onSetActiveMatchIndex: (idx: number) => void;
  // Ratings
  closedSummariesCount: number;
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
  // Conversation
  turns: ChatTurn[];
  isAnsweringFollowUp: boolean;
  regeneratingTurnIdx?: number | null;
  onEditAndRegenerateTurn?: (turnIdx: number, editedQuestion: string) => void;
  onRegenerateTurn?: (turnIdx: number) => void;
  onStepTurnVersion?: (turnIdx: number, delta: number) => void;
  composerText: string;
  onChangeComposerText: (txt: string) => void;
  composerModel: string;
  onSelectComposerModel: (m: string) => void;
  simFollowUpUnavailable: boolean;
  onToggleSimFollowUpUnavailable: (val: boolean) => void;
  followUpFallbackNote: string | null;
  composerGSearch: boolean;
  onToggleComposerGSearch: () => void;
  composerGMaps: boolean;
  onToggleComposerGMaps: () => void;
  isRecordingVoice: boolean;
  onToggleVoiceInput: () => void;
  onSendFollowUp: () => void;
  // FEAT-07 Podcast Props
  podcastHostCount: number;
  podcastHosts: PodcastHost[];
  podcastEpisode: PodcastEpisode | null;
  podcastGenerating: boolean;
  podcastInteracting: boolean;
  podcastListeningVoice: boolean;
  podcastPlaybackStatus: 'idle' | 'playing' | 'paused';
  podcastActiveTurnIdx: number;
  podcastRate: number;
  podcastQaDraft: string;
  onChangePodcastHostCount: (count: number) => void;
  onUpdatePodcastHost: (index: number, field: 'name' | 'voiceName', value: string) => void;
  onGeneratePodcast: () => void;
  onTogglePodcastPlayback: () => void;
  onStepPodcastTurn: (delta: number) => void;
  onStopPodcastPlayback: () => void;
  onChangePodcastRate: (rate: number) => void;
  onPlayPodcastFromTurn: (idx: number) => void;
  onChangePodcastQaDraft: (val: string) => void;
  onSubmitPodcastInteraction: (query?: string, isVoice?: boolean) => void;
  onTogglePodcastVoiceQuestion: () => void;
}

const RESIZE_HANDLE_META: Array<{
  dir: ResizeDirection;
  orientation: 'horizontal' | 'vertical';
  label: string;
  title: string;
  cls: string;
}> = [
  {
    dir: 'n',
    orientation: 'horizontal',
    label: 'Resize height from top',
    title: 'Drag or press Arrow keys to resize height from top',
    cls: 'left-3 right-3 top-0 h-1.5 cursor-ns-resize z-30 hover:bg-[var(--md-sys-color-primary)]/30 yt-resize-n'
  },
  {
    dir: 'e',
    orientation: 'vertical',
    label: 'Resize width',
    title: 'Drag or press Arrow keys to resize width',
    cls: 'top-3 bottom-3 right-0 w-1.5 cursor-ew-resize z-30 hover:bg-[var(--md-sys-color-primary)]/30 yt-resize-e'
  },
  {
    dir: 'w',
    orientation: 'vertical',
    label: 'Resize width from left',
    title: 'Drag or press Arrow keys to resize width from left',
    cls: 'top-3 bottom-3 left-0 w-1.5 cursor-ew-resize z-30 hover:bg-[var(--md-sys-color-primary)]/30 yt-resize-w'
  },
  {
    dir: 's',
    orientation: 'horizontal',
    label: 'Resize height',
    title: 'Drag or press Arrow keys to resize height',
    cls: 'left-3 right-3 bottom-0 h-1.5 cursor-ns-resize z-30 hover:bg-[var(--md-sys-color-primary)]/30 yt-resize-s'
  },
  {
    dir: 'nw',
    orientation: 'horizontal',
    label: 'Resize corner top-left',
    title: 'Drag or press Arrow keys to resize top-left corner',
    cls: 'left-0 top-0 w-3.5 h-3.5 cursor-nwse-resize z-40 yt-resize-nw'
  },
  {
    dir: 'ne',
    orientation: 'horizontal',
    label: 'Resize corner top-right',
    title: 'Drag or press Arrow keys to resize top-right corner',
    cls: 'right-0 top-0 w-3.5 h-3.5 cursor-nesw-resize z-40 yt-resize-ne'
  },
  {
    dir: 'se',
    orientation: 'horizontal',
    label: 'Resize summary window',
    title: 'Drag or press Arrow keys to resize bottom-right corner',
    cls: 'right-0 bottom-0 w-3.5 h-3.5 cursor-nwse-resize z-40 yt-resize-se'
  },
  {
    dir: 'sw',
    orientation: 'horizontal',
    label: 'Resize corner bottom-left',
    title: 'Drag or press Arrow keys to resize bottom-left corner',
    cls: 'left-0 bottom-0 w-3.5 h-3.5 cursor-nesw-resize z-40 yt-resize-sw'
  }
];

export const FloatingSummaryWindow: React.FC<FloatingSummaryWindowProps> = ({
  video,
  winState,
  bounds,
  zIndex,
  isFocused,
  adaptive,
  showOptionsRow,
  setContainerRef,
  onFocus,
  onStartDrag,
  onStartResize,
  onResizeKeyDown,
  onGripKeyDown,
  toast,
  effectiveTheme = 'dark',
  readabilityMode,
  readabilityTheme,
  readabilityFont,
  readabilitySize,
  syncYouTubeTheme,
  simulatedYouTubeTheme,
  onToggleReadabilityMode,
  onExitReadability,
  onToggleSyncYouTubeTheme,
  onSelectReadabilityTheme,
  onToggleReadabilityFont,
  onChangeReadabilitySize,
  exportMenuOpen,
  onToggleExportMenu,
  headerOverflowOpen,
  onToggleHeaderOverflow,
  onCloseHeaderOverflow,
  copiedVideoUrl,
  onCopyVideoUrl,
  onOpenHistory,
  onOpenSettings,
  genFormatting,
  onMinimize,
  onClose,
  onExportTxt,
  onExportPdf,
  onExportJson,
  onExportMarkdown,
  onChangeWinMode,
  onChangeWinSource,
  selectedModel,
  onSelectModel,
  simAskFailure,
  onToggleSimAskFailure,
  fallbackNote,
  onRegenerate,
  onToggleCompactOptions,
  transcriptMode,
  onSetTranscriptMode,
  persona,
  onSelectPersona,
  altTitlesEnabled,
  onSetAltTitlesEnabled,
  headerTitleMode = 'ai',
  onToggleHeaderTitleMode,
  showFactCheck = true,
  autoFactCheck = true,
  showSources = true,
  showVisuals = true,
  factModel = '',
  factCheckResult,
  simFactCheckUnavailable = false,
  onToggleSimFactCheckUnavailable,
  isRunningFactCheck = false,
  onRerunFactCheck,
  onToggleSummaryOpt,
  tts,
  currentVol,
  currentPitch,
  skipSilence,
  selectedVoice,
  browserVoices,
  activeTtsLine,
  activeTtsTs,
  onSelectVoice,
  onToggleTts,
  onRewindTts,
  onSkipTts,
  onStopTts,
  onSetTtsRate,
  onCycleTtsRate,
  onSetTtsVolume,
  onSetTtsPitch,
  onToggleSkipSilence,
  activeSeek,
  followAlong,
  onToggleFollowAlong,
  onSeekTimestamp,
  transcriptSearchQuery,
  onChangeTranscriptSearch,
  transcriptFilterOnly,
  onChangeTranscriptFilterOnly,
  activeMatchIndex,
  onSetActiveMatchIndex,
  closedSummariesCount,
  responseRatings,
  openRatingNoteKey,
  setOpenRatingNoteKey,
  onRateResponse,
  onShowToast,
  turns,
  isAnsweringFollowUp,
  regeneratingTurnIdx = null,
  onEditAndRegenerateTurn,
  onRegenerateTurn,
  onStepTurnVersion,
  composerText,
  onChangeComposerText,
  composerModel,
  onSelectComposerModel,
  simFollowUpUnavailable,
  onToggleSimFollowUpUnavailable,
  followUpFallbackNote,
  composerGSearch,
  onToggleComposerGSearch,
  composerGMaps,
  onToggleComposerGMaps,
  isRecordingVoice,
  onToggleVoiceInput,
  onSendFollowUp,
  podcastHostCount,
  podcastHosts,
  podcastEpisode,
  podcastGenerating,
  podcastInteracting,
  podcastListeningVoice,
  podcastPlaybackStatus,
  podcastActiveTurnIdx,
  podcastRate,
  podcastQaDraft,
  onChangePodcastHostCount,
  onUpdatePodcastHost,
  onGeneratePodcast,
  onTogglePodcastPlayback,
  onStepPodcastTurn,
  onStopPodcastPlayback,
  onChangePodcastRate,
  onPlayPodcastFromTurn,
  onChangePodcastQaDraft,
  onSubmitPodcastInteraction,
  onTogglePodcastVoiceQuestion
}) => {
  const videoId = video.id;
  const contentText = winState.mode === 'summary' ? video.summary : video.transcript;
  const personaPreset = SUMMARY_PERSONA_PRESETS[persona];
  const effectiveSystemInstruction = resolveSummaryPersonaInstruction(persona, transcriptMode);
  const [editingTurnIdx, setEditingTurnIdx] = React.useState<number | null>(null);
  const [editingQuestionDraft, setEditingQuestionDraft] = React.useState('');

  const headerTitleState = resolveSummaryWindowDisplayTitle({
    mode: headerTitleMode,
    aiTitle: video.aiTitle,
    originalTitle: video.originalTitle || video.title,
    fallbackTitle: video.title
  });
  const activeFactCheck: FactCheckData | null | undefined =
    factCheckResult !== undefined ? factCheckResult : autoFactCheck ? video.factCheck : null;
  const totalDurationSec = React.useMemo(
    () => parseTimestampToSeconds(video.duration || '0:00'),
    [video.duration]
  );
  const chapters = React.useMemo(
    () => extractSummaryChapters(video.summary, [], totalDurationSec),
    [video.summary, totalDurationSec]
  );
  const chunkPlan = React.useMemo(
    () => buildLongVideoTranscriptChunks(video.transcript, { chapters, totalDurationSec }),
    [video.transcript, chapters, totalDurationSec]
  );

  const renderFormattedText = (raw: string) => {
    const mathClean = formatMathSymbolsInText(raw);
    if (genFormatting.richFormatting) return mathClean;
    return mathClean
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  };

  return (
    <div
      ref={setContainerRef}
      style={{
        left: `${bounds.left}px`,
        top: `${bounds.top}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        zIndex,
        fontFamily: 'var(--yt-ui-font, var(--font-sans))',
        fontSize: 'var(--yt-ui-font-size, 14px)'
      }}
      data-size-tier={adaptive.tier}
      data-video-id={videoId}
      onMouseDown={onFocus}
      className={`fixed bg-[var(--md-sys-color-surface-container-low)] border rounded-[24px] shadow-2xl flex flex-col overflow-hidden text-[var(--md-sys-color-on-surface)] yt-window-box yt-floating-window ${
        isFocused
          ? 'border-[var(--md-sys-color-primary)] ring-2 ring-[var(--md-sys-color-primary)]/20'
          : 'border-[var(--md-sys-color-outline-variant)]'
      } ${adaptive.isCompact ? 'yt-win-compact' : adaptive.isMedium ? 'yt-win-medium' : 'yt-win-wide'} ${
        adaptive.isShort ? 'yt-win-short' : ''
      }`}
    >
      {/* 8-Direction Resize Handles */}
      {RESIZE_HANDLE_META.map((h) => (
        <div
          key={h.dir}
          role="separator"
          tabIndex={0}
          data-resize-dir={h.dir}
          aria-orientation={h.orientation}
          aria-label={h.label}
          onMouseDown={onStartResize(h.dir)}
          onKeyDown={onResizeKeyDown(h.dir)}
          title={h.title}
          className={`absolute focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--md-sys-color-primary)] focus-visible:bg-[var(--md-sys-color-primary)]/30 transition-colors yt-resize-handle ${h.cls}`}
        />
      ))}

      {/* Scoped Per-Window Toast */}
      {toast?.visible && (
        <div
          data-toast-video-id={videoId}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-surface)] text-xs font-semibold px-3.5 py-1.5 rounded-full shadow-2xl border border-[var(--md-sys-color-outline-variant)] backdrop-blur-md flex items-center gap-1.5 pointer-events-none yt-tts-toast"
        >
          {toast.message}
        </div>
      )}

      {/* Draggable Header */}
      <div
        onMouseDown={onStartDrag}
        className={`${
          adaptive.isCompact ? 'px-3.5 py-2.5' : 'px-6 py-4'
        } border-b border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-2 bg-[var(--md-sys-color-surface-container)] cursor-move select-none yt-win-header`}
        title="Drag header to move window"
      >
        <button
          type="button"
          tabIndex={0}
          onKeyDown={onGripKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] p-1 rounded-full flex-shrink-0 cursor-grab active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--md-sys-color-primary)] yt-win-drag-grip"
          title="Drag or press Arrow keys (Shift for larger steps) to move window"
          aria-label="Move summary window with arrow keys"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="min-w-0 pr-2 flex-1">
          <div className="flex items-center gap-1.5 min-w-0 yt-win-title-row">
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`font-semibold ${
                adaptive.isCompact ? 'text-sm' : 'text-base'
              } text-[var(--md-sys-color-on-surface)] hover:text-[var(--md-sys-color-primary)] transition-colors truncate inline-block min-w-0 max-w-full yt-win-title-link`}
              title={`${headerTitleState.displayTitle} (Open video in new tab)`}
            >
              {headerTitleState.displayTitle}
            </a>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleHeaderTitleMode?.();
              }}
              data-title-mode={headerTitleState.mode}
              aria-pressed={headerTitleState.mode === 'original'}
              aria-label={
                headerTitleState.mode === 'ai'
                  ? 'Switch to original video title'
                  : 'Switch to AI generated title'
              }
              title={
                headerTitleState.mode === 'ai'
                  ? 'Showing AI title — click to switch to original video title'
                  : 'Showing original title — click to switch to AI generated title'
              }
              className={`yt-win-title-switch-btn inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium flex-shrink-0 transition-colors cursor-pointer ${
                headerTitleState.mode === 'original'
                  ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] border-[var(--md-sys-color-primary)]/40'
                  : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] border-[var(--md-sys-color-outline-variant)]'
              }`}
            >
              <ArrowLeftRight className="w-2.5 h-2.5" />
              {!adaptive.isCompact && (
                <span>{headerTitleState.mode === 'ai' ? 'Original' : 'AI Title'}</span>
              )}
            </button>
          </div>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5 flex items-center gap-2 truncate">
            {!adaptive.isCompact && (
              <>
                <span className="truncate">{video.channel}</span>
                <span aria-hidden="true">&middot;</span>
              </>
            )}
            <span className="text-[var(--md-sys-color-success)] flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{adaptive.isCompact ? 'Completed' : `Completed (${personaPreset.shortLabel})`}</span>
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1 relative flex-shrink-0">
          <button
            type="button"
            onClick={onToggleReadabilityMode}
            className={`p-1.5 rounded-full transition-colors flex items-center gap-1 text-xs yt-win-readability-btn cursor-pointer ${
              readabilityMode
                ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border border-[var(--md-sys-color-primary)]/40 active'
                : 'hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
            title={
              readabilityMode
                ? 'Exit Readability Mode (Return to standard interactive view)'
                : 'Readability Mode (Clean, centered distraction-free reader)'
            }
            aria-label="Toggle Readability Mode"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors flex items-center gap-1 text-xs yt-win-settings-btn cursor-pointer"
            title="Settings & Appearance (Theme, UI & Generated Text Formatting)"
            aria-label="Open Settings"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {!adaptive.useOverflowHeaderMenu ? (
            <>
              <div className="relative">
                <button
                  type="button"
                  onClick={onToggleExportMenu}
                  className={`p-1.5 rounded-full transition-colors flex items-center gap-1 text-xs yt-win-export-btn cursor-pointer ${
                    exportMenuOpen
                      ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                      : 'hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                  }`}
                  title="Export summary / transcript (.txt, .pdf, .json, or .md)"
                  aria-label="Export summary"
                >
                  <Download className="w-4 h-4" />
                </button>

                {exportMenuOpen && (
                  <div className="absolute right-0 top-9 w-64 bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl shadow-xl p-2 z-50 text-xs text-[var(--md-sys-color-on-surface)] yt-export-popover space-y-1">
                    <div className="text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider px-2 py-1">
                      Export Content
                    </div>
                    <button
                      type="button"
                      onClick={onExportTxt}
                      className="w-full text-left p-2 rounded-xl hover:bg-[var(--md-sys-color-surface-container-highest)] flex items-center gap-2.5 transition-colors yt-export-item cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-[var(--md-sys-color-primary)] flex-shrink-0" />
                      <div>
                        <div className="font-medium text-[var(--md-sys-color-on-surface)]">Export as Text (.txt)</div>
                        <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                          Formatted plain text with metadata
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={onExportPdf}
                      className="w-full text-left p-2 rounded-xl hover:bg-[var(--md-sys-color-surface-container-highest)] flex items-center gap-2.5 transition-colors yt-export-item cursor-pointer"
                    >
                      <Printer className="w-4 h-4 text-[var(--md-sys-color-success)] flex-shrink-0" />
                      <div>
                        <div className="font-medium text-[var(--md-sys-color-on-surface)]">Export as PDF (.pdf)</div>
                        <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                          Printable serif document layout
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={onExportJson}
                      className="w-full text-left p-2 rounded-xl hover:bg-[var(--md-sys-color-surface-container-highest)] flex items-center gap-2.5 transition-colors yt-export-item yt-export-json-btn cursor-pointer"
                    >
                      <FileCode className="w-4 h-4 text-[var(--md-sys-color-tertiary)] flex-shrink-0" />
                      <div>
                        <div className="font-medium text-[var(--md-sys-color-on-surface)]">Export as JSON (.json)</div>
                        <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                          Structured data with persona &amp; metadata
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={onExportMarkdown}
                      className="w-full text-left p-2 rounded-xl hover:bg-[var(--md-sys-color-surface-container-highest)] flex items-center gap-2.5 transition-colors yt-export-item yt-export-md-btn cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-[var(--md-sys-color-warning)] flex-shrink-0" />
                      <div>
                        <div className="font-medium text-[var(--md-sys-color-on-surface)]">
                          Export Markdown / Obsidian (.md)
                        </div>
                        <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                          Frontmatter, Q&amp;A, ratings &amp; chapters
                        </div>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onOpenHistory}
                className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors yt-history-btn cursor-pointer"
                title="Browse previous summaries (History)"
                aria-label="Browse previous summaries"
              >
                <Clock className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onCopyVideoUrl}
                className={`p-1.5 rounded-full transition-colors flex items-center gap-1 text-xs yt-win-copy-btn cursor-pointer ${
                  copiedVideoUrl
                    ? 'bg-[var(--md-sys-color-success-container)] text-[var(--md-sys-color-on-success-container)] border border-[var(--md-sys-color-success)]/40'
                    : 'hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                }`}
                title={copiedVideoUrl ? 'Copied video link!' : 'Copy original video URL'}
                aria-label="Copy video URL"
              >
                {copiedVideoUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
              <a
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors yt-win-open-btn"
                title="Open video in new tab"
                aria-label="Open video in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={onToggleHeaderOverflow}
                className={`p-1.5 rounded-full transition-colors yt-win-overflow-btn cursor-pointer ${
                  headerOverflowOpen
                    ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                    : 'hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                }`}
                title="More actions"
                aria-label="More window actions"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {headerOverflowOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-9 w-56 bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl shadow-xl p-1.5 z-50 text-xs text-[var(--md-sys-color-on-surface)] yt-win-overflow-menu space-y-1"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onCloseHeaderOverflow();
                      onExportTxt();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-[var(--md-sys-color-surface-container-highest)] flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
                    <span>Export as Text (.txt)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCloseHeaderOverflow();
                      onExportJson();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-[var(--md-sys-color-surface-container-highest)] flex items-center gap-2 cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5 text-[var(--md-sys-color-tertiary)]" />
                    <span>Export as JSON (.json)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCloseHeaderOverflow();
                      onExportMarkdown();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-[var(--md-sys-color-surface-container-highest)] flex items-center gap-2 cursor-pointer yt-overflow-export-md-btn"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--md-sys-color-warning)]" />
                    <span>Export Markdown (.md)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCloseHeaderOverflow();
                      onOpenHistory();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-[var(--md-sys-color-surface-container-highest)] flex items-center gap-2 cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-variant)]" />
                    <span>History</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCloseHeaderOverflow();
                      onOpenSettings();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-[var(--md-sys-color-surface-container-highest)] flex items-center gap-2 cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-variant)]" />
                    <span>Settings &amp; Formatting</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCloseHeaderOverflow();
                      onCopyVideoUrl();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-[var(--md-sys-color-surface-container-highest)] flex items-center gap-2 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-variant)]" />
                    <span>Copy video URL</span>
                  </button>
                  <a
                    href={`https://www.youtube.com/watch?v=${videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onCloseHeaderOverflow}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-[var(--md-sys-color-surface-container-highest)] flex items-center gap-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-variant)]" />
                    <span>Open video in new tab</span>
                  </a>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onMinimize}
            className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer"
            title="Minimize to dock"
            aria-label="Minimize window"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer"
            title="Close"
            aria-label="Close window"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {readabilityMode ? (
        <ReadabilityModal
          video={video}
          mode={winState.mode}
          persona={persona}
          theme={readabilityTheme}
          effectiveTheme={effectiveTheme}
          font={readabilityFont}
          fontSize={readabilitySize}
          syncYouTubeTheme={syncYouTubeTheme}
          simulatedYouTubeTheme={simulatedYouTubeTheme}
          activeSeek={activeSeek}
          showVisuals={showVisuals}
          showFactCheck={showFactCheck}
          showSources={showSources}
          onExit={onExitReadability}
          onToggleSyncYouTubeTheme={onToggleSyncYouTubeTheme}
          onSelectTheme={onSelectReadabilityTheme}
          onToggleFont={onToggleReadabilityFont}
          onChangeFontSize={onChangeReadabilitySize}
          onExportTxt={onExportTxt}
          onExportPdf={onExportPdf}
          onExportJson={onExportJson}
          onExportMarkdown={onExportMarkdown}
          onSeekTimestamp={onSeekTimestamp}
        />
      ) : (
        <>
          {/* Toolbar */}
          <div
            className={`${
              adaptive.isCompact ? 'px-3 py-2 gap-1.5' : adaptive.isShort ? 'px-4 py-2 gap-2' : 'px-6 py-3 gap-2.5'
            } ${adaptive.isShort ? 'max-h-[45%] overflow-y-auto overflow-x-hidden' : ''} border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] flex items-center flex-wrap text-xs min-w-0 max-w-full flex-shrink-0 yt-win-toolbar`}
          >
            <div className="flex rounded-full bg-[var(--md-sys-color-surface-container-high)] p-0.5 border border-[var(--md-sys-color-outline-variant)]">
              <button
                type="button"
                onClick={() => onChangeWinMode('summary')}
                className={`px-3 py-1 rounded-full font-medium cursor-pointer transition-colors ${
                  winState.mode === 'summary'
                    ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] font-semibold shadow-xs'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                }`}
              >
                Summarize
              </button>
              <button
                type="button"
                onClick={() => onChangeWinMode('transcript')}
                className={`px-3 py-1 rounded-full font-medium cursor-pointer transition-colors ${
                  winState.mode === 'transcript'
                    ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] font-semibold shadow-xs'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                }`}
              >
                Transcribe
              </button>
              <button
                type="button"
                onClick={() => onChangeWinMode('podcast')}
                className={`px-3 py-1 rounded-full font-medium cursor-pointer transition-colors yt-podcast-mode-btn ${
                  winState.mode === 'podcast'
                    ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] font-semibold shadow-xs active'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                }`}
              >
                Podcast
              </button>
            </div>

            <div className="flex rounded-full bg-[var(--md-sys-color-surface-container-high)] p-0.5 border border-[var(--md-sys-color-outline-variant)]">
              <button
                type="button"
                onClick={() => onChangeWinSource('video')}
                className={`px-3 py-1 rounded-full font-medium cursor-pointer transition-colors ${
                  winState.source === 'video'
                    ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] font-semibold shadow-xs'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                }`}
              >
                Video
              </button>
              <button
                type="button"
                onClick={() => onChangeWinSource('text')}
                className={`px-2.5 py-1 rounded-full font-medium cursor-pointer transition-colors ${
                  winState.source === 'text'
                    ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] font-semibold shadow-xs'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                }`}
              >
                Transcript
              </button>
            </div>

            <select
              aria-label="Gemini Model Selector"
              className="m3-select bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-3 py-1 text-xs focus:outline-none cursor-pointer max-w-full min-w-0"
              value={selectedModel}
              onChange={(e) => onSelectModel(e.target.value)}
            >
              <option
                value="Ask"
                className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
              >
                YouTube Ask (Gemini in the page) — Free, no API limit
              </option>
              <optgroup
                label="Recommended models"
                className="bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-primary)] font-semibold"
              >
                <option
                  value="gemini-3.8-flash"
                  className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                >
                  gemini-3.8-flash (Recommended)
                </option>
                <option
                  value="gemini-3.7-flash"
                  className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                >
                  gemini-3.7-flash
                </option>
                <option
                  value="gemini-3.5-flash"
                  className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                >
                  gemini-3.5-flash
                </option>
                <option
                  value="gemini-3.1-pro-preview"
                  className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                >
                  gemini-3.1-pro-preview
                </option>
              </optgroup>
            </select>

            {/* FEAT-03 Persona Preset Selector */}
            <select
              aria-label="Summary Persona"
              className="m3-select bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-3 py-1 text-xs focus:outline-none cursor-pointer max-w-full min-w-0 yt-persona-select"
              value={persona}
              onChange={(e) => onSelectPersona(normalizeSummaryPersona(e.target.value))}
              title={`Summary Persona: ${personaPreset.description}`}
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

            {adaptive.collapseOptionsRow && (
              <button
                type="button"
                onClick={onToggleCompactOptions}
                className="px-3 py-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-xs font-medium yt-compact-options-btn cursor-pointer"
              >
                {showOptionsRow ? 'Options ▴' : 'Options ▾'}
              </button>
            )}

            {selectedModel === 'Ask' && showOptionsRow && (
              <label
                className="flex items-center gap-1.5 text-[11px] text-[var(--md-sys-color-on-warning-container)] bg-[var(--md-sys-color-warning-container)] border border-[var(--md-sys-color-warning)]/40 px-2.5 py-1 rounded-full cursor-pointer"
                title="Simulate YouTube Ask failing so Regenerate automatically falls back to the next model on the ladder"
              >
                <input
                  type="checkbox"
                  checked={simAskFailure}
                  onChange={(e) => onToggleSimAskFailure(e.target.checked)}
                  className="accent-[var(--md-sys-color-warning)] cursor-pointer"
                />
                <span>Simulate Ask failure</span>
              </label>
            )}

            {showOptionsRow && (
              <>
                <select
                  aria-label="API Key Selector"
                  className="m3-select bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-2.5 py-1 text-xs focus:outline-none cursor-pointer max-w-[160px]"
                  defaultValue="key1"
                >
                  <option
                    value="key1"
                    className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                  >
                    Primary Key (&hellip;9a2f)
                  </option>
                  <option
                    value="key2"
                    className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                  >
                    Backup Pro (&hellip;4b1c)
                  </option>
                  <option
                    value="manage"
                    className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                  >
                    Add / manage keys&hellip;
                  </option>
                </select>

                <div
                  className="flex items-center gap-1.5 bg-[var(--md-sys-color-surface-container-low)] px-2 py-0.5 rounded-full border border-[var(--md-sys-color-outline-variant)] yt-transcript-processing-panel"
                  title="Transcript Processing: Choose between Fast (Concise executive brief) and Deep (Detailed exhaustive breakdown)"
                >
                  {!adaptive.isCompact && (
                    <span className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] pl-1 yt-tp-label">
                      Processing:
                    </span>
                  )}
                  <div className="inline-flex rounded-full bg-[var(--md-sys-color-surface-container-high)] p-0.5 border border-[var(--md-sys-color-outline-variant)]">
                    <button
                      type="button"
                      onClick={() => onSetTranscriptMode('fast')}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all yt-tp-btn yt-tp-fast-btn cursor-pointer ${
                        transcriptMode === 'fast'
                          ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-bold shadow-xs active'
                          : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                      }`}
                      title="Fast (Concise): Rapid executive takeaways (< 2 min read)"
                    >
                      Fast
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetTranscriptMode('deep')}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all yt-tp-btn yt-tp-deep-btn cursor-pointer ${
                        transcriptMode === 'deep'
                          ? 'bg-[var(--md-sys-color-tertiary)] text-[var(--md-sys-color-on-primary)] font-bold shadow-xs active'
                          : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                      }`}
                      title="Deep (Detailed): Exhaustive chronological analysis"
                    >
                      Deep
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={winState.mode === 'podcast' ? onGeneratePodcast : onRegenerate}
                className="px-3.5 py-1.5 rounded-full bg-[var(--md-sys-color-primary)] hover:opacity-90 text-[var(--md-sys-color-on-primary)] font-semibold text-xs cursor-pointer transition-opacity"
              >
                {winState.mode === 'podcast'
                  ? podcastEpisode
                    ? 'Regenerate Podcast'
                    : 'Generate Podcast'
                  : 'Regenerate'}
              </button>
            </div>

            {winState.mode !== 'podcast' && (
              <div className="w-full min-w-0 max-w-full">
                <TtsControlBar
                  videoId={videoId}
                  mode={winState.mode}
                  contentText={contentText}
                  tts={tts}
                  currentVol={currentVol}
                  currentPitch={currentPitch}
                  skipSilence={skipSilence}
                  selectedVoice={selectedVoice}
                  browserVoices={browserVoices}
                  activeTtsTs={activeTtsTs}
                  adaptive={adaptive}
                  effectiveTheme={effectiveTheme}
                  onSelectVoice={onSelectVoice}
                  onToggleTts={() => onToggleTts(contentText)}
                  onRewindTts={() => onRewindTts(contentText)}
                  onSkipTts={() => onSkipTts(contentText)}
                  onStopTts={onStopTts}
                  onSetRate={onSetTtsRate}
                  onCycleRate={() => onCycleTtsRate(contentText)}
                  onSetVolume={onSetTtsVolume}
                  onSetPitch={onSetTtsPitch}
                  onToggleSkipSilence={() => onToggleSkipSilence(contentText)}
                />
              </div>
            )}
          </div>

          {/* FEAT-01 Active Seek Status Strip */}
          {activeSeek && (
            <div
              data-seek-banner={activeSeek.tsStr}
              className={`flex flex-wrap items-center justify-between gap-2 ${
                adaptive.isCompact ? 'px-3 py-1.5' : 'px-6 py-2'
              } bg-[var(--md-sys-color-primary-container)] border-b border-[var(--md-sys-color-primary)]/40 text-[var(--md-sys-color-on-primary-container)] text-xs yt-seek-banner flex-shrink-0`}
            >
              <div className="flex items-center gap-2 font-mono tabular-nums">
                <Play className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)] fill-current flex-shrink-0" />
                <span>
                  Player seeked to <strong>{activeSeek.tsStr}</strong> ({activeSeek.seconds}s) · Cue #{activeSeek.cueIndex + 1}
                </span>
              </div>
              {winState.mode !== 'transcript' && (
                <button
                  type="button"
                  onClick={() => onChangeWinMode('transcript')}
                  className="text-[var(--md-sys-color-primary)] hover:underline font-sans font-semibold cursor-pointer"
                >
                  View cue in Transcript
                </button>
              )}
            </div>
          )}

          {/* Scrollable Content Body */}
          <div
            className={`${
              adaptive.isCompact ? 'p-3.5' : 'p-6'
            } flex-1 min-h-0 overflow-y-auto space-y-4 text-sm leading-relaxed text-[var(--md-sys-color-on-surface)] yt-win-body`}
          >
            {fallbackNote && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-[var(--md-sys-color-warning-container)] border border-[var(--md-sys-color-warning)]/40 text-[var(--md-sys-color-on-warning-container)] text-xs yt-note-line">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{fallbackNote}</span>
              </div>
            )}

            {winState.mode !== 'podcast' && (
              <>
                {/* Quick Window Action Bar */}
                <div className="flex items-center gap-2 p-2.5 bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl text-xs flex-wrap yt-summary-page-bar">
                  <a
                    href={`https://www.youtube.com/watch?v=${videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--md-sys-color-primary-container)] hover:opacity-90 text-[var(--md-sys-color-on-primary-container)] border border-[var(--md-sys-color-primary)]/30 transition-opacity font-medium yt-open-video-pill"
                    title="Open this YouTube video in a new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open video in new tab</span>
                  </a>
                  <button
                    type="button"
                    onClick={onToggleReadabilityMode}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--md-sys-color-secondary-container)] hover:opacity-90 text-[var(--md-sys-color-on-secondary-container)] border border-[var(--md-sys-color-outline-variant)] transition-opacity font-medium yt-readability-pill cursor-pointer"
                    title="Clean typography readability view"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Readability view</span>
                  </button>
                  <button
                    type="button"
                    onClick={onToggleExportMenu}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] transition-colors font-medium yt-export-pill cursor-pointer"
                    title="Export formatted summary or transcript"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export</span>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenHistory}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--md-sys-color-tertiary-container)] hover:opacity-90 text-[var(--md-sys-color-on-tertiary-container)] border border-[var(--md-sys-color-tertiary)]/30 transition-opacity font-medium yt-history-pill tabular-nums cursor-pointer"
                    title="Browse previous summaries that were closed"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Previous summaries ({closedSummariesCount})</span>
                  </button>
                </div>

                {/* Settings & Live System Prompt Inspector */}
                <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl p-4 border border-[var(--md-sys-color-outline-variant)] space-y-3 yt-transcript-processing-panel-settings">
                  <div className="flex items-center justify-between flex-wrap gap-2.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                      <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                        Transcript Processing &amp; Persona
                      </span>
                      <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                        {transcriptMode === 'fast' ? 'Fast (Concise)' : 'Deep (Detailed)'} &middot; {personaPreset.label}
                      </span>
                    </div>

                    <div className="inline-flex rounded-full bg-[var(--md-sys-color-surface-container-high)] p-1 border border-[var(--md-sys-color-outline-variant)]">
                      <button
                        type="button"
                        onClick={() => onSetTranscriptMode('fast')}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all yt-tp-fast-btn cursor-pointer ${
                          transcriptMode === 'fast'
                            ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-bold shadow-xs active'
                            : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                        }`}
                      >
                        Fast (Concise)
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetTranscriptMode('deep')}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all yt-tp-deep-btn cursor-pointer ${
                          transcriptMode === 'deep'
                            ? 'bg-[var(--md-sys-color-tertiary)] text-[var(--md-sys-color-on-primary)] font-bold shadow-xs active'
                            : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                        }`}
                      >
                        Deep (Detailed)
                      </button>
                    </div>
                  </div>

                  <div className="bg-[var(--md-sys-color-surface-container-low)] rounded-xl p-3 border border-[var(--md-sys-color-outline-variant)] text-[11px] font-mono text-[var(--md-sys-color-on-surface)] space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] uppercase font-bold text-[var(--md-sys-color-on-surface-variant)] tracking-wider">
                      <span className="flex items-center gap-1.5 text-[var(--md-sys-color-primary)] whitespace-nowrap">
                        <Terminal className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>System Prompt Passed to Gemini</span>
                      </span>
                      <span className="text-[var(--md-sys-color-on-surface-variant)] font-normal font-sans lowercase truncate max-w-full">
                        systemInstruction.parts[0]
                      </span>
                    </div>
                    <p className="text-[var(--md-sys-color-on-surface)] leading-relaxed font-sans text-xs italic bg-[var(--md-sys-color-surface-container)] p-2.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] yt-system-prompt-preview whitespace-pre-line">
                      &ldquo;{effectiveSystemInstruction}&rdquo;
                    </p>
                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] font-sans">
                      Active persona directive: {personaPreset.description}
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--md-sys-color-outline-variant)] cursor-pointer text-xs text-[var(--md-sys-color-on-surface)]">
                    <span className="font-medium">
                      Auto-replace clickbait feed titles with AI titles (yields to DeArrow)
                    </span>
                    <input
                      type="checkbox"
                      checked={altTitlesEnabled}
                      onChange={(e) => onSetAltTitlesEnabled(e.target.checked)}
                      aria-label="Window Alternative AI Titles Setting"
                      className="rounded accent-[var(--md-sys-color-primary)] focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer yt-window-alt-titles-setting"
                    />
                  </label>
                </div>

                {chapters.length >= 2 && (
                  <div className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-3 space-y-2 yt-chapter-bar">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[var(--md-sys-color-on-surface)]">
                        Chapters ({chapters.length})
                      </span>
                      {chunkPlan.isLongVideoChunked && (
                        <span className="text-[11px] text-[var(--md-sys-color-primary)] font-medium tabular-nums yt-chapter-meta">
                          Chapter-Aware Chunked (&gt;45m) &middot; {chunkPlan.chunks.length} segments
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 yt-chapter-list">
                      {chapters.map((ch) => {
                        const isActive =
                          activeSeek != null &&
                          activeSeek.seconds >= ch.startSec &&
                          (ch.endSec == null || activeSeek.seconds < ch.endSec);
                        return (
                          <button
                            key={ch.index}
                            type="button"
                            data-chapter-sec={ch.startSec}
                            data-chapter-ts={ch.tsStr}
                            onClick={() => onSeekTimestamp(ch.tsStr, ch.startSec)}
                            className={`yt-chapter-btn inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors cursor-pointer whitespace-nowrap max-w-full ${
                              isActive
                                ? 'active bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-[var(--md-sys-color-primary)]/60 font-semibold'
                                : 'bg-[var(--md-sys-color-surface-container-low)] hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border-[var(--md-sys-color-outline-variant)]'
                            }`}
                            title={`Jump to ${ch.tsStr} ${ch.title}`}
                          >
                            <span className="yt-chapter-ts font-mono tabular-nums text-[var(--md-sys-color-primary)] flex-shrink-0">
                              {ch.tsStr}
                            </span>
                            <span className="yt-chapter-title truncate max-w-[200px]">{ch.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {winState.mode === 'podcast' ? (
              <PodcastStudioPanel
                videoId={videoId}
                videoTitle={video.title}
                adaptive={adaptive}
                hostCount={podcastHostCount}
                hosts={podcastHosts}
                episode={podcastEpisode}
                isGenerating={podcastGenerating}
                isInteracting={podcastInteracting}
                isListeningVoice={podcastListeningVoice}
                playbackStatus={podcastPlaybackStatus}
                activeTurnIdx={podcastActiveTurnIdx}
                playbackRate={podcastRate}
                qaDraft={podcastQaDraft}
                onChangeHostCount={onChangePodcastHostCount}
                onUpdateHost={onUpdatePodcastHost}
                onGenerateEpisode={onGeneratePodcast}
                onTogglePlayback={onTogglePodcastPlayback}
                onStepTurn={onStepPodcastTurn}
                onStopPlayback={onStopPodcastPlayback}
                onChangeRate={onChangePodcastRate}
                onPlayFromTurn={onPlayPodcastFromTurn}
                onChangeQaDraft={onChangePodcastQaDraft}
                onSubmitInteraction={onSubmitPodcastInteraction}
                onToggleVoiceQuestion={onTogglePodcastVoiceQuestion}
                onSeekTimestamp={onSeekTimestamp}
              />
            ) : winState.mode === 'summary' ? (
              <div className="space-y-4 max-w-none">
                <div className="bg-[var(--md-sys-color-surface-container)] p-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[var(--md-sys-color-primary)] tracking-wide uppercase">
                      {personaPreset.label} &middot; {transcriptMode === 'fast' ? 'Fast Brief' : 'Deep Breakdown'}
                    </span>
                    <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] font-mono tabular-nums">
                      {transcriptMode === 'fast' ? '~1.5 min read' : '~5.0 min read'}
                    </span>
                  </div>
                  <div
                    className={`text-[var(--md-sys-color-on-surface)] space-y-3 yt-summary-text-body ${
                      genFormatting.richFormatting ? '' : 'yt-gen-plain-text'
                    }`}
                    style={{
                      fontFamily: 'var(--yt-gen-font, var(--font-sans))',
                      fontSize: 'var(--yt-gen-font-size, 14px)',
                      lineHeight: 'var(--yt-gen-line-height, 1.6)'
                    }}
                  >
                    {(() => {
                      const preparedSummary = showVisuals
                        ? ensureFallbackVisualMarkers(video.summary, 3)
                        : video.summary.replace(/\[\[(?:FRAME|IMG|IMAGE|GEN)\s+[^\]]+\]\]/gi, '');
                      const segments = tokenizeSummaryTextWithVisuals(renderFormattedText(preparedSummary));
                      return segments.map((seg, idx) => {
                        if (seg.kind === 'markdown') {
                          return (
                            <div key={idx} className="whitespace-pre-line">
                              <TimestampText
                                text={seg.text}
                                onSeek={onSeekTimestamp}
                                activeSeekSec={activeSeek?.seconds ?? null}
                              />
                            </div>
                          );
                        }
                        if (seg.kind === 'frame') {
                          return (
                            <div
                              key={idx}
                              className="yt-visual-card yt-frame-card rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] overflow-hidden max-w-md shadow-xs"
                            >
                              <button
                                type="button"
                                onClick={() => onSeekTimestamp(`[${seg.tsStr}]`, seg.seconds)}
                                title={`Play at ${seg.tsStr}`}
                                className="yt-frame-preview relative w-full aspect-video block bg-slate-950 overflow-hidden cursor-pointer group"
                              >
                                <img
                                  src={getLocalFramePreviewDataUri(seg.tsStr, seg.caption)}
                                  alt={seg.caption}
                                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                />
                                <span className="yt-frame-badge absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/80 text-white text-[11px] font-mono font-semibold">
                                  <Play className="w-3 h-3 fill-current" />
                                  {seg.tsStr}
                                </span>
                              </button>
                              <div className="yt-visual-caption px-3 py-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                {seg.caption}
                              </div>
                            </div>
                          );
                        }
                        if (seg.kind === 'img') {
                          const searchUrl = `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(seg.terms)}&title=Special:MediaSearch&type=image`;
                          return (
                            <div
                              key={idx}
                              className="yt-visual-card yt-commons-card rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] overflow-hidden max-w-md shadow-xs"
                            >
                              <img
                                src={getLocalDiagramDataUri(seg.terms)}
                                alt={seg.caption}
                                className="yt-commons-img w-full block"
                              />
                              <div className="yt-visual-caption px-3 py-2 text-xs text-[var(--md-sys-color-on-surface-variant)] flex items-center justify-between gap-2 flex-wrap">
                                <span>{seg.caption}</span>
                                <a
                                  href={searchUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[var(--md-sys-color-primary)] hover:underline font-medium"
                                >
                                  <span>Wikimedia Commons</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      });
                    })()}
                  </div>
                </div>

                {/* Fact-Check & Verification Panel */}
                {(showFactCheck || showSources) ? (
                  <div
                    data-testid="fact-check-box"
                    className={`yt-fact-box rounded-2xl p-4 space-y-3 border ${
                      activeFactCheck || isRunningFactCheck
                        ? 'bg-[var(--md-sys-color-success-container)]/45 border-[var(--md-sys-color-success)]/35'
                        : 'bg-[var(--md-sys-color-surface-container)] border-[var(--md-sys-color-outline-variant)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="yt-fact-header flex items-center gap-2 text-[var(--md-sys-color-success)] font-semibold text-xs uppercase tracking-wide">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <span>Fact-check &amp; Verification</span>
                      </div>
                      <span className="yt-fact-model-badge text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-low)]/80 border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                        {activeFactCheck?.model || factModel || 'gemini-3.8-flash'} &middot; Google Search
                      </span>
                    </div>

                    {activeFactCheck?.fallbackFrom && (
                      <div
                        role="status"
                        className="yt-fact-fallback-note px-3 py-1.5 rounded-xl bg-[var(--md-sys-color-warning-container)] text-[var(--md-sys-color-on-warning-container)] border border-[var(--md-sys-color-warning)]/35 text-[11px] font-medium"
                      >
                        Fact-Check model &ldquo;{activeFactCheck.fallbackFrom}&rdquo; unavailable — stepped down to {activeFactCheck.model}.
                      </div>
                    )}

                    {isRunningFactCheck ? (
                      <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-2 py-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--md-sys-color-success)]" />
                        <span>Verifying claims and gathering grounding sources&hellip;</span>
                      </div>
                    ) : activeFactCheck ? (
                      <>
                        <p className="text-xs text-[var(--md-sys-color-on-surface)] leading-relaxed">
                          {activeFactCheck.summary}
                        </p>

                        {showFactCheck && activeFactCheck.claims.length > 0 && (
                          <div className="space-y-2">
                            {activeFactCheck.claims.map((c, idx) => (
                              <div
                                key={idx}
                                className="rounded-xl bg-[var(--md-sys-color-surface-container-low)]/85 border border-[var(--md-sys-color-outline-variant)] p-2.5 text-xs space-y-1"
                              >
                                <div className="flex items-start gap-2 flex-wrap">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                      c.verdict === 'supported'
                                        ? 'bg-[var(--md-sys-color-success-container)] text-[var(--md-sys-color-on-success-container)] border border-[var(--md-sys-color-success)]/35'
                                        : c.verdict === 'partly_true'
                                        ? 'bg-[var(--md-sys-color-warning-container)] text-[var(--md-sys-color-on-warning-container)] border border-[var(--md-sys-color-warning)]/35'
                                        : 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] border border-[var(--md-sys-color-error)]/35'
                                    }`}
                                  >
                                    {c.verdict === 'supported'
                                      ? '✅ Supported'
                                      : c.verdict === 'partly_true'
                                      ? '⚠️ Partly true'
                                      : '❌ Contradicted'}
                                  </span>
                                  <TimestampText
                                    text={c.timestamp}
                                    onSeek={onSeekTimestamp}
                                    activeSeekSec={activeSeek?.seconds ?? null}
                                    compact
                                  />
                                  <span className="font-medium text-[var(--md-sys-color-on-surface)] flex-1 min-w-[200px]">
                                    {c.claim}
                                  </span>
                                </div>
                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] pl-1">
                                  {c.evidence}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        {showSources && activeFactCheck.sources.length > 0 && (
                          <div className="yt-sources-consulted pt-2 border-t border-[var(--md-sys-color-outline-variant)] space-y-1">
                            <div className="yt-sources-title text-[11px] font-semibold text-[var(--md-sys-color-on-surface)]">
                              Sources consulted (Google Search):
                            </div>
                            {activeFactCheck.sources.map((src, sIdx) => (
                              <div key={sIdx} className="yt-source-item text-[11px] truncate">
                                <a
                                  href={src.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[var(--md-sys-color-primary)] hover:underline"
                                >
                                  <span>{src.title}</span>
                                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="yt-fact-deferred flex items-center justify-between gap-3 flex-wrap text-xs">
                        <span className="text-[var(--md-sys-color-on-surface-variant)]">
                          Automatic Fact-Check after summary is off in Settings. Click Run Fact-Check to verify claims on demand.
                        </span>
                      </div>
                    )}

                    <div className="yt-fact-recheck-bar flex items-center justify-between gap-2 flex-wrap">
                      {onToggleSimFactCheckUnavailable ? (
                        <label className="flex items-center gap-1.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)] cursor-pointer select-none">
                          <input
                            type="checkbox"
                            data-testid="sim-factcheck-unavailable"
                            checked={simFactCheckUnavailable}
                            onChange={(e) => onToggleSimFactCheckUnavailable(e.target.checked)}
                            className="rounded accent-[var(--md-sys-color-primary)]"
                          />
                          <span>Simulate fact-check model unavailable</span>
                        </label>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={onRerunFactCheck}
                        disabled={isRunningFactCheck}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] border border-[var(--md-sys-color-outline-variant)] text-xs font-medium text-[var(--md-sys-color-on-surface)] disabled:opacity-50 cursor-pointer yt-fact-retry-btn"
                      >
                        <RefreshCw className={`w-3 h-3 ${isRunningFactCheck ? 'animate-spin' : ''}`} />
                        <span>{activeFactCheck ? 'Re-run Fact Check' : 'Run Fact-Check'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    data-testid="fact-check-box"
                    className="yt-fact-box yt-fact-off bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-3.5 flex items-center justify-between gap-3 flex-wrap text-xs"
                  >
                    <span className="text-[var(--md-sys-color-on-surface-variant)]">
                      Fact-check &amp; source verification is turned off in Settings.
                    </span>
                    {onToggleSummaryOpt && (
                      <button
                        type="button"
                        onClick={() => {
                          onToggleSummaryOpt({ fc: true, src: true });
                          onRerunFactCheck?.();
                        }}
                        className="px-3 py-1 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border border-[var(--md-sys-color-primary)]/40 font-semibold cursor-pointer"
                      >
                        Enable &amp; Run Fact-Check
                      </button>
                    )}
                  </div>
                )}

                <ResponseRatingBar
                  videoId={videoId}
                  targetType="summary"
                  targetId="main"
                  label="Rate this summary"
                  compact={adaptive.isCompact}
                  responseRatings={responseRatings}
                  openRatingNoteKey={openRatingNoteKey}
                  setOpenRatingNoteKey={setOpenRatingNoteKey}
                  onRateResponse={onRateResponse}
                  onShowToast={onShowToast}
                />
              </div>
            ) : (
              /* Transcript View with Search, Follow-Along Lock & Clickable Cues */
              <div className="space-y-3">
                {(() => {
                  const query = transcriptSearchQuery.trim();
                  const lines = formatMathSymbolsInText(video.transcript).split('\n');
                  const matches: { lineIdx: number; start: number; end: number }[] = [];
                  if (query) {
                    const qLower = query.toLowerCase();
                    lines.forEach((line, lineIdx) => {
                      const lineLower = line.toLowerCase();
                      let pos = lineLower.indexOf(qLower);
                      while (pos !== -1) {
                        matches.push({ lineIdx, start: pos, end: pos + qLower.length });
                        pos = lineLower.indexOf(qLower, pos + 1);
                      }
                    });
                  }

                  const totalMatches = matches.length;
                  const curActive = totalMatches > 0 ? activeMatchIndex % totalMatches : -1;

                  const jumpMatch = (delta: number) => {
                    if (totalMatches === 0) return;
                    onSetActiveMatchIndex((curActive + delta + totalMatches) % totalMatches);
                  };

                  const displayedLines =
                    transcriptFilterOnly && query
                      ? lines
                          .map((l, i) => ({ text: l, idx: i }))
                          .filter((item) => item.text.toLowerCase().includes(query.toLowerCase()))
                      : lines.map((l, i) => ({ text: l, idx: i }));

                  return (
                    <>
                      <div className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-2.5 flex flex-wrap items-center gap-2 text-xs">
                        <div className="relative flex-1 min-w-[160px] flex items-center">
                          <Search className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-variant)] absolute left-3" />
                          <input
                            type="text"
                            value={transcriptSearchQuery}
                            onChange={(e) => {
                              onChangeTranscriptSearch(e.target.value);
                              onSetActiveMatchIndex(0);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                jumpMatch(e.shiftKey ? -1 : 1);
                              }
                            }}
                            placeholder="Search transcript (press Enter for next)..."
                            className="w-full bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-full pl-8 pr-7 py-1 text-xs text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                          />
                          {query && (
                            <button
                              type="button"
                              onClick={() => {
                                onChangeTranscriptSearch('');
                                onSetActiveMatchIndex(0);
                              }}
                              className="absolute right-2.5 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] cursor-pointer"
                              title="Clear search"
                              aria-label="Clear transcript search"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-[var(--md-sys-color-on-surface-variant)] font-mono tabular-nums text-[11px] px-1">
                          {query ? (
                            totalMatches > 0 ? (
                              <span className="text-[var(--md-sys-color-on-surface)] font-medium">
                                {curActive + 1} of {totalMatches}
                              </span>
                            ) : (
                              <span>0 matches</span>
                            )
                          ) : (
                            <span>Search keywords</span>
                          )}
                        </div>

                        <div className="flex items-center gap-0.5 border-l border-[var(--md-sys-color-outline-variant)] pl-2">
                          <button
                            type="button"
                            onClick={() => jumpMatch(-1)}
                            disabled={totalMatches === 0}
                            className="p-1 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] disabled:opacity-30 cursor-pointer"
                            title="Previous match (Shift+Enter)"
                            aria-label="Previous match"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => jumpMatch(1)}
                            disabled={totalMatches === 0}
                            className="p-1 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] disabled:opacity-30 cursor-pointer"
                            title="Next match (Enter)"
                            aria-label="Next match"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <label className="flex items-center gap-1.5 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] cursor-pointer border-l border-[var(--md-sys-color-outline-variant)] pl-2 select-none">
                          <input
                            type="checkbox"
                            checked={transcriptFilterOnly}
                            onChange={(e) => onChangeTranscriptFilterOnly(e.target.checked)}
                            className="rounded accent-[var(--md-sys-color-primary)] focus:ring-0"
                          />
                          <span className="text-[11px]">Filter lines</span>
                        </label>

                        {/* FEAT-01 Follow-Along Auto-Scroll Lock */}
                        <button
                          type="button"
                          onClick={onToggleFollowAlong}
                          aria-pressed={followAlong}
                          title={
                            followAlong
                              ? 'Follow-Along Lock ON: Auto-scrolls transcript to active TTS/seek cue'
                              : 'Follow-Along Lock OFF: Manual scroll preserved without auto-jumping'
                          }
                          className={`yt-follow-along-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors cursor-pointer ${
                            followAlong
                              ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-[var(--md-sys-color-primary)]/40 active'
                              : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                          }`}
                        >
                          {followAlong ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                          <span>{followAlong ? 'Follow-Along: ON' : 'Follow-Along: OFF'}</span>
                        </button>
                      </div>

                      <div className="bg-[var(--md-sys-color-surface-container)] p-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)] font-mono text-xs space-y-2 text-[var(--md-sys-color-on-surface)] max-h-96 overflow-y-auto yt-transcript-lines-container">
                        {displayedLines.length === 0 ? (
                          <div className="text-[var(--md-sys-color-on-surface-variant)] italic py-4 text-center font-sans">
                            No transcript lines match &ldquo;{query}&rdquo;
                          </div>
                        ) : (
                          displayedLines.map(({ text: line, idx: originalIdx }) => {
                            const isTtsSpeaking =
                              (tts.status === 'playing' || tts.status === 'paused') &&
                              activeTtsLine === originalIdx;
                            const isSeekTarget = activeSeek !== null && activeSeek.cueIndex === originalIdx;
                            const isHighlighted = isTtsSpeaking || isSeekTarget;

                            const attachScrollRef = (el: HTMLDivElement | null) => {
                              if (el && isHighlighted && followAlong) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                              }
                            };

                            if (!query) {
                              return (
                                <div
                                  key={originalIdx}
                                  ref={isHighlighted ? attachScrollRef : undefined}
                                  data-line-idx={originalIdx}
                                  data-scroll-synced={isHighlighted ? (followAlong ? 'true' : 'paused') : 'false'}
                                  className={`yt-transcript-line flex items-start gap-2 py-1.5 px-2.5 rounded-xl transition-colors border ${
                                    isHighlighted
                                      ? 'yt-transcript-line-speaking bg-[var(--md-sys-color-primary-container)]/50 border-[var(--md-sys-color-primary)]/50 text-[var(--md-sys-color-on-surface)] font-semibold'
                                      : 'border-transparent hover:bg-[var(--md-sys-color-surface-container-high)]/60'
                                  }`}
                                >
                                  {isTtsSpeaking && (
                                    <span className="yt-speaking-indicator inline-flex items-center gap-1 text-[10px] font-mono text-[var(--md-sys-color-on-primary-container)] bg-[var(--md-sys-color-primary-container)] px-2 py-0.5 rounded-full border border-[var(--md-sys-color-primary)]/40 flex-shrink-0">
                                      <Volume2 className="w-3 h-3" />
                                      <span>Speaking</span>
                                    </span>
                                  )}
                                  <span className="flex-1">
                                    <TimestampText
                                      text={line}
                                      onSeek={onSeekTimestamp}
                                      activeSeekSec={activeSeek?.seconds ?? null}
                                      compact
                                    />
                                  </span>
                                </div>
                              );
                            }

                            const lineLower = line.toLowerCase();
                            const qLower = query.toLowerCase();
                            const parts: React.ReactNode[] = [];
                            let lastIdx = 0;
                            let matchOccurrence = 0;

                            while (lastIdx < line.length) {
                              const foundIdx = lineLower.indexOf(qLower, lastIdx);
                              if (foundIdx === -1) {
                                parts.push(line.slice(lastIdx));
                                break;
                              }
                              if (foundIdx > lastIdx) {
                                parts.push(line.slice(lastIdx, foundIdx));
                              }
                              const globalMatchIdx = matches.findIndex(
                                (m) => m.lineIdx === originalIdx && m.start === foundIdx
                              );
                              const isActive = globalMatchIdx === curActive;

                              parts.push(
                                <mark
                                  key={`${foundIdx}-${matchOccurrence++}`}
                                  className={`rounded px-1 py-0.5 transition-all ${
                                    isActive
                                      ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-bold ring-2 ring-[var(--md-sys-color-primary)]/40 shadow-xs'
                                      : 'bg-[var(--md-sys-color-warning-container)] text-[var(--md-sys-color-on-warning-container)] font-medium'
                                  }`}
                                >
                                  {line.slice(foundIdx, foundIdx + qLower.length)}
                                </mark>
                              );
                              lastIdx = foundIdx + qLower.length;
                            }

                            return (
                              <div
                                key={originalIdx}
                                ref={isHighlighted ? attachScrollRef : undefined}
                                data-line-idx={originalIdx}
                                data-scroll-synced={isHighlighted ? (followAlong ? 'true' : 'paused') : 'false'}
                                className={`yt-transcript-line flex items-start gap-2 py-1.5 px-2.5 rounded-xl transition-colors border ${
                                  isHighlighted
                                    ? 'yt-transcript-line-speaking bg-[var(--md-sys-color-primary-container)]/50 border-[var(--md-sys-color-primary)]/50 text-[var(--md-sys-color-on-surface)] font-semibold'
                                    : line.toLowerCase().includes(query.toLowerCase())
                                    ? 'border-transparent bg-[var(--md-sys-color-surface-container-high)]/60'
                                    : 'border-transparent hover:bg-[var(--md-sys-color-surface-container-high)]/50'
                                }`}
                              >
                                {isTtsSpeaking && (
                                  <span className="yt-speaking-indicator inline-flex items-center gap-1 text-[10px] font-mono text-[var(--md-sys-color-on-primary-container)] bg-[var(--md-sys-color-primary-container)] px-2 py-0.5 rounded-full border border-[var(--md-sys-color-primary)]/40 flex-shrink-0">
                                    <Volume2 className="w-3 h-3" />
                                    <span>Speaking</span>
                                  </span>
                                )}
                                <span className="flex-1">{parts}</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  );
                })()}

                <ResponseRatingBar
                  videoId={videoId}
                  targetType="transcript"
                  targetId="main"
                  label="Rate this transcript"
                  compact={adaptive.isCompact}
                  responseRatings={responseRatings}
                  openRatingNoteKey={openRatingNoteKey}
                  setOpenRatingNoteKey={setOpenRatingNoteKey}
                  onRateResponse={onRateResponse}
                  onShowToast={onShowToast}
                />
              </div>
            )}

            {/* Follow-up Discussion Thread */}
            {winState.mode !== 'podcast' && turns.length > 0 && (
              <div className="mt-6 pt-5 border-t border-[var(--md-sys-color-outline-variant)] space-y-4 yt-thread-wrap">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                  <Bot className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
                  <span>Follow-up Discussion</span>
                </div>
                {turns.map((turn, tIdx) => {
                  const normTurn = normalizeFollowUpTurn(turn);
                  const activeVer = getActiveFollowUpVersion(normTurn);
                  const isEditingThis = editingTurnIdx === tIdx;
                  const isRegenThis = regeneratingTurnIdx === tIdx;
                  const totalVersions = normTurn.versions.length;

                  return (
                    <div key={tIdx} data-turn-idx={tIdx} className="space-y-2 yt-turn-block">
                      <div className="flex justify-end items-center gap-1.5">
                        {isEditingThis ? (
                          <div className="flex flex-col gap-2 w-full max-w-[92%] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-primary)]/50 rounded-2xl p-2.5 yt-turn-edit-box">
                            <input
                              type="text"
                              value={editingQuestionDraft}
                              aria-label="Edit submitted question"
                              onChange={(e) => setEditingQuestionDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const cleaned = editingQuestionDraft.trim();
                                  if (cleaned) {
                                    setEditingTurnIdx(null);
                                    onEditAndRegenerateTurn?.(tIdx, cleaned);
                                  }
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setEditingTurnIdx(null);
                                }
                              }}
                              className="w-full bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 py-1.5 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] yt-turn-edit-input"
                            />
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingTurnIdx(null)}
                                className="px-2.5 py-1 rounded-full border border-[var(--md-sys-color-outline-variant)] text-[11px] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] cursor-pointer yt-turn-edit-cancel-btn"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={!editingQuestionDraft.trim() || isRegenThis}
                                onClick={() => {
                                  const cleaned = editingQuestionDraft.trim();
                                  if (!cleaned) return;
                                  setEditingTurnIdx(null);
                                  onEditAndRegenerateTurn?.(tIdx, cleaned);
                                }}
                                className="px-3 py-1 rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] text-[11px] font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer yt-turn-edit-save-btn"
                              >
                                Save &amp; Regenerate
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTurnIdx(tIdx);
                                setEditingQuestionDraft(activeVer.question);
                              }}
                              disabled={isRegenThis || isAnsweringFollowUp}
                              aria-label="Edit submitted question"
                              title="Edit submitted question and regenerate answer"
                              className="p-1.5 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] disabled:opacity-40 cursor-pointer yt-turn-edit-btn"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <div className="bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] rounded-2xl rounded-tr-xs px-4 py-2 text-xs max-w-[85%] shadow-xs flex items-center gap-1.5 yt-user-bubble">
                              {turn.isVoice && <Mic className="w-3 h-3" />}
                              <span>{formatMathSymbolsInText(activeVer.question)}</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex justify-start">
                        <div className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl rounded-tl-xs p-3.5 text-xs text-[var(--md-sys-color-on-surface)] max-w-[92%] w-full space-y-2 shadow-xs yt-ans-bubble">
                          <div className="flex items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)] pb-1.5 text-[10px] text-[var(--md-sys-color-on-surface-variant)] flex-wrap">
                            <span className="font-mono text-[var(--md-sys-color-primary)] font-semibold yt-turn-model-pill">
                              {activeVer.model}
                              {activeVer.fallbackFrom ? ` (stepped down from ${activeVer.fallbackFrom})` : ''}
                            </span>
                            {turn.sources && turn.sources.length > 0 && (
                              <span className="inline-flex items-center gap-1 text-[var(--md-sys-color-success)]">
                                <Globe className="w-2.5 h-2.5" />
                                <span>Grounded</span>
                              </span>
                            )}
                          </div>
                          {isRegenThis ? (
                            <div className="text-xs text-[var(--md-sys-color-primary)] flex items-center gap-2 py-2">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Regenerating response with {composerModel}&hellip;</span>
                            </div>
                          ) : (
                            <div
                              className="whitespace-pre-line yt-ans-body"
                              style={{
                                fontFamily: 'var(--yt-gen-font, var(--font-sans))',
                                fontSize: 'var(--yt-gen-font-size, 14px)',
                                lineHeight: 'var(--yt-gen-line-height, 1.6)'
                              }}
                            >
                              <TimestampText
                                text={renderFormattedText(activeVer.answer)}
                                onSeek={onSeekTimestamp}
                                activeSeekSec={activeSeek?.seconds ?? null}
                                compact
                              />
                            </div>
                          )}
                          {turn.imageUri && (
                            <div className="mt-2 rounded-xl overflow-hidden border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
                              <img
                                src={turn.imageUri}
                                referrerPolicy="no-referrer"
                                alt="Generated Structural Diagram"
                                className="w-full h-36 object-cover"
                              />
                              <div className="p-1.5 bg-[var(--md-sys-color-surface-container-high)] text-[10px] text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1 font-mono">
                                <ImageIcon className="w-3 h-3 text-[var(--md-sys-color-tertiary)]" />
                                <span>gemini-nano-banana-2.1 &middot; Structural Diagram</span>
                              </div>
                            </div>
                          )}
                          {turn.sources && turn.sources.length > 0 && (
                            <div className="pt-1 border-t border-[var(--md-sys-color-outline-variant)] flex flex-wrap gap-1.5">
                              {turn.sources.map((s, sIdx) => (
                                <a
                                  key={sIdx}
                                  href={s.uri}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] text-[var(--md-sys-color-on-primary-container)] hover:underline bg-[var(--md-sys-color-primary-container)] px-2.5 py-0.5 rounded-full border border-[var(--md-sys-color-primary)]/25 truncate max-w-full inline-flex items-center gap-1"
                                >
                                  <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                                  <span className="truncate">{s.title}</span>
                                </a>
                              ))}
                            </div>
                          )}

                          {/* Bottom Actions: Response Rating + Regenerate + Gemini-style < 1 / N > Version Pager */}
                          <div className="pt-1.5 border-t border-[var(--md-sys-color-outline-variant)]/70 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <ResponseRatingBar
                                videoId={videoId}
                                targetType="followup"
                                targetId={`turn_${tIdx}`}
                                label="Rate answer"
                                compact
                                responseRatings={responseRatings}
                                openRatingNoteKey={openRatingNoteKey}
                                setOpenRatingNoteKey={setOpenRatingNoteKey}
                                onRateResponse={onRateResponse}
                                onShowToast={onShowToast}
                              />
                              <button
                                type="button"
                                onClick={() => onRegenerateTurn?.(tIdx)}
                                disabled={isRegenThis || isAnsweringFollowUp}
                                aria-label="Regenerate answer"
                                title={`Regenerate answer using ${composerModel}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] border border-[var(--md-sys-color-outline-variant)] text-[11px] font-medium text-[var(--md-sys-color-on-surface)] disabled:opacity-40 cursor-pointer yt-turn-regen-btn"
                              >
                                <RefreshCw className={`w-3 h-3 ${isRegenThis ? 'animate-spin' : ''}`} />
                                <span>Regenerate</span>
                              </button>
                            </div>

                            {totalVersions > 1 && (
                              <div
                                className="inline-flex items-center gap-1 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-1.5 py-0.5 text-[11px] yt-turn-ver-pager"
                                role="group"
                                aria-label="Answer version history"
                              >
                                <button
                                  type="button"
                                  onClick={() => onStepTurnVersion?.(tIdx, -1)}
                                  disabled={normTurn.activeVersionIndex <= 0}
                                  aria-label="Previous answer version"
                                  title="Previous generated answer"
                                  className="p-0.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] disabled:opacity-30 cursor-pointer yt-turn-ver-prev"
                                >
                                  <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <span className="px-1.5 font-mono tabular-nums font-semibold text-[var(--md-sys-color-on-surface)] yt-turn-ver-label">
                                  {normTurn.activeVersionIndex + 1} / {totalVersions}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onStepTurnVersion?.(tIdx, 1)}
                                  disabled={normTurn.activeVersionIndex >= totalVersions - 1}
                                  aria-label="Next answer version"
                                  title="Next generated answer"
                                  className="p-0.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] disabled:opacity-30 cursor-pointer yt-turn-ver-next"
                                >
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isAnsweringFollowUp && (
              <div className="mt-3 p-3 bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl text-xs text-[var(--md-sys-color-primary)] flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Gemini is generating verified response with Google Search grounding&hellip;</span>
              </div>
            )}
          </div>

          {/* Bottom Composer */}
          {winState.mode !== 'podcast' && (
            <div className="p-3 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] space-y-2 yt-composer-wrap">
              {followUpFallbackNote && (
                <div
                  role="status"
                  className="px-3 py-1.5 rounded-xl bg-[var(--md-sys-color-warning-container)] text-[var(--md-sys-color-on-warning-container)] border border-[var(--md-sys-color-warning)]/35 text-[11px] font-medium yt-followup-fallback-note"
                >
                  {followUpFallbackNote}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)] px-1">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-testid="sim-followup-unavailable"
                    checked={simFollowUpUnavailable}
                    onChange={(e) => onToggleSimFollowUpUnavailable(e.target.checked)}
                    className="rounded accent-[var(--md-sys-color-primary)]"
                  />
                  <span>Simulate follow-up model unavailable</span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {Boolean(composerText.trim()) && (
                    <span
                      className="yt-composer-draft-badge inline-flex items-center gap-1 text-[10px] text-[var(--md-sys-color-on-warning-container)] bg-[var(--md-sys-color-warning-container)] border border-[var(--md-sys-color-warning)]/30 px-2 py-0.5 rounded-full font-medium"
                      title="Unfinished question draft auto-saved to local storage"
                    >
                      <Clock className="w-2.5 h-2.5" />
                      <span>Draft auto-saved</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={onToggleComposerGSearch}
                    title="Toggle Google Search Grounding tool"
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] transition-colors cursor-pointer ${
                      composerGSearch
                        ? 'bg-[var(--md-sys-color-success-container)] text-[var(--md-sys-color-on-success-container)] border border-[var(--md-sys-color-success)]/40 font-medium'
                        : 'hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] border border-transparent'
                    }`}
                  >
                    <Globe className="w-2.5 h-2.5" />
                    <span>{adaptive.isCompact ? 'Search' : 'Google Search'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onToggleComposerGMaps}
                    title="Toggle Google Maps Grounding tool"
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] transition-colors cursor-pointer ${
                      composerGMaps
                        ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border border-[var(--md-sys-color-primary)]/40 font-medium'
                        : 'hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] border border-transparent'
                    }`}
                  >
                    <MapPin className="w-2.5 h-2.5" />
                    <span>{adaptive.isCompact ? 'Maps' : 'Google Maps'}</span>
                  </button>
                </div>
              </div>

              <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
                <input
                  type="text"
                  value={composerText}
                  onChange={(e) => onChangeComposerText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onSendFollowUp();
                    }
                  }}
                  placeholder="Ask follow-up, request diagram, or use mic (Enter to send)..."
                  className="flex-1 min-w-[160px] bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-4 py-2 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] placeholder:text-[var(--md-sys-color-on-surface-variant)] yt-composer-textarea"
                />
                <select
                  aria-label="Follow-up question model"
                  value={composerModel}
                  onChange={(e) => onSelectComposerModel(e.target.value)}
                  title="Select model for follow-up questions (steps down ladder automatically if unavailable)"
                  className="m3-select yt-composer-model-select bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-3 py-2 text-[11px] font-medium text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] max-w-[175px] shrink-0 cursor-pointer"
                >
                  <option value="gemini-4-argon">gemini-4-argon (Complex)</option>
                  <option value="gemini-3.8-flash">gemini-3.8-flash (Default)</option>
                  <option value="gemini-3.7-flash">gemini-3.7-flash</option>
                  <option value="gemini-3.6-flash">gemini-3.6-flash</option>
                  <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
                  <option value="YouTube Ask (Gemini in the page)">YouTube Ask</option>
                </select>
                <button
                  type="button"
                  onClick={onToggleVoiceInput}
                  title={
                    isRecordingVoice
                      ? 'Listening... click to stop'
                      : 'Voice input (gemini-3.5-transcribe / Web Speech)'
                  }
                  aria-label="Voice input"
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all yt-composer-mic-btn cursor-pointer ${
                    isRecordingVoice
                      ? 'bg-[var(--md-sys-color-error)] text-[var(--md-sys-color-on-primary)] ring-2 ring-[var(--md-sys-color-error)]/40 shadow-md yt-mic-recording'
                      : 'bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)]'
                  }`}
                >
                  {isRecordingVoice ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={onSendFollowUp}
                  disabled={isAnsweringFollowUp || !composerText.trim()}
                  className="px-4 py-2 bg-[var(--md-sys-color-primary)] hover:opacity-90 disabled:opacity-40 text-[var(--md-sys-color-on-primary)] font-semibold rounded-full text-xs transition-opacity flex items-center gap-1.5 flex-shrink-0 yt-composer-send-btn cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

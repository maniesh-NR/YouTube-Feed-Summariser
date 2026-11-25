import React from 'react';
import {
  X,
  RefreshCw,
  Download,
  Printer,
  FileCode,
  CheckCircle2,
  Play,
  ExternalLink
} from 'lucide-react';
import {
  getLocalDiagramDataUri,
  getLocalFramePreviewDataUri,
  parseEditorialBlocksWithVisuals,
  parseTimestampStringToSeconds,
  type ActiveSeekState,
  type MockVideo
} from './SimulatorTypes';
import { TimestampText } from './TimestampText';
import {
  SUMMARY_PERSONA_PRESETS,
  ensureFallbackVisualMarkers,
  type EffectiveTheme,
  type SummaryPersona
} from '../utils/userscript-helpers';

interface ReadabilityModalProps {
  video: MockVideo;
  mode: 'summary' | 'transcript' | 'podcast';
  persona: SummaryPersona;
  theme: 'system' | 'light' | 'sepia' | 'dark';
  effectiveTheme?: EffectiveTheme;
  font: 'serif' | 'sans';
  fontSize: number;
  syncYouTubeTheme: boolean;
  simulatedYouTubeTheme: 'dark' | 'light';
  activeSeek?: ActiveSeekState | null;
  showVisuals?: boolean;
  showFactCheck?: boolean;
  showSources?: boolean;
  onExit: () => void;
  onToggleSyncYouTubeTheme: () => void;
  onSelectTheme: (theme: 'system' | 'light' | 'sepia' | 'dark') => void;
  onToggleFont: () => void;
  onChangeFontSize: (delta: number) => void;
  onExportTxt: () => void;
  onExportPdf: () => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onSeekTimestamp: (tsStr: string, seconds: number) => void;
}

export const ReadabilityModal: React.FC<ReadabilityModalProps> = ({
  video,
  mode,
  persona,
  theme,
  effectiveTheme = 'dark',
  font,
  fontSize,
  syncYouTubeTheme,
  simulatedYouTubeTheme,
  activeSeek,
  showVisuals = true,
  showFactCheck = true,
  showSources = true,
  onExit,
  onToggleSyncYouTubeTheme,
  onSelectTheme,
  onToggleFont,
  onChangeFontSize,
  onExportTxt,
  onExportPdf,
  onExportJson,
  onExportMarkdown,
  onSeekTimestamp
}) => {
  const visualTheme: 'light' | 'sepia' | 'dark' =
    theme === 'system' ? (effectiveTheme === 'light' ? 'light' : 'dark') : theme;

  const themeContainerBg =
    visualTheme === 'light'
      ? 'bg-[#fdfbf7] text-[#191c20]'
      : visualTheme === 'sepia'
      ? 'bg-[#f4ecd8] text-[#433422]'
      : 'bg-[#111318] text-[#e2e2e9]';
  const themeBarBg =
    visualTheme === 'light'
      ? 'bg-[#f3f3fa]/95 border-[#c3c6cf] text-[#191c20]'
      : visualTheme === 'sepia'
      ? 'bg-[#eae0c8]/95 border-[#d8c8a6] text-[#433422]'
      : 'bg-[#191c22]/95 border-[#43474e] text-[#e2e2e9]';
  const themeControlCls =
    visualTheme === 'light'
      ? 'bg-[#e7e8ee] text-[#191c20] border-[#c3c6cf] hover:bg-[#e1e2e9]'
      : visualTheme === 'sepia'
      ? 'bg-[#e2d4b7] text-[#433422] border-[#c8b691] hover:bg-[#d8c7a3]'
      : 'bg-[#282a31] text-[#e2e2e9] border-[#43474e] hover:bg-[#33353c]';
  const themeIdleTabCls =
    visualTheme === 'light'
      ? 'text-[#43474e] hover:text-[#191c20] hover:bg-[#e1e2e9]'
      : visualTheme === 'sepia'
      ? 'text-[#5b462f] hover:text-[#2c1d0c] hover:bg-[#d8c7a3]'
      : 'text-[#c3c6cf] hover:text-[#e2e2e9] hover:bg-[#33353c]';
  const themeActiveTabCls =
    visualTheme === 'light'
      ? 'bg-[#2d628c] text-white font-bold shadow-xs'
      : visualTheme === 'sepia'
      ? 'bg-[#6c4f2b] text-[#fdfbf7] font-bold shadow-xs'
      : 'bg-[#a3c9ff] text-[#00315d] font-bold shadow-xs';
  const themeAccentText =
    visualTheme === 'light'
      ? 'text-[#2d628c]'
      : visualTheme === 'sepia'
      ? 'text-[#7c5326]'
      : 'text-[#a3c9ff]';
  const themeMutedText =
    visualTheme === 'light'
      ? 'text-[#43474e]'
      : visualTheme === 'sepia'
      ? 'text-[#6c5840]'
      : 'text-[#c3c6cf]';
  const themeContentColor =
    visualTheme === 'light'
      ? 'text-[#1f2328]'
      : visualTheme === 'sepia'
      ? 'text-[#433422]'
      : 'text-[#e2e2e9]';
  const themeHeadingColor =
    visualTheme === 'light'
      ? 'text-[#0f1419]'
      : visualTheme === 'sepia'
      ? 'text-[#2c1d0c]'
      : 'text-[#f9f9ff]';
  const themeBorderColor =
    visualTheme === 'light'
      ? 'border-[#c3c6cf]'
      : visualTheme === 'sepia'
      ? 'border-[#d8c8a6]'
      : 'border-[#43474e]';

  const rawText = mode === 'transcript' ? video.transcript : video.summary;
  const textForReader =
    mode === 'summary' && showVisuals ? ensureFallbackVisualMarkers(rawText, 3) : rawText;
  const words = rawText.trim().split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.ceil(words / 220));
  const personaLabel = SUMMARY_PERSONA_PRESETS[persona].label;

  return (
    <div
      className={`flex-1 overflow-y-auto flex flex-col yt-readability-container theme-${theme} yt-readability-theme-${theme} ${themeContainerBg}`}
    >
      {/* Sticky Reader Controls Bar */}
      <div
        className={`sticky top-0 z-20 flex items-center gap-2 px-6 py-2.5 backdrop-blur-md border-b flex-wrap text-xs yt-readability-bar ${themeBarBg}`}
      >
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--md-sys-color-error-container)] hover:opacity-90 text-[var(--md-sys-color-on-error-container)] border border-[var(--md-sys-color-error)]/30 font-medium transition-opacity yt-readability-exit-btn cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          <span>Exit Reader</span>
        </button>
        <div className={`w-px h-4 mx-1 border-l ${themeBorderColor} yt-readability-divider`} />

        <button
          type="button"
          onClick={onToggleSyncYouTubeTheme}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all border yt-readability-btn yt-readability-sync-theme-btn cursor-pointer ${
            syncYouTubeTheme
              ? `${themeActiveTabCls} border-transparent active`
              : themeControlCls
          }`}
          title={
            syncYouTubeTheme
              ? `YouTube Theme Sync: ON (Detected: ${simulatedYouTubeTheme.toUpperCase()} mode — auto-matching YouTube)`
              : "YouTube Theme Sync: OFF (Click to automatically synchronize Reader view with YouTube's Dark/Light mode)"
          }
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncYouTubeTheme ? 'rotate-180' : ''}`} />
          <span className="yt-sync-label">
            {syncYouTubeTheme ? `Sync YouTube (${simulatedYouTubeTheme})` : 'Sync YouTube'}
          </span>
        </button>

        {/* Theme Selector */}
        <div
          className={`inline-flex items-center border rounded-full overflow-hidden yt-readability-theme-group ${themeControlCls}`}
          title="Select reading theme: System, Light, Sepia, Dark"
        >
          {(
            [
              { id: 'system', label: 'System' },
              { id: 'light', label: 'Light' },
              { id: 'sepia', label: 'Sepia' },
              { id: 'dark', label: 'Dark' }
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTheme(t.id)}
              className={`px-2.5 py-1 text-xs font-semibold transition-all yt-readability-theme-btn cursor-pointer ${
                theme === t.id ? `${themeActiveTabCls} active` : themeIdleTabCls
              }`}
              data-theme={t.id}
            >
              {t.label}
            </button>
          ))}
        </div>

        <select
          aria-label="Readability theme"
          value={theme}
          onChange={(e) => onSelectTheme(e.target.value as 'system' | 'light' | 'sepia' | 'dark')}
          className={`m3-select border rounded-full px-2 py-0.5 text-xs hidden yt-readability-theme-select ${themeControlCls}`}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="sepia">Sepia</option>
          <option value="dark">Dark</option>
        </select>

        <div className={`w-px h-4 mx-1 border-l ${themeBorderColor} yt-readability-divider`} />

        <button
          type="button"
          onClick={onToggleFont}
          className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors yt-readability-font-btn cursor-pointer ${themeControlCls}`}
        >
          {font === 'serif' ? 'Serif font' : 'Sans font'}
        </button>

        <div className={`inline-flex items-center border rounded-full overflow-hidden yt-readability-size-group ${themeControlCls}`}>
          <button
            type="button"
            onClick={() => onChangeFontSize(-1)}
            className={`px-2.5 py-1 text-xs font-bold yt-readability-size-dec cursor-pointer ${themeIdleTabCls}`}
            title="Decrease font size"
          >
            A-
          </button>
          <span className={`px-2 text-[11px] font-mono tabular-nums border-x yt-readability-size-label ${themeMutedText} ${themeBorderColor}`}>
            {fontSize}px
          </span>
          <button
            type="button"
            onClick={() => onChangeFontSize(1)}
            className={`px-2.5 py-1 text-xs font-bold yt-readability-size-inc cursor-pointer ${themeIdleTabCls}`}
            title="Increase font size"
          >
            A+
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2.5 flex-wrap">
          <span className={`text-xs yt-readability-stats tabular-nums ${themeMutedText}`}>
            {words.toLocaleString()} words · ~{mins} min read
          </span>
          <button
            type="button"
            onClick={onExportTxt}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-colors yt-readability-export-btn cursor-pointer ${themeControlCls}`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export .txt</span>
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-colors cursor-pointer ${themeControlCls}`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
          <button
            type="button"
            onClick={onExportJson}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-colors yt-readability-export-json-btn cursor-pointer ${themeControlCls}`}
            title="Export transcript summary as JSON (.json) with metadata"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
          <button
            type="button"
            onClick={onExportMarkdown}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-colors yt-readability-export-md-btn cursor-pointer ${themeControlCls}`}
            title="Export offline Markdown / Obsidian bundle (.md)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export .md</span>
          </button>
        </div>
      </div>

      {/* Centered Editorial Canvas */}
      <div
        className={`max-w-[720px] w-full mx-auto px-6 py-10 leading-relaxed yt-readability-content ${themeContentColor} ${
          font === 'serif' ? 'font-serif' : 'font-sans'
        }`}
        style={{ fontSize: `${fontSize}px` }}
      >
        <div className={`border-b pb-5 mb-8 yt-readability-header ${themeBorderColor}`}>
          <div className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider mb-2 font-sans yt-readability-type-badge ${themeAccentText}`}>
            <span>{mode === 'transcript' ? 'YouTube Transcript' : 'Video Summary'}</span>
            <span aria-hidden="true">·</span>
            <span>{personaLabel}</span>
          </div>
          <h1 className={`text-2xl font-bold tracking-tight leading-snug font-sans yt-readability-title ${themeHeadingColor}`}>
            {video.title}
          </h1>
          <div className={`text-xs mt-2 font-sans yt-readability-meta ${themeMutedText}`}>
            Channel: {video.channel} · Views: {video.views} · Persona: {personaLabel} · Video ID: {video.id}
          </div>
          {activeSeek && (
            <div
              data-seek-banner={activeSeek.tsStr}
              className={`mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono tabular-nums font-sans ${themeControlCls}`}
            >
              Player positioned at {activeSeek.tsStr} (cue #{activeSeek.cueIndex + 1})
            </div>
          )}
        </div>

        <div className="space-y-5">
          {parseEditorialBlocksWithVisuals(textForReader, showVisuals && mode === 'summary').map((block, i) => {
            if (block.type === 'frame') {
              const sec = block.seconds ?? 0;
              return (
                <figure
                  key={i}
                  className={`yt-visual-card yt-frame-card yt-readability-visual-card rounded-2xl border overflow-hidden max-w-md ${themeBorderColor} ${themeControlCls}`}
                >
                  <button
                    type="button"
                    onClick={() => onSeekTimestamp(`[${block.ts || '00:00'}]`, sec)}
                    className="relative w-full aspect-video block cursor-pointer group overflow-hidden bg-slate-950"
                    title={`Jump to ${block.ts || '00:00'}`}
                  >
                    <img
                      src={getLocalFramePreviewDataUri(block.ts || '00:15', block.text)}
                      alt={block.text}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/80 text-white text-xs font-mono">
                      <Play className="w-3 h-3 fill-current" />
                      {block.ts || '00:15'}
                    </span>
                  </button>
                  <figcaption className={`px-3 py-2 text-xs font-sans ${themeMutedText}`}>
                    {block.text}
                  </figcaption>
                </figure>
              );
            }
            if (block.type === 'img') {
              return (
                <figure
                  key={i}
                  className={`yt-visual-card yt-commons-card yt-readability-visual-card rounded-2xl border overflow-hidden max-w-md ${themeBorderColor} ${themeControlCls}`}
                >
                  <img
                    src={getLocalDiagramDataUri(block.terms || block.text)}
                    alt={block.text}
                    className="w-full block"
                  />
                  <figcaption className={`px-3 py-2 text-xs font-sans ${themeMutedText}`}>
                    {block.text}
                  </figcaption>
                </figure>
              );
            }
            if (block.type === 'heading') {
              return (
                <h2
                  key={i}
                  className={`text-xl font-bold pt-4 pb-1 border-b font-sans yt-readability-h2 ${themeHeadingColor} ${themeBorderColor}`}
                >
                  <TimestampText text={block.text} onSeek={onSeekTimestamp} activeSeekSec={activeSeek?.seconds ?? null} />
                </h2>
              );
            }
            if (block.type === 'subheading') {
              return (
                <h3
                  key={i}
                  className={`text-lg font-semibold pt-2 font-sans yt-readability-h3 ${themeHeadingColor}`}
                >
                  <TimestampText text={block.text} onSeek={onSeekTimestamp} activeSeekSec={activeSeek?.seconds ?? null} />
                </h3>
              );
            }
            if (block.type === 'bullet') {
              return (
                <div key={i} className={`flex items-start gap-2 pl-4 yt-readability-li ${themeContentColor}`}>
                  <span className={`font-bold ${themeAccentText}`}>&bull;</span>
                  <span>
                    <TimestampText text={block.text} onSeek={onSeekTimestamp} activeSeekSec={activeSeek?.seconds ?? null} />
                  </span>
                </div>
              );
            }
            if (block.type === 'tx') {
              const sec = parseTimestampStringToSeconds(block.ts || '');
              return (
                <div key={i} className={`flex items-start gap-2 yt-readability-tx-line ${themeContentColor}`}>
                  <button
                    type="button"
                    data-seek-sec={sec ?? 0}
                    data-seek-ts={block.ts}
                    onClick={() => {
                      if (block.ts && sec !== null) onSeekTimestamp(block.ts, sec);
                    }}
                    className={`font-mono tabular-nums text-sm px-2 py-0.5 rounded-full border flex-shrink-0 yt-readability-ts yt-ts-jump-btn cursor-pointer transition-colors ${themeControlCls} ${themeAccentText}`}
                    title={`Seek to ${block.ts}`}
                  >
                    {block.ts}
                  </button>
                  <span>{block.text}</span>
                </div>
              );
            }
            return (
              <p key={i} className={`yt-readability-p ${themeContentColor}`}>
                <TimestampText text={block.text} onSeek={onSeekTimestamp} activeSeekSec={activeSeek?.seconds ?? null} />
              </p>
            );
          })}
        </div>

        {mode === 'summary' && (showFactCheck || showSources) && video.factCheck && (
          <div className={`mt-8 rounded-2xl border p-5 space-y-3 font-sans yt-readability-fact-box ${themeBorderColor} ${themeControlCls}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className={`text-base font-bold flex items-center gap-2 ${themeHeadingColor}`}>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Fact-Check &amp; Verification</span>
              </h2>
              <span className={`text-xs font-mono ${themeMutedText}`}>
                {video.factCheck.model} &middot; Google Search
              </span>
            </div>
            <p className={`text-sm ${themeContentColor}`}>{video.factCheck.summary}</p>
            {showFactCheck && video.factCheck.claims.length > 0 && (
              <div className="space-y-2">
                {video.factCheck.claims.map((c, idx) => (
                  <div key={idx} className={`p-3 rounded-xl border text-xs space-y-1 ${themeBorderColor}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">
                        {c.verdict === 'supported'
                          ? '✅ Supported'
                          : c.verdict === 'partly_true'
                          ? '⚠️ Partly true'
                          : c.verdict === 'contradicted'
                          ? '❌ Contradicted'
                          : '❓ Unverifiable'}
                      </span>
                      <TimestampText text={c.timestamp} onSeek={onSeekTimestamp} activeSeekSec={activeSeek?.seconds ?? null} compact />
                      <span className="font-medium">{c.claim}</span>
                    </div>
                    <p className={themeMutedText}>{c.evidence}</p>
                  </div>
                ))}
              </div>
            )}
            {showSources && video.factCheck.sources.length > 0 && (
              <div className={`pt-2 border-t text-xs space-y-1 ${themeBorderColor}`}>
                <div className={`font-semibold ${themeHeadingColor}`}>Sources consulted:</div>
                {video.factCheck.sources.map((s, idx) => (
                  <div key={idx}>
                    <a
                      href={s.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 hover:underline ${themeAccentText}`}
                    >
                      <span>{s.title}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


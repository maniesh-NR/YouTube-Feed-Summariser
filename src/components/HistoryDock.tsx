import React from 'react';
import { Clock, Search, X, ExternalLink, Maximize2, GripVertical, SlidersHorizontal, Play, Pause, Square } from 'lucide-react';
import {
  shouldShowHistoryTab,
  type HistoryPageScope,
  type HistoryTabVisibility,
  type ResizeDirection,
  type WindowBounds
} from '../utils/userscript-helpers';
import {
  getLocalThumbnailDataUri,
  type HistoryItem,
  type MockVideo
} from './SimulatorTypes';

interface HistoryDockProps {
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  historyBounds: WindowBounds;
  historyZIndex: number;
  onFocusHistory: () => void;
  onStartHistoryDrag: (e: React.MouseEvent) => void;
  onStartHistoryResize: (dir: ResizeDirection) => (e: React.MouseEvent) => void;
  onHistoryResizeKeyDown: (dir: ResizeDirection) => (e: React.KeyboardEvent) => void;
  onHistoryGripKeyDown: (e: React.KeyboardEvent) => void;
  onOpenSettings: () => void;
  historySearch: string;
  setHistorySearch: (search: string) => void;
  closedSummaries: HistoryItem[];
  onReopenSummary: (item: HistoryItem) => void;
  onDeleteFromHistory: (id: string) => void;
  onClearAllHistory: () => void;
  historyTabVisibility: HistoryTabVisibility;
  showHistoryBottomTab: boolean;
  historyPageScope: HistoryPageScope;
  currentSimPage: string;
  openWindows: Record<string, { minimized: boolean; mode: 'summary' | 'transcript' | 'podcast'; source: 'video' | 'text' }>;
  focusedVideoId: string | null;
  videos: MockVideo[];
  ttsState: Record<string, { status: 'idle' | 'playing' | 'paused'; rate: number }>;
  podcastPlaybackStatus: Record<string, 'idle' | 'playing' | 'paused'>;
  onToggleTtsPlayback: (id: string) => void;
  onStopTtsPlayback: (id: string) => void;
  onTogglePodcastPlayback: (id: string) => void;
  onStopPodcastPlayback: (id: string) => void;
  onMaximizeWindow: (id: string) => void;
  onCloseWindow: (id: string) => void;
}

const HISTORY_RESIZE_HANDLES: Array<{
  dir: ResizeDirection;
  orientation: 'horizontal' | 'vertical';
  label: string;
  cls: string;
}> = [
  { dir: 'n', orientation: 'horizontal', label: 'Resize history top', cls: 'left-3 right-3 top-0 h-1.5 cursor-ns-resize z-30 yt-resize-n' },
  { dir: 's', orientation: 'horizontal', label: 'Resize history bottom', cls: 'left-3 right-3 bottom-0 h-1.5 cursor-ns-resize z-30 yt-resize-s' },
  { dir: 'e', orientation: 'vertical', label: 'Resize history right', cls: 'top-3 bottom-3 right-0 w-1.5 cursor-ew-resize z-30 yt-resize-e' },
  { dir: 'w', orientation: 'vertical', label: 'Resize history left', cls: 'top-3 bottom-3 left-0 w-1.5 cursor-ew-resize z-30 yt-resize-w' },
  { dir: 'nw', orientation: 'horizontal', label: 'Resize history top-left corner', cls: 'left-0 top-0 w-3.5 h-3.5 cursor-nwse-resize z-40 yt-resize-nw' },
  { dir: 'ne', orientation: 'horizontal', label: 'Resize history top-right corner', cls: 'right-0 top-0 w-3.5 h-3.5 cursor-nesw-resize z-40 yt-resize-ne' },
  { dir: 'sw', orientation: 'horizontal', label: 'Resize history bottom-left corner', cls: 'left-0 bottom-0 w-3.5 h-3.5 cursor-nesw-resize z-40 yt-resize-sw' },
  { dir: 'se', orientation: 'horizontal', label: 'Resize history bottom-right corner', cls: 'right-0 bottom-0 w-3.5 h-3.5 cursor-nwse-resize z-40 yt-resize-se' }
];

export const HistoryDock: React.FC<HistoryDockProps> = ({
  historyOpen,
  setHistoryOpen,
  historyBounds,
  historyZIndex,
  onFocusHistory,
  onStartHistoryDrag,
  onStartHistoryResize,
  onHistoryResizeKeyDown,
  onHistoryGripKeyDown,
  onOpenSettings,
  historySearch,
  setHistorySearch,
  closedSummaries,
  onReopenSummary,
  onDeleteFromHistory,
  onClearAllHistory,
  historyTabVisibility,
  showHistoryBottomTab,
  historyPageScope,
  currentSimPage,
  openWindows,
  focusedVideoId,
  videos,
  ttsState,
  podcastPlaybackStatus,
  onToggleTtsPlayback,
  onStopTtsPlayback,
  onTogglePodcastPlayback,
  onStopPodcastPlayback,
  onMaximizeWindow,
  onCloseWindow
}) => {
  const q = historySearch.toLowerCase().trim();
  const filtered = q
    ? closedSummaries.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          s.channel.toLowerCase().includes(q)
      )
    : closedSummaries;

  return (
    <>
      {historyOpen && (
        <div
          style={{
            left: `${historyBounds.left}px`,
            top: `${historyBounds.top}px`,
            width: `${historyBounds.width}px`,
            height: `${historyBounds.height}px`,
            zIndex: historyZIndex,
            fontFamily: 'var(--yt-ui-font, var(--font-sans))',
            fontSize: 'var(--yt-ui-font-size, 14px)'
          }}
          onMouseDown={onFocusHistory}
          role="dialog"
          aria-label="Previous Summaries"
          className="fixed bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-primary)]/40 rounded-[24px] shadow-2xl flex flex-col overflow-hidden text-[var(--md-sys-color-on-surface)] yt-history-dialog-box yt-floating-window"
        >
          {/* 8-Direction Resize Handles */}
          {HISTORY_RESIZE_HANDLES.map((h) => (
            <div
              key={h.dir}
              role="separator"
              tabIndex={0}
              data-resize-dir={h.dir}
              aria-orientation={h.orientation}
              aria-label={h.label}
              onMouseDown={onStartHistoryResize(h.dir)}
              onKeyDown={onHistoryResizeKeyDown(h.dir)}
              className={`absolute focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary)]/25 transition-colors yt-resize-handle ${h.cls}`}
            />
          ))}

          {/* Draggable Header */}
          <div
            onMouseDown={onStartHistoryDrag}
            className="px-5 py-3.5 border-b border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-2 bg-[var(--md-sys-color-surface-container)] cursor-move select-none yt-win-header"
            title="Drag header to move Previous Summaries window"
          >
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                tabIndex={0}
                onKeyDown={onHistoryGripKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] cursor-grab active:cursor-grabbing yt-win-drag-grip"
                aria-label="Move previous summaries window with arrow keys"
              >
                <GripVertical className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <h2 className="font-semibold text-base text-[var(--md-sys-color-on-surface)] flex items-center gap-2 truncate">
                  <Clock className="w-4 h-4 text-[var(--md-sys-color-primary)] flex-shrink-0" />
                  <span className="truncate">Previous Summaries</span>
                </h2>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5 tabular-nums truncate">
                  {closedSummaries.length} saved summar{closedSummaries.length === 1 ? 'y' : 'ies'} from your browsing sessions
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={onOpenSettings}
                className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors yt-history-settings-btn cursor-pointer"
                title="Settings & Appearance"
                aria-label="Open Settings"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors yt-win-close-btn cursor-pointer"
                title="Close"
                aria-label="Close history dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-5 py-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)] absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search previous summaries by title or content..."
                className="w-full bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded-full pl-9 pr-8 py-2 text-xs text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)] focus:outline-none focus:border-[var(--md-sys-color-primary)] yt-history-search-input"
              />
              {historySearch && (
                <button
                  type="button"
                  onClick={() => setHistorySearch('')}
                  className="absolute right-3 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] cursor-pointer"
                  title="Clear search"
                  aria-label="Clear history search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* History List */}
          <div className="p-5 overflow-y-auto space-y-3 flex-1 yt-history-list">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-[var(--md-sys-color-on-surface-variant)] text-xs yt-history-empty">
                {q
                  ? `No previous summaries match "${historySearch}".`
                  : 'No previous summaries yet. Summaries you create will be saved here so you can access them after closing.'}
              </div>
            ) : (
                filtered.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-3.5 flex items-center gap-4 transition-colors yt-history-card"
                  >
                    <div
                      onClick={() => onReopenSummary(item)}
                      className="w-24 h-14 bg-[var(--md-sys-color-surface-container-highest)] rounded-xl overflow-hidden flex-shrink-0 cursor-pointer relative group yt-history-thumb-wrap"
                      title="Click to re-open summary"
                    >
                      <img
                        src={getLocalThumbnailDataUri(item.channel)}
                        referrerPolicy="no-referrer"
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform yt-history-thumb"
                      />
                      <span className="absolute bottom-1 right-1 bg-black/80 text-[10px] px-1.5 rounded-full text-white font-mono tabular-nums">
                        {item.duration}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0 yt-history-info">
                      <a
                        href={`https://www.youtube.com/watch?v=${item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-xs text-[var(--md-sys-color-on-surface)] hover:text-[var(--md-sys-color-primary)] truncate block transition-colors yt-history-item-title"
                        title={`${item.title} (Open video in new tab)`}
                      >
                        {item.title}
                      </a>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)] yt-history-item-meta flex-wrap">
                        <span className="text-[var(--md-sys-color-primary)] font-semibold uppercase text-[10px] yt-history-badge mode">
                          {item.mode}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[var(--md-sys-color-tertiary)] font-medium text-[10px] yt-history-badge model">
                          {item.model}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.channel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[var(--md-sys-color-on-surface-variant)] yt-history-date tabular-nums">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] line-clamp-1 mt-1 yt-history-snippet">
                        {item.summary.replace(/[#*`]/g, '').slice(0, 140)}...
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 yt-history-actions">
                      <button
                        type="button"
                        onClick={() => onReopenSummary(item)}
                        className="px-3.5 py-1.5 rounded-full bg-[var(--md-sys-color-primary)] hover:opacity-90 text-[var(--md-sys-color-on-primary)] font-semibold text-xs transition-opacity yt-history-reopen-btn cursor-pointer"
                        title="Re-open summary window"
                      >
                        Open Summary
                      </button>
                      <a
                        href={`https://www.youtube.com/watch?v=${item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] transition-colors flex items-center gap-1 text-xs yt-history-video-btn"
                        title="Open original video in new tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Watch</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => onDeleteFromHistory(item.id)}
                        className="p-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-error-container)] transition-colors yt-history-del-btn cursor-pointer"
                        title="Remove from history"
                        aria-label={`Remove ${item.title} from history`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-between bg-[var(--md-sys-color-surface-container)] text-xs yt-history-footer">
              <button
                type="button"
                onClick={onClearAllHistory}
                disabled={closedSummaries.length === 0}
                className="text-[var(--md-sys-color-error)] hover:underline disabled:opacity-35 disabled:no-underline cursor-pointer font-medium"
              >
                Clear All History
              </button>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="px-4 py-1.5 bg-[var(--md-sys-color-secondary-container)] hover:opacity-90 rounded-full text-[var(--md-sys-color-on-secondary-container)] font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
        </div>
      )}

      {/* Bottom Right Dock */}
      <div className="fixed bottom-0 left-2 right-2 sm:left-auto sm:right-6 z-40 flex items-end justify-start sm:justify-end gap-2 max-w-[calc(100vw-16px)] overflow-x-auto pointer-events-auto">
        {shouldShowHistoryTab({
          visibility: historyTabVisibility,
          cachedCount: closedSummaries.length,
          activeTabCount: Object.keys(openWindows).length,
          showHistoryBottomTab,
          pageScope: historyPageScope,
          currentPage: currentSimPage
        }) && (
          <div
            onClick={() => setHistoryOpen(true)}
            className="h-10 bg-[var(--md-sys-color-primary-container)] hover:opacity-95 text-[var(--md-sys-color-on-primary-container)] rounded-t-2xl px-3.5 flex items-center justify-between gap-2 shadow-lg border border-[var(--md-sys-color-primary)]/40 cursor-pointer transition-opacity border-b-0 yt-dock-tab yt-dock-history-tab"
            title="Browse previous summaries that were closed"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
              <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
                History ({closedSummaries.length})
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setHistoryOpen(true);
              }}
              className="p-1 hover:bg-[var(--md-sys-color-primary)]/15 rounded-full yt-dock-btn yt-dock-open-history-btn cursor-pointer"
              title="Browse previous summaries"
              aria-label="Open summary history"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {Object.entries(openWindows).map(([videoId, winState]) => {
          const video = videos.find((v) => v.id === videoId);
          if (!video) return null;
          const isOpenAndFocused = !winState.minimized && focusedVideoId === videoId;
          const podSt = podcastPlaybackStatus[videoId] || 'idle';
          const ttsSt = ttsState[videoId]?.status || 'idle';
          const isPodActive = podSt === 'playing' || podSt === 'paused';
          const isTtsActive = ttsSt === 'playing' || ttsSt === 'paused';
          const isAudioActive = isPodActive || isTtsActive;
          const isPlayingNow = podSt === 'playing' || ttsSt === 'playing';
          const audioLabel = isPodActive
            ? podSt === 'playing'
              ? 'Podcast Playing'
              : 'Podcast Paused'
            : ttsSt === 'playing'
            ? 'TTS Playing'
            : 'TTS Paused';

          return (
            <div
              key={videoId}
              data-dock-video-id={videoId}
              data-dock-audio-state={isAudioActive ? (isPlayingNow ? 'playing' : 'paused') : 'idle'}
              onClick={() => onMaximizeWindow(videoId)}
              className={`min-w-[155px] flex-1 max-w-[300px] sm:flex-none sm:w-72 h-10 rounded-t-2xl px-3 flex items-center justify-between gap-2 shadow-lg border cursor-pointer transition-colors border-b-0 yt-dock-tab ${
                isAudioActive ? (isPlayingNow ? 'audio-playing' : 'audio-paused') : ''
              } ${
                isAudioActive && isPlayingNow
                  ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-[var(--md-sys-color-primary)]'
                  : isOpenAndFocused
                  ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] border-[var(--md-sys-color-primary)]/60'
                  : 'bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] border-[var(--md-sys-color-outline-variant)]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isPlayingNow
                      ? 'bg-[var(--md-sys-color-primary)] animate-pulse'
                      : winState.minimized
                      ? 'bg-[var(--md-sys-color-success)]'
                      : 'bg-[var(--md-sys-color-primary)]'
                  }`}
                />
                <span className="text-xs font-medium truncate">{video.title}</span>
              </div>

              <div
                className="flex items-center gap-1 flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {isAudioActive && (
                  <div className="inline-flex items-center gap-1 yt-dock-audio-controls">
                    <span
                      data-testid={`dock-audio-badge-${videoId}`}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                        isPlayingNow
                          ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                          : 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                      }`}
                    >
                      {audioLabel}
                    </span>
                    <button
                      type="button"
                      data-action="dock-audio-toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isPodActive) onTogglePodcastPlayback(videoId);
                        else onToggleTtsPlayback(videoId);
                      }}
                      className="p-1 hover:bg-[var(--md-sys-color-surface-container)] rounded-full cursor-pointer"
                      title={isPlayingNow ? 'Pause background playback' : 'Resume background playback'}
                      aria-label={isPlayingNow ? `Pause ${video.title} audio` : `Resume ${video.title} audio`}
                    >
                      {isPlayingNow ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      data-action="dock-audio-stop"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isPodActive) onStopPodcastPlayback(videoId);
                        else onStopTtsPlayback(videoId);
                      }}
                      className="p-1 hover:bg-[var(--md-sys-color-surface-container)] rounded-full cursor-pointer"
                      title="Stop background playback"
                      aria-label={`Stop ${video.title} audio`}
                    >
                      <Square className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onMaximizeWindow(videoId)}
                  className="p-1 hover:bg-[var(--md-sys-color-surface-container)] rounded-full cursor-pointer text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]"
                  title={winState.minimized ? 'Restore window' : 'Focus window'}
                  aria-label={winState.minimized ? 'Restore window' : 'Focus window'}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onCloseWindow(videoId)}
                  className="p-1 hover:bg-[var(--md-sys-color-surface-container)] rounded-full cursor-pointer text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]"
                  title="Close"
                  aria-label="Close docked window"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

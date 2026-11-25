import React from 'react';
import { Clock, GripVertical, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import type { ResizeDirection, WindowBounds } from '../utils/userscript-helpers';

interface QuickMenuWindowProps {
  open: boolean;
  bounds: WindowBounds;
  zIndex: number;
  closedSummariesCount: number;
  onClose: () => void;
  onFocus: () => void;
  onStartDrag: (e: React.MouseEvent) => void;
  onStartResize: (dir: ResizeDirection) => (e: React.MouseEvent) => void;
  onResizeKeyDown: (dir: ResizeDirection) => (e: React.KeyboardEvent) => void;
  onGripKeyDown: (e: React.KeyboardEvent) => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}

const QUICK_RESIZE_HANDLES: Array<{
  dir: ResizeDirection;
  orientation: 'horizontal' | 'vertical';
  label: string;
  cls: string;
}> = [
  { dir: 'n', orientation: 'horizontal', label: 'Resize quick menu top', cls: 'left-3 right-3 top-0 h-1.5 cursor-ns-resize z-30 yt-resize-n' },
  { dir: 's', orientation: 'horizontal', label: 'Resize quick menu bottom', cls: 'left-3 right-3 bottom-0 h-1.5 cursor-ns-resize z-30 yt-resize-s' },
  { dir: 'e', orientation: 'vertical', label: 'Resize quick menu right', cls: 'top-3 bottom-3 right-0 w-1.5 cursor-ew-resize z-30 yt-resize-e' },
  { dir: 'w', orientation: 'vertical', label: 'Resize quick menu left', cls: 'top-3 bottom-3 left-0 w-1.5 cursor-ew-resize z-30 yt-resize-w' },
  { dir: 'nw', orientation: 'horizontal', label: 'Resize quick menu top-left corner', cls: 'left-0 top-0 w-3.5 h-3.5 cursor-nwse-resize z-40 yt-resize-nw' },
  { dir: 'ne', orientation: 'horizontal', label: 'Resize quick menu top-right corner', cls: 'right-0 top-0 w-3.5 h-3.5 cursor-nesw-resize z-40 yt-resize-ne' },
  { dir: 'sw', orientation: 'horizontal', label: 'Resize quick menu bottom-left corner', cls: 'left-0 bottom-0 w-3.5 h-3.5 cursor-nesw-resize z-40 yt-resize-sw' },
  { dir: 'se', orientation: 'horizontal', label: 'Resize quick menu bottom-right corner', cls: 'right-0 bottom-0 w-3.5 h-3.5 cursor-nwse-resize z-40 yt-resize-se' }
];

export const QuickMenuWindow: React.FC<QuickMenuWindowProps> = ({
  open,
  bounds,
  zIndex,
  closedSummariesCount,
  onClose,
  onFocus,
  onStartDrag,
  onStartResize,
  onResizeKeyDown,
  onGripKeyDown,
  onOpenHistory,
  onOpenSettings
}) => {
  if (!open) return null;

  return (
    <div
      style={{
        left: `${bounds.left}px`,
        top: `${bounds.top}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        zIndex,
        fontFamily: 'var(--yt-ui-font, var(--font-sans))',
        fontSize: 'var(--yt-ui-font-size, 14px)'
      }}
      onMouseDown={onFocus}
      role="dialog"
      aria-label="YouTube Summariser Quick Menu"
      className="fixed bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-[22px] shadow-2xl flex flex-col overflow-hidden text-[var(--md-sys-color-on-surface)] yt-quick-menu-box yt-floating-window"
    >
      {QUICK_RESIZE_HANDLES.map((h) => (
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
        className="px-4 py-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] flex items-center justify-between gap-2 cursor-move select-none yt-win-header"
        title="Drag header to move quick menu"
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            tabIndex={0}
            onKeyDown={onGripKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="p-1 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] cursor-grab active:cursor-grabbing yt-win-drag-grip"
            aria-label="Move quick menu with arrow keys"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <Sparkles className="w-4 h-4 text-[var(--md-sys-color-primary)] flex-shrink-0" />
          <span className="font-semibold text-sm truncate">Summariser Menu</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors yt-win-btn yt-win-close-btn cursor-pointer"
          title="Close Quick Menu"
          aria-label="Close Quick Menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Menu Actions */}
      <div className="p-3.5 overflow-y-auto space-y-2.5 flex-1">
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenHistory();
          }}
          className="w-full text-left p-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] transition-colors flex items-center justify-between gap-3 cursor-pointer yt-quick-open-history-btn"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--md-sys-color-on-surface)] truncate">
                Previous Summaries
              </div>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                Browse, search &amp; reopen cached runs
              </div>
            </div>
          </div>
          <span className="text-xs font-mono tabular-nums font-semibold text-[var(--md-sys-color-primary)] flex-shrink-0">
            {closedSummariesCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
          className="w-full text-left p-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] transition-colors flex items-center gap-3 cursor-pointer yt-quick-open-settings-btn"
        >
          <span className="w-9 h-9 rounded-full bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] flex items-center justify-center flex-shrink-0">
            <SlidersHorizontal className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-xs text-[var(--md-sys-color-on-surface)] truncate">
              Settings &amp; Formatting
            </div>
            <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">
              Theme, UI fonts &amp; summary formatting
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};

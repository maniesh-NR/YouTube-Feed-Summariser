import React from 'react';
import { Copy, Check, Play, RefreshCw, ShieldAlert, Sun, Moon, Monitor } from 'lucide-react';
import type { AppThemeMode } from '../utils/userscript-helpers';

interface SettingsDocsTabsProps {
  activeTab: 'code' | 'tests' | 'docs';
  copied: boolean;
  onCopyUserscript: () => void;
  testRunning: boolean;
  testOutput: string | null;
  onRunTestsFrontend: () => void;
  appThemeMode: AppThemeMode;
  onSetAppThemeMode: (mode: AppThemeMode) => void;
}

export const SettingsDocsTabs: React.FC<SettingsDocsTabsProps> = ({
  activeTab,
  copied,
  onCopyUserscript,
  testRunning,
  testOutput,
  onRunTestsFrontend,
  appThemeMode,
  onSetAppThemeMode
}) => {
  const themeBanner = (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl px-4 py-3">
      <div>
        <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">Material You UI Theme</span>
        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] ml-2">
          Matches System, Light, or Dark across simulator &amp; userscript
        </span>
      </div>
      <div
        role="group"
        aria-label="Material You Theme Mode"
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
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isSelected
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-semibold'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (activeTab === 'code') {
    return (
      <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
        {themeBanner}

        <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-[24px] p-5">
          <div>
            <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">
              youtube-feed-summariser.user.js (v2.12.0)
            </h2>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
              Production Tampermonkey script &middot; Compliant with YouTube Trusted Types and Shadow DOM isolation.
            </p>
          </div>

          <button
            type="button"
            onClick={onCopyUserscript}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full bg-[var(--md-sys-color-primary)] hover:opacity-90 text-[var(--md-sys-color-on-primary)] transition-opacity shadow-xs cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied Full Script!' : 'Copy to Clipboard'}
          </button>
        </div>

        <div className="bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-[24px] overflow-hidden font-mono text-xs">
          <div className="bg-[var(--md-sys-color-surface-container)] px-4 py-2.5 border-b border-[var(--md-sys-color-outline-variant)] flex items-center justify-between text-[var(--md-sys-color-on-surface-variant)]">
            <span className="text-[var(--md-sys-color-on-surface)] font-sans font-medium">Installation Instructions</span>
            <span className="text-[11px] font-mono">Tampermonkey / Violentmonkey</span>
          </div>
          <div className="p-5 space-y-3 text-[var(--md-sys-color-on-surface)] font-sans text-xs border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
            <p>
              1. Open Tampermonkey dashboard &rarr; click <strong>&ldquo;Create a new script&rdquo;</strong> (or open your existing YouTube Feed Summariser script).
            </p>
            <p>
              2. Select all and <strong>paste this file over the old script</strong> (it preserves stored API keys, options, channel title rules, persona preset, and cached summaries because the <code className="text-[var(--md-sys-color-primary)]">@namespace</code> and <code className="text-[var(--md-sys-color-primary)]">@name</code> match exactly).
            </p>
            <p>
              3. Save (<kbd className="px-1.5 py-0.5 bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded text-[11px]">Ctrl+S</kbd> / <kbd className="px-1.5 py-0.5 bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded text-[11px]">Cmd+S</kbd>) and reload YouTube.
            </p>
          </div>

          <div className="p-4 max-h-[500px] overflow-y-auto text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
            <pre className="text-[11px] text-[var(--md-sys-color-on-surface)]">
{`// ==UserScript==
// @name         YouTube Feed Summariser (Gemini)
// @namespace    local.yt-feed-summariser
// @version      2.12.0
// @description  Adds dockable Gemini video summaries, transcripts, alternative descriptive thumbnail titles, per-channel rules, personas, and TTS shortcuts.
// @match        https://www.youtube.com/*
// @noframes
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @connect      generativelanguage.googleapis.com
// @connect      commons.wikimedia.org
// ==/UserScript==

// [Delivered in full at /youtube-feed-summariser.user.js in workspace]`}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'tests') {
    return (
      <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
        {themeBanner}

        <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-[24px] p-5">
          <div>
            <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">
              Acceptance Test Suite Overview
            </h2>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
              5-suite Playwright Chromium + Node unit/parity harness testing Userscript DOM, Gemini pipeline, Ask provider, and React Simulator.
            </p>
          </div>

          <button
            type="button"
            onClick={onRunTestsFrontend}
            disabled={testRunning}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full bg-[var(--md-sys-color-primary)] hover:opacity-90 text-[var(--md-sys-color-on-primary)] transition-opacity shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {testRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            {testRunning ? 'Running Simulation...' : 'Simulate Suite Run'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--md-sys-color-on-surface)]">
                Suite 1: Menu, UI, TTS, Timestamp &amp; Persona Controls
              </span>
              <span className="text-[var(--md-sys-color-success)] font-mono text-[11px]">Playwright E2E</span>
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Covers menu injection, 8-handle resize &amp; keyboard movement, TTS voice/pitch/speed sliders, interactive [MM:SS] player seek &amp; Follow-Along lock, per-channel title rules, and Summary Persona prompt/cache scoping.
            </p>
          </div>

          <div className="p-4 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--md-sys-color-on-surface)]">
                Suite 2: Cache &amp; Cross-Tab Sync
              </span>
              <span className="text-[var(--md-sys-color-success)] font-mono text-[11px]">Playwright E2E</span>
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Covers zero-API-request cache reopen, conversation turns persistence, cross-tab GM value listeners, persona cache key isolation, and unread notification pulse.
            </p>
          </div>

          <div className="p-4 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--md-sys-color-on-surface)]">
                Suite 3 &amp; 4: Gemini Pipeline, Ask &amp; Visuals
              </span>
              <span className="text-[var(--md-sys-color-success)] font-mono text-[11px]">Playwright E2E</span>
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Covers model fallback ladder, YouTube Ask zero-quota bypass &amp; iframe variants, FRAME storyboard sprites, Wikimedia search, and Nano Banana diagrams.
            </p>
          </div>

          <div className="p-4 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--md-sys-color-on-surface)]">
                Suite 5 &amp; Node: Simulator Parity &amp; Zero-Drift Helper Check
              </span>
              <span className="text-[var(--md-sys-color-success)] font-mono text-[11px]">Automated Parity</span>
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Verifies React Simulator parity, 375px mobile zero-overflow layout, ARIA live announcements, and exact output parity between userscript helpers and <code className="text-[var(--md-sys-color-primary)]">userscript-helpers.ts</code>.
            </p>
          </div>
        </div>

        {testOutput && (
          <div className="bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-5 font-mono text-xs text-[var(--md-sys-color-success)] whitespace-pre-wrap leading-relaxed shadow-inner">
            {testOutput}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-6">
      {themeBanner}

      <div className="bg-[var(--md-sys-color-warning-container)]/50 border border-[var(--md-sys-color-warning)]/40 rounded-[24px] p-5 space-y-3">
        <div className="flex items-center gap-2 text-[var(--md-sys-color-warning)] font-semibold text-sm">
          <ShieldAlert className="w-5 h-5" />
          Architecture Notes &amp; Platform Safeguards
        </div>
        <ul className="text-xs text-[var(--md-sys-color-on-surface)] space-y-2 list-disc pl-5 leading-relaxed">
          <li>
            <strong>Interactive Timestamp Jump-Sync &amp; Follow-Along Lock:</strong> Clicking any <code className="text-[var(--md-sys-color-primary)]">[MM:SS]</code> marker jumps the watch video / player seek badge and highlights the nearest transcript cue via <code className="text-[var(--md-sys-color-primary)]">findTranscriptCueIndexForSeconds</code>, while <code className="text-[var(--md-sys-color-primary)]">yt-follow-along-btn</code> lets users pause or resume automatic scrolling.
          </li>
          <li>
            <strong>Per-Channel Auto-Title Rules:</strong> Channel-level <code className="text-[var(--md-sys-color-primary)]">Default</code>, <code className="text-[var(--md-sys-color-primary)]">Exempt</code>, and <code className="text-[var(--md-sys-color-primary)]">Always AI</code> preferences persist across cards and tabs while respecting the global auto-title toggle and DeArrow priority rules.
          </li>
          <li>
            <strong>Summary Persona &amp; Output Presets:</strong> Supports <code className="text-[var(--md-sys-color-primary)]">Executive Brief</code>, <code className="text-[var(--md-sys-color-primary)]">Deep Technical / Code</code>, <code className="text-[var(--md-sys-color-primary)]">Study Quiz &amp; Flashcards</code>, and <code className="text-[var(--md-sys-color-primary)]">Chronological Timeline</code>, dynamically shaping Gemini instructions, non-executive cache keys, and JSON exports.
          </li>
          <li>
            <strong>Chapter-Aware Long-Video Chunking (&gt;45m):</strong> Transcripts exceeding 45 minutes are partitioned by chapters (or 20-minute windows) via a map-reduce synthesis pass and expose a clickable chapter bar (<code className="text-[var(--md-sys-color-primary)]">.yt-chapter-bar</code>) synced to player seeking.
          </li>
          <li>
            <strong>Offline Markdown / Obsidian Bundle (.md) &amp; Backup CLI:</strong> Exports self-contained Markdown notes with YAML frontmatter, timestamp deep links, Unicode math, Q&amp;A threads, and ratings/notes alongside <code className="text-[var(--md-sys-color-primary)]">sandbox-backup.mjs --diff / --restore --file</code> verification.
          </li>
          <li>
            <strong>Zero-Drift Shared Core &amp; Material You System:</strong> React simulator and Userscript Shadow DOM share normalized System/Light/Dark appearance tokens, validated for parity with zero Trusted Types DOM sinks or blocking dialogs.
          </li>
        </ul>
      </div>

      <div className="bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-[24px] p-6 space-y-4">
        <h3 className="font-semibold text-sm text-[var(--md-sys-color-on-surface)]">Files Built &amp; Verified in Repository</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-3.5 bg-[var(--md-sys-color-surface-container-low)] rounded-2xl border border-[var(--md-sys-color-outline-variant)]">
            <span className="text-[var(--md-sys-color-primary)] font-semibold">youtube-feed-summariser.user.js</span>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] font-sans mt-1">
              v2.12.0 complete Trusted-Types-clean userscript
            </p>
          </div>
          <div className="p-3.5 bg-[var(--md-sys-color-surface-container-low)] rounded-2xl border border-[var(--md-sys-color-outline-variant)]">
            <span className="text-[var(--md-sys-color-tertiary)] font-semibold">src/components/*</span>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] font-sans mt-1">
              Modular React Simulator components &amp; hooks
            </p>
          </div>
          <div className="p-3.5 bg-[var(--md-sys-color-surface-container-low)] rounded-2xl border border-[var(--md-sys-color-outline-variant)]">
            <span className="text-[var(--md-sys-color-success)] font-semibold">src/utils/userscript-helpers.ts</span>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] font-sans mt-1">
              Shared pure helpers tested against userscript exports
            </p>
          </div>
          <div className="p-3.5 bg-[var(--md-sys-color-surface-container-low)] rounded-2xl border border-[var(--md-sys-color-outline-variant)]">
            <span className="text-[var(--md-sys-color-warning)] font-semibold">run_all_tests.js &amp; test_simulator_ui.js</span>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] font-sans mt-1">
              5-suite Playwright E2E + React Simulator verification
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

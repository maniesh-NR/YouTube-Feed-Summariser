# Project Memory & State — YouTube Feed Summariser (Gemini)

> Single source of truth governed by pstack engineering & token-efficiency principles.
> Keep entries terse, factual, and free of raw chat transcripts or dead-end logs.

## 1. Tech Stack & Architecture Rules
- **Production Userscript (`/youtube-feed-summariser.user.js`, v2.12.0)**:
  - Runs on `https://www.youtube.com/*` with `@run-at document-idle` and Shadow DOM isolation (`#yt-ai-summary-host`).
  - **Strict Trusted Types & CSP**: Zero `innerHTML`, `outerHTML`, `insertAdjacentHTML`, or `document.write` sinks; build DOM strictly with `h()` / `hSvg()` / `clearEl()`. Zero `window.alert()` / blocking dialogs.
  - **Background Media & Network Discipline**: Feed alt-title generation disables `/watch` iframe fallback (`allowIframeFallback: false`) and gates offscreen `/watch` fetches via `IntersectionObserver` + `pageLoadSettled`; `Route B` / `Ask` iframes strip autoplay and mute/pause media via `silenceWatchDocumentMedia()`.
  - **Bounded GM Storage**: Cached summaries capped (`CONFIG.cacheMax = 100`), alt-title cache LRU (`500`), drafts LRU (`200`), ratings LRU (`500`); history tab badge uses O(keys) `getCachedSummariesCount()` without deserializing payloads.
- **Interactive React Simulator (`src/App.tsx`, `src/components/*`)**:
  - React 19 + TypeScript + Tailwind CSS v4 + Vite 8 (`port 3000`, HMR disabled in container).
  - Modular UI components under `src/components/`: `FeedSimulatorGrid.tsx`, `FloatingSummaryWindow.tsx`, `HistoryDock.tsx`, `PodcastStudioPanel.tsx`, `ReadabilityModal.tsx`, `ResponseRatingBar.tsx`, `SettingsDocsTabs.tsx`, `SimulatorTypes.ts`, `TimestampText.tsx`, `TtsControlBar.tsx`, `TtsWaveformVisualizer.tsx`.
- **AUD-08 Zero-Drift Core (`src/utils/userscript-helpers.ts`)**:
  - Pure domain logic (timestamps, math/speech cleaning, window bounds/adaptive tiers, channel title rules, personas, chapter chunking, Markdown/Obsidian export, multi-host podcast helpers, key/viewport perf gating) MUST match `youtube-feed-summariser.user.js` verbatim and pass VM parity assertions in `src/utils/userscript-helpers.test.ts`.
- **Sandbox Governance (`WORKFLOW.md`, `scripts/*`)**:
  - Prompt-end snapshots stored in `sandbox-storage/backups/`; harness state & adversarial reviews tracked in `sandbox-storage/memory/` and `sandbox-storage/reviews/`.

## 2. Active Playbook & Todo Checklist
- **Current Baseline (Stages 0–5 + Interactive Podcast & Page-Load Perf Completed)**:
  - [x] Multi-window floating containers, adaptive TTS bar scaling, waveform visualizer, Ask ladder fallback
  - [x] Auto-title replacement with DeArrow coexistence & per-channel rules (`FEAT-02`)
  - [x] Interactive timestamp jump-sync (`FEAT-01`), Summary Personas (`FEAT-03`), >45m chapter chunking (`FEAT-04`)
  - [x] Keyboard ergonomics & ARIA live announcements (`FEAT-05`), Offline Markdown/Obsidian bundle (`FEAT-06`)
  - [x] Multi-host NotebookLM-style Interactive Podcast Studio (`FEAT-07`)
  - [x] Page-load performance optimization (`@run-at document-idle`, lazy styles, key-only history count, `IntersectionObserver` deferral)
- **Active Session Setup (pstack Engineering Protocol)**:
  - [x] Scan workspace layout, git availability, sandbox memory, and test suites
  - [x] Initialize `/PROJECT_MEMORY.md` with architecture baseline, playbook, and verification contracts
  - [x] Install `/update_memory.py` at repository root and smoke-test execution
  - [x] Complete read-only root-cause investigation of 3 reported feed bugs:
    1. Left sidebar "Watch later" hijack: capture-phase `initMenuIntegration` mistook `.yt-alt-title-btn` clicks for 3-dot card menu clicks, and `menuPollTimer` matched global sidebar `<tp-yt-paper-item>` ("Watch later").
    2. Auto AI title missing on page load + truthful button state: `processFeedCard` set `_currentTitleMode = 'ai'` prematurely before fetch; `processBatchChunk` hardcoded `isIntersectingViewport: false`; `FEED_CARD_SELECTOR` double-matched outer `ytd-rich-item-renderer` + inner `yt-lockup-view-model`; `fetchTranscriptRouteA` lacked `captionTracks` JSON3/XML fallback; `maxOutputTokens: 60` risked starving Gemini thinking output.
    3. Original title shown twice on click: premature `'ai'` state caused `toggleCardTitle` to run `revertCardToNonAiTitle` -> `setCardTitleText` directly on Polymer `<yt-formatted-string>` / duplicate/hidden spans, causing Polymer to re-append its child `<span>` next to the written text node.
- **Active Bugfix Playbook (`fix-sidebar-double-title`)**:
  - [x] Add pure caption/title/menu-guard helpers in `src/utils/userscript-helpers.ts` + VM parity assertions & unit tests in `src/utils/userscript-helpers.test.ts` (`43/43` passing)
  - [x] Fix `initMenuIntegration` & `menuPollTimer` in `youtube-feed-summariser.user.js` to ignore script controls and strictly exclude sidebar/guide renderers (`ytd-guide-renderer`, `ytd-mini-guide-renderer`, `tp-yt-app-drawer`, `#guide`)
  - [x] Fix `FEED_CARD_SELECTOR` nested card canonicalization, truthful initial `_currentTitleMode` (`original`/`dearrow` until AI title applied), immediate viewport scan (`isCardNearViewport`), `display: contents` IntersectionObserver fallback, and Polymer-safe `getTitleCleanText`/`getTitleTextTarget`/`setCardTitleText`
  - [x] Enhance `fetchTranscriptRouteA` with `transcriptCueRenderer` support + zero-iframe `captionTracks` (`fmt=json3` / XML) + InnerTube `player` (`ANDROID` client) fallback A3
  - [x] Implement `buildAltTitleModelCandidates` (`src/utils/userscript-helpers.ts` + AUD-08 parity) & `checkModelsForKey` in-flight deduplication so `generateAlternativeTitle` skips unavailable models and walks down `fallbackLadder` on any non-auth model error (403/404/429/500/503/timeout/thought-only), ignoring `thought` parts
  - [x] Add unbypassable `injectMenuItem` & `menuPollTimer` guards blocking `a[href]` links and guide sidebar elements, plus `yt-navigate-finish`/`yt-page-data-updated` SPA rescanning and shorter doubled-title collapse
  - [x] Add Check 50 + Check 51 Playwright E2E regression tests (`test_menu_and_ui.js`) & Test 44 (`userscript-helpers.test.ts`)
  - [x] Fix `NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Write permission denied.` across React simulator (`src/utils/clipboard.ts`, `src/App.tsx`) and userscript (`copyTextSafely` / `fallbackExecCopy` in `youtube-feed-summariser.user.js`), plus `src/utils/clipboard.test.ts` (5 tests)
  - [x] Fix alt-title generation & button injection on modern & classic YouTube feed cards: mount `.yt-alt-title-btn`/`.yt-channel-rule-btn` outside `<a>` via `getCardButtonMountAnchor`, extract channels from `yt-content-metadata-view-model`, prevent marking unhydrated Polymer skeletons processed prematurely, add `IOS` + `shortDescription` + `file_data` (`MEDIA_RESOLUTION_LOW`) + `thinkingConfig: { thinkingBudget: 0 }` fallbacks, prioritize `lastKeyId`, surface visible toast/ARIA failure feedback on manual click, bypass `altTitleLimiter` for zero-network offline sources, and add `fetchWithTimeout` in `fetchTranscriptRouteA` (`Test 45` + `Check 52`)
  - [x] Implement Material You (M3) UI design system with 3-state `System` / `Light` / `Dark` mode toggle across both `/youtube-feed-summariser.user.js` (Shadow DOM tokens, `:host(.yt-ui-light)` / `:host(.yt-ui-dark)`, Key Manager `.yt-app-theme-group`, cross-tab `GM_addValueChangeListener`, tampermonkey menu cycle, live `prefers-color-scheme` listener) and React Simulator (`/index.html` anti-FOUC script, `@custom-variant dark`, `--md-sys-color-*` tonal palette, `[data-testid="app-theme-toggle"]` across Simulator & Settings/Docs tabs, fixed `ReadabilityModal` light/sepia/dark contrast, `Test 46`, `Check 53`, & `Suite 5 Check 8`)
  - [x] Implement 6 coordinated UX/formatting/navigation features across both `/youtube-feed-summariser.user.js` & React Simulator (`src/App.tsx`, `src/components/*`, `src/utils/userscript-helpers.ts`):
    1. Manual AI title generation & toggle on exempt music videos via SVG-only `.yt-music-exempt-icon` click (`textContent === ''`), leaving music cards unreplaced at page load.
    2. Sponsor & self-promotion exclusion (`SPONSOR_OR_PROMO_REGEX`, `stripSponsorAndPromoFromText`) across offline extractors and Gemini alt-title prompts.
    3. Summary Window titlebar `.yt-win-settings-btn` next to `.yt-win-readability-btn`, opening Settings & Appearance modal (`System`/`Light`/`Dark` theme, UI font/size/density, Generated Text font/size/line-height/paragraph spacing/`richFormatting` plain-text toggle, Reset Formatting Defaults, History tab visibility).
    4. Follow-up question model `<select class="... yt-composer-model-select">` beside `.yt-composer-textarea` with automatic fallback ladder (`buildFollowUpModelCandidates`) + visible downgrade notice.
    5. Movable + 8-dir resizable & theme/UI-formatting-synced Previous Summaries window (`.yt-history-dialog-box`) with `.yt-history-settings-btn` next to Close, centered cleanly below sticky topbar.
    6. Top-left launcher button (`.yt-topbar-launcher-btn[data-ytais-launcher="true"]`) next to logo opening a movable, 8-dir resizable, theme-synced Quick Menu (`.yt-quick-menu-box`) for Previous Summaries & Settings.
  - [x] Upgrade Settings into a movable, 8-direction resizable Control Center (`attachFloatingWindowInteractions` / `SettingsModal.tsx` with `yt_settings_bounds` & `lastSettingsBounds` persistence, category filter pills, and `Reset All`) containing all Video Summaries, 3-way Video Title Generation (`on`/`manual`/`off` + channel rules), Podcast Generation (hosts, synthesis engine, rate), Transcript & TTS (`followAlong`, `skipSilence`, `voiceInputEngine`, voice/rate/pitch/volume), History & Dock (`showHistoryBottomTab` toggle, `home_only` vs `all_pages` scope, dock visibility condition), Appearance & Typography, and API Keys & Custom Models across both `/youtube-feed-summariser.user.js` and the React Simulator (`Check 55` + `Suite 5 Section 10`).
  - [x] Fix missing Fact-Check & missing Images/Video Frames below/inside summaries across both `/youtube-feed-summariser.user.js` and the React Simulator (`src/utils/userscript-helpers.ts`, `SimulatorTypes.ts`, `FloatingSummaryWindow.tsx`, `ReadabilityModal.tsx`, `src/App.tsx`):
    1. Enabled `fc: true` & `src: true` by default in `DEFAULT_SUMMARY_OPTS`; added multi-state Fact-Check UI (`loading`, `done` with claims/sources/re-run, `error` with Retry & Key Manager actions, `pending`, and `off` with one-click `"Enable & Run Fact-Check"`) + live `factStatus` / `factError` tracking + `buildFactCheckModelCandidates` fallback ladder (including ungrounded fallback when search grounding tool is blocked).
    2. Added AUD-08 pure helpers (`parseStoryboardSpecString`, `computeStoryboardFrameInfo`, `getVideoThumbnailFallbackUrl`, `parseVisualMarkerToken`, `parseVisualMarkerFromLine`, `tokenizeSummaryTextWithVisuals`, `ensureFallbackVisualMarkers`) + guaranteed 16:9 `i.ytimg.com/vi/.../hq*.jpg` frame previews (upgrading smoothly to storyboard sprites), Wikimedia Commons fallback schematic SVGs + search links on null/offline API, and Readability Mode preservation (`Test 51`, `Check 56`, `Suite 5 Section 11`).
  - [x] Implement 4 coordinated UX & Podcast features across `/src/utils/userscript-helpers.ts`, `/youtube-feed-summariser.user.js`, and React Simulator (`src/App.tsx`, `SimulatorTypes.ts`, `SettingsModal.tsx`, `FloatingSummaryWindow.tsx`, `PodcastStudioPanel.tsx`):
    1. Summary Window header `.yt-win-title-switch-btn` right next to `.yt-win-title-link` toggling between AI-generated descriptive title and original video title (generating on demand if uncached).
    2. `autoFactCheck` setting (default `true`) in Settings (`[data-setting="default-opt-autofc"]` / `.yt-opt-autofc-checkbox`) controlling automatic post-summary Fact-Check execution, plus automatic Fact-Check ladder step-down with `.yt-fact-fallback-note` / `[data-testid="sim-factcheck-unavailable"]`.
    3. Follow-up question editing (`.yt-turn-edit-btn` -> `.yt-turn-edit-input` / `.yt-turn-edit-ta`) & regeneration (`.yt-turn-regen-btn`) with the currently selected follow-up model (and ladder fallback), preserving full version history navigated via Gemini-style `< 1 / N >` arrows (`.yt-turn-ver-pager`).
    4. Podcast overhaul: concurrent lookahead TTS pre-synthesis (`prefetchUpcomingPodcastTurns`) eliminating inter-speaker pauses; `sanitizeSpokenTurnText` + single-speaker TTS payload without `"${speaker}: "` self-names or host self-introductions; and progressive multi-part script generation (`splitSummaryIntoPodcastSections`, `buildPodcastScriptPartPrompt`, `buildPodcastContinuationPrompt`, `appendPodcastEpisodeTurns`, `[data-testid="podcast-gen-badge"]`) covering full summaries (`Test 52–53`, `Check 57`, `Suite 5 Section 12`).

  - [x] Implement Minimized Podcast/TTS Playback, UI Accent Color Wheel & 12 Pastel Presets, and Freshness Audit / Cleanup across `/youtube-feed-summariser.user.js` (`v2.12.0`), `/src/utils/userscript-helpers.ts`, and React Simulator (`src/App.tsx`, `SettingsModal.tsx`, `HistoryDock.tsx`, `TtsWaveformVisualizer.tsx`):
    1. Added `continue_audio_on_minimize` / `yt_continue_audio_on_minimize` (default `true`) synced between Settings Podcast and Transcript & TTS sections, cross-tab GM sync, dock playback status badge (`Podcast Playing`/`Paused`, `TTS Playing`/`Paused`), and dock Pause/Resume/Stop mini-controls (`data-dock-video-id`, `e.stopPropagation()`), while window close always halts audio and headless silent `speechSynthesis` errors/premature `onend` fallback cleanly to timed turn cadence.
    2. Added interactive Color Wheel + 12 accessible pastel accent presets + native picker + hex input + Reset Accent computing WCAG AA dark/light Material You tonal CSS tokens (`--md-sys-color-primary`, `--md-sys-color-primary-container`, `--yt-accent-tint`, etc.) applied across Shadow DOM, top-left launcher, Simulator CSS custom properties, and TTS canvas waveform.
    3. Freshness & optimization review: aligned `v2.11.0` -> `v2.12.0` across userscript/UI/test harness, unified `SummaryWindow` drag/resize/keyboard interactions onto `attachFloatingWindowInteractions()` removing dead `SummaryWindow.prototype.moveWindow`, pruned dead `.yt-md-h3`/`.yt-md-h4` & duplicate compact TTS CSS rules, and routed static `#3ea6ff` rules through CSS custom properties.

## 3. Verification Contracts
Before closing any implementation task, all applicable checks below MUST pass **after the final code edit**:
1. **Userscript Syntax**: `node --check youtube-feed-summariser.user.js`
2. **Unit & Zero-Drift Parity (59 tests: 54 in userscript-helpers + 5 in clipboard)**: `npx --yes tsx --test src/utils/clipboard.test.ts src/utils/userscript-helpers.test.ts`
3. **Full E2E Playwright Suite (814 checks across 5 suites)**: `node run_all_tests.js`
4. **TypeScript Lint & Production Build**: `npm run lint && npm run build` (or `lint_applet` + `compile_applet`)
5. **Live Browser Check (`playwright-cli` on `http://localhost:3000`)**: Restart dev server when React/UI code changed, verify desktop (`1440x900`) & responsive (`390x844`) views with 0 console/runtime errors, and close browser (`playwright-cli close`).
6. **Pre-Session / Post-Commit Memory Sync**: Run `python3 update_memory.py` when `.git` commits are present; update `PROJECT_MEMORY.md` tightly at major milestones.
7. **Prompt-End Backup Integrity**: `npm run backup -- --label="prompt-end" --stage="<stageId>" && npm run backup:verify`

## 4. Key Decisions & Snapshot Baseline
- **Latest Verified Baseline**: `59/59` unit & AUD-08 VM parity tests (`clipboard.test.ts` + `userscript-helpers.test.ts`), `814/814` Playwright E2E acceptance checks across 5 suites (`node run_all_tests.js` including Check 58 & Suite 5 Section 13), `node --check youtube-feed-summariser.user.js` clean, `tsc --noEmit` (`lint_applet`) & `vite build` (`compile_applet`) clean, and live `playwright-cli` Chromium visual verification at `1440x900` across Rose Pastel (`#FDA4AF`) Dark Settings accent picker + minimized dock Podcast Playing badge/mini-controls (`0` console errors/warnings).
- **Git Status Note**: Current workspace does not have a `.git` directory yet (`git` v2+ is installed on PATH; Python 3.11.2 is available). `update_memory.py` gracefully exits with `[!] No git history or changes found to update.` until `git init` + commits exist, and can be wired to `.git/hooks/pre-commit` or `.git/hooks/post-commit` once a repo is initialized.

## Recent Progress & Git Activity

_No git commits recorded yet in this sandbox (`git` not initialized). Run `python3 update_memory.py` after commits to sync recent diffs here._



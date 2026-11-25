# Comprehensive Multi-Team Adversarial Analysis, Progress Retrospective, Fix/Feature Research & Updated Roadmap

- **Audit Stage ID**: `stage-1b-multi-team-audit-and-roadmap`
- **Audit Date**: `2026-11-16T04:48:00-08:00`
- **Active Workspace Scale**: **23,037 LOC** across 13 primary code, test, and harness modules:
  - `youtube-feed-summariser.user.js`: 12,143 lines (production Tampermonkey userscript)
  - `src/App.tsx`: 4,233 lines (interactive React/Vite simulator & testbed)
  - `src/utils/userscript-helpers.ts`: 933 lines (extracted pure domain & math/TTS/window/title helpers)
  - `src/utils/userscript-helpers.test.ts`: 557 lines (21 deterministic `node:test` unit suites)
  - `shim.js` + `harness.js`: 1,054 lines (Tampermonkey GM storage + Playwright mock feed harness)
  - `test_menu_and_ui.js`, `test_cache_and_tabs.js`, `test_pipeline_and_api.js`, `test_ask_and_images.js`: 3,526 lines (371 end-to-end assertions across 4 Chromium suites)
  - `scripts/{sandbox-backup.mjs,harness-memory.mjs,adversarial-gate.mjs}`: 591 lines (backup & adversarial gate infrastructure)

---

## 1. Adversarial Agent Team Structure & Charters

Four specialized adversarial teams examined the entire codebase, test infrastructure, runtime Chromium screenshots, storage ledgers, and roadmap from independent conflict-seeking angles:

| Team | Primary Adversarial Role | Challenger Role | Charter & Attack Surface |
|---|---|---|---|
| **Team Alpha** | `security-concurrency-skeptic` (Red-Team Lead) | `storage-csp-auditor` (Storage & CSP Adversary) | Cross-tab races, Trusted Types / CSP DOM sinks, `GM_setValue` quota/growth bounds, failover termination bounds, prompt-end backup integrity |
| **Team Beta** | `reliability-perf-auditor` (Reliability Lead) | `spa-observer-profiler` (SPA DOM & Telemetry Profiler) | Memory/listener leaks, `MutationObserver` CPU thrash on YouTube watch/feed pages, SPA DOM node recycling, heartbeat write amplification, test rigor |
| **Team Gamma** | `ux-spec-critic` (UX Spec Critic) | `a11y-parity-skeptic` (A11y & Simulator Parity Challenger) | Multi-window drag/resize edge ergonomics, blocking browser dialogs (`alert`), simulator multi-window isolation leaks, DeArrow/Shorts edge cases, keyboard nav & contrast |
| **Team Delta** | `architecture-rnd-strategist` (Decomposition Architect) | `feature-rnd-challenger` (Feature & Verification R&D) | Monolith file bloat & logic drift (`userscript` vs `src/utils` vs `App.tsx`), zero-drift build pipeline, high-ROI fixes, and prioritized next-gen features |

---

## 2. Retrospective: Progress So Far & What Has Worked

### 2.1 Delivered Capabilities (Verified in Baseline & Hardening Stages)
1. **YouTube Ask Automatic Model-Ladder Failover**:
   - Implemented `resolveNextModelDown` / `resolveAskFallbackPlan` (`src/utils/userscript-helpers.ts:31-87`) and `produce()` failover (`youtube-feed-summariser.user.js:3352-3520`).
   - When YouTube Ask fails (UI timeout, unavailable session, or rate block) and an API key is present, execution transparently advances to the top eligible model on `CONFIG.fallbackLadder` (`gemini-3.1-pro-preview` → `gemini-3.8-flash` → ... → `gemini-flash-latest`) while appending non-destructive diagnostic fallback notes (`⚠ YouTube Ask failed (...). Automatically proceeding with <model>.`).
2. **Configurable Bottom-Right History Dock Visibility**:
   - Implemented `normalizeHistoryTabVisibility` & `shouldShowHistoryTab` supporting `'always'`, `'with_tabs'`, and `'never'`, wired into both the userscript Shadow DOM dock + Tampermonkey menu commands (`youtube-feed-summariser.user.js:1528-1560`) and the simulator settings controls (`src/App.tsx:368, 1889`).
3. **Persistent Response Ratings (Thumbs Up / Down + Notes + JSON Export)**:
   - Added `buildResponseRatingKey`, `getResponseRating`, and `setResponseRating` supporting toggle-off and rating switches while preserving user notes across standard summaries, follow-up turns, Readability view, and JSON export payloads (`test_menu_and_ui.js` Check 38).
4. **Multi-Window Floating Summary Containers & Adaptive Responsive Layouts**:
   - Migrated from single modal behavior to multi-window z-index-focused containers with cascade offsets (`getNextCascadeBounds`), edge/corner drag resize (`clampWindowBounds`), per-window `Escape` minimization, and `ResizeObserver`-driven size tiers (`compact <540px`, `medium 540–779px`, `wide >=780px`, `short <460px`).
   - Verified in live Chromium across both wide (`920px`) and compact (`447px`) tiers (`r2-tts-wide.png`, `r2-tts-compact.png`) with zero horizontal clipping after resolving the `.yt-tts-control-bar` wrapping overflow.
5. **Scientific Symbol & LaTeX Math Formatting vs. Currency Protection**:
   - `formatMathSymbolsInText()` cleanly renders `$100^\circ\text{C}$` → `100°C`, `$87^\circ\text{C}$` → `87°C`, `\(...\)` expressions containing inner parentheses, and `$$...$$` display math across standard summary DOM, Readability mode, Transcript view, exports, and TTS speech cleanup (`cleanTextForSpeech`) while preserving financial ranges like `"$100 to $200"`.
6. **Auto-Title Replacement, DeArrow Coexistence & Settings Toggle**:
   - Enabled **by default (`true`)**, persisted in `GM_setValue('alt_titles_enabled')` / `localStorage('yt_alt_titles_enabled')`, synced live across tabs (`GM_addValueChangeListener`), and surfaced in both the userscript `Advanced ▾` panel and Simulator top/window settings.
   - Isolated DeArrow detection strictly per-card (`isDeArrowPresent()`), preserved inner `<yt-formatted-string>` wrappers (`getTitleTextTarget()`), deduplicated concurrent generations (`altTitleInFlight`), and added post-`await` guards preventing late/in-flight DeArrow title overwrites.
7. **Harness Memory, Adversarial Gate & Prompt-End Backup Infrastructure**:
   - Built `/sandbox-storage/{backups,memory,reviews}/` with `scripts/sandbox-backup.mjs` (refusing `--interval`/`--cron`/`--watch` flags and enforcing SHA-256 + `tar -tzf` verification), `scripts/harness-memory.mjs`, and `scripts/adversarial-gate.mjs` enforcing unanimous 3-role approval before advancing stages.

### 2.2 What Worked Exceptionally Well
- **Pure-Helper Extraction + `tsx --test`**: Decoupling formatting, fallback planning, waveform DSP math, rating toggles, window clamping, and title resolution into `src/utils/userscript-helpers.ts` yielded sub-second deterministic unit verification (21 tests in ~529ms).
- **Playwright Multi-Context Harness (`harness.js` + `shim.js`)**: Simulating Tampermonkey `GM_*` cross-tab pings, mock YouTube feeds, InnerTube transcript routes, DeArrow DOM mutations, and async race timings caught real browser regressions that static compilation could never catch (371/371 checks passing).
- **Adversarial Verification Loops (Screenshots + DOM Probes)**: Visually inspecting live Chromium renders caught the `adaptive.collapseHeaderActions` property typo (Stage 0) and the wide-window `.yt-tts-control-bar` overflow + vertical pill stacking (Stage 1A).

---

## 3. Issues Encountered (Historical Resolved & Newly Discovered Open Findings)

### 3.1 Historical Issues Encountered & Resolved (Stages 0 – 1A)
- **Cross-Tab Window Close Resurrection (`DEC-001`, `DEC-002`)**: Closing a window in Tab A could be resurrected by Tab B's `syncFromStorage()` touching LRU cache indices or firing a late `minimize()` commit; resolved with `this.closed`, `minimize(skipCommit)`, `skipTouch=true`, and JSON equality diffing in `shim.js`.
- **Global DeArrow Contamination (`REL-1A-01`)**: `isDeArrowPresent()` queried document-wide `#dearrow-styles`, `window.dearrow`, and `.cbThumbnailButtonContainer`, silently suppressing AI title replacement on every regular feed card whenever DeArrow was installed.
- **Video ID Truncation (`REL-1A-02`)**: `getCardVideoId()` restricted IDs to `{8,15}`, truncating synthetic or extended IDs (`D_late_da_after_ai`) during late DeArrow sync.
- **Template Literal Backslash Stripping (`UX-01`)**: JS string escaping inside `src/App.tsx` stripped `\c` and turned `\t` in `\text{C}` into a literal TAB until double-escaped (`\\\\circ\\\\text{C}`).
- **Mouse Drag/Resize Closure Leak (`DEC-005`)**: Repeated drag/resize cycles left stale closures inside `_interactionCleanup` until explicit `splice()` cleanup on `mouseup`.
- **Wide TTS Bar Right-Edge Clipping (`UX-1A-01`)**: Missing `flex-wrap` on the wide TTS control container caused `.yt-tts-speed-btns` to crush vertically and clip `Skip Silence` / shortcut pills past the window border.

### 3.2 Newly Discovered Open Issues (Active Codebase Audit)

| ID | Team | Severity | Location | Issue Description & Blast Radius |
|---|---|---|---|---|
| **AUD-01** | Alpha | **HIGH** | `youtube-feed-summariser.user.js:1497-1526, 1577-1600, 1681-1689` | **Unbounded Persistent `GM_setValue` Key Growth & `cache_index` Bypass**: While `altTitlesMemoryCache` caps at 500 in RAM, `GM_setValue('alt_title:' + videoId)` is never evicted from persistent extension storage. With auto-title ON by default, scrolling feeds adds hundreds of unpruned keys weekly, degrading `GM_listValues()` scans. Similarly, `draft:*` and `response_ratings` grow unboundedly, and `touchCacheIndex` (`1681-1688`) shifts oldest open-window entries without pruning `index` when `openWins.size > 0`, leaving `cache_index` above `CONFIG.cacheMax`. |
| **AUD-02** | Beta | **HIGH** | `youtube-feed-summariser.user.js:9129-9140` | **Whole-Body `characterData: true` MutationObserver CPU Thrash**: `observeFeedCards()` attaches `characterData: true, subtree: true` directly on `document.body`. Every player time-tick (`0:12 / 14:32`), hover preview, or live-chat tick triggers the 200ms debounced `scan()`, running `document.querySelectorAll(6 selectors)` and calling `syncDeArrowState()` across every card on the page continuously during playback. |
| **AUD-03** | Alpha | **HIGH** | `youtube-feed-summariser.user.js:6078` | **Trusted Types CSP Sink Violation (`this.ttsRateBtn.innerHTML = ''`)**: YouTube enforces `require-trusted-types-for 'script'`. Clearing `ttsRateBtn` with `.innerHTML = ''` throws `TypeError: Failed to set the 'innerHTML' property on 'Element': This document requires 'TrustedHTML' assignment` when rate badges re-render on live YouTube DOMs without a TrustedHTML bypass policy. Must use `clearEl(this.ttsRateBtn)`. |
| **AUD-04** | Beta | **MEDIUM** | `youtube-feed-summariser.user.js:8745, 8867, 9114` | **YouTube SPA Recycled Card Blindness & Shorts URL Gap**: `processFeedCard()` returns early via `processedFeedCards.has(card)` without verifying `card.dataset.ytaisVideoId === getCardVideoId(card)`. When YouTube's Polymer/SPA engine recycles a `ytd-rich-item-renderer` node on Home/Search navigation, stale `_originalTitle` / `_aiTitle` metadata persists onto the new video. Additionally, `ytd-reel-item-renderer` is listed in `cardSelectors` (`9114`), yet `getCardVideoId()` only matches `[?&]v=...` and ignores `/shorts/<id>` URLs. |
| **AUD-05** | Alpha | **MEDIUM** | `youtube-feed-summariser.user.js:8710-8723` | **Clickbait Self-Locking in Offline/Empty-Transcript Alt-Title Fallback**: In `generateAlternativeTitle()`, when no API key is present and `cleanLines.length === 0`, `generated` falls back to `originalTitle` (`8711`) and immediately executes `setCachedAltTitle(videoId, generated)` (`8721`). This permanently caches the original clickbait title as the cached "AI alternative title", blocking future regeneration once transcripts load. |
| **AUD-06** | Gamma | **MEDIUM** | `youtube-feed-summariser.user.js:4286-4346` | **Incomplete Resize Handle Cleanup & Missing Top/Keyboard Resizing**: The 5 resize handles call `handle.addEventListener('mousedown', onResizeDown)` (`4344`) without pushing removals to `_interactionCleanup`. Top (`n`, `nw`, `ne`) resize edges are missing, and `role="separator"` handles lack keyboard arrow resize/move support (`ArrowLeft/Right/Up/Down`, `Shift` accelerated step). |
| **AUD-07** | Beta / Gamma | **MEDIUM** | `youtube-feed-summariser.user.js:11952-12023` | **Blocking `window.alert()` Calls & 1-Second Heartbeat Write Amplification**: `registerMenuCommands()` calls blocking `alert(...)` (`11994, 11999, 12021`). Separately, the global heartbeat `setInterval(..., 1000)` calls `win.commit(true)` every 1,000ms for active jobs despite `CONFIG.heartbeatMs` being `5000ms`, causing 5x unnecessary `GM_setValue` serializations. |
| **AUD-08** | Delta | **MEDIUM** | `youtube-feed-summariser.user.js` (12.1k), `src/App.tsx` (4.2k) | **Monolith Scale & Dual-Codebase Logic Drift + Simulator Multi-Window State Bleed**: Pure logic (`formatMathSymbolsInText`, `cleanTextForSpeech`, `resolveNextModelDown`, `sanitizeGeneratedAltTitle`, adaptive tiers) is copy-maintained in both files; a fix in one file risks silent regression in the other. Inside `src/App.tsx`, `ttsToast` (`2156`) and `compactOptionsExpanded` are not isolated per-window / persisted cleanly. |
| **AUD-09** | Beta / Delta | **LOW** | `test_ask_and_images.js`, `src/App.tsx` | **Verification Blind Spots**: Simulator React UI lacks an automated CI regression spec inside `run_all_tests.js` (currently verified manually via `playwright-cli`), and `test_ask_and_images.js` tests Ask happy paths + image pipeline but lacks simulated HTTP 429/timeout fault-injection verifying full Ask -> Gemini ladder exhaustion notes in live E2E. |

---

## 4. Technical Research: Fixes, Architecture Improvements & New Features

### 4.1 Targeted Fixes & Engineering Patterns (Immediate Stages 1 – 2)
1. **Trusted Types Audit & Zero-`innerHTML` Guarantee (`AUD-03`)**:
   - Replace `this.ttsRateBtn.innerHTML = ''` (`6078`) with `clearEl(this.ttsRateBtn)` and add an automated CI grep guard failing builds if `.innerHTML =` or `.insertAdjacentHTML(` is introduced inside `youtube-feed-summariser.user.js`.
2. **Bounded Persistent LRU for `alt_title_index` (`AUD-01`)**:
   - Maintain a compact `{ [videoId]: timestamp }` object under `GM_setValue('alt_title_index', {})` capped at `MAX_ALT_TITLES_CACHE = 500` entries; evict oldest `alt_title:<id>` keys from persistent GM storage atomically alongside RAM eviction. Enforce similar cap (e.g. 200) on `draft:*` and `response_ratings` pruning when closed/expired. Fix `touchCacheIndex` to skip open windows cleanly without leaving evicted-attempt keys orphaned past cap boundaries where evictable keys remain.
3. **MutationObserver Target Filtering & SPA Recycled-Card Re-Sync (`AUD-02`, `AUD-04`)**:
   - Inside `MutationObserver` callback (`9129`), inspect `mutations`: ignore `characterData` mutations inside video player telemetry (`ytp-time-current`, `ytd-player`, `#movie_player`) and chat frames unless matching feed card titles or DeArrow markers (`cbTitleButtonContainer`, `data-dearrow`, `data-dearrow-title`).
   - Replace `if (processedFeedCards.has(card)) return;` with `if (processedFeedCards.has(card) && card.dataset.ytaisVideoId === videoId) return;`, resetting cached `_originalTitle`/`_aiTitle`/`_dearrowTitle` cleanly if YouTube recycles a card DOM node for a new `videoId`.
   - Extend `getCardVideoId()` to match both `[?&]v=([a-zA-Z0-9_-]{8,32})` and `/shorts/([a-zA-Z0-9_-]{8,32})`.
4. **Prevent Clickbait Self-Caching & Throttle Heartbeat Writes (`AUD-05`, `AUD-07`)**:
   - Never persist `setCachedAltTitle()` when `generated === originalTitle` or when fallback ran without a valid transcript extraction.
   - Replace `alert(...)` menu notifications with non-blocking `showGlobalToast(msg)` inside `shadowRoot`.
   - Gate heartbeat `win.commit(true)` to `now - (win._lastHbWrite || 0) >= CONFIG.heartbeatMs` (every 5s instead of 1s).
5. **Simulator Per-Window Isolation (`AUD-08`)**:
   - Scope `ttsToast` as `Record<string, { message: string; visible: boolean }>` keyed by `videoId`, persist `compactOptionsExpanded` in `localStorage`, and register `mousedown` resize handle cleanup callbacks into `_interactionCleanup`.

### 4.2 High-Value Structural Improvements (Stage 4)
1. **Zero-Drift Shared Core (`src/core/` → Bundled Banner Header)**:
   - Move shared pure TypeScript modules (`math-format.ts`, `tts-clean.ts`, `model-ladder.ts`, `window-layout.ts`, `alt-title.ts`, `ratings.ts`) out of duplicate inline blocks; use Vite/esbuild build verification + a parity test script ensuring compiled pure functions inside `youtube-feed-summariser.user.js` stay mathematically identical to `src/utils/userscript-helpers.ts`.
2. **Modular React UI Decomposition (`src/components/`)**:
   - Split 4,233-line `src/App.tsx` into cohesive modules: `FeedSimulatorGrid.tsx`, `FloatingSummaryWindow.tsx`, `TtsControlBar.tsx`, `ReadabilityModal.tsx`, `SettingsControlPanel.tsx`, and `HistoryDock.tsx` — making visual diffs, TypeScript compilation, and Playwright selectors dramatically cleaner.
3. **Full Adaptive HTTP Retry & Circuit Breaker**:
   - Add decorrelated exponential jitter + per-model cooldown tracking (`429 Retry-After` header respected per model key pair) so batch feed card alt-title generation never triggers cascading quota exhaustion against `gemini-3.8-flash`.

### 4.3 Researched New Features (Prioritized Roadmap Candidates)

| Feature ID | Title | Problem Solved & User Value | Complexity | Target Stage |
|---|---|---|---|---|
| **FEAT-01** | **Interactive Timestamp Jump-Sync & Active Cue Auto-Scroll** | Clicking any `[MM:SS]` in Summary or Transcript seeks inline/tab video cleanly; during TTS playback, matching transcript lines smoothly auto-scroll into view with a subtle Follow-Along lock toggle. | Medium | Stage 3 / 4 |
| **FEAT-02** | **Per-Channel Auto-Title Rules & Domain Allow/Block Lists** | Lets users exempt trusted educational/music channels (beyond heuristic music detection) or force AI titles on specific clickbait-heavy channels right from the card icon tooltip menu. | Low-Med | Stage 4 |
| **FEAT-03** | **Summary Persona & Output Presets** | One-click summary templates (`Executive Brief`, `Deep Technical / Code`, `Study Flashcards & Quiz`, `Chronological Timeline`) alongside Fast/Deep processing modes. | Low-Med | Stage 4 |
| **FEAT-04** | **Chapter-Aware Long-Video Synthesis (>45 min Chunking)** | Splits multi-hour podcasts/lectures by YouTube description chapters (or 20-minute windows) so long transcripts never lose mid-video nuance or exceed token budgets. | Medium | Stage 4 |
| **FEAT-05** | **Keyboard Window Management & ARIA Live Regions** | Arrow-key move/resize on focused `.yt-win-drag-grip` and `[role="separator"]` handles, plus `aria-live="polite"` announcements for minimize/restore, ratings, and model fallback events. | Low-Med | Stage 3 |
| **FEAT-06** | **Self-Contained Markdown, Obsidian & Ratings Bundle Export + Backup Diffing** | Exports clean Markdown (`.md`) with LaTeX→Unicode math text, Q&A follow-ups, timestamps, and thumbs-up/down notes; adds content-level diff & selective file restore to `scripts/sandbox-backup.mjs`. | Low-Med | Stage 5 |

---

## 5. Updated Stage-Gated Roadmap Summary

Every stage below enforces independent unanimous consensus across all adversarial roles + live verification + prompt-end verified backup:

1. **Stage 0 (`stage-0-baseline-examination`)** — *Completed (`consensusReached: true`)*: Baseline core implementation, unit + E2E setup, initial adversarial fixes.
2. **Stage 1A (`stage-1a-autotitle-dearrow-hardening`)** — *Completed (`consensusReached: true`)*: Auto-title replacement default ON, DeArrow card-level isolation, Settings sync/reversion, wide TTS bar layout fix, 371/371 E2E + 21/21 unit tests.
3. **Stage 1B (`stage-1b-multi-team-audit-and-roadmap`)** — *Completed (`consensusRequired: true`)*: Multi-team adversarial retrospective, 9 open codebase findings (`AUD-01`–`AUD-09`), fix/feature research, and updated Stages 1–5 roadmap.
4. **Stage 1 (`stage-1-ask-pipeline-resilience`)** — *Next Active Stage*: Simulator per-window scoped `ttsToast` & persisted `compactOptionsExpanded`, Ask 429/timeout fault-injection E2E coverage in `test_ask_and_images.js`, plus heartbeat throttle (`5s`) & clickbait self-caching fix (`AUD-05`, `AUD-07`, `AUD-09`).
5. **Stage 2 (`stage-2-dom-spa-storage-hardening`)** — *Planned*: Trusted Types `clearEl()` cleanup (`AUD-03`), persistent bounded `alt_title_index` LRU (`AUD-01`), scoped watch-page MutationObserver filtering (`AUD-02`), SPA recycled-card re-sync + `/shorts/` support (`AUD-04`), and batch alt-title rate-limit circuit breaker.
6. **Stage 3 (`stage-3-accessibility-keyboard-nav`)** — *Planned*: Keyboard arrow move/resize on grip & separators (`AUD-06`), north resize handles, replace `alert()` with non-blocking shadow toasts, ARIA live-region announcements, mobile `<400px` stress tests, and automated Simulator Playwright regression spec inside `run_all_tests.js`.
7. **Stage 4 (`stage-4-architecture-and-ux-features`)** — *Planned*: Decompose `src/App.tsx` into modular `src/components/`, eliminate userscript/helper drift via shared build parity check (`AUD-08`), and deliver `FEAT-01` (Timestamp Jump-Sync & Cue Auto-Scroll), `FEAT-02` (Per-Channel Auto-Title Rules), and `FEAT-03` (Summary Persona Presets).
8. **Stage 5 (`stage-5-offline-export-bundle`)** — *Planned*: Deliver `FEAT-04` (Chapter-aware long-video chunking), `FEAT-06` (Markdown/Obsidian + ratings bundle export), and content-level backup diffing + selective restore inside `scripts/sandbox-backup.mjs`.

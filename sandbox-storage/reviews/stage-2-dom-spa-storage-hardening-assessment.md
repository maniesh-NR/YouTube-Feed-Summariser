# Stage 2 Adversarial Mixture-of-Experts Assessment

**Stage ID:** `stage-2-dom-spa-storage-hardening`  
**Assessed At:** 2026-11-16T14:00:00Z  
**Decision:** UNANIMOUS APPROVAL (`3/3` independent adversarial roles; `0` unresolved `BLOCKER`/`HIGH` findings)

---

## 1. Stage 2 Implementation Summary (Mixture-of-Experts Execution)
Executed across pure domain helpers, userscript runtime hardening, E2E test suites, and live Chromium visual validation:

1. **Trusted Types CSP Safety (`AUD-03`)**:
   - Replaced the remaining `this.ttsRateBtn.innerHTML = ''` DOM sink with `clearEl(this.ttsRateBtn)` (`youtube-feed-summariser.user.js`).
   - Added automated CI test #28 in `src/utils/userscript-helpers.test.ts` guaranteeing **zero** `.innerHTML =`, `.outerHTML =`, `insertAdjacentHTML(`, or `document.write(` sinks anywhere in the userscript.
2. **Bounded Persistent GM Storage LRU (`AUD-01`)**:
   - Enforced `alt_title_index` (`500` entries), `draft_index` (`200` entries), and `response_ratings` (`500` entries) LRU pruning in persistent `GM_setValue` / `GM_deleteValue` storage.
   - Fixed `touchCacheIndex()` so protected open windows no longer short-circuit eviction of older non-open cache entries past `CONFIG.cacheMax`.
   - Verified 505-item `alt_title:*` & 205-item `draft:*` boundary eviction in Suite 2 (`test_cache_and_tabs.js`).
3. **YouTube Watch-Page & Player `MutationObserver` Noise Filtering (`AUD-02`)**:
   - Added `isFeedMutationRelevant()` filtering out `#movie_player`, `ytd-player`, `.ytp-time-display`, `yt-live-chat-app`, and our own badge/echo mutations.
   - Eliminated an observed feedback loop where `updateSwitchButtonUI()` cleared/re-created SVGs unconditionally on every `scan()`, making it idempotent via `dataset.ytaisBtnMode`.
4. **SPA Recycled Feed Card Reset & `/shorts/` Support (`AUD-04`)**:
   - Extended `getCardVideoId()` & menu video ID resolution for `/watch?v=`, `/shorts/<id>`, and `/live/<id>` (`{8,32}`).
   - Added `resetRecycledFeedCardState()` resetting cached properties, `[AI Summary Title]` tooltip attributes, and duplicate toggle buttons whenever a recycled feed card changes `videoId`.
5. **Batch Alt-Title Per-Model Cooldown Circuit Breaker & Decorrelated Jitter**:
   - Added `modelCooldowns` + `computeDecorrelatedJitterDelay()` with automatic secondary-flash failover on HTTP `429`/`503` (verified in Check 43e and unit test #26).

---

## 2. Role-by-Role Verdicts

| Role | Verdict | Key Audit Checks & Fixes |
| :--- | :---: | :--- |
| **Red-Team Security & Concurrency Skeptic** | **APPROVE** | Verified zero unsafe Trusted Types sinks (CI #28), prototype-safe index pruning, bounded GM LRU caps (500/200/500), and live-href menu ID priority. |
| **Systems Reliability & Performance Auditor** | **APPROVE** | Caught & fixed the `updateSwitchButtonUI` -> `MutationObserver` infinite rescan loop; verified 0 scans on player timer & chat ticks (Check 43d) and 429 cooldown routing (Check 43e). |
| **UX, Visual Layout & Spec Critic** | **APPROVE** | Verified `/shorts/` title replacement (Check 43b), SPA recycled card reset (Check 43c), and live Chromium 1.5x TTS rate badge rendering (`r4-stage2-spa-stress.png`, 0 console errors/warnings). |

---

## 3. Forward Roadmap Review (Stages 3–5)
Unanimous endorsement to advance to **`stage-3-accessibility-keyboard-nav`** (`AUD-06` resize cleanup tracking + north/corner handles + arrow-key resizing, `AUD-07` non-blocking Shadow DOM menu toasts replacing `alert()`, `FEAT-05` ARIA live regions, mobile `<400px` stress tests, and CI Simulator regression spec).

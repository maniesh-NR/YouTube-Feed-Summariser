# Stage 1 Adversarial Mixture-of-Experts Assessment

**Stage ID:** `stage-1-ask-pipeline-resilience`  
**Assessed At:** 2026-11-16T13:05:00Z  
**Decision:** UNANIMOUS APPROVAL (`3/3` independent adversarial roles; `0` unresolved `BLOCKER`/`HIGH` findings)

---

## 1. Stage 1 Implementation Summary (Mixture-of-Experts Execution)
Using a coordinated Mixture-of-Experts workflow across Reliability/Fault-Injection, Userscript Runtime Hardening, Simulator State/UX Isolation, and Automated Verification:

1. **Per-Window Scoped TTS Toasts & Persisted Compact Options (`src/App.tsx`)**:
   - Replaced the singleton `ttsToast`/`ttsToastTimer` with per-window `ttsToasts: Record<string, { message: string; visible: boolean }>` and `ttsToastTimersRef` with full timer cleanup inside `closeWindow(id)` and component unmount.
   - Persisted `compactOptionsExpanded` under `localStorage['yt_compact_options_expanded']`, validated by `normalizeCompactOptionsMap()`.
2. **YouTube Ask Multi-Hop & Exhaustion Fault Injection (`test_ask_and_images.js`)**:
   - **Case 13**: Simulates YouTube Ask failure followed by `gemini-3.1-pro-preview` HTTP 429 rate-limit -> automatic cascade down to `gemini-3.8-flash` while retaining both diagnostic audit notes.
   - **Case 14**: Simulates YouTube Ask failure + full Gemini ladder HTTP 429 exhaustion -> verifies clean transition to `status === 'error'` and `busy === false` (zero deadlock).
3. **Clickbait Self-Caching Prevention (`AUD-05`, `youtube-feed-summariser.user.js`)**:
   - Removed the offline `originalTitle` fallback branch when `cleanLines.length === 0`; gated `setCachedAltTitle()` via `generatedFromContent` + `shouldCacheGeneratedAltTitle()` so raw clickbait is never locked into `alt_title:<videoId>`. Verified via Unit Test #22 and Playwright **Check 42f**.
4. **Heartbeat Write-Amplification Throttle (`AUD-07`, `youtube-feed-summariser.user.js`)**:
   - Gated active-job `win.commit(true)` inside the 1s monitor interval using `now - (win._lastHbWriteTs || 0) >= CONFIG.heartbeatMs` (`5000ms` production / `300ms` fast harness).

---

## 2. Role-by-Role Verdicts

| Role | Verdict | Key Audit Checks & Fixes |
| :--- | :---: | :--- |
| **Red-Team Security & Concurrency Skeptic** | **APPROVE** | Identified `__proto__`/`constructor` edge case in `normalizeCompactOptionsMap()` -> patched & unit tested (#23); verified per-window timer teardown on close/unmount and `GM_xmlhttpRequest` restoration in Cases 13–14. |
| **Systems Reliability & Performance Auditor** | **APPROVE** | Verified `AUD-05` clickbait non-caching (`Check 42f`), `AUD-07` `CONFIG.heartbeatMs` write throttling, and Cases 13–14 Ask + 429 cascade/exhaustion termination. |
| **UX, Visual Layout & Spec Critic** | **APPROVE** | Verified live Chromium `r3-stage1-toasts.png` (toast isolated to Window 2, zero bleed into Window 1) and `r3-stage1-compact-persist.png` (`Options ▴` persisted across reload, `0` console warnings/errors). |

---

## 3. Forward Roadmap Review (Stages 2–5)
All three roles reviewed `/sandbox-storage/memory/roadmap.json` and unanimously endorsed advancing to **`stage-2-dom-spa-storage-hardening`** (`AUD-01` Bounded GM LRU, `AUD-02` MutationObserver noise filtering, `AUD-03` zero `innerHTML` Trusted Types CSP safety, `AUD-04` SPA recycled card & `/shorts/` detection, and batch alt-title cooldown jitter).

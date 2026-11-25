# Sandbox Workflow, Harness Memory & Adversarial Consensus Protocol

## 1. Core Workflow Invariants
1. **Prompt-End Sandbox Backups Only (No Fixed Time Intervals)**
   - Sandbox snapshots are **never** scheduled on fixed cron or timer intervals.
   - A full verified sandbox backup (`npm run backup -- --label="<slug>" --stage="<stageId>"`) MUST be the **final execution step** of every plan and every response output to a prompt.
2. **Accessible Persistent Storage (`/sandbox-storage/`)**
   - `/sandbox-storage/backups/` — Verified `.tar.gz` workspace snapshots, SHA-256 integrity digests, `index.json` ledger, and `latest.json`.
   - `/sandbox-storage/memory/` — Harness-like persistent engineering memory (`workflow-policy.json`, `state.json`, `episodes.jsonl`, `decisions.json`, `roadmap.json`).
   - `/sandbox-storage/reviews/` — Independent adversarial agent assessments (`stage-<id>-assessment.json` & `.md`) and the immutable `consensus-ledger.json`.
3. **Mandatory Adversarial Agent Consensus Gate per Stage**
   - Before advancing from ANY stage (starting with Stage 0: examination of all work done so far and the future roadmap), **three independent adversarial roles** MUST audit the codebase, test telemetry, runtime visuals, and roadmap:
     1. `security-concurrency-skeptic` — Audits cross-tab sync races, XSS/escaping, storage corruption, async failover bounds, and input validation.
     2. `reliability-perf-auditor` — Audits memory/listener leaks, RAF/AudioContext cleanup, observer overhead, unit + Playwright E2E coverage, and build/lint health.
     3. `ux-spec-critic` — Audits live rendered Chromium UI across desktop/compact viewports, keyboard/accessibility semantics, requirement fidelity, and visual cleanliness.
   - **Blocking Consensus Rule**: Progression to the next stage is **strictly blocked** unless all 3 adversarial roles issue independent `APPROVE` verdicts with `0` unresolved `BLOCKER` or `HIGH` severity findings.

## 2. Standard Stage Execution Checklist
1. Load harness memory (`npm run harness:status`) and verify current stage consensus prerequisites.
2. Design and implement stage changes + automated unit/E2E/browser checks.
3. Dispatch independent adversarial assessments across all 3 roles; log all findings and resolve every `BLOCKER`/`HIGH` finding until **unanimous consensus** is recorded.
4. Run `npm run harness:gate -- --stage=<stageId>` to verify consensus lock + automated harness checks.
5. **Final Step (Mandatory)**: Run `npm run backup -- --label="prompt-end" --stage=<stageId>` so persisted storage reflects the verified state.

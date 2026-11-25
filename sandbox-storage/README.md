# Sandbox Persistent Storage & Harness Infrastructure

This directory provides accessible persistent storage partitioned into three functional zones:

- `backups/` — On-demand, prompt-end sandbox archive snapshots (`.tar.gz`), SHA-256 verification manifests, and `index.json` history. Backups run at the end of every execution plan/prompt via `npm run backup`, never on fixed timers.
- `memory/` — Structured harness memory (`workflow-policy.json`, `state.json`, `episodes.jsonl`, `decisions.json`, `roadmap.json`) tracking project state, verified milestones, architectural root-cause lessons, and upcoming stages.
- `reviews/` — Stage-gated adversarial agent assessments (`stage-<id>-assessment.json`, `stage-<id>-assessment.md`), comprehensive multi-team audit dossier (`multi-team-adversarial-audit-and-roadmap.md`), and `consensus-ledger.json`. No stage can transition without unanimous consensus across all independent adversarial roles.

## Quick Commands
- `npm run harness:status` — Inspect current stage, consensus status, last verification counts, and latest backup.
- `npm run harness:gate -- --stage=<stageId>` — Validate consensus ledger + run automated harness verification.
- `npm run backup -- --label="<label>" --stage="<stageId>"` — Create and integrity-verify a prompt-end backup snapshot.
- `node scripts/sandbox-backup.mjs --verify latest` — Verify archive checksum and readability of the latest backup.

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const MEMORY_DIR = path.join(ROOT, 'sandbox-storage', 'memory');
const REVIEWS_DIR = path.join(ROOT, 'sandbox-storage', 'reviews');
const STATE_PATH = path.join(MEMORY_DIR, 'state.json');
const ROADMAP_PATH = path.join(MEMORY_DIR, 'roadmap.json');
const EPISODES_PATH = path.join(MEMORY_DIR, 'episodes.jsonl');
const POLICY_PATH = path.join(MEMORY_DIR, 'workflow-policy.json');
const LEDGER_PATH = path.join(REVIEWS_DIR, 'consensus-ledger.json');

function readJson(p, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const eq = t.indexOf('=');
      if (eq !== -1) {
        out[t.slice(2, eq)] = t.slice(eq + 1);
      } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        out[t.slice(2)] = argv[i + 1];
        i++;
      } else {
        out[t.slice(2)] = true;
      }
    } else {
      out._.push(t);
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'status';

  const state = readJson(STATE_PATH);
  const roadmap = readJson(ROADMAP_PATH);
  const policy = readJson(POLICY_PATH);
  const ledger = readJson(LEDGER_PATH, { stages: {} });

  if (cmd === 'status') {
    const episodes = fs.existsSync(EPISODES_PATH)
      ? fs.readFileSync(EPISODES_PATH, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
      : [];
    const currentConsensus = ledger.stages?.[state.currentStageId] || null;
    console.log(
      JSON.stringify(
        {
          currentStageId: state.currentStageId,
          stageStatus: state.stageStatus,
          backupMode: policy?.backupPolicy?.mode || state.backupMode,
          consensusRule: policy?.adversarialConsensusPolicy?.consensusRule,
          consensusReachedForCurrentStage: Boolean(currentConsensus?.consensusReached),
          lastBackup: state.lastBackup,
          lastVerification: state.lastVerification,
          recentEpisodes: episodes.slice(-5)
        },
        null,
        2
      )
    );
    return;
  }

  if (cmd === 'record') {
    const type = String(args.type || 'note');
    const summary = String(args.summary || '').trim();
    if (!summary) {
      console.error('--summary is required');
      process.exit(1);
    }
    const entry = {
      ts: new Date().toISOString(),
      type,
      stage: String(args.stage || state.currentStageId),
      summary
    };
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    fs.appendFileSync(EPISODES_PATH, JSON.stringify(entry) + '\n', 'utf8');
    console.log(JSON.stringify({ recorded: true, entry }, null, 2));
    return;
  }

  if (cmd === 'advance') {
    const nextId = String(args.to || '');
    if (!nextId) {
      console.error('Usage: node scripts/harness-memory.mjs advance --to=<stageId>');
      process.exit(1);
    }
    const curStage = state.currentStageId;
    const curConsensus = ledger.stages?.[curStage];
    if (!curConsensus || !curConsensus.consensusReached) {
      console.error(
        `CONSENSUS BLOCK: Cannot advance from "${curStage}" to "${nextId}". Independent adversarial consensus has not been reached.`
      );
      process.exit(2);
    }
    const nextStageObj = (roadmap.stages || []).find((s) => s.id === nextId);
    if (!nextStageObj) {
      console.error(`Unknown stage in roadmap.json: ${nextId}`);
      process.exit(1);
    }
    const now = new Date().toISOString();
    roadmap.stages = roadmap.stages.map((s) => {
      if (s.id === curStage) return { ...s, status: 'completed', completedAt: now };
      if (s.id === nextId) return { ...s, status: 'in_progress', startedAt: now };
      return s;
    });
    roadmap.currentStageId = nextId;
    writeJson(ROADMAP_PATH, roadmap);

    const nextIdx = roadmap.stages.findIndex((s) => s.id === nextId);
    const following = nextIdx >= 0 && nextIdx + 1 < roadmap.stages.length ? roadmap.stages[nextIdx + 1].id : null;

    const nextState = {
      ...state,
      currentStageId: nextId,
      stageStatus: 'in_progress',
      nextStageId: following,
      updatedAt: now
    };
    writeJson(STATE_PATH, nextState);
    fs.appendFileSync(
      EPISODES_PATH,
      JSON.stringify({
        ts: now,
        type: 'stage-advance',
        stage: nextId,
        summary: `Advanced from ${curStage} to ${nextId} after unanimous adversarial consensus.`
      }) + '\n',
      'utf8'
    );
    console.log(JSON.stringify({ advanced: true, from: curStage, to: nextId }, null, 2));
    return;
  }

  console.error(`Unknown subcommand: ${cmd}`);
  process.exit(1);
}

main();

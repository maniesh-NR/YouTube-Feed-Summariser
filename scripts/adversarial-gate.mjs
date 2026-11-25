#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const STORAGE_ROOT = path.join(ROOT, 'sandbox-storage');
const MEMORY_DIR = path.join(STORAGE_ROOT, 'memory');
const REVIEWS_DIR = path.join(STORAGE_ROOT, 'reviews');
const POLICY_PATH = path.join(MEMORY_DIR, 'workflow-policy.json');
const STATE_PATH = path.join(MEMORY_DIR, 'state.json');
const LEDGER_PATH = path.join(REVIEWS_DIR, 'consensus-ledger.json');
const EPISODES_PATH = path.join(MEMORY_DIR, 'episodes.jsonl');

function readJson(p, fallback = null) {
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
  const out = {};
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
    }
  }
  return out;
}

function runCheck(cmd, args) {
  const start = Date.now();
  try {
    const stdout = execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, durationMs: Date.now() - start, outputTail: stdout.trim().split('\n').slice(-6).join('\n') };
  } catch (err) {
    return {
      ok: false,
      durationMs: Date.now() - start,
      error: (err.stderr || err.stdout || err.message || '').toString().slice(-800)
    };
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = readJson(STATE_PATH, {});
  const policy = readJson(POLICY_PATH, {});
  const stageId = String(args.stage || state.currentStageId || 'stage-0-baseline-examination');
  const assessmentPath = path.join(REVIEWS_DIR, `${stageId}-assessment.json`);
  const assessment = readJson(assessmentPath, null);

  if (!assessment) {
    console.error(`GATE BLOCKED: Missing adversarial assessment file at ${path.relative(ROOT, assessmentPath)}`);
    process.exit(2);
  }

  const requiredRoles = (policy?.adversarialConsensusPolicy?.roles || []).map((r) => r.id);
  const reviews = Array.isArray(assessment.roleReviews) ? assessment.roleReviews : [];

  const missingRoles = requiredRoles.filter((rid) => !reviews.some((rev) => rev.roleId === rid));
  const nonApproved = reviews.filter((rev) => rev.verdict !== 'APPROVE').map((r) => `${r.roleId}:${r.verdict}`);
  const openCriticalFindings = [];
  for (const rev of reviews) {
    for (const f of rev.findings || []) {
      const sev = String(f.severity || '').toUpperCase();
      if ((sev === 'BLOCKER' || sev === 'HIGH') && f.status !== 'resolved') {
        openCriticalFindings.push(`${rev.roleId}:${f.id}:${sev}`);
      }
    }
  }

  // Execute live automated verification harness checks
  const checks = {
    unit: runCheck('npx', ['--yes', 'tsx', '--test', 'src/utils/userscript-helpers.test.ts']),
    lint: runCheck('npm', ['run', 'lint']),
    build: runCheck('npm', ['run', 'build'])
  };
  if (args['with-e2e']) {
    checks.e2e = runCheck('node', ['run_all_tests.js']);
  }

  const allChecksPassed = Object.values(checks).every((c) => c.ok);
  const consensusReached =
    missingRoles.length === 0 &&
    reviews.length >= (policy?.adversarialConsensusPolicy?.minIndependentRoles || 3) &&
    nonApproved.length === 0 &&
    openCriticalFindings.length === 0 &&
    Boolean(assessment.roadmapExamined) &&
    allChecksPassed;

  const now = new Date().toISOString();
  const ledger = readJson(LEDGER_PATH, { schemaVersion: '1.0.0', stages: {} });
  ledger.stages[stageId] = {
    stageId,
    evaluatedAt: now,
    consensusReached,
    missingRoles,
    nonApproved,
    openCriticalFindings,
    rolesEvaluated: reviews.map((r) => ({
      roleId: r.roleId,
      verdict: r.verdict,
      findingsCount: (r.findings || []).length,
      resolvedCount: (r.findings || []).filter((f) => f.status === 'resolved').length
    })),
    automatedChecks: Object.fromEntries(
      Object.entries(checks).map(([k, v]) => [k, { ok: v.ok, durationMs: v.durationMs }])
    )
  };
  writeJson(LEDGER_PATH, ledger);

  const nextState = {
    ...state,
    stageStatus: consensusReached ? 'consensus_reached' : 'blocked_by_adversarial_gate',
    lastVerification: {
      ...(state.lastVerification || {}),
      unitTests: checks.unit.ok ? 'passed' : 'failed',
      lint: checks.lint.ok ? 'passed' : 'failed',
      build: checks.build.ok ? 'passed' : 'failed',
      ...(checks.e2e ? { e2eTests: checks.e2e.ok ? 'passed' : 'failed' } : {})
    },
    updatedAt: now
  };
  writeJson(STATE_PATH, nextState);

  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.appendFileSync(
    EPISODES_PATH,
    JSON.stringify({
      ts: now,
      type: 'adversarial-gate',
      stage: stageId,
      summary: consensusReached
        ? `Stage ${stageId} passed unanimous adversarial consensus across ${reviews.length} roles and automated harness checks.`
        : `Stage ${stageId} BLOCKED at adversarial gate (missing=${missingRoles.join(',') || 'none'}, dissent=${nonApproved.join(',') || 'none'}, openCritical=${openCriticalFindings.join(',') || 'none'}).`
    }) + '\n',
    'utf8'
  );

  console.log(JSON.stringify(ledger.stages[stageId], null, 2));
  if (!consensusReached) {
    process.exit(2);
  }
}

main();

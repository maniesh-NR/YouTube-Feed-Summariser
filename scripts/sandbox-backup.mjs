#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const STORAGE_ROOT = path.join(ROOT, 'sandbox-storage');
const BACKUPS_DIR = path.join(STORAGE_ROOT, 'backups');
const MEMORY_DIR = path.join(STORAGE_ROOT, 'memory');
const POLICY_PATH = path.join(MEMORY_DIR, 'workflow-policy.json');
const STATE_PATH = path.join(MEMORY_DIR, 'state.json');
const INDEX_PATH = path.join(BACKUPS_DIR, 'index.json');
const LATEST_PATH = path.join(BACKUPS_DIR, 'latest.json');
const EPISODES_PATH = path.join(MEMORY_DIR, 'episodes.jsonl');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) {
        args[token.slice(2, eq)] = token.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          args[token.slice(2)] = next;
          i++;
        } else {
          args[token.slice(2)] = true;
        }
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest('hex');
}

function walkFiles(dir, excludes, relBase = '') {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (excludes.some((ex) => rel === ex || rel.startsWith(ex + '/') || entry.name === ex)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, excludes, rel));
    } else if (entry.isFile()) {
      results.push(rel);
    }
  }
  return results;
}

function computeWorkspaceDigest(files) {
  const h = crypto.createHash('sha256');
  for (const rel of files) {
    const full = path.join(ROOT, rel);
    const content = fs.readFileSync(full);
    h.update(rel);
    h.update('\0');
    h.update(crypto.createHash('sha256').update(content).digest('hex'));
    h.update('\n');
  }
  return h.digest('hex');
}

function formatStamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

function sanitizeSlug(raw) {
  return String(raw || 'prompt-end')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'prompt-end';
}

function validateSafeRelPath(rawRel) {
  if (typeof rawRel !== 'string') {
    throw new Error('Invalid file path: expected non-empty relative path');
  }
  const trimmed = rawRel.trim().replace(/^\.\//, '');
  if (!trimmed || trimmed.includes('\0') || trimmed.includes('\\')) {
    throw new Error(`Unsafe file path rejected: ${rawRel}`);
  }
  if (path.isAbsolute(trimmed)) {
    throw new Error(`Absolute file path rejected: ${rawRel}`);
  }
  const segments = trimmed.split('/');
  if (segments.some((s) => !s || s === '.' || s === '..')) {
    throw new Error(`Path traversal segment rejected: ${rawRel}`);
  }
  const resolved = path.resolve(ROOT, trimmed);
  if (!resolved.startsWith(ROOT + path.sep)) {
    throw new Error(`Resolved path escapes workspace root: ${rawRel}`);
  }
  return { rel: segments.join('/'), resolved };
}

function resolveVerifiedSnapshot(index, refId) {
  const targetId = !refId || refId === true || refId === 'latest' ? index.backups[0]?.id : refId;
  const entry = index.backups.find((b) => b.id === targetId);
  if (!entry) {
    throw new Error(`Snapshot not found: ${refId}`);
  }
  const archivePath = path.join(ROOT, entry.archivePath);
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Archive missing: ${archivePath}`);
  }
  const actualSha = sha256File(archivePath);
  if (actualSha !== entry.archiveSha256) {
    throw new Error(`Checksum mismatch for ${entry.id}: expected ${entry.archiveSha256}, got ${actualSha}`);
  }
  return { entry, archivePath, actualSha };
}

function listArchiveMembers(archivePath) {
  return execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8', maxBuffer: 25 * 1024 * 1024 })
    .trim()
    .split('\n')
    .map((line) => line.replace(/^\.\//, ''))
    .filter(Boolean);
}

function computeLineDelta(baseBuf, targetBuf) {
  const sampleA = baseBuf ? baseBuf.subarray(0, 4096) : Buffer.alloc(0);
  const sampleB = targetBuf ? targetBuf.subarray(0, 4096) : Buffer.alloc(0);
  if (sampleA.includes(0) || sampleB.includes(0)) {
    return { binary: true, addedLines: null, removedLines: null };
  }
  const linesA = baseBuf ? baseBuf.toString('utf8').split('\n') : [];
  const linesB = targetBuf ? targetBuf.toString('utf8').split('\n') : [];
  if (!baseBuf) return { binary: false, addedLines: linesB.length, removedLines: 0 };
  if (!targetBuf) return { binary: false, addedLines: 0, removedLines: linesA.length };

  if (linesA.length <= 1200 && linesB.length <= 1200) {
    const m = linesA.length;
    const n = linesB.length;
    let prev = new Uint32Array(n + 1);
    let curr = new Uint32Array(n + 1);
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (linesA[i - 1] === linesB[j - 1]) {
          curr[j] = prev[j - 1] + 1;
        } else {
          curr[j] = prev[j] >= curr[j - 1] ? prev[j] : curr[j - 1];
        }
      }
      const tmp = prev;
      prev = curr;
      curr = tmp;
      curr.fill(0);
    }
    const lcs = prev[n];
    return {
      binary: false,
      addedLines: n - lcs,
      removedLines: m - lcs
    };
  }

  const freqA = new Map();
  for (const line of linesA) freqA.set(line, (freqA.get(line) || 0) + 1);
  let common = 0;
  for (const line of linesB) {
    const count = freqA.get(line) || 0;
    if (count > 0) {
      common++;
      freqA.set(line, count - 1);
    }
  }
  return {
    binary: false,
    addedLines: linesB.length - common,
    removedLines: linesA.length - common
  };
}

function runDiffCommand(index, excludes, baseRef, targetRef) {
  const base = resolveVerifiedSnapshot(index, baseRef);
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-diff-'));
  try {
    const baseDir = path.join(tmpRoot, 'base');
    fs.mkdirSync(baseDir, { recursive: true });
    execFileSync('tar', ['-xzf', base.archivePath, '-C', baseDir], { maxBuffer: 25 * 1024 * 1024 });

    let targetDir = ROOT;
    let targetLabel = 'live-workspace';
    if (targetRef) {
      const targetSnap = resolveVerifiedSnapshot(index, targetRef);
      targetDir = path.join(tmpRoot, 'target');
      fs.mkdirSync(targetDir, { recursive: true });
      execFileSync('tar', ['-xzf', targetSnap.archivePath, '-C', targetDir], { maxBuffer: 25 * 1024 * 1024 });
      targetLabel = targetSnap.entry.id;
    }

    const baseFiles = walkFiles(baseDir, excludes);
    const targetFiles = walkFiles(targetDir, excludes);
    const baseSet = new Set(baseFiles);
    const targetSet = new Set(targetFiles);
    const allPaths = Array.from(new Set([...baseFiles, ...targetFiles])).sort((a, b) => a.localeCompare(b));

    const changes = [];
    const summary = { added: 0, removed: 0, modified: 0, unchanged: 0 };

    for (const rel of allPaths) {
      const inBase = baseSet.has(rel);
      const inTarget = targetSet.has(rel);
      const basePath = path.join(baseDir, rel);
      const targetPath = path.join(targetDir, rel);

      if (!inBase && inTarget) {
        const bufB = fs.readFileSync(targetPath);
        const shaB = crypto.createHash('sha256').update(bufB).digest('hex');
        const delta = computeLineDelta(null, bufB);
        summary.added++;
        changes.push({
          path: rel,
          status: 'added',
          baseBytes: 0,
          targetBytes: bufB.length,
          byteDelta: bufB.length,
          ...delta,
          baseSha256: null,
          targetSha256: shaB
        });
      } else if (inBase && !inTarget) {
        const bufA = fs.readFileSync(basePath);
        const shaA = crypto.createHash('sha256').update(bufA).digest('hex');
        const delta = computeLineDelta(bufA, null);
        summary.removed++;
        changes.push({
          path: rel,
          status: 'removed',
          baseBytes: bufA.length,
          targetBytes: 0,
          byteDelta: -bufA.length,
          ...delta,
          baseSha256: shaA,
          targetSha256: null
        });
      } else {
        const bufA = fs.readFileSync(basePath);
        const bufB = fs.readFileSync(targetPath);
        const shaA = crypto.createHash('sha256').update(bufA).digest('hex');
        const shaB = crypto.createHash('sha256').update(bufB).digest('hex');
        if (shaA === shaB) {
          summary.unchanged++;
        } else {
          const delta = computeLineDelta(bufA, bufB);
          summary.modified++;
          changes.push({
            path: rel,
            status: 'modified',
            baseBytes: bufA.length,
            targetBytes: bufB.length,
            byteDelta: bufB.length - bufA.length,
            ...delta,
            baseSha256: shaA,
            targetSha256: shaB
          });
        }
      }
    }

    return {
      mode: targetRef ? 'snapshot-to-snapshot' : 'snapshot-to-workspace',
      baseSnapshot: base.entry.id,
      target: targetLabel,
      totalCompared: allPaths.length,
      summary,
      changes
    };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function runSelectiveRestoreCommand(index, snapRef, rawRelFile, dryRun) {
  const { rel, resolved } = validateSafeRelPath(rawRelFile);
  const { entry, archivePath } = resolveVerifiedSnapshot(index, snapRef);
  const members = listArchiveMembers(archivePath);
  if (!members.includes(rel)) {
    throw new Error(`File "${rel}" does not exist inside snapshot ${entry.id}`);
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-restore-'));
  try {
    execFileSync('tar', ['-xzf', archivePath, '-C', tmpRoot, rel], { maxBuffer: 25 * 1024 * 1024 });
    const extractedPath = path.join(tmpRoot, rel);
    if (!fs.existsSync(extractedPath)) {
      throw new Error(`Extracted member missing for "${rel}"`);
    }
    const lstat = fs.lstatSync(extractedPath);
    if (lstat.isSymbolicLink() || !lstat.isFile()) {
      throw new Error(`Refusing restore: archive member "${rel}" is not a regular file`);
    }
    const targetBuf = fs.readFileSync(extractedPath);
    const targetSha = crypto.createHash('sha256').update(targetBuf).digest('hex');
    const existsInLive = fs.existsSync(resolved);
    const liveSha = existsInLive ? sha256File(resolved) : null;
    const wouldChange = !existsInLive || liveSha !== targetSha;

    if (dryRun) {
      return {
        dryRun: true,
        selectiveRestore: true,
        id: entry.id,
        file: rel,
        existsInLive,
        wouldChange,
        bytes: targetBuf.length,
        targetSha256: targetSha,
        liveSha256: liveSha
      };
    }

    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, targetBuf);
    const now = new Date().toISOString();
    fs.mkdirSync(path.dirname(EPISODES_PATH), { recursive: true });
    fs.appendFileSync(
      EPISODES_PATH,
      JSON.stringify({
        ts: now,
        type: 'restore-file',
        stage: entry.stageId,
        summary: `Selectively restored "${rel}" from snapshot ${entry.id} (${targetBuf.length} bytes, sha256:${targetSha.slice(0, 12)}).`
      }) + '\n',
      'utf8'
    );

    return {
      restored: true,
      selectiveRestore: true,
      id: entry.id,
      file: rel,
      bytes: targetBuf.length,
      sha256: targetSha,
      changed: wouldChange
    };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.interval || args.cron || args.watch) {
    console.error('Policy violation: fixed-interval or cron backups are disabled. Backups run at execution-plan/prompt end only.');
    process.exit(2);
  }

  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const policy = readJson(POLICY_PATH, {});
  const excludes = policy?.backupPolicy?.excludes || [
    'node_modules',
    'dist',
    '.playwright-cli',
    '.git',
    'sandbox-storage/backups'
  ];
  const maxRetained = policy?.backupPolicy?.maxRetainedSnapshots || 30;
  const index = readJson(INDEX_PATH, { backups: [] });

  if (args.list) {
    console.log(JSON.stringify(index, null, 2));
    return;
  }

  if (args.verify) {
    try {
      const { entry, archivePath, actualSha } = resolveVerifiedSnapshot(index, args.verify);
      const listed = listArchiveMembers(archivePath);
      console.log(JSON.stringify({ verified: true, id: entry.id, archivePath: entry.archivePath, fileCount: listed.length, archiveSha256: actualSha }, null, 2));
      return;
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  if (args.diff) {
    try {
      const baseRef = args.diff === true ? 'latest' : args.diff;
      const targetRef = args.against || args._[0] || null;
      const diffResult = runDiffCommand(index, excludes, baseRef, targetRef);
      console.log(JSON.stringify(diffResult, null, 2));
      return;
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  if (args['restore-file'] || (args.restore && args.file)) {
    const rawFile = typeof args['restore-file'] === 'string' ? args['restore-file'] : args.file;
    const snapRef = args.from || args.restore || 'latest';
    try {
      const result = runSelectiveRestoreCommand(index, snapRef, rawFile, Boolean(args['dry-run']));
      console.log(JSON.stringify(result, null, 2));
      return;
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  if (args.restore) {
    let entry;
    let archivePath;
    try {
      ({ entry, archivePath } = resolveVerifiedSnapshot(index, args.restore));
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    if (args['dry-run']) {
      const files = listArchiveMembers(archivePath);
      console.log(JSON.stringify({ dryRun: true, id: entry.id, filesWouldRestore: files.length }, null, 2));
      return;
    }
    execFileSync('tar', ['-xzf', archivePath, '-C', ROOT], { stdio: 'inherit' });
    console.log(JSON.stringify({ restored: true, id: entry.id, archivePath: entry.archivePath }, null, 2));
    return;
  }

  // Default action: create verified prompt-end sandbox snapshot
  const state = readJson(STATE_PATH, {});
  const stage = String(args.stage || state.currentStageId || 'stage-0-baseline-examination');
  const label = sanitizeSlug(args.label || 'prompt-end');
  const stamp = formatStamp();
  const id = `snap-${stamp}-${label}`;
  const archiveName = `${id}.tar.gz`;
  const archiveRel = `sandbox-storage/backups/${archiveName}`;
  const archiveAbs = path.join(ROOT, archiveRel);

  const files = walkFiles(ROOT, excludes);
  const workspaceDigest = computeWorkspaceDigest(files);

  const listFile = path.join(BACKUPS_DIR, `.${id}.files`);
  fs.writeFileSync(listFile, files.join('\n') + '\n', 'utf8');
  try {
    execFileSync('tar', ['-czf', archiveAbs, '-C', ROOT, '-T', listFile], { stdio: 'pipe' });
  } finally {
    fs.rmSync(listFile, { force: true });
  }

  // Verify archive readability immediately
  const archivedEntries = execFileSync('tar', ['-tzf', archiveAbs], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
    .trim()
    .split('\n')
    .filter(Boolean);
  const stat = fs.statSync(archiveAbs);
  const archiveSha256 = sha256File(archiveAbs);

  const record = {
    id,
    createdAt: new Date().toISOString(),
    trigger: 'prompt-end',
    label,
    stageId: stage,
    fileCount: files.length,
    archivedEntryCount: archivedEntries.length,
    bytes: stat.size,
    workspaceDigest,
    archiveSha256,
    archivePath: archiveRel,
    verified: archivedEntries.length === files.length
  };

  const nextBackups = [record, ...index.backups];
  if (nextBackups.length > maxRetained) {
    const removed = nextBackups.splice(maxRetained);
    for (const old of removed) {
      const oldPath = path.join(ROOT, old.archivePath);
      if (fs.existsSync(oldPath)) fs.rmSync(oldPath, { force: true });
    }
  }

  writeJson(INDEX_PATH, { updatedAt: record.createdAt, backups: nextBackups });
  writeJson(LATEST_PATH, record);

  const updatedState = {
    ...state,
    lastBackup: {
      id: record.id,
      createdAt: record.createdAt,
      trigger: record.trigger,
      stageId: record.stageId,
      archivePath: record.archivePath,
      archiveSha256: record.archiveSha256,
      workspaceDigest: record.workspaceDigest,
      fileCount: record.fileCount,
      bytes: record.bytes
    },
    updatedAt: record.createdAt
  };
  writeJson(STATE_PATH, updatedState);

  fs.mkdirSync(path.dirname(EPISODES_PATH), { recursive: true });
  fs.appendFileSync(
    EPISODES_PATH,
    JSON.stringify({
      ts: record.createdAt,
      type: 'backup',
      stage: record.stageId,
      summary: `Prompt-end snapshot ${record.id} (${record.fileCount} files, ${record.bytes} bytes, sha256:${record.archiveSha256.slice(0, 12)}) verified.`
    }) + '\n',
    'utf8'
  );

  console.log(JSON.stringify(record, null, 2));
}

main();

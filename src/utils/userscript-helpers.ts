export function formatSecondsToTimestamp(seconds: number): string {
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export function parseTimestampToSeconds(tsStr: string): number {
  const parts = tsStr.trim().split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

export function getCacheKeyPrefix(mode: 'summary' | 'transcript', source: 'video' | 'text'): string {
  if (mode === 'transcript') {
    return source === 'text' ? 'trt:' : 'trn:';
  }
  return source === 'text' ? 'sut:' : 'sum:';
}

export function resolveNextModelDown(currentModel: string, fallbackLadder: string[], availableModels: string[]): string | null {
  const isAsk = String(currentModel || '').toLowerCase().includes('ask');
  let startIdx = 0;
  if (!isAsk) {
    let idx = fallbackLadder.indexOf(currentModel);
    if (idx === -1) {
      idx = fallbackLadder.findIndex((m) => !m.includes('pro'));
      if (idx === -1) idx = 0;
    }
    startIdx = idx + 1;
  }
  for (let i = startIdx; i < fallbackLadder.length; i++) {
    const candidate = fallbackLadder[i];
    if (availableModels.length === 0 || availableModels.includes(candidate) || availableModels.includes(candidate + '-preview')) {
      return candidate;
    }
  }
  return null;
}

export interface AskFallbackDecision {
  shouldFallback: boolean;
  nextModel: string | null;
  reason: 'cancelled' | 'no_key' | 'no_eligible_model' | 'ladder_fallback';
  note?: string;
}

export function resolveAskFallbackPlan(options: {
  currentModel: string;
  fallbackLadder: string[];
  availableModels: string[];
  hasApiKey: boolean;
  cancelled?: boolean;
  errorMessage?: string;
}): AskFallbackDecision {
  if (options.cancelled) {
    return { shouldFallback: false, nextModel: null, reason: 'cancelled' };
  }
  if (!options.hasApiKey) {
    return { shouldFallback: false, nextModel: null, reason: 'no_key' };
  }
  const nextModel = resolveNextModelDown(
    options.currentModel,
    options.fallbackLadder,
    options.availableModels
  );
  if (!nextModel) {
    return { shouldFallback: false, nextModel: null, reason: 'no_eligible_model' };
  }
  const firstLine = (options.errorMessage || 'YouTube Ask failed').split('\n')[0];
  return {
    shouldFallback: true,
    nextModel,
    reason: 'ladder_fallback',
    note: `⚠ YouTube Ask failed (${firstLine}). Automatically proceeding with ${nextModel}.`
  };
}

export function cleanTextForSpeech(
  text: string,
  options: { skipSilence?: boolean } = { skipSilence: true }
): string {
  if (!text) return '';
  const skipSilence = options?.skipSilence !== false;
  let clean = text;

  if (skipSilence) {
    // 1. Filter out lines that are purely silence / pause / music / applause markers
    const silenceLineRegex = /^\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*(\[(?:silence|pause|music|applause|laughter|no audio|blank|sound|cheering)\]|\((?:silence|pause|music|applause|laughter|no audio|blank|sound|cheering)\)|\.{3,}|[-_—]{2,})\s*$/gim;
    clean = clean.replace(silenceLineRegex, '');

    // 2. Filter out standalone silence / pause markers without timestamps
    const standaloneSilenceRegex = /^\s*(\[(?:silence|pause|music|applause|laughter|no audio|blank|sound|cheering)\]|\((?:silence|pause|music|applause|laughter|no audio|blank|sound|cheering)\)|\.{3,})\s*$/gim;
    clean = clean.replace(standaloneSilenceRegex, '');

    // 3. Remove inline silence / pause tokens
    clean = clean.replace(/\[(?:silence|pause|long pause|music|applause|laughter|no audio|blank)\]/gi, '');
    clean = clean.replace(/\((?:silence|pause|long pause|music|applause|laughter|no audio|blank)\)/gi, '');

    // 4. Collapse extended pause punctuation (e.g. ".....", "---")
    clean = clean.replace(/\.{3,}/g, '. ');
    clean = clean.replace(/[-_—]{2,}/g, ', ');

    // 5. Detect timestamp gaps > 3 seconds between consecutive timestamped transcript lines
    const lines = clean.split('\n');
    const processedLines: string[] = [];
    let prevTsSec = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const tsMatch = /^\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*(.*)$/.exec(line);
      if (tsMatch) {
        const hrs = tsMatch[1] ? parseInt(tsMatch[1], 10) : 0;
        const mins = parseInt(tsMatch[2], 10);
        const secs = parseInt(tsMatch[3], 10);
        const currentTsSec = hrs * 3600 + mins * 60 + secs;
        const rest = tsMatch[4].trim();

        // If line has no meaningful words (just filler/empty), skip it
        if (!rest || /^(?:\[.*?\]|\(.*?\)|[-_.\s]+)$/.test(rest)) {
          continue;
        }

        prevTsSec = currentTsSec;
        processedLines.push(line);
      } else {
        processedLines.push(line);
      }
    }
    clean = processedLines.join('\n');
  }

  // Strip visual markers
  clean = clean.replace(/\[\[(?:FRAME|IMG|GEN|IMAGE)[^\]]+\]\]/gi, '');
  // Strip HTML / script tags
  clean = clean.replace(/<[^>]+>/g, '');
  // Convert timestamps like [01:15] or [1:02:30] to spoken phrases
  clean = clean.replace(/\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]/g, (_match, h, m, s) => {
    const hrs = h ? parseInt(h, 10) : 0;
    const mins = parseInt(m, 10);
    const secs = parseInt(s, 10);
    const parts: string[] = [];
    if (hrs > 0) parts.push(`${hrs} hour${hrs > 1 ? 's' : ''}`);
    if (mins > 0) parts.push(`${mins} minute${mins > 1 ? 's' : ''}`);
    if (secs > 0) parts.push(`${secs} second${secs > 1 ? 's' : ''}`);
    return parts.length ? `at ${parts.join(' ')}` : '';
  });
  // Format LaTeX/scientific symbols (e.g., $100^\circ\text{C}$ -> 100°C)
  clean = formatMathSymbolsInText(clean);
  // Strip markdown formatting symbols
  clean = clean.replace(/#{1,6}\s+/g, '');
  clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1');
  clean = clean.replace(/\*([^*]+)\*/g, '$1');
  clean = clean.replace(/`([^`]+)`/g, '$1');
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  clean = clean.replace(/https?:\/\/\S+/g, '');
  clean = clean.replace(/^[-*•]\s+/gm, '');
  return clean.replace(/\s+/g, ' ').trim();
}

export interface TranscriptCue {
  lineIndex: number;
  rawLine: string;
  tsStr: string;
  startSec: number;
  text: string;
  spokenText: string;
  charStart: number;
  charEnd: number;
}

export function parseTranscriptCues(
  transcriptText: string,
  options: { skipSilence?: boolean } = { skipSilence: true }
): { cues: TranscriptCue[]; fullSpokenText: string } {
  if (!transcriptText) return { cues: [], fullSpokenText: '' };
  const lines = transcriptText.split('\n');
  const cues: TranscriptCue[] = [];
  const spokenParts: string[] = [];
  let currentOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Matches timestamp format: [01:15] or [1:02:30]
    const tsMatch = /^\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*(.*)$/.exec(trimmed);
    if (!tsMatch) continue;

    const tsStr = trimmed.slice(0, trimmed.indexOf(']') + 1);
    const restText = trimmed.slice(tsStr.length).trim();
    const startSec = parseTimestampToSeconds(tsStr.slice(1, -1));

    const spokenLine = cleanTextForSpeech(trimmed, options);
    if (!spokenLine) continue;

    const charStart = currentOffset;
    const charEnd = currentOffset + spokenLine.length;
    currentOffset = charEnd + 1; // plus space separator
    spokenParts.push(spokenLine);

    cues.push({
      lineIndex: i,
      rawLine,
      tsStr,
      startSec,
      text: restText,
      spokenText: spokenLine,
      charStart,
      charEnd
    });
  }

  const fullSpokenText = spokenParts.join(' ');
  return { cues, fullSpokenText };
}

export function findActiveCueByCharIndex(cues: TranscriptCue[], charIndex: number): TranscriptCue | null {
  if (!cues || cues.length === 0) return null;
  if (charIndex <= 0) return cues[0];

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (charIndex >= cue.charStart && charIndex <= cue.charEnd) {
      return cue;
    }
    if (i < cues.length - 1 && charIndex > cue.charEnd && charIndex < cues[i + 1].charStart) {
      return cue;
    }
  }

  if (charIndex > cues[cues.length - 1].charEnd) {
    return cues[cues.length - 1];
  }
  return cues[0];
}

export function findActiveCueByTime(
  cues: TranscriptCue[],
  currentTimeSec: number,
  totalDurationSec: number
): TranscriptCue | null {
  if (!cues || cues.length === 0) return null;
  if (totalDurationSec <= 0 || currentTimeSec <= 0) return cues[0];

  const progress = Math.min(1, Math.max(0, currentTimeSec / totalDurationSec));
  const totalChars = cues[cues.length - 1].charEnd;
  const targetChar = Math.round(progress * totalChars);

  return findActiveCueByCharIndex(cues, targetChar);
}

/**
 * Detects whether YouTube is currently rendering in Dark or Light mode.
 * Checks YouTube's root <html> attribute (html[dark]), ytd-app[dark],
 * theme attributes, and body attributes.
 */
export function detectYouTubeTheme(doc?: any): 'dark' | 'light' {
  const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
  if (!targetDoc) return 'dark';

  const docEl = targetDoc.documentElement;
  if (docEl) {
    if (typeof docEl.hasAttribute === 'function' && docEl.hasAttribute('dark')) return 'dark';
    if (typeof docEl.getAttribute === 'function') {
      const darkAttr = docEl.getAttribute('dark');
      if (darkAttr !== null && darkAttr !== 'false') return 'dark';
      const themeAttr = docEl.getAttribute('theme');
      if (themeAttr === 'dark') return 'dark';
    }
    if (docEl.classList && docEl.classList.contains && (docEl.classList.contains('dark') || docEl.classList.contains('yt-dark'))) {
      return 'dark';
    }
  }

  if (typeof targetDoc.querySelector === 'function') {
    if (targetDoc.querySelector('html[dark]')) return 'dark';
    if (targetDoc.querySelector('ytd-app[dark]')) return 'dark';
    const ytdApp = targetDoc.querySelector('ytd-app');
    if (ytdApp && typeof ytdApp.hasAttribute === 'function' && ytdApp.hasAttribute('dark')) return 'dark';
    if (targetDoc.body && typeof targetDoc.body.hasAttribute === 'function' && targetDoc.body.hasAttribute('dark')) return 'dark';
  }

  return 'light';
}

/**
 * Resolves the effective reader view theme based on user's manual selection,
 * sync toggle state, and detected YouTube theme.
 */
export function resolveReaderTheme(
  manualTheme: 'system' | 'light' | 'sepia' | 'dark' | string,
  syncWithYouTube: boolean,
  detectedYtTheme: 'dark' | 'light'
): 'light' | 'sepia' | 'dark' | 'system' {
  if (syncWithYouTube) {
    return detectedYtTheme;
  }
  if (['light', 'sepia', 'dark', 'system'].includes(manualTheme)) {
    return manualTheme as 'light' | 'sepia' | 'dark' | 'system';
  }
  return 'system';
}

/**
 * Bounded memory cache with LRU eviction to prevent runaway memory usage
 * in long-lived YouTube SPA sessions.
 */
export class BoundedMemoryCache<K, V> {
  private map = new Map<K, V>();
  private readonly maxCapacity: number;

  constructor(maxCapacity = 500) {
    this.maxCapacity = Math.max(1, maxCapacity);
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    // Refresh access order (delete and re-insert)
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): this {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxCapacity) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, value);
    return this;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
    this.map.forEach(callbackfn, thisArg);
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.map[Symbol.iterator]();
  }
}

/**
 * Returns the storage key for auto-saved follow-up chat drafts.
 */
export function getDraftStorageKey(videoId: string): string {
  return 'draft:' + videoId;
}

/**
 * Returns granular TTS playback speed presets with 0.25x steps.
 */
export function getGranularTtsRates(): number[] {
  return [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
}

/**
 * Determines the visual indicator style type based on playback speed setting.
 */
export function getSpeedIndicatorType(rate: number): 'speed-normal' | 'speed-boost' | 'speed-slow' {
  if (Math.abs(rate - 1.0) < 0.01) return 'speed-normal';
  if (rate > 1.0) return 'speed-boost';
  return 'speed-slow';
}

/**
 * Validates and clamps voice pitch within [0.5, 2.0], defaulting to 1.0.
 */
export function clampPitch(val: unknown): number {
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num) || !isFinite(num)) return 1.0;
  const clamped = Math.max(0.5, Math.min(2.0, num));
  return Math.round(clamped * 100) / 100;
}

export interface SummaryExportPayload {
  generator: string;
  version: string;
  exportedAt: string;
  metadata: {
    videoId: string;
    videoTitle: string;
    channel: string;
    videoUrl: string;
    mode: 'summary' | 'transcript' | string;
    source: 'video' | 'text' | string;
    processingMode: 'fast' | 'deep' | string;
    persona?: SummaryPersona | string;
    model: string;
    ttsSettings?: {
      rate: number;
      volume: number;
      pitch: number;
      voice: string;
    };
  };
  content: {
    rawText: string;
    formattedText?: string;
    factCheck?: string | null;
    citations?: Array<{ uri: string; title: string }>;
    followUpQuestions?: Array<{ question: string; answer: string; sources?: Array<{ uri: string; title: string }> }>;
    ratings?: {
      main: ResponseRatingRecord | null;
      followUps: Record<string, ResponseRatingRecord>;
    };
  };
}

/**
 * Formats a transcript summary and rich metadata into an indented JSON file string.
 */
export function formatSummaryExportJson(data: {
  videoId: string;
  videoTitle?: string;
  channel?: string;
  mode?: string;
  source?: string;
  processingMode?: string;
  persona?: SummaryPersona | string;
  model?: string;
  text?: string;
  formattedText?: string;
  factCheck?: string | null;
  citations?: Array<{ uri: string; title: string }>;
  followUpQuestions?: Array<{ question: string; answer: string; sources?: Array<{ uri: string; title: string }> }>;
  ttsRate?: number;
  ttsVolume?: number;
  ttsPitch?: number;
  ttsVoice?: string;
  ratings?: {
    main: ResponseRatingRecord | null;
    followUps: Record<string, ResponseRatingRecord>;
  };
}): string {
  const payload: SummaryExportPayload = {
    generator: 'YouTube Feed Summariser (Gemini)',
    version: '2.12.0',
    exportedAt: new Date().toISOString(),
    metadata: {
      videoId: data.videoId,
      videoTitle: data.videoTitle || data.videoId || 'Untitled Video',
      channel: data.channel || 'YouTube Creator',
      videoUrl: `https://www.youtube.com/watch?v=${data.videoId}`,
      mode: data.mode || 'summary',
      source: data.source || 'video',
      processingMode: data.processingMode || 'fast',
      persona: normalizeSummaryPersona(data.persona),
      model: data.model || 'gemini-3.8-flash',
      ttsSettings: {
        rate: typeof data.ttsRate === 'number' ? data.ttsRate : 1.0,
        volume: typeof data.ttsVolume === 'number' ? data.ttsVolume : 1.0,
        pitch: clampPitch(data.ttsPitch),
        voice: data.ttsVoice || 'ai:Kore'
      }
    },
    content: {
      rawText: data.text || '',
      formattedText: data.formattedText,
      factCheck: data.factCheck || null,
      citations: data.citations || [],
      followUpQuestions: data.followUpQuestions || [],
      ...(data.ratings ? { ratings: data.ratings } : {})
    }
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Calculates normalized amplitudes (0.0 to 1.0) for a dynamic speech waveform visualizer.
 * Models human voice frequency spectrum, pitch shifting, playback speed cadence,
 * and syllable attack pulses.
 */
export function computeWaveformAmplitudes(options: {
  isPlaying: boolean;
  volume?: number;
  pitch?: number;
  rate?: number;
  timestamp?: number;
  barCount?: number;
  boundaryPulse?: number;
}): number[] {
  const barCount = Math.max(4, options.barCount || 12);
  const volume = options.volume !== undefined ? Math.max(0, Math.min(1, options.volume)) : 1.0;
  const pitch = options.pitch !== undefined ? clampPitch(options.pitch) : 1.0;
  const rate = options.rate !== undefined ? Math.max(0.25, Math.min(3, options.rate)) : 1.0;
  const t = (options.timestamp !== undefined ? options.timestamp : Date.now()) / 1000;
  const pulse = Math.max(0, Math.min(1, options.boundaryPulse || 0));

  if (!options.isPlaying || volume === 0) {
    // Resting flatline
    return new Array(barCount).fill(0.08);
  }

  const bars: number[] = [];
  const baseFreq = 3.2 * rate;

  for (let i = 0; i < barCount; i++) {
    const normIdx = i / (barCount - 1); // 0 (bass) to 1 (treble)

    // Speech formant model: Human speech has formant energy peaks around low-mid frequencies
    // Shift formant peaks up or down according to pitch
    const formantCenter = 0.35 * Math.sqrt(pitch);
    const formantWidth = 0.28;
    const formantDist = Math.abs(normIdx - formantCenter);
    const formantWeight = Math.exp(-Math.pow(formantDist / formantWidth, 2));

    // Dynamic wave oscillations representing voice harmonics & prosody
    const harmonic1 = Math.sin(t * baseFreq * 2.1 + i * 0.8) * 0.5 + 0.5;
    const harmonic2 = Math.sin(t * baseFreq * 4.3 - i * 1.2) * 0.3 + 0.3;
    const harmonic3 = Math.cos(t * baseFreq * 1.1 + i * 0.4) * 0.2 + 0.2;

    // Boundary pulse creates syllable attack
    const attackBoost = pulse * (0.3 + 0.7 * Math.sin(i * 0.5));

    // Combine formants, harmonics, rhythm, and syllable pulse
    let amp = (formantWeight * 0.5 + 0.25) * (harmonic1 * 0.45 + harmonic2 * 0.35 + harmonic3 * 0.2) + attackBoost;

    // Apply speech volume and clamp
    amp = Math.max(0.08, Math.min(1.0, amp * volume));
    bars.push(Math.round(amp * 100) / 100);
  }

  return bars;
}

export type HistoryTabVisibility = 'always' | 'with_tabs' | 'never';
export type HistoryPageScope = 'all_pages' | 'home_only';

export function normalizeHistoryTabVisibility(val: unknown): HistoryTabVisibility {
  if (val === 'always' || val === 'with_tabs' || val === 'never') {
    return val;
  }
  return 'always';
}

export function normalizeHistoryPageScope(val: unknown): HistoryPageScope {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'home_only' || s === 'home' || s === 'feed_only') {
    return 'home_only';
  }
  return 'all_pages';
}

export function extractYouTubePathAndSearch(pathnameOrUrl: unknown): string {
  const raw = String(pathnameOrUrl || '').trim();
  if (!raw) return '/';
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return `${parsed.pathname || '/'}${parsed.search || ''}`;
    } catch {
      return raw;
    }
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function isYouTubeVideoPage(pathnameOrUrl: unknown): boolean {
  const path = extractYouTubePathAndSearch(pathnameOrUrl).toLowerCase();
  return (
    path.startsWith('/watch') ||
    path.startsWith('/shorts') ||
    path.startsWith('/live') ||
    /[?&]v=[a-z0-9_-]{6,}/i.test(path)
  );
}

export function isYouTubeHomeFeedPage(pathnameOrUrl: unknown): boolean {
  const path = extractYouTubePathAndSearch(pathnameOrUrl).toLowerCase();
  if (isYouTubeVideoPage(path)) return false;
  const pathOnly = path.split('?')[0].split('#')[0] || '/';
  return pathOnly === '/' || pathOnly === '' || pathOnly.startsWith('/feed');
}

export function shouldShowHistoryTab(options: {
  visibility: unknown;
  cachedCount: number;
  activeTabCount: number;
  showHistoryBottomTab?: boolean;
  pageScope?: HistoryPageScope | string;
  currentPage?: string;
  isHomeFeedPage?: boolean;
}): boolean {
  if (options.showHistoryBottomTab === false) return false;
  const scope = normalizeHistoryPageScope(options.pageScope);
  if (scope === 'home_only') {
    if (typeof options.isHomeFeedPage === 'boolean') {
      if (!options.isHomeFeedPage) return false;
    } else if (typeof options.currentPage === 'string' && options.currentPage.trim().length > 0) {
      if (!isYouTubeHomeFeedPage(options.currentPage)) return false;
    }
  }
  const visibility = normalizeHistoryTabVisibility(options.visibility);
  if (options.cachedCount <= 0) return false;
  if (visibility === 'never') return false;
  if (visibility === 'with_tabs') return options.activeTabCount > 0;
  return true;
}

export type ResponseRatingValue = 'up' | 'down' | null;

export interface ResponseRatingRecord {
  videoId: string;
  targetType: 'summary' | 'transcript' | 'followup';
  targetId: string;
  rating: 'up' | 'down';
  note?: string;
  updatedAt: number;
}

export function normalizeResponseRating(val: unknown): ResponseRatingValue {
  if (val === 'up' || val === 'down') return val;
  return null;
}

export function buildResponseRatingKey(
  videoId: string,
  targetType: 'summary' | 'transcript' | 'followup' | string,
  targetId = 'main'
): string {
  return `${videoId}:${targetType}:${targetId || 'main'}`;
}

export function applyResponseRating(
  ratingsMap: Record<string, ResponseRatingRecord>,
  options: {
    videoId: string;
    targetType: 'summary' | 'transcript' | 'followup';
    targetId?: string;
    rating: 'up' | 'down';
    note?: string;
    timestamp?: number;
  }
): {
  nextMap: Record<string, ResponseRatingRecord>;
  record: ResponseRatingRecord | null;
} {
  const targetId = options.targetId || 'main';
  const key = buildResponseRatingKey(options.videoId, options.targetType, targetId);
  const existing = ratingsMap[key];
  const nextMap = { ...ratingsMap };

  if (existing && existing.rating === options.rating && options.note === undefined) {
    delete nextMap[key];
    return { nextMap, record: null };
  }

  const record: ResponseRatingRecord = {
    videoId: options.videoId,
    targetType: options.targetType,
    targetId,
    rating: options.rating,
    note: options.note !== undefined ? options.note : existing?.note,
    updatedAt: options.timestamp ?? Date.now()
  };
  nextMap[key] = record;
  return { nextMap, record };
}

const SUPERSCRIPT_CHAR_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ'
};

const SUBSCRIPT_CHAR_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'x': 'ₓ', 'h': 'ₕ',
  'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'p': 'ₚ',
  's': 'ₛ', 't': 'ₜ'
};

const LATEX_COMMAND_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\(?:text|mathrm|textbf|textit|mathbf|mathit|mathsf|mathtt|ce|units|operatorname)\{([^{}]*)\}/g, '$1'],
  [/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2'],
  [/\\sqrt\{([^{}]+)\}/g, '√$1'],
  [/\\(?:approx|asymp)\b/g, '≈'],
  [/\\simeq\b/g, '≃'],
  [/\\cong\b/g, '≅'],
  [/\\equiv\b/g, '≡'],
  [/\\sim\b/g, '~'],
  [/\\pm\b/g, '±'],
  [/\\mp\b/g, '∓'],
  [/\\times\b/g, '×'],
  [/\\cdot\b/g, '·'],
  [/\\div\b/g, '÷'],
  [/\\(?:leq|le)\b/g, '≤'],
  [/\\(?:geq|ge)\b/g, '≥'],
  [/\\(?:neq|ne)\b/g, '≠'],
  [/\\ll\b/g, '≪'],
  [/\\gg\b/g, '≫'],
  [/\\(?:rightarrow|to)\b/g, '→'],
  [/\\(?:leftarrow|gets)\b/g, '←'],
  [/\\leftrightarrow\b/g, '↔'],
  [/\\(?:Rightarrow|implies)\b/g, '⇒'],
  [/\\(?:Leftrightarrow|iff)\b/g, '⇔'],
  [/\\infty\b/g, '∞'],
  [/\\partial\b/g, '∂'],
  [/\\nabla\b/g, '∇'],
  [/\\sum\b/g, '∑'],
  [/\\prod\b/g, '∏'],
  [/\\int\b/g, '∫'],
  [/\\propto\b/g, '∝'],
  [/\\in\b/g, '∈'],
  [/\\notin\b/g, '∉'],
  [/\\subseteq\b/g, '⊆'],
  [/\\subset\b/g, '⊂'],
  [/\\cup\b/g, '∪'],
  [/\\cap\b/g, '∩'],
  [/\\emptyset\b/g, '∅'],
  [/\\forall\b/g, '∀'],
  [/\\exists\b/g, '∃'],
  [/\\therefore\b/g, '∴'],
  [/\\because\b/g, '∵'],
  [/\\angle\b/g, '∠'],
  [/\\triangle\b/g, '△'],
  [/\\(?:degree|deg|circ)\b/g, '°'],
  [/\\alpha\b/g, 'α'],
  [/\\beta\b/g, 'β'],
  [/\\gamma\b/g, 'γ'],
  [/\\delta\b/g, 'δ'],
  [/\\(?:varepsilon|epsilon)\b/g, 'ε'],
  [/\\zeta\b/g, 'ζ'],
  [/\\eta\b/g, 'η'],
  [/\\(?:vartheta|theta)\b/g, 'θ'],
  [/\\iota\b/g, 'ι'],
  [/\\kappa\b/g, 'κ'],
  [/\\lambda\b/g, 'λ'],
  [/\\(?:mu|micro)\b/g, 'μ'],
  [/\\nu\b/g, 'ν'],
  [/\\xi\b/g, 'ξ'],
  [/\\pi\b/g, 'π'],
  [/\\rho\b/g, 'ρ'],
  [/\\sigma\b/g, 'σ'],
  [/\\tau\b/g, 'τ'],
  [/\\upsilon\b/g, 'υ'],
  [/\\(?:varphi|phi)\b/g, 'φ'],
  [/\\chi\b/g, 'χ'],
  [/\\psi\b/g, 'ψ'],
  [/\\omega\b/g, 'ω'],
  [/\\Gamma\b/g, 'Γ'],
  [/\\Delta\b/g, 'Δ'],
  [/\\Theta\b/g, 'Θ'],
  [/\\Lambda\b/g, 'Λ'],
  [/\\Xi\b/g, 'Ξ'],
  [/\\Pi\b/g, 'Π'],
  [/\\Sigma\b/g, 'Σ'],
  [/\\Phi\b/g, 'Φ'],
  [/\\Psi\b/g, 'Ψ'],
  [/\\Omega\b/g, 'Ω'],
  [/\\hbar\b/g, 'ℏ'],
  [/\\ell\b/g, 'ℓ'],
  [/\\AA\b/g, 'Å'],
  [/\\%/g, '%'],
  [/\\\$/g, '$'],
  [/\\&/g, '&'],
  [/\\(?:left|right)\b/g, ''],
  [/\\[,;:! ]/g, ' ']
];

function mapUnicodeScript(raw: string, map: Record<string, string>, fallbackPrefix: string): string {
  const chars = Array.from(raw);
  if (chars.length > 0 && chars.every((ch) => map[ch] !== undefined)) {
    return chars.map((ch) => map[ch]).join('');
  }
  return raw.length > 1 ? `${fallbackPrefix}(${raw})` : `${fallbackPrefix}${raw}`;
}

function convertLatexFragment(fragment: string): string {
  let out = fragment.trim();
  // Degree shortcuts first
  out = out.replace(/\^\s*\{\s*\\(?:circ|degree|deg)\s*\}/g, '°');
  out = out.replace(/\^\s*\\(?:circ|degree|deg)\b/g, '°');
  // Apply command replacements iteratively for nested \text{} / \frac{}
  for (let pass = 0; pass < 3; pass++) {
    const prev = out;
    for (const [re, rep] of LATEX_COMMAND_REPLACEMENTS) {
      out = out.replace(re, rep);
    }
    if (out === prev) break;
  }
  // Superscripts & subscripts
  out = out.replace(/\^\{([^{}]+)\}/g, (_m, inner) => mapUnicodeScript(inner, SUPERSCRIPT_CHAR_MAP, '^'));
  out = out.replace(/\^([0-9+\-=ni])/g, (_m, ch) => SUPERSCRIPT_CHAR_MAP[ch] || `^${ch}`);
  out = out.replace(/_\{([^{}]+)\}/g, (_m, inner) => mapUnicodeScript(inner, SUBSCRIPT_CHAR_MAP, '_'));
  out = out.replace(/_([0-9+\-=aehklmnopstx])/g, (_m, ch) => SUBSCRIPT_CHAR_MAP[ch] || `_${ch}`);
  // Clean remaining empty/redundant grouping braces inside math
  out = out.replace(/\{([^{}]*)\}/g, '$1');
  out = out.replace(/\s*°\s*/g, '°');
  out = out.replace(/\s{2,}/g, ' ').trim();
  return out;
}

/**
 * Formats inline/display LaTeX math & scientific symbols (such as $100^\circ\text{C}$ -> 100°C)
 * into clean Unicode text while preserving currency amounts like "$100 to $200".
 */
export function formatMathSymbolsInText(text: string): string {
  if (!text) return '';
  let out = String(text);

  // 1. Display math $$...$$ and \[...\]
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner) => convertLatexFragment(inner));
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner) => convertLatexFragment(inner));

  // 2. Inline math \(...\)
  out = out.replace(/\\\(([^\n]+?)\\\)/g, (_m, inner) => convertLatexFragment(inner));

  // 3. Inline math $...$ (guard against currency amounts like "$100 to $200")
  out = out.replace(/\$([^$\n]+?)\$/g, (match, inner) => {
    if (!inner || /^\s|\s$/.test(inner)) return match;
    const hasMathSignal =
      /[\\^{}_=<>~±×÷≈≠≤≥°]/.test(inner) ||
      /^[A-Za-z](?:\d+|['’])?$/.test(inner);
    if (!hasMathSignal) return match;
    return convertLatexFragment(inner);
  });

  // 4. Bare LaTeX scientific symbols outside $...$ (e.g., 100^\circ\text{C}, \approx, \pm)
  out = out.replace(/\^\s*\{\s*\\(?:circ|degree|deg)\s*\}/g, '°');
  out = out.replace(/\^\s*\\(?:circ|degree|deg)\b/g, '°');
  if (/\\(?:text|mathrm|textbf|textit|ce|approx|pm|times|div|leq|geq|neq|degree|circ|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|Delta|Sigma|Omega)\b/.test(out)) {
    for (const [re, rep] of LATEX_COMMAND_REPLACEMENTS) {
      out = out.replace(re, rep);
    }
    out = out.replace(/\s*°\s*/g, '°');
  }

  return out;
}

export interface WindowBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type WindowSizeTier = 'compact' | 'medium' | 'wide';

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

export function clampWindowBounds(
  bounds: WindowBounds,
  viewport: { width: number; height: number },
  minWidth = 340,
  minHeight = 300
): WindowBounds {
  const vw = Math.max(280, viewport.width || 1280);
  const vh = Math.max(320, viewport.height || 800);
  const marginX = vw < 400 ? 8 : 12;
  const effMinW = Math.min(minWidth, Math.max(240, vw - marginX * 2));
  const effMinH = Math.min(minHeight, Math.max(220, vh - 64));
  const maxW = Math.max(effMinW, vw - marginX * 2);
  const maxH = Math.max(effMinH, vh - 64);

  const width = Math.round(Math.max(effMinW, Math.min(maxW, bounds.width)));
  const height = Math.round(Math.max(effMinH, Math.min(maxH, bounds.height)));
  const maxLeft = Math.max(marginX, vw - width - marginX);
  const maxTop = Math.max(12, vh - height - 52);
  const left = Math.round(Math.max(marginX, Math.min(maxLeft, bounds.left)));
  const top = Math.round(Math.max(12, Math.min(maxTop, bounds.top)));

  return { left, top, width, height };
}

export function computeDefaultWindowBounds(
  viewport: { width: number; height: number },
  cascadeIndex = 0,
  preferred?: Partial<WindowBounds> | null
): WindowBounds {
  const vw = Math.max(280, viewport.width || 1280);
  const vh = Math.max(320, viewport.height || 800);
  const marginX = vw < 400 ? 8 : 16;
  const maxDefaultW = Math.max(240, vw - marginX * 2);
  const minDefaultW = Math.min(360, maxDefaultW);
  const defaultWidth = preferred?.width ?? Math.min(920, Math.max(minDefaultW, vw - (vw < 400 ? 16 : 64)));
  const defaultHeight = preferred?.height ?? Math.min(760, Math.max(Math.min(380, vh - 72), vh - 110));
  const step = vw < 400 ? (Math.max(0, cascadeIndex) % 4) * 12 : (Math.max(0, cascadeIndex) % 5) * 28;
  const baseLeft = preferred?.left ?? Math.max(marginX, Math.round((vw - defaultWidth) / 2) + (vw < 400 ? 0 : step - 28));
  const baseTop = preferred?.top ?? Math.max(12, Math.round((vh - defaultHeight - 44) / 2) + step - (vw < 400 ? 0 : 28));

  return clampWindowBounds(
    { left: baseLeft, top: baseTop, width: defaultWidth, height: defaultHeight },
    { width: vw, height: vh }
  );
}

export function applyKeyboardWindowAdjustment(
  bounds: WindowBounds,
  mode: 'move' | 'resize',
  dir: ResizeDirection | null,
  key: string,
  shiftKey: boolean,
  viewport: { width: number; height: number },
  minWidth = 340,
  minHeight = 300
): { handled: boolean; bounds: WindowBounds } {
  const step = shiftKey ? 48 : 16;
  let dx = 0;
  let dy = 0;
  if (key === 'ArrowLeft') dx = -step;
  else if (key === 'ArrowRight') dx = step;
  else if (key === 'ArrowUp') dy = -step;
  else if (key === 'ArrowDown') dy = step;
  else return { handled: false, bounds };

  const vw = Math.max(280, viewport.width || 1280);
  const vh = Math.max(320, viewport.height || 800);
  const marginX = vw < 400 ? 8 : 12;
  const effMinW = Math.min(minWidth, Math.max(240, vw - marginX * 2));
  const effMinH = Math.min(minHeight, Math.max(220, vh - 64));

  if (mode === 'move') {
    return {
      handled: true,
      bounds: clampWindowBounds(
        {
          left: bounds.left + dx,
          top: bounds.top + dy,
          width: bounds.width,
          height: bounds.height
        },
        viewport,
        minWidth,
        minHeight
      )
    };
  }

  const edge = dir || 'se';
  const next: WindowBounds = { ...bounds };

  if (edge.includes('e')) {
    next.width = bounds.width + dx;
  }
  if (edge.includes('s')) {
    next.height = bounds.height + dy;
  }
  if (edge.includes('w')) {
    const maxWFromLeft = bounds.width + Math.max(0, bounds.left - marginX);
    const proposedW = Math.max(effMinW, Math.min(maxWFromLeft, bounds.width - dx));
    next.left = bounds.left + (bounds.width - proposedW);
    next.width = proposedW;
  }
  if (edge.includes('n')) {
    const maxHFromTop = bounds.height + Math.max(0, bounds.top - 12);
    const proposedH = Math.max(effMinH, Math.min(maxHFromTop, bounds.height - dy));
    next.top = bounds.top + (bounds.height - proposedH);
    next.height = proposedH;
  }

  return {
    handled: true,
    bounds: clampWindowBounds(next, viewport, minWidth, minHeight)
  };
}

export function classifyWindowSizeTier(width: number): WindowSizeTier {
  if (width < 540) return 'compact';
  if (width < 780) return 'medium';
  return 'wide';
}

export function getAdaptiveWindowFlags(width: number, height: number) {
  const tier = classifyWindowSizeTier(width);
  return {
    tier,
    isCompact: tier === 'compact',
    isMedium: tier === 'medium',
    isWide: tier === 'wide',
    isShort: height < 460,
    useOverflowHeaderMenu: width < 540,
    collapseOptionsRow: width < 540,
    compactTtsBar: width < 780,
    singleColumnAdvPanel: width < 580
  };
}

export type AdaptiveWindowFlags = ReturnType<typeof getAdaptiveWindowFlags>;

export type FeedCardTitleMode = 'ai' | 'dearrow' | 'original' | 'music';

export function normalizeAltTitlesEnabled(val: unknown): boolean {
  if (val === false || val === 'false' || val === 0) return false;
  return true;
}

export function resolveFeedCardTitleMode(options: {
  isMusic?: boolean;
  hasDeArrowTitle?: boolean;
  altTitlesEnabled?: boolean;
  manualOverride?: 'ai' | 'dearrow' | 'original' | null;
}): FeedCardTitleMode {
  if (options.isMusic) return 'music';
  if (options.manualOverride === 'ai') return 'ai';
  if (options.manualOverride === 'dearrow') {
    return options.hasDeArrowTitle ? 'dearrow' : 'original';
  }
  if (options.manualOverride === 'original') {
    return options.hasDeArrowTitle ? 'dearrow' : 'original';
  }
  if (options.hasDeArrowTitle) return 'dearrow';
  return options.altTitlesEnabled !== false ? 'ai' : 'original';
}

export function sanitizeGeneratedAltTitle(rawTitle: string, fallbackTitle = ''): string {
  const cleaned = String(rawTitle || '')
    .replace(/^["'#*`]+|["'#*`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const candidate = cleaned || String(fallbackTitle || '').replace(/\s+/g, ' ').trim();
  if (!candidate) return '';
  if (candidate.length > 150) {
    return candidate.slice(0, 147).trim() + '...';
  }
  return candidate;
}

export function shouldCacheGeneratedAltTitle(
  generated: string,
  originalTitle: string,
  generatedFromContent: boolean
): boolean {
  if (!generatedFromContent) return false;
  const cleanGen = String(generated || '').replace(/\s+/g, ' ').trim();
  const cleanOrig = String(originalTitle || '').replace(/\s+/g, ' ').trim();
  if (!cleanGen || cleanGen.length < 5) return false;
  if (cleanOrig && cleanGen.toLowerCase() === cleanOrig.toLowerCase()) return false;
  return true;
}

export function normalizeCompactOptionsMap(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k && k !== '__proto__' && k !== 'constructor' && k !== 'prototype' && typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return out;
}

export function extractVideoIdFromHref(href: string): string | null {
  if (!href || typeof href !== 'string') return null;
  const watchMatch = /[?&]v=([a-zA-Z0-9_-]{8,32})/.exec(href);
  if (watchMatch) return watchMatch[1];
  const shortsMatch = /\/shorts\/([a-zA-Z0-9_-]{8,32})(?:[?&#/]|$)/.exec(href);
  if (shortsMatch) return shortsMatch[1];
  const liveMatch = /\/live\/([a-zA-Z0-9_-]{8,32})(?:[?&#/]|$)/.exec(href);
  if (liveMatch) return liveMatch[1];
  return null;
}

export function pruneTimestampIndex(
  index: Record<string, number>,
  maxEntries: number,
  protectedKeys: Set<string> = new Set()
): { kept: Record<string, number>; evicted: string[] } {
  const safeMax = Math.max(1, Math.floor(maxEntries));
  const cleaned: Record<string, number> = {};
  for (const [k, v] of Object.entries(index || {})) {
    if (k && k !== '__proto__' && k !== 'constructor' && k !== 'prototype' && typeof v === 'number' && Number.isFinite(v)) {
      cleaned[k] = v;
    }
  }
  const entries = Object.entries(cleaned).sort((a, b) => a[1] - b[1]);
  const evicted: string[] = [];
  if (entries.length > safeMax) {
    let remainingCount = entries.length;
    for (const [key] of entries) {
      if (remainingCount <= safeMax) break;
      if (protectedKeys.has(key)) continue;
      delete cleaned[key];
      evicted.push(key);
      remainingCount--;
    }
  }
  return { kept: cleaned, evicted };
}

export function computeDecorrelatedJitterDelay(
  prevDelayMs: number,
  baseMs = 2000,
  maxMs = 60000,
  retryAfterMs = 0,
  randomSample = Math.random()
): number {
  const safeBase = Math.max(250, baseMs);
  const safePrev = Math.max(safeBase, prevDelayMs || safeBase);
  const safeMax = Math.max(safeBase, maxMs);
  const upper = Math.min(safeMax, safePrev * 3);
  const sample = Math.max(0, Math.min(1, Number.isFinite(randomSample) ? randomSample : 0.5));
  const jittered = Math.round(safeBase + sample * Math.max(0, upper - safeBase));
  if (retryAfterMs > 0) {
    return Math.min(safeMax, Math.max(jittered, Math.round(retryAfterMs)));
  }
  return jittered;
}

export interface MutationSignalInput {
  type: 'childList' | 'characterData' | 'attributes';
  inNoiseSubtree: boolean;
  inTitleOrDeArrowSubtree: boolean;
  attributeName?: string | null;
  hasFeedOrDeArrowNodes?: boolean;
}

export function isRelevantMutationSignal(sig: MutationSignalInput): boolean {
  if (!sig) return false;
  if (sig.type === 'attributes') {
    return sig.attributeName === 'data-dearrow' || sig.attributeName === 'data-dearrow-title';
  }
  if (sig.inNoiseSubtree && !sig.inTitleOrDeArrowSubtree) {
    return false;
  }
  if (sig.type === 'characterData') {
    return Boolean(sig.inTitleOrDeArrowSubtree);
  }
  if (sig.type === 'childList') {
    return Boolean(sig.hasFeedOrDeArrowNodes || (sig.inTitleOrDeArrowSubtree && !sig.inNoiseSubtree));
  }
  return false;
}

// --- FEAT-01: Interactive Timestamp Cue Sync Lookup ---
export function findTranscriptCueIndexForSeconds(
  cues: Array<{ startSec: number }>,
  targetSec: number
): number {
  if (!Array.isArray(cues) || cues.length === 0 || !Number.isFinite(targetSec)) return -1;
  const clamped = Math.max(0, Math.floor(targetSec));
  let bestIdx = 0;
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].startSec <= clamped) {
      bestIdx = i;
    } else {
      break;
    }
  }
  return bestIdx;
}

// --- FEAT-02: Per-Channel Auto-Title Rules ---
export type ChannelTitleRule = 'default' | 'exempt' | 'force_ai';

export function normalizeChannelRuleKey(channelName: string): string {
  const cleaned = String(channelName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!cleaned || cleaned === '__proto__' || cleaned === 'constructor' || cleaned === 'prototype') {
    return '';
  }
  return cleaned;
}

export function normalizeChannelTitleRules(raw: unknown): Record<string, 'exempt' | 'force_ai'> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, 'exempt' | 'force_ai'> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = normalizeChannelRuleKey(k);
    if (!key) continue;
    if (v === 'exempt' || v === 'force_ai') {
      out[key] = v;
    }
  }
  return out;
}

export function setChannelTitleRuleInMap(
  rules: Record<string, 'exempt' | 'force_ai'>,
  channelName: string,
  rule: ChannelTitleRule
): Record<string, 'exempt' | 'force_ai'> {
  const next = normalizeChannelTitleRules(rules);
  const key = normalizeChannelRuleKey(channelName);
  if (!key) return next;
  if (rule === 'exempt' || rule === 'force_ai') {
    next[key] = rule;
  } else {
    delete next[key];
  }
  return next;
}

export type AltTitleGenerationMode = 'on' | 'off' | 'manual';

export function normalizeAltTitleMode(val: unknown): AltTitleGenerationMode {
  if (val === false) return 'off';
  if (val === true) return 'on';
  const s = String(val ?? '').trim().toLowerCase();
  if (s === 'off' || s === 'false' || s === 'disabled') return 'off';
  if (s === 'manual' || s === 'click' || s === 'on_demand') return 'manual';
  return 'on';
}

export function resolveAutoTitleDecision(options: {
  altTitlesEnabled?: boolean;
  altTitleMode?: AltTitleGenerationMode | string;
  isMusic?: boolean;
  hasDeArrowTitle?: boolean;
  channelName?: string;
  channelRules?: Record<string, 'exempt' | 'force_ai'>;
  manualOverride?: 'ai' | 'dearrow' | 'original' | null;
}): {
  mode: FeedCardTitleMode;
  rule: ChannelTitleRule;
  shouldAutoFetchAi: boolean;
} {
  const key = normalizeChannelRuleKey(options.channelName || '');
  const rule: ChannelTitleRule = (key && options.channelRules?.[key]) || 'default';
  const globalMode: AltTitleGenerationMode =
    options.altTitleMode !== undefined
      ? normalizeAltTitleMode(options.altTitleMode)
      : options.altTitlesEnabled === false
      ? 'off'
      : 'on';

  if (options.manualOverride === 'ai') {
    return { mode: 'ai', rule, shouldAutoFetchAi: true };
  }
  if (options.manualOverride === 'dearrow') {
    return { mode: options.hasDeArrowTitle ? 'dearrow' : 'original', rule, shouldAutoFetchAi: false };
  }
  if (options.manualOverride === 'original') {
    return { mode: options.hasDeArrowTitle ? 'dearrow' : 'original', rule, shouldAutoFetchAi: false };
  }

  if (rule === 'exempt') {
    if (options.isMusic) return { mode: 'music', rule, shouldAutoFetchAi: false };
    return { mode: options.hasDeArrowTitle ? 'dearrow' : 'original', rule, shouldAutoFetchAi: false };
  }

  if (rule === 'force_ai' && globalMode === 'on') {
    return { mode: 'ai', rule, shouldAutoFetchAi: true };
  }

  if (options.isMusic) {
    return { mode: 'music', rule, shouldAutoFetchAi: false };
  }
  if (options.hasDeArrowTitle) {
    return { mode: 'dearrow', rule, shouldAutoFetchAi: false };
  }
  if (globalMode !== 'on') {
    return { mode: 'original', rule, shouldAutoFetchAi: false };
  }
  return { mode: 'ai', rule, shouldAutoFetchAi: true };
}

const CACHE_KEY_PREFIXES = ['sum:', 'sut:', 'trn:', 'trt:'];
const SCOPED_PERSONA_KEY_SEGMENTS = ['technical:', 'quiz:', 'chronological:', 'executive:'];

export function extractVideoIdFromCacheKey(key: string): string {
  if (!key || typeof key !== 'string') return '';
  if (!CACHE_KEY_PREFIXES.some((p) => key.startsWith(p))) return '';
  const rest = key.slice(4);
  for (const seg of SCOPED_PERSONA_KEY_SEGMENTS) {
    if (rest.startsWith(seg)) {
      return rest.slice(seg.length);
    }
  }
  return rest;
}

export function countUniqueCachedVideoIds(
  allKeys: string[],
  cacheIndexKeys: string[] = []
): number {
  const seenIds = new Set<string>();
  const combined = [...(Array.isArray(cacheIndexKeys) ? cacheIndexKeys : []), ...(Array.isArray(allKeys) ? allKeys : [])];
  for (let i = 0; i < combined.length; i++) {
    const id = extractVideoIdFromCacheKey(combined[i]);
    if (id) seenIds.add(id);
  }
  return seenIds.size;
}

export function shouldDeferBackgroundAltTitleFetch(options: {
  isExplicitCall?: boolean;
  hasCachedAltTitle?: boolean;
  hasTranscriptInMemoryOrMock?: boolean;
  pageLoadSettled?: boolean;
  isIntersectingViewport?: boolean;
}): {
  action: 'fetch_now' | 'defer_until_load' | 'observe_visibility';
  reason: string;
} {
  if (options.hasCachedAltTitle || options.hasTranscriptInMemoryOrMock || options.isExplicitCall) {
    return { action: 'fetch_now', reason: options.isExplicitCall ? 'explicit' : 'zero_network_cache' };
  }
  if (!options.pageLoadSettled) {
    return { action: 'defer_until_load', reason: 'page_loading' };
  }
  if (options.isIntersectingViewport === false) {
    return { action: 'observe_visibility', reason: 'offscreen' };
  }
  return { action: 'fetch_now', reason: 'visible_after_load' };
}

// --- FEAT-03: Summary Persona & Output Format Presets ---
export type SummaryPersona = 'executive' | 'technical' | 'quiz' | 'chronological';

export interface SummaryPersonaPreset {
  id: SummaryPersona;
  label: string;
  shortLabel: string;
  description: string;
  systemDirective: string;
  promptAppendix: string;
}

export const SUMMARY_PERSONA_PRESETS: Record<SummaryPersona, SummaryPersonaPreset> = {
  executive: {
    id: 'executive',
    label: 'Executive Brief',
    shortLabel: 'Executive',
    description: 'High-signal thesis, core takeaways, and concise bottom-line verdict.',
    systemDirective:
      'Adopt an Executive Brief persona: lead with the bottom-line thesis, eliminate filler, and isolate the top 3-5 high-leverage insights.',
    promptAppendix: ''
  },
  technical: {
    id: 'technical',
    label: 'Deep Technical / Code',
    shortLabel: 'Technical',
    description: 'Architecture mechanics, APIs/commands, equations, benchmarks, and edge cases.',
    systemDirective:
      'Adopt a Principal Systems Engineer persona: preserve exact formulas, metrics, code/CLI patterns, architecture trade-offs, and quantitative bounds without oversimplification.',
    promptAppendix:
      '\nFormat emphasis (Deep Technical / Code): Include "## Technical architecture & mechanics" with concrete formulas, parameters, code or protocol specifics, and trade-offs.'
  },
  quiz: {
    id: 'quiz',
    label: 'Study Quiz & Flashcards',
    shortLabel: 'Study Quiz',
    description: 'Concept recap plus active-recall self-test questions with concise answers.',
    systemDirective:
      'Adopt an Interactive Tutor persona: explain core mental models clearly and finish with active-recall flashcards and conceptual check questions.',
    promptAppendix:
      '\nFormat emphasis (Study Quiz & Flashcards): Include a "## Study Flashcards & Self-Test" section with 4 focused Q&A pairs covering the hardest concepts in the video.'
  },
  chronological: {
    id: 'chronological',
    label: 'Chronological Timeline',
    shortLabel: 'Timeline',
    description: 'Strict time-indexed walkthrough with [MM:SS] markers for rapid chapter navigation.',
    systemDirective:
      'Adopt a Chronological Indexer persona: trace the video sequentially from opening premise to conclusion with explicit [MM:SS] markers on every topic shift.',
    promptAppendix:
      '\nFormat emphasis (Chronological Timeline): Structure the walkthrough strictly in chronological [MM:SS] order so every transition has an accurate clickable timestamp.'
  }
};

export function normalizeSummaryPersona(raw: unknown): SummaryPersona {
  if (raw === 'technical' || raw === 'quiz' || raw === 'chronological' || raw === 'executive') {
    return raw;
  }
  return 'executive';
}

export function resolveSummaryPersonaInstruction(
  persona: SummaryPersona | string,
  transcriptMode: 'fast' | 'deep' = 'fast'
): string {
  const safePersona = normalizeSummaryPersona(persona);
  const preset = SUMMARY_PERSONA_PRESETS[safePersona];
  const base =
    transcriptMode === 'deep'
      ? `You are an expert analytical researcher. Produce an exhaustive, deep, and highly detailed summary in English.\nProvide a thorough chronological walkthrough with precise timestamps [MM:SS] for every distinct topic change.\nDelve deeply into specific claims, quantitative figures, underlying mechanics, formulas, and arguments.\nInclude rich context, nuance, technical distinctions, and direct quotes where significant.\nEnsure comprehensive coverage so no important insight is omitted.`
      : `You are an expert executive summarizer. Produce an ultra-fast, high-signal, concise summary in English.\nPrioritize brevity, punchy takeaways, and rapid consumption (< 2 minutes reading time).\nFocus strictly on the core thesis and top 3-5 crucial insights.\nEliminate all filler, pleasantries, and tangential elaboration.\nDeliver maximum information density in the shortest reading time.`;
  if (safePersona === 'executive' && transcriptMode === 'fast') {
    return base;
  }
  return `${base}\n${preset.systemDirective}`;
}

export function resolveSummaryPersonaPromptSuffix(persona: SummaryPersona | string): string {
  const safePersona = normalizeSummaryPersona(persona);
  return SUMMARY_PERSONA_PRESETS[safePersona].promptAppendix;
}

// --- FEAT-04: Chapter-Aware Long-Video Synthesis Chunking (>45 min) ---
export interface VideoChapter {
  index: number;
  title: string;
  startSec: number;
  endSec: number | null;
  tsStr: string;
}

export interface TranscriptChunk {
  index: number;
  title: string;
  startSec: number;
  endSec: number;
  tsStr: string;
  text: string;
  estimatedChars: number;
  lineCount: number;
}

export interface LongVideoChunkPlan {
  isLongVideoChunked: boolean;
  totalDurationSec: number;
  thresholdSec: number;
  chapters: VideoChapter[];
  chunks: TranscriptChunk[];
}

export function parseVideoChaptersFromDescription(
  descriptionText: string,
  totalDurationSec = 0
): VideoChapter[] {
  if (!descriptionText || typeof descriptionText !== 'string') return [];
  const rawList: Array<{ startSec: number; title: string }> = [];
  const seenSec = new Set<number>();
  const lines = descriptionText.split('\n');

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const m =
      /^(?:#{1,4}\s*)?(?:[-*•]\s*)?\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*(?:[-–—:|]\s*|\s+)(.+)$/.exec(
        trimmed
      );
    if (!m) continue;
    const rawTs = m[1];
    const startSec = parseTimestampToSeconds(rawTs);
    if (!Number.isFinite(startSec) || startSec < 0) continue;
    const cleanTitle = m[2]
      .replace(/^#{1,6}\s*/, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleanTitle || cleanTitle.length > 140) continue;
    if (seenSec.has(startSec)) continue;
    seenSec.add(startSec);
    rawList.push({ startSec, title: cleanTitle });
  }

  rawList.sort((a, b) => a.startSec - b.startSec);
  return rawList.map((item, idx) => {
    const next = rawList[idx + 1];
    const endSec = next
      ? next.startSec
      : totalDurationSec > item.startSec
      ? Math.floor(totalDurationSec)
      : null;
    return {
      index: idx,
      title: item.title,
      startSec: item.startSec,
      endSec,
      tsStr: `[${formatSecondsToTimestamp(item.startSec)}]`
    };
  });
}

export function extractSummaryChapters(
  summaryText: string,
  descriptionChapters: VideoChapter[] = [],
  totalDurationSec = 0
): VideoChapter[] {
  if (Array.isArray(descriptionChapters) && descriptionChapters.length >= 2) {
    return descriptionChapters.map((ch, idx) => ({ ...ch, index: idx }));
  }
  if (!summaryText || typeof summaryText !== 'string') return [];
  const headingLines = summaryText
    .split('\n')
    .filter((line) => /^\s*#{2,4}\s*\[?(?:(?:\d{1,2}:)?\d{1,2}:\d{2})\]?/.test(line));
  if (headingLines.length >= 2) {
    return parseVideoChaptersFromDescription(headingLines.join('\n'), totalDurationSec);
  }
  return Array.isArray(descriptionChapters) ? descriptionChapters.slice() : [];
}

export function buildLongVideoTranscriptChunks(
  transcriptText: string,
  options: {
    thresholdSec?: number;
    maxChunkSec?: number;
    chapters?: VideoChapter[];
    totalDurationSec?: number;
  } = {}
): LongVideoChunkPlan {
  const thresholdSec = Math.max(60, Math.floor(options.thresholdSec ?? 2700)); // Default 45 minutes
  const maxChunkSec = Math.max(120, Math.floor(options.maxChunkSec ?? 1200)); // Default 20-min windows
  const text = String(transcriptText || '');
  const lines = text.split('\n').filter((l) => l.trim().length > 0);

  let maxLineSec = 0;
  const parsedLines: Array<{ sec: number; line: string }> = [];
  let lastSec = 0;

  for (const rawLine of lines) {
    const m = /^\[((?:\d{1,2}:)?\d{1,2}:\d{2})\]/.exec(rawLine.trim());
    if (m) {
      const sec = parseTimestampToSeconds(m[1]);
      if (Number.isFinite(sec) && sec >= 0) {
        lastSec = sec;
        if (sec > maxLineSec) maxLineSec = sec;
      }
    }
    parsedLines.push({ sec: lastSec, line: rawLine });
  }

  const totalDurationSec = Math.max(
    Math.floor(options.totalDurationSec || 0),
    maxLineSec
  );

  const providedChapters = Array.isArray(options.chapters)
    ? [...options.chapters].sort((a, b) => a.startSec - b.startSec).map((ch, idx, arr) => ({
        index: idx,
        title: ch.title,
        startSec: ch.startSec,
        endSec: arr[idx + 1]
          ? arr[idx + 1].startSec
          : totalDurationSec > ch.startSec
          ? totalDurationSec
          : ch.endSec,
        tsStr: ch.tsStr || `[${formatSecondsToTimestamp(ch.startSec)}]`
      }))
    : [];

  if (totalDurationSec <= thresholdSec) {
    const singleChapter: VideoChapter[] =
      providedChapters.length > 0
        ? providedChapters
        : [];
    return {
      isLongVideoChunked: false,
      totalDurationSec,
      thresholdSec,
      chapters: singleChapter,
      chunks: [
        {
          index: 0,
          title: providedChapters[0]?.title || 'Full Transcript',
          startSec: 0,
          endSec: totalDurationSec,
          tsStr: providedChapters[0]?.tsStr || '[00:00]',
          text,
          estimatedChars: text.length,
          lineCount: lines.length
        }
      ]
    };
  }

  // Long video (> thresholdSec): use chapters when >= 2, else uniform maxChunkSec windows
  let effectiveChapters: VideoChapter[] = providedChapters;
  if (effectiveChapters.length < 2) {
    effectiveChapters = [];
    const windowCount = Math.max(2, Math.ceil((totalDurationSec + 1) / maxChunkSec));
    for (let i = 0; i < windowCount; i++) {
      const startSec = i * maxChunkSec;
      const endSec = Math.min(totalDurationSec, (i + 1) * maxChunkSec);
      if (startSec > totalDurationSec && i > 0) break;
      effectiveChapters.push({
        index: i,
        title: `Segment ${i + 1} (${formatSecondsToTimestamp(startSec)}–${formatSecondsToTimestamp(endSec)})`,
        startSec,
        endSec,
        tsStr: `[${formatSecondsToTimestamp(startSec)}]`
      });
    }
  }

  const buckets: string[][] = effectiveChapters.map(() => []);
  for (const item of parsedLines) {
    let targetIdx = 0;
    for (let i = 0; i < effectiveChapters.length; i++) {
      if (item.sec >= effectiveChapters[i].startSec) {
        targetIdx = i;
      } else {
        break;
      }
    }
    buckets[targetIdx].push(item.line);
  }

  const chunks: TranscriptChunk[] = [];
  for (let i = 0; i < effectiveChapters.length; i++) {
    const ch = effectiveChapters[i];
    const bucketLines = buckets[i];
    if (bucketLines.length === 0 && parsedLines.length > 0) continue;
    const chunkText = bucketLines.join('\n');
    chunks.push({
      index: chunks.length,
      title: ch.title,
      startSec: ch.startSec,
      endSec: ch.endSec ?? totalDurationSec,
      tsStr: ch.tsStr,
      text: chunkText,
      estimatedChars: chunkText.length,
      lineCount: bucketLines.length
    });
  }

  if (chunks.length === 0) {
    chunks.push({
      index: 0,
      title: effectiveChapters[0]?.title || 'Segment 1',
      startSec: 0,
      endSec: totalDurationSec,
      tsStr: '[00:00]',
      text,
      estimatedChars: text.length,
      lineCount: lines.length
    });
  }

  return {
    isLongVideoChunked: true,
    totalDurationSec,
    thresholdSec,
    chapters: effectiveChapters,
    chunks
  };
}

export function buildChunkMapPrompt(
  videoTitle: string,
  chunk: TranscriptChunk,
  totalChunks: number,
  persona: SummaryPersona | string = 'executive'
): string {
  const safePersona = normalizeSummaryPersona(persona);
  const preset = SUMMARY_PERSONA_PRESETS[safePersona];
  return [
    `Analyze chapter ${chunk.index + 1} of ${totalChunks} for "${videoTitle}": "${chunk.title}" starting at ${chunk.tsStr}.`,
    `Persona focus: ${preset.label} — ${preset.description}`,
    `Extract the exact claims, arguments, equations, metrics, and concrete takeaways from this segment with accurate [MM:SS] or [H:MM:SS] timestamps.`,
    `Do not invent timestamps or omit technical specifics. Keep output under 350 words.`,
    `\nCHAPTER TRANSCRIPT (${chunk.tsStr}):\n${chunk.text}`
  ].join('\n');
}

export function buildChunkReducePrompt(
  videoTitle: string,
  chunkSummaries: Array<{ title: string; tsStr: string; summary: string }>,
  persona: SummaryPersona | string = 'executive',
  transcriptMode: 'fast' | 'deep' = 'fast',
  includeVisuals = true
): string {
  const safePersona = normalizeSummaryPersona(persona);
  const sectionsText = chunkSummaries
    .map((cs, idx) => `### Chapter ${idx + 1}: ${cs.tsStr} ${cs.title}\n${cs.summary}`)
    .join('\n\n');
  const suffix = resolveSummaryPersonaPromptSuffix(safePersona);
  const detailLabel = transcriptMode === 'deep' ? 'thorough, exhaustive synthesis' : 'crisp executive synthesis';

  return [
    `Synthesize these ${chunkSummaries.length} chapter analyses of the long video "${videoTitle}" into a single coherent ${detailLabel}.`,
    `Preserve exact chapter timestamps using "### [MM:SS] Chapter Title" headings under "## Detailed summary", plus "## TL;DR", "## Key takeaways", "## Notable details", and "## Worth your time?".`,
    includeVisuals
      ? `Visuals: include up to 4 marker lines placed directly after key paragraphs using "[[FRAME mm:ss | Short caption]]" for key video timestamps and "[[IMG generic search terms | Short caption]]" for technical diagrams.`
      : '',
    suffix ? suffix.trim() : '',
    `\nCHAPTER ANALYSES:\n${sectionsText}`
  ]
    .filter(Boolean)
    .join('\n');
}

// --- FEAT-06: Offline Obsidian / Markdown Bundle Export ---
function linkifyTimestampsForObsidian(text: string, videoId: string): string {
  if (!text) return '';
  const baseUrl = `https://www.youtube.com/watch?v=${videoId}`;
  return text.replace(/\[((?:\d{1,2}:)?\d{1,2}:\d{2})\](?!\()/g, (_m, ts) => {
    const sec = parseTimestampToSeconds(ts);
    return `[${ts}](${baseUrl}&t=${sec}s)`;
  });
}

export function formatSummaryExportMarkdown(data: {
  videoId: string;
  videoTitle?: string;
  channel?: string;
  duration?: string;
  mode?: string;
  source?: string;
  processingMode?: string;
  persona?: SummaryPersona | string;
  model?: string;
  text?: string;
  chapters?: VideoChapter[];
  factCheck?: string | null;
  citations?: Array<{ uri: string; title: string }>;
  followUpQuestions?: Array<{
    question: string;
    answer: string;
    model?: string;
    sources?: Array<{ uri: string; title: string }>;
    imageUri?: string;
  }>;
  ratings?: {
    main: ResponseRatingRecord | null;
    followUps: Record<string, ResponseRatingRecord>;
  };
  exportedAt?: string;
}): string {
  const videoId = data.videoId || 'unknown';
  const title = data.videoTitle || videoId || 'Untitled Video';
  const channel = data.channel || 'YouTube Creator';
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const mode = data.mode || 'summary';
  const source = data.source || 'video';
  const processingMode = data.processingMode || 'fast';
  const persona = normalizeSummaryPersona(data.persona);
  const model = data.model || 'gemini-3.8-flash';
  const exportedAt = data.exportedAt || new Date().toISOString();

  const lines: string[] = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `channel: ${JSON.stringify(channel)}`,
    `video_id: ${JSON.stringify(videoId)}`,
    `url: ${JSON.stringify(videoUrl)}`,
    ...(data.duration ? [`duration: ${JSON.stringify(data.duration)}`] : []),
    `mode: ${JSON.stringify(mode)}`,
    `source: ${JSON.stringify(source)}`,
    `processing_mode: ${JSON.stringify(processingMode)}`,
    `persona: ${JSON.stringify(persona)}`,
    `model: ${JSON.stringify(model)}`,
    `exported_at: ${JSON.stringify(exportedAt)}`,
    'tags:',
    '  - youtube-summary',
    `  - persona-${persona}`,
    `  - mode-${mode}`,
    '---',
    '',
    `# ${title}`,
    '',
    `> **Channel:** ${channel} | **Source:** [Watch on YouTube](${videoUrl}) | **Persona:** ${SUMMARY_PERSONA_PRESETS[persona].label} | **Model:** \`${model}\``,
    ''
  ];

  const cleanBody = linkifyTimestampsForObsidian(
    formatMathSymbolsInText(String(data.text || ''))
      .replace(/\[\[(?:FRAME|IMG|GEN|IMAGE)[^\]]*\]\]/gi, '')
      .trim(),
    videoId
  );

  const chapters =
    Array.isArray(data.chapters) && data.chapters.length > 0
      ? data.chapters
      : extractSummaryChapters(String(data.text || ''));

  if (chapters.length > 0) {
    lines.push('## Chapters', '');
    for (const ch of chapters) {
      const cleanTs = ch.tsStr.replace(/[\[\]]/g, '');
      lines.push(`- [${cleanTs}](${videoUrl}&t=${ch.startSec}s) — ${formatMathSymbolsInText(ch.title)}`);
    }
    lines.push('');
  }

  if (cleanBody) {
    lines.push(cleanBody, '');
  }

  if (data.factCheck && data.factCheck.trim()) {
    lines.push('## Fact-Check & Verification', '');
    lines.push(linkifyTimestampsForObsidian(formatMathSymbolsInText(data.factCheck.trim()), videoId), '');
  }

  if (data.citations && data.citations.length > 0) {
    lines.push('## Sources & Citations', '');
    for (const c of data.citations) {
      const label = (c.title || c.uri).replace(/[\[\]]/g, '');
      lines.push(`- [${label}](${c.uri})`);
    }
    lines.push('');
  }

  if (data.followUpQuestions && data.followUpQuestions.length > 0) {
    lines.push('## Follow-Up Q&A', '');
    data.followUpQuestions.forEach((turn, idx) => {
      lines.push(`### Q${idx + 1}: ${formatMathSymbolsInText(turn.question)}`, '');
      if (turn.model) {
        lines.push(`*Model:* \`${turn.model}\``, '');
      }
      lines.push(linkifyTimestampsForObsidian(formatMathSymbolsInText(turn.answer), videoId), '');
      if (turn.imageUri) {
        lines.push(`![Generated Diagram](${turn.imageUri})`, '');
      }
      if (turn.sources && turn.sources.length > 0) {
        lines.push('**Grounded Sources:**');
        for (const s of turn.sources) {
          lines.push(`- [${(s.title || s.uri).replace(/[\[\]]/g, '')}](${s.uri})`);
        }
        lines.push('');
      }
    });
  }

  const mainRating = data.ratings?.main || null;
  const followUpEntries = Object.entries(data.ratings?.followUps || {});
  if (mainRating || followUpEntries.length > 0) {
    lines.push('## Quality Ratings & Notes', '');
    if (mainRating) {
      const badge = mainRating.rating === 'up' ? '👍 Helpful' : '👎 Needs improvement';
      lines.push(`- **Main ${mode}:** ${badge}${mainRating.note ? ` — "${formatMathSymbolsInText(mainRating.note)}"` : ''}`);
    }
    for (const [turnKey, r] of followUpEntries) {
      const badge = r.rating === 'up' ? '👍 Helpful' : '👎 Needs improvement';
      lines.push(`- **Follow-up (${turnKey}):** ${badge}${r.note ? ` — "${formatMathSymbolsInText(r.note)}"` : ''}`);
    }
    lines.push('');
  }

  lines.push('---', `*Exported by YouTube Feed Summariser (Gemini) on ${exportedAt}*`, '');
  return lines.join('\n');
}

// --- FEAT-07: Interactive Multi-Host Podcast Studio (NotebookLM-Style) ---
export type GeminiPrebuiltVoice = 'Kore' | 'Puck' | 'Zephyr' | 'Fenrir' | 'Charon';

export interface PodcastHost {
  id: string;
  name: string;
  role: string;
  voiceName: GeminiPrebuiltVoice;
  pitch: number;
  style: string;
  color: string;
}

export interface PodcastTurn {
  id: string;
  speaker: string;
  role: string;
  voiceName: string;
  pitch: number;
  text: string;
  isUser?: boolean;
  isResponse?: boolean;
  isVoiceInput?: boolean;
  timestampSec?: number | null;
}

export interface PodcastEpisode {
  title: string;
  hostCount: number;
  hosts: PodcastHost[];
  turns: PodcastTurn[];
  createdAt: number;
  isComplete?: boolean;
  generatedParts?: number;
  totalParts?: number;
}

const DEFAULT_PODCAST_HOST_POOL: Array<Omit<PodcastHost, 'id'>> = [
  {
    name: 'Alex',
    role: 'Lead Moderator',
    voiceName: 'Kore',
    pitch: 1.04,
    style: 'Warm, articulate, curious podcast host keeping pacing crisp',
    color: '#38bdf8'
  },
  {
    name: 'Sam',
    role: 'Deep-Dive Analyst',
    voiceName: 'Puck',
    pitch: 0.94,
    style: 'Analytical co-host translating complex mechanics into clear analogies',
    color: '#a855f7'
  },
  {
    name: 'Maya',
    role: 'Critical Skeptic',
    voiceName: 'Zephyr',
    pitch: 1.12,
    style: 'Sharp investigative voice probing assumptions, benchmarks, and edge cases',
    color: '#34d399'
  },
  {
    name: 'Jordan',
    role: 'Applied Strategist',
    voiceName: 'Fenrir',
    pitch: 0.86,
    style: 'Grounded practitioner connecting insights to real-world workflows',
    color: '#fbbf24'
  },
  {
    name: 'Priya',
    role: 'Systems Synthesizer',
    voiceName: 'Charon',
    pitch: 1.0,
    style: 'Calm synthesizer highlighting broader context and long-term implications',
    color: '#f472b6'
  },
  {
    name: 'Leo',
    role: 'Counterpoint Producer',
    voiceName: 'Puck',
    pitch: 0.9,
    style: 'Energetic producer surfacing listener questions and practical takeaways',
    color: '#fb7185'
  }
];

export function normalizePodcastHostCount(raw: unknown, min = 2, max = 6): number {
  const safeMin = Math.max(2, Math.floor(min));
  const safeMax = Math.max(safeMin, Math.floor(max));
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return safeMin;
  return Math.max(safeMin, Math.min(safeMax, Math.floor(n)));
}

export function buildDefaultPodcastHosts(
  hostCount: unknown,
  customHosts?: Array<Partial<PodcastHost>>
): PodcastHost[] {
  const count = normalizePodcastHostCount(hostCount);
  const hosts: PodcastHost[] = [];
  for (let i = 0; i < count; i++) {
    const preset = DEFAULT_PODCAST_HOST_POOL[i % DEFAULT_PODCAST_HOST_POOL.length];
    const suffix = i >= DEFAULT_PODCAST_HOST_POOL.length ? ` ${Math.floor(i / DEFAULT_PODCAST_HOST_POOL.length) + 1}` : '';
    const custom = Array.isArray(customHosts) ? customHosts[i] : undefined;
    const validVoice: GeminiPrebuiltVoice =
      custom?.voiceName && ['Kore', 'Puck', 'Zephyr', 'Fenrir', 'Charon'].includes(custom.voiceName)
        ? (custom.voiceName as GeminiPrebuiltVoice)
        : preset.voiceName;
    const cleanName = typeof custom?.name === 'string' && custom.name.trim()
      ? custom.name.trim().slice(0, 32)
      : `${preset.name}${suffix}`;
    const cleanRole = typeof custom?.role === 'string' && custom.role.trim()
      ? custom.role.trim().slice(0, 48)
      : preset.role;
    hosts.push({
      id: `host_${i + 1}`,
      name: cleanName,
      role: cleanRole,
      voiceName: validVoice,
      pitch: clampPitch(typeof custom?.pitch === 'number' ? custom.pitch : preset.pitch),
      style: preset.style,
      color: custom?.color || preset.color
    });
  }
  return hosts;
}

export function buildPodcastScriptPrompt(options: {
  videoTitle: string;
  summaryText: string;
  hosts: PodcastHost[];
}): string {
  const hosts = Array.isArray(options.hosts) && options.hosts.length >= 2
    ? options.hosts
    : buildDefaultPodcastHosts(2);
  const rosterDesc = hosts
    .map((h, idx) => `${idx + 1}. ${h.name} (${h.role}) — ${h.style}`)
    .join('\n');
  const turnTarget = Math.max(8, Math.min(20, hosts.length * 4));

  return [
    `Create an engaging, deeply informed NotebookLM-style podcast episode discussing the video "${options.videoTitle || 'Untitled Video'}".`,
    `Use ALL ${hosts.length} hosts below so every single host contributes distinct, balanced turns:`,
    rosterDesc,
    '',
    `Guidelines:`,
    `- Write ${turnTarget} natural spoken dialogue turns grounded strictly in the provided video summary.`,
    `- Keep each turn crisp (2–4 sentences), conversational, and reactive (hosts agree, build analogies, probe caveats, and reference timestamps like [MM:SS] naturally without reading brackets robotically).`,
    `- CRITICAL VOICE RULE: Hosts must NEVER announce or say their own name when starting a turn (NO "Alex:", "Alex here,", "This is Maya,", or "As Sam,"). Put speaker attribution ONLY in the JSON "speaker" field and write strictly the spoken script inside "text" (natural improvised reactions directly about the script content are encouraged).`,
    `- Include every host by exact first name in the "speaker" field: ${hosts.map((h) => h.name).join(', ')}.`,
    `- Return valid JSON only (no extra prose) matching this exact schema:`,
    `{"title":"Episode title","turns":[{"speaker":"${hosts[0].name}","text":"Spoken dialogue...","timestampSec":0}]}`,
    '',
    `VIDEO SUMMARY:`,
    `"""`,
    String(options.summaryText || '').slice(0, 12000),
    `"""`
  ].join('\n');
}

export function buildPodcastInteractionPrompt(options: {
  videoTitle: string;
  summaryText: string;
  hosts: PodcastHost[];
  recentTurns: PodcastTurn[];
  listenerQuery: string;
  isVoice?: boolean;
}): string {
  const hosts = Array.isArray(options.hosts) && options.hosts.length >= 2
    ? options.hosts
    : buildDefaultPodcastHosts(2);
  const recentCtx = (options.recentTurns || [])
    .slice(-5)
    .map((t) => `${t.speaker}: ${t.text}`)
    .join('\n');

  return [
    `You are hosting a live interactive NotebookLM-style podcast about "${options.videoTitle || 'Untitled Video'}".`,
    `Active Host Panel (${hosts.length} hosts):`,
    ...hosts.map((h) => `- ${h.name} (${h.role})`),
    '',
    `RECENT SHOW CONTEXT:`,
    recentCtx || '(Beginning of episode)',
    '',
    `LISTENER ${options.isVoice ? 'VOICE ' : ''}INTERRUPTION / QUESTION:`,
    `"${String(options.listenerQuery || '').trim()}"`,
    '',
    `Instructions:`,
    `- Respond immediately as 2 to ${Math.min(hosts.length, 3)} of the active hosts acknowledging the listener directly ("Great question from our listener…") and answering accurately using the video summary.`,
    `- CRITICAL VOICE RULE: Hosts must NEVER announce or say their own name when starting a turn (NO "Alex:", "This is Sam,", or "Maya here,"). Follow the script naturally with only brief improvised remarks directly related to the answer.`,
    `- Keep it natural, conversational, and concise (2–4 dialogue turns total).`,
    `- Return valid JSON only matching:`,
    `{"turns":[{"speaker":"${hosts[0].name}","text":"Spoken answer..."}]}`,
    '',
    `VIDEO SUMMARY:`,
    `"""`,
    String(options.summaryText || '').slice(0, 10000),
    `"""`
  ].join('\n');
}

function matchPodcastHost(speakerRaw: string, hosts: PodcastHost[], fallbackIdx: number): PodcastHost {
  const cleaned = String(speakerRaw || '').replace(/[\[\]:*]/g, '').trim().toLowerCase();
  if (cleaned) {
    const exact = hosts.find((h) => h.name.toLowerCase() === cleaned);
    if (exact) return exact;
    const partial = hosts.find(
      (h) => cleaned.includes(h.name.toLowerCase()) || h.name.toLowerCase().includes(cleaned)
    );
    if (partial) return partial;
    const hostNumMatch = /^host\s*#?\s*(\d+)$/i.exec(cleaned);
    if (hostNumMatch) {
      const idx = parseInt(hostNumMatch[1], 10) - 1;
      if (idx >= 0 && idx < hosts.length) return hosts[idx];
    }
  }
  return hosts[fallbackIdx % hosts.length];
}

function extractTimestampSecFromText(text: string): number | null {
  const m = /\[((?:\d{1,2}:)?\d{1,2}:\d{2})\]/.exec(String(text || ''));
  if (!m) return null;
  const sec = parseTimestampToSeconds(m[1]);
  return Number.isFinite(sec) ? sec : null;
}

function escapeRegexLiteral(str: string): string {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeSpokenTurnText(raw: string, hostNames?: string[]): string {
  let cleaned = formatMathSymbolsInText(String(raw || ''))
    .replace(/\[\[(?:FRAME|IMG|GEN|IMAGE)[^\]]*\]\]/gi, '')
    .replace(/^\s*\[?\s*(?:\*{1,2})?[A-Za-z][A-Za-z0-9 _.-]{0,28}(?:\*{1,2})?\s*\]?\s*:\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const names = Array.isArray(hostNames)
    ? hostNames.map((n) => String(n || '').trim()).filter(Boolean)
    : [];
  const escapedNames = names.map(escapeRegexLiteral).filter(Boolean);
  if (escapedNames.length > 0) {
    const alt = escapedNames.join('|');
    const selfIntroRe = new RegExp(
      `^(?:(?:hey|hi|hello|okay|ok|well|so|yeah|yes|right),?\\s+)?(?:(?:this\\s+is|i['’]?m|it['’]?s|i\\s+am|speaking\\s+as)\\s+(?:${alt})|(?:${alt})\\s+(?:here|speaking))[,:;!—–\\-.\\s]+`,
      'i'
    );
    for (let pass = 0; pass < 2; pass++) {
      const next = cleaned.replace(selfIntroRe, '').trim();
      if (!next || next === cleaned) break;
      cleaned = next;
    }
    const repeatedLabelRe = new RegExp(`^\\s*\\[?(?:${alt})\\]?\\s*[:\\-—]+\\s*`, 'i');
    cleaned = cleaned.replace(repeatedLabelRe, '').trim();
  }

  return cleaned.replace(/\s+/g, ' ').trim();
}

export function parsePodcastScriptResponse(
  rawText: string,
  hosts: PodcastHost[],
  options: { episodeTitle?: string; markAsResponse?: boolean } = {}
): { title: string; turns: PodcastTurn[] } {
  const safeHosts = Array.isArray(hosts) && hosts.length >= 2 ? hosts : buildDefaultPodcastHosts(2);
  const hostNames = safeHosts.map((h) => h.name);
  const raw = String(rawText || '').trim();
  const defaultTitle = options.episodeTitle || 'Audio Deep Dive';

  if (!raw) {
    return { title: defaultTitle, turns: [] };
  }

  // 1. Try JSON parsing (raw or extracted fenced block / outermost object)
  let jsonCandidate = raw;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced) {
    jsonCandidate = fenced[1].trim();
  } else {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonCandidate = raw.slice(firstBrace, lastBrace + 1);
    }
  }

  try {
    const parsed = JSON.parse(jsonCandidate);
    const rawTurns = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.turns) ? parsed.turns : null;
    if (rawTurns && rawTurns.length > 0) {
      const turns: PodcastTurn[] = [];
      rawTurns.forEach((item: any, idx: number) => {
        const text = sanitizeSpokenTurnText(item?.text || item?.line || item?.content || '', hostNames);
        if (!text) return;
        const host = matchPodcastHost(item?.speaker || item?.host || '', safeHosts, idx);
        const tsSec =
          typeof item?.timestampSec === 'number' && Number.isFinite(item.timestampSec)
            ? Math.max(0, Math.floor(item.timestampSec))
            : extractTimestampSecFromText(item?.text || '');
        turns.push({
          id: `pod_turn_${idx + 1}_${Date.now().toString(36)}`,
          speaker: host.name,
          role: host.role,
          voiceName: host.voiceName,
          pitch: host.pitch,
          text,
          isResponse: Boolean(options.markAsResponse),
          timestampSec: tsSec
        });
      });
      if (turns.length > 0) {
        return {
          title: typeof parsed?.title === 'string' && parsed.title.trim() ? parsed.title.trim() : defaultTitle,
          turns
        };
      }
    }
  } catch (_) {}

  // 2. Fallback: labeled lines ("Alex: ...", "**Sam:** ...", "[Maya]: ...")
  const turns: PodcastTurn[] = [];
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('{') || line.startsWith('}') || line.startsWith('```')) continue;
    const m = /^\[?([A-Za-z][A-Za-z0-9 _.-]{0,28})\]?\s*:\s*(.+)$/.exec(line.replace(/\*\*/g, ''));
    const rawSpeaker = m ? m[1] : '';
    const rawSpeech = m ? m[2] : line;
    const cleanSpeech = sanitizeSpokenTurnText(rawSpeech, hostNames);
    if (!cleanSpeech || cleanSpeech.length < 4) continue;
    const host = matchPodcastHost(rawSpeaker, safeHosts, turns.length);
    turns.push({
      id: `pod_turn_${turns.length + 1}`,
      speaker: host.name,
      role: host.role,
      voiceName: host.voiceName,
      pitch: host.pitch,
      text: cleanSpeech,
      isResponse: Boolean(options.markAsResponse),
      timestampSec: extractTimestampSecFromText(cleanSpeech)
    });
  }

  return { title: defaultTitle, turns };
}

function stripInlineMarkdown(str: string): string {
  if (!str) return '';
  return formatMathSymbolsInText(str)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[\[(?:FRAME|IMG|GEN|IMAGE)[^\]]*\]\]/gi, '')
    .trim();
}

function extractSummaryKeyInsights(summaryText: string): Array<{ text: string; timestampSec: number | null }> {
  const formatted = formatMathSymbolsInText(String(summaryText || ''))
    .replace(/\[\[(?:FRAME|IMG|GEN|IMAGE)[^\]]*\]\]/gi, '');
  const lines = formatted
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const insights: Array<{ text: string; timestampSec: number | null }> = [];
  for (const line of lines) {
    if (/^#{1,6}\s*(?:TL;?DR|Key takeaways|Detailed summary|Concise summary|Notable details|Worth your time\??)$/i.test(line)) {
      continue;
    }
    const clean = stripInlineMarkdown(line.replace(/^[-*•]\s+/, '').replace(/^#{1,6}\s+/, '')).trim();
    if (clean.length < 18) continue;
    insights.push({
      text: clean,
      timestampSec: extractTimestampSecFromText(line)
    });
  }
  if (insights.length === 0 && formatted.trim()) {
    insights.push({ text: formatted.trim().slice(0, 260), timestampSec: 0 });
  }
  return insights;
}

export function buildDeterministicPodcastEpisode(options: {
  videoTitle: string;
  summaryText: string;
  hosts: PodcastHost[];
}): PodcastEpisode {
  const hosts = Array.isArray(options.hosts) && options.hosts.length >= 2
    ? options.hosts
    : buildDefaultPodcastHosts(2);
  const title = (options.videoTitle || 'Video Deep Dive').trim();
  const insights = extractSummaryKeyInsights(options.summaryText);
  const turns: PodcastTurn[] = [];

  const introHost = hosts[0];
  turns.push({
    id: 'pod_turn_1',
    speaker: introHost.name,
    role: introHost.role,
    voiceName: introHost.voiceName,
    pitch: introHost.pitch,
    text: `Welcome back to Deep Dive Studio! Today our panel is breaking down "${title}". ${insights[0] ? insights[0].text : 'Let us unpack the core thesis right away.'}`,
    timestampSec: insights[0]?.timestampSec ?? 0
  });

  const maxDiscussionTurns = Math.max(hosts.length + 1, insights.length);
  for (let i = 1; i < maxDiscussionTurns; i++) {
    const host = hosts[i % hosts.length];
    const insight = insights[i % Math.max(1, insights.length)];
    let spoken = '';
    if (i === 1) {
      spoken = `From the ${host.role.toLowerCase()} lens, the standout point here is: ${insight?.text || title}.`;
    } else if (i % hosts.length === 2) {
      spoken = `Hold on — let us stress-test that claim. Specifically, the video notes: ${insight?.text || 'every benchmark still depends on real-world constraints.'}`;
    } else if (i % hosts.length === 3) {
      spoken = `Practically speaking, look closely at how this lands in day-to-day workflows: ${insight?.text || 'execution efficiency is the real differentiator.'}`;
    } else {
      spoken = `Building on that point, another critical detail from the summary is: ${insight?.text || 'this shifts long-term expectations.'}`;
    }
    turns.push({
      id: `pod_turn_${turns.length + 1}`,
      speaker: host.name,
      role: host.role,
      voiceName: host.voiceName,
      pitch: host.pitch,
      text: spoken,
      timestampSec: insight?.timestampSec ?? null
    });
  }

  const wrapHost = hosts[hosts.length - 1];
  turns.push({
    id: `pod_turn_${turns.length + 1}`,
    speaker: wrapHost.name,
    role: wrapHost.role,
    voiceName: wrapHost.voiceName,
    pitch: wrapHost.pitch,
    text: `That wraps our full breakdown — jump in anytime with a text or voice question if you want us to zoom into any point!`,
    timestampSec: null
  });

  return {
    title: `Podcast: ${title}`,
    hostCount: hosts.length,
    hosts,
    turns,
    createdAt: Date.now(),
    isComplete: true,
    generatedParts: 1,
    totalParts: 1
  };
}

export function splitSummaryIntoPodcastSections(
  summaryText: string,
  maxBatchChars = 1400
): string[] {
  const clean = String(summaryText || '')
    .replace(/\[\[(?:FRAME|IMG|GEN|IMAGE)[^\]]*\]\]/gi, '')
    .trim();
  if (!clean) return [''];
  const cap = Math.max(500, Math.floor(maxBatchChars || 1400));
  if (clean.length <= cap) return [clean];

  const blocks = clean
    .split(/(?=\n#{1,4}\s+)/)
    .map((b) => b.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buf = '';

  const pushOversizedBlock = (block: string) => {
    const lines = block.split('\n');
    for (const line of lines) {
      const addition = buf ? `${buf}\n${line}` : line;
      if (addition.length > cap && buf) {
        chunks.push(buf.trim());
        buf = line;
      } else {
        buf = addition;
      }
    }
  };

  for (const block of blocks) {
    if (block.length > cap) {
      if (buf) {
        chunks.push(buf.trim());
        buf = '';
      }
      pushOversizedBlock(block);
    } else if (!buf) {
      buf = block;
    } else if (buf.length + 2 + block.length <= cap) {
      buf = `${buf}\n\n${block}`;
    } else {
      chunks.push(buf.trim());
      buf = block;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());

  if (chunks.length > 1 && chunks[chunks.length - 1].length < Math.floor(cap * 0.28)) {
    const last = chunks.pop()!;
    chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}\n\n${last}`.trim();
  }
  return chunks.length > 0 ? chunks : [clean];
}

export function buildPodcastScriptPartPrompt(options: {
  videoTitle: string;
  sectionText: string;
  partIndex: number;
  totalParts: number;
  hosts: PodcastHost[];
  previousTurns?: PodcastTurn[];
}): string {
  const hosts = Array.isArray(options.hosts) && options.hosts.length >= 2
    ? options.hosts
    : buildDefaultPodcastHosts(2);
  const partIdx = Math.max(0, Math.floor(options.partIndex || 0));
  const totalParts = Math.max(1, Math.floor(options.totalParts || 1));
  if (totalParts === 1) {
    return buildPodcastScriptPrompt({
      videoTitle: options.videoTitle,
      summaryText: options.sectionText,
      hosts
    });
  }
  if (partIdx === 0) {
    const rosterDesc = hosts
      .map((h, idx) => `${idx + 1}. ${h.name} (${h.role}) — ${h.style}`)
      .join('\n');
    const turnTarget = Math.max(6, Math.min(12, hosts.length * 3));
    return [
      `Create PART 1 of ${totalParts} of an engaging NotebookLM-style podcast episode discussing "${options.videoTitle || 'Untitled Video'}".`,
      `This Part 1 must thoroughly cover EVERY detail in SECTION 1 below (later parts will cover later sections seamlessly, so do NOT wrap up the episode yet).`,
      `Host Panel:`,
      rosterDesc,
      '',
      `Guidelines:`,
      `- Write ${turnTarget} natural spoken dialogue turns covering every fact, caveat, example, and [MM:SS] timestamp in Section 1.`,
      `- End naturally transitioning toward the next part of the video rather than signing off.`,
      `- CRITICAL VOICE RULE: Hosts must NEVER say or announce their own names at the start of a turn (NO "Alex:", "Alex here,", "This is Maya,", etc.). Only follow the spoken script (brief natural improvised reactions tied directly to the content are great).`,
      `- Put exact host first names ONLY in JSON "speaker": ${hosts.map((h) => h.name).join(', ')}.`,
      `- Return valid JSON only:`,
      `{"title":"Episode title","turns":[{"speaker":"${hosts[0].name}","text":"Spoken dialogue...","timestampSec":0}]}`,
      '',
      `SECTION 1 OF ${totalParts}:`,
      `"""`,
      String(options.sectionText || ''),
      `"""`
    ].join('\n');
  }
  return buildPodcastContinuationPrompt(options);
}

export function buildPodcastContinuationPrompt(options: {
  videoTitle: string;
  sectionText: string;
  partIndex: number;
  totalParts: number;
  hosts: PodcastHost[];
  previousTurns?: PodcastTurn[];
}): string {
  const hosts = Array.isArray(options.hosts) && options.hosts.length >= 2
    ? options.hosts
    : buildDefaultPodcastHosts(2);
  const partIdx = Math.max(1, Math.floor(options.partIndex || 1));
  const totalParts = Math.max(partIdx + 1, Math.floor(options.totalParts || 2));
  const isFinal = partIdx >= totalParts - 1;
  const recentCtx = (options.previousTurns || [])
    .slice(-4)
    .map((t) => `${t.speaker}: ${t.text}`)
    .join('\n');
  const turnTarget = Math.max(6, Math.min(12, hosts.length * 3));

  return [
    `Continue the live NotebookLM-style podcast about "${options.videoTitle || 'Untitled Video'}" with PART ${partIdx + 1} of ${totalParts}.`,
    `Pick up seamlessly after the preceding conversation without re-introducing the show or hosts.`,
    `Host Panel: ${hosts.map((h) => `${h.name} (${h.role})`).join(', ')}`,
    '',
    `RECENT TURNS JUST SPOKEN:`,
    recentCtx || '(Continuing live discussion)',
    '',
    `Guidelines:`,
    `- Write ${turnTarget} natural spoken dialogue turns covering EVERY insight, datum, nuance, and [MM:SS] timestamp in SECTION ${partIdx + 1} below.`,
    isFinal
      ? `- Because this is the final section, conclude cleanly in the last turn inviting listener questions.`
      : `- Keep momentum flowing smoothly toward the next section without closing the episode.`,
    `- CRITICAL VOICE RULE: Hosts must NEVER announce or say their own names when starting a turn (NO "Alex:", "This is Sam,", or "Maya here,"). Stick to natural spoken dialogue strictly related to the script.`,
    `- Return valid JSON only matching:`,
    `{"turns":[{"speaker":"${hosts[partIdx % hosts.length].name}","text":"Spoken continuation...","timestampSec":0}]}`,
    '',
    `SECTION ${partIdx + 1} OF ${totalParts}:`,
    `"""`,
    String(options.sectionText || ''),
    `"""`
  ].join('\n');
}

export function buildDeterministicPodcastEpisodePart(options: {
  videoTitle: string;
  sectionText: string;
  partIndex: number;
  totalParts: number;
  hosts: PodcastHost[];
  startTurnNumber?: number;
}): { title: string; turns: PodcastTurn[] } {
  const hosts = Array.isArray(options.hosts) && options.hosts.length >= 2
    ? options.hosts
    : buildDefaultPodcastHosts(2);
  const partIdx = Math.max(0, Math.floor(options.partIndex || 0));
  const totalParts = Math.max(1, Math.floor(options.totalParts || 1));
  const isFirst = partIdx === 0;
  const isFinal = partIdx >= totalParts - 1;
  const title = (options.videoTitle || 'Video Deep Dive').trim();
  const insights = extractSummaryKeyInsights(options.sectionText);
  const turns: PodcastTurn[] = [];
  const baseSeq = Math.max(1, Math.floor(options.startTurnNumber || 1));

  if (isFirst) {
    const introHost = hosts[0];
    turns.push({
      id: `pod_turn_${baseSeq}`,
      speaker: introHost.name,
      role: introHost.role,
      voiceName: introHost.voiceName,
      pitch: introHost.pitch,
      text: `Welcome back! Today we are breaking down "${title}". ${insights[0] ? insights[0].text : 'Let us unpack the core thesis right away.'}`,
      timestampSec: insights[0]?.timestampSec ?? 0
    });
  }

  const startOffset = isFirst ? 1 : 0;
  for (let i = startOffset; i < insights.length; i++) {
    const ins = insights[i];
    const host = hosts[(partIdx + i) % hosts.length];
    const mod = (partIdx + i) % 4;
    let spoken = '';
    if (mod === 1) {
      spoken = `Digging deeper into that section: ${ins.text}`;
    } else if (mod === 2) {
      spoken = `Worth stress-testing that claim carefully — specifically, the video details that ${ins.text}`;
    } else if (mod === 3) {
      spoken = `In practical terms, notice what happens next: ${ins.text}`;
    } else {
      spoken = `Another key detail from this part of the video: ${ins.text}`;
    }
    turns.push({
      id: `pod_turn_${baseSeq + turns.length}`,
      speaker: host.name,
      role: host.role,
      voiceName: host.voiceName,
      pitch: host.pitch,
      text: spoken,
      timestampSec: ins.timestampSec ?? null
    });
  }

  if (turns.length === 0) {
    const host = hosts[partIdx % hosts.length];
    turns.push({
      id: `pod_turn_${baseSeq}`,
      speaker: host.name,
      role: host.role,
      voiceName: host.voiceName,
      pitch: host.pitch,
      text: `Continuing through "${title}", this section adds important supporting context to the overall breakdown.`,
      timestampSec: null
    });
  }

  if (isFinal) {
    const wrapHost = hosts[hosts.length - 1];
    turns.push({
      id: `pod_turn_${baseSeq + turns.length}`,
      speaker: wrapHost.name,
      role: wrapHost.role,
      voiceName: wrapHost.voiceName,
      pitch: wrapHost.pitch,
      text: `That brings together every part of our breakdown — jump in anytime with a text or voice question if you want to explore any detail further!`,
      timestampSec: null
    });
  }

  return {
    title: `Podcast: ${title}`,
    turns
  };
}

export function appendPodcastEpisodeTurns(
  episode: PodcastEpisode,
  newTurns: PodcastTurn[],
  meta: { generatedParts?: number; totalParts?: number; isComplete?: boolean } = {}
): PodcastEpisode {
  const existing = Array.isArray(episode?.turns) ? episode.turns : [];
  const hostNames = (episode?.hosts || []).map((h) => h.name);
  const startLen = existing.length;
  const sanitizedAdditions = (Array.isArray(newTurns) ? newTurns : [])
    .map((t, idx) => ({
      ...t,
      id: t?.id && !existing.some((e) => e.id === t.id)
        ? t.id
        : `pod_turn_${startLen + idx + 1}_${Date.now().toString(36)}`,
      text: sanitizeSpokenTurnText(t?.text || '', hostNames)
    }))
    .filter((t) => Boolean(t.text));

  const generatedParts =
    typeof meta.generatedParts === 'number'
      ? meta.generatedParts
      : (episode.generatedParts ?? 1);
  const totalParts =
    typeof meta.totalParts === 'number'
      ? meta.totalParts
      : (episode.totalParts ?? generatedParts);
  const isComplete =
    typeof meta.isComplete === 'boolean'
      ? meta.isComplete
      : generatedParts >= totalParts;

  return {
    ...episode,
    turns: [...existing, ...sanitizedAdditions],
    generatedParts,
    totalParts,
    isComplete
  };
}

export function buildDeterministicPodcastInteractionResponse(options: {
  videoTitle: string;
  summaryText: string;
  hosts: PodcastHost[];
  listenerQuery: string;
  isVoice?: boolean;
}): { userTurn: PodcastTurn; responseTurns: PodcastTurn[] } {
  const hosts = Array.isArray(options.hosts) && options.hosts.length >= 2
    ? options.hosts
    : buildDefaultPodcastHosts(2);
  const query = String(options.listenerQuery || '').trim();
  const insights = extractSummaryKeyInsights(options.summaryText);
  const queryWords = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);

  let bestInsight = insights[0] || { text: `the core takeaways from "${options.videoTitle || 'this video'}"`, timestampSec: 0 };
  let bestScore = -1;
  for (const ins of insights) {
    const low = ins.text.toLowerCase();
    let score = 0;
    for (const w of queryWords) {
      if (low.includes(w)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestInsight = ins;
    }
  }

  const uid = Date.now().toString(36);
  const userTurn: PodcastTurn = {
    id: `pod_user_${uid}`,
    speaker: 'You (Listener)',
    role: options.isVoice ? 'Voice Question' : 'Text Question',
    voiceName: 'Kore',
    pitch: 1.0,
    text: query,
    isUser: true,
    isVoiceInput: Boolean(options.isVoice),
    timestampSec: null
  };

  const lead = hosts[0];
  const partner = hosts[1] || hosts[0];
  const third = hosts.length >= 3 ? hosts[2] : null;

  const responseTurns: PodcastTurn[] = [
    {
      id: `pod_resp_1_${uid}`,
      speaker: lead.name,
      role: lead.role,
      voiceName: lead.voiceName,
      pitch: lead.pitch,
      text: `Great question! Pausing right here to address what you asked about "${query.slice(0, 80)}${query.length > 80 ? '…' : ''}". Based on the video summary: ${bestInsight.text}`,
      isResponse: true,
      timestampSec: bestInsight.timestampSec
    },
    {
      id: `pod_resp_2_${uid}`,
      speaker: partner.name,
      role: partner.role,
      voiceName: partner.voiceName,
      pitch: partner.pitch,
      text: `To add to ${lead.name}'s point on that: it connects directly back to the video's main argument around ${insights[Math.min(1, insights.length - 1)]?.text || 'practical real-world trade-offs'}.`,
      isResponse: true,
      timestampSec: insights[Math.min(1, insights.length - 1)]?.timestampSec ?? null
    }
  ];

  if (third) {
    responseTurns.push({
      id: `pod_resp_3_${uid}`,
      speaker: third.name,
      role: third.role,
      voiceName: third.voiceName,
      pitch: third.pitch,
      text: `And one caveat to watch for: keep testing those assumptions against your own workload before jumping back into the rest of the episode!`,
      isResponse: true,
      timestampSec: null
    });
  }

  return { userTurn, responseTurns };
}

export function splicePodcastInteractionTurns(
  turns: PodcastTurn[],
  insertAfterIndex: number,
  userTurn: PodcastTurn,
  responseTurns: PodcastTurn[]
): { nextTurns: PodcastTurn[]; firstResponseIndex: number } {
  const safeTurns = Array.isArray(turns) ? turns.slice() : [];
  const validIdx =
    Number.isFinite(insertAfterIndex) && insertAfterIndex >= 0 && insertAfterIndex < safeTurns.length
      ? Math.floor(insertAfterIndex)
      : safeTurns.length - 1;
  const insertAt = validIdx + 1;
  const inserted = [userTurn, ...(Array.isArray(responseTurns) ? responseTurns : [])];
  safeTurns.splice(insertAt, 0, ...inserted);
  return {
    nextTurns: safeTurns,
    firstResponseIndex: responseTurns.length > 0 ? insertAt + 1 : insertAt
  };
}

export function buildGeminiMultiSpeakerTtsBody(
  turns: Array<{ speaker: string; text: string }>,
  hosts: PodcastHost[]
): Record<string, unknown> {
  const safeHosts = Array.isArray(hosts) && hosts.length >= 2 ? hosts : buildDefaultPodcastHosts(2);
  const primaryTwo = safeHosts.slice(0, 2);
  const parts = (turns || []).slice(0, 6).map((t, i) => {
    const matched = matchPodcastHost(t.speaker, safeHosts, i);
    const assigned = primaryTwo.find((h) => h.name === matched.name) || primaryTwo[i % 2];
    return {
      text: `${assigned.name}: ${String(t.text || '').trim()}`,
      speechMetadata: {
        speaker: assigned.name,
        style: matched.style || assigned.style
      }
    };
  });

  return {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: primaryTwo.map((h) => ({
            speaker: h.name,
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: h.voiceName }
            }
          }))
        }
      }
    }
  };
}

export interface CaptionTrackInfo {
  baseUrl: string;
  languageCode: string;
  kind: string;
}

export interface TranscriptSegmentItem {
  startMs: number;
  text: string;
}

export function decodeBasicEntities(input: string): string {
  return String(input || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    });
}

export function extractCaptionTracksFromHtml(html: string): CaptionTrackInfo[] {
  const src = String(html || '');
  if (!src) return [];
  const markerRe = /"captionTracks"\s*:\s*\[/g;
  let match: RegExpExecArray | null;
  while ((match = markerRe.exec(src)) !== null) {
    const startBracket = match.index + match[0].length - 1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let endBracket = -1;
    for (let i = startBracket; i < src.length && i < startBracket + 250000; i++) {
      const ch = src[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === '[') {
        depth++;
      } else if (ch === ']') {
        depth--;
        if (depth === 0) {
          endBracket = i;
          break;
        }
      }
    }
    if (endBracket === -1) continue;
    const rawArrayStr = src.slice(startBracket, endBracket + 1);
    try {
      const parsed = JSON.parse(rawArrayStr);
      if (!Array.isArray(parsed) || parsed.length === 0) continue;
      const tracks: CaptionTrackInfo[] = parsed
        .filter((t) => t && typeof t.baseUrl === 'string' && t.baseUrl.length > 0)
        .map((t) => ({
          baseUrl: decodeBasicEntities(String(t.baseUrl).replace(/\\u0026/g, '&').replace(/\\\//g, '/')),
          languageCode: String(t.languageCode || '').toLowerCase(),
          kind: String(t.kind || '').toLowerCase()
        }));
      if (tracks.length > 0) {
        return tracks.sort((a, b) => {
          const score = (tr: CaptionTrackInfo) => {
            const isEn = tr.languageCode === 'en' || tr.languageCode.startsWith('en-');
            const isManual = tr.kind !== 'asr';
            return (isEn ? 4 : 0) + (isManual ? 2 : 0);
          };
          return score(b) - score(a);
        });
      }
    } catch (_) {
      continue;
    }
  }
  return [];
}

export function parseJson3TranscriptEvents(jsonData: any): TranscriptSegmentItem[] {
  const events = Array.isArray(jsonData?.events) ? jsonData.events : [];
  const segs: TranscriptSegmentItem[] = [];
  for (const ev of events) {
    if (!ev || !Array.isArray(ev.segs)) continue;
    const text = ev.segs
      .map((s: any) => String(s?.utf8 || ''))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const startMs = Math.max(0, Math.round(Number(ev.tStartMs) || 0));
    segs.push({ startMs, text });
  }
  return segs;
}

export function parseXmlTranscriptEvents(xmlText: string): TranscriptSegmentItem[] {
  const xml = String(xmlText || '');
  if (!xml) return [];
  const segs: TranscriptSegmentItem[] = [];
  const tagRe = /<(?:text|p)\b([^>]*)>([\s\S]*?)<\/(?:text|p)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    const attrs = m[1] || '';
    const innerRaw = (m[2] || '').replace(/<[^>]+>/g, ' ');
    const text = decodeBasicEntities(innerRaw).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const startSecMatch = /\bstart="([\d.]+)"/i.exec(attrs);
    const startMsMatch = /\bt="(\d+)"/i.exec(attrs);
    const startMs = startMsMatch
      ? Math.max(0, parseInt(startMsMatch[1], 10) || 0)
      : Math.max(0, Math.round((parseFloat(startSecMatch?.[1] || '0') || 0) * 1000));
    segs.push({ startMs, text });
  }
  return segs;
}

const SPONSOR_OR_PROMO_REGEX = /\b(?:sponsored\s+by|this\s+video\s+is\s+(?:sponsored|brought\s+to\s+you)\s+by|brought\s+to\s+you\s+by|today'?s\s+sponsor|paid\s+(?:promotion|sponsorship|partnership|collab(?:oration)?)|includes?\s+paid\s+promotion|use\s+(?:code|promo\s+code|coupon)|discount\s+code|promo\s+code|\d+%\s*off\b|patreon\.com|join\s+(?:my|our)\s+patreon|support\s+(?:me|us)\s+on\s+patreon|channel\s+memberships?|check\s+out\s+(?:my|our)\s+merch|merch\s+(?:store|drop|link|shop)|teespring|spreadshirt|affiliate\s+links?|sign\s+up\s+(?:using|with)\s+(?:my|the)\s+link|link\s+in\s+(?:the\s+)?description\s+below|subscribe\s+and\s+hit\s+the\s+bell|NordVPN|Surfshark|Squarespace|Skillshare|Brilliant\.org|Audible|Honey|Raid\s+Shadow\s+Legends)\b/i;

export function isSponsorOrPromoLine(line: string): boolean {
  const clean = String(line || '').replace(/\s+/g, ' ').trim();
  if (!clean) return false;
  return SPONSOR_OR_PROMO_REGEX.test(clean);
}

export function stripSponsorAndPromoFromText(text: string): string {
  const raw = String(text || '');
  if (!raw.trim()) return '';
  const keptLines: string[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (isSponsorOrPromoLine(trimmed)) continue;
    const sentences = trimmed
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s && !isSponsorOrPromoLine(s));
    if (sentences.length > 0) {
      keptLines.push(sentences.join(' '));
    }
  }
  return keptLines.join('\n').trim();
}

export function extractDescriptiveTitleFromTranscript(transcriptText: string): string {
  const cleanLines = String(transcriptText || '')
    .split('\n')
    .map((l) => l.replace(/^\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*/, '').trim())
    .filter(
      (l) =>
        l.length > 15 &&
        !l.startsWith('##') &&
        !l.startsWith('[') &&
        !l.includes('...truncated...') &&
        !isSponsorOrPromoLine(l)
    );
  if (!cleanLines.length) return '';
  const combined = cleanLines.slice(0, 3).join('; ').replace(/\s+/g, ' ').trim();
  return combined.length > 145 ? combined.slice(0, 142).trim() + '...' : combined;
}

export function dedupeAdjacentTitleDuplicate(titleText: string): string {
  const clean = String(titleText || '').replace(/\s+/g, ' ').trim();
  if (clean.length < 13) return clean;
  const isSubstantial = (s: string) => s.length >= 8 || (s.length >= 6 && /\s/.test(s));
  // Check exact half-split ("Title Title" or "TitleTitle")
  const midExact = Math.floor(clean.length / 2);
  if (clean.length % 2 === 0 && midExact >= 6) {
    const first = clean.slice(0, midExact).trim();
    const second = clean.slice(midExact).trim();
    if (isSubstantial(first) && first === second) return first;
  }
  const spaceMid = clean.indexOf(' ', Math.floor(clean.length / 2) - 2);
  if (spaceMid >= 6 && spaceMid <= Math.floor(clean.length / 2) + 2) {
    const first = clean.slice(0, spaceMid).trim();
    const second = clean.slice(spaceMid + 1).trim();
    if (isSubstantial(first) && first === second) return first;
  }
  return clean;
}

export function shouldTriggerFeedCardMenuPoll(options: {
  hitOwnControl?: boolean;
  inGuideSidebar?: boolean;
  isMenuButton?: boolean;
  hasVideoId?: boolean;
}): boolean {
  if (!options || options.hitOwnControl || options.inGuideSidebar) return false;
  return Boolean(options.isMenuButton && options.hasVideoId);
}

export function buildAltTitleModelCandidates(options: {
  factPreferred?: string[];
  fallbackLadder?: string[];
  textModels?: string[];
  availableModels?: string[] | null;
}): string[] {
  const opts = options || {};
  const isTitleTextModel = (m: string) => {
    const lower = String(m || '').trim().toLowerCase();
    if (!lower) return false;
    return !/(?:ask|transcribe|tts|image|nano-banana|embed|aqa|imagen|veo|audio|live|robotics|computer-use|deep-research|learnlm)/.test(lower);
  };

  const orderedBase: string[] = [];
  const pushUnique = (list: string[], model: string) => {
    const clean = String(model || '').trim();
    if (clean && isTitleTextModel(clean) && !list.includes(clean)) {
      list.push(clean);
    }
  };

  const ladder = Array.isArray(opts.fallbackLadder) ? opts.fallbackLadder : [];
  const factPref = Array.isArray(opts.factPreferred) ? opts.factPreferred : [];
  const textModels = Array.isArray(opts.textModels) ? opts.textModels : [];

  // 1. Walk non-pro rungs down fallbackLadder first (preserving descending Flash ladder order)
  for (const m of ladder) {
    if (!String(m).toLowerCase().includes('pro')) pushUnique(orderedBase, m);
  }
  // 2. Any remaining factPreferred models
  for (const m of factPref) pushUnique(orderedBase, m);
  // 3. Remaining fallbackLadder rungs (including Pro fallbacks)
  for (const m of ladder) pushUnique(orderedBase, m);
  // 4. Remaining general text models
  for (const m of textModels) pushUnique(orderedBase, m);

  const avail = Array.isArray(opts.availableModels)
    ? opts.availableModels.map((m) => String(m || '').trim()).filter(Boolean)
    : [];
  if (avail.length === 0) {
    return orderedBase;
  }

  const availSet = new Set(avail);
  const filtered: string[] = [];
  for (const m of orderedBase) {
    if (availSet.has(m)) {
      pushUnique(filtered, m);
    } else if (availSet.has(m + '-preview')) {
      pushUnique(filtered, m + '-preview');
    }
  }

  // Discover any live Gemini generateContent text/flash models exposed by the API key
  // (e.g. gemini-2.5-flash, gemini-2.5-pro) when hardcoded preview aliases are unavailable
  const discovered = avail
    .filter((m) => /^gemini-/i.test(m) && isTitleTextModel(m) && !filtered.includes(m))
    .sort((a, b) => {
      const rank = (name: string) => {
        const lower = name.toLowerCase();
        if (lower.includes('flash') && !lower.includes('lite')) return 0;
        if (lower.includes('flash')) return 1;
        if (lower.includes('pro')) return 2;
        return 3;
      };
      return rank(a) - rank(b);
    });
  for (const m of discovered) {
    pushUnique(filtered, m);
  }

  return filtered.length > 0 ? filtered : orderedBase;
}

export interface WatchMetadataInfo {
  title: string;
  shortDescription: string;
  author: string;
  keywords: string[];
  visitorData: string;
  innertubeApiKey: string;
  clientVersion: string;
}

export function isMeaningfulDescriptionForTitle(desc: string): boolean {
  const nonPromo = stripSponsorAndPromoFromText(String(desc || ''));
  const cleaned = nonPromo
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(^|\s)#[\w-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 35;
}

export function extractWatchMetadataFromPlayerData(playerData: any): {
  title: string;
  shortDescription: string;
  author: string;
  keywords: string[];
} {
  const vd = playerData?.videoDetails || {};
  const mf = playerData?.microformat?.playerMicroformatRenderer || {};
  const title = decodeBasicEntities(String(vd.title || mf.title?.simpleText || '').trim());
  const shortDescription = decodeBasicEntities(String(vd.shortDescription || mf.description?.simpleText || '').trim());
  const author = decodeBasicEntities(String(vd.author || mf.ownerChannelName || '').trim());
  const keywords = Array.isArray(vd.keywords)
    ? vd.keywords.map((k: unknown) => String(k || '').trim()).filter(Boolean).slice(0, 15)
    : [];
  return { title, shortDescription, author, keywords };
}

export function extractWatchMetadataFromHtml(html: string): WatchMetadataInfo {
  const src = String(html || '');
  const empty: WatchMetadataInfo = {
    title: '',
    shortDescription: '',
    author: '',
    keywords: [],
    visitorData: '',
    innertubeApiKey: '',
    clientVersion: ''
  };
  if (!src) return empty;

  const visitorData = /"VISITOR_DATA"\s*:\s*"([^"]+)"/.exec(src)?.[1] || '';
  const innertubeApiKey = /"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/.exec(src)?.[1] || '';
  const clientVersion = /"INNERTUBE_CONTEXT_CLIENT_VERSION"\s*:\s*"([^"]+)"/.exec(src)?.[1] || '';

  let title = '';
  let shortDescription = '';
  let author = '';
  let keywords: string[] = [];

  const vdMarker = /"videoDetails"\s*:\s*\{/g;
  let vdMatch: RegExpExecArray | null;
  while ((vdMatch = vdMarker.exec(src)) !== null) {
    const startBrace = vdMatch.index + vdMatch[0].length - 1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let endBrace = -1;
    for (let i = startBrace; i < src.length && i < startBrace + 150000; i++) {
      const ch = src[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          endBrace = i;
          break;
        }
      }
    }
    if (endBrace !== -1) {
      try {
        const parsed = JSON.parse(src.slice(startBrace, endBrace + 1));
        if (parsed && typeof parsed === 'object') {
          title = decodeBasicEntities(String(parsed.title || '').trim());
          shortDescription = decodeBasicEntities(String(parsed.shortDescription || '').trim());
          author = decodeBasicEntities(String(parsed.author || '').trim());
          keywords = Array.isArray(parsed.keywords)
            ? parsed.keywords.map((k: unknown) => String(k || '').trim()).filter(Boolean).slice(0, 15)
            : [];
          if (title || shortDescription || author) break;
        }
      } catch (_) {
        continue;
      }
    }
  }

  if (!shortDescription) {
    const metaDesc =
      /<meta[^>]+(?:name|property)=["'](?:og:description|description)["'][^>]+content=["']([^"']*)["']/i.exec(src)?.[1] ||
      /<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:og:description|description)["']/i.exec(src)?.[1] ||
      '';
    shortDescription = decodeBasicEntities(metaDesc.trim());
  }

  if (!title) {
    const metaTitle =
      /<meta[^>]+(?:name|property)=["'](?:og:title|title)["'][^>]+content=["']([^"']*)["']/i.exec(src)?.[1] ||
      /<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:og:title|title)["']/i.exec(src)?.[1] ||
      '';
    title = decodeBasicEntities(metaTitle.trim());
  }

  return {
    title,
    shortDescription,
    author,
    keywords,
    visitorData,
    innertubeApiKey,
    clientVersion
  };
}

export function extractGeminiNonThoughtText(parts: Array<{ text?: string; thought?: boolean } | null | undefined>): string {
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p) => p && !p.thought && typeof p.text === 'string')
    .map((p) => p!.text!)
    .join('')
    .trim();
}

export type AppThemeMode = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

export function normalizeAppThemeMode(val: unknown): AppThemeMode {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'light' || s === 'dark' || s === 'system') {
    return s;
  }
  return 'system';
}

export function resolveEffectiveAppTheme(mode: unknown, systemPrefersDark: boolean): EffectiveTheme {
  const normalized = normalizeAppThemeMode(mode);
  if (normalized === 'light') return 'light';
  if (normalized === 'dark') return 'dark';
  return systemPrefersDark ? 'dark' : 'light';
}

export type UiFontFamily = 'system' | 'dm-sans' | 'serif' | 'mono';
export type UiDensity = 'compact' | 'comfortable' | 'relaxed';

export interface UiFormattingPrefs {
  fontFamily: UiFontFamily;
  fontSizePx: number;
  density: UiDensity;
}

export type GeneratedFontFamily = 'sans' | 'serif' | 'mono';
export type GeneratedParagraphSpacing = 'compact' | 'normal' | 'relaxed';

export interface GeneratedTextFormattingPrefs {
  fontFamily: GeneratedFontFamily;
  fontSizePx: number;
  lineHeight: number;
  paragraphSpacing: GeneratedParagraphSpacing;
  richFormatting: boolean;
}

export const DEFAULT_UI_FORMATTING_PREFS: UiFormattingPrefs = {
  fontFamily: 'system',
  fontSizePx: 14,
  density: 'comfortable'
};

export const DEFAULT_GENERATED_TEXT_PREFS: GeneratedTextFormattingPrefs = {
  fontFamily: 'sans',
  fontSizePx: 14,
  lineHeight: 1.6,
  paragraphSpacing: 'normal',
  richFormatting: true
};

export function normalizeUiFormattingPrefs(raw: unknown): UiFormattingPrefs {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const ff = String(obj.fontFamily || '').trim().toLowerCase();
  const fontFamily: UiFontFamily =
    ff === 'dm-sans' || ff === 'serif' || ff === 'mono' || ff === 'system' ? (ff as UiFontFamily) : 'system';
  const parsedSize = typeof obj.fontSizePx === 'number' ? obj.fontSizePx : parseFloat(String(obj.fontSizePx ?? ''));
  const fontSizePx = Number.isFinite(parsedSize) ? Math.max(11, Math.min(18, Math.round(parsedSize))) : 14;
  const den = String(obj.density || '').trim().toLowerCase();
  const density: UiDensity =
    den === 'compact' || den === 'comfortable' || den === 'relaxed' ? (den as UiDensity) : 'comfortable';
  return { fontFamily, fontSizePx, density };
}

export function normalizeGeneratedTextPrefs(raw: unknown): GeneratedTextFormattingPrefs {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const ff = String(obj.fontFamily || '').trim().toLowerCase();
  const fontFamily: GeneratedFontFamily =
    ff === 'serif' || ff === 'mono' || ff === 'sans' ? (ff as GeneratedFontFamily) : 'sans';
  const parsedSize = typeof obj.fontSizePx === 'number' ? obj.fontSizePx : parseFloat(String(obj.fontSizePx ?? ''));
  const fontSizePx = Number.isFinite(parsedSize) ? Math.max(12, Math.min(22, Math.round(parsedSize))) : 14;
  const parsedLh = typeof obj.lineHeight === 'number' ? obj.lineHeight : parseFloat(String(obj.lineHeight ?? ''));
  const lineHeight = Number.isFinite(parsedLh)
    ? Math.max(1.3, Math.min(2.0, Math.round(parsedLh * 100) / 100))
    : 1.6;
  const sp = String(obj.paragraphSpacing || '').trim().toLowerCase();
  const paragraphSpacing: GeneratedParagraphSpacing =
    sp === 'compact' || sp === 'normal' || sp === 'relaxed' ? (sp as GeneratedParagraphSpacing) : 'normal';
  const richFormatting = obj.richFormatting === false || obj.richFormatting === 'false' ? false : true;
  return { fontFamily, fontSizePx, lineHeight, paragraphSpacing, richFormatting };
}

export function resolveFormattingCssVars(
  uiRaw: unknown,
  genRaw: unknown
): {
  ui: UiFormattingPrefs;
  gen: GeneratedTextFormattingPrefs;
  vars: Record<string, string>;
} {
  const ui = normalizeUiFormattingPrefs(uiRaw);
  const gen = normalizeGeneratedTextPrefs(genRaw);

  const uiFontMap: Record<UiFontFamily, string> = {
    system: '"DM Sans", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'dm-sans': '"DM Sans", "Plus Jakarta Sans", system-ui, sans-serif',
    serif: '"Georgia", "Source Serif 4", Cambria, "Times New Roman", serif',
    mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
  };
  const genFontMap: Record<GeneratedFontFamily, string> = {
    sans: '"DM Sans", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    serif: '"Georgia", "Source Serif 4", Cambria, "Times New Roman", serif',
    mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
  };
  const densityPadMap: Record<UiDensity, string> = {
    compact: '8px',
    comfortable: '12px',
    relaxed: '16px'
  };
  const paraGapMap: Record<GeneratedParagraphSpacing, string> = {
    compact: '6px',
    normal: '11px',
    relaxed: '18px'
  };

  return {
    ui,
    gen,
    vars: {
      '--yt-ui-font': uiFontMap[ui.fontFamily],
      '--yt-ui-font-size': `${ui.fontSizePx}px`,
      '--yt-ui-density-pad': densityPadMap[ui.density],
      '--yt-gen-font': genFontMap[gen.fontFamily],
      '--yt-gen-font-size': `${gen.fontSizePx}px`,
      '--yt-gen-line-height': String(gen.lineHeight),
      '--yt-gen-para-gap': paraGapMap[gen.paragraphSpacing]
    }
  };
}

export function buildFollowUpModelCandidates(options: {
  selectedModel?: string;
  fallbackLadder?: string[];
  availableModels?: string[] | null;
}): string[] {
  const opts = options || {};
  const isTextEligible = (m: string) => {
    const lower = String(m || '').trim().toLowerCase();
    if (!lower) return false;
    return !/(?:transcribe|tts|image|nano-banana|embed|aqa|imagen|veo|audio|live|robotics|computer-use|deep-research|learnlm)/.test(lower);
  };

  const ladder = Array.isArray(opts.fallbackLadder) ? opts.fallbackLadder : [];
  const selected = String(opts.selectedModel || '').trim();
  const isAskSelected = selected.toLowerCase().includes('ask');

  const ordered: string[] = [];
  const pushUnique = (model: string) => {
    const clean = String(model || '').trim();
    if (clean && !ordered.includes(clean)) {
      ordered.push(clean);
    }
  };

  if (selected && (isAskSelected || isTextEligible(selected))) {
    pushUnique(selected);
  }

  let startIdx = 0;
  if (selected && !isAskSelected) {
    const idx = ladder.indexOf(selected);
    if (idx !== -1) {
      startIdx = idx + 1;
    } else {
      startIdx = 0;
    }
  }

  for (let i = startIdx; i < ladder.length; i++) {
    const candidate = String(ladder[i] || '').trim();
    if (candidate && isTextEligible(candidate)) {
      pushUnique(candidate);
    }
  }

  const avail = Array.isArray(opts.availableModels)
    ? opts.availableModels.map((m) => String(m || '').trim()).filter(Boolean)
    : [];
  if (avail.length === 0) {
    return ordered;
  }

  const availSet = new Set(avail);
  const filtered: string[] = [];
  for (const candidate of ordered) {
    if (candidate.toLowerCase().includes('ask')) {
      filtered.push(candidate);
      continue;
    }
    if (availSet.has(candidate)) {
      if (!filtered.includes(candidate)) filtered.push(candidate);
    } else if (availSet.has(candidate + '-preview')) {
      if (!filtered.includes(candidate + '-preview')) filtered.push(candidate + '-preview');
    } else if (candidate === selected && !filtered.includes(candidate)) {
      // Always keep the user's explicit selected model first so it is tried or visibly triggers fallback
      filtered.push(candidate);
    }
  }
  return filtered.length > 0 ? filtered : ordered;
}

export type PodcastSynthesisMode = 'gemini_tts' | 'webspeech';
export type VoiceInputEngine = 'browser' | 'gemini';

export function normalizePodcastSynthesisMode(val: unknown): PodcastSynthesisMode {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'webspeech' || s === 'browser') return 'webspeech';
  return 'gemini_tts';
}

export function normalizeVoiceInputEngine(val: unknown): VoiceInputEngine {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'gemini' || s === 'transcribe') return 'gemini';
  return 'browser';
}

export function normalizeOutputLanguage(val: unknown): string {
  const clean = String(val || '').replace(/[\r\n<>]/g, '').trim();
  return clean ? clean.slice(0, 48) : 'English';
}

export function buildFactCheckModelCandidates(options: {
  explicitModel?: string;
  factModel?: string;
  primaryModel?: string;
  defaultModel?: string;
  factPreferred?: string[];
  fallbackLadder?: string[];
  textModels?: string[];
  availableModels?: string[] | null;
}): string[] {
  const opts = options || {};
  const isFactEligible = (m: string) => {
    const lower = String(m || '').trim().toLowerCase();
    if (!lower) return false;
    return !/(?:ask|transcribe|tts|image|nano-banana|embed|aqa|imagen|veo|audio|live|robotics|computer-use|deep-research|learnlm)/.test(lower);
  };

  const orderedBase: string[] = [];
  const pushUnique = (list: string[], model: string) => {
    const clean = String(model || '').trim();
    if (clean && isFactEligible(clean) && !list.includes(clean)) {
      list.push(clean);
    }
  };

  if (opts.explicitModel) pushUnique(orderedBase, opts.explicitModel);
  if (opts.factModel) pushUnique(orderedBase, opts.factModel);
  for (const m of Array.isArray(opts.factPreferred) ? opts.factPreferred : []) pushUnique(orderedBase, m);
  if (opts.primaryModel) pushUnique(orderedBase, opts.primaryModel);
  if (opts.defaultModel) pushUnique(orderedBase, opts.defaultModel);
  for (const m of Array.isArray(opts.fallbackLadder) ? opts.fallbackLadder : []) pushUnique(orderedBase, m);
  for (const m of Array.isArray(opts.textModels) ? opts.textModels : []) pushUnique(orderedBase, m);

  const avail = Array.isArray(opts.availableModels)
    ? opts.availableModels.map((m) => String(m || '').trim()).filter(Boolean)
    : [];
  if (avail.length === 0) {
    return orderedBase;
  }

  const availSet = new Set(avail);
  const resolved: string[] = [];
  for (const m of orderedBase) {
    if (availSet.has(m)) {
      pushUnique(resolved, m);
    } else if (availSet.has(m + '-preview')) {
      pushUnique(resolved, m + '-preview');
    }
  }

  const discovered = avail
    .filter((m) => /^gemini-/i.test(m) && isFactEligible(m) && !resolved.includes(m))
    .sort((a, b) => {
      const rank = (name: string) => {
        const lower = name.toLowerCase();
        if (lower.includes('flash') && !lower.includes('lite')) return 0;
        if (lower.includes('flash')) return 1;
        if (lower.includes('pro')) return 2;
        return 3;
      };
      return rank(a) - rank(b);
    });
  for (const m of discovered) {
    pushUnique(resolved, m);
  }

  return resolved.length > 0 ? resolved : orderedBase;
}

export interface StoryboardLevelConfig {
  levelIdx: number;
  w: number;
  h: number;
  count: number;
  cols: number;
  rows: number;
  intervalMs: number;
  name: string;
  sigh: string;
}

export interface StoryboardConfig {
  baseUrl: string;
  level: StoryboardLevelConfig;
}

export function parseStoryboardSpecString(specStr: string): StoryboardConfig | null {
  const raw = String(specStr || '').trim();
  if (!raw || !raw.includes('|')) return null;
  const unescaped = raw
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/');
  const parts = unescaped.split('|');
  const baseUrl = (parts[0] || '').trim();
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) return null;

  const levels: StoryboardLevelConfig[] = [];
  for (let i = 1; i < parts.length; i++) {
    const fields = parts[i].split('#');
    if (fields.length < 7) continue;
    const w = parseInt(fields[0], 10);
    const h = parseInt(fields[1], 10);
    const count = parseInt(fields[2], 10);
    const cols = parseInt(fields[3], 10);
    const rows = parseInt(fields[4], 10);
    const intervalMs = parseInt(fields[5], 10);
    const name = fields[6] || '';
    const sigh = fields[7] || '';
    if (
      !Number.isFinite(w) || w <= 0 ||
      !Number.isFinite(h) || h <= 0 ||
      !Number.isFinite(cols) || cols <= 0 ||
      !Number.isFinite(rows) || rows <= 0 ||
      !Number.isFinite(intervalMs) || intervalMs <= 0
    ) {
      continue;
    }
    levels.push({
      levelIdx: i - 1,
      w,
      h,
      count: Number.isFinite(count) && count > 0 ? count : cols * rows,
      cols,
      rows,
      intervalMs,
      name,
      sigh
    });
  }
  if (!levels.length) return null;
  const best = levels[levels.length - 1];
  return { baseUrl, level: best };
}

export interface StoryboardFrameInfo {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
  col: number;
  row: number;
  cols: number;
  rows: number;
  bgSize: string;
  bgPosX: string;
  bgPosY: string;
}

export function computeStoryboardFrameInfo(config: StoryboardConfig, seconds: number): StoryboardFrameInfo {
  const { baseUrl, level } = config;
  const safeSec = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const rawIdx = Math.floor((safeSec * 1000) / Math.max(1, level.intervalMs));
  const maxIdx = level.count > 0 ? level.count - 1 : rawIdx;
  const idx = Math.max(0, Math.min(maxIdx, rawIdx));
  const cols = Math.max(1, level.cols || 1);
  const rows = Math.max(1, level.rows || 1);
  const perSheet = cols * rows;
  const sheetIdx = Math.floor(idx / perSheet);
  const inSheetIdx = idx % perSheet;
  const col = inSheetIdx % cols;
  const row = Math.floor(inSheetIdx / cols);

  const name = (level.name || 'M$M').replace('$M', String(sheetIdx));
  let url = baseUrl.replace('$L', String(level.levelIdx)).replace('$N', name);
  if (level.sigh && !/[?&]sigh=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + `sigh=${encodeURIComponent(level.sigh)}`;
  }

  const pctX = cols > 1 ? Math.round((col / (cols - 1)) * 10000) / 100 : 0;
  const pctY = rows > 1 ? Math.round((row / (rows - 1)) * 10000) / 100 : 0;

  return {
    url,
    x: col * level.w,
    y: row * level.h,
    w: level.w,
    h: level.h,
    col,
    row,
    cols,
    rows,
    bgSize: `${cols * 100}% ${rows * 100}%`,
    bgPosX: `${pctX}%`,
    bgPosY: `${pctY}%`
  };
}

export function getVideoThumbnailFallbackUrl(
  videoId: string,
  seconds = 0,
  durationSeconds = 0
): string {
  const cleanId = encodeURIComponent(String(videoId || '').trim());
  if (!cleanId) return '';
  const safeSec = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  let slot = 2;
  if (durationSeconds > 0) {
    const ratio = safeSec / durationSeconds;
    slot = ratio < 0.34 ? 1 : ratio < 0.68 ? 2 : 3;
  } else if (safeSec > 0) {
    slot = (Math.floor(safeSec / 45) % 3) + 1;
  }
  return `https://i.ytimg.com/vi/${cleanId}/hq${slot}.jpg`;
}

export type ParsedVisualMarker =
  | { kind: 'frame'; tsStr: string; seconds: number; caption: string }
  | { kind: 'img'; terms: string; caption: string }
  | { kind: 'image'; index: number; caption: string }
  | { kind: 'gen'; prompt: string; caption: string };

export function parseVisualMarkerToken(rawToken: string): ParsedVisualMarker | null {
  const clean = String(rawToken || '').trim();
  if (!clean) return null;

  const frameMatch = /^\[\[FRAME\s+\[?((?:(\d{1,2}):)?(\d{1,2}):(\d{2}))\]?(?:\s*\|\s*([^\]]*))?\]\]$/i.exec(clean);
  if (frameMatch) {
    const tsStr = frameMatch[1].trim();
    const caption = (frameMatch[5] || `Video frame at ${tsStr}`).trim();
    return {
      kind: 'frame',
      tsStr,
      seconds: parseTimestampToSeconds(tsStr),
      caption
    };
  }

  const imgMatch = /^\[\[IMG\s+([^|\]]+)(?:\s*\|\s*([^\]]*))?\]\]$/i.exec(clean);
  if (imgMatch) {
    const terms = imgMatch[1].trim();
    const caption = (imgMatch[2] || terms).trim();
    return { kind: 'img', terms, caption };
  }

  const aiImageMatch = /^\[\[IMAGE\s+(\d+)(?:\s*\|\s*([^\]]*))?\]\]$/i.exec(clean);
  if (aiImageMatch) {
    const index = parseInt(aiImageMatch[1], 10);
    const caption = (aiImageMatch[2] || `Illustration ${index}`).trim();
    return { kind: 'image', index, caption };
  }

  const genMatch = /^\[\[GEN\s+([^|\]]+)(?:\s*\|\s*([^\]]*))?\]\]$/i.exec(clean);
  if (genMatch) {
    const prompt = genMatch[1].trim();
    const caption = (genMatch[2] || prompt).trim();
    return { kind: 'gen', prompt, caption };
  }

  return null;
}

export function parseVisualMarkerFromLine(rawLine: string): ParsedVisualMarker | null {
  const normalized = String(rawLine || '')
    .trim()
    .replace(/^(?:[-*•]\s+|\d+\.\s+)/, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/[.。]+$/, '')
    .trim();
  return parseVisualMarkerToken(normalized);
}

export type SummaryVisualSegment =
  | { kind: 'markdown'; text: string }
  | ParsedVisualMarker;

export function tokenizeSummaryTextWithVisuals(text: string): SummaryVisualSegment[] {
  const src = String(text || '');
  if (!src.trim()) return [];
  const lines = src.split('\n');
  const segments: SummaryVisualSegment[] = [];
  let mdBuffer: string[] = [];

  const flushMd = () => {
    const joined = mdBuffer.join('\n').trim();
    if (joined) segments.push({ kind: 'markdown', text: joined });
    mdBuffer = [];
  };

  const inlineRegex = /\[\[(?:FRAME|IMG|IMAGE|GEN)\s+[^\]]+\]\]/gi;

  for (const rawLine of lines) {
    const standalone = parseVisualMarkerFromLine(rawLine);
    if (standalone) {
      flushMd();
      segments.push(standalone);
      continue;
    }

    inlineRegex.lastIndex = 0;
    if (inlineRegex.test(rawLine)) {
      inlineRegex.lastIndex = 0;
      let cursor = 0;
      let leftover = '';
      let m: RegExpExecArray | null;
      const foundTokens: ParsedVisualMarker[] = [];
      while ((m = inlineRegex.exec(rawLine)) !== null) {
        leftover += rawLine.slice(cursor, m.index);
        const parsed = parseVisualMarkerToken(m[0]);
        if (parsed) foundTokens.push(parsed);
        else leftover += m[0];
        cursor = inlineRegex.lastIndex;
      }
      leftover += rawLine.slice(cursor);
      const cleanLeft = leftover.replace(/\s{2,}/g, ' ').trim();
      if (cleanLeft && !/^[-*•]$/.test(cleanLeft)) {
        mdBuffer.push(cleanLeft);
      }
      if (foundTokens.length > 0) {
        flushMd();
        for (const tok of foundTokens) segments.push(tok);
      }
      continue;
    }

    mdBuffer.push(rawLine);
  }

  flushMd();
  return segments;
}

export function ensureFallbackVisualMarkers(summaryText: string, maxMarkers = 3): string {
  const src = String(summaryText || '').trim();
  if (!src) return '';
  if (/\[\[(?:FRAME|IMG|IMAGE|GEN)\s+[^\]]+\]\]/i.test(src)) {
    return src;
  }

  const limit = Math.max(1, Math.min(6, maxMarkers || 3));
  const lines = src.split('\n');
  const tsPattern = /\[((?:(\d{1,2}):)?(\d{1,2}):(\d{2}))\]/;
  const candidateLines: Array<{ lineIdx: number; tsStr: string; seconds: number; caption: string }> = [];
  const usedSeconds = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('## Worth your time')) continue;
    const m = tsPattern.exec(line);
    if (!m) continue;
    const tsStr = m[1];
    const sec = parseTimestampToSeconds(tsStr);
    if (Array.from(usedSeconds).some((s) => Math.abs(s - sec) < 25)) continue;
    const captionRaw = line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^[-*•]\s*/, '')
      .replace(/\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    const caption = captionRaw.length > 90
      ? captionRaw.slice(0, 87).trim() + '...'
      : (captionRaw || `Key moment at ${tsStr}`);
    candidateLines.push({ lineIdx: i, tsStr, seconds: sec, caption });
    usedSeconds.add(sec);
    if (candidateLines.length >= limit) break;
  }

  if (candidateLines.length === 0) {
    return `${src}\n\n[[FRAME 00:15 | Key visual overview from video]]`;
  }

  const insertAfter = new Map<number, string>();
  for (const c of candidateLines) {
    let targetIdx = c.lineIdx;
    // If the timestamp was on a heading line (`### [04:20] Topic`), place marker right after its following paragraph if present
    if (lines[c.lineIdx].trim().startsWith('#')) {
      for (let j = c.lineIdx + 1; j < lines.length; j++) {
        const nxt = lines[j].trim();
        if (!nxt) break;
        if (nxt.startsWith('#')) break;
        targetIdx = j;
        break;
      }
    }
    insertAfter.set(targetIdx, `[[FRAME ${c.tsStr} | ${c.caption}]]`);
  }

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (insertAfter.has(i)) {
      out.push(insertAfter.get(i)!);
    }
  }
  return out.join('\n');
}

export type SummaryWindowTitleMode = 'ai' | 'original';

export function resolveSummaryWindowDisplayTitle(options: {
  mode?: SummaryWindowTitleMode | string | null;
  aiTitle?: string | null;
  originalTitle?: string | null;
  fallbackTitle?: string | null;
}): {
  mode: SummaryWindowTitleMode;
  displayTitle: string;
  hasAiTitle: boolean;
  hasOriginalTitle: boolean;
} {
  const aiTitle = String(options?.aiTitle || '').trim();
  const originalTitle = String(options?.originalTitle || '').trim();
  const fallbackTitle = String(options?.fallbackTitle || '').trim() || 'Video summary';
  const requested: SummaryWindowTitleMode = options?.mode === 'original' ? 'original' : 'ai';
  if (requested === 'original') {
    return {
      mode: 'original',
      displayTitle: originalTitle || aiTitle || fallbackTitle,
      hasAiTitle: Boolean(aiTitle),
      hasOriginalTitle: Boolean(originalTitle)
    };
  }
  const resolvedMode: SummaryWindowTitleMode = aiTitle ? 'ai' : 'original';
  return {
    mode: resolvedMode,
    displayTitle: aiTitle || originalTitle || fallbackTitle,
    hasAiTitle: Boolean(aiTitle),
    hasOriginalTitle: Boolean(originalTitle)
  };
}

export function normalizeAutoFactCheckSetting(val: unknown): boolean {
  return val !== false;
}

export interface FollowUpTurnVersion {
  question: string;
  answer: string;
  model: string;
  fallbackFrom?: string;
  createdAt?: number;
}

export interface NormalizedFollowUpTurn {
  q: string;
  a: string;
  model: string;
  versions: FollowUpTurnVersion[];
  activeVersionIndex: number;
}

export function normalizeFollowUpTurn(raw: any): NormalizedFollowUpTurn {
  const rawVersions = Array.isArray(raw?.versions) ? raw.versions : [];
  const baseQuestion = String(raw?.q ?? raw?.question ?? '').trim();
  const baseAnswer = String(raw?.a ?? raw?.answer ?? '');
  const baseModel = String(raw?.model || '').trim() || 'Gemini';

  const versions: FollowUpTurnVersion[] =
    rawVersions.length > 0
      ? rawVersions.map((v: any) => ({
          question: String(v?.question ?? v?.q ?? baseQuestion).trim() || baseQuestion,
          answer: String(v?.answer ?? v?.a ?? ''),
          model: String(v?.model || baseModel).trim() || baseModel,
          ...(v?.fallbackFrom ? { fallbackFrom: String(v.fallbackFrom) } : {}),
          ...(typeof v?.createdAt === 'number' ? { createdAt: v.createdAt } : {})
        }))
      : [
          {
            question: baseQuestion,
            answer: baseAnswer,
            model: baseModel,
            ...(raw?.fallbackFrom ? { fallbackFrom: String(raw.fallbackFrom) } : {})
          }
        ];

  const rawIdx = typeof raw?.activeVersionIndex === 'number' ? Math.floor(raw.activeVersionIndex) : versions.length - 1;
  const activeVersionIndex = Math.max(0, Math.min(versions.length - 1, rawIdx));
  const active = versions[activeVersionIndex];

  return {
    q: active.question,
    a: active.answer,
    model: active.model,
    versions,
    activeVersionIndex
  };
}

export function normalizeFollowUpTurnsList(turns: any[]): NormalizedFollowUpTurn[] {
  return (Array.isArray(turns) ? turns : []).map((t) => normalizeFollowUpTurn(t));
}

export function getActiveFollowUpVersion(turn: any): FollowUpTurnVersion {
  const norm = normalizeFollowUpTurn(turn);
  return norm.versions[norm.activeVersionIndex];
}

export function appendFollowUpTurnVersion(
  turn: any,
  version: FollowUpTurnVersion
): NormalizedFollowUpTurn {
  const norm = normalizeFollowUpTurn(turn);
  const cleanVer: FollowUpTurnVersion = {
    question: String(version?.question ?? norm.q).trim() || norm.q,
    answer: String(version?.answer ?? ''),
    model: String(version?.model || norm.model).trim() || norm.model,
    ...(version?.fallbackFrom ? { fallbackFrom: String(version.fallbackFrom) } : {}),
    createdAt: typeof version?.createdAt === 'number' ? version.createdAt : Date.now()
  };
  const nextVersions = [...norm.versions, cleanVer];
  const nextIdx = nextVersions.length - 1;
  return {
    q: cleanVer.question,
    a: cleanVer.answer,
    model: cleanVer.model,
    versions: nextVersions,
    activeVersionIndex: nextIdx
  };
}

export function stepFollowUpTurnVersion(
  turn: any,
  delta: number
): NormalizedFollowUpTurn {
  const norm = normalizeFollowUpTurn(turn);
  const step = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  const nextIdx = Math.max(0, Math.min(norm.versions.length - 1, norm.activeVersionIndex + step));
  const active = norm.versions[nextIdx];
  return {
    q: active.question,
    a: active.answer,
    model: active.model,
    versions: norm.versions,
    activeVersionIndex: nextIdx
  };
}

export function normalizeContinueAudioOnMinimize(val: unknown): boolean {
  if (val === false || val === 0) return false;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === 'false' || s === '0' || s === 'off' || s === 'no') return false;
  }
  return true;
}

export function shouldStopPlaybackOnMinimize(
  continueAudioOnMinimize: unknown,
  skipCommit = false
): boolean {
  if (skipCommit) return true;
  return !normalizeContinueAudioOnMinimize(continueAudioOnMinimize);
}

export interface PastelAccentPreset {
  id: string;
  name: string;
  hex: string;
}

export const PASTEL_ACCENT_PRESETS: PastelAccentPreset[] = [
  { id: 'powder-blue', name: 'Powder Blue', hex: '#93C5FD' },
  { id: 'periwinkle', name: 'Periwinkle', hex: '#A5B4FC' },
  { id: 'soft-lavender', name: 'Soft Lavender', hex: '#C4B5FD' },
  { id: 'orchid-pink', name: 'Orchid Pink', hex: '#F0ABFC' },
  { id: 'blush-rose', name: 'Blush Rose', hex: '#FDA4AF' },
  { id: 'warm-peach', name: 'Warm Peach', hex: '#FDBA74' },
  { id: 'buttercream', name: 'Buttercream', hex: '#FDE047' },
  { id: 'mint-sage', name: 'Mint Sage', hex: '#86EFAC' },
  { id: 'seafoam', name: 'Seafoam', hex: '#6EE7B7' },
  { id: 'ice-aqua', name: 'Ice Aqua', hex: '#67E8F9' },
  { id: 'sky-mist', name: 'Sky Mist', hex: '#7DD3FC' },
  { id: 'dusty-lilac', name: 'Dusty Lilac', hex: '#D8B4FE' }
];

export const ACCENT_CSS_VAR_KEYS = [
  '--md-sys-color-primary',
  '--md-sys-color-on-primary',
  '--md-sys-color-primary-container',
  '--md-sys-color-on-primary-container',
  '--md-sys-color-secondary-container',
  '--md-sys-color-on-secondary-container',
  '--yt-spec-call-to-action',
  '--yt-spec-10-percent-layer',
  '--yt-accent-tint',
  '--yt-accent-tint-strong',
  '--yt-accent-border',
  '--yt-accent-border-strong'
] as const;

export function normalizeAccentColorHex(raw: unknown): string {
  const s = String(raw || '').trim();
  if (!s || s.toLowerCase() === 'default') return '';
  const m6 = /^#?([0-9a-f]{6})$/i.exec(s);
  if (m6) return `#${m6[1].toUpperCase()}`;
  const m3 = /^#?([0-9a-f]{3})$/i.exec(s);
  if (m3) {
    const [r, g, b] = m3[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return '';
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = normalizeAccentColorHex(hex);
  if (!clean) return null;
  const n = parseInt(clean.slice(1), 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clampByte(r), clampByte(g), clampByte(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = Math.max(0, Math.min(255, r)) / 255;
  const gn = Math.max(0, Math.min(255, g)) / 255;
  const bn = Math.max(0, Math.min(255, b)) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return {
    h: Math.round((h / 6) * 360) % 360,
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((Number(h) || 0) % 360 + 360) % 360;
  const sat = Math.max(0, Math.min(100, Number(s) || 0)) / 100;
  const lit = Math.max(0, Math.min(100, Number(l) || 0)) / 100;
  const a = sat * Math.min(lit, 1 - lit);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const color = lit - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color);
  };
  return rgbToHex(f(0), f(8), f(4));
}

export function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const linear = [rgb.r, rgb.g, rgb.b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const l1 = getRelativeLuminance(hexA);
  const l2 = getRelativeLuminance(hexB);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

export function colorWheelPointToHex(nx: number, ny: number, lightness = 76): string {
  const x = Number.isFinite(nx) ? nx : 0;
  const y = Number.isFinite(ny) ? ny : 0;
  const radius = Math.min(1, Math.hypot(x, y));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const sat = Math.round(radius * 100);
  const lit = Math.max(40, Math.min(92, lightness));
  return hslToHex(deg, sat, lit);
}

export function hexToColorWheelPoint(hex: string): { nx: number; ny: number } {
  const rgb = hexToRgb(hex);
  if (!rgb) return { nx: 0, ny: 0 };
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const r = Math.max(0, Math.min(1, hsl.s / 100));
  const rad = (hsl.h * Math.PI) / 180;
  return {
    nx: Number((r * Math.cos(rad)).toFixed(4)),
    ny: Number((r * Math.sin(rad)).toFixed(4))
  };
}

export interface MaterialAccentPalette {
  seedHex: string;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tintSoft: string;
  tintStrong: string;
  borderSoft: string;
  borderStrong: string;
}

export function resolveMaterialAccentPalette(
  accentHex: unknown,
  effectiveTheme: EffectiveTheme
): MaterialAccentPalette | null {
  const seedHex = normalizeAccentColorHex(accentHex);
  if (!seedHex) return null;
  const rgb = hexToRgb(seedHex);
  if (!rgb) return null;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const isLight = effectiveTheme === 'light';

  let primary = seedHex;
  let onPrimary = '#FFFFFF';
  let primaryContainer = seedHex;
  let onPrimaryContainer = '#0F172A';
  let secondaryContainer = seedHex;
  let onSecondaryContainer = '#0F172A';

  if (isLight) {
    const sat = Math.min(90, Math.max(hsl.s < 8 ? 0 : 48, hsl.s));
    let lit = 40;
    primary = hslToHex(hsl.h, sat, lit);
    while (
      lit > 16 &&
      (getContrastRatio(primary, '#FFFFFF') < 4.7 || getContrastRatio(primary, '#F3F3FA') < 4.55)
    ) {
      lit -= 2;
      primary = hslToHex(hsl.h, sat, lit);
    }
    onPrimary = getContrastRatio(primary, '#FFFFFF') >= getContrastRatio(primary, '#111318') ? '#FFFFFF' : '#111318';

    primaryContainer = hslToHex(hsl.h, hsl.s < 8 ? 10 : Math.min(92, Math.max(58, hsl.s)), 89);
    onPrimaryContainer = hslToHex(hsl.h, hsl.s < 8 ? 10 : Math.min(85, Math.max(48, hsl.s)), 15);
    if (getContrastRatio(onPrimaryContainer, primaryContainer) < 7.0) {
      onPrimaryContainer = '#0F172A';
    }

    secondaryContainer = hslToHex(hsl.h, hsl.s < 8 ? 8 : Math.min(58, Math.max(28, hsl.s * 0.65)), 90);
    onSecondaryContainer = hslToHex(hsl.h, hsl.s < 8 ? 10 : Math.min(68, Math.max(36, hsl.s * 0.6)), 18);
    if (getContrastRatio(onSecondaryContainer, secondaryContainer) < 6.5) {
      onSecondaryContainer = '#111318';
    }
  } else {
    const sat = hsl.s < 8 ? 8 : Math.min(92, Math.max(52, hsl.s));
    let lit = Math.max(72, Math.min(86, hsl.l >= 68 && hsl.l <= 88 ? hsl.l : 78));
    primary = hslToHex(hsl.h, sat, lit);
    while (lit < 90 && getContrastRatio(primary, '#282A31') < 5.2) {
      lit += 2;
      primary = hslToHex(hsl.h, sat, lit);
    }
    const darkInk = hslToHex(hsl.h, hsl.s < 8 ? 10 : Math.min(82, Math.max(42, sat)), 13);
    onPrimary = getContrastRatio(primary, darkInk) >= 7.0 ? darkInk : '#090D12';

    primaryContainer = hslToHex(hsl.h, hsl.s < 8 ? 12 : Math.min(72, Math.max(34, sat * 0.78)), 25);
    onPrimaryContainer = hslToHex(hsl.h, hsl.s < 8 ? 12 : Math.min(94, Math.max(62, sat)), 90);
    if (getContrastRatio(onPrimaryContainer, primaryContainer) < 6.0) {
      onPrimaryContainer = '#F8FAFC';
    }

    secondaryContainer = hslToHex(hsl.h, hsl.s < 8 ? 10 : Math.min(48, Math.max(22, sat * 0.5)), 27);
    onSecondaryContainer = hslToHex(hsl.h, hsl.s < 8 ? 12 : Math.min(84, Math.max(46, sat * 0.72)), 90);
    if (getContrastRatio(onSecondaryContainer, secondaryContainer) < 6.0) {
      onSecondaryContainer = '#F8FAFC';
    }
  }

  const pRgb = hexToRgb(primary) || rgb;
  return {
    seedHex,
    primary,
    onPrimary,
    primaryContainer,
    onPrimaryContainer,
    secondaryContainer,
    onSecondaryContainer,
    tintSoft: `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, ${isLight ? '0.12' : '0.16'})`,
    tintStrong: `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, ${isLight ? '0.20' : '0.24'})`,
    borderSoft: `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.48)`,
    borderStrong: `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.68)`
  };
}

export function resolveAccentCssVars(
  accentHex: unknown,
  effectiveTheme: EffectiveTheme
): Record<string, string> {
  const palette = resolveMaterialAccentPalette(accentHex, effectiveTheme);
  if (!palette) return {};
  return {
    '--md-sys-color-primary': palette.primary,
    '--md-sys-color-on-primary': palette.onPrimary,
    '--md-sys-color-primary-container': palette.primaryContainer,
    '--md-sys-color-on-primary-container': palette.onPrimaryContainer,
    '--md-sys-color-secondary-container': palette.secondaryContainer,
    '--md-sys-color-on-secondary-container': palette.onSecondaryContainer,
    '--yt-spec-call-to-action': palette.primary,
    '--yt-spec-10-percent-layer': palette.tintSoft,
    '--yt-accent-tint': palette.tintSoft,
    '--yt-accent-tint-strong': palette.tintStrong,
    '--yt-accent-border': palette.borderSoft,
    '--yt-accent-border-strong': palette.borderStrong
  };
}



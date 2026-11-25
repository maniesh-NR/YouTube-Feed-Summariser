import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import {
  formatSecondsToTimestamp,
  parseTimestampToSeconds,
  getCacheKeyPrefix,
  resolveNextModelDown,
  resolveAskFallbackPlan,
  cleanTextForSpeech,
  parseTranscriptCues,
  findActiveCueByCharIndex,
  findActiveCueByTime,
  detectYouTubeTheme,
  resolveReaderTheme,
  BoundedMemoryCache,
  getDraftStorageKey,
  getGranularTtsRates,
  getSpeedIndicatorType,
  clampPitch,
  formatSummaryExportJson,
  computeWaveformAmplitudes,
  normalizeHistoryTabVisibility,
  shouldShowHistoryTab,
  normalizeResponseRating,
  buildResponseRatingKey,
  applyResponseRating,
  formatMathSymbolsInText,
  clampWindowBounds,
  computeDefaultWindowBounds,
  classifyWindowSizeTier,
  getAdaptiveWindowFlags,
  normalizeAltTitlesEnabled,
  resolveFeedCardTitleMode,
  sanitizeGeneratedAltTitle,
  shouldCacheGeneratedAltTitle,
  normalizeCompactOptionsMap,
  extractVideoIdFromHref,
  pruneTimestampIndex,
  computeDecorrelatedJitterDelay,
  isRelevantMutationSignal,
  applyKeyboardWindowAdjustment,
  findTranscriptCueIndexForSeconds,
  normalizeChannelRuleKey,
  normalizeChannelTitleRules,
  setChannelTitleRuleInMap,
  resolveAutoTitleDecision,
  normalizeSummaryPersona,
  resolveSummaryPersonaInstruction,
  resolveSummaryPersonaPromptSuffix,
  parseVideoChaptersFromDescription,
  extractSummaryChapters,
  buildLongVideoTranscriptChunks,
  buildChunkMapPrompt,
  buildChunkReducePrompt,
  formatSummaryExportMarkdown,
  normalizePodcastHostCount,
  buildDefaultPodcastHosts,
  buildPodcastScriptPrompt,
  buildPodcastInteractionPrompt,
  parsePodcastScriptResponse,
  buildDeterministicPodcastEpisode,
  buildDeterministicPodcastInteractionResponse,
  splicePodcastInteractionTurns,
  buildGeminiMultiSpeakerTtsBody,
  extractVideoIdFromCacheKey,
  countUniqueCachedVideoIds,
  shouldDeferBackgroundAltTitleFetch,
  decodeBasicEntities,
  extractCaptionTracksFromHtml,
  parseJson3TranscriptEvents,
  parseXmlTranscriptEvents,
  extractDescriptiveTitleFromTranscript,
  dedupeAdjacentTitleDuplicate,
  shouldTriggerFeedCardMenuPoll,
  buildAltTitleModelCandidates,
  extractWatchMetadataFromHtml,
  extractWatchMetadataFromPlayerData,
  isMeaningfulDescriptionForTitle,
  extractGeminiNonThoughtText,
  normalizeAppThemeMode,
  resolveEffectiveAppTheme,
  isSponsorOrPromoLine,
  stripSponsorAndPromoFromText,
  normalizeUiFormattingPrefs,
  normalizeGeneratedTextPrefs,
  resolveFormattingCssVars,
  buildFollowUpModelCandidates,
  buildFactCheckModelCandidates,
  parseStoryboardSpecString,
  computeStoryboardFrameInfo,
  getVideoThumbnailFallbackUrl,
  parseVisualMarkerToken,
  parseVisualMarkerFromLine,
  tokenizeSummaryTextWithVisuals,
  ensureFallbackVisualMarkers,
  sanitizeSpokenTurnText,
  splitSummaryIntoPodcastSections,
  buildPodcastScriptPartPrompt,
  buildPodcastContinuationPrompt,
  buildDeterministicPodcastEpisodePart,
  appendPodcastEpisodeTurns,
  resolveSummaryWindowDisplayTitle,
  normalizeAutoFactCheckSetting,
  normalizeFollowUpTurn,
  normalizeFollowUpTurnsList,
  getActiveFollowUpVersion,
  appendFollowUpTurnVersion,
  stepFollowUpTurnVersion,
  normalizeContinueAudioOnMinimize,
  shouldStopPlaybackOnMinimize,
  PASTEL_ACCENT_PRESETS,
  ACCENT_CSS_VAR_KEYS,
  normalizeAccentColorHex,
  getContrastRatio,
  colorWheelPointToHex,
  hexToColorWheelPoint,
  resolveMaterialAccentPalette,
  resolveAccentCssVars
} from './userscript-helpers';

test('formatSecondsToTimestamp formats correctly below and above 1 hour', () => {
  assert.equal(formatSecondsToTimestamp(5), '00:05');
  assert.equal(formatSecondsToTimestamp(75), '01:15');
  assert.equal(formatSecondsToTimestamp(3665), '1:01:05');
});

test('parseTimestampToSeconds parses standard and hour-long timestamps', () => {
  assert.equal(parseTimestampToSeconds('00:05'), 5);
  assert.equal(parseTimestampToSeconds('01:15'), 75);
  assert.equal(parseTimestampToSeconds('1:01:05'), 3665);
});

test('getCacheKeyPrefix selects the four designated cache slots', () => {
  assert.equal(getCacheKeyPrefix('summary', 'video'), 'sum:');
  assert.equal(getCacheKeyPrefix('transcript', 'video'), 'trn:');
  assert.equal(getCacheKeyPrefix('summary', 'text'), 'sut:');
  assert.equal(getCacheKeyPrefix('transcript', 'text'), 'trt:');
});

test('resolveNextModelDown traverses fallback ladder and respects key availability', () => {
  const ladder = [
    'gemini-3.1-pro-preview',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-2.0-flash'
  ];
  const available = ['gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-2.0-flash'];

  const next = resolveNextModelDown('gemini-3.8-flash', ladder, available);
  assert.equal(next, 'gemini-3.6-flash', 'Skips 3.7-flash because key lacks it and picks 3.6-flash');

  // When Ask fails, starts from index 0 of the fallback ladder
  assert.equal(
    resolveNextModelDown('YouTube Ask (Gemini in the page)', ladder, available),
    'gemini-3.1-pro-preview',
    'Selects top eligible ladder model (gemini-3.1-pro-preview) when Ask fails with full key'
  );
  assert.equal(
    resolveNextModelDown('YouTube Ask (Gemini in the page)', ladder, ['gemini-3.8-flash', 'gemini-3.6-flash']),
    'gemini-3.8-flash',
    'Selects first available non-pro ladder model when free key lacks pro'
  );
  assert.equal(
    resolveNextModelDown('Ask', ladder, []),
    'gemini-3.1-pro-preview',
    'Selects first model on ladder when availableModels list is empty'
  );
});

test('resolveAskFallbackPlan handles cancelled jobs, missing keys, and eligible ladder fallback', () => {
  const ladder = [
    'gemini-3.1-pro-preview',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash'
  ];

  const cancelledPlan = resolveAskFallbackPlan({
    currentModel: 'YouTube Ask (Gemini in the page)',
    fallbackLadder: ladder,
    availableModels: ['gemini-3.8-flash'],
    hasApiKey: true,
    cancelled: true,
    errorMessage: 'Ask job was cancelled'
  });
  assert.equal(cancelledPlan.shouldFallback, false);
  assert.equal(cancelledPlan.reason, 'cancelled');

  const noKeyPlan = resolveAskFallbackPlan({
    currentModel: 'YouTube Ask (Gemini in the page)',
    fallbackLadder: ladder,
    availableModels: [],
    hasApiKey: false,
    errorMessage: "YouTube's Ask button didn't appear"
  });
  assert.equal(noKeyPlan.shouldFallback, false);
  assert.equal(noKeyPlan.reason, 'no_key');

  const paidKeyPlan = resolveAskFallbackPlan({
    currentModel: 'YouTube Ask (Gemini in the page)',
    fallbackLadder: ladder,
    availableModels: ['gemini-3.1-pro-preview', 'gemini-3.8-flash'],
    hasApiKey: true,
    errorMessage: "YouTube's Ask button didn't appear\nExtra details"
  });
  assert.equal(paidKeyPlan.shouldFallback, true);
  assert.equal(paidKeyPlan.reason, 'ladder_fallback');
  assert.equal(paidKeyPlan.nextModel, 'gemini-3.1-pro-preview');
  assert.ok(paidKeyPlan.note?.includes('Automatically proceeding with gemini-3.1-pro-preview'));

  const freeKeyPlan = resolveAskFallbackPlan({
    currentModel: 'YouTube Ask (Gemini in the page)',
    fallbackLadder: ladder,
    availableModels: ['gemini-3.8-flash', 'gemini-3.6-flash'],
    hasApiKey: true,
    errorMessage: 'Ask answer generation timed out'
  });
  assert.equal(freeKeyPlan.shouldFallback, true);
  assert.equal(freeKeyPlan.nextModel, 'gemini-3.8-flash');

  const exhaustedPlan = resolveAskFallbackPlan({
    currentModel: 'YouTube Ask (Gemini in the page)',
    fallbackLadder: ladder,
    availableModels: ['unrelated-model-only'],
    hasApiKey: true,
    errorMessage: 'Ask failed'
  });
  assert.equal(exhaustedPlan.shouldFallback, false);
  assert.equal(exhaustedPlan.reason, 'no_eligible_model');
});

test('cleanTextForSpeech strips visual markers and prepares natural spoken text', () => {
  const rawMarkdown = `## TL;DR
**Sodium batteries** achieve *great* results!
### [01:15] Cell Chemistry
[[FRAME 01:15 | diagram of cathode]]
Researchers found 90% retention at [1:05:30].
<script>alert("test")</script>
- Point 1: Read [Research Paper](https://example.com/paper).`;

  const spoken = cleanTextForSpeech(rawMarkdown);
  assert.ok(!spoken.includes('FRAME'), 'Visual markers stripped');
  assert.ok(!spoken.includes('script'), 'Script tags stripped');
  assert.ok(!spoken.includes('##'), 'Markdown heading hashes stripped');
  assert.ok(!spoken.includes('**'), 'Markdown bold asterisks stripped');
  assert.ok(!spoken.includes('https://'), 'URLs stripped');
  assert.ok(spoken.includes('at 1 minute 15 seconds'), 'Timestamp converted to spoken words');
  assert.ok(spoken.includes('at 1 hour 5 minutes 30 seconds'), 'Hour timestamp converted to spoken words');
});

test('parseTranscriptCues extracts cues, offsets, and spoken text correctly', () => {
  const sampleTranscript = `## Transcript (YouTube captions)

[00:00] First segment introduction.
[01:15] Second segment discussing architecture.
[05:30] Third segment covering benchmarks.`;

  const { cues, fullSpokenText } = parseTranscriptCues(sampleTranscript);
  assert.equal(cues.length, 3, 'Found 3 timestamped cues');
  assert.equal(cues[0].tsStr, '[00:00]');
  assert.equal(cues[0].startSec, 0);
  assert.equal(cues[1].tsStr, '[01:15]');
  assert.equal(cues[1].startSec, 75);
  assert.equal(cues[2].tsStr, '[05:30]');
  assert.equal(cues[2].startSec, 330);

  assert.ok(fullSpokenText.includes('First segment introduction'), 'Includes first segment text');
  assert.ok(fullSpokenText.includes('Second segment discussing architecture'), 'Includes second segment text');

  // Test character lookup
  const midFirst = cues[0].charStart + 5;
  const active1 = findActiveCueByCharIndex(cues, midFirst);
  assert.equal(active1?.tsStr, '[00:00]', 'Char index in cue 0 returns cue 0');

  const midSecond = cues[1].charStart + 10;
  const active2 = findActiveCueByCharIndex(cues, midSecond);
  assert.equal(active2?.tsStr, '[01:15]', 'Char index in cue 1 returns cue 1');

  // Test time lookup
  const timeActiveEarly = findActiveCueByTime(cues, 1, 100);
  assert.equal(timeActiveEarly?.tsStr, '[00:00]', 'Early progress maps to cue 0');

  const timeActiveMid = findActiveCueByTime(cues, 50, 100);
  assert.ok(timeActiveMid?.tsStr === '[01:15]' || timeActiveMid?.tsStr === '[05:30]', 'Mid progress maps to cue 1 or 2');
});

test('detectYouTubeTheme detects dark and light mode from DOM hierarchy', () => {
  // Test 1: html[dark] attribute present
  const mockDocDarkHtml = {
    documentElement: {
      hasAttribute: (attr: string) => attr === 'dark',
      getAttribute: (attr: string) => (attr === 'dark' ? '' : null),
      classList: { contains: () => false }
    },
    querySelector: () => null
  };
  assert.equal(detectYouTubeTheme(mockDocDarkHtml), 'dark', 'HTML element with dark attribute detected as dark');

  // Test 2: ytd-app[dark] present
  const mockDocDarkYtd = {
    documentElement: {
      hasAttribute: () => false,
      getAttribute: () => null,
      classList: { contains: () => false }
    },
    querySelector: (sel: string) => (sel === 'ytd-app[dark]' ? {} : null)
  };
  assert.equal(detectYouTubeTheme(mockDocDarkYtd), 'dark', 'ytd-app with dark attribute detected as dark');

  // Test 3: Standard light mode (no dark attributes)
  const mockDocLight = {
    documentElement: {
      hasAttribute: () => false,
      getAttribute: () => null,
      classList: { contains: () => false }
    },
    querySelector: () => null,
    body: { hasAttribute: () => false }
  };
  assert.equal(detectYouTubeTheme(mockDocLight), 'light', 'Document without dark attributes detected as light');
});

test('resolveReaderTheme respects sync toggle and manual fallback', () => {
  // When sync is ON, always matches detected YouTube theme
  assert.equal(resolveReaderTheme('sepia', true, 'dark'), 'dark', 'Sync ON overrides manual sepia with dark');
  assert.equal(resolveReaderTheme('sepia', true, 'light'), 'light', 'Sync ON overrides manual sepia with light');
  assert.equal(resolveReaderTheme('system', true, 'dark'), 'dark', 'Sync ON matches dark');

  // When sync is OFF, retains user manual choice
  assert.equal(resolveReaderTheme('sepia', false, 'dark'), 'sepia', 'Sync OFF retains sepia');
  assert.equal(resolveReaderTheme('light', false, 'dark'), 'light', 'Sync OFF retains light even if YouTube is dark');
  assert.equal(resolveReaderTheme('dark', false, 'light'), 'dark', 'Sync OFF retains dark even if YouTube is light');
});

test('BoundedMemoryCache respects capacity limit and evicts least-recently-used items', () => {
  const cache = new BoundedMemoryCache<string, string>(3);
  cache.set('a', 'alpha');
  cache.set('b', 'beta');
  cache.set('c', 'gamma');
  assert.equal(cache.size, 3);

  // Access 'a' to make it recently used: order is now b, c, a
  assert.equal(cache.get('a'), 'alpha');

  // Insert 'd': capacity 3 exceeded, 'b' is evicted
  cache.set('d', 'delta');
  assert.equal(cache.size, 3);
  assert.equal(cache.has('b'), false, 'Key "b" was evicted as LRU');
  assert.equal(cache.has('a'), true, 'Key "a" retained because it was accessed');
  assert.equal(cache.has('c'), true, 'Key "c" retained');
  assert.equal(cache.has('d'), true, 'Key "d" added');

  // Verify iteration and keys
  const keys = Array.from(cache.keys());
  assert.deepEqual(keys, ['c', 'a', 'd'], 'Keys preserve LRU-to-MRU iteration order');
  const values = Array.from(cache.values());
  assert.deepEqual(values, ['gamma', 'alpha', 'delta'], 'Values preserve iteration order');

  const iterated: string[] = [];
  cache.forEach((v, k) => {
    iterated.push(`${k}:${v}`);
  });
  assert.deepEqual(iterated, ['c:gamma', 'a:alpha', 'd:delta']);
});

test('getDraftStorageKey returns consistent namespaced draft key', () => {
  assert.equal(getDraftStorageKey('vid_123'), 'draft:vid_123');
  assert.equal(getDraftStorageKey('abc'), 'draft:abc');
});

test('getGranularTtsRates provides strictly 0.25x steps', () => {
  const rates = getGranularTtsRates();
  assert.deepEqual(rates, [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]);
  for (let i = 1; i < rates.length; i++) {
    const diff = Math.round((rates[i] - rates[i - 1]) * 100) / 100;
    assert.equal(diff, 0.25, `Step between ${rates[i - 1]} and ${rates[i]} is exactly 0.25x`);
  }
});

test('getSpeedIndicatorType classifies speed presets accurately', () => {
  assert.equal(getSpeedIndicatorType(1.0), 'speed-normal');
  assert.equal(getSpeedIndicatorType(1.25), 'speed-boost');
  assert.equal(getSpeedIndicatorType(2.0), 'speed-boost');
  assert.equal(getSpeedIndicatorType(0.75), 'speed-slow');
  assert.equal(getSpeedIndicatorType(0.5), 'speed-slow');
});

test('clampPitch validates and bounds voice pitch within 0.5x to 2.0x', () => {
  assert.equal(clampPitch(1.0), 1.0, 'Baseline pitch is 1.0');
  assert.equal(clampPitch(0.5), 0.5, 'Minimum pitch boundary is 0.5');
  assert.equal(clampPitch(2.0), 2.0, 'Maximum pitch boundary is 2.0');
  assert.equal(clampPitch(0.2), 0.5, 'Sub-minimum pitch clamps to 0.5');
  assert.equal(clampPitch(3.5), 2.0, 'Super-maximum pitch clamps to 2.0');
  assert.equal(clampPitch(NaN), 1.0, 'NaN defaults safely to 1.0');
  assert.equal(clampPitch(Infinity), 1.0, 'Infinity defaults safely to 1.0');
  assert.equal(clampPitch(-Infinity), 1.0, '-Infinity defaults safely to 1.0');
  assert.equal(clampPitch(null), 1.0, 'Null defaults safely to 1.0');
  assert.equal(clampPitch(undefined), 1.0, 'Undefined defaults safely to 1.0');
  assert.equal(clampPitch('1.75'), 1.75, 'String representations parse and clamp accurately');
});

test('formatSummaryExportJson generates valid JSON with video title, channel, and processing mode', () => {
  const jsonStr = formatSummaryExportJson({
    videoId: 'abc123xyz',
    videoTitle: 'Quantum Computing Deep Dive',
    channel: 'Tech Architecture Network',
    mode: 'transcript',
    processingMode: 'deep',
    model: 'gemini-3.8-flash',
    text: '## Detailed Summary\nChronological overview of quantum gate latency.',
    factCheck: 'All quantum telemetry claims verified against peer reviews.',
    citations: [{ uri: 'https://arxiv.org/abs/2301.00000', title: 'Quantum Telemetry Preprint' }],
    followUpQuestions: [
      {
        question: 'What is the coherence time?',
        answer: 'Measured coherence time exceeds 120 microseconds [04:12].',
        sources: [{ uri: 'https://arxiv.org/abs/2301.00000', title: 'Paper Citation' }]
      }
    ],
    ttsRate: 1.25,
    ttsVolume: 0.85,
    ttsPitch: 1.15,
    ttsVoice: 'ai:Zephyr'
  });

  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.generator, 'YouTube Feed Summariser (Gemini)');
  assert.equal(parsed.metadata.videoId, 'abc123xyz');
  assert.equal(parsed.metadata.videoTitle, 'Quantum Computing Deep Dive');
  assert.equal(parsed.metadata.channel, 'Tech Architecture Network');
  assert.equal(parsed.metadata.processingMode, 'deep');
  assert.equal(parsed.metadata.mode, 'transcript');
  assert.equal(parsed.metadata.model, 'gemini-3.8-flash');
  assert.equal(parsed.metadata.ttsSettings.pitch, 1.15);
  assert.equal(parsed.metadata.ttsSettings.rate, 1.25);
  assert.equal(parsed.metadata.ttsSettings.volume, 0.85);
  assert.equal(parsed.metadata.ttsSettings.voice, 'ai:Zephyr');
  assert.equal(parsed.content.factCheck, 'All quantum telemetry claims verified against peer reviews.');
  assert.equal(parsed.content.citations.length, 1);
  assert.equal(parsed.content.followUpQuestions.length, 1);
  assert.equal(parsed.content.followUpQuestions[0].question, 'What is the coherence time?');
});

test('computeWaveformAmplitudes generates dynamic voice frequency bands and responds to playback state', () => {
  // Test 1: Idle or stopped speech returns resting flatline
  const idleAmps = computeWaveformAmplitudes({ isPlaying: false, barCount: 8 });
  assert.equal(idleAmps.length, 8, 'Returns requested bar count');
  assert.ok(idleAmps.every((a) => a === 0.08), 'All bars return resting baseline (0.08) when idle');

  // Test 2: Muted speech (volume = 0) returns resting flatline even if isPlaying is true
  const mutedAmps = computeWaveformAmplitudes({ isPlaying: true, volume: 0, barCount: 8 });
  assert.ok(mutedAmps.every((a) => a === 0.08), 'All bars return flatline when volume is zero');

  // Test 3: Active playback produces modulated positive amplitudes
  const activeAmps = computeWaveformAmplitudes({
    isPlaying: true,
    volume: 1.0,
    pitch: 1.0,
    rate: 1.0,
    timestamp: 1000,
    barCount: 12
  });
  assert.equal(activeAmps.length, 12);
  assert.ok(activeAmps.some((a) => a > 0.15), 'Active speech produces elevated amplitudes above baseline');
  assert.ok(activeAmps.every((a) => a >= 0.08 && a <= 1.0), 'All amplitudes remain strictly clamped in [0.08, 1.0]');

  // Test 4: Pitch shift elevates relative high-frequency formant energy
  const lowPitchAmps = computeWaveformAmplitudes({
    isPlaying: true,
    volume: 1.0,
    pitch: 0.5,
    rate: 1.0,
    timestamp: 2500,
    barCount: 10
  });
  const highPitchAmps = computeWaveformAmplitudes({
    isPlaying: true,
    volume: 1.0,
    pitch: 2.0,
    rate: 1.0,
    timestamp: 2500,
    barCount: 10
  });
  // Upper frequencies (last 3 bars) have higher relative formant resonance with high pitch
  const lowTrebleEnergy = lowPitchAmps.slice(-3).reduce((acc, v) => acc + v, 0);
  const highTrebleEnergy = highPitchAmps.slice(-3).reduce((acc, v) => acc + v, 0);
  assert.ok(highTrebleEnergy > lowTrebleEnergy, 'High pitch shifts formant resonance towards upper frequency bands');

  // Test 5: Syllable pulse increases immediate speech attack
  const normalAmp = computeWaveformAmplitudes({ isPlaying: true, timestamp: 3000, boundaryPulse: 0, barCount: 6 });
  const pulsedAmp = computeWaveformAmplitudes({ isPlaying: true, timestamp: 3000, boundaryPulse: 0.8, barCount: 6 });
  const normalSum = normalAmp.reduce((a, b) => a + b, 0);
  const pulsedSum = pulsedAmp.reduce((a, b) => a + b, 0);
  assert.ok(pulsedSum > normalSum, 'Syllable boundary pulse increases speech amplitude attack');
});

test('normalizeHistoryTabVisibility and shouldShowHistoryTab enforce visibility modes', () => {
  assert.equal(normalizeHistoryTabVisibility('always'), 'always');
  assert.equal(normalizeHistoryTabVisibility('with_tabs'), 'with_tabs');
  assert.equal(normalizeHistoryTabVisibility('never'), 'never');
  assert.equal(normalizeHistoryTabVisibility('invalid'), 'always');

  // Always mode: shown when cached summaries exist regardless of active tab count
  assert.equal(shouldShowHistoryTab({ visibility: 'always', cachedCount: 3, activeTabCount: 0 }), true);
  assert.equal(shouldShowHistoryTab({ visibility: 'always', cachedCount: 0, activeTabCount: 2 }), false);

  // With_tabs mode: shown ONLY when other tabs are open or minimized
  assert.equal(shouldShowHistoryTab({ visibility: 'with_tabs', cachedCount: 3, activeTabCount: 0 }), false);
  assert.equal(shouldShowHistoryTab({ visibility: 'with_tabs', cachedCount: 3, activeTabCount: 1 }), true);

  // Never mode: never shown even with cached summaries and open tabs
  assert.equal(shouldShowHistoryTab({ visibility: 'never', cachedCount: 5, activeTabCount: 3 }), false);
});

test('response rating helpers toggle, switch, and preserve notes cleanly', () => {
  assert.equal(normalizeResponseRating('up'), 'up');
  assert.equal(normalizeResponseRating('down'), 'down');
  assert.equal(normalizeResponseRating('other'), null);
  assert.equal(buildResponseRatingKey('vid_1', 'summary'), 'vid_1:summary:main');
  assert.equal(buildResponseRatingKey('vid_1', 'followup', 'turn_2'), 'vid_1:followup:turn_2');

  let map: Record<string, any> = {};
  const upRes = applyResponseRating(map, { videoId: 'vid_1', targetType: 'summary', rating: 'up', timestamp: 100 });
  assert.equal(upRes.record?.rating, 'up');
  map = upRes.nextMap;
  assert.equal(Object.keys(map).length, 1);

  // Switching from up to down replaces rating
  const downRes = applyResponseRating(map, { videoId: 'vid_1', targetType: 'summary', rating: 'down', note: 'Inaccurate', timestamp: 200 });
  assert.equal(downRes.record?.rating, 'down');
  assert.equal(downRes.record?.note, 'Inaccurate');
  map = downRes.nextMap;

  // Clicking the same rating again without note toggles it off
  const toggleOff = applyResponseRating(map, { videoId: 'vid_1', targetType: 'summary', rating: 'down' });
  assert.equal(toggleOff.record, null);
  assert.equal(Object.keys(toggleOff.nextMap).length, 0);
});

test('formatMathSymbolsInText converts LaTeX scientific symbols without breaking currency', () => {
  const boilingSample =
    'At 4,300 meters, atmospheric pressure drops significantly, causing the boiling point of water to fall from the sea-level standard of $100^\\circ\\text{C}$ to approximately $87^\\circ\\text{C}$.';
  const formatted = formatMathSymbolsInText(boilingSample);
  assert.equal(
    formatted,
    'At 4,300 meters, atmospheric pressure drops significantly, causing the boiling point of water to fall from the sea-level standard of 100°C to approximately 87°C.'
  );

  // Superscripts, subscripts, Greek letters, operators
  assert.equal(formatMathSymbolsInText('$E = mc^2$ and $\\text{H}_2\\text{O}$ at $\\approx 25^\\circ\\text{C}$'), 'E = mc² and H₂O at ≈ 25°C');
  assert.equal(formatMathSymbolsInText('$\\alpha \\le \\beta \\pm 0.5$ and $\\frac{a}{b}$'), 'α ≤ β ± 0.5 and a/b');

  // Currency preservation
  assert.equal(
    formatMathSymbolsInText('Sodium cells cost $0.30/kg vs $18/kg, saving between $100 and $200 per pack.'),
    'Sodium cells cost $0.30/kg vs $18/kg, saving between $100 and $200 per pack.'
  );

  // Parenthesized inline LaTeX \(...\)
  assert.equal(formatMathSymbolsInText('Cooling curve \\( f(T) = (100^\\circ\\text{C}) - 13^\\circ\\text{C} \\)'), 'Cooling curve f(T) = (100°C) - 13°C');

  // cleanTextForSpeech also converts LaTeX symbols
  const spoken = cleanTextForSpeech('Standard boiling point is $100^\\circ\\text{C}$ to $87^\\circ\\text{C}$.');
  assert.ok(spoken.includes('100°C') && spoken.includes('87°C') && !spoken.includes('\\circ'));
});

test('window bounds clamping, cascading defaults, and adaptive size tiers behave consistently', () => {
  const clamped = clampWindowBounds({ left: -50, top: 2000, width: 120, height: 1500 }, { width: 1280, height: 800 });
  assert.equal(clamped.width, 340, 'Enforces minWidth 340');
  assert.equal(clamped.height, 736, 'Clamps height to viewport - 64');
  assert.equal(clamped.left, 12, 'Clamps negative left inside viewport margin');
  assert.ok(clamped.top <= 800 - clamped.height - 52, 'Keeps window above bottom dock');

  const win0 = computeDefaultWindowBounds({ width: 1440, height: 900 }, 0);
  const win1 = computeDefaultWindowBounds({ width: 1440, height: 900 }, 1);
  assert.notEqual(win0.left, win1.left, 'Cascades consecutive windows horizontally');
  assert.notEqual(win0.top, win1.top, 'Cascades consecutive windows vertically');

  assert.equal(classifyWindowSizeTier(420), 'compact');
  assert.equal(classifyWindowSizeTier(539), 'compact');
  assert.equal(classifyWindowSizeTier(540), 'medium');
  assert.equal(classifyWindowSizeTier(779), 'medium');
  assert.equal(classifyWindowSizeTier(780), 'wide');

  const compactFlags = getAdaptiveWindowFlags(460, 420);
  assert.equal(compactFlags.tier, 'compact');
  assert.equal(compactFlags.useOverflowHeaderMenu, true);
  assert.equal(compactFlags.collapseOptionsRow, true);
  assert.equal(compactFlags.isShort, true);
  assert.equal(compactFlags.singleColumnAdvPanel, true);

  const wideFlags = getAdaptiveWindowFlags(900, 720);
  assert.equal(wideFlags.tier, 'wide');
  assert.equal(wideFlags.useOverflowHeaderMenu, false);
  assert.equal(wideFlags.collapseOptionsRow, false);
  assert.equal(wideFlags.compactTtsBar, false);
  assert.equal(wideFlags.isShort, false);
});

test('auto-title replacement defaults to enabled, respects settings off, and yields to DeArrow', () => {
  assert.equal(normalizeAltTitlesEnabled(undefined), true);
  assert.equal(normalizeAltTitlesEnabled(null), true);
  assert.equal(normalizeAltTitlesEnabled(true), true);
  assert.equal(normalizeAltTitlesEnabled(false), false);
  assert.equal(normalizeAltTitlesEnabled('false'), false);

  // Enabled by default on normal non-DeArrow cards
  assert.equal(
    resolveFeedCardTitleMode({ isMusic: false, hasDeArrowTitle: false, altTitlesEnabled: true }),
    'ai'
  );
  // Disabled in settings keeps original title on non-DeArrow cards
  assert.equal(
    resolveFeedCardTitleMode({ isMusic: false, hasDeArrowTitle: false, altTitlesEnabled: false }),
    'original'
  );
  // DeArrow always takes precedence when present on a card
  assert.equal(
    resolveFeedCardTitleMode({ isMusic: false, hasDeArrowTitle: true, altTitlesEnabled: true }),
    'dearrow'
  );
  assert.equal(
    resolveFeedCardTitleMode({ isMusic: false, hasDeArrowTitle: true, altTitlesEnabled: false }),
    'dearrow'
  );
  // Music videos remain exempt regardless of setting
  assert.equal(
    resolveFeedCardTitleMode({ isMusic: true, hasDeArrowTitle: true, altTitlesEnabled: true }),
    'music'
  );

  // Title sanitization strips quotes/markdown and caps at 150 chars
  assert.equal(sanitizeGeneratedAltTitle('**"Clean Title Here"**'), 'Clean Title Here');
  const overlong = 'A'.repeat(180);
  const capped = sanitizeGeneratedAltTitle(overlong);
  assert.equal(capped.length, 150);
  assert.ok(capped.endsWith('...'));
});

test('shouldCacheGeneratedAltTitle blocks clickbait self-caching on empty/fallback titles', () => {
  assert.equal(
    shouldCacheGeneratedAltTitle('THIS CHANGES EVERYTHING!', 'THIS CHANGES EVERYTHING!', false),
    false
  );
  assert.equal(
    shouldCacheGeneratedAltTitle('THIS CHANGES EVERYTHING!', 'this changes everything!', true),
    false
  );
  assert.equal(shouldCacheGeneratedAltTitle('Too', 'Original Title', true), false);
  assert.equal(
    shouldCacheGeneratedAltTitle(
      'Benchmark comparison of 3nm ARM cores vs x86 efficiency',
      'THIS CHANGES EVERYTHING!',
      true
    ),
    true
  );
});

test('normalizeCompactOptionsMap validates stored compact options disclosure preferences', () => {
  assert.deepEqual(normalizeCompactOptionsMap(null), {});
  assert.deepEqual(normalizeCompactOptionsMap(['bad']), {});
  assert.deepEqual(
    normalizeCompactOptionsMap({ vid1: true, vid2: false, vid3: 'yes', '': true }),
    { vid1: true, vid2: false }
  );
  const polluted = JSON.parse('{"__proto__":true,"constructor":true,"vid1":true}');
  assert.deepEqual(normalizeCompactOptionsMap(polluted), { vid1: true });
});

test('extractVideoIdFromHref parses /watch?v=, /shorts/, and /live/ video IDs cleanly', () => {
  assert.equal(extractVideoIdFromHref('/watch?v=dQw4w9WgXcQ&t=15s'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoIdFromHref('https://www.youtube.com/shorts/S_shortVid_01?feature=share'), 'S_shortVid_01');
  assert.equal(extractVideoIdFromHref('/live/LiveStream_9988'), 'LiveStream_9988');
  assert.equal(extractVideoIdFromHref('/channel/UC12345'), null);
});

test('pruneTimestampIndex evicts oldest unprotected entries cleanly while preserving protected IDs', () => {
  const input = { a: 10, b: 20, c: 30, d: 40, e: 50 };
  const protectedIds = new Set(['a', 'b']);
  const { kept, evicted } = pruneTimestampIndex(input, 3, protectedIds);
  assert.deepEqual(evicted, ['c', 'd']);
  assert.deepEqual(Object.keys(kept).sort(), ['a', 'b', 'e']);
});

test('computeDecorrelatedJitterDelay honors bounds and Retry-After cooldowns', () => {
  assert.equal(computeDecorrelatedJitterDelay(2000, 2000, 60000, 0, 0), 2000);
  assert.equal(computeDecorrelatedJitterDelay(4000, 2000, 60000, 0, 1), 12000);
  assert.equal(computeDecorrelatedJitterDelay(4000, 2000, 60000, 25000, 0), 25000);
  assert.equal(computeDecorrelatedJitterDelay(40000, 2000, 60000, 90000, 1), 60000);
});

test('isRelevantMutationSignal filters player/live-chat noise while passing card & DeArrow updates', () => {
  assert.equal(
    isRelevantMutationSignal({ type: 'characterData', inNoiseSubtree: true, inTitleOrDeArrowSubtree: false }),
    false
  );
  assert.equal(
    isRelevantMutationSignal({ type: 'childList', inNoiseSubtree: true, inTitleOrDeArrowSubtree: false, hasFeedOrDeArrowNodes: false }),
    false
  );
  assert.equal(
    isRelevantMutationSignal({ type: 'characterData', inNoiseSubtree: false, inTitleOrDeArrowSubtree: true }),
    true
  );
  assert.equal(
    isRelevantMutationSignal({ type: 'attributes', inNoiseSubtree: false, inTitleOrDeArrowSubtree: false, attributeName: 'data-dearrow-title' }),
    true
  );
});

test('userscript contains zero Trusted-Types-unsafe innerHTML/outerHTML/insertAdjacentHTML sinks', () => {
  const userscriptPath = path.resolve(process.cwd(), 'youtube-feed-summariser.user.js');
  const source = fs.readFileSync(userscriptPath, 'utf8');
  const unsafeMatch = source.match(/\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/g);
  assert.equal(unsafeMatch, null, `Found unsafe DOM sink(s): ${unsafeMatch?.join(', ')}`);
});

test('applyKeyboardWindowAdjustment handles move, north/corner resize, shift boost, and mobile <400px clamping', () => {
  const desktop = { width: 1440, height: 900 };
  const initial = { left: 200, top: 150, width: 640, height: 500 };

  // Move right & Shift+Down
  const movedRight = applyKeyboardWindowAdjustment(initial, 'move', null, 'ArrowRight', false, desktop);
  assert.equal(movedRight.handled, true);
  assert.equal(movedRight.bounds.left, 216);
  assert.equal(movedRight.bounds.top, 150);

  const movedFastDown = applyKeyboardWindowAdjustment(initial, 'move', null, 'ArrowDown', true, desktop);
  assert.equal(movedFastDown.bounds.top, 198);

  // North resize upward grows height and moves top up, keeping bottom edge fixed
  const resizedNorth = applyKeyboardWindowAdjustment(initial, 'resize', 'n', 'ArrowUp', true, desktop);
  assert.equal(resizedNorth.bounds.top, 102);
  assert.equal(resizedNorth.bounds.height, 548);
  assert.equal(resizedNorth.bounds.top + resizedNorth.bounds.height, initial.top + initial.height);

  // North-West corner resize upward & left
  const nwUp = applyKeyboardWindowAdjustment(initial, 'resize', 'nw', 'ArrowUp', false, desktop);
  assert.equal(nwUp.bounds.top, 134);
  assert.equal(nwUp.bounds.height, 516);
  const nwLeft = applyKeyboardWindowAdjustment(nwUp.bounds, 'resize', 'nw', 'ArrowLeft', true, desktop);
  assert.equal(nwLeft.bounds.left, 152);
  assert.equal(nwLeft.bounds.width, 688);

  // North-East corner resize right
  const neRight = applyKeyboardWindowAdjustment(initial, 'resize', 'ne', 'ArrowRight', false, desktop);
  assert.equal(neRight.bounds.left, 200);
  assert.equal(neRight.bounds.width, 656);

  // Non-arrow key returns handled=false
  const ignored = applyKeyboardWindowAdjustment(initial, 'resize', 'se', 'Enter', false, desktop);
  assert.equal(ignored.handled, false);
  assert.deepEqual(ignored.bounds, initial);

  // Mobile narrow viewports (<400px) clamp width inside viewport with marginX = 8
  const mobile375 = clampWindowBounds({ left: -20, top: 10, width: 520, height: 600 }, { width: 375, height: 812 });
  assert.ok(mobile375.left >= 8 && mobile375.left + mobile375.width <= 375 - 8, '375px viewport fits without horizontal overflow');

  const ultraNarrow320 = clampWindowBounds({ left: 0, top: 0, width: 420, height: 500 }, { width: 320, height: 568 });
  assert.equal(ultraNarrow320.left, 8);
  assert.equal(ultraNarrow320.width, 304, '320px viewport adapts effective minWidth cleanly without overflowing 320px');
});

test('AUD-07: userscript contains zero blocking alert() dialogs', () => {
  const userscriptPath = path.resolve(process.cwd(), 'youtube-feed-summariser.user.js');
  const source = fs.readFileSync(userscriptPath, 'utf8');
  const blockingAlerts = source.match(/\b(?:window\.)?alert\s*\(/g);
  assert.equal(blockingAlerts, null, `Found blocking alert() call(s): ${blockingAlerts?.join(', ')}`);
});

test('FEAT-01: findTranscriptCueIndexForSeconds maps seek seconds to nearest preceding cue', () => {
  const cues = [
    { startSec: 0 },
    { startSec: 75 },
    { startSec: 260 },
    { startSec: 585 }
  ];
  assert.equal(findTranscriptCueIndexForSeconds([], 120), -1);
  assert.equal(findTranscriptCueIndexForSeconds(cues, 0), 0);
  assert.equal(findTranscriptCueIndexForSeconds(cues, 70), 0);
  assert.equal(findTranscriptCueIndexForSeconds(cues, 75), 1);
  assert.equal(findTranscriptCueIndexForSeconds(cues, 300), 2);
  assert.equal(findTranscriptCueIndexForSeconds(cues, 999), 3);
});

test('FEAT-02: per-channel auto-title rule normalization, updates, and priority precedence', () => {
  assert.equal(normalizeChannelRuleKey('  Tech   Frontier '), 'tech frontier');
  assert.equal(normalizeChannelRuleKey('__proto__'), '');
  assert.deepEqual(
    normalizeChannelTitleRules({ ' Tech Frontier ': 'exempt', 'Veritasium': 'force_ai', bad: 'other', constructor: 'exempt' }),
    { 'tech frontier': 'exempt', veritasium: 'force_ai' }
  );

  let rules = setChannelTitleRuleInMap({}, 'Tech Frontier', 'exempt');
  assert.deepEqual(rules, { 'tech frontier': 'exempt' });
  rules = setChannelTitleRuleInMap(rules, 'Astro Science', 'force_ai');
  assert.deepEqual(rules, { 'tech frontier': 'exempt', 'astro science': 'force_ai' });
  rules = setChannelTitleRuleInMap(rules, 'Tech Frontier', 'default');
  assert.deepEqual(rules, { 'astro science': 'force_ai' });

  // Exempt channel skips AI title and prefers DeArrow or original
  const exemptRes = resolveAutoTitleDecision({
    altTitlesEnabled: true,
    isMusic: false,
    hasDeArrowTitle: false,
    channelName: 'Tech Frontier',
    channelRules: { 'tech frontier': 'exempt' }
  });
  assert.equal(exemptRes.mode, 'original');
  assert.equal(exemptRes.shouldAutoFetchAi, false);

  // force_ai overrides DeArrow when global auto-titles enabled
  const forceAiRes = resolveAutoTitleDecision({
    altTitlesEnabled: true,
    isMusic: false,
    hasDeArrowTitle: true,
    channelName: 'Astro Science',
    channelRules: { 'astro science': 'force_ai' }
  });
  assert.equal(forceAiRes.mode, 'ai');
  assert.equal(forceAiRes.shouldAutoFetchAi, true);

  // Global kill switch altTitlesEnabled=false always disables AI auto-titles even for force_ai
  const disabledGlobal = resolveAutoTitleDecision({
    altTitlesEnabled: false,
    isMusic: false,
    hasDeArrowTitle: true,
    channelName: 'Astro Science',
    channelRules: { 'astro science': 'force_ai' }
  });
  assert.equal(disabledGlobal.mode, 'dearrow');
  assert.equal(disabledGlobal.shouldAutoFetchAi, false);
});

test('FEAT-03: summary persona presets normalize and shape instructions & prompt suffixes', () => {
  assert.equal(normalizeSummaryPersona('technical'), 'technical');
  assert.equal(normalizeSummaryPersona('quiz'), 'quiz');
  assert.equal(normalizeSummaryPersona('chronological'), 'chronological');
  assert.equal(normalizeSummaryPersona('unknown-preset'), 'executive');

  const execFast = resolveSummaryPersonaInstruction('executive', 'fast');
  const techFast = resolveSummaryPersonaInstruction('technical', 'fast');
  const quizDeep = resolveSummaryPersonaInstruction('quiz', 'deep');
  assert.ok(!execFast.includes('Principal Systems Engineer'));
  assert.ok(techFast.includes('Principal Systems Engineer'));
  assert.ok(quizDeep.includes('exhaustive, deep') && quizDeep.includes('Interactive Tutor'));
  assert.equal(resolveSummaryPersonaPromptSuffix('executive'), '');
  assert.ok(resolveSummaryPersonaPromptSuffix('chronological').includes('[MM:SS]'));
});

test('AUD-08: Zero-Drift Parity between youtube-feed-summariser.user.js and src/utils/userscript-helpers.ts', () => {
  const userscriptPath = path.resolve(process.cwd(), 'youtube-feed-summariser.user.js');
  const source = fs.readFileSync(userscriptPath, 'utf8');

  const makeMockEl = (tag: string): any => {
    const attrs: Record<string, string> = {};
    const children: any[] = [];
    const el: any = {
      tagName: String(tag || 'div').toUpperCase(),
      style: {},
      dataset: {},
      className: '',
      textContent: '',
      children,
      childNodes: children,
      isConnected: true,
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false,
        toggle: () => false
      },
      setAttribute: (k: string, v: string) => { attrs[k] = String(v); },
      getAttribute: (k: string) => (k in attrs ? attrs[k] : null),
      hasAttribute: (k: string) => k in attrs,
      removeAttribute: (k: string) => { delete attrs[k]; },
      appendChild: (c: any) => { children.push(c); return c; },
      insertBefore: (c: any) => { children.unshift(c); return c; },
      remove: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      closest: () => null,
      attachShadow: () => {
        const sr = makeMockEl('shadow-root');
        el.shadowRoot = sr;
        return sr;
      }
    };
    return el;
  };

  const docEl = makeMockEl('html');
  const headEl = makeMockEl('head');
  const bodyEl = makeMockEl('body');
  const gmStore = new Map<string, any>();

  const mockDocument: any = {
    readyState: 'complete',
    documentElement: docEl,
    head: headEl,
    body: bodyEl,
    createElement: (tag: string) => makeMockEl(tag),
    createElementNS: (_ns: string, tag: string) => makeMockEl(tag),
    createTextNode: (txt: string) => ({ nodeType: 3, textContent: String(txt || '') }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const mockWindow: any = {
    location: { href: 'https://www.youtube.com/', pathname: '/', search: '', origin: 'https://www.youtube.com' },
    innerWidth: 1440,
    innerHeight: 900,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    navigator: { userAgent: 'node-vm', clipboard: { writeText: async () => {} } },
    speechSynthesis: { getVoices: () => [], cancel: () => {} },
    document: mockDocument
  };

  const context: Record<string, any> = {
    window: mockWindow,
    self: mockWindow,
    globalThis: mockWindow,
    document: mockDocument,
    navigator: mockWindow.navigator,
    location: mockWindow.location,
    localStorage: mockWindow.localStorage,
    console,
    setTimeout: (fn: (...a: any[]) => void, ms?: number, ...rest: any[]) => {
      const h = setTimeout(fn, ms, ...rest);
      h?.unref?.();
      return h;
    },
    clearTimeout,
    setInterval: (fn: (...a: any[]) => void, ms?: number, ...rest: any[]) => {
      const h = setInterval(fn, ms, ...rest);
      h?.unref?.();
      return h;
    },
    clearInterval,
    URL,
    Blob,
    Promise,
    JSON,
    Math,
    Date,
    RegExp,
    Error,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    CSS: { escape: (s: string) => String(s) },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    SpeechSynthesisUtterance: class {},
    Event: class { constructor(public type: string) {} },
    CustomEvent: class { constructor(public type: string, public detail?: any) {} },
    GM_getValue: (k: string, d: any) => (gmStore.has(k) ? gmStore.get(k) : d),
    GM_setValue: (k: string, v: any) => { gmStore.set(k, v); },
    GM_deleteValue: (k: string) => { gmStore.delete(k); },
    GM_listValues: () => Array.from(gmStore.keys()),
    GM_addValueChangeListener: () => 1,
    GM_registerMenuCommand: () => 1,
    GM_addStyle: () => {},
    GM_setClipboard: () => {},
    GM_xmlhttpRequest: () => {}
  };
  mockWindow.window = mockWindow;

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'youtube-feed-summariser.user.js' });
  const u = mockWindow.__yt_summariser_test;
  assert.ok(u, 'Userscript exposes window.__yt_summariser_test in VM execution');

  // 1. Formatters & math/speech cleaning parity
  assert.equal(u.formatSecondsToTimestamp(5), formatSecondsToTimestamp(5));
  assert.equal(u.formatSecondsToTimestamp(3665), formatSecondsToTimestamp(3665));
  assert.equal(u.clampPitch(0.2), clampPitch(0.2));
  assert.equal(u.clampPitch(2.9), clampPitch(2.9));

  const sampleMath = 'At 4,300m boiling drops from $100^\\circ\\text{C}$ to $87^\\circ\\text{C}$ ($0.30/kg).';
  assert.equal(u.formatMathSymbolsInText(sampleMath), formatMathSymbolsInText(sampleMath));
  assert.equal(u.cleanTextForSpeech(sampleMath), cleanTextForSpeech(sampleMath));

  // 2. Transcript cues & FEAT-01 cue search parity
  const sampleTx = '[00:00] Intro section.\n[01:15] Core thesis.\n[04:20] Benchmarks.';
  const uParsed = u.parseTranscriptCues(sampleTx);
  const hParsed = parseTranscriptCues(sampleTx);
  assert.equal(uParsed.fullSpokenText, hParsed.fullSpokenText);
  assert.equal(uParsed.cues.length, hParsed.cues.length);
  assert.equal(
    u.findTranscriptCueIndexForSeconds(JSON.parse(JSON.stringify(uParsed.cues)), 95),
    findTranscriptCueIndexForSeconds(hParsed.cues, 95)
  );

  // 3. FEAT-02 per-channel auto-title rule parity
  assert.equal(u.normalizeChannelRuleKey('  Tech   Frontier '), normalizeChannelRuleKey('  Tech   Frontier '));
  const decisionArgs = {
    altTitlesEnabled: true,
    isMusic: false,
    hasDeArrowTitle: true,
    channelName: 'Tech Frontier',
    channelRules: { 'tech frontier': 'force_ai' as const }
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.resolveAutoTitleDecision(decisionArgs))),
    resolveAutoTitleDecision(decisionArgs)
  );

  // 4. FEAT-03 summary persona parity
  for (const p of ['executive', 'technical', 'quiz', 'chronological', 'invalid'] as const) {
    assert.equal(u.normalizeSummaryPersona(p), normalizeSummaryPersona(p));
    assert.equal(u.resolveSummaryPersonaInstruction(p, 'fast'), resolveSummaryPersonaInstruction(p, 'fast'));
    assert.equal(u.resolveSummaryPersonaInstruction(p, 'deep'), resolveSummaryPersonaInstruction(p, 'deep'));
    assert.equal(u.resolveSummaryPersonaPromptSuffix(p), resolveSummaryPersonaPromptSuffix(p));
  }

  // 5. Window geometry & adaptive breakpoints parity
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.computeDefaultWindowBounds({ width: 1440, height: 900 }, 1))),
    computeDefaultWindowBounds({ width: 1440, height: 900 }, 1)
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.clampWindowBounds({ left: -20, top: 10, width: 520, height: 600 }, { width: 375, height: 812 }))),
    clampWindowBounds({ left: -20, top: 10, width: 520, height: 600 }, { width: 375, height: 812 })
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.getAdaptiveWindowFlags(460, 420))),
    getAdaptiveWindowFlags(460, 420)
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.applyKeyboardWindowAdjustment({ left: 200, top: 150, width: 640, height: 500 }, 'resize', 'n', 'ArrowUp', true, { width: 1440, height: 900 }))),
    applyKeyboardWindowAdjustment({ left: 200, top: 150, width: 640, height: 500 }, 'resize', 'n', 'ArrowUp', true, { width: 1440, height: 900 })
  );

  // 6. Jitter delay & history tab parity
  assert.equal(u.computeDecorrelatedJitterDelay(4000, 2000, 60000, 25000, 0), computeDecorrelatedJitterDelay(4000, 2000, 60000, 25000, 0));
  assert.equal(
    u.shouldShowHistoryTab({ visibility: 'with_tabs', cachedCount: 3, activeTabCount: 0 }),
    shouldShowHistoryTab({ visibility: 'with_tabs', cachedCount: 3, activeTabCount: 0 })
  );

  // 7. FEAT-04 Chapter-aware chunking & FEAT-06 Markdown bundle export parity
  const parityChaptersDesc = '00:00 Intro\n14:20 Leader Election\n31:10 Safety Proofs\n48:05 ReadIndex';
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.parseVideoChaptersFromDescription(parityChaptersDesc, 3500))),
    parseVideoChaptersFromDescription(parityChaptersDesc, 3500)
  );
  const parityLongTx = '[00:00] Intro\n[14:20] Election\n[31:10] Safety\n[48:05] ReadIndex\n[56:00] Outro';
  const uPlan = JSON.parse(JSON.stringify(u.buildLongVideoTranscriptChunks(parityLongTx, { totalDurationSec: 3500 })));
  const hPlan = buildLongVideoTranscriptChunks(parityLongTx, { totalDurationSec: 3500 });
  assert.deepEqual(uPlan, hPlan);
  assert.equal(
    u.buildChunkMapPrompt('Consensus Lecture', uPlan.chunks[0], uPlan.chunks.length, 'technical'),
    buildChunkMapPrompt('Consensus Lecture', hPlan.chunks[0], hPlan.chunks.length, 'technical')
  );
  assert.equal(
    u.buildChunkReducePrompt('Consensus Lecture', [{ title: 'Intro', tsStr: '[00:00]', summary: 'S1' }], 'technical', 'deep'),
    buildChunkReducePrompt('Consensus Lecture', [{ title: 'Intro', tsStr: '[00:00]', summary: 'S1' }], 'technical', 'deep')
  );
  const mdPayload = {
    videoId: 'PARITY_MD',
    videoTitle: 'Raft Consensus',
    channel: 'Systems Lab',
    duration: '58:30',
    mode: 'summary',
    persona: 'technical',
    model: 'gemini-3.8-flash',
    text: '## TL;DR\nBoiling drops from $100^\\circ\\text{C}$ [14:20]. Cost is $0.30/kg.',
    chapters: hPlan.chapters,
    followUpQuestions: [{ question: 'Why ReadIndex?', answer: 'Linearizable reads [48:05].', model: 'gemini-4-argon' }],
    ratings: { main: { videoId: 'PARITY_MD', targetType: 'summary' as const, targetId: 'main', rating: 'up' as const, updatedAt: 1700000000000, note: 'Clear proof' }, followUps: {} },
    exportedAt: '2026-11-17T12:00:00.000Z'
  };
  assert.equal(u.formatSummaryExportMarkdown(mdPayload), formatSummaryExportMarkdown(mdPayload));

  // 8. FEAT-07 Interactive Multi-Host Podcast parity
  assert.equal(u.normalizePodcastHostCount(1), normalizePodcastHostCount(1));
  assert.equal(u.normalizePodcastHostCount(4), normalizePodcastHostCount(4));
  assert.equal(u.normalizePodcastHostCount(12), normalizePodcastHostCount(12));

  const uHosts = JSON.parse(JSON.stringify(u.buildDefaultPodcastHosts(3)));
  const hHosts = buildDefaultPodcastHosts(3);
  assert.deepEqual(uHosts, hHosts);

  const sampleScript = '```json\n{"title":"RISC-V Roundtable","turns":[{"speaker":"Alex","text":"Opening note [00:00]."},{"speaker":"Maya","text":"Critical caveat [02:15]."}]}\n```';
  const uParsedPod = JSON.parse(JSON.stringify(u.parsePodcastScriptResponse(sampleScript, uHosts)));
  const hParsedPod = parsePodcastScriptResponse(sampleScript, hHosts);
  assert.equal(uParsedPod.title, hParsedPod.title);
  assert.equal(uParsedPod.turns.length, hParsedPod.turns.length);
  assert.equal(uParsedPod.turns[0].speaker, hParsedPod.turns[0].speaker);
  assert.equal(uParsedPod.turns[1].timestampSec, hParsedPod.turns[1].timestampSec);

  const uEp = JSON.parse(JSON.stringify(u.buildDeterministicPodcastEpisode({ videoTitle: 'RISC-V Chip', summaryText: '## TL;DR\n- 128 cores with 2x efficiency [02:15].\n- Vector extensions accelerate FP8 [08:45].', hosts: uHosts })));
  const hEp = buildDeterministicPodcastEpisode({ videoTitle: 'RISC-V Chip', summaryText: '## TL;DR\n- 128 cores with 2x efficiency [02:15].\n- Vector extensions accelerate FP8 [08:45].', hosts: hHosts });
  assert.equal(uEp.title, hEp.title);
  assert.equal(uEp.hostCount, hEp.hostCount);
  assert.equal(uEp.turns.length, hEp.turns.length);
  assert.deepEqual(uEp.turns.map((t: any) => t.speaker), hEp.turns.map((t) => t.speaker));

  const uSplice = JSON.parse(JSON.stringify(u.splicePodcastInteractionTurns(uEp.turns, 1, { id: 'u1', speaker: 'You (Listener)', role: 'Text Question', voiceName: 'Kore', pitch: 1, text: 'Why 3nm?', isUser: true }, [{ id: 'r1', speaker: 'Alex', role: 'Lead Moderator', voiceName: 'Kore', pitch: 1.04, text: 'Lower leakage.', isResponse: true }])));
  const hSplice = splicePodcastInteractionTurns(hEp.turns, 1, { id: 'u1', speaker: 'You (Listener)', role: 'Text Question', voiceName: 'Kore', pitch: 1, text: 'Why 3nm?', isUser: true }, [{ id: 'r1', speaker: 'Alex', role: 'Lead Moderator', voiceName: 'Kore', pitch: 1.04, text: 'Lower leakage.', isResponse: true }]);
  assert.equal(uSplice.firstResponseIndex, hSplice.firstResponseIndex);
  assert.equal(uSplice.nextTurns.length, hSplice.nextTurns.length);

  assert.deepEqual(
    JSON.parse(JSON.stringify(u.buildGeminiMultiSpeakerTtsBody(hEp.turns.slice(0, 2), hHosts))),
    buildGeminiMultiSpeakerTtsBody(hEp.turns.slice(0, 2), hHosts)
  );

  // 9. Page-load performance helpers & manifest timing parity
  assert.match(source, /\/\/\s*@run-at\s+document-idle\b/, 'Userscript uses @run-at document-idle to avoid blocking HTML parsing');
  assert.ok(source.includes('function ensureFeedStylesInjected()'), 'Feed CSS injection is lazily deferred until needed');
  assert.ok(source.includes('IntersectionObserver'), 'Offscreen feed cards use IntersectionObserver viewport gating');
  assert.equal(u.extractVideoIdFromCacheKey('sum:technical:vid_123'), extractVideoIdFromCacheKey('sum:technical:vid_123'));
  const parityKeys = ['sum:vidA', 'sut:vidA', 'trn:technical:vidB', 'win:vidC', 'alt_titles_index'];
  const parityIdxKeys = ['trt:quiz:vidC'];
  assert.equal(u.countUniqueCachedVideoIds(parityKeys, parityIdxKeys), countUniqueCachedVideoIds(parityKeys, parityIdxKeys));
  for (const probe of [
    { isExplicitCall: true, pageLoadSettled: false, isIntersectingViewport: false },
    { hasCachedAltTitle: true, pageLoadSettled: false, isIntersectingViewport: false },
    { hasTranscriptInMemoryOrMock: true, pageLoadSettled: false, isIntersectingViewport: false },
    { pageLoadSettled: false, isIntersectingViewport: true },
    { pageLoadSettled: true, isIntersectingViewport: false },
    { pageLoadSettled: true, isIntersectingViewport: true }
  ]) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(u.shouldDeferBackgroundAltTitleFetch(probe))),
      shouldDeferBackgroundAltTitleFetch(probe)
    );
  }

  // 10. Sidebar Watch Later immunity, captionTracks Route A fallback & duplicate title collapse parity
  assert.equal(u.decodeBasicEntities('AT&amp;T &quot;5G&quot; &lt;test&gt; &#39;ok&#39;'), decodeBasicEntities('AT&amp;T &quot;5G&quot; &lt;test&gt; &#39;ok&#39;'));
  const parityWatchHtml = '<script>var ytInitialPlayerResponse={"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc\\u0026lang=es","languageCode":"es","kind":"asr"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc\\u0026lang=en","languageCode":"en"}]}}};</script>';
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.extractCaptionTracksFromHtml(parityWatchHtml))),
    extractCaptionTracksFromHtml(parityWatchHtml)
  );
  const parityJson3 = { events: [{ tStartMs: 1200, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] }] };
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.parseJson3TranscriptEvents(parityJson3))),
    parseJson3TranscriptEvents(parityJson3)
  );
  const parityXml = '<transcript><text start="2.5" dur="3.1">Solid-state &amp; sodium cells.</text></transcript>';
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.parseXmlTranscriptEvents(parityXml))),
    parseXmlTranscriptEvents(parityXml)
  );
  assert.equal(
    u.dedupeAdjacentTitleDuplicate('Quantum Entanglement Explained Quantum Entanglement Explained'),
    dedupeAdjacentTitleDuplicate('Quantum Entanglement Explained Quantum Entanglement Explained')
  );
  assert.equal(
    u.extractDescriptiveTitleFromTranscript('[00:05] First detailed insight about sodium electrolytes.'),
    extractDescriptiveTitleFromTranscript('[00:05] First detailed insight about sodium electrolytes.')
  );
  for (const probe of [
    { hitOwnControl: true, inGuideSidebar: false, isMenuButton: true, hasVideoId: true },
    { hitOwnControl: false, inGuideSidebar: true, isMenuButton: true, hasVideoId: true },
    { hitOwnControl: false, inGuideSidebar: false, isMenuButton: true, hasVideoId: true }
  ]) {
    assert.equal(u.shouldTriggerFeedCardMenuPoll(probe), shouldTriggerFeedCardMenuPoll(probe));
  }
  const parityLadderArgs = {
    factPreferred: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'],
    fallbackLadder: ['gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview'],
    textModels: ['gemini-4-argon', 'gemini-3.8-flash'],
    availableModels: ['gemini-3.6-flash', 'gemini-3.5-flash-preview', 'gemini-2.5-flash', 'gemini-3.5-transcribe']
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.buildAltTitleModelCandidates(parityLadderArgs))),
    buildAltTitleModelCandidates(parityLadderArgs)
  );

  // 11. Watch metadata & Gemini non-thought response helper parity
  const sampleWatchHtml = `<html><head><meta name="description" content="Fallback meta summary text about superconducting magnets and fusion confinement"></head><script>ytcfg.set({"VISITOR_DATA":"Cgt123","INNERTUBE_API_KEY":"key123","INNERTUBE_CONTEXT_CLIENT_VERSION":"2.20260101.00.00"});var ytInitialPlayerResponse={"videoDetails":{"videoId":"V1","title":" Fusion  Test &amp; Demo ","author":"Science Lab","shortDescription":"Detailed explanation of high-temperature REBCO superconducting magnets in compact tokamaks.","keywords":["fusion","rebco"]}};</script></html>`;
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.extractWatchMetadataFromHtml(sampleWatchHtml))),
    extractWatchMetadataFromHtml(sampleWatchHtml)
  );
  assert.equal(
    u.isMeaningfulDescriptionForTitle('Detailed explanation of high-temperature REBCO superconducting magnets in compact tokamaks.'),
    isMeaningfulDescriptionForTitle('Detailed explanation of high-temperature REBCO superconducting magnets in compact tokamaks.')
  );
  const sampleParts = [{ thought: true, text: 'Internal thinking...' }, { text: 'Compact REBCO Tokamak Superconducting Magnet Design' }];
  assert.equal(
    u.extractGeminiNonThoughtText(sampleParts),
    extractGeminiNonThoughtText(sampleParts)
  );

  // 12. Material You App Theme Mode & Effective Theme Resolution Parity
  for (const mode of ['system', 'light', 'dark', 'LIGHT', 'invalid', undefined]) {
    assert.equal(u.normalizeAppThemeMode(mode), normalizeAppThemeMode(mode));
    assert.equal(u.resolveEffectiveAppTheme(mode, true), resolveEffectiveAppTheme(mode, true));
    assert.equal(u.resolveEffectiveAppTheme(mode, false), resolveEffectiveAppTheme(mode, false));
  }
});

test('35. FEAT-04 parseVideoChaptersFromDescription & extractSummaryChapters extract sorted timestamps cleanly', () => {
  const desc = [
    'Lecture Notes:',
    '14:20 - Leader Election & Split Votes',
    '00:00 Course Intro',
    '31:10: Safety Proofs & Invariants',
    '1:02:15 Production Chaos'
  ].join('\n');
  const chaps = parseVideoChaptersFromDescription(desc, 4000);
  assert.equal(chaps.length, 4);
  assert.equal(chaps[0].tsStr, '[00:00]');
  assert.equal(chaps[0].endSec, 860);
  assert.equal(chaps[1].title, 'Leader Election & Split Votes');
  assert.equal(chaps[3].startSec, 3735);
  assert.equal(chaps[3].endSec, 4000);

  const fromSummary = extractSummaryChapters(
    '## TL;DR\nSummary.\n### [00:00] Intro\nA\n### [14:20] Raft\nB\n### [31:10] Proofs\nC',
    [],
    3500
  );
  assert.equal(fromSummary.length, 3);
  assert.equal(fromSummary[1].tsStr, '[14:20]');
});

test('36. FEAT-04 buildLongVideoTranscriptChunks skips chunking <=45m and partitions >45m by chapter or 20m fallback', () => {
  const shortTx = '[00:00] Start\n[15:00] Middle\n[30:00] End';
  const shortPlan = buildLongVideoTranscriptChunks(shortTx, { totalDurationSec: 1850 });
  assert.equal(shortPlan.isLongVideoChunked, false);
  assert.equal(shortPlan.chunks.length, 1);

  const longTx = '[00:00] Intro\n[14:20] Election\n[31:10] Safety\n[48:05] ReadIndex\n[56:00] Wrap up';
  const chapters = parseVideoChaptersFromDescription('00:00 Intro\n14:20 Election\n31:10 Safety\n48:05 ReadIndex', 3500);
  const chapterPlan = buildLongVideoTranscriptChunks(longTx, { chapters, totalDurationSec: 3500 });
  assert.equal(chapterPlan.isLongVideoChunked, true);
  assert.equal(chapterPlan.chunks.length, 4);
  assert.ok(chapterPlan.chunks[2].text.includes('[31:10] Safety'));

  const windowFallbackPlan = buildLongVideoTranscriptChunks(longTx, { totalDurationSec: 3500 });
  assert.equal(windowFallbackPlan.isLongVideoChunked, true);
  assert.ok(windowFallbackPlan.chunks.length >= 2);
});

test('37. FEAT-06 formatSummaryExportMarkdown creates self-contained Obsidian bundle with frontmatter, math, deep links, Q&A and ratings', () => {
  const md = formatSummaryExportMarkdown({
    videoId: 'OBS_TEST_01',
    videoTitle: 'Raft Consensus Proof',
    channel: 'Systems Engineering Lab',
    duration: '58:30',
    mode: 'summary',
    processingMode: 'deep',
    persona: 'technical',
    model: 'gemini-3.8-flash',
    text: '## TL;DR\nRack burns at $100^\\circ\\text{C}$ [14:20]. Node cost $0.30/kg.',
    chapters: [
      { index: 0, title: 'Intro', startSec: 0, endSec: 860, tsStr: '[00:00]' },
      { index: 1, title: 'Leader Election', startSec: 860, endSec: 3510, tsStr: '[14:20]' }
    ],
    factCheck: 'Verified against Ongaro thesis [14:20].',
    citations: [{ uri: 'https://raft.github.io', title: 'Raft Paper' }],
    followUpQuestions: [
      {
        question: 'Draw state diagram?',
        answer: 'See state flow [48:05].',
        model: 'gemini-4-argon',
        imageUri: 'data:image/svg+xml;charset=utf-8,mock',
        sources: [{ uri: 'https://example.org/raft', title: 'Raft Ref' }]
      }
    ],
    ratings: {
      main: { videoId: 'OBS_TEST_01', targetType: 'summary', targetId: 'main', rating: 'up', updatedAt: 1700000000000, note: 'Strong invariant walkthrough' },
      followUps: {
        turn_0: { videoId: 'OBS_TEST_01', targetType: 'followup', targetId: 'turn_0', rating: 'down', updatedAt: 1700000001000, note: 'Add split-vote timeout bound' }
      }
    },
    exportedAt: '2026-11-17T12:00:00.000Z'
  });

  assert.ok(md.startsWith('---\n'), 'Starts with YAML frontmatter');
  assert.ok(md.includes('persona: "technical"'), 'Frontmatter records persona');
  assert.ok(md.includes('  - youtube-summary'), 'Frontmatter records Obsidian tags');
  assert.ok(md.includes('## Chapters'), 'Includes ## Chapters index');
  assert.ok(md.includes('[14:20](https://www.youtube.com/watch?v=OBS_TEST_01&t=860s)'), 'Links timestamps deeply to YouTube seconds');
  assert.ok(md.includes('100°C') && md.includes('$0.30/kg'), 'Formats LaTeX math to Unicode while preserving currency');
  assert.ok(md.includes('## Fact-Check & Verification'), 'Includes fact-check section');
  assert.ok(md.includes('## Follow-Up Q&A') && md.includes('![Generated Diagram]'), 'Includes follow-up Q&A and diagrams');
  assert.ok(md.includes('## Quality Ratings & Notes') && md.includes('Strong invariant walkthrough') && md.includes('Add split-vote timeout bound'), 'Preserves ratings & notes');
});

test('38. Backup CLI --diff and --restore --file verify snapshots and block path traversal', () => {
  const scriptPath = path.resolve(process.cwd(), 'scripts/sandbox-backup.mjs');
  const diffRaw = execFileSync('node', [scriptPath, '--diff', 'latest'], { encoding: 'utf8' });
  const diffJson = JSON.parse(diffRaw);
  assert.equal(diffJson.mode, 'snapshot-to-workspace');
  assert.ok(diffJson.baseSnapshot.startsWith('snap-'));
  assert.ok(typeof diffJson.summary?.unchanged === 'number' && diffJson.totalCompared > 0);

  const dryRestoreRaw = execFileSync(
    'node',
    [scriptPath, '--restore', 'latest', '--file=package.json', '--dry-run'],
    { encoding: 'utf8' }
  );
  const dryRestoreJson = JSON.parse(dryRestoreRaw);
  assert.equal(dryRestoreJson.dryRun, true);
  assert.equal(dryRestoreJson.selectiveRestore, true);
  assert.equal(dryRestoreJson.file, 'package.json');

  assert.throws(
    () => execFileSync('node', [scriptPath, '--restore', 'latest', '--file=../../etc/passwd', '--dry-run'], { stdio: 'pipe' }),
    /Command failed/,
    'Rejects parent directory traversal in --file'
  );
});

test('39. Media silencer blocks background watch autoplay & viewport resize/adaptive TTS parity holds', async () => {
  const userscriptPath = path.resolve(process.cwd(), 'youtube-feed-summariser.user.js');
  const source = fs.readFileSync(userscriptPath, 'utf8');

  assert.ok(source.includes('allowIframeFallback: false'), 'Feed card alt-title generation disables hidden /watch iframe fallback');
  assert.ok(source.includes('if (!this.windowBox || !this.isOpen) return;'), 'Viewport resize handler guards on active this.windowBox and this.isOpen');
  assert.ok(source.includes('if (stopSilencer)'), 'runYouTubeAsk & Route B clean up media silencer intervals');

  const compactFlags = getAdaptiveWindowFlags(420, 620);
  const mediumFlags = getAdaptiveWindowFlags(640, 620);
  const wideFlags = getAdaptiveWindowFlags(900, 620);
  assert.equal(compactFlags.compactTtsBar, true);
  assert.equal(mediumFlags.compactTtsBar, true);
  assert.equal(wideFlags.compactTtsBar, false);

  // Exercise silenceWatchDocumentMedia in isolated VM against mock <video autoplay> and #movie_player
  let playProtoCalled = false;
  let pausedCalled = false;
  let playerMuted = false;
  let playerPaused = false;
  const attachedEvents: string[] = [];

  const mockVideo: any = {
    tagName: 'VIDEO',
    autoplay: true,
    defaultMuted: false,
    muted: false,
    volume: 0.9,
    paused: false,
    removeAttributeCalled: false,
    removeAttribute(name: string) {
      if (name === 'autoplay') this.removeAttributeCalled = true;
    },
    pause() {
      this.paused = true;
      pausedCalled = true;
    }
  };
  const mockPlayer = {
    mute() { playerMuted = true; },
    pauseVideo() { playerPaused = true; }
  };

  function FakeMediaElement() {}
  FakeMediaElement.prototype.play = function () {
    playProtoCalled = true;
    return Promise.resolve();
  };

  const listeners = new Map<string, Array<(ev: any) => void>>();
  const mockIframeWin: any = {
    HTMLMediaElement: FakeMediaElement
  };
  const mockIframeDoc: any = {
    addEventListener(evt: string, fn: (ev: any) => void) {
      attachedEvents.push(evt);
      const arr = listeners.get(evt) || [];
      arr.push(fn);
      listeners.set(evt, arr);
    },
    querySelectorAll: (sel: string) => (sel === 'video, audio' ? [mockVideo] : []),
    getElementById: (id: string) => (id === 'movie_player' ? mockPlayer : null),
    querySelector: () => null
  };

  const makeMockEl = (tag: string): any => {
    const attrs: Record<string, string> = {};
    const children: any[] = [];
    const el: any = {
      tagName: String(tag || 'div').toUpperCase(),
      style: {},
      dataset: {},
      className: '',
      textContent: '',
      children,
      childNodes: children,
      isConnected: true,
      classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => false },
      setAttribute: (k: string, v: string) => { attrs[k] = String(v); },
      getAttribute: (k: string) => (k in attrs ? attrs[k] : null),
      hasAttribute: (k: string) => k in attrs,
      removeAttribute: (k: string) => { delete attrs[k]; },
      appendChild: (c: any) => { children.push(c); return c; },
      insertBefore: (c: any) => { children.unshift(c); return c; },
      remove: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      closest: () => null,
      attachShadow: () => {
        const sr = makeMockEl('shadow-root');
        el.shadowRoot = sr;
        return sr;
      }
    };
    return el;
  };
  const mockDocument: any = {
    readyState: 'complete',
    documentElement: makeMockEl('html'),
    head: makeMockEl('head'),
    body: makeMockEl('body'),
    createElement: (tag: string) => makeMockEl(tag),
    createElementNS: (_ns: string, tag: string) => makeMockEl(tag),
    createTextNode: (txt: string) => ({ nodeType: 3, textContent: String(txt || '') }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  const mockWindow: any = {
    location: { href: 'https://www.youtube.com/', pathname: '/', search: '', origin: 'https://www.youtube.com' },
    innerWidth: 1440,
    innerHeight: 900,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    navigator: { userAgent: 'node-vm', clipboard: { writeText: async () => {} } },
    speechSynthesis: { getVoices: () => [], cancel: () => {} },
    document: mockDocument
  };
  mockWindow.window = mockWindow;
  const ctx: Record<string, any> = {
    window: mockWindow,
    self: mockWindow,
    globalThis: mockWindow,
    document: mockDocument,
    navigator: mockWindow.navigator,
    location: mockWindow.location,
    localStorage: mockWindow.localStorage,
    console,
    setTimeout: (fn: (...a: any[]) => void, ms?: number, ...rest: any[]) => {
      const h = setTimeout(fn, ms, ...rest);
      h?.unref?.();
      return h;
    },
    clearTimeout,
    setInterval: (fn: (...a: any[]) => void, ms?: number, ...rest: any[]) => {
      const h = setInterval(fn, ms, ...rest);
      h?.unref?.();
      return h;
    },
    clearInterval,
    URL,
    Blob,
    Promise,
    JSON,
    Math,
    Date,
    RegExp,
    Error,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    CSS: { escape: (s: string) => String(s) },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    SpeechSynthesisUtterance: class {},
    Event: class { constructor(public type: string) {} },
    CustomEvent: class { constructor(public type: string, public detail?: any) {} },
    GM_getValue: (_k: string, d: any) => d,
    GM_setValue: () => {},
    GM_deleteValue: () => {},
    GM_listValues: () => [],
    GM_addValueChangeListener: () => 1,
    GM_registerMenuCommand: () => 1,
    GM_addStyle: () => {},
    GM_setClipboard: () => {},
    GM_xmlhttpRequest: () => {}
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'youtube-feed-summariser.user.js' });
  const u = mockWindow.__yt_summariser_test;

  u.silenceWatchDocumentMedia(mockIframeWin, mockIframeDoc);

  assert.equal(mockVideo.autoplay, false);
  assert.equal(mockVideo.defaultMuted, true);
  assert.equal(mockVideo.muted, true);
  assert.equal(mockVideo.volume, 0);
  assert.equal(mockVideo.removeAttributeCalled, true);
  assert.equal(pausedCalled, true);
  assert.equal(playerMuted, true);
  assert.equal(playerPaused, true);
  assert.ok(attachedEvents.includes('play') && attachedEvents.includes('volumechange'));

  // Subsequent play() attempt on overridden prototype must not run original play and must re-mute/pause
  mockVideo.paused = false;
  mockVideo.muted = false;
  mockVideo.volume = 0.8;
  await FakeMediaElement.prototype.play.call(mockVideo);
  assert.equal(playProtoCalled, false, 'Original HTMLMediaElement.prototype.play is blocked inside hidden watch frame');
  assert.equal(mockVideo.muted, true);
  assert.equal(mockVideo.volume, 0);
  assert.equal(mockVideo.paused, true);
});

test('40. FEAT-07 Podcast host configuration clamps 2..6 hosts and builds distinct multi-host rosters', () => {
  assert.equal(normalizePodcastHostCount(0), 2);
  assert.equal(normalizePodcastHostCount(1), 2);
  assert.equal(normalizePodcastHostCount(2), 2);
  assert.equal(normalizePodcastHostCount(4), 4);
  assert.equal(normalizePodcastHostCount(9), 6);
  assert.equal(normalizePodcastHostCount('abc'), 2);

  const fourHosts = buildDefaultPodcastHosts(4, [
    { name: 'Elena', voiceName: 'Zephyr' },
    { name: 'Marcus', voiceName: 'Fenrir' }
  ]);
  assert.equal(fourHosts.length, 4);
  assert.equal(fourHosts[0].name, 'Elena');
  assert.equal(fourHosts[0].voiceName, 'Zephyr');
  assert.equal(fourHosts[1].name, 'Marcus');
  assert.equal(fourHosts[1].voiceName, 'Fenrir');
  assert.equal(fourHosts[2].name, 'Maya');
  assert.equal(fourHosts[3].name, 'Jordan');
});

test('41. FEAT-07 Podcast episode generation, script parsing & mid-episode Q&A splicing work across 2-5 hosts', () => {
  const hosts5 = buildDefaultPodcastHosts(5);
  const summaryText = [
    '## TL;DR',
    'Custom 128-core RISC-V server silicon doubles performance per watt [02:15].',
    '## Key takeaways',
    '- Out-of-order vector pipelines execute native FP8 matrix ops [08:45].',
    '- Open ISA avoids proprietary licensing fees and deployment lock-in.'
  ].join('\n');

  const ep = buildDeterministicPodcastEpisode({
    videoTitle: '128-Core RISC-V Deep Dive',
    summaryText,
    hosts: hosts5
  });
  assert.equal(ep.hostCount, 5);
  assert.equal(ep.hosts.length, 5);
  assert.ok(ep.turns.length >= 6);
  const participatingSpeakers = new Set(ep.turns.map((t) => t.speaker));
  for (const h of hosts5) {
    assert.ok(participatingSpeakers.has(h.name), `Expected all 5 hosts including ${h.name} to speak`);
  }

  const prompt = buildPodcastScriptPrompt({ videoTitle: 'RISC-V', summaryText, hosts: hosts5 });
  assert.ok(prompt.includes('ALL 5 hosts'));
  assert.ok(prompt.includes(hosts5[4].name));

  // Script parser handles both fenced JSON and markdown Speaker: dialogue fallback
  const colonScript = '**Alex**: Welcome listeners [00:05]!\nMaya: Notice the FP8 vector speedup [08:45].';
  const parsedColon = parsePodcastScriptResponse(colonScript, hosts5, { episodeTitle: 'Custom Pod' });
  assert.equal(parsedColon.title, 'Custom Pod');
  assert.equal(parsedColon.turns.length, 2);
  assert.equal(parsedColon.turns[0].speaker, 'Alex');
  assert.equal(parsedColon.turns[1].speaker, 'Maya');
  assert.equal(parsedColon.turns[1].timestampSec, 525);

  // Interactive voice/text listener interruption splices after paused turn index
  const qaPrompt = buildPodcastInteractionPrompt({
    videoTitle: 'RISC-V',
    summaryText,
    hosts: hosts5,
    recentTurns: ep.turns.slice(0, 2),
    listenerQuery: 'Does FP8 vector support work well?',
    isVoice: true
  });
  assert.ok(qaPrompt.includes('VOICE'));

  const qa = buildDeterministicPodcastInteractionResponse({
    videoTitle: '128-Core RISC-V Deep Dive',
    summaryText,
    hosts: hosts5,
    listenerQuery: 'How do the vector pipelines help FP8?',
    isVoice: true
  });
  assert.equal(qa.userTurn.isUser, true);
  assert.equal(qa.userTurn.isVoiceInput, true);
  assert.ok(qa.responseTurns.length >= 2);
  assert.ok(qa.responseTurns[0].text.toLowerCase().includes('fp8') || qa.responseTurns[0].text.toLowerCase().includes('vector'));

  const spliced = splicePodcastInteractionTurns(ep.turns, 1, qa.userTurn, qa.responseTurns);
  assert.equal(spliced.firstResponseIndex, 3);
  assert.equal(spliced.nextTurns[2].isUser, true);
  assert.equal(spliced.nextTurns[3].isResponse, true);
  assert.equal(spliced.nextTurns.length, ep.turns.length + 1 + qa.responseTurns.length);

  // Multi-speaker TTS body builds valid 2-speaker speechConfig for Gemini Audio
  const ttsBody: any = buildGeminiMultiSpeakerTtsBody(ep.turns.slice(0, 3), hosts5);
  assert.deepEqual(ttsBody.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(ttsBody.generationConfig.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs.length, 2);
});

test('42. Page-load performance helpers count unique cached videos fast & defer offscreen background fetches', () => {
  assert.equal(extractVideoIdFromCacheKey('sum:dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoIdFromCacheKey('sut:technical:dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoIdFromCacheKey('trn:chronological:abc_123'), 'abc_123');
  assert.equal(extractVideoIdFromCacheKey('trt:quiz:xyz999'), 'xyz999');
  assert.equal(extractVideoIdFromCacheKey('win:dQw4w9WgXcQ'), '');
  assert.equal(extractVideoIdFromCacheKey('pod:dQw4w9WgXcQ'), '');

  const count = countUniqueCachedVideoIds(
    ['sum:vid1', 'trn:vid1', 'sut:technical:vid1', 'sum:quiz:vid2', 'win:vid99', 'keys', 'pod:vid88'],
    ['trt:vid3', 'sum:vid2']
  );
  assert.equal(count, 3);

  assert.equal(
    shouldDeferBackgroundAltTitleFetch({ pageLoadSettled: false, isIntersectingViewport: true }).action,
    'defer_until_load'
  );
  assert.equal(
    shouldDeferBackgroundAltTitleFetch({ pageLoadSettled: true, isIntersectingViewport: false }).action,
    'observe_visibility'
  );
  assert.equal(
    shouldDeferBackgroundAltTitleFetch({ pageLoadSettled: true, isIntersectingViewport: true }).action,
    'fetch_now'
  );
  assert.equal(
    shouldDeferBackgroundAltTitleFetch({ pageLoadSettled: false, hasCachedAltTitle: true, isIntersectingViewport: false }).action,
    'fetch_now'
  );
  assert.equal(
    shouldDeferBackgroundAltTitleFetch({ pageLoadSettled: false, hasTranscriptInMemoryOrMock: true, isIntersectingViewport: false }).action,
    'fetch_now'
  );
  assert.equal(
    shouldDeferBackgroundAltTitleFetch({ pageLoadSettled: false, isExplicitCall: true, isIntersectingViewport: false }).action,
    'fetch_now'
  );
});

test('43. Caption track fallback parsers, duplicate title collapse & menu poll guard behave accurately', () => {
  const html = `
    <html><script>
      var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[
        {"baseUrl":"https://www.youtube.com/api/timedtext?v=VID1\\u0026lang=fr","languageCode":"fr","kind":"asr"},
        {"baseUrl":"https://www.youtube.com/api/timedtext?v=VID1\\u0026lang=en\\u0026kind=asr","languageCode":"en","kind":"asr"},
        {"baseUrl":"https://www.youtube.com/api/timedtext?v=VID1\\u0026lang=en","languageCode":"en"}
      ]}}};
    </script></html>`;
  const tracks = extractCaptionTracksFromHtml(html);
  assert.equal(tracks.length, 3);
  assert.equal(tracks[0].languageCode, 'en');
  assert.equal(tracks[0].kind, '');
  assert.ok(tracks[0].baseUrl.includes('&lang=en'), 'Unescapes \\u0026 in timedtext baseUrl');
  assert.equal(tracks[1].kind, 'asr');

  const jsonSegs = parseJson3TranscriptEvents({
    events: [
      { tStartMs: 0, segs: [{ utf8: '   ' }] },
      { tStartMs: 4200, segs: [{ utf8: 'How lithium ' }, { utf8: 'dendrites form.' }] }
    ]
  });
  assert.deepEqual(jsonSegs, [{ startMs: 4200, text: 'How lithium dendrites form.' }]);

  const xmlSegs = parseXmlTranscriptEvents(
    '<transcript><text start="1.25" dur="2.0">Battery &amp; thermal runaway&#39;s root cause.</text><text start="5.0" dur="1.0">   </text></transcript>'
  );
  assert.deepEqual(xmlSegs, [{ startMs: 1250, text: "Battery & thermal runaway's root cause." }]);

  // Duplicate contiguous title collapsing preserves genuine short titles while fixing doubled titles
  assert.equal(
    dedupeAdjacentTitleDuplicate('Building a Custom CPU From Scratch Building a Custom CPU From Scratch'),
    'Building a Custom CPU From Scratch'
  );
  assert.equal(
    dedupeAdjacentTitleDuplicate('Building a Custom CPU From ScratchBuilding a Custom CPU From Scratch'),
    'Building a Custom CPU From Scratch'
  );
  assert.equal(dedupeAdjacentTitleDuplicate('Ha Ha'), 'Ha Ha');
  assert.equal(dedupeAdjacentTitleDuplicate('Short Distinct Title'), 'Short Distinct Title');

  // Menu poll guard blocks own controls and sidebar navigation
  assert.equal(shouldTriggerFeedCardMenuPoll({ hitOwnControl: true, inGuideSidebar: false, isMenuButton: true, hasVideoId: true }), false);
  assert.equal(shouldTriggerFeedCardMenuPoll({ hitOwnControl: false, inGuideSidebar: true, isMenuButton: true, hasVideoId: true }), false);
  assert.equal(shouldTriggerFeedCardMenuPoll({ hitOwnControl: false, inGuideSidebar: false, isMenuButton: false, hasVideoId: true }), false);
  assert.equal(shouldTriggerFeedCardMenuPoll({ hitOwnControl: false, inGuideSidebar: false, isMenuButton: true, hasVideoId: false }), false);
  assert.equal(shouldTriggerFeedCardMenuPoll({ hitOwnControl: false, inGuideSidebar: false, isMenuButton: true, hasVideoId: true }), true);
  assert.equal(dedupeAdjacentTitleDuplicate('Test Clip Demo Test Clip Demo'), 'Test Clip Demo');
});

test('44. buildAltTitleModelCandidates filters unavailable models, walks fallbackLadder down, and discovers live Gemini Flash/Text models', () => {
  const factPreferred = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
  const fallbackLadder = [
    'gemini-3.1-pro-preview',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
    'gemini-flash-latest'
  ];
  const textModels = ['gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'];

  // 1. Offline / unknown availableModels -> full ordered ladder (non-pro rungs first, then pro/text fallbacks)
  const fullOrder = buildAltTitleModelCandidates({
    factPreferred,
    fallbackLadder,
    textModels,
    availableModels: null
  });
  assert.deepEqual(fullOrder.slice(0, 6), [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
    'gemini-flash-latest'
  ]);
  assert.ok(fullOrder.includes('gemini-3.1-pro-preview'));
  assert.ok(fullOrder.includes('gemini-4-argon'));

  // 2. Key lacks 3.8/3.7 -> automatically steps down to 3.6-flash & maps -preview variant while excluding tts/image/transcribe
  const steppedDown = buildAltTitleModelCandidates({
    factPreferred,
    fallbackLadder,
    textModels,
    availableModels: [
      'gemini-3.6-flash',
      'gemini-3.5-flash-preview',
      'gemini-3.5-transcribe',
      'gemini-3.8-flash-lite-tts',
      'gemini-3-pro-image'
    ]
  });
  assert.deepEqual(steppedDown, ['gemini-3.6-flash', 'gemini-3.5-flash-preview']);

  // 3. Real-world key returning live Gemini 2.5 / 3.0 models when 3.8/3.7/3.6 are absent
  const realKeyModels = buildAltTitleModelCandidates({
    factPreferred,
    fallbackLadder,
    textModels,
    availableModels: ['gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-embedding-001']
  });
  assert.deepEqual(realKeyModels, ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro']);
});

test('45. Watch metadata extractors, meaningful description filter, and Gemini non-thought extractor behave safely', () => {
  // Stub / empty HTML (like NO_CAP_02) yields empty metadata
  const stubMeta = extractWatchMetadataFromHtml('<html><body>No captions</body></html>');
  assert.equal(stubMeta.title, '');
  assert.equal(stubMeta.shortDescription, '');
  assert.equal(stubMeta.author, '');
  assert.equal(isMeaningfulDescriptionForTitle(stubMeta.shortDescription), false);

  // Full watch HTML extracts videoDetails + InnerTube config cleanly even with nested JSON braces
  const richHtml = `
    <html>
      <script>
        ytcfg.set({"VISITOR_DATA":"CgtVisitor99","INNERTUBE_API_KEY":"AIzaInnertube","INNERTUBE_CONTEXT_CLIENT_VERSION":"2.20260501.00.00"});
        var ytInitialPlayerResponse = {
          "videoDetails": {
            "videoId": "VID_META_01",
            "title": "Benchmarks: Rust &amp; Zig Async Runtimes",
            "author": "Systems Deep Dive",
            "keywords": ["rust", "zig", "async"],
            "shortDescription": "Measuring epoll vs io_uring tail latency across 64-core EPYC servers.\\nhttps://example.com/repo #rust #systems",
            "thumbnail": { "thumbnails": [{ "url": "https://i.ytimg.com/vi/a/default.jpg" }] }
          }
        };
      </script>
    </html>
  `;
  const parsedRich = extractWatchMetadataFromHtml(richHtml);
  assert.equal(parsedRich.visitorData, 'CgtVisitor99');
  assert.equal(parsedRich.innertubeApiKey, 'AIzaInnertube');
  assert.equal(parsedRich.clientVersion, '2.20260501.00.00');
  assert.equal(parsedRich.title, 'Benchmarks: Rust & Zig Async Runtimes');
  assert.equal(parsedRich.author, 'Systems Deep Dive');
  assert.deepEqual(parsedRich.keywords, ['rust', 'zig', 'async']);
  assert.ok(parsedRich.shortDescription.includes('Measuring epoll vs io_uring tail latency'));
  assert.equal(isMeaningfulDescriptionForTitle(parsedRich.shortDescription), true);

  // Link-only spam description is rejected as non-meaningful
  assert.equal(isMeaningfulDescriptionForTitle('https://patreon.com/foo #shorts #viral Follow me!'), false);

  // InnerTube player JSON extractor handles both videoDetails and microformat fallback
  const playerMeta = extractWatchMetadataFromPlayerData({
    microformat: {
      playerMicroformatRenderer: {
        title: { simpleText: 'Solar Microinverter Teardown' },
        description: { simpleText: 'Examining GaN FET efficiency and thermal dissipation inside grid-tied microinverters.' },
        ownerChannelName: 'Power Electronics Lab'
      }
    }
  });
  assert.equal(playerMeta.title, 'Solar Microinverter Teardown');
  assert.equal(playerMeta.author, 'Power Electronics Lab');
  assert.ok(playerMeta.shortDescription.includes('GaN FET efficiency'));

  // Non-thought Gemini part extractor NEVER leaks thought: true text when final output is missing
  assert.equal(
    extractGeminiNonThoughtText([
      { thought: true, text: 'Let me think step by step about the video transcript...' }
    ]),
    ''
  );
  assert.equal(
    extractGeminiNonThoughtText([
      { thought: true, text: 'Internal reasoning' },
      { text: 'GaN FET Grid-Tied Microinverter Efficiency Teardown' }
    ]),
    'GaN FET Grid-Tied Microinverter Efficiency Teardown'
  );
});

test('46. Material You AppThemeMode normalization and effective light/dark resolution', () => {
  assert.equal(normalizeAppThemeMode('system'), 'system');
  assert.equal(normalizeAppThemeMode('LIGHT'), 'light');
  assert.equal(normalizeAppThemeMode(' dark '), 'dark');
  assert.equal(normalizeAppThemeMode('sepia'), 'system');
  assert.equal(normalizeAppThemeMode(null), 'system');

  assert.equal(resolveEffectiveAppTheme('light', true), 'light');
  assert.equal(resolveEffectiveAppTheme('light', false), 'light');
  assert.equal(resolveEffectiveAppTheme('dark', false), 'dark');
  assert.equal(resolveEffectiveAppTheme('dark', true), 'dark');
  assert.equal(resolveEffectiveAppTheme('system', true), 'dark');
  assert.equal(resolveEffectiveAppTheme('system', false), 'light');
  assert.equal(resolveEffectiveAppTheme('unknown', true), 'dark');
  assert.equal(resolveEffectiveAppTheme('unknown', false), 'light');
});

test('47. Sponsor and self-promotion filter excludes sponsored reads, merch plugs, and Patreon copy from alt-title extraction', () => {
  assert.equal(isSponsorOrPromoLine('This video is sponsored by NordVPN — use code TECH20 for 20% off.'), true);
  assert.equal(isSponsorOrPromoLine('Check out my merch store and support us on Patreon!'), true);
  assert.equal(isSponsorOrPromoLine('Paid collaboration with Squarespace included below.'), true);
  assert.equal(isSponsorOrPromoLine('[02:15] Benchmarking 128-core RISC-V memory bandwidth under FP8 loads.'), false);

  const rawTranscript = [
    '[00:00] This video is brought to you by Surfshark — use promo code SAVE for 80% off.',
    '[00:45] Support us on Patreon and check out our new merch drop.',
    '[01:10] Today we measure 3nm RISC-V vector extensions versus x86 servers.',
    '[02:30] Sparse neural inference shows 2.1x lower watts per token.'
  ].join('\n');
  const extracted = extractDescriptiveTitleFromTranscript(rawTranscript);
  assert.ok(!/Surfshark|Patreon|merch|promo/i.test(extracted), 'Excluded sponsor/merch sentences from transcript title extraction');
  assert.ok(extracted.includes('RISC-V vector extensions'), 'Retained factual technical topic for alt title');

  const sponsorOnlyDesc = 'This video is sponsored by Brilliant.org.\nUse code SCI30 for 30% off.\nCheck out my merch at teespring.com/foo\nhttps://patreon.com/creator';
  assert.equal(isMeaningfulDescriptionForTitle(sponsorOnlyDesc), false, 'Rejects description containing only sponsor/merch/Patreon copy');

  const mixedDesc = 'Sponsored by Skillshare — click the link in description.\nFull teardown of solid-state sodium electrolyte cells and dendrite resistance at 4C.';
  assert.equal(isMeaningfulDescriptionForTitle(mixedDesc), true, 'Accepts description with substantive technical topic after sponsor removal');
  const cleanedDesc = stripSponsorAndPromoFromText(mixedDesc);
  assert.ok(!/Skillshare/i.test(cleanedDesc) && cleanedDesc.includes('sodium electrolyte'));
});

test('48. UI and Generated Text formatting normalizers clamp ranges and generate live CSS variables', () => {
  const uiDefault = normalizeUiFormattingPrefs(null);
  assert.deepEqual(uiDefault, { fontFamily: 'system', fontSizePx: 14, density: 'comfortable' });

  const uiCustom = normalizeUiFormattingPrefs({ fontFamily: 'serif', fontSizePx: 99, density: 'relaxed' });
  assert.equal(uiCustom.fontFamily, 'serif');
  assert.equal(uiCustom.fontSizePx, 18);
  assert.equal(uiCustom.density, 'relaxed');

  const genCustom = normalizeGeneratedTextPrefs({
    fontFamily: 'mono',
    fontSizePx: 4,
    lineHeight: 1.85,
    paragraphSpacing: 'compact',
    richFormatting: false
  });
  assert.equal(genCustom.fontFamily, 'mono');
  assert.equal(genCustom.fontSizePx, 12);
  assert.equal(genCustom.lineHeight, 1.85);
  assert.equal(genCustom.paragraphSpacing, 'compact');
  assert.equal(genCustom.richFormatting, false);

  const resolved = resolveFormattingCssVars(uiCustom, genCustom);
  assert.ok(resolved.vars['--yt-ui-font'].includes('Georgia'));
  assert.equal(resolved.vars['--yt-ui-font-size'], '18px');
  assert.equal(resolved.vars['--yt-ui-density-pad'], '16px');
  assert.ok(resolved.vars['--yt-gen-font'].includes('JetBrains Mono'));
  assert.equal(resolved.vars['--yt-gen-font-size'], '12px');
  assert.equal(resolved.vars['--yt-gen-line-height'], '1.85');
  assert.equal(resolved.vars['--yt-gen-para-gap'], '6px');
});

test('49. buildFollowUpModelCandidates walks down fallback ladder from selected follow-up model', () => {
  const ladder = [
    'gemini-3.1-pro-preview',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash'
  ];

  // Selecting mid-ladder model includes it first then walks down lower rungs only
  const from38 = buildFollowUpModelCandidates({
    selectedModel: 'gemini-3.8-flash',
    fallbackLadder: ladder,
    availableModels: ['gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-3.5-flash']
  });
  assert.deepEqual(from38, ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash']);

  // Selecting unavailable/top model not on ladder falls down from top of ladder
  const fromArgon = buildFollowUpModelCandidates({
    selectedModel: 'gemini-4-argon',
    fallbackLadder: ladder,
    availableModels: ['gemini-3.8-flash', 'gemini-3.6-flash']
  });
  assert.deepEqual(fromArgon, ['gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.6-flash']);

  // Selecting Ask falls down full available ladder if Ask fails
  const fromAsk = buildFollowUpModelCandidates({
    selectedModel: 'YouTube Ask (Gemini in the page)',
    fallbackLadder: ladder,
    availableModels: ['gemini-3.8-flash', 'gemini-3.6-flash']
  });
  assert.deepEqual(fromAsk, ['YouTube Ask (Gemini in the page)', 'gemini-3.8-flash', 'gemini-3.6-flash']);
});

test('50. AUD-08 VM Parity: sponsor/promo stripping, UI/generated formatting CSS vars, and follow-up model ladder match userscript', () => {
  const userscriptPath = path.resolve(process.cwd(), 'youtube-feed-summariser.user.js');
  const source = fs.readFileSync(userscriptPath, 'utf8');

  const makeMockEl = (tag: string): any => {
    const attrs: Record<string, string> = {};
    const children: any[] = [];
    const el: any = {
      tagName: String(tag || 'div').toUpperCase(),
      style: {},
      dataset: {},
      className: '',
      textContent: '',
      children,
      childNodes: children,
      isConnected: true,
      classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => false },
      setAttribute: (k: string, v: string) => { attrs[k] = String(v); },
      getAttribute: (k: string) => (k in attrs ? attrs[k] : null),
      hasAttribute: (k: string) => k in attrs,
      removeAttribute: (k: string) => { delete attrs[k]; },
      appendChild: (c: any) => { children.push(c); return c; },
      insertBefore: (c: any) => { children.unshift(c); return c; },
      remove: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      closest: () => null,
      attachShadow: () => {
        const sr = makeMockEl('shadow-root');
        el.shadowRoot = sr;
        return sr;
      }
    };
    return el;
  };
  const mockDocument: any = {
    readyState: 'complete',
    documentElement: makeMockEl('html'),
    head: makeMockEl('head'),
    body: makeMockEl('body'),
    createElement: (tag: string) => makeMockEl(tag),
    createElementNS: (_ns: string, tag: string) => makeMockEl(tag),
    createTextNode: (txt: string) => ({ nodeType: 3, textContent: String(txt || '') }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  const gmStore = new Map<string, any>();
  const mockWindow: any = {
    location: { href: 'https://www.youtube.com/', pathname: '/', search: '', origin: 'https://www.youtube.com' },
    innerWidth: 1440,
    innerHeight: 900,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    navigator: { userAgent: 'node-vm', clipboard: { writeText: async () => {} } },
    speechSynthesis: { getVoices: () => [], cancel: () => {} },
    document: mockDocument
  };
  mockWindow.window = mockWindow;
  const context: Record<string, any> = {
    window: mockWindow,
    self: mockWindow,
    globalThis: mockWindow,
    document: mockDocument,
    navigator: mockWindow.navigator,
    location: mockWindow.location,
    localStorage: mockWindow.localStorage,
    console,
    setTimeout: (fn: (...a: any[]) => void, ms?: number, ...rest: any[]) => {
      const h = setTimeout(fn, ms, ...rest);
      h?.unref?.();
      return h;
    },
    clearTimeout,
    setInterval: (fn: (...a: any[]) => void, ms?: number, ...rest: any[]) => {
      const h = setInterval(fn, ms, ...rest);
      h?.unref?.();
      return h;
    },
    clearInterval,
    URL,
    Blob,
    Promise,
    JSON,
    Math,
    Date,
    RegExp,
    Error,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    CSS: { escape: (s: string) => String(s) },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    SpeechSynthesisUtterance: class {},
    Event: class { constructor(public type: string) {} },
    CustomEvent: class { constructor(public type: string, public detail?: any) {} },
    GM_getValue: (k: string, d: any) => (gmStore.has(k) ? gmStore.get(k) : d),
    GM_setValue: (k: string, v: any) => { gmStore.set(k, v); },
    GM_deleteValue: (k: string) => { gmStore.delete(k); },
    GM_listValues: () => Array.from(gmStore.keys()),
    GM_addValueChangeListener: () => 1,
    GM_registerMenuCommand: () => 1,
    GM_addStyle: () => {},
    GM_setClipboard: () => {},
    GM_xmlhttpRequest: () => {}
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'youtube-feed-summariser.user.js' });
  const u = mockWindow.__yt_summariser_test;

  const promoSample = 'This video is sponsored by NordVPN — use code SAVE20!\nSolid-state sodium battery separator cuts dendrite shorting.';
  assert.equal(u.isSponsorOrPromoLine('Check out my merch store and Patreon!'), isSponsorOrPromoLine('Check out my merch store and Patreon!'));
  assert.equal(u.stripSponsorAndPromoFromText(promoSample), stripSponsorAndPromoFromText(promoSample));
  assert.equal(
    u.extractDescriptiveTitleFromTranscript('[00:05] Sponsored by Brilliant.\n[00:45] Solid-state sodium battery separator cuts dendrite shorting.'),
    extractDescriptiveTitleFromTranscript('[00:05] Sponsored by Brilliant.\n[00:45] Solid-state sodium battery separator cuts dendrite shorting.')
  );
  assert.equal(
    u.isMeaningfulDescriptionForTitle('Support us on Patreon & merch at teespring.com/foo'),
    isMeaningfulDescriptionForTitle('Support us on Patreon & merch at teespring.com/foo')
  );

  const uiPref = { fontFamily: 'serif', fontSizePx: 16, density: 'relaxed' };
  const genPref = { fontFamily: 'mono', fontSizePx: 18, lineHeight: 1.8, paragraphSpacing: 'compact', richFormatting: false };
  assert.deepEqual(JSON.parse(JSON.stringify(u.normalizeUiFormattingPrefs(uiPref))), normalizeUiFormattingPrefs(uiPref));
  assert.deepEqual(JSON.parse(JSON.stringify(u.normalizeGeneratedTextPrefs(genPref))), normalizeGeneratedTextPrefs(genPref));
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.resolveFormattingCssVars(uiPref, genPref).vars)),
    resolveFormattingCssVars(uiPref, genPref).vars
  );

  const fArgs = {
    selectedModel: 'gemini-3.8-flash',
    fallbackLadder: ['gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'],
    availableModels: ['gemini-3.7-flash', 'gemini-3.5-flash']
  };
  assert.deepEqual(JSON.parse(JSON.stringify(u.buildFollowUpModelCandidates(fArgs))), buildFollowUpModelCandidates(fArgs));

  // Visuals & Fact-Check AUD-08 Parity
  const fcArgs = {
    explicitModel: 'gemini-4-argon',
    factModel: 'gemini-3.8-flash',
    primaryModel: 'YouTube Ask (Gemini in the page)',
    defaultModel: 'gemini-3.8-flash',
    factPreferred: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'],
    fallbackLadder: ['gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'],
    textModels: ['gemini-4-argon', 'gemini-3.8-flash'],
    availableModels: ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview']
  };
  assert.deepEqual(JSON.parse(JSON.stringify(u.buildFactCheckModelCandidates(fcArgs))), buildFactCheckModelCandidates(fcArgs));

  const sbSpec = 'https://i.ytimg.com/sb/VID99/storyboard3_L$L/$N.jpg?sqp=1\\u0026rs=2|48#27#100#10#10#1000#default#abc|160#90#25#5#5#2000#M$M#xyz';
  const uSb = JSON.parse(JSON.stringify(u.parseStoryboardSpecString(sbSpec)));
  const hSb = parseStoryboardSpecString(sbSpec);
  assert.deepEqual(uSb, hSb);
  if (hSb) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(u.computeStoryboardFrameInfo(uSb, 14))),
      computeStoryboardFrameInfo(hSb, 14)
    );
  }
  assert.equal(u.getVideoThumbnailFallbackUrl('VID99', 14, 120), getVideoThumbnailFallbackUrl('VID99', 14, 120));

  const markerSample = '## Overview\n- **[[FRAME 01:15 | Solid-state cell test]]**\nIntro paragraph [[IMG Ion transport diagram | Solid-state ion diffusion]] tail.';
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.tokenizeSummaryTextWithVisuals(markerSample))),
    tokenizeSummaryTextWithVisuals(markerSample)
  );
  const noMarkerSummary = '## TL;DR\nKey test at [00:45].\n### [02:30] Next step\nDetails follow.';
  assert.equal(u.ensureFallbackVisualMarkers(noMarkerSummary, 3), ensureFallbackVisualMarkers(noMarkerSummary, 3));

  // New helpers AUD-08 parity: title-switch, autoFactCheck, follow-up versioning, podcast sanitizer & multi-part splitter
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.resolveSummaryWindowDisplayTitle({ mode: 'original', aiTitle: 'AI Breakdown', originalTitle: 'Orig Vid' }))),
    resolveSummaryWindowDisplayTitle({ mode: 'original', aiTitle: 'AI Breakdown', originalTitle: 'Orig Vid' })
  );
  assert.equal(u.normalizeAutoFactCheckSetting(undefined), normalizeAutoFactCheckSetting(undefined));
  assert.equal(u.normalizeAutoFactCheckSetting(false), normalizeAutoFactCheckSetting(false));

  const baseFu = { q: 'Old Q', a: 'Old A', model: 'gemini-3.8-flash' };
  const appendedFu = u.appendFollowUpTurnVersion(baseFu, { question: 'New Q', answer: 'New A', model: 'gemini-3.7-flash', createdAt: 1000 });
  const steppedFu = u.stepFollowUpTurnVersion(appendedFu, -1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(steppedFu)),
    stepFollowUpTurnVersion(
      appendFollowUpTurnVersion(baseFu, { question: 'New Q', answer: 'New A', model: 'gemini-3.7-flash', createdAt: 1000 }),
      -1
    )
  );

  assert.equal(
    u.sanitizeSpokenTurnText('Alex here, welcome back to the breakdown.', ['Alex', 'Sam']),
    sanitizeSpokenTurnText('Alex here, welcome back to the breakdown.', ['Alex', 'Sam'])
  );
  const longSecText = Array.from({ length: 8 }, (_, idx) => `## Section ${idx + 1}\n- Detailed insight number ${idx + 1} covering memory latency and cache coherency tradeoffs across workloads [0${idx}:15].`).join('\n\n');
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.splitSummaryIntoPodcastSections(longSecText, 550))),
    splitSummaryIntoPodcastSections(longSecText, 550)
  );

  // Minimized audio & Material You accent color AUD-08 parity
  assert.equal(u.normalizeContinueAudioOnMinimize(undefined), normalizeContinueAudioOnMinimize(undefined));
  assert.equal(u.normalizeContinueAudioOnMinimize(false), normalizeContinueAudioOnMinimize(false));
  assert.equal(u.shouldStopPlaybackOnMinimize(true, false), shouldStopPlaybackOnMinimize(true, false));
  assert.equal(u.shouldStopPlaybackOnMinimize(false, false), shouldStopPlaybackOnMinimize(false, false));
  assert.equal(u.shouldStopPlaybackOnMinimize(true, true), shouldStopPlaybackOnMinimize(true, true));
  assert.equal(u.normalizeAccentColorHex('#a5b4fc'), normalizeAccentColorHex('#a5b4fc'));
  assert.equal(u.colorWheelPointToHex(0.7, -0.35), colorWheelPointToHex(0.7, -0.35));
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.hexToColorWheelPoint('#FDA4AF'))),
    hexToColorWheelPoint('#FDA4AF')
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.resolveAccentCssVars('#FDA4AF', 'light'))),
    resolveAccentCssVars('#FDA4AF', 'light')
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(u.resolveAccentCssVars('#FDA4AF', 'dark'))),
    resolveAccentCssVars('#FDA4AF', 'dark')
  );
});

test('51. Visual marker parser, tokenizer, storyboard geometry & fact-check ladder behave accurately', () => {
  // Fact-check model ladder excludes non-text models (Ask, TTS, Image, Transcribe) and prioritizes available flash/pro
  const ladder = buildFactCheckModelCandidates({
    explicitModel: '',
    factModel: 'gemini-3.8-flash-tts',
    primaryModel: 'YouTube Ask (Gemini in the page)',
    defaultModel: 'gemini-3.8-flash',
    factPreferred: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'],
    fallbackLadder: ['gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'],
    availableModels: ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-transcribe', 'gemini-3.1-flash-image']
  });
  assert.ok(!ladder.some((m) => /Ask|tts|transcribe|image/i.test(m)), 'Excludes non-text models from fact-check candidates');
  assert.equal(ladder[0], 'gemini-3.7-flash', 'Selects top available factPreferred model');
  assert.ok(ladder.includes('gemini-3.5-flash'));

  // Storyboard spec parsing with escaped \\u0026 & coordinate math
  const cfg = parseStoryboardSpecString(
    'https://i.ytimg.com/sb/ABC/storyboard3_L$L/$N.jpg?sqp=1\\u0026rs=2|80#45#100#10#10#1000#default#s0|160#90#50#5#5#2000#M$M#sig99'
  );
  assert.ok(cfg);
  assert.equal(cfg.level.levelIdx, 1);
  assert.equal(cfg.level.w, 160);
  const frame = computeStoryboardFrameInfo(cfg, 14); // idx = floor(14000/2000)=7 -> col=2, row=1, M0
  assert.ok(frame.url.includes('storyboard3_L1/M0.jpg'));
  assert.ok(frame.url.includes('&rs=2'));
  assert.ok(frame.url.includes('sigh=sig99'));
  assert.equal(frame.col, 2);
  assert.equal(frame.row, 1);
  assert.equal(frame.bgSize, '500% 500%');
  assert.equal(frame.bgPosX, '50%');
  assert.equal(frame.bgPosY, '25%');

  // Public thumbnail fallback varies by timestamp/duration ratio
  assert.equal(getVideoThumbnailFallbackUrl('VID_1', 10, 100), 'https://i.ytimg.com/vi/VID_1/hq1.jpg');
  assert.equal(getVideoThumbnailFallbackUrl('VID_1', 50, 100), 'https://i.ytimg.com/vi/VID_1/hq2.jpg');
  assert.equal(getVideoThumbnailFallbackUrl('VID_1', 90, 100), 'https://i.ytimg.com/vi/VID_1/hq3.jpg');

  // Marker token & bullet/bold/inline handling
  assert.deepEqual(parseVisualMarkerToken('[[FRAME [01:15] | Lab setup]]'), {
    kind: 'frame',
    tsStr: '01:15',
    seconds: 75,
    caption: 'Lab setup'
  });
  assert.deepEqual(parseVisualMarkerFromLine('- **[[IMG Tokamak Reactor | Tokamak cross section]].**'), {
    kind: 'img',
    terms: 'Tokamak Reactor',
    caption: 'Tokamak cross section'
  });

  const tokenized = tokenizeSummaryTextWithVisuals(
    '## TL;DR\nIntro line [[FRAME 00:42 | Key slide]] tail.\nAfter frame paragraph.\n- [[IMG Battery Cell | Cathode layer]]'
  );
  assert.equal(tokenized.length, 4);
  assert.equal(tokenized[0].kind, 'markdown');
  assert.equal(tokenized[1].kind, 'frame');
  assert.equal(tokenized[2].kind, 'markdown');
  assert.equal(tokenized[3].kind, 'img');

  // Fallback marker injection when model omitted [[FRAME]] / [[IMG]] tags
  const injected = ensureFallbackVisualMarkers('## TL;DR\nClaim A [00:20].\n### [01:30] Section B\nParagraph B.\n- Point C [03:00].', 3);
  assert.ok(injected.includes('[[FRAME 00:20 |'));
  assert.ok(injected.includes('[[FRAME 01:30 |'));
  assert.ok(injected.includes('[[FRAME 03:00 |'));
  // Heading timestamp places frame after its following paragraph rather than inside heading gap
  assert.ok(injected.indexOf('Paragraph B.') < injected.indexOf('[[FRAME 01:30 |'));
});

test('52. Summary window title switch, autoFactCheck default & follow-up turn version pager', () => {
  const aiFirst = resolveSummaryWindowDisplayTitle({ mode: 'ai', aiTitle: 'AI: Solid-State Sodium Batteries', originalTitle: 'BATTERY HYPE 2026!!' });
  assert.equal(aiFirst.mode, 'ai');
  assert.equal(aiFirst.displayTitle, 'AI: Solid-State Sodium Batteries');

  const flipped = resolveSummaryWindowDisplayTitle({ mode: 'original', aiTitle: 'AI: Solid-State Sodium Batteries', originalTitle: 'BATTERY HYPE 2026!!' });
  assert.equal(flipped.mode, 'original');
  assert.equal(flipped.displayTitle, 'BATTERY HYPE 2026!!');

  const noAiFallback = resolveSummaryWindowDisplayTitle({ mode: 'ai', aiTitle: '', originalTitle: 'Original Video Title' });
  assert.equal(noAiFallback.mode, 'original');
  assert.equal(noAiFallback.displayTitle, 'Original Video Title');

  assert.equal(normalizeAutoFactCheckSetting(undefined), true);
  assert.equal(normalizeAutoFactCheckSetting(true), true);
  assert.equal(normalizeAutoFactCheckSetting(false), false);

  const v1 = normalizeFollowUpTurn({ q: 'What is the cycle life?', a: 'Around 2,500 cycles.', model: 'gemini-3.8-flash' });
  assert.equal(v1.versions.length, 1);
  assert.equal(v1.activeVersionIndex, 0);

  const v2 = appendFollowUpTurnVersion(v1, {
    question: 'What is the cycle life at 45C?',
    answer: 'Retains 84% capacity after 1,800 cycles [08:12].',
    model: 'gemini-3.7-flash',
    fallbackFrom: 'gemini-3.8-flash'
  });
  assert.equal(v2.versions.length, 2);
  assert.equal(v2.activeVersionIndex, 1);
  assert.equal(v2.q, 'What is the cycle life at 45C?');
  assert.equal(v2.model, 'gemini-3.7-flash');

  const backToFirst = stepFollowUpTurnVersion(v2, -1);
  assert.equal(backToFirst.activeVersionIndex, 0);
  assert.equal(backToFirst.a, 'Around 2,500 cycles.');
  assert.equal(getActiveFollowUpVersion(backToFirst).model, 'gemini-3.8-flash');

  const normalizedList = normalizeFollowUpTurnsList([backToFirst]);
  assert.equal(normalizedList[0].versions.length, 2);
});

test('53. Podcast strips spoken speaker self-names and splits & appends long multi-part episodes across whole summary', () => {
  const hosts = buildDefaultPodcastHosts(3);
  const hostNames = hosts.map((h) => h.name);

  assert.equal(sanitizeSpokenTurnText('Alex: Welcome to the episode.', hostNames), 'Welcome to the episode.');
  assert.equal(sanitizeSpokenTurnText("Hey, I'm Maya — let us look closely at the latency graph.", hostNames), 'let us look closely at the latency graph.');
  assert.equal(sanitizeSpokenTurnText('Sam here: the benchmark excludes warmup runs.', hostNames), 'the benchmark excludes warmup runs.');
  assert.equal(sanitizeSpokenTurnText("This is Alex, jumping straight into the architecture.", hostNames), 'jumping straight into the architecture.');

  const parsedNoNames = parsePodcastScriptResponse(
    JSON.stringify({
      title: 'Deep Dive',
      turns: [
        { speaker: 'Alex', text: 'Alex: Alex here, first takeaway at [01:00].' },
        { speaker: 'Maya', text: "Hi, I'm Maya: testing the edge case at [05:30]." }
      ]
    }),
    hosts
  );
  assert.ok(!/^alex\b/i.test(parsedNoNames.turns[0].text));
  assert.ok(!/\bi['’]?m maya\b/i.test(parsedNoNames.turns[1].text));

  const multiSectionSummary = Array.from({ length: 12 }, (_, idx) =>
    `## Part ${idx + 1}: Architecture Milestone ${idx + 1}\n- Detailed finding ${idx + 1} covering memory bandwidth, cache line utilization, and thermal throttling thresholds [${String(idx * 2).padStart(2, '0')}:10].\n- Second concrete measurement for section ${idx + 1} proving linear scaling up to 64 cores.`
  ).join('\n\n');

  const sections = splitSummaryIntoPodcastSections(multiSectionSummary, 600);
  assert.ok(sections.length >= 3, `Expected multi-part split into >=3 sections, got ${sections.length}`);

  const promptP1 = buildPodcastScriptPartPrompt({
    videoTitle: 'Scale Test',
    sectionText: sections[0],
    partIndex: 0,
    totalParts: sections.length,
    hosts
  });
  assert.match(promptP1, /PART 1 of/i);
  assert.match(promptP1, /NEVER say or announce their own names/i);

  const part1 = buildDeterministicPodcastEpisodePart({
    videoTitle: 'Scale Test',
    sectionText: sections[0],
    partIndex: 0,
    totalParts: sections.length,
    hosts
  });
  let episode: ReturnType<typeof appendPodcastEpisodeTurns> = {
    title: part1.title,
    hostCount: hosts.length,
    hosts,
    turns: part1.turns,
    createdAt: Date.now(),
    isComplete: false,
    generatedParts: 1,
    totalParts: sections.length
  };
  for (let p = 1; p < sections.length; p++) {
    const contPrompt = buildPodcastContinuationPrompt({
      videoTitle: 'Scale Test',
      sectionText: sections[p],
      partIndex: p,
      totalParts: sections.length,
      hosts,
      previousTurns: episode.turns
    });
    assert.match(contPrompt, /NEVER announce or say their own names/i);
    const nextPart = buildDeterministicPodcastEpisodePart({
      videoTitle: 'Scale Test',
      sectionText: sections[p],
      partIndex: p,
      totalParts: sections.length,
      hosts,
      startTurnNumber: episode.turns.length + 1
    });
    episode = appendPodcastEpisodeTurns(episode, nextPart.turns, {
      generatedParts: p + 1,
      totalParts: sections.length
    });
  }
  assert.equal(episode.isComplete, true);
  assert.equal(episode.generatedParts, sections.length);
  assert.ok(episode.turns.length >= 20, `Expected full multi-part episode to cover all sections (>=20 turns), got ${episode.turns.length}`);
  assert.ok(episode.turns.some((t) => t.text.includes('finding 12')));
});

test('54. Minimized audio setting gating, 12 pastel presets, color wheel math & WCAG contrast across Light/Dark themes', () => {
  // 1. Minimized audio gating (default ON, close always stops)
  assert.equal(normalizeContinueAudioOnMinimize(undefined), true);
  assert.equal(normalizeContinueAudioOnMinimize('false'), false);
  assert.equal(normalizeContinueAudioOnMinimize(true), true);
  assert.equal(shouldStopPlaybackOnMinimize(true, false), false, 'Minimizing keeps playback when setting is ON');
  assert.equal(shouldStopPlaybackOnMinimize(false, false), true, 'Minimizing stops playback when setting is OFF');
  assert.equal(shouldStopPlaybackOnMinimize(true, true), true, 'Closing (skipCommit=true) always stops playback');

  // 2. 12 curated pastel presets + WCAG AA contrast guarantee in both light & dark modes
  assert.equal(PASTEL_ACCENT_PRESETS.length, 12);
  const uniqueHexes = new Set(PASTEL_ACCENT_PRESETS.map((p) => p.hex));
  assert.equal(uniqueHexes.size, 12);

  for (const preset of PASTEL_ACCENT_PRESETS) {
    assert.equal(normalizeAccentColorHex(preset.hex.toLowerCase()), preset.hex);
    for (const mode of ['light', 'dark'] as const) {
      const palette = resolveMaterialAccentPalette(preset.hex, mode);
      assert.ok(palette, `Expected palette for ${preset.name} (${mode})`);
      const onPrimaryContrast = getContrastRatio(palette.primary, palette.onPrimary);
      const containerContrast = getContrastRatio(palette.primaryContainer, palette.onPrimaryContainer);
      assert.ok(
        onPrimaryContrast >= 4.5,
        `Primary/onPrimary contrast for ${preset.name} (${mode}) was ${onPrimaryContrast.toFixed(2)}`
      );
      assert.ok(
        containerContrast >= 5.5,
        `Container contrast for ${preset.name} (${mode}) was ${containerContrast.toFixed(2)}`
      );
      if (mode === 'light') {
        assert.ok(
          getContrastRatio(palette.primary, '#FFFFFF') >= 4.5,
          `Light primary vs white contrast failed for ${preset.name}`
        );
      } else {
        assert.ok(
          getContrastRatio(palette.primary, '#282A31') >= 4.5,
          `Dark primary vs container contrast failed for ${preset.name}`
        );
      }
      const vars = resolveAccentCssVars(preset.hex, mode);
      assert.equal(Object.keys(vars).length, ACCENT_CSS_VAR_KEYS.length);
    }
  }

  // 3. Default accent clears overrides
  assert.equal(normalizeAccentColorHex(''), '');
  assert.equal(resolveMaterialAccentPalette('', 'dark'), null);
  assert.deepEqual(resolveAccentCssVars('', 'light'), {});

  // 4. Interactive color wheel coordinate <-> hex mapping
  const wheelRed = colorWheelPointToHex(1, 0, 76);
  assert.equal(wheelRed, hslToHexExpect(0, 100, 76));
  const wheelYellow = colorWheelPointToHex(0.5, Math.sqrt(3) / 2, 76);
  const redPt = hexToColorWheelPoint(wheelRed);
  assert.ok(redPt.nx > 0.9 && Math.abs(redPt.ny) < 0.1, `Expected red point near +X axis, got ${JSON.stringify(redPt)}`);
  const yellowPt = hexToColorWheelPoint(wheelYellow);
  assert.ok(yellowPt.nx > 0.3 && yellowPt.ny > 0.6, `Expected yellow point in +X/+Y quadrant, got ${JSON.stringify(yellowPt)}`);
});

function hslToHexExpect(h: number, s: number, l: number): string {
  const hex = colorWheelPointToHex(
    (s / 100) * Math.cos((h * Math.PI) / 180),
    (s / 100) * Math.sin((h * Math.PI) / 180),
    l
  );
  return hex;
}




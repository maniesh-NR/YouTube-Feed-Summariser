import assert from 'node:assert/strict';
import { createHarness } from './harness.js';

export async function runPipelineAndApiTests() {
  console.log('\n--- Running Test Suite 3: Gemini API Pipeline, Options, & Transcripts ---');
  let passed = 0;
  const harness = await createHarness();

  try {
    const page = await harness.openFeed();

    // 1. Configure valid key
    await page.evaluate(() => {
      window.GM_setValue('keys', [{ id: 'k1', name: 'Valid Key', key: 'AIzaSyTestKey123' }]);
    });

    // 2. Open window and configure advanced options
    await page.evaluate(() => {
      window.__yt_summariser_test.openForVideo({ videoId: 'D_options_test', title: 'Options Test' });
    });
    await page.waitForTimeout(200);

    // Set advanced parameters
    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('D_options_test');
      win.source = 'video';
      win.opts.think = 'medium';
      win.opts.mres = 'MEDIA_RESOLUTION_HIGH';
      win.opts.gsearch = true;
      win.opts.gmaps = true;
      win.opts.code = true;
      win.saveOpts();

      // Clear recorded requests
      window.__recorded_gm_requests = [];
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });

    await page.waitForFunction(() => {
      const reqs = window.__recorded_gm_requests || [];
      return reqs.some((r) => r.url.includes(':generateContent') && String(r.data || '').includes('D_options_test'));
    }, { timeout: 6000 });

    // Verify generation parameters in request body
    const paramCheck = await page.evaluate(() => {
      const reqs = window.__recorded_gm_requests || [];
      const genReq = reqs.find((r) => r.url.includes(':generateContent') && String(r.data || '').includes('D_options_test'));
      const body = JSON.parse(genReq.data);
      const hasFirstVideoPart = body.contents?.[0]?.parts?.[0]?.file_data?.file_uri?.includes('youtube.com/watch?v=D_options_test');
      const hasThinking = body.generationConfig?.thinkingConfig?.thinkingLevel === 'medium';
      const hasMediaRes = body.generationConfig?.mediaResolution === 'MEDIA_RESOLUTION_HIGH';
      const hasSearch = body.tools?.some((t) => t.google_search);
      const hasMaps = body.tools?.some((t) => t.google_maps);
      const hasCode = body.tools?.some((t) => t.code_execution);
      const sysText = body.systemInstruction?.parts?.[0]?.text || '';
      const hasFastInstruction = sysText.includes('executive summarizer') || sysText.includes('concise');

      return {
        hasFirstVideoPart,
        hasThinking,
        hasMediaRes,
        hasSearch,
        hasMaps,
        hasCode,
        hasFastInstruction
      };
    });

    assert.ok(paramCheck.hasFirstVideoPart, 'Video part is first in contents array');
    assert.ok(paramCheck.hasThinking, 'thinkingLevel is passed in generationConfig');
    assert.ok(paramCheck.hasMediaRes, 'mediaResolution is passed in generationConfig');
    assert.ok(paramCheck.hasSearch, 'google_search tool is included');
    assert.ok(paramCheck.hasMaps, 'google_maps tool is included');
    assert.ok(paramCheck.hasCode, 'code_execution tool is included');
    assert.ok(paramCheck.hasFastInstruction, 'System instruction is tailored for fast concise processing');
    passed += 7;

    // Verify Deep mode produces distinct analytical system instruction
    const deepSystemCheck = await page.evaluate(() => {
      const win = window.__yt_summariser_test.activeWindows.get('D_options_test');
      win.opts.transcriptMode = 'deep';
      const deepInstruction = win.getSystemInstruction();
      win.opts.transcriptMode = 'fast';
      const fastInstruction = win.getSystemInstruction();
      return {
        deepHasAnalytical: deepInstruction.includes('analytical researcher') && deepInstruction.includes('exhaustive'),
        fastHasExecutive: fastInstruction.includes('executive summarizer') && fastInstruction.includes('concise'),
        isDifferent: deepInstruction !== fastInstruction
      };
    });
    assert.ok(deepSystemCheck.deepHasAnalytical, 'Deep mode produces analytical exhaustive system prompt');
    assert.ok(deepSystemCheck.fastHasExecutive, 'Fast mode produces executive concise system prompt');
    assert.ok(deepSystemCheck.isDifferent, 'Fast and Deep modes produce distinct system prompts for Gemini');
    passed += 3;

    // Wait for summary to complete
    await page.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const status = host?.shadowRoot?.querySelector('.yt-win-status-line');
      return status && /completed|cached/i.test(status.textContent);
    }, { timeout: 8000 });

    // 3. Fact-check verification: separate request with Google Search grounding
    await page.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      return Boolean(host?.shadowRoot?.querySelector('.yt-fact-box:not(.yt-fact-loading):not(.yt-fact-pending)'));
    }, { timeout: 8000 });

    const factCheckUi = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const factBox = host?.shadowRoot?.querySelector('.yt-fact-box');
      const sources = host?.shadowRoot?.querySelectorAll('.yt-source-item');
      return {
        hasFactBox: Boolean(factBox),
        sourceCount: sources.length,
        hasVerdicts: factBox?.textContent?.includes('Supported')
      };
    });
    assert.ok(factCheckUi.hasFactBox, 'Fact-check box rendered below summary');
    assert.ok(factCheckUi.sourceCount >= 1, 'Sources consulted list populated');
    assert.ok(factCheckUi.hasVerdicts, 'Fact-check contains claims and verdicts');
    passed += 3;

    // 4. Quota Error handling and "Try <model>" offer
    await page.evaluate(() => {
      for (const [, w] of Array.from(window.__yt_summariser_test.activeWindows.entries())) w.close();
      window.__yt_summariser_test.openForVideo({ videoId: 'D_quota_test', title: 'Quota Test' });
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('D_quota_test');
      win.modelId = 'quota-fail-model';
      win.saveOpts();
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });

    await page.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      return Boolean(host?.shadowRoot?.querySelector('.yt-error-view'));
    }, { timeout: 6000 });

    const quotaUiCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const errorMsg = host?.shadowRoot?.querySelector('.yt-error-msg')?.textContent || '';
      const tryModelBtn = host?.shadowRoot?.querySelector('.yt-error-actions button:nth-child(2)');
      return {
        hasQuotaText: /quota/i.test(errorMsg),
        hasRetryDelay: /retry/i.test(errorMsg) || errorMsg.includes('5s'),
        hasTryBtn: tryModelBtn?.textContent?.includes('Try')
      };
    });
    assert.ok(quotaUiCheck.hasQuotaText, 'Error view explains quota violation');
    assert.ok(quotaUiCheck.hasTryBtn, 'Error view offers "Try <model>" button');
    passed += 2;

    // 5. Video input daily limit auto-fallback to transcript
    await page.evaluate(() => {
      for (const [, w] of Array.from(window.__yt_summariser_test.activeWindows.entries())) w.close();
      window.__yt_summariser_test.openForVideo({ videoId: 'D_video_limit_test', title: 'Video Limit Test' });
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('D_video_limit_test');
      win.modelId = 'video-limit-model';
      win.opts.txFallback = true;
      win.saveOpts();
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });

    await page.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const status = host?.shadowRoot?.querySelector('.yt-win-status-line');
      return status && /completed|cached/i.test(status.textContent);
    }, { timeout: 10000 });

    const txFallbackCheck = await page.evaluate(() => {
      const win = window.__yt_summariser_test.activeWindows.get('D_video_limit_test');
      return {
        sourceNow: win.source,
        hasNote: win.notes.some((n) => n.includes('video-input limit'))
      };
    });
    assert.equal(txFallbackCheck.sourceNow, 'text', 'Auto-switched source from video to text/transcript');
    assert.ok(txFallbackCheck.hasNote, 'Added note explaining video-input limit was reached');
    passed += 2;

    // 6. Transcribe + Transcript mode: straight from YouTube captions, NO AI CALL!
    await page.evaluate(() => {
      for (const [, w] of Array.from(window.__yt_summariser_test.activeWindows.entries())) w.close();
      window.__recorded_gm_requests = [];
      window.__yt_summariser_test.openForVideo({ videoId: 'D_captions_pure', title: 'Captions Pure' });
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('D_captions_pure');
      win.mode = 'transcript';
      win.source = 'text';
      win.renderAll();
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });

    await page.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const status = host?.shadowRoot?.querySelector('.yt-win-status-line');
      return status && /completed|cached/i.test(status.textContent);
    }, { timeout: 6000 });

    const pureCaptionCheck = await page.evaluate(() => {
      const win = window.__yt_summariser_test.activeWindows.get('D_captions_pure');
      const reqs = window.__recorded_gm_requests || [];
      const aiReqs = reqs.filter((r) => {
        if (!r.url.includes(':generateContent')) return false;
        const data = String(r.data || '');
        return data.includes('D_captions_pure') || data.includes('Welcome to this technical breakdown');
      });
      return {
        hasCaptionNote: win.notes.some((n) => n.includes('No AI was involved')),
        aiCallsCount: aiReqs.length,
        hasTimestamps: win.text.includes('[00:05]')
      };
    });
    assert.ok(pureCaptionCheck.hasCaptionNote, 'Note specifies "No AI was involved"');
    assert.equal(pureCaptionCheck.aiCallsCount, 0, 'Zero AI API calls made for Transcribe + Transcript mode');
    assert.ok(pureCaptionCheck.hasTimestamps, 'Transcript contains timestamped paragraphs');
    passed += 3;

    // 7. No-captions error handling (Variant Z)
    await page.evaluate(() => {
      for (const [, w] of Array.from(window.__yt_summariser_test.activeWindows.entries())) w.close();
      window.__yt_summariser_test.openForVideo({ videoId: 'Z_no_captions', title: 'No Captions Test' });
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('Z_no_captions');
      win.source = 'text';
      win.renderAll();
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });

    await page.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      return Boolean(host?.shadowRoot?.querySelector('.yt-error-view'));
    }, { timeout: 8000 });

    const noCapCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const msg = host?.shadowRoot?.querySelector('.yt-error-msg')?.textContent || '';
      return msg.includes('transcript');
    });
    assert.ok(noCapCheck, 'Displays clear error when video has no captions');
    passed++;

    console.log(`✓ Suite 3 passed: ${passed} checks verified.`);
    return { passed, total: passed };
  } finally {
    await harness.browser.close();
  }
}

import assert from 'node:assert/strict';
import { createHarness } from './harness.js';

export async function runAskAndImagesTests() {
  console.log('\n--- Running Test Suite 4: YouTube Ask Provider & Image Pipeline ---');
  let passed = 0;
  const harness = await createHarness();

  try {
    const page = await harness.openFeed();

    // 1. YouTube Ask without any API key
    await page.evaluate(() => {
      window.GM_setValue('keys', []); // Zero keys!
      window.GM_setValue('lastModel', 'YouTube Ask (Gemini in the page)');
      window.__yt_summariser_test.openForVideo({ videoId: 'D_ask_default', title: 'Ask Default Video' });
      const win = window.__yt_summariser_test.activeWindows.get('D_ask_default');
      win.startJob();
    });

    await page.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const status = host?.shadowRoot?.querySelector('.yt-win-status-line');
      return status && /completed|cached/i.test(status.textContent);
    }, { timeout: 12000 });

    const askDone = await page.evaluate(() => {
      const win = window.__yt_summariser_test.activeWindows.get('D_ask_default');
      return {
        hasText: win.text.includes('Summary by YouTube Ask'),
        isDone: win.status === 'done'
      };
    });
    assert.ok(askDone.isDone, 'YouTube Ask completes without requiring an API key');
    assert.ok(askDone.hasText, 'YouTube Ask returns formatted summary');
    passed += 2;

    // 2. Ask Variant S (trusted input)
    await page.evaluate(() => {
      for (const [, w] of Array.from(window.__yt_summariser_test.activeWindows.entries())) w.close();
      window.__yt_summariser_test.openForVideo({ videoId: 'S_ask_insert', title: 'Ask Variant S' });
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('S_ask_insert');
      win.modelId = 'YouTube Ask (Gemini in the page)';
      win.renderAll();
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });

    await page.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const status = host?.shadowRoot?.querySelector('.yt-win-status-line');
      return status && /completed|cached/i.test(status.textContent);
    }, { timeout: 12000 });

    const askSDone = await page.evaluate(() => {
      const win = window.__yt_summariser_test.activeWindows.get('S_ask_insert');
      return win.status === 'done';
    });
    assert.ok(askSDone, 'Ask Variant S succeeds via send ladder');
    passed++;

    // 3. Ask Variant E (Enter keydown)
    await page.evaluate(() => {
      for (const [, w] of Array.from(window.__yt_summariser_test.activeWindows.entries())) w.close();
      window.__yt_summariser_test.openForVideo({ videoId: 'E_ask_enter', title: 'Ask Variant E' });
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('E_ask_enter');
      win.modelId = 'YouTube Ask (Gemini in the page)';
      win.renderAll();
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });

    await page.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const status = host?.shadowRoot?.querySelector('.yt-win-status-line');
      return status && /completed|cached/i.test(status.textContent);
    }, { timeout: 12000 });

    const askEDone = await page.evaluate(() => {
      const win = window.__yt_summariser_test.activeWindows.get('E_ask_enter');
      return win.status === 'done';
    });
    assert.ok(askEDone, 'Ask Variant E succeeds via Enter key step');
    passed++;

    // 4. Ask Variant F (forced click)
    await page.evaluate(() => {
      for (const [, w] of Array.from(window.__yt_summariser_test.activeWindows.entries())) w.close();
      window.__yt_summariser_test.openForVideo({ videoId: 'F_ask_force', title: 'Ask Variant F' });
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('F_ask_force');
      win.modelId = 'YouTube Ask (Gemini in the page)';
      win.renderAll();
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });

    await page.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const status = host?.shadowRoot?.querySelector('.yt-win-status-line');
      return status && /completed|cached/i.test(status.textContent);
    }, { timeout: 14000 });

    const askFDone = await page.evaluate(() => {
      const win = window.__yt_summariser_test.activeWindows.get('F_ask_force');
      return win.status === 'done';
    });
    assert.ok(askFDone, 'Ask Variant F succeeds via forced click step');
    passed++;

    // 5. Ask Variant C (chip click)
    await page.evaluate(() => {
      for (const [, w] of Array.from(window.__yt_summariser_test.activeWindows.entries())) w.close();
      window.__yt_summariser_test.openForVideo({ videoId: 'C_ask_chip', title: 'Ask Variant C' });
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('C_ask_chip');
      win.modelId = 'YouTube Ask (Gemini in the page)';
      win.renderAll();
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });

    await page.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const status = host?.shadowRoot?.querySelector('.yt-win-status-line');
      return status && /completed|cached/i.test(status.textContent);
    }, { timeout: 16000 });

    const askCDone = await page.evaluate(() => {
      const win = window.__yt_summariser_test.activeWindows.get('C_ask_chip');
      return {
        isDone: win.status === 'done',
        hasChipNote: win.notes.some((n) => n.includes('Ask summary chip'))
      };
    });
    assert.ok(askCDone.isDone, 'Ask Variant C succeeds via chip click');
    assert.ok(askCDone.hasChipNote, 'Adds note when summary chip was used');
    passed += 2;

    // 6. Ask Variant N (No Ask button present)
    await page.evaluate(() => {
      for (const [, w] of Array.from(window.__yt_summariser_test.activeWindows.entries())) w.close();
      window.__yt_summariser_test.openForVideo({ videoId: 'N_no_ask', title: 'No Ask Video' });
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      win.modelId = 'YouTube Ask (Gemini in the page)';
      win.renderAll();
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });

    await page.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      return Boolean(host?.shadowRoot?.querySelector('.yt-error-view'));
    }, { timeout: 6000 });

    const askNDone = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const msg = host?.shadowRoot?.querySelector('.yt-error-msg')?.textContent || '';
      return msg.includes('Ask button');
    });
    assert.ok(askNDone, 'Provides clear error message when Ask button is absent');
    passed++;

    // 7. Visuals & Image Pipeline: Gemini Summary with FRAME, Commons IMG, and AI Image GEN
    await page.evaluate(() => {
      for (const [, w] of Array.from(window.__yt_summariser_test.activeWindows.entries())) w.close();
      window.GM_setValue('keys', [{ id: 'k1', name: 'Key', key: 'AIzaSyKey123' }]);
      window.__yt_summariser_test.openForVideo({ videoId: 'D_visuals_test', title: 'Visuals Test' });
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('D_visuals_test');
      win.modelId = 'gemini-3.8-flash';
      win.opts.img = true;
      win.opts.gen = true;
      win.opts.imgModel = 'gemini-nano-banana-2.1'; // Test Interactions API fallback
      win.saveOpts();
      win.renderAll();
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });

    await page.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const status = host?.shadowRoot?.querySelector('.yt-win-status-line');
      return status && /completed|cached/i.test(status.textContent);
    }, { timeout: 12000 });

    const visualsCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const frameBadge = host?.shadowRoot?.querySelector('.yt-frame-badge');
      const commonsCard = host?.shadowRoot?.querySelector('.yt-commons-card');
      const aiCard = host?.shadowRoot?.querySelector('.yt-ai-image-card');
      const rawScriptTag = host?.shadowRoot?.querySelector('script');
      const scriptInText = host?.shadowRoot?.textContent?.includes('XSS attack attempt should render as plain text');

      return {
        hasFrameBadge: Boolean(frameBadge),
        hasCommons: Boolean(commonsCard),
        hasAiImage: Boolean(aiCard),
        noRawScriptTag: rawScriptTag === null || rawScriptTag.id === 'safe-style',
        scriptSafeText: Boolean(scriptInText)
      };
    });

    assert.ok(visualsCheck.hasFrameBadge, 'FRAME marker rendered with timestamp badge');
    assert.ok(visualsCheck.hasCommons, 'Wikimedia Commons illustration card rendered');
    assert.ok(visualsCheck.hasAiImage, 'AI-generated illustration (Nano Banana via Interactions API) placed and rendered');
    assert.ok(visualsCheck.scriptSafeText, 'Raw <script> text in summary rendered as literal text without execution');
    passed += 4;

    // 8. In-window player seeking on timestamp click
    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const tsLink = host?.shadowRoot?.querySelector('.yt-ts-link');
      if (tsLink) tsLink.click();
    });
    await page.waitForTimeout(300);

    const playerCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const playerSlot = host?.shadowRoot?.querySelector('.yt-player-slot');
      const iframe = playerSlot?.querySelector('iframe');
      return {
        slotVisible: playerSlot?.style.display !== 'none',
        hasIframe: Boolean(iframe),
        iframeSrc: iframe?.getAttribute('src')
      };
    });
    assert.ok(playerCheck.slotVisible, 'In-window player slot opened');
    assert.ok(playerCheck.hasIframe, 'Embedded YouTube player iframe mounted');
    assert.ok(playerCheck.iframeSrc?.includes('/embed/'), 'Iframe src uses youtube.com/embed/ with autoplay and timestamp');
    passed += 3;

    // 9. Independent Visual Coordinator for YouTube Ask
    await page.evaluate(() => {
      for (const [, w] of Array.from(window.__yt_summariser_test.activeWindows.entries())) w.close();
      window.GM_setValue('keys', [{ id: 'k1', name: 'Key', key: 'AIzaSyKey123' }]);
      window.__yt_summariser_test.openForVideo({ videoId: 'D_ask_visuals', title: 'Ask Visuals Test' });
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('D_ask_visuals');
      win.modelId = 'YouTube Ask (Gemini in the page)';
      win.opts.img = true;
      win.opts.gen = true;
      win.saveOpts();
      win.renderAll();
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });

    await page.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const status = host?.shadowRoot?.querySelector('.yt-win-status-line');
      return status && /completed|cached/i.test(status.textContent);
    }, { timeout: 15000 });

    const askVisualsCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('D_ask_visuals');
      const frameBadge = host?.shadowRoot?.querySelector('.yt-frame-badge');
      const commonsCard = host?.shadowRoot?.querySelector('.yt-commons-card');
      const aiCard = host?.shadowRoot?.querySelector('.yt-ai-image-card');

      return {
        isDone: win.status === 'done',
        hasFrameInText: win.text.includes('[[FRAME'),
        hasFrameBadge: Boolean(frameBadge),
        hasCommons: Boolean(commonsCard),
        hasAiImage: Boolean(aiCard),
        hasCoordinatorNote: win.notes.some((n) => n.includes('Visuals & diagrams coordinated by'))
      };
    });

    assert.ok(askVisualsCheck.isDone, 'YouTube Ask with visual coordinator completes successfully');
    assert.ok(askVisualsCheck.hasFrameInText, 'Independent coordinator inserts video frame markers into Ask summary');
    assert.ok(askVisualsCheck.hasFrameBadge, 'Video frame screenshot timestamp badge rendered for Ask summary');
    assert.ok(askVisualsCheck.hasCommons, 'Wikimedia search diagram rendered for Ask summary');
    assert.ok(askVisualsCheck.hasAiImage, 'AI illustration (Nano Banana) generated and rendered for Ask summary');
    assert.ok(askVisualsCheck.hasCoordinatorNote, 'Note documents independent model coordination');
    passed += 6;

    // 10. Automatic ladder fallback when YouTube Ask fails and API key is configured (even with opts.fallback = false)
    await page.evaluate(() => {
      for (const [, w] of Array.from(window.__yt_summariser_test.activeWindows.entries())) w.close();
      window.__yt_summariser_test.deleteCachedVideo('N_no_ask');
      window.GM_setValue('keys', [{ id: 'k1', name: 'Paid Key', key: 'AIzaSyKey123' }]);
      window.__recorded_gm_requests = [];
      window.__yt_summariser_test.openForVideo({ videoId: 'N_no_ask', title: 'Ask Auto Fallback Paid Key' });
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      win.modelId = 'YouTube Ask (Gemini in the page)';
      win.opts.fallback = false;
      win.opts.fc = false;
      win.opts.src = false;
      win.saveOpts();
      win.renderAll();
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });

    await page.waitForFunction(() => {
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      return win && win.status === 'done';
    }, { timeout: 12000 });

    const askAutoFallbackPaid = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      const sel = host?.shadowRoot?.querySelector('.yt-model-select');
      const noteText = (win.notes || []).join(' | ');
      return {
        status: win.status,
        modelId: win.modelId,
        selectedValue: sel ? sel.value : '',
        hasFallbackNote: noteText.includes('YouTube Ask failed') && noteText.includes('Automatically proceeding with gemini-3.1-pro-preview'),
        hasText: Boolean(win.text && win.text.length > 20)
      };
    });

    assert.equal(askAutoFallbackPaid.status, 'done', 'Completes summary automatically when Ask fails and paid API key is configured');
    assert.equal(askAutoFallbackPaid.modelId, 'gemini-3.1-pro-preview', 'Proceeds with top model on fallback ladder (gemini-3.1-pro-preview)');
    assert.ok(askAutoFallbackPaid.hasFallbackNote, 'Records automatic Ask fallback note');
    assert.ok(askAutoFallbackPaid.hasText, 'Produces non-empty fallback summary text');
    passed += 4;

    // 11. Automatic ladder fallback with free-tier key skips unsupported Pro and uses gemini-3.8-flash
    await page.evaluate(() => {
      window.__yt_summariser_test.activeWindows.get('N_no_ask')?.close();
      window.__yt_summariser_test.deleteCachedVideo('N_no_ask');
      window.GM_setValue('keys', [{ id: 'k_free', name: 'Free Key', key: 'AIzaSyfreeKey999' }]);
      window.__yt_summariser_test.openForVideo({ videoId: 'N_no_ask', title: 'Ask Auto Fallback Free Key' });
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      win.keyId = 'k_free';
      win.modelId = 'YouTube Ask (Gemini in the page)';
      win.opts.fallback = false;
      win.opts.fc = false;
      win.opts.src = false;
      win.notes = [];
      win.saveOpts();
      win.startJob();
    });

    await page.waitForFunction(() => {
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      return win && win.status === 'done';
    }, { timeout: 12000 });

    const askAutoFallbackFree = await page.evaluate(() => {
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      return {
        status: win.status,
        modelId: win.modelId,
        hasFlashFallbackNote: win.notes.some((n) => n.includes('Automatically proceeding with gemini-3.8-flash'))
      };
    });
    assert.equal(askAutoFallbackFree.status, 'done', 'Completes summary automatically on free key after Ask failure');
    assert.equal(askAutoFallbackFree.modelId, 'gemini-3.8-flash', 'Skips Pro model unavailable on free key and proceeds with gemini-3.8-flash');
    assert.ok(askAutoFallbackFree.hasFlashFallbackNote, 'Records fallback to gemini-3.8-flash in notes');
    passed += 3;

    // 12. Follow-up question with YouTube Ask also falls back automatically to next ladder model on failure
    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      win.modelId = 'YouTube Ask (Gemini in the page)';
      win.turns = [];
      const ta = host?.shadowRoot?.querySelector('.yt-composer-textarea');
      const sendBtn = host?.shadowRoot?.querySelector('.yt-composer-send-btn');
      ta.value = 'What was the main conclusion?';
      sendBtn.click();
    });

    await page.waitForFunction(() => {
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      return win && win.turns && win.turns.length === 1 && !win.busy;
    }, { timeout: 12000 });

    const askFollowUpFallback = await page.evaluate(() => {
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      const turn = win.turns[0];
      return {
        modelId: win.modelId,
        answer: turn?.a || '',
        hasFollowNote: win.notes.some((n) => n.includes('YouTube Ask failed during follow-up') && n.includes('gemini-3.8-flash'))
      };
    });
    assert.equal(askFollowUpFallback.modelId, 'gemini-3.8-flash', 'Switches active model to next ladder model after Ask follow-up failure');
    assert.ok(askFollowUpFallback.answer && !askFollowUpFallback.answer.startsWith('⚠ Error'), 'Follow-up answer generated cleanly via fallback model');
    assert.ok(askFollowUpFallback.hasFollowNote, 'Records follow-up automatic fallback note');
    passed += 3;

    // 13. Simulated HTTP 429 fault after Ask failure cascades from gemini-3.1-pro-preview down to gemini-3.8-flash
    await page.evaluate(() => {
      for (const [, w] of Array.from(window.__yt_summariser_test.activeWindows.entries())) w.close();
      window.__yt_summariser_test.deleteCachedVideo('N_no_ask');
      window.GM_setValue('keys', [{ id: 'k1', name: 'Paid Key', key: 'AIzaSyKey123' }]);
      window.__origGmRequestStage1 = window.GM_xmlhttpRequest;
      window.GM_xmlhttpRequest = function (opts) {
        const url = opts.url || '';
        if (url.includes('models/gemini-3.1-pro-preview:generateContent')) {
          setTimeout(() => {
            opts.onload({
              status: 429,
              responseText: JSON.stringify({
                error: {
                  message: 'Simulated 429 rate limit on gemini-3.1-pro-preview',
                  details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '90s' }]
                }
              })
            });
          }, 25);
          return;
        }
        return window.__origGmRequestStage1(opts);
      };
      window.__yt_summariser_test.openForVideo({ videoId: 'N_no_ask', title: 'Ask + 429 Fault Cascade' });
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      win.modelId = 'YouTube Ask (Gemini in the page)';
      win.opts.fallback = false;
      win.opts.fc = false;
      win.opts.src = false;
      win.notes = [];
      win.saveOpts();
      win.startJob();
    });

    await page.waitForFunction(() => {
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      return win && win.status === 'done';
    }, { timeout: 14000 });

    const cascadeResult = await page.evaluate(() => {
      if (window.__origGmRequestStage1) {
        window.GM_xmlhttpRequest = window.__origGmRequestStage1;
      }
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      return {
        status: win.status,
        busy: win.busy,
        modelId: win.modelId,
        notes: win.notes || [],
        hasText: Boolean(win.text && win.text.length > 20)
      };
    });
    assert.equal(cascadeResult.status, 'done', 'Completes summary after Ask failure + Pro 429 cascade');
    assert.equal(cascadeResult.busy, false, 'Clears busy flag after cascade completes');
    assert.equal(cascadeResult.modelId, 'gemini-3.8-flash', 'Cascades down from failed Pro (429) to gemini-3.8-flash');
    assert.ok(cascadeResult.notes.some((n) => n.includes('YouTube Ask failed')), 'Retains Ask failure diagnostic note');
    assert.ok(cascadeResult.notes.some((n) => n.includes('gemini-3.1-pro-preview failed')), 'Retains intermediate Pro 429 failure note');
    assert.ok(cascadeResult.hasText, 'Produces valid summary output after multi-hop cascade');
    passed += 6;

    // 14. Full Ask + complete Gemini ladder 503/429 exhaustion terminates cleanly in error state (no hang)
    await page.evaluate(() => {
      for (const [, w] of Array.from(window.__yt_summariser_test.activeWindows.entries())) w.close();
      window.__yt_summariser_test.deleteCachedVideo('N_no_ask');
      window.__origGmRequestStage1Exhaust = window.GM_xmlhttpRequest;
      window.GM_xmlhttpRequest = function (opts) {
        const url = opts.url || '';
        if (url.includes(':generateContent')) {
          setTimeout(() => {
            opts.onload({
              status: 429,
              responseText: JSON.stringify({
                error: {
                  message: 'Simulated 429 exhaustion across entire ladder',
                  details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '120s' }]
                }
              })
            });
          }, 15);
          return;
        }
        return window.__origGmRequestStage1Exhaust(opts);
      };
      window.__yt_summariser_test.openForVideo({ videoId: 'N_no_ask', title: 'Ask Ladder Exhaustion Test' });
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      win.modelId = 'YouTube Ask (Gemini in the page)';
      win.opts.fc = false;
      win.opts.src = false;
      win.notes = [];
      win.saveOpts();
      win.startJob();
    });

    await page.waitForFunction(() => {
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      return win && win.status === 'error' && !win.busy;
    }, { timeout: 14000 });

    const exhaustionResult = await page.evaluate(() => {
      if (window.__origGmRequestStage1Exhaust) {
        window.GM_xmlhttpRequest = window.__origGmRequestStage1Exhaust;
      }
      const win = window.__yt_summariser_test.activeWindows.get('N_no_ask');
      return {
        status: win.status,
        busy: win.busy,
        errMsg: win.errMsg || '',
        notes: win.notes || []
      };
    });
    assert.equal(exhaustionResult.status, 'error', 'Transitions cleanly to error state when Ask and entire fallback ladder fail');
    assert.equal(exhaustionResult.busy, false, 'Releases busy lock cleanly after full ladder exhaustion');
    assert.ok(exhaustionResult.notes.some((n) => n.includes('YouTube Ask failed')), 'Preserves Ask failure note on ladder exhaustion');
    assert.ok(exhaustionResult.notes.some((n) => n.includes('Simulated 429 exhaustion')), 'Preserves downstream model 429 note');
    passed += 4;

    console.log(`✓ Suite 4 passed: ${passed} checks verified.`);
    return { passed, total: passed };
  } finally {
    await harness.browser.close();
  }
}

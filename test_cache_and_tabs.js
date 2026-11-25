import assert from 'node:assert/strict';
import { createHarness } from './harness.js';

export async function runCacheAndTabsTests() {
  console.log('\n--- Running Test Suite 2: Caching & Cross-Tab Synchronization ---');
  let passed = 0;
  const harness = await createHarness();

  try {
    const tab1 = await harness.openFeed();

    // Setup a valid API key in storage
    await tab1.evaluate(() => {
      window.GM_setValue('keys', [{ id: 'k1', name: 'Test Key', key: 'AIzaSyValidTestKey123' }]);
    });

    // Open video window
    await tab1.evaluate(() => {
      window.__yt_summariser_test.openForVideo({ videoId: 'D_test_sync_1', title: 'Test Video 1' });
    });
    await tab1.waitForTimeout(300);

    // Verify window opened in Tab 1
    const t1Check = await tab1.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      return {
        tabs: host?.shadowRoot?.querySelectorAll('.yt-dock-tab').length,
        hasModal: Boolean(host?.shadowRoot?.querySelector('.yt-window-box'))
      };
    });
    assert.equal(t1Check.tabs, 1, 'Tab 1 has dock tab');
    assert.ok(t1Check.hasModal, 'Tab 1 has maximized window');
    passed++;

    // Check cross-tab sync: Open Tab 2
    const tab2 = await harness.openTab();
    await tab2.waitForTimeout(400);

    const t2Check = await tab2.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const tabs = host?.shadowRoot?.querySelectorAll('.yt-dock-tab');
      return {
        tabCount: tabs?.length,
        hasModal: Boolean(host?.shadowRoot?.querySelector('.yt-window-box'))
      };
    });
    assert.equal(t2Check.tabCount, 1, 'Tab 2 restored the open window in dock');
    assert.ok(!t2Check.hasModal, 'Tab 2 restored window as minimized (no modal)');
    passed++;

    // Start job in Tab 1
    await tab1.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });

    // Check live sync in Tab 2: Tab 2 shows spinner / "Working in another tab..."
    await tab2.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const tab = host?.shadowRoot?.querySelector('.yt-dock-tab');
      return Boolean(tab?.querySelector('.yt-spinner'));
    }, { timeout: 4000 });

    const t2Working = await tab2.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const tab = host?.shadowRoot?.querySelector('.yt-dock-tab');
      return {
        hasSpinner: Boolean(tab?.querySelector('.yt-spinner')),
        title: tab?.title
      };
    });
    assert.ok(t2Working.hasSpinner, 'Tab 2 shows live working spinner');
    passed++;

    // Wait for completion in Tab 1
    await tab1.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const status = host?.shadowRoot?.querySelector('.yt-win-status-line');
      return status && /completed|cached/i.test(status.textContent);
    }, { timeout: 8000 });

    // Verify Tab 2 marked completion with unread green highlight
    await tab2.waitForTimeout(300);
    const t2Done = await tab2.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const tab = host?.shadowRoot?.querySelector('.yt-dock-tab');
      return {
        isUnread: tab?.classList.contains('unread'),
        hasCheck: Boolean(tab?.querySelector('svg'))
      };
    });
    assert.ok(t2Done.isUnread, 'Minimized window in Tab 2 turns green + unread on remote completion');
    passed++;

    // Ask a follow-up question in Tab 1
    await tab1.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const ta = host?.shadowRoot?.querySelector('.yt-composer-textarea');
      ta.value = 'What about cooling requirements?';
      const sendBtn = host?.shadowRoot?.querySelector('.yt-composer-send-btn');
      sendBtn.click();
    });

    await tab1.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const bubbles = host?.shadowRoot?.querySelectorAll('.yt-user-bubble');
      return bubbles.length > 0;
    }, { timeout: 8000 });

    // Verify conversation stored in cache
    const cachedEntry = await tab1.evaluate(() => {
      return window.__yt_summariser_test.readCache('D_test_sync_1', 'summary', 'video');
    });
    assert.ok(cachedEntry, 'Summary cached successfully');
    assert.ok(cachedEntry.turns?.length >= 1, 'Follow-up question saved in cache turns');
    passed++;

    // Close window in Tab 1
    await tab1.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const closeBtn = host?.shadowRoot?.querySelector('.yt-win-btn[title*="Close"]');
      closeBtn.click();
    });
    await tab1.waitForTimeout(300);

    // Verify closed in Tab 2 via sync
    const t2Closed = await tab2.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      return {
        videoTabs: host?.shadowRoot?.querySelectorAll('.yt-dock-tab:not(.yt-dock-history-tab)').length,
        hasHistoryTab: Boolean(host?.shadowRoot?.querySelector('.yt-dock-history-tab'))
      };
    });
    assert.equal(t2Closed.videoTabs, 0, 'Closing window in Tab 1 closes video window in Tab 2');
    assert.ok(t2Closed.hasHistoryTab, 'Dock in Tab 2 displays History tab for closed summary');
    passed++;

    // Check zero-API-request cache reopen:
    // Reset recorded requests counter
    await tab1.evaluate(() => {
      window.__recorded_gm_requests = [];
      window.__yt_summariser_test.openForVideo({ videoId: 'D_test_sync_1', title: 'Test Video 1' });
    });
    await tab1.waitForTimeout(300);

    const reopenCheck = await tab1.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const status = host?.shadowRoot?.querySelector('.yt-win-status-line');
      const bubbles = host?.shadowRoot?.querySelectorAll('.yt-user-bubble');
      const requests = window.__recorded_gm_requests || [];
      const generateRequests = requests.filter((r) => r.url.includes(':generateContent'));
      return {
        isCached: status?.textContent?.includes('Cached'),
        bubbleCount: bubbles?.length,
        generateCount: generateRequests.length
      };
    });
    assert.ok(reopenCheck.isCached, 'Reopened window status shows "Cached"');
    assert.ok(reopenCheck.bubbleCount >= 1, 'Previous follow-up conversation restored from cache');
    assert.equal(reopenCheck.generateCount, 0, 'Zero API requests made on cache reopen');
    passed++;

    // Test tab close / stale heartbeat interruption
    // Start job on a new video in Tab 2
    await tab2.evaluate(() => {
      window.__yt_summariser_test.openForVideo({ videoId: 'D_stale_test', title: 'Stale Video' });
    });
    await tab2.waitForTimeout(200);

    // Start job in Tab 2, then immediately close Tab 2
    await tab2.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const startBtn = host?.shadowRoot?.querySelector('.yt-primary-btn');
      startBtn.click();
    });
    await tab2.close(); // Tab 2 navigates away / closes

    // Tab 1 should detect interruption (pagehide or stale heartbeat)
    await tab1.waitForFunction(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const tab = host?.shadowRoot?.querySelector('.yt-dock-tab.error');
      return Boolean(tab);
    }, { timeout: 4000 });

    const interruptedCheck = await tab1.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const tab = host?.shadowRoot?.querySelector('.yt-dock-tab.error');
      return Boolean(tab);
    });
    assert.ok(interruptedCheck, 'Window marked interrupted/error when owning tab closes');
    passed++;

    // AUD-01: Persistent alt_title_index LRU eviction (capped at 500 keys) + draft_index (200) + touchCacheIndex open-win protection
    const lruPersistenceCheck = await tab1.evaluate(() => {
      const helper = window.__yt_summariser_test;

      // Clean any prior alt_title entries
      for (const k of window.GM_listValues()) {
        if (k.startsWith('alt_title:') || k === 'alt_title_index' || k.startsWith('draft:') || k === 'draft_index') {
          window.GM_deleteValue(k);
        }
      }

      for (let i = 0; i < 505; i++) {
        helper.setCachedAltTitle(`LRU_ALT_${i}`, `Factual Title ${i}`);
      }
      const altKeys = window.GM_listValues().filter((k) => k.startsWith('alt_title:'));
      const oldestEvicted = window.GM_getValue('alt_title:LRU_ALT_0', null);
      const fourthEvicted = window.GM_getValue('alt_title:LRU_ALT_4', null);
      const fifthKept = window.GM_getValue('alt_title:LRU_ALT_5', null);
      const newestKept = window.GM_getValue('alt_title:LRU_ALT_504', null);
      const indexCount = Object.keys(helper.getAltTitleIndex()).length;

      for (let i = 0; i < 205; i++) {
        helper.setDraftFollowUp(`LRU_DRAFT_${i}`, `Draft text ${i}`);
      }
      const draftKeys = window.GM_listValues().filter((k) => k.startsWith('draft:'));
      const oldestDraftEvicted = window.GM_getValue('draft:LRU_DRAFT_0', null);
      const newestDraftKept = window.GM_getValue('draft:LRU_DRAFT_204', null);

      // Clean up test keys
      for (const k of window.GM_listValues()) {
        if (k.startsWith('alt_title:LRU_ALT_') || k === 'alt_title_index' || k.startsWith('draft:LRU_DRAFT_') || k === 'draft_index') {
          window.GM_deleteValue(k);
        }
      }

      return {
        altKeyCount: altKeys.length,
        indexCount,
        oldestEvicted,
        fourthEvicted,
        fifthKept,
        newestKept,
        draftKeyCount: draftKeys.length,
        oldestDraftEvicted,
        newestDraftKept
      };
    });

    assert.equal(lruPersistenceCheck.altKeyCount, 500, 'AUD-01: Persistent alt_title:* keys are bounded at 500 entries via LRU eviction');
    assert.equal(lruPersistenceCheck.indexCount, 500, 'AUD-01: Persistent alt_title_index matches 500-entry cap');
    assert.equal(lruPersistenceCheck.oldestEvicted, null, 'AUD-01: Oldest alt_title entry (0) evicted from GM storage');
    assert.equal(lruPersistenceCheck.fourthEvicted, null, 'AUD-01: 5th-oldest alt_title entry (4) evicted from GM storage');
    assert.equal(lruPersistenceCheck.fifthKept, 'Factual Title 5', 'AUD-01: Retained boundary alt_title (5) stays intact');
    assert.equal(lruPersistenceCheck.newestKept, 'Factual Title 504', 'AUD-01: Most recent alt_title (504) stays intact');
    assert.equal(lruPersistenceCheck.draftKeyCount, 200, 'AUD-01: Persistent draft:* keys are bounded at 200 entries');
    assert.equal(lruPersistenceCheck.oldestDraftEvicted, null, 'AUD-01: Oldest draft entry evicted from GM storage');
    assert.equal(lruPersistenceCheck.newestDraftKept, 'Draft text 204', 'AUD-01: Latest draft entry preserved cleanly');
    passed += 9;

    console.log(`✓ Suite 2 passed: ${passed} checks verified.`);
    return { passed, total: passed };
  } finally {
    await harness.browser.close();
  }
}

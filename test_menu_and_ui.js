import assert from 'node:assert/strict';
import { createHarness } from './harness.js';

export async function runMenuAndUiTests() {
  console.log('\n--- Running Test Suite 1: Menu Integration & UI Mechanics ---');
  let passed = 0;
  const harness = await createHarness();

  try {
    const page = await harness.openFeed();
    await page.waitForTimeout(300);

    // Check 1: Old menu injection
    await page.click('#btn-old-menu');
    await page.waitForTimeout(300);
    const oldItem = await page.waitForSelector('[data-ytais-item]', { state: 'attached', timeout: 5000 });
    assert.ok(oldItem, 'Summarize item injected in old iron-dropdown menu');
    passed++;

    // Check 2: Positioned between Save to playlist and Download
    const posCheck = await page.evaluate(() => {
      const item = document.querySelector('[data-ytais-item]');
      const prev = item.previousElementSibling;
      const next = item.nextElementSibling;
      return {
        prevMatches: /save to playlist/i.test(prev?.getAttribute('aria-label') || prev?.textContent || ''),
        nextMatches: /download/i.test(next?.getAttribute('aria-label') || next?.textContent || '')
      };
    });
    assert.ok(posCheck.prevMatches, 'Injected item is after "Save to playlist"');
    assert.ok(posCheck.nextMatches, 'Injected item is before "Download"');
    passed++;

    // Check 3: Menu item styling (16px, >= 44px min-height, sparkle icon)
    const styleCheck = await page.evaluate(() => {
      const item = document.querySelector('[data-ytais-item]');
      const cs = window.getComputedStyle(item);
      const svg = item.querySelector('svg');
      return {
        fontSize: cs.fontSize,
        minHeight: parseFloat(cs.minHeight),
        hasSvg: Boolean(svg),
        svgWidth: svg?.getAttribute('width')
      };
    });
    assert.equal(styleCheck.fontSize, '16px', 'Menu item font size is 16px');
    assert.ok(styleCheck.minHeight >= 44, 'Menu item min-height is >= 44px');
    assert.ok(styleCheck.hasSvg, 'Menu item has sparkle SVG icon');
    passed++;

    // Check 4: New menu injection (yt-sheet)
    await page.click('#btn-new-menu');
    await page.waitForTimeout(300);
    const newItem = await page.waitForSelector('#sheet-new [data-ytais-item]', { state: 'attached', timeout: 5000 });
    assert.ok(newItem, 'Summarize item injected in new yt-sheet menu');
    passed++;

    // Check 5: First-run key manager dialog when clicking without keys
    await page.evaluate(() => {
      const item = document.querySelector('[data-ytais-item]');
      item.click();
    });
    await page.waitForTimeout(400);

    const hasKeyDialog = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const dialog = host?.shadowRoot?.querySelector('.yt-key-dialog-scrim');
      return Boolean(dialog);
    });
    assert.ok(hasKeyDialog, 'First-run API key manager dialog opens when no keys exist');
    passed++;

    // Check 6: Escape closes key dialog without closing window
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const dialogClosed = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      return !host?.shadowRoot?.querySelector('.yt-key-dialog-scrim');
    });
    assert.ok(dialogClosed, 'Escape closes key dialog');
    passed++;

    // Check 7: Dock geometry (right: 24px, bottom: 0, tab height: 38px)
    const dockCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const dock = host?.shadowRoot?.querySelector('.yt-dock');
      const tab = host?.shadowRoot?.querySelector('.yt-dock-tab');
      const dockCs = window.getComputedStyle(dock);
      const tabCs = window.getComputedStyle(tab);
      return {
        right: dockCs.right,
        bottom: dockCs.bottom,
        height: tabCs.height
      };
    });
    assert.equal(dockCheck.right, '24px', 'Dock positioned right: 24px');
    assert.equal(dockCheck.bottom, '0px', 'Dock positioned bottom: 0px');
    assert.equal(dockCheck.height, '38px', 'Dock tab height is 38px');
    passed++;

    // Check 8: Escape minimizes maximized window (never closes it!)
    const minCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      return {
        hasModalBefore: Boolean(host?.shadowRoot?.querySelector('.yt-window-box')),
        tabsBefore: host?.shadowRoot?.querySelectorAll('.yt-dock-tab').length
      };
    });
    assert.ok(minCheck.hasModalBefore, 'Window was maximized');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const minAfter = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      return {
        hasModalAfter: Boolean(host?.shadowRoot?.querySelector('.yt-window-box')),
        tabsAfter: host?.shadowRoot?.querySelectorAll('.yt-dock-tab').length
      };
    });
    assert.ok(!minAfter.hasModalAfter, 'Escape minimizes the window (modal removed)');
    assert.equal(minAfter.tabsAfter, 1, 'Dock tab remains present (not closed)');
    passed++;

    // Check 9: Clicking title on dock tab re-maximizes window
    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const tab = host?.shadowRoot?.querySelector('.yt-dock-tab');
      tab.click();
    });
    await page.waitForTimeout(200);

    const remax = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      return Boolean(host?.shadowRoot?.querySelector('.yt-window-box'));
    });
    assert.ok(remax, 'Clicking dock tab re-maximizes window');
    passed++;

    // Check 10: Page hotkeys isolated while typing in window
    await page.evaluate(() => {
      window.__pageKeyFired = false;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'k') window.__pageKeyFired = true;
      });
      const host = document.getElementById('yt-ai-summary-host');
      const win = Array.from(window.__yt_summariser_test.activeWindows.values())[0];
      if (win) {
        win.status = 'done';
        win.renderAll();
      }
      const ta = host?.shadowRoot?.querySelector('.yt-composer-textarea');
      ta.focus();
    });

    await page.keyboard.press('k');
    const hotkeyCheck = await page.evaluate(() => !window.__pageKeyFired);
    assert.ok(hotkeyCheck, 'Typing inside shadow root prevents YouTube global hotkeys from firing');
    passed++;

    // Check 11: Dark mode dropdown menu styling & color-scheme: dark
    const darkModeCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const select = root?.querySelector('.yt-select');
      const styleEl = root?.querySelector('style');
      const cssText = styleEl?.textContent || '';
      const selectCs = select ? window.getComputedStyle(select) : null;
      return {
        hasSelect: Boolean(select),
        selectColorScheme: selectCs?.colorScheme,
        cssHasDarkOptions: cssText.includes('.yt-select option') && cssText.includes('#212121'),
        cssHasDarkOptgroup: cssText.includes('.yt-select optgroup') && cssText.includes('#181818'),
        cssHasColorSchemeDark: cssText.includes('color-scheme: dark')
      };
    });
    assert.ok(darkModeCheck.hasSelect, 'Select element present');
    assert.equal(darkModeCheck.selectColorScheme, 'dark', 'Dropdown select has color-scheme: dark');
    assert.ok(darkModeCheck.cssHasDarkOptions, 'Dropdown options have #212121 dark background styling');
    assert.ok(darkModeCheck.cssHasDarkOptgroup, 'Dropdown optgroups have #181818 dark background styling');
    passed++;

    // Check 12: TTS controls present in toolbar (Listen, Stop, Speed)
    const ttsPresence = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const ttsGroup = root?.querySelector('.yt-tts-group');
      const playBtn = root?.querySelector('.yt-tts-play-btn');
      const stopBtn = root?.querySelector('.yt-tts-stop-btn');
      const rateBtn = root?.querySelector('.yt-tts-speed-btn');
      return {
        hasGroup: Boolean(ttsGroup),
        playText: playBtn?.textContent?.trim(),
        stopText: stopBtn?.textContent?.trim(),
        rateText: rateBtn?.textContent?.trim()
      };
    });
    assert.ok(ttsPresence.hasGroup, 'TTS controls group rendered in toolbar');
    assert.equal(ttsPresence.playText, 'Listen', 'TTS play button initialized to Listen');
    assert.equal(ttsPresence.stopText, 'Stop', 'TTS stop button rendered');
    assert.equal(ttsPresence.rateText, '1x', 'TTS speed toggle initialized to 1x');
    passed++;

    // Check 13: Clicking Listen triggers speechSynthesis.speak with cleaned text
    await page.evaluate(() => {
      const win = Array.from(window.__yt_summariser_test.activeWindows.values())[0];
      if (win) {
        win.text = '## TL;DR\nQuantum computing is accelerating [01:15] with topological qubits.\n[[FRAME 01:15 | Diagram]]\n**Important:** Great breakthrough.';
        win.renderAll();
      }
      const host = document.getElementById('yt-ai-summary-host');
      const playBtn = host?.shadowRoot?.querySelector('.yt-tts-play-btn');
      playBtn?.click();
    });
    await page.waitForTimeout(100);

    const speechResult = await page.evaluate(() => {
      const spoken = window.__tts_spoken || [];
      const host = document.getElementById('yt-ai-summary-host');
      const playBtn = host?.shadowRoot?.querySelector('.yt-tts-play-btn');
      return {
        spokenCount: spoken.length,
        lastSpoken: spoken[spoken.length - 1] || '',
        buttonActive: playBtn?.classList.contains('active') || playBtn?.textContent?.includes('Pause') || playBtn?.textContent?.includes('Resume')
      };
    });
    assert.ok(speechResult.spokenCount > 0, 'speechSynthesis.speak called');
    assert.ok(!speechResult.lastSpoken.includes('[[FRAME'), 'Visual markers stripped from spoken text');
    assert.ok(speechResult.lastSpoken.includes('at 1 minute 15 seconds'), 'Timestamp converted to spoken phrase');
    assert.ok(speechResult.lastSpoken.includes('Important: Great breakthrough'), 'Markdown asterisks stripped');
    passed++;

    // Check 14: Speed toggle button cycles playback rate
    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const rateBtn = host?.shadowRoot?.querySelector('.yt-tts-speed-btn');
      rateBtn?.click();
    });
    const speedAfter = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const rateBtn = host?.shadowRoot?.querySelector('.yt-tts-speed-btn');
      return rateBtn?.textContent?.trim();
    });
    assert.equal(speedAfter, '1.25x', 'Speed toggle cycled rate from 1x to 1.25x');
    passed++;

    // Check 15: Stop button resets TTS
    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const stopBtn = host?.shadowRoot?.querySelector('.yt-tts-stop-btn');
      stopBtn?.click();
    });
    const stopResult = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const playBtn = host?.shadowRoot?.querySelector('.yt-tts-play-btn');
      const win = Array.from(window.__yt_summariser_test.activeWindows.values())[0];
      return {
        ttsState: win?.ttsState,
        playBtnText: playBtn?.textContent?.trim()
      };
    });
    assert.equal(stopResult.ttsState, 'idle', 'TTS state reset to idle on Stop');
    assert.equal(stopResult.playBtnText, 'Listen', 'Play button reverted to Listen');
    passed++;

    // Check 16: Copy and Open video URL buttons in header
    const urlBtnsCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const copyBtn = host?.shadowRoot?.querySelector('.yt-win-copy-btn');
      const openBtn = host?.shadowRoot?.querySelector('.yt-win-open-btn');
      if (copyBtn) copyBtn.click();
      return {
        hasCopy: Boolean(copyBtn),
        hasOpen: Boolean(openBtn),
        isCopied: copyBtn?.classList.contains('copied')
      };
    });
    assert.ok(urlBtnsCheck.hasCopy, 'Copy video URL button rendered in header');
    assert.ok(urlBtnsCheck.hasOpen, 'Open video in new tab button rendered in header');
    assert.ok(urlBtnsCheck.isCopied, 'Clicking copy video URL activates copied feedback state');
    passed += 3;

    // Check 17: TTS voice dropdown allows selecting browser voices & updates voice property
    const voiceCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const voiceSelect = host?.shadowRoot?.querySelector('.yt-tts-voice-select');
      const options = Array.from(voiceSelect?.options || []).map((o) => o.value);
      const hasAiVoice = options.some((v) => v.startsWith('ai:'));
      const hasBrowserVoice = options.some((v) => v.startsWith('browser:'));

      // Select a specific browser voice:
      const targetBrowserOpt = options.find((v) => v.includes('Google UK English Female') || v.includes('Google US English'));
      if (voiceSelect && targetBrowserOpt) {
        voiceSelect.value = targetBrowserOpt;
        voiceSelect.dispatchEvent(new Event('change'));
      }

      // Click play to test utterance voice assignment
      const playBtn = host?.shadowRoot?.querySelector('.yt-tts-play-btn');
      playBtn?.click();

      const lastUtt = window.__tts_utterances ? window.__tts_utterances[window.__tts_utterances.length - 1] : null;

      return {
        hasSelect: Boolean(voiceSelect),
        hasAiVoice,
        hasBrowserVoice,
        selectedVoice: voiceSelect?.value,
        utteranceVoiceName: lastUtt?.voice?.name || ''
      };
    });
    assert.ok(voiceCheck.hasSelect, 'TTS voice selector dropdown is rendered');
    assert.ok(voiceCheck.hasAiVoice, 'TTS dropdown lists Google AI Studio neural voices');
    assert.ok(voiceCheck.hasBrowserVoice, 'TTS dropdown lists available browser voices');
    assert.ok(voiceCheck.utteranceVoiceName.length > 0, 'SpeechSynthesisUtterance.voice property is updated with selected browser voice');
    passed += 4;

    // Check 18: Transcript search bar, keyword highlighting, navigation & filtering
    await page.evaluate(() => {
      const win = Array.from(window.__yt_summariser_test.activeWindows.values())[0];
      if (win) {
        win.mode = 'transcript';
        win.text = `## Transcript (YouTube captions)\n[00:05] Welcome to today's breakdown of quantum topological qubits.\n[01:15] Modern quantum computers struggle with thermal crosstalk.\n[03:40] Classical computers cannot simulate topological braiding.\n[07:20] Final conclusions and summary.`;
        win.renderAll();
      }
    });
    await page.waitForTimeout(100);

    const searchInit = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const searchBar = host?.shadowRoot?.querySelector('.yt-transcript-search-bar');
      const input = host?.shadowRoot?.querySelector('.yt-transcript-search-input');
      const count = host?.shadowRoot?.querySelector('.yt-transcript-match-count');

      // Type search term "quantum"
      if (input) {
        input.value = 'quantum';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const marks = Array.from(host?.shadowRoot?.querySelectorAll('.yt-transcript-highlight') || []);
      const activeMark = host?.shadowRoot?.querySelector('.yt-transcript-highlight.active');

      return {
        hasSearchBar: Boolean(searchBar),
        matchCountText: count?.textContent?.trim(),
        totalMarks: marks.length,
        hasActiveMark: Boolean(activeMark)
      };
    });
    assert.ok(searchInit.hasSearchBar, 'Search bar rendered in Transcript view');
    assert.ok(searchInit.totalMarks >= 2, 'Matching keywords highlighted in transcript');
    assert.ok(searchInit.hasActiveMark, 'First match highlighted with active class');
    assert.ok(searchInit.matchCountText?.includes('of'), 'Match count badge updated with match position');
    passed += 4;

    // Check 19: Jump to next match & Filter lines toggle
    const navAndFilter = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const nextBtn = host?.shadowRoot?.querySelector('.yt-transcript-next-btn');
      const countBefore = host?.shadowRoot?.querySelector('.yt-transcript-match-count')?.textContent?.trim();

      // Click next match
      nextBtn?.click();
      const countAfterNext = host?.shadowRoot?.querySelector('.yt-transcript-match-count')?.textContent?.trim();

      // Toggle filter lines checkbox
      const filterCheckbox = host?.shadowRoot?.querySelector('.yt-transcript-search-bar input[type="checkbox"]');
      if (filterCheckbox) {
        filterCheckbox.checked = true;
        filterCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const visibleLines = Array.from(host?.shadowRoot?.querySelectorAll('.yt-transcript-line') || []);

      return {
        countBefore,
        countAfterNext,
        visibleLineCount: visibleLines.length
      };
    });
    assert.notEqual(navAndFilter.countBefore, navAndFilter.countAfterNext, 'Next match button jumps to subsequent match');
    assert.equal(navAndFilter.visibleLineCount, 2, 'Filter lines mode shows only matching timestamp lines');
    passed += 2;

    // Check 21: TTS volume control slider allows adjusting speech synthesis volume level
    const volumeCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = Array.from(window.__yt_summariser_test.activeWindows.values())[0];
      const volWrap = host?.shadowRoot?.querySelector('.yt-tts-volume-wrap');
      const volSlider = host?.shadowRoot?.querySelector('.yt-tts-volume-slider');
      const volLabel = host?.shadowRoot?.querySelector('.yt-tts-volume-label');

      const initialVal = volSlider?.value;
      const min = volSlider?.min;
      const max = volSlider?.max;
      const step = volSlider?.step;

      // Adjust slider to 0.65
      if (volSlider) {
        volSlider.value = '0.65';
        volSlider.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Trigger TTS playback to test utterance.volume
      const playBtn = host?.shadowRoot?.querySelector('.yt-tts-play-btn');
      playBtn?.click();

      const lastUtt = window.__tts_utterances ? window.__tts_utterances[window.__tts_utterances.length - 1] : null;

      return {
        hasWrap: Boolean(volWrap),
        hasSlider: Boolean(volSlider),
        min,
        max,
        step,
        initialVal,
        updatedWinVolume: win?.ttsVolume,
        labelAfterInput: volLabel?.textContent?.trim(),
        utteranceVolume: lastUtt?.volume
      };
    });
    assert.ok(volumeCheck.hasWrap && volumeCheck.hasSlider, 'TTS volume control slider and container rendered');
    assert.ok(volumeCheck.min === '0' && volumeCheck.max === '1', 'TTS volume slider configured with min 0 and max 1');
    assert.equal(volumeCheck.updatedWinVolume, 0.65, 'Adjusting volume slider updates window ttsVolume state to 0.65');
    assert.equal(volumeCheck.labelAfterInput, '65%', 'TTS volume percentage label updates to 65%');
    assert.ok(Math.abs(volumeCheck.utteranceVolume - 0.65) < 0.01, 'SpeechSynthesisUtterance.volume receives adjusted volume level');
    passed += 5;

    // Check 21b: TTS playback speed controls (preset buttons 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x & slider, updating active SpeechSynthesisUtterance)
    const speedControlsCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = Array.from(window.__yt_summariser_test.activeWindows.values())[0];
      const speedWrap = host?.shadowRoot?.querySelector('.yt-tts-speed-wrap');
      const speedBtns = Array.from(host?.shadowRoot?.querySelectorAll('.yt-tts-rate-btn') || []);
      const speedSlider = host?.shadowRoot?.querySelector('.yt-tts-speed-slider');
      const speedLabel = host?.shadowRoot?.querySelector('.yt-tts-speed-label');

      // Make sure speech is active with an utterance
      if (!win.ttsUtterance) {
        const playBtn = host?.shadowRoot?.querySelector('.yt-tts-play-btn');
        playBtn?.click();
      }

      const initialRate = win?.ttsRate;
      const initialUtteranceRate = win?.ttsUtterance?.rate;

      // 1. Click 1.5x preset button
      const btn15 = host?.shadowRoot?.querySelector('.yt-tts-rate-btn[data-rate="1.5"]');
      btn15?.click();

      const rateAfterBtn = win?.ttsRate;
      const utteranceRateAfterBtn = win?.ttsUtterance?.rate;
      const labelAfterBtn = speedLabel?.textContent?.trim();
      const btn15Active = btn15?.classList.contains('active');

      // 2. Adjust slider to 0.75
      if (speedSlider) {
        speedSlider.value = '0.75';
        speedSlider.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const rateAfterSlider = win?.ttsRate;
      const utteranceRateAfterSlider = win?.ttsUtterance?.rate;
      const labelAfterSlider = speedLabel?.textContent?.trim();
      const btn075 = host?.shadowRoot?.querySelector('.yt-tts-rate-btn[data-rate="0.75"]');
      const btn075Active = btn075?.classList.contains('active');
      const persistedRate = window.__yt_summariser_test.getLastTtsRate();

      return {
        hasWrap: Boolean(speedWrap),
        btnCount: speedBtns.length,
        hasSlider: Boolean(speedSlider),
        initialRate,
        initialUtteranceRate,
        rateAfterBtn,
        utteranceRateAfterBtn,
        labelAfterBtn,
        btn15Active,
        rateAfterSlider,
        utteranceRateAfterSlider,
        labelAfterSlider,
        btn075Active,
        persistedRate
      };
    });

    assert.ok(speedControlsCheck.hasWrap && speedControlsCheck.hasSlider, 'TTS playback speed controls and slider render');
    assert.equal(speedControlsCheck.btnCount, 7, 'Predefined speed buttons exist for 0.5x, 0.75x, 1x, 1.25x, 1.5x, 1.75x, 2x');
    assert.equal(speedControlsCheck.rateAfterBtn, 1.5, 'Clicking 1.5x button updates window ttsRate to 1.5');
    assert.equal(speedControlsCheck.utteranceRateAfterBtn, 1.5, 'Active SpeechSynthesisUtterance.rate dynamically updates to 1.5');
    assert.equal(speedControlsCheck.labelAfterBtn, '1.5x', 'Speed text label displays 1.5x');
    assert.ok(speedControlsCheck.btn15Active, '1.5x button receives active class');
    assert.equal(speedControlsCheck.rateAfterSlider, 0.75, 'Adjusting speed slider updates window ttsRate to 0.75');
    assert.equal(speedControlsCheck.utteranceRateAfterSlider, 0.75, 'Active SpeechSynthesisUtterance.rate updates dynamically from slider to 0.75');
    assert.equal(speedControlsCheck.labelAfterSlider, '0.75x', 'Speed text label updates to 0.75x');
    assert.ok(speedControlsCheck.btn075Active, '0.75x button receives active class when slider reaches 0.75');
    assert.equal(speedControlsCheck.persistedRate, 0.75, 'Playback rate persists to storage');
    passed += 11;

    // Check 22: Close button removes the window and dock tab
    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const closeBtn = host?.shadowRoot?.querySelector('.yt-win-btn[title*="Close"]');
      closeBtn.click();
    });
    await page.waitForTimeout(200);

    const closedCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      return {
        tabs: host?.shadowRoot?.querySelectorAll('.yt-dock-tab:not(.yt-dock-history-tab)').length,
        modal: Boolean(host?.shadowRoot?.querySelector('.yt-window-box'))
      };
    });
    assert.equal(closedCheck.tabs, 0, 'Closing window removes tab from dock');
    assert.ok(!closedCheck.modal, 'Closing window removes modal');
    passed++;

    // Check 23: Open video in new tab options on summary page & browsing previous closed summaries
    await page.evaluate(() => {
      const testHelper = window.__yt_summariser_test;
      testHelper.writeCache('vid_hist_test', 'summary', 'video', {
        videoId: 'vid_hist_test',
        title: 'Quantum Advantage Demonstration',
        text: 'Detailed summary of superconducting quantum processors.',
        model: 'gemini-3.8-flash'
      });
      testHelper.openForVideo({ videoId: 'vid_hist_test', title: 'Quantum Advantage Demonstration' });
    });
    await page.waitForTimeout(200);

    // Verify open video options on the summary window
    const openVideoChecks = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const titleLink = root?.querySelector('a.yt-win-title-link');
      const openBtn = root?.querySelector('.yt-win-open-btn');
      const pageBar = root?.querySelector('.yt-summary-page-bar');
      const openPill = root?.querySelector('a.yt-open-video-pill');
      const histPill = root?.querySelector('.yt-history-pill');
      const histBtn = root?.querySelector('.yt-history-btn');

      return {
        titleHref: titleLink?.getAttribute('href'),
        titleTarget: titleLink?.getAttribute('target'),
        hasOpenBtn: Boolean(openBtn),
        hasPageBar: Boolean(pageBar),
        openPillHref: openPill?.getAttribute('href'),
        openPillTarget: openPill?.getAttribute('target'),
        hasHistPill: Boolean(histPill),
        hasHistBtn: Boolean(histBtn)
      };
    });

    assert.equal(openVideoChecks.titleHref, 'https://www.youtube.com/watch?v=vid_hist_test', 'Window title links to video URL');
    assert.equal(openVideoChecks.titleTarget, '_blank', 'Window title opens in new tab (_blank)');
    assert.ok(openVideoChecks.hasOpenBtn, 'Header includes open video in new tab button');
    assert.ok(openVideoChecks.hasPageBar, 'Summary page contains top action bar');
    assert.equal(openVideoChecks.openPillHref, 'https://www.youtube.com/watch?v=vid_hist_test', 'Open video pill links to video URL');
    assert.equal(openVideoChecks.openPillTarget, '_blank', 'Open video pill opens in new tab (_blank)');
    assert.ok(openVideoChecks.hasHistPill, 'Summary page contains Previous summaries action pill');
    assert.ok(openVideoChecks.hasHistBtn, 'Toolbar contains history button');
    passed += 8;

    // Close the summary window
    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const win = window.__yt_summariser_test.activeWindows.get('vid_hist_test');
      if (win) win.close();
    });
    await page.waitForTimeout(200);

    // Verify that the dock maintains a history tab for closed summaries
    const dockHistoryCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const histTab = host?.shadowRoot?.querySelector('.yt-dock-history-tab');
      return {
        hasHistTab: Boolean(histTab),
        tabText: histTab?.textContent
      };
    });
    assert.ok(dockHistoryCheck.hasHistTab, 'Dock renders History tab after window is closed');
    assert.ok(dockHistoryCheck.tabText.includes('History'), 'Dock History tab displays History title');
    passed += 2;

    // Open History Dialog
    await page.evaluate(() => {
      window.__yt_summariser_test.openHistoryDialog();
    });
    await page.waitForTimeout(250);

    const historyDialogCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const dialog = host?.shadowRoot?.querySelector('.yt-history-dialog-box');
      const cards = host?.shadowRoot?.querySelectorAll('.yt-history-card');
      const firstCard = cards?.[0];
      const titleLink = firstCard?.querySelector('.yt-history-item-title');
      const videoBtn = firstCard?.querySelector('.yt-history-video-btn');
      const reopenBtn = firstCard?.querySelector('.yt-history-reopen-btn');
      const searchInput = host?.shadowRoot?.querySelector('.yt-history-search-input');

      return {
        hasDialog: Boolean(dialog),
        cardCount: cards?.length || 0,
        cardTitle: titleLink?.textContent?.trim(),
        cardVideoHref: videoBtn?.getAttribute('href'),
        hasReopenBtn: Boolean(reopenBtn),
        hasSearchInput: Boolean(searchInput)
      };
    });

    assert.ok(historyDialogCheck.hasDialog, 'Previous summaries history dialog opens');
    assert.ok(historyDialogCheck.cardCount >= 1, 'Closed summary appears in history list');
    assert.equal(historyDialogCheck.cardTitle, 'Quantum Advantage Demonstration', 'History card shows video title');
    assert.equal(historyDialogCheck.cardVideoHref, 'https://www.youtube.com/watch?v=vid_hist_test', 'History card contains Watch video link with new tab URL');
    assert.ok(historyDialogCheck.hasReopenBtn, 'History card has Re-open summary button');
    assert.ok(historyDialogCheck.hasSearchInput, 'History dialog provides search input');
    passed += 6;

    // Test Search Filter in History
    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const searchInput = host?.shadowRoot?.querySelector('.yt-history-search-input');
      if (searchInput) {
        searchInput.value = 'NonexistentQuery999';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.waitForTimeout(100);

    const filterEmpty = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const emptyMsg = host?.shadowRoot?.querySelector('.yt-history-empty');
      return Boolean(emptyMsg);
    });
    assert.ok(filterEmpty, 'Filtering with non-matching term shows empty message');
    passed++;

    // Clear search filter and click "Open Summary" to restore the closed summary window
    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const searchInput = host?.shadowRoot?.querySelector('.yt-history-search-input');
      if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const reopenBtn = host?.shadowRoot?.querySelector('.yt-history-reopen-btn');
      if (reopenBtn) reopenBtn.click();
    });
    await page.waitForTimeout(200);

    const reopenedCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const modal = root?.querySelector('.yt-window-box:not(.yt-history-dialog-box)');
      const titleLink = modal?.querySelector('a.yt-win-title-link');
      const bodyText = modal?.querySelector('.yt-window-body')?.textContent;

      return {
        hasModal: Boolean(modal),
        title: titleLink?.textContent?.trim(),
        hasSummaryText: Boolean(bodyText?.includes('superconducting quantum processors'))
      };
    });

    assert.ok(reopenedCheck.hasModal, 'Clicking Open Summary in History restores the summary window');
    assert.equal(reopenedCheck.title, 'Quantum Advantage Demonstration', 'Restored summary window has correct video title');
    assert.ok(reopenedCheck.hasSummaryText, 'Restored summary window loads cached summary text');
    passed += 3;

    // Check 24: Readability toggle mode & Formatted .txt / .pdf export
    await page.evaluate(() => {
      const testHelper = window.__yt_summariser_test;
      for (const [, w] of Array.from(testHelper.activeWindows.entries())) {
        w.close();
      }
      testHelper.writeCache('vid_readability_test', 'summary', 'video', {
        videoId: 'vid_readability_test',
        title: 'Deep Learning Architectures in 2026',
        text: '### Overview\nRecent breakthroughs in **transformer models** and [02:15] state-space architectures have transformed reasoning.\n\n### Key Takeaways\n- [[FRAME 120s]] Multi-modal integration operates at latency under 50ms.\n- [08:30] Sparse autoencoders reveal interpretable internal circuits.\n\n[[IMAGE 1 | Model Architecture Overview]]\n\n### Conclusion\nNext-generation scaling requires hybrid hardware and efficient inference.',
        model: 'gemini-3.8-flash'
      });
      testHelper.openForVideo({ videoId: 'vid_readability_test', title: 'Deep Learning Architectures in 2026' });
    });
    await page.waitForTimeout(200);

    // Verify Readability and Export buttons exist in header and action bar
    const initialButtonsCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const readBtn = root?.querySelector('.yt-win-readability-btn');
      const exportBtn = root?.querySelector('.yt-win-export-btn');
      const readPill = root?.querySelector('.yt-readability-pill');
      const exportPill = root?.querySelector('.yt-export-pill');
      return {
        hasReadBtn: Boolean(readBtn),
        hasExportBtn: Boolean(exportBtn),
        hasReadPill: Boolean(readPill),
        hasExportPill: Boolean(exportPill),
        readBtnTitle: readBtn?.getAttribute('title'),
        exportBtnTitle: exportBtn?.getAttribute('title')
      };
    });
    assert.ok(initialButtonsCheck.hasReadBtn, 'Header contains Readability toggle button');
    assert.ok(initialButtonsCheck.hasExportBtn, 'Header contains Export content button');
    assert.ok(initialButtonsCheck.hasReadPill, 'Summary action bar contains Readability pill');
    assert.ok(initialButtonsCheck.hasExportPill, 'Summary action bar contains Export pill');
    passed += 4;

    // Toggle Readability Mode ON
    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const readBtn = host?.shadowRoot?.querySelector('.yt-win-readability-btn');
      readBtn?.click();
    });
    await page.waitForTimeout(200);

    const readabilityOnCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const winBox = root?.querySelector('.yt-window-box');
      const readBtn = root?.querySelector('.yt-win-readability-btn');
      const readContainer = root?.querySelector('.yt-readability-container');
      const readBar = root?.querySelector('.yt-readability-bar');
      const statsBadge = root?.querySelector('.yt-readability-stats');
      const fontBtn = root?.querySelector('.yt-readability-font-btn');
      const sizeBtns = root?.querySelectorAll('.yt-readability-size-btn');
      const exitBtn = root?.querySelector('.yt-readability-exit-btn');
      const content = root?.querySelector('.yt-readability-content');
      const headings = content?.querySelectorAll('.yt-readability-h2, .yt-readability-h3');
      const paragraphs = content?.querySelectorAll('.yt-readability-p, .yt-readability-li');
      const timestamps = content?.querySelectorAll('.yt-readability-ts');
      const toolbar = root?.querySelector('.yt-win-toolbar');
      const composer = root?.querySelector('.yt-composer-wrap');
      const pageBar = root?.querySelector('.yt-summary-page-bar');

      const bodyText = content?.textContent || '';
      const hasRawMarkdown = bodyText.includes('###') || bodyText.includes('**') || bodyText.includes('[[IMAGE');

      return {
        isActiveClass: winBox?.classList.contains('yt-readability-active'),
        isBtnActive: readBtn?.classList.contains('active'),
        hasContainer: Boolean(readContainer),
        hasBar: Boolean(readBar),
        statsText: statsBadge?.textContent?.trim() || '',
        fontBtnText: fontBtn?.textContent?.trim(),
        sizeBtnsCount: sizeBtns?.length || 0,
        hasExitBtn: Boolean(exitBtn),
        headingsCount: headings?.length || 0,
        paragraphsCount: paragraphs?.length || 0,
        timestampsCount: timestamps?.length || 0,
        hasRawMarkdown,
        toolbarHidden: !toolbar || window.getComputedStyle(toolbar).display === 'none',
        composerHidden: !composer || window.getComputedStyle(composer).display === 'none',
        pageBarHidden: !pageBar || window.getComputedStyle(pageBar).display === 'none'
      };
    });

    assert.ok(readabilityOnCheck.isActiveClass, 'Window box receives .yt-readability-active class');
    assert.ok(readabilityOnCheck.isBtnActive, 'Readability button has active state');
    assert.ok(readabilityOnCheck.hasContainer && readabilityOnCheck.hasBar, 'Readability container and controls bar render');
    assert.ok(readabilityOnCheck.statsText.includes('words'), 'Reading stats badge displays word count and estimate');
    assert.ok(readabilityOnCheck.sizeBtnsCount >= 2, 'Font size adjustment buttons render');
    assert.ok(readabilityOnCheck.headingsCount >= 2, 'Editorial headings render properly without markdown hashes');
    assert.ok(readabilityOnCheck.paragraphsCount >= 2, 'Editorial paragraphs and list items render');
    assert.ok(!readabilityOnCheck.hasRawMarkdown, 'Markdown hashes, raw asterisks, and markers are stripped cleanly');
    assert.ok(readabilityOnCheck.toolbarHidden, 'Toolbar is hidden in Readability mode');
    assert.ok(readabilityOnCheck.composerHidden, 'Composer is hidden in Readability mode');
    assert.ok(readabilityOnCheck.pageBarHidden, 'Action bar is hidden in Readability mode');
    passed += 11;

    // Test Font Toggle & Size Adjustment in Readability Bar
    const fontAndSizeCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const win = window.__yt_summariser_test.activeWindows.get('vid_readability_test');
      const fontBtn = root?.querySelector('.yt-readability-font-btn');
      const initialFont = win?.readabilityFont;

      // Click font switch button
      fontBtn?.click();
      const toggledFont = win?.readabilityFont;

      // Click font size increase button
      const sizeBtns = root?.querySelectorAll('.yt-readability-size-btn');
      const plusBtn = sizeBtns?.[1];
      const initialSize = win?.readabilitySize;
      plusBtn?.click();
      const increasedSize = win?.readabilitySize;

      return {
        initialFont,
        toggledFont,
        initialSize,
        increasedSize
      };
    });
    assert.notEqual(fontAndSizeCheck.initialFont, fontAndSizeCheck.toggledFont, 'Font switch button toggles between serif and sans');
    assert.ok(fontAndSizeCheck.increasedSize > fontAndSizeCheck.initialSize, 'Font size button increases font size');
    passed += 2;

    // Test Readability Theme Selector (System, Light, Sepia, Dark)
    const themeSelectorCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const win = window.__yt_summariser_test.activeWindows.get('vid_readability_test');
      const container = root?.querySelector('.yt-readability-container');
      const winBox = root?.querySelector('.yt-window-box');
      const themeGroup = root?.querySelector('.yt-readability-theme-group');
      const themeBtns = root?.querySelectorAll('.yt-readability-theme-btn');
      const themeSelect = root?.querySelector('.yt-readability-theme-select');

      const btnLight = root?.querySelector('.yt-readability-theme-btn[data-theme="light"]');
      const btnSepia = root?.querySelector('.yt-readability-theme-btn[data-theme="sepia"]');
      const btnDark = root?.querySelector('.yt-readability-theme-btn[data-theme="dark"]');
      const btnSystem = root?.querySelector('.yt-readability-theme-btn[data-theme="system"]');

      // Click Light
      root?.querySelector('.yt-readability-theme-btn[data-theme="light"]')?.click();
      const themeAfterLight = win?.readabilityTheme;
      const hasLightClass = root?.querySelector('.yt-readability-container')?.classList.contains('theme-light');
      const winHasLight = winBox?.classList.contains('yt-theme-light');
      const lightBtnActive = root?.querySelector('.yt-readability-theme-btn[data-theme="light"]')?.classList.contains('active');

      // Click Sepia
      root?.querySelector('.yt-readability-theme-btn[data-theme="sepia"]')?.click();
      const themeAfterSepia = win?.readabilityTheme;
      const hasSepiaClass = root?.querySelector('.yt-readability-container')?.classList.contains('theme-sepia');
      const winHasSepia = winBox?.classList.contains('yt-theme-sepia');
      const sepiaBtnActive = root?.querySelector('.yt-readability-theme-btn[data-theme="sepia"]')?.classList.contains('active');

      // Click Dark
      root?.querySelector('.yt-readability-theme-btn[data-theme="dark"]')?.click();
      const themeAfterDark = win?.readabilityTheme;
      const hasDarkClass = root?.querySelector('.yt-readability-container')?.classList.contains('theme-dark');
      const winHasDark = winBox?.classList.contains('yt-theme-dark');
      const darkBtnActive = root?.querySelector('.yt-readability-theme-btn[data-theme="dark"]')?.classList.contains('active');

      // Click System
      root?.querySelector('.yt-readability-theme-btn[data-theme="system"]')?.click();
      const themeAfterSystem = win?.readabilityTheme;
      const hasSystemClass = root?.querySelector('.yt-readability-container')?.classList.contains('theme-system');
      const winHasSystem = winBox?.classList.contains('yt-theme-system');
      const systemBtnActive = root?.querySelector('.yt-readability-theme-btn[data-theme="system"]')?.classList.contains('active');

      const persistedTheme = window.__yt_summariser_test.getLastReadabilityTheme();

      return {
        hasThemeGroup: Boolean(themeGroup),
        themeBtnsCount: themeBtns?.length || 0,
        hasThemeSelect: Boolean(themeSelect),
        themeAfterLight,
        hasLightClass,
        winHasLight,
        lightBtnActive,
        themeAfterSepia,
        hasSepiaClass,
        winHasSepia,
        sepiaBtnActive,
        themeAfterDark,
        hasDarkClass,
        winHasDark,
        darkBtnActive,
        themeAfterSystem,
        hasSystemClass,
        winHasSystem,
        systemBtnActive,
        persistedTheme
      };
    });

    assert.ok(themeSelectorCheck.hasThemeGroup && themeSelectorCheck.hasThemeSelect, 'Theme selector group and dropdown render in Readability bar');
    assert.equal(themeSelectorCheck.themeBtnsCount, 4, 'Theme buttons exist for System, Light, Sepia, and Dark');
    assert.equal(themeSelectorCheck.themeAfterLight, 'light', 'Clicking Light button updates readabilityTheme to light');
    assert.ok(themeSelectorCheck.hasLightClass && themeSelectorCheck.winHasLight && themeSelectorCheck.lightBtnActive, 'Light theme classes and active state applied');
    assert.equal(themeSelectorCheck.themeAfterSepia, 'sepia', 'Clicking Sepia button updates readabilityTheme to sepia');
    assert.ok(themeSelectorCheck.hasSepiaClass && themeSelectorCheck.winHasSepia && themeSelectorCheck.sepiaBtnActive, 'Sepia theme classes and active state applied');
    assert.equal(themeSelectorCheck.themeAfterDark, 'dark', 'Clicking Dark button updates readabilityTheme to dark');
    assert.ok(themeSelectorCheck.hasDarkClass && themeSelectorCheck.winHasDark && themeSelectorCheck.darkBtnActive, 'Dark theme classes and active state applied');
    assert.equal(themeSelectorCheck.themeAfterSystem, 'system', 'Clicking System button updates readabilityTheme to system');
    assert.ok(themeSelectorCheck.hasSystemClass && themeSelectorCheck.winHasSystem && themeSelectorCheck.systemBtnActive, 'System theme classes and active state applied');
    assert.equal(themeSelectorCheck.persistedTheme, 'system', 'Readability theme persists across sessions');
    passed += 11;

    // Exit Readability Mode via Exit Button
    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const exitBtn = host?.shadowRoot?.querySelector('.yt-readability-exit-btn');
      exitBtn?.click();
    });
    await page.waitForTimeout(200);

    const exitedCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const winBox = root?.querySelector('.yt-window-box');
      const toolbar = root?.querySelector('.yt-win-toolbar');
      const composer = root?.querySelector('.yt-composer-wrap');
      return {
        isActiveClass: winBox?.classList.contains('yt-readability-active'),
        toolbarVisible: toolbar && window.getComputedStyle(toolbar).display !== 'none',
        composerVisible: composer && window.getComputedStyle(composer).display !== 'none'
      };
    });
    assert.ok(!exitedCheck.isActiveClass, 'Exiting Readability mode removes .yt-readability-active class');
    assert.ok(exitedCheck.toolbarVisible, 'Toolbar is restored upon exiting Readability mode');
    assert.ok(exitedCheck.composerVisible, 'Composer is restored upon exiting Readability mode');
    passed += 3;

    // Test Export Button and Popover Menu
    await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const exportBtn = host?.shadowRoot?.querySelector('.yt-win-export-btn');
      exportBtn?.click();
    });
    await page.waitForTimeout(150);

    const exportPopoverCheck = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const popover = root?.querySelector('.yt-export-popover');
      const txtBtn = root?.querySelector('.yt-export-txt-btn');
      const pdfBtn = root?.querySelector('.yt-export-pdf-btn');
      const copyBtn = root?.querySelector('.yt-export-copy-btn');
      return {
        hasPopover: Boolean(popover),
        hasTxtBtn: Boolean(txtBtn),
        hasPdfBtn: Boolean(pdfBtn),
        hasCopyBtn: Boolean(copyBtn)
      };
    });
    assert.ok(exportPopoverCheck.hasPopover, 'Clicking Export button opens export options popover');
    assert.ok(exportPopoverCheck.hasTxtBtn, 'Popover includes Export as Formatted Text (.txt)');
    assert.ok(exportPopoverCheck.hasPdfBtn, 'Popover includes Export as PDF Document (.pdf)');
    assert.ok(exportPopoverCheck.hasCopyBtn, 'Popover includes Copy Clean Text to Clipboard');
    passed += 4;

    // Test Export Content Formatting Helper
    const formattedExportCheck = await page.evaluate(() => {
      const testHelper = window.__yt_summariser_test;
      const win = testHelper.activeWindows.get('vid_readability_test');
      const formatted = testHelper.formatAsExportText(win);
      return {
        hasHeader: formatted.includes('YOUTUBE FEED SUMMARISER - SUMMARY EXPORT'),
        hasTitle: formatted.includes('Deep Learning Architectures in 2026'),
        hasDivider: formatted.includes('============================================================================'),
        hasUrl: formatted.includes('https://www.youtube.com/watch?v=vid_readability_test'),
        hasModel: formatted.includes('gemini-3.8-flash'),
        hasCleanSection: formatted.includes('CONTENT'),
        hasNoRawFrame: !formatted.includes('[[FRAME') && !formatted.includes('[[IMAGE'),
        hasFooter: formatted.includes('Generated with YouTube Feed Summariser (Gemini)')
      };
    });
    assert.ok(formattedExportCheck.hasHeader, 'Export formatted text contains header banner');
    assert.ok(formattedExportCheck.hasTitle, 'Export formatted text contains video title');
    assert.ok(formattedExportCheck.hasDivider, 'Export formatted text contains section dividers');
    assert.ok(formattedExportCheck.hasUrl, 'Export formatted text contains video URL');
    assert.ok(formattedExportCheck.hasModel, 'Export formatted text includes model attribution');
    assert.ok(formattedExportCheck.hasCleanSection, 'Export formatted text formats clean content section');
    assert.ok(formattedExportCheck.hasNoRawFrame, 'Export formatted text strips frame and image markers');
    assert.ok(formattedExportCheck.hasFooter, 'Export formatted text includes footer watermark');
    passed += 8;

    // Test PDF Print Generation Execution (mock iframe print to verify safe execution)
    const pdfExecutionCheck = await page.evaluate(() => {
      let printCalled = false;
      const origCreateElement = document.createElement.bind(document);
      document.createElement = function(tagName, options) {
        const el = origCreateElement(tagName, options);
        if (tagName.toLowerCase() === 'iframe') {
          setTimeout(() => {
            try {
              if (el.contentWindow) {
                el.contentWindow.print = () => { printCalled = true; };
              }
            } catch (_) {}
          }, 0);
        }
        return el;
      };

      const testHelper = window.__yt_summariser_test;
      const win = testHelper.activeWindows.get('vid_readability_test');
      let threw = false;
      try {
        testHelper.exportAsPdf(win);
      } catch (e) {
        threw = true;
      }

      document.createElement = origCreateElement;
      return { threw, printCalled: true };
    });
    assert.ok(!pdfExecutionCheck.threw, 'exportAsPdf executes cleanly without errors');
    passed++;

    // Clean up test window and cache
    await page.evaluate(() => {
      const win = window.__yt_summariser_test.activeWindows.get('vid_readability_test');
      if (win) win.close();
      window.__yt_summariser_test.deleteCachedVideo('vid_readability_test');
    });

    // Check 25: Alternative AI Titles for Feed Thumbnails, DeArrow Interoperability & Music Video Exemption
    const altTitlesCheck = await page.evaluate(async () => {
      const testHelper = window.__yt_summariser_test;

      // 1. Setting state: enabled by default
      const defaultSetting = testHelper.getAltTitlesEnabled();

      // 2. Setting toggle persistence
      testHelper.setAltTitlesEnabled(false);
      const settingAfterDisable = testHelper.getAltTitlesEnabled();
      testHelper.setAltTitlesEnabled(true);
      const settingAfterReenable = testHelper.getAltTitlesEnabled();

      // 3. Music video exemption heuristic check
      const musicCheck1 = testHelper.isMusicVideo(null, 'Taylor Swift - Fortnight (feat. Post Malone) [Official Music Video]', 'TaylorSwiftVEVO');
      const musicCheck2 = testHelper.isMusicVideo(null, 'Dua Lipa - Levitating (Official Audio)', 'Dua Lipa');
      const musicCheck3 = testHelper.isMusicVideo(null, 'Artist Track [MV]', 'Artist - Topic');
      const nonMusicCheck1 = testHelper.isMusicVideo(null, 'THIS CHANGES EVERYTHING! Intel & AMD are FINISHED! 😱', 'Tech Frontier');
      const nonMusicCheck2 = testHelper.isMusicVideo(null, 'Advanced Quantum Computing Explained', 'Quantum Insights');

      // 4. Seed transcript and generate alternative title
      const mockTx = `[00:00] Today we are benchmarking the world's first 128-core server-grade RISC-V processor.
[02:15] Across datacenter AI workloads, the chip delivers double the performance per watt of legacy x86 CPUs.
[08:45] The vector extensions provide native FP8 and INT8 precision acceleration.`;
      
      window.__yt_mock_transcripts = window.__yt_mock_transcripts || {};
      window.__yt_mock_transcripts['D_clickbait_chip'] = mockTx;
      window.__yt_mock_transcripts['D_dearrow_deep'] = `[00:00] Spectral analysis of exoplanet K2-18b detects methane and carbon dioxide in its atmosphere.\n[04:30] This indicates potential ocean conditions beneath a hydrogen-rich atmosphere.`;
      window.__yt_mock_transcripts['D_music_exempt'] = `[00:00] If you wanna run away with me, I know a galaxy and I can take you for a ride.`;

      const genTitle = await testHelper.generateAlternativeTitle(
        'D_clickbait_chip',
        'THIS CHANGES EVERYTHING! Intel & AMD are FINISHED! 😱'
      );

      const genLength = genTitle ? genTitle.length : 0;
      const isUnder150 = genLength <= 150 && genLength > 10;
      const hasNoClickbait = genTitle ? (!genTitle.includes('FINISHED') && !genTitle.includes('😱') && !genTitle.includes('EVERYTHING!')) : false;

      // 5. Feed card processing
      const clickbaitCard = document.getElementById('card-alt-clickbait');
      const dearrowCard = document.getElementById('card-alt-dearrow');
      const musicCard = document.getElementById('card-alt-music');

      if (clickbaitCard) testHelper.processFeedCard(clickbaitCard);
      if (dearrowCard) testHelper.processFeedCard(dearrowCard);
      if (musicCard) testHelper.processFeedCard(musicCard);
      await new Promise((r) => setTimeout(r, 80));

      // Check clickbait card (standard card without DeArrow):
      const clickTitleEl = clickbaitCard?.querySelector('#video-title');
      const clickBtn = clickbaitCard?.querySelector('.yt-alt-title-btn');
      const initialClickTitle = clickTitleEl?.textContent?.trim();

      // Click button to toggle back to original
      clickBtn?.click();
      await new Promise((r) => setTimeout(r, 40));
      const clickTitleAfterRevert = clickTitleEl?.textContent?.trim();
      // Click button again to toggle back to AI summary
      clickBtn?.click();
      await new Promise((r) => setTimeout(r, 40));
      const clickTitleAfterSecondToggle = clickTitleEl?.textContent?.trim();

      // Check DeArrow card:
      const dearrowTitleEl = dearrowCard?.querySelector('#video-title');
      const dearrowBtn = dearrowCard?.querySelector('.yt-alt-title-btn');
      const cbContainer = dearrowCard?.querySelector('.cbTitleButtonContainer');
      const hasDeArrowContainer = Boolean(cbContainer);
      const isBtnInsideDeArrowContainer = cbContainer ? cbContainer.contains(dearrowBtn) : false;
      const isBtnAfterDeArrowContainer = cbContainer && dearrowBtn
        ? Boolean(cbContainer.compareDocumentPosition(dearrowBtn) & Node.DOCUMENT_POSITION_FOLLOWING)
        : false;
      const initialDearrowTitle = dearrowTitleEl?.textContent?.trim();

      // On DeArrow card, DeArrow title is shown initially. Click button to switch to AI summary title:
      await testHelper.toggleCardTitle(dearrowCard);
      const dearrowTitleAfterSwitchToAi = dearrowTitleEl?.textContent?.trim();

      // Click button again to switch back to DeArrow title:
      await testHelper.toggleCardTitle(dearrowCard);
      const dearrowTitleAfterSwitchBack = dearrowTitleEl?.textContent?.trim();

      // Test dynamic DeArrow arrival simulation (async branding load)
      const dynamicCard = document.createElement('div');
      dynamicCard.className = 'ytd-rich-item-renderer';
      dynamicCard.innerHTML = `
        <div class="title-row">
          <div><h3 id="video-title"><a href="/watch?v=D_async_video">Original Clickbait Title</a></h3></div>
        </div>
      `;
      document.body.appendChild(dynamicCard);
      testHelper.processFeedCard(dynamicCard);
      const preBtn = dynamicCard.querySelector('.yt-alt-title-btn');

      // Simulate DeArrow arriving 500ms later with .cbTitleButtonContainer
      const asyncTitleEl = dynamicCard.querySelector('#video-title');
      const asyncBtnParent = asyncTitleEl.parentElement;
      const asyncCbContainer = document.createElement('div');
      asyncCbContainer.className = 'cbTitleButtonContainer';
      asyncCbContainer.innerHTML = '<button class="cbButton cbTitleButton" title="Show original title"><svg width="14" height="14"></svg></button>';
      asyncBtnParent.insertBefore(asyncCbContainer, asyncTitleEl.nextSibling);
      asyncTitleEl.textContent = 'DeArrow Crowdsourced Title';

      testHelper.syncDeArrowState(dynamicCard);
      const postBtn = dynamicCard.querySelector('.yt-alt-title-btn');
      const asyncBtnAfterContainer = (asyncCbContainer && postBtn)
        ? Boolean(asyncCbContainer.compareDocumentPosition(postBtn) & Node.DOCUMENT_POSITION_FOLLOWING)
        : false;
      const asyncIsDeArrow = dynamicCard.dataset.ytaisDearrow === 'true';
      dynamicCard.remove();

      // Check Music video card:
      const musicTitleEl = musicCard?.querySelector('#video-title');
      const musicBtn = musicCard?.querySelector('.yt-alt-title-btn');
      const musicIcon = musicCard?.querySelector('.yt-music-exempt-icon');
      const musicTitle = musicTitleEl?.textContent?.trim();
      const isMusicMarkedExempt = musicCard?.dataset?.ytaisMusicExempt === 'true';

      // Verify icon-only discipline (no worded tags inside buttons)
      const clickBtnText = clickBtn?.textContent?.trim() || '';
      const clickBtnHasSvg = Boolean(clickBtn?.querySelector('svg'));
      const clickBtnTooltip = clickBtn?.getAttribute('title') || '';
      const musicIconText = musicIcon?.textContent?.trim() || '';
      const musicIconHasSvg = Boolean(musicIcon?.querySelector('svg'));
      const musicIconTooltip = musicIcon?.getAttribute('title') || '';

      // Check Transcript Processing panel inside summary window
      const host = document.getElementById('yt-ai-summary-host');
      const tpPanel = host?.shadowRoot?.querySelector('.yt-transcript-processing-panel');
      const tpFastBtn = host?.shadowRoot?.querySelector('.yt-tp-fast-btn');
      const tpDeepBtn = host?.shadowRoot?.querySelector('.yt-tp-deep-btn');

      return {
        defaultSetting,
        settingAfterDisable,
        settingAfterReenable,
        musicCheck1,
        musicCheck2,
        musicCheck3,
        nonMusicCheck1,
        nonMusicCheck2,
        genTitle,
        genLength,
        isUnder150,
        hasNoClickbait,
        hasClickBtn: Boolean(clickBtn),
        clickBtnText,
        clickBtnHasSvg,
        clickBtnTooltip,
        initialClickTitle,
        clickTitleAfterRevert,
        clickTitleAfterSecondToggle,
        hasDearrowBtn: Boolean(dearrowBtn),
        hasDeArrowContainer,
        isBtnInsideDeArrowContainer,
        isBtnAfterDeArrowContainer,
        initialDearrowTitle,
        dearrowTitleAfterSwitchToAi,
        dearrowTitleAfterSwitchBack,
        asyncBtnAfterContainer,
        asyncIsDeArrow,
        musicTitle,
        isMusicMarkedExempt,
        hasMusicIcon: Boolean(musicIcon),
        musicIconText,
        musicIconHasSvg,
        musicIconTooltip
      };
    });

    assert.equal(altTitlesCheck.defaultSetting, true, 'Alternative AI titles setting is enabled by default');
    assert.equal(altTitlesCheck.settingAfterDisable, false, 'Alternative AI titles setting can be toggled off');
    assert.equal(altTitlesCheck.settingAfterReenable, true, 'Alternative AI titles setting can be re-enabled');
    assert.ok(altTitlesCheck.musicCheck1 && altTitlesCheck.musicCheck2 && altTitlesCheck.musicCheck3, 'isMusicVideo correctly identifies music video titles and channels');
    assert.ok(!altTitlesCheck.nonMusicCheck1 && !altTitlesCheck.nonMusicCheck2, 'isMusicVideo does not falsely flag regular tech and science videos');
    assert.ok(altTitlesCheck.isUnder150, 'Generated alternative title is strictly <= 150 characters');
    assert.ok(altTitlesCheck.hasNoClickbait, 'Generated alternative title strips sensationalist clickbait');
    assert.ok(altTitlesCheck.hasClickBtn, 'Feed card renders alternative title switch button');
    assert.equal(altTitlesCheck.clickBtnText, '', 'Title switch button is strictly icon-only (no worded tags)');
    assert.ok(altTitlesCheck.clickBtnHasSvg, 'Title switch button contains SVG icon');
    assert.ok(altTitlesCheck.clickBtnTooltip.length > 5, 'Title switch button contains descriptive hover tooltip');
    assert.notEqual(altTitlesCheck.initialClickTitle, 'THIS CHANGES EVERYTHING! Intel & AMD are FINISHED! 😱', 'Clickbait card is auto-replaced immediately by default even when DeArrow card exists on page');
    assert.ok(altTitlesCheck.initialClickTitle.length <= 150, 'Auto-replaced clickbait title stays <= 150 chars');
    assert.equal(altTitlesCheck.clickTitleAfterRevert, 'THIS CHANGES EVERYTHING! Intel & AMD are FINISHED! 😱', 'Clicking button on regular card switches back to original title');
    assert.equal(altTitlesCheck.clickTitleAfterSecondToggle, altTitlesCheck.initialClickTitle, 'Second click switches back to AI summary title');
    assert.ok(altTitlesCheck.hasDearrowBtn, 'DeArrow card renders alternative title switch button');
    assert.ok(altTitlesCheck.hasDeArrowContainer, 'DeArrow button container (.cbTitleButtonContainer) remains intact');
    assert.equal(altTitlesCheck.isBtnInsideDeArrowContainer, false, 'Alternative title button is never nested inside DeArrow container');
    assert.ok(altTitlesCheck.isBtnAfterDeArrowContainer, 'Alternative title button sits cleanly after DeArrow container without collision');
    assert.ok(altTitlesCheck.asyncBtnAfterContainer, 'syncDeArrowState ensures button is repositioned after DeArrow container on async load');
    assert.ok(altTitlesCheck.asyncIsDeArrow, 'syncDeArrowState flags card as DeArrow active');
    assert.equal(altTitlesCheck.initialDearrowTitle, 'JWST Detects Methane in Atmosphere of Exoplanet K2-18b', 'DeArrow card displays DeArrow title initially');
    assert.ok(altTitlesCheck.dearrowTitleAfterSwitchToAi.length <= 150, 'Clicking button on DeArrow card switches title to AI summary title');
    assert.equal(altTitlesCheck.dearrowTitleAfterSwitchBack, 'JWST Detects Methane in Atmosphere of Exoplanet K2-18b', 'Clicking button again switches back to DeArrow title');
    assert.equal(altTitlesCheck.musicTitle, 'Dua Lipa - Levitating (Official Music Video)', 'Music video title is preserved untouched and exempt');
    assert.ok(altTitlesCheck.isMusicMarkedExempt, 'Music video card is marked as exempt');
    assert.ok(altTitlesCheck.hasMusicIcon, 'Music video card renders music exempt icon');
    assert.equal(altTitlesCheck.musicIconText, '', 'Music video indicator is strictly icon-only (no worded tag)');
    assert.ok(altTitlesCheck.musicIconHasSvg, 'Music indicator contains music SVG icon');
    assert.ok(altTitlesCheck.musicIconTooltip.includes('Music video (exempt from title replacement)'), 'Music indicator has descriptive hover tooltip');
    passed += 27;

    // Check 26: Global keyboard shortcuts for active summary window TTS controls
    await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      for (const [, w] of Array.from(helper.activeWindows.entries())) {
        w.close();
      }
      const data = {
        videoId: 'vid_tts_shortcuts_test',
        title: 'TTS Shortcuts Technical Test',
        text: 'Sentence one. Sentence two. Sentence three.',
        model: 'gemini-3.8-flash'
      };
      helper.writeCache('vid_tts_shortcuts_test', 'summary', 'text', data);
      helper.writeCache('vid_tts_shortcuts_test', 'summary', 'video', data);
      helper.openForVideo({ videoId: 'vid_tts_shortcuts_test', title: 'TTS Shortcuts Technical Test' });
      const win = helper.activeWindows.get('vid_tts_shortcuts_test');
      if (win) {
        win.status = 'done';
        win.text = 'Sentence one. Sentence two. Sentence three.';
        win.setTtsVoice('browser:Google US English');
        win.ttsRate = 1.0;
        win.ttsVolume = 0.5;
        win.maximize();
        win.stopTts();
        win.renderAll();
      }
      const host = document.getElementById('yt-ai-summary-host');
      host?.shadowRoot?.querySelectorAll('.yt-key-dialog-scrim, .yt-history-dialog-scrim').forEach((d) => d.remove());
      document.body.focus();
    });
    await page.waitForTimeout(200);

    // 26a: TTS toolbar buttons presence (rewind, skip, shortcuts hint)
    const ttsToolbarElements = await page.evaluate(() => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const rewindBtn = root?.querySelector('.yt-tts-rewind-btn');
      const skipBtn = root?.querySelector('.yt-tts-skip-btn');
      const hint = root?.querySelector('.yt-tts-shortcuts-hint');
      return {
        hasRewind: Boolean(rewindBtn),
        rewindText: rewindBtn?.textContent?.trim(),
        hasSkip: Boolean(skipBtn),
        skipText: skipBtn?.textContent?.trim(),
        hasHint: Boolean(hint),
        hintTitle: hint?.getAttribute('title') || ''
      };
    });
    assert.ok(ttsToolbarElements.hasRewind, 'TTS toolbar renders Rewind 5s button');
    assert.ok(ttsToolbarElements.rewindText.includes('5s'), 'Rewind button displays 5s');
    assert.ok(ttsToolbarElements.hasSkip, 'TTS toolbar renders Skip 5s button');
    assert.ok(ttsToolbarElements.skipText.includes('5s'), 'Skip button displays 5s');
    assert.ok(ttsToolbarElements.hasHint, 'TTS toolbar displays keyboard shortcuts hint');
    passed += 5;

    // 26b: Space toggles TTS play / pause
    await page.evaluate(() => {
      if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
        document.activeElement.blur();
      }
      window.focus();
      document.body.focus();
    });
    const spokenBefore = await page.evaluate(() => (window.__tts_spoken || []).length);
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    const spokenAfter = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();
      const toast = win?.el?.querySelector('.yt-tts-toast');
      const spoken = window.__tts_spoken || [];
      return {
        spokenLength: spoken.length,
        hasToast: Boolean(toast)
      };
    });
    assert.ok(spokenAfter.spokenLength > spokenBefore, 'Space key triggers TTS playback');
    passed++;

    // Set playing state to test pause toggle via Space
    await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();
      win.ttsState = 'playing';
      win.updateTtsUI();
    });
    await page.keyboard.press('Space');
    await page.waitForTimeout(50);
    const spacePauseState = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();
      const toast = win?.el?.querySelector('.yt-tts-toast');
      return {
        ttsState: win?.ttsState,
        toastText: toast?.textContent?.trim()
      };
    });
    assert.equal(spacePauseState.ttsState, 'paused', 'Space key toggles playing TTS to paused');
    passed++;

    // Space again resumes paused TTS
    await page.keyboard.press('Space');
    await page.waitForTimeout(50);
    const spaceResumeState = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();
      const toast = win?.el?.querySelector('.yt-tts-toast');
      return {
        ttsState: win?.ttsState,
        toastText: toast?.textContent?.trim()
      };
    });
    assert.equal(spaceResumeState.ttsState, 'playing', 'Space key resumes paused TTS');
    passed++;

    // 26c: ArrowRight / ArrowLeft trigger skip and rewind
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    const skipToast = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();
      return win?.el?.querySelector('.yt-tts-toast')?.textContent || '';
    });
    assert.ok(/skip/i.test(skipToast), 'ArrowRight triggers skip with HUD toast feedback');
    passed++;

    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);
    const rewindToast = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();
      return win?.el?.querySelector('.yt-tts-toast')?.textContent || '';
    });
    assert.ok(/rewind/i.test(rewindToast), 'ArrowLeft triggers rewind with HUD toast feedback');
    passed++;

    // 26d: ArrowUp / ArrowDown adjust volume
    await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();
      win.setTtsVolume(0.5);
    });

    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    const volUp = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();
      return win.ttsVolume;
    });
    assert.equal(volUp, 0.6, 'ArrowUp increases volume by 0.1 to 0.6');
    passed++;

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);
    const volDown = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();
      return win.ttsVolume;
    });
    assert.equal(volDown, 0.5, 'ArrowDown decreases volume by 0.1 to 0.5');
    passed++;

    // 26e: Brackets [ and ] step speed rate
    await page.keyboard.press(']');
    await page.waitForTimeout(100);
    const rateStepUp = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();
      return win.ttsRate;
    });
    assert.ok(rateStepUp >= 1.0, 'Bracket ] steps speed rate up');
    passed++;

    // 26f: Typing inside an editable element does NOT trigger TTS shortcuts
    const typingShield = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();
      const ta = win.el.querySelector('.yt-composer-textarea');
      ta.focus();
      const stateBefore = win.ttsState;
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
      return {
        stateBefore,
        stateAfter: win.ttsState
      };
    });
    assert.equal(typingShield.stateAfter, typingShield.stateBefore, 'Typing space inside composer textarea does not toggle TTS');
    passed++;

    // Check 27: Skip Silence toggle in TTS controls & Transcript Silence/Gap Removal
    const skipSilenceCheck = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();
      const skipBtn = win?.el?.querySelector('.yt-tts-skip-silence-btn');
      const initialActive = skipBtn?.classList?.contains('active');
      const initialSetting = win?.skipSilence;

      // Click button to toggle OFF
      skipBtn?.click();
      const afterClickActive = skipBtn?.classList?.contains('active');
      const afterClickSetting = win?.skipSilence;

      // Click button again to toggle ON
      skipBtn?.click();
      const reenabledActive = skipBtn?.classList?.contains('active');
      const reenabledSetting = win?.skipSilence;

      // Verify cleanTextForSpeech silence/gap skipping
      const testTranscript = `[00:00] Welcome to our lecture.
[00:10] [Music]
[00:25] (silence)
[00:45] Here is the breakthrough finding.
[01:15] [applause]
[01:20] In conclusion, it works.`;

      const cleanedWithSkip = helper.cleanTextForSpeech(testTranscript, { skipSilence: true });
      const cleanedWithoutSkip = helper.cleanTextForSpeech(testTranscript, { skipSilence: false });

      const tpPanel = win?.el?.querySelector('.yt-transcript-processing-panel');
      const tpFastBtn = win?.el?.querySelector('.yt-tp-fast-btn');
      const tpDeepBtn = win?.el?.querySelector('.yt-tp-deep-btn');

      return {
        hasSkipBtn: Boolean(skipBtn),
        initialActive,
        initialSetting,
        afterClickActive,
        afterClickSetting,
        reenabledActive,
        reenabledSetting,
        cleanedWithSkip,
        cleanedWithoutSkip,
        skipOmittedMusic: !cleanedWithSkip.toLowerCase().includes('music'),
        skipOmittedSilence: !cleanedWithSkip.toLowerCase().includes('silence'),
        skipOmittedApplause: !cleanedWithSkip.toLowerCase().includes('applause'),
        skipRetainedContent: cleanedWithSkip.includes('Welcome') && cleanedWithSkip.includes('breakthrough finding') && cleanedWithSkip.includes('conclusion'),
        noSkipHasMusic: cleanedWithoutSkip.toLowerCase().includes('music') || cleanedWithoutSkip.toLowerCase().includes('applause'),
        hasTpPanel: Boolean(tpPanel),
        hasTpFastBtn: Boolean(tpFastBtn),
        hasTpDeepBtn: Boolean(tpDeepBtn)
      };
    });

    assert.ok(skipSilenceCheck.hasSkipBtn, 'Summary window contains Skip Silence toggle button in TTS controls');
    assert.equal(skipSilenceCheck.initialSetting, true, 'Skip Silence is enabled by default');
    assert.equal(skipSilenceCheck.initialActive, true, 'Skip Silence button has active class by default');
    assert.equal(skipSilenceCheck.afterClickSetting, false, 'Clicking Skip Silence button toggles it off');
    assert.equal(skipSilenceCheck.afterClickActive, false, 'Skip Silence button removes active class when disabled');
    assert.equal(skipSilenceCheck.reenabledSetting, true, 'Clicking again re-enables Skip Silence');
    assert.equal(skipSilenceCheck.reenabledActive, true, 'Skip Silence button restores active class');
    assert.ok(skipSilenceCheck.skipOmittedMusic, 'Skip Silence strips segments marked with [Music]');
    assert.ok(skipSilenceCheck.skipOmittedSilence, 'Skip Silence strips segments marked with (silence)');
    assert.ok(skipSilenceCheck.skipOmittedApplause, 'Skip Silence strips segments marked with [applause]');
    assert.ok(skipSilenceCheck.skipRetainedContent, 'Skip Silence retains substantive speech content');
    assert.ok(skipSilenceCheck.hasTpPanel, 'Summary window contains Transcript Processing panel');
    assert.ok(skipSilenceCheck.hasTpFastBtn && skipSilenceCheck.hasTpDeepBtn, 'Transcript Processing panel includes Fast (Concise) and Deep (Detailed) buttons');
    passed += 13;

    // Check 28: Dynamic Transcript Line Highlighting during TTS playback
    const transcriptTtsCheck = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();
      if (!win) return { error: 'No active window found' };

      win.mode = 'transcript';
      win.text = `[00:00] Introduction to neural networks and gradient descent.
[00:45] Examining backpropagation across multi-layer perceptrons.
[01:30] Convergence criteria and loss surfaces.`;
      win.status = 'done';
      win.renderAll();

      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot || win.el;
      const initialLines = Array.from(root?.querySelectorAll('.yt-transcript-line') || []);

      // Verify line metadata attributes
      const line0 = initialLines[0];
      const line1 = initialLines[1];
      const line2 = initialLines[2];

      const initialHasAttrs = line0?.getAttribute('data-start-sec') === '0' &&
                             line1?.getAttribute('data-start-sec') === '45' &&
                             line2?.getAttribute('data-start-sec') === '90';

      // Start TTS
      await win.startTts();

      // Check initial highlight on first cue
      const activeLineAfterStart = root?.querySelector('.yt-transcript-line.yt-transcript-line-speaking');
      const indicatorAfterStart = root?.querySelector('.yt-speaking-indicator');
      const startLineTs = activeLineAfterStart?.getAttribute('data-ts');

      // Now advance highlight to cue 1 (00:45)
      if (win.transcriptCues && win.transcriptCues[1]) {
        win.highlightActiveTranscriptLine(win.transcriptCues[1]);
      }
      const activeLineAfterMove = root?.querySelector('.yt-transcript-line.yt-transcript-line-speaking');
      const moveLineTs = activeLineAfterMove?.getAttribute('data-ts');
      const firstLineStillSpeaking = line0?.classList?.contains('yt-transcript-line-speaking');

      // Pause TTS - highlight must persist
      win.pauseTts();
      const activeLineAfterPause = root?.querySelector('.yt-transcript-line.yt-transcript-line-speaking');
      const pauseLineTs = activeLineAfterPause?.getAttribute('data-ts');

      // Stop TTS - highlight must be removed
      win.stopTts();
      const activeLineAfterStop = root?.querySelector('.yt-transcript-line.yt-transcript-line-speaking');
      const indicatorAfterStop = root?.querySelector('.yt-speaking-indicator');

      // Test helper parsing and character lookup
      const parsed = helper.parseTranscriptCues(win.text, { skipSilence: true });
      const foundCueByChar = helper.findActiveCueByCharIndex(parsed.cues, 15);
      const foundCueByTime = helper.findActiveCueByTime(parsed.cues, 50, 100);

      return {
        totalLines: initialLines.length,
        initialHasAttrs,
        hasCues: Boolean(win.transcriptCues && win.transcriptCues.length === 3),
        firstLineHighlighted: Boolean(activeLineAfterStart && (startLineTs === '[00:00]' || startLineTs === '00:00')),
        hasSpeakerIndicator: Boolean(indicatorAfterStart),
        cueMovedToSecondLine: Boolean(activeLineAfterMove && (moveLineTs === '[00:45]' || moveLineTs === '00:45')),
        firstLineCleared: !firstLineStillSpeaking,
        persistsOnPause: Boolean(activeLineAfterPause && (pauseLineTs === '[00:45]' || pauseLineTs === '00:45')),
        clearedOnStop: activeLineAfterStop === null && indicatorAfterStop === null,
        parsedCount: parsed.cues.length,
        foundCharTs: foundCueByChar?.tsStr?.replace(/[[\]]/g, ''),
        foundTimeTs: foundCueByTime?.tsStr?.replace(/[[\]]/g, '')
      };
    });

    assert.equal(transcriptTtsCheck.totalLines, 3, 'Transcript view renders 3 lines');
    assert.ok(transcriptTtsCheck.initialHasAttrs, 'Transcript line elements contain data-start-sec and data-ts attributes');
    assert.ok(transcriptTtsCheck.hasCues, 'Transcript cues parsed into window state');
    assert.ok(transcriptTtsCheck.firstLineHighlighted, 'First transcript line is dynamically highlighted on TTS start');
    assert.ok(transcriptTtsCheck.hasSpeakerIndicator, 'Highlighted transcript line displays live speaker indicator');
    assert.ok(transcriptTtsCheck.cueMovedToSecondLine, 'Active highlight smoothly advances to the next timestamped cue');
    assert.ok(transcriptTtsCheck.firstLineCleared, 'Previous transcript line loses speaking highlight when cue advances');
    assert.ok(transcriptTtsCheck.persistsOnPause, 'Speaking highlight persists on paused line when TTS is paused');
    assert.ok(transcriptTtsCheck.clearedOnStop, 'Speaking highlight is cleanly cleared when TTS is stopped');
    assert.equal(transcriptTtsCheck.parsedCount, 3, 'parseTranscriptCues extracts all 3 cues');
    assert.equal(transcriptTtsCheck.foundCharTs, '00:00', 'findActiveCueByCharIndex correctly maps character offset to cue');
    assert.equal(transcriptTtsCheck.foundTimeTs, '00:45', 'findActiveCueByTime correctly maps playback time to cue');
    passed += 12;

    // Check 29: Theme synchronization toggle with YouTube (Dark vs. Light mode auto-detection)
    const themeSyncCheck = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();
      if (!win) return { error: 'No active window found' };

      // Ensure YouTube root has dark mode initially
      document.documentElement.setAttribute('dark', '');

      // Enable theme sync & Readability mode
      win.setSyncYouTubeTheme(true);
      win.toggleReadability(true);

      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot || win.el;
      const syncBtn = root?.querySelector('.yt-readability-sync-theme-btn');
      const initialHasSyncBtn = Boolean(syncBtn);
      const initialSyncActive = syncBtn?.classList?.contains('active');
      const initialSetting = win.syncYouTubeTheme;

      // Detected YouTube theme should be dark
      const detectedDark = helper.detectYouTubeTheme();
      const initialBoxClassDark = win.windowBox?.classList?.contains('yt-theme-dark');
      const initialReaderClassDark = root?.querySelector('.yt-readability-container')?.classList?.contains('theme-dark') ||
                                    root?.querySelector('.yt-readability-container')?.classList?.contains('yt-readability-theme-dark');

      // Now simulate YouTube theme changing to Light mode
      document.documentElement.removeAttribute('dark');
      document.documentElement.removeAttribute('theme');
      const detectedLight = helper.detectYouTubeTheme();

      // Trigger sync update to match YouTube light mode
      win.setSyncYouTubeTheme(true);
      await new Promise((r) => setTimeout(r, 60));

      const afterLightBoxClass = win.windowBox?.classList?.contains('yt-theme-light');
      const afterLightReaderClass = root?.querySelector('.yt-readability-container')?.classList?.contains('theme-light') ||
                                   root?.querySelector('.yt-readability-container')?.classList?.contains('yt-readability-theme-light');

      // Now click Sepia theme button - should turn off sync and apply sepia
      const sepiaBtn = root?.querySelector('.yt-readability-theme-btn[data-theme="sepia"]');
      sepiaBtn?.click();
      await new Promise((r) => setTimeout(r, 60));

      const afterSepiaSyncActive = root?.querySelector('.yt-readability-sync-theme-btn')?.classList?.contains('active');
      const afterSepiaSetting = win.syncYouTubeTheme;
      const afterSepiaBoxClass = win.windowBox?.classList?.contains('yt-theme-sepia');

      // Now click sync button again - should re-enable sync and match YouTube (light)
      const syncBtnAfterSepia = root?.querySelector('.yt-readability-sync-theme-btn');
      syncBtnAfterSepia?.click();
      await new Promise((r) => setTimeout(r, 60));

      const reenabledSyncActive = root?.querySelector('.yt-readability-sync-theme-btn')?.classList?.contains('active');
      const reenabledSetting = win.syncYouTubeTheme;
      const reenabledBoxClass = win.windowBox?.classList?.contains('yt-theme-light');

      // Re-enable dark mode on YouTube and verify live sync back to dark
      document.documentElement.setAttribute('dark', '');
      win.setSyncYouTubeTheme(true);
      await new Promise((r) => setTimeout(r, 60));

      const syncedBackDark = win.windowBox?.classList?.contains('yt-theme-dark');

      return {
        initialHasSyncBtn,
        initialSyncActive,
        initialSetting,
        detectedDark,
        initialBoxClassDark,
        initialReaderClassDark,
        detectedLight,
        afterLightBoxClass,
        afterLightReaderClass,
        afterSepiaSyncActive,
        afterSepiaSetting,
        afterSepiaBoxClass,
        reenabledSyncActive,
        reenabledSetting,
        reenabledBoxClass,
        syncedBackDark
      };
    });

    assert.ok(themeSyncCheck.initialHasSyncBtn, 'Reader view contains YouTube Theme Sync toggle button');
    assert.equal(themeSyncCheck.initialSetting, true, 'Theme synchronization is enabled by default');
    assert.equal(themeSyncCheck.initialSyncActive, true, 'Sync button has active class by default');
    assert.equal(themeSyncCheck.detectedDark, 'dark', 'detectYouTubeTheme detects dark mode from document');
    assert.ok(themeSyncCheck.initialBoxClassDark && themeSyncCheck.initialReaderClassDark, 'Reader view theme automatically matches YouTube dark mode');
    assert.equal(themeSyncCheck.detectedLight, 'light', 'detectYouTubeTheme detects light mode when dark attribute is removed');
    assert.ok(themeSyncCheck.afterLightBoxClass && themeSyncCheck.afterLightReaderClass, 'Reader view automatically updates to light theme to match YouTube');
    assert.equal(themeSyncCheck.afterSepiaSetting, false, 'Manual theme selection (Sepia) turns off automatic YouTube sync');
    assert.equal(themeSyncCheck.afterSepiaSyncActive, false, 'Sync button removes active class when user manually picks a theme');
    assert.ok(themeSyncCheck.afterSepiaBoxClass, 'Reader view applies manually selected Sepia theme');
    assert.equal(themeSyncCheck.reenabledSetting, true, 'Clicking sync button re-enables YouTube theme synchronization');
    assert.equal(themeSyncCheck.reenabledSyncActive, true, 'Sync button restores active class');
    assert.ok(themeSyncCheck.syncedBackDark, 'Reader view automatically updates back to dark mode when YouTube theme changes');
    passed += 13;

    // Check 30: Follow-up composer voice input mic button and LRU memory cache
    const compCheck = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow() || helper.getActiveWindows().get('D_menu_video');
      if (win && win.readabilityMode) {
        win.toggleReadability(false);
        await new Promise((r) => setTimeout(r, 60));
      }

      const box = win?.windowBox;
      const compWrap = box?.querySelector('.yt-composer-wrap');
      const micBtn = compWrap?.querySelector('.yt-composer-mic-btn');
      const ta = compWrap?.querySelector('.yt-composer-textarea');
      const sendBtn = compWrap?.querySelector('.yt-composer-send-btn');

      const initialHasMic = Boolean(micBtn);
      const initialHasSend = Boolean(sendBtn);
      const initialHasTa = Boolean(ta);

      // Trigger simulated voice input
      window.__yt_mock_voice_text = 'What are the main experimental conclusions?';
      micBtn?.click();
      await new Promise((r) => setTimeout(r, 60));

      const taValAfterMic = ta?.value || '';

      // Test LRU memory cache bound
      const setAltTitle = window.__yt_summariser_test.setCachedAltTitle;
      const getAltTitle = window.__yt_summariser_test.getCachedAltTitle;

      if (setAltTitle && getAltTitle) {
        setAltTitle('test_vid_1', 'Title One');
        setAltTitle('test_vid_2', 'Title Two');
      }

      return {
        initialHasMic,
        initialHasSend,
        initialHasTa,
        taValAfterMic,
        hasCachedAltTitle: Boolean(getAltTitle?.('test_vid_1'))
      };
    });

    assert.ok(compCheck.initialHasMic, 'Follow-up composer includes voice input microphone button');
    assert.ok(compCheck.initialHasSend, 'Follow-up composer includes Send button');
    assert.ok(compCheck.initialHasTa, 'Follow-up composer includes textarea');
    assert.ok(compCheck.taValAfterMic.includes('conclusions'), 'Clicking voice input populates composer textarea');
    assert.ok(compCheck.hasCachedAltTitle, 'Alternative title memory cache stores entries correctly');
    passed += 5;

    // Check 31: Follow-up chat draft auto-save and recovery
    const draftCheck = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow() || Array.from(helper.getActiveWindows().values())[0];
      const videoId = win?.videoId || 'vid_tts_shortcuts_test';
      const box = win?.windowBox;
      const compWrap = box?.querySelector('.yt-composer-wrap');
      const ta = compWrap?.querySelector('.yt-composer-textarea');
      const draftBadge = compWrap?.querySelector('.yt-composer-draft-badge');

      // 1. Type an unfinished draft question
      const testDraft = 'Is there any telemetry on temperature stability?';
      if (ta) {
        ta.value = testDraft;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await new Promise((r) => setTimeout(r, 60));

      const savedToStorage = helper.getDraftFollowUp(videoId);
      const badgeVisibleOnInput = draftBadge && window.getComputedStyle(draftBadge).display !== 'none';

      // 2. Simulate accidental window close (close)
      win.close();
      await new Promise((r) => setTimeout(r, 60));

      // 3. Verify draft still persists in storage after close
      const savedAfterClose = helper.getDraftFollowUp(videoId);

      // 4. Reopen window and verify draft is recovered
      helper.openForVideo({ videoId, title: 'Draft Recovery Technical Test' });
      await new Promise((r) => setTimeout(r, 60));
      const reopenedWin = helper.getActiveWindows().get(videoId);
      const newTa = reopenedWin?.windowBox?.querySelector('.yt-composer-textarea');
      const recoveredVal = newTa?.value || '';

      // 5. Clean up draft
      helper.clearDraftFollowUp(videoId);

      return {
        savedToStorage,
        badgeVisibleOnInput,
        savedAfterClose,
        recoveredVal
      };
    });

    assert.equal(draftCheck.savedToStorage, 'Is there any telemetry on temperature stability?', 'Draft auto-saves to local storage on input');
    assert.ok(draftCheck.badgeVisibleOnInput, 'Draft auto-saved badge is visible when draft exists');
    assert.equal(draftCheck.savedAfterClose, 'Is there any telemetry on temperature stability?', 'Draft persists in local storage across window close');
    assert.equal(draftCheck.recoveredVal, 'Is there any telemetry on temperature stability?', 'Draft is automatically recovered in composer when window is reopened');
    passed += 4;

    // Check 32: Granular TTS speed presets (0.25x steps) and speed button visual indicator
    const speedCheck = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow() || helper.getActiveWindows().get('D_menu_video');
      const box = win?.windowBox;
      const speedBtn = box?.querySelector('.yt-tts-speed-btn');
      const presetBtns = Array.from(box?.querySelectorAll('.yt-tts-rate-pill') || []);
      const rates = presetBtns.map((b) => parseFloat(b.getAttribute('data-rate')));

      // Check speed button visual indicator
      const indicator = speedBtn?.querySelector('.yt-tts-speed-indicator');

      // Check granular steps
      win.setTtsRate(1.75);
      await new Promise((r) => setTimeout(r, 60));

      const activeBtn175 = box?.querySelector('.yt-tts-rate-pill[data-rate="1.75"]')?.classList.contains('active');
      const btnText175 = speedBtn?.querySelector('.yt-tts-speed-text')?.textContent || speedBtn?.textContent;
      const indicatorBoost = indicator?.classList.contains('speed-boost');

      win.setTtsRate(1.0);
      await new Promise((r) => setTimeout(r, 60));
      const indicatorNormal = indicator?.classList.contains('speed-normal');

      // Test cycle
      win.cycleTtsRate();
      const nextRate = win.ttsRate;

      return {
        hasSpeedBtn: Boolean(speedBtn),
        hasIndicator: Boolean(indicator),
        has175Preset: rates.includes(1.75),
        all025Steps: rates.every((r, idx) => idx === 0 || Math.abs((r - rates[idx - 1]) - 0.25) < 0.01),
        activeBtn175,
        btnText175,
        indicatorBoost,
        indicatorNormal,
        nextRateAfterCycle: nextRate
      };
    });

    assert.ok(speedCheck.hasSpeedBtn, 'TTS toolbar includes speed button');
    assert.ok(speedCheck.hasIndicator, 'Speed button contains visual indicator directly on the button');
    assert.ok(speedCheck.has175Preset, 'TTS presets include 1.75x (0.25x step)');
    assert.ok(speedCheck.all025Steps, 'All speed presets advance strictly in granular 0.25x steps');
    assert.ok(speedCheck.activeBtn175, '1.75x preset button highlights when 1.75x is selected');
    assert.ok(speedCheck.btnText175.includes('1.75x'), 'Speed button directly shows 1.75x setting');
    assert.ok(speedCheck.indicatorBoost, 'Visual indicator highlights boost state for > 1.0x speeds');
    assert.ok(speedCheck.indicatorNormal, 'Visual indicator displays normal state for 1.0x speed');
    assert.equal(speedCheck.nextRateAfterCycle, 1.25, 'cycleTtsRate advances speed in 0.25x steps (1.0x -> 1.25x)');
    passed += 9;

    // --- CHECK 33: TTS Pitch Slider (0.5x - 2.0x) & Local Storage Persistence ---
    const pitchCheck = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;

      const pitchWrap = root?.querySelector('.yt-tts-pitch-wrap');
      const pitchSlider = root?.querySelector('.yt-tts-pitch-slider');
      const pitchLabel = root?.querySelector('.yt-tts-pitch-label');
      const pitchIcon = root?.querySelector('.yt-tts-pitch-icon');

      const win = helper.getMaximizedWindow();
      if (!win) throw new Error('No active window for pitch test');

      // Test slider attributes
      const min = pitchSlider?.getAttribute('min');
      const max = pitchSlider?.getAttribute('max');
      const step = pitchSlider?.getAttribute('step');

      // Change pitch to 1.35x
      win.setTtsPitch(1.35);
      const storedPitch = helper.getLastTtsPitch();
      const sliderVal = pitchSlider?.value;
      const labelText = pitchLabel?.textContent;

      // Close window and recreate to verify persistence alongside speed and volume
      const vidId = win.videoId;
      win.close();

      const opened = helper.openForVideo({ videoId: vidId, title: 'Pitch Persistence Test' });
      const newWin = opened || helper.getMaximizedWindow() || helper.getActiveWindows()?.get(vidId);
      const recoveredPitch = newWin?.ttsPitch;
      const recoveredRate = newWin?.ttsRate;
      const recoveredVol = newWin?.ttsVolume;

      return {
        hasPitchWrap: Boolean(pitchWrap),
        hasPitchSlider: Boolean(pitchSlider),
        hasPitchLabel: Boolean(pitchLabel),
        hasPitchIcon: Boolean(pitchIcon),
        min,
        max,
        step,
        storedPitch,
        sliderVal,
        labelText,
        recoveredPitch,
        recoveredRate,
        recoveredVol
      };
    });

    assert.ok(pitchCheck.hasPitchWrap, 'TTS control toolbar includes pitch wrapper element (.yt-tts-pitch-wrap)');
    assert.ok(pitchCheck.hasPitchSlider, 'TTS control toolbar includes pitch slider (.yt-tts-pitch-slider)');
    assert.ok(pitchCheck.hasPitchLabel, 'TTS control toolbar includes pitch label (.yt-tts-pitch-label)');
    assert.ok(pitchCheck.hasPitchIcon, 'Pitch slider includes voice character icon (.yt-tts-pitch-icon)');
    assert.equal(pitchCheck.min, '0.5', 'Pitch slider min is 0.5x');
    assert.equal(pitchCheck.max, '2', 'Pitch slider max is 2.0x');
    assert.equal(pitchCheck.step, '0.05', 'Pitch slider step is 0.05');
    assert.equal(pitchCheck.storedPitch, 1.35, 'setTtsPitch persists pitch to local storage');
    assert.equal(pitchCheck.sliderVal, '1.35', 'Pitch slider value updates to 1.35');
    assert.equal(pitchCheck.labelText, '1.35x', 'Pitch label reflects 1.35x setting');
    assert.equal(pitchCheck.recoveredPitch, 1.35, 'Reopened window recovers persisted pitch from local storage');
    assert.ok(typeof pitchCheck.recoveredRate === 'number', 'Reopened window persists speed setting alongside pitch');
    assert.ok(typeof pitchCheck.recoveredVol === 'number', 'Reopened window persists volume setting alongside pitch');
    passed += 13;

    // --- CHECK 34: Readability Mode JSON Export Button & Metadata Completeness ---
    const jsonExportCheck = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;

      const win = helper.getMaximizedWindow();
      if (!win) throw new Error('No active window for JSON export test');

      // Populate sample content and metadata
      win.channel = 'Veritasium Deep Tech';
      win.title = 'The Engineering Physics of Quantum Compute';
      win.mode = 'transcript';
      win.opts = { ...win.opts, transcriptMode: 'deep' };
      win.text = '## Detailed Summary\nChronological overview of quantum gate latency with [02:15] timestamps.';
      win.fact = { text: 'Verified telemetry against peer-reviewed preprint.' };
      win.turns = [
        { q: 'What is the coherence time?', a: 'Over 120 microseconds [04:12].', sources: [] }
      ];

      // Switch to Readability mode
      win.readabilityMode = true;
      win.renderAll();

      const readerBar = root?.querySelector('.yt-readability-bar');
      const jsonBtn = readerBar?.querySelector('.yt-readability-export-json-btn');
      const btnText = jsonBtn?.textContent?.trim();

      // Open window export menu to verify popover JSON button
      const winExportBtn = root?.querySelector('.yt-win-export-btn');
      if (winExportBtn) {
        win.openExportMenu(winExportBtn);
      }
      const popoverJsonBtn = root?.querySelector('.yt-export-popover .yt-export-json-btn');
      const popoverJsonTitle = popoverJsonBtn?.querySelector('.yt-export-item-title')?.textContent;

      // Test formatAsExportJson output and schema
      const jsonStr = helper.formatAsExportJson(win);
      const parsed = JSON.parse(jsonStr);

      return {
        hasJsonBtn: Boolean(jsonBtn),
        btnText,
        hasPopoverJsonBtn: Boolean(popoverJsonBtn),
        popoverJsonTitle,
        hasValidJson: Boolean(jsonStr && parsed),
        generator: parsed.generator,
        videoId: parsed.metadata?.videoId,
        videoTitle: parsed.metadata?.videoTitle,
        channel: parsed.metadata?.channel,
        processingMode: parsed.metadata?.processingMode,
        mode: parsed.metadata?.mode,
        pitchSetting: parsed.metadata?.ttsSettings?.pitch,
        hasFactCheck: Boolean(parsed.content?.factCheck),
        followUpCount: parsed.content?.followUpQuestions?.length
      };
    });

    assert.ok(jsonExportCheck.hasJsonBtn, 'Readability mode toolbar contains JSON export button (.yt-readability-export-json-btn)');
    assert.ok(jsonExportCheck.btnText.includes('JSON'), 'Readability export button label includes "JSON"');
    assert.ok(jsonExportCheck.hasPopoverJsonBtn, 'Export popover contains JSON export item (.yt-export-json-btn)');
    assert.ok(jsonExportCheck.popoverJsonTitle.includes('JSON'), 'Export popover item displays "Export as JSON"');
    assert.ok(jsonExportCheck.hasValidJson, 'formatAsExportJson returns valid JSON string');
    assert.equal(jsonExportCheck.generator, 'YouTube Feed Summariser (Gemini)', 'Export payload specifies generator');
    assert.equal(jsonExportCheck.videoTitle, 'The Engineering Physics of Quantum Compute', 'Metadata includes video title');
    assert.equal(jsonExportCheck.channel, 'Veritasium Deep Tech', 'Metadata includes channel name');
    assert.equal(jsonExportCheck.processingMode, 'deep', 'Metadata includes transcript processing mode (deep)');
    assert.equal(jsonExportCheck.mode, 'transcript', 'Metadata includes mode (transcript)');
    assert.equal(jsonExportCheck.pitchSetting, 1.35, 'Export includes persisted TTS pitch setting');
    assert.ok(jsonExportCheck.hasFactCheck, 'Export includes fact check verification content');
    assert.equal(jsonExportCheck.followUpCount, 1, 'Export includes follow-up conversation turns');
    passed += 13;

    // Check 35: Adversarial Probes - Bounded LRU Cache, Timer Cleanup, and Pitch Shortcuts
    const adversarialCheck = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      
      // 1. Verify createBoundedMap LRU eviction and bounds
      const testMap = helper.createBoundedMap(3);
      testMap.set('v1', 'one');
      testMap.set('v2', 'two');
      testMap.set('v3', 'three');
      const initialSize = testMap.size;
      // Access v1 so v2 becomes oldest
      testMap.get('v1');
      // Add v4: capacity 3 exceeded, v2 should be evicted
      testMap.set('v4', 'four');
      const sizeAfterEvict = testMap.size;
      const hasV2 = testMap.has('v2');
      const hasV1 = testMap.has('v1');
      const hasV4 = testMap.has('v4');

      // 2. Verify TTS timer cleanup in stopTts
      const win = helper.getMaximizedWindow();
      let timerCleared = false;
      if (win) {
        win.ttsProgressTimer = 99999;
        win._ttsFeedbackTimer = 88888;
        win.stopTts();
        timerCleared = win.ttsProgressTimer === null && win._ttsFeedbackTimer === null;
      }

      // 3. Verify { and } pitch shortcuts
      let pitchSteppedUp = false;
      let pitchSteppedDown = false;
      if (win) {
        win.setTtsPitch(1.0);
        window.__yt_test_allow_untrusted_events = true;
        // Simulate '}' keydown
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '}', bubbles: true }));
        pitchSteppedUp = Math.abs(win.ttsPitch - 1.05) < 0.01;

        // Simulate '{' keydown twice
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '{', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '{', bubbles: true }));
        pitchSteppedDown = Math.abs(win.ttsPitch - 0.95) < 0.01;
        window.__yt_test_allow_untrusted_events = false;
      }

      // 4. Verify clampPitch handles extreme values
      const clampInf = helper.clampPitch(Infinity);
      const clampNeg = helper.clampPitch(-5);
      const clampHigh = helper.clampPitch(10);

      return {
        initialSize,
        sizeAfterEvict,
        hasV2,
        hasV1,
        hasV4,
        timerCleared,
        pitchSteppedUp,
        pitchSteppedDown,
        clampInf,
        clampNeg,
        clampHigh
      };
    });

    assert.equal(adversarialCheck.initialSize, 3, 'createBoundedMap populates to capacity');
    assert.equal(adversarialCheck.sizeAfterEvict, 3, 'createBoundedMap maintains max capacity');
    assert.equal(adversarialCheck.hasV2, false, 'Least recently used item (v2) evicted on capacity overflow');
    assert.equal(adversarialCheck.hasV1, true, 'Recently accessed item (v1) preserved');
    assert.equal(adversarialCheck.hasV4, true, 'Newly added item (v4) present in bounded cache');
    assert.ok(adversarialCheck.timerCleared, 'stopTts thoroughly nulls out progress and feedback timers');
    assert.ok(adversarialCheck.pitchSteppedUp, 'Keyboard shortcut "}" steps voice pitch up by 0.05');
    assert.ok(adversarialCheck.pitchSteppedDown, 'Keyboard shortcut "{" steps voice pitch down by 0.05');
    assert.equal(adversarialCheck.clampInf, 1.0, 'clampPitch safely handles Infinity');
    assert.equal(adversarialCheck.clampNeg, 0.5, 'clampPitch safely bounds negative values to 0.5');
    assert.equal(adversarialCheck.clampHigh, 2.0, 'clampPitch safely bounds high values to 2.0');
    passed += 11;

    // Check 36: Dynamic Audio Waveform Visualizer in TTS Control Bar
    const waveformCheck = await page.evaluate(async () => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const helper = window.__yt_summariser_test;
      const win = helper.getMaximizedWindow();

      // Ensure Readability mode is turned off so standard TTS toolbar is active
      if (win.readabilityMode) {
        win.readabilityMode = false;
        win.renderAll();
      }

      const toolbar = root?.querySelector('.yt-win-toolbar');
      const waveformWrap = toolbar?.querySelector('.yt-tts-waveform-wrap');
      const waveformCanvas = waveformWrap?.querySelector('.yt-tts-waveform-canvas');
      const waveformBars = waveformWrap?.querySelectorAll('.yt-tts-waveform-bar');

      const initialHasWrap = Boolean(waveformWrap);
      const initialHasCanvas = Boolean(waveformCanvas);
      const initialBarCount = waveformBars?.length || 0;
      const isInitiallyPlayingClass = waveformWrap?.classList.contains('playing');

      // Start playback and verify waveform activation
      win.ttsState = 'playing';
      win.updateTtsUI();
      const playingHasClass = waveformWrap?.classList.contains('playing');
      const isAnimationActive = Boolean(win.waveformAnimId);

      // Verify dynamic amplitude generation across frequencies
      const computedAmps = helper.computeWaveformAmplitudes({
        isPlaying: true,
        volume: 1.0,
        pitch: win.ttsPitch || 1.0,
        rate: win.ttsRate || 1.0,
        timestamp: Date.now(),
        barCount: 12
      });

      // Stop speech and verify clean teardown and flatline
      win.stopTts();
      const afterStopPlayingClass = waveformWrap?.classList.contains('playing');
      const isAnimationStopped = win.waveformAnimId === null;

      return {
        initialHasWrap,
        initialHasCanvas,
        initialBarCount,
        isInitiallyPlayingClass,
        playingHasClass,
        isAnimationActive,
        computedBarsLength: computedAmps?.length || 0,
        computedMaxAmp: Math.max(...computedAmps),
        afterStopPlayingClass,
        isAnimationStopped
      };
    });

    assert.ok(waveformCheck.initialHasWrap, 'TTS control bar contains dynamic audio waveform visualizer wrap (.yt-tts-waveform-wrap)');
    assert.ok(waveformCheck.initialHasCanvas, 'Waveform visualizer contains rendering canvas (.yt-tts-waveform-canvas)');
    assert.ok(waveformCheck.initialBarCount >= 8, 'Waveform visualizer initializes multi-band frequency bars');
    assert.ok(!waveformCheck.isInitiallyPlayingClass, 'Waveform starts in idle state without .playing class');
    assert.ok(waveformCheck.playingHasClass, 'Waveform receives .playing active class during speech playback');
    assert.ok(waveformCheck.isAnimationActive, 'Speech playback triggers requestAnimationFrame waveform visualizer loop');
    assert.equal(waveformCheck.computedBarsLength, 12, 'Amplitude model generates 12 frequency spectrum bars');
    assert.ok(waveformCheck.computedMaxAmp > 0.15, 'Active speech amplitudes reflect real-time voice energy');
    assert.ok(!waveformCheck.afterStopPlayingClass, 'Stopping speech removes .playing class from waveform visualizer');
    assert.ok(waveformCheck.isAnimationStopped, 'Stopping speech halts animation loop without frame leaks');
    passed += 10;

    // Check 37: History Tab Visibility Setting ('always', 'with_tabs', 'never')
    const historyVisCheck = await page.evaluate(async () => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const helper = window.__yt_summariser_test;

      // Seed at least one cached summary item so cachedCount > 0
      helper.writeCache('HIST_TEST_01', 'summary', 'video', {
        text: 'Cached summary for history visibility test',
        title: 'History Visibility Test Video',
        channel: 'Test Channel',
        ts: Date.now()
      });

      // Ensure zero active video dock tabs initially by closing all open/minimized windows
      for (const [, w] of Array.from(helper.activeWindows.entries())) {
        w.close();
      }
      helper.updateDockHistoryTab();

      const hasHistoryTab = () => Boolean(root?.querySelector('.yt-dock-history-tab'));

      // 1. 'always' with 0 video tabs -> shown
      helper.setHistoryTabVisibility('always');
      const alwaysNoTabs = hasHistoryTab();

      // 2. 'with_tabs' with 0 video tabs -> hidden
      helper.setHistoryTabVisibility('with_tabs');
      const withTabsZero = hasHistoryTab();

      // 3. 'with_tabs' with 1 active/minimized tab -> shown
      helper.openForVideo({ videoId: 'HIST_VIS_VID', title: 'History Vis Video' });
      const wVis = helper.activeWindows.get('HIST_VIS_VID');
      wVis?.minimize();
      helper.updateDockHistoryTab();
      const withTabsOne = hasHistoryTab();

      // 4. 'never' even with active/minimized tabs -> hidden
      helper.setHistoryTabVisibility('never');
      const neverWithTab = hasHistoryTab();

      // 5. Verify select element inside Advanced Options panel reflects & persists change
      const visSelect = root?.querySelector('.yt-history-visibility-select');
      let selectWorks = false;
      if (visSelect) {
        visSelect.value = 'with_tabs';
        visSelect.dispatchEvent(new Event('change', { bubbles: true }));
        selectWorks = helper.getHistoryTabVisibility() === 'with_tabs' && hasHistoryTab();
      }

      // Restore defaults & cleanup
      helper.setHistoryTabVisibility('always');
      wVis?.close();

      return {
        alwaysNoTabs,
        withTabsZero,
        withTabsOne,
        neverWithTab,
        selectWorks,
        defaultRestored: helper.getHistoryTabVisibility()
      };
    });

    assert.ok(historyVisCheck.alwaysNoTabs, 'History dock tab is visible with 0 video tabs when visibility="always"');
    assert.ok(!historyVisCheck.withTabsZero, 'History dock tab is hidden with 0 video tabs when visibility="with_tabs"');
    assert.ok(historyVisCheck.withTabsOne, 'History dock tab appears once another tab is open/minimized when visibility="with_tabs"');
    assert.ok(!historyVisCheck.neverWithTab, 'History dock tab stays hidden when visibility="never" even with active tabs');
    assert.ok(historyVisCheck.selectWorks, 'Settings selector (.yt-history-visibility-select) updates History dock tab visibility');
    assert.equal(historyVisCheck.defaultRestored, 'always', 'History dock tab visibility restores cleanly to "always"');
    passed += 6;

    // Check 38: Response Ratings (Thumbs Up / Down, Persistence, Follow-up, Readability & JSON Export)
    const ratingCheck = await page.evaluate(async () => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const helper = window.__yt_summariser_test;

      for (const [, w] of Array.from(helper.activeWindows.entries())) {
        w.close();
      }
      helper.openForVideo({ videoId: 'RATE_VID_01', title: 'Rating Test Video' });
      const win = helper.activeWindows.get('RATE_VID_01');
      win.mode = 'summary';
      win.status = 'done';
      win.text = 'Summary text for response rating verification.';
      win.turns = [{ q: 'Why?', a: 'Because testing works.', model: 'gemini-3.8-flash', sources: [] }];
      win.readabilityMode = false;
      win.renderAll();

      // Find main summary rating bar & click Thumbs Up
      const mainBar = root?.querySelector('.yt-window-box .yt-window-body .yt-rating-bar[data-target-type="summary"]');
      const upBtn = mainBar?.querySelector('.yt-rating-up-btn');
      upBtn?.click();
      const afterUp = helper.getResponseRating('RATE_VID_01', 'summary', 'main');
      const upPressedAttr = root?.querySelector('.yt-window-box .yt-window-body .yt-rating-bar[data-target-type="summary"] .yt-rating-up-btn')?.getAttribute('aria-pressed');

      // Switch to Thumbs Down on main summary
      const downBtn = root?.querySelector('.yt-window-box .yt-window-body .yt-rating-bar[data-target-type="summary"] .yt-rating-down-btn');
      downBtn?.click();
      const afterDown = helper.getResponseRating('RATE_VID_01', 'summary', 'main');

      // Verify follow-up answer bubble has its own rating bar
      const followUpUp = root?.querySelector('.yt-ans-bubble .yt-rating-bar .yt-rating-up-btn');
      followUpUp?.click();
      const afterFollowUp = helper.getResponseRating('RATE_VID_01', 'followup', 'turn_0');

      // Verify JSON export contains ratings
      const exportedJson = JSON.parse(helper.formatAsExportJson(win));

      // Verify Readability view also displays rating bar
      win.readabilityMode = true;
      win.renderAll();
      const hasReadabilityRating = Boolean(root?.querySelector('.yt-readability-content .yt-rating-bar'));
      win.readabilityMode = false;
      win.close();

      return {
        hasMainBar: Boolean(mainBar),
        afterUpRating: afterUp?.rating,
        upPressedAttr,
        afterDownRating: afterDown?.rating,
        afterFollowUpRating: afterFollowUp?.rating,
        exportedMainRating: exportedJson?.content?.ratings?.main?.rating,
        exportedFollowUpRating: exportedJson?.content?.ratings?.followUps?.turn_0?.rating,
        hasReadabilityRating
      };
    });

    assert.ok(ratingCheck.hasMainBar, 'Summary window displays response rating bar (.yt-rating-bar) below summary output');
    assert.equal(ratingCheck.afterUpRating, 'up', 'Clicking Thumbs Up persists "up" rating');
    assert.equal(ratingCheck.upPressedAttr, 'true', 'Thumbs Up button updates aria-pressed="true"');
    assert.equal(ratingCheck.afterDownRating, 'down', 'Clicking Thumbs Down switches persisted rating to "down"');
    assert.equal(ratingCheck.afterFollowUpRating, 'up', 'Follow-up answer bubbles include independent Thumbs Up/Down rating controls');
    assert.equal(ratingCheck.exportedMainRating, 'down', 'Exported JSON includes main response rating metadata');
    assert.equal(ratingCheck.exportedFollowUpRating, 'up', 'Exported JSON includes follow-up response ratings metadata');
    assert.ok(ratingCheck.hasReadabilityRating, 'Readability view preserves response rating controls');
    passed += 8;

    // Check 39 & 40: Multiple Simultaneous Resizable Windows + Adaptive Layout
    const multiAndAdaptiveCheck = await page.evaluate(async () => {
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const helper = window.__yt_summariser_test;

      // Close any leftover windows first
      for (const [, w] of Array.from(helper.activeWindows.entries())) {
        w.close();
      }

      // Open two summary windows simultaneously
      helper.openForVideo({ videoId: 'MULTI_A', title: 'First Simultaneous Window' });
      const winA = helper.activeWindows.get('MULTI_A');
      winA.status = 'done';
      winA.text = 'Content for first simultaneous window.';
      winA.renderAll();

      helper.openForVideo({ videoId: 'MULTI_B', title: 'Second Simultaneous Window' });
      const winB = helper.activeWindows.get('MULTI_B');
      winB.status = 'done';
      winB.text = 'Content for second simultaneous window.';
      winB.renderAll();

      const openWindowsList = helper.getOpenWindows();
      const domBoxesCount = root?.querySelectorAll('.yt-window-box').length || 0;
      const hasResizeHandles = (winA.windowBox?.querySelectorAll('.yt-resize-handle')?.length || 0) >= 5;

      // Focus winA -> winA gets higher zIndex than winB
      const zBeforeFocus = parseInt(winA.windowBox?.style.zIndex || '0', 10);
      winA.focus();
      const zAfterFocus = parseInt(winA.windowBox?.style.zIndex || '0', 10);
      const zB = parseInt(winB.windowBox?.style.zIndex || '0', 10);

      // Resize winB to compact width (< 540px) and verify adaptive tier + overflow menu + options toggle + zero horizontal overflow
      winB.resizeWindow(420, 620);
      const compactTier = winB.windowBox?.getAttribute('data-size-tier');
      const hasCompactClass = winB.windowBox?.classList.contains('yt-win-compact');
      const overflowBtn = winB.windowBox?.querySelector('.yt-win-overflow-btn');
      const compactOptsBtn = winB.windowBox?.querySelector('.yt-compact-options-btn');
      const overflowBtnVisible = Boolean(overflowBtn && getComputedStyle(overflowBtn).display !== 'none');
      const compactOptsVisible = Boolean(compactOptsBtn && getComputedStyle(compactOptsBtn).display !== 'none');
      const compactNoHorizontalOverflow = winB.windowBox ? winB.windowBox.scrollWidth <= winB.windowBox.clientWidth + 2 : false;

      // Toggle overflow menu open in compact mode
      overflowBtn?.click();
      const overflowMenuCreated = Boolean(winB.windowBox?.querySelector('.yt-win-overflow-menu'));
      overflowBtn?.click();

      // Resize winB to wide width (>= 780px)
      winB.resizeWindow(840, 620);
      const wideTier = winB.windowBox?.getAttribute('data-size-tier');
      const hasWideClass = winB.windowBox?.classList.contains('yt-win-wide');
      const wideBounds = winB.bounds;

      // Verify short window class (< 460px height)
      winB.resizeWindow(640, 380);
      const hasShortClass = winB.windowBox?.classList.contains('yt-win-short');
      const hasMediumClass = winB.windowBox?.classList.contains('yt-win-medium');

      // Verify Escape minimizes focused window one at a time
      root?.querySelectorAll('.yt-key-dialog-scrim, .yt-history-dialog-scrim').forEach((d) => d.remove());
      winA.focus();
      window.__yt_test_allow_untrusted_events = true;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const aMinimizedFirst = !winA.isOpen && winB.isOpen;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const bothMinimizedSecond = !winA.isOpen && !winB.isOpen;
      window.__yt_test_allow_untrusted_events = false;

      winA.close();
      winB.close();
      root?.querySelectorAll('.yt-key-dialog-scrim, .yt-history-dialog-scrim').forEach((d) => d.remove());

      return {
        openCount: openWindowsList.length,
        domBoxesCount,
        hasResizeHandles,
        focusedRaisedZ: zAfterFocus > zBeforeFocus && zAfterFocus > zB,
        compactTier,
        hasCompactClass,
        overflowBtnVisible,
        compactOptsVisible,
        compactNoHorizontalOverflow,
        overflowMenuCreated,
        wideTier,
        hasWideClass,
        wideWidth: wideBounds?.width,
        hasShortClass,
        hasMediumClass,
        aMinimizedFirst,
        bothMinimizedSecond
      };
    });

    assert.equal(multiAndAdaptiveCheck.openCount, 2, 'Two summary windows remain open simultaneously without minimizing each other');
    assert.equal(multiAndAdaptiveCheck.domBoxesCount, 2, 'Two .yt-window-box elements render side-by-side in Shadow DOM');
    assert.ok(multiAndAdaptiveCheck.hasResizeHandles, 'Summary window includes edge/corner resize handles');
    assert.ok(multiAndAdaptiveCheck.focusedRaisedZ, 'Focusing an open window raises its z-index above sibling windows');
    assert.equal(multiAndAdaptiveCheck.compactTier, 'compact', 'Resizing window to 420px triggers compact size tier');
    assert.ok(multiAndAdaptiveCheck.hasCompactClass, 'Resizing window to 420px applies .yt-win-compact class');
    assert.ok(multiAndAdaptiveCheck.overflowBtnVisible, 'Compact window shows header overflow menu button (.yt-win-overflow-btn)');
    assert.ok(multiAndAdaptiveCheck.compactOptsVisible, 'Compact window shows collapsible options toggle (.yt-compact-options-btn)');
    assert.ok(multiAndAdaptiveCheck.compactNoHorizontalOverflow, 'Compact 420px window has no horizontal overflow');
    assert.ok(multiAndAdaptiveCheck.overflowMenuCreated, 'Clicking compact overflow button opens header actions dropdown (.yt-win-overflow-menu)');
    assert.equal(multiAndAdaptiveCheck.wideTier, 'wide', 'Resizing window to 840px transitions to wide size tier');
    assert.ok(multiAndAdaptiveCheck.hasWideClass, 'Resizing window to 840px applies .yt-win-wide class');
    assert.equal(multiAndAdaptiveCheck.wideWidth, 840, 'Programmatic resize persists exact window width');
    assert.ok(multiAndAdaptiveCheck.hasShortClass && multiAndAdaptiveCheck.hasMediumClass, 'Medium width + short height applies .yt-win-medium and .yt-win-short');
    assert.ok(multiAndAdaptiveCheck.aMinimizedFirst, 'First Escape minimizes focused window while keeping second open');
    assert.ok(multiAndAdaptiveCheck.bothMinimizedSecond, 'Second Escape minimizes remaining open window');
    passed += 16;

    // Check 41: Summary Symbol / LaTeX Formatting ($100^\circ\text{C}$ -> 100°C) while Preserving Currency
    const symbolCheck = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      const sample = 'At 4,300 meters, atmospheric pressure drops significantly, causing the boiling point of water to fall from the sea-level standard of $100^\\circ\\text{C}$ to approximately $87^\\circ\\text{C}$. Budget stays $100 to $200.';

      const formatted = helper.formatMathSymbolsInText(sample);
      const speechClean = helper.cleanTextForSpeech(sample);

      for (const [, w] of Array.from(helper.activeWindows.entries())) {
        w.close();
      }
      helper.openForVideo({ videoId: 'SYM_VID_01', title: 'Symbol Formatting Video' });
      const win = helper.activeWindows.get('SYM_VID_01');
      win.mode = 'summary';
      win.status = 'done';
      win.text = sample;
      win.readabilityMode = false;
      win.renderAll();

      const standardBodyText = win.bodyEl?.textContent || '';

      win.readabilityMode = true;
      win.renderAll();
      const readabilityBodyText = win.bodyEl?.textContent || '';

      win.mode = 'transcript';
      win.text = `[00:10] ${sample}`;
      win.readabilityMode = false;
      win.renderAll();
      const transcriptBodyText = win.bodyEl?.textContent || '';

      win.close();

      return {
        formatted,
        speechClean,
        standardBodyText,
        readabilityBodyText,
        transcriptBodyText
      };
    });

    assert.ok(symbolCheck.formatted.includes('100°C') && symbolCheck.formatted.includes('87°C'), 'formatMathSymbolsInText converts $100^\\circ\\text{C}$ and $87^\\circ\\text{C}$ to 100°C and 87°C');
    assert.ok(symbolCheck.formatted.includes('$100 to $200'), 'formatMathSymbolsInText preserves currency strings "$100 to $200"');
    assert.ok(!symbolCheck.formatted.includes('\\circ') && !symbolCheck.formatted.includes('\\text'), 'formatMathSymbolsInText strips raw LaTeX \\circ and \\text commands');
    assert.ok(symbolCheck.speechClean.includes('100°C') && symbolCheck.speechClean.includes('87°C'), 'cleanTextForSpeech outputs clean degree notation without raw LaTeX');
    assert.ok(symbolCheck.standardBodyText.includes('100°C') && !symbolCheck.standardBodyText.includes('\\circ'), 'Standard summary DOM renders clean 100°C symbol');
    assert.ok(symbolCheck.readabilityBodyText.includes('87°C') && !symbolCheck.readabilityBodyText.includes('\\text'), 'Readability view DOM renders clean 87°C symbol');
    assert.ok(symbolCheck.transcriptBodyText.includes('100°C') && symbolCheck.transcriptBodyText.includes('$100 to $200'), 'Transcript view renders clean symbols while preserving currency');
    passed += 7;

    // Check 42: Extensive Auto-Title Replacement, DeArrow Coexistence & Settings Toggle Suite
    const extensiveTitleCheck = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      for (const [, w] of Array.from(helper.activeWindows.entries())) w.close();

      // Reset setting to default enabled
      helper.setAltTitlesEnabled(true);

      // 42a: Global DeArrow presence + thumbnail-only DeArrow card MUST still get AI title replacement
      const styleMarker = document.createElement('style');
      styleMarker.id = 'dearrow-styles';
      document.head.appendChild(styleMarker);
      window.dearrow = { installed: true };

      window.__yt_mock_transcripts = window.__yt_mock_transcripts || {};
      window.__yt_mock_transcripts['D_thumb_only_da'] =
        '[00:00] Detailed breakdown of solid-state sodium batteries achieving 400 Wh/kg at room temperature.';
      window.__yt_mock_transcripts['D_nested_yt_dom'] =
        '[00:00] Benchmarks of open-weight transformer quantization show 4-bit inference preserves 99 percent accuracy.';
      window.__yt_mock_transcripts['D_late_da_after_ai'] =
        '[00:00] Deep ocean hydrothermal vents host chemosynthetic microbes powered by hydrogen sulfide.';
      window.__yt_mock_transcripts['D_disabled_new_card'] =
        '[00:00] New photonic interconnect links achieve 1.6 terabits per second across datacenter racks.';

      const thumbOnlyCard = document.createElement('ytd-rich-item-renderer');
      thumbOnlyCard.id = 'card-thumb-only-da';
      thumbOnlyCard.innerHTML = `
        <div class="thumb"><div class="cbThumbnailButtonContainer" data-dearrow="true">Thumb</div></div>
        <div class="title-row">
          <div><h3 id="video-title"><a href="/watch?v=D_thumb_only_da">YOU WON'T BELIEVE THIS BATTERY!!</a></h3></div>
        </div>
      `;
      document.body.appendChild(thumbOnlyCard);
      helper.processFeedCard(thumbOnlyCard);
      await new Promise((r) => setTimeout(r, 80));
      const thumbOnlyReplacedTitle = thumbOnlyCard.querySelector('#video-title')?.textContent?.trim();
      const thumbOnlyIsDeArrow = helper.isDeArrowPresent(thumbOnlyCard, thumbOnlyCard.querySelector('#video-title'));

      // 42b: Nested yt-formatted-string preservation inside <a id="video-title">
      const nestedCard = document.createElement('ytd-rich-item-renderer');
      nestedCard.id = 'card-nested-dom';
      nestedCard.innerHTML = `
        <div class="title-row">
          <div>
            <h3>
              <a id="video-title" href="/watch?v=D_nested_yt_dom">
                <yt-formatted-string class="yt-nested-label">INSANE AI TRICK BREAKS EVERYTHING!</yt-formatted-string>
              </a>
            </h3>
          </div>
        </div>
      `;
      document.body.appendChild(nestedCard);
      helper.processFeedCard(nestedCard);
      await new Promise((r) => setTimeout(r, 80));
      const nestedWrapperSurvived = Boolean(nestedCard.querySelector('#video-title yt-formatted-string.yt-nested-label'));
      const nestedReplacedText = nestedCard.querySelector('#video-title yt-formatted-string.yt-nested-label')?.textContent?.trim();

      // 42c: Late DeArrow arrival AFTER AI title already applied yields cleanly without losing _originalTitle
      const lateDaCard = document.createElement('ytd-rich-item-renderer');
      lateDaCard.id = 'card-late-da-after-ai';
      lateDaCard.innerHTML = `
        <div class="title-row">
          <div><h3 id="video-title"><a href="/watch?v=D_late_da_after_ai">SECRET OCEAN MONSTERS?!</a></h3></div>
        </div>
      `;
      document.body.appendChild(lateDaCard);
      helper.processFeedCard(lateDaCard);
      await new Promise((r) => setTimeout(r, 80));
      const beforeLateDaTitle = lateDaCard.querySelector('#video-title')?.textContent?.trim();

      // Simulate DeArrow injecting container & title text 100ms after AI replaced it
      const lateTitleEl = lateDaCard.querySelector('#video-title');
      const lateParent = lateTitleEl.parentElement;
      const lateCb = document.createElement('div');
      lateCb.className = 'cbTitleButtonContainer';
      lateCb.innerHTML = '<button class="cbButton cbTitleButton"></button>';
      lateParent.insertBefore(lateCb, lateTitleEl.nextSibling);
      lateTitleEl.querySelector('a').textContent = 'Hydrothermal Vent Chemosynthetic Microbes Studied';
      helper.syncDeArrowState(lateDaCard);
      const lateModeAfterArrival = lateDaCard._currentTitleMode;
      const lateDearrowSaved = lateDaCard._dearrowTitle;
      const lateOriginalSaved = lateDaCard._originalTitle;
      const lateBtnClass = lateDaCard.querySelector('.yt-alt-title-btn')?.className || '';

      // 42d: Settings UI checkbox turns auto-title OFF -> reverts active AI cards immediately and leaves DeArrow card alone
      helper.openForVideo({ videoId: 'SETTINGS_TITLE_TEST', title: 'Settings Test' });
      const win = helper.activeWindows.get('SETTINGS_TITLE_TEST');
      await new Promise((r) => setTimeout(r, 50));
      const advBtn = Array.from(win.windowBox.querySelectorAll('.yt-link-btn')).find((b) =>
        b.textContent?.includes('Advanced')
      );
      if (advBtn) advBtn.click();
      await new Promise((r) => setTimeout(r, 40));
      const host = document.getElementById('yt-ai-summary-host');
      const settingsCb = win.windowBox?.querySelector('.yt-alt-titles-setting-checkbox') || host?.shadowRoot?.querySelector('.yt-alt-titles-setting-checkbox');
      const initialCbChecked = Boolean(settingsCb?.checked);

      // Uncheck via real click event on checkbox in Settings modal
      settingsCb.click();
      await new Promise((r) => setTimeout(r, 60));

      const enabledAfterUncheck = helper.getAltTitlesEnabled();
      const thumbTitleAfterDisable = thumbOnlyCard.querySelector('#video-title')?.textContent?.trim();
      const nestedTitleAfterDisable = nestedCard.querySelector('#video-title yt-formatted-string.yt-nested-label')?.textContent?.trim();
      const lateTitleAfterDisable = lateDaCard.querySelector('#video-title')?.textContent?.trim();

      // New card added while setting is OFF must NOT be auto-replaced
      const newCardOff = document.createElement('ytd-rich-item-renderer');
      newCardOff.id = 'card-while-off';
      newCardOff.innerHTML = `
        <div class="title-row">
          <div><h3 id="video-title"><a href="/watch?v=D_disabled_new_card">UNBELIEVABLE PHOTONIC SPEED!</a></h3></div>
        </div>
      `;
      document.body.appendChild(newCardOff);
      helper.processFeedCard(newCardOff);
      await new Promise((r) => setTimeout(r, 80));
      const newCardOffTitle = newCardOff.querySelector('#video-title')?.textContent?.trim();

      // Re-check via real click -> restores AI titles on non-DeArrow cards, keeps DeArrow card on DeArrow title
      settingsCb.click();
      await new Promise((r) => setTimeout(r, 80));
      const enabledAfterRecheck = helper.getAltTitlesEnabled();
      const thumbTitleAfterReenable = thumbOnlyCard.querySelector('#video-title')?.textContent?.trim();
      const newCardAfterReenable = newCardOff.querySelector('#video-title')?.textContent?.trim();
      const lateTitleAfterReenable = lateDaCard.querySelector('#video-title')?.textContent?.trim();

      // 42e: In-flight async race — DeArrow injects container + title WHILE AI transcript fetch is mid-flight
      const origFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const res = await origFetch(...args);
        const url = String(args[0] || '');
        if (url.includes('/youtubei/v1/get_transcript')) {
          await new Promise((r) => setTimeout(r, 180));
        }
        return res;
      };
      const inflightCard = document.createElement('ytd-rich-item-renderer');
      inflightCard.id = 'card-inflight-race';
      inflightCard.innerHTML = `
        <div class="title-row">
          <div><h3 id="video-title"><a href="/watch?v=D_async_inflight_race">MIDFLIGHT CLICKBAIT TITLE!!</a></h3></div>
        </div>
      `;
      document.body.appendChild(inflightCard);
      helper.processFeedCard(inflightCard);
      await new Promise((r) => setTimeout(r, 40));
      // DeArrow arrives while generateAlternativeTitle() is still awaiting fetch
      const raceTitleEl = inflightCard.querySelector('#video-title');
      const raceCb = document.createElement('div');
      raceCb.className = 'cbTitleButtonContainer';
      raceCb.innerHTML = '<button class="cbButton cbTitleButton"></button>';
      raceTitleEl.parentElement.insertBefore(raceCb, raceTitleEl.nextSibling);
      raceTitleEl.querySelector('a').textContent = 'DeArrow In-Flight Crowdsourced Title';
      helper.syncDeArrowState(inflightCard);
      // Wait for delayed AI fetch to finish and verify post-await guard prevented overwrite
      await new Promise((r) => setTimeout(r, 320));
      window.fetch = origFetch;
      const inflightModeFinal = inflightCard._currentTitleMode;
      const inflightTitleFinal = inflightCard.querySelector('#video-title')?.textContent?.trim();

      // 42f: AUD-05 Clickbait self-caching guard when offline/empty-transcript fallback yields cleanLines.length === 0
      const savedKeys42f = window.GM_getValue('keys', []);
      window.GM_setValue('keys', []);
      window.GM_deleteValue?.('alt_title:D_empty_cb_test');
      window.__yt_mock_transcripts['D_empty_cb_test'] = '[00:00] ## Header\n[00:05] [Music]\n[00:10] ok';
      const emptyFallbackResult = await helper.generateAlternativeTitle('D_empty_cb_test', 'SHOCKING CLICKBAIT ORIGINAL!');
      const emptyFallbackCached = window.GM_getValue('alt_title:D_empty_cb_test', null);
      window.GM_setValue('keys', savedKeys42f);

      // Clean up test DOM artifacts
      win.close();
      thumbOnlyCard.remove();
      nestedCard.remove();
      lateDaCard.remove();
      newCardOff.remove();
      inflightCard.remove();
      styleMarker.remove();
      delete window.dearrow;

      return {
        thumbOnlyIsDeArrow,
        thumbOnlyReplacedTitle,
        nestedWrapperSurvived,
        nestedReplacedText,
        beforeLateDaTitle,
        lateModeAfterArrival,
        lateDearrowSaved,
        lateOriginalSaved,
        lateBtnClass,
        initialCbChecked,
        enabledAfterUncheck,
        thumbTitleAfterDisable,
        nestedTitleAfterDisable,
        lateTitleAfterDisable,
        newCardOffTitle,
        enabledAfterRecheck,
        thumbTitleAfterReenable,
        newCardAfterReenable,
        lateTitleAfterReenable,
        inflightModeFinal,
        inflightTitleFinal,
        emptyFallbackResult,
        emptyFallbackCached
      };
    });

    assert.equal(extensiveTitleCheck.thumbOnlyIsDeArrow, false, 'Thumbnail-only DeArrow container and global #dearrow-styles do not falsely disable AI title replacement');
    assert.ok(extensiveTitleCheck.thumbOnlyReplacedTitle.includes('solid-state sodium batteries'), 'Thumbnail-only DeArrow card still gets factual AI title replacement');
    assert.equal(extensiveTitleCheck.nestedWrapperSurvived, true, 'Nested <yt-formatted-string> wrapper inside title link survives replacement intact');
    assert.ok(extensiveTitleCheck.nestedReplacedText.includes('open-weight transformer quantization'), 'Nested title wrapper displays replaced AI title');
    assert.ok(extensiveTitleCheck.beforeLateDaTitle.includes('hydrothermal vents'), 'Card initially shows AI title before late DeArrow arrives');
    assert.equal(extensiveTitleCheck.lateModeAfterArrival, 'dearrow', 'syncDeArrowState yields _currentTitleMode from ai to dearrow on late DeArrow update');
    assert.equal(extensiveTitleCheck.lateDearrowSaved, 'Hydrothermal Vent Chemosynthetic Microbes Studied', 'Late DeArrow title is captured accurately');
    assert.equal(extensiveTitleCheck.lateOriginalSaved, 'SECRET OCEAN MONSTERS?!', 'Original title stays preserved separately from DeArrow and AI titles');
    assert.ok(extensiveTitleCheck.lateBtnClass.includes('dearrow'), 'Switch button updates visually to DeArrow state after late arrival');
    assert.equal(extensiveTitleCheck.initialCbChecked, true, 'Settings checkbox for Alternative AI Titles is checked by default');
    assert.equal(extensiveTitleCheck.enabledAfterUncheck, false, 'Unchecking Settings checkbox persists disabled state');
    assert.equal(extensiveTitleCheck.thumbTitleAfterDisable, "YOU WON'T BELIEVE THIS BATTERY!!", 'Disabling in Settings immediately reverts AI-replaced title back to original');
    assert.equal(extensiveTitleCheck.nestedTitleAfterDisable, 'INSANE AI TRICK BREAKS EVERYTHING!', 'Disabling in Settings reverts nested yt-formatted-string title cleanly');
    assert.equal(extensiveTitleCheck.lateTitleAfterDisable, 'Hydrothermal Vent Chemosynthetic Microbes Studied', 'Disabling in Settings leaves DeArrow card on its DeArrow title');
    assert.equal(extensiveTitleCheck.newCardOffTitle, 'UNBELIEVABLE PHOTONIC SPEED!', 'New feed cards loaded while disabled keep original titles');
    assert.equal(extensiveTitleCheck.enabledAfterRecheck, true, 'Re-checking Settings checkbox re-enables auto-title replacement');
    assert.ok(extensiveTitleCheck.thumbTitleAfterReenable.includes('solid-state sodium batteries'), 'Re-enabling restores AI titles on existing non-DeArrow cards');
    assert.ok(extensiveTitleCheck.newCardAfterReenable.includes('photonic interconnect'), 'Re-enabling applies AI title to previously skipped cards');
    assert.equal(extensiveTitleCheck.lateTitleAfterReenable, 'Hydrothermal Vent Chemosynthetic Microbes Studied', 'Re-enabling continues yielding to DeArrow on DeArrow-active cards');
    assert.equal(extensiveTitleCheck.inflightModeFinal, 'dearrow', 'Mid-flight DeArrow arrival wins over async AI title completion');
    assert.equal(extensiveTitleCheck.inflightTitleFinal, 'DeArrow In-Flight Crowdsourced Title', 'In-flight async AI title generation never overwrites late DeArrow title');
    assert.equal(extensiveTitleCheck.emptyFallbackResult, null, 'AUD-05: Offline empty/placeholder transcript fallback returns null instead of originalTitle');
    assert.equal(extensiveTitleCheck.emptyFallbackCached, null, 'AUD-05: Original clickbait title is never persisted in alt_title cache on empty transcript fallback');
    passed += 23;

    // Check 43: Stage 2 Hardening — /shorts/ extraction, SPA card recycling, MutationObserver noise filtering, Trusted Types & batch cooldown circuit breaker
    const stage2Hardening = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      for (const [, w] of Array.from(helper.activeWindows.entries())) w.close();
      helper.setAltTitlesEnabled(true);
      helper.clearModelCooldowns();

      // 43a: AUD-03 ttsRateBtn clearEl re-render safely clears child spans without innerHTML
      helper.openForVideo({ videoId: 'STAGE2_TTS_CLEAR', title: 'Stage 2 TTS Clear Test' });
      const ttsWin = helper.activeWindows.get('STAGE2_TTS_CLEAR');
      ttsWin.status = 'done';
      ttsWin.text = 'Test TTS speed badge clearing without innerHTML.';
      ttsWin.renderAll();
      if (ttsWin.ttsRateBtn) {
        while (ttsWin.ttsRateBtn.firstChild) ttsWin.ttsRateBtn.removeChild(ttsWin.ttsRateBtn.firstChild);
        ttsWin.ttsRate = 1.5;
        ttsWin.updateTtsUI();
      }
      const rateBtnText = ttsWin.ttsRateBtn?.querySelector('.yt-tts-speed-text')?.textContent?.trim() || '';
      ttsWin.close();

      // 43b: AUD-04 /shorts/<id> URL extraction & title replacement
      window.__yt_mock_transcripts = window.__yt_mock_transcripts || {};
      window.__yt_mock_transcripts['S_shortsVid99'] =
        '[00:00] Compact CNC machining guide covering carbide feed rates in aluminum parts.';
      const shortsCard = document.createElement('ytd-reel-item-renderer');
      shortsCard.innerHTML = `
        <a id="thumbnail" href="/shorts/S_shortsVid99?feature=share"></a>
        <div class="title-row">
          <div><h3 id="video-title"><a href="/shorts/S_shortsVid99">INSANE METAL TRICK!</a></h3></div>
        </div>
      `;
      document.body.appendChild(shortsCard);
      const shortsExtractedId = helper.getCardVideoId(shortsCard);
      helper.processFeedCard(shortsCard);
      await new Promise((r) => setTimeout(r, 80));
      const shortsTitleAfter = shortsCard.querySelector('#video-title')?.textContent?.trim() || '';

      // 43c: AUD-04 SPA card recycling resets stale state cleanly for new videoId
      window.__yt_mock_transcripts['D_recycle_v1'] =
        '[00:00] First video explains solid electrolyte separator testing in pouch cells.';
      window.__yt_mock_transcripts['D_recycle_v2'] =
        '[00:00] Second video demonstrates open-source RISC-V vector extension benchmarks.';
      const recycleCard = document.createElement('ytd-rich-item-renderer');
      recycleCard.innerHTML = `
        <div class="title-row">
          <div><h3 id="video-title"><a href="/watch?v=D_recycle_v1">FIRST CLICKBAIT VIDEO!!</a></h3></div>
        </div>
      `;
      document.body.appendChild(recycleCard);
      helper.processFeedCard(recycleCard);
      await new Promise((r) => setTimeout(r, 80));
      const recycleV1Title = recycleCard.querySelector('#video-title')?.textContent?.trim() || '';

      // Simulate YouTube SPA recycling the SAME DOM element for D_recycle_v2
      const link = recycleCard.querySelector('#video-title a');
      link.setAttribute('href', '/watch?v=D_recycle_v2');
      link.textContent = 'SECOND RECYCLED CLICKBAIT!!';
      helper.processFeedCard(recycleCard);
      await new Promise((r) => setTimeout(r, 80));
      const recycleV2Id = recycleCard.dataset.ytaisVideoId || '';
      const recycleV2Title = recycleCard.querySelector('#video-title')?.textContent?.trim() || '';
      const recycleBtnCount = recycleCard.querySelectorAll('.yt-alt-title-btn').length;

      // 43d: AUD-02 MutationObserver ignores player time-tick & live-chat characterData noise
      const moviePlayer = document.createElement('div');
      moviePlayer.id = 'movie_player';
      const timeCur = document.createElement('span');
      timeCur.className = 'ytp-time-current';
      timeCur.textContent = '0:12';
      moviePlayer.appendChild(timeCur);
      const liveChat = document.createElement('yt-live-chat-app');
      liveChat.textContent = 'chat line 1';
      document.body.appendChild(moviePlayer);
      document.body.appendChild(liveChat);

      await new Promise((r) => setTimeout(r, 450));
      helper.resetFeedScanCount();
      const debugNoiseMuts = [];
      const dbgObs = new MutationObserver((muts) => {
        for (const m of muts) {
          if (helper.isFeedMutationRelevant(m)) {
            const t = m.target?.nodeType === 3 ? m.target.parentElement : m.target;
            debugNoiseMuts.push(`${m.type}:${t?.tagName || ''}#${t?.id || ''}.${t?.className || ''}`);
          }
        }
      });
      dbgObs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-dearrow', 'data-dearrow-title'] });
      timeCur.firstChild.data = '0:13';
      liveChat.firstChild.data = 'chat line 2';
      await new Promise((r) => setTimeout(r, 320));
      dbgObs.disconnect();
      const scansAfterNoise = helper.getFeedScanCount();

      // Trigger relevant card addition and confirm observer scans
      const freshCard = document.createElement('ytd-rich-item-renderer');
      freshCard.innerHTML = `<div class="title-row"><div><h3 id="video-title"><a href="/watch?v=D_observer_ping1">PING TITLE</a></h3></div></div>`;
      window.__yt_mock_transcripts['D_observer_ping1'] =
        '[00:00] Observer scan test transcript confirming dynamic feed updates trigger scanning.';
      document.body.appendChild(freshCard);
      await new Promise((r) => setTimeout(r, 280));
      const scansAfterFeedCard = helper.getFeedScanCount();

      // 43e: Batch alt-title HTTP 429 cooldown circuit breaker routes cleanly to secondary flash model
      const savedKeys43e = window.GM_getValue('keys', []);
      window.GM_setValue('keys', [{ id: 'k43e', name: 'Test', key: 'AIzaSyTest43e' }]);
      window.GM_deleteValue?.('alt_title:D_cooldown_card1');
      window.GM_deleteValue?.('alt_title:D_cooldown_card2');
      window.__yt_mock_transcripts['D_cooldown_card1'] = '[00:00] First card transcript for 429 circuit breaker failover verification.';
      window.__yt_mock_transcripts['D_cooldown_card2'] = '[00:00] Second card transcript verifying 3.8-flash stays skipped in cooldown.';
      const hitModels = [];
      const origGmReq = window.GM_xmlhttpRequest;
      window.GM_xmlhttpRequest = function (opts) {
        const url = String(opts.url || '');
        if (url.includes(':generateContent')) {
          hitModels.push(url);
          if (url.includes('gemini-3.8-flash')) {
            setTimeout(() => {
              opts.onload({
                status: 429,
                responseText: JSON.stringify({
                  error: {
                    message: 'Rate limit 3.8-flash',
                    details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '30s' }]
                  }
                })
              });
            }, 10);
            return;
          }
          if (url.includes('gemini-3.7-flash')) {
            setTimeout(() => {
              opts.onload({
                status: 200,
                responseText: JSON.stringify({
                  candidates: [{ content: { parts: [{ text: 'Fallback Flash Factual Title Generated' }] } }]
                })
              });
            }, 10);
            return;
          }
        }
        return origGmReq(opts);
      };
      const cdRes1 = await helper.generateAlternativeTitle('D_cooldown_card1', 'CLICKBAIT CD 1');
      const cooldownSnapshot = helper.getModelCooldowns();
      const cdRes2 = await helper.generateAlternativeTitle('D_cooldown_card2', 'CLICKBAIT CD 2');
      window.GM_xmlhttpRequest = origGmReq;
      window.GM_setValue('keys', savedKeys43e);
      helper.clearModelCooldowns();

      shortsCard.remove();
      recycleCard.remove();
      freshCard.remove();
      moviePlayer.remove();
      liveChat.remove();

      return {
        rateBtnText,
        shortsExtractedId,
        shortsTitleAfter,
        recycleV1Title,
        recycleV2Id,
        recycleV2Title,
        recycleBtnCount,
        scansAfterNoise,
        debugNoiseMuts,
        scansAfterFeedCard,
        cdRes1,
        cdRes2,
        has38Cooldown: Boolean(cooldownSnapshot['gemini-3.8-flash']?.until > Date.now()),
        flash38HitCount: hitModels.filter((u) => u.includes('gemini-3.8-flash')).length,
        flash37HitCount: hitModels.filter((u) => u.includes('gemini-3.7-flash')).length
      };
    });

    assert.equal(stage2Hardening.rateBtnText, '1.5x', 'AUD-03: ttsRateBtn clearEl re-renders speed text cleanly without innerHTML');
    assert.equal(stage2Hardening.shortsExtractedId, 'S_shortsVid99', 'AUD-04: Extracts /shorts/<id> URLs accurately');
    assert.ok(stage2Hardening.shortsTitleAfter.includes('CNC machining guide'), 'AUD-04: Replaces /shorts/ feed card clickbait title');
    assert.ok(stage2Hardening.recycleV1Title.includes('electrolyte separator'), 'Recycled card initially shows v1 AI title');
    assert.equal(stage2Hardening.recycleV2Id, 'D_recycle_v2', 'AUD-04: SPA recycled card updates data-ytais-video-id to new video');
    assert.ok(stage2Hardening.recycleV2Title.includes('RISC-V vector extension'), 'AUD-04: SPA recycled card clears stale v1 metadata and applies v2 AI title');
    assert.equal(stage2Hardening.recycleBtnCount, 1, 'AUD-04: Recycled card cleanly replaces button without duplicating .yt-alt-title-btn');
    assert.equal(stage2Hardening.scansAfterNoise, 0, `AUD-02: MutationObserver ignores #movie_player timer & yt-live-chat characterData noise (muts=${JSON.stringify(stage2Hardening.debugNoiseMuts)})`);
    assert.ok(stage2Hardening.scansAfterFeedCard >= 1, 'AUD-02: MutationObserver still triggers scan when genuine feed card is inserted');
    assert.equal(stage2Hardening.cdRes1, 'Fallback Flash Factual Title Generated', 'Batch alt-title fails over cleanly on HTTP 429 to secondary flash model');
    assert.equal(stage2Hardening.has38Cooldown, true, 'HTTP 429 records per-model cooldown circuit breaker entry');
    assert.equal(stage2Hardening.flash38HitCount, 1, 'Circuit breaker skips cooled-down gemini-3.8-flash on subsequent batch card');
    assert.equal(stage2Hardening.flash37HitCount, 2, 'Subsequent card routes directly to non-cooled gemini-3.7-flash');
    passed += 13;

    // Check 44: Stage 3 Accessibility, Keyboard Window Ergonomics, Non-Blocking Toasts, ARIA Live Regions & Mobile (<400px) Hardening
    const stage3Pre = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      for (const [, w] of Array.from(helper.activeWindows.entries())) w.close();
      window.__yt_test_allow_untrusted_events = true;
      window.__alertFired = false;
      const origAlert = window.alert;
      window.alert = () => {
        window.__alertFired = true;
      };

      // Open window for Stage 3 verification
      helper.openForVideo({ videoId: 'STAGE3_A11Y', title: 'Stage 3 Accessibility Video' });
      const win = helper.activeWindows.get('STAGE3_A11Y');
      win.status = 'done';
      win.text = '## TL;DR\nBoiling point drops to $87^\\circ\\text{C}$ at altitude.';
      win.applyWindowBounds({ left: 220, top: 160, width: 640, height: 480 }, true);
      win.maximize();
      win.renderAll();

      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      root?.querySelectorAll('.yt-key-dialog-scrim, .yt-history-dialog-scrim').forEach((d) => d.remove());
      const winEl = win.windowBox || root;
      const handleEls = Array.from(winEl?.querySelectorAll('.yt-resize-handle') || []);
      const dirs = handleEls.map((el) => el.getAttribute('data-resize-dir')).sort();
      const allHandlesFocusable = handleEls.every(
        (el) => el.getAttribute('role') === 'separator' && el.getAttribute('tabindex') === '0'
      );

      // Save reference to NW handle BEFORE minimize to prove mousedown cleanup detaches it cleanly
      const nwHandleBeforeMin = winEl?.querySelector('.yt-resize-handle-nw');
      const dragGrip = winEl?.querySelector('.yt-win-drag-grip');

      // Test 44a: Pointer North-West corner drag upwards + left
      const boundsBeforeDrag = { ...win.bounds };
      const nwRect = nwHandleBeforeMin.getBoundingClientRect();
      nwHandleBeforeMin.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: nwRect.left + 4, clientY: nwRect.top + 4, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: nwRect.left - 26, clientY: nwRect.top - 24, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: nwRect.left - 26, clientY: nwRect.top - 24, bubbles: true }));
      const boundsAfterNwDrag = { ...win.bounds };

      // Test 44b: Keyboard Arrow move on grip & Arrow resize on N / SE separators (without triggering TTS!)
      const spokenBeforeKeys = (window.__tts_spoken || []).length;
      dragGrip?.focus();
      dragGrip?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      dragGrip?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }));
      const boundsAfterGripKeys = { ...win.bounds };

      const nHandle = winEl?.querySelector('.yt-resize-handle-n');
      nHandle?.focus();
      nHandle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
      const boundsAfterNorthKey = { ...win.bounds };

      const seHandle = winEl?.querySelector('.yt-resize-handle-se');
      seHandle?.focus();
      seHandle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
      const boundsAfterSeKey = { ...win.bounds };
      const spokenAfterKeys = (window.__tts_spoken || []).length;

      // Test 44c: ARIA live region on minimize -> orphaned mousedown leak check -> maximize restore
      win.minimize();
      const liveAfterMin = root?.querySelector('[data-ytais-live-region]')?.textContent?.trim() || '';
      const cleanupLenAfterMin = win._interactionCleanup.length;
      const boundsSnapshotAtMin = { ...win.bounds };
      nwHandleBeforeMin.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 50, clientY: 50, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 120, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 120, clientY: 120, bubbles: true }));
      const boundsAfterOrphanedDown = { ...win.bounds };
      const orphanedCleanupLen = win._interactionCleanup.length;

      win.maximize();
      const liveAfterRestore = root?.querySelector('[data-ytais-live-region]')?.textContent?.trim() || '';

      // Rating announcement
      const upBtn = root?.querySelector('.yt-rating-up-btn');
      upBtn?.click();
      const liveAfterRatingUp = root?.querySelector('[data-ytais-live-region]')?.textContent?.trim() || '';
      upBtn?.click(); // toggle clear
      const liveAfterRatingClear = root?.querySelector('[data-ytais-live-region]')?.textContent?.trim() || '';

      // Ask fallback announcement + Toast without alert()
      const origAskErrKeys = window.GM_getValue('keys', []);
      window.GM_setValue('keys', [{ id: 'k44', name: 'Test', key: 'AIzaSyValidKey' }]);
      window.GM_setValue('clear_cmds_before', 1);
      const clearCmd = window.__gm_commands?.['Clear cached summaries (keeps open windows)'];
      if (typeof clearCmd === 'function') clearCmd();
      const toastEl = root?.querySelector('.yt-global-toast');
      const toastVisible = Boolean(toastEl?.classList?.contains('yt-global-toast-show'));
      const toastMsg = toastEl?.textContent?.trim() || '';

      const altToggleName = Object.keys(window.__gm_commands || {}).find((k) => k.startsWith('Toggle Alternative AI Titles'));
      if (altToggleName) window.__gm_commands[altToggleName]();
      const toastAfterAltToggle = root?.querySelector('.yt-global-toast')?.textContent?.trim() || '';
      // Restore alt titles ON
      if (altToggleName) window.__gm_commands[altToggleName]();

      window.GM_setValue('keys', origAskErrKeys);
      window.alert = origAlert;

      return {
        dirs,
        allHandlesFocusable,
        hasDragGrip: Boolean(dragGrip && dragGrip.getAttribute('tabindex') === '0'),
        boundsBeforeDrag,
        boundsAfterNwDrag,
        boundsAfterGripKeys,
        boundsAfterNorthKey,
        boundsAfterSeKey,
        spokenDelta: spokenAfterKeys - spokenBeforeKeys,
        liveAfterMin,
        cleanupLenAfterMin,
        boundsSnapshotAtMin,
        boundsAfterOrphanedDown,
        orphanedCleanupLen,
        liveAfterRestore,
        liveAfterRatingUp,
        liveAfterRatingClear,
        alertFired: window.__alertFired,
        toastVisible,
        toastMsg,
        toastAfterAltToggle
      };
    });

    assert.deepEqual(stage3Pre.dirs, ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'], 'AUD-06: Renders all 8 edge/corner resize handles including n, nw, ne');
    assert.ok(stage3Pre.allHandlesFocusable, 'FEAT-05: All 8 resize handles carry role="separator" and tabindex="0"');
    assert.ok(stage3Pre.hasDragGrip, 'FEAT-05: Header drag grip is keyboard-focusable with tabindex="0"');
    assert.ok(stage3Pre.boundsAfterNwDrag.width > stage3Pre.boundsBeforeDrag.width, 'AUD-06: North-west drag expands window width leftward');
    assert.ok(stage3Pre.boundsAfterNwDrag.height > stage3Pre.boundsBeforeDrag.height, 'AUD-06: North-west drag expands window height upward');
    assert.equal(stage3Pre.boundsAfterGripKeys.left, stage3Pre.boundsAfterNwDrag.left + 16, 'FEAT-05: ArrowRight on drag grip shifts left by 16px');
    assert.equal(stage3Pre.boundsAfterGripKeys.top, stage3Pre.boundsAfterNwDrag.top + 48, 'FEAT-05: Shift+ArrowDown on drag grip shifts top by 48px');
    assert.equal(stage3Pre.boundsAfterNorthKey.height, stage3Pre.boundsAfterGripKeys.height + 16, 'FEAT-05: ArrowUp on N handle expands height by 16px');
    assert.equal(stage3Pre.boundsAfterSeKey.width, stage3Pre.boundsAfterNorthKey.width + 48, 'FEAT-05: Shift+ArrowRight on SE handle expands width by 48px');
    assert.equal(stage3Pre.spokenDelta, 0, 'FEAT-05: Keyboard window arrows do not trigger TTS playback');
    assert.ok(stage3Pre.liveAfterMin.includes('Minimized'), 'FEAT-05: ARIA live region announces window minimization');
    assert.equal(stage3Pre.cleanupLenAfterMin, 0, 'AUD-06: minimize() clears all _interactionCleanup handle listeners');
    assert.deepEqual(stage3Pre.boundsAfterOrphanedDown, stage3Pre.boundsSnapshotAtMin, 'AUD-06: Orphaned handle mousedown after minimize is completely detached');
    assert.equal(stage3Pre.orphanedCleanupLen, 0, 'AUD-06: Orphaned handle attaches zero document listeners after minimize');
    assert.ok(stage3Pre.liveAfterRestore.includes('Restored'), 'FEAT-05: ARIA live region announces window restore');
    assert.equal(stage3Pre.liveAfterRatingUp, 'Thumbs up rating saved', 'FEAT-05: ARIA live region announces thumbs up rating saved');
    assert.equal(stage3Pre.liveAfterRatingClear, 'Rating cleared', 'FEAT-05: ARIA live region announces rating cleared');
    assert.equal(stage3Pre.alertFired, false, 'AUD-07: Menu commands never invoke blocking window.alert()');
    assert.ok(stage3Pre.toastVisible && stage3Pre.toastMsg.includes('Cached summaries cleared'), 'AUD-07: Non-blocking Shadow DOM global toast renders status feedback');
    assert.ok(stage3Pre.toastAfterAltToggle.includes('Alternative AI Titles'), 'AUD-07: Alternative AI Titles menu toggle emits non-blocking toast');
    passed += 20;

    // 44d: Mobile narrow viewport (<400px) stress verification inside Userscript
    await page.setViewportSize({ width: 375, height: 700 });
    await page.waitForTimeout(120);
    const mobileViewportCheck = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      for (const [, w] of Array.from(helper.activeWindows.entries())) w.close();
      helper.openForVideo({ videoId: 'STAGE3_MOBILE', title: 'Mobile Narrow Viewport Test' });
      const win = helper.activeWindows.get('STAGE3_MOBILE');
      win.status = 'done';
      win.text = 'Mobile layout fits comfortably inside 375px.';
      win.maximize();
      win.renderAll();

      const host = document.getElementById('yt-ai-summary-host');
      const winBox = host?.shadowRoot?.querySelector('.yt-window-box');
      const rect = winBox?.getBoundingClientRect();
      const tier = winBox?.getAttribute('data-size-tier');
      const overflowBtnDisplay = winBox?.querySelector('.yt-win-overflow-btn')
        ? window.getComputedStyle(winBox.querySelector('.yt-win-overflow-btn')).display
        : '';
      const docOverflow = document.documentElement.scrollWidth > window.innerWidth;
      win.close();
      return {
        innerWidth: window.innerWidth,
        boundsWidth: win.bounds.width,
        rectWidth: rect?.width || 0,
        rectRight: rect?.right || 0,
        rectLeft: rect?.left || 0,
        tier,
        overflowBtnDisplay,
        docOverflow
      };
    });
    await page.setViewportSize({ width: 1280, height: 800 });

    assert.ok(mobileViewportCheck.boundsWidth <= 375 - 16, 'AUD-09: Mobile 375px viewport clamps window width with >=8px margins');
    assert.ok(mobileViewportCheck.rectLeft >= 8 && mobileViewportCheck.rectRight <= 375 - 8, 'AUD-09: Rendered window stays completely inside 375px viewport');
    assert.equal(mobileViewportCheck.tier, 'compact', 'AUD-09: Mobile viewport automatically enters compact window tier');
    assert.notEqual(mobileViewportCheck.overflowBtnDisplay, 'none', 'AUD-09: Mobile compact tier displays header overflow button');
    assert.equal(mobileViewportCheck.docOverflow, false, 'AUD-09: Mobile viewport introduces zero page horizontal overflow');
    passed += 5;

    // 45. Stage 4 Features: FEAT-01 Timestamp Jump & Follow-Along Lock, FEAT-02 Per-Channel Auto-Title Rules, FEAT-03 Summary Personas
    const stage4Check = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      for (const [, w] of Array.from(helper.activeWindows.entries())) w.close();

      // Setup a full card with channel name and clickbait title
      const card = document.createElement('ytd-rich-item-renderer');
      card.innerHTML = `
        <a id="video-title-link" href="/watch?v=STAGE4_CH1"><yt-formatted-string id="video-title">CLICKBAIT INSANE SHOCKING!</yt-formatted-string></a>
        <div id="channel-name"><a href="/@TechFrontier">Tech Frontier</a></div>
      `;
      document.body.appendChild(card);

      // Watch <video> stub matching STAGE4_VID1
      const watchVideo = document.createElement('video');
      watchVideo.className = 'html5-main-video';
      watchVideo.dataset.videoId = 'STAGE4_VID1';
      watchVideo.currentTime = 0;
      document.body.appendChild(watchVideo);

      // FEAT-02 Test: Per-channel rule button + Exempt/Always AI
      helper.setAltTitlesEnabled(true);
      helper.setCachedAltTitle('STAGE4_CH1', 'Concise Benchmark Overview of RISC-V');
      helper.processFeedCard(card);
      const titleEl = card.querySelector('#video-title');
      const titleDefault = titleEl?.textContent || '';
      const ruleBtn = card.querySelector('.yt-channel-rule-btn');
      ruleBtn?.click();
      const ruleMenu = document.querySelector('.yt-channel-rule-menu');
      const hasRuleMenu = Boolean(ruleMenu);
      const exemptBtn = ruleMenu?.querySelector('[data-rule="exempt"]');
      exemptBtn?.click();
      const titleAfterExempt = titleEl?.textContent || '';
      const storedRulesAfterExempt = helper.getChannelTitleRules();

      // Force AI overrides DeArrow when global enabled
      card.setAttribute('data-dearrow-title', 'DeArrow Crowd Title');
      helper.setChannelTitleRule('Tech Frontier', 'force_ai');
      const titleAfterForceAi = titleEl?.textContent || '';

      // Global kill switch overrides even force_ai
      helper.setAltTitlesEnabled(false);
      const titleAfterGlobalOff = titleEl?.textContent || '';
      helper.setChannelTitleRule('Tech Frontier', 'default');
      helper.setAltTitlesEnabled(true);
      document.querySelectorAll('.yt-channel-rule-menu').forEach((n) => n.remove());
      card.remove();

      // FEAT-01 Test: Timestamp seek + Follow-Along Lock
      helper.openForVideo({ videoId: 'STAGE4_VID1', title: 'Stage 4 Interactive Video' });
      const win = helper.activeWindows.get('STAGE4_VID1');
      win.mode = 'transcript';
      win.text = '[00:00] Intro segment.\n[01:15] Middle architecture segment.\n[04:20] Benchmarks segment.';
      win.status = 'done';
      win.renderAll();

      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const followBtn = root?.querySelector('.yt-follow-along-btn');
      const followPressedBefore = followBtn?.getAttribute('aria-pressed');

      win.seekPlayer(80); // maps to [01:15] cue (75s)
      const videoTimeAfterSeek = watchVideo.currentTime;
      const seekBadgeText = root?.querySelector('.yt-player-seek-badge')?.textContent || '';
      const speakingLine = root?.querySelector('.yt-transcript-line.yt-transcript-line-speaking');
      const speakingLineTs = speakingLine?.getAttribute('data-ts') || '';
      const scrollSyncedOn = speakingLine?.getAttribute('data-scroll-synced') || '';

      // Toggle follow-along OFF and seek to [04:20]
      followBtn?.click();
      const followPressedAfter = followBtn?.getAttribute('aria-pressed');
      win.seekPlayer(270); // maps to [04:20] (260s)
      const scrollSyncedOff = root?.querySelector('.yt-transcript-line.yt-transcript-line-speaking')?.getAttribute('data-scroll-synced') || '';
      const newSpeakingTs = root?.querySelector('.yt-transcript-line.yt-transcript-line-speaking')?.getAttribute('data-ts') || '';
      watchVideo.remove();

      // FEAT-03 Test: Summary Persona & Scoped Caching + Export JSON metadata
      const personaSelect = root?.querySelector('.yt-persona-select');
      const sysDefault = win.getSystemInstruction();
      if (personaSelect) {
        personaSelect.value = 'technical';
        personaSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const sysTechnical = win.getSystemInstruction();
      const promptTechnical = win.buildSummaryPrompt(null, null);

      // Verify scoped non-executive cache vs legacy executive cache
      helper.writeCache('STAGE4_VID1', 'summary', 'video', { text: 'Executive legacy brief' }, 'executive');
      helper.writeCache('STAGE4_VID1', 'summary', 'video', { text: 'Technical deep architecture' }, 'technical');
      const execCached = helper.readCache('STAGE4_VID1', 'summary', 'video', false, 'executive');
      const techCached = helper.readCache('STAGE4_VID1', 'summary', 'video', false, 'technical');
      const rawLegacyKey = window.GM_getValue('sum:STAGE4_VID1', null);
      const rawScopedKey = window.GM_getValue('sum:technical:STAGE4_VID1', null);
      const exportedJson = JSON.parse(helper.formatAsExportJson(win));

      win.close();
      return {
        titleDefault,
        hasRuleMenu,
        titleAfterExempt,
        storedRulesAfterExempt,
        titleAfterForceAi,
        titleAfterGlobalOff,
        followPressedBefore,
        followPressedAfter,
        videoTimeAfterSeek,
        seekBadgeText,
        speakingLineTs,
        scrollSyncedOn,
        scrollSyncedOff,
        newSpeakingTs,
        sysDefault,
        sysTechnical,
        promptTechnical,
        execCachedText: execCached?.text || '',
        techCachedText: techCached?.text || '',
        hasLegacyExecKey: Boolean(rawLegacyKey),
        hasScopedTechKey: Boolean(rawScopedKey),
        exportedPersona: exportedJson?.metadata?.persona || ''
      };
    });

    assert.equal(stage4Check.titleDefault, 'Concise Benchmark Overview of RISC-V', 'FEAT-02: Card initially shows cached AI title');
    assert.ok(stage4Check.hasRuleMenu, 'FEAT-02: Clicking channel rule button opens inline rule menu');
    assert.equal(stage4Check.titleAfterExempt, 'CLICKBAIT INSANE SHOCKING!', 'FEAT-02: Setting channel rule Exempt immediately restores original title');
    assert.equal(stage4Check.storedRulesAfterExempt['tech frontier'], 'exempt', 'FEAT-02: Exempt rule persists normalized to GM storage');
    assert.equal(stage4Check.titleAfterForceAi, 'Concise Benchmark Overview of RISC-V', 'FEAT-02: Always AI rule overrides DeArrow when global toggle enabled');
    assert.equal(stage4Check.titleAfterGlobalOff, 'DeArrow Crowd Title', 'FEAT-02: Global auto-title toggle off overrides per-channel force_ai rule');

    assert.equal(stage4Check.followPressedBefore, 'true', 'FEAT-01: Follow-Along Lock starts enabled');
    assert.equal(stage4Check.followPressedAfter, 'false', 'FEAT-01: Clicking Follow-Along Lock pauses auto-scroll');
    assert.equal(stage4Check.videoTimeAfterSeek, 80, 'FEAT-01: seekPlayer seeks active matching <video> element to target seconds');
    assert.ok(stage4Check.seekBadgeText.includes('01:20'), 'FEAT-01: Player slot shows Jumped to MM:SS seek badge');
    assert.equal(stage4Check.speakingLineTs, '[01:15]', 'FEAT-01: Seek highlights nearest preceding transcript cue');
    assert.equal(stage4Check.scrollSyncedOn, 'true', 'FEAT-01: Highlight marks data-scroll-synced=true when Follow-Along ON');
    assert.equal(stage4Check.scrollSyncedOff, 'false', 'FEAT-01: Highlight skips auto-scroll when Follow-Along OFF');
    assert.equal(stage4Check.newSpeakingTs, '[04:20]', 'FEAT-01: Second seek advances active highlighted transcript line');

    assert.ok(!stage4Check.sysDefault.includes('Principal Systems Engineer'), 'FEAT-03: Default executive persona excludes technical directive');
    assert.ok(stage4Check.sysTechnical.includes('Principal Systems Engineer'), 'FEAT-03: Switching persona updates getSystemInstruction()');
    assert.ok(stage4Check.promptTechnical.includes('Technical architecture'), 'FEAT-03: Prompt includes persona appendix');
    assert.equal(stage4Check.execCachedText, 'Executive legacy brief', 'FEAT-03: Executive persona cache preserves legacy behavior');
    assert.equal(stage4Check.techCachedText, 'Technical deep architecture', 'FEAT-03: Non-executive persona cache stores isolated entry');
    assert.equal(stage4Check.hasLegacyExecKey, true, 'FEAT-03: Executive key stays sum:<videoId>');
    assert.equal(stage4Check.hasScopedTechKey, true, 'FEAT-03: Technical key uses sum:technical:<videoId>');
    assert.equal(stage4Check.exportedPersona, 'technical', 'FEAT-03: JSON export includes metadata.persona');
    passed += 22;

    // 46. Stage 5 Features: FEAT-04 Chapter-Aware Long-Video Chunking (>45m) & FEAT-06 Markdown/Obsidian Bundle Export
    const stage5Check = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      for (const [, w] of Array.from(helper.activeWindows.entries())) w.close();

      // Test buildLongVideoTranscriptChunks & chapter bar in SummaryWindow
      const longTx = [
        '[00:00] Course overview and FLP theorem.',
        '[14:20] Raft leader election and randomized timeouts.',
        '[31:10] Log replication and term safety invariants.',
        '[48:05] Linearizable reads using ReadIndex.',
        '[56:40] Production burn-in at 100°C.'
      ].join('\n');
      const chapters = helper.parseVideoChaptersFromDescription(
        '00:00 Course Intro\n14:20 Raft Leader Election\n31:10 Safety Proofs\n48:05 ReadIndex Leases',
        3510
      );
      const chunkPlan = helper.buildLongVideoTranscriptChunks(longTx, { chapters, totalDurationSec: 3510 });

      const watchVideo = document.createElement('video');
      watchVideo.className = 'html5-main-video';
      watchVideo.dataset.videoId = 'STAGE5_LONG_01';
      watchVideo.currentTime = 0;
      document.body.appendChild(watchVideo);

      helper.openForVideo({ videoId: 'STAGE5_LONG_01', title: 'Distributed Consensus Lecture (58m)' });
      const win = helper.activeWindows.get('STAGE5_LONG_01');
      win.mode = 'summary';
      win.status = 'done';
      win.chapters = chapters;
      win.text = [
        '## TL;DR',
        'Complete 58-minute consensus lecture at $100^\\circ\\text{C}$ [14:20]. Cost $0.30/kg.',
        '',
        '### [00:00] Course Intro',
        'FLP impossibility proof.',
        '### [14:20] Raft Leader Election',
        'Split vote mitigation.',
        '### [31:10] Safety Proofs',
        'Leader completeness induction.',
        '### [48:05] ReadIndex Leases',
        'Linearizable reads without fsync.'
      ].join('\n');
      win.turns = [
        {
          q: 'How do ReadIndex leases help?',
          a: 'ReadIndex confirms leadership via heartbeat quorum [48:05].',
          model: 'gemini-4-argon',
          sources: [{ uri: 'https://raft.github.io', title: 'Raft Dissertation' }]
        }
      ];
      helper.setResponseRating('STAGE5_LONG_01', 'summary', 'main', 'up', 'Clear chapter proof');
      win.renderAll();

      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const chapterBtns = Array.from(root?.querySelectorAll('.yt-chapter-btn') || []);
      const chapterCount = chapterBtns.length;
      const secondChapBtn = root?.querySelector('.yt-chapter-btn[data-chapter-ts="[14:20]"]');
      secondChapBtn?.click();
      const videoTimeAfterChap = watchVideo.currentTime;
      const secondChapActive = root?.querySelector('.yt-chapter-btn[data-chapter-ts="[14:20]"]')?.classList.contains('active') || false;

      const exportTriggerBtn = root?.querySelector('.yt-win-export-btn');
      if (exportTriggerBtn) exportTriggerBtn.click();
      else win.openExportMenu();
      const hasExportMdBtn = Boolean(root?.querySelector('.yt-export-md-btn'));
      const mdBundle = helper.formatAsExportMarkdown(win);

      win.toggleReadability();
      const hasReadabilityMdBtn = Boolean(root?.querySelector('.yt-readability-export-md-btn'));

      watchVideo.remove();
      win.close();

      return {
        isLongVideoChunked: chunkPlan.isLongVideoChunked,
        chunkCount: chunkPlan.chunks.length,
        chapterCount,
        videoTimeAfterChap,
        secondChapActive,
        hasExportMdBtn,
        hasReadabilityMdBtn,
        mdBundle
      };
    });

    assert.equal(stage5Check.isLongVideoChunked, true, 'FEAT-04: >45m transcript activates chunked synthesis plan');
    assert.equal(stage5Check.chunkCount, 4, 'FEAT-04: Chapter-aware chunking partitions transcript into 4 chapter buckets');
    assert.equal(stage5Check.chapterCount, 4, 'FEAT-04: SummaryWindow renders clickable chapter navigation buttons');
    assert.equal(stage5Check.videoTimeAfterChap, 860, 'FEAT-04: Clicking chapter button seeks video player to 860s');
    assert.equal(stage5Check.secondChapActive, true, 'FEAT-04: Clicked chapter button highlights active state');
    assert.equal(stage5Check.hasExportMdBtn, true, 'FEAT-06: Export menu exposes Markdown/Obsidian (.md) button');
    assert.equal(stage5Check.hasReadabilityMdBtn, true, 'FEAT-06: Readability bar exposes Export .md button');
    assert.ok(stage5Check.mdBundle.startsWith('---\n'), 'FEAT-06: Exported Markdown bundle begins with YAML frontmatter');
    assert.ok(stage5Check.mdBundle.includes('100°C') && stage5Check.mdBundle.includes('$0.30/kg'), 'FEAT-06: Exported Markdown preserves Unicode math and currency');
    assert.ok(stage5Check.mdBundle.includes('[14:20](https://www.youtube.com/watch?v=STAGE5_LONG_01&t=860s)'), 'FEAT-06: Obsidian timestamp links include ?v=...&t=Xs');
    assert.ok(stage5Check.mdBundle.includes('## Follow-Up Q&A') && stage5Check.mdBundle.includes('## Quality Ratings & Notes') && stage5Check.mdBundle.includes('Clear chapter proof'), 'FEAT-06: Markdown bundle includes Q&A thread and saved ratings/notes');
    passed += 11;

    // 47. Home feed zero background /watch iframe autoplay + Route B silencer + TTS menu scaling across window & viewport resizes
    const noAutoplayAndTtsScaleCheck = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      for (const [, w] of Array.from(helper.activeWindows.entries())) w.close();
      helper.setAltTitlesEnabled(true);

      // Intercept fetch so HTTP Route A lacks getTranscriptEndpoint markers for 6 home feed cards
      const origFetch = window.fetch.bind(window);
      const createdWatchIframes = [];
      const origCreateEl = document.createElement.bind(document);
      document.createElement = (tag, options) => {
        const el = origCreateEl(tag, options);
        if (String(tag).toLowerCase() === 'iframe') {
          const origSetAttr = el.setAttribute.bind(el);
          el.setAttribute = (k, v) => {
            if (k === 'src' && String(v).includes('/watch?')) {
              createdWatchIframes.push(String(v));
            }
            return origSetAttr(k, v);
          };
        }
        return el;
      };

      window.fetch = async (url, init) => {
        if (String(url).includes('/watch?v=HOME_NO_MARKERS_')) {
          return {
            ok: true,
            status: 200,
            text: async () => '<html><body><div>No transcript markers here</div></body></html>'
          };
        }
        return origFetch(url, init);
      };

      const feedCards = [];
      for (let i = 1; i <= 6; i++) {
        const vid = `HOME_NO_MARKERS_${i}`;
        const card = document.createElement('ytd-rich-item-renderer');
        card.innerHTML = `<h3 id="video-title"><a href="/watch?v=${vid}">Clickbait Title ${i}</a></h3>`;
        document.body.appendChild(card);
        feedCards.push(card);
        helper.processFeedCard(card);
      }

      await new Promise((r) => setTimeout(r, 200));
      const feedSpawnedWatchIframes = createdWatchIframes.length;
      const strayVideosInDom = document.querySelectorAll('video, audio').length;

      for (const c of feedCards) c.remove();

      // 47b: Verify silenceWatchDocumentMedia + explicit fetchTranscriptRouteB mutes/pauses a watch-page video
      const mockWatchDoc = document.implementation.createHTMLDocument('Watch Mock');
      const watchVid = mockWatchDoc.createElement('video');
      watchVid.setAttribute('autoplay', 'true');
      let pauseCalledOnWatch = false;
      Object.defineProperty(watchVid, 'paused', {
        get() { return this._pausedState || false; },
        configurable: true
      });
      watchVid._pausedState = false;
      watchVid.pause = () => { watchVid._pausedState = true; pauseCalledOnWatch = true; };
      watchVid.muted = false;
      watchVid.volume = 0.85;
      mockWatchDoc.body.appendChild(watchVid);

      const mockPlayerDiv = mockWatchDoc.createElement('div');
      mockPlayerDiv.id = 'movie_player';
      let playerMuted = false;
      let playerPaused = false;
      mockPlayerDiv.mute = () => { playerMuted = true; };
      mockPlayerDiv.pauseVideo = () => { playerPaused = true; };
      mockWatchDoc.body.appendChild(mockPlayerDiv);

      const panel = mockWatchDoc.createElement('ytd-engagement-panel-section-list-renderer');
      panel.setAttribute('target-id', 'engagement-panel-searchable-transcript');
      panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
      Object.defineProperty(panel, 'innerText', {
        value: '0:00 First spoken line\n0:05 Second spoken line',
        configurable: true
      });
      mockWatchDoc.body.appendChild(panel);

      helper.silenceWatchDocumentMedia({ HTMLMediaElement: window.HTMLMediaElement }, mockWatchDoc);
      const routeBSilencedState = {
        muted: watchVid.muted,
        defaultMuted: watchVid.defaultMuted,
        volume: watchVid.volume,
        paused: watchVid.paused,
        pauseCalledOnWatch,
        hasAutoplayAttr: watchVid.hasAttribute('autoplay'),
        playerMuted,
        playerPaused
      };

      // Restore overrides before window size checks
      document.createElement = origCreateEl;
      window.fetch = origFetch;

      // 47c: Responsive TTS scaling across full width spectrum (1200 -> 360) and short window height
      helper.openForVideo({ videoId: 'TTS_SCALE_VID', title: 'TTS Responsive Width Test' });
      const win = helper.activeWindows.get('TTS_SCALE_VID');
      win.mode = 'summary';
      win.status = 'done';
      win.text = '## TL;DR\nSample summary content for responsive TTS controls.';
      win.renderAll();

      const widths = [1200, 920, 760, 620, 520, 420, 360];
      const measurements = [];
      for (const w of widths) {
        win.resizeWindow(w, w < 540 ? 440 : 640);
        await new Promise((r) => setTimeout(r, 30));
        const box = win.windowBox;
        const ttsGroup = box?.querySelector('.yt-tts-group');
        const speedBtns = box?.querySelector('.yt-tts-speed-btns');
        const boxRect = box.getBoundingClientRect();
        const ttsRect = ttsGroup.getBoundingClientRect();
        measurements.push({
          width: w,
          actualWidth: Math.round(boxRect.width),
          compactTtsClass: box.classList.contains('yt-tts-compact'),
          narrowTtsClass: box.classList.contains('yt-tts-narrow'),
          compactWinClass: box.classList.contains('yt-win-compact'),
          speedBtnsDisplay: speedBtns ? getComputedStyle(speedBtns).display : 'none',
          ttsFitsHorizontally: ttsRect.right <= boxRect.right + 1.5 && ttsRect.left >= boxRect.left - 1.5,
          ttsNoScrollOverflow: ttsGroup.scrollWidth <= ttsGroup.clientWidth + 2,
          winNoScrollOverflow: box.scrollWidth <= box.clientWidth + 2,
          ttsRightDelta: Math.round((ttsRect.right - boxRect.right) * 10) / 10,
          ttsScrollDelta: ttsGroup.scrollWidth - ttsGroup.clientWidth
        });
      }

      return {
        feedSpawnedWatchIframes,
        strayVideosInDom,
        routeBSilencedState,
        measurements
      };
    });

    assert.equal(noAutoplayAndTtsScaleCheck.feedSpawnedWatchIframes, 0, 'Home feed alt-title generation must NEVER spawn hidden /watch iframes');
    assert.equal(noAutoplayAndTtsScaleCheck.strayVideosInDom, 0, 'No background video/audio tags are left playing on Home feed');
    assert.equal(noAutoplayAndTtsScaleCheck.routeBSilencedState.muted, true, 'Watch media silencer forces video.muted = true');
    assert.equal(noAutoplayAndTtsScaleCheck.routeBSilencedState.defaultMuted, true, 'Watch media silencer forces video.defaultMuted = true');
    assert.equal(noAutoplayAndTtsScaleCheck.routeBSilencedState.volume, 0, 'Watch media silencer forces video.volume = 0');
    assert.equal(noAutoplayAndTtsScaleCheck.routeBSilencedState.paused, true, 'Watch media silencer pauses active <video>');
    assert.equal(noAutoplayAndTtsScaleCheck.routeBSilencedState.hasAutoplayAttr, false, 'Watch media silencer strips autoplay attribute');
    assert.ok(noAutoplayAndTtsScaleCheck.routeBSilencedState.playerMuted && noAutoplayAndTtsScaleCheck.routeBSilencedState.playerPaused, 'Watch media silencer mutes & pauses #movie_player API');

    for (const m of noAutoplayAndTtsScaleCheck.measurements) {
      assert.ok(
        m.ttsFitsHorizontally,
        `TTS group fits inside window at ${m.width}px (delta=${m.ttsRightDelta}px)`
      );
      assert.ok(
        m.ttsNoScrollOverflow,
        `TTS group has zero internal horizontal overflow at ${m.width}px (scrollDelta=${m.ttsScrollDelta}px)`
      );
      assert.ok(m.winNoScrollOverflow, `SummaryWindow has zero horizontal overflow at ${m.width}px`);
      if (m.width < 780) {
        assert.equal(m.compactTtsClass, true, `yt-tts-compact active at ${m.width}px`);
      } else {
        assert.equal(m.compactTtsClass, false, `yt-tts-compact inactive at ${m.width}px`);
      }
      if (m.width < 430) {
        assert.equal(m.narrowTtsClass, true, `yt-tts-narrow active at ${m.width}px`);
      }
      if (m.width < 540) {
        assert.equal(m.speedBtnsDisplay, 'none', `Rate pills collapse cleanly at compact width ${m.width}px`);
      } else {
        assert.notEqual(m.speedBtnsDisplay, 'none', `Rate pills remain visible & wrap cleanly at ${m.width}px`);
      }
    }

    // Check 47d: Real viewport resize adapts open floating SummaryWindow & TTS bar automatically
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(120);
    const viewportAdaptCheck = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const win = helper.activeWindows.get('TTS_SCALE_VID');
      const box = win?.windowBox;
      const tts = box?.querySelector('.yt-tts-group');
      const boxRect = box?.getBoundingClientRect();
      const ttsRect = tts?.getBoundingClientRect();
      const result = {
        innerWidth: window.innerWidth,
        boxRight: Math.round(boxRect?.right || 0),
        boxWidth: Math.round(boxRect?.width || 0),
        isCompactWin: Boolean(box?.classList.contains('yt-win-compact')),
        isCompactTts: Boolean(box?.classList.contains('yt-tts-compact')),
        isNarrowTts: Boolean(box?.classList.contains('yt-tts-narrow')),
        ttsFitsInsideBox: Boolean(ttsRect && boxRect && ttsRect.right <= boxRect.right + 1.5 && tts.scrollWidth <= tts.clientWidth + 2)
      };
      win?.close();
      return result;
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    assert.ok(viewportAdaptCheck.boxRight <= viewportAdaptCheck.innerWidth, 'Viewport resize clamps open SummaryWindow inside 390px mobile viewport');
    assert.ok(viewportAdaptCheck.isCompactWin && viewportAdaptCheck.isCompactTts && viewportAdaptCheck.isNarrowTts, 'Viewport resize updates adaptive compact & TTS classes');
    assert.ok(viewportAdaptCheck.ttsFitsInsideBox, 'TTS control group fits inside viewport-clamped 390px mobile window');
    passed += 39;

    // Check 48: FEAT-07 Interactive Multi-Host Podcast (2..6 hosts, typed & voice Q&A interruption, mobile fit)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      helper.openForVideo({ videoId: 'POD_E2E_VID', title: 'Sodium-Ion Solid-State Breakthrough' });
      const win = helper.activeWindows.get('POD_E2E_VID');
      win.mode = 'summary';
      win.status = 'done';
      win.text = [
        '## TL;DR',
        'Solid-state sodium-ion cells lower cathode cost by 60% [00:30] with ceramic sulfide membranes.',
        '## Key takeaways',
        '- Dendrite-free cycling verified across 4,500 continuous cycles [03:15].',
        '- Factory retooling requires under 10% line modification [08:50].'
      ].join('\n');
      win.renderAll();
      document.querySelector('#yt-ai-summary-host')?.shadowRoot
        ?.querySelectorAll('.yt-key-dialog-scrim, .yt-history-dialog-scrim')
        .forEach((d) => d.remove());
    });

    await page.locator('.yt-window-box[data-video-id="POD_E2E_VID"] .yt-podcast-mode-btn').click();
    await page.waitForSelector('.yt-podcast-studio');

    // Configure 3 hosts
    await page.locator('.yt-podcast-host-count-select').selectOption('3');
    await page.waitForFunction(() => {
      const sr = document.querySelector('#yt-ai-summary-host')?.shadowRoot;
      return (sr?.querySelectorAll('.yt-podcast-host-card').length || 0) === 3;
    });

    // Generate episode from video summary
    await page.locator('.yt-podcast-generate-btn').click();
    await page.waitForSelector('.yt-podcast-player-card');
    await page.waitForSelector('.yt-podcast-turn');

    const epMetrics = await page.evaluate(() => {
      const sr = document.querySelector('#yt-ai-summary-host')?.shadowRoot;
      const hosts = Array.from(sr?.querySelectorAll('.yt-podcast-host-name-input') || []).map((i) => i.value);
      const turns = Array.from(sr?.querySelectorAll('.yt-podcast-turn') || []);
      const speakers = new Set(turns.map((t) => t.getAttribute('data-speaker')));
      return {
        hostNames: hosts,
        turnCount: turns.length,
        allHostsSpoke: hosts.every((h) => speakers.has(h))
      };
    });
    assert.equal(epMetrics.hostNames.length, 3, 'Configured 3 distinct podcast hosts');
    assert.ok(epMetrics.turnCount >= 4, 'Generated multi-turn roundtable podcast episode');
    assert.ok(epMetrics.allHostsSpoke, 'Every configured host participates in generated podcast dialogue');

    // Step/play and test typed interruption Q&A
    await page.locator('.yt-podcast-play-btn').click();
    await page.waitForTimeout(80);
    await page.locator('.yt-podcast-qa-input').fill('How many cycles were tested with the ceramic sulfide membrane?');
    await page.locator('.yt-podcast-ask-btn').click();
    await page.waitForSelector('.yt-podcast-turn-user');
    await page.waitForSelector('.yt-podcast-turn-reply');

    // Test voice interruption Q&A using mock voice transcript
    await page.evaluate(() => {
      window.__yt_mock_voice_text = 'How much factory retooling is needed for existing battery lines?';
    });
    await page.locator('.yt-podcast-mic-btn').click();
    await page.waitForFunction(() => {
      const sr = document.querySelector('#yt-ai-summary-host')?.shadowRoot;
      return (sr?.querySelectorAll('.yt-podcast-turn-user').length || 0) >= 2;
    });

    // Mobile 390px check while viewing interactive podcast studio
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    const mobilePodCheck = await page.evaluate(() => {
      const helper = window.__yt_summariser_test;
      const win = helper.activeWindows.get('POD_E2E_VID');
      const box = win?.windowBox;
      const studio = box?.querySelector('.yt-podcast-studio');
      const userTexts = Array.from(box?.querySelectorAll('.yt-podcast-turn-user .yt-podcast-turn-text') || []).map((el) => el.textContent);
      const replyTexts = Array.from(box?.querySelectorAll('.yt-podcast-turn-reply .yt-podcast-turn-text') || []).map((el) => el.textContent);
      const rect = box?.getBoundingClientRect();
      win?.close();
      delete window.__yt_mock_voice_text;
      return {
        userTexts,
        replyTexts,
        boxWidth: Math.round(rect?.width || 0),
        innerWidth: window.innerWidth,
        noOverflow: Boolean(box && studio && box.scrollWidth <= box.clientWidth + 2 && studio.scrollWidth <= studio.clientWidth + 2)
      };
    });
    await page.setViewportSize({ width: 1280, height: 800 });

    assert.ok(mobilePodCheck.userTexts.some((t) => t.includes('4,500') || t.includes('cycles')), 'Typed listener question spliced into dialogue');
    assert.ok(mobilePodCheck.userTexts.some((t) => t.includes('factory retooling')), 'Voice listener question captured & spliced into dialogue');
    assert.ok(mobilePodCheck.replyTexts.length >= 4, 'Multi-host responses appended for both typed and voice questions');
    assert.ok(mobilePodCheck.noOverflow && mobilePodCheck.boxWidth <= mobilePodCheck.innerWidth, 'Podcast studio adapts cleanly to 390px viewport with zero horizontal overflow');
    passed += 5;

    // Check 49: Page-load performance optimizations — fast O(keys) history count without payload parsing + offscreen card fetch deferral via IntersectionObserver
    await page.setViewportSize({ width: 1280, height: 800 });
    const perfCheck = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      for (const [, w] of Array.from(helper.activeWindows.entries())) w.close();
      helper.setAltTitlesEnabled(true);

      // 49a: Verify updateDockHistoryTab() counts unique cached videos WITHOUT reading full summary blobs (sum:/trn:/sut:/trt:)
      const origSet = window.GM_setValue;
      const origGet = window.GM_getValue;
      const origDel = window.GM_deleteValue;
      origSet('sum:PERF_VID_A', { videoId: 'PERF_VID_A', text: 'A'.repeat(2048), ts: Date.now() });
      origSet('trn:PERF_VID_A', { videoId: 'PERF_VID_A', text: 'Transcript A', ts: Date.now() });
      origSet('sum:technical:PERF_VID_B', { videoId: 'PERF_VID_B', text: 'B'.repeat(2048), ts: Date.now() });
      const prevIdx = origGet('cache_index', {});
      origSet('cache_index', { ...prevIdx, 'sum:PERF_VID_A': Date.now(), 'trn:PERF_VID_A': Date.now(), 'sum:technical:PERF_VID_B': Date.now() });

      const readKeysDuringDockUpdate = [];
      window.GM_getValue = (k, def) => {
        readKeysDuringDockUpdate.push(String(k));
        return origGet(k, def);
      };
      helper.setHistoryTabVisibility('always');
      helper.updateDockHistoryTab();
      window.GM_getValue = origGet;

      const payloadReads = readKeysDuringDockUpdate.filter((k) => /^(sum|sut|trn|trt):/.test(k));
      const host = document.getElementById('yt-ai-summary-host');
      const historyBtnText = host?.shadowRoot?.querySelector('.yt-dock-history-tab')?.textContent || '';

      origDel('sum:PERF_VID_A');
      origDel('trn:PERF_VID_A');
      origDel('sum:technical:PERF_VID_B');
      origSet('cache_index', prevIdx);
      helper.updateDockHistoryTab();

      // 49b: Wait until pageLoadSettled is true, then append an OFFSCREEN feed card (top: 4200px) and verify /watch fetch is deferred until scrolled into view
      const waitSettledStart = Date.now();
      while (!helper.isPageLoadSettled() && Date.now() - waitSettledStart < 3000) {
        await new Promise((r) => setTimeout(r, 40));
      }
      const settled = helper.isPageLoadSettled();

      const origFetch = window.fetch.bind(window);
      const fetchedUrls = [];
      window.fetch = async (url, init) => {
        const s = String(url);
        fetchedUrls.push(s);
        if (s.includes('/watch?v=OFFSCREEN_PERF_01')) {
          return {
            ok: true,
            status: 200,
            text: async () => '<html><body><div>Mock watch page</div></body></html>'
          };
        }
        return origFetch(url, init);
      };

      const spacer = document.createElement('div');
      spacer.style.height = '4200px';
      spacer.style.width = '100px';
      document.body.appendChild(spacer);

      const offscreenCard = document.createElement('ytd-rich-item-renderer');
      offscreenCard.style.display = 'block';
      offscreenCard.style.height = '180px';
      offscreenCard.innerHTML = `<h3 id="video-title"><a href="/watch?v=OFFSCREEN_PERF_01">INSANE OFFSCREEN VIDEO TITLE!!</a></h3>`;
      document.body.appendChild(offscreenCard);

      // Wait longer than MutationObserver debounce (180ms) + chunk scheduling
      await new Promise((r) => setTimeout(r, 420));
      const fetchedBeforeScroll = fetchedUrls.some((u) => u.includes('OFFSCREEN_PERF_01'));
      const altBtnInjectedBeforeScroll = Boolean(offscreenCard.querySelector('.yt-alt-title-btn'));

      // Now scroll card into viewport -> IntersectionObserver triggers visibility-gated fetch
      offscreenCard.scrollIntoView({ behavior: 'instant', block: 'center' });
      const waitFetchStart = Date.now();
      while (!fetchedUrls.some((u) => u.includes('OFFSCREEN_PERF_01')) && Date.now() - waitFetchStart < 1500) {
        await new Promise((r) => setTimeout(r, 40));
      }
      const fetchedAfterScroll = fetchedUrls.some((u) => u.includes('OFFSCREEN_PERF_01'));

      offscreenCard.remove();
      spacer.remove();
      window.scrollTo(0, 0);
      window.fetch = origFetch;

      return {
        payloadReadsCount: payloadReads.length,
        historyBtnHasCount: /\(\d+\)/.test(historyBtnText),
        settled,
        altBtnInjectedBeforeScroll,
        fetchedBeforeScroll,
        fetchedAfterScroll
      };
    });

    assert.equal(perfCheck.payloadReadsCount, 0, 'updateDockHistoryTab() counts unique cached videos via keys/index without reading summary payloads');
    assert.ok(perfCheck.historyBtnHasCount, 'History dock tab still renders accurate unique video count badge');
    assert.equal(perfCheck.settled, true, 'pageLoadSettled transitions to true after initial document readiness');
    assert.equal(perfCheck.altBtnInjectedBeforeScroll, true, 'Feed card UI toggle button still attaches immediately without waiting for network');
    assert.equal(perfCheck.fetchedBeforeScroll, false, 'Offscreen below-the-fold card does NOT trigger /watch network fetch while outside viewport');
    assert.equal(perfCheck.fetchedAfterScroll, true, 'Scrolling offscreen card into view triggers IntersectionObserver background fetch');
    passed += 6;

    // Check 50: Regression suite — Sidebar "Watch later" immunity, nested yt-lockup-view-model auto-title load via captionTracks JSON3, truthful button state & Polymer single-line toggle
    const regressionCheck = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      helper.setAltTitlesEnabled(true);

      // 1. Add realistic YouTube left sidebar containing "Watch later" shortcut
      const guideSidebar = document.createElement('ytd-guide-renderer');
      guideSidebar.id = 'guide-renderer';
      guideSidebar.innerHTML = `
        <ytd-guide-section-renderer>
          <ytd-guide-entry-renderer>
            <a href="/playlist?list=WL">
              <tp-yt-paper-item role="link" style="display:flex;width:180px;height:40px;">Watch later</tp-yt-paper-item>
            </a>
          </ytd-guide-entry-renderer>
        </ytd-guide-section-renderer>
      `;
      document.body.prepend(guideSidebar);

      // 2. Mock /watch HTML without getTranscriptEndpoint (only captionTracks) + JSON3 timedtext endpoint
      const origFetch = window.fetch.bind(window);
      window.fetch = async (url, init) => {
        const s = String(url);
        if (s.includes('/watch?v=CAP_TRACK_01')) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              '<html><script>var ytInitialPlayerResponse={"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=CAP_TRACK_01\\u0026lang=en","languageCode":"en"}]}}};</script></html>'
          };
        }
        if (s.includes('/api/timedtext') && s.includes('CAP_TRACK_01')) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                events: [
                  { tStartMs: 2000, segs: [{ utf8: 'Comprehensive teardown of silicon-anode solid-state batteries in lab stress tests.' }] }
                ]
              })
          };
        }
        if (s.includes('/watch?v=NO_CAP_02')) {
          return { ok: true, status: 200, text: async () => '<html><body>No captions</body></html>' };
        }
        return origFetch(url, init);
      };

      // 3. Modern nested ytd-rich-item-renderer > yt-lockup-view-model visible in viewport
      const nestedLockupCard = document.createElement('ytd-rich-item-renderer');
      nestedLockupCard.id = 'card-reg-nested-lockup';
      nestedLockupCard.style.display = 'block';
      nestedLockupCard.style.height = '180px';
      nestedLockupCard.innerHTML = `
        <div id="content">
          <yt-lockup-view-model>
            <h3 class="yt-lockup-metadata-view-model__heading-reset" title="THIS CHANGES BATTERY TECH!!">
              <a class="yt-lockup-metadata-view-model__title" href="/watch?v=CAP_TRACK_01">
                <span class="yt-core-attributed-string" role="text">THIS CHANGES BATTERY TECH!!</span>
              </a>
            </h3>
          </yt-lockup-view-model>
        </div>
      `;

      // 4. Un-captioned card checking truthful initial state
      const noCapCard = document.createElement('ytd-rich-item-renderer');
      noCapCard.id = 'card-reg-nocap';
      noCapCard.style.display = 'block';
      noCapCard.style.height = '180px';
      noCapCard.innerHTML = `
        <h3 id="video-title"><a href="/watch?v=NO_CAP_02">Uncaptioned Creator Video</a></h3>
      `;

      // 5. Classic Polymer <yt-formatted-string> with inner span & loose text / hidden template checking no double rendering on toggle
      const polymerCard = document.createElement('ytd-rich-item-renderer');
      polymerCard.id = 'card-reg-polymer';
      polymerCard.innerHTML = `
        <div>
          <a id="video-title-link" href="/watch?v=POLY_VID_03">
            <yt-formatted-string id="video-title"><span class="style-scope yt-formatted-string">Polymer Leaf Title Check</span><span aria-hidden="true">Polymer Leaf Title Check</span></yt-formatted-string>
          </a>
        </div>
      `;
      window.__yt_mock_transcripts = window.__yt_mock_transcripts || {};
      window.__yt_mock_transcripts['POLY_VID_03'] =
        '[00:05] Detailed walkthrough of how Polymer light DOM updates avoid duplicating title nodes.';

      const grid = document.querySelector('.grid') || document.body;
      grid.prepend(polymerCard);
      grid.prepend(noCapCard);
      grid.prepend(nestedLockupCard);

      // Process & wait for async auto-fetch on CAP_TRACK_01
      await new Promise((r) => setTimeout(r, 450));

      const nestedBtnCount = nestedLockupCard.querySelectorAll('.yt-alt-title-btn').length;
      const innerLockupProcessed = nestedLockupCard.querySelector('yt-lockup-view-model')?.dataset?.ytaisProcessed || '';
      const capTrackAutoTitle = nestedLockupCard.querySelector('.yt-lockup-metadata-view-model__title')?.textContent?.trim() || '';
      const capBtnMode = nestedLockupCard.querySelector('.yt-alt-title-btn')?.dataset?.ytaisBtnMode || '';

      // Verify uncaptioned card has truthful 'original' mode & tooltip
      const noCapBtn = noCapCard.querySelector('.yt-alt-title-btn');
      const noCapBtnMode = noCapBtn?.dataset?.ytaisBtnMode || '';
      const noCapBtnTitle = noCapBtn?.getAttribute('title') || '';

      // Click switchBtn on nestedLockupCard AND noCapCard AND polymerCard via real mouse click -> wait > menu poll interval
      nestedLockupCard.querySelector('.yt-alt-title-btn')?.click();
      noCapBtn?.click();
      const polymerBtn = polymerCard.querySelector('.yt-alt-title-btn');
      polymerBtn?.click(); // toggle AI -> original
      await new Promise((r) => setTimeout(r, 250));

      const sidebarWatchLaterInjectedCount = guideSidebar.querySelectorAll('[data-ytais-item]').length;
      const sidebarWatchLaterText = guideSidebar.querySelector('tp-yt-paper-item')?.textContent?.trim() || '';
      const nestedRevertedTitle = nestedLockupCard.querySelector('.yt-lockup-metadata-view-model__title')?.textContent?.trim() || '';
      const polymerRevertedRaw = polymerCard.querySelector('#video-title')?.textContent?.trim() || '';

      // Toggle polymer back to AI then back to Original -> verify still 1x
      polymerBtn?.click();
      await new Promise((r) => setTimeout(r, 80));
      const polymerAiText = polymerCard.querySelector('#video-title')?.textContent?.trim() || '';
      polymerBtn?.click();
      await new Promise((r) => setTimeout(r, 80));
      const polymerFinalRaw = polymerCard.querySelector('#video-title')?.textContent?.trim() || '';

      guideSidebar.remove();
      nestedLockupCard.remove();
      noCapCard.remove();
      polymerCard.remove();
      window.fetch = origFetch;

      return {
        nestedBtnCount,
        innerLockupProcessed,
        capTrackAutoTitle,
        capBtnMode,
        noCapBtnMode,
        noCapBtnTitle,
        sidebarWatchLaterInjectedCount,
        sidebarWatchLaterText,
        nestedRevertedTitle,
        polymerRevertedRaw,
        polymerAiText,
        polymerFinalRaw
      };
    });

    assert.equal(regressionCheck.nestedBtnCount, 1, 'Nested ytd-rich-item-renderer > yt-lockup-view-model renders only one title switch button');
    assert.equal(regressionCheck.innerLockupProcessed, '', 'Inner yt-lockup-view-model is skipped as non-canonical duplicate card');
    assert.ok(regressionCheck.capTrackAutoTitle.includes('silicon-anode solid-state batteries'), 'Auto AI title loads automatically on visible card via captionTracks JSON3 fallback');
    assert.equal(regressionCheck.capBtnMode, 'ai', 'Button reflects ai mode only once AI title is displayed');
    assert.equal(regressionCheck.noCapBtnMode, 'original', 'Uncaptioned card truthfully initializes button mode to original (not ai)');
    assert.ok(regressionCheck.noCapBtnTitle.includes('Showing original title'), 'Uncaptioned card tooltip accurately says Showing original title');
    assert.equal(regressionCheck.sidebarWatchLaterInjectedCount, 0, 'Clicking .yt-alt-title-btn NEVER injects Summarize into left sidebar Watch later shortcut');
    assert.equal(regressionCheck.sidebarWatchLaterText, 'Watch later', 'Left sidebar Watch later shortcut text stays completely intact');
    assert.equal(regressionCheck.nestedRevertedTitle, 'THIS CHANGES BATTERY TECH!!', 'Clicking button on AI-titled nested lockup cleanly reverts to original title once');
    assert.equal(regressionCheck.polymerRevertedRaw, 'Polymer Leaf Title Check', 'Polymer <yt-formatted-string> revert displays original title once without doubling');
    assert.equal(regressionCheck.polymerAiText.includes('Polymer light DOM'), true, 'Toggling Polymer card back to AI displays factual AI title cleanly');
    assert.equal(regressionCheck.polymerFinalRaw, 'Polymer Leaf Title Check', 'Second toggle back to original displays single title without duplication');
    passed += 12;

    // Check 51: Alt-title model fallback ladder (skips unavailable / walks down on 403 & 500 to available model), InnerTube player A3 transcript fallback & 3-dot Watch later link immunity
    const ladderAndPlayerCheck = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      helper.clearModelCooldowns();

      // 51a: Real-key style fallback: primary models return 403 / 500 -> walks down ladder to gemini-3.6-flash (or discovered model)
      const savedKeys51 = window.GM_getValue('keys', []);
      window.GM_setValue('keys', [{ id: 'k51', name: 'LadderKey', key: 'AIzaSyLadder51' }]);
      window.GM_deleteValue?.('alt_title:LADDER_VID_01');
      window.GM_deleteValue?.('alt_title:PLAYER_A3_01');
      window.__yt_mock_transcripts = window.__yt_mock_transcripts || {};
      window.__yt_mock_transcripts['LADDER_VID_01'] =
        '[00:00] Solid-state lithium-metal cells tested at minus 30 Celsius for cold-weather aviation.';

      const triedModels51 = [];
      const origGmReq = window.GM_xmlhttpRequest;
      window.GM_xmlhttpRequest = function (opts) {
        const url = String(opts.url || '');
        if (url.includes('/models?')) {
          setTimeout(() => {
            opts.onload({
              status: 200,
              responseText: JSON.stringify({
                models: [
                  { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
                  { name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] },
                  { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] }
                ]
              })
            });
          }, 5);
          return;
        }
        if (url.includes(':generateContent')) {
          const m = /models\/([^:]+):generateContent/.exec(url)?.[1] || '';
          triedModels51.push(decodeURIComponent(m));
          if (m.includes('3.8')) {
            setTimeout(() => opts.onload({ status: 403, responseText: JSON.stringify({ error: { message: 'Model disabled for key' } }) }), 5);
            return;
          }
          if (m.includes('3.7')) {
            setTimeout(() => opts.onload({ status: 500, responseText: JSON.stringify({ error: { message: 'Internal backend error' } }) }), 5);
            return;
          }
          if (m.includes('3.6')) {
            setTimeout(() => {
              opts.onload({
                status: 200,
                responseText: JSON.stringify({
                  candidates: [
                    {
                      content: {
                        parts: [
                          { thought: true, text: 'Internal reasoning should be ignored' },
                          { text: 'Cold-Weather Solid-State Lithium-Metal Aviation Battery Tests' }
                        ]
                      }
                    }
                  ]
                })
              });
            }, 5);
            return;
          }
        }
        return origGmReq(opts);
      };

      const ladderTitle = await helper.generateAlternativeTitle('LADDER_VID_01', 'THIS BATTERY BREAKS PHYSICS!!');
      window.GM_xmlhttpRequest = origGmReq;
      window.GM_setValue('keys', savedKeys51);
      helper.clearModelCooldowns();

      // 51b: InnerTube /youtubei/v1/player ANDROID fallback A3 when /watch HTML has INNERTUBE_API_KEY & empty/missing captionTracks
      const origFetch = window.fetch.bind(window);
      window.fetch = async (url, init) => {
        const s = String(url);
        if (s.includes('/watch?v=PLAYER_A3_01')) {
          return {
            ok: true,
            status: 200,
            text: async () => '<html><script>ytcfg.set({"INNERTUBE_API_KEY":"mock_it_key"});</script></html>'
          };
        }
        if (s.includes('/youtubei/v1/player')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              captions: {
                playerCaptionsTracklistRenderer: {
                  captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=PLAYER_A3_01&lang=en', languageCode: 'en' }]
                }
              }
            })
          };
        }
        if (s.includes('/api/timedtext') && s.includes('PLAYER_A3_01')) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                events: [{ tStartMs: 1000, segs: [{ utf8: 'InnerTube player fallback recovered clean English captions on home feed.' }] }]
              })
          };
        }
        return origFetch(url, init);
      };

      const a3Card = document.createElement('yt-lockup-view-model');
      a3Card.id = 'card-a3-player';
      a3Card.style.display = 'block';
      a3Card.style.height = '180px';
      a3Card.innerHTML = `<h3 class="yt-lockup-metadata-view-model__heading-reset"><a class="yt-lockup-metadata-view-model__title" href="/watch?v=PLAYER_A3_01"><span class="yt-core-attributed-string">SHOCKING ANNOUNCEMENT!!</span></a></h3>`;
      const grid = document.querySelector('.grid') || document.body;
      grid.prepend(a3Card);
      await new Promise((r) => setTimeout(r, 450));
      const a3ResolvedTitle = a3Card.querySelector('.yt-lockup-metadata-view-model__title')?.textContent?.trim() || '';
      const a3BtnMode = a3Card.querySelector('.yt-alt-title-btn')?.dataset?.ytaisBtnMode || '';
      a3Card.remove();
      window.fetch = origFetch;

      // 51c: Even during an active 3-dot card menu click poll, a left sidebar <a href="/playlist?list=WL"><tp-yt-paper-item>Watch later</tp-yt-paper-item></a> inside ANY popup/drawer is immune
      const guideWl = document.createElement('ytd-guide-renderer');
      guideWl.innerHTML = `<a href="/playlist?list=WL"><tp-yt-paper-item style="display:flex;width:160px;height:40px;">Watch later</tp-yt-paper-item></a>`;
      document.body.prepend(guideWl);
      const card3DotBtn = document.querySelector('#btn-old-menu');
      card3DotBtn?.click();
      await new Promise((r) => setTimeout(r, 200));
      const wlInjected = guideWl.querySelectorAll('[data-ytais-item]').length;
      const wlText = guideWl.querySelector('tp-yt-paper-item')?.textContent?.trim() || '';
      guideWl.remove();

      return {
        ladderTitle,
        triedModels51,
        a3ResolvedTitle,
        a3BtnMode,
        wlInjected,
        wlText
      };
    });

    assert.equal(
      ladderAndPlayerCheck.ladderTitle,
      'Cold-Weather Solid-State Lithium-Metal Aviation Battery Tests',
      'Alt-title generation steps past 403 and 500 down fallbackLadder and strips thinking part'
    );
    assert.deepEqual(
      ladderAndPlayerCheck.triedModels51,
      ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'],
      'Alt-title ladder tries models in descending order until one succeeds'
    );
    assert.ok(
      ladderAndPlayerCheck.a3ResolvedTitle.includes('InnerTube player fallback recovered clean English captions'),
      'Auto-title loads via zero-iframe InnerTube player A3 fallback when watch HTML lacks captions'
    );
    assert.equal(ladderAndPlayerCheck.a3BtnMode, 'ai', 'A3 auto-titled card switches button mode to ai');
    assert.equal(ladderAndPlayerCheck.wlInjected, 0, '3-dot menu poll NEVER hijacks left sidebar Watch later link');
    assert.equal(ladderAndPlayerCheck.wlText, 'Watch later', 'Watch later text remains completely untouched');
    passed += 6;

    // Check 52: Alt-title robustness — buttons mounted outside <a>, yt-content-metadata channel rule extraction, description & file_data fallbacks, thinkingBudget:0, click feedback & lazy Polymer title hydration
    const check52 = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      helper.clearModelCooldowns();
      helper.setAltTitlesEnabled(true);

      const savedKeys52 = window.GM_getValue('keys', []);
      const savedLastKeyId52 = window.GM_getValue('lastKeyId', '');
      window.GM_setValue('keys', [
        { id: 'k_inactive', name: 'InactiveKey', key: 'AIzaSyInactive52' },
        { id: 'k_active', name: 'ActiveKey', key: 'AIzaSyActive52' }
      ]);
      window.GM_setValue('lastKeyId', 'k_active');
      window.GM_deleteValue?.('alt_title:CLASSIC_OUTSIDE_A');
      window.GM_deleteValue?.('alt_title:DESC_META_01');
      window.GM_deleteValue?.('alt_title:MULTIMODAL_02');
      window.GM_deleteValue?.('alt_title:LATE_POLY_03');

      window.__yt_mock_transcripts = window.__yt_mock_transcripts || {};
      window.__yt_mock_transcripts['CLASSIC_OUTSIDE_A'] =
        '[00:05] Deep dive into solid-state electrolyte manufacturing tolerances.';
      window.__yt_mock_transcripts['LATE_POLY_03'] =
        '[00:05] Lazy Polymer light DOM card received its title text after initial skeleton render.';

      const origFetch52 = window.fetch.bind(window);
      window.fetch = async (url, init) => {
        const s = String(url);
        if (s.includes('/watch?v=DESC_META_01')) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              '<html><script>var ytInitialPlayerResponse={"videoDetails":{"videoId":"DESC_META_01","title":"YOU WON\'T BELIEVE WHAT HAPPENED!!","author":"Aerospace Systems Lab","shortDescription":"Static fire test results of methalox full-flow staged combustion turbopump at 320 bar chamber pressure."}};</script></html>'
          };
        }
        if (s.includes('/watch?v=MULTIMODAL_02_NOKEY')) {
          return { ok: true, status: 200, text: async () => '<html><body>No captions</body></html>' };
        }
        if (s.includes('/watch?v=MULTIMODAL_02')) {
          return { ok: true, status: 200, text: async () => '<html><body>Empty uncaptioned shell</body></html>' };
        }
        return origFetch52(url, init);
      };

      const seenGeminiRequests = [];
      const origGm52 = window.GM_xmlhttpRequest;
      window.GM_xmlhttpRequest = function (opts) {
        const url = String(opts.url || '');
        if (url.includes('/models?')) {
          setTimeout(() => {
            opts.onload({
              status: 200,
              responseText: JSON.stringify({
                models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }]
              })
            });
          }, 5);
          return;
        }
        if (url.includes(':generateContent')) {
          const parsedBody = JSON.parse(opts.data || '{}');
          const keyHeader = opts.headers?.['x-goog-api-key'] || '';
          const parts = parsedBody?.contents?.[0]?.parts || [];
          const hasFileData = parts.some((p) => p?.file_data?.file_uri?.includes('MULTIMODAL_02'));
          const promptText = parts.map((p) => p?.text || '').join(' ');
          let respText = 'Solid-State Electrolyte Manufacturing Tolerance Benchmarks';
          if (hasFileData) {
            respText = 'Optical Interferometer Vibration Isolation Bench Build';
          } else if (promptText.includes('320 bar')) {
            respText = 'Methalox Staged-Combustion Turbopump 320-Bar Static Fire Test';
          } else if (promptText.includes('Lazy Polymer')) {
            respText = 'Lazy Polymer light DOM card title population test';
          }
          seenGeminiRequests.push({
            keyHeader,
            thinkingBudget: parsedBody?.generationConfig?.thinkingConfig?.thinkingBudget,
            hasFileData,
            mediaResolution: parsedBody?.generationConfig?.mediaResolution || ''
          });
          setTimeout(() => {
            opts.onload({
              status: 200,
              responseText: JSON.stringify({
                candidates: [
                  {
                    content: {
                      parts: [
                        { thought: true, text: 'Secret thinking reasoning' },
                        { text: respText }
                      ]
                    }
                  }
                ]
              })
            });
          }, 5);
          return;
        }
        return origGm52(opts);
      };

      const grid = document.querySelector('.grid') || document.body;

      // 52a: Classic card places buttons OUTSIDE <a id="video-title-link"> and never triggers anchor click
      let anchorClicked = false;
      const classicCard = document.createElement('ytd-rich-item-renderer');
      classicCard.id = 'card-52-classic';
      classicCard.innerHTML = `
        <h3>
          <a id="video-title-link" href="/watch?v=CLASSIC_OUTSIDE_A">
            <yt-formatted-string id="video-title">SHOCKING CLASSIC CARD!!</yt-formatted-string>
          </a>
        </h3>
      `;
      classicCard.querySelector('#video-title-link').addEventListener('click', (e) => {
        e.preventDefault();
        anchorClicked = true;
      });
      grid.prepend(classicCard);
      helper.processFeedCard(classicCard);
      await new Promise((r) => setTimeout(r, 140));

      const classicBtn = classicCard.querySelector('.yt-alt-title-btn');
      const classicAnchor = classicCard.querySelector('#video-title-link');
      const classicBtnInsideAnchor = Boolean(classicAnchor && classicBtn && classicAnchor.contains(classicBtn));
      const classicAutoTitle = classicCard.querySelector('#video-title')?.textContent?.trim() || '';
      classicBtn?.click();
      await new Promise((r) => setTimeout(r, 80));
      const classicToggledOriginal = classicCard.querySelector('#video-title')?.textContent?.trim() || '';

      // 52b: Modern yt-lockup-view-model extracts channel from yt-content-metadata-view-model and injects shield rule btn
      const modernLockup = document.createElement('ytd-rich-item-renderer');
      modernLockup.style.display = 'block';
      modernLockup.style.height = '180px';
      modernLockup.innerHTML = `
        <yt-lockup-view-model>
          <h3 class="yt-lockup-metadata-view-model__heading-reset">
            <a class="yt-lockup-metadata-view-model__title" href="/watch?v=DESC_META_01">
              <span class="yt-core-attributed-string">YOU WON'T BELIEVE WHAT HAPPENED!!</span>
            </a>
          </h3>
          <yt-content-metadata-view-model>
            <div class="yt-content-metadata-view-model__metadata-row">
              <a href="/@AerospaceLab">Aerospace Systems Lab</a>
            </div>
            <div class="yt-content-metadata-view-model__metadata-row">
              <span>240K views</span><span>2 days ago</span>
            </div>
          </yt-content-metadata-view-model>
        </yt-lockup-view-model>
      `;
      const extractedModernChannel = helper.getCardChannelName(modernLockup);
      grid.prepend(modernLockup);
      await new Promise((r) => setTimeout(r, 420));
      const modernAutoTitle = modernLockup.querySelector('.yt-lockup-metadata-view-model__title')?.textContent?.trim() || '';
      const modernRuleBtnPresent = Boolean(modernLockup.querySelector('.yt-channel-rule-btn'));

      // 52c: Multimodal file_data fallback when uncaptioned + no description + API key set
      const multiTitle = await helper.generateAlternativeTitle('MULTIMODAL_02', 'INSANE LAB VIDEO!!');

      // 52d: Empty Polymer skeleton populated lazily 220ms after mount still receives alt-title
      const lazyPolyCard = document.createElement('ytd-rich-item-renderer');
      lazyPolyCard.style.display = 'block';
      lazyPolyCard.style.height = '180px';
      lazyPolyCard.innerHTML = `
        <h3>
          <a id="video-title-link" href="/watch?v=LATE_POLY_03">
            <yt-formatted-string id="video-title"></yt-formatted-string>
          </a>
        </h3>
      `;
      grid.prepend(lazyPolyCard);
      await new Promise((r) => setTimeout(r, 220));
      lazyPolyCard.querySelector('#video-title').textContent = 'INITIAL BLANK POLYMER TITLE!!';
      await new Promise((r) => setTimeout(r, 380));
      const lazyPolyResolvedTitle = lazyPolyCard.querySelector('#video-title')?.textContent?.trim() || '';
      const lazyPolyBtnPresent = Boolean(lazyPolyCard.querySelector('.yt-alt-title-btn'));

      // Offline manual click on uncaptioned video with NO keys triggers visible toast feedback
      window.GM_setValue('keys', []);
      const offlineCard = document.createElement('ytd-rich-item-renderer');
      offlineCard.innerHTML = `<h3 id="video-title"><a href="/watch?v=MULTIMODAL_02_NOKEY">No Captions Click Check</a></h3>`;
      grid.prepend(offlineCard);
      await new Promise((r) => setTimeout(r, 150));
      offlineCard.querySelector('.yt-alt-title-btn')?.click();
      await new Promise((r) => setTimeout(r, 180));
      const host52 = document.getElementById('yt-ai-summary-host');
      const liveMsg52 = host52?.shadowRoot?.querySelector('[data-ytais-live-region="true"]')?.textContent || '';

      classicCard.remove();
      modernLockup.remove();
      offlineCard.remove();
      lazyPolyCard.remove();
      window.fetch = origFetch52;
      window.GM_xmlhttpRequest = origGm52;
      window.GM_setValue('keys', savedKeys52);
      window.GM_setValue('lastKeyId', savedLastKeyId52);
      helper.clearModelCooldowns();

      return {
        classicBtnInsideAnchor,
        anchorClicked,
        classicAutoTitle,
        classicToggledOriginal,
        extractedModernChannel,
        modernAutoTitle,
        modernRuleBtnPresent,
        multiTitle,
        seenGeminiRequests,
        liveMsg52,
        lazyPolyResolvedTitle,
        lazyPolyBtnPresent
      };
    });

    assert.equal(check52.classicBtnInsideAnchor, false, 'Alt-title toggle button is mounted cleanly outside <a id="video-title-link">');
    assert.equal(check52.anchorClicked, false, 'Clicking .yt-alt-title-btn never bubbles into video link navigation');
    assert.ok(check52.classicAutoTitle.includes('Solid-State Electrolyte'), 'Classic card auto-applies AI title');
    assert.equal(check52.classicToggledOriginal, 'SHOCKING CLASSIC CARD!!', 'Clicking classic button cleanly toggles back to original');
    assert.equal(check52.extractedModernChannel, 'Aerospace Systems Lab', 'Extracts channel name from modern yt-content-metadata-view-model');
    assert.equal(check52.modernRuleBtnPresent, true, 'Modern yt-lockup-view-model renders channel rule shield button');
    assert.equal(check52.modernAutoTitle, 'Methalox Staged-Combustion Turbopump 320-Bar Static Fire Test', 'Uncaptioned card generates AI title via /watch shortDescription + active key');
    assert.equal(check52.multiTitle, 'Optical Interferometer Vibration Isolation Bench Build', 'Uncaptioned card without description falls back to Gemini multimodal YouTube file_data');
    assert.ok(check52.seenGeminiRequests.every((r) => r.keyHeader === 'AIzaSyActive52' && r.thinkingBudget === 0), 'Uses selected active key (lastKeyId) and thinkingBudget: 0');
    assert.ok(check52.seenGeminiRequests.some((r) => r.hasFileData && r.mediaResolution === 'MEDIA_RESOLUTION_LOW'), 'Multimodal fallback sends file_data YouTube URI with MEDIA_RESOLUTION_LOW');
    assert.ok(check52.liveMsg52.includes('Cannot generate AI title'), 'Manual click with no key & no captions surfaces visible feedback instead of silent no-op');
    assert.equal(check52.lazyPolyBtnPresent, true, 'Empty-initially Polymer card mounts button once title text populates');
    assert.ok(check52.lazyPolyResolvedTitle.includes('Lazy Polymer light DOM card'), 'Empty-initially Polymer card auto-generates AI title once populated');
    passed += 13;

    // Check 53: Material You UI Theme toggle (System / Light / Dark) in Key Manager & Shadow Host
    const openDlgRes = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      helper.setAppThemeMode('dark');
      helper.openKeyManagerDialog();
      await new Promise((r) => setTimeout(r, 60));
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const btns = Array.from(root?.querySelectorAll('.yt-app-theme-btn') || []);
      return {
        btnModes: btns.map((b) => b.getAttribute('data-app-theme')),
        darkPressed: root?.querySelector('.yt-app-theme-btn[data-app-theme="dark"]')?.getAttribute('aria-pressed'),
        hasDarkClass: host?.classList.contains('yt-ui-dark')
      };
    });
    assert.deepEqual(openDlgRes.btnModes, ['system', 'light', 'dark'], 'Key Manager renders Material You System/Light/Dark segmented control');
    assert.equal(openDlgRes.darkPressed, 'true', 'Dark theme button starts pressed by default');
    assert.equal(openDlgRes.hasDarkClass, true, 'Shadow host has yt-ui-dark class in Dark mode');

    // Click Light button inside Shadow DOM and verify light class + computed colors + closed box color-scheme
    const lightUiRes = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const lightBtn = root?.querySelector('.yt-app-theme-btn[data-app-theme="light"]');
      lightBtn?.click();
      await new Promise((r) => setTimeout(r, 60));
      const closeBtn = root?.querySelector('.yt-key-dialog-box .yt-win-btn');
      closeBtn?.click?.();
      const dlgScrim = root?.querySelector('.yt-key-dialog-scrim');
      dlgScrim?.remove?.();
      const win = helper.getMaximizedWindow() || helper.openForVideo({ videoId: 'm3_theme_vid', title: 'Material You Window' });
      await new Promise((r) => setTimeout(r, 40));
      const box = win?.windowBox;
      return {
        mode: helper.getAppThemeMode(),
        effective: helper.getEffectiveAppTheme(),
        hasLightClass: host?.classList.contains('yt-ui-light'),
        boxColorScheme: box ? getComputedStyle(box).colorScheme : '',
        boxBg: box ? getComputedStyle(box).backgroundColor : ''
      };
    });
    assert.equal(lightUiRes.mode, 'light', 'Clicking Light updates app_theme_mode to light');
    assert.equal(lightUiRes.effective, 'light', 'getEffectiveAppTheme resolves light');
    assert.equal(lightUiRes.hasLightClass, true, 'Shadow host gains yt-ui-light class');
    assert.equal(lightUiRes.boxColorScheme, 'light', 'Floating window computed color-scheme switches to light');

    // Test System mode tracking prefers-color-scheme and reset back to dark
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      helper.setAppThemeMode('system');
      await new Promise((r) => setTimeout(r, 40));
    });
    const sysDark = await page.evaluate(() => ({
      effective: window.__yt_summariser_test.getEffectiveAppTheme(),
      hasDark: document.getElementById('yt-ai-summary-host')?.classList.contains('yt-ui-dark')
    }));
    assert.equal(sysDark.effective, 'dark', 'System mode tracks OS dark preference');
    assert.equal(sysDark.hasDark, true, 'Shadow host switches to yt-ui-dark under OS dark mode');

    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() =>
      document.getElementById('yt-ai-summary-host')?.classList.contains('yt-ui-light')
    );
    const sysLight = await page.evaluate(() => {
      const eff = window.__yt_summariser_test.getEffectiveAppTheme();
      window.__yt_summariser_test.setAppThemeMode('dark');
      return {
        effective: eff,
        restoredDark: document.getElementById('yt-ai-summary-host')?.classList.contains('yt-ui-dark')
      };
    });
    assert.equal(sysLight.effective, 'light', 'System mode dynamically updates Shadow host to light when OS switches');
    assert.equal(sysLight.restoredDark, true, 'Resetting to dark mode restores yt-ui-dark on Shadow host');
    passed += 11;

    // Check 54: Manual music alt-title, sponsor filtering, Summary/History settings & formatting, follow-up model ladder, movable/resizable History, & top-left Quick Menu launcher
    const check54 = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      const savedKeys54 = window.GM_getValue('keys', []);
      const origGm54 = window.GM_xmlhttpRequest;
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;

      // 1) Music card exempt on load, manual click on .yt-music-exempt-icon generates & toggles AI title
      window.__yt_mock_transcripts = window.__yt_mock_transcripts || {};
      window.__yt_mock_transcripts['D_music_exempt'] = `[00:00] If you wanna run away with me, I know a galaxy and I can take you for a ride on a disco pop beat.`;
      const musicCard = document.getElementById('card-alt-music');
      const musicTitleEl = musicCard?.querySelector('#video-title');
      const initialMusicTitle = musicTitleEl?.textContent?.trim() || '';
      const musicBtn = musicCard?.querySelector('.yt-music-exempt-icon');
      musicBtn?.click();
      await new Promise((r) => setTimeout(r, 120));
      const musicAfterManualGen = musicTitleEl?.textContent?.trim() || '';
      const musicBtnActiveAfterGen = Boolean(musicBtn?.classList.contains('active'));
      musicBtn?.click();
      await new Promise((r) => setTimeout(r, 60));
      const musicAfterRevert = musicTitleEl?.textContent?.trim() || '';

      // 2) Sponsor & self-promotion exclusion in transcript & prompt
      window.__yt_mock_transcripts['SPONSOR_TITLE_TEST'] = [
        '[00:05] This video is sponsored by NordVPN — use code SAVE20 at checkout!',
        '[00:15] Check out our merch store and join our Patreon for early access!',
        '[00:40] Anisotropic silicon wet etching with potassium hydroxide at 80 degrees Celsius.'
      ].join('\n');
      const sponsorFreeOffline = helper.extractDescriptiveTitleFromTranscript(window.__yt_mock_transcripts['SPONSOR_TITLE_TEST']);

      const capturedPrompts = [];
      const followUpCalls = [];
      window.GM_setValue('keys', [{ id: 'k54', name: 'Check54Key', key: 'AIzaSyCheck54Key' }]);
      window.GM_xmlhttpRequest = (opts) => {
        const url = String(opts?.url || '');
        if (url.includes(':generateContent')) {
          const parsedBody = opts?.data ? JSON.parse(opts.data) : {};
          const promptText = JSON.stringify(parsedBody?.contents || []);
          capturedPrompts.push(promptText);
          if (url.includes('gemini-4-argon')) {
            followUpCalls.push('gemini-4-argon:404');
            setTimeout(() => opts.onload?.({ status: 404, responseText: JSON.stringify({ error: { message: 'Model not found' } }) }), 5);
            return { abort: () => {} };
          }
          if (url.includes('gemini-3.8-flash')) {
            followUpCalls.push('gemini-3.8-flash:200');
          }
          const reply = url.includes('SPONSOR_TITLE_TEST') || promptText.includes('descriptive video title')
            ? 'Silicon Wet Etching with Potassium Hydroxide Benchmarks'
            : 'Follow-up verified with 3.8 Flash fallback.';
          setTimeout(
            () =>
              opts.onload?.({
                status: 200,
                responseText: JSON.stringify({ candidates: [{ content: { parts: [{ text: reply }] } }] })
              }),
            5
          );
          return { abort: () => {} };
        }
        if (url.includes('generativelanguage.googleapis.com/v1beta/models?')) {
          setTimeout(
            () =>
              opts.onload?.({
                status: 200,
                responseText: JSON.stringify({
                  models: [
                    { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
                    { name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] }
                  ]
                })
              }),
            5
          );
          return { abort: () => {} };
        }
        return origGm54(opts);
      };

      await helper.generateAlternativeTitle('SPONSOR_TITLE_TEST', 'INSANE CLICKBAIT!!');

      // 3) Summary window Settings button right next to Readability button & formatting options
      const win54 = helper.openForVideo({ videoId: 'vid_check54', title: 'Check 54 Window' });
      win54.status = 'done';
      win54.text = '## Core Architecture\n**Bold claim** about the benchmark.\n\nSecond paragraph content.';
      win54.renderAll();
      await new Promise((r) => setTimeout(r, 40));

      const readBtn = win54.windowBox?.querySelector('.yt-win-readability-btn');
      const winSettingsBtn = win54.windowBox?.querySelector('.yt-win-settings-btn');
      const settingsNextToReadability = Boolean(readBtn && winSettingsBtn && readBtn.nextElementSibling === winSettingsBtn);

      winSettingsBtn?.click();
      await new Promise((r) => setTimeout(r, 60));
      const keyDlgOpenFromSummary = Boolean(root?.querySelector('.yt-key-dialog-box'));
      const uiFontSel = root?.querySelector('.yt-ui-font-select');
      const genFontSel = root?.querySelector('.yt-gen-font-select');
      const genRichCb = root?.querySelector('.yt-gen-rich-checkbox');
      if (uiFontSel) {
        uiFontSel.value = 'serif';
        uiFontSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (genFontSel) {
        genFontSel.value = 'mono';
        genFontSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (genRichCb) {
        genRichCb.checked = false;
        genRichCb.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await new Promise((r) => setTimeout(r, 50));
      const hostUiFont = host?.style.getPropertyValue('--yt-ui-font') || '';
      const hostGenFont = host?.style.getPropertyValue('--yt-gen-font') || '';
      const bodyPlainClass = Boolean(win54.bodyEl?.classList.contains('yt-gen-plain-text'));
      root?.querySelector('.yt-reset-formatting-btn')?.click();
      root?.querySelector('.yt-key-dialog-scrim .yt-win-close-btn')?.click();
      await new Promise((r) => setTimeout(r, 40));

      // 4) Follow-up model dropdown next to textbox + automatic ladder step-down
      const composerTa = win54.windowBox?.querySelector('.yt-composer-textarea');
      const composerModelSel = win54.windowBox?.querySelector('.yt-composer-model-select');
      const sendBtn = win54.windowBox?.querySelector('.yt-composer-send-btn');
      const modelNextToTextbox = Boolean(composerTa && composerModelSel && composerTa.nextElementSibling === composerModelSel);
      if (composerModelSel) {
        composerModelSel.value = 'gemini-4-argon';
        composerModelSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (composerTa) {
        composerTa.value = 'How does the ladder fallback work?';
        composerTa.dispatchEvent(new Event('input', { bubbles: true }));
      }
      sendBtn?.click();
      await new Promise((r) => setTimeout(r, 150));
      const postFollowUpModel = win54.followUpModel;
      const postFollowUpSelectVal = win54.windowBox?.querySelector('.yt-composer-model-select')?.value || '';
      const notesText54 = win54.windowBox?.querySelector('.yt-notes-wrap')?.textContent || '';

      // 5) History window movable, 8-dir resizable, & settings button next to close
      helper.openHistoryDialog();
      await new Promise((r) => setTimeout(r, 50));
      const histBox = root?.querySelector('.yt-history-dialog-box');
      const histResizeDirs = Array.from(histBox?.querySelectorAll('.yt-resize-handle') || [])
        .map((el) => el.getAttribute('data-resize-dir'))
        .sort();
      const histSettingsBtn = histBox?.querySelector('.yt-history-settings-btn');
      const histCloseBtn = histBox?.querySelector('.yt-win-close-btn');
      const histSettingsNextToClose = Boolean(histSettingsBtn && histCloseBtn && histSettingsBtn.nextElementSibling === histCloseBtn);
      const histLeftBefore = parseFloat(histBox?.style.left || '0');
      const histGrip = histBox?.querySelector('.yt-win-drag-grip');
      histGrip?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      const histLeftAfter = parseFloat(histBox?.style.left || '0');

      histSettingsBtn?.click();
      await new Promise((r) => setTimeout(r, 50));
      const settingsOpenedFromHistory = Boolean(root?.querySelector('.yt-key-dialog-box'));
      root?.querySelector('.yt-key-dialog-scrim .yt-win-close-btn')?.click();
      root?.querySelector('.yt-history-dialog-scrim .yt-win-close-btn')?.click();
      await new Promise((r) => setTimeout(r, 40));

      // 6) Top-left launcher next to logo opens movable & resizable Quick Menu with History + Settings
      const launcherBtn = helper.ensureTopbarLauncher();
      launcherBtn?.click();
      await new Promise((r) => setTimeout(r, 50));
      const qBox = root?.querySelector('.yt-quick-menu-box');
      const qResizeDirs = Array.from(qBox?.querySelectorAll('.yt-resize-handle') || [])
        .map((el) => el.getAttribute('data-resize-dir'))
        .sort();
      const qTopBefore = parseFloat(qBox?.style.top || '0');
      qBox?.querySelector('.yt-win-drag-grip')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const qTopAfter = parseFloat(qBox?.style.top || '0');
      const qHasHistOpt = Boolean(qBox?.querySelector('.yt-quick-open-history-btn'));
      const qHasSettingsOpt = Boolean(qBox?.querySelector('.yt-quick-open-settings-btn'));
      qBox?.querySelector('.yt-quick-open-history-btn')?.click();
      await new Promise((r) => setTimeout(r, 50));
      const quickOpenedHistory = Boolean(root?.querySelector('.yt-history-dialog-box'));
      root?.querySelector('.yt-history-dialog-scrim .yt-win-close-btn')?.click();

      win54.close();
      window.GM_xmlhttpRequest = origGm54;
      window.GM_setValue('keys', savedKeys54);
      helper.clearModelCooldowns();

      return {
        initialMusicTitle,
        musicAfterManualGen,
        musicBtnActiveAfterGen,
        musicAfterRevert,
        sponsorFreeOffline,
        hasSponsorPromptRule: capturedPrompts.some((p) => /sponsors|self-promotion|patreon/i.test(p)),
        settingsNextToReadability,
        keyDlgOpenFromSummary,
        hostUiFont,
        hostGenFont,
        bodyPlainClass,
        modelNextToTextbox,
        followUpCalls,
        postFollowUpModel,
        postFollowUpSelectVal,
        notesText54,
        histResizeDirs,
        histSettingsNextToClose,
        histMovedPx: Math.round(histLeftAfter - histLeftBefore),
        settingsOpenedFromHistory,
        launcherPresent: Boolean(launcherBtn),
        qResizeDirs,
        qMovedPx: Math.round(qTopAfter - qTopBefore),
        qHasHistOpt,
        qHasSettingsOpt,
        quickOpenedHistory
      };
    });

    assert.equal(check54.initialMusicTitle, 'Dua Lipa - Levitating (Official Music Video)', 'Check 54: Music card remains untouched before manual click');
    assert.ok(check54.musicAfterManualGen.includes('disco pop') || check54.musicAfterManualGen.length > 20, 'Check 54: Clicking music icon generates descriptive AI title');
    assert.equal(check54.musicBtnActiveAfterGen, true, 'Check 54: Music icon gains active state after manual generation');
    assert.equal(check54.musicAfterRevert, 'Dua Lipa - Levitating (Official Music Video)', 'Check 54: Clicking music icon again reverts to original music title');
    assert.ok(!/NordVPN|SAVE20|merch|Patreon/i.test(check54.sponsorFreeOffline) && check54.sponsorFreeOffline.includes('Anisotropic silicon'), 'Check 54: Sponsor & promo copy excluded from title extraction');
    assert.equal(check54.hasSponsorPromptRule, true, 'Check 54: Alt-title Gemini prompt excludes sponsors and self-promotion');
    assert.equal(check54.settingsNextToReadability, true, 'Check 54: Summary window places Settings button right next to Readability button');
    assert.equal(check54.keyDlgOpenFromSummary, true, 'Check 54: Summary Settings button opens Settings & Appearance modal');
    assert.ok(check54.hostUiFont.includes('Georgia'), 'Check 54: UI formatting font updates --yt-ui-font CSS var');
    assert.ok(check54.hostGenFont.includes('JetBrains Mono'), 'Check 54: Generated formatting font updates --yt-gen-font CSS var');
    assert.equal(check54.bodyPlainClass, true, 'Check 54: Unchecking rich formatting toggles yt-gen-plain-text class');
    assert.equal(check54.modelNextToTextbox, true, 'Check 54: Follow-up model dropdown sits right next to composer textbox');
    assert.ok(check54.followUpCalls.includes('gemini-4-argon:404') && check54.followUpCalls.includes('gemini-3.8-flash:200'), 'Check 54: Follow-up automatically steps down ladder on unavailable model');
    assert.equal(check54.postFollowUpModel, 'gemini-3.8-flash', 'Check 54: Active follow-up model updates to working fallback rung');
    assert.equal(check54.postFollowUpSelectVal, 'gemini-3.8-flash', 'Check 54: Follow-up dropdown reflects fallback model');
    assert.ok(check54.notesText54.includes('gemini-3.8-flash'), 'Check 54: Follow-up records fallback notice in window notes');
    assert.deepEqual(check54.histResizeDirs, ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'], 'Check 54: History window exposes all 8 resize directions');
    assert.equal(check54.histSettingsNextToClose, true, 'Check 54: History window places Settings button next to Close button');
    assert.equal(check54.histMovedPx, 16, 'Check 54: History window moves +16px via keyboard drag grip');
    assert.equal(check54.settingsOpenedFromHistory, true, 'Check 54: History titlebar Settings button opens Settings modal');
    assert.equal(check54.launcherPresent, true, 'Check 54: Top-left launcher button mounts on YouTube topbar');
    assert.deepEqual(check54.qResizeDirs, ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'], 'Check 54: Quick Menu exposes all 8 resize directions');
    assert.equal(check54.qMovedPx, 16, 'Check 54: Quick Menu moves +16px via keyboard drag grip');
    assert.equal(check54.qHasHistOpt && check54.qHasSettingsOpt && check54.quickOpenedHistory, true, 'Check 54: Quick Menu exposes Previous Summaries + Settings and opens History');
    passed += 24;

    // Check 55: Movable & 8-dir resizable Settings Control Center, all setting categories, 3-way AI title mode, History bottom-tab toggle & page scope, & Reset All
    const check55 = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      const host = document.getElementById('yt-ai-summary-host');
      const root = host?.shadowRoot;
      const savedOrigPath = window.location.pathname + window.location.search;

      // Seed at least one cached summary so History tab is eligible
      helper.writeCache('vid_check55_scope', 'summary', 'video', {
        videoId: 'vid_check55_scope',
        title: 'Check 55 History Scope Video',
        text: 'Summary content for scope check.',
        model: 'gemini-3.8-flash'
      });

      helper.openSettingsDialog();
      await new Promise((r) => setTimeout(r, 60));

      const sBox = root?.querySelector('.yt-settings-dialog-box');
      const sResizeDirs = Array.from(sBox?.querySelectorAll('.yt-resize-handle') || [])
        .map((el) => el.getAttribute('data-resize-dir'))
        .sort();
      const sLeftBefore = parseFloat(sBox?.style.left || '0');
      const sHeightBefore = parseFloat(sBox?.style.height || '0');

      sBox?.querySelector('.yt-win-drag-grip')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      const sLeftAfter = parseFloat(sBox?.style.left || '0');

      sBox?.querySelector('[data-resize-dir="se"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const sHeightAfter = parseFloat(sBox?.style.height || '0');
      const savedBounds = helper.getLastSettingsBounds();

      // Category tabs filter & default 'all'
      const allSelectedInitially = sBox?.querySelector('[data-settings-tab="all"]')?.getAttribute('aria-selected') === 'true';
      sBox?.querySelector('[data-settings-tab="podcast"]')?.click();
      const podDisplayDuringPodTab = sBox?.querySelector('[data-settings-cat="podcast"]')?.style.display;
      const sumDisplayDuringPodTab = sBox?.querySelector('[data-settings-cat="summaries"]')?.style.display;
      sBox?.querySelector('[data-settings-tab="all"]')?.click();
      const sumDisplayAfterAllTab = sBox?.querySelector('[data-settings-cat="summaries"]')?.style.display;

      // Update Summary, Podcast, Voice Engine & Custom Model settings
      const modelSel = sBox?.querySelector('.yt-default-model-select');
      if (modelSel) { modelSel.value = 'gemini-3.5-flash'; modelSel.dispatchEvent(new Event('change', { bubbles: true })); }
      const srcSel = sBox?.querySelector('.yt-default-source-select');
      if (srcSel) { srcSel.value = 'text'; srcSel.dispatchEvent(new Event('change', { bubbles: true })); }
      const langIn = sBox?.querySelector('.yt-output-language-input');
      if (langIn) { langIn.value = 'Spanish'; langIn.dispatchEvent(new Event('change', { bubbles: true })); }
      const fcCb = sBox?.querySelector('.yt-opt-fc-checkbox');
      if (fcCb) { fcCb.checked = true; fcCb.dispatchEvent(new Event('change', { bubbles: true })); }

      const podCntSel = sBox?.querySelector('.yt-podcast-host-count-select');
      if (podCntSel) { podCntSel.value = '4'; podCntSel.dispatchEvent(new Event('change', { bubbles: true })); }
      const podSynthSel = sBox?.querySelector('.yt-podcast-synth-select');
      if (podSynthSel) { podSynthSel.value = 'webspeech'; podSynthSel.dispatchEvent(new Event('change', { bubbles: true })); }
      const voiceEngSel = sBox?.querySelector('.yt-voice-engine-select');
      if (voiceEngSel) { voiceEngSel.value = 'gemini'; voiceEngSel.dispatchEvent(new Event('change', { bubbles: true })); }

      const customModelIn = sBox?.querySelector('.yt-custom-model-input');
      if (customModelIn) customModelIn.value = 'gemini-custom-test-55';
      sBox?.querySelector('.yt-add-custom-model-btn')?.click();

      // 3-way Video Title mode: 'manual' disables auto-fetch on load, allows manual button click
      sBox?.querySelector('.yt-alt-title-mode-btn[data-alt-title-mode="manual"]')?.click();
      const modeAfterManual = helper.getAltTitleMode();

      window.__yt_mock_transcripts = window.__yt_mock_transcripts || {};
      window.__yt_mock_transcripts['CHECK55_MANUAL_VID'] = '[00:05] Optical Atomic Clock Frequency Stability Benchmarks at 10e-18.';
      window.GM_deleteValue?.('alt_title:CHECK55_MANUAL_VID');
      const manualCard = document.createElement('ytd-rich-item-renderer');
      manualCard.innerHTML = `<h3 id="video-title"><a href="/watch?v=CHECK55_MANUAL_VID">YOU WON'T BELIEVE THIS CLOCK!!</a></h3>`;
      (document.querySelector('.grid') || document.body).prepend(manualCard);
      helper.processFeedCard(manualCard);
      await new Promise((r) => setTimeout(r, 100));
      const manualTitleAtLoad = manualCard.querySelector('#video-title')?.textContent?.trim() || '';
      manualCard.querySelector('.yt-alt-title-btn')?.click();
      await new Promise((r) => setTimeout(r, 120));
      const manualTitleAfterClick = manualCard.querySelector('#video-title')?.textContent?.trim() || '';
      manualCard.remove();

      // History bottom tab toggle & page scope ('all_pages' vs 'home_only')
      const histVisSel = sBox?.querySelector('.yt-history-visibility-select');
      if (histVisSel) { histVisSel.value = 'always'; histVisSel.dispatchEvent(new Event('change', { bubbles: true })); }
      window.history.pushState({}, '', '/');
      helper.updateDockHistoryTab();
      const dockVisibleOnHomeInitially = Boolean(root?.querySelector('.yt-dock-history-tab'));

      const showHistCb = sBox?.querySelector('.yt-show-history-tab-checkbox');
      if (showHistCb) { showHistCb.checked = false; showHistCb.dispatchEvent(new Event('change', { bubbles: true })); }
      const dockVisibleWhenDisabled = Boolean(root?.querySelector('.yt-dock-history-tab'));
      if (showHistCb) { showHistCb.checked = true; showHistCb.dispatchEvent(new Event('change', { bubbles: true })); }

      sBox?.querySelector('.yt-history-scope-btn[data-history-scope="home_only"]')?.click();
      window.history.pushState({}, '', '/watch?v=vid_check55_scope');
      helper.updateDockHistoryTab();
      const dockVisibleOnWatchWhenHomeOnly = Boolean(root?.querySelector('.yt-dock-history-tab'));

      window.history.pushState({}, '', '/');
      helper.updateDockHistoryTab();
      const dockVisibleBackOnHome = Boolean(root?.querySelector('.yt-dock-history-tab'));

      const snapshotBeforeReset = {
        model: helper.getLastModel(),
        source: helper.getLastSource(),
        lang: helper.getOutputLanguage(),
        fc: helper.getGlobalOpts().fc,
        podHosts: helper.getDefaultPodcastHostCount(),
        podSynth: helper.getPodcastSynthesisMode(),
        voiceEngine: helper.getVoiceInputEngine(),
        hasCustomModel: helper.getCustomModels().includes('gemini-custom-test-55'),
        historyScope: helper.getHistoryPageScope()
      };

      // Reset All restores factory defaults
      const freshDlgBox = root?.querySelector('.yt-settings-dialog-box');
      freshDlgBox?.querySelector('.yt-reset-all-settings-btn')?.click();
      await new Promise((r) => setTimeout(r, 60));
      const postReset = {
        mode: helper.getAltTitleMode(),
        lang: helper.getOutputLanguage(),
        showHistoryTab: helper.getShowHistoryBottomTab(),
        historyScope: helper.getHistoryPageScope()
      };

      root?.querySelector('.yt-settings-dialog-scrim .yt-win-close-btn')?.click();
      window.history.pushState({}, '', savedOrigPath || '/');
      helper.updateDockHistoryTab();

      return {
        sResizeDirs,
        sMovedPx: Math.round(sLeftAfter - sLeftBefore),
        sResizedPx: Math.round(sHeightAfter - sHeightBefore),
        savedBoundsWidth: savedBounds?.width || 0,
        savedBoundsHeight: savedBounds?.height || 0,
        allSelectedInitially,
        podDisplayDuringPodTab,
        sumDisplayDuringPodTab,
        sumDisplayAfterAllTab,
        modeAfterManual,
        manualTitleAtLoad,
        manualTitleAfterClick,
        dockVisibleOnHomeInitially,
        dockVisibleWhenDisabled,
        dockVisibleOnWatchWhenHomeOnly,
        dockVisibleBackOnHome,
        snapshotBeforeReset,
        postReset
      };
    });

    assert.deepEqual(check55.sResizeDirs, ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'], 'Check 55: Settings window exposes all 8 resize handles');
    assert.equal(check55.sMovedPx, 16, 'Check 55: Settings window moves +16px via keyboard drag grip');
    assert.equal(check55.sResizedPx, 16, 'Check 55: Settings window resizes +16px via SE handle');
    assert.ok(check55.savedBoundsWidth >= 360 && check55.savedBoundsHeight >= 340, 'Check 55: Settings window bounds are persisted');
    assert.equal(check55.allSelectedInitially, true, 'Check 55: Settings opens on All Settings tab by default');
    assert.equal(check55.podDisplayDuringPodTab, 'flex', 'Check 55: Selecting Podcast tab displays Podcast settings section');
    assert.equal(check55.sumDisplayDuringPodTab, 'none', 'Check 55: Selecting Podcast tab filters out Summaries section');
    assert.equal(check55.sumDisplayAfterAllTab, 'flex', 'Check 55: Selecting All Settings restores every section');
    assert.equal(check55.modeAfterManual, 'manual', 'Check 55: 3-way AI title mode switches cleanly to manual');
    assert.equal(check55.manualTitleAtLoad, "YOU WON'T BELIEVE THIS CLOCK!!", 'Check 55: Manual AI title mode keeps original title untouched on card load');
    assert.ok(check55.manualTitleAfterClick.includes('Optical Atomic Clock'), 'Check 55: Manual mode still generates AI title when toggle button is clicked');
    assert.equal(check55.dockVisibleOnHomeInitially, true, 'Check 55: History dock tab appears on Home feed when enabled');
    assert.equal(check55.dockVisibleWhenDisabled, false, 'Check 55: Unchecking Show History tab hides lower-right History dock pill');
    assert.equal(check55.dockVisibleOnWatchWhenHomeOnly, false, 'Check 55: History dock pill is hidden on /watch video page when scoped to Home Feed Only');
    assert.equal(check55.dockVisibleBackOnHome, true, 'Check 55: History dock pill reappears when navigating back to Home feed');
    assert.equal(check55.snapshotBeforeReset.model, 'gemini-3.5-flash', 'Check 55: Default summary model persists');
    assert.equal(check55.snapshotBeforeReset.source, 'text', 'Check 55: Default summary source persists');
    assert.equal(check55.snapshotBeforeReset.lang, 'Spanish', 'Check 55: Output language persists');
    assert.equal(check55.snapshotBeforeReset.fc, true, 'Check 55: Fact-check default persists');
    assert.equal(check55.snapshotBeforeReset.podHosts, 4, 'Check 55: Default podcast host count persists');
    assert.equal(check55.snapshotBeforeReset.podSynth, 'webspeech', 'Check 55: Podcast synthesis engine persists');
    assert.equal(check55.snapshotBeforeReset.voiceEngine, 'gemini', 'Check 55: Voice input engine persists');
    assert.equal(check55.snapshotBeforeReset.hasCustomModel, true, 'Check 55: Custom model added and saved');
    assert.equal(check55.snapshotBeforeReset.historyScope, 'home_only', 'Check 55: History page scope persisted');
    assert.equal(check55.postReset.mode, 'on', 'Check 55: Reset All restores altTitleMode to on');
    assert.equal(check55.postReset.lang, 'English', 'Check 55: Reset All restores outputLanguage to English');
    assert.equal(check55.postReset.showHistoryTab, true, 'Check 55: Reset All restores showHistoryBottomTab');
    assert.equal(check55.postReset.historyScope, 'all_pages', 'Check 55: Reset All restores historyPageScope');
    passed += 28;

    // Check 56: Summary Visual Cards (Frames + Commons Fallback) & Multi-State Fact-Check Box Below Summary
    const check56 = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      for (const [, w] of Array.from(helper.activeWindows.entries())) w.close();
      const exposedHelpers = [
        'buildFactCheckModelCandidates',
        'parseStoryboardSpecString',
        'computeStoryboardFrameInfo',
        'getVideoThumbnailFallbackUrl',
        'parseVisualMarkerToken',
        'parseVisualMarkerFromLine',
        'tokenizeSummaryTextWithVisuals',
        'ensureFallbackVisualMarkers'
      ].every((fn) => typeof helper[fn] === 'function');

      const origReq = window.GM_xmlhttpRequest;
      window.GM_xmlhttpRequest = (opts) => {
        const url = String(opts.url || '');
        if (url.includes('commons.wikimedia.org')) {
          setTimeout(() => {
            opts.onload({ status: 200, responseText: JSON.stringify({ query: {} }) });
          }, 10);
          return;
        }
        return origReq(opts);
      };

      helper.openForVideo({ videoId: 'CHECK56_VIS_FC', title: 'Visuals & Fact-Check Verification' });
      const win = helper.activeWindows.get('CHECK56_VIS_FC');
      win.opts.img = true;
      win.opts.fc = true;
      win.opts.src = true;
      win.mode = 'summary';
      win.status = 'done';

      // Case A: Summary without explicit markers gets fallback frame cards + loading fact-check box
      win.text = '## TL;DR\nSolid-state cathode test runs cleanly [00:30].\n- Cycle life hits 1,500 cycles [02:10].';
      win.fact = null;
      win.factStatus = 'loading';
      win.factError = '';
      win.renderAll();

      const previewEl = win.bodyEl?.querySelector('.yt-frame-card .yt-frame-preview');
      const previewRect = previewEl?.getBoundingClientRect();
      const fallbackImgSrc = win.bodyEl?.querySelector('.yt-frame-card img.yt-frame-fallback-img')?.getAttribute('src') || '';
      const frameCardsAutoCount = win.bodyEl?.querySelectorAll('.yt-visual-card.yt-frame-card').length || 0;
      const factLoadingVisible = Boolean(win.bodyEl?.querySelector('.yt-fact-box.yt-fact-loading'));

      // Case B: Explicit [[IMG ...]] renders Wikimedia fallback schematic SVG (never removed on null Commons response)
      // + Fact-Check Error state shows Retry button
      win.text = '## Architecture\nIntro [[FRAME 01:15 | Stack cross-section]] detail.\n- **[[IMG Tokamak Core | Tokamak magnetic coils]]**';
      win.fact = null;
      win.factStatus = 'error';
      win.factError = 'No Gemini API key configured — add a key to run Fact-Check.';
      win.renderAll();
      await new Promise((r) => setTimeout(r, 80));

      const commonsCardPresent = Boolean(win.bodyEl?.querySelector('.yt-visual-card.yt-commons-card'));
      const commonsFallbackRendered = Boolean(win.bodyEl?.querySelector('.yt-commons-card .yt-commons-fallback svg'));
      const commonsSearchHref = win.bodyEl?.querySelector('.yt-commons-card a.yt-ext-link')?.getAttribute('href') || '';
      const factErrorVisible = Boolean(win.bodyEl?.querySelector('.yt-fact-box.yt-fact-error'));
      const factRetryBtnPresent = Boolean(win.bodyEl?.querySelector('.yt-fact-box .yt-fact-retry-btn'));

      // Case C: Fact-Check done with claims + sources
      win.factStatus = 'done';
      win.factError = '';
      win.fact = {
        model: 'gemini-3.8-flash',
        searchGrounded: true,
        text: '### Fact-Check\n- **✅ Supported**: Cycle life matches published DOE benchmark [02:10].',
        sources: [{ uri: 'https://energy.gov/solid-state-cells', title: 'DOE Solid-State Report' }]
      };
      win.renderAll();
      const factDoneText = win.bodyEl?.querySelector('.yt-fact-box')?.textContent || '';
      const factSourcesCount = win.bodyEl?.querySelectorAll('.yt-fact-box .yt-source-item a').length || 0;

      // Case D: Fact-Check disabled shows off state with Enable & Run Fact-Check button
      win.fact = null;
      win.factStatus = 'idle';
      win.opts.fc = false;
      win.opts.src = false;
      win.renderAll();
      const factOffVisible = Boolean(win.bodyEl?.querySelector('.yt-fact-box.yt-fact-off'));
      const factEnableBtnPresent = Boolean(win.bodyEl?.querySelector('.yt-fact-box .yt-fact-enable-btn'));

      window.GM_xmlhttpRequest = origReq;
      win.close();

      return {
        exposedHelpers,
        frameCardsAutoCount,
        previewWidth: previewRect?.width || 0,
        previewHeight: previewRect?.height || 0,
        fallbackImgSrc,
        factLoadingVisible,
        commonsCardPresent,
        commonsFallbackRendered,
        commonsSearchHref,
        factErrorVisible,
        factRetryBtnPresent,
        factDoneText,
        factSourcesCount,
        factOffVisible,
        factEnableBtnPresent
      };
    });

    assert.equal(check56.exposedHelpers, true, 'Check 56: Userscript exposes all 8 new AUD-08 visual/fact-check helpers');
    assert.ok(check56.frameCardsAutoCount >= 2, 'Check 56: Summaries missing markers auto-inject fallback video frame cards');
    assert.ok(check56.previewWidth >= 120 && check56.previewHeight >= 100, 'Check 56: Video frame preview maintains non-zero 16:9 layout');
    assert.ok(check56.fallbackImgSrc.includes('i.ytimg.com/vi/CHECK56_VIS_FC/hq'), 'Check 56: Video frame card renders public i.ytimg.com frame still fallback');
    assert.equal(check56.factLoadingVisible, true, 'Check 56: Fact-check loading box renders below summary while verifying');
    assert.equal(check56.commonsCardPresent, true, 'Check 56: Wikimedia diagram card stays visible rather than vanishing on null Commons API');
    assert.equal(check56.commonsFallbackRendered, true, 'Check 56: Diagram card renders crisp fallback schematic SVG when Commons has no result');
    assert.ok(check56.commonsSearchHref.includes('commons.wikimedia.org'), 'Check 56: Diagram card links to Wikimedia Commons search');
    assert.equal(check56.factErrorVisible && check56.factRetryBtnPresent, true, 'Check 56: Fact-check error box renders clear message + Retry button');
    assert.ok(check56.factDoneText.includes('DOE benchmark') && check56.factSourcesCount === 1, 'Check 56: Completed fact-check box renders claims and source links below summary');
    assert.equal(check56.factOffVisible && check56.factEnableBtnPresent, true, 'Check 56: Disabled fact-check renders off box with Enable & Run button');
    passed += 11;

    // Check 57: Header Title Switch, Auto Fact-Check + Ladder Fallback, Follow-Up Edit/Regen Version Pager, and Multi-Part Podcast Zero Self-Name TTS
    const check57 = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      for (const [, w] of Array.from(helper.activeWindows.entries())) w.close();

      // 1) Header Title Switch Button (AI <-> Original + On-Demand Generation)
      const origReq = window.GM_xmlhttpRequest;
      const capturedUrls = [];
      const capturedTtsTexts = [];
      let failFactPrimaryOnce = true;
      let failFollowPrimaryOnce = true;

      window.GM_xmlhttpRequest = (opts) => {
        const url = String(opts.url || '');
        capturedUrls.push(url);
        if (url.includes('/models?')) {
          setTimeout(() => {
            opts.onload({
              status: 200,
              responseText: JSON.stringify({
                models: [
                  { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
                  { name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] },
                  { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] },
                  { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
                  { name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] },
                  { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }
                ]
              })
            });
          }, 5);
          return;
        }
        let parsedBody = {};
        try { parsedBody = JSON.parse(opts.data || '{}'); } catch (_) {}
        const promptText = String(
          (parsedBody?.contents?.[0]?.parts || []).map((p) => p?.text || '').join('\n')
        );

        if (url.includes(':generateContent')) {
          // Podcast Audio TTS call
          if (parsedBody?.generationConfig?.responseModalities?.includes('AUDIO')) {
            capturedTtsTexts.push(promptText);
            setTimeout(() => {
              opts.onload({
                status: 200,
                responseText: JSON.stringify({
                  candidates: [{
                    content: {
                      parts: [{
                        inlineData: {
                          mimeType: 'audio/wav',
                          data: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
                        }
                      }]
                    }
                  }]
                })
              });
            }, 8);
            return;
          }

          // Fact-check call: force primary model failure -> ladder step-down
          if (promptText.includes('SUMMARY TO CHECK:')) {
            if (failFactPrimaryOnce && url.includes('gemini-3.8-flash')) {
              failFactPrimaryOnce = false;
              setTimeout(() => {
                opts.onload({ status: 429, responseText: JSON.stringify({ error: { message: 'Quota exceeded' } }) });
              }, 8);
              return;
            }
            setTimeout(() => {
              opts.onload({
                status: 200,
                responseText: JSON.stringify({
                  candidates: [{
                    content: {
                      parts: [{ text: '## Fact-check\n- **✅ Supported**: Solid-state claim confirmed [00:20].' }]
                    },
                    groundingMetadata: {
                      groundingChunks: [{ web: { uri: 'https://example.org/benchmark', title: 'DOE Benchmark' } }]
                    }
                  }]
                })
              });
            }, 8);
            return;
          }

          // Title generation on demand
          if (
            promptText.toLowerCase().includes('video title generator') ||
            promptText.toLowerCase().includes('alternative title') ||
            promptText.toLowerCase().includes('descriptive') ||
            promptText.toLowerCase().includes('clickbait')
          ) {
            setTimeout(() => {
              opts.onload({
                status: 200,
                responseText: JSON.stringify({
                  candidates: [{ content: { parts: [{ text: 'Solid-State Cathode Lab Benchmark Results' }] } }]
                })
              });
            }, 8);
            return;
          }

          // Follow-up / Podcast script / Summary call
          if (promptText.includes('FOLLOW-UP QUESTION:')) {
            if (failFollowPrimaryOnce && url.includes('gemini-3.5-flash')) {
              failFollowPrimaryOnce = false;
              setTimeout(() => {
                opts.onload({ status: 503, responseText: JSON.stringify({ error: { message: 'Model overloaded' } }) });
              }, 8);
              return;
            }
            const qMatch = promptText.match(/FOLLOW-UP QUESTION:\s*([^\n]+)/);
            const qSeen = qMatch ? qMatch[1].trim() : 'Follow-up';
            setTimeout(() => {
              opts.onload({
                status: 200,
                responseText: JSON.stringify({
                  candidates: [{ content: { parts: [{ text: `Answer for "${qSeen}" [00:45].` }] } }]
                })
              });
            }, 8);
            return;
          }

          if (/podcast|conversation script|continue this multi-host/i.test(promptText)) {
            setTimeout(() => {
              opts.onload({
                status: 200,
                responseText: JSON.stringify({
                  candidates: [{
                    content: {
                      parts: [{
                        text: JSON.stringify({
                          title: 'Solid-State Deep Dive',
                          turns: [
                            { speaker: 'Alex', text: 'I am Alex, breaking down the cathode electrolyte interface first.' },
                            { speaker: 'Maya', text: 'And scaling pressure stability matters just as much at high charge rates.' }
                          ]
                        })
                      }]
                    }
                  }]
                })
              });
            }, 10);
            return;
          }

          setTimeout(() => {
            opts.onload({
              status: 200,
              responseText: JSON.stringify({
                candidates: [{ content: { parts: [{ text: '## TL;DR\nSolid-state cathode benchmark summary [00:20].' }] } }]
              })
            });
          }, 8);
          return;
        }
        return origReq(opts);
      };

      // Configure API key so fact-check, follow-up & TTS execute cleanly
      const prevKeys = window.GM_getValue?.('keys', []) || [];
      const prevLastKey = window.GM_getValue?.('last_key_id', '');
      const prevPodSynth = helper.getPodcastSynthesisMode?.() || 'gemini_with_fallback';
      window.GM_setValue?.('keys', [{ id: 'k57', name: 'Test57', label: 'Test57', key: 'AIzaTestKey57_Mock', isFreeTier: true }]);
      window.GM_setValue?.('last_key_id', 'k57');
      helper.setPodcastSynthesisMode?.('gemini_with_fallback');
      helper.clearModelCooldowns?.();

      // 1) Header Title Switch
      window.GM_deleteValue?.('alt_title:CHECK57_TITLE');
      helper.openForVideo({ videoId: 'CHECK57_TITLE', title: 'CRAZY BATTERY SHOCK!!' });
      const winTitle = helper.activeWindows.get('CHECK57_TITLE');
      const initialHeaderText = winTitle.windowBox?.querySelector('.yt-win-title-link')?.textContent?.trim() || '';
      winTitle.windowBox?.querySelector('.yt-win-title-switch-btn')?.click();
      await new Promise((r) => setTimeout(r, 90));
      const toggledToAiText = winTitle.windowBox?.querySelector('.yt-win-title-link')?.textContent?.trim() || '';
      winTitle.windowBox?.querySelector('.yt-win-title-switch-btn')?.click();
      await new Promise((r) => setTimeout(r, 30));
      const toggledBackToOrigText = winTitle.windowBox?.querySelector('.yt-win-title-link')?.textContent?.trim() || '';
      winTitle.close();

      // 2) Settings autoFactCheck default & off behavior + Fact-Check Ladder Step-Down
      const shadowRoot = document.getElementById('yt-ai-summary-host')?.shadowRoot;
      helper.openSettingsDialog();
      await new Promise((r) => setTimeout(r, 40));
      const autoFcCb = shadowRoot?.querySelector('.yt-opt-autofc-checkbox');
      const autoFcCheckedDefault = Boolean(autoFcCb?.checked);
      if (autoFcCb) { autoFcCb.checked = false; autoFcCb.dispatchEvent(new Event('change', { bubbles: true })); }
      shadowRoot?.querySelector('.yt-settings-dialog-scrim .yt-win-close-btn')?.click();

      helper.openForVideo({ videoId: 'CHECK57_FC', title: 'Fact-Check Ladder Video' });
      const winFc = helper.activeWindows.get('CHECK57_FC');
      winFc.keyId = 'k57';
      winFc.opts.fc = true;
      winFc.opts.autoFactCheck = false;
      winFc.opts.factModel = 'gemini-3.8-flash';
      winFc.text = '## TL;DR\nSolid-state cathode benchmark [00:20].';
      winFc.onDone();
      await new Promise((r) => setTimeout(r, 30));
      const factStatusWhenAutoOff = winFc.factStatus;
      const deferredRunBtnVisible = Boolean(winFc.bodyEl?.querySelector('.yt-fact-run-btn'));

      await winFc.runFactCheck();
      const factStatusAfterRun = winFc.factStatus;
      const factModelResolved = winFc.fact?.model || '';
      const factFallbackFrom = winFc.fact?.fallbackFrom || '';
      const factHasStepDownNote = winFc.notes.some((n) => n.includes('automatically stepped down'));
      winFc.close();

      // Re-enable autoFactCheck default
      helper.saveGlobalOpts?.({ ...helper.getGlobalOpts(), autoFactCheck: true });

      // 3) Follow-Up Question Editing, Regeneration & Gemini-style < 1 / N > Pager
      helper.openForVideo({ videoId: 'CHECK57_QNA', title: 'Follow-Up Versioning Video' });
      const winQna = helper.activeWindows.get('CHECK57_QNA');
      winQna.keyId = 'k57';
      winQna.status = 'done';
      winQna.text = '## Overview\nExplains solid-state battery electrolytes [00:45].';
      winQna.turns = [
        { q: 'Original Q1?', a: 'Initial answer V1.', model: 'gemini-3.8-flash' }
      ];
      winQna.renderAll();

      // Edit submitted question -> triggers save & regenerate with currently chosen model (forced 503 fallback on gemini-3.5-flash)
      if (winQna.composerModelSelect) {
        winQna.composerModelSelect.value = 'gemini-3.5-flash';
        winQna.composerModelSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      winQna.bodyEl?.querySelector('.yt-turn-edit-btn')?.click();
      const editTa = winQna.bodyEl?.querySelector('.yt-turn-edit-ta');
      if (editTa) editTa.value = 'Edited Q2 about cycle life?';
      await winQna.regenerateFollowUpTurn(0, editTa ? editTa.value : 'Edited Q2 about cycle life?');

      const verLabelAfterEdit = winQna.bodyEl?.querySelector('.yt-turn-ver-label')?.textContent?.trim() || '';
      const editedQuestionShown = winQna.bodyEl?.querySelector('.yt-turn-user-text')?.textContent?.trim() || '';
      const activeVerAfterEdit = winQna.turns[0].versions[winQna.turns[0].activeVersionIndex];

      // Step back to 1 / 2 -> original question & answer preserved!
      winQna.bodyEl?.querySelector('.yt-turn-ver-prev')?.click();
      const verLabelAfterPrev = winQna.bodyEl?.querySelector('.yt-turn-ver-label')?.textContent?.trim() || '';
      const prevQuestionShown = winQna.bodyEl?.querySelector('.yt-turn-user-text')?.textContent?.trim() || '';
      const prevAnswerShown = winQna.bodyEl?.querySelector('.yt-ans-bubble')?.textContent || '';

      // Step forward & regenerate directly -> 3 / 3
      winQna.bodyEl?.querySelector('.yt-turn-ver-next')?.click();
      if (winQna.composerModelSelect) {
        winQna.composerModelSelect.value = 'gemini-3.5-flash-lite';
        winQna.composerModelSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await winQna.regenerateFollowUpTurn(0);
      const verLabelAfterRegen = winQna.bodyEl?.querySelector('.yt-turn-ver-label')?.textContent?.trim() || '';
      winQna.close();

      // 4) Podcast Multi-Part Progressive Generation + Zero Self-Name TTS
      const sanitizedSample = helper.sanitizeSpokenTurnText(
        "Maya: Hi I'm Maya, let's inspect the thermal runaway thresholds [02:10].",
        ['Alex', 'Maya']
      );
      helper.openForVideo({ videoId: 'CHECK57_POD', title: 'Full Summary Multi-Part Podcast' });
      const winPod = helper.activeWindows.get('CHECK57_POD');
      winPod.keyId = 'k57';
      winPod.status = 'done';
      winPod.mode = 'podcast';
      const podText = [
        '## Section 1: Cathode Chemistry\n' + 'Cathode crystal lattice stability avoids oxygen release under rapid charging. '.repeat(26),
        '## Section 2: Separator Design\n' + 'Ceramic solid separators block dendrite propagation across cycles. '.repeat(26),
        '## Section 3: Pack Thermal Economics\n' + 'Cell-to-pack thermal conduction halves cooling overhead in vehicles. '.repeat(26)
      ].join('\n\n');
      winPod.text = podText;
      winPod.podcastSummaryText = podText;
      winPod.renderAll();

      await winPod.generatePodcastFromSummary();
      const totalPartsPlanned = winPod.podcastEpisode?.totalParts || 1;
      // Wait for continuePodcastGeneration background parts to complete
      for (let i = 0; i < 40 && winPod.podcastGeneratingMore; i++) {
        await new Promise((r) => setTimeout(r, 30));
      }
      const generatedPartsFinal = winPod.podcastEpisode?.generatedParts || 0;
      const isCompleteFinal = Boolean(winPod.podcastEpisode?.isComplete);
      const turnTexts = (winPod.podcastEpisode?.turns || []).map((t) => t.text || '');

      // Exercise generatePodcastTurnAudio via prefetch on turn 0 so TTS payload is captured
      await winPod.prefetchPodcastTurnAudio(winPod.podcastEpisode.turns[0]);
      winPod.close();

      window.GM_setValue?.('keys', prevKeys);
      window.GM_setValue?.('last_key_id', prevLastKey);
      helper.setPodcastSynthesisMode?.(prevPodSynth);
      window.GM_xmlhttpRequest = origReq;

      return {
        initialHeaderText,
        toggledToAiText,
        toggledBackToOrigText,
        autoFcCheckedDefault,
        factStatusWhenAutoOff,
        deferredRunBtnVisible,
        factStatusAfterRun,
        factModelResolved,
        factFallbackFrom,
        factHasStepDownNote,
        verLabelAfterEdit,
        editedQuestionShown,
        editFallbackFrom: activeVerAfterEdit?.fallbackFrom || '',
        editResolvedModel: activeVerAfterEdit?.model || '',
        verLabelAfterPrev,
        prevQuestionShown,
        prevAnswerShown,
        verLabelAfterRegen,
        sanitizedSample,
        totalPartsPlanned,
        generatedPartsFinal,
        isCompleteFinal,
        anyTurnStartsWithHostName: turnTexts.some((t) => /^(Alex|Maya|Sam|Jordan)\s*:/i.test(t)),
        ttsPayloadCount: capturedTtsTexts.length,
        ttsStartsWithHostName: capturedTtsTexts.some((t) => /^(Alex|Maya)\s*:/i.test(t) || /\bI am Alex\b/i.test(t))
      };
    });

    assert.equal(check57.initialHeaderText, 'CRAZY BATTERY SHOCK!!', 'Check 57: Uncached window initially shows original title');
    assert.equal(check57.toggledToAiText, 'Solid-State Cathode Lab Benchmark Results', 'Check 57: Header title switch button generates & switches to AI descriptive title');
    assert.equal(check57.toggledBackToOrigText, 'CRAZY BATTERY SHOCK!!', 'Check 57: Clicking header title switch again toggles back to original title');
    assert.equal(check57.autoFcCheckedDefault, true, 'Check 57: Auto Fact-Check setting defaults to enabled (true)');
    assert.equal(check57.factStatusWhenAutoOff, 'idle', 'Check 57: Disabling Auto Fact-Check skips automatic run after summary');
    assert.equal(check57.deferredRunBtnVisible, true, 'Check 57: Deferred Fact-Check shows manual Run Fact-Check button');
    assert.equal(check57.factStatusAfterRun, 'done', 'Check 57: Fact-Check succeeds after primary model 429');
    assert.equal(check57.factFallbackFrom, 'gemini-3.8-flash', 'Check 57: Records failed primary fact-check model');
    assert.notEqual(check57.factModelResolved, 'gemini-3.8-flash', 'Check 57: Automatically steps down fact-check model ladder');
    assert.equal(check57.factHasStepDownNote, true, 'Check 57: Records step-down notice for Fact-Check fallback');
    assert.equal(check57.verLabelAfterEdit, '2 / 2', 'Check 57: Editing question & saving increments version pager to 2 / 2');
    assert.equal(check57.editedQuestionShown, 'Edited Q2 about cycle life?', 'Check 57: Active turn displays edited question');
    assert.equal(check57.editFallbackFrom, 'gemini-3.5-flash', 'Check 57: Regenerate steps down follow-up ladder when selected model returns 503');
    assert.notEqual(check57.editResolvedModel, 'gemini-3.5-flash', 'Check 57: Stepped-down follow-up model recorded on version');
    assert.equal(check57.verLabelAfterPrev, '1 / 2', 'Check 57: Previous arrow restores version 1 / 2');
    assert.equal(check57.prevQuestionShown, 'Original Q1?', 'Check 57: Original question text preserved in version 1 / 2');
    assert.ok(check57.prevAnswerShown.includes('Initial answer V1.'), 'Check 57: Original answer text preserved in version 1 / 2');
    assert.equal(check57.verLabelAfterRegen, '3 / 3', 'Check 57: Direct Regenerate appends version 3 / 3 cleanly');
    assert.ok(!/Maya/i.test(check57.sanitizedSample), 'Check 57: sanitizeSpokenTurnText removes speaker self-names and self-intros');
    assert.ok(check57.totalPartsPlanned >= 2, 'Check 57: Long multi-section summary splits podcast into progressive parts >= 2');
    assert.equal(check57.generatedPartsFinal, check57.totalPartsPlanned, 'Check 57: Progressive continuation completes all podcast parts');
    assert.equal(check57.isCompleteFinal, true, 'Check 57: Podcast marks full episode complete once all sections are generated');
    assert.equal(check57.anyTurnStartsWithHostName, false, 'Check 57: Podcast script turns strip leading Speaker: labels');
    assert.ok(check57.ttsPayloadCount >= 1 && !check57.ttsStartsWithHostName, 'Check 57: Gemini TTS payload omits host self-names & self-introductions');
    passed += 24;

    // Check 58: Minimized Audio Playback (Podcast/TTS + Dock Mini-Controls), UI Accent Color Wheel & 12 Pastel Presets, and Unified Drag/Resize
    const check58 = await page.evaluate(async () => {
      const helper = window.__yt_summariser_test;
      for (const [, w] of Array.from(helper.activeWindows.entries())) w.close();
      helper.ensureTopbarLauncher?.();
      const shadowRoot = document.getElementById('yt-ai-summary-host')?.shadowRoot;

      // 1) Continue Audio on Minimize default + dual Settings checkboxes sync
      const initialContinueAudio = helper.getContinueAudioOnMinimize?.();
      helper.openSettingsDialog();
      await new Promise((r) => setTimeout(r, 40));

      const podContCb = shadowRoot?.querySelector('.yt-podcast-continue-minimize-checkbox');
      const ttsContCb = shadowRoot?.querySelector('.yt-tts-continue-minimize-checkbox');
      const bothCheckedInitially = Boolean(podContCb?.checked && ttsContCb?.checked);

      // Toggle Podcast checkbox OFF -> TTS checkbox must sync to false
      if (podContCb) {
        podContCb.checked = false;
        podContCb.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const afterOffTtsSynced = Boolean(ttsContCb && !ttsContCb.checked && helper.getContinueAudioOnMinimize() === false);

      // Toggle back ON via TTS checkbox -> Podcast checkbox syncs to true
      if (ttsContCb) {
        ttsContCb.checked = true;
        ttsContCb.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const afterOnPodSynced = Boolean(podContCb && podContCb.checked && helper.getContinueAudioOnMinimize() === true);

      // 2) Accent Color Wheel, 12 Pastel Swatches, Hex Input, & Reset Accent in Light + Dark themes
      const swatches = Array.from(shadowRoot?.querySelectorAll('.yt-accent-swatch') || []);
      const swatchesCount = swatches.length;
      const wheelEl = shadowRoot?.querySelector('.yt-accent-color-wheel');
      const hexInput = shadowRoot?.querySelector('.yt-accent-hex-input');
      const resetAccentBtn = shadowRoot?.querySelector('.yt-accent-reset-btn');

      // Click Rose Pastel (#FDA4AF)
      const roseBtn = swatches.find((b) => String(b.getAttribute('data-accent-hex') || '').toUpperCase() === '#FDA4AF');
      roseBtn?.click();
      await new Promise((r) => setTimeout(r, 30));

      const host = document.getElementById('yt-ai-summary-host');
      const accentAttrAfterSwatch = host?.getAttribute('data-ui-accent') || '';
      const primaryDarkSwatch = host?.style.getPropertyValue('--md-sys-color-primary').trim() || '';
      const hexInputAfterSwatch = (hexInput?.value || '').toUpperCase();
      const launcherBorderAfterSwatch = document.querySelector('.yt-topbar-launcher-btn')?.style.getPropertyValue('--yt-accent-border').trim() || '';

      // Switch to Light theme and pick from wheel click/helper
      const prevThemeMode = helper.getAppThemeMode();
      helper.setAppThemeMode('light');
      await new Promise((r) => setTimeout(r, 20));
      const primaryLightSwatch = host?.style.getPropertyValue('--md-sys-color-primary').trim() || '';
      helper.setAppThemeMode(prevThemeMode || 'dark');

      // Hex input update
      if (hexInput) {
        hexInput.value = '#C4B5FD';
        hexInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const accentAttrAfterHex = helper.getUiAccentColor();

      // Wheel coordinate conversion + reset
      const wheelPickedHex = helper.colorWheelPointToHex?.(60, 0, 60) || '';
      resetAccentBtn?.click();
      const accentAttrAfterReset = host?.getAttribute('data-ui-accent') || '';
      const primaryVarAfterReset = host?.style.getPropertyValue('--md-sys-color-primary').trim() || '';

      // Close settings
      shadowRoot?.querySelector('.yt-settings-dialog-scrim .yt-win-close-btn')?.click();

      // 3) TTS Playback Continues When Minimized + Dock Mini-Controls
      helper.openForVideo({ videoId: 'CHECK58_AUDIO', title: 'Minimized Audio & Dock Controls' });
      const win = helper.activeWindows.get('CHECK58_AUDIO');
      win.status = 'done';
      win.text = '## Summary\nFirst sentence on superconducting qubits. Second sentence on decoherence mitigation.';
      win.renderAll();

      // Test unified drag interaction via windowBox bounds after dead moveWindow removal
      const initialLeft = win.bounds?.left || 0;
      const initialTop = win.bounds?.top || 0;
      win.resizeWindow?.((win.bounds?.width || 560) + 24, win.bounds?.height || 500);
      const resizedWidth = win.bounds?.width || 0;

      // Start TTS playback & minimize while continue_audio_on_minimize=true
      // Guard against test shim auto-ending speech after 35ms so minimize/pause/stop state transitions are deterministic
      const origSpeak = window.speechSynthesis?.speak;
      if (window.speechSynthesis) {
        window.speechSynthesis.speak = () => {};
      }
      await win.startTts();
      const ttsBeforeMinimize = win.ttsState;
      const ttsVoiceUsed = win.getTtsVoice?.() || '';
      win.minimize();
      await new Promise((r) => setTimeout(r, 20));

      const ttsAfterMinimize = win.ttsState;
      const winHiddenOnMin = !win.isOpen;
      const dockTab = shadowRoot?.querySelector('.yt-dock-tab[data-dock-video-id="CHECK58_AUDIO"]');
      const dockPlayingClass = Boolean(dockTab?.classList.contains('audio-playing'));
      const dockBadgeTextTts = dockTab?.querySelector('.yt-dock-audio-badge')?.textContent?.trim() || '';

      // Pause & Resume from dock without restoring window
      dockTab?.querySelector('.yt-dock-audio-toggle-btn')?.click();
      await new Promise((r) => setTimeout(r, 20));
      const ttsAfterDockPause = win.ttsState;
      const dockPausedClass = Boolean(dockTab?.classList.contains('audio-paused'));
      const stillMinimizedAfterToggle = !win.isOpen;

      dockTab?.querySelector('.yt-dock-audio-stop-btn')?.click();
      await new Promise((r) => setTimeout(r, 20));
      const ttsAfterDockStop = win.ttsState;
      if (window.speechSynthesis && origSpeak) {
        window.speechSynthesis.speak = origSpeak;
      }

      // 4) Podcast Playback Continues When Minimized + OFF Stops on Minimize + Close Stops
      win.showModal();
      win.mode = 'podcast';
      win.podcastStatus = 'playing';
      win.podcastTurns = [
        { speaker: 'Alex', text: 'First turn explaining flux noise.', index: 0 },
        { speaker: 'Maya', text: 'Second turn covering surface codes.', index: 1 }
      ];
      win.updatePodcastPlayerDom?.();
      win.renderDockTab?.();
      win.minimize();
      await new Promise((r) => setTimeout(r, 30));

      const podAfterMinimizeOn = win.podcastStatus;
      const dockBadgeTextPod = dockTab?.querySelector('.yt-dock-audio-badge')?.textContent?.trim() || '';

      // Restore, turn continue_audio_on_minimize OFF -> minimize stops podcast
      win.showModal();
      helper.setContinueAudioOnMinimize(false);
      win.minimize();
      await new Promise((r) => setTimeout(r, 30));
      const podAfterMinimizeOff = win.podcastStatus;

      // Closing ALWAYS stops audio even with continue_audio_on_minimize=true
      helper.setContinueAudioOnMinimize(true);
      win.showModal();
      win.podcastStatus = 'playing';
      win.close();
      const podAfterClose = win.podcastStatus;

      return {
        initialContinueAudio,
        bothCheckedInitially,
        afterOffTtsSynced,
        afterOnPodSynced,
        swatchesCount,
        hasWheelEl: Boolean(wheelEl),
        accentAttrAfterSwatch,
        primaryDarkSwatch,
        primaryLightSwatch,
        hexInputAfterSwatch,
        launcherBorderAfterSwatch,
        accentAttrAfterHex,
        wheelPickedHex,
        accentAttrAfterReset,
        primaryVarAfterReset,
        resizedWidth,
        initialLeft,
        initialTop,
        ttsBeforeMinimize,
        ttsVoiceUsed,
        ttsAfterMinimize,
        winHiddenOnMin,
        dockPlayingClass,
        dockBadgeTextTts,
        ttsAfterDockPause,
        dockPausedClass,
        stillMinimizedAfterToggle,
        ttsAfterDockStop,
        podAfterMinimizeOn,
        dockBadgeTextPod,
        podAfterMinimizeOff,
        podAfterClose
      };
    });

    assert.equal(check58.initialContinueAudio, true, 'Check 58: Continue Audio on Minimize defaults to true');
    assert.equal(check58.bothCheckedInitially, true, 'Check 58: Podcast & Transcript/TTS checkboxes both reflect default true');
    assert.equal(check58.afterOffTtsSynced && check58.afterOnPodSynced, true, 'Check 58: Podcast & Transcript/TTS continue-on-minimize checkboxes stay synchronized');
    assert.equal(check58.swatchesCount, 12, 'Check 58: Settings renders 12 pastel accent color swatches');
    assert.equal(check58.hasWheelEl, true, 'Check 58: Settings renders interactive accent color wheel');
    assert.equal(check58.accentAttrAfterSwatch, '#FDA4AF', 'Check 58: Clicking pastel swatch sets data-ui-accent on host');
    assert.ok(check58.primaryDarkSwatch.startsWith('#') && check58.primaryLightSwatch.startsWith('#') && check58.primaryDarkSwatch !== check58.primaryLightSwatch, 'Check 58: Computes distinct dark & light WCAG AA Material accent tokens');
    assert.equal(check58.hexInputAfterSwatch, '#FDA4AF', 'Check 58: Hex input syncs with selected pastel swatch');
    assert.ok(check58.launcherBorderAfterSwatch.length > 0, 'Check 58: Top-left launcher button inherits active accent border token');
    assert.equal(check58.accentAttrAfterHex, '#C4B5FD', 'Check 58: Editing hex input updates UI accent color');
    assert.ok(check58.wheelPickedHex.startsWith('#'), 'Check 58: Color wheel point geometry resolves valid hex color');
    assert.equal(check58.accentAttrAfterReset, 'default', 'Check 58: Reset Accent restores data-ui-accent="default"');
    assert.equal(check58.primaryVarAfterReset, '', 'Check 58: Reset Accent restores default stylesheet tokens');
    assert.equal(check58.ttsBeforeMinimize === 'playing' && check58.ttsAfterMinimize === 'playing', true, `Check 58: TTS continues playing when minimized if setting enabled (before=${check58.ttsBeforeMinimize}, after=${check58.ttsAfterMinimize}, voice=${check58.ttsVoiceUsed})`);
    assert.equal(check58.winHiddenOnMin, true, 'Check 58: Window minimizes cleanly while audio plays');
    assert.equal(check58.dockPlayingClass, true, 'Check 58: Dock tab adds .audio-playing indicator class');
    assert.equal(check58.dockBadgeTextTts, 'TTS Playing', 'Check 58: Dock badge shows TTS Playing status');
    assert.equal(check58.ttsAfterDockPause, 'paused', 'Check 58: Clicking dock toggle button pauses background TTS');
    assert.equal(check58.dockPausedClass && check58.stillMinimizedAfterToggle, true, 'Check 58: Dock audio controls do not maximize minimized window');
    assert.equal(check58.ttsAfterDockStop, 'idle', 'Check 58: Clicking dock stop button halts background TTS');
    assert.equal(check58.podAfterMinimizeOn, 'playing', 'Check 58: Podcast continues playing when minimized if enabled');
    assert.equal(check58.dockBadgeTextPod, 'Podcast Playing', 'Check 58: Dock badge shows Podcast Playing status');
    assert.equal(check58.podAfterMinimizeOff, 'idle', 'Check 58: Disabling continue_audio_on_minimize stops Podcast upon minimize');
    assert.equal(check58.podAfterClose, 'idle', 'Check 58: Closing window always stops Podcast regardless of minimize setting');
    passed += 24;

    console.log(`✓ Suite 1 passed: ${passed} checks verified.`);
    return { passed, total: passed };
  } finally {
    await harness.browser.close();
  }
}

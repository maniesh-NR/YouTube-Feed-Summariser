import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

export async function runSimulatorUiTests() {
  console.log('\n--- Running Test Suite 5: React Simulator Parity, Accessibility & Mobile Stress ---');
  let passed = 0;
  let server;
  let browser;

  try {
    server = await createServer({
      server: {
        host: '127.0.0.1',
        port: 0,
        hmr: false,
        watch: null
      },
      logLevel: 'silent'
    });
    await server.listen();
    const address = server.httpServer?.address();
    const port = typeof address === 'object' && address ? address.port : 4173;
    const baseUrl = `http://127.0.0.1:${port}/`;

    let executablePath = undefined;
    const knownPaths = [
      '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
      '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell'
    ];
    for (const p of knownPaths) {
      if (fs.existsSync(p)) {
        executablePath = p;
        break;
      }
    }

    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    let dialogTriggered = false;
    page.on('dialog', async (d) => {
      dialogTriggered = true;
      await d.dismiss();
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1');

    // 1. Open first two video summary windows via 3-dot card menus
    const menuButtons = page.locator('button[title="Action menu"]');
    await menuButtons.nth(0).click();
    await page.locator('span:text-is("Summarize")').first().click();
    await page.waitForSelector('.yt-window-box[data-video-id="D_clickbait_chip"]');

    // Minimize window 1 first so card 2 3-dot menu is unobscured
    await page.locator('.yt-window-box[data-video-id="D_clickbait_chip"] button[aria-label="Minimize window"]').click();
    await page.waitForTimeout(100);
    const liveAfterMin = await page.locator('[data-ytais-live-region="true"]').textContent();
    assert.ok((liveAfterMin || '').includes('Minimized'), 'Simulator ARIA live region announces window minimization');
    passed++;

    await menuButtons.nth(1).click();
    await page.locator('span:text-is("Summarize")').first().click();
    await page.waitForSelector('.yt-window-box[data-video-id="D_space_webb"]');

    // Restore window 1 via dock tab
    const restoreBtn = page.locator('button[title="Restore window"]').first();
    await restoreBtn.click();
    await page.waitForSelector('.yt-window-box[data-video-id="D_clickbait_chip"]');
    const liveAfterRestore = await page.locator('[data-ytais-live-region="true"]').textContent();
    assert.ok((liveAfterRestore || '').includes('Restored'), 'Simulator ARIA live region announces window restoration');
    passed++;

    // 2. Verify all 8 resize handles + keyboard move/resize + north drag in Simulator
    const win1 = page.locator('.yt-window-box[data-video-id="D_clickbait_chip"]');
    const handleDirs = await win1.locator('.yt-resize-handle').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-resize-dir')).sort()
    );
    assert.deepEqual(handleDirs, ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'], 'Simulator renders all 8 resize handles');
    passed++;

    const boxBefore = await win1.boundingBox();
    const grip = win1.locator('.yt-win-drag-grip');
    await grip.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    const boxAfterGrip = await win1.boundingBox();
    assert.ok(boxAfterGrip && boxBefore && Math.round(boxAfterGrip.x - boxBefore.x) === 16, 'Simulator grip ArrowRight moves left +16px');
    assert.ok(boxAfterGrip && boxBefore && Math.round(boxAfterGrip.y - boxBefore.y) === 48, 'Simulator grip Shift+ArrowDown moves top +48px');
    passed += 2;

    const northHandle = win1.locator('[data-resize-dir="n"]');
    await northHandle.focus();
    await page.keyboard.press('ArrowUp');
    const boxAfterNorth = await win1.boundingBox();
    assert.ok(boxAfterNorth && boxAfterGrip && Math.round(boxAfterNorth.height - boxAfterGrip.height) === 16, 'Simulator N handle ArrowUp expands height +16px');
    passed++;

    // 3. Multi-window per-card toast isolation
    await win1.locator('.yt-tts-skip-silence-btn').click();
    const toastWin1Visible = await page.locator('[data-toast-video-id="D_clickbait_chip"]').isVisible();
    const toastWin2Count = await page.locator('[data-toast-video-id="D_space_webb"]').count();
    assert.ok(toastWin1Visible, 'Simulator renders scoped TTS toast inside triggered window');
    assert.equal(toastWin2Count, 0, 'Simulator TTS toast isolates strictly to target video window');
    passed++;

    // 4. Compact Options persistence across page reload
    const seHandle = win1.locator('[data-resize-dir="se"]');
    const seBox = await seHandle.boundingBox();
    if (seBox && boxAfterNorth) {
      await page.mouse.move(seBox.x + seBox.width / 2, seBox.y + seBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(boxAfterNorth.x + 420, boxAfterNorth.y + 420, { steps: 6 });
      await page.mouse.up();
    }
    const tierAfterResize = await win1.getAttribute('data-size-tier');
    assert.equal(tierAfterResize, 'compact', 'Resizing Simulator window below 540px enters compact tier');
    const compactOptsBtn = win1.locator('.yt-compact-options-btn');
    await compactOptsBtn.click();
    const storedCompactOpts = await page.evaluate(() => localStorage.getItem('yt_compact_options_expanded'));
    assert.ok(storedCompactOpts && storedCompactOpts.includes('"D_clickbait_chip":true'), 'Simulator persists compact Options disclosure to localStorage');
    passed += 2;

    // 5. ARIA rating announcement + YouTube Ask fallback transition announcement
    const ratingUpBtn = win1.locator('.yt-rating-up').first();
    await ratingUpBtn.click();
    const liveAfterRating = await page.locator('[data-ytais-live-region="true"]').textContent();
    assert.equal(liveAfterRating, 'Thumbs up rating saved', 'Simulator ARIA live region announces thumbs up rating persistence');
    passed++;

    // Select Ask + Simulate Ask failure -> click Regenerate
    const modelSelect = win1.locator('select[aria-label="Gemini Model Selector"]');
    const hasAskOption = await win1.locator('option[value="Ask"]').count();
    assert.ok(hasAskOption > 0, 'Simulator exposes YouTube Ask option in model selector');
    await modelSelect.selectOption('Ask');
    const failToggle = win1.locator('label:has-text("Simulate Ask failure") input[type="checkbox"]');
    await failToggle.check();
    await win1.locator('button:text-is("Regenerate")').first().click();
    const liveAfterAsk = await page.locator('[data-ytais-live-region="true"]').textContent();
    assert.ok((liveAfterAsk || '').includes('YouTube Ask failed, switched to'), 'Simulator ARIA live region announces Ask fallback model transition');
    passed++;

    // Reload persistence check for compact Options state
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('button[title="Action menu"]').nth(0).click();
    await page.locator('span:text-is("Summarize")').first().click();
    await page.waitForSelector('.yt-window-box[data-video-id="D_clickbait_chip"]');
    const storedAfterReload = await page.evaluate(() => localStorage.getItem('yt_compact_options_expanded'));
    assert.ok(storedAfterReload && storedAfterReload.includes('"D_clickbait_chip":true'), 'Compact Options preference survives page reload');
    passed++;

    // 5b. Stage 4 FEAT-01 (Interactive Timestamp Jump + Follow-Along Lock) & FEAT-03 (Summary Persona persistence)
    const winReloaded = page.locator('.yt-window-box[data-video-id="D_clickbait_chip"]');
    const tsBtn = winReloaded.locator('.yt-ts-jump-btn[data-seek-ts="[02:15]"]').first();
    await tsBtn.click();
    const liveAfterSeek = await page.locator('[data-ytais-live-region="true"]').textContent();
    assert.equal(liveAfterSeek, 'Jumped to 02:15', 'Simulator ARIA live region announces timestamp seek');
    assert.ok(await winReloaded.locator('[data-seek-banner="[02:15]"]').isVisible(), 'Simulator shows active seek banner at [02:15]');
    passed += 2;

    // Switch to Transcribe tab and verify Follow-Along Lock toggle + highlighted cue
    await winReloaded.locator('button:has-text("Transcribe")').click();
    const followAlongBtn = winReloaded.locator('.yt-follow-along-btn');
    assert.equal(await followAlongBtn.getAttribute('aria-pressed'), 'true', 'Simulator Follow-Along Lock defaults to true');
    await followAlongBtn.click();
    assert.equal(await followAlongBtn.getAttribute('aria-pressed'), 'false', 'Simulator Follow-Along Lock toggles off');
    passed += 2;

    // Switch Summary Persona to Deep Technical / Code -> updates prompt inspector -> survives reload
    const personaSelect = winReloaded.locator('select.yt-persona-select');
    await personaSelect.selectOption('technical');
    const promptPreview = await winReloaded.locator('.yt-system-prompt-preview').textContent();
    assert.ok((promptPreview || '').includes('Principal Systems Engineer'), 'Simulator persona selector updates live Gemini systemInstruction');
    passed++;

    // 5c. Stage 4 FEAT-02 Per-channel auto-title Exempt rule updates card title & survives reload
    // Minimize window so card header is unobstructed
    await winReloaded.locator('button[aria-label="Minimize window"]').click();
    const firstCard = page.locator('[data-card-video-id="D_clickbait_chip"]');
    await firstCard.locator('.yt-channel-rule-btn').click();
    await firstCard.locator('.yt-channel-rule-menu [data-rule-option="exempt"]').click();
    const firstCardTitleAfterExempt = await firstCard.locator('.yt-card-display-title').textContent();
    assert.equal(firstCardTitleAfterExempt, 'New RISC-V 128-Core Server Processor Announced', 'FEAT-02: Setting Tech Frontier Exempt yields immediately to DeArrow');

    await page.reload({ waitUntil: 'networkidle' });
    const persistedPersona = await page.evaluate(() => localStorage.getItem('yt_summary_persona'));
    const persistedChannelRules = await page.evaluate(() => localStorage.getItem('yt_channel_title_rules'));
    assert.equal(persistedPersona, 'technical', 'FEAT-03: Persona preset survives page reload');
    assert.ok((persistedChannelRules || '').includes('"tech frontier":"exempt"'), 'FEAT-02: Channel rule survives page reload');
    // Re-open window before mobile layout stress test
    await page.locator('button[title="Action menu"]').nth(0).click();
    await page.locator('span:text-is("Summarize")').first().click();
    await page.waitForSelector('.yt-window-box[data-video-id="D_clickbait_chip"]');
    passed += 3;

    // 5d. Stage 5 FEAT-04 Long-video Chapter Bar + FEAT-06 Markdown (.md) Export triggers
    await winReloaded.locator('button[aria-label="Minimize window"]').click();
    const longCard = page.locator('[data-card-video-id="D_long_lecture"]');
    await longCard.locator('button[title="Action menu"]').click();
    await page.locator('span:text-is("Summarize")').first().click();
    const winLong = page.locator('.yt-window-box[data-video-id="D_long_lecture"]');
    await winLong.waitFor();
    const chapterCount = await winLong.locator('.yt-chapter-btn').count();
    assert.equal(chapterCount, 4, 'FEAT-04: Simulator renders 4 chapter navigation buttons for D_long_lecture');
    const chunkMeta = await winLong.locator('.yt-chapter-meta').textContent();
    assert.ok((chunkMeta || '').includes('>45m'), 'FEAT-04: Simulator displays >45m chapter-aware chunked badge');
    const secChapBtn = winLong.locator('.yt-chapter-btn[data-chapter-ts="[14:20]"]');
    await secChapBtn.click();
    assert.ok((await winLong.locator('[data-seek-banner="[14:20]"]').isVisible()), 'FEAT-04: Clicking chapter button seeks to [14:20]');
    assert.equal(await page.locator('[data-ytais-live-region="true"]').textContent(), 'Jumped to 14:20', 'FEAT-04: Chapter jump updates ARIA live region');

    await winLong.locator('.yt-win-export-btn').click();
    assert.ok(await winLong.locator('.yt-export-md-btn').isVisible(), 'FEAT-06: Export menu exposes Markdown / Obsidian (.md) button');
    await winLong.locator('.yt-export-md-btn').click();
    assert.ok(await page.locator('[data-ytais-live-region="true"]').textContent() === 'Exported Obsidian Markdown bundle', 'FEAT-06: Clicking Export .md announces export completion');

    await winLong.locator('.yt-win-readability-btn').click();
    assert.ok(await winLong.locator('.yt-readability-export-md-btn').isVisible(), 'FEAT-06: Readability mode exposes Export .md button');
    await winLong.locator('.yt-readability-exit-btn').click();
    passed += 7;

    // 6. Mobile narrow viewport (<400px) & multi-width TTS control bar scaling zero-overflow stress test
    // First check wide/desktop TTS fit
    const desktopTtsMetrics = await page.evaluate(() => {
      const winBox = document.querySelector('.yt-window-box[data-video-id="D_long_lecture"]');
      const ttsBar = winBox?.querySelector('.yt-tts-control-bar');
      const speedBtns = winBox?.querySelector('.yt-tts-speed-btns');
      const winRect = winBox?.getBoundingClientRect();
      const ttsRect = ttsBar?.getBoundingClientRect();
      return {
        tier: winBox?.getAttribute('data-size-tier'),
        ttsFitsInsideWin: Boolean(winRect && ttsRect && ttsRect.right <= winRect.right + 1.5 && ttsRect.left >= winRect.left - 1.5),
        ttsNoScrollOverflow: Boolean(ttsBar && ttsBar.scrollWidth <= ttsBar.clientWidth + 2),
        speedBtnsDisplay: speedBtns ? getComputedStyle(speedBtns).display : 'none'
      };
    });
    assert.ok(desktopTtsMetrics.ttsFitsInsideWin, 'Desktop Simulator TTS bar fits within floating window bounds');
    assert.ok(desktopTtsMetrics.ttsNoScrollOverflow, 'Desktop Simulator TTS bar has no internal horizontal overflow');
    assert.notEqual(desktopTtsMetrics.speedBtnsDisplay, 'none', 'Desktop Simulator keeps granular speed buttons visible');

    // Resize floating window to compact (420px) and medium (620px) via SE handle or viewport
    await page.setViewportSize({ width: 620, height: 812 });
    await page.waitForTimeout(120);
    const mediumTtsMetrics = await page.evaluate(() => {
      const winBox = document.querySelector('.yt-window-box[data-video-id="D_long_lecture"]');
      const ttsBar = winBox?.querySelector('.yt-tts-control-bar');
      const speedBtns = winBox?.querySelector('.yt-tts-speed-btns');
      const winRect = winBox?.getBoundingClientRect();
      const ttsRect = ttsBar?.getBoundingClientRect();
      return {
        tier: winBox?.getAttribute('data-size-tier'),
        compactAttr: ttsBar?.getAttribute('data-compact-tts'),
        ttsFitsInsideWin: Boolean(winRect && ttsRect && ttsRect.right <= winRect.right + 1.5 && ttsRect.left >= winRect.left - 1.5),
        ttsNoScrollOverflow: Boolean(ttsBar && ttsBar.scrollWidth <= ttsBar.clientWidth + 2),
        speedBtnsDisplay: speedBtns ? getComputedStyle(speedBtns).display : 'none'
      };
    });
    assert.equal(mediumTtsMetrics.compactAttr, 'true', '620px viewport activates compact TTS bar attribute');
    assert.ok(mediumTtsMetrics.ttsFitsInsideWin && mediumTtsMetrics.ttsNoScrollOverflow, 'Medium Simulator TTS bar wraps cleanly without clipping');
    assert.notEqual(mediumTtsMetrics.speedBtnsDisplay, 'none', 'Medium Simulator keeps wrapping speed buttons visible');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(150);
    const mobileMetrics = await page.evaluate(() => {
      const winBox = document.querySelector('.yt-window-box[data-video-id="D_long_lecture"]');
      const ttsBar = winBox?.querySelector('.yt-tts-control-bar');
      const speedBtns = winBox?.querySelector('.yt-tts-speed-btns');
      const rect = winBox?.getBoundingClientRect();
      const ttsRect = ttsBar?.getBoundingClientRect();
      return {
        innerWidth: window.innerWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        winLeft: rect?.left || 0,
        winRight: rect?.right || 0,
        winWidth: rect?.width || 0,
        tier: winBox?.getAttribute('data-size-tier'),
        ttsFitsInsideWin: Boolean(rect && ttsRect && ttsRect.right <= rect.right + 1.5 && ttsRect.left >= rect.left - 1.5),
        ttsNoScrollOverflow: Boolean(ttsBar && ttsBar.scrollWidth <= ttsBar.clientWidth + 2),
        speedBtnsDisplay: speedBtns ? getComputedStyle(speedBtns).display : 'none'
      };
    });
    assert.ok(mobileMetrics.docScrollWidth <= mobileMetrics.innerWidth, `Mobile 375px Simulator has zero horizontal overflow (${mobileMetrics.docScrollWidth} <= ${mobileMetrics.innerWidth})`);
    assert.ok(mobileMetrics.winLeft >= 0 && mobileMetrics.winRight <= mobileMetrics.innerWidth, `Mobile 375px floating window fits inside viewport (${mobileMetrics.winLeft}..${mobileMetrics.winRight} <= ${mobileMetrics.innerWidth})`);
    assert.equal(mobileMetrics.tier, 'compact', 'Mobile 375px Simulator enters compact tier');
    assert.ok(mobileMetrics.ttsFitsInsideWin && mobileMetrics.ttsNoScrollOverflow, 'Mobile 375px Simulator TTS bar wraps cleanly inside compact window');
    assert.equal(mobileMetrics.speedBtnsDisplay, 'none', 'Mobile 375px compact Simulator collapses speed pills cleanly while keeping speed slider');
    assert.equal(dialogTriggered, false, 'Simulator emits zero blocking alert/confirm dialogs');
    assert.equal(pageErrors.length, 0, `Zero runtime page errors (${pageErrors.join('; ')})`);
    passed += 12;

    // 7. FEAT-07 Interactive Multi-Host Podcast Studio inside React Simulator (desktop & 375px mobile)
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.waitForTimeout(100);
    await winLong.locator('.yt-podcast-mode-btn').click();
    await winLong.locator('.yt-podcast-studio').waitFor({ state: 'visible' });

    // Configure 4 hosts & generate podcast
    await winLong.locator('.yt-podcast-host-count-select').selectOption('4');
    await page.waitForFunction(() => document.querySelectorAll('.yt-podcast-host-card').length === 4);
    await winLong.locator('.yt-podcast-generate-btn').click();
    await winLong.locator('.yt-podcast-player-card').waitFor({ state: 'visible' });

    const simPodcastInfo = await page.evaluate(() => {
      const box = document.querySelector('.yt-window-box[data-video-id="D_long_lecture"]');
      const turns = Array.from(box?.querySelectorAll('.yt-podcast-turn') || []);
      const speakers = new Set(turns.map((el) => el.querySelector('.yt-podcast-turn-speaker')?.textContent?.trim()));
      const hostNames = Array.from(box?.querySelectorAll('.yt-podcast-host-name-input') || []).map((i) => i.value);
      return {
        turnCount: turns.length,
        hostCount: hostNames.length,
        allHostsPresent: hostNames.every((n) => speakers.has(n))
      };
    });
    assert.equal(simPodcastInfo.hostCount, 4, 'Simulator configures 4 podcast hosts');
    assert.ok(simPodcastInfo.turnCount >= 5, 'Simulator generates multi-turn podcast script');
    assert.ok(simPodcastInfo.allHostsPresent, 'Simulator includes all 4 hosts in podcast dialogue');

    // Typed question & Voice interruption
    await winLong.locator('.yt-podcast-qa-input').fill('How do ReadIndex leases avoid disk fsync latency?');
    await winLong.locator('.yt-podcast-ask-btn').click();
    await winLong.locator('.yt-podcast-turn-user').waitFor({ state: 'visible' });
    await winLong.locator('.yt-podcast-turn-reply').first().waitFor({ state: 'visible' });

    await page.evaluate(() => {
      window.__yt_mock_voice_text = 'Why do split votes resolve faster with randomized timeouts?';
    });
    await winLong.locator('.yt-podcast-mic-btn').click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.yt-window-box[data-video-id="D_long_lecture"] .yt-podcast-turn-user')
          .length >= 2
    );

    // Verify 375px mobile fit on active Podcast tab
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(140);
    const simMobilePod = await page.evaluate(() => {
      const box = document.querySelector('.yt-window-box[data-video-id="D_long_lecture"]');
      const studio = box?.querySelector('.yt-podcast-studio');
      delete window.__yt_mock_voice_text;
      return {
        docOverflow: document.documentElement.scrollWidth > window.innerWidth,
        studioOverflow: Boolean(studio && studio.scrollWidth > studio.clientWidth + 2)
      };
    });
    assert.equal(simMobilePod.docOverflow, false, 'Simulator Podcast tab has zero page overflow at 375px');
    assert.equal(simMobilePod.studioOverflow, false, 'Simulator Podcast studio fits cleanly inside compact 375px window');
    assert.equal(pageErrors.length, 0, `Zero runtime page errors after Podcast tests (${pageErrors.join('; ')})`);
    passed += 7;

    // 8. Material You UI Theme Toggle (System / Light / Dark), reload persistence, & OS tracking
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(100);
    const themeToggle = page.locator('[data-testid="app-theme-toggle"]');
    await themeToggle.waitFor({ state: 'visible' });

    // Switch to Light mode
    await themeToggle.locator('button[data-app-theme-option="light"]').click();
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark') && getComputedStyle(document.body).backgroundColor === 'rgb(249, 249, 255)');
    const lightState = await page.evaluate(() => ({
      hasDarkClass: document.documentElement.classList.contains('dark'),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      stored: localStorage.getItem('yt_app_theme_mode'),
      pressed: document.querySelector('[data-app-theme-option="light"]')?.getAttribute('aria-pressed'),
      overflow: document.documentElement.scrollWidth > window.innerWidth
    }));
    assert.equal(lightState.hasDarkClass, false, 'Light mode removes .dark class from html root');
    assert.equal(lightState.colorScheme, 'light', 'Light mode sets colorScheme to light');
    assert.equal(lightState.stored, 'light', 'Light mode persists in localStorage');
    assert.equal(lightState.pressed, 'true', 'Light toggle button exposes aria-pressed="true"');
    assert.equal(lightState.overflow, false, 'Desktop 1440px Light mode has zero overflow');

    // Switch to Dark mode
    await themeToggle.locator('button[data-app-theme-option="dark"]').click();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark') && getComputedStyle(document.body).backgroundColor === 'rgb(17, 19, 24)');
    const darkState = await page.evaluate(() => ({
      hasDarkClass: document.documentElement.classList.contains('dark'),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      stored: localStorage.getItem('yt_app_theme_mode'),
      pressed: document.querySelector('[data-app-theme-option="dark"]')?.getAttribute('aria-pressed')
    }));
    assert.equal(darkState.hasDarkClass, true, 'Dark mode adds .dark class to html root');
    assert.equal(darkState.colorScheme, 'dark', 'Dark mode sets colorScheme to dark');
    assert.notEqual(darkState.bodyBg, lightState.bodyBg, 'Dark mode changes Material You surface background color');
    assert.equal(darkState.stored, 'dark', 'Dark mode persists in localStorage');
    assert.equal(darkState.pressed, 'true', 'Dark toggle button exposes aria-pressed="true"');

    // Reload persistence check for Light mode
    await themeToggle.locator('button[data-app-theme-option="light"]').click();
    await page.reload({ waitUntil: 'networkidle' });
    const afterReloadLight = await page.evaluate(() => ({
      hasDarkClass: document.documentElement.classList.contains('dark'),
      stored: localStorage.getItem('yt_app_theme_mode'),
      pressed: document.querySelector('[data-app-theme-option="light"]')?.getAttribute('aria-pressed')
    }));
    assert.equal(afterReloadLight.hasDarkClass, false, 'Light mode survives page reload via anti-FOUC + React init');
    assert.equal(afterReloadLight.stored, 'light', 'localStorage preserves light mode after reload');
    assert.equal(afterReloadLight.pressed, 'true', 'Light toggle stays pressed after reload');

    // System mode follows prefers-color-scheme media query
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.locator('[data-testid="app-theme-toggle"] button[data-app-theme-option="system"]').click();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));

    // Mobile 375px Light & Dark overflow check
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(120);
    const mobileLightOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(mobileLightOverflow, false, 'Mobile 375px Light mode has zero horizontal overflow');
    assert.equal(pageErrors.length, 0, `Zero runtime page errors after Material You theme tests (${pageErrors.join('; ')})`);
    passed += 14;

    // 9. Stage 6 Interactive Feature Parity: Manual music title, Top-left Quick Menu, Movable/Resizable History, Settings & Formatting persistence, & Follow-up Model Dropdown + Ladder Fallback
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(100);

    // Close open summary windows first so feed cards and modals are clean
    const closeBtns9 = page.locator('.yt-window-box .yt-win-close-btn');
    const closeCount9 = await closeBtns9.count();
    for (let i = 0; i < closeCount9; i++) {
      await page.locator('.yt-window-box .yt-win-close-btn').first().click();
    }

    // 9a. Manual music title generation & toggle
    const musicCardSim = page.locator('[data-card-video-id="D_music_exempt"]');
    const initialMusicSim = await musicCardSim.locator('.yt-card-display-title').textContent();
    assert.equal(initialMusicSim, 'Dua Lipa - Levitating (Official Music Video)', 'Sim Section 9: Music card preserves original title on load');
    const musicBtnText = await musicCardSim.locator('.yt-music-exempt-icon').textContent();
    assert.equal(musicBtnText?.trim(), '', 'Sim Section 9: Music exempt icon is strictly icon-only');
    await musicCardSim.locator('.yt-music-exempt-icon').click();
    const aiMusicSim = await musicCardSim.locator('.yt-card-display-title').textContent();
    assert.ok((aiMusicSim || '').includes('Levitating') && (aiMusicSim || '').includes('1980s'), 'Sim Section 9: Clicking music icon generates descriptive AI title');
    await musicCardSim.locator('.yt-music-exempt-icon').click();
    const revertedMusicSim = await musicCardSim.locator('.yt-card-display-title').textContent();
    assert.equal(revertedMusicSim, 'Dua Lipa - Levitating (Official Music Video)', 'Sim Section 9: Clicking music icon again reverts to original');
    passed += 4;

    // 9b. Top-left launcher opens movable & 8-dir resizable Quick Menu -> Previous Summaries
    await page.locator('.yt-topbar-launcher-btn[data-ytais-launcher="true"]').click();
    const quickMenu = page.locator('.yt-quick-menu-box');
    await quickMenu.waitFor({ state: 'visible' });
    const qHandleDirs = await quickMenu.locator('.yt-resize-handle').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-resize-dir')).sort()
    );
    assert.deepEqual(qHandleDirs, ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'], 'Sim Section 9: Quick Menu exposes 8 resize handles');
    const qBoxBefore = await quickMenu.boundingBox();
    await quickMenu.locator('.yt-win-drag-grip').focus();
    await page.keyboard.press('ArrowRight');
    const qBoxMoved = await quickMenu.boundingBox();
    assert.ok(qBoxBefore && qBoxMoved && Math.round(qBoxMoved.x - qBoxBefore.x) === 16, 'Sim Section 9: Quick Menu grip ArrowRight moves +16px');
    await quickMenu.locator('[data-resize-dir="se"]').focus();
    await page.keyboard.press('ArrowDown');
    const qBoxResized = await quickMenu.boundingBox();
    assert.ok(qBoxMoved && qBoxResized && Math.round(qBoxResized.height - qBoxMoved.height) === 16, 'Sim Section 9: Quick Menu SE handle ArrowDown expands height +16px');
    await quickMenu.locator('.yt-quick-open-history-btn').click();
    passed += 3;

    // 9c. Previous Summaries window is movable, 8-dir resizable & has Settings button next to Close
    const histWin = page.locator('.yt-history-dialog-box');
    await histWin.waitFor({ state: 'visible' });
    const hHandleDirs = await histWin.locator('.yt-resize-handle').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-resize-dir')).sort()
    );
    assert.deepEqual(hHandleDirs, ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'], 'Sim Section 9: Previous Summaries exposes 8 resize handles');
    const hBoxBefore = await histWin.boundingBox();
    await histWin.locator('.yt-win-drag-grip').focus();
    await page.keyboard.press('ArrowRight');
    const hBoxMoved = await histWin.boundingBox();
    assert.ok(hBoxBefore && hBoxMoved && Math.round(hBoxMoved.x - hBoxBefore.x) === 16, 'Sim Section 9: Previous Summaries grip ArrowRight moves +16px');
    await histWin.locator('[data-resize-dir="s"]').focus();
    await page.keyboard.press('ArrowDown');
    const hBoxResized = await histWin.boundingBox();
    assert.ok(hBoxMoved && hBoxResized && Math.round(hBoxResized.height - hBoxMoved.height) === 16, 'Sim Section 9: Previous Summaries S handle ArrowDown expands height +16px');

    const histSettingsNextToClose = await histWin.evaluate((el) => {
      const sBtn = el.querySelector('.yt-history-settings-btn');
      const cBtn = el.querySelector('.yt-win-close-btn');
      return Boolean(sBtn && cBtn && sBtn.nextElementSibling === cBtn);
    });
    assert.equal(histSettingsNextToClose, true, 'Sim Section 9: History window places Settings button right next to Close button');
    await histWin.locator('.yt-history-settings-btn').click();
    passed += 4;

    // 9d. Settings Modal UI & Generated formatting + Persistence + Summary Window Settings button
    const settingsDlg = page.locator('.yt-key-dialog-box');
    await settingsDlg.waitFor({ state: 'visible' });
    await settingsDlg.locator('[data-setting="ui-font-family"]').selectOption('serif');
    await settingsDlg.locator('[data-setting="gen-font-family"]').selectOption('mono');
    await settingsDlg.locator('[data-setting="gen-rich-formatting"]').uncheck();
    const cssVarsSet = await page.evaluate(() => ({
      uiFont: document.documentElement.style.getPropertyValue('--yt-ui-font'),
      genFont: document.documentElement.style.getPropertyValue('--yt-gen-font')
    }));
    assert.ok(cssVarsSet.uiFont.includes('Georgia'), 'Sim Section 9: UI serif updates --yt-ui-font CSS variable');
    assert.ok(cssVarsSet.genFont.includes('JetBrains Mono'), 'Sim Section 9: Generated mono updates --yt-gen-font CSS variable');
    await settingsDlg.locator('.yt-win-close-btn').click();
    await histWin.locator('.yt-win-close-btn').click();

    // Open Summary Window, check Settings button next to Readability + Follow-up Model Dropdown + Ladder Fallback
    await page.locator('button[title="Action menu"]').nth(0).click();
    await page.locator('span:text-is("Summarize")').first().click();
    const simWin9 = page.locator('.yt-window-box[data-video-id="D_clickbait_chip"]');
    await simWin9.waitFor({ state: 'visible' });

    const simHeaderAndComposerOrder = await simWin9.evaluate((el) => {
      const rBtn = el.querySelector('.yt-win-readability-btn');
      const sBtn = el.querySelector('.yt-win-settings-btn');
      const ta = el.querySelector('.yt-composer-textarea');
      const sel = el.querySelector('.yt-composer-model-select');
      return {
        settingsNextToReadability: Boolean(rBtn && sBtn && rBtn.nextElementSibling === sBtn),
        modelNextToTextbox: Boolean(ta && sel && ta.nextElementSibling === sel),
        plainClassActive: Boolean(el.querySelector('.yt-gen-plain-text'))
      };
    });
    assert.equal(simHeaderAndComposerOrder.settingsNextToReadability, true, 'Sim Section 9: Summary header places Settings button next to Readability button');
    assert.equal(simHeaderAndComposerOrder.modelNextToTextbox, true, 'Sim Section 9: Follow-up dropdown sits right next to composer textbox');
    assert.equal(simHeaderAndComposerOrder.plainClassActive, true, 'Sim Section 9: Plain-text mode applies yt-gen-plain-text to generated body');

    // Follow-up unavailable model simulation steps down ladder from gemini-4-argon -> gemini-3.8-flash
    await simWin9.locator('.yt-composer-model-select').selectOption('gemini-4-argon');
    await simWin9.locator('[data-testid="sim-followup-unavailable"]').check();
    await simWin9.locator('.yt-composer-textarea').fill('What is the sparse tensor throughput gain?');
    await simWin9.locator('.yt-composer-send-btn').click();
    await simWin9.locator('.yt-followup-fallback-note').waitFor({ state: 'visible' });
    const postFallbackSelect = await simWin9.locator('.yt-composer-model-select').inputValue();
    const fallbackBannerTxt = await simWin9.locator('.yt-followup-fallback-note').textContent();
    assert.equal(postFallbackSelect, 'gemini-3.8-flash', 'Sim Section 9: Unavailable follow-up model automatically steps down ladder to gemini-3.8-flash');
    assert.ok((fallbackBannerTxt || '').includes('gemini-3.8-flash'), 'Sim Section 9: Shows visible fallback notice banner');

    // Verify Summary window Settings button opens Settings modal & formatting persists across reload
    await simWin9.locator('.yt-win-settings-btn').click();
    await settingsDlg.waitFor({ state: 'visible' });
    await settingsDlg.locator('.yt-win-close-btn').click();
    await page.reload({ waitUntil: 'networkidle' });
    const persistedGenFmt = await page.evaluate(() => localStorage.getItem('yt_gen_formatting'));
    assert.ok((persistedGenFmt || '').includes('"fontFamily":"mono"'), 'Sim Section 9: Generated text formatting survives reload');
    assert.equal(pageErrors.length, 0, `Zero runtime page errors after Section 9 tests (${pageErrors.join('; ')})`);
    passed += 9;

    // 10. Movable & 8-Dir Resizable Settings Control Center, All Setting Categories, 3-Way AI Title Mode & History Bottom-Tab + Home-Only Scope
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(100);
    // Open Settings via top-left launcher -> Settings button
    await page.locator('.yt-topbar-launcher-btn[data-ytais-launcher="true"]').click();
    await page.locator('.yt-quick-menu-box .yt-quick-open-settings-btn').click();
    const sDlg10 = page.locator('.yt-settings-dialog-box');
    await sDlg10.waitFor({ state: 'visible' });

    const sHandleDirs10 = await sDlg10.locator('.yt-resize-handle').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-resize-dir')).sort()
    );
    assert.deepEqual(sHandleDirs10, ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'], 'Sim Section 10: Settings window exposes 8 resize handles');

    const sBoxBefore10 = await sDlg10.boundingBox();
    await sDlg10.locator('.yt-win-drag-grip').focus();
    await page.keyboard.press('ArrowRight');
    const sBoxMoved10 = await sDlg10.boundingBox();
    assert.ok(sBoxBefore10 && sBoxMoved10 && Math.round(sBoxMoved10.x - sBoxBefore10.x) === 16, 'Sim Section 10: Settings grip ArrowRight moves +16px');

    await sDlg10.locator('[data-resize-dir="se"]').focus();
    await page.keyboard.press('ArrowDown');
    const sBoxResized10 = await sDlg10.boundingBox();
    assert.ok(sBoxMoved10 && sBoxResized10 && Math.round(sBoxResized10.height - sBoxMoved10.height) === 16, 'Sim Section 10: Settings SE handle ArrowDown expands height +16px');

    const persistedSettingsBounds = await page.evaluate(() => localStorage.getItem('yt_settings_bounds'));
    assert.ok(Boolean(persistedSettingsBounds && JSON.parse(persistedSettingsBounds).height > 0), 'Sim Section 10: Settings bounds persist in localStorage');

    // Category tabs
    assert.equal(await sDlg10.locator('[data-settings-tab="all"]').getAttribute('aria-selected'), 'true', 'Sim Section 10: Settings opens on All Settings tab');
    await sDlg10.locator('[data-settings-tab="podcast"]').click();
    assert.equal(await sDlg10.locator('[data-settings-cat="summaries"]').count(), 0, 'Sim Section 10: Podcast tab hides non-podcast sections');
    await sDlg10.locator('[data-settings-tab="all"]').click();
    assert.equal(await sDlg10.locator('[data-settings-cat="summaries"]').count(), 1, 'Sim Section 10: All Settings tab restores all sections');

    // Update Summary, Output Language, Podcast & Voice Engine settings
    await sDlg10.locator('[data-setting="default-summary-model"]').selectOption('gemini-3.5-flash');
    await sDlg10.locator('[data-setting="output-language"]').fill('French');
    await sDlg10.locator('[data-setting="default-podcast-host-count"]').selectOption('4');
    await sDlg10.locator('[data-setting="podcast-synthesis-mode"]').selectOption('webspeech');
    await sDlg10.locator('[data-setting="voice-input-engine"]').selectOption('gemini');

    // 3-Way Video Title Mode: Manual disables auto replacement on load, clicking card toggle applies AI title
    await sDlg10.locator('.yt-alt-title-mode-btn[data-alt-title-mode="manual"]').click();
    await sDlg10.locator('.yt-win-close-btn').click();
    const quantumCardTitle = page.locator('[data-card-video-id="D_quantum_101"] .yt-card-display-title');
    const titleUnderManual = (await quantumCardTitle.textContent())?.trim() || '';
    assert.ok(titleUnderManual.includes('Advanced Quantum Computing & Topological Qubits'), 'Sim Section 10: Manual mode keeps original title until card button is clicked');
    await page.locator('[data-card-video-id="D_quantum_101"] .yt-alt-title-btn').click();
    const titleAfterManualClick = (await quantumCardTitle.textContent())?.trim() || '';
    assert.ok(titleAfterManualClick.includes('Topological quantum computing architecture'), 'Sim Section 10: Clicking toggle button in Manual mode switches to AI title');

    // History Dock Toggle & Page Scope (All Pages vs Home Feed Only)
    assert.equal(await page.locator('.yt-dock-history-tab').count(), 1, 'Sim Section 10: History dock tab is visible on Home Feed by default');
    await page.locator('.yt-topbar-launcher-btn[data-ytais-launcher="true"]').click();
    await page.locator('.yt-quick-menu-box .yt-quick-open-settings-btn').click();
    await sDlg10.waitFor({ state: 'visible' });

    await sDlg10.locator('[data-setting="show-history-bottom-tab"]').uncheck();
    assert.equal(await page.locator('.yt-dock-history-tab').count(), 0, 'Sim Section 10: Unchecking Show History tab hides lower-right dock pill');
    await sDlg10.locator('[data-setting="show-history-bottom-tab"]').check();
    assert.equal(await page.locator('.yt-dock-history-tab').count(), 1, 'Sim Section 10: Re-checking Show History tab restores lower-right dock pill');

    await sDlg10.locator('[data-history-scope="home_only"]').click();
    await sDlg10.locator('.yt-win-close-btn').click();
    assert.equal(await page.locator('.yt-dock-history-tab').count(), 1, 'Sim Section 10: History dock tab stays visible on Home Feed under home_only');

    await page.locator('[data-sim-page="video"]').click();
    assert.equal(await page.locator('.yt-dock-history-tab').count(), 0, 'Sim Section 10: History dock tab hides on Video Page when scoped to Home Feed Only');

    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.yt-dock-history-tab').count(), 0, 'Sim Section 10: Video Page + home_only History scope persists across reload');
    await page.locator('[data-sim-page="home"]').click();
    assert.equal(await page.locator('.yt-dock-history-tab').count(), 1, 'Sim Section 10: Returning to Home Feed restores History dock tab');

    // Verify Reset All restores defaults
    await page.locator('.yt-topbar-launcher-btn[data-ytais-launcher="true"]').click();
    await page.locator('.yt-quick-menu-box .yt-quick-open-settings-btn').click();
    await sDlg10.waitFor({ state: 'visible' });
    await sDlg10.locator('.yt-reset-all-settings-btn').click();
    const postResetStorage = await page.evaluate(() => ({
      mode: localStorage.getItem('yt_alt_title_mode'),
      scope: localStorage.getItem('yt_history_page_scope'),
      lang: localStorage.getItem('yt_output_language')
    }));
    assert.equal(postResetStorage.mode, 'on', 'Sim Section 10: Reset All restores altTitleMode to on');
    assert.equal(postResetStorage.scope, 'all_pages', 'Sim Section 10: Reset All restores historyPageScope to all_pages');
    assert.equal(postResetStorage.lang, 'English', 'Sim Section 10: Reset All restores outputLanguage to English');
    await sDlg10.locator('.yt-win-close-btn').click();
    assert.equal(pageErrors.length, 0, `Zero runtime page errors after Section 10 tests (${pageErrors.join('; ')})`);
    passed += 20;

    // 11. Summary Visual Cards (Video Frames & Diagrams) + Default Fact-Check & Verification Below Summary
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-card-video-id="D_clickbait_chip"] button[title="Action menu"]').click();
    await page.locator('span:text-is("Summarize")').first().click();
    const simWin11 = page.locator('.yt-window-box[data-video-id="D_clickbait_chip"]');
    await simWin11.waitFor({ state: 'visible' });

    const frameCards11 = simWin11.locator('.yt-visual-card.yt-frame-card');
    const commonsCards11 = simWin11.locator('.yt-visual-card.yt-commons-card');
    assert.ok((await frameCards11.count()) >= 1, 'Sim Section 11: Renders embedded video frame cards inside summary');
    assert.ok((await commonsCards11.count()) >= 1, 'Sim Section 11: Renders embedded diagram cards inside summary');
    const frameRect11 = await frameCards11.first().locator('.yt-frame-preview').boundingBox();
    assert.ok(frameRect11 && frameRect11.width >= 150 && frameRect11.height >= 80, 'Sim Section 11: Video frame preview renders at readable 16:9 dimensions');

    // Clicking frame card seeks video player to its timestamp
    await frameCards11.first().locator('.yt-frame-preview').click();
    await simWin11.locator('[data-seek-banner]').waitFor({ state: 'visible' });
    assert.ok((await simWin11.locator('[data-seek-banner]').count()) === 1, 'Sim Section 11: Clicking frame card seeks player timestamp');

    // Fact-Check & Verification box renders below summary by default with verdict claims & sources
    const factBox11 = simWin11.locator('[data-testid="fact-check-box"]');
    await factBox11.waitFor({ state: 'visible' });
    const factBoxText11 = (await factBox11.textContent()) || '';
    assert.ok(factBoxText11.includes('Fact-check & Verification'), 'Sim Section 11: Fact-check box renders below summary by default');
    assert.ok(factBoxText11.includes('Supported'), 'Sim Section 11: Fact-check box displays verified claim verdicts');
    assert.ok((await factBox11.locator('.yt-sources-consulted .yt-source-item a').count()) >= 1, 'Sim Section 11: Grounded source links render inside fact-check box');

    // Re-run Fact Check works smoothly
    await factBox11.getByRole('button', { name: /Re-run Fact Check/i }).click();
    await page.waitForTimeout(420);
    assert.ok(((await factBox11.textContent()) || '').includes('Supported'), 'Sim Section 11: Re-run Fact Check completes without error');

    // Readability view also preserves visual figures and fact-check box
    await simWin11.locator('.yt-win-readability-btn').click();
    await simWin11.locator('.yt-readability-container').waitFor({ state: 'visible' });
    assert.ok((await simWin11.locator('.yt-readability-visual-card').count()) >= 1, 'Sim Section 11: Readability mode renders visual frame/diagram figures');
    assert.ok((await simWin11.locator('.yt-readability-fact-box').count()) === 1, 'Sim Section 11: Readability mode renders Fact-Check & Verification box');
    await simWin11.locator('.yt-readability-exit-btn').click();

    // Toggling off Fact-check & Images in Settings hides visuals & switches fact-check box to Enable & Run state
    await simWin11.locator('.yt-win-settings-btn').click();
    const sDlg11 = page.locator('.yt-settings-dialog-box');
    await sDlg11.waitFor({ state: 'visible' });
    await sDlg11.locator('[data-setting="default-opt-img"]').uncheck();
    await sDlg11.locator('[data-setting="default-opt-fc"]').uncheck();
    await sDlg11.locator('[data-setting="default-opt-src"]').uncheck();
    await sDlg11.locator('.yt-win-close-btn').click();

    assert.equal(await simWin11.locator('.yt-visual-card').count(), 0, 'Sim Section 11: Unchecking Images & diagrams hides visual cards');
    assert.ok(await factBox11.getByRole('button', { name: /Enable & Run Fact-Check/i }).isVisible(), 'Sim Section 11: Turning off Fact-check shows Enable & Run Fact-Check prompt');
    await factBox11.getByRole('button', { name: /Enable & Run Fact-Check/i }).click();
    await page.waitForTimeout(420);
    assert.ok(((await factBox11.textContent()) || '').includes('Supported'), 'Sim Section 11: Enable & Run Fact-Check restores verification');

    await simWin11.locator('button[aria-label="Close window"]').click();
    assert.equal(pageErrors.length, 0, `Zero runtime page errors after Section 11 tests (${pageErrors.join('; ')})`);
    passed += 13;

    // 12. Header Title Toggle, Auto Fact-Check + Ladder Fallback, Follow-Up Edit/Regen/< 1 / N > Pager & Multi-Part Podcast
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });

    // A) Header Title Switch Button (AI <-> Original)
    await page.locator('[data-card-video-id="D_clickbait_chip"] button[title="Action menu"]').click();
    await page.locator('span:text-is("Summarize")').first().click();
    const simWin12 = page.locator('.yt-window-box[data-video-id="D_clickbait_chip"]');
    await simWin12.waitFor({ state: 'visible' });

    const headerLink12 = simWin12.locator('.yt-win-title-link');
    const titleToggleBtn12 = simWin12.locator('.yt-win-title-switch-btn');
    const titleAiInitial = (await headerLink12.textContent())?.trim() || '';
    assert.ok(titleAiInitial.includes('RISC-V'), 'Sim Section 12: Window header opens with AI descriptive title');
    await titleToggleBtn12.click();
    const titleOrigAfterClick = (await headerLink12.textContent())?.trim() || '';
    assert.ok(titleOrigAfterClick.includes('Intel & AMD'), 'Sim Section 12: Clicking header switch toggles to original video title');
    await titleToggleBtn12.click();
    const titleBackToAi = (await headerLink12.textContent())?.trim() || '';
    assert.equal(titleBackToAi, titleAiInitial, 'Sim Section 12: Clicking header switch again toggles back to AI title');

    // B) Settings Auto Fact-Check Default ON -> Toggle OFF -> Deferred Run + Simulated Unavailable Ladder Step-Down
    await simWin12.locator('.yt-win-settings-btn').click();
    const sDlg12 = page.locator('.yt-settings-dialog-box');
    await sDlg12.waitFor({ state: 'visible' });
    const autoFcCheck12 = sDlg12.locator('[data-setting="default-opt-autofc"]');
    assert.equal(await autoFcCheck12.isChecked(), true, 'Sim Section 12: Auto Fact-Check after summary defaults checked');
    await autoFcCheck12.uncheck();
    await sDlg12.locator('.yt-win-close-btn').click();
    await simWin12.locator('button[aria-label="Close window"]').click();

    await page.locator('[data-card-video-id="D_quantum_101"] button[title="Action menu"]').click();
    await page.locator('span:text-is("Summarize")').first().click();
    const simWin12Fc = page.locator('.yt-window-box[data-video-id="D_quantum_101"]');
    await simWin12Fc.waitFor({ state: 'visible' });
    const factBox12 = simWin12Fc.locator('[data-testid="fact-check-box"]');
    await factBox12.waitFor({ state: 'visible' });
    assert.equal(await factBox12.locator('.yt-fact-deferred').count(), 1, 'Sim Section 12: Disabling Auto Fact-Check defers automatic verification on new summaries');

    await factBox12.locator('[data-testid="sim-factcheck-unavailable"]').check();
    await factBox12.locator('.yt-fact-retry-btn').click();
    await factBox12.locator('.yt-fact-fallback-note').waitFor({ state: 'visible' });
    const fcFallbackNote12 = (await factBox12.locator('.yt-fact-fallback-note').textContent()) || '';
    assert.ok(fcFallbackNote12.includes('stepped down') && ((await factBox12.textContent()) || '').includes('Supported'), 'Sim Section 12: Unavailable fact-check model steps down ladder and completes claims');

    // C) Follow-Up Question Edit, Regenerate with Different Model, and Gemini-Style < 1 / N > Version Pager
    const composerInput12 = simWin12Fc.locator('.yt-composer-textarea');
    const composerSend12 = simWin12Fc.locator('.yt-composer-send-btn');
    await composerInput12.fill('First question on error correction?');
    await composerSend12.click();
    const turn0 = simWin12Fc.locator('.yt-turn-block[data-turn-idx="0"]');
    await turn0.waitFor({ state: 'visible' });

    const originalUserText = (await turn0.locator('.yt-user-bubble').textContent())?.trim() || '';
    assert.ok(originalUserText.includes('First question on error correction?'), 'Sim Section 12: Initial question renders in turn 0');

    await turn0.locator('.yt-turn-edit-btn').click();
    await turn0.locator('.yt-turn-edit-input').fill('Edited question on Majorana braiding?');
    await turn0.locator('.yt-turn-edit-save-btn').click();
    await turn0.locator('.yt-turn-ver-label').waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => (document.querySelector('.yt-window-box[data-video-id="D_quantum_101"] .yt-turn-ver-label')?.textContent || '').trim() === '2 / 2'
    );

    assert.equal((await turn0.locator('.yt-turn-ver-label').textContent())?.trim(), '2 / 2', 'Sim Section 12: Editing & saving appends version 2 / 2');
    assert.ok(((await turn0.locator('.yt-user-bubble').textContent()) || '').includes('Edited question on Majorana braiding?'), 'Sim Section 12: Active turn reflects edited question text');

    // Switch model selector and click Regenerate directly -> 3 / 3
    await simWin12Fc.locator('.yt-composer-model-select').selectOption('gemini-3.5-flash');
    await turn0.locator('.yt-turn-regen-btn').click();
    await page.waitForFunction(
      () => (document.querySelector('.yt-window-box[data-video-id="D_quantum_101"] .yt-turn-ver-label')?.textContent || '').trim() === '3 / 3'
    );
    assert.equal((await turn0.locator('.yt-turn-ver-label').textContent())?.trim(), '3 / 3', 'Sim Section 12: Direct Regenerate appends version 3 / 3 with selected model');
    assert.ok(((await turn0.locator('.yt-turn-model-pill').textContent()) || '').includes('gemini-3.5-flash'), 'Sim Section 12: Version 3 / 3 displays regenerated model badge');

    // Navigate back to 1 / 3 via Previous arrow & confirm original question/answer history kept
    await turn0.locator('.yt-turn-ver-prev').click();
    assert.equal((await turn0.locator('.yt-turn-ver-label').textContent())?.trim(), '2 / 3', 'Sim Section 12: Stepping prev moves pager to 2 / 3');
    await turn0.locator('.yt-turn-ver-prev').click();
    assert.equal((await turn0.locator('.yt-turn-ver-label').textContent())?.trim(), '1 / 3', 'Sim Section 12: Stepping prev moves pager to 1 / 3');
    assert.ok(((await turn0.locator('.yt-user-bubble').textContent()) || '').includes('First question on error correction?'), 'Sim Section 12: Version 1 / 3 preserves original question text');
    await turn0.locator('.yt-turn-ver-next').click();
    assert.equal((await turn0.locator('.yt-turn-ver-label').textContent())?.trim(), '2 / 3', 'Sim Section 12: Next arrow restores 2 / 3');
    await simWin12Fc.locator('button[aria-label="Close window"]').click();

    // D) Multi-Part Full-Summary Podcast Generation + Zero Speaker Self-Names
    await page.locator('[data-card-video-id="D_long_lecture"] button[title="Action menu"]').click();
    await page.locator('span:text-is("Summarize")').first().click();
    const simWin12Pod = page.locator('.yt-window-box[data-video-id="D_long_lecture"]');
    await simWin12Pod.waitFor({ state: 'visible' });
    await simWin12Pod.locator('.yt-podcast-mode-btn').click();
    await simWin12Pod.locator('.yt-podcast-generate-btn').click();
    await simWin12Pod.locator('.yt-podcast-turn').first().waitFor({ state: 'visible' });

    const podBadge = simWin12Pod.locator('[data-testid="podcast-gen-badge"]');
    await podBadge.waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => (document.querySelector('.yt-window-box[data-video-id="D_long_lecture"] [data-testid="podcast-gen-badge"]')?.textContent || '').includes('Full summary')
    );
    const badgeText = (await podBadge.textContent()) || '';
    const podTurnsText = await simWin12Pod.locator('.yt-podcast-turn-text').allTextContents();
    assert.ok(badgeText.includes('Full summary'), `Sim Section 12: Long lecture podcast finishes multi-part generation (${badgeText})`);
    assert.ok(podTurnsText.length >= 6, `Sim Section 12: Multi-part podcast spans full summary turns (${podTurnsText.length})`);
    assert.equal(
      podTurnsText.some((t) => /^(Alex|Maya|Sam|Jordan)\s*:|\b(I'm|I am)\s+(Alex|Maya|Sam|Jordan)\b/i.test(t.trim())),
      false,
      'Sim Section 12: Podcast turns never start with hosts saying their own names'
    );

    await simWin12Pod.locator('button[aria-label="Close window"]').click();
    assert.equal(pageErrors.length, 0, `Zero runtime page errors after Section 12 tests (${pageErrors.join('; ')})`);
    passed += 18;

    // 13. UI Accent Color Wheel & 12 Pastel Swatches + Continue Audio on Minimize with Dock Mini-Controls
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });

    // A) Settings Appearance: Color Wheel, 12 Pastel Swatches, Hex Input, Reset Accent (Dark + Light themes)
    await page.locator('.yt-topbar-launcher-btn[data-ytais-launcher="true"]').click();
    await page.locator('.yt-quick-menu-box .yt-quick-open-settings-btn').click();
    const sDlg13 = page.locator('.yt-settings-dialog-box');
    await sDlg13.waitFor({ state: 'visible' });

    const pastelBtns13 = sDlg13.locator('[data-testid="sim-pastel-swatches"] button');
    assert.equal(await pastelBtns13.count(), 12, 'Sim Section 13: Settings Appearance renders 12 pastel accent swatches');
    assert.equal(await sDlg13.locator('[data-testid="sim-accent-color-wheel"]').isVisible(), true, 'Sim Section 13: Color Wheel is visible in Settings Appearance');

    // Click Rose Pastel (#FDA4AF) & check Dark theme token first
    await sDlg13.locator('button[data-app-theme="dark"]').click();
    await sDlg13.locator('[data-testid="sim-pastel-swatches"] button[data-accent-hex="#FDA4AF"]').click();
    const darkRosePrimary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim());
    const hexInputVal = (await sDlg13.locator('[data-testid="sim-accent-hex-input"]').inputValue()).toUpperCase();
    assert.equal(hexInputVal, '#FDA4AF', 'Sim Section 13: Selecting Rose Pastel updates accent hex input');
    assert.ok(darkRosePrimary.startsWith('#') && darkRosePrimary.toLowerCase() !== '#a3c9ff', `Sim Section 13: Dark mode primary token updates for Rose Pastel (${darkRosePrimary})`);

    // Switch to Light theme and confirm primary token recomputes for light contrast
    await sDlg13.locator('button[data-app-theme="light"]').click();
    const lightRosePrimary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim());
    assert.ok(lightRosePrimary.startsWith('#') && lightRosePrimary !== darkRosePrimary, `Sim Section 13: Light mode primary token recomputes cleanly (${lightRosePrimary})`);

    // Interact with Color Wheel via pointer click near right edge (red/pink sector)
    const wheelBox = await sDlg13.locator('[data-testid="sim-accent-color-wheel"]').boundingBox();
    assert.ok(wheelBox && wheelBox.width > 40, 'Sim Section 13: Color wheel has interactive geometry');
    await page.mouse.click(wheelBox.x + wheelBox.width * 0.85, wheelBox.y + wheelBox.height * 0.5);
    const wheelAccentAttr = await page.evaluate(() => document.documentElement.getAttribute('data-ui-accent') || '');
    assert.ok(wheelAccentAttr.startsWith('#') && wheelAccentAttr.toUpperCase() !== '#FDA4AF', `Sim Section 13: Clicking Color Wheel picks a new accent (${wheelAccentAttr})`);

    // Reset Accent
    await sDlg13.locator('[data-action="reset-accent"]').click();
    const afterResetAccent = await page.evaluate(() => document.documentElement.getAttribute('data-ui-accent') || '');
    assert.equal(afterResetAccent, 'default', 'Sim Section 13: Reset Accent restores data-ui-accent="default"');

    // Switch back to Blue Pastel for visual/audio continuity & check synchronized continue-audio checkboxes
    await sDlg13.locator('[data-testid="sim-pastel-swatches"] button[data-accent-hex="#93C5FD"]').click();
    const contCbs = sDlg13.locator('.yt-continue-audio-minimize-checkbox');
    assert.equal(await contCbs.count(), 2, 'Sim Section 13: Podcast & Transcript/TTS sections both render Continue Audio on Minimize toggle');
    assert.equal(await contCbs.nth(0).isChecked(), true, 'Sim Section 13: Continue Audio on Minimize defaults checked');
    assert.equal(await contCbs.nth(1).isChecked(), true, 'Sim Section 13: Transcript/TTS checkbox mirrors default checked state');

    await sDlg13.locator('.yt-win-close-btn').click();

    // B) Minimize window while Podcast is playing -> stays playing with dock mini-controls
    await page.locator('[data-card-video-id="D_quantum_101"] button[title="Action menu"]').click();
    await page.locator('span:text-is("Summarize")').first().click();
    const simWin13 = page.locator('.yt-window-box[data-video-id="D_quantum_101"]');
    await simWin13.waitFor({ state: 'visible' });
    await simWin13.locator('.yt-podcast-mode-btn').click();
    await simWin13.locator('.yt-podcast-generate-btn').click();
    await simWin13.locator('.yt-podcast-turn').first().waitFor({ state: 'visible' });
    await simWin13.locator('.yt-podcast-play-btn').click();

    // Minimize while Podcast is playing
    await simWin13.locator('button[aria-label="Minimize window"]').click();
    await simWin13.waitFor({ state: 'hidden' });

    const dockTab13 = page.locator('.yt-dock-tab[data-dock-video-id="D_quantum_101"]');
    await dockTab13.waitFor({ state: 'visible' });
    const badge13 = page.locator('[data-testid="dock-audio-badge-D_quantum_101"]');
    assert.equal((await badge13.textContent())?.trim(), 'Podcast Playing', 'Sim Section 13: Dock tab displays Podcast Playing badge while minimized');

    // Click Pause on dock without restoring window
    await dockTab13.locator('[data-action="dock-audio-toggle"]').click();
    assert.equal((await badge13.textContent())?.trim(), 'Podcast Paused', 'Sim Section 13: Dock toggle pauses playback without restoring window');
    assert.equal(await simWin13.isVisible(), false, 'Sim Section 13: Clicking dock pause does not maximize window');

    // Click Resume on dock
    await dockTab13.locator('[data-action="dock-audio-toggle"]').click();
    assert.equal((await badge13.textContent())?.trim(), 'Podcast Playing', 'Sim Section 13: Dock toggle resumes background playback');

    // Click Stop on dock
    await dockTab13.locator('[data-action="dock-audio-stop"]').click();
    assert.equal(await badge13.count(), 0, 'Sim Section 13: Dock stop button clears background playback badge');

    // Turn setting OFF -> Minimizing stops active TTS/Podcast
    await dockTab13.locator('button[title="Restore window"]').click();
    await simWin13.waitFor({ state: 'visible' });
    await simWin13.locator('.yt-win-settings-btn').click();
    await sDlg13.waitFor({ state: 'visible' });
    await sDlg13.locator('.yt-continue-audio-minimize-checkbox').first().uncheck();
    assert.equal(await sDlg13.locator('.yt-continue-audio-minimize-checkbox').nth(1).isChecked(), false, 'Sim Section 13: Unchecking in Podcast syncs Transcript/TTS toggle');
    await sDlg13.locator('.yt-win-close-btn').click();

    await simWin13.locator('.yt-podcast-play-btn').click();
    await simWin13.locator('button[aria-label="Minimize window"]').click();
    await simWin13.waitFor({ state: 'hidden' });
    assert.equal(await badge13.count(), 0, 'Sim Section 13: Minimizing stops playback when Continue Audio on Minimize is unchecked');

    await dockTab13.locator('button[aria-label="Close docked window"]').click();
    assert.equal(pageErrors.length, 0, `Zero runtime page errors after Section 13 tests (${pageErrors.join('; ')})`);
    passed += 17;

    console.log(`✓ Suite 5 passed: ${passed} checks verified.`);
    return { passed, total: passed };
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSimulatorUiTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

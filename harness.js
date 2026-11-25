import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { generateWatchHtml } from './watch.js';

export async function createHarness({ headless = true } = {}) {
  // Locate existing Playwright Chromium binary if present
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

  // Launch Playwright Chromium
  const browser = await chromium.launch({
    headless: headless,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  // Prepare shortened script and shim
  const scriptContent = fs.readFileSync(path.resolve('./youtube-feed-summariser.user.js'), 'utf-8');
  const shimContent = fs.readFileSync(path.resolve('./shim.js'), 'utf-8');

  const fastScript = scriptContent
    .replace('heartbeatMs: 5000', 'heartbeatMs: 300')
    .replace('staleMs: 20000', 'staleMs: 1500')
    .replace('askLoadMs: 30000', 'askLoadMs: 3000')
    .replace('askStableMs: 3000', 'askStableMs: 300')
    .replace('askAnswerMs: 120000', 'askAnswerMs: 10000')
    .replace('askConcurrency: 2', 'askConcurrency: 1')
    .replace('> 2500 &&', '> 250 &&')
    .replace('> 5000 &&', '> 500 &&')
    .replace('> 7500 &&', '> 750 &&')
    .replace('> 10000 &&', '> 1000 &&')
    .replace('> 12500 &&', '> 1250 &&')
    .replace('> 16000', '> 2000');

  // Inject shim and script in top frames only
  await context.addInitScript(`
    if (window.top === window) {
      ${shimContent}
      ${fastScript}
    }
  `);

  // Context-level routing
  await context.route('**/*', async (route) => {
    const url = route.request().url();

    // 1. Watch page
    if (url.includes('/watch')) {
      const u = new URL(url);
      const v = u.searchParams.get('v') || 'default';
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: generateWatchHtml(v)
      });
    }

    // 2. Embed player
    if (url.includes('/embed/')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body><div id="embed-player">YouTube Embed Player</div></body></html>'
      });
    }

    // 3. Storyboard or thumbnail images
    if (url.includes('i.ytimg.com')) {
      const transparentPixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      return route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: transparentPixel
      });
    }

    // 4. Transcript API endpoint
    if (url.includes('/youtubei/v1/get_transcript')) {
      const postData = route.request().postData() || '';
      let videoId = 'D';
      try {
        const parsed = JSON.parse(postData);
        if (parsed.params?.includes('Z') || parsed.params?.includes('U')) {
          return route.fulfill({ status: 404, body: 'Not found' });
        }
      } catch (_) {}

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          actions: [
            {
              updateEngagementPanelAction: {
                content: {
                  transcriptRenderer: {
                    body: {
                      transcriptBodyRenderer: {
                        cueGroups: [
                          {
                            transcriptCueGroupRenderer: {
                              cues: [
                                {
                                  transcriptCueRenderer: {
                                    startOffsetMs: '5000',
                                    cue: { simpleText: 'Welcome to this technical breakdown.' }
                                  }
                                }
                              ]
                            }
                          },
                          {
                            transcriptCueGroupRenderer: {
                              cues: [
                                {
                                  transcriptCueRenderer: {
                                    startOffsetMs: '75000',
                                    cue: { simpleText: 'Here we analyze the system architecture in detail.' }
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      }
                    }
                  }
                }
              }
            }
          ]
        })
      });
    }

    // 4b. Mock InnerTube player endpoint (prevent live network leaks during offline harness runs)
    if (url.includes('/youtubei/v1/player')) {
      const postData = route.request().postData() || '';
      let videoId = '';
      try {
        videoId = JSON.parse(postData)?.videoId || '';
      } catch (_) {}
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          videoDetails: {
            videoId,
            title: `Sample Video ${videoId}`,
            author: 'Mock Channel'
          }
        })
      });
    }

    // 5. Mock YouTube feed page
    if (url.includes('/mock-feed') || url.endsWith('/')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: generateFeedHtml()
      });
    }

    route.continue();
  });

  return {
    browser,
    context,
    openFeed: async () => {
      const page = await context.newPage();
      await page.goto('https://www.youtube.com/mock-feed.html');
      return page;
    },
    openTab: async () => {
      const page = await context.newPage();
      await page.goto('https://www.youtube.com/mock-feed.html');
      return page;
    }
  };
}

function generateFeedHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube Mock Feed</title>
  <style>
    body { font-family: Roboto, sans-serif; background: #0f0f0f; color: #fff; margin: 0; padding: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
    ytd-rich-item-renderer, yt-lockup-view-model {
      background: #1f1f1f; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px;
    }
    .thumb { width: 100%; aspect-ratio: 16/9; background: #333; border-radius: 8px; }
    .title-row { display: flex; justify-content: space-between; align-items: flex-start; }
    .menu-btn { background: transparent; border: none; color: #fff; cursor: pointer; padding: 6px; }
    /* Popup styling */
    .popup-menu { display: none; position: absolute; background: #282828; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); z-index: 1000; padding: 8px 0; }
    .popup-menu.show { display: block; }
    .menu-item { padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 12px; font-size: 14px; }
    .menu-item:hover { background: rgba(255,255,255,0.1); }
  </style>
</head>
<body>
  <h1>YouTube Feed Simulator</h1>

  <div class="grid">
    <!-- Card 1: Old iron-dropdown menu structure -->
    <ytd-rich-item-renderer id="card-old-menu">
      <div class="thumb"></div>
      <div class="title-row">
        <div>
          <h3 id="video-title"><a href="/watch?v=D_old_menu_1">Advanced Quantum Computing Explained</a></h3>
        </div>
        <ytd-menu-renderer>
          <button class="menu-btn" aria-label="Action menu" id="btn-old-menu">⋮</button>
        </ytd-menu-renderer>
      </div>
    </ytd-rich-item-renderer>

    <!-- Card 2: New yt-sheet menu structure -->
    <yt-lockup-view-model id="card-new-menu">
      <div class="thumb"></div>
      <div class="title-row">
        <div>
          <h3 class="yt-lockup-metadata-view-model__title"><a href="/watch?v=D_new_menu_2">Fusion Energy Breakthroughs</a></h3>
        </div>
        <button class="menu-btn yt-lockup-metadata-view-model__menu-button" aria-label="More actions" id="btn-new-menu">⋮</button>
      </div>
    </yt-lockup-view-model>

    <!-- Card 3: Ask Variant S (insertText) -->
    <ytd-rich-item-renderer id="card-ask-s">
      <div class="thumb"></div>
      <div class="title-row">
        <div>
          <h3 id="video-title"><a href="/watch?v=S_ask_insert">AI Robotics Breakthrough (Ask S)</a></h3>
        </div>
        <ytd-menu-renderer>
          <button class="menu-btn" aria-label="Action menu" id="btn-ask-s">⋮</button>
        </ytd-menu-renderer>
      </div>
    </ytd-rich-item-renderer>

    <!-- Card 4: Ask Variant E (Enter key) -->
    <ytd-rich-item-renderer id="card-ask-e">
      <div class="thumb"></div>
      <div class="title-row">
        <div>
          <h3 id="video-title"><a href="/watch?v=E_ask_enter">Superconductors (Ask E)</a></h3>
        </div>
        <ytd-menu-renderer>
          <button class="menu-btn" aria-label="Action menu" id="btn-ask-e">⋮</button>
        </ytd-menu-renderer>
      </div>
    </ytd-rich-item-renderer>

    <!-- Card 5: Ask Variant F (Forced click) -->
    <ytd-rich-item-renderer id="card-ask-f">
      <div class="thumb"></div>
      <div class="title-row">
        <div>
          <h3 id="video-title"><a href="/watch?v=F_ask_force">Space Propulsion (Ask F)</a></h3>
        </div>
        <ytd-menu-renderer>
          <button class="menu-btn" aria-label="Action menu" id="btn-ask-f">⋮</button>
        </ytd-menu-renderer>
      </div>
    </ytd-rich-item-renderer>

    <!-- Card 6: Ask Variant C (Chips only) -->
    <ytd-rich-item-renderer id="card-ask-c">
      <div class="thumb"></div>
      <div class="title-row">
        <div>
          <h3 id="video-title"><a href="/watch?v=C_ask_chip">Neuromorphic Chips (Ask C)</a></h3>
        </div>
        <ytd-menu-renderer>
          <button class="menu-btn" aria-label="Action menu" id="btn-ask-c">⋮</button>
        </ytd-menu-renderer>
      </div>
    </ytd-rich-item-renderer>

    <!-- Card 7: Ask Variant N (No Ask button) -->
    <ytd-rich-item-renderer id="card-ask-n">
      <div class="thumb"></div>
      <div class="title-row">
        <div>
          <h3 id="video-title"><a href="/watch?v=N_no_ask">Private Lecture (No Ask)</a></h3>
        </div>
        <ytd-menu-renderer>
          <button class="menu-btn" aria-label="Action menu" id="btn-ask-n">⋮</button>
        </ytd-menu-renderer>
      </div>
    </ytd-rich-item-renderer>

    <!-- Card 8: Transcript Variant U (Engagement Panel only) -->
    <ytd-rich-item-renderer id="card-tx-u">
      <div class="thumb"></div>
      <div class="title-row">
        <div>
          <h3 id="video-title"><a href="/watch?v=U_panel_only">Biochemistry Seminar (Panel TX)</a></h3>
        </div>
        <ytd-menu-renderer>
          <button class="menu-btn" aria-label="Action menu" id="btn-tx-u">⋮</button>
        </ytd-menu-renderer>
      </div>
    </ytd-rich-item-renderer>

    <!-- Card 9: Transcript Variant Z (No captions) -->
    <ytd-rich-item-renderer id="card-tx-z">
      <div class="thumb"></div>
      <div class="title-row">
        <div>
          <h3 id="video-title"><a href="/watch?v=Z_no_captions">Silent Film (No Captions)</a></h3>
        </div>
        <ytd-menu-renderer>
          <button class="menu-btn" aria-label="Action menu" id="btn-tx-z">⋮</button>
        </ytd-menu-renderer>
      </div>
    </ytd-rich-item-renderer>

    <!-- Card 10: Clickbait Tech video with transcript for alternative title -->
    <ytd-rich-item-renderer id="card-alt-clickbait">
      <div class="thumb"></div>
      <div class="title-row">
        <div>
          <h3 id="video-title"><a href="/watch?v=D_clickbait_chip">THIS CHANGES EVERYTHING! Intel & AMD are FINISHED! 😱</a></h3>
          <div id="channel-name" title="Tech Frontier">Tech Frontier</div>
        </div>
        <ytd-menu-renderer>
          <button class="menu-btn" aria-label="Action menu" id="btn-alt-clickbait">⋮</button>
        </ytd-menu-renderer>
      </div>
    </ytd-rich-item-renderer>

    <!-- Card 11: DeArrow installed video -->
    <ytd-rich-item-renderer id="card-alt-dearrow" data-dearrow="true">
      <div class="thumb"></div>
      <div class="title-row">
        <div>
          <h3 id="video-title" data-dearrow="true"><a href="/watch?v=D_dearrow_deep">JWST Detects Methane in Atmosphere of Exoplanet K2-18b</a></h3>
          <div class="cbTitleButtonContainer" title="DeArrow: Show original title / Submit title"><button class="cbButton cbTitleButton" title="Show original title"><svg width="14" height="14"></svg></button></div>
          <div id="channel-name" title="Astro Daily">Astro Daily</div>
        </div>
        <ytd-menu-renderer>
          <button class="menu-btn" aria-label="Action menu" id="btn-alt-dearrow">⋮</button>
        </ytd-menu-renderer>
      </div>
    </ytd-rich-item-renderer>

    <!-- Card 12: Music Video (EXEMPT from title replacement) -->
    <ytd-rich-item-renderer id="card-alt-music">
      <div class="thumb"></div>
      <div class="title-row">
        <div>
          <h3 id="video-title"><a href="/watch?v=D_music_exempt">Dua Lipa - Levitating (Official Music Video)</a></h3>
          <div id="channel-name" title="Dua Lipa VEVO">Dua Lipa VEVO</div>
          <ytd-badge-supported-renderer aria-label="Official Artist Channel">♪ Official Artist Channel</ytd-badge-supported-renderer>
        </div>
        <ytd-menu-renderer>
          <button class="menu-btn" aria-label="Action menu" id="btn-alt-music">⋮</button>
        </ytd-menu-renderer>
      </div>
    </ytd-rich-item-renderer>
  </div>

  <!-- Simulated Old Popups: iron-dropdown -->
  <tp-yt-iron-dropdown id="dropdown-old" class="popup-menu">
    <ytd-menu-popup-renderer>
      <tp-yt-paper-listbox id="items">
        <ytd-menu-service-item-renderer role="menuitem" class="menu-item" aria-label="Save to playlist">Save to playlist</ytd-menu-service-item-renderer>
        <ytd-menu-service-item-renderer role="menuitem" class="menu-item" aria-label="Download">Download</ytd-menu-service-item-renderer>
        <ytd-menu-service-item-renderer role="menuitem" class="menu-item" aria-label="Share">Share</ytd-menu-service-item-renderer>
      </tp-yt-paper-listbox>
    </ytd-menu-popup-renderer>
  </tp-yt-iron-dropdown>

  <!-- Simulated New Popups: yt-sheet -->
  <yt-sheet-view-model id="sheet-new" class="popup-menu">
    <yt-list-view-model>
      <yt-list-item-view-model role="menuitem" class="menu-item" aria-label="Save to playlist">Save to playlist</yt-list-item-view-model>
      <yt-list-item-view-model role="menuitem" class="menu-item" aria-label="Download">Download</yt-list-item-view-model>
      <yt-list-item-view-model role="menuitem" class="menu-item" aria-label="Not interested">Not interested</yt-list-item-view-model>
    </yt-list-view-model>
  </yt-sheet-view-model>

  <script>
    const dropdownOld = document.getElementById('dropdown-old');
    const sheetNew = document.getElementById('sheet-new');

    document.querySelectorAll('.menu-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        dropdownOld.classList.remove('show');
        sheetNew.classList.remove('show');
        const rect = btn.getBoundingClientRect();
        const popup = btn.id === 'btn-new-menu' ? sheetNew : dropdownOld;
        popup.style.top = (rect.bottom + window.scrollY) + 'px';
        popup.style.left = (rect.left + window.scrollX - 150) + 'px';
        popup.classList.add('show');
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.menu-btn') && !e.target.closest('.popup-menu')) {
        dropdownOld.classList.remove('show');
        sheetNew.classList.remove('show');
      }
    });
  </script>
</body>
</html>`;
}

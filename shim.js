// Mock GM_* API shim for testing and standalone runner
(function () {
  'use strict';

  function getStore() {
    try {
      return JSON.parse(localStorage.getItem('__gm') || '{}');
    } catch (_) {
      return {};
    }
  }

  function setStore(store) {
    localStorage.setItem('__gm', JSON.stringify(store));
  }

  const listeners = [];

  window.GM_getValue = function (key, def) {
    const s = getStore();
    return s[key] !== undefined ? s[key] : def;
  };

  window.GM_setValue = function (key, val) {
    const s = getStore();
    const oldVal = s[key];
    s[key] = val;
    setStore(s);
    // Notify local listeners
    for (const l of listeners) {
      if (l.key === key) {
        try {
          l.cb(key, oldVal, val, false);
        } catch (e) {
          console.error(e);
        }
      }
    }
  };

  window.GM_deleteValue = function (key) {
    const s = getStore();
    const oldVal = s[key];
    delete s[key];
    setStore(s);
    for (const l of listeners) {
      if (l.key === key) {
        try {
          l.cb(key, oldVal, undefined, false);
        } catch (e) {
          console.error(e);
        }
      }
    }
  };

  window.GM_listValues = function () {
    return Object.keys(getStore());
  };

  window.GM_addValueChangeListener = function (key, cb) {
    listeners.push({ key, cb });
    return listeners.length - 1;
  };

  window.GM_removeValueChangeListener = function (id) {
    if (listeners[id]) delete listeners[id];
  };

  window.GM_registerMenuCommand = function (name, fn) {
    window.__gm_commands = window.__gm_commands || {};
    window.__gm_commands[name] = fn;
  };

  window.GM_addStyle = function (css) {
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
    return s;
  };

  window.GM_setClipboard = function (text) {
    window.__last_clipboard = text;
  };

  // Web Speech API mock and recorder for testing
  window.__tts_spoken = [];
  const mockSpeechSynthesis = {
    speaking: false,
    paused: false,
    pending: false,
    speak: function (utt) {
      this.speaking = true;
      this.paused = false;
      window.__tts_spoken.push(utt.text);
      if (utt.onstart) setTimeout(() => utt.onstart({ type: 'start' }), 5);
      setTimeout(() => {
        this.speaking = false;
        if (utt.onend) utt.onend({ type: 'end' });
      }, 35);
    },
    pause: function () {
      this.paused = true;
    },
    resume: function () {
      this.paused = false;
    },
    cancel: function () {
      this.speaking = false;
      this.paused = false;
    },
    getVoices: function () {
      return [
        { name: 'Google US English', lang: 'en-US', default: true },
        { name: 'Google UK English Female', lang: 'en-GB' },
        { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US' }
      ];
    }
  };

  window.__tts_utterances = [];
  if (!('speechSynthesis' in window) || !window.speechSynthesis) {
    window.speechSynthesis = mockSpeechSynthesis;
  } else {
    // Ensure getVoices returns voices in headless Chromium
    const realGetVoices = window.speechSynthesis.getVoices?.bind(window.speechSynthesis);
    window.speechSynthesis.getVoices = function () {
      const v = realGetVoices ? realGetVoices() : [];
      if (!v || v.length === 0) {
        return mockSpeechSynthesis.getVoices();
      }
      return v;
    };
    // Intercept native speak to record in headless tests
    const realSpeak = window.speechSynthesis.speak?.bind(window.speechSynthesis);
    window.speechSynthesis.speak = function (utt) {
      window.__tts_spoken.push(utt?.text || '');
      window.__tts_utterances.push(utt);
      if (realSpeak) {
        try { realSpeak(utt); } catch (_) {}
      }
      setTimeout(() => {
        if (utt && typeof utt.onend === 'function') {
          utt.onend({ type: 'end' });
        }
      }, 50);
    };
  }
  if (!('SpeechSynthesisUtterance' in window)) {
    window.SpeechSynthesisUtterance = function (text) {
      this.text = text || '';
      this.rate = 1.0;
      this.pitch = 1.0;
      this.volume = 1.0;
      this.voice = null;
    };
  } else {
    try {
      Object.defineProperty(window.SpeechSynthesisUtterance.prototype, 'voice', {
        get() {
          return this._voice || null;
        },
        set(v) {
          this._voice = v;
        },
        configurable: true
      });
    } catch (_) {}
  }
  window.addEventListener('storage', (e) => {
    if (e.key === '__gm') {
      let oldS = {};
      let newS = {};
      try {
        oldS = JSON.parse(e.oldValue || '{}');
      } catch (_) {}
      try {
        newS = JSON.parse(e.newValue || '{}');
      } catch (_) {}

      for (const l of listeners) {
        if (JSON.stringify(oldS[l.key]) !== JSON.stringify(newS[l.key])) {
          try {
            l.cb(l.key, oldS[l.key], newS[l.key], true);
          } catch (err) {
            console.error(err);
          }
        }
      }
    }
  });

  // Mock GM_xmlhttpRequest
  window.GM_xmlhttpRequest = function (opts) {
    const url = opts.url || '';
    const method = (opts.method || 'GET').toUpperCase();
    const headers = opts.headers || {};
    const key = headers['x-goog-api-key'] || '';

    // Record request for assertions
    window.__recorded_gm_requests = window.__recorded_gm_requests || [];
    window.__recorded_gm_requests.push({
      url,
      method,
      headers,
      data: opts.data ? (typeof opts.data === 'string' ? opts.data : JSON.stringify(opts.data)) : null
    });

    const delay = url.includes(':generateContent') ? 120 : 15;
    setTimeout(() => {
      // 1. Models List
      if (url.includes('/models?')) {
        if (window.__failModels) {
          return opts.onload({ status: 503, responseText: 'Service Unavailable' });
        }
        if (key.includes('invalid')) {
          return opts.onload({ status: 400, responseText: JSON.stringify({ error: { message: 'API key not valid' } }) });
        }

        const isFree = key.includes('free');
        const models = isFree
          ? [
              { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.5-flash-preview', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] }, // should be filtered
              { name: 'models/gemini-3.5-transcribe', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.8-flash-lite-tts', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-nano-banana-2.1', supportedGenerationMethods: ['generateContent'] }
            ]
          : [
              { name: 'models/gemini-3.1-pro-preview', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3-pro-image', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-nano-banana-2.1', supportedGenerationMethods: ['interactions'] },
              { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.8-flash-lite-tts', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.5-transcribe', supportedGenerationMethods: ['generateContent'] }
            ];

        return opts.onload({
          status: 200,
          responseText: JSON.stringify({ models })
        });
      }

      // 2. Gemini generateContent
      if (url.includes(':generateContent')) {
        if (window.__flaky && window.__flaky > 0) {
          window.__flaky--;
          return opts.onload({ status: 503, responseText: 'Transient Server Error' });
        }

        let body = {};
        try {
          body = JSON.parse(opts.data);
        } catch (_) {}

        const modelMatch = /models\/([^:]+):generateContent/.exec(url);
        const modelName = modelMatch ? decodeURIComponent(modelMatch[1]) : '';

        // Check simulated model failures
        if (modelName === 'quota-fail-model') {
          return opts.onload({
            status: 429,
            responseText: JSON.stringify({
              error: {
                message: 'Quota exceeded for quota-fail-model',
                details: [
                  { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '5s' },
                  {
                    '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                    violations: [{ quotaId: 'GenerateRequestsPerMinutePerProject', subject: 'quota-fail-model' }]
                  }
                ]
              }
            })
          });
        }

        if (modelName.includes('pro') && key.includes('free')) {
          return opts.onload({
            status: 429,
            responseText: JSON.stringify({
              error: {
                message: 'Free tier key cannot access Pro models',
                details: [
                  { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '10s' },
                  {
                    '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                    violations: [{ quotaId: 'ProTierModelQuota', subject: modelName }]
                  }
                ]
              }
            })
          });
        }

        if (modelName === 'gemini-3.8-flash' && key.includes('free') && body.tools?.some((t) => t.google_search)) {
          return opts.onload({
            status: 429,
            responseText: JSON.stringify({
              error: {
                message: 'Free tier key quota exceeded for Google Search grounding on Gemini 3.x',
                details: [
                  {
                    '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                    violations: [{ quotaId: 'SearchGroundingToolQuota', subject: modelName }]
                  }
                ]
              }
            })
          });
        }

        const hasVideoPart = body.contents?.[0]?.parts?.some((p) => p.file_data?.file_uri);
        if (hasVideoPart && modelName === 'video-limit-model') {
          return opts.onload({
            status: 429,
            responseText: JSON.stringify({
              error: {
                message: 'Daily YouTube video input limit of 8 hours reached for this key',
                details: [
                  {
                    '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                    violations: [{ quotaId: 'YouTubeVideoInputHoursQuota', subject: 'daily-cap' }]
                  }
                ]
              }
            })
          });
        }

        // Image model generateContent mocks
        if (modelName === 'gemini-3-pro-image') {
          return opts.onload({
            status: 429,
            responseText: JSON.stringify({ error: { message: 'Image model quota exhausted' } })
          });
        }

        if (modelName === 'gemini-nano-banana-2.1') {
          return opts.onload({
            status: 404,
            responseText: JSON.stringify({ error: { message: 'Model does not support generateContent' } })
          });
        }

        if (modelName === 'gemini-3.1-flash-image') {
          return opts.onload({
            status: 200,
            responseText: JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        inline_data: {
                          mime_type: 'image/png',
                          data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
                        }
                      }
                    ]
                  }
                }
              ]
            })
          });
        }

        // Audio TTS model generateContent mock
        if (modelName === 'gemini-3.8-flash-lite-tts' || body.generationConfig?.responseModalities?.includes('AUDIO')) {
          const wavBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
          window.__tts_ai_requested = window.__tts_ai_requested || [];
          window.__tts_ai_requested.push({ model: modelName, body });
          return opts.onload({
            status: 200,
            responseText: JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        inline_data: {
                          mime_type: 'audio/wav',
                          data: wavBase64
                        }
                      }
                    ]
                  }
                }
              ]
            })
          });
        }

        // Placement JSON response
        if (body.generationConfig?.responseMimeType === 'application/json') {
          return opts.onload({
            status: 200,
            responseText: JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          placements: [
                            {
                              image: 1,
                              after: 'Detailed summary',
                              caption: 'High-level schematic'
                            }
                          ]
                        })
                      }
                    ]
                  }
                }
              ]
            })
          });
        }

        // Text prompt handling
        const userText = body.contents?.[0]?.parts?.find((p) => p.text)?.text || '';

        // Visual coordinator pass (enriching Ask or text summaries with video frames and search diagrams)
        if (userText.includes('visual coordinator') || userText.includes('visual director')) {
          let summaryBase = userText;
          if (userText.includes('SUMMARY TO ENRICH:')) {
            const parts = userText.split('"""');
            if (parts.length >= 3) summaryBase = parts[1].trim();
          }
          return opts.onload({
            status: 200,
            responseText: JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: `${summaryBase}\n\n### [01:15] Key Demonstration\n[[FRAME 01:15 | Technical architecture frame from video]]\n\n[[IMG quantum computing circuit | Reference schematic diagram]]\n\n[[GEN technical process diagram | Detailed operational flow]]`
                      }
                    ]
                  }
                }
              ]
            })
          });
        }

        // Fact Check pass
        if (userText.includes('You are checking a summary of a YouTube video')) {
          return opts.onload({
            status: 200,
            responseText: JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: `## Fact-check
- Claim: The rocket reached 100km altitude [01:20].
  Verdict: ✅ Supported. Confirmed by space agency telemetry.
- Claim: It was the lowest cost launch in history [03:45].
  Verdict: ⚠️ Partly true. Lowest for liquid fueled, but sounding rockets were cheaper.

## Further reading
- [Space Agency Official Report](https://example.com/space-report)
- [Astrophysics Review](https://example.com/astro-review)`
                      }
                    ]
                  },
                  groundingMetadata: {
                    groundingChunks: [
                      { web: { uri: 'https://example.com/space-report', title: 'Space Agency Official Report' } },
                      { web: { uri: 'https://example.com/astro-review', title: 'Astrophysics Review' } }
                    ]
                  }
                }
              ]
            })
          });
        }

        // Follow-up answer
        if (userText.includes('FOLLOW-UP QUESTION:')) {
          const matchQ = /FOLLOW-UP QUESTION:\s*([\s\S]+)$/.exec(userText);
          const question = matchQ ? matchQ[1].trim() : 'the question';
          return opts.onload({
            status: 200,
            responseText: JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: `Regarding "${question}": In the video at [02:15], the speaker explains that this mechanism operates using electromagnetic induction rather than mechanical friction.`
                      }
                    ]
                  }
                }
              ]
            })
          });
        }

        // Transcript request
        if (userText.includes('produce a complete, accurate transcript')) {
          return opts.onload({
            status: 200,
            responseText: JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: `## Transcript

[00:05] Welcome back to the channel everyone. Today we are looking at revolutionary energy storage.

[01:10] The fundamental challenge with existing batteries is thermal degradation over repeated charge cycles.

[02:30] Our new prototype achieves 95% retention after five thousand cycles.`
                      }
                    ]
                  }
                }
              ]
            })
          });
        }

        // Summary request (default)
        return opts.onload({
          status: 200,
          responseText: JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: `## TL;DR
This video explores cutting-edge battery innovations designed to replace lithium-ion in grid storage. The breakthrough uses abundant sodium and novel solid electrolytes.

## Detailed summary

### [00:15] Introduction to Sodium-Ion
Traditional lithium batteries face resource bottlenecks and fire risks. Sodium offers an inexpensive alternative.

[[FRAME 00:15 | Introduction to solid state sodium]]

### [01:45] Chemical Breakthroughs
Researchers altered the cathode structure to prevent micro-cracking during rapid charging cycles.

[[IMG battery cathode | High-resolution electron microscope image]]

[[GEN diagram of solid state battery chemistry | Sodium ion transfer]]

<script>console.log("XSS attack attempt should render as plain text")</script>

### [04:20] Manufacturing & Cost Curves
Production utilizes existing gigafactory tooling with minor modification.

## Key takeaways
- Sodium ion cuts raw material costs by 65%.
- Non-flammable solid electrolyte passes puncture testing.
- Commercial production begins late next year.

## Notable details
- Cycle life: 4,000 cycles at 1C rate.
- Density: 190 Wh/kg.

## Worth your time?
Yes, highly informative for engineers and investors looking past hype into real battery chemistry.`
                    }
                  ]
                },
                groundingMetadata: body.tools?.some((t) => t.google_search)
                  ? {
                      groundingChunks: [
                        { web: { uri: 'https://example.com/battery-paper', title: 'Sodium Battery Whitepaper' } }
                      ]
                    }
                  : null
              }
            ]
          })
        });
      }

      // 3. Interactions API
      if (url.includes('/interactions')) {
        return opts.onload({
          status: 200,
          responseText: JSON.stringify({
            output: [
              {
                type: 'image',
                mime_type: 'image/png',
                data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
              }
            ]
          })
        });
      }

      // 4. Wikimedia Commons
      if (url.includes('commons.wikimedia.org')) {
        return opts.onload({
          status: 200,
          responseText: JSON.stringify({
            query: {
              pages: {
                101: {
                  title: 'File:Battery_Cathode_Diagram.png',
                  fullurl: 'https://commons.wikimedia.org/wiki/File:Battery_Cathode_Diagram.png',
                  imageinfo: [
                    {
                      width: 800,
                      height: 600,
                      thumburl: 'https://commons.wikimedia.org/thumb.png',
                      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Battery_Cathode_Diagram.png',
                      extmetadata: {
                        LicenseShortName: { value: 'CC BY-SA 4.0' },
                        Artist: { value: 'Dr. Jane Doe' }
                      }
                    }
                  ]
                }
              }
            }
          })
        });
      }

      // Default fallback
      opts.onload({ status: 200, responseText: '{}' });
    }, delay);
  };
})();

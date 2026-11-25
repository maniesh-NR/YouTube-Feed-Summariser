// ==UserScript==
// @name         YouTube Feed Summariser (Gemini)
// @namespace    local.yt-feed-summariser
// @version      2.12.0
// @description  Adds dockable Gemini video summaries, transcripts, alternative descriptive thumbnail titles, and global TTS keyboard shortcuts to YouTube feeds without opening videos.
// @match        https://www.youtube.com/*
// @noframes
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @connect      generativelanguage.googleapis.com
// @connect      commons.wikimedia.org
// ==/UserScript==

'use strict';

(function () {
  // --- CONFIGURATION ---
  const CONFIG = {
    version: '2.12.0',
    textModels: [
      'gemini-4-argon',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3.1-pro-preview',
      'gemini-flash-latest'
    ],
    transcribeModel: 'gemini-3.5-transcribe', // audio-file model: shown greyed out, cannot take a YouTube URL
    imageModels: [
      'gemini-3-pro-image',
      'gemini-nano-banana-2.1',
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-lite-image'
    ],
    imageModelNames: {
      'gemini-3-pro-image': 'Nano Banana Pro',
      'gemini-nano-banana-2.1': 'Nano Banana 2.1',
      'gemini-3.1-flash-image': 'Nano Banana 2',
      'gemini-3.1-flash-lite-image': 'Nano Banana 2 Lite'
    },
    defaultModel: 'gemini-3.8-flash',
    outputLanguage: 'English',
    menuLabel: 'Summarize',
    menuFontSize: '16px',
    menuMinHeight: 44,
    savePattern: /save to playlist/i,
    downloadPattern: /^download$/i,
    watchLaterPattern: /watch later/i,
    lowMediaResolution: true,
    thinkingLevel: null,
    maxVisuals: 6,
    maxGenImages: 3,
    historyTurns: 6,
    cacheMax: 100,
    requestTimeoutMs: 300000,
    heartbeatMs: 5000,
    staleMs: 20000,
    modelCheckTtlMs: 300000,
    maxTranscriptChars: 1500000,
    fallbackLadder: [
      'gemini-3.1-pro-preview',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest'
    ],
    factPreferred: [
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest'
    ],
    ttsModel: 'gemini-3.8-flash-lite-tts',
    podcastAudioModel: 'gemini-3.8-flash-tts',
    podcastDefaultHostCount: 2,
    podcastMaxHosts: 6,
    aiVoices: [
      { id: 'ai:Kore', name: 'Gemini Kore (Natural Female) ★', voiceName: 'Kore' },
      { id: 'ai:Puck', name: 'Gemini Puck (Natural Male)', voiceName: 'Puck' },
      { id: 'ai:Zephyr', name: 'Gemini Zephyr (Warm Female)', voiceName: 'Zephyr' },
      { id: 'ai:Fenrir', name: 'Gemini Fenrir (Deep Male)', voiceName: 'Fenrir' },
      { id: 'ai:Charon', name: 'Gemini Charon (Calm Male)', voiceName: 'Charon' }
    ],
    defaultTtsVoice: 'ai:Kore',
    defaultTtsPitch: 1.0,
    ttsRates: [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0],
    defaultReadabilityTheme: 'system',
    altTitlesEnabled: true,
    altTitleMaxChars: 150,
    transcriptMode: 'fast',
    defaultSkipSilence: true,
    askConcurrency: 2,
    askLoadMs: 30000,
    askStableMs: 3000,
    askAnswerMs: 120000,
    debug: true
  };

  const DEFAULT_OPTS = {
    fc: true,
    autoFactCheck: true,
    img: true,
    src: true,
    gen: false,
    altTitles: true,
    transcriptMode: 'fast',
    skipSilence: true,
    think: '',
    mres: '',
    gsearch: false,
    gmaps: false,
    code: false,
    imgModel: '',
    imgThink: '',
    imgAspect: '',
    imgSize: '',
    imgOut: 'both',
    imgSearch: false,
    factModel: '',
    retries: 2,
    fallback: false,
    txFallback: false,
    ttsVoice: 'ai:Kore',
    persona: 'executive'
  };

  const TAB_ID = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // --- BOUNDED LRU MEMORY CACHE ---
  function createBoundedMap(maxCapacity = 100) {
    const map = new Map();
    const cap = Math.max(1, maxCapacity);
    return {
      get(key) {
        if (!map.has(key)) return undefined;
        const val = map.get(key);
        map.delete(key);
        map.set(key, val);
        return val;
      },
      set(key, val) {
        if (map.has(key)) {
          map.delete(key);
        } else if (map.size >= cap) {
          const oldestKey = map.keys().next().value;
          if (oldestKey !== undefined) map.delete(oldestKey);
        }
        map.set(key, val);
        return this;
      },
      has(key) {
        return map.has(key);
      },
      delete(key) {
        return map.delete(key);
      },
      clear() {
        map.clear();
      },
      get size() {
        return map.size;
      },
      keys() {
        return map.keys();
      },
      values() {
        return map.values();
      },
      entries() {
        return map.entries();
      },
      forEach(fn, thisArg) {
        map.forEach(fn, thisArg);
      },
      [Symbol.iterator]() {
        return map[Symbol.iterator]();
      }
    };
  }

  // In-memory runtime caches (strictly bounded to prevent memory growth across long sessions)
  const storyboardCache = createBoundedMap(50); // videoId -> storyboard config
  const transcriptCache = createBoundedMap(50); // videoId -> text
  const watchMetadataCache = createBoundedMap(100); // videoId -> { title, shortDescription, author, keywords, visitorData, innertubeApiKey, clientVersion }
  const altTitlesMemoryCache = createBoundedMap(100); // videoId -> alternative title string
  const altTitleFailureReasons = createBoundedMap(100); // videoId -> 'no_key' | 'no_captions' | 'api_error' | 'same_as_original'
  const processedFeedCards = new WeakSet();

  // --- TRUSTED-TYPES COMPLIANT DOM HELPER ---
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null) continue;
        if (k.startsWith('on') && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'style') {
          if (typeof v === 'object') {
            Object.assign(el.style, v);
          } else {
            el.style.cssText = String(v);
          }
        } else if (k === 'className') {
          el.className = v;
        } else if (k === 'checked' || k === 'disabled' || k === 'selected') {
          el[k] = Boolean(v);
        } else if (k === 'value') {
          el.value = v;
        } else {
          el.setAttribute(k, v);
        }
      }
    }
    const isDomNode = (val) => Boolean(val && ((typeof Node !== 'undefined' && val instanceof Node) || (typeof val === 'object' && val.nodeType)));
    for (const child of children) {
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) {
        for (const sub of child) {
          if (isDomNode(sub)) el.appendChild(sub);
          else if (sub !== null && sub !== undefined) el.appendChild(document.createTextNode(String(sub)));
        }
      } else if (isDomNode(child)) {
        el.appendChild(child);
      } else {
        el.appendChild(document.createTextNode(String(child)));
      }
    }
    return el;
  }

  function hSvg(tag, attrs, ...children) {
    const el = typeof document.createElementNS === 'function'
      ? document.createElementNS('http://www.w3.org/2000/svg', tag)
      : document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null) continue;
        el.setAttribute(k, v);
      }
    }
    for (const child of children) {
      if (child && ((typeof Node !== 'undefined' && child instanceof Node) || (typeof child === 'object' && child.nodeType))) {
        el.appendChild(child);
      }
    }
    return el;
  }

  function clearEl(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function fallbackExecCopy(text) {
    if (!document?.body || typeof document.execCommand !== 'function') return false;
    const prevActive = document.activeElement;
    const ta = h('textarea', {
      value: String(text || ''),
      readonly: '',
      'aria-hidden': 'true',
      style: {
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        opacity: '0',
        pointerEvents: 'none'
      }
    });
    try {
      document.body.appendChild(ta);
      ta.focus({ preventScroll: true });
      ta.select();
      if (typeof ta.setSelectionRange === 'function') {
        ta.setSelectionRange(0, ta.value.length);
      }
      return Boolean(document.execCommand('copy'));
    } catch {
      return false;
    } finally {
      ta.remove();
      if (prevActive && typeof prevActive.focus === 'function') {
        try {
          prevActive.focus({ preventScroll: true });
        } catch {}
      }
    }
  }

  function copyTextSafely(text) {
    const str = String(text ?? '');
    if (typeof GM_setClipboard === 'function') {
      try {
        GM_setClipboard(str);
        return Promise.resolve(true);
      } catch {}
    }
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard
        .writeText(str)
        .then(() => true)
        .catch(() => fallbackExecCopy(str));
    }
    return Promise.resolve(fallbackExecCopy(str));
  }

  // Common SVG Icons
  function iconSparkle(size = 20, fill = 'currentColor') {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: fill },
      hSvg('path', {
        d: 'M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z'
      })
    );
  }

  function iconBolt(size = 14, fill = 'currentColor') {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: fill },
      hSvg('path', { d: 'M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.9 17.06 11 21 11 21z' })
    );
  }

  function iconMusic(size = 14, fill = 'currentColor') {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: fill },
      hSvg('path', { d: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z' })
    );
  }

  function iconDocument(size = 14, fill = 'currentColor') {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: fill },
      hSvg('path', { d: 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z' })
    );
  }

  function iconSkipSilence(size = 14, fill = 'currentColor') {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: fill },
      hSvg('path', {
        d: 'M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6zM21 6h2v12h-2z'
      })
    );
  }

  function iconClose(size = 18) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', { d: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z' })
    );
  }

  function iconMinimize(size = 18) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', { d: 'M19 13H5v-2h14v2z' })
    );
  }

  function iconMaximize(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', { d: 'M3 3h8v2H5v6H3V3zm18 0h-8v2h6v6h2V3zM3 21h8v-2H5v-6H3v8zm18 0h-8v-2h6v-6h2v8z' })
    );
  }

  function iconCheck(size = 14) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', { d: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z' })
    );
  }

  function iconAlert(size = 14) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', { d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z' })
    );
  }

  function iconGear(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'
      })
    );
  }

  function iconRefresh(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z'
      })
    );
  }

  function iconSync(size = 14) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z'
      })
    );
  }

  function iconSpeaker(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'
      })
    );
  }

  function iconMic(size = 14) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z'
      }),
      hSvg('path', {
        d: 'M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z'
      })
    );
  }

  function iconPause(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', { d: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z' })
    );
  }

  function iconPlay(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', { d: 'M8 5v14l11-7z' })
    );
  }

  function iconStop(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', { d: 'M6 6h12v12H6z' })
    );
  }

  function iconRewind(size = 14) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', { d: 'M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z' })
    );
  }

  function iconSkip(size = 14) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', { d: 'M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z' })
    );
  }

  function iconCopy(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z'
      })
    );
  }

  function iconExternal(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z'
      })
    );
  }

  function iconSearch(size = 14) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z'
      })
    );
  }

  function iconHistory(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z'
      })
    );
  }

  function iconBook(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4zm12 16H6V16h12v4zm0-6h-5V4h5v10z'
      })
    );
  }

  function iconExport(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z'
      })
    );
  }

  function iconFileText(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z'
      })
    );
  }

  function iconPdf(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v1.5h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zm4.5 1.5h1v-3h-1v3zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6z'
      })
    );
  }

  function iconThumbsUp(size = 14) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z'
      })
    );
  }

  function iconThumbsDown(size = 14) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z'
      })
    );
  }

  function iconMoreVert(size = 18) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z'
      })
    );
  }

  function iconDragGrip(size = 16) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M9 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM9 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM9 17a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z'
      })
    );
  }

  function iconShield(size = 13) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z'
      })
    );
  }

  function iconPencil(size = 13) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', {
        d: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'
      })
    );
  }

  function iconChevronLeft(size = 14) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', { d: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z' })
    );
  }

  function iconChevronRight(size = 14) {
    return hSvg(
      'svg',
      { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor' },
      hSvg('path', { d: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z' })
    );
  }

  const SUPERSCRIPT_CHAR_MAP = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    n: 'ⁿ', i: 'ⁱ'
  };

  const SUBSCRIPT_CHAR_MAP = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
    a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', h: 'ₕ',
    k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', p: 'ₚ',
    s: 'ₛ', t: 'ₜ'
  };

  const LATEX_COMMAND_REPLACEMENTS = [
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

  function mapUnicodeScript(raw, map, fallbackPrefix) {
    const chars = Array.from(raw);
    if (chars.length > 0 && chars.every((ch) => map[ch] !== undefined)) {
      return chars.map((ch) => map[ch]).join('');
    }
    return raw.length > 1 ? `${fallbackPrefix}(${raw})` : `${fallbackPrefix}${raw}`;
  }

  function convertLatexFragment(fragment) {
    let out = fragment.trim();
    out = out.replace(/\^\s*\{\s*\\(?:circ|degree|deg)\s*\}/g, '°');
    out = out.replace(/\^\s*\\(?:circ|degree|deg)\b/g, '°');
    for (let pass = 0; pass < 3; pass++) {
      const prev = out;
      for (const [re, rep] of LATEX_COMMAND_REPLACEMENTS) {
        out = out.replace(re, rep);
      }
      if (out === prev) break;
    }
    out = out.replace(/\^\{([^{}]+)\}/g, (_m, inner) => mapUnicodeScript(inner, SUPERSCRIPT_CHAR_MAP, '^'));
    out = out.replace(/\^([0-9+\-=ni])/g, (_m, ch) => SUPERSCRIPT_CHAR_MAP[ch] || `^${ch}`);
    out = out.replace(/_\{([^{}]+)\}/g, (_m, inner) => mapUnicodeScript(inner, SUBSCRIPT_CHAR_MAP, '_'));
    out = out.replace(/_([0-9+\-=aehklmnopstx])/g, (_m, ch) => SUBSCRIPT_CHAR_MAP[ch] || `_${ch}`);
    out = out.replace(/\{([^{}]*)\}/g, '$1');
    out = out.replace(/\s*°\s*/g, '°');
    out = out.replace(/\s{2,}/g, ' ').trim();
    return out;
  }

  function formatMathSymbolsInText(text) {
    if (!text) return '';
    let out = String(text);

    out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner) => convertLatexFragment(inner));
    out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner) => convertLatexFragment(inner));
    out = out.replace(/\\\(([^\n]+?)\\\)/g, (_m, inner) => convertLatexFragment(inner));

    out = out.replace(/\$([^$\n]+?)\$/g, (match, inner) => {
      if (!inner || /^\s|\s$/.test(inner)) return match;
      const hasMathSignal =
        /[\\^{}_=<>~±×÷≈≠≤≥°]/.test(inner) ||
        /^[A-Za-z](?:\d+|['’])?$/.test(inner);
      if (!hasMathSignal) return match;
      return convertLatexFragment(inner);
    });

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

  function stripInlineMarkdown(str) {
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

  function parseCleanEditorialBlocks(text) {
    if (!text) return [];
    let clean = text.replace(/\[\[(?:FRAME|IMG|GEN|IMAGE)[^\]]*\]\]/gi, '');
    clean = clean.replace(/^[-*_]{3,}\s*$/gm, '');
    const lines = clean.split('\n');
    const blocks = [];

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      // Heading (## or ###)
      if (trimmed.startsWith('#')) {
        const level = (trimmed.match(/^#+/) || [''])[0].length;
        const title = stripInlineMarkdown(trimmed.slice(level));
        blocks.push({
          type: level <= 2 ? 'heading' : 'subheading',
          text: title
        });
        continue;
      }

      // Bullet point
      const bulletMatch = /^[-*•]\s+(.+)$/.exec(trimmed);
      if (bulletMatch) {
        blocks.push({
          type: 'bullet',
          text: stripInlineMarkdown(bulletMatch[1])
        });
        continue;
      }

      // Numbered list
      const numMatch = /^(\d+)\.\s+(.+)$/.exec(trimmed);
      if (numMatch) {
        blocks.push({
          type: 'numbered',
          number: numMatch[1],
          text: stripInlineMarkdown(numMatch[2])
        });
        continue;
      }

      // Transcript timestamp line: [01:15] text or [1:02:30] text
      const tsMatch = /^\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*(.*)$/.exec(trimmed);
      if (tsMatch) {
        const tsStr = trimmed.slice(0, trimmed.indexOf(']') + 1);
        const rest = trimmed.slice(tsStr.length).trim();
        blocks.push({
          type: 'transcript_line',
          ts: tsStr,
          text: stripInlineMarkdown(rest)
        });
        continue;
      }

      // Regular paragraph
      blocks.push({
        type: 'p',
        text: stripInlineMarkdown(trimmed)
      });
    }
    return blocks;
  }

  function formatAsExportText(win) {
    const isTranscript = win.mode === 'transcript';
    const divider = '='.repeat(76);
    const subDivider = '-'.repeat(76);
    const nowStr = new Date().toLocaleString();

    let out = `${divider}\n`;
    out += `YOUTUBE FEED SUMMARISER - ${isTranscript ? 'TRANSCRIPT' : 'SUMMARY'} EXPORT\n`;
    out += `${divider}\n\n`;
    out += `Title:       ${win.title}\n`;
    out += `Video ID:    ${win.videoId}\n`;
    out += `Video URL:   https://www.youtube.com/watch?v=${win.videoId}\n`;
    out += `Export Type: ${isTranscript ? 'Full Transcript' : 'Video Summary'}\n`;
    out += `Source:      ${win.source === 'text' ? 'Transcript' : 'Video'}\n`;
    out += `Model:       ${win.modelId || 'Default'}\n`;
    out += `Exported:    ${nowStr}\n\n`;
    out += `${subDivider}\nCONTENT\n${subDivider}\n\n`;

    const cleanContent = formatMathSymbolsInText(
      (win.text || '').replace(/\[\[(?:FRAME|IMG|GEN|IMAGE)[^\]]*\]\]/gi, '').trim()
    );
    out += cleanContent + '\n\n';

    if (win.fact && win.fact.text) {
      out += `${subDivider}\nFACT CHECK & VERIFICATION\n${subDivider}\n\n`;
      out += formatMathSymbolsInText(win.fact.text.trim()) + '\n\n';
      if (win.fact.sources && win.fact.sources.length) {
        out += 'Sources consulted:\n';
        for (const s of win.fact.sources) {
          out += `• ${s.title || s.uri} (${s.uri})\n`;
        }
        out += '\n';
      }
    }

    if (win.turns && win.turns.length) {
      out += `${subDivider}\nFOLLOW-UP QUESTIONS & ANSWERS\n${subDivider}\n\n`;
      for (const t of win.turns) {
        const active = getActiveFollowUpVersion(t);
        out += `Q: ${formatMathSymbolsInText(active.question)}\n\n`;
        out += `A: ${formatMathSymbolsInText(active.answer)}\n\n`;
      }
    }

    out += `${divider}\nGenerated with YouTube Feed Summariser (Gemini)\n${divider}\n`;
    return out;
  }

  function downloadAsTxt(win) {
    const content = formatAsExportText(win);
    const safeTitle = (win.title || win.videoId || 'summary')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .slice(0, 60)
      .trim();
    const filename = `${safeTitle}-${win.mode || 'summary'}.txt`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    let a = null;
    try {
      a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
    } finally {
      setTimeout(() => {
        try {
          if (a && a.parentNode) a.parentNode.removeChild(a);
        } catch (_) {}
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      }, 500);
    }
  }

  function formatAsExportJson(win) {
    const isTranscript = win.mode === 'transcript';
    const processingMode = win.opts?.transcriptMode || (isTranscript ? 'fast' : 'standard');
    let channelName = win.channel || win.author || '';
    if (!channelName && typeof document !== 'undefined') {
      try {
        const ch = document.querySelector('#owner #channel-name, ytd-channel-name #text, #upload-info #channel-name, .ytd-video-owner-renderer #text');
        channelName = ch?.textContent?.trim() || '';
      } catch (_) {}
    }
    if (!channelName) channelName = 'YouTube Creator';

    const mainTargetType = isTranscript ? 'transcript' : 'summary';
    const mainRating = getResponseRating(win.videoId, mainTargetType, 'main');
    const followUpRatings = {};
    (win.turns || []).forEach((_t, idx) => {
      const r = getResponseRating(win.videoId, 'followup', `turn_${idx}`);
      if (r) followUpRatings[`turn_${idx}`] = r;
    });

    const payload = {
      generator: 'YouTube Feed Summariser (Gemini)',
      version: '2.12.0',
      exportedAt: new Date().toISOString(),
      metadata: {
        videoId: win.videoId,
        videoTitle: win.title || win.videoId || 'Untitled Video',
        channel: channelName,
        videoUrl: `https://www.youtube.com/watch?v=${win.videoId}`,
        mode: win.mode || 'summary',
        source: win.source || 'video',
        processingMode: processingMode,
        persona: typeof win.getSummaryPersona === 'function' ? win.getSummaryPersona() : normalizeSummaryPersona(win.opts?.persona),
        model: win.modelId || CONFIG.defaultModel,
        ttsSettings: {
          rate: typeof win.ttsRate === 'number' ? win.ttsRate : 1.0,
          volume: typeof win.ttsVolume === 'number' ? win.ttsVolume : 1.0,
          pitch: typeof win.ttsPitch === 'number' ? win.ttsPitch : 1.0,
          voice: win.ttsVoice || CONFIG.defaultTtsVoice
        }
      },
      content: {
        rawText: formatMathSymbolsInText(win.text || ''),
        formattedText: formatAsExportText(win),
        factCheck: win.fact?.text ? formatMathSymbolsInText(win.fact.text) : null,
        citations: win.sources || [],
        followUpQuestions: (win.turns || []).map((t) => {
          const active = getActiveFollowUpVersion(t);
          return {
            question: formatMathSymbolsInText(active.question),
            answer: formatMathSymbolsInText(active.answer),
            model: active.model,
            sources: t.sources || []
          };
        }),
        ratings: {
          main: mainRating,
          followUps: followUpRatings
        }
      }
    };

    return JSON.stringify(payload, null, 2);
  }

  function downloadAsJson(win) {
    const content = formatAsExportJson(win);
    const safeTitle = (win.title || win.videoId || 'summary')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .slice(0, 60)
      .trim();
    const filename = `${safeTitle}-${win.mode || 'summary'}.json`;
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    let a = null;
    try {
      a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
    } finally {
      setTimeout(() => {
        try {
          if (a && a.parentNode) a.parentNode.removeChild(a);
        } catch (_) {}
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      }, 500);
    }
  }

  // --- FEAT-04: Chapter-Aware Long-Video Synthesis Chunking (>45 min) ---
  function parseVideoChaptersFromDescription(descriptionText, totalDurationSec = 0) {
    if (!descriptionText || typeof descriptionText !== 'string') return [];
    const rawList = [];
    const seenSec = new Set();
    const lines = descriptionText.split('\n');

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      const m = /^(?:#{1,4}\s*)?(?:[-*•]\s*)?\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*(?:[-–—:|]\s*|\s+)(.+)$/.exec(trimmed);
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

  function extractSummaryChapters(summaryText, descriptionChapters = [], totalDurationSec = 0) {
    if (Array.isArray(descriptionChapters) && descriptionChapters.length >= 2) {
      return descriptionChapters.map((ch, idx) => Object.assign({}, ch, { index: idx }));
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

  function buildLongVideoTranscriptChunks(transcriptText, options = {}) {
    const thresholdSec = Math.max(60, Math.floor(options.thresholdSec ?? 2700));
    const maxChunkSec = Math.max(120, Math.floor(options.maxChunkSec ?? 1200));
    const text = String(transcriptText || '');
    const lines = text.split('\n').filter((l) => l.trim().length > 0);

    let maxLineSec = 0;
    const parsedLines = [];
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
      const singleChapter = providedChapters.length > 0 ? providedChapters : [];
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

    let effectiveChapters = providedChapters;
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

    const buckets = effectiveChapters.map(() => []);
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

    const chunks = [];
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

  function buildChunkMapPrompt(videoTitle, chunk, totalChunks, persona = 'executive') {
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

  function buildChunkReducePrompt(videoTitle, chunkSummaries, persona = 'executive', transcriptMode = 'fast', includeVisuals = true) {
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

  function extractChaptersForVideo(videoId) {
    try {
      if (typeof window !== 'undefined' && window.__yt_mock_chapters?.[videoId]) {
        const mockVal = window.__yt_mock_chapters[videoId];
        if (typeof mockVal === 'string') return parseVideoChaptersFromDescription(mockVal);
        if (Array.isArray(mockVal)) return mockVal;
      }
      if (typeof window !== 'undefined' && window.__yt_mock_descriptions?.[videoId]) {
        return parseVideoChaptersFromDescription(window.__yt_mock_descriptions[videoId]);
      }
      if (typeof document !== 'undefined') {
        const descEl = document.querySelector('#description-inner, #structured-description, ytd-watch-metadata #description');
        if (descEl?.textContent) {
          const parsed = parseVideoChaptersFromDescription(descEl.textContent);
          if (parsed.length >= 2) return parsed;
        }
      }
    } catch (_) {}
    return [];
  }

  // --- FEAT-06: Offline Obsidian / Markdown Bundle Export ---
  function linkifyTimestampsForObsidian(text, videoId) {
    if (!text) return '';
    const baseUrl = `https://www.youtube.com/watch?v=${videoId}`;
    return text.replace(/\[((?:\d{1,2}:)?\d{1,2}:\d{2})\](?!\()/g, (_m, ts) => {
      const sec = parseTimestampToSeconds(ts);
      return `[${ts}](${baseUrl}&t=${sec}s)`;
    });
  }

  function formatSummaryExportMarkdown(data) {
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

    const lines = [
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

  function formatAsExportMarkdown(win) {
    const isTranscript = win.mode === 'transcript';
    const processingMode = win.opts?.transcriptMode || (isTranscript ? 'fast' : 'standard');
    let channelName = win.channel || win.author || '';
    if (!channelName && typeof document !== 'undefined') {
      try {
        const ch = document.querySelector('#owner #channel-name, ytd-channel-name #text, #upload-info #channel-name, .ytd-video-owner-renderer #text');
        channelName = ch?.textContent?.trim() || '';
      } catch (_) {}
    }
    if (!channelName) channelName = 'YouTube Creator';

    const mainTargetType = isTranscript ? 'transcript' : 'summary';
    const mainRating = getResponseRating(win.videoId, mainTargetType, 'main');
    const followUpRatings = {};
    (win.turns || []).forEach((_t, idx) => {
      const r = getResponseRating(win.videoId, 'followup', `turn_${idx}`);
      if (r) followUpRatings[`turn_${idx}`] = r;
    });

    const chapters = extractSummaryChapters(win.text || '', win.chapters || []);

    return formatSummaryExportMarkdown({
      videoId: win.videoId,
      videoTitle: win.title || win.videoId || 'Untitled Video',
      channel: channelName,
      mode: win.mode || 'summary',
      source: win.source || 'video',
      processingMode,
      persona: typeof win.getSummaryPersona === 'function' ? win.getSummaryPersona() : normalizeSummaryPersona(win.opts?.persona),
      model: win.modelId || CONFIG.defaultModel,
      text: win.text || '',
      chapters,
      factCheck: win.fact?.text || null,
      citations: win.sources || [],
      followUpQuestions: (win.turns || []).map((t) => {
        const active = getActiveFollowUpVersion(t);
        return {
          question: active.question,
          answer: active.answer,
          model: active.model,
          sources: t.sources || [],
          imageUri: t.imageUri
        };
      }),
      ratings: {
        main: mainRating,
        followUps: followUpRatings
      }
    });
  }

  function downloadAsMarkdown(win) {
    const content = formatAsExportMarkdown(win);
    const safeTitle = (win.title || win.videoId || 'summary')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .slice(0, 60)
      .trim();
    const filename = `${safeTitle}-${win.mode || 'summary'}.md`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    let a = null;
    try {
      a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
    } finally {
      setTimeout(() => {
        try {
          if (a && a.parentNode) a.parentNode.removeChild(a);
        } catch (_) {}
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      }, 500);
    }
  }

  function exportAsPdf(win) {
    const isTranscript = win.mode === 'transcript';
    const printIframe = document.createElement('iframe');
    printIframe.style.position = 'fixed';
    printIframe.style.right = '0';
    printIframe.style.bottom = '0';
    printIframe.style.width = '0';
    printIframe.style.height = '0';
    printIframe.style.border = '0';
    printIframe.style.opacity = '0';
    printIframe.style.pointerEvents = 'none';
    document.body.appendChild(printIframe);

    const doc = printIframe.contentDocument || printIframe.contentWindow.document;
    doc.open();
    doc.write('<!DOCTYPE html><html><head><title>' + (win.title || 'Export') + '</title></head><body></body></html>');
    doc.close();

    const style = doc.createElement('style');
    style.textContent = `
      @page { margin: 16mm 14mm; size: auto; }
      body {
        font-family: Georgia, Charter, Cambria, serif;
        font-size: 11pt;
        line-height: 1.6;
        color: #111;
        max-width: 800px;
        margin: 0 auto;
        padding: 10px;
      }
      .header { border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 20px; }
      .badge { display: inline-block; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: #eee; padding: 2px 8px; border-radius: 4px; margin-bottom: 6px; }
      h1 { font-size: 18pt; margin: 0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.25; }
      .meta { font-size: 9pt; color: #555; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin-bottom: 4px; }
      .meta a { color: #0056b3; text-decoration: none; }
      h2 { font-size: 13pt; margin-top: 22px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      h3 { font-size: 11.5pt; margin-top: 16px; margin-bottom: 6px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      p { margin: 0 0 10px 0; }
      ul, ol { margin: 0 0 12px 0; padding-left: 24px; }
      li { margin-bottom: 4px; }
      .timestamp { font-weight: 600; color: #0056b3; font-family: monospace; font-size: 9.5pt; }
      .fact-section { margin-top: 24px; padding: 12px; background: #f8f9fa; border-left: 3px solid #28a745; border-radius: 4px; }
      .qa-item { margin-top: 14px; padding-bottom: 10px; border-bottom: 1px dashed #ccc; }
      .q-text { font-weight: 600; margin-bottom: 4px; }
      .footer { margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; font-size: 8pt; color: #888; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; }
    `;
    doc.head.appendChild(style);

    const headerDiv = doc.createElement('div');
    headerDiv.className = 'header';
    const badge = doc.createElement('div');
    badge.className = 'badge';
    badge.textContent = isTranscript ? 'YouTube Transcript' : 'YouTube Video Summary';
    headerDiv.appendChild(badge);

    const h1 = doc.createElement('h1');
    h1.textContent = win.title;
    headerDiv.appendChild(h1);

    const meta = doc.createElement('div');
    meta.className = 'meta';
    meta.textContent = `Video ID: ${win.videoId} · Source: ${win.source} · Model: ${win.modelId || 'Default'} · Exported: ${new Date().toLocaleDateString()}`;
    headerDiv.appendChild(meta);

    const link = doc.createElement('div');
    link.className = 'meta';
    const a = doc.createElement('a');
    a.href = `https://www.youtube.com/watch?v=${win.videoId}`;
    a.textContent = `https://www.youtube.com/watch?v=${win.videoId}`;
    link.appendChild(a);
    headerDiv.appendChild(link);

    doc.body.appendChild(headerDiv);

    const blocks = parseCleanEditorialBlocks(win.text || '');
    let curList = null;

    for (const block of blocks) {
      if (block.type === 'heading') {
        if (curList) { doc.body.appendChild(curList); curList = null; }
        const h2 = doc.createElement('h2');
        h2.textContent = block.text;
        doc.body.appendChild(h2);
      } else if (block.type === 'subheading') {
        if (curList) { doc.body.appendChild(curList); curList = null; }
        const h3 = doc.createElement('h3');
        h3.textContent = block.text;
        doc.body.appendChild(h3);
      } else if (block.type === 'bullet') {
        if (!curList || curList.tagName !== 'UL') {
          if (curList) doc.body.appendChild(curList);
          curList = doc.createElement('ul');
        }
        const li = doc.createElement('li');
        li.textContent = block.text;
        curList.appendChild(li);
      } else if (block.type === 'numbered') {
        if (!curList || curList.tagName !== 'OL') {
          if (curList) doc.body.appendChild(curList);
          curList = doc.createElement('ol');
        }
        const li = doc.createElement('li');
        li.textContent = block.text;
        curList.appendChild(li);
      } else {
        if (curList) { doc.body.appendChild(curList); curList = null; }
        const p = doc.createElement('p');
        p.textContent = block.text;
        doc.body.appendChild(p);
      }
    }
    if (curList) doc.body.appendChild(curList);

    if (win.fact && win.fact.text) {
      const factBox = doc.createElement('div');
      factBox.className = 'fact-section';
      const factH = doc.createElement('h2');
      factH.textContent = 'Fact-Check & Verification';
      factBox.appendChild(factH);
      const factBlocks = parseCleanEditorialBlocks(win.fact.text);
      for (const fb of factBlocks) {
        const p = doc.createElement('p');
        p.textContent = fb.text;
        factBox.appendChild(p);
      }
      doc.body.appendChild(factBox);
    }

    if (win.turns && win.turns.length) {
      const qaH = doc.createElement('h2');
      qaH.textContent = 'Follow-up Questions & Answers';
      doc.body.appendChild(qaH);
      for (const t of win.turns) {
        const qDiv = doc.createElement('div');
        qDiv.className = 'qa-item';
        const qP = doc.createElement('p');
        qP.className = 'q-text';
        qP.textContent = `Q: ${t.q}`;
        qDiv.appendChild(qP);
        const aP = doc.createElement('p');
        aP.textContent = `A: ${t.a}`;
        qDiv.appendChild(aP);
        doc.body.appendChild(qDiv);
      }
    }

    const footer = doc.createElement('div');
    footer.className = 'footer';
    footer.textContent = 'Exported from YouTube Feed Summariser (Gemini)';
    doc.body.appendChild(footer);

    printIframe.contentWindow.focus();
    setTimeout(() => {
      try {
        printIframe.contentWindow.print();
      } catch (e) {
        console.warn('[YTAIS] Print error:', e);
      }
      setTimeout(() => {
        printIframe.remove();
      }, 4000);
    }, 250);
  }

  function cleanTextForSpeech(text, opts = {}) {
    if (!text) return '';
    const skipSilence = opts && typeof opts.skipSilence === 'boolean' ? opts.skipSilence : true;
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
      const processedLines = [];
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
    clean = clean.replace(/\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]/g, function (_match, h, m, s) {
      const hrs = h ? parseInt(h, 10) : 0;
      const mins = parseInt(m, 10);
      const secs = parseInt(s, 10);
      const parts = [];
      if (hrs > 0) parts.push(`${hrs} hour${hrs > 1 ? 's' : ''}`);
      if (mins > 0) parts.push(`${mins} minute${mins > 1 ? 's' : ''}`);
      if (secs > 0) parts.push(`${secs} second${secs > 1 ? 's' : ''}`);
      return parts.length ? `at ${parts.join(' ')}` : '';
    });
    // Format LaTeX / scientific symbols (e.g., $100^\circ\text{C}$ -> 100°C)
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

  function parseTranscriptCues(transcriptText, opts = { skipSilence: true }) {
    if (!transcriptText) return { cues: [], fullSpokenText: '' };
    const lines = transcriptText.split('\n');
    const cues = [];
    const spokenParts = [];
    let currentOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      const tsMatch = /^\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*(.*)$/.exec(trimmed);
      if (!tsMatch) continue;

      const tsStr = trimmed.slice(0, trimmed.indexOf(']') + 1);
      const restText = trimmed.slice(tsStr.length).trim();
      const parts = tsStr.slice(1, -1).split(':').map(Number);
      let sec = 0;
      if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else sec = parts[0] * 60 + parts[1];

      const spokenLine = cleanTextForSpeech(trimmed, opts);
      if (!spokenLine) continue;

      const charStart = currentOffset;
      const charEnd = currentOffset + spokenLine.length;
      currentOffset = charEnd + 1;
      spokenParts.push(spokenLine);

      cues.push({
        lineIndex: i,
        rawLine,
        tsStr,
        startSec: sec,
        text: restText,
        spokenText: spokenLine,
        charStart,
        charEnd
      });
    }

    const fullSpokenText = spokenParts.join(' ');
    return { cues, fullSpokenText };
  }

  function findActiveCueByCharIndex(cues, charIndex) {
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

  function findActiveCueByTime(cues, currentTimeSec, totalDurationSec) {
    if (!cues || cues.length === 0) return null;
    if (totalDurationSec <= 0 || currentTimeSec <= 0) return cues[0];

    const progress = Math.min(1, Math.max(0, currentTimeSec / totalDurationSec));
    const totalChars = cues[cues.length - 1].charEnd;
    const targetChar = Math.round(progress * totalChars);

    return findActiveCueByCharIndex(cues, targetChar);
  }

  // --- FEAT-07: Interactive Multi-Host Podcast Studio (NotebookLM-Style) ---
  const DEFAULT_PODCAST_HOST_POOL = [
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

  function normalizePodcastHostCount(raw, min = 2, max = 6) {
    const safeMin = Math.max(2, Math.floor(min));
    const safeMax = Math.max(safeMin, Math.floor(max));
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(n)) return safeMin;
    return Math.max(safeMin, Math.min(safeMax, Math.floor(n)));
  }

  function buildDefaultPodcastHosts(hostCount, customHosts) {
    const count = normalizePodcastHostCount(hostCount);
    const hosts = [];
    for (let i = 0; i < count; i++) {
      const preset = DEFAULT_PODCAST_HOST_POOL[i % DEFAULT_PODCAST_HOST_POOL.length];
      const suffix = i >= DEFAULT_PODCAST_HOST_POOL.length ? ` ${Math.floor(i / DEFAULT_PODCAST_HOST_POOL.length) + 1}` : '';
      const custom = Array.isArray(customHosts) ? customHosts[i] : undefined;
      const validVoice =
        custom?.voiceName && ['Kore', 'Puck', 'Zephyr', 'Fenrir', 'Charon'].includes(custom.voiceName)
          ? custom.voiceName
          : preset.voiceName;
      const cleanName =
        typeof custom?.name === 'string' && custom.name.trim()
          ? custom.name.trim().slice(0, 32)
          : `${preset.name}${suffix}`;
      const cleanRole =
        typeof custom?.role === 'string' && custom.role.trim()
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

  function buildPodcastScriptPrompt(options = {}) {
    const hosts =
      Array.isArray(options.hosts) && options.hosts.length >= 2
        ? options.hosts
        : buildDefaultPodcastHosts(2);
    const rosterDesc = hosts.map((h, idx) => `${idx + 1}. ${h.name} (${h.role}) — ${h.style}`).join('\n');
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

  function buildPodcastInteractionPrompt(options = {}) {
    const hosts =
      Array.isArray(options.hosts) && options.hosts.length >= 2
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

  function matchPodcastHost(speakerRaw, hosts, fallbackIdx) {
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

  function extractTimestampSecFromText(text) {
    const m = /\[((?:\d{1,2}:)?\d{1,2}:\d{2})\]/.exec(String(text || ''));
    if (!m) return null;
    const sec = parseTimestampToSeconds(m[1]);
    return Number.isFinite(sec) ? sec : null;
  }

  function escapeRegexLiteral(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function sanitizeSpokenTurnText(raw, hostNames) {
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

  function parsePodcastScriptResponse(rawText, hosts, options = {}) {
    const safeHosts =
      Array.isArray(hosts) && hosts.length >= 2 ? hosts : buildDefaultPodcastHosts(2);
    const hostNames = safeHosts.map((h) => h.name);
    const raw = String(rawText || '').trim();
    const defaultTitle = options.episodeTitle || 'Audio Deep Dive';

    if (!raw) {
      return { title: defaultTitle, turns: [] };
    }

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
        const turns = [];
        rawTurns.forEach((item, idx) => {
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

    const turns = [];
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

  function extractSummaryKeyInsights(summaryText) {
    const formatted = formatMathSymbolsInText(String(summaryText || ''))
      .replace(/\[\[(?:FRAME|IMG|GEN|IMAGE)[^\]]*\]\]/gi, '');
    const lines = formatted.split('\n').map((l) => l.trim()).filter(Boolean);
    const insights = [];
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

  function buildDeterministicPodcastEpisode(options = {}) {
    const hosts =
      Array.isArray(options.hosts) && options.hosts.length >= 2
        ? options.hosts
        : buildDefaultPodcastHosts(2);
    const title = (options.videoTitle || 'Video Deep Dive').trim();
    const insights = extractSummaryKeyInsights(options.summaryText);
    const turns = [];

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
      text: 'That wraps our full breakdown — jump in anytime with a text or voice question if you want us to zoom into any point!',
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

  function splitSummaryIntoPodcastSections(summaryText, maxBatchChars = 1400) {
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

    const chunks = [];
    let buf = '';

    const pushOversizedBlock = (block) => {
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
      const last = chunks.pop();
      chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}\n\n${last}`.trim();
    }
    return chunks.length > 0 ? chunks : [clean];
  }

  function buildPodcastScriptPartPrompt(options = {}) {
    const hosts =
      Array.isArray(options.hosts) && options.hosts.length >= 2
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
      const rosterDesc = hosts.map((h, idx) => `${idx + 1}. ${h.name} (${h.role}) — ${h.style}`).join('\n');
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

  function buildPodcastContinuationPrompt(options = {}) {
    const hosts =
      Array.isArray(options.hosts) && options.hosts.length >= 2
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

  function buildDeterministicPodcastEpisodePart(options = {}) {
    const hosts =
      Array.isArray(options.hosts) && options.hosts.length >= 2
        ? options.hosts
        : buildDefaultPodcastHosts(2);
    const partIdx = Math.max(0, Math.floor(options.partIndex || 0));
    const totalParts = Math.max(1, Math.floor(options.totalParts || 1));
    const isFirst = partIdx === 0;
    const isFinal = partIdx >= totalParts - 1;
    const title = (options.videoTitle || 'Video Deep Dive').trim();
    const insights = extractSummaryKeyInsights(options.sectionText);
    const turns = [];
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

  function appendPodcastEpisodeTurns(episode, newTurns, meta = {}) {
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

  function resolveSummaryWindowDisplayTitle(options = {}) {
    const aiTitle = String(options?.aiTitle || '').trim();
    const originalTitle = String(options?.originalTitle || '').trim();
    const fallbackTitle = String(options?.fallbackTitle || '').trim() || 'Video summary';
    const requested = options?.mode === 'original' ? 'original' : 'ai';
    if (requested === 'original') {
      return {
        mode: 'original',
        displayTitle: originalTitle || aiTitle || fallbackTitle,
        hasAiTitle: Boolean(aiTitle),
        hasOriginalTitle: Boolean(originalTitle)
      };
    }
    const resolvedMode = aiTitle ? 'ai' : 'original';
    return {
      mode: resolvedMode,
      displayTitle: aiTitle || originalTitle || fallbackTitle,
      hasAiTitle: Boolean(aiTitle),
      hasOriginalTitle: Boolean(originalTitle)
    };
  }

  function normalizeAutoFactCheckSetting(val) {
    return val !== false;
  }

  function normalizeFollowUpTurn(raw) {
    const rawVersions = Array.isArray(raw?.versions) ? raw.versions : [];
    const baseQuestion = String(raw?.q ?? raw?.question ?? '').trim();
    const baseAnswer = String(raw?.a ?? raw?.answer ?? '');
    const baseModel = String(raw?.model || '').trim() || 'Gemini';

    const versions =
      rawVersions.length > 0
        ? rawVersions.map((v) => ({
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

  function normalizeFollowUpTurnsList(turns) {
    return (Array.isArray(turns) ? turns : []).map((t) => normalizeFollowUpTurn(t));
  }

  function getActiveFollowUpVersion(turn) {
    const norm = normalizeFollowUpTurn(turn);
    return norm.versions[norm.activeVersionIndex];
  }

  function appendFollowUpTurnVersion(turn, version) {
    const norm = normalizeFollowUpTurn(turn);
    const cleanVer = {
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

  function stepFollowUpTurnVersion(turn, delta) {
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

  function buildDeterministicPodcastInteractionResponse(options = {}) {
    const hosts =
      Array.isArray(options.hosts) && options.hosts.length >= 2
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
    const userTurn = {
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

    const responseTurns = [
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
        text: 'And one caveat to watch for: keep testing those assumptions against your own workload before jumping back into the rest of the episode!',
        isResponse: true,
        timestampSec: null
      });
    }

    return { userTurn, responseTurns };
  }

  function splicePodcastInteractionTurns(turns, insertAfterIndex, userTurn, responseTurns) {
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

  function buildGeminiMultiSpeakerTtsBody(turns, hosts) {
    const safeHosts =
      Array.isArray(hosts) && hosts.length >= 2 ? hosts : buildDefaultPodcastHosts(2);
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

  // --- STORAGE & PERSISTENCE HELPERS ---
  function getStoredKeys() {
    let keys = GM_getValue('keys', null);
    if (!Array.isArray(keys)) {
      const legacy = GM_getValue('gemini_api_key', null);
      if (legacy && typeof legacy === 'string' && legacy.trim()) {
        keys = [{ id: 'k_' + Math.random().toString(36).slice(2, 8), name: 'Default', key: legacy.trim() }];
        GM_setValue('keys', keys);
        GM_deleteValue('gemini_api_key');
      } else {
        keys = [];
      }
    }
    return keys;
  }

  function saveStoredKeys(keys) {
    GM_setValue('keys', keys);
  }

  function getGlobalOpts() {
    const merged = Object.assign({}, DEFAULT_OPTS, GM_getValue('opts', {}));
    merged.autoFactCheck = normalizeAutoFactCheckSetting(merged.autoFactCheck);
    return merged;
  }

  function saveGlobalOpts(opts) {
    GM_setValue('opts', Object.assign({}, DEFAULT_OPTS, opts || {}, {
      autoFactCheck: normalizeAutoFactCheckSetting(opts?.autoFactCheck)
    }));
  }

  function getAutoStart() {
    return Boolean(GM_getValue('autoStart', false));
  }

  function setAutoStart(val) {
    GM_setValue('autoStart', Boolean(val));
  }

  function getLastModel() {
    return GM_getValue('lastModel', CONFIG.defaultModel);
  }

  function setLastModel(m) {
    GM_setValue('lastModel', m);
  }

  function getLastKeyId() {
    return GM_getValue('lastKeyId', '');
  }

  function setLastKeyId(id) {
    GM_setValue('lastKeyId', id);
  }

  function getLastSource() {
    return GM_getValue('lastSource', 'video');
  }

  function setLastSource(s) {
    GM_setValue('lastSource', s);
  }

  function getCustomModels() {
    return GM_getValue('customModels', []);
  }

  function addCustomModel(id) {
    const clean = String(id || '').trim();
    if (!clean) return;
    const list = getCustomModels();
    if (!list.includes(clean)) {
      list.push(clean);
      GM_setValue('customModels', list);
    }
  }

  function removeCustomModel(id) {
    const list = getCustomModels().filter((m) => m !== id);
    GM_setValue('customModels', list);
    return list;
  }

  function normalizeOutputLanguage(val) {
    const clean = String(val || '').replace(/[\r\n<>]/g, '').trim();
    return clean ? clean.slice(0, 48) : 'English';
  }

  function getOutputLanguage() {
    return normalizeOutputLanguage(GM_getValue('output_language', CONFIG.outputLanguage || 'English'));
  }

  function setOutputLanguage(lang) {
    const norm = normalizeOutputLanguage(lang);
    GM_setValue('output_language', norm);
    CONFIG.outputLanguage = norm;
    return norm;
  }

  function getLastTtsVoice() {
    return GM_getValue('lastTtsVoice', CONFIG.defaultTtsVoice);
  }

  function setLastTtsVoice(v) {
    GM_setValue('lastTtsVoice', v);
  }

  function getLastTtsVolume() {
    const val = GM_getValue('lastTtsVolume', 1.0);
    return typeof val === 'number' && !isNaN(val) ? Math.max(0, Math.min(1, val)) : 1.0;
  }

  function setLastTtsVolume(v) {
    const vol = typeof v === 'number' && !isNaN(v) ? Math.max(0, Math.min(1, v)) : 1.0;
    GM_setValue('lastTtsVolume', vol);
  }

  function getLastTtsRate() {
    const val = GM_getValue('lastTtsRate', 1.0);
    return typeof val === 'number' && !isNaN(val) ? Math.max(0.5, Math.min(2.0, val)) : 1.0;
  }

  function setLastTtsRate(r) {
    const rate = typeof r === 'number' && !isNaN(r) ? Math.max(0.5, Math.min(2.0, r)) : 1.0;
    GM_setValue('lastTtsRate', rate);
  }

  function clampPitch(val) {
    const num = typeof val === 'number' ? val : parseFloat(val);
    if (!isFinite(num)) return 1.0;
    return Math.max(0.5, Math.min(2.0, Math.round(num * 100) / 100));
  }

  function getLastTtsPitch() {
    const val = GM_getValue('lastTtsPitch', CONFIG.defaultTtsPitch || 1.0);
    return clampPitch(val);
  }

  function setLastTtsPitch(p) {
    const pitch = clampPitch(p);
    GM_setValue('lastTtsPitch', pitch);
  }

  function computeWaveformAmplitudes(options) {
    const barCount = Math.max(4, options?.barCount || 12);
    const volume = options?.volume !== undefined ? Math.max(0, Math.min(1, options.volume)) : 1.0;
    const pitch = options?.pitch !== undefined ? clampPitch(options.pitch) : 1.0;
    const rate = options?.rate !== undefined ? Math.max(0.25, Math.min(3, options.rate)) : 1.0;
    const t = (options?.timestamp !== undefined ? options.timestamp : Date.now()) / 1000;
    const pulse = Math.max(0, Math.min(1, options?.boundaryPulse || 0));

    if (!options?.isPlaying || volume === 0) {
      return new Array(barCount).fill(0.08);
    }

    const bars = [];
    const baseFreq = 3.2 * rate;

    for (let i = 0; i < barCount; i++) {
      const normIdx = i / (barCount - 1);
      const formantCenter = 0.35 * Math.sqrt(pitch);
      const formantWidth = 0.28;
      const formantDist = Math.abs(normIdx - formantCenter);
      const formantWeight = Math.exp(-Math.pow(formantDist / formantWidth, 2));

      const harmonic1 = Math.sin(t * baseFreq * 2.1 + i * 0.8) * 0.5 + 0.5;
      const harmonic2 = Math.sin(t * baseFreq * 4.3 - i * 1.2) * 0.3 + 0.3;
      const harmonic3 = Math.cos(t * baseFreq * 1.1 + i * 0.4) * 0.2 + 0.2;
      const attackBoost = pulse * (0.3 + 0.7 * Math.sin(i * 0.5));

      let amp = (formantWeight * 0.5 + 0.25) * (harmonic1 * 0.45 + harmonic2 * 0.35 + harmonic3 * 0.2) + attackBoost;
      amp = Math.max(0.08, Math.min(1.0, amp * volume));
      bars.push(Math.round(amp * 100) / 100);
    }
    return bars;
  }

  function getLastReadabilityTheme() {
    return GM_getValue('lastReadabilityTheme', CONFIG.defaultReadabilityTheme || 'system');
  }

  function setLastReadabilityTheme(theme) {
    GM_setValue('lastReadabilityTheme', theme);
  }

  function detectYouTubeTheme(doc) {
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

  function getLastSyncYouTubeTheme() {
    return Boolean(GM_getValue('sync_yt_theme', true));
  }

  function setLastSyncYouTubeTheme(val) {
    GM_setValue('sync_yt_theme', Boolean(val));
  }

  function normalizeAppThemeMode(val) {
    const normalized = String(val || '').trim().toLowerCase();
    if (normalized === 'light' || normalized === 'dark' || normalized === 'system') {
      return normalized;
    }
    return 'system';
  }

  function resolveEffectiveAppTheme(mode, systemPrefersDark) {
    const m = normalizeAppThemeMode(mode);
    if (m === 'light') return 'light';
    if (m === 'dark') return 'dark';
    return systemPrefersDark ? 'dark' : 'light';
  }

  function getSystemPrefersDark() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return Boolean(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return true;
  }

  const DEFAULT_UI_FORMATTING_PREFS = {
    fontFamily: 'system',
    fontSizePx: 14,
    density: 'comfortable'
  };

  const DEFAULT_GENERATED_TEXT_PREFS = {
    fontFamily: 'sans',
    fontSizePx: 14,
    lineHeight: 1.6,
    paragraphSpacing: 'normal',
    richFormatting: true
  };

  function normalizeUiFormattingPrefs(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const fontFamily = ['system', 'dm-sans', 'serif', 'mono'].includes(src.fontFamily)
      ? src.fontFamily
      : DEFAULT_UI_FORMATTING_PREFS.fontFamily;
    const rawSize = Number(src.fontSizePx);
    const fontSizePx = Number.isFinite(rawSize)
      ? Math.max(11, Math.min(18, Math.round(rawSize)))
      : DEFAULT_UI_FORMATTING_PREFS.fontSizePx;
    const density = ['compact', 'comfortable', 'relaxed'].includes(src.density)
      ? src.density
      : DEFAULT_UI_FORMATTING_PREFS.density;
    return { fontFamily, fontSizePx, density };
  }

  function normalizeGeneratedTextPrefs(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const fontFamily = ['sans', 'serif', 'mono'].includes(src.fontFamily)
      ? src.fontFamily
      : DEFAULT_GENERATED_TEXT_PREFS.fontFamily;
    const rawSize = Number(src.fontSizePx);
    const fontSizePx = Number.isFinite(rawSize)
      ? Math.max(12, Math.min(22, Math.round(rawSize)))
      : DEFAULT_GENERATED_TEXT_PREFS.fontSizePx;
    const rawLh = Number(src.lineHeight);
    const lineHeight = Number.isFinite(rawLh)
      ? Math.max(1.3, Math.min(2.0, Math.round(rawLh * 100) / 100))
      : DEFAULT_GENERATED_TEXT_PREFS.lineHeight;
    const paragraphSpacing = ['compact', 'normal', 'relaxed'].includes(src.paragraphSpacing)
      ? src.paragraphSpacing
      : DEFAULT_GENERATED_TEXT_PREFS.paragraphSpacing;
    const richFormatting = src.richFormatting === false || src.richFormatting === 'false'
      ? false
      : DEFAULT_GENERATED_TEXT_PREFS.richFormatting;
    return { fontFamily, fontSizePx, lineHeight, paragraphSpacing, richFormatting };
  }

  function resolveFormattingCssVars(uiRaw, genRaw) {
    const ui = normalizeUiFormattingPrefs(uiRaw);
    const gen = normalizeGeneratedTextPrefs(genRaw);
    const uiFontMap = {
      system: '"DM Sans", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'dm-sans': '"DM Sans", "Plus Jakarta Sans", system-ui, sans-serif',
      serif: '"Georgia", "Source Serif 4", Cambria, "Times New Roman", serif',
      mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
    };
    const genFontMap = {
      sans: '"DM Sans", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      serif: '"Georgia", "Source Serif 4", Cambria, "Times New Roman", serif',
      mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
    };
    const densityPadMap = { compact: '8px', comfortable: '12px', relaxed: '16px' };
    const paraGapMap = { compact: '6px', normal: '11px', relaxed: '18px' };
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

  function getUiFormattingPrefs() {
    return normalizeUiFormattingPrefs(GM_getValue('ui_formatting_prefs', DEFAULT_UI_FORMATTING_PREFS));
  }

  function setUiFormattingPrefs(partialOrFull) {
    const merged = normalizeUiFormattingPrefs({ ...getUiFormattingPrefs(), ...(partialOrFull || {}) });
    GM_setValue('ui_formatting_prefs', merged);
    applyShadowAppTheme();
    return merged;
  }

  function getGeneratedTextPrefs() {
    return normalizeGeneratedTextPrefs(GM_getValue('gen_formatting_prefs', DEFAULT_GENERATED_TEXT_PREFS));
  }

  function setGeneratedTextPrefs(partialOrFull) {
    const prev = getGeneratedTextPrefs();
    const merged = normalizeGeneratedTextPrefs({ ...prev, ...(partialOrFull || {}) });
    GM_setValue('gen_formatting_prefs', merged);
    applyShadowAppTheme();
    if (prev.richFormatting !== merged.richFormatting) {
      for (const win of getOpenWindows()) {
        win.renderBody();
      }
    }
    return merged;
  }

  function resetFormattingPrefs() {
    GM_setValue('ui_formatting_prefs', { ...DEFAULT_UI_FORMATTING_PREFS });
    GM_setValue('gen_formatting_prefs', { ...DEFAULT_GENERATED_TEXT_PREFS });
    applyShadowAppTheme();
    for (const win of getOpenWindows()) {
      win.renderBody();
    }
  }

  function buildFollowUpModelCandidates(options) {
    const opts = options || {};
    const isTextEligible = (m) => {
      const lower = String(m || '').trim().toLowerCase();
      if (!lower) return false;
      return !/(?:transcribe|tts|image|nano-banana|embed|aqa|imagen|veo|audio|live|robotics|computer-use|deep-research|learnlm)/.test(lower);
    };

    const ladder = Array.isArray(opts.fallbackLadder) ? opts.fallbackLadder : [];
    const selected = String(opts.selectedModel || '').trim();
    const isAskSelected = selected.toLowerCase().includes('ask');

    const ordered = [];
    const pushUnique = (model) => {
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
      startIdx = idx !== -1 ? idx + 1 : 0;
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
    const filtered = [];
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
        filtered.push(candidate);
      }
    }
    return filtered.length > 0 ? filtered : ordered;
  }

  const PASTEL_ACCENT_PRESETS = [
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

  const ACCENT_CSS_VAR_KEYS = [
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
  ];

  function normalizeContinueAudioOnMinimize(val) {
    if (val === false || val === 0) return false;
    if (typeof val === 'string') {
      const s = val.trim().toLowerCase();
      if (s === 'false' || s === '0' || s === 'off' || s === 'no') return false;
    }
    return true;
  }

  function shouldStopPlaybackOnMinimize(continueAudioOnMinimize, skipCommit = false) {
    if (skipCommit) return true;
    return !normalizeContinueAudioOnMinimize(continueAudioOnMinimize);
  }

  function normalizeAccentColorHex(raw) {
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

  function hexToRgb(hex) {
    const clean = normalizeAccentColorHex(hex);
    if (!clean) return null;
    const n = parseInt(clean.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));
    return (
      '#' +
      [clampByte(r), clampByte(g), clampByte(b)]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    );
  }

  function rgbToHsl(r, g, b) {
    const rn = Math.max(0, Math.min(255, r)) / 255;
    const gn = Math.max(0, Math.min(255, g)) / 255;
    const bn = Math.max(0, Math.min(255, b)) / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
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

  function hslToHex(h, s, l) {
    const hue = (((Number(h) || 0) % 360) + 360) % 360;
    const sat = Math.max(0, Math.min(100, Number(s) || 0)) / 100;
    const lit = Math.max(0, Math.min(100, Number(l) || 0)) / 100;
    const a = sat * Math.min(lit, 1 - lit);
    const f = (n) => {
      const k = (n + hue / 30) % 12;
      const color = lit - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * color);
    };
    return rgbToHex(f(0), f(8), f(4));
  }

  function getRelativeLuminance(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    const linear = [rgb.r, rgb.g, rgb.b].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  function getContrastRatio(hexA, hexB) {
    const l1 = getRelativeLuminance(hexA);
    const l2 = getRelativeLuminance(hexB);
    const bright = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (bright + 0.05) / (dark + 0.05);
  }

  function colorWheelPointToHex(nx, ny, lightness = 76) {
    const x = Number.isFinite(nx) ? nx : 0;
    const y = Number.isFinite(ny) ? ny : 0;
    const radius = Math.min(1, Math.hypot(x, y));
    const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    const sat = Math.round(radius * 100);
    const lit = Math.max(40, Math.min(92, lightness));
    return hslToHex(deg, sat, lit);
  }

  function hexToColorWheelPoint(hex) {
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

  function resolveMaterialAccentPalette(accentHex, effectiveTheme) {
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

  function resolveAccentCssVars(accentHex, effectiveTheme) {
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

  function getAppThemeMode() {
    const raw = GM_getValue('app_theme_mode', 'dark');
    return normalizeAppThemeMode(raw);
  }

  function getEffectiveAppTheme() {
    return resolveEffectiveAppTheme(getAppThemeMode(), getSystemPrefersDark());
  }

  function getUiAccentColor() {
    return normalizeAccentColorHex(GM_getValue('ui_accent_color', ''));
  }

  function syncSettingsAccentDom(accentHex) {
    if (!shadowRoot || typeof shadowRoot.querySelectorAll !== 'function') return;
    const clean = normalizeAccentColorHex(accentHex);
    const previewHex = clean || '#93C5FD';
    shadowRoot.querySelectorAll('.yt-accent-swatch').forEach((btn) => {
      const hex = btn.getAttribute('data-accent-hex');
      const isAct = Boolean(clean && hex === clean);
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-pressed', isAct ? 'true' : 'false');
    });
    shadowRoot.querySelectorAll('.yt-accent-hex-input').forEach((inp) => {
      inp.value = clean || 'Default (#a3c9ff)';
    });
    shadowRoot.querySelectorAll('.yt-accent-color-input').forEach((inp) => {
      inp.value = previewHex;
    });
    shadowRoot.querySelectorAll('.yt-accent-wheel-thumb').forEach((thumb) => {
      const pt = hexToColorWheelPoint(clean || '#93C5FD');
      thumb.style.left = `${((0.5 + pt.nx * 0.5) * 100).toFixed(2)}%`;
      thumb.style.top = `${((0.5 + pt.ny * 0.5) * 100).toFixed(2)}%`;
      thumb.style.background = previewHex;
    });
  }

  function applyShadowAppTheme() {
    const mode = getAppThemeMode();
    const eff = resolveEffectiveAppTheme(mode, getSystemPrefersDark());
    const uiPrefs = getUiFormattingPrefs();
    const genPrefs = getGeneratedTextPrefs();
    const fmtVars = resolveFormattingCssVars(uiPrefs, genPrefs).vars;
    const accentHex = getUiAccentColor();
    const accentVars = resolveAccentCssVars(accentHex, eff);
    const host = (shadowRoot && shadowRoot.host) || (typeof document !== 'undefined' ? document.getElementById('yt-ai-summary-host') : null);
    if (host && host.classList) {
      host.classList.remove('yt-ui-light', 'yt-ui-dark');
      host.classList.add(eff === 'light' ? 'yt-ui-light' : 'yt-ui-dark');
      if (typeof host.setAttribute === 'function') {
        host.setAttribute('data-app-theme-mode', mode);
        host.setAttribute('data-app-theme', eff);
        host.setAttribute('data-ui-density', uiPrefs.density);
        host.setAttribute('data-gen-rich', genPrefs.richFormatting ? 'true' : 'false');
        host.setAttribute('data-ui-accent', accentHex || 'default');
      }
      if (host.style && typeof host.style.setProperty === 'function') {
        for (const [k, v] of Object.entries(fmtVars)) {
          host.style.setProperty(k, v);
        }
        for (const k of ACCENT_CSS_VAR_KEYS) {
          if (k in accentVars) host.style.setProperty(k, accentVars[k]);
          else if (typeof host.style.removeProperty === 'function') host.style.removeProperty(k);
        }
      }
    }
    if (typeof document !== 'undefined') {
      const launchers = document.querySelectorAll('.yt-topbar-launcher-btn');
      for (const lbtn of launchers) {
        lbtn.classList.remove('yt-ui-light', 'yt-ui-dark');
        lbtn.classList.add(eff === 'light' ? 'yt-ui-light' : 'yt-ui-dark');
        if (lbtn.style && typeof lbtn.style.setProperty === 'function') {
          if (accentHex && accentVars['--md-sys-color-primary']) {
            lbtn.style.setProperty('--md-sys-color-primary', accentVars['--md-sys-color-primary']);
            lbtn.style.setProperty('--yt-accent-border', accentVars['--yt-accent-border']);
            lbtn.style.setProperty('--yt-accent-tint-strong', accentVars['--yt-accent-tint-strong']);
          } else if (typeof lbtn.style.removeProperty === 'function') {
            lbtn.style.removeProperty('--md-sys-color-primary');
            lbtn.style.removeProperty('--yt-accent-border');
            lbtn.style.removeProperty('--yt-accent-tint-strong');
          }
        }
      }
    }
    if (shadowRoot && typeof shadowRoot.querySelectorAll === 'function') {
      const btns = shadowRoot.querySelectorAll('.yt-app-theme-btn');
      for (const btn of btns) {
        const opt = btn.getAttribute('data-app-theme');
        const active = opt === mode;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
      syncSettingsAccentDom(accentHex);
    }
    return eff;
  }

  function setAppThemeMode(mode) {
    const normalized = normalizeAppThemeMode(mode);
    GM_setValue('app_theme_mode', normalized);
    return applyShadowAppTheme();
  }

  function setUiAccentColor(hex) {
    const normalized = normalizeAccentColorHex(hex);
    GM_setValue('ui_accent_color', normalized);
    applyShadowAppTheme();
    return normalized;
  }

  let appThemeMediaListenerAttached = false;
  function ensureAppThemeMediaListener() {
    if (appThemeMediaListenerAttached) return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq && typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', () => {
        if (getAppThemeMode() === 'system') {
          applyShadowAppTheme();
        }
      });
      appThemeMediaListenerAttached = true;
    }
  }

  function normalizeAltTitleMode(val) {
    if (val === false) return 'off';
    if (val === true) return 'on';
    const s = String(val ?? '').trim().toLowerCase();
    if (s === 'off' || s === 'false' || s === 'disabled') return 'off';
    if (s === 'manual' || s === 'click' || s === 'on_demand') return 'manual';
    return 'on';
  }

  function getAltTitlesEnabled() {
    return Boolean(GM_getValue('alt_titles_enabled', true));
  }

  function getAltTitleMode() {
    const stored = GM_getValue('alt_title_mode', null);
    if (stored === null || stored === undefined || stored === '') {
      return getAltTitlesEnabled() ? 'on' : 'off';
    }
    return normalizeAltTitleMode(stored);
  }

  function setAltTitleMode(mode) {
    const normalized = normalizeAltTitleMode(mode);
    GM_setValue('alt_title_mode', normalized);
    GM_setValue('alt_titles_enabled', normalized !== 'off');
    if (shadowRoot) {
      const altCheckboxes = shadowRoot.querySelectorAll('.yt-alt-titles-setting-checkbox');
      for (const cb of altCheckboxes) {
        cb.checked = normalized === 'on';
      }
      const modeBtns = shadowRoot.querySelectorAll('.yt-alt-title-mode-btn');
      for (const btn of modeBtns) {
        const isAct = btn.getAttribute('data-alt-title-mode') === normalized;
        btn.classList.toggle('active', isAct);
        btn.setAttribute('aria-pressed', isAct ? 'true' : 'false');
      }
    }
    if (typeof refreshAllFeedCardTitles === 'function') {
      refreshAllFeedCardTitles();
    }
    return normalized;
  }

  function setAltTitlesEnabled(val) {
    const enabled = Boolean(val);
    GM_setValue('alt_titles_enabled', enabled);
    GM_setValue('alt_title_mode', enabled ? 'on' : 'off');
    if (shadowRoot) {
      const altCheckboxes = shadowRoot.querySelectorAll('.yt-alt-titles-setting-checkbox');
      for (const cb of altCheckboxes) {
        cb.checked = enabled;
      }
      const modeBtns = shadowRoot.querySelectorAll('.yt-alt-title-mode-btn');
      for (const btn of modeBtns) {
        const isAct = btn.getAttribute('data-alt-title-mode') === (enabled ? 'on' : 'off');
        btn.classList.toggle('active', isAct);
        btn.setAttribute('aria-pressed', isAct ? 'true' : 'false');
      }
    }
    if (typeof refreshAllFeedCardTitles === 'function') {
      refreshAllFeedCardTitles();
    }
  }

  // --- FEAT-01: Interactive Timestamp Helpers ---
  function parseTimestampToSeconds(tsStr) {
    const parts = String(tsStr || '').replace(/[\[\]]/g, '').trim().split(':').map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return 0;
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  }

  function formatSecondsToTimestamp(seconds) {
    const clamped = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(clamped / 3600);
    const m = Math.floor((clamped % 3600) / 60);
    const s = clamped % 60;
    const sStr = s < 10 ? `0${s}` : `${s}`;
    if (h > 0) {
      const mStr = m < 10 ? `0${m}` : `${m}`;
      return `${h}:${mStr}:${sStr}`;
    }
    const mStr = m < 10 ? `0${m}` : `${m}`;
    return `${mStr}:${sStr}`;
  }

  function findTranscriptCueIndexForSeconds(cues, targetSec) {
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

  // --- FEAT-02: Per-Channel Auto-Title Allow/Exempt Rules ---
  function normalizeChannelRuleKey(channelName) {
    const cleaned = String(channelName || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (!cleaned || cleaned === '__proto__' || cleaned === 'constructor' || cleaned === 'prototype') {
      return '';
    }
    return cleaned;
  }

  function normalizeChannelTitleRules(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = normalizeChannelRuleKey(k);
      if (!key) continue;
      if (v === 'exempt' || v === 'force_ai') {
        out[key] = v;
      }
    }
    return out;
  }

  function getChannelTitleRules() {
    return normalizeChannelTitleRules(GM_getValue('channel_title_rules', {}));
  }

  function setChannelTitleRule(channelName, rule) {
    const next = getChannelTitleRules();
    const key = normalizeChannelRuleKey(channelName);
    if (!key) return next;
    if (rule === 'exempt' || rule === 'force_ai') {
      next[key] = rule;
    } else {
      delete next[key];
    }
    GM_setValue('channel_title_rules', next);
    if (typeof refreshAllFeedCardTitles === 'function') {
      refreshAllFeedCardTitles();
    }
    return next;
  }

  function resolveAutoTitleDecision(options) {
    const opts = options || {};
    const key = normalizeChannelRuleKey(opts.channelName || '');
    const rule = (key && opts.channelRules && opts.channelRules[key]) || 'default';
    const globalMode =
      opts.altTitleMode !== undefined
        ? normalizeAltTitleMode(opts.altTitleMode)
        : opts.altTitlesEnabled === false
        ? 'off'
        : 'on';

    if (opts.manualOverride === 'ai') {
      return { mode: 'ai', rule, shouldAutoFetchAi: true };
    }
    if (opts.manualOverride === 'dearrow') {
      return { mode: opts.hasDeArrowTitle ? 'dearrow' : 'original', rule, shouldAutoFetchAi: false };
    }
    if (opts.manualOverride === 'original') {
      return { mode: opts.hasDeArrowTitle ? 'dearrow' : 'original', rule, shouldAutoFetchAi: false };
    }

    if (rule === 'exempt') {
      if (opts.isMusic) return { mode: 'music', rule, shouldAutoFetchAi: false };
      return { mode: opts.hasDeArrowTitle ? 'dearrow' : 'original', rule, shouldAutoFetchAi: false };
    }

    if (rule === 'force_ai' && globalMode === 'on') {
      return { mode: 'ai', rule, shouldAutoFetchAi: true };
    }

    if (opts.isMusic) {
      return { mode: 'music', rule, shouldAutoFetchAi: false };
    }
    if (opts.hasDeArrowTitle) {
      return { mode: 'dearrow', rule, shouldAutoFetchAi: false };
    }
    if (globalMode !== 'on') {
      return { mode: 'original', rule, shouldAutoFetchAi: false };
    }
    return { mode: 'ai', rule, shouldAutoFetchAi: true };
  }

  // --- FEAT-03: Summary Persona & Output Format Presets ---
  const SUMMARY_PERSONA_PRESETS = {
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

  function normalizeSummaryPersona(raw) {
    if (raw === 'technical' || raw === 'quiz' || raw === 'chronological' || raw === 'executive') {
      return raw;
    }
    return 'executive';
  }

  function getDefaultSummaryPersona() {
    return normalizeSummaryPersona(GM_getValue('summary_persona', 'executive'));
  }

  function setDefaultSummaryPersona(persona) {
    const normalized = normalizeSummaryPersona(persona);
    GM_setValue('summary_persona', normalized);
    if (shadowRoot) {
      shadowRoot.querySelectorAll('.yt-persona-select, .yt-settings-persona-select').forEach((sel) => {
        if (sel.value !== normalized) sel.value = normalized;
      });
    }
    return normalized;
  }

  function resolveSummaryPersonaInstruction(persona, transcriptMode = 'fast') {
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

  function resolveSummaryPersonaPromptSuffix(persona) {
    const safePersona = normalizeSummaryPersona(persona);
    return SUMMARY_PERSONA_PRESETS[safePersona].promptAppendix;
  }

  function getCachedAltTitle(videoId) {
    if (!videoId) return null;
    if (altTitlesMemoryCache.has(videoId)) return altTitlesMemoryCache.get(videoId);
    const val = GM_getValue('alt_title:' + videoId, null);
    if (val && typeof val === 'string') {
      altTitlesMemoryCache.set(videoId, val);
      return val;
    }
    return null;
  }

  const MAX_ALT_TITLES_CACHE = 500;
  function getAltTitleIndex() {
    const idx = GM_getValue('alt_title_index', {});
    return idx && typeof idx === 'object' && !Array.isArray(idx) ? idx : {};
  }

  function setCachedAltTitle(videoId, title) {
    if (!videoId || !title) return;
    if (altTitlesMemoryCache.size >= MAX_ALT_TITLES_CACHE && !altTitlesMemoryCache.has(videoId)) {
      const oldestKey = altTitlesMemoryCache.keys().next().value;
      if (oldestKey) altTitlesMemoryCache.delete(oldestKey);
    }
    altTitlesMemoryCache.set(videoId, title);
    GM_setValue('alt_title:' + videoId, title);

    const index = Object.assign({}, getAltTitleIndex());
    index[videoId] = Date.now();
    const entries = Object.entries(index);
    if (entries.length > MAX_ALT_TITLES_CACHE) {
      entries.sort((a, b) => a[1] - b[1]);
      let remaining = entries.length;
      for (const [oldId] of entries) {
        if (remaining <= MAX_ALT_TITLES_CACHE) break;
        if (oldId === videoId) continue;
        delete index[oldId];
        altTitlesMemoryCache.delete(oldId);
        GM_deleteValue('alt_title:' + oldId);
        remaining--;
      }
    }
    GM_setValue('alt_title_index', index);
  }

  const MAX_DRAFTS_CACHE = 200;
  function getDraftFollowUp(videoId) {
    if (!videoId) return '';
    const draft = GM_getValue('draft:' + videoId, '');
    return typeof draft === 'string' ? draft : '';
  }

  function setDraftFollowUp(videoId, text) {
    if (!videoId) return;
    const rawIndex = GM_getValue('draft_index', {});
    const index = rawIndex && typeof rawIndex === 'object' && !Array.isArray(rawIndex) ? Object.assign({}, rawIndex) : {};
    if (!text || !text.trim()) {
      GM_deleteValue('draft:' + videoId);
      if (videoId in index) {
        delete index[videoId];
        GM_setValue('draft_index', index);
      }
    } else {
      GM_setValue('draft:' + videoId, text);
      index[videoId] = Date.now();
      const entries = Object.entries(index);
      if (entries.length > MAX_DRAFTS_CACHE) {
        entries.sort((a, b) => a[1] - b[1]);
        let remaining = entries.length;
        for (const [oldId] of entries) {
          if (remaining <= MAX_DRAFTS_CACHE) break;
          if (oldId === videoId) continue;
          delete index[oldId];
          GM_deleteValue('draft:' + oldId);
          remaining--;
        }
      }
      GM_setValue('draft_index', index);
    }
  }

  function clearDraftFollowUp(videoId) {
    if (!videoId) return;
    GM_deleteValue('draft:' + videoId);
    const rawIndex = GM_getValue('draft_index', {});
    if (rawIndex && typeof rawIndex === 'object' && videoId in rawIndex) {
      const next = Object.assign({}, rawIndex);
      delete next[videoId];
      GM_setValue('draft_index', next);
    }
  }

  function normalizeHistoryTabVisibility(val) {
    if (val === 'always' || val === 'with_tabs' || val === 'never') {
      return val;
    }
    return 'always';
  }

  function normalizeHistoryPageScope(val) {
    const s = String(val || '').trim().toLowerCase();
    if (s === 'home_only' || s === 'home' || s === 'feed_only') {
      return 'home_only';
    }
    return 'all_pages';
  }

  function extractYouTubePathAndSearch(pathnameOrUrl) {
    const raw = String(pathnameOrUrl || '').trim();
    if (!raw) return '/';
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        return `${parsed.pathname || '/'}${parsed.search || ''}`;
      } catch (_) {
        return raw;
      }
    }
    return raw.startsWith('/') ? raw : `/${raw}`;
  }

  function isYouTubeVideoPage(pathnameOrUrl) {
    const path = extractYouTubePathAndSearch(pathnameOrUrl).toLowerCase();
    return (
      path.startsWith('/watch') ||
      path.startsWith('/shorts') ||
      path.startsWith('/live') ||
      /[?&]v=[a-z0-9_-]{6,}/i.test(path)
    );
  }

  function isYouTubeHomeFeedPage(pathnameOrUrl) {
    const path = extractYouTubePathAndSearch(pathnameOrUrl).toLowerCase();
    if (isYouTubeVideoPage(path)) return false;
    const pathOnly = path.split('?')[0].split('#')[0] || '/';
    return pathOnly === '/' || pathOnly === '' || pathOnly.startsWith('/feed');
  }

  function getHistoryTabVisibility() {
    return normalizeHistoryTabVisibility(GM_getValue('history_tab_visibility', 'always'));
  }

  function getShowHistoryBottomTab() {
    return GM_getValue('show_history_bottom_tab', true) !== false;
  }

  function setShowHistoryBottomTab(val) {
    const enabled = Boolean(val);
    GM_setValue('show_history_bottom_tab', enabled);
    if (enabled && getHistoryTabVisibility() === 'never') {
      GM_setValue('history_tab_visibility', 'always');
    }
    if (typeof updateDockHistoryTab === 'function') {
      updateDockHistoryTab();
    }
    if (shadowRoot) {
      shadowRoot.querySelectorAll('.yt-show-history-tab-checkbox').forEach((cb) => {
        cb.checked = enabled;
      });
      shadowRoot.querySelectorAll('.yt-history-visibility-select').forEach((s) => {
        s.value = getHistoryTabVisibility();
      });
    }
    return enabled;
  }

  function getHistoryPageScope() {
    return normalizeHistoryPageScope(GM_getValue('history_page_scope', 'all_pages'));
  }

  function setHistoryPageScope(scope) {
    const norm = normalizeHistoryPageScope(scope);
    GM_setValue('history_page_scope', norm);
    if (typeof updateDockHistoryTab === 'function') {
      updateDockHistoryTab();
    }
    if (shadowRoot) {
      shadowRoot.querySelectorAll('.yt-history-scope-select').forEach((s) => {
        if (s.value !== norm) s.value = norm;
      });
      shadowRoot.querySelectorAll('.yt-history-scope-btn').forEach((b) => {
        const isAct = b.getAttribute('data-history-scope') === norm;
        b.classList.toggle('active', isAct);
        b.setAttribute('aria-pressed', isAct ? 'true' : 'false');
      });
    }
    return norm;
  }

  function setHistoryTabVisibility(val) {
    const normalized = normalizeHistoryTabVisibility(val);
    GM_setValue('history_tab_visibility', normalized);
    if (normalized === 'never') {
      GM_setValue('show_history_bottom_tab', false);
    } else if (!getShowHistoryBottomTab()) {
      GM_setValue('show_history_bottom_tab', true);
    }
    if (typeof updateDockHistoryTab === 'function') {
      updateDockHistoryTab();
    }
    if (shadowRoot) {
      const selects = shadowRoot.querySelectorAll('.yt-history-visibility-select');
      for (const s of selects) {
        if (s.value !== normalized) s.value = normalized;
      }
      shadowRoot.querySelectorAll('.yt-show-history-tab-checkbox').forEach((cb) => {
        cb.checked = normalized !== 'never' && getShowHistoryBottomTab();
      });
    }
    return normalized;
  }

  function shouldShowHistoryTab({
    visibility,
    cachedCount,
    activeTabCount,
    showHistoryBottomTab,
    pageScope,
    currentPage,
    isHomeFeedPage
  }) {
    if (showHistoryBottomTab === false) return false;
    const scope = normalizeHistoryPageScope(pageScope);
    if (scope === 'home_only') {
      if (typeof isHomeFeedPage === 'boolean') {
        if (!isHomeFeedPage) return false;
      } else if (typeof currentPage === 'string' && currentPage.trim().length > 0) {
        if (!isYouTubeHomeFeedPage(currentPage)) return false;
      }
    }
    const mode = normalizeHistoryTabVisibility(visibility);
    if (!cachedCount || cachedCount <= 0) return false;
    if (mode === 'never') return false;
    if (mode === 'with_tabs') return (activeTabCount || 0) > 0;
    return true;
  }

  function buildResponseRatingKey(videoId, targetType, targetId = 'main') {
    return `${videoId}:${targetType}:${targetId || 'main'}`;
  }

  function getResponseRatings() {
    const map = GM_getValue('response_ratings', {});
    return map && typeof map === 'object' ? map : {};
  }

  function getResponseRating(videoId, targetType, targetId = 'main') {
    if (!videoId) return null;
    const map = getResponseRatings();
    return map[buildResponseRatingKey(videoId, targetType, targetId)] || null;
  }

  const MAX_RATINGS_CACHE = 500;
  function setResponseRating(videoId, targetType, targetId = 'main', rating, note) {
    if (!videoId) return null;
    const map = Object.assign({}, getResponseRatings());
    const key = buildResponseRatingKey(videoId, targetType, targetId);
    const existing = map[key];

    if (existing && existing.rating === rating && note === undefined) {
      delete map[key];
      GM_setValue('response_ratings', map);
      return null;
    }

    const record = {
      videoId,
      targetType,
      targetId: targetId || 'main',
      rating,
      note: note !== undefined ? note : existing?.note,
      updatedAt: Date.now()
    };
    map[key] = record;
    const keys = Object.keys(map);
    if (keys.length > MAX_RATINGS_CACHE) {
      keys.sort((a, b) => (map[a]?.updatedAt || 0) - (map[b]?.updatedAt || 0));
      let remaining = keys.length;
      for (const oldKey of keys) {
        if (remaining <= MAX_RATINGS_CACHE) break;
        if (oldKey === key) continue;
        delete map[oldKey];
        remaining--;
      }
    }
    GM_setValue('response_ratings', map);
    return record;
  }

  function clampWindowBounds(bounds, viewport, minWidth = 340, minHeight = 300) {
    const vw = Math.max(280, viewport?.width || (typeof window !== 'undefined' ? window.innerWidth : 1280) || 1280);
    const vh = Math.max(320, viewport?.height || (typeof window !== 'undefined' ? window.innerHeight : 800) || 800);
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

  function computeDefaultWindowBounds(viewport, cascadeIndex = 0, preferred = null) {
    const vw = Math.max(280, viewport?.width || (typeof window !== 'undefined' ? window.innerWidth : 1280) || 1280);
    const vh = Math.max(320, viewport?.height || (typeof window !== 'undefined' ? window.innerHeight : 800) || 800);
    const marginX = vw < 400 ? 8 : 16;
    const maxDefaultW = Math.max(240, vw - marginX * 2);
    const minDefaultW = Math.min(360, maxDefaultW);
    const defaultWidth = preferred?.width ?? Math.min(920, Math.max(minDefaultW, vw - (vw < 400 ? 16 : 64)));
    const defaultHeight = preferred?.height ?? Math.min(760, Math.max(Math.min(380, vh - 72), vh - 110));
    const step = vw < 400 ? (Math.max(0, cascadeIndex) % 4) * 12 : (Math.max(0, cascadeIndex) % 5) * 28;
    const baseLeft = preferred?.left ?? Math.max(marginX, Math.round((vw - defaultWidth) / 2) + (vw < 400 ? 0 : step - 28));
    const baseTop = preferred?.top ?? Math.max(12, Math.round((vh - defaultHeight - 44) / 2) + step - (vw < 400 ? 0 : 28));
    return clampWindowBounds({ left: baseLeft, top: baseTop, width: defaultWidth, height: defaultHeight }, { width: vw, height: vh });
  }

  function applyKeyboardWindowAdjustment(bounds, mode, dir, key, shiftKey, viewport, minWidth = 340, minHeight = 300) {
    const step = shiftKey ? 48 : 16;
    let dx = 0;
    let dy = 0;
    if (key === 'ArrowLeft') dx = -step;
    else if (key === 'ArrowRight') dx = step;
    else if (key === 'ArrowUp') dy = -step;
    else if (key === 'ArrowDown') dy = step;
    else return { handled: false, bounds };

    const vw = Math.max(280, viewport?.width || (typeof window !== 'undefined' ? window.innerWidth : 1280) || 1280);
    const vh = Math.max(320, viewport?.height || (typeof window !== 'undefined' ? window.innerHeight : 800) || 800);
    const marginX = vw < 400 ? 8 : 12;
    const effMinW = Math.min(minWidth, Math.max(240, vw - marginX * 2));
    const effMinH = Math.min(minHeight, Math.max(220, vh - 64));

    if (mode === 'move') {
      return {
        handled: true,
        bounds: clampWindowBounds(
          { left: bounds.left + dx, top: bounds.top + dy, width: bounds.width, height: bounds.height },
          viewport,
          minWidth,
          minHeight
        )
      };
    }

    const edge = dir || 'se';
    const next = { ...bounds };
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

  function classifyWindowSizeTier(width) {
    if (width < 540) return 'compact';
    if (width < 780) return 'medium';
    return 'wide';
  }

  function getAdaptiveWindowFlags(width, height) {
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

  function getLastWindowBounds() {
    const raw = GM_getValue('lastWindowBounds', null);
    if (raw && typeof raw === 'object' && typeof raw.width === 'number' && typeof raw.height === 'number') {
      return raw;
    }
    return null;
  }

  function setLastWindowBounds(bounds) {
    if (!bounds || typeof bounds.width !== 'number' || typeof bounds.height !== 'number') return;
    GM_setValue('lastWindowBounds', bounds);
  }

  function getLastHistoryBounds() {
    const raw = GM_getValue('lastHistoryBounds', null);
    if (raw && typeof raw === 'object' && typeof raw.width === 'number' && typeof raw.height === 'number') {
      return raw;
    }
    return null;
  }

  function setLastHistoryBounds(bounds) {
    if (!bounds || typeof bounds.width !== 'number' || typeof bounds.height !== 'number') return;
    GM_setValue('lastHistoryBounds', bounds);
  }

  function getLastQuickMenuBounds() {
    const raw = GM_getValue('lastQuickMenuBounds', null);
    if (raw && typeof raw === 'object' && typeof raw.width === 'number' && typeof raw.height === 'number') {
      return raw;
    }
    return null;
  }

  function setLastQuickMenuBounds(bounds) {
    if (!bounds || typeof bounds.width !== 'number' || typeof bounds.height !== 'number') return;
    GM_setValue('lastQuickMenuBounds', bounds);
  }

  function getLastSettingsBounds() {
    const raw = GM_getValue('lastSettingsBounds', null);
    if (raw && typeof raw === 'object' && typeof raw.width === 'number' && typeof raw.height === 'number') {
      return raw;
    }
    return null;
  }

  function setLastSettingsBounds(bounds) {
    if (!bounds || typeof bounds.width !== 'number' || typeof bounds.height !== 'number') return;
    GM_setValue('lastSettingsBounds', bounds);
  }

  function attachFloatingWindowInteractions({
    box,
    headerEl,
    initialBounds,
    minWidth = 300,
    minHeight = 220,
    ignoreSelector = 'button, a, input, select, .yt-win-header-btns, .yt-win-overflow-menu',
    onSaveBounds = null,
    onApplyBounds = null,
    onFocus = null
  }) {
    const cleanups = [];
    let currentBounds = { ...initialBounds };

    const applyBounds = (nextBounds, commit = false) => {
      const vp = { width: window.innerWidth || 1280, height: window.innerHeight || 800 };
      const clamped = clampWindowBounds(nextBounds, vp, minWidth, minHeight);
      currentBounds = clamped;
      if (typeof onApplyBounds === 'function') {
        onApplyBounds(clamped, commit);
      } else {
        box.style.left = clamped.left + 'px';
        box.style.top = clamped.top + 'px';
        box.style.width = clamped.width + 'px';
        box.style.height = clamped.height + 'px';
      }
      if (commit && typeof onSaveBounds === 'function') {
        onSaveBounds(clamped);
      }
      return clamped;
    };

    const onDownFocus = () => {
      if (typeof onFocus === 'function') onFocus();
    };
    box.addEventListener('mousedown', onDownFocus);
    cleanups.push(() => box.removeEventListener('mousedown', onDownFocus));

    const onHeaderDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(ignoreSelector)) return;
      e.preventDefault();
      if (typeof onFocus === 'function') onFocus();
      const startX = e.clientX;
      const startY = e.clientY;
      const startBounds = { ...currentBounds };
      const onMove = (ev) => {
        applyBounds({
          ...startBounds,
          left: startBounds.left + (ev.clientX - startX),
          top: startBounds.top + (ev.clientY - startY)
        }, false);
      };
      const cleanupDrag = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      const onUp = () => {
        cleanupDrag();
        if (typeof onSaveBounds === 'function') onSaveBounds(currentBounds);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      cleanups.push(cleanupDrag);
    };
    headerEl.addEventListener('mousedown', onHeaderDown);
    cleanups.push(() => headerEl.removeEventListener('mousedown', onHeaderDown));

    const dragGripEl = headerEl.querySelector('.yt-win-drag-grip');
    if (dragGripEl) {
      const onGripKeyDown = (e) => {
        const vp = { width: window.innerWidth || 1280, height: window.innerHeight || 800 };
        const adj = applyKeyboardWindowAdjustment(currentBounds, 'move', null, e.key, e.shiftKey, vp, minWidth, minHeight);
        if (!adj.handled) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (typeof onFocus === 'function') onFocus();
        applyBounds(adj.bounds, true);
      };
      dragGripEl.addEventListener('keydown', onGripKeyDown);
      cleanups.push(() => dragGripEl.removeEventListener('keydown', onGripKeyDown));
    }

    const edges = [
      { dir: 'n', label: 'Resize height from top', orientation: 'horizontal' },
      { dir: 's', label: 'Resize height', orientation: 'horizontal' },
      { dir: 'e', label: 'Resize width', orientation: 'vertical' },
      { dir: 'w', label: 'Resize width from left', orientation: 'vertical' },
      { dir: 'nw', label: 'Resize corner top-left', orientation: 'horizontal' },
      { dir: 'ne', label: 'Resize corner top-right', orientation: 'horizontal' },
      { dir: 'sw', label: 'Resize corner bottom-left', orientation: 'horizontal' },
      { dir: 'se', label: 'Resize summary window', orientation: 'horizontal' }
    ];
    for (const edge of edges) {
      const handle = h('div', {
        className: `yt-resize-handle yt-resize-handle-${edge.dir}`,
        'data-resize-dir': edge.dir,
        role: 'separator',
        tabindex: '0',
        'aria-orientation': edge.orientation,
        'aria-label': edge.label,
        title: 'Drag or focus and press Arrow keys (Shift for larger steps) to resize window'
      });
      const onResizeDown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (typeof onFocus === 'function') onFocus();
        const startX = e.clientX;
        const startY = e.clientY;
        const startBounds = { ...currentBounds };
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 800;
        const marginX = vw < 400 ? 8 : 12;
        const effMinW = Math.min(minWidth, Math.max(220, vw - marginX * 2));
        const effMinH = Math.min(minHeight, Math.max(180, vh - 64));

        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          const next = { ...startBounds };
          if (edge.dir.includes('e')) next.width = startBounds.width + dx;
          if (edge.dir.includes('s')) next.height = startBounds.height + dy;
          if (edge.dir.includes('w')) {
            const maxWFromLeft = startBounds.width + Math.max(0, startBounds.left - marginX);
            const proposedW = Math.max(effMinW, Math.min(maxWFromLeft, startBounds.width - dx));
            next.width = proposedW;
            next.left = startBounds.left + (startBounds.width - proposedW);
          }
          if (edge.dir.includes('n')) {
            const maxHFromTop = startBounds.height + Math.max(0, startBounds.top - 12);
            const proposedH = Math.max(effMinH, Math.min(maxHFromTop, startBounds.height - dy));
            next.height = proposedH;
            next.top = startBounds.top + (startBounds.height - proposedH);
          }
          applyBounds(next, false);
        };
        const cleanupResize = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        const onUp = () => {
          cleanupResize();
          if (typeof onSaveBounds === 'function') onSaveBounds(currentBounds);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        cleanups.push(cleanupResize);
      };
      const onResizeKeyDown = (e) => {
        const vp = { width: window.innerWidth || 1280, height: window.innerHeight || 800 };
        const adj = applyKeyboardWindowAdjustment(currentBounds, 'resize', edge.dir, e.key, e.shiftKey, vp, minWidth, minHeight);
        if (!adj.handled) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (typeof onFocus === 'function') onFocus();
        applyBounds(adj.bounds, true);
      };
      handle.addEventListener('mousedown', onResizeDown);
      handle.addEventListener('keydown', onResizeKeyDown);
      cleanups.push(() => {
        handle.removeEventListener('mousedown', onResizeDown);
        handle.removeEventListener('keydown', onResizeKeyDown);
      });
      box.appendChild(handle);
    }

    const onViewportResize = () => applyBounds(currentBounds, false);
    window.addEventListener('resize', onViewportResize);
    cleanups.push(() => window.removeEventListener('resize', onViewportResize));

    return () => {
      for (const fn of cleanups) {
        try { fn(); } catch (_) {}
      }
    };
  }

  // Cache slot calculation
  const CACHE_PREFIXES = ['sum:', 'sut:', 'trn:', 'trt:'];
  const SCOPED_PERSONA_SEGMENTS = ['technical:', 'quiz:', 'chronological:', 'executive:'];

  function extractVideoIdFromCacheKey(key) {
    if (!key || typeof key !== 'string') return '';
    if (!CACHE_PREFIXES.some((p) => key.startsWith(p))) return '';
    const rest = key.slice(4);
    for (const seg of SCOPED_PERSONA_SEGMENTS) {
      if (rest.startsWith(seg)) {
        return rest.slice(seg.length);
      }
    }
    return rest;
  }

  function extractPersonaFromCacheKey(key) {
    if (!key || typeof key !== 'string' || !CACHE_PREFIXES.some((p) => key.startsWith(p))) return 'executive';
    const rest = key.slice(4);
    for (const seg of SCOPED_PERSONA_SEGMENTS) {
      if (rest.startsWith(seg)) {
        return normalizeSummaryPersona(seg.slice(0, -1));
      }
    }
    return 'executive';
  }

  function mk(mode, source, persona = 'executive') {
    if (mode === 'transcript') {
      return source === 'text' ? 'trt:' : 'trn:';
    }
    const safePersona = normalizeSummaryPersona(persona);
    const base = source === 'text' ? 'sut:' : 'sum:';
    return safePersona === 'executive' ? base : `${base}${safePersona}:`;
  }

  function touchCacheIndex(key) {
    const rawIndex = GM_getValue('cache_index', {});
    const index = rawIndex && typeof rawIndex === 'object' && !Array.isArray(rawIndex) ? Object.assign({}, rawIndex) : {};
    index[key] = Date.now();
    const entries = Object.entries(index);
    if (entries.length > CONFIG.cacheMax) {
      entries.sort((a, b) => a[1] - b[1]);
      const openWins = new Set(
        GM_listValues()
          .filter((k) => k.startsWith('win:'))
          .map((k) => k.slice(4))
      );
      let remaining = entries.length;
      for (const [oldKey] of entries) {
        if (remaining <= CONFIG.cacheMax) break;
        if (oldKey === key) continue;
        const id = extractVideoIdFromCacheKey(oldKey) || oldKey.slice(4);
        if (!openWins.has(id)) {
          GM_deleteValue(oldKey);
          delete index[oldKey];
          remaining--;
        }
      }
    }
    GM_setValue('cache_index', index);
  }

  function readCache(videoId, mode, source, skipTouch = false, persona = 'executive') {
    const prefix = mk(mode, source, persona);
    const key = prefix + videoId;
    const entry = GM_getValue(key, null);
    if (entry) {
      if (!skipTouch) touchCacheIndex(key);
      return entry;
    }
    // Also try alternate source if not present
    const altPrefix = mk(mode, source === 'text' ? 'video' : 'text', persona);
    const altKey = altPrefix + videoId;
    const altEntry = GM_getValue(altKey, null);
    if (altEntry) {
      if (!skipTouch) touchCacheIndex(altKey);
      return altEntry;
    }
    return null;
  }

  function writeCache(videoId, mode, source, data, persona = 'executive') {
    const prefix = mk(mode, source, persona);
    const key = prefix + videoId;
    data.videoId = videoId;
    if (mode !== 'transcript') {
      data.persona = normalizeSummaryPersona(persona);
    }
    data.ts = Date.now();
    data.ts2 = Date.now() + Math.random();
    GM_setValue(key, data);
    touchCacheIndex(key);
  }

  function clearAllCache() {
    const openWins = new Set(
      GM_listValues()
        .filter((k) => k.startsWith('win:'))
        .map((k) => k.slice(4))
    );
    const all = GM_listValues();
    for (const k of all) {
      if (CACHE_PREFIXES.some((p) => k.startsWith(p))) {
        const id = extractVideoIdFromCacheKey(k);
        if (!openWins.has(id)) {
          GM_deleteValue(k);
        }
      }
    }
    GM_setValue('cache_index', {});
  }

  function getAllCachedSummaries() {
    const allKeys = GM_listValues();
    const items = [];
    const seenIds = new Set();

    const index = GM_getValue('cache_index', {});
    const sortedKeys = Object.keys(index).sort((a, b) => (index[b] || 0) - (index[a] || 0));

    const fullKeys = [...sortedKeys];
    for (const k of allKeys) {
      if (CACHE_PREFIXES.some((p) => k.startsWith(p)) && !fullKeys.includes(k)) {
        fullKeys.push(k);
      }
    }

    for (const k of fullKeys) {
      if (!CACHE_PREFIXES.some((p) => k.startsWith(p))) continue;
      const videoId = extractVideoIdFromCacheKey(k);
      if (!videoId || seenIds.has(videoId)) continue;

      const entry = GM_getValue(k, null);
      if (entry && entry.text) {
        seenIds.add(videoId);
        const isTranscript = k.startsWith('trn:') || k.startsWith('trt:');
        const isTextSource = k.startsWith('sut:') || k.startsWith('trt:');
        items.push({
          key: k,
          videoId: entry.videoId || videoId,
          title: entry.title || `Video ${videoId}`,
          text: entry.text,
          mode: isTranscript ? 'transcript' : 'summary',
          source: isTextSource ? 'text' : 'video',
          persona: isTranscript ? 'executive' : normalizeSummaryPersona(entry.persona || extractPersonaFromCacheKey(k)),
          model: entry.model || '',
          ts: entry.ts || index[k] || Date.now(),
          turns: entry.turns || [],
          notes: entry.notes || [],
          images: entry.images || null,
          fact: entry.fact || null
        });
      }
    }
    return items;
  }

  function countUniqueCachedVideoIds(allKeys, cacheIndexKeys = []) {
    const seenIds = new Set();
    const combined = [...(Array.isArray(cacheIndexKeys) ? cacheIndexKeys : []), ...(Array.isArray(allKeys) ? allKeys : [])];
    for (let i = 0; i < combined.length; i++) {
      const id = extractVideoIdFromCacheKey(combined[i]);
      if (id) seenIds.add(id);
    }
    return seenIds.size;
  }

  function getCachedSummariesCount() {
    const rawIndex = GM_getValue('cache_index', {});
    const indexKeys = rawIndex && typeof rawIndex === 'object' && !Array.isArray(rawIndex) ? Object.keys(rawIndex) : [];
    const allKeys = GM_listValues();
    return countUniqueCachedVideoIds(allKeys, indexKeys);
  }

  function shouldDeferBackgroundAltTitleFetch(options) {
    const opts = options || {};
    if (opts.hasCachedAltTitle || opts.hasTranscriptInMemoryOrMock || opts.isExplicitCall) {
      return { action: 'fetch_now', reason: opts.isExplicitCall ? 'explicit' : 'zero_network_cache' };
    }
    if (!opts.pageLoadSettled) {
      return { action: 'defer_until_load', reason: 'page_loading' };
    }
    if (opts.isIntersectingViewport === false) {
      return { action: 'observe_visibility', reason: 'offscreen' };
    }
    return { action: 'fetch_now', reason: 'visible_after_load' };
  }

  function decodeBasicEntities(input) {
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

  function extractCaptionTracksFromHtml(html) {
    const src = String(html || '');
    if (!src) return [];
    const markerRe = /"captionTracks"\s*:\s*\[/g;
    let match;
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
        const tracks = parsed
          .filter((t) => t && typeof t.baseUrl === 'string' && t.baseUrl.length > 0)
          .map((t) => ({
            baseUrl: decodeBasicEntities(String(t.baseUrl).replace(/\\u0026/g, '&').replace(/\\\//g, '/')),
            languageCode: String(t.languageCode || '').toLowerCase(),
            kind: String(t.kind || '').toLowerCase()
          }));
        if (tracks.length > 0) {
          return tracks.sort((a, b) => {
            const score = (tr) => {
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

  function parseJson3TranscriptEvents(jsonData) {
    const events = Array.isArray(jsonData?.events) ? jsonData.events : [];
    const segs = [];
    for (const ev of events) {
      if (!ev || !Array.isArray(ev.segs)) continue;
      const text = ev.segs
        .map((s) => String(s?.utf8 || ''))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;
      const startMs = Math.max(0, Math.round(Number(ev.tStartMs) || 0));
      segs.push({ startMs, text });
    }
    return segs;
  }

  function parseXmlTranscriptEvents(xmlText) {
    const xml = String(xmlText || '');
    if (!xml) return [];
    const segs = [];
    const tagRe = /<(?:text|p)\b([^>]*)>([\s\S]*?)<\/(?:text|p)>/gi;
    let m;
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

  const SPONSOR_OR_PROMO_REGEX =
    /\b(?:sponsored\s+by|this\s+video\s+is\s+(?:sponsored|brought\s+to\s+you)\s+by|brought\s+to\s+you\s+by|today'?s\s+sponsor|paid\s+(?:promotion|sponsorship|partnership|collab(?:oration)?)|includes?\s+paid\s+promotion|use\s+(?:code|promo\s+code|coupon)|discount\s+code|promo\s+code|\d+%\s*off\b|patreon\.com|join\s+(?:my|our)\s+patreon|support\s+(?:me|us)\s+on\s+patreon|channel\s+memberships?|check\s+out\s+(?:my|our)\s+merch|merch\s+(?:store|drop|link|shop)|teespring|spreadshirt|affiliate\s+links?|sign\s+up\s+(?:using|with)\s+(?:my|the)\s+link|link\s+in\s+(?:the\s+)?description\s+below|subscribe\s+and\s+hit\s+the\s+bell|NordVPN|Surfshark|Squarespace|Skillshare|Brilliant\.org|Audible|Honey|Raid\s+Shadow\s+Legends)\b/i;

  function isSponsorOrPromoLine(line) {
    const clean = String(line || '').replace(/\s+/g, ' ').trim();
    if (!clean) return false;
    return SPONSOR_OR_PROMO_REGEX.test(clean);
  }

  function stripSponsorAndPromoFromText(rawText) {
    const raw = String(rawText || '');
    if (!raw.trim()) return '';
    const keptLines = [];
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

  function extractDescriptiveTitleFromTranscript(transcriptText) {
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

  function dedupeAdjacentTitleDuplicate(titleText) {
    const clean = String(titleText || '').replace(/\s+/g, ' ').trim();
    if (clean.length < 13) return clean;
    const isSubstantial = (s) => s.length >= 8 || (s.length >= 6 && /\s/.test(s));
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

  function shouldTriggerFeedCardMenuPoll(options) {
    if (!options || options.hitOwnControl || options.inGuideSidebar) return false;
    return Boolean(options.isMenuButton && options.hasVideoId);
  }

  function buildAltTitleModelCandidates(options) {
    const opts = options || {};
    const isTitleTextModel = (m) => {
      const lower = String(m || '').trim().toLowerCase();
      if (!lower) return false;
      return !/(?:ask|transcribe|tts|image|nano-banana|embed|aqa|imagen|veo|audio|live|robotics|computer-use|deep-research|learnlm)/.test(lower);
    };

    const orderedBase = [];
    const pushUnique = (list, model) => {
      const clean = String(model || '').trim();
      if (clean && isTitleTextModel(clean) && !list.includes(clean)) {
        list.push(clean);
      }
    };

    const ladder = Array.isArray(opts.fallbackLadder) ? opts.fallbackLadder : [];
    const factPref = Array.isArray(opts.factPreferred) ? opts.factPreferred : [];
    const textModels = Array.isArray(opts.textModels) ? opts.textModels : [];

    for (const m of ladder) {
      if (!String(m).toLowerCase().includes('pro')) pushUnique(orderedBase, m);
    }
    for (const m of factPref) pushUnique(orderedBase, m);
    for (const m of ladder) pushUnique(orderedBase, m);
    for (const m of textModels) pushUnique(orderedBase, m);

    const avail = Array.isArray(opts.availableModels)
      ? opts.availableModels.map((m) => String(m || '').trim()).filter(Boolean)
      : [];
    if (avail.length === 0) {
      return orderedBase;
    }

    const availSet = new Set(avail);
    const filtered = [];
    for (const m of orderedBase) {
      if (availSet.has(m)) {
        pushUnique(filtered, m);
      } else if (availSet.has(m + '-preview')) {
        pushUnique(filtered, m + '-preview');
      }
    }

    const discovered = avail
      .filter((m) => /^gemini-/i.test(m) && isTitleTextModel(m) && !filtered.includes(m))
      .sort((a, b) => {
        const rank = (name) => {
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

  function isMeaningfulDescriptionForTitle(desc) {
    const nonPromo = stripSponsorAndPromoFromText(desc);
    const cleaned = String(nonPromo || '')
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/(^|\s)#[\w-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.length >= 35;
  }

  function extractWatchMetadataFromPlayerData(playerData) {
    const vd = playerData?.videoDetails || {};
    const mf = playerData?.microformat?.playerMicroformatRenderer || {};
    const title = decodeBasicEntities(String(vd.title || mf.title?.simpleText || '').trim());
    const shortDescription = decodeBasicEntities(String(vd.shortDescription || mf.description?.simpleText || '').trim());
    const author = decodeBasicEntities(String(vd.author || mf.ownerChannelName || '').trim());
    const keywords = Array.isArray(vd.keywords)
      ? vd.keywords.map((k) => String(k || '').trim()).filter(Boolean).slice(0, 15)
      : [];
    return { title, shortDescription, author, keywords };
  }

  function extractWatchMetadataFromHtml(html) {
    const src = String(html || '');
    const empty = {
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
    let keywords = [];

    const vdMarker = /"videoDetails"\s*:\s*\{/g;
    let vdMatch;
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
              ? parsed.keywords.map((k) => String(k || '').trim()).filter(Boolean).slice(0, 15)
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

  function extractGeminiNonThoughtText(parts) {
    if (!Array.isArray(parts)) return '';
    return parts
      .filter((p) => p && !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('')
      .trim();
  }

  function buildFactCheckModelCandidates(options) {
    const opts = options || {};
    const isFactEligible = (m) => {
      const lower = String(m || '').trim().toLowerCase();
      if (!lower) return false;
      return !/(?:ask|transcribe|tts|image|nano-banana|embed|aqa|imagen|veo|audio|live|robotics|computer-use|deep-research|learnlm)/.test(lower);
    };

    const orderedBase = [];
    const pushUnique = (list, model) => {
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
    const resolved = [];
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
        const rank = (name) => {
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

  function parseStoryboardSpecString(specStr) {
    const raw = String(specStr || '').trim();
    if (!raw || !raw.includes('|')) return null;
    const unescaped = raw
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/');
    const parts = unescaped.split('|');
    const baseUrl = (parts[0] || '').trim();
    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) return null;

    const levels = [];
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

  function computeStoryboardFrameInfo(config, seconds) {
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

  function getVideoThumbnailFallbackUrl(videoId, seconds = 0, durationSeconds = 0) {
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

  function parseVisualMarkerToken(rawToken) {
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

  function parseVisualMarkerFromLine(rawLine) {
    const normalized = String(rawLine || '')
      .trim()
      .replace(/^(?:[-*•]\s+|\d+\.\s+)/, '')
      .replace(/^\*\*|\*\*$/g, '')
      .replace(/[.。]+$/, '')
      .trim();
    return parseVisualMarkerToken(normalized);
  }

  function tokenizeSummaryTextWithVisuals(text) {
    const src = String(text || '');
    if (!src.trim()) return [];
    const lines = src.split('\n');
    const segments = [];
    let mdBuffer = [];

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
        let m;
        const foundTokens = [];
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

  function ensureFallbackVisualMarkers(summaryText, maxMarkers = 3) {
    const src = String(summaryText || '').trim();
    if (!src) return '';
    if (/\[\[(?:FRAME|IMG|IMAGE|GEN)\s+[^\]]+\]\]/i.test(src)) {
      return src;
    }

    const limit = Math.max(1, Math.min(6, maxMarkers || 3));
    const lines = src.split('\n');
    const tsPattern = /\[((?:(\d{1,2}):)?(\d{1,2}):(\d{2}))\]/;
    const candidateLines = [];
    const usedSeconds = new Set();

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

    const insertAfter = new Map();
    for (const c of candidateLines) {
      let targetIdx = c.lineIdx;
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

    const out = [];
    for (let i = 0; i < lines.length; i++) {
      out.push(lines[i]);
      if (insertAfter.has(i)) {
        out.push(insertAfter.get(i));
      }
    }
    return out.join('\n');
  }

  function mergeWatchMetadata(videoId, nextMeta) {
    if (!videoId || !nextMeta || typeof nextMeta !== 'object') return;
    const prev = watchMetadataCache.get(videoId) || {};
    watchMetadataCache.set(videoId, {
      title: nextMeta.title || prev.title || '',
      shortDescription: nextMeta.shortDescription || prev.shortDescription || '',
      author: nextMeta.author || prev.author || '',
      keywords: (Array.isArray(nextMeta.keywords) && nextMeta.keywords.length > 0 ? nextMeta.keywords : prev.keywords) || [],
      visitorData: nextMeta.visitorData || prev.visitorData || '',
      innertubeApiKey: nextMeta.innertubeApiKey || prev.innertubeApiKey || '',
      clientVersion: nextMeta.clientVersion || prev.clientVersion || ''
    });
  }

  function deleteCachedVideo(videoId) {
    if (!videoId) return;
    let index = GM_getValue('cache_index', {});
    const allKeys = new Set([...GM_listValues(), ...Object.keys(index)]);
    for (const key of allKeys) {
      if (CACHE_PREFIXES.some((p) => key.startsWith(p)) && extractVideoIdFromCacheKey(key) === videoId) {
        GM_deleteValue(key);
        delete index[key];
      }
    }
    GM_deleteValue('pod:' + videoId);
    GM_setValue('cache_index', index);
  }

  function readPodcastEpisode(videoId) {
    if (!videoId) return null;
    const ep = GM_getValue('pod:' + videoId, null);
    if (!ep || !Array.isArray(ep.turns)) return null;
    return ep;
  }

  function writePodcastEpisode(videoId, episode) {
    if (!videoId || !episode) return;
    GM_setValue('pod:' + videoId, Object.assign({}, episode, { updatedAt: Date.now() }));
  }

  function getDefaultPodcastHostCount() {
    return normalizePodcastHostCount(GM_getValue('podcast_host_count', CONFIG.podcastDefaultHostCount));
  }

  function setDefaultPodcastHostCount(count) {
    const safe = normalizePodcastHostCount(count);
    GM_setValue('podcast_host_count', safe);
    return safe;
  }

  function getPodcastDefaultRate() {
    const val = GM_getValue('podcast_default_rate', 1.0);
    return typeof val === 'number' && Number.isFinite(val) ? Math.max(0.75, Math.min(2.0, val)) : 1.0;
  }

  function setPodcastDefaultRate(r) {
    const val = typeof r === 'number' && Number.isFinite(r) ? Math.max(0.75, Math.min(2.0, Math.round(r * 100) / 100)) : 1.0;
    GM_setValue('podcast_default_rate', val);
    return val;
  }

  function normalizePodcastSynthesisMode(val) {
    const s = String(val || '').trim().toLowerCase();
    if (s === 'webspeech' || s === 'browser') return 'webspeech';
    return 'gemini_tts';
  }

  function getPodcastSynthesisMode() {
    return normalizePodcastSynthesisMode(GM_getValue('podcast_synthesis_mode', 'gemini_tts'));
  }

  function setPodcastSynthesisMode(mode) {
    const norm = normalizePodcastSynthesisMode(mode);
    GM_setValue('podcast_synthesis_mode', norm);
    return norm;
  }

  function getDefaultPodcastHostsConfig() {
    const raw = GM_getValue('podcast_default_hosts', null);
    return buildDefaultPodcastHosts(getDefaultPodcastHostCount(), Array.isArray(raw) ? raw : undefined);
  }

  function setDefaultPodcastHostsConfig(hosts) {
    const normalized = buildDefaultPodcastHosts(
      Array.isArray(hosts) && hosts.length >= 2 ? hosts.length : getDefaultPodcastHostCount(),
      hosts
    );
    GM_setValue('podcast_default_hosts', normalized);
    return normalized;
  }

  function normalizeVoiceInputEngine(val) {
    const s = String(val || '').trim().toLowerCase();
    if (s === 'gemini' || s === 'transcribe') return 'gemini';
    return 'browser';
  }

  function getVoiceInputEngine() {
    return normalizeVoiceInputEngine(GM_getValue('voice_input_engine', 'browser'));
  }

  function setVoiceInputEngine(engine) {
    const norm = normalizeVoiceInputEngine(engine);
    GM_setValue('voice_input_engine', norm);
    return norm;
  }

  function getFollowAlongLock() {
    return GM_getValue('yt_follow_along', true) !== false;
  }

  function setFollowAlongLock(val) {
    const enabled = Boolean(val);
    GM_setValue('yt_follow_along', enabled);
    for (const win of getOpenWindows()) {
      win.followAlong = enabled;
      if (win.transcriptFollowBtn) {
        win.transcriptFollowBtn.classList.toggle('active', enabled);
        win.transcriptFollowBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      }
    }
    return enabled;
  }

  function getContinueAudioOnMinimize() {
    return normalizeContinueAudioOnMinimize(GM_getValue('continue_audio_on_minimize', true));
  }

  function setContinueAudioOnMinimize(val) {
    const enabled = normalizeContinueAudioOnMinimize(val);
    GM_setValue('continue_audio_on_minimize', enabled);
    if (shadowRoot) {
      shadowRoot.querySelectorAll('.yt-continue-audio-minimize-checkbox').forEach((cb) => {
        cb.checked = enabled;
      });
    }
    return enabled;
  }

  function clearAltTitlesCache() {
    const all = GM_listValues();
    let cleared = 0;
    for (const k of all) {
      if (k.startsWith('alt_title:')) {
        GM_deleteValue(k);
        cleared++;
      }
    }
    GM_setValue('alt_title_index', {});
    altTitlesMemoryCache.clear();
    for (const card of document.querySelectorAll('[data-ytais-processed="true"]')) {
      delete card._aiTitle;
    }
    if (typeof refreshAllFeedCardTitles === 'function') {
      refreshAllFeedCardTitles();
    }
    return cleared;
  }

  function resetAllSettings() {
    saveGlobalOpts({ ...DEFAULT_OPTS });
    setAutoStart(false);
    setLastModel(CONFIG.defaultModel);
    setLastSource('video');
    setAppThemeMode('dark');
    setUiAccentColor('');
    resetFormattingPrefs();
    setLastReadabilityTheme(CONFIG.defaultReadabilityTheme || 'system');
    setLastSyncYouTubeTheme(true);
    setAltTitleMode('on');
    GM_setValue('channel_title_rules', {});
    setDefaultSummaryPersona('executive');
    setDefaultPodcastHostCount(CONFIG.podcastDefaultHostCount || 2);
    setPodcastDefaultRate(1.0);
    setPodcastSynthesisMode('gemini_tts');
    setContinueAudioOnMinimize(true);
    GM_deleteValue('podcast_default_hosts');
    setVoiceInputEngine('browser');
    setFollowAlongLock(true);
    setLastTtsVoice(CONFIG.defaultTtsVoice || 'ai:Kore');
    setLastTtsRate(1.0);
    setLastTtsPitch(CONFIG.defaultTtsPitch || 1.0);
    setLastTtsVolume(1.0);
    setShowHistoryBottomTab(true);
    setHistoryPageScope('all_pages');
    setHistoryTabVisibility('always');
    setOutputLanguage('English');
    if (typeof refreshAllFeedCardTitles === 'function') {
      refreshAllFeedCardTitles();
    }
    updateDockHistoryTab();
  }

  // --- MODEL AVAILABILITY CHECK ---
  let modelsCache = GM_getValue('models_cache', {});
  const modelsCheckInFlight = new Map();

  async function checkModelsForKey(keyObj, force = false) {
    if (!keyObj || !keyObj.key) return null;
    const keyId = keyObj.id;
    const now = Date.now();
    if (!force && modelsCache[keyId] && now - modelsCache[keyId].ts < CONFIG.modelCheckTtlMs) {
      return modelsCache[keyId].ids;
    }
    if (!force && modelsCheckInFlight.has(keyId)) {
      return modelsCheckInFlight.get(keyId);
    }

    const reqPromise = (async () => {
      try {
        const ids = [];
        let pageToken = '';
        let url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000';
        do {
          const reqUrl = pageToken ? `${url}&pageToken=${encodeURIComponent(pageToken)}` : url;
          const res = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
              method: 'GET',
              url: reqUrl,
              headers: { 'x-goog-api-key': keyObj.key },
              timeout: 15000,
              onload: (r) => {
                if (r.status >= 200 && r.status < 300) {
                  try {
                    resolve(JSON.parse(r.responseText));
                  } catch (e) {
                    reject(new Error('Invalid JSON from models endpoint'));
                  }
                } else {
                  reject(new Error(`HTTP ${r.status}: ${r.responseText}`));
                }
              },
              ontimeout: () => reject(new Error('Models request timed out')),
              onerror: (e) => reject(new Error('Models request error: ' + (e.error || 'network error')))
            });
          });

          if (res.models && Array.isArray(res.models)) {
            for (const m of res.models) {
              const rawName = m.name ? m.name.replace(/^models\//, '') : '';
              const methods = m.supportedGenerationMethods || [];
              const usable =
                methods.length === 0 ||
                methods.includes('generateContent') ||
                methods.some((meth) => /nteraction/i.test(meth));
              if (rawName && usable) {
                ids.push(rawName);
              }
            }
          }
          pageToken = res.nextPageToken || '';
        } while (pageToken);

        modelsCache[keyId] = { ts: now, ids: ids };
        GM_setValue('models_cache', modelsCache);
        return ids;
      } catch (err) {
        if (CONFIG.debug) console.warn('[YTAIS] checkModelsForKey failed:', err);
        return null;
      } finally {
        modelsCheckInFlight.delete(keyId);
      }
    })();

    modelsCheckInFlight.set(keyId, reqPromise);
    return reqPromise;
  }

  // --- GEMINI API CALLS & ERROR FORMATTING ---
  function apiError(status, text) {
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_) {}

    const err = new Error(parsed?.error?.message || text || `API Error ${status}`);
    err.status = status;
    err.code = status === 429 ? 'QUOTA' : String(status);
    err.raw = text;

    if (parsed?.error?.details && Array.isArray(parsed.error.details)) {
      for (const d of parsed.error.details) {
        if (d['@type']?.includes('RetryInfo') && d.retryDelay) {
          const match = /(\d+)s/.exec(d.retryDelay);
          if (match) err.retryMs = parseInt(match[1], 10) * 1000;
        }
        if (d['@type']?.includes('QuotaFailure') && Array.isArray(d.violations)) {
          err.violations = d.violations.map((v) => `${v.quotaId || ''} · ${v.subject || ''}`);
        }
      }
    }
    return err;
  }

  function callGeminiRaw(model, key, body, timeoutMs = CONFIG.requestTimeoutMs) {
    return new Promise((resolve, reject) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      GM_xmlhttpRequest({
        method: 'POST',
        url: url,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key
        },
        data: JSON.stringify(body),
        timeout: timeoutMs,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            try {
              resolve(JSON.parse(res.responseText));
            } catch (e) {
              reject(new Error('Invalid JSON from Gemini'));
            }
          } else {
            reject(apiError(res.status, res.responseText));
          }
        },
        ontimeout: () => reject(new Error('Gemini request timed out')),
        onerror: (err) => reject(new Error('Gemini network error: ' + (err.error || 'failed')))
      });
    });
  }

  async function callGeminiWithDrops(model, key, makeBody, { requireTools = false, onDrop = null } = {}) {
    let dropMediaRes = false;
    let dropThink = false;
    let dropTools = false;

    for (let attempt = 0; attempt < 4; attempt++) {
      const body = makeBody({ dropMediaRes, dropThink, dropTools });
      try {
        const res = await callGeminiRaw(model, key, body);
        return { res, dropMediaRes, dropThink, dropTools };
      } catch (err) {
        const msg = String(err.message || '').toLowerCase();
        const raw = String(err.raw || '').toLowerCase();
        const combined = msg + ' ' + raw;

        if (err.status === 400 && combined.includes('resolution') && !dropMediaRes) {
          dropMediaRes = true;
          if (onDrop) onDrop('mediaResolution');
          continue;
        }
        if (err.status === 400 && combined.includes('think') && !dropThink) {
          dropThink = true;
          if (onDrop) onDrop('thinking');
          continue;
        }
        if (
          !dropTools &&
          !requireTools &&
          (combined.includes('tool') ||
            combined.includes('search') ||
            combined.includes('ground') ||
            combined.includes('map') ||
            combined.includes('code') ||
            combined.includes('function') ||
            err.status === 429 ||
            err.status === 403)
        ) {
          dropTools = true;
          if (onDrop) onDrop('tools', err.status === 429 ? 'quota' : 'unsupported');
          continue;
        }
        throw err;
      }
    }
  }

  // Interactions API for images
  function callInteractionsRaw(model, key, body, timeoutMs = CONFIG.requestTimeoutMs) {
    return new Promise((resolve, reject) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/interactions`;
      const fullBody = Object.assign({ model }, body);
      GM_xmlhttpRequest({
        method: 'POST',
        url: url,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key
        },
        data: JSON.stringify(fullBody),
        timeout: timeoutMs,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            try {
              resolve(JSON.parse(res.responseText));
            } catch (e) {
              reject(new Error('Invalid JSON from Interactions API'));
            }
          } else {
            reject(apiError(res.status, res.responseText));
          }
        },
        ontimeout: () => reject(new Error('Interactions request timed out')),
        onerror: (err) => reject(new Error('Interactions network error: ' + (err.error || 'failed')))
      });
    });
  }

  // --- STORYBOARD & COMMONS & TRANSCRIPT HELPERS ---
  async function fetchStoryboardSpec(videoId) {
    if (storyboardCache.has(videoId)) return storyboardCache.get(videoId);
    try {
      // 1. Check active watch page player response if inspecting the same video
      if (typeof window !== 'undefined' && window.location?.search?.includes(videoId)) {
        const inlineSpec = window.ytInitialPlayerResponse?.storyboards?.playerStoryboardSpecRenderer?.spec;
        if (typeof inlineSpec === 'string' && inlineSpec.includes('|')) {
          const cfg = parseStoryboardSpecString(inlineSpec);
          if (cfg) {
            storyboardCache.set(videoId, cfg);
            return cfg;
          }
        }
      }

      const res = await fetchWithTimeout(`/watch?v=${encodeURIComponent(videoId)}`, { credentials: 'same-origin' });
      const html = await res.text();
      const match = /"playerStoryboardSpecRenderer"\s*:\s*\{[^}]*"spec"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(html);
      if (!match) return null;
      let specStr = match[1];
      try {
        specStr = JSON.parse(`"${match[1]}"`);
      } catch (_) {}
      const cfg = parseStoryboardSpecString(specStr);
      if (!cfg) return null;
      storyboardCache.set(videoId, cfg);
      return cfg;
    } catch (e) {
      if (CONFIG.debug) console.warn('[YTAIS] fetchStoryboardSpec failed:', e);
      return null;
    }
  }

  function getFrameUrlAndOffset(config, seconds) {
    return computeStoryboardFrameInfo(config, seconds);
  }

  function buildCommonsSchematicSvg(captionText) {
    const title = String(captionText || 'Diagram & Concept Overview').slice(0, 42);
    return hSvg(
      'svg',
      { viewBox: '0 0 420 150', className: 'yt-commons-fallback-svg' },
      hSvg('rect', { x: 0, y: 0, width: 420, height: 150, rx: 8, fill: 'rgba(62,166,255,0.08)' }),
      hSvg('rect', { x: 24, y: 42, width: 102, height: 52, rx: 8, fill: 'rgba(62,166,255,0.16)', stroke: 'rgba(62,166,255,0.55)', 'stroke-width': 1.5 }),
      hSvg('line', { x1: 126, y1: 68, x2: 158, y2: 68, stroke: 'rgba(62,166,255,0.75)', 'stroke-width': 2 }),
      hSvg('rect', { x: 158, y: 34, width: 108, height: 68, rx: 10, fill: 'rgba(129,199,132,0.16)', stroke: 'rgba(129,199,132,0.65)', 'stroke-width': 1.5 }),
      hSvg('line', { x1: 266, y1: 68, x2: 296, y2: 68, stroke: 'rgba(129,199,132,0.75)', 'stroke-width': 2 }),
      hSvg('rect', { x: 296, y: 42, width: 100, height: 52, rx: 8, fill: 'rgba(186,104,200,0.16)', stroke: 'rgba(186,104,200,0.6)', 'stroke-width': 1.5 }),
      hSvg('text', { x: 75, y: 72, 'text-anchor': 'middle', fill: 'currentColor', 'font-size': 11, 'font-weight': 600 }, 'INPUT'),
      hSvg('text', { x: 212, y: 72, 'text-anchor': 'middle', fill: 'currentColor', 'font-size': 11, 'font-weight': 700 }, 'CORE MODEL'),
      hSvg('text', { x: 346, y: 72, 'text-anchor': 'middle', fill: 'currentColor', 'font-size': 11, 'font-weight': 600 }, 'OUTPUT'),
      hSvg('text', { x: 18, y: 128, fill: 'currentColor', opacity: '0.78', 'font-size': 11 }, title)
    );
  }

  function queryCommonsApi(searchQuery) {
    return new Promise((resolve) => {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&origin=*&format=json&generator=search&gsrnamespace=6&gsrlimit=6&gsrsearch=${encodeURIComponent(
        searchQuery
      )}&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=720`;
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 10000,
        onload: (res) => {
          try {
            const data = JSON.parse(res.responseText);
            if (!data?.query?.pages) return resolve(null);
            const pages = Object.values(data.query.pages);
            for (const p of pages) {
              const info = p.imageinfo?.[0];
              const thumbUrl = info?.thumburl || info?.url;
              if (thumbUrl && (info.width >= 200 || info.thumbwidth >= 200 || /\.svg$/i.test(thumbUrl))) {
                const meta = info.extmetadata || {};
                const license = meta.LicenseShortName?.value || 'CC';
                const artist = (meta.Artist?.value || '').replace(/<[^>]+>/g, '').trim() || 'Wikimedia Commons';
                return resolve({
                  thumbUrl,
                  fileUrl: info.descriptionurl || p.fullurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
                  artist,
                  license
                });
              }
            }
            resolve(null);
          } catch (_) {
            resolve(null);
          }
        },
        ontimeout: () => resolve(null),
        onerror: () => resolve(null)
      });
    });
  }

  async function searchCommons(terms) {
    const cleanTerms = String(terms || '').trim();
    if (!cleanTerms) return null;
    const primary = await queryCommonsApi(`${cleanTerms} filetype:bitmap|drawing`);
    if (primary) return primary;
    const stripped = cleanTerms.split(/\s+/).slice(0, 4).join(' ');
    return queryCommonsApi(stripped);
  }

  // YouTube transcript route A & route B
  async function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
    if (typeof AbortController === 'undefined') {
      return fetch(url, opts);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchTranscriptRouteA(videoId) {
    const watchRes = await fetchWithTimeout(`/watch?v=${encodeURIComponent(videoId)}`, { credentials: 'same-origin' });
    const html = await watchRes.text();
    const watchMeta = extractWatchMetadataFromHtml(html);
    mergeWatchMetadata(videoId, watchMeta);

    const endpointMatch = /"getTranscriptEndpoint"\s*:\s*\{\s*"params"\s*:\s*"([^"]+)"/.exec(html);
    const keyMatch = /"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/.exec(html);
    const clientVerMatch = /"INNERTUBE_CONTEXT_CLIENT_VERSION"\s*:\s*"([^"]+)"/.exec(html);
    const pageVisitorData =
      watchMeta.visitorData || (typeof window !== 'undefined' && window.ytcfg?.get?.('VISITOR_DATA')) || '';

    if (endpointMatch && (keyMatch || watchMeta.innertubeApiKey)) {
      try {
        const params = endpointMatch[1];
        const key = keyMatch?.[1] || watchMeta.innertubeApiKey;
        const clientVersion = clientVerMatch ? clientVerMatch[1] : '2.20250101.00.00';
        const clientCtx = {
          clientName: 'WEB',
          clientVersion: clientVersion,
          hl: 'en'
        };
        if (pageVisitorData) clientCtx.visitorData = pageVisitorData;

        const postRes = await fetchWithTimeout(`/youtubei/v1/get_transcript?prettyPrint=false&key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: { client: clientCtx },
            params: params
          })
        });

        if (postRes.ok) {
          const data = await postRes.json();
          const segments = [];

          function walk(node) {
            if (!node || typeof node !== 'object') return;
            if (node.transcriptSegmentRenderer) {
              const seg = node.transcriptSegmentRenderer;
              const startMs = parseInt(seg.startMs, 10) || 0;
              let text = '';
              if (seg.snippet?.runs) {
                text = seg.snippet.runs.map((r) => r.text).join('');
              } else if (seg.snippet?.simpleText) {
                text = seg.snippet.simpleText;
              }
              if (text) {
                segments.push({ startMs, text: text.trim() });
              }
            } else if (node.transcriptCueRenderer) {
              const cue = node.transcriptCueRenderer;
              const startMs = parseInt(cue.startOffsetMs, 10) || 0;
              let text = '';
              if (cue.cue?.runs) {
                text = cue.cue.runs.map((r) => r.text).join('');
              } else if (cue.cue?.simpleText) {
                text = cue.cue.simpleText;
              }
              if (text) {
                segments.push({ startMs, text: text.trim() });
              }
            }
            for (const k of Object.keys(node)) {
              walk(node[k]);
            }
          }

          walk(data);
          if (segments.length > 0) return segments;
        }
      } catch (_) {
        // Fall through to zero-iframe captionTracks timedtext fallback
      }
    }

    async function fetchCaptionTracksSegments(tracks) {
      for (const track of (tracks || []).slice(0, 3)) {
        const rawUrl = decodeBasicEntities(String(track.baseUrl || '').replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
        if (!rawUrl) continue;
        const sep = rawUrl.includes('?') ? '&' : '?';
        try {
          const jsonUrl = rawUrl.includes('fmt=') ? rawUrl : `${rawUrl}${sep}fmt=json3`;
          const capRes = await fetchWithTimeout(jsonUrl, { credentials: 'same-origin' });
          if (capRes.ok) {
            const rawBody = await capRes.text();
            if (rawBody.trim().startsWith('{')) {
              const parsed = JSON.parse(rawBody);
              const jsonSegs = parseJson3TranscriptEvents(parsed);
              if (jsonSegs.length > 0) return jsonSegs;
            } else {
              const xmlSegs = parseXmlTranscriptEvents(rawBody);
              if (xmlSegs.length > 0) return xmlSegs;
            }
          }
        } catch (_) {}

        try {
          const xmlRes = await fetchWithTimeout(rawUrl, { credentials: 'same-origin' });
          if (xmlRes.ok) {
            const xmlText = await xmlRes.text();
            const xmlSegs = parseXmlTranscriptEvents(xmlText);
            if (xmlSegs.length > 0) return xmlSegs;
          }
        } catch (_) {}
      }
      return null;
    }

    // Fallback A2: Zero-iframe captionTracks timedtext JSON3 / XML extraction from watch HTML
    const htmlTracks = extractCaptionTracksFromHtml(html);
    const htmlTrackSegs = await fetchCaptionTracksSegments(htmlTracks);
    if (htmlTrackSegs && htmlTrackSegs.length > 0) return htmlTrackSegs;

    // Fallback A3: Zero-iframe InnerTube player captionTracks (ANDROID then IOS clients)
    const innertubeKey =
      keyMatch?.[1] || watchMeta.innertubeApiKey || (typeof window !== 'undefined' && window.ytcfg?.get?.('INNERTUBE_API_KEY')) || '';
    if (innertubeKey) {
      const playerClients = [
        {
          headers: {
            'Content-Type': 'application/json',
            'X-YouTube-Client-Name': '3',
            'X-YouTube-Client-Version': '20.10.38'
          },
          client: {
            clientName: 'ANDROID',
            clientVersion: '20.10.38',
            androidSdkVersion: 30,
            hl: 'en'
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-YouTube-Client-Name': '5',
            'X-YouTube-Client-Version': '20.10.4'
          },
          client: {
            clientName: 'IOS',
            clientVersion: '20.10.4',
            deviceModel: 'iPhone16,2',
            osName: 'iPhone',
            osVersion: '18.3.2.22D82',
            hl: 'en'
          }
        }
      ];

      for (const spec of playerClients) {
        try {
          const clientPayload = Object.assign({}, spec.client);
          if (pageVisitorData) clientPayload.visitorData = pageVisitorData;
          const playerRes = await fetchWithTimeout(`/youtubei/v1/player?prettyPrint=false&key=${encodeURIComponent(innertubeKey)}`, {
            method: 'POST',
            headers: spec.headers,
            body: JSON.stringify({
              context: { client: clientPayload },
              videoId
            })
          });
          if (!playerRes.ok) continue;
          const playerData = await playerRes.json();
          mergeWatchMetadata(videoId, extractWatchMetadataFromPlayerData(playerData));

          const rawTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (Array.isArray(rawTracks) && rawTracks.length > 0) {
            const sortedTracks = rawTracks
              .filter((t) => t && typeof t.baseUrl === 'string' && t.baseUrl.length > 0)
              .map((t) => ({
                baseUrl: String(t.baseUrl),
                languageCode: String(t.languageCode || '').toLowerCase(),
                kind: String(t.kind || '').toLowerCase()
              }))
              .sort((a, b) => {
                const score = (tr) => {
                  const isEn = tr.languageCode === 'en' || tr.languageCode.startsWith('en-');
                  const isManual = tr.kind !== 'asr';
                  return (isEn ? 4 : 0) + (isManual ? 2 : 0);
                };
                return score(b) - score(a);
              });
            const playerSegs = await fetchCaptionTracksSegments(sortedTracks);
            if (playerSegs && playerSegs.length > 0) return playerSegs;
          }
        } catch (_) {}
      }
    }

    throw new Error('Transcript endpoint markers not found in watch page');
  }

  function muteAndPauseMediaEl(mediaEl) {
    if (!mediaEl) return;
    try {
      mediaEl.autoplay = false;
      mediaEl.defaultMuted = true;
      mediaEl.muted = true;
      mediaEl.volume = 0;
      if (typeof mediaEl.removeAttribute === 'function') {
        mediaEl.removeAttribute('autoplay');
      }
      if (!mediaEl.paused && typeof mediaEl.pause === 'function') {
        mediaEl.pause();
      }
    } catch (_) {}
  }

  function silenceWatchDocumentMedia(win, doc) {
    if (!doc) return;
    try {
      const proto = win?.HTMLMediaElement?.prototype;
      if (proto && !win.__ytaisPlayBlocked) {
        win.__ytaisPlayBlocked = true;
        proto.play = function () {
          muteAndPauseMediaEl(this);
          return Promise.resolve();
        };
      }
    } catch (_) {}

    try {
      if (!doc.__ytaisMediaListenersAttached && typeof doc.addEventListener === 'function') {
        doc.__ytaisMediaListenersAttached = true;
        const onMediaEvent = (ev) => {
          const t = ev?.target;
          if (t && (t.tagName === 'VIDEO' || t.tagName === 'AUDIO')) {
            muteAndPauseMediaEl(t);
          }
        };
        for (const evtName of ['play', 'playing', 'loadedmetadata', 'canplay', 'volumechange']) {
          doc.addEventListener(evtName, onMediaEvent, true);
        }
      }
    } catch (_) {}

    try {
      const mediaEls = doc.querySelectorAll('video, audio');
      for (const el of mediaEls) {
        muteAndPauseMediaEl(el);
      }
      const player = doc.getElementById('movie_player') || doc.querySelector('.html5-video-player');
      if (player) {
        if (typeof player.mute === 'function') player.mute();
        if (typeof player.pauseVideo === 'function') player.pauseVideo();
      }
    } catch (_) {}
  }

  function attachIframeMediaSilencer(iframe) {
    if (!iframe) return () => {};
    let stopped = false;
    const sweep = () => {
      if (stopped) return;
      try {
        const win = iframe.contentWindow;
        const doc = iframe.contentDocument || win?.document;
        if (doc) silenceWatchDocumentMedia(win, doc);
      } catch (_) {}
    };
    const onLoad = () => sweep();
    iframe.addEventListener('load', onLoad, true);
    const earlyInterval = setInterval(sweep, 25);
    sweep();
    return () => {
      stopped = true;
      clearInterval(earlyInterval);
      iframe.removeEventListener('load', onLoad, true);
    };
  }

  async function fetchTranscriptRouteB(videoId, signal) {
    return new Promise((resolve, reject) => {
      const iframe = h('iframe', {
        src: `/watch?v=${encodeURIComponent(videoId)}`,
        title: 'Transcript helper',
        allow: "autoplay 'none'",
        style: 'position: fixed; left: -20000px; width: 1400px; height: 900px; opacity: 0; pointer-events: none;'
      });

      let timer = null;
      let cleaned = false;
      let stopSilencer = null;

      function cleanup() {
        if (cleaned) return;
        cleaned = true;
        if (stopSilencer) {
          stopSilencer();
          stopSilencer = null;
        }
        if (timer) clearInterval(timer);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }

      if (signal) {
        signal.addEventListener('abort', () => {
          cleanup();
          reject(new Error('Aborted'));
        });
      }

      document.documentElement.appendChild(iframe);
      stopSilencer = attachIframeMediaSilencer(iframe);

      iframe.onload = () => {
        try {
          const initDoc = iframe.contentDocument || iframe.contentWindow?.document;
          silenceWatchDocumentMedia(iframe.contentWindow, initDoc);
        } catch (_) {}
        let attempts = 0;
        let clicked = false;
        timer = setInterval(() => {
          attempts++;
          if (attempts > 40) {
            cleanup();
            return reject(new Error('Transcript panel timed out (Route B)'));
          }
          try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!doc) return;
            silenceWatchDocumentMedia(iframe.contentWindow, doc);

            if (!clicked) {
              const btn =
                doc.querySelector('ytd-video-description-transcript-section-renderer button[aria-label]') ||
                doc.querySelector('chip-view-model button[aria-label="Transcript"]');
              if (btn) {
                btn.click();
                clicked = true;
              } else if (attempts > 20) {
                cleanup();
                return reject(new Error('No transcript button on video page'));
              }
            }

            const panel = doc.querySelector(
              'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"], ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]'
            );
            if (panel) {
              const text = panel.innerText || '';
              const lines = text
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean);
              const segs = [];
              let currentTs = '';
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const tsMatch = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(line);
                if (tsMatch) {
                  currentTs = line;
                } else if (currentTs) {
                  const parts = currentTs.split(':').map(Number);
                  let sec = 0;
                  if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
                  else sec = parts[0] * 60 + parts[1];
                  segs.push({ startMs: sec * 1000, text: line });
                  currentTs = '';
                } else {
                  // inline timestamp like "0:05 hello"
                  const inlineMatch = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.+)$/.exec(line);
                  if (inlineMatch) {
                    const tsStr = line.split(/\s+/)[0];
                    const parts = tsStr.split(':').map(Number);
                    let sec = 0;
                    if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
                    else sec = parts[0] * 60 + parts[1];
                    segs.push({ startMs: sec * 1000, text: inlineMatch[4] });
                  }
                }
              }
              if (segs.length >= 2) {
                cleanup();
                return resolve(segs);
              }
            }
          } catch (e) {
            // ignore cross-origin or transient
          }
        }, 60);
      };

      iframe.onerror = () => {
        cleanup();
        reject(new Error('Iframe load error in Route B'));
      };
    });
  }

  function formatTime(seconds) {
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (hrs > 0) {
      return `${hrs}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }

  async function getTranscriptText(videoId, retries = 0, signal = null, options = {}) {
    if (transcriptCache.has(videoId)) return transcriptCache.get(videoId);
    const { allowIframeFallback = true } = options || {};

    let lastErr = null;
    for (let att = 0; att <= retries; att++) {
      try {
        const segs = await fetchTranscriptRouteA(videoId);
        const lines = segs.map((s) => `[${formatTime(s.startMs / 1000)}] ${s.text}`);
        let full = lines.join('\n');
        if (full.length > CONFIG.maxTranscriptChars) {
          full = full.slice(0, CONFIG.maxTranscriptChars) + '\n[...truncated...]';
        }
        transcriptCache.set(videoId, full);
        return full;
      } catch (errA) {
        lastErr = errA;
        if (!allowIframeFallback) {
          break;
        } else {
          try {
            const segs = await fetchTranscriptRouteB(videoId, signal);
            const lines = segs.map((s) => `[${formatTime(s.startMs / 1000)}] ${s.text}`);
            let full = lines.join('\n');
            if (full.length > CONFIG.maxTranscriptChars) {
              full = full.slice(0, CONFIG.maxTranscriptChars) + '\n[...truncated...]';
            }
            transcriptCache.set(videoId, full);
            return full;
          } catch (errB) {
            lastErr = errB;
          }
        }
      }
      if (att < retries) {
        await new Promise((r) => setTimeout(r, 1500 * (att + 1)));
      }
    }
    const err = new Error(
      `Couldn't get this video's transcript (it may have no captions, or be age-restricted/unavailable): ${lastErr?.message || 'failed'}`
    );
    err.code = 'TRANSCRIPT';
    throw err;
  }

  // --- YOUTUBE ASK SEMAPHORE & PROVIDER (§12) ---
  class AskSemaphore {
    constructor(max) {
      this.max = max;
      this.current = 0;
      this.queue = [];
    }

    async acquire() {
      if (this.current < this.max) {
        this.current++;
        return;
      }
      await new Promise((resolve) => this.queue.push(resolve));
      this.current++;
    }

    release() {
      this.current--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }

  const askLimiter = new AskSemaphore(CONFIG.askConcurrency);

  function domToMarkdown(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.replace(/\s+/g, ' ');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node;
    const tag = el.tagName.toLowerCase();
    if (
      [
        'button',
        'svg',
        'img',
        'style',
        'script',
        'noscript',
        'yt-icon',
        'yt-touch-feedback-shape'
      ].includes(tag) ||
      el.getAttribute('aria-hidden') === 'true' ||
      el.style.display === 'none'
    ) {
      return '';
    }

    const childrenMd = Array.from(el.childNodes)
      .map(domToMarkdown)
      .join('');

    if (tag === 'h1' || tag === 'h2') return `\n\n## ${childrenMd.trim()}\n\n`;
    if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return `\n\n### ${childrenMd.trim()}\n\n`;
    if (tag === 'p') return `\n\n${childrenMd.trim()}\n\n`;
    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return `**${childrenMd.trim()}**`;
    if (tag === 'em' || tag === 'i') return `*${childrenMd.trim()}*`;
    if (tag === 'code') return `\`${childrenMd.trim()}\``;
    if (tag === 'pre') return `\n\`\`\`\n${childrenMd.trim()}\n\`\`\`\n`;
    if (tag === 'li') return `\n- ${childrenMd.trim()}`;
    if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      const text = childrenMd.trim();
      const tsMatch = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(text);
      if (tsMatch) return `[${text}]`;
      let finalHref = href;
      if (finalHref.includes('/redirect?q=')) {
        const u = new URL(finalHref, window.location.origin);
        finalHref = u.searchParams.get('q') || finalHref;
      }
      return `[${text}](${finalHref})`;
    }
    if (tag === 'tr') {
      const cells = Array.from(el.children).map((c) => domToMarkdown(c).trim());
      return `\n- ${cells.join(' | ')}`;
    }
    return childrenMd;
  }

  async function runYouTubeAsk(videoId, prompt, { isSummary = true, signal = null, onPhase = null } = {}) {
    await askLimiter.acquire();
    const prevActive = document.activeElement;
    let iframe = null;
    let stopSilencer = null;

    try {
      if (onPhase) onPhase('Connecting to YouTube Ask…');
      iframe = h('iframe', {
        src: `/watch?v=${encodeURIComponent(videoId)}`,
        title: 'YouTube Ask helper (hidden)',
        allow: "autoplay 'none'",
        style: 'position: fixed; left: -20000px; width: 1400px; height: 900px; opacity: 0; pointer-events: none;'
      });
      document.documentElement.appendChild(iframe);
      stopSilencer = attachIframeMediaSilencer(iframe);

      const res = await new Promise((resolve, reject) => {
        let abortHandler = () => {
          reject(new Error('Ask job was cancelled'));
        };
        if (signal) signal.addEventListener('abort', abortHandler);

        const startTime = Date.now();
        let step = 'find_button';
        let askBtnClicked = false;
        let baselineItems = -1;
        let baselineTime = 0;
        let sentMethod = '';
        let questionSentTime = 0;
        let lastAnswerText = '';
        let lastChangeTime = 0;
        let formSubmitted = false;

        const interval = setInterval(() => {
          if (signal?.aborted) {
            clearInterval(interval);
            return reject(new Error('Ask job was cancelled'));
          }

          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!doc) return;

          // Mute and pause any video/audio playing in helper frame
          silenceWatchDocumentMedia(iframe.contentWindow, doc);

          const elapsed = Date.now() - startTime;

          // STEP 1: Find visible Ask button (not the player fullscreen decoy) or detect if panel is already open
          if (step === 'find_button') {
            if (elapsed > CONFIG.askLoadMs) {
              clearInterval(interval);
              const err = new Error(
                "YouTube's Ask button didn't appear in this video. Ask requires being signed in to a Google account with YouTube experiment access. Try selecting a Gemini model with an API key."
              );
              err.code = 'ASK';
              return reject(err);
            }

            // Check if engagement panel is already open and visible in the page
            const existingPanel = doc.querySelector(
              'ytd-engagement-panel-section-list-renderer[target-id="PAyouchat"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]'
            );
            if (existingPanel && (existingPanel.offsetWidth > 0 || existingPanel.offsetHeight > 0 || existingPanel.getClientRects().length > 0)) {
              askBtnClicked = true;
              step = 'wait_panel';
              if (onPhase) onPhase('Ask panel detected, preparing…');
              return;
            }

            // Inspect element matchers from YouTube feeds and watch page:
            // 1. Below video in action bar (#top-level-buttons-computed .you-chat-entrypoint-button button)
            // 2. In video description section (yt-video-description-youchat-section-view-model .you-chat-entrypoint-button button)
            // 3. Flexible buttons container, aria-label="Ask" or aria-label="Ask questions"
            const selectors = [
              '#top-level-buttons-computed .you-chat-entrypoint-button button',
              '#flexible-item-buttons .you-chat-entrypoint-button button',
              'yt-video-description-youchat-section-view-model .you-chat-entrypoint-button button',
              'yt-video-description-youchat-section-view-model button',
              '.you-chat-entrypoint-button button',
              'button[aria-label="Ask" i]',
              'button[aria-label="Ask questions" i]',
              'button[aria-label*="Ask" i]',
              '[aria-label*="Ask" i] button'
            ];
            let targetBtn = null;
            for (const sel of selectors) {
              const buttons = Array.from(doc.querySelectorAll(sel));
              for (const b of buttons) {
                if (b.closest('.html5-video-player')) continue; // Skip hidden player decoy!
                if (b.offsetWidth > 0 || b.offsetHeight > 0 || b.getClientRects().length > 0) {
                  targetBtn = b;
                  break;
                }
              }
              if (targetBtn) break;
            }

            if (!targetBtn) {
              // check if one inside ytd-watch-metadata or description
              const fallbackBtns = Array.from(doc.querySelectorAll('.you-chat-entrypoint-button button, button[aria-label*="Ask" i]'));
              for (const b of fallbackBtns) {
                if (!b.closest('.html5-video-player')) {
                  targetBtn = b;
                  break;
                }
              }
            }

            if (targetBtn && !askBtnClicked) {
              targetBtn.click();
              askBtnClicked = true;
              step = 'wait_panel';
              if (onPhase) onPhase('Opening Ask panel…');
            }
          }

          // STEP 2: Wait for panel and textarea
          else if (step === 'wait_panel') {
            const panel = doc.querySelector(
              'ytd-engagement-panel-section-list-renderer[target-id="PAyouchat"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"], #chat-container'
            );
            const ta = doc.querySelector('textarea.chatInputViewModelChatInput, textarea[placeholder*="Ask"]');
            if (panel && ta) {
              step = 'wait_baseline';
              if (onPhase) onPhase('Waiting for Ask ready…');
            }
          }

          // STEP 3: Baseline items stability
          else if (step === 'wait_baseline') {
            const items = doc.querySelectorAll('you-chat-item-view-model, .chat-item');
            const count = items.length;
            if (baselineItems !== count) {
              baselineItems = count;
              baselineTime = Date.now();
            } else if (Date.now() - baselineTime >= 1200) {
              step = 'send_ladder';
              if (onPhase) onPhase('Sending question to Ask…');
            }
          }

          // STEP 4: Send Ladder
          else if (step === 'send_ladder') {
            const ta = doc.querySelector('textarea.chatInputViewModelChatInput, textarea[placeholder*="Ask"]');
            const form = doc.querySelector('.chatInputViewModelChatInputForm, form');
            const sendBtn = doc.querySelector('.chatInputViewModelChatInputForm button[aria-label="Send"], button[aria-label="Send"]');

            if (!ta) return;

            // Check if question appeared
            const promptLead = prompt.slice(0, 40);
            const currentItems = Array.from(doc.querySelectorAll('you-chat-item-view-model, .chat-item'));
            const questionItem = currentItems.find((it) => it.textContent.includes(promptLead));

            if (questionItem || (baselineItems >= 0 && currentItems.length > baselineItems + 1)) {
              step = 'wait_answer';
              questionSentTime = Date.now();
              lastChangeTime = Date.now();
              if (onPhase) onPhase('Ask is generating answer…');
              return;
            }

            if (!sentMethod) {
              sentMethod = 'typing';
              try {
                iframe.contentWindow?.focus();
                ta.focus();
                ta.select();
                const inserted = doc.execCommand('insertText', false, prompt);
                if (!inserted || ta.value !== prompt) {
                  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                  if (nativeSetter) nativeSetter.call(ta, prompt);
                  else ta.value = prompt;
                  ta.dispatchEvent(new Event('input', { bubbles: true }));
                }
              } catch (_) {}
            }

            const sendEnabled = sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true';

            if (sentMethod === 'typing' && sendEnabled) {
              sendBtn.click();
              sentMethod = 'clicked_send';
              return;
            }

            // If 2.5s passed after typing and not sent, try input events
            if (Date.now() - (baselineTime + 1200) > 2500 && sentMethod === 'typing') {
              sentMethod = 'events';
              try {
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                if (nativeSetter) nativeSetter.call(ta, prompt);
                else ta.value = prompt;
                ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
                ta.dispatchEvent(new Event('change', { bubbles: true }));
                ta.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
              } catch (_) {}
            }

            if (sentMethod === 'events' && sendEnabled) {
              sendBtn.click();
              sentMethod = 'clicked_send_events';
              return;
            }

            // Try enter keydown
            if (Date.now() - (baselineTime + 1200) > 5000 && sentMethod === 'events') {
              sentMethod = 'enter';
              ta.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
            }

            // Try form submit event (NEVER requestSubmit!)
            if (Date.now() - (baselineTime + 1200) > 7500 && sentMethod === 'enter' && !formSubmitted) {
              sentMethod = 'submit';
              formSubmitted = true;
              if (form) {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
              }
            }

            // Try forced click
            if (Date.now() - (baselineTime + 1200) > 10000 && sentMethod === 'submit') {
              sentMethod = 'forced_click';
              if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.removeAttribute('aria-disabled');
                sendBtn.click();
              }
            }

            // For summary, try chips
            if (Date.now() - (baselineTime + 1200) > 12500 && isSummary && sentMethod === 'forced_click') {
              sentMethod = 'chips';
              const chips = Array.from(doc.querySelectorAll('button.ytwYouChatChipsDataChip, .chat-chip, yt-chip-cloud-chip-renderer button'));
              const sumChip = chips.find((c) => /summari[sz]e/i.test(c.textContent || ''));
              if (sumChip) {
                sumChip.click();
              }
            }

            // Timeout send ladder
            if (Date.now() - (baselineTime + 1200) > 16000) {
              clearInterval(interval);
              console.warn('Ask: could not send the prompt', {
                tried: sentMethod,
                textareaChars: ta.value.length,
                send: { disabled: sendBtn?.disabled, ariaDisabled: sendBtn?.getAttribute('aria-disabled') },
                formFound: Boolean(form),
                htmlSnippet: doc.querySelector('yt-chat-input-view-model, .chat-input-view')?.outerHTML?.slice(0, 2500)
              });
              const err = new Error(
                `Ask's Send button never became available (tried: ${sentMethod}). Details were written to the browser console. Try selecting a Gemini model.`
              );
              err.code = 'ASK';
              return reject(err);
            }
          }

          // STEP 5: Wait for answer
          else if (step === 'wait_answer') {
            if (Date.now() - questionSentTime > CONFIG.askAnswerMs) {
              clearInterval(interval);
              return reject(new Error('Ask answer generation timed out'));
            }

            const items = Array.from(doc.querySelectorAll('you-chat-item-view-model, .chat-item'));
            const promptLead = prompt.slice(0, 40);
            let qIdx = items.findIndex((it) => it.textContent.includes(promptLead));
            if (qIdx === -1 && Date.now() - questionSentTime > 8000) {
              qIdx = baselineItems >= 0 ? baselineItems : 0;
            }

            const answerItems = qIdx >= 0 ? items.slice(qIdx + 1) : items;
            let ansNode = null;
            for (let i = answerItems.length - 1; i >= 0; i--) {
              const mdDiv = answerItems[i].querySelector('markdown-div, .markdown-content');
              if (mdDiv) {
                ansNode = mdDiv;
                break;
              }
            }

            if (!ansNode && answerItems.length > 0) {
              ansNode = answerItems[answerItems.length - 1];
            }

            const isBusy = doc.querySelector('yt-item-section-renderer[data-target-id="youchat_messages_section"][aria-busy="true"]');

            if (ansNode) {
              const currentText = ansNode.innerText || ansNode.textContent || '';
              if (currentText !== lastAnswerText) {
                lastAnswerText = currentText;
                lastChangeTime = Date.now();
              } else if (currentText.length > 30 && !isBusy && Date.now() - lastChangeTime >= CONFIG.askStableMs) {
                clearInterval(interval);
                const markdown = domToMarkdown(ansNode);
                resolve({
                  text: markdown.trim(),
                  note: isSummary && sentMethod === 'chips' ? 'ℹ Used YouTube Ask summary chip (sponsor filter not applied).' : null
                });
              }
            }
          }
        }, 100);
      });

      return res;
    } finally {
      if (stopSilencer) {
        try {
          stopSilencer();
        } catch (_) {}
        stopSilencer = null;
      }
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      askLimiter.release();
      if (prevActive && typeof prevActive.focus === 'function') {
        try {
          prevActive.focus();
        } catch (_) {}
      }
    }
  }

  // --- MARKDOWN RENDERER (DOM-BUILDING, NO INNERHTML) ---
  function renderMarkdownToDom(text, win, onSeek) {
    const richEnabled = getGeneratedTextPrefs().richFormatting !== false;
    const container = h('div', { className: `yt-markdown-body ${richEnabled ? 'yt-md-rich' : 'yt-md-plain'}` });
    if (!text) return container;

    // Normalise visual markers onto their own lines
    const normalised = text.replace(/(\[\[(?:FRAME|IMG|GEN|IMAGE)[^\]]+\]\])/g, '\n$1\n');
    const lines = normalised.split('\n');

    let currentList = null;
    let listType = null;
    let visualCount = 0;
    let genCount = 0;

    function flushList() {
      if (currentList) {
        container.appendChild(currentList);
        currentList = null;
        listType = null;
      }
    }

    function parseInline(str) {
      const frag = document.createDocumentFragment();
      const rawFormatted = formatMathSymbolsInText(str || '');
      if (!richEnabled) {
        const plainTsRegex = /\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]/g;
        let pLastIdx = 0;
        let pMatch;
        const stripped = rawFormatted
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1')
          .replace(/`([^`]+)`/g, '$1');
        while ((pMatch = plainTsRegex.exec(stripped)) !== null) {
          if (pMatch.index > pLastIdx) {
            frag.appendChild(document.createTextNode(stripped.slice(pLastIdx, pMatch.index)));
          }
          const fullTs = pMatch[0];
          const tsText = fullTs.slice(1, -1);
          const parts = tsText.split(':').map(Number);
          const sec = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
          frag.appendChild(
            h(
              'a',
              {
                className: 'yt-ts-link',
                href: `/watch?v=${encodeURIComponent(win.videoId)}&t=${sec}s`,
                title: `Jump to ${tsText}`,
                onclick: (e) => {
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                    e.preventDefault();
                    if (onSeek) onSeek(sec);
                  }
                }
              },
              fullTs
            )
          );
          pLastIdx = plainTsRegex.lastIndex;
        }
        if (pLastIdx < stripped.length) {
          frag.appendChild(document.createTextNode(stripped.slice(pLastIdx)));
        }
        return frag;
      }
      const formatted = rawFormatted;
      // Match inline tokens: bold, italic, code, link, timestamp [mm:ss]
      const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
      let lastIdx = 0;
      let match;

      while ((match = tokenRegex.exec(formatted)) !== null) {
        if (match.index > lastIdx) {
          frag.appendChild(document.createTextNode(formatted.slice(lastIdx, match.index)));
        }
        const full = match[0];
        if (full.startsWith('**') && full.endsWith('**')) {
          frag.appendChild(h('strong', {}, full.slice(2, -2)));
        } else if (full.startsWith('*') && full.endsWith('*')) {
          frag.appendChild(h('em', {}, full.slice(1, -1)));
        } else if (full.startsWith('`') && full.endsWith('`')) {
          frag.appendChild(h('code', {}, full.slice(1, -1)));
        } else if (match[2] !== undefined || (match[3] !== undefined && match[4] !== undefined)) {
          // Timestamp [mm:ss] or [h:mm:ss]
          const tsText = full.slice(1, -1);
          const parts = tsText.split(':').map(Number);
          let sec = 0;
          if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
          else sec = parts[0] * 60 + parts[1];

          const a = h(
            'a',
            {
              className: 'yt-ts-link',
              href: `/watch?v=${encodeURIComponent(win.videoId)}&t=${sec}s`,
              title: `Jump to ${tsText}`,
              onclick: (e) => {
                if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                  e.preventDefault();
                  if (onSeek) onSeek(sec);
                }
              }
            },
            full
          );
          frag.appendChild(a);
        } else if (match[5] && match[6]) {
          // Link [text](url)
          frag.appendChild(
            h(
              'a',
              {
                href: match[6],
                target: '_blank',
                rel: 'noopener noreferrer',
                className: 'yt-ext-link'
              },
              match[5]
            )
          );
        }
        lastIdx = tokenRegex.lastIndex;
      }

      if (lastIdx < formatted.length) {
        frag.appendChild(document.createTextNode(formatted.slice(lastIdx)));
      }
      return frag;
    }

    const appendVisualCard = (marker) => {
      if (!marker) return false;
      if (marker.kind === 'frame') {
        if (!win.opts.img || visualCount >= CONFIG.maxVisuals) return false;
        visualCount++;
        const tsText = marker.tsStr;
        const sec = marker.seconds;
        const caption = marker.caption || `Video frame at ${tsText}`;

        const card = h('div', { className: 'yt-visual-card yt-frame-card' });
        const previewBox = h('div', {
          className: 'yt-frame-preview',
          title: `Play at ${tsText}`,
          onclick: () => onSeek && onSeek(sec)
        });

        // Always render public YouTube frame still immediately so the 16:9 card never appears blank
        const fallbackUrl = getVideoThumbnailFallbackUrl(win.videoId, sec);
        let fallbackImg = null;
        if (fallbackUrl) {
          fallbackImg = h('img', {
            src: fallbackUrl,
            alt: caption,
            className: 'yt-frame-fallback-img',
            loading: 'lazy',
            onerror: () => {
              if (fallbackImg && !fallbackImg.dataset.retried) {
                fallbackImg.dataset.retried = '1';
                fallbackImg.src = `https://i.ytimg.com/vi/${encodeURIComponent(win.videoId)}/hqdefault.jpg`;
              }
            }
          });
          previewBox.appendChild(fallbackImg);
        }

        const badge = h('div', { className: 'yt-frame-badge' }, `▶ ${tsText}`);
        previewBox.appendChild(badge);
        card.appendChild(previewBox);
        card.appendChild(h('div', { className: 'yt-visual-caption' }, caption));
        container.appendChild(card);

        // Upgrade preview box with exact timestamp frame from storyboard sprite if available
        fetchStoryboardSpec(win.videoId).then((cfg) => {
          if (!cfg) return;
          const info = getFrameUrlAndOffset(cfg, sec);
          const probe = new Image();
          probe.onload = () => {
            previewBox.style.backgroundImage = `url("${info.url}")`;
            previewBox.style.backgroundSize = info.bgSize;
            previewBox.style.backgroundPosition = `${info.bgPosX} ${info.bgPosY}`;
            previewBox.style.backgroundRepeat = 'no-repeat';
            if (fallbackImg) {
              fallbackImg.style.opacity = '0';
              fallbackImg.style.pointerEvents = 'none';
            }
          };
          probe.src = info.url;
        });
        return true;
      }

      if (marker.kind === 'img') {
        if (!win.opts.img || visualCount >= CONFIG.maxVisuals) return false;
        visualCount++;
        const terms = marker.terms;
        const caption = marker.caption || terms;
        const searchPageUrl = `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(terms)}&title=Special:MediaSearch&type=image`;

        const card = h('div', { className: 'yt-visual-card yt-commons-card' });
        const imgWrap = h('div', { className: 'yt-commons-loading' }, 'Loading reference diagram…');
        card.appendChild(imgWrap);
        const captionEl = h('div', { className: 'yt-visual-caption' }, caption);
        card.appendChild(captionEl);
        container.appendChild(card);

        const renderCommonsFallback = () => {
          clearEl(imgWrap);
          imgWrap.className = 'yt-commons-fallback';
          imgWrap.appendChild(buildCommonsSchematicSvg(caption));
          clearEl(captionEl);
          captionEl.appendChild(document.createTextNode(caption + ' — '));
          captionEl.appendChild(
            h(
              'a',
              { href: searchPageUrl, target: '_blank', rel: 'noopener noreferrer', className: 'yt-ext-link' },
              'Search Wikimedia Commons'
            )
          );
        };

        searchCommons(terms).then((res) => {
          if (!res || !res.thumbUrl) {
            renderCommonsFallback();
            return;
          }
          clearEl(imgWrap);
          imgWrap.className = 'yt-commons-img-wrap';
          const img = h('img', {
            src: res.thumbUrl,
            alt: caption,
            className: 'yt-commons-img',
            loading: 'lazy',
            onerror: () => renderCommonsFallback(),
            onclick: () => window.open(res.fileUrl, '_blank', 'noopener,noreferrer')
          });
          imgWrap.appendChild(img);
          clearEl(captionEl);
          captionEl.appendChild(document.createTextNode(caption + ' — '));
          captionEl.appendChild(
            h(
              'a',
              { href: res.fileUrl, target: '_blank', rel: 'noopener noreferrer', className: 'yt-ext-link' },
              `${res.artist} (${res.license})`
            )
          );
        });
        return true;
      }

      if (marker.kind === 'image') {
        const imgData = win.images && win.images['i' + marker.index];
        if (!imgData) return false;
        const caption = marker.caption || imgData.prompt || 'AI-generated illustration';
        const card = h('div', { className: 'yt-visual-card yt-ai-image-card' });
        const img = h('img', {
          src: imgData.url,
          alt: caption,
          className: 'yt-ai-img',
          onclick: () => window.open(imgData.url, '_blank', 'noopener,noreferrer')
        });
        card.appendChild(img);
        const modelName = CONFIG.imageModelNames[imgData.model] || imgData.model || 'Nano Banana';
        card.appendChild(h('div', { className: 'yt-visual-caption' }, `${caption} [AI-generated illustration (${modelName}) · may contain inaccuracies]`));
        container.appendChild(card);
        return true;
      }

      // [[GEN ...]] markers are skipped here when not converted to [[IMAGE N]]
      return marker.kind === 'gen';
    };

    const inlineVisualRegex = /\[\[(?:FRAME|IMG|IMAGE|GEN)\s+[^\]]+\]\]/gi;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        flushList();
        continue;
      }

      // Check for standalone or bullet/bold-wrapped visual markers
      const standaloneMarker = parseVisualMarkerFromLine(trimmed);
      if (standaloneMarker) {
        flushList();
        appendVisualCard(standaloneMarker);
        continue;
      }

      // Check for inline visual markers embedded inside a paragraph
      inlineVisualRegex.lastIndex = 0;
      if (inlineVisualRegex.test(rawLine)) {
        inlineVisualRegex.lastIndex = 0;
        let cursor = 0;
        let leftover = '';
        let m;
        const inlineMarkers = [];
        while ((m = inlineVisualRegex.exec(rawLine)) !== null) {
          leftover += rawLine.slice(cursor, m.index);
          const parsed = parseVisualMarkerToken(m[0]);
          if (parsed) inlineMarkers.push(parsed);
          else leftover += m[0];
          cursor = inlineVisualRegex.lastIndex;
        }
        leftover += rawLine.slice(cursor);
        const cleanLeft = leftover.replace(/\s{2,}/g, ' ').trim();
        if (cleanLeft && !/^[-*•]$/.test(cleanLeft)) {
          flushList();
          container.appendChild(h('p', { className: 'yt-md-p' }, parseInline(cleanLeft)));
        }
        if (inlineMarkers.length > 0) {
          flushList();
          for (const mk of inlineMarkers) appendVisualCard(mk);
        }
        continue;
      }

      // Headings
      if (trimmed.startsWith('#')) {
        flushList();
        const level = (trimmed.match(/^#+/) || [''])[0].length;
        const hText = trimmed.slice(level).trim();
        if (!richEnabled) {
          container.appendChild(h('p', { className: 'yt-md-p' }, parseInline(hText)));
          continue;
        }
        const hTag = level <= 2 ? 'h3' : 'h4';
        container.appendChild(h(hTag, { className: `yt-md-${hTag}` }, parseInline(hText)));
        continue;
      }

      // Horizontal Rule
      if (/^[-*_]{3,}$/.test(trimmed)) {
        flushList();
        if (richEnabled) container.appendChild(h('hr', { className: 'yt-md-hr' }));
        continue;
      }

      // Lists
      const listMatch = /^(\s*)([-*•]|\d+\.)\s+(.+)$/.exec(rawLine);
      if (listMatch) {
        if (!richEnabled) {
          flushList();
          container.appendChild(h('p', { className: 'yt-md-p' }, parseInline(`${listMatch[2]} ${listMatch[3]}`)));
          continue;
        }
        const indent = listMatch[1].length;
        const bullet = listMatch[2];
        const itemContent = listMatch[3];
        const isNum = /\d+\./.test(bullet);

        if (!currentList || (listType === 'ol') !== isNum) {
          flushList();
          listType = isNum ? 'ol' : 'ul';
          currentList = h(listType, { className: 'yt-md-list' });
        }

        const li = h('li', { className: indent >= 2 ? 'yt-md-nested-li' : '' }, parseInline(itemContent));
        currentList.appendChild(li);
        continue;
      }

      // Regular paragraph
      flushList();
      container.appendChild(h('p', { className: 'yt-md-p' }, parseInline(trimmed)));
    }

    flushList();
    return container;
  }

  // --- FACT-CHECK PASS (§10) ---
  async function runFactCheckPass(win, summaryText, { keyObj, modelId = '' } = {}) {
    const key = keyObj?.key;
    if (!key) throw new Error('No API key provided for fact check');

    const available = (await checkModelsForKey(keyObj)) || [];
    const requestedPrimary = String(
      modelId || win.opts.factModel || (CONFIG.factPreferred && CONFIG.factPreferred[0]) || win.modelId || CONFIG.defaultModel
    ).trim();
    const candidateModels = buildFactCheckModelCandidates({
      explicitModel: modelId,
      factModel: win.opts.factModel,
      primaryModel: win.modelId,
      defaultModel: CONFIG.defaultModel,
      factPreferred: CONFIG.factPreferred,
      fallbackLadder: CONFIG.fallbackLadder,
      textModels: CONFIG.textModels,
      availableModels: available
    });

    const clippedSummary = String(summaryText || '').slice(0, 30000);
    const includeClaims = Boolean(win.opts.fc || !win.opts.src);
    const includeSources = Boolean(win.opts.src || win.opts.fc);
    const prompt = `You are checking a summary of a YouTube video titled "${win.title}".
Use Google Search when available to verify key objective claims. Sections:
${includeClaims ? '## Fact-check\n(claims with [MM:SS], verdicts ✅ Supported / ⚠️ Partly true / ❌ Contradicted / ❓ Unverifiable, 1–2 sentences evidence; skip opinions)\n' : ''}
${includeSources ? '## Further reading\n(3–8 authoritative links as Markdown links)\n' : ''}
Do not repeat the summary.

SUMMARY TO CHECK:
"""
${clippedSummary}
"""`;

    const buildBody = (withSearch) => {
      const b = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      };
      if (withSearch) {
        b.tools = [{ google_search: {} }];
      }
      return b;
    };

    let res = null;
    let targetModel = candidateModels[0] || CONFIG.defaultModel;
    let firstErr = null;
    let lastErr = null;
    let usedSearch = true;
    const hasNonCooldownCandidate = candidateModels.some((m) => !isModelInCooldown(m));

    for (const model of candidateModels) {
      if (hasNonCooldownCandidate && isModelInCooldown(model)) {
        if (!firstErr) firstErr = new Error(`Model ${model} in cooldown`);
        continue;
      }
      try {
        res = await callGeminiRaw(model, key, buildBody(true), 120000);
        targetModel = model;
        break;
      } catch (err) {
        if (!firstErr) firstErr = err;
        lastErr = err;
        if (err?.status === 404 || err?.status === 429 || err?.status === 503) {
          recordModelCooldown(model, err);
        }
        if (CONFIG.debug) {
          console.warn(`[YTAIS] Fact check on ${model} failed, trying next:`, err.message || err);
        }
      }
    }

    // Fallback without google_search grounding tool if search tool is unavailable on key tier
    if (!res && candidateModels.length > 0) {
      usedSearch = false;
      for (const model of candidateModels.slice(0, 4)) {
        try {
          res = await callGeminiRaw(model, key, buildBody(false), 90000);
          targetModel = model;
          break;
        } catch (err) {
          if (!firstErr) firstErr = err;
          lastErr = err;
          if (err?.status === 404 || err?.status === 429 || err?.status === 503) {
            recordModelCooldown(model, err);
          }
        }
      }
    }

    if (!res) {
      throw lastErr || new Error('Fact check failed across available models');
    }

    const candidate = res.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const text = extractGeminiNonThoughtText(parts) || parts.map((p) => p?.text || '').join('').trim();
    if (!text) {
      throw new Error('Model returned empty fact-check response');
    }

    const sources = [];
    if (candidate?.groundingMetadata?.groundingChunks) {
      for (const c of candidate.groundingMetadata.groundingChunks) {
        if (c.web?.uri) {
          sources.push({ uri: c.web.uri, title: c.web.title || c.web.uri });
        }
      }
    }

    // Dedupe sources
    const seen = new Set();
    const uniqueSources = [];
    for (const s of sources) {
      if (!seen.has(s.uri)) {
        seen.add(s.uri);
        uniqueSources.push(s);
      }
    }

    const steppedDownFrom =
      requestedPrimary &&
      requestedPrimary !== targetModel &&
      !requestedPrimary.toLowerCase().includes('ask') &&
      (targetModel !== requestedPrimary + '-preview')
        ? requestedPrimary
        : '';

    return {
      text,
      sources: uniqueSources,
      model: targetModel,
      fallbackFrom: steppedDownFrom || undefined,
      searchGrounded: usedSearch,
      ts: Date.now()
    };
  }

  // --- INDEPENDENT VISUAL COORDINATOR PASS ---
  // Coordinates video frame screenshots, Wikimedia Commons diagrams, and AI illustration prompts
  // to illustrate summaries (both YouTube Ask and Gemini summaries without visual markers).
  async function coordinateVisualsForSummary(win, summaryText, keyObj, job) {
    if (!summaryText || !keyObj?.key) return { text: summaryText };
    const key = keyObj.key;

    const available = (await checkModelsForKey(keyObj)) || [];
    const candidateModels = buildFactCheckModelCandidates({
      primaryModel: win.modelId,
      defaultModel: CONFIG.defaultModel,
      fallbackLadder: CONFIG.fallbackLadder,
      textModels: CONFIG.textModels,
      availableModels: available
    });

    const prompt = `You are an expert visual coordinator enriching a YouTube video summary titled "${win.title}".
Analyze the summary and identify up to 5 key moments and concepts that strongly benefit from visual accompaniment:

1. VIDEO FRAMES / SCREENSHOTS:
For moments where the video itself demonstrated a diagram, graph, chart, slide, software demo, physical hardware, or map, insert:
[[FRAME MM:SS | Descriptive caption of what is shown in the video]]
Use timestamps matching the video's timeline discussed in that paragraph (e.g. [[FRAME 02:45 | Architecture diagram of the system]]).

2. SEARCH IMAGES & DIAGRAMS (from Wikimedia Commons / web search):
For core concepts, scientific principles, circuit topologies, or entities where an authoritative reference diagram or photo exists, insert:
[[IMG generic search query | Descriptive caption]]
Use clear, generic English search terms (e.g. [[IMG solar cell layer structure | Perovskite silicon tandem cell layers]]).

${win.opts.gen ? `3. AI GENERATED ILLUSTRATIONS (Nano Banana):
For abstract concepts or complex mechanisms needing a clean custom diagram, insert:
[[GEN clean flat educational diagram of ... | Descriptive caption]] (max 2)` : ''}

SUMMARY TO ENRICH:
"""
${summaryText.slice(0, 30000)}
"""

INSTRUCTIONS:
- Insert the visual markers on their own separate lines directly AFTER the paragraph they illustrate.
- Preserve all existing headings, text, and bullet points verbatim. Do not delete or summarize the text.
- Do NOT place more than 5 total visual markers.
- Return the full summary with the markers inserted.`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2
      }
    };

    let res = null;
    let modelToUse = candidateModels[0] || CONFIG.defaultModel;
    let lastErr = null;
    for (const model of candidateModels.slice(0, 4)) {
      try {
        res = await callGeminiRaw(model, key, body, 120000);
        modelToUse = model;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!res) {
      throw lastErr || new Error('Visual coordinator failed across available models');
    }

    const candidate = res.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const enrichedText = extractGeminiNonThoughtText(parts) || parts.map((p) => p?.text || '').join('');

    if (
      enrichedText.trim() &&
      (enrichedText.includes('[[FRAME') ||
        enrichedText.includes('[[IMG') ||
        enrichedText.includes('[[GEN') ||
        enrichedText.includes('[[IMAGE'))
    ) {
      return {
        text: enrichedText.trim(),
        note: `ℹ Visuals & diagrams coordinated by ${modelToUse}`
      };
    }

    return { text: ensureFallbackVisualMarkers(summaryText, 3) };
  }

  // --- AI STUDIO NEURAL TTS PIPELINE ---
  const ttsAudioCache = createBoundedMap(30);

  async function generateAiSpeech(cleanText, voiceName, keyObj) {
    const key = keyObj?.key;
    if (!key) throw new Error('No API key configured for AI Studio TTS');

    const cacheKey = `${voiceName || 'Kore'}:${cleanText.slice(0, 300)}`;
    if (ttsAudioCache.has(cacheKey)) {
      return ttsAudioCache.get(cacheKey);
    }

    const clippedText = cleanText.slice(0, 6000);
    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: clippedText,
              speechMetadata: {
                style: 'Natural, clear and engaging narrator'
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' }
          }
        }
      }
    };

    const res = await callGeminiRaw(CONFIG.ttsModel, key, body, 60000);
    const candidate = res.candidates?.[0];
    const audioData =
      candidate?.content?.parts?.[0]?.inlineData?.data ||
      candidate?.content?.parts?.[0]?.inline_data?.data;
    if (!audioData) {
      throw new Error('No audio returned from AI Studio TTS');
    }

    const dataUrl = `data:audio/wav;base64,${audioData}`;
    ttsAudioCache.set(cacheKey, dataUrl);
    return dataUrl;
  }

  async function generatePodcastTurnAudio(turn, hosts, keyObj) {
    const key = keyObj?.key;
    if (!key) throw new Error('No API key configured for Podcast Audio');
    const hostNames = Array.isArray(hosts) ? hosts.map((h) => h.name) : [];
    const noSelfNameText = sanitizeSpokenTurnText(turn?.text || '', hostNames);
    const cleanText = cleanTextForSpeech(noSelfNameText, { skipSilence: false });
    if (!cleanText) throw new Error('Empty podcast turn text');
    const voiceName = turn?.voiceName || 'Kore';
    const hostMeta = Array.isArray(hosts) ? hosts.find((h) => h.name === turn?.speaker) : null;
    const cacheKey = `pod2:${voiceName}:${cleanText.slice(0, 260)}`;
    if (ttsAudioCache.has(cacheKey)) {
      return ttsAudioCache.get(cacheKey);
    }

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              // Single-speaker prebuiltVoiceConfig: pass ONLY the spoken line without any "Speaker: " prefix
              // so Gemini TTS never speaks the host's own name aloud at the start of the turn.
              text: cleanText.slice(0, 4500),
              speechMetadata: {
                style: hostMeta?.style || 'Engaging conversational podcast host'
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        }
      }
    };

    const res = await callGeminiRaw(CONFIG.podcastAudioModel || CONFIG.ttsModel, key, body, 60000);
    const candidate = res.candidates?.[0];
    const audioData =
      candidate?.content?.parts?.[0]?.inlineData?.data ||
      candidate?.content?.parts?.[0]?.inline_data?.data;
    if (!audioData) {
      throw new Error('No audio returned from Gemini Podcast TTS');
    }
    const dataUrl = `data:audio/wav;base64,${audioData}`;
    ttsAudioCache.set(cacheKey, dataUrl);
    return dataUrl;
  }

  // --- AI IMAGES GENERATION PIPELINE (§10) ---
  async function generateAiImages(win, summaryText, keyObj) {
    const key = keyObj?.key;
    if (!key) return { summaryText, images: {} };

    // Extract [[GEN prompt | caption]]
    const genRegex = /\[\[GEN\s+([^|\]]+)(?:\s*\|\s*([^\]]*))?\]\]/gi;
    const prompts = [];
    let match;
    while ((match = genRegex.exec(summaryText)) !== null && prompts.length < CONFIG.maxGenImages) {
      prompts.push({
        full: match[0],
        prompt: match[1].trim(),
        caption: match[2] ? match[2].trim() : match[1].trim()
      });
    }

    if (!prompts.length) return { summaryText, images: {} };

    // Determine image model hierarchy
    let chosenModel = win.opts.imgModel;
    if (!chosenModel) {
      const textM = (win.modelId || '').toLowerCase();
      if (textM.includes('pro')) chosenModel = CONFIG.imageModels[0];
      else if (textM.includes('lite')) chosenModel = CONFIG.imageModels[3];
      else chosenModel = CONFIG.imageModels[1];
    }

    const available = (await checkModelsForKey(keyObj)) || [];
    const modelsToTry = [chosenModel];
    if (win.opts.fallback) {
      const idx = CONFIG.imageModels.indexOf(chosenModel);
      if (idx !== -1) {
        for (let i = idx + 1; i < CONFIG.imageModels.length; i++) {
          modelsToTry.push(CONFIG.imageModels[i]);
        }
      }
    }

    const validModels = modelsToTry.filter(
      (m) => available.length === 0 || available.includes(m) || available.includes(m + '-preview')
    );
    if (!validModels.length) validModels.push(chosenModel);

    const images = {};
    const placedImages = [];

    for (let i = 0; i < prompts.length; i++) {
      const p = prompts[i];
      const imgKey = 'i' + (i + 1);
      const enhancedPrompt = `Create a clean, clear, accurate illustration. ${p.prompt}`;
      let imageData = null;
      let usedModel = '';

      for (const model of validModels) {
        try {
          const body = {
            contents: [{ role: 'user', parts: [{ text: enhancedPrompt }] }],
            generationConfig: {
              responseModalities: win.opts.imgOut === 'image' ? ['IMAGE'] : ['TEXT', 'IMAGE']
            }
          };
          if (win.opts.imgAspect) {
            body.generationConfig.imageConfig = { aspectRatio: win.opts.imgAspect };
          }
          if (win.opts.imgSearch) {
            body.tools = [{ google_search: { searchTypes: { webSearch: {}, imageSearch: {} } } }];
          }

          const res = await callGeminiRaw(model, key, body, 60000);
          const parts = res.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.inlineData || part.inline_data) {
              const inline = part.inlineData || part.inline_data;
              imageData = `data:${inline.mimeType || inline.mime_type || 'image/jpeg'};base64,${inline.data}`;
              usedModel = model;
              break;
            }
          }
          if (imageData) break;
        } catch (genErr) {
          // Fallback to Interactions API
          try {
            const intBody = {
              input: [{ type: 'text', text: enhancedPrompt }],
              response_format: { type: 'image', mime_type: 'image/jpeg' }
            };
            const intRes = await callInteractionsRaw(model, key, intBody, 60000);
            if (intRes?.output) {
              for (const out of intRes.output) {
                if (out.type === 'image' && out.data) {
                  imageData = `data:${out.mime_type || 'image/jpeg'};base64,${out.data}`;
                  usedModel = model;
                  break;
                }
              }
            }
            if (imageData) break;
          } catch (_) {}
        }
      }

      if (imageData) {
        images[imgKey] = { url: imageData, model: usedModel, prompt: p.caption };
        placedImages.push({ index: i + 1, caption: p.caption, dataUrl: imageData });
      }
    }

    if (!placedImages.length) {
      // Strip [[GEN ...]] markers
      const cleaned = summaryText.replace(genRegex, '');
      return { summaryText: cleaned, images: {} };
    }

    // Call Gemini to get placements
    let newSummary = summaryText;
    try {
      const placementPrompt = `You are placing AI-generated illustrations into a summary.
Summary:
"""
${summaryText.replace(genRegex, '')}
"""

Images created:
${placedImages.map((img) => `Image ${img.index}: ${img.caption}`).join('\n')}

Return JSON with exact placement instructions:
{"placements":[{"image":1,"after":"<25-80 verbatim characters from the summary where this image belongs>","caption":"..."}]}`;

      const placeRes = await callGeminiRaw(
        win.modelId || CONFIG.defaultModel,
        key,
        {
          contents: [{ role: 'user', parts: [{ text: placementPrompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        },
        30000
      );

      const placeJsonText = placeRes.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = JSON.parse(placeJsonText);
      let workSummary = summaryText.replace(genRegex, '');

      if (parsed.placements && Array.isArray(parsed.placements)) {
        for (const pl of parsed.placements) {
          const afterSnippet = (pl.after || '').trim();
          const marker = `\n\n[[IMAGE ${pl.image} | ${pl.caption || ''}]]\n\n`;
          if (afterSnippet && workSummary.includes(afterSnippet)) {
            const idx = workSummary.indexOf(afterSnippet) + afterSnippet.length;
            workSummary = workSummary.slice(0, idx) + marker + workSummary.slice(idx);
          } else {
            workSummary += marker;
          }
        }
        newSummary = workSummary;
      }
    } catch (_) {
      // Fallback: append at end
      let cleaned = summaryText.replace(genRegex, '');
      for (const img of placedImages) {
        cleaned += `\n\n[[IMAGE ${img.index} | ${img.caption}]]\n\n`;
      }
      newSummary = cleaned;
    }

    return { summaryText: newSummary, images };
  }

  // --- RETRY & FALLBACK POLICY ENGINE (§9) ---
  function getNextModelDown(currentModel, availableKeysModels = []) {
    const ladder = CONFIG.fallbackLadder;
    const isAsk = String(currentModel || '').toLowerCase().includes('ask');
    let startIdx = 0;
    if (!isAsk) {
      let idx = ladder.indexOf(currentModel);
      if (idx === -1) {
        // Find first non-pro
        idx = ladder.findIndex((m) => !m.includes('pro'));
        if (idx === -1) idx = 0;
      }
      startIdx = idx + 1;
    }
    for (let i = startIdx; i < ladder.length; i++) {
      const candidate = ladder[i];
      if (
        availableKeysModels.length === 0 ||
        availableKeysModels.includes(candidate) ||
        availableKeysModels.includes(candidate + '-preview')
      ) {
        return candidate;
      }
    }
    return null;
  }

  async function runPolicy(win, job, makeSpec, { retries = 0, fallback = false, startModel = '' } = {}) {
    const keyObj = getStoredKeys().find((k) => k.id === win.keyId) || getStoredKeys()[0];
    if (!keyObj) {
      const err = new Error('No API key configured');
      err.code = 'NO_KEY';
      throw err;
    }

    const available = (await checkModelsForKey(keyObj)) || [];
    let curModel = startModel || win.modelId || CONFIG.defaultModel;
    const triedModels = new Set();
    const notes = [];

    while (curModel && !job.cancelled) {
      triedModels.add(curModel);
      let modelSucceeded = false;
      let lastErr = null;

      for (let attempt = 0; attempt <= retries && !job.cancelled; attempt++) {
        if (attempt > 0) {
          win.phase = `Retrying (${attempt}/${retries})`;
          win.renderStatus();
          const delay = Math.min(60000, lastErr?.retryMs || 2500 * attempt);
          await new Promise((r) => setTimeout(r, delay));
        }

        try {
          win.phase = `Trying ${curModel}`;
          win.renderStatus();
          const spec = makeSpec(curModel, keyObj.key);
          const result = await callGeminiWithDrops(curModel, keyObj.key, spec.makeBody, {
            requireTools: spec.requireTools,
            onDrop: (item, reason) => {
              notes.push(`ℹ ${curModel} skipped: ${item}${reason ? ` (${reason})` : ''}`);
            }
          });
          modelSucceeded = true;
          return { res: result.res, model: curModel, notes };
        } catch (err) {
          lastErr = err;
          if (err.code === 'NO_KEY' || (err.message && err.message.toLowerCase().includes('api key'))) {
            throw err;
          }
          if (err.status === 404 || err.status === 403 || (err.retryMs && err.retryMs > 60000)) {
            break; // not retryable on this model
          }
        }
      }

      if (lastErr) {
        const firstLine = (lastErr.message || 'unknown error').split('\n')[0];
        notes.push(`⚠ ${curModel} failed: ${firstLine}`);
      }

      if (fallback) {
        const next = getNextModelDown(curModel, available);
        if (next && !triedModels.has(next)) {
          curModel = next;
          continue;
        }
      }

      if (lastErr) {
        lastErr.notes = notes;
        throw lastErr;
      }
      break;
    }

    throw new Error('All models exhausted');
  }

  // --- CORE PRODUCER FUNCTION (§7) ---
  async function produce(win, job) {
    win.status = 'loading';
    win.busy = true;
    win.errMsg = '';
    win.errCode = '';
    win.notes = Array.isArray(win.notes) ? win.notes.slice() : [];
    win.owner = TAB_ID;
    win.jobId = job.id;
    win.hb = Date.now();
    win.commit(false);

    try {
      let askFallbackUsed = false;

      // Ask provider
      if (win.modelId.includes('Ask')) {
        win.source = 'video';
        win.phase = 'Running YouTube Ask…';
        win.renderStatus();
        try {
          const res = await runYouTubeAsk(win.videoId, win.buildSummaryPrompt(), {
            isSummary: true,
            signal: job.abortController.signal,
            onPhase: (p) => {
              win.phase = p;
              win.renderStatus();
            }
          });
          if (job.cancelled) return;

          win.text = res.text;
          if (res.note) win.notes.push(res.note);

          // Independent Visual Coordinator Pass:
          // Coordinate video frames/screenshots, search diagrams, and AI illustrations
          const keyObj = getStoredKeys().find((k) => k.id === win.keyId) || getStoredKeys()[0];
          if ((win.opts.img || win.opts.gen) && keyObj?.key) {
            try {
              win.phase = 'Coordinating video frames & diagrams…';
              win.renderStatus();
              const coordRes = await coordinateVisualsForSummary(win, win.text, keyObj, job);
              if (coordRes?.text) {
                win.text = coordRes.text;
                if (coordRes.note) win.notes.push(coordRes.note);
              }
            } catch (coordErr) {
              if (CONFIG.debug) console.warn('[YTAIS] Visual coordination failed:', coordErr);
              win.notes.push(`ℹ Visual coordination skipped: ${coordErr.message || 'model unavailable'}`);
            }

            // If AI images are enabled and GEN markers were placed, generate illustrations
            if (win.opts.gen && /\[\[GEN\s+/i.test(win.text)) {
              try {
                win.phase = 'Generating illustrations (Nano Banana)…';
                win.renderStatus();
                const aiRes = await generateAiImages(win, win.text, keyObj);
                win.text = aiRes.summaryText;
                win.images = aiRes.images;
              } catch (imgErr) {
                if (CONFIG.debug) console.warn('[YTAIS] Image generation failed:', imgErr);
              }
            }
          } else if ((win.opts.img || win.opts.gen) && !keyObj?.key) {
            win.notes.push('ℹ Visuals & diagrams for YouTube Ask are coordinated by an independent Gemini model. Add an API key (⚙ in toolbar) to enable video frames and illustrations.');
          }

          if (win.opts.img && win.mode === 'summary') {
            win.text = ensureFallbackVisualMarkers(win.text, 3);
          }

          win.onDone();
          return;
        } catch (askErr) {
          if (job.cancelled || job.abortController.signal.aborted) return;

          const keyObj = getStoredKeys().find((k) => k.id === win.keyId) || getStoredKeys()[0];
          if (!keyObj || !keyObj.key) {
            throw askErr;
          }

          const available = (await checkModelsForKey(keyObj)) || [];
          const nextModel = getNextModelDown(win.modelId, available);
          if (!nextModel) {
            throw askErr;
          }

          const firstLine = (askErr.message || 'YouTube Ask failed').split('\n')[0];
          win.notes.push(`⚠ YouTube Ask failed (${firstLine}). Automatically proceeding with ${nextModel}.`);
          win.modelId = nextModel;
          askFallbackUsed = true;
          win.phase = `YouTube Ask failed — falling back to ${nextModel}…`;
          announceLive(`YouTube Ask failed, switched to ${nextModel}`);
          win.commit(false);
          win.renderAll();
          win.renderStatus();
        }
      }

      // Transcript source & FEAT-04 Chapter-Aware Long-Video Chunking (>45 min)
      let transcriptText = '';
      let chunkPlan = null;
      if (win.source === 'text') {
        win.phase = 'Fetching YouTube transcript…';
        win.renderStatus();
        transcriptText = await getTranscriptText(win.videoId, win.opts.retries, job.abortController.signal);
        if (job.cancelled) return;

        const descChapters = extractChaptersForVideo(win.videoId);
        chunkPlan = buildLongVideoTranscriptChunks(transcriptText, { chapters: descChapters });
        if (chunkPlan.chapters.length > 0) {
          win.chapters = chunkPlan.chapters;
        }

        if (win.mode === 'transcript') {
          // Transcribe + Transcript mode: Return straight from captions, NO AI CALL!
          win.text = `## Transcript (YouTube captions)\n\n` + transcriptText;
          win.notes.push("Taken straight from YouTube's captions… No AI was involved.");
          win.onDone();
          return;
        }
      }

      // Gemini Pipeline (with Map-Reduce chapter chunking when >45 min transcript)
      let answerText = '';
      let usedModel = win.modelId;
      let combinedNotes = [];
      let groundingCandidate = null;

      if (win.source === 'text' && win.mode === 'summary' && chunkPlan?.isLongVideoChunked && chunkPlan.chunks.length > 1) {
        const persona = win.getSummaryPersona();
        const txMode = win.getTranscriptMode();
        const chunkSummaries = [];
        win.notes.push(`Long video detected (>45 min): chapter-aware synthesis across ${chunkPlan.chunks.length} segments.`);

        for (let ci = 0; ci < chunkPlan.chunks.length && !job.cancelled; ci++) {
          const ch = chunkPlan.chunks[ci];
          win.phase = `Summarizing chapter ${ci + 1}/${chunkPlan.chunks.length}: ${ch.title}…`;
          win.renderStatus();
          const mapRes = await runPolicy(
            win,
            job,
            () => ({
              requireTools: false,
              makeBody: ({ dropThink }) => {
                const body = {
                  contents: [{ role: 'user', parts: [{ text: buildChunkMapPrompt(win.title, ch, chunkPlan.chunks.length, persona) }] }],
                  systemInstruction: { parts: [{ text: win.getSystemInstruction() }] }
                };
                if (!dropThink && win.opts.think) {
                  body.generationConfig = { thinkingConfig: { thinkingLevel: win.opts.think } };
                }
                return body;
              }
            }),
            {
              retries: 0,
              fallback: win.opts.fallback || askFallbackUsed,
              startModel: usedModel
            }
          );
          if (job.cancelled) return;
          if (mapRes.notes) combinedNotes.push(...mapRes.notes);
          usedModel = mapRes.model;
          const mapText = mapRes.res.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
          chunkSummaries.push({ title: ch.title, tsStr: ch.tsStr, summary: mapText.trim() });
        }

        if (job.cancelled) return;
        win.phase = 'Synthesizing final chapter-aware summary…';
        win.renderStatus();
        const reducePrompt = buildChunkReducePrompt(win.title, chunkSummaries, persona, txMode, win.opts.img);
        const reduceRes = await runPolicy(
          win,
          job,
          () => ({
            requireTools: false,
            makeBody: ({ dropThink, dropTools }) => {
              const body = {
                contents: [{ role: 'user', parts: [{ text: reducePrompt }] }],
                systemInstruction: { parts: [{ text: win.getSystemInstruction() }] }
              };
              if (!dropThink && win.opts.think) {
                body.generationConfig = { thinkingConfig: { thinkingLevel: win.opts.think } };
              }
              if (!dropTools && win.opts.gsearch) {
                body.tools = [{ google_search: {} }];
              }
              return body;
            }
          }),
          {
            retries: 0,
            fallback: win.opts.fallback || askFallbackUsed,
            startModel: usedModel
          }
        );
        if (job.cancelled) return;
        groundingCandidate = reduceRes.res.candidates?.[0];
        answerText = groundingCandidate?.content?.parts?.map((p) => p.text || '').join('') || '';
        if (reduceRes.notes) combinedNotes.push(...reduceRes.notes);
        usedModel = reduceRes.model;
      } else {
        const makeSpec = (model, key) => {
          return {
            requireTools: false,
            makeBody: ({ dropMediaRes, dropThink, dropTools }) => {
              const prompt = win.mode === 'transcript' ? win.buildTranscriptPrompt() : win.buildSummaryPrompt();
              const parts = [];

              if (win.source === 'video') {
                parts.push({ file_data: { file_uri: `https://www.youtube.com/watch?v=${win.videoId}` } });
                parts.push({ text: prompt });
              } else {
                parts.push({ text: prompt + '\n\nTRANSCRIPT:\n' + transcriptText });
              }

              const body = { contents: [{ role: 'user', parts }] };
              if (win.mode !== 'transcript') {
                body.systemInstruction = { parts: [{ text: win.getSystemInstruction() }] };
              }
              const genConfig = {};

              if (win.source === 'video' && !dropMediaRes) {
                const res = win.opts.mres || (CONFIG.lowMediaResolution ? 'MEDIA_RESOLUTION_LOW' : '');
                if (res) genConfig.mediaResolution = res;
              }

              if (!dropThink && win.opts.think) {
                genConfig.thinkingConfig = { thinkingLevel: win.opts.think };
              }

              if (Object.keys(genConfig).length > 0) {
                body.generationConfig = genConfig;
              }

              if (!dropTools && win.mode !== 'transcript') {
                const tools = [];
                if (win.opts.gsearch) tools.push({ google_search: {} });
                if (win.opts.gmaps) tools.push({ google_maps: {} });
                if (win.opts.code) tools.push({ code_execution: {} });
                if (tools.length > 0) body.tools = tools;
              }

              return body;
            }
          };
        };

        let policyRes;
        try {
          policyRes = await runPolicy(win, job, makeSpec, {
            retries: win.mode === 'transcript' ? win.opts.retries : 0,
            fallback: win.opts.fallback || askFallbackUsed,
            startModel: win.modelId
          });
        } catch (err) {
          // Video limit quota fallback
          if (
            win.source === 'video' &&
            win.opts.txFallback &&
            err.code === 'QUOTA' &&
            /video|hour|youtube/i.test(err.message + ' ' + (err.violations || []).join(' '))
          ) {
            win.source = 'text';
            win.notes.push('The video-input limit was reached, so the transcript was used instead.');
            return produce(win, job);
          }
          throw err;
        }

        if (job.cancelled) return;

        groundingCandidate = policyRes.res.candidates?.[0];
        answerText = groundingCandidate?.content?.parts?.map((p) => p.text || '').join('') || '';
        if (policyRes.notes) combinedNotes.push(...policyRes.notes);
        usedModel = policyRes.model;
      }

      if (!answerText.trim()) {
        throw new Error('Returned no answer — video may be private, age-restricted, live, or too long');
      }

      win.text = answerText;
      if (combinedNotes.length > 0) win.notes.push(...combinedNotes);
      win.modelId = usedModel;
      const candidate = groundingCandidate;

      // Dedupe web sources
      win.sources = [];
      if (candidate?.groundingMetadata?.groundingChunks) {
        for (const c of candidate.groundingMetadata.groundingChunks) {
          if (c.web?.uri) {
            win.sources.push({ uri: c.web.uri, title: c.web.title || c.web.uri });
          }
        }
      }

      // Handle Visual Coordinator & Fallback Markers when Images & Diagrams is enabled
      if (win.opts.img && win.mode === 'summary' && !/\[\[(?:FRAME|IMG|IMAGE|GEN)\s+[^\]]+\]\]/i.test(win.text)) {
        const keyObj = getStoredKeys().find((k) => k.id === win.keyId) || getStoredKeys()[0];
        if (keyObj?.key) {
          try {
            win.phase = 'Adding video frames & diagrams…';
            win.renderStatus();
            const coordRes = await coordinateVisualsForSummary(win, win.text, keyObj, job);
            if (coordRes?.text) {
              win.text = coordRes.text;
            }
          } catch (_) {}
        }
        win.text = ensureFallbackVisualMarkers(win.text, 3);
      }

      // Handle AI Images
      if (win.opts.gen && win.mode === 'summary') {
        win.phase = 'Generating illustrations (Nano Banana)…';
        win.renderStatus();
        const keyObj = getStoredKeys().find((k) => k.id === win.keyId) || getStoredKeys()[0];
        const aiRes = await generateAiImages(win, win.text, keyObj);
        win.text = aiRes.summaryText;
        win.images = aiRes.images;
      }

      win.onDone();
    } catch (err) {
      if (job.cancelled) return;
      win.status = 'error';
      win.busy = false;
      win.errMsg = err.message || 'Unknown error occurred';
      win.errCode = err.code || 'UNKNOWN';
      if (err.notes) win.notes.push(...err.notes);
      win.commit(false);
      win.renderAll();
    }
  }

  // --- WINDOW CONTROLLER & UI CLASS (§6) ---
  const activeWindows = new Map(); // videoId -> SummaryWindow instance
  let maximizedWindow = null;
  let topWindowZIndex = 10;
  let shadowRoot = null;
  let dockContainer = null;
  let modalsContainer = null;
  let liveRegionEl = null;
  let liveAnnouncementSeq = 0;
  let globalToastEl = null;
  let globalToastTimer = null;

  function announceLive(message) {
    if (!message) return;
    if (!ensureHostAndShadow() || !liveRegionEl) return;
    liveAnnouncementSeq += 1;
    liveRegionEl.setAttribute('data-announcement-seq', String(liveAnnouncementSeq));
    liveRegionEl.textContent = String(message);
  }

  function showGlobalToast(message, durationMs = 3200) {
    if (!message) return;
    if (!ensureHostAndShadow() || !shadowRoot) return;
    if (!globalToastEl) {
      globalToastEl = h('div', {
        className: 'yt-global-toast',
        role: 'status',
        'aria-live': 'polite'
      });
      shadowRoot.appendChild(globalToastEl);
    }
    globalToastEl.textContent = String(message);
    globalToastEl.classList.remove('yt-global-toast-show');
    void globalToastEl.offsetWidth;
    globalToastEl.classList.add('yt-global-toast-show');
    if (globalToastTimer) clearTimeout(globalToastTimer);
    globalToastTimer = setTimeout(() => {
      globalToastEl?.classList.remove('yt-global-toast-show');
      globalToastTimer = null;
    }, durationMs);
  }

  function getOpenWindows() {
    return Array.from(activeWindows.values()).filter((w) => w.isOpen);
  }

  class SummaryWindow {
    constructor(videoId, title, initialMeta = {}) {
      this.videoId = videoId;
      this.originalTitle = initialMeta.originalTitle || title || 'YouTube Video';
      this.aiTitle = initialMeta.aiTitle || getCachedAltTitle(videoId) || '';
      this.titleDisplayMode =
        initialMeta.titleDisplayMode === 'original' || initialMeta.titleDisplayMode === 'ai'
          ? initialMeta.titleDisplayMode
          : (this.aiTitle ? 'ai' : 'original');
      this.titleSwitching = false;
      this.title = resolveSummaryWindowDisplayTitle({
        mode: this.titleDisplayMode,
        aiTitle: this.aiTitle,
        originalTitle: this.originalTitle,
        fallbackTitle: title || 'YouTube Video'
      }).displayTitle;
      this._lastHeaderDisplayTitle = this.title;
      this.created = initialMeta.created || Date.now();
      this.mode = initialMeta.mode || 'summary';
      this.source = initialMeta.source || getLastSource();
      this.status = initialMeta.status || 'idle';
      this.busy = Boolean(initialMeta.busy);
      this.owner = initialMeta.owner || null;
      this.hb = initialMeta.hb || 0;
      this.jobId = initialMeta.jobId || null;
      this.unread = Boolean(initialMeta.unread);
      this.errMsg = initialMeta.errMsg || '';
      this.errCode = initialMeta.errCode || '';
      this.modelId = initialMeta.modelId || getLastModel();
      this.followUpModel = initialMeta.followUpModel || this.modelId || CONFIG.defaultModel;
      this.keyId = initialMeta.keyId || getLastKeyId() || (getStoredKeys()[0]?.id || '');
      this.opts = Object.assign({}, getGlobalOpts(), initialMeta.opts || {});
      this.opts.autoFactCheck = normalizeAutoFactCheckSetting(this.opts.autoFactCheck);
      this.opts.persona = normalizeSummaryPersona(this.opts.persona || initialMeta.persona || getDefaultSummaryPersona());
      this.phase = '';
      this.notes = initialMeta.notes || [];

      // Multi-window floating position, z-order & responsive state
      this.isOpen = Boolean(initialMeta.isOpen);
      this.zIndex = typeof initialMeta.zIndex === 'number' ? initialMeta.zIndex : ++topWindowZIndex;
      const openCount = getOpenWindows().length;
      const savedBounds = initialMeta.bounds || getLastWindowBounds();
      const viewport = {
        width: typeof window !== 'undefined' ? window.innerWidth : 1280,
        height: typeof window !== 'undefined' ? window.innerHeight : 800
      };
      this.bounds = computeDefaultWindowBounds(viewport, openCount, savedBounds ? { width: savedBounds.width, height: savedBounds.height } : null);
      this.sizeTier = classifyWindowSizeTier(this.bounds.width);
      this.compactOptionsOpen = false;
      this._resizeObserver = null;
      this._interactionCleanup = [];
      this.winOverflowMenuEl = null;

      // Cached content
      this.text = '';
      this.sources = [];
      this.turns = [];
      this.editingTurnIdx = -1;
      this.images = {};
      this.fact = null;
      this.factStatus = 'idle'; // 'idle' | 'loading' | 'done' | 'error'
      this.factError = '';
      this.chapters = Array.isArray(initialMeta.chapters) ? initialMeta.chapters : [];
      this.cacheDate = null;

      // DOM Elements
      this.dockTab = null;
      this.modalScrim = null;
      this.windowBox = null;
      this.bodyEl = null;
      this.playerSlot = null;
      this.playerIframe = null;
      this.lastSeekSeconds = null;
      this.composerTa = null;
      this.composerModelSelect = null;
      this.composerBtn = null;
      this.currentJob = null;
      this.personaSelectEl = null;

      // Text-to-Speech (TTS) State
      this.ttsState = 'idle'; // 'idle' | 'loading' | 'playing' | 'paused'
      this.ttsRate = typeof initialMeta.ttsRate === 'number' ? initialMeta.ttsRate : getLastTtsRate();
      this.ttsVolume = typeof initialMeta.ttsVolume === 'number' ? initialMeta.ttsVolume : getLastTtsVolume();
      this.ttsPitch = typeof initialMeta.ttsPitch === 'number' ? initialMeta.ttsPitch : getLastTtsPitch();
      this.ttsVoice = initialMeta.ttsVoice || getLastTtsVoice();
      this.channel = initialMeta.channel || '';
      this.ttsUtterance = null;
      this.ttsAudioEl = null;
      this.ttsPlayBtn = null;
      this.ttsStopBtn = null;
      this.ttsRateBtn = null;
      this.ttsSpeedWrap = null;
      this.ttsSpeedBtns = [];
      this.ttsSpeedSlider = null;
      this.ttsSpeedLabel = null;
      this.ttsVolumeWrap = null;
      this.ttsVolumeSlider = null;
      this.ttsVolumeLabel = null;
      this.ttsPitchWrap = null;
      this.ttsPitchSlider = null;
      this.ttsPitchLabel = null;
      this.ttsVoiceSelect = null;
      this.ttsRewindBtn = null;
      this.ttsSkipBtn = null;
      this.ttsSkipSilenceBtn = null;
      this.skipSilence = typeof this.opts.skipSilence === 'boolean' ? this.opts.skipSilence : true;
      this.ttsSentenceIndex = 0;
      this._ttsFeedbackTimer = null;
      this._prevTtsVolume = 1.0;

      // Real-time Audio Waveform Visualizer
      this.ttsWaveformWrap = null;
      this.ttsWaveformCanvas = null;
      this.ttsWaveformBars = [];
      this.waveformAnimId = null;
      this.ttsBoundaryPulse = 0;

      // Transcript Search, Keyword Jump & Follow-Along Lock State
      this.transcriptSearchQuery = '';
      this.transcriptFilterOnly = false;
      this.followAlong = initialMeta.followAlong !== undefined ? Boolean(initialMeta.followAlong) : getFollowAlongLock();
      this.transcriptFollowBtn = null;
      this.transcriptMatchIdx = 0;
      this.transcriptMatchCount = 0;
      this.transcriptMarks = [];
      this.transcriptSearchInput = null;
      this.transcriptCountEl = null;
      this.transcriptClearBtn = null;

      // Readability Mode & Export State
      this.readabilityMode = Boolean(initialMeta.readabilityMode);
      this.readabilityFont = initialMeta.readabilityFont || 'serif';
      this.syncYouTubeTheme = initialMeta.syncYouTubeTheme !== undefined ? Boolean(initialMeta.syncYouTubeTheme) : getLastSyncYouTubeTheme();
      if (this.syncYouTubeTheme) {
        this.readabilityTheme = detectYouTubeTheme();
      } else {
        this.readabilityTheme = initialMeta.readabilityTheme || getLastReadabilityTheme() || 'system';
      }
      this.readabilitySize = typeof initialMeta.readabilitySize === 'number' ? initialMeta.readabilitySize : 17;
      this.readabilityContainer = null;
      this.exportMenuEl = null;
      this.ytThemeObserver = null;
      if (this.readabilityMode && this.syncYouTubeTheme) {
        this.setupYouTubeThemeObserver();
      }

      // FEAT-07: Interactive Multi-Host Podcast Studio State
      this.podcastHostCount = normalizePodcastHostCount(
        initialMeta.podcastHostCount || getDefaultPodcastHostCount(),
        2,
        CONFIG.podcastMaxHosts || 6
      );
      this.podcastHosts = Array.isArray(initialMeta.podcastHosts) && initialMeta.podcastHosts.length >= 2
        ? buildDefaultPodcastHosts(this.podcastHostCount, initialMeta.podcastHosts)
        : buildDefaultPodcastHosts(this.podcastHostCount, getDefaultPodcastHostsConfig());
      this.podcastSummaryText = '';
      this.podcastEpisode = readPodcastEpisode(this.videoId);
      if (this.podcastEpisode && Array.isArray(this.podcastEpisode.hosts) && this.podcastEpisode.hosts.length >= 2) {
        this.podcastHostCount = normalizePodcastHostCount(this.podcastEpisode.hostCount || this.podcastEpisode.hosts.length, 2, CONFIG.podcastMaxHosts || 6);
        this.podcastHosts = buildDefaultPodcastHosts(this.podcastHostCount, this.podcastEpisode.hosts);
      }
      this.podcastGenerating = false;
      this.podcastGeneratingMore = false;
      this.podcastGenToken = 0;
      this.podcastAudioPrefetch = new Map();
      this.podcastInteracting = false;
      this.podcastAutoGeneratePending = false;
      this.podcastStatus = 'idle'; // 'idle' | 'playing' | 'paused'
      this.podcastActiveTurnIdx = 0;
      this.podcastRate = typeof initialMeta.podcastRate === 'number' ? initialMeta.podcastRate : getPodcastDefaultRate();
      this.podcastAudioEl = null;
      this.podcastPlaybackToken = 0;
      this.podcastFallbackTimer = null;
      this.podcastQaDraft = '';
      this._podcastListening = false;
      this._podcastSpeechRec = null;

      activeWindows.set(this.videoId, this);
      ensureWindowMonitorLoop();
      this.createDockTab();
    }

    toRecord() {
      return {
        videoId: this.videoId,
        title: this.title,
        originalTitle: this.originalTitle,
        aiTitle: this.aiTitle,
        titleDisplayMode: this.titleDisplayMode,
        created: this.created,
        mode: this.mode,
        source: this.source,
        status: this.status,
        busy: this.busy,
        owner: this.owner,
        hb: this.hb,
        jobId: this.jobId,
        unread: this.unread,
        errMsg: this.errMsg,
        errCode: this.errCode,
        modelId: this.modelId,
        followUpModel: this.followUpModel,
        keyId: this.keyId,
        opts: this.opts,
        notes: this.notes,
        isOpen: this.isOpen,
        zIndex: this.zIndex,
        bounds: this.bounds,
        ttsVoice: this.ttsVoice,
        ttsVolume: this.ttsVolume,
        ttsRate: this.ttsRate,
        ttsPitch: this.ttsPitch,
        channel: this.channel,
        persona: this.getSummaryPersona(),
        followAlong: this.followAlong,
        chapters: this.chapters || [],
        readabilityMode: this.readabilityMode,
        readabilityFont: this.readabilityFont,
        readabilityTheme: this.readabilityTheme,
        readabilitySize: this.readabilitySize,
        syncYouTubeTheme: this.syncYouTubeTheme
      };
    }

    commit(quiet = false) {
      if (this.closed) return;
      GM_setValue('win:' + this.videoId, this.toRecord());
      if (!quiet) {
        GM_setValue('sync_ping', { id: this.videoId, tab: TAB_ID, t: Date.now(), n: Math.random() });
      }
    }

    getTranscriptMode() {
      return this.opts.transcriptMode || 'fast';
    }

    getSummaryPersona() {
      return normalizeSummaryPersona(this.opts?.persona || getDefaultSummaryPersona());
    }

    getSystemInstruction() {
      return resolveSummaryPersonaInstruction(this.getSummaryPersona(), this.getTranscriptMode());
    }

    buildSummaryPrompt() {
      const isFast = this.getTranscriptMode() === 'fast';
      const outLang = getOutputLanguage();
      let prompt = isFast
        ? `Watch this YouTube video (titled "${this.title}") and write an executive, concise summary in ${outLang} (Fast Mode).
Use Markdown with these concise sections:
- "## TL;DR": 1-2 rapid sentences capturing the core message.
- "## Key takeaways": 3-5 punchy, high-impact bullet points covering the primary insights.
- "## Concise summary": chronological overview covering major points with [MM:SS] timestamps (use [H:MM:SS] after one hour).
- "## Notable details": key figures, tools, or critical caveats.
- "## Worth your time?": 1 sentence on who it is for and whether it delivers on its title or is clickbait / padded.
EXCLUDE entirely: sponsor segments, paid promotions, ad reads, and self-promotion.
Only report what is actually said or shown. Never invent details, quotes, timestamps or URLs.`
        : `Watch this YouTube video (titled "${this.title}") and write a verbose, faithful summary in ${outLang} (Deep Mode).
Use Markdown with these sections, in this order (omit a section if it does not apply):
- "## TL;DR": 2-3 sentences capturing the core message.
- "## Detailed summary": walk through the video chronologically. Start each part with a heading "### [MM:SS] Section title" (use [H:MM:SS] after one hour), then cover the specific claims, arguments, examples, steps, names, numbers and conclusions … short paragraphs and bullets. Be thorough rather than terse.
- "## Key takeaways": bulleted list.
- "## Notable details": figures, tools, products, brief quotes and caveats that matter.
- "## Worth your time?": 1-2 sentences on who it is for and whether it delivers on its title or is clickbait / padded.
EXCLUDE entirely: sponsor segments, paid promotions and ad reads; and any self-promotion by the creator or guests – merchandise, Patreon/memberships/donation requests, charities or causes unrelated to the video's subject, tour dates or live events, courses, other products or services they sell, and plugs for their other channels, newsletters or social media (including "like and subscribe" requests). Treat these as if they were not in the video: do not summarize, mention or timestamp them, however much runtime they take up. A cause or organization that is genuinely the subject of the video is not self-promotion.
Only report what is actually said or shown. Never invent details, quotes, timestamps or URLs.`;

      if (this.source === 'text') {
        const verb = isFast ? 'an executive, concise summary' : 'a verbose, faithful summary';
        prompt = `Read this timestamped transcript of a YouTube video (titled "${this.title}") and write ${verb} in ${outLang}.\n` + prompt.slice(prompt.indexOf('Use Markdown'));
      }

      if (this.opts.gsearch) {
        prompt += '\nUse Google Search to verify facts. Only include URLs that appear in your search results; never guess or reconstruct a URL.';
      }
      if (this.opts.img) {
        prompt +=
          '\nVisuals: add 2-4 marker lines placed directly after key paragraphs (max 6): "[[FRAME mm:ss | caption]]" for key timestamps in the video where a visual frame, slide, demo, or chart illustrates the point; "[[IMG search terms | caption]]" for a standard diagram/concept illustration to look up on Wikimedia Commons (short generic English terms). Place each marker on its own line.';
      }
      if (this.opts.gen) {
        prompt +=
          '\nAI images: "[[GEN image prompt | caption]]" (max 3). You are only DESIGNING the prompt for an image model (Nano Banana) which draws it afterwards; each prompt must be self-contained (subject, layout, clean flat educational style, short English labels, aspect ratio); no real people\'s likenesses, logos or copyrighted characters.';
      }
      prompt += resolveSummaryPersonaPromptSuffix(this.getSummaryPersona());
      prompt += '\nIf the video is mostly music or has little speech, describe what happens instead.';
      return prompt;
    }

    buildTranscriptPrompt() {
      return `Watch this YouTube video (titled "${this.title}") and produce a complete, accurate transcript of everything spoken, in the original language(s). Markdown; new paragraph per speaker/topic change starting with [MM:SS] ([H:MM:SS] after an hour); label speakers only if >1 voice; do not summarize/paraphrase/skip; mention significant non-speech audio in italics in brackets only when it matters; never invent words or timestamps.`;
    }

    onDone() {
      this.status = 'done';
      this.busy = false;
      this.errMsg = '';
      this.phase = '';
      if (maximizedWindow !== this || document.hidden) {
        this.unread = true;
      }
      // Save to cache before committing
      writeCache(this.videoId, this.mode, this.source, {
        videoId: this.videoId,
        title: this.title,
        gen: this.opts.gen,
        text: this.text,
        sources: this.sources,
        notes: this.notes,
        model: this.modelId,
        usedOpts: this.opts,
        turns: this.turns,
        images: this.images,
        fact: this.fact,
        chapters: this.chapters || []
      }, this.getSummaryPersona());
      this.commit(false);
      this.renderAll();
      this.updateTtsUI();
      updateDockHistoryTab();

      // Trigger automatic fact check if requested and autoFactCheck setting is enabled
      if (
        normalizeAutoFactCheckSetting(this.opts?.autoFactCheck) &&
        (this.opts.fc || this.opts.src) &&
        this.mode === 'summary' &&
        !this.fact
      ) {
        this.runFactCheck();
      }

      // If user initiated "Summarize & Generate Podcast", auto-build podcast once summary arrives
      if (this.podcastAutoGeneratePending && this.text) {
        this.podcastAutoGeneratePending = false;
        this.podcastSummaryText = this.text;
        this.mode = 'podcast';
        this.renderAll();
        this.generatePodcastFromSummary();
      }
    }

    async runFactCheck() {
      if (!this.text || this.mode !== 'summary') return;
      if (this.factStatus === 'loading') return;

      const keyObj = getStoredKeys().find((k) => k.id === this.keyId) || getStoredKeys()[0];
      if (!keyObj || !keyObj.key) {
        this.factStatus = 'error';
        this.factError = 'No Gemini API key configured — add an API key to run Fact-Check & Google Search verification.';
        this.renderBody();
        return;
      }

      this.factStatus = 'loading';
      this.factError = '';
      this.renderBody();

      try {
        const factRes = await runFactCheckPass(this, this.text, { keyObj });
        this.fact = factRes;
        this.factStatus = 'done';
        this.factError = '';
        if (factRes?.fallbackFrom && factRes?.model && factRes.fallbackFrom !== factRes.model) {
          const msg = `ℹ Fact-check model ${factRes.fallbackFrom} unavailable — automatically stepped down to ${factRes.model}.`;
          if (!this.notes.includes(msg)) this.notes.push(msg);
        }
        writeCache(this.videoId, this.mode, this.source, {
          videoId: this.videoId,
          title: this.title,
          gen: this.opts.gen,
          text: this.text,
          sources: this.sources,
          notes: this.notes,
          model: this.modelId,
          usedOpts: this.opts,
          turns: this.turns,
          images: this.images,
          fact: this.fact,
          chapters: this.chapters || []
        }, this.getSummaryPersona());
        this.commit(true);
        this.renderBody();
        updateDockHistoryTab();
      } catch (err) {
        this.factStatus = 'error';
        this.factError = err?.message || 'Fact-check request failed across available models.';
        if (CONFIG.debug) console.warn('[YTAIS] Fact check failed:', err);
        this.renderBody();
      }
    }

    startJob() {
      this.stopTts();
      if (this.currentJob) {
        this.currentJob.abort();
      }
      const job = {
        id: Math.random().toString(36).slice(2),
        cancelled: false,
        abortController: new AbortController(),
        abort() {
          this.cancelled = true;
          this.abortController.abort();
        }
      };
      this.currentJob = job;
      produce(this, job);
    }

    createDockTab() {
      const tab = h('div', {
        className: 'yt-dock-tab',
        'data-dock-video-id': this.videoId,
        onclick: () => this.maximize()
      });

      const iconBox = h('div', { className: 'yt-dock-status-icon' });
      const titleBox = h('div', { className: 'yt-dock-title' });
      const audioCtrls = h('div', { className: 'yt-dock-audio-controls', style: 'display:none;' });
      const audioBadge = h('span', { className: 'yt-dock-audio-badge' });
      const audioToggleBtn = h(
        'button',
        {
          type: 'button',
          className: 'yt-dock-btn yt-dock-audio-toggle-btn',
          title: 'Pause or resume audio',
          'aria-label': 'Pause or resume audio',
          onclick: (e) => {
            e.stopPropagation();
            if (this.podcastStatus === 'playing' || this.podcastStatus === 'paused') {
              this.togglePodcastPlayback();
            } else {
              this.toggleTts();
            }
          }
        },
        iconPause(12)
      );
      const audioStopBtn = h(
        'button',
        {
          type: 'button',
          className: 'yt-dock-btn yt-dock-audio-stop-btn',
          title: 'Stop audio',
          'aria-label': 'Stop audio',
          onclick: (e) => {
            e.stopPropagation();
            this.stopTts();
            this.stopPodcastPlayback();
          }
        },
        iconStop(12)
      );
      audioCtrls.appendChild(audioBadge);
      audioCtrls.appendChild(audioToggleBtn);
      audioCtrls.appendChild(audioStopBtn);

      const maxBtn = h(
        'button',
        {
          className: 'yt-dock-btn yt-dock-max-btn',
          title: 'Maximize window',
          onclick: (e) => {
            e.stopPropagation();
            this.maximize();
          }
        },
        iconMaximize()
      );
      const closeBtn = h(
        'button',
        {
          className: 'yt-dock-btn yt-dock-close-btn',
          title: 'Close window',
          onclick: (e) => {
            e.stopPropagation();
            this.close();
          }
        },
        iconClose()
      );

      tab.appendChild(iconBox);
      tab.appendChild(titleBox);
      tab.appendChild(audioCtrls);
      tab.appendChild(maxBtn);
      tab.appendChild(closeBtn);

      this.dockTab = tab;
      dockContainer.appendChild(tab);
      this.renderDockTab();
      updateDockHistoryTab();
    }

    renderDockTab() {
      if (!this.dockTab) return;
      const tab = this.dockTab;
      tab.className = 'yt-dock-tab';

      if (this.status === 'error') tab.classList.add('error');
      else if (this.unread) tab.classList.add('unread');
      if (this.isOpen && maximizedWindow === this) tab.classList.add('active-focus');

      const podActive = this.podcastStatus === 'playing' || this.podcastStatus === 'paused';
      const ttsActive = this.ttsState === 'playing' || this.ttsState === 'paused';
      const audioActive = podActive || ttsActive;
      const isPlayingNow = (podActive && this.podcastStatus === 'playing') || (ttsActive && this.ttsState === 'playing');

      if (audioActive) {
        tab.classList.add(isPlayingNow ? 'audio-playing' : 'audio-paused');
      }

      const iconBox = tab.querySelector('.yt-dock-status-icon');
      const titleBox = tab.querySelector('.yt-dock-title');
      const audioCtrls = tab.querySelector('.yt-dock-audio-controls');
      const audioBadge = tab.querySelector('.yt-dock-audio-badge');
      const audioToggleBtn = tab.querySelector('.yt-dock-audio-toggle-btn');

      if (iconBox) {
        clearEl(iconBox);
        if (this.status === 'loading') {
          iconBox.appendChild(h('div', { className: 'yt-spinner' }));
        } else if (isPlayingNow) {
          iconBox.appendChild(iconSpeaker(14));
        } else if (this.status === 'done') {
          iconBox.appendChild(iconCheck());
        } else if (this.status === 'error') {
          iconBox.appendChild(iconAlert());
        } else {
          iconBox.appendChild(h('span', { className: 'yt-dock-bullet' }, '•'));
        }
      }

      let statusDesc = 'Idle';
      if (this.status === 'loading') {
        statusDesc = this.owner === TAB_ID ? 'Working…' : 'Working in another tab…';
      } else if (audioActive) {
        statusDesc = `${podActive ? 'Podcast' : 'TTS'} ${isPlayingNow ? 'playing' : 'paused'}`;
      } else if (this.status === 'done') {
        statusDesc = 'Done';
      } else if (this.status === 'error') {
        statusDesc = `Error: ${this.errMsg}`;
      }

      if (audioCtrls && audioBadge && audioToggleBtn) {
        audioCtrls.style.display = audioActive ? 'inline-flex' : 'none';
        if (audioActive) {
          audioBadge.textContent = podActive
            ? (isPlayingNow ? 'Podcast Playing' : 'Podcast Paused')
            : (isPlayingNow ? 'TTS Playing' : 'TTS Paused');
          clearEl(audioToggleBtn);
          audioToggleBtn.appendChild(isPlayingNow ? iconPause(12) : iconPlay(12));
          audioToggleBtn.title = isPlayingNow ? 'Pause playback' : 'Resume playback';
          audioToggleBtn.setAttribute('aria-label', isPlayingNow ? 'Pause playback' : 'Resume playback');
        }
      }

      const prefix = this.mode === 'transcript' ? 'Transcript · ' : this.mode === 'podcast' ? 'Podcast · ' : '';
      titleBox.textContent = prefix + this.title;
      tab.title = `${this.title} — ${statusDesc}`;
    }

    focus() {
      if (!this.isOpen) return;
      topWindowZIndex += 1;
      this.zIndex = topWindowZIndex;
      maximizedWindow = this;
      if (topWindowZIndex > 3000) {
        const sorted = getOpenWindows().sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        sorted.forEach((w, idx) => { w.zIndex = idx + 1; });
        topWindowZIndex = sorted.length + 1;
        this.zIndex = topWindowZIndex;
      }
      for (const win of activeWindows.values()) {
        const zVal = String(2147480000 + Math.min(3500, win.zIndex || 1));
        if (win.windowBox) {
          win.windowBox.classList.toggle('focused', win === this);
          win.windowBox.style.zIndex = zVal;
        }
        if (win.modalScrim) {
          win.modalScrim.style.zIndex = zVal;
        }
        win.renderDockTab();
      }
    }

    maximize() {
      this.unread = false;
      this.isOpen = true;
      topWindowZIndex += 1;
      this.zIndex = topWindowZIndex;
      maximizedWindow = this;
      if (!this.modalScrim || !this.windowBox) {
        this.showModal();
      } else {
        this.focus();
      }
      this.commit(true);
      this.renderDockTab();
      announceLive(`Restored summary window: ${this.title}`);
    }

    cleanupWindowInteractions() {
      if (this._resizeObserver) {
        try { this._resizeObserver.disconnect(); } catch (_) {}
        this._resizeObserver = null;
      }
      if (Array.isArray(this._interactionCleanup) && this._interactionCleanup.length) {
        for (const fn of this._interactionCleanup) {
          try { fn(); } catch (_) {}
        }
        this._interactionCleanup = [];
      }
      if (this.winOverflowMenuEl) {
        try { this.winOverflowMenuEl.remove(); } catch (_) {}
        this.winOverflowMenuEl = null;
      }
      if (this.exportMenuEl) {
        try { this.exportMenuEl.remove(); } catch (_) {}
        this.exportMenuEl = null;
      }
    }

    minimize(skipCommit = false) {
      if (shouldStopPlaybackOnMinimize(getContinueAudioOnMinimize(), skipCommit)) {
        this.stopTts();
        this.stopPodcastPlayback();
      } else if (this.waveformAnimId) {
        cancelAnimationFrame(this.waveformAnimId);
        this.waveformAnimId = null;
      }
      this.cleanupWindowInteractions();
      this.isOpen = false;
      if (this.modalScrim) {
        this.modalScrim.remove();
        this.modalScrim = null;
      }
      this.windowBox = null;
      this.ttsPlayBtn = null;
      this.ttsStopBtn = null;
      this.stopPlayer();

      if (maximizedWindow === this) {
        const remaining = getOpenWindows().sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
        maximizedWindow = remaining[0] || null;
        if (maximizedWindow) {
          maximizedWindow.focus();
        }
      }
      if (!skipCommit && !this.closed) {
        this.commit(true);
        announceLive(`Minimized summary window: ${this.title}`);
      }
      this.renderDockTab();
    }

    close(fromSync = false) {
      this.closed = true;
      if (this.ytThemeObserver) {
        this.ytThemeObserver.disconnect();
        this.ytThemeObserver = null;
      }
      this.cleanupWindowInteractions();
      this.stopTts();
      this.stopPodcastPlayback();
      if (this._speechRecInstance) {
        try { this._speechRecInstance.stop(); } catch (_) {}
        this._speechRecInstance = null;
      }
      this._isListening = false;
      if (this._podcastSpeechRec) {
        try { this._podcastSpeechRec.stop(); } catch (_) {}
        this._podcastSpeechRec = null;
      }
      this._podcastListening = false;
      if (this.currentJob) {
        this.currentJob.abort();
      }
      this.minimize(true);
      if (this.dockTab) {
        this.dockTab.remove();
        this.dockTab = null;
      }
      activeWindows.delete(this.videoId);
      if (activeWindows.size === 0 && windowMonitorTimer) {
        clearInterval(windowMonitorTimer);
        windowMonitorTimer = null;
      }
      if (!fromSync) {
        GM_deleteValue('win:' + this.videoId);
        GM_setValue('sync_ping', { id: this.videoId, tab: TAB_ID, t: Date.now(), n: Math.random() });
      }
      updateDockHistoryTab();
    }

    applyWindowBounds(nextBounds, persist = false) {
      const clamped = clampWindowBounds(nextBounds, {
        width: window.innerWidth || 1280,
        height: window.innerHeight || 800
      });
      this.bounds = clamped;
      if (this.windowBox) {
        this.windowBox.style.left = `${clamped.left}px`;
        this.windowBox.style.top = `${clamped.top}px`;
        this.windowBox.style.width = `${clamped.width}px`;
        this.windowBox.style.height = `${clamped.height}px`;
      }
      this.updateAdaptiveLayout(clamped.width, clamped.height);
      if (persist) {
        setLastWindowBounds(clamped);
        this.commit(true);
      }
      return clamped;
    }

    resizeWindow(width, height) {
      const cur = this.bounds || computeDefaultWindowBounds({ width: window.innerWidth || 1280, height: window.innerHeight || 800 });
      return this.applyWindowBounds({ ...cur, width, height }, true);
    }

    updateAdaptiveLayout(widthOverride, heightOverride) {
      if (!this.windowBox) return;
      const width = Math.round(widthOverride || this.windowBox.clientWidth || this.bounds?.width || 900);
      const height = Math.round(heightOverride || this.windowBox.clientHeight || this.bounds?.height || 680);
      const flags = getAdaptiveWindowFlags(width, height);
      this.sizeTier = flags.tier;
      this.windowBox.classList.toggle('yt-win-compact', flags.isCompact);
      this.windowBox.classList.toggle('yt-win-medium', flags.isMedium);
      this.windowBox.classList.toggle('yt-win-wide', flags.isWide);
      this.windowBox.classList.toggle('yt-win-short', flags.isShort);
      this.windowBox.classList.toggle('yt-tts-compact', flags.compactTtsBar);
      this.windowBox.classList.toggle('yt-tts-narrow', width < 430);
      this.windowBox.setAttribute('data-size-tier', flags.tier);
      this.windowBox.setAttribute('data-short', flags.isShort ? 'true' : 'false');
      this.windowBox.setAttribute('data-compact-tts', flags.compactTtsBar ? 'true' : 'false');

      const optRow = this.windowBox.querySelector('.yt-options-row');
      const compactToggle = this.windowBox.querySelector('.yt-compact-options-btn');
      if (optRow) {
        if (flags.collapseOptionsRow) {
          optRow.classList.toggle('yt-options-collapsed', !this.compactOptionsOpen);
        } else {
          optRow.classList.remove('yt-options-collapsed');
        }
      }
      if (compactToggle) {
        compactToggle.style.display = flags.collapseOptionsRow ? 'inline-flex' : 'none';
        compactToggle.textContent = this.compactOptionsOpen ? 'Options ▴' : 'Options ▾';
      }
    }

    setupWindowInteractions(headerEl, winBox) {
      const cleanupBase = attachFloatingWindowInteractions({
        box: winBox,
        headerEl,
        initialBounds: this.bounds,
        minWidth: 340,
        minHeight: 300,
        ignoreSelector: 'button, a, input, select, .yt-win-header-btns, .yt-win-overflow-menu',
        onFocus: () => this.focus(),
        onApplyBounds: (b) => {
          if (!this.windowBox || !this.isOpen) return;
          this.applyWindowBounds(b, false);
        },
        onSaveBounds: (b) => {
          this.bounds = b;
          setLastWindowBounds(b);
          this.commit(true);
        }
      });
      this._interactionCleanup.push(cleanupBase);

      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const cw = Math.round(entry.contentRect.width);
            const ch = Math.round(entry.contentRect.height);
            if (cw > 0 && ch > 0) {
              this.updateAdaptiveLayout(cw, ch);
            }
          }
        });
        this._resizeObserver.observe(winBox);
      }
    }

    seekPlayer(seconds) {
      const clampedSec = Math.max(0, Math.floor(Number(seconds) || 0));
      this.lastSeekSeconds = clampedSec;
      const tsLabel = formatSecondsToTimestamp(clampedSec);

      // Seek active watch page video element when inspecting the same video
      try {
        const isWatchMatch =
          typeof window !== 'undefined' &&
          window.location?.pathname?.includes('/watch') &&
          window.location?.search?.includes(this.videoId);
        const videoEl = document.querySelector('video.html5-main-video, #movie_player video, video');
        if (videoEl && (isWatchMatch || videoEl.dataset?.videoId === this.videoId)) {
          videoEl.currentTime = clampedSec;
        }
      } catch (_) {}

      if (this.transcriptCues && this.transcriptCues.length > 0) {
        const cueIdx = findTranscriptCueIndexForSeconds(this.transcriptCues, clampedSec);
        if (cueIdx >= 0 && this.transcriptCues[cueIdx]) {
          this.highlightActiveTranscriptLine(this.transcriptCues[cueIdx]);
        }
      }

      if (this.playerSlot) {
        this.playerSlot.style.display = 'block';
        clearEl(this.playerSlot);

        const seekBadge = h(
          'div',
          {
            className: 'yt-player-seek-badge',
            'data-seek-sec': String(clampedSec)
          },
          `Jumped to ${tsLabel}`
        );

        const closePlayer = h(
          'button',
          {
            className: 'yt-player-close-btn',
            title: 'Close player',
            onclick: () => this.stopPlayer()
          },
          iconClose(16)
        );

        const iframe = h('iframe', {
          src: `https://www.youtube.com/embed/${encodeURIComponent(this.videoId)}?start=${clampedSec}&autoplay=1&rel=0`,
          className: 'yt-player-iframe',
          referrerpolicy: 'strict-origin-when-cross-origin',
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
          allowfullscreen: true
        });

        this.playerIframe = iframe;
        this.playerSlot.appendChild(seekBadge);
        this.playerSlot.appendChild(closePlayer);
        this.playerSlot.appendChild(iframe);
      }

      if (this.bodyEl) {
        const chBtns = Array.from(this.bodyEl.querySelectorAll('.yt-chapter-btn'));
        let activeChBtn = null;
        for (const btn of chBtns) {
          const chSec = Number(btn.getAttribute('data-chapter-sec') || '0');
          if (chSec <= clampedSec) activeChBtn = btn;
        }
        chBtns.forEach((btn) => {
          btn.classList.toggle('active', btn === activeChBtn);
        });
      }

      this.showTtsFeedback(`⏱ Jumped to ${tsLabel}`);
      announceLive(`Jumped to ${tsLabel}`);
    }

    stopPlayer() {
      if (this.playerSlot) {
        clearEl(this.playerSlot);
        this.playerSlot.style.display = 'none';
      }
      this.playerIframe = null;
    }

    showModal() {
      this.cleanupWindowInteractions();
      if (this.modalScrim) this.modalScrim.remove();

      this.isOpen = true;
      const clamped = clampWindowBounds(
        this.bounds || computeDefaultWindowBounds({ width: window.innerWidth || 1280, height: window.innerHeight || 800 }),
        { width: window.innerWidth || 1280, height: window.innerHeight || 800 }
      );
      this.bounds = clamped;

      const scrim = h('div', {
        className: 'yt-modal-scrim yt-floating-scrim',
        style: `z-index: ${2147483000 + Math.min(40, this.zIndex)};`
      });

      const winBox = h('div', {
        className: `yt-window-box yt-floating-window ${maximizedWindow === this ? 'focused' : ''} ${this.readabilityMode ? 'yt-readability-active yt-theme-' + this.readabilityTheme : ''}`,
        'data-video-id': this.videoId,
        style: `left:${clamped.left}px;top:${clamped.top}px;width:${clamped.width}px;height:${clamped.height}px;`,
        onwheel: (e) => e.stopPropagation()
      });
      this.windowBox = winBox;
      this.el = winBox;

      // 1. Header
      const header = this.buildHeader();
      winBox.appendChild(header);

      // 2. Toolbar
      const toolbar = this.buildToolbar();
      winBox.appendChild(toolbar);

      // 3. Advanced panel
      const advPanel = this.buildAdvancedPanel();
      winBox.appendChild(advPanel);

      // 4. In-window player slot
      const playerSlot = h('div', { className: 'yt-player-slot', style: 'display:none;' });
      this.playerSlot = playerSlot;
      winBox.appendChild(playerSlot);

      // 5. Body
      const body = h('div', { className: 'yt-window-body' });
      this.bodyEl = body;
      winBox.appendChild(body);

      // 6. Composer pinned below body
      const composer = this.buildComposer();
      winBox.appendChild(composer);

      this.setupWindowInteractions(header, winBox);
      scrim.appendChild(winBox);
      modalsContainer.appendChild(scrim);
      this.modalScrim = scrim;

      this.updateAdaptiveLayout(clamped.width, clamped.height);
      this.focus();
      this.renderBody();
      if (this.ttsState !== 'idle') {
        this.updateTtsUI();
      }
    }

    openHeaderOverflowMenu(anchorEl) {
      if (this.winOverflowMenuEl) {
        this.winOverflowMenuEl.remove();
        this.winOverflowMenuEl = null;
        return;
      }

      const menu = h('div', {
        className: 'yt-win-overflow-menu',
        onclick: (e) => e.stopPropagation()
      });

      const addItem = (iconNode, label, onClick) => {
        const item = h(
          'button',
          {
            className: 'yt-export-item',
            onclick: () => {
              menu.remove();
              this.winOverflowMenuEl = null;
              onClick();
            }
          },
          iconNode,
          h('span', { className: 'yt-export-item-title' }, label)
        );
        menu.appendChild(item);
      };

      addItem(iconGear(15), 'Settings & Appearance', () => openSettingsDialog(() => this.renderAll()));
      addItem(iconExport(15), 'Export (.txt / .pdf / .json / .md)', () => this.openExportMenu(anchorEl));
      addItem(iconHistory(15), 'Previous summaries (History)', () => openHistoryDialog());
      addItem(iconCopy(15), 'Copy video URL', () => {
        const videoUrl = `https://www.youtube.com/watch?v=${this.videoId}`;
        copyTextSafely(videoUrl);
      });
      addItem(iconExternal(15), 'Open video in new tab', () => {
        window.open(`https://www.youtube.com/watch?v=${this.videoId}`, '_blank');
      });

      const rect = anchorEl.getBoundingClientRect();
      const parentRect = (this.windowBox || document.body).getBoundingClientRect();
      menu.style.top = `${rect.bottom - parentRect.top + 6}px`;
      menu.style.right = `${Math.max(8, parentRect.right - rect.right)}px`;

      const closeHandler = (e) => {
        if (!menu.contains(e.target) && e.target !== anchorEl) {
          menu.remove();
          this.winOverflowMenuEl = null;
          document.removeEventListener('click', closeHandler, true);
        }
      };
      setTimeout(() => document.addEventListener('click', closeHandler, true), 30);

      (this.windowBox || modalsContainer).appendChild(menu);
      this.winOverflowMenuEl = menu;
    }

    syncHeaderTitleDom() {
      const state = resolveSummaryWindowDisplayTitle({
        mode: this.titleDisplayMode,
        aiTitle: this.aiTitle,
        originalTitle: this.originalTitle,
        fallbackTitle: this.title
      });
      this._lastHeaderDisplayTitle = state.displayTitle;
      this.title = state.displayTitle;
      const linkEl = this.windowBox?.querySelector('.yt-win-title-link');
      if (linkEl) {
        linkEl.textContent = state.displayTitle;
        linkEl.title = `${state.displayTitle} (Open video in new tab)`;
      }
      const switchBtn = this.windowBox?.querySelector('.yt-win-title-switch-btn');
      if (switchBtn) {
        clearEl(switchBtn);
        switchBtn.appendChild(iconSync(13));
        const label = this.titleSwitching ? '…' : state.mode === 'ai' ? 'Orig' : 'AI';
        switchBtn.appendChild(h('span', {}, label));
        switchBtn.classList.toggle('active-ai', state.mode === 'ai');
        switchBtn.disabled = Boolean(this.titleSwitching);
        switchBtn.title = state.mode === 'ai'
          ? `Showing AI descriptive title — click to switch to original: "${this.originalTitle}"`
          : state.hasAiTitle
            ? `Showing original title — click to switch to AI title: "${this.aiTitle}"`
            : 'Showing original title — click to generate and switch to AI descriptive title';
      }
      this.renderDockTab();
    }

    async toggleHeaderTitleMode() {
      if (this.titleSwitching) return;
      const cachedAi = this.aiTitle || getCachedAltTitle(this.videoId) || '';
      if (cachedAi && !this.aiTitle) this.aiTitle = cachedAi;

      const cur = resolveSummaryWindowDisplayTitle({
        mode: this.titleDisplayMode,
        aiTitle: this.aiTitle,
        originalTitle: this.originalTitle,
        fallbackTitle: this.title
      });

      if (cur.mode === 'ai') {
        this.titleDisplayMode = 'original';
        this.syncHeaderTitleDom();
        this.commit(true);
        return;
      }

      if (this.aiTitle) {
        this.titleDisplayMode = 'ai';
        this.syncHeaderTitleDom();
        this.commit(true);
        return;
      }

      this.titleSwitching = true;
      this.syncHeaderTitleDom();
      try {
        const gen = await generateAlternativeTitle(this.videoId, this.originalTitle);
        if (gen) {
          this.aiTitle = gen;
          this.titleDisplayMode = 'ai';
          this.commit(true);
        } else {
          showGlobalToast('AI title unavailable — summarize video or add an API key first');
        }
      } catch (_) {
        showGlobalToast('Could not generate AI title right now');
      } finally {
        this.titleSwitching = false;
        this.syncHeaderTitleDom();
      }
    }

    buildHeader() {
      const header = h('div', { className: 'yt-win-header', title: 'Drag header to move window' });
      const titleCol = h('div', { className: 'yt-win-title-col' });
      const titleRow = h('div', { className: 'yt-win-title-row' });
      if (this.title && this.title !== this._lastHeaderDisplayTitle) {
        if (this.titleDisplayMode === 'ai' && this.aiTitle && this.title !== this.aiTitle) {
          this.aiTitle = this.title;
        } else if (this.title !== this.aiTitle) {
          this.originalTitle = this.title;
        }
      }
      const titleState = resolveSummaryWindowDisplayTitle({
        mode: this.titleDisplayMode,
        aiTitle: this.aiTitle || getCachedAltTitle(this.videoId) || '',
        originalTitle: this.originalTitle,
        fallbackTitle: this.title
      });
      this._lastHeaderDisplayTitle = titleState.displayTitle;
      this.title = titleState.displayTitle;
      const titleEl = h(
        'a',
        {
          className: 'yt-win-title yt-win-title-link',
          href: `https://www.youtube.com/watch?v=${this.videoId}`,
          target: '_blank',
          rel: 'noopener noreferrer',
          title: `${titleState.displayTitle} (Open video in new tab)`
        },
        titleState.displayTitle
      );
      const titleSwitchBtn = h(
        'button',
        {
          type: 'button',
          className: `yt-win-title-switch-btn ${titleState.mode === 'ai' ? 'active-ai' : ''}`,
          'aria-label': titleState.mode === 'ai' ? 'Switch to original video title' : 'Switch to AI-generated title',
          title:
            titleState.mode === 'ai'
              ? `Showing AI title — click for original: "${this.originalTitle}"`
              : titleState.hasAiTitle
                ? `Showing original title — click for AI: "${this.aiTitle}"`
                : 'Generate & switch to AI descriptive title',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleHeaderTitleMode();
          }
        },
        iconSync(13),
        h('span', {}, this.titleSwitching ? '…' : titleState.mode === 'ai' ? 'Orig' : 'AI')
      );
      const statusLine = h('div', { className: 'yt-win-status-line' });
      this.statusLineEl = statusLine;
      titleRow.appendChild(titleEl);
      titleRow.appendChild(titleSwitchBtn);
      titleCol.appendChild(titleRow);
      titleCol.appendChild(statusLine);

      const btnGroup = h('div', { className: 'yt-win-header-btns' });

      const readabilityBtn = h(
        'button',
        {
          className: `yt-win-btn yt-win-readability-btn ${this.readabilityMode ? 'active' : ''}`,
          title: this.readabilityMode
            ? 'Exit Readability Mode (Return to standard interactive view)'
            : 'Readability Mode (Clean, centered distraction-free reader)',
          onclick: () => this.toggleReadability()
        },
        iconBook(18)
      );

      const settingsBtn = h(
        'button',
        {
          className: 'yt-win-btn yt-win-settings-btn',
          title: 'Settings, Theme & Typography Formatting',
          'aria-label': 'Settings',
          onclick: (e) => {
            e.stopPropagation();
            openSettingsDialog(() => this.renderAll());
          }
        },
        iconGear(18)
      );

      const exportBtn = h(
        'button',
        {
          className: 'yt-win-btn yt-win-export-btn yt-win-secondary-btn',
          title: 'Export summary / transcript (.txt, .pdf, or .json)',
          onclick: (e) => {
            e.stopPropagation();
            this.openExportMenu(exportBtn);
          }
        },
        iconExport(18)
      );

      const historyBtn = h(
        'button',
        {
          className: 'yt-win-btn yt-win-history-btn yt-win-secondary-btn',
          title: 'Browse previous summaries (History)',
          onclick: () => openHistoryDialog()
        },
        iconHistory(18)
      );

      const copyUrlBtn = h(
        'button',
        {
          className: 'yt-win-btn yt-win-copy-btn yt-win-secondary-btn',
          title: 'Copy video URL',
          onclick: () => {
            const videoUrl = `https://www.youtube.com/watch?v=${this.videoId}`;
            copyTextSafely(videoUrl);
            copyUrlBtn.classList.add('copied');
            clearEl(copyUrlBtn);
            copyUrlBtn.appendChild(iconCheck(18));
            copyUrlBtn.title = 'Copied video URL!';
            setTimeout(() => {
              copyUrlBtn.classList.remove('copied');
              clearEl(copyUrlBtn);
              copyUrlBtn.appendChild(iconCopy(18));
              copyUrlBtn.title = 'Copy video URL';
            }, 1800);
          }
        },
        iconCopy(18)
      );

      const openUrlBtn = h(
        'button',
        {
          className: 'yt-win-btn yt-win-open-btn yt-win-secondary-btn',
          title: 'Open video in new tab',
          onclick: () => {
            window.open(`https://www.youtube.com/watch?v=${this.videoId}`, '_blank');
          }
        },
        iconExternal(18)
      );

      const overflowBtn = h(
        'button',
        {
          className: 'yt-win-btn yt-win-overflow-btn',
          title: 'More actions',
          'aria-label': 'More window actions',
          onclick: (e) => {
            e.stopPropagation();
            this.openHeaderOverflowMenu(overflowBtn);
          }
        },
        iconMoreVert(18)
      );

      const minBtn = h(
        'button',
        {
          className: 'yt-win-btn yt-win-min-btn',
          title: 'Minimize (Esc)',
          onclick: () => this.minimize()
        },
        iconMinimize(20)
      );
      const closeBtn = h(
        'button',
        {
          className: 'yt-win-btn yt-win-close-btn',
          title: 'Close window',
          onclick: () => this.close()
        },
        iconClose(20)
      );

      btnGroup.appendChild(readabilityBtn);
      btnGroup.appendChild(settingsBtn);
      btnGroup.appendChild(exportBtn);
      btnGroup.appendChild(historyBtn);
      btnGroup.appendChild(copyUrlBtn);
      btnGroup.appendChild(openUrlBtn);
      btnGroup.appendChild(overflowBtn);
      btnGroup.appendChild(minBtn);
      btnGroup.appendChild(closeBtn);

      const dragGrip = h(
        'button',
        {
          className: 'yt-win-drag-grip',
          type: 'button',
          tabindex: '0',
          'aria-label': 'Move summary window with arrow keys',
          title: 'Drag or press Arrow keys (Shift for larger steps) to move window'
        },
        iconDragGrip(16)
      );

      header.appendChild(dragGrip);
      header.appendChild(titleCol);
      header.appendChild(btnGroup);
      this.renderStatus();
      return header;
    }

    renderStatus() {
      if (!this.statusLineEl) return;
      clearEl(this.statusLineEl);

      let text = 'Idle';
      if (this.status === 'loading') {
        text = this.owner === TAB_ID ? (this.phase || 'Working…') : 'Working in another tab…';
      } else if (this.status === 'done') {
        text = this.cacheDate ? `Cached from ${new Date(this.cacheDate).toLocaleDateString()}` : 'Completed';
      } else if (this.status === 'error') {
        text = `Error: ${this.errMsg}`;
      }
      this.statusLineEl.textContent = text;
      this.renderDockTab();
    }

    buildToolbar() {
      const toolbar = h('div', { className: 'yt-win-toolbar' });

      // Row 1
      const r1 = h('div', { className: 'yt-toolbar-row' });

      // Mode toggle
      const modeWrap = h('div', { className: 'yt-segmented-btn' });
      const sumBtn = h(
        'button',
        {
          className: `yt-seg-btn ${this.mode === 'summary' ? 'active' : ''}`,
          disabled: this.status === 'loading',
          onclick: () => {
            if (this.mode !== 'summary') {
              this.stopPodcastPlayback();
              this.mode = 'summary';
              this.onModeOrSourceChanged();
            }
          }
        },
        'Summarize'
      );
      const trnBtn = h(
        'button',
        {
          className: `yt-seg-btn ${this.mode === 'transcript' ? 'active' : ''}`,
          disabled: this.status === 'loading',
          onclick: () => {
            if (this.mode !== 'transcript') {
              this.stopPodcastPlayback();
              this.mode = 'transcript';
              this.onModeOrSourceChanged();
            }
          }
        },
        'Transcribe'
      );
      const podBtn = h(
        'button',
        {
          className: `yt-seg-btn yt-podcast-mode-btn ${this.mode === 'podcast' ? 'active' : ''}`,
          disabled: this.status === 'loading',
          title: 'Interactive multi-host NotebookLM-style podcast studio',
          onclick: () => this.switchToPodcastMode()
        },
        'Podcast'
      );
      modeWrap.appendChild(sumBtn);
      modeWrap.appendChild(trnBtn);
      modeWrap.appendChild(podBtn);
      r1.appendChild(modeWrap);

      // Source toggle
      const srcWrap = h('div', { className: 'yt-segmented-btn' });
      const vidBtn = h(
        'button',
        {
          className: `yt-seg-btn ${this.source === 'video' ? 'active' : ''}`,
          disabled: this.status === 'loading' || this.modelId.includes('Ask'),
          onclick: () => {
            if (this.source !== 'video') {
              this.source = 'video';
              setLastSource('video');
              this.onModeOrSourceChanged();
            }
          }
        },
        'Video'
      );
      const txtBtn = h(
        'button',
        {
          className: `yt-seg-btn ${this.source === 'text' ? 'active' : ''}`,
          disabled: this.status === 'loading' || this.modelId.includes('Ask'),
          onclick: () => {
            if (this.source !== 'text') {
              this.source = 'text';
              setLastSource('text');
              this.onModeOrSourceChanged();
            }
          }
        },
        'Transcript'
      );
      srcWrap.appendChild(vidBtn);
      srcWrap.appendChild(txtBtn);
      r1.appendChild(srcWrap);

      // Model select + recheck
      const modelWrap = h('div', { className: 'yt-control-wrap' });
      const modelSel = h('select', {
        className: 'yt-select yt-model-select',
        onchange: (e) => {
          if (e.target.value === '__custom__') {
            const custom = prompt('Enter custom Gemini model ID (e.g. gemini-3.8-flash):');
            if (custom && custom.trim()) {
              addCustomModel(custom.trim());
              this.modelId = custom.trim();
              setLastModel(this.modelId);
            }
          } else {
            this.modelId = e.target.value;
            setLastModel(this.modelId);
          }
          if (this.modelId.includes('Ask')) {
            this.source = 'video';
          }
          this.commit(true);
          if (this.status === 'loading' || this.status === 'error') {
            this.startJob();
          }
          this.renderAll();
        }
      });
      this.populateModelSelect(modelSel);
      const recheckBtn = h(
        'button',
        {
          className: 'yt-icon-tool-btn',
          title: 'Re-check models',
          onclick: async () => {
            const keyObj = getStoredKeys().find((k) => k.id === this.keyId) || getStoredKeys()[0];
            if (keyObj) {
              await checkModelsForKey(keyObj, true);
              this.populateModelSelect(modelSel);
            }
          }
        },
        iconRefresh(16)
      );
      modelWrap.appendChild(modelSel);
      modelWrap.appendChild(recheckBtn);
      r1.appendChild(modelWrap);

      // Key select + manage keys button
      const keyWrap = h('div', { className: 'yt-control-wrap' });
      const keySel = h('select', {
        className: 'yt-select yt-key-select',
        onchange: (e) => {
          if (e.target.value === '__manage__') {
            openKeyManagerDialog(() => this.renderAll());
          } else {
            this.keyId = e.target.value;
            setLastKeyId(this.keyId);
            this.commit(true);
            if (this.status === 'loading' || this.status === 'error') {
              this.startJob();
            }
            this.renderAll();
          }
        }
      });
      this.populateKeySelect(keySel);
      const gearBtn = h(
        'button',
        {
          className: 'yt-icon-tool-btn',
          title: 'Manage API keys',
          onclick: () => openKeyManagerDialog(() => this.renderAll())
        },
        iconGear(16)
      );
      const histBtn = h(
        'button',
        {
          className: 'yt-icon-tool-btn yt-history-btn',
          title: 'Browse previous summaries (History)',
          onclick: () => openHistoryDialog()
        },
        iconHistory(16)
      );
      keyWrap.appendChild(keySel);
      keyWrap.appendChild(gearBtn);
      keyWrap.appendChild(histBtn);
      r1.appendChild(keyWrap);

      // Spacer
      r1.appendChild(h('div', { className: 'yt-spacer' }));

      // TTS Speech Controls
      const ttsControls = this.buildTtsControls();
      r1.appendChild(ttsControls);

      // Primary Action Button
      let btnLabel = this.mode === 'transcript' ? 'Transcribe' : this.mode === 'podcast' ? (this.podcastEpisode ? 'Regenerate Podcast' : 'Generate Podcast') : 'Start';
      if (this.status === 'loading') btnLabel = 'Restart';
      else if (this.mode !== 'podcast' && this.status === 'done') btnLabel = 'Regenerate';

      const actionBtn = h(
        'button',
        {
          className: 'yt-primary-btn',
          onclick: () => {
            if (this.mode === 'podcast') {
              this.generatePodcastFromSummary();
              return;
            }
            if (this.status === 'done' && this.turns.length > 0) {
              if (!confirm('Regenerating will clear your follow-up conversation. Continue?')) {
                return;
              }
            }
            this.turns = [];
            this.startJob();
          }
        },
        btnLabel
      );
      r1.appendChild(actionBtn);

      // Row 2
      const r2 = h('div', { className: 'yt-toolbar-row yt-options-row' });
      const isTranscribe = this.mode === 'transcript';
      const isAsk = this.modelId.includes('Ask');

      if (!isTranscribe) {
        const fcCheck = this.buildCheckbox('Fact-check', this.opts.fc, (v) => {
          this.opts.fc = v;
          this.saveOpts();
          if (v && this.mode === 'summary' && this.text && !this.fact) {
            this.runFactCheck();
          } else {
            this.renderBody();
          }
        });
        const imgCheck = this.buildCheckbox(
          isAsk ? 'Images & diagrams (Gemini coordinator)' : 'Images & diagrams',
          this.opts.img,
          (v) => {
            this.opts.img = v;
            this.saveOpts();
            this.renderBody();
          }
        );
        const srcCheck = this.buildCheckbox('Source links', this.opts.src, (v) => {
          this.opts.src = v;
          this.saveOpts();
          if (v && this.mode === 'summary' && this.text && !this.fact) {
            this.runFactCheck();
          } else {
            this.renderBody();
          }
        });
        const genCheck = this.buildCheckbox(
          isAsk ? 'AI images (Nano Banana)' : 'AI images',
          this.opts.gen,
          (v) => {
            this.opts.gen = v;
            this.saveOpts();
          }
        );

        r2.appendChild(fcCheck);
        r2.appendChild(imgCheck);
        r2.appendChild(srcCheck);
        r2.appendChild(genCheck);

        // Transcript Processing Panel
        const tpPanel = h('div', {
          className: 'yt-transcript-processing-panel',
          title: 'Transcript Processing: Choose between Fast (Concise executive brief) and Deep (Detailed exhaustive breakdown)'
        });
        const tpLabel = h('span', { className: 'yt-tp-label' }, 'Transcript Processing:');
        const tpFastBtn = h(
          'button',
          {
            className: `yt-tp-btn yt-tp-fast-btn ${this.opts.transcriptMode === 'fast' || !this.opts.transcriptMode ? 'active' : ''}`,
            title: 'Fast (Concise): Rapid executive takeaways (< 2 min read), punchy bullet points, high signal-to-noise ratio',
            onclick: () => {
              this.opts.transcriptMode = 'fast';
              this.saveOpts();
              tpFastBtn.classList.add('active');
              tpDeepBtn.classList.remove('active');
            }
          },
          '⚡ Fast (Concise)'
        );
        const tpDeepBtn = h(
          'button',
          {
            className: `yt-tp-btn yt-tp-deep-btn ${this.opts.transcriptMode === 'deep' ? 'active' : ''}`,
            title: 'Deep (Detailed): Exhaustive chronological analysis with timestamped sections, technical depth, and complete context',
            onclick: () => {
              this.opts.transcriptMode = 'deep';
              this.saveOpts();
              tpDeepBtn.classList.add('active');
              tpFastBtn.classList.remove('active');
            }
          },
          '🔍 Deep (Detailed)'
        );
        tpPanel.appendChild(tpLabel);
        tpPanel.appendChild(tpFastBtn);
        tpPanel.appendChild(tpDeepBtn);
        r2.appendChild(tpPanel);

        // FEAT-03: Summary Persona Preset selector
        const currentPersona = this.getSummaryPersona();
        const personaSelect = h(
          'select',
          {
            className: 'yt-select yt-persona-select',
            'aria-label': 'Summary Persona Preset',
            title: SUMMARY_PERSONA_PRESETS[currentPersona]?.description || 'Choose summary persona preset',
            onchange: (e) => {
              const nextPersona = setDefaultSummaryPersona(e.target.value);
              this.opts.persona = nextPersona;
              this.saveOpts();
              this.onModeOrSourceChanged();
              announceLive(`Summary persona switched to ${SUMMARY_PERSONA_PRESETS[nextPersona].label}`);
            }
          },
          ...Object.values(SUMMARY_PERSONA_PRESETS).map((p) =>
            h('option', { value: p.id, selected: currentPersona === p.id }, p.label)
          )
        );
        this.personaSelectEl = personaSelect;
        r2.appendChild(personaSelect);
      }

      const autoCheck = this.buildCheckbox('Auto-start', getAutoStart(), (v) => {
        setAutoStart(v);
      });
      r2.appendChild(autoCheck);

      r2.appendChild(h('div', { className: 'yt-spacer' }));

      const advToggle = h(
        'button',
        {
          className: 'yt-link-btn',
          onclick: () => {
            const panel = this.windowBox.querySelector('.yt-adv-panel');
            if (panel) {
              const isHidden = panel.style.display === 'none';
              panel.style.display = isHidden ? 'grid' : 'none';
              advToggle.textContent = isHidden ? 'Advanced ▴' : 'Advanced ▾';
            }
          }
        },
        'Advanced ▾'
      );
      r2.appendChild(advToggle);

      const compactBar = h('div', { className: 'yt-compact-options-bar' });
      const compactOptsBtn = h(
        'button',
        {
          className: 'yt-link-btn yt-compact-options-btn',
          style: 'display:none;',
          onclick: () => {
            this.compactOptionsOpen = !this.compactOptionsOpen;
            this.updateAdaptiveLayout();
          }
        },
        this.compactOptionsOpen ? 'Options ▴' : 'Options ▾'
      );
      const compactAdvBtn = h(
        'button',
        {
          className: 'yt-link-btn yt-compact-adv-btn',
          onclick: () => {
            const panel = this.windowBox?.querySelector('.yt-adv-panel');
            if (panel) {
              const isHidden = panel.style.display === 'none';
              panel.style.display = isHidden ? 'grid' : 'none';
            }
          }
        },
        'Advanced ▾'
      );
      compactBar.appendChild(compactOptsBtn);
      compactBar.appendChild(compactAdvBtn);

      toolbar.appendChild(r1);
      toolbar.appendChild(compactBar);
      toolbar.appendChild(r2);
      return toolbar;
    }

    buildTtsControls() {
      const wrap = h('div', { className: 'yt-tts-group' });
      const canPlay = this.status === 'done' && Boolean(this.text);

      const playBtn = h(
        'button',
        {
          className: `yt-tts-btn yt-tts-play-btn ${this.ttsState === 'playing' ? 'active' : ''}`,
          title:
            this.ttsState === 'loading'
              ? 'Generating AI Studio neural speech…'
              : this.ttsState === 'playing'
              ? 'Pause speech'
              : this.ttsState === 'paused'
              ? 'Resume speech'
              : 'Listen to summary (Google AI Studio neural speech or browser voice)',
          disabled: !canPlay || this.ttsState === 'loading',
          onclick: () => this.toggleTts()
        },
        this.ttsState === 'loading'
          ? h('div', { className: 'yt-spinner', style: 'width:12px;height:12px;margin-right:2px;' })
          : this.ttsState === 'playing'
          ? iconPause(14)
          : this.ttsState === 'paused'
          ? iconPlay(14)
          : iconSpeaker(14),
        h(
          'span',
          {},
          this.ttsState === 'loading'
            ? 'Generating…'
            : this.ttsState === 'playing'
            ? 'Pause'
            : this.ttsState === 'paused'
            ? 'Resume'
            : 'Listen'
        )
      );
      this.ttsPlayBtn = playBtn;

      const rewindBtn = h(
        'button',
        {
          className: 'yt-tts-btn yt-tts-rewind-btn',
          title: 'Rewind 5s (Left Arrow or J)',
          disabled: !canPlay || (this.ttsState === 'idle' && !this.ttsAudioEl && !this.ttsUtterance),
          onclick: () => this.rewindTts(5)
        },
        iconRewind(12),
        h('span', {}, '5s')
      );
      this.ttsRewindBtn = rewindBtn;

      const skipBtn = h(
        'button',
        {
          className: 'yt-tts-btn yt-tts-skip-btn',
          title: 'Skip 5s (Right Arrow or L)',
          disabled: !canPlay || (this.ttsState === 'idle' && !this.ttsAudioEl && !this.ttsUtterance),
          onclick: () => this.skipTts(5)
        },
        iconSkip(12),
        h('span', {}, '5s')
      );
      this.ttsSkipBtn = skipBtn;

      const stopBtn = h(
        'button',
        {
          className: 'yt-tts-btn yt-tts-stop-btn',
          title: 'Stop speech',
          disabled: !canPlay || (this.ttsState === 'idle' && !this.ttsAudioEl && !this.ttsUtterance),
          onclick: () => this.stopTts()
        },
        iconStop(12),
        h('span', {}, 'Stop')
      );
      this.ttsStopBtn = stopBtn;

      // Predefined buttons (0.5x, 0.75x, 1x, 1.25x, 1.5x, 1.75x, 2x) & speed slider
      const rateIndicator = h('span', {
        className: `yt-tts-speed-indicator ${this.ttsRate > 1.0 ? 'speed-boost' : this.ttsRate < 1.0 ? 'speed-slow' : 'speed-normal'}`
      });
      const rateText = h('span', { className: 'yt-tts-speed-text' }, `${this.ttsRate}x`);
      const rateBtn = h(
        'button',
        {
          className: 'yt-tts-btn yt-tts-speed-btn',
          title: `Playback speed: ${this.ttsRate}x (click to cycle 0.25x steps)`,
          disabled: !canPlay,
          onclick: () => this.cycleTtsRate()
        },
        rateIndicator,
        rateText
      );
      this.ttsRateBtn = rateBtn;

      const speedWrap = h('div', {
        className: 'yt-tts-speed-wrap',
        title: `Playback speed: ${this.ttsRate}x`
      });

      const speedBtnsWrap = h('div', { className: 'yt-tts-speed-btns' });
      this.ttsSpeedBtns = [];
      const presetRates = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
      for (const r of presetRates) {
        const label = `${r}x`;
        const btn = h(
          'button',
          {
            className: `yt-tts-rate-pill yt-tts-rate-btn ${Math.abs(this.ttsRate - r) < 0.01 ? 'active' : ''}`,
            title: `Set playback speed to ${label}`,
            'data-rate': String(r),
            disabled: !canPlay,
            onclick: () => this.setTtsRate(r)
          },
          label
        );
        this.ttsSpeedBtns.push(btn);
        speedBtnsWrap.appendChild(btn);
      }

      const speedSliderRow = h('div', { className: 'yt-tts-slider-row yt-tts-speed-slider-row' });
      const speedSlider = h('input', {
        type: 'range',
        className: 'yt-tts-speed-slider',
        min: '0.5',
        max: '2',
        step: '0.05',
        value: String(this.ttsRate),
        title: `Playback speed: ${this.ttsRate}x`,
        disabled: !canPlay,
        oninput: (e) => {
          this.setTtsRate(parseFloat(e.target.value));
        }
      });
      const speedLabel = h('span', { className: 'yt-tts-speed-label' }, `${this.ttsRate}x`);
      speedSliderRow.appendChild(speedSlider);
      speedSliderRow.appendChild(speedLabel);

      speedWrap.appendChild(speedBtnsWrap);
      speedWrap.appendChild(speedSliderRow);

      this.ttsSpeedWrap = speedWrap;
      this.ttsSpeedSlider = speedSlider;
      this.ttsSpeedLabel = speedLabel;

      // Voice Selector dropdown (Google AI Studio neural voices + Browser voices)
      const voiceSelect = h('select', {
        className: 'yt-select yt-tts-voice-select',
        title: 'Choose speech voice: Google AI Studio Neural Voices (natural) or Browser Voices',
        onchange: (e) => {
          this.setTtsVoice(e.target.value);
          if (this.ttsState === 'playing') {
            this.stopTts();
            this.startTts();
          }
        }
      });
      this.ttsVoiceSelect = voiceSelect;
      this.populateTtsVoices(voiceSelect);

      // Volume control slider alongside speed controls
      const volWrap = h('div', {
        className: 'yt-tts-volume-wrap',
        title: `Speech volume: ${Math.round(this.ttsVolume * 100)}%`
      });
      const volIcon = h('span', { className: 'yt-tts-volume-icon' }, iconSpeaker(12));
      const volSlider = h('input', {
        type: 'range',
        className: 'yt-tts-volume-slider',
        min: '0',
        max: '1',
        step: '0.05',
        value: String(this.ttsVolume),
        title: `Speech volume: ${Math.round(this.ttsVolume * 100)}%`,
        oninput: (e) => {
          this.setTtsVolume(parseFloat(e.target.value));
        }
      });
      const volLabel = h('span', { className: 'yt-tts-volume-label' }, `${Math.round(this.ttsVolume * 100)}%`);

      volWrap.appendChild(volIcon);
      volWrap.appendChild(volSlider);
      volWrap.appendChild(volLabel);

      this.ttsVolumeWrap = volWrap;
      this.ttsVolumeSlider = volSlider;
      this.ttsVolumeLabel = volLabel;

      // Pitch control slider (0.5x - 2.0x) to customize voice character
      const pitchWrap = h('div', {
        className: 'yt-tts-pitch-wrap',
        title: `Voice pitch: ${this.ttsPitch}x`
      });
      const pitchIcon = h('span', { className: 'yt-tts-pitch-icon', title: 'Voice pitch character' }, iconMusic(12));
      const pitchSlider = h('input', {
        type: 'range',
        className: 'yt-tts-pitch-slider',
        min: '0.5',
        max: '2',
        step: '0.05',
        value: String(this.ttsPitch),
        title: `Voice pitch: ${this.ttsPitch}x`,
        disabled: !canPlay,
        oninput: (e) => {
          this.setTtsPitch(parseFloat(e.target.value));
        }
      });
      const pitchLabel = h('span', { className: 'yt-tts-pitch-label' }, `${this.ttsPitch}x`);

      pitchWrap.appendChild(pitchIcon);
      pitchWrap.appendChild(pitchSlider);
      pitchWrap.appendChild(pitchLabel);

      this.ttsPitchWrap = pitchWrap;
      this.ttsPitchSlider = pitchSlider;
      this.ttsPitchLabel = pitchLabel;

      // Skip Silence toggle button
      const skipSilenceBtn = h(
        'button',
        {
          className: `yt-tts-btn yt-tts-skip-silence-btn ${this.skipSilence ? 'active' : ''}`,
          title: this.skipSilence
            ? 'Skip Silence: ON (Automatically detecting and skipping long pauses or gap segments in transcript)'
            : 'Skip Silence: OFF (Click to automatically detect and skip segments with long pauses)',
          disabled: !canPlay,
          onclick: () => this.setSkipSilence(!this.skipSilence)
        },
        iconSkipSilence(12),
        h('span', { className: 'yt-tts-skip-silence-label' }, 'Skip Silence')
      );
      this.ttsSkipSilenceBtn = skipSilenceBtn;

      // Dynamic audio waveform visualizer (reflects real-time speech amplitude & frequencies)
      const waveformWrap = h('div', {
        className: 'yt-tts-waveform-wrap',
        title: 'Dynamic audio waveform reflecting real-time speech synthesis amplitude'
      });
      const waveformCanvas = h('canvas', {
        className: 'yt-tts-waveform-canvas',
        width: 68,
        height: 18
      });
      const waveformBars = h('div', { className: 'yt-tts-waveform-bars' });
      const barCount = 12;
      this.ttsWaveformBars = [];
      for (let i = 0; i < barCount; i++) {
        const bar = h('span', { className: 'yt-tts-waveform-bar' });
        this.ttsWaveformBars.push(bar);
        waveformBars.appendChild(bar);
      }
      waveformWrap.appendChild(waveformCanvas);
      waveformWrap.appendChild(waveformBars);
      this.ttsWaveformWrap = waveformWrap;
      this.ttsWaveformCanvas = waveformCanvas;

      wrap.appendChild(playBtn);
      wrap.appendChild(rewindBtn);
      wrap.appendChild(skipBtn);
      wrap.appendChild(stopBtn);
      wrap.appendChild(waveformWrap);
      wrap.appendChild(rateBtn);
      wrap.appendChild(speedWrap);
      wrap.appendChild(volWrap);
      wrap.appendChild(pitchWrap);
      wrap.appendChild(skipSilenceBtn);
      wrap.appendChild(voiceSelect);
      const shortcutsHint = h(
        'span',
        {
          className: 'yt-tts-shortcuts-hint',
          title: 'Global TTS Shortcuts:\n• Space or K: Play / Pause\n• ← or J: Rewind 5s / 10s\n• → or L: Skip 5s / 10s\n• ↑ / ↓: Volume Up / Down\n• [ / ]: Speed Down / Up\n• M: Mute / Unmute'
        },
        '⌨ Space • ← • →'
      );
      wrap.appendChild(shortcutsHint);
      return wrap;
    }

    setSkipSilence(val) {
      const s = Boolean(val);
      this.skipSilence = s;
      this.opts.skipSilence = s;
      this.saveOpts();
      if (this.ttsSkipSilenceBtn) {
        this.ttsSkipSilenceBtn.classList.toggle('active', s);
        this.ttsSkipSilenceBtn.title = s
          ? 'Skip Silence: ON (Automatically detecting and skipping long pauses or gap segments in transcript)'
          : 'Skip Silence: OFF (Click to automatically detect and skip segments with long pauses)';
      }
      this.showTtsFeedback(s ? '⚡ Skip Silence: ON' : '⏸ Skip Silence: OFF');
      if (this.ttsState === 'playing') {
        this.stopTts();
        this.startTts();
      }
    }

    setTtsRate(val) {
      const r = typeof val === 'number' && !isNaN(val) ? Math.max(0.5, Math.min(2.0, val)) : 1.0;
      this.ttsRate = r;
      setLastTtsRate(r);
      if (this.ttsUtterance) {
        this.ttsUtterance.rate = r;
      }
      if (this.ttsAudioEl) {
        this.ttsAudioEl.playbackRate = r;
      }
      this.updateTtsUI();
    }

    setTtsVolume(val) {
      const v = typeof val === 'number' && !isNaN(val) ? Math.max(0, Math.min(1, val)) : 1.0;
      this.ttsVolume = v;
      setLastTtsVolume(v);
      if (this.ttsAudioEl) {
        this.ttsAudioEl.volume = v;
      }
      if (this.ttsVolumeSlider && this.ttsVolumeSlider.value !== String(v)) {
        this.ttsVolumeSlider.value = String(v);
      }
      if (this.ttsVolumeSlider) {
        this.ttsVolumeSlider.title = `Speech volume: ${Math.round(v * 100)}%`;
      }
      if (this.ttsVolumeLabel) {
        this.ttsVolumeLabel.textContent = `${Math.round(v * 100)}%`;
      }
      if (this.ttsVolumeWrap) {
        this.ttsVolumeWrap.title = `Speech volume: ${Math.round(v * 100)}%`;
      }
    }

    setTtsPitch(val) {
      const p = typeof val === 'number' && !isNaN(val) ? Math.max(0.5, Math.min(2.0, val)) : 1.0;
      this.ttsPitch = Math.round(p * 100) / 100;
      setLastTtsPitch(this.ttsPitch);
      if (this.ttsUtterance) {
        this.ttsUtterance.pitch = this.ttsPitch;
      }
      if (this.ttsPitchSlider && Math.abs(parseFloat(this.ttsPitchSlider.value) - this.ttsPitch) > 0.01) {
        this.ttsPitchSlider.value = String(this.ttsPitch);
      }
      if (this.ttsPitchSlider) {
        this.ttsPitchSlider.title = `Voice pitch: ${this.ttsPitch}x`;
      }
      if (this.ttsPitchLabel) {
        this.ttsPitchLabel.textContent = `${this.ttsPitch}x`;
      }
      if (this.ttsPitchWrap) {
        this.ttsPitchWrap.title = `Voice pitch: ${this.ttsPitch}x`;
      }
      this.commit(true);
    }

    getTtsVoice() {
      return this.ttsVoice || getLastTtsVoice() || CONFIG.defaultTtsVoice;
    }

    setTtsVoice(v) {
      this.ttsVoice = v;
      setLastTtsVoice(v);
      this.commit(true);
    }

    populateTtsVoices(select) {
      if (!select) return;
      clearEl(select);
      const currentVoice = this.getTtsVoice();

      // 1. Google AI Studio Neural Voices (Human-like, non-robotic!)
      const aiGroup = h('optgroup', { label: 'Google AI Studio (Neural AI Voices)' });
      for (const v of CONFIG.aiVoices) {
        aiGroup.appendChild(h('option', { value: v.id }, v.name));
      }
      select.appendChild(aiGroup);

      // 2. Browser Voices Group (speechSynthesis)
      const browserGroup = h('optgroup', { label: 'Browser Voices' });
      const browserVoices = typeof window !== 'undefined' && window.speechSynthesis?.getVoices
        ? window.speechSynthesis.getVoices()
        : [];

      // Sort: Google and Natural voices at top of browser voices
      const sorted = browserVoices.slice().sort((a, b) => {
        const aGoogle = a.name.includes('Google') || a.name.includes('Natural');
        const bGoogle = b.name.includes('Google') || b.name.includes('Natural');
        if (aGoogle && !bGoogle) return -1;
        if (!aGoogle && bGoogle) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const bv of sorted) {
        const opt = h('option', { value: 'browser:' + bv.name }, bv.name + (bv.lang ? ` (${bv.lang})` : ''));
        browserGroup.appendChild(opt);
      }

      if (sorted.length > 0) {
        select.appendChild(browserGroup);
      }

      select.value = currentVoice;
      if (!select.value && select.options.length > 0) {
        select.selectedIndex = 0;
      }
    }

    toggleTts() {
      if (this.ttsState === 'playing') {
        this.pauseTts();
      } else if (this.ttsState === 'paused') {
        this.resumeTts();
      } else {
        this.startTts();
      }
    }

    highlightActiveTranscriptLine(cue) {
      if (!this.bodyEl) return;
      this.currentSpeakingCue = cue;
      const allLines = this.bodyEl.querySelectorAll('.yt-transcript-line');
      for (const line of allLines) {
        line.classList.remove('yt-transcript-line-speaking');
        const ind = line.querySelector('.yt-speaking-indicator');
        if (ind) ind.remove();
      }

      if (!cue) return;
      let targetEl = cue.lineEl && cue.lineEl.isConnected ? cue.lineEl : null;
      if (!targetEl) {
        targetEl = this.bodyEl.querySelector(`.yt-transcript-line[data-start-sec="${cue.startSec}"]`);
      }
      if (!targetEl && cue.tsStr) {
        targetEl = this.bodyEl.querySelector(`.yt-transcript-line[data-ts="${cue.tsStr}"]`);
      }
      if (!targetEl && typeof cue.lineIndex === 'number') {
        targetEl = this.bodyEl.querySelector(`.yt-transcript-line[data-line-idx="${cue.lineIndex}"]`);
      }
      if (targetEl) {
        targetEl.classList.add('yt-transcript-line-speaking');
        targetEl.setAttribute('data-scroll-synced', this.followAlong !== false ? 'true' : 'false');
        if (!targetEl.querySelector('.yt-speaking-indicator')) {
          const badge = h('span', { className: 'yt-speaking-indicator', title: `Speaking ${cue.tsStr}` });
          badge.appendChild(iconSpeaker(12));
          targetEl.insertBefore(badge, targetEl.firstChild);
        }
        if (this.followAlong !== false) {
          try {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } catch (_) {}
        }
      }
    }

    clearTranscriptHighlight() {
      this.currentSpeakingCue = null;
      if (this.ttsProgressTimer) {
        clearInterval(this.ttsProgressTimer);
        this.ttsProgressTimer = null;
      }
      if (!this.bodyEl) return;
      const allLines = this.bodyEl.querySelectorAll('.yt-transcript-line');
      for (const line of allLines) {
        line.classList.remove('yt-transcript-line-speaking');
        const ind = line.querySelector('.yt-speaking-indicator');
        if (ind) ind.remove();
      }
    }

    async startTts() {
      if (!this.text || this.status !== 'done') return;
      this.stopTts();
      const clean = cleanTextForSpeech(this.text, { skipSilence: this.skipSilence });
      if (!clean) return;

      this.clearTranscriptHighlight();

      let transcriptCues = null;
      let fullSpoken = clean;
      if (this.mode === 'transcript') {
        const parsed = parseTranscriptCues(this.text, { skipSilence: this.skipSilence });
        transcriptCues = parsed.cues;
        if (parsed.fullSpokenText) fullSpoken = parsed.fullSpokenText;
        this.transcriptCues = transcriptCues;
        if (transcriptCues.length > 0) {
          this.highlightActiveTranscriptLine(transcriptCues[0]);
        }
      }

      const voiceChoice = this.getTtsVoice();

      // Path 1: Google AI Studio Neural Voice (gemini-3.8-flash-lite-tts)
      if (voiceChoice.startsWith('ai:')) {
        const voiceName = voiceChoice.slice(3);
        const keyObj = getStoredKeys().find((k) => k.id === this.keyId) || getStoredKeys()[0];

        if (keyObj?.key) {
          try {
            this.ttsState = 'loading';
            this.updateTtsUI();

            const dataUrl = await generateAiSpeech(fullSpoken, voiceName, keyObj);
            if (this.ttsState !== 'loading') return; // Cancelled

            const audio = new Audio(dataUrl);
            audio.playbackRate = this.ttsRate;
            audio.volume = this.ttsVolume;

            if (transcriptCues && transcriptCues.length > 0) {
              audio.ontimeupdate = () => {
                if (this.mode !== 'transcript' || !audio.duration) return;
                const cue = findActiveCueByTime(transcriptCues, audio.currentTime, audio.duration);
                if (cue && this.currentSpeakingCue !== cue) {
                  this.highlightActiveTranscriptLine(cue);
                }
              };
            }

            audio.onended = () => {
              this.clearTranscriptHighlight();
              this.ttsState = 'idle';
              this.ttsAudioEl = null;
              this.updateTtsUI();
            };
            audio.onerror = (e) => {
              if (CONFIG.debug) console.warn('[YTAIS] AI Audio playback error:', e);
              this.clearTranscriptHighlight();
              this.ttsState = 'idle';
              this.ttsAudioEl = null;
              this.updateTtsUI();
            };

            this.ttsAudioEl = audio;
            this.ttsState = 'playing';
            this.updateTtsUI();

            try {
              await audio.play();
            } catch (err) {
              if (CONFIG.debug) console.warn('[YTAIS] Audio play rejected:', err);
              this.clearTranscriptHighlight();
              this.ttsState = 'idle';
              this.ttsAudioEl = null;
              this.updateTtsUI();
            }
            return;
          } catch (aiErr) {
            if (CONFIG.debug) console.warn('[YTAIS] AI Studio TTS generation failed, falling back to Web Speech:', aiErr);
            if (!this.notes.some((n) => n.includes('AI Studio TTS'))) {
              this.notes.push(`ℹ AI Studio TTS (${voiceName}) unavailable (${aiErr.message || 'error'}), using browser voice.`);
              this.renderBody();
            }
          }
        } else {
          // No key configured: notify user that neural voice needs an API key
          if (!this.notes.some((n) => n.includes('AI Studio Neural voices require'))) {
            this.notes.push('ℹ Google AI Studio Neural voices require an API key (⚙ in toolbar). Using browser voice.');
            this.renderBody();
          }
        }
      }

      // Path 2: Browser Web Speech API (fallback or when browser voice chosen)
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();

      const utt = new SpeechSynthesisUtterance(fullSpoken);
      utt.rate = this.ttsRate;
      utt.volume = this.ttsVolume;
      utt.pitch = this.ttsPitch;

      // Select matching browser voice or pick best Google voice
      const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
      let targetVoice = null;
      if (voiceChoice.startsWith('browser:')) {
        const vName = voiceChoice.slice(8);
        targetVoice = voices.find((v) => v.name === vName);
      }
      if (!targetVoice) {
        targetVoice =
          voices.find((v) => (v.name.includes('Google') || v.name.includes('Natural')) && v.lang?.startsWith('en')) ||
          voices.find((v) => v.name.includes('Google')) ||
          voices.find((v) => v.lang?.startsWith('en')) ||
          voices[0];
      }
      if (targetVoice) {
        try {
          utt.voice = targetVoice;
        } catch (_) {}
      }

      if (transcriptCues && transcriptCues.length > 0) {
        utt.onboundary = (e) => {
          this.ttsBoundaryPulse = 1.0;
          if (this.mode !== 'transcript') return;
          const cue = findActiveCueByCharIndex(transcriptCues, e.charIndex);
          if (cue && this.currentSpeakingCue !== cue) {
            this.highlightActiveTranscriptLine(cue);
          }
        };

        const startPlaybackTime = Date.now();
        const totalChars = transcriptCues[transcriptCues.length - 1].charEnd || fullSpoken.length;
        const estTotalDurationMs = Math.max(1000, (totalChars / 14) * (1000 / this.ttsRate));
        this.ttsProgressTimer = setInterval(() => {
          if (this.ttsState !== 'playing') {
            if (this.ttsProgressTimer) clearInterval(this.ttsProgressTimer);
            return;
          }
          const elapsed = Date.now() - startPlaybackTime;
          const progress = Math.min(1, elapsed / estTotalDurationMs);
          const estChar = Math.round(progress * totalChars);
          const cue = findActiveCueByCharIndex(transcriptCues, estChar);
          if (cue && this.currentSpeakingCue !== cue) {
            this.highlightActiveTranscriptLine(cue);
          }
        }, 250);
      } else {
        utt.onboundary = () => {
          this.ttsBoundaryPulse = 1.0;
        };
      }

      utt.onend = () => {
        this.clearTranscriptHighlight();
        this.ttsState = 'idle';
        this.ttsUtterance = null;
        this.updateTtsUI();
      };
      utt.onerror = (e) => {
        if (e && e.error !== 'canceled' && e.error !== 'interrupted') {
          console.warn('TTS error:', e);
        }
        this.clearTranscriptHighlight();
        this.ttsState = 'idle';
        this.ttsUtterance = null;
        this.updateTtsUI();
      };

      this.ttsUtterance = utt;
      this.ttsState = 'playing';
      if (transcriptCues && transcriptCues.length > 0) {
        this.highlightActiveTranscriptLine(transcriptCues[0]);
      }
      window.speechSynthesis.speak(utt);
      this.updateTtsUI();
    }

    pauseTts() {
      if (this.ttsProgressTimer) {
        clearInterval(this.ttsProgressTimer);
        this.ttsProgressTimer = null;
      }
      if (this.ttsAudioEl) {
        this.ttsAudioEl.pause();
        this.ttsState = 'paused';
        this.updateTtsUI();
        this.showTtsFeedback('⏸ Paused');
      } else if (window.speechSynthesis && this.ttsState === 'playing') {
        window.speechSynthesis.pause();
        this.ttsState = 'paused';
        this.updateTtsUI();
        this.showTtsFeedback('⏸ Paused');
      }
    }

    resumeTts() {
      if (this.ttsAudioEl && this.ttsState === 'paused') {
        this.ttsAudioEl.play();
        this.ttsState = 'playing';
        this.updateTtsUI();
        this.showTtsFeedback('▶ Playing');
      } else if (window.speechSynthesis && this.ttsState === 'paused') {
        window.speechSynthesis.resume();
        this.ttsState = 'playing';
        this.updateTtsUI();
        this.showTtsFeedback('▶ Playing');
      }
    }

    stopTts() {
      this.clearTranscriptHighlight();
      if (this.ttsProgressTimer) {
        clearInterval(this.ttsProgressTimer);
        this.ttsProgressTimer = null;
      }
      if (this._ttsFeedbackTimer) {
        clearTimeout(this._ttsFeedbackTimer);
        this._ttsFeedbackTimer = null;
      }
      if (this.ttsAudioEl) {
        try {
          this.ttsAudioEl.ontimeupdate = null;
          this.ttsAudioEl.onended = null;
          this.ttsAudioEl.onerror = null;
          this.ttsAudioEl.pause();
          this.ttsAudioEl.currentTime = 0;
          this.ttsAudioEl.src = '';
          this.ttsAudioEl.load();
        } catch (_) {}
        this.ttsAudioEl = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      this.ttsState = 'idle';
      this.ttsUtterance = null;
      this.updateTtsUI();
    }

    rewindTts(sec = 5) {
      if (this.status !== 'done' || !this.text) return;

      if (this.ttsAudioEl) {
        const cur = this.ttsAudioEl.currentTime || 0;
        const target = Math.max(0, cur - sec);
        this.ttsAudioEl.currentTime = target;
        const s = Math.round(target);
        const m = Math.floor(s / 60);
        const secRem = s % 60;
        this.showTtsFeedback(`⏪ Rewind ${sec}s (${m}:${secRem < 10 ? '0' : ''}${secRem})`);
        return;
      }

      if (window.speechSynthesis) {
        const clean = cleanTextForSpeech(this.text, { skipSilence: this.skipSilence });
        if (!clean) return;

        if (this.ttsState === 'idle') {
          this.startTts();
          this.showTtsFeedback(`⏪ Rewind ${sec}s`);
          return;
        }

        const sentences = clean.match(/[^.!?\n]+[.!?\n]*/g) || [clean];
        const prevIdx = Math.max(0, (this.ttsSentenceIndex || 0) - 1);
        this.ttsSentenceIndex = prevIdx;
        this.speakFromSentence(sentences, prevIdx);
        this.showTtsFeedback(`⏪ Rewound (${prevIdx + 1}/${sentences.length})`);
      }
    }

    skipTts(sec = 5) {
      if (this.status !== 'done' || !this.text) return;

      if (this.ttsAudioEl) {
        const cur = this.ttsAudioEl.currentTime || 0;
        const dur = this.ttsAudioEl.duration || Infinity;
        const target = Math.min(dur, cur + sec);
        this.ttsAudioEl.currentTime = target;
        const s = Math.round(target);
        const m = Math.floor(s / 60);
        const secRem = s % 60;
        this.showTtsFeedback(`⏩ Skip ${sec}s (${m}:${secRem < 10 ? '0' : ''}${secRem})`);
        return;
      }

      if (window.speechSynthesis) {
        const clean = cleanTextForSpeech(this.text, { skipSilence: this.skipSilence });
        if (!clean) return;

        if (this.ttsState === 'idle') {
          this.startTts();
          this.showTtsFeedback(`⏩ Skip ${sec}s`);
          return;
        }

        const sentences = clean.match(/[^.!?\n]+[.!?\n]*/g) || [clean];
        const nextIdx = Math.min(sentences.length - 1, (this.ttsSentenceIndex || 0) + 1);
        this.ttsSentenceIndex = nextIdx;
        this.speakFromSentence(sentences, nextIdx);
        this.showTtsFeedback(`⏩ Skipped (${nextIdx + 1}/${sentences.length})`);
      }
    }

    speakFromSentence(sentences, startIndex) {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();

      const remainingText = sentences.slice(startIndex).join(' ').trim();
      if (!remainingText) {
        this.ttsState = 'idle';
        this.ttsUtterance = null;
        this.updateTtsUI();
        return;
      }

      const utt = new SpeechSynthesisUtterance(remainingText);
      utt.rate = this.ttsRate;
      utt.volume = this.ttsVolume;
      utt.pitch = this.ttsPitch;

      const voiceChoice = this.getTtsVoice();
      const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
      let targetVoice = null;
      if (voiceChoice.startsWith('browser:')) {
        const vName = voiceChoice.slice(8);
        targetVoice = voices.find((v) => v.name === vName);
      }
      if (!targetVoice) {
        targetVoice =
          voices.find((v) => (v.name.includes('Google') || v.name.includes('Natural')) && v.lang?.startsWith('en')) ||
          voices.find((v) => v.name.includes('Google')) ||
          voices.find((v) => v.lang?.startsWith('en')) ||
          voices[0];
      }
      if (targetVoice) {
        try { utt.voice = targetVoice; } catch (_) {}
      }

      utt.onboundary = () => {
        this.ttsBoundaryPulse = 1.0;
      };

      utt.onend = () => {
        this.ttsState = 'idle';
        this.ttsUtterance = null;
        this.updateTtsUI();
      };
      utt.onerror = (e) => {
        if (e && e.error !== 'canceled' && e.error !== 'interrupted') {
          console.warn('TTS error:', e);
        }
        this.ttsState = 'idle';
        this.ttsUtterance = null;
        this.updateTtsUI();
      };

      this.ttsUtterance = utt;
      this.ttsState = 'playing';
      window.speechSynthesis.speak(utt);
      this.updateTtsUI();
    }

    stepTtsRate(dir) {
      const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
      const curIdx = rates.findIndex((r) => Math.abs(r - this.ttsRate) < 0.05);
      let nextIdx = curIdx === -1 ? 2 : curIdx + dir;
      nextIdx = Math.max(0, Math.min(rates.length - 1, nextIdx));
      this.setTtsRate(rates[nextIdx]);
      this.showTtsFeedback(`⚡ Speed: ${rates[nextIdx]}x`);
    }

    toggleTtsMute() {
      if (this.ttsAudioEl) {
        this.ttsAudioEl.muted = !this.ttsAudioEl.muted;
        this.showTtsFeedback(this.ttsAudioEl.muted ? '🔇 Muted' : `🔊 Volume: ${Math.round(this.ttsVolume * 100)}%`);
      } else {
        if (this.ttsVolume > 0) {
          this._prevTtsVolume = this.ttsVolume;
          this.setTtsVolume(0);
          this.showTtsFeedback('🔇 Muted');
        } else {
          const restore = this._prevTtsVolume || 1.0;
          this.setTtsVolume(restore);
          this.showTtsFeedback(`🔊 Volume: ${Math.round(restore * 100)}%`);
        }
      }
    }

    showTtsFeedback(msg) {
      const container = this.windowBox || this.el || this.modalScrim || modalsContainer;
      if (!container) return;
      let toast = container.querySelector('.yt-tts-toast');
      if (!toast) {
        toast = h('div', { className: 'yt-tts-toast' });
        container.appendChild(toast);
      }
      toast.textContent = msg;
      toast.classList.remove('yt-tts-toast-show');
      void toast.offsetWidth; // trigger reflow
      toast.classList.add('yt-tts-toast-show');

      if (this._ttsFeedbackTimer) clearTimeout(this._ttsFeedbackTimer);
      this._ttsFeedbackTimer = setTimeout(() => {
        toast?.classList.remove('yt-tts-toast-show');
      }, 1200);
    }

    cycleTtsRate() {
      const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
      const curIdx = rates.findIndex((r) => Math.abs(r - this.ttsRate) < 0.05);
      const nextIdx = curIdx === -1 ? 2 : (curIdx + 1) % rates.length;
      this.setTtsRate(rates[nextIdx]);
    }

    startWaveformAnimation() {
      if (this.waveformAnimId) return;

      const render = () => {
        const isPlaying = this.ttsState === 'playing';
        const amps = computeWaveformAmplitudes({
          isPlaying,
          volume: this.ttsVolume,
          pitch: this.ttsPitch,
          rate: this.ttsRate,
          timestamp: Date.now(),
          barCount: 12,
          boundaryPulse: this.ttsBoundaryPulse || 0
        });

        if (this.ttsBoundaryPulse > 0.05) {
          this.ttsBoundaryPulse *= 0.88;
        } else {
          this.ttsBoundaryPulse = 0;
        }

        // Draw on canvas
        if (this.ttsWaveformCanvas) {
          const cvs = this.ttsWaveformCanvas;
          const ctx = cvs.getContext ? cvs.getContext('2d') : null;
          if (ctx) {
            const w = cvs.width || 68;
            const h = cvs.height || 18;
            ctx.clearRect(0, 0, w, h);

            const numBars = amps.length;
            const gap = 2;
            const totalGap = gap * (numBars - 1);
            const barW = Math.max(2, (w - totalGap) / numBars);

            const grad = ctx.createLinearGradient(0, h, 0, 0);
            grad.addColorStop(0, '#0284c7');
            grad.addColorStop(0.5, '#38bdf8');
            grad.addColorStop(1, '#c084fc');

            for (let i = 0; i < numBars; i++) {
              const a = amps[i];
              const barH = Math.max(2, a * (h - 2));
              const x = i * (barW + gap);
              const y = (h - barH) / 2;

              ctx.fillStyle = isPlaying ? grad : 'rgba(255, 255, 255, 0.2)';
              ctx.beginPath();
              if (ctx.roundRect) {
                ctx.roundRect(x, y, barW, barH, 1.5);
              } else {
                ctx.rect(x, y, barW, barH);
              }
              ctx.fill();
            }
          }
        }

        // Also update DOM bars for accessibility and test verification
        if (this.ttsWaveformBars && this.ttsWaveformBars.length) {
          for (let i = 0; i < this.ttsWaveformBars.length; i++) {
            const bar = this.ttsWaveformBars[i];
            const a = amps[i] || 0.08;
            bar.style.height = `${Math.round(a * 16)}px`;
            bar.setAttribute('data-amp', String(a));
          }
        }

        if (this.ttsState === 'playing') {
          this.waveformAnimId = requestAnimationFrame(render);
        } else {
          this.waveformAnimId = null;
        }
      };

      this.waveformAnimId = requestAnimationFrame(render);
    }

    stopWaveformAnimation() {
      if (this.waveformAnimId) {
        cancelAnimationFrame(this.waveformAnimId);
        this.waveformAnimId = null;
      }
      this.ttsBoundaryPulse = 0;
      if (this.ttsWaveformCanvas) {
        const cvs = this.ttsWaveformCanvas;
        const ctx = cvs.getContext ? cvs.getContext('2d') : null;
        if (ctx) {
          const w = cvs.width || 68;
          const h = cvs.height || 18;
          ctx.clearRect(0, 0, w, h);
          const numBars = 12;
          const gap = 2;
          const barW = Math.max(2, (w - gap * (numBars - 1)) / numBars);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
          for (let i = 0; i < numBars; i++) {
            const x = i * (barW + gap);
            const y = (h - 2) / 2;
            ctx.fillRect(x, y, barW, 2);
          }
        }
      }
      if (this.ttsWaveformBars) {
        for (const bar of this.ttsWaveformBars) {
          bar.style.height = '2px';
          bar.setAttribute('data-amp', '0.08');
        }
      }
    }

    updateTtsUI() {
      this.renderDockTab();
      if (!this.ttsPlayBtn || !this.ttsStopBtn) return;
      const canPlay = this.status === 'done' && Boolean(this.text);

      if (this.ttsState === 'playing') {
        this.startWaveformAnimation();
      } else {
        this.stopWaveformAnimation();
      }
      if (this.ttsWaveformWrap) {
        this.ttsWaveformWrap.classList.toggle('playing', this.ttsState === 'playing');
      }

      this.ttsPlayBtn.disabled = !canPlay || this.ttsState === 'loading';
      this.ttsPlayBtn.className = `yt-tts-btn yt-tts-play-btn ${this.ttsState === 'playing' ? 'active' : ''}`;
      this.ttsPlayBtn.title =
        this.ttsState === 'loading'
          ? 'Generating AI Studio neural speech…'
          : this.ttsState === 'playing'
          ? 'Pause speech'
          : this.ttsState === 'paused'
          ? 'Resume speech'
          : 'Listen to summary (Google AI Studio neural speech or browser voice)';
      clearEl(this.ttsPlayBtn);
      this.ttsPlayBtn.appendChild(
        this.ttsState === 'loading'
          ? h('div', { className: 'yt-spinner', style: 'width:12px;height:12px;margin-right:2px;' })
          : this.ttsState === 'playing'
          ? iconPause(14)
          : this.ttsState === 'paused'
          ? iconPlay(14)
          : iconSpeaker(14)
      );
      this.ttsPlayBtn.appendChild(
        h(
          'span',
          {},
          this.ttsState === 'loading'
            ? 'Generating…'
            : this.ttsState === 'playing'
            ? 'Pause'
            : this.ttsState === 'paused'
            ? 'Resume'
            : 'Listen'
        )
      );

      this.ttsStopBtn.disabled = !canPlay || (this.ttsState === 'idle' && !this.ttsAudioEl && !this.ttsUtterance);
      if (this.ttsRewindBtn) {
        this.ttsRewindBtn.disabled = !canPlay || (this.ttsState === 'idle' && !this.ttsAudioEl && !this.ttsUtterance);
      }
      if (this.ttsSkipBtn) {
        this.ttsSkipBtn.disabled = !canPlay || (this.ttsState === 'idle' && !this.ttsAudioEl && !this.ttsUtterance);
      }

      if (this.ttsSpeedSlider) {
        this.ttsSpeedSlider.disabled = !canPlay;
        this.ttsSpeedSlider.value = String(this.ttsRate);
        this.ttsSpeedSlider.title = `Playback speed: ${this.ttsRate}x`;
      }
      if (this.ttsSpeedLabel) {
        this.ttsSpeedLabel.textContent = `${this.ttsRate}x`;
      }
      if (this.ttsSpeedBtns && this.ttsSpeedBtns.length) {
        for (const b of this.ttsSpeedBtns) {
          const br = parseFloat(b.getAttribute('data-rate'));
          b.classList.toggle('active', Math.abs(br - this.ttsRate) < 0.01);
          b.disabled = !canPlay;
        }
      }
      if (this.ttsRateBtn) {
        this.ttsRateBtn.disabled = !canPlay;
        this.ttsRateBtn.title = `Playback speed: ${this.ttsRate}x (click to cycle 0.25x steps)`;
        let ind = this.ttsRateBtn.querySelector('.yt-tts-speed-indicator');
        let txt = this.ttsRateBtn.querySelector('.yt-tts-speed-text');
        if (!ind || !txt) {
          clearEl(this.ttsRateBtn);
          ind = h('span', {
            className: `yt-tts-speed-indicator ${this.ttsRate > 1.0 ? 'speed-boost' : this.ttsRate < 1.0 ? 'speed-slow' : 'speed-normal'}`
          });
          txt = h('span', { className: 'yt-tts-speed-text' }, `${this.ttsRate}x`);
          this.ttsRateBtn.appendChild(ind);
          this.ttsRateBtn.appendChild(txt);
        } else {
          ind.className = `yt-tts-speed-indicator ${this.ttsRate > 1.0 ? 'speed-boost' : this.ttsRate < 1.0 ? 'speed-slow' : 'speed-normal'}`;
          txt.textContent = `${this.ttsRate}x`;
        }
      }

      if (this.ttsVolumeSlider) {
        this.ttsVolumeSlider.value = String(this.ttsVolume);
        this.ttsVolumeSlider.title = `Speech volume: ${Math.round(this.ttsVolume * 100)}%`;
      }
      if (this.ttsVolumeLabel) {
        this.ttsVolumeLabel.textContent = `${Math.round(this.ttsVolume * 100)}%`;
      }
      if (this.ttsVolumeWrap) {
        this.ttsVolumeWrap.title = `Speech volume: ${Math.round(this.ttsVolume * 100)}%`;
      }

      if (this.ttsPitchSlider) {
        this.ttsPitchSlider.disabled = !canPlay;
        this.ttsPitchSlider.value = String(this.ttsPitch);
        this.ttsPitchSlider.title = `Voice pitch: ${this.ttsPitch}x`;
      }
      if (this.ttsPitchLabel) {
        this.ttsPitchLabel.textContent = `${this.ttsPitch}x`;
      }
      if (this.ttsPitchWrap) {
        this.ttsPitchWrap.title = `Voice pitch: ${this.ttsPitch}x`;
      }

      if (this.ttsVoiceSelect) {
        this.ttsVoiceSelect.value = this.getTtsVoice();
      }

      if (this.ttsSkipSilenceBtn) {
        this.ttsSkipSilenceBtn.disabled = !canPlay;
        this.ttsSkipSilenceBtn.classList.toggle('active', Boolean(this.skipSilence));
        this.ttsSkipSilenceBtn.title = this.skipSilence
          ? 'Skip Silence: ON (Automatically detecting and skipping long pauses or gap segments in transcript)'
          : 'Skip Silence: OFF (Click to automatically detect and skip segments with long pauses)';
      }
    }

    buildCheckbox(label, checked, onChange, disabled = false) {
      const wrap = h('label', { className: `yt-checkbox-label ${disabled ? 'off' : ''}` });
      const input = h('input', {
        type: 'checkbox',
        checked: checked,
        disabled: disabled,
        onchange: (e) => onChange(e.target.checked)
      });
      wrap.appendChild(input);
      wrap.appendChild(document.createTextNode(label));
      return wrap;
    }

    saveOpts() {
      saveGlobalOpts(this.opts);
      this.commit(true);
    }

    populateModelSelect(select) {
      clearEl(select);

      // 1. YouTube Ask
      const askOpt = h(
        'option',
        {
          value: 'YouTube Ask (Gemini in the page)',
          disabled: this.mode === 'transcript'
        },
        'YouTube Ask (Gemini in the page) — Free, no API limit' + (this.mode === 'transcript' ? ' (summaries only)' : '')
      );
      select.appendChild(askOpt);

      // 2. Recommended Group
      const recGroup = h('optgroup', { label: 'Recommended models' });
      for (const m of CONFIG.textModels) {
        recGroup.appendChild(h('option', { value: m }, m));
      }
      select.appendChild(recGroup);

      // 3. Custom Group
      const customs = getCustomModels();
      if (customs.length > 0) {
        const custGroup = h('optgroup', { label: 'Custom models' });
        for (const c of customs) {
          custGroup.appendChild(h('option', { value: c }, c));
        }
        select.appendChild(custGroup);
      }

      // 4. Add custom option
      select.appendChild(h('option', { value: '__custom__' }, '+ Add custom model…'));

      select.value = this.modelId;
      if (!select.value && select.options.length > 0) {
        select.selectedIndex = 1;
        this.modelId = select.value;
      }
    }

    populateKeySelect(select) {
      clearEl(select);
      const keys = getStoredKeys();
      if (keys.length === 0) {
        select.appendChild(h('option', { value: '' }, 'No API keys configured'));
      } else {
        for (const k of keys) {
          const last4 = k.key.length >= 4 ? k.key.slice(-4) : k.key;
          select.appendChild(h('option', { value: k.id }, `${k.name} (…${last4})`));
        }
      }
      select.appendChild(h('option', { value: '__manage__' }, '⚙ Add / manage keys…'));
      select.value = this.keyId || (keys[0]?.id || '');
    }

    buildAdvancedPanel() {
      const panel = h('div', { className: 'yt-adv-panel', style: 'display:none;' });

      // Group 1: Gemini
      const g1 = h('div', { className: 'yt-adv-group' });
      g1.appendChild(h('div', { className: 'yt-adv-title' }, 'Gemini options'));
      g1.appendChild(
        this.buildSelectRow('Thinking', this.opts.think, ['', 'low', 'medium', 'high'], (v) => {
          this.opts.think = v;
          this.saveOpts();
        })
      );
      g1.appendChild(
        this.buildSelectRow(
          'Media resolution',
          this.opts.mres,
          ['', 'MEDIA_RESOLUTION_LOW', 'MEDIA_RESOLUTION_MEDIUM', 'MEDIA_RESOLUTION_HIGH'],
          (v) => {
            this.opts.mres = v;
            this.saveOpts();
          }
        )
      );
      g1.appendChild(
        this.buildCheckbox('Google Search grounding', this.opts.gsearch, (v) => {
          this.opts.gsearch = v;
          this.saveOpts();
        })
      );
      g1.appendChild(
        this.buildCheckbox('Google Maps grounding', this.opts.gmaps, (v) => {
          this.opts.gmaps = v;
          this.saveOpts();
        })
      );
      g1.appendChild(
        this.buildCheckbox('Code execution', this.opts.code, (v) => {
          this.opts.code = v;
          this.saveOpts();
        })
      );
      panel.appendChild(g1);

      // Group 2: Fact-check & sources
      const g2 = h('div', { className: 'yt-adv-group' });
      g2.appendChild(h('div', { className: 'yt-adv-title' }, 'Fact-check & sources'));
      g2.appendChild(
        this.buildSelectRow('Fact-check model', this.opts.factModel, ['', ...CONFIG.factPreferred], (v) => {
          this.opts.factModel = v;
          this.saveOpts();
        })
      );
      panel.appendChild(g2);

      // Group 3: Images (Nano Banana)
      const g3 = h('div', { className: 'yt-adv-group' });
      g3.appendChild(h('div', { className: 'yt-adv-title' }, 'Images (Nano Banana)'));
      g3.appendChild(
        this.buildSelectRow('Image model', this.opts.imgModel, ['', ...CONFIG.imageModels], (v) => {
          this.opts.imgModel = v;
          this.saveOpts();
        })
      );
      g3.appendChild(
        this.buildSelectRow(
          'Aspect ratio',
          this.opts.imgAspect,
          ['', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
          (v) => {
            this.opts.imgAspect = v;
            this.saveOpts();
          }
        )
      );
      g3.appendChild(
        this.buildSelectRow('Output mode', this.opts.imgOut, ['both', 'image'], (v) => {
          this.opts.imgOut = v;
          this.saveOpts();
        })
      );
      g3.appendChild(
        this.buildCheckbox('Image Search grounding', this.opts.imgSearch, (v) => {
          this.opts.imgSearch = v;
          this.saveOpts();
        })
      );
      panel.appendChild(g3);

      // Group 4: Reliability
      const g4 = h('div', { className: 'yt-adv-group' });
      g4.appendChild(h('div', { className: 'yt-adv-title' }, 'Reliability & Fallbacks'));
      g4.appendChild(
        this.buildSelectRow(
          'Auto-retry count',
          String(this.opts.retries),
          ['0', '1', '2', '3', '5', '10'],
          (v) => {
            this.opts.retries = parseInt(v, 10);
            this.saveOpts();
          }
        )
      );
      g4.appendChild(
        this.buildCheckbox('Fall back to next model down', this.opts.fallback, (v) => {
          this.opts.fallback = v;
          this.saveOpts();
        })
      );
      g4.appendChild(
        this.buildCheckbox('Use transcript if video limit hit', this.opts.txFallback, (v) => {
          this.opts.txFallback = v;
          this.saveOpts();
        })
      );
      const altTitleCbRow = this.buildCheckbox('Alternative AI titles for feed thumbnails (<= 150 chars, no clickbait)', getAltTitleMode() === 'on', (v) => {
        setAltTitlesEnabled(v);
      });
      const altCbInput = altTitleCbRow.querySelector('input[type="checkbox"]');
      if (altCbInput) altCbInput.classList.add('yt-alt-titles-setting-checkbox');
      g4.appendChild(altTitleCbRow);
      panel.appendChild(g4);

      // Group 5: Transcript Processing Settings
      const g5 = h('div', { className: 'yt-adv-group yt-adv-tp-group' });
      g5.appendChild(h('div', { className: 'yt-adv-title' }, 'Transcript Processing'));
      g5.appendChild(
        this.buildSelectRow(
          'Processing Mode',
          this.opts.transcriptMode || 'fast',
          ['fast', 'deep'],
          (v) => {
            this.opts.transcriptMode = v;
            this.saveOpts();
            if (this.windowBox) {
              const fBtn = this.windowBox.querySelector('.yt-tp-fast-btn');
              const dBtn = this.windowBox.querySelector('.yt-tp-deep-btn');
              if (fBtn && dBtn) {
                fBtn.classList.toggle('active', v === 'fast');
                dBtn.classList.toggle('active', v === 'deep');
              }
            }
          }
        )
      );
      const tpDesc = h(
        'div',
        { className: 'yt-adv-desc', style: 'font-size:11px; color:#aaa; margin-top:4px;' },
        'Modifies the Gemini system prompt: "Fast" creates a concise executive brief; "Deep" creates an exhaustive chronological analysis with deep technical context.'
      );
      g5.appendChild(tpDesc);
      const personaRow = h('div', { className: 'yt-adv-row', style: 'margin-top:6px;' });
      personaRow.appendChild(h('span', { className: 'yt-adv-label' }, 'Summary Persona'));
      const advPersonaSel = h(
        'select',
        {
          className: 'yt-select yt-adv-select yt-persona-select',
          'aria-label': 'Default Summary Persona',
          onchange: (e) => {
            const nextPersona = setDefaultSummaryPersona(e.target.value);
            this.opts.persona = nextPersona;
            this.saveOpts();
            this.onModeOrSourceChanged();
            announceLive(`Summary persona switched to ${SUMMARY_PERSONA_PRESETS[nextPersona].label}`);
          }
        },
        ...Object.values(SUMMARY_PERSONA_PRESETS).map((p) =>
          h('option', { value: p.id, selected: this.getSummaryPersona() === p.id }, p.label)
        )
      );
      personaRow.appendChild(advPersonaSel);
      g5.appendChild(personaRow);
      panel.appendChild(g5);

      // Group 6: Dock & Interface Settings
      const g6 = h('div', { className: 'yt-adv-group yt-adv-dock-group' });
      g6.appendChild(h('div', { className: 'yt-adv-title' }, 'Dock & Interface'));
      const visRow = h('div', { className: 'yt-adv-row' });
      visRow.appendChild(h('span', { className: 'yt-adv-label' }, 'History dock tab'));
      const visSelect = h(
        'select',
        {
          className: 'yt-select yt-adv-select yt-history-visibility-select',
          'aria-label': 'History tab visibility',
          onchange: (e) => {
            setHistoryTabVisibility(e.target.value);
          }
        },
        h('option', { value: 'always' }, 'Always shown'),
        h('option', { value: 'with_tabs' }, 'Only with open/minimized tabs'),
        h('option', { value: 'never' }, 'Never shown')
      );
      visSelect.value = getHistoryTabVisibility();
      visRow.appendChild(visSelect);
      g6.appendChild(visRow);
      panel.appendChild(g6);

      return panel;
    }

    buildSelectRow(label, currentVal, options, onChange) {
      const wrap = h('div', { className: 'yt-adv-row' });
      wrap.appendChild(h('span', { className: 'yt-adv-label' }, label));
      const sel = h('select', {
        className: 'yt-select yt-adv-select',
        onchange: (e) => onChange(e.target.value)
      });
      for (const opt of options) {
        sel.appendChild(h('option', { value: opt }, opt || 'Auto / Default'));
      }
      sel.value = currentVal;
      wrap.appendChild(sel);
      return wrap;
    }

    populateFollowUpModelSelect(select) {
      if (!select) return;
      clearEl(select);
      select.appendChild(h('option', { value: 'YouTube Ask (Gemini in the page)' }, 'YouTube Ask'));
      const seen = new Set(['YouTube Ask (Gemini in the page)']);
      for (const m of CONFIG.textModels) {
        if (!seen.has(m)) {
          seen.add(m);
          select.appendChild(h('option', { value: m }, m));
        }
      }
      for (const c of getCustomModels()) {
        if (!seen.has(c)) {
          seen.add(c);
          select.appendChild(h('option', { value: c }, c));
        }
      }
      const target = this.followUpModel || this.modelId || CONFIG.defaultModel;
      if (!seen.has(target)) {
        select.appendChild(h('option', { value: target }, target));
      }
      select.value = target;
      if (!select.value && select.options.length > 0) {
        select.selectedIndex = 1;
        this.followUpModel = select.value;
      }
    }

    buildComposer() {
      const wrap = h('div', { className: 'yt-composer-wrap' });
      const savedDraft = getDraftFollowUp(this.videoId);

      const ta = h('textarea', {
        className: 'yt-composer-textarea',
        placeholder: this.status === 'done' ? 'Ask a follow-up question (Enter to send)…' : 'Summarise first to ask follow-up questions',
        disabled: this.status !== 'done' || this.busy,
        rows: 1,
        oninput: (e) => {
          // Auto-grow textarea up to 120px
          ta.style.height = 'auto';
          ta.style.height = Math.min(120, Math.max(38, ta.scrollHeight)) + 'px';
          // Auto-save draft on input
          setDraftFollowUp(this.videoId, ta.value);
          if (this.composerDraftBadge) {
            this.composerDraftBadge.style.display = ta.value.trim() ? 'inline-flex' : 'none';
          }
        },
        onkeydown: (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendFollowUp();
          }
        }
      });
      if (savedDraft) {
        ta.value = savedDraft;
        setTimeout(() => {
          if (ta) {
            ta.style.height = 'auto';
            ta.style.height = Math.min(120, Math.max(38, ta.scrollHeight)) + 'px';
          }
        }, 10);
      }
      this.composerTa = ta;

      const followModelSelect = h('select', {
        className: 'yt-select yt-composer-model-select',
        title: 'Model for follow-up questions (auto-falls back down ladder if unavailable)',
        'aria-label': 'Follow-up question model',
        disabled: this.status !== 'done' || this.busy,
        onchange: (e) => {
          this.followUpModel = e.target.value;
          this.commit(true);
        }
      });
      this.populateFollowUpModelSelect(followModelSelect);
      this.composerModelSelect = followModelSelect;

      const draftBadge = h(
        'span',
        {
          className: 'yt-composer-draft-badge',
          title: 'Unfinished question auto-saved to local storage (persists if window closes)',
          style: { display: savedDraft ? 'inline-flex' : 'none' }
        },
        'Draft auto-saved'
      );
      this.composerDraftBadge = draftBadge;

      const micBtn = h(
        'button',
        {
          className: 'yt-composer-mic-btn',
          title: 'Voice input (Speech to Text with gemini-3.5-transcribe / Web Speech)',
          disabled: this.status !== 'done' || this.busy,
          onclick: () => this.toggleVoiceInput(micBtn, ta)
        },
        iconMic(14)
      );
      this.composerMicBtn = micBtn;

      const sendBtn = h(
        'button',
        {
          className: 'yt-composer-send-btn',
          disabled: this.status !== 'done' || this.busy,
          onclick: () => this.sendFollowUp()
        },
        'Send'
      );
      this.composerBtn = sendBtn;

      wrap.appendChild(ta);
      wrap.appendChild(followModelSelect);
      wrap.appendChild(draftBadge);
      wrap.appendChild(micBtn);
      wrap.appendChild(sendBtn);
      return wrap;
    }

    toggleVoiceInput(micBtn, ta) {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (this._isListening) {
        if (this._speechRecInstance) {
          try { this._speechRecInstance.stop(); } catch (_) {}
          this._speechRecInstance = null;
        }
        this._isListening = false;
        if (micBtn) {
          micBtn.classList.remove('yt-mic-recording');
          micBtn.title = 'Voice input (Speech to Text with gemini-3.5-transcribe / Web Speech)';
        }
        return;
      }

      if (window.__yt_mock_voice_text || !SpeechRec || getVoiceInputEngine() === 'gemini') {
        const sample = window.__yt_mock_voice_text || 'Can you highlight the key takeaways and conclusions?';
        if (ta) {
          ta.value = (ta.value ? ta.value + ' ' : '') + sample;
          setDraftFollowUp(this.videoId, ta.value);
          if (this.composerDraftBadge) {
            this.composerDraftBadge.style.display = 'inline-flex';
          }
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const engineLabel = getVoiceInputEngine() === 'gemini' ? 'Gemini 3.5 Transcribe' : 'Web Speech';
        this.showTtsFeedback(`🎤 Voice transcribed (${engineLabel})`);
        return;
      }

      try {
        const rec = new SpeechRec();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'en-US';
        this._speechRecInstance = rec;
        this._isListening = true;

        if (micBtn) {
          micBtn.classList.add('yt-mic-recording');
          micBtn.title = 'Listening… Click to stop';
        }

        rec.onresult = (evt) => {
          const transcript = evt.results?.[0]?.[0]?.transcript;
          if (transcript && ta) {
            ta.value = (ta.value ? ta.value + ' ' : '') + transcript;
            setDraftFollowUp(this.videoId, ta.value);
            if (this.composerDraftBadge) {
              this.composerDraftBadge.style.display = 'inline-flex';
            }
            ta.dispatchEvent(new Event('input', { bubbles: true }));
          }
        };

        rec.onerror = () => {
          this._isListening = false;
          if (micBtn) {
            micBtn.classList.remove('yt-mic-recording');
            micBtn.title = 'Voice input (Speech to Text with gemini-3.5-transcribe / Web Speech)';
          }
        };

        rec.onend = () => {
          this._isListening = false;
          if (micBtn) {
            micBtn.classList.remove('yt-mic-recording');
            micBtn.title = 'Voice input (Speech to Text with gemini-3.5-transcribe / Web Speech)';
          }
        };

        rec.start();
      } catch (err) {
        this._isListening = false;
        if (micBtn) {
          micBtn.classList.remove('yt-mic-recording');
        }
      }
    }

    async executeFollowUpQuery(qText, historyTurnsOverride = null) {
      let answerText = '';
      let answerSources = [];
      let modelFellBack = false;
      const selectedFollowModel =
        (this.composerModelSelect && this.composerModelSelect.value) ||
        this.followUpModel ||
        this.modelId ||
        CONFIG.defaultModel;
      this.followUpModel = selectedFollowModel;
      let resolvedModel = selectedFollowModel;
      let fellBackFrom = '';

      const historyTurns = Array.isArray(historyTurnsOverride)
        ? historyTurnsOverride
        : normalizeFollowUpTurnsList(this.turns);

      const runGeminiFollowUp = async (modelToTry) => {
        const keyObj = getStoredKeys().find((k) => k.id === this.keyId) || getStoredKeys()[0];
        if (!keyObj) throw new Error('No API key configured for follow-up');

        const followPrompt = `You are answering a user follow-up question about the YouTube video "${this.title}".
Answer accurately using the video and Google Search if available. Cite timestamps [MM:SS] when relevant.
EXCLUDE entirely: sponsor segments and self-promotion unless the user asks specifically.

${this.mode === 'transcript' ? 'TRANSCRIPT YOU WROTE:' : 'SUMMARY YOU WROTE:'}
"""
${this.text.slice(0, 8000)}
"""

RECENT CONVERSATION:
${historyTurns.slice(-CONFIG.historyTurns).map((t) => `User: ${t.q}\nAssistant: ${t.a}`).join('\n\n')}

FOLLOW-UP QUESTION:
${qText}`;

        const parts = [];
        if (this.source === 'video') {
          parts.push({ file_data: { file_uri: `https://www.youtube.com/watch?v=${this.videoId}` } });
        }
        parts.push({ text: followPrompt });

        const body = { contents: [{ role: 'user', parts }] };
        const tools = [];
        if (this.opts.gsearch) tools.push({ google_search: {} });
        if (this.opts.gmaps) tools.push({ google_maps: {} });
        if (tools.length > 0) body.tools = tools;

        const res = await callGeminiRaw(modelToTry, keyObj.key, body);
        const cand = res.candidates?.[0];
        const textOut = cand?.content?.parts?.map((p) => p.text || '').join('') || '';
        const sourcesOut = [];
        if (cand?.groundingMetadata?.groundingChunks) {
          for (const c of cand.groundingMetadata.groundingChunks) {
            if (c.web?.uri) sourcesOut.push({ uri: c.web.uri, title: c.web.title || c.web.uri });
            if (c.maps?.uri) sourcesOut.push({ uri: c.maps.uri, title: c.maps.title || c.maps.uri });
          }
        }
        return { textOut, sourcesOut };
      };

      if (selectedFollowModel.includes('Ask')) {
        const askFollowPrompt = `Earlier you wrote this summary of this video:
"""
${this.text.slice(0, 5000)}
"""
${historyTurns.slice(-3).map((t) => `Q: ${t.q}\nA: ${t.a}`).join('\n')}

Now answer this follow-up question about the video, accurately and concisely: ${qText}`;

        try {
          const res = await runYouTubeAsk(this.videoId, askFollowPrompt, { isSummary: false });
          answerText = res.text;
        } catch (askErr) {
          const keyObj = getStoredKeys().find((k) => k.id === this.keyId) || getStoredKeys()[0];
          if (!keyObj || !keyObj.key) throw askErr;

          const available = (await checkModelsForKey(keyObj)) || [];
          const candidates = buildFollowUpModelCandidates({
            selectedModel: getNextModelDown(selectedFollowModel, available),
            fallbackLadder: CONFIG.fallbackLadder,
            availableModels: available
          });
          let lastErr = askErr;
          let succeeded = false;

          for (const curModel of candidates) {
            try {
              const gemRes = await runGeminiFollowUp(curModel);
              answerText = gemRes.textOut;
              answerSources = gemRes.sourcesOut;
              const firstLine = (askErr.message || 'YouTube Ask failed').split('\n')[0];
              this.notes.push(`⚠ YouTube Ask failed during follow-up (${firstLine}). Automatically answered with ${curModel}.`);
              if (this.modelId === selectedFollowModel) {
                this.modelId = curModel;
              }
              this.followUpModel = curModel;
              if (this.composerModelSelect) this.composerModelSelect.value = curModel;
              resolvedModel = curModel;
              fellBackFrom = selectedFollowModel;
              modelFellBack = true;
              succeeded = true;
              break;
            } catch (gemErr) {
              lastErr = gemErr;
              if (gemErr?.status === 404 || gemErr?.status === 429 || gemErr?.status === 503) {
                recordModelCooldown(curModel, gemErr);
              }
            }
          }

          if (!succeeded) throw lastErr;
        }
      } else {
        const keyObj = getStoredKeys().find((k) => k.id === this.keyId) || getStoredKeys()[0];
        const available = keyObj?.key ? (await checkModelsForKey(keyObj)) || [] : [];
        let candidates = buildFollowUpModelCandidates({
          selectedModel: selectedFollowModel,
          fallbackLadder: CONFIG.fallbackLadder,
          availableModels: available
        });
        if (!candidates.includes(selectedFollowModel)) {
          candidates = [selectedFollowModel, ...candidates];
        }
        let firstErr = null;
        let lastErr = null;
        let succeeded = false;

        for (const candidateModel of candidates) {
          if (isModelInCooldown(candidateModel) && candidates.some((m) => m !== candidateModel && !isModelInCooldown(m))) {
            if (!firstErr) firstErr = new Error(`Model ${candidateModel} in cooldown`);
            continue;
          }
          try {
            const gemRes = await runGeminiFollowUp(candidateModel);
            answerText = gemRes.textOut;
            answerSources = gemRes.sourcesOut;
            resolvedModel = candidateModel;
            if (candidateModel !== selectedFollowModel) {
              const firstLine = (firstErr?.message || 'Model unavailable').split('\n')[0];
              this.notes.push(`⚠ Follow-up model ${selectedFollowModel} unavailable (${firstLine}). Automatically answered with ${candidateModel}.`);
              if (this.modelId === selectedFollowModel) {
                this.modelId = candidateModel;
              }
              this.followUpModel = candidateModel;
              if (this.composerModelSelect) this.composerModelSelect.value = candidateModel;
              fellBackFrom = selectedFollowModel;
              modelFellBack = true;
            }
            succeeded = true;
            break;
          } catch (gemErr) {
            if (!firstErr) firstErr = gemErr;
            lastErr = gemErr;
            if (gemErr?.code === 'NO_KEY' || gemErr?.status === 401 || /api key not valid/i.test(String(gemErr?.message || ''))) {
              throw gemErr;
            }
            if (gemErr?.status === 404 || gemErr?.status === 429 || gemErr?.status === 503) {
              recordModelCooldown(candidateModel, gemErr);
            }
          }
        }

        if (!succeeded) throw (lastErr || new Error('All follow-up models failed'));
      }

      return { answerText, answerSources, modelFellBack, resolvedModel, fellBackFrom };
    }

    async sendFollowUp() {
      if (!this.composerTa || this.busy || this.status === 'busy') return;
      const q = this.composerTa.value.trim();
      if (!q) return;

      clearDraftFollowUp(this.videoId);
      if (this.composerDraftBadge) {
        this.composerDraftBadge.style.display = 'none';
      }
      this.composerTa.value = '';
      this.composerTa.style.height = '38px';
      this.busy = true;
      this.status = 'busy';
      this.renderBody();

      try {
        const res = await this.executeFollowUpQuery(q);
        const turnObj = normalizeFollowUpTurn({
          q,
          a: res.answerText,
          model: res.resolvedModel,
          fallbackFrom: res.fellBackFrom || undefined,
          sources: res.answerSources
        });
        this.turns.push(Object.assign(turnObj, { sources: res.answerSources }));
        this.status = 'done';
        this.busy = false;

        writeCache(this.videoId, this.mode, this.source, {
          videoId: this.videoId,
          title: this.title,
          gen: this.opts.gen,
          text: this.text,
          sources: this.sources,
          notes: this.notes,
          model: this.modelId,
          usedOpts: this.opts,
          turns: this.turns,
          images: this.images,
          fact: this.fact
        }, this.getSummaryPersona());
        this.commit(true);
        if (res.modelFellBack) {
          this.renderAll();
          return;
        }
      } catch (err) {
        const selectedM = (this.composerModelSelect && this.composerModelSelect.value) || this.followUpModel || CONFIG.defaultModel;
        this.turns.push(normalizeFollowUpTurn({ q, a: `⚠ Error answering question: ${err.message}`, model: selectedM }));
        this.status = 'done';
        this.busy = false;
        if (this.composerTa) {
          this.composerTa.value = q;
          setDraftFollowUp(this.videoId, q);
          if (this.composerDraftBadge) {
            this.composerDraftBadge.style.display = 'inline-flex';
          }
        }
      }

      this.renderBody();
    }

    async regenerateFollowUpTurn(turnIdx, overrideQuestion = null) {
      if (this.busy || this.status === 'busy') return;
      if (!Array.isArray(this.turns) || turnIdx < 0 || turnIdx >= this.turns.length) return;
      const existing = normalizeFollowUpTurn(this.turns[turnIdx]);
      const targetQ = String(overrideQuestion !== null ? overrideQuestion : existing.q).trim();
      if (!targetQ) return;

      this.editingTurnIdx = -1;
      this.busy = true;
      this.status = 'busy';
      this.renderBody();

      try {
        const priorTurns = normalizeFollowUpTurnsList(this.turns.slice(0, turnIdx));
        const res = await this.executeFollowUpQuery(targetQ, priorTurns);
        const updated = appendFollowUpTurnVersion(existing, {
          question: targetQ,
          answer: res.answerText,
          model: res.resolvedModel,
          fallbackFrom: res.fellBackFrom || undefined,
          createdAt: Date.now()
        });
        this.turns[turnIdx] = Object.assign(updated, {
          sources: res.answerSources.length > 0 ? res.answerSources : (this.turns[turnIdx]?.sources || [])
        });
        this.status = 'done';
        this.busy = false;
        writeCache(this.videoId, this.mode, this.source, {
          videoId: this.videoId,
          title: this.title,
          gen: this.opts.gen,
          text: this.text,
          sources: this.sources,
          notes: this.notes,
          model: this.modelId,
          usedOpts: this.opts,
          turns: this.turns,
          images: this.images,
          fact: this.fact
        }, this.getSummaryPersona());
        this.commit(true);
        if (res.modelFellBack) {
          this.renderAll();
          return;
        }
      } catch (err) {
        const selectedM = (this.composerModelSelect && this.composerModelSelect.value) || this.followUpModel || CONFIG.defaultModel;
        this.turns[turnIdx] = appendFollowUpTurnVersion(existing, {
          question: targetQ,
          answer: `⚠ Error regenerating answer: ${err.message}`,
          model: selectedM,
          createdAt: Date.now()
        });
        this.status = 'done';
        this.busy = false;
      }

      this.renderBody();
    }

    stepTurnVersion(turnIdx, delta) {
      if (!Array.isArray(this.turns) || turnIdx < 0 || turnIdx >= this.turns.length) return;
      this.turns[turnIdx] = Object.assign(stepFollowUpTurnVersion(this.turns[turnIdx], delta), {
        sources: this.turns[turnIdx]?.sources || []
      });
      this.commit(true);
      this.renderBody();
    }

    renderBody() {
      if (!this.bodyEl) return;
      clearEl(this.bodyEl);
      this.bodyEl.classList.toggle('yt-gen-plain-text', getGeneratedTextPrefs().richFormatting === false);

      // Loading View
      if (this.status === 'loading') {
        const loadBox = h('div', { className: 'yt-loading-view' });
        loadBox.appendChild(h('div', { className: 'yt-big-spinner' }));
        const label = this.source === 'video' ? 'Gemini is watching the video…' : 'Reading the transcript…';
        loadBox.appendChild(h('div', { className: 'yt-loading-text' }, label));
        if (this.phase) {
          loadBox.appendChild(h('div', { className: 'yt-loading-phase' }, this.phase));
        }
        loadBox.appendChild(
          h(
            'div',
            { className: 'yt-loading-tip' },
            'Tip: You can minimize this window to the dock while it runs and keep browsing YouTube!'
          )
        );
        this.bodyEl.appendChild(loadBox);
        return;
      }

      // Error View
      if (this.status === 'error') {
        const errBox = h('div', { className: 'yt-error-view' });
        errBox.appendChild(h('div', { className: 'yt-error-title' }, 'Operation failed'));
        errBox.appendChild(h('div', { className: 'yt-error-msg' }, this.errMsg));

        const actions = h('div', { className: 'yt-error-actions' });
        const retryBtn = h('button', { className: 'yt-primary-btn', onclick: () => this.startJob() }, 'Retry');
        actions.appendChild(retryBtn);

        if (this.errCode === 'NO_KEY') {
          actions.appendChild(
            h(
              'button',
              { className: 'yt-sec-btn', onclick: () => openKeyManagerDialog(() => this.renderAll()) },
              'Add / manage API keys'
            )
          );
        }

        if (this.errCode === 'QUOTA' || this.errCode === 'ASK') {
          const next = getNextModelDown(this.modelId, []);
          if (next) {
            actions.appendChild(
              h(
                'button',
                {
                  className: 'yt-sec-btn',
                  onclick: () => {
                    this.modelId = next;
                    setLastModel(next);
                    this.startJob();
                  }
                },
                `Try ${next}`
              )
            );
          }
        }

        // YouTube Ask Quota Bypass Option (Free • No API Limit / 8-hour daily video limit bypass)
        if (
          this.mode === 'summary' &&
          (this.errCode === 'QUOTA' || /quota|limit|8.?hour|exhausted/i.test(this.errMsg || '')) &&
          !this.modelId.includes('Ask')
        ) {
          actions.appendChild(
            h(
              'button',
              {
                className: 'yt-primary-btn yt-ask-fallback-btn',
                onclick: () => {
                  this.modelId = 'YouTube Ask (Gemini in the page)';
                  this.source = 'video';
                  setLastModel(this.modelId);
                  setLastSource('video');
                  this.startJob();
                }
              },
              'Summarize with YouTube Ask (Free • No API Limit)'
            )
          );
        }

        if (this.source === 'video') {
          actions.appendChild(
            h(
              'button',
              {
                className: 'yt-sec-btn',
                onclick: () => {
                  this.source = 'text';
                  setLastSource('text');
                  this.startJob();
                }
              },
              'Summarize transcript instead'
            )
          );
        }

        const cached = readCache(this.videoId, this.mode, this.source, false, this.getSummaryPersona());
        if (cached) {
          actions.appendChild(
            h(
              'button',
              {
                className: 'yt-sec-btn',
                onclick: () => {
                  this.loadFromCache(cached);
                  this.renderAll();
                }
              },
              'Show previous cached summary'
            )
          );
        }

        errBox.appendChild(actions);
        this.bodyEl.appendChild(errBox);
        return;
      }

      // Readability Mode View: If active, render the clean centered typography reader view
      if (this.readabilityMode && this.text) {
        const readerView = this.buildReadabilityView();
        this.bodyEl.appendChild(readerView);
        return;
      }

      // Notes (Warnings & Infos)
      if (this.notes && this.notes.length > 0) {
        const notesWrap = h('div', { className: 'yt-notes-wrap' });
        for (const note of this.notes) {
          notesWrap.appendChild(h('div', { className: 'yt-note-line' }, note));
        }
        this.bodyEl.appendChild(notesWrap);
      }

      // Summary page top action bar (Quick video link, Readability toggle, Export & history browser)
      const pageBar = h('div', { className: 'yt-summary-page-bar' });
      const openVideoPill = h(
        'a',
        {
          className: 'yt-action-pill yt-open-video-pill',
          href: `https://www.youtube.com/watch?v=${this.videoId}`,
          target: '_blank',
          rel: 'noopener noreferrer',
          title: 'Open this YouTube video in a new tab'
        },
        iconExternal(13),
        h('span', {}, 'Open video in new tab')
      );
      const readabilityPill = h(
        'button',
        {
          className: `yt-action-pill yt-readability-pill ${this.readabilityMode ? 'active' : ''}`,
          title: 'Switch to clean distraction-free reader view',
          onclick: () => this.toggleReadability()
        },
        iconBook(13),
        h('span', {}, 'Readability')
      );
      const exportPill = h(
        'button',
        {
          className: 'yt-action-pill yt-export-pill',
          title: 'Export formatted summary or transcript (.txt or .pdf)',
          onclick: (e) => {
            e.stopPropagation();
            this.openExportMenu(exportPill);
          }
        },
        iconExport(13),
        h('span', {}, 'Export')
      );
      const historyPill = h(
        'button',
        {
          className: 'yt-action-pill yt-history-pill',
          title: 'Browse previous summaries that were closed',
          onclick: () => openHistoryDialog()
        },
        iconHistory(13),
        h('span', {}, 'Previous summaries')
      );
      pageBar.appendChild(openVideoPill);
      pageBar.appendChild(readabilityPill);
      pageBar.appendChild(exportPill);
      pageBar.appendChild(historyPill);
      this.bodyEl.appendChild(pageBar);

      // FEAT-07: Interactive Multi-Host Podcast Studio Mode
      if (this.mode === 'podcast') {
        const podcastEl = this.buildPodcastStudioView();
        this.bodyEl.appendChild(podcastEl);
        return;
      }

      // FEAT-04: Clickable Chapter Navigation Bar (when >= 2 chapters or long video chunks)
      const chapters = extractSummaryChapters(this.text || '', this.chapters || []);
      if (this.text && chapters.length >= 2) {
        const chapterBar = h('div', { className: 'yt-chapter-bar' });
        const metaText = chapters.length > 0 && (this.chapters?.length >= 2 || (this.notes || []).some((n) => n.includes('>45 min')))
          ? `Chapters (${chapters.length}) · Chapter-Aware`
          : `Chapters (${chapters.length})`;
        chapterBar.appendChild(h('div', { className: 'yt-chapter-meta' }, metaText));
        const listEl = h('div', { className: 'yt-chapter-list' });
        chapters.forEach((ch) => {
          const isActive = this.lastSeekSeconds !== null && this.lastSeekSeconds >= ch.startSec &&
            (ch.endSec === null || this.lastSeekSeconds < ch.endSec);
          const cleanTs = ch.tsStr.replace(/[\[\]]/g, '');
          const btn = h(
            'button',
            {
              type: 'button',
              className: `yt-chapter-btn${isActive ? ' active' : ''}`,
              'data-chapter-sec': String(ch.startSec),
              'data-chapter-ts': ch.tsStr,
              title: `Jump player to ${cleanTs}: ${ch.title}`,
              onclick: () => this.seekPlayer(ch.startSec)
            },
            h('span', { className: 'yt-chapter-ts' }, cleanTs),
            h('span', { className: 'yt-chapter-title' }, ch.title)
          );
          listEl.appendChild(btn);
        });
        chapterBar.appendChild(listEl);
        this.bodyEl.appendChild(chapterBar);
      }

      // Render Markdown content / Transcript
      if (this.text) {
        if (this.mode === 'transcript') {
          const searchBar = this.buildTranscriptSearch();
          this.bodyEl.appendChild(searchBar);
          const transcriptEl = this.buildTranscriptBody();
          this.bodyEl.appendChild(transcriptEl);
        } else {
          const displaySummaryText = this.opts.img
            ? ensureFallbackVisualMarkers(this.text, 3)
            : this.text;
          const mdEl = renderMarkdownToDom(displaySummaryText, this, (sec) => this.seekPlayer(sec));
          this.bodyEl.appendChild(mdEl);
        }

        const mainTargetType = this.mode === 'transcript' ? 'transcript' : 'summary';
        const ratingBar = this.buildResponseRatingBar({
          targetType: mainTargetType,
          targetId: 'main',
          label: this.mode === 'transcript' ? 'Was this transcript accurate?' : 'Rate this summary'
        });
        this.bodyEl.appendChild(ratingBar);
      }

      // Fact-check box (always rendered cleanly below summary across all states)
      if (this.mode === 'summary' && this.text) {
        const fcEnabled = Boolean(this.opts.fc || this.opts.src);
        if (this.factStatus === 'loading') {
          const factBox = h('div', { className: 'yt-fact-box yt-fact-loading' });
          factBox.appendChild(h('div', { className: 'yt-fact-header' }, 'Fact-check & Verification'));
          factBox.appendChild(
            h('div', { className: 'yt-fact-status-line' }, 'Verifying claims and gathering grounding sources…')
          );
          this.bodyEl.appendChild(factBox);
        } else if (this.fact) {
          const factBox = h('div', { className: 'yt-fact-box' });
          const headerRow = h('div', { className: 'yt-fact-header-row' });
          headerRow.appendChild(h('span', { className: 'yt-fact-header' }, 'Fact-check & Verification'));
          if (this.fact.model) {
            headerRow.appendChild(
              h(
                'span',
                { className: 'yt-fact-model-badge' },
                this.fact.searchGrounded === false ? `${this.fact.model}` : `${this.fact.model} · Google Search`
              )
            );
          }
          factBox.appendChild(headerRow);
          const factMd = renderMarkdownToDom(this.fact.text, this, (sec) => this.seekPlayer(sec));
          factBox.appendChild(factMd);

          if (this.fact.sources && this.fact.sources.length > 0) {
            const srcList = h('div', { className: 'yt-sources-consulted' });
            srcList.appendChild(h('div', { className: 'yt-sources-title' }, 'Sources consulted (Google Search):'));
            for (const s of this.fact.sources) {
              srcList.appendChild(
                h(
                  'div',
                  { className: 'yt-source-item' },
                  h('a', { href: s.uri, target: '_blank', rel: 'noopener noreferrer', className: 'yt-ext-link' }, s.title || s.uri)
                )
              );
            }
            factBox.appendChild(srcList);
          }

          const recheckBar = h('div', { className: 'yt-fact-recheck-bar' });
          const recheckBtn = h(
            'button',
            { className: 'yt-sec-btn', onclick: () => this.runFactCheck() },
            'Re-run Fact Check'
          );
          recheckBar.appendChild(recheckBtn);
          factBox.appendChild(recheckBar);
          this.bodyEl.appendChild(factBox);
        } else if (this.factStatus === 'error') {
          const factBox = h('div', { className: 'yt-fact-box yt-fact-error' });
          factBox.appendChild(h('div', { className: 'yt-fact-header' }, 'Fact-check & Verification'));
          factBox.appendChild(
            h('div', { className: 'yt-fact-error-msg' }, this.factError || 'Fact-check could not be completed.')
          );
          const actionBar = h('div', { className: 'yt-fact-recheck-bar' });
          if (/API key/i.test(this.factError || '')) {
            actionBar.appendChild(
              h(
                'button',
                { className: 'yt-sec-btn', onclick: () => openKeyManagerDialog(() => this.runFactCheck()) },
                'Add / manage API keys'
              )
            );
          }
          actionBar.appendChild(
            h(
              'button',
              { className: 'yt-sec-btn yt-fact-retry-btn', onclick: () => this.runFactCheck() },
              'Retry Fact-Check'
            )
          );
          factBox.appendChild(actionBar);
          this.bodyEl.appendChild(factBox);
        } else if (!fcEnabled) {
          const factBox = h('div', { className: 'yt-fact-box yt-fact-off' });
          factBox.appendChild(h('div', { className: 'yt-fact-header' }, 'Fact-check & Verification'));
          factBox.appendChild(
            h('div', { className: 'yt-fact-status-line' }, 'Fact-checking is currently disabled for this window.')
          );
          const actionBar = h('div', { className: 'yt-fact-recheck-bar' });
          actionBar.appendChild(
            h(
              'button',
              {
                className: 'yt-sec-btn yt-fact-enable-btn',
                onclick: () => {
                  this.opts.fc = true;
                  this.opts.src = true;
                  this.saveOpts();
                  this.renderAll();
                  this.runFactCheck();
                }
              },
              'Enable & Run Fact-Check'
            )
          );
          factBox.appendChild(actionBar);
          this.bodyEl.appendChild(factBox);
        } else {
          const factBox = h('div', { className: 'yt-fact-box yt-fact-pending' });
          factBox.appendChild(h('div', { className: 'yt-fact-header' }, 'Fact-check & Verification'));
          factBox.appendChild(
            h('div', { className: 'yt-fact-status-line' }, 'Ready to verify claims in this summary.')
          );
          const actionBar = h('div', { className: 'yt-fact-recheck-bar' });
          actionBar.appendChild(
            h(
              'button',
              { className: 'yt-sec-btn yt-fact-run-btn', onclick: () => this.runFactCheck() },
              'Run Fact-Check'
            )
          );
          factBox.appendChild(actionBar);
          this.bodyEl.appendChild(factBox);
        }
      }

      // Follow-up conversation bubbles (with Question Editing, Regeneration & < 1 / N > Answer History)
      if (this.turns && this.turns.length > 0) {
        const thread = h('div', { className: 'yt-thread-wrap' });
        this.turns.forEach((rawTurn, idx) => {
          const normTurn = normalizeFollowUpTurn(rawTurn);
          const activeVer = normTurn.versions[normTurn.activeVersionIndex];
          const isEditing = this.editingTurnIdx === idx;

          const userBubble = h('div', { className: 'yt-bubble yt-user-bubble', 'data-turn-idx': String(idx) });
          if (isEditing) {
            const editBox = h('div', { className: 'yt-turn-edit-box' });
            const editTa = h('textarea', {
              className: 'yt-turn-edit-input',
              rows: 2,
              value: normTurn.q,
              onkeydown: (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  this.regenerateFollowUpTurn(idx, editTa.value);
                } else if (e.key === 'Escape') {
                  this.editingTurnIdx = -1;
                  this.renderBody();
                }
              }
            });
            const editActions = h(
              'div',
              { className: 'yt-turn-edit-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'yt-sec-btn yt-turn-edit-cancel-btn',
                  onclick: () => {
                    this.editingTurnIdx = -1;
                    this.renderBody();
                  }
                },
                'Cancel'
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'yt-primary-btn yt-turn-edit-save-btn',
                  onclick: () => this.regenerateFollowUpTurn(idx, editTa.value)
                },
                'Save & Regenerate'
              )
            );
            editBox.appendChild(editTa);
            editBox.appendChild(editActions);
            userBubble.appendChild(editBox);
          } else {
            const qRow = h('div', { className: 'yt-turn-user-row' });
            qRow.appendChild(h('span', { className: 'yt-turn-user-text' }, formatMathSymbolsInText(activeVer.question)));
            qRow.appendChild(
              h(
                'button',
                {
                  type: 'button',
                  className: 'yt-turn-edit-btn',
                  title: 'Edit question & regenerate answer with selected model',
                  'aria-label': 'Edit question',
                  disabled: this.busy,
                  onclick: () => {
                    this.editingTurnIdx = idx;
                    this.renderBody();
                  }
                },
                iconPencil(12)
              )
            );
            userBubble.appendChild(qRow);
          }

          const ansBubble = h('div', { className: 'yt-bubble yt-ans-bubble', 'data-turn-idx': String(idx) });
          ansBubble.appendChild(renderMarkdownToDom(activeVer.answer, this, (sec) => this.seekPlayer(sec)));

          const ansFooter = h('div', { className: 'yt-turn-ans-footer' });
          if (normTurn.versions.length > 1) {
            const pager = h(
              'div',
              { className: 'yt-turn-ver-pager', 'aria-label': 'Response version history' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'yt-turn-ver-btn yt-turn-ver-prev',
                  title: 'Previous generated answer',
                  'aria-label': 'Previous answer version',
                  disabled: normTurn.activeVersionIndex <= 0,
                  onclick: () => this.stepTurnVersion(idx, -1)
                },
                iconChevronLeft(14)
              ),
              h(
                'span',
                { className: 'yt-turn-ver-label' },
                `${normTurn.activeVersionIndex + 1} / ${normTurn.versions.length}`
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'yt-turn-ver-btn yt-turn-ver-next',
                  title: 'Next generated answer',
                  'aria-label': 'Next answer version',
                  disabled: normTurn.activeVersionIndex >= normTurn.versions.length - 1,
                  onclick: () => this.stepTurnVersion(idx, 1)
                },
                iconChevronRight(14)
              )
            );
            ansFooter.appendChild(pager);
          }

          if (activeVer.model) {
            ansFooter.appendChild(
              h(
                'span',
                { className: 'yt-turn-model-pill' },
                activeVer.fallbackFrom && activeVer.fallbackFrom !== activeVer.model
                  ? `${activeVer.model} (from ${activeVer.fallbackFrom})`
                  : activeVer.model
              )
            );
          }

          ansFooter.appendChild(
            h(
              'button',
              {
                type: 'button',
                className: 'yt-turn-regen-btn',
                title: 'Regenerate answer using currently selected model',
                disabled: this.busy,
                onclick: () => this.regenerateFollowUpTurn(idx)
              },
              iconRefresh(12),
              h('span', {}, 'Regenerate')
            )
          );

          ansBubble.appendChild(ansFooter);
          ansBubble.appendChild(
            this.buildResponseRatingBar({
              targetType: 'followup',
              targetId: `turn_${idx}`,
              label: 'Rate answer',
              compact: true
            })
          );
          thread.appendChild(userBubble);
          thread.appendChild(ansBubble);
        });
        this.bodyEl.appendChild(thread);
      }

      // Scroll to bottom if busy with follow-up
      if (this.busy) {
        const busySpinner = h('div', { className: 'yt-followup-busy' }, 'Gemini is typing answer…');
        this.bodyEl.appendChild(busySpinner);
        setTimeout(() => {
          this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
        }, 10);
      }
    }

    buildResponseRatingBar({ targetType = 'summary', targetId = 'main', label = 'Rate this summary', compact = false } = {}) {
      const existing = getResponseRating(this.videoId, targetType, targetId);
      const wrap = h('div', {
        className: `yt-rating-bar ${compact ? 'compact' : ''}`,
        'data-target-type': targetType,
        'data-target-id': targetId
      });

      const left = h('div', { className: 'yt-rating-left' });
      const labelEl = h('span', { className: 'yt-rating-label' }, label);
      const upBtn = h(
        'button',
        {
          className: `yt-rating-btn yt-rating-up-btn ${existing?.rating === 'up' ? 'active' : ''}`,
          type: 'button',
          title: 'Thumbs up (Helpful)',
          'aria-label': `${label}: Thumbs up`,
          'aria-pressed': existing?.rating === 'up' ? 'true' : 'false'
        },
        iconThumbsUp(13),
        h('span', {}, 'Helpful')
      );
      const downBtn = h(
        'button',
        {
          className: `yt-rating-btn yt-rating-down-btn ${existing?.rating === 'down' ? 'active' : ''}`,
          type: 'button',
          title: 'Thumbs down (Needs improvement)',
          'aria-label': `${label}: Thumbs down`,
          'aria-pressed': existing?.rating === 'down' ? 'true' : 'false'
        },
        iconThumbsDown(13),
        h('span', {}, 'Needs work')
      );
      const statusEl = h(
        'span',
        { className: 'yt-rating-status' },
        existing?.rating === 'up' ? 'Marked helpful' : existing?.rating === 'down' ? 'Feedback noted' : ''
      );

      const noteWrap = h('div', {
        className: 'yt-rating-note-wrap',
        style: existing?.rating === 'down' || existing?.note ? 'display:flex;' : 'display:none;'
      });
      const noteInput = h('input', {
        type: 'text',
        className: 'yt-rating-note-input',
        placeholder: 'Optional feedback note…',
        value: existing?.note || ''
      });
      const saveNoteBtn = h(
        'button',
        {
          className: 'yt-rating-note-save-btn',
          type: 'button',
          onclick: () => {
            const cur = getResponseRating(this.videoId, targetType, targetId);
            const r = cur?.rating || 'down';
            setResponseRating(this.videoId, targetType, targetId, r, noteInput.value.trim());
            statusEl.textContent = 'Feedback saved';
            announceLive('Rating feedback saved');
          }
        },
        'Save'
      );
      noteWrap.appendChild(noteInput);
      noteWrap.appendChild(saveNoteBtn);

      const syncUI = (rec) => {
        const val = rec?.rating || null;
        upBtn.classList.toggle('active', val === 'up');
        upBtn.setAttribute('aria-pressed', val === 'up' ? 'true' : 'false');
        downBtn.classList.toggle('active', val === 'down');
        downBtn.setAttribute('aria-pressed', val === 'down' ? 'true' : 'false');
        statusEl.textContent = val === 'up' ? 'Marked helpful' : val === 'down' ? 'Feedback noted' : '';
        noteWrap.style.display = val === 'down' || rec?.note ? 'flex' : 'none';
      };

      upBtn.addEventListener('click', () => {
        const rec = setResponseRating(this.videoId, targetType, targetId, 'up');
        syncUI(rec);
        announceLive(rec?.rating === 'up' ? 'Thumbs up rating saved' : 'Rating cleared');
      });
      downBtn.addEventListener('click', () => {
        const rec = setResponseRating(this.videoId, targetType, targetId, 'down');
        syncUI(rec);
        announceLive(rec?.rating === 'down' ? 'Thumbs down rating saved' : 'Rating cleared');
      });

      left.appendChild(labelEl);
      left.appendChild(upBtn);
      left.appendChild(downBtn);
      left.appendChild(statusEl);
      wrap.appendChild(left);
      if (!compact) {
        wrap.appendChild(noteWrap);
      }
      return wrap;
    }

    buildTranscriptSearch() {
      const bar = h('div', { className: 'yt-transcript-search-bar' });

      const inputWrap = h('div', { className: 'yt-transcript-input-wrap' });
      const searchIcon = iconSearch(14);
      const input = h('input', {
        type: 'text',
        className: 'yt-transcript-search-input',
        placeholder: 'Search keywords in transcript (Enter / Shift+Enter to jump)…',
        value: this.transcriptSearchQuery || '',
        oninput: (e) => {
          this.transcriptSearchQuery = e.target.value;
          this.transcriptMatchIdx = 0;
          this.clearBtnVisible();
          this.refreshTranscriptBody();
        },
        onkeydown: (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
              this.jumpTranscriptMatch(-1);
            } else {
              this.jumpTranscriptMatch(1);
            }
          } else if (e.key === 'Escape') {
            this.transcriptSearchQuery = '';
            input.value = '';
            this.clearBtnVisible();
            this.refreshTranscriptBody();
          }
        }
      });
      this.transcriptSearchInput = input;

      const clearBtn = h(
        'button',
        {
          className: 'yt-transcript-clear-btn',
          title: 'Clear search',
          style: this.transcriptSearchQuery ? 'display:flex;' : 'display:none;',
          onclick: () => {
            this.transcriptSearchQuery = '';
            input.value = '';
            this.clearBtnVisible();
            this.refreshTranscriptBody();
            input.focus();
          }
        },
        iconClose(12)
      );
      this.transcriptClearBtn = clearBtn;

      inputWrap.appendChild(searchIcon);
      inputWrap.appendChild(input);
      inputWrap.appendChild(clearBtn);

      const countBadge = h('span', { className: 'yt-transcript-match-count' }, '0 matches');
      this.transcriptCountEl = countBadge;

      const prevBtn = h(
        'button',
        {
          className: 'yt-transcript-nav-btn yt-transcript-prev-btn',
          title: 'Previous match (Shift+Enter)',
          onclick: () => this.jumpTranscriptMatch(-1)
        },
        '▲'
      );
      this.transcriptPrevBtn = prevBtn;

      const nextBtn = h(
        'button',
        {
          className: 'yt-transcript-nav-btn yt-transcript-next-btn',
          title: 'Next match (Enter)',
          onclick: () => this.jumpTranscriptMatch(1)
        },
        '▼'
      );
      this.transcriptNextBtn = nextBtn;

      const filterToggle = this.buildCheckbox('Filter lines', Boolean(this.transcriptFilterOnly), (v) => {
        this.transcriptFilterOnly = v;
        this.refreshTranscriptBody();
      });

      const followBtn = h(
        'button',
        {
          className: `yt-follow-along-btn ${this.followAlong ? 'active' : ''}`,
          type: 'button',
          'aria-pressed': this.followAlong ? 'true' : 'false',
          title: this.followAlong
            ? 'Follow-Along Lock: ON (Auto-scrolls transcript to active cue)'
            : 'Follow-Along Lock: Paused (Manual scroll locked)',
          onclick: () => {
            this.followAlong = !this.followAlong;
            followBtn.classList.toggle('active', this.followAlong);
            followBtn.setAttribute('aria-pressed', this.followAlong ? 'true' : 'false');
            followBtn.title = this.followAlong
              ? 'Follow-Along Lock: ON (Auto-scrolls transcript to active cue)'
              : 'Follow-Along Lock: Paused (Manual scroll locked)';
            clearEl(followBtn);
            followBtn.appendChild(iconSync(12));
            followBtn.appendChild(h('span', {}, this.followAlong ? 'Follow-Along: On' : 'Follow-Along: Paused'));
            this.commit(true);
            announceLive(this.followAlong ? 'Follow-along auto-scroll enabled' : 'Follow-along auto-scroll paused');
          }
        },
        iconSync(12),
        h('span', {}, this.followAlong ? 'Follow-Along: On' : 'Follow-Along: Paused')
      );
      this.transcriptFollowBtn = followBtn;

      bar.appendChild(inputWrap);
      bar.appendChild(countBadge);
      bar.appendChild(prevBtn);
      bar.appendChild(nextBtn);
      bar.appendChild(filterToggle);
      bar.appendChild(followBtn);

      return bar;
    }

    clearBtnVisible() {
      if (this.transcriptClearBtn) {
        this.transcriptClearBtn.style.display = this.transcriptSearchQuery ? 'flex' : 'none';
      }
    }

    refreshTranscriptBody() {
      const existing = this.bodyEl?.querySelector('.yt-transcript-container');
      if (existing) {
        const newBody = this.buildTranscriptBody();
        existing.replaceWith(newBody);
      }
    }

    buildTranscriptBody() {
      const container = h('div', { className: 'yt-markdown-body yt-transcript-container' });
      this.transcriptMarks = [];
      this.transcriptCues = [];

      const query = (this.transcriptSearchQuery || '').trim();
      const queryLower = query.toLowerCase();
      const lines = (this.text || '').split('\n');

      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();
        if (!trimmed) continue;

        // In filter-only mode, skip non-matching lines (unless it's the main header)
        if (this.transcriptFilterOnly && queryLower) {
          if (!trimmed.toLowerCase().includes(queryLower) && !trimmed.startsWith('## Transcript')) {
            continue;
          }
        }

        // Headings like ## Transcript
        if (trimmed.startsWith('#')) {
          const level = (trimmed.match(/^#+/) || [''])[0].length;
          const text = formatMathSymbolsInText(trimmed.slice(level).trim());
          const hTag = level <= 2 ? 'h3' : 'h4';
          const heading = h(hTag, { className: `yt-md-${hTag}` });
          this.appendTranscriptHighlightedText(heading, text, query);
          container.appendChild(heading);
          continue;
        }

        // Check for timestamp format: [01:15] or [1:02:30]
        const tsMatch = /^\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*(.*)$/.exec(trimmed);
        if (tsMatch) {
          const tsStr = trimmed.slice(0, trimmed.indexOf(']') + 1);
          const restText = formatMathSymbolsInText(trimmed.slice(tsStr.length).trim());

          const parts = tsStr.slice(1, -1).split(':').map(Number);
          let sec = 0;
          if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
          else sec = parts[0] * 60 + parts[1];

          const isCurrentlySpeaking = Boolean(
            (this.ttsState === 'playing' || this.ttsState === 'paused') &&
            this.currentSpeakingCue &&
            (this.currentSpeakingCue.startSec === sec || this.currentSpeakingCue.rawIndex === i)
          );

          const lineEl = h('div', {
            className: 'yt-transcript-line' + (isCurrentlySpeaking ? ' yt-transcript-line-speaking' : ''),
            'data-start-sec': String(sec),
            'data-ts': tsStr,
            'data-line-idx': String(i)
          });

          this.transcriptCues.push({
            lineEl,
            rawIndex: i,
            startSec: sec,
            tsStr,
            text: restText
          });

          if (isCurrentlySpeaking) {
            const badge = h('span', { className: 'yt-speaking-indicator', title: `Speaking ${tsStr}` });
            badge.appendChild(iconSpeaker(12));
            lineEl.appendChild(badge);
          }

          const tsLink = h(
            'a',
            {
              className: 'yt-ts-link',
              href: `/watch?v=${encodeURIComponent(this.videoId)}&t=${sec}s`,
              title: `Jump video to ${tsStr}`,
              onclick: (e) => {
                if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                  e.preventDefault();
                  this.seekPlayer(sec);
                }
              }
            },
            tsStr + ' '
          );
          lineEl.appendChild(tsLink);

          const textSpan = h('span', { className: 'yt-transcript-text' });
          this.appendTranscriptHighlightedText(textSpan, restText, query);
          lineEl.appendChild(textSpan);
          container.appendChild(lineEl);
          continue;
        }

        // Generic paragraph
        const p = h('p', { className: 'yt-md-p' });
        this.appendTranscriptHighlightedText(p, formatMathSymbolsInText(trimmed), query);
        container.appendChild(p);
      }

      // Update match count badge
      const total = this.transcriptMarks.length;
      this.transcriptMatchCount = total;

      if (!query) {
        if (this.transcriptCountEl) this.transcriptCountEl.textContent = '0 matches';
        if (this.transcriptPrevBtn) this.transcriptPrevBtn.disabled = true;
        if (this.transcriptNextBtn) this.transcriptNextBtn.disabled = true;
      } else if (total === 0) {
        if (this.transcriptCountEl) this.transcriptCountEl.textContent = 'No matches';
        if (this.transcriptPrevBtn) this.transcriptPrevBtn.disabled = true;
        if (this.transcriptNextBtn) this.transcriptNextBtn.disabled = true;
      } else {
        if (this.transcriptMatchIdx >= total) this.transcriptMatchIdx = 0;
        if (this.transcriptCountEl) {
          this.transcriptCountEl.textContent = `${this.transcriptMatchIdx + 1} of ${total}`;
        }
        if (this.transcriptPrevBtn) this.transcriptPrevBtn.disabled = false;
        if (this.transcriptNextBtn) this.transcriptNextBtn.disabled = false;
        this.transcriptMarks[this.transcriptMatchIdx]?.classList.add('active');
      }

      return container;
    }

    appendTranscriptHighlightedText(parent, text, query) {
      if (!query) {
        parent.appendChild(document.createTextNode(text));
        return;
      }
      const lower = text.toLowerCase();
      const qLower = query.toLowerCase();
      let start = 0;
      let idx = lower.indexOf(qLower, start);

      while (idx !== -1) {
        if (idx > start) {
          parent.appendChild(document.createTextNode(text.slice(start, idx)));
        }
        const matchText = text.slice(idx, idx + query.length);
        const mark = h('mark', { className: 'yt-transcript-highlight' }, matchText);
        parent.appendChild(mark);
        this.transcriptMarks.push(mark);
        start = idx + query.length;
        idx = lower.indexOf(qLower, start);
      }

      if (start < text.length) {
        parent.appendChild(document.createTextNode(text.slice(start)));
      }
    }

    jumpTranscriptMatch(delta) {
      if (this.transcriptMarks.length === 0) return;
      this.transcriptMarks[this.transcriptMatchIdx]?.classList.remove('active');
      this.transcriptMatchIdx =
        (this.transcriptMatchIdx + delta + this.transcriptMarks.length) % this.transcriptMarks.length;
      const target = this.transcriptMarks[this.transcriptMatchIdx];
      if (target) {
        target.classList.add('active');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (this.transcriptCountEl) {
        this.transcriptCountEl.textContent = `${this.transcriptMatchIdx + 1} of ${this.transcriptMarks.length}`;
      }
    }

    switchToPodcastMode() {
      if (this.mode === 'podcast') return;
      if (this.mode === 'summary' && this.text && this.status === 'done') {
        this.podcastSummaryText = this.text;
      }
      this.stopTts();
      this.mode = 'podcast';
      this.onModeOrSourceChanged();
    }

    getResolvedSummaryForPodcast() {
      if (this.mode === 'summary' && this.text) return this.text;
      if (this.podcastSummaryText) return this.podcastSummaryText;
      const personaCached = readCache(this.videoId, 'summary', this.source, true, this.getSummaryPersona());
      if (personaCached?.text) return personaCached.text;
      const defaultCached = readCache(this.videoId, 'summary', 'video', true, 'executive');
      if (defaultCached?.text) return defaultCached.text;
      return '';
    }

    setPodcastHostCount(rawCount) {
      const nextCount = normalizePodcastHostCount(rawCount, 2, CONFIG.podcastMaxHosts || 6);
      setDefaultPodcastHostCount(nextCount);
      this.podcastHostCount = nextCount;
      this.podcastHosts = buildDefaultPodcastHosts(nextCount, this.podcastHosts);
      this.commit(true);
      this.renderBody();
      announceLive(`Podcast hosts set to ${nextCount}`);
    }

    updatePodcastHostField(hostIndex, field, value) {
      if (!Array.isArray(this.podcastHosts) || !this.podcastHosts[hostIndex]) return;
      const updated = this.podcastHosts.map((hItem, idx) => {
        if (idx !== hostIndex) return hItem;
        if (field === 'voiceName') {
          return Object.assign({}, hItem, { voiceName: value });
        }
        if (field === 'name') {
          const clean = String(value || '').trim().slice(0, 32);
          return clean ? Object.assign({}, hItem, { name: clean }) : hItem;
        }
        return hItem;
      });
      this.podcastHosts = buildDefaultPodcastHosts(this.podcastHostCount, updated);
      this.commit(true);
    }

    prefetchPodcastTurnAudio(turn) {
      if (!turn || turn.isUser) return null;
      const synthMode = getPodcastSynthesisMode();
      if (synthMode === 'webspeech') return null;
      const keyObj = getStoredKeys().find((k) => k.id === this.keyId) || getStoredKeys()[0];
      if (!keyObj?.key || typeof Audio === 'undefined') return null;

      const hostNames = (this.podcastHosts || []).map((hItem) => hItem.name);
      const clean = sanitizeSpokenTurnText(turn.text || '', hostNames);
      if (!clean) return null;
      const cacheKey = `${turn.voiceName || 'Kore'}:${clean.slice(0, 220)}`;
      if (this.podcastAudioPrefetch.has(cacheKey)) {
        return this.podcastAudioPrefetch.get(cacheKey);
      }
      const p = generatePodcastTurnAudio(turn, this.podcastHosts, keyObj).catch(() => null);
      this.podcastAudioPrefetch.set(cacheKey, p);
      return p;
    }

    prefetchUpcomingPodcastTurns(startIdx, lookahead = 3) {
      const turns = this.podcastEpisode?.turns;
      if (!Array.isArray(turns) || turns.length === 0) return;
      const end = Math.min(turns.length, Math.max(0, startIdx) + Math.max(1, lookahead) + 1);
      for (let i = Math.max(0, startIdx); i < end; i++) {
        this.prefetchPodcastTurnAudio(turns[i]);
      }
    }

    async generatePodcastFromSummary() {
      if (this.podcastGenerating) return;
      const summaryText = this.getResolvedSummaryForPodcast();
      if (!summaryText) {
        this.podcastAutoGeneratePending = true;
        this.mode = 'summary';
        this.startJob();
        return;
      }

      this.stopPodcastPlayback();
      this.podcastAudioPrefetch.clear();
      this.podcastGenToken += 1;
      const genToken = this.podcastGenToken;

      this.podcastSummaryText = summaryText;
      this.podcastGenerating = true;
      this.podcastGeneratingMore = false;
      this.renderBody();

      const hosts = buildDefaultPodcastHosts(this.podcastHostCount, this.podcastHosts);
      this.podcastHosts = hosts;
      const sections = splitSummaryIntoPodcastSections(summaryText, 1400);
      const totalParts = sections.length;
      let episode = null;

      try {
        const keyObj = getStoredKeys().find((k) => k.id === this.keyId) || getStoredKeys()[0];
        if (keyObj?.key && !String(this.modelId || '').includes('Ask')) {
          const prompt = buildPodcastScriptPartPrompt({
            videoTitle: this.title,
            sectionText: sections[0],
            partIndex: 0,
            totalParts,
            hosts
          });
          const res = await callGeminiRaw(
            this.modelId || CONFIG.defaultModel,
            keyObj.key,
            {
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7 }
            },
            90000
          );
          if (genToken !== this.podcastGenToken || this.closed) return;
          const rawText = res?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
          const parsed = parsePodcastScriptResponse(rawText, hosts, {
            episodeTitle: `Podcast: ${this.title}`
          });
          if (parsed.turns.length >= 2) {
            episode = {
              title: parsed.title,
              hostCount: hosts.length,
              hosts,
              turns: parsed.turns,
              createdAt: Date.now(),
              isComplete: totalParts === 1,
              generatedParts: 1,
              totalParts
            };
          }
        }
      } catch (err) {
        if (CONFIG.debug) console.warn('[YTAIS] Gemini podcast part 1 generation fallback:', err);
      }

      if (genToken !== this.podcastGenToken || this.closed) return;

      if (!episode) {
        const detPart = buildDeterministicPodcastEpisodePart({
          videoTitle: this.title,
          sectionText: sections[0],
          partIndex: 0,
          totalParts,
          hosts,
          startTurnNumber: 1
        });
        episode = {
          title: detPart.title,
          hostCount: hosts.length,
          hosts,
          turns: detPart.turns,
          createdAt: Date.now(),
          isComplete: totalParts === 1,
          generatedParts: 1,
          totalParts
        };
      }

      this.podcastEpisode = episode;
      this.podcastActiveTurnIdx = 0;
      this.podcastGenerating = false;
      this.podcastGeneratingMore = totalParts > 1;
      this.status = 'done';
      writePodcastEpisode(this.videoId, episode);
      this.commit(true);
      this.renderAll();
      this.prefetchUpcomingPodcastTurns(0, 3);
      announceLive(`Podcast Part 1 ready (${hosts.length} hosts)`);

      if (totalParts > 1) {
        this.continuePodcastGeneration(sections, hosts, genToken);
      }
    }

    async continuePodcastGeneration(sections, hosts, genToken) {
      const totalParts = Array.isArray(sections) ? sections.length : 1;
      const keyObj = getStoredKeys().find((k) => k.id === this.keyId) || getStoredKeys()[0];
      const canUseGemini = Boolean(keyObj?.key && !String(this.modelId || '').includes('Ask'));

      for (let partIdx = 1; partIdx < totalParts; partIdx++) {
        if (genToken !== this.podcastGenToken || this.closed || !this.podcastEpisode) return;

        let partTurns = null;
        if (canUseGemini) {
          try {
            const prompt = buildPodcastContinuationPrompt({
              videoTitle: this.title,
              sectionText: sections[partIdx],
              partIndex: partIdx,
              totalParts,
              hosts,
              previousTurns: this.podcastEpisode.turns
            });
            const res = await callGeminiRaw(
              this.modelId || CONFIG.defaultModel,
              keyObj.key,
              {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7 }
              },
              90000
            );
            if (genToken !== this.podcastGenToken || this.closed || !this.podcastEpisode) return;
            const rawText = res?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
            const parsed = parsePodcastScriptResponse(rawText, hosts, {
              episodeTitle: this.podcastEpisode.title
            });
            if (parsed.turns.length >= 1) {
              partTurns = parsed.turns;
            }
          } catch (err) {
            if (CONFIG.debug) console.warn(`[YTAIS] Gemini podcast part ${partIdx + 1} fallback:`, err);
          }
        }

        if (genToken !== this.podcastGenToken || this.closed || !this.podcastEpisode) return;

        if (!partTurns || partTurns.length === 0) {
          const detPart = buildDeterministicPodcastEpisodePart({
            videoTitle: this.title,
            sectionText: sections[partIdx],
            partIndex: partIdx,
            totalParts,
            hosts,
            startTurnNumber: this.podcastEpisode.turns.length + 1
          });
          partTurns = detPart.turns;
        }

        const prevLen = this.podcastEpisode.turns.length;
        this.podcastEpisode = appendPodcastEpisodeTurns(this.podcastEpisode, partTurns, {
          generatedParts: partIdx + 1,
          totalParts
        });
        writePodcastEpisode(this.videoId, this.podcastEpisode);
        this.commit(true);
        this.appendPodcastTurnDom(prevLen);
        this.updatePodcastPlayerDom();
        this.prefetchUpcomingPodcastTurns(this.podcastActiveTurnIdx || 0, 3);
      }

      if (genToken === this.podcastGenToken && !this.closed) {
        this.podcastGeneratingMore = false;
        this.updatePodcastPlayerDom();
      }
    }

    buildPodcastTurnCard(turn, idx, curIdx) {
      const hostMeta = this.podcastHosts.find((hItem) => hItem.name === turn.speaker);
      const accent = turn.isUser ? 'var(--md-sys-color-primary, #3ea6ff)' : hostMeta?.color || '#38bdf8';
      const turnCard = h(
        'div',
        {
          className: `yt-podcast-turn ${idx === curIdx ? 'active' : ''} ${turn.isUser ? 'yt-podcast-turn-user' : ''} ${turn.isResponse ? 'yt-podcast-turn-reply' : ''}`,
          'data-turn-idx': String(idx),
          'data-speaker': turn.speaker,
          onclick: () => {
            if (!turn.isUser) {
              this.podcastActiveTurnIdx = idx;
              this.playPodcastFromTurn(idx);
            }
          }
        }
      );
      const turnHead = h(
        'div',
        { className: 'yt-podcast-turn-head' },
        h(
          'span',
          { className: 'yt-podcast-turn-speaker', style: `color:${accent};` },
          turn.speaker
        ),
        h('span', { className: 'yt-podcast-turn-role' }, turn.role)
      );
      if (typeof turn.timestampSec === 'number' && Number.isFinite(turn.timestampSec)) {
        const tsLabel = formatSecondsToTimestamp(turn.timestampSec);
        turnHead.appendChild(
          h(
            'button',
            {
              type: 'button',
              className: 'yt-ts-link yt-podcast-ts-jump',
              onclick: (e) => {
                e.stopPropagation();
                this.seekPlayer(turn.timestampSec);
              }
            },
            `[${tsLabel}]`
          )
        );
      }
      const turnBody = h('div', { className: 'yt-podcast-turn-text' }, turn.text);
      turnCard.appendChild(turnHead);
      turnCard.appendChild(turnBody);
      return turnCard;
    }

    appendPodcastTurnDom(fromIdx) {
      if (!this.bodyEl || this.mode !== 'podcast' || !this.podcastEpisode) return;
      const listEl = this.bodyEl.querySelector('.yt-podcast-dialogue-list');
      if (!listEl) return;
      const turns = this.podcastEpisode.turns || [];
      const curIdx = this.podcastActiveTurnIdx || 0;
      for (let i = Math.max(0, fromIdx); i < turns.length; i++) {
        listEl.appendChild(this.buildPodcastTurnCard(turns[i], i, curIdx));
      }
    }

    stopPodcastPlayback() {
      this.podcastPlaybackToken += 1;
      if (this.podcastFallbackTimer) {
        clearTimeout(this.podcastFallbackTimer);
        this.podcastFallbackTimer = null;
      }
      if (this.podcastAudioEl) {
        try {
          this.podcastAudioEl.onended = null;
          this.podcastAudioEl.onerror = null;
          this.podcastAudioEl.pause();
          this.podcastAudioEl.src = '';
        } catch (_) {}
        this.podcastAudioEl = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }
      this.podcastStatus = 'idle';
      this.updatePodcastPlayerDom();
    }

    pausePodcastPlayback() {
      if (this.podcastStatus !== 'playing') return;
      this.podcastPlaybackToken += 1;
      if (this.podcastFallbackTimer) {
        clearTimeout(this.podcastFallbackTimer);
        this.podcastFallbackTimer = null;
      }
      if (this.podcastAudioEl) {
        try { this.podcastAudioEl.pause(); } catch (_) {}
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }
      this.podcastStatus = 'paused';
      this.updatePodcastPlayerDom();
    }

    togglePodcastPlayback() {
      if (!this.podcastEpisode || !this.podcastEpisode.turns?.length) return;
      if (this.podcastStatus === 'playing') {
        this.pausePodcastPlayback();
      } else {
        const startIdx = this.podcastStatus === 'paused' ? this.podcastActiveTurnIdx : (this.podcastActiveTurnIdx || 0);
        this.playPodcastFromTurn(startIdx);
      }
    }

    stepPodcastTurn(delta) {
      if (!this.podcastEpisode || !this.podcastEpisode.turns?.length) return;
      const maxIdx = this.podcastEpisode.turns.length - 1;
      const target = Math.max(0, Math.min(maxIdx, (this.podcastActiveTurnIdx || 0) + delta));
      this.podcastActiveTurnIdx = target;
      if (this.podcastStatus === 'playing') {
        this.playPodcastFromTurn(target);
      } else {
        this.updatePodcastPlayerDom();
      }
    }

    async playPodcastFromTurn(startIdx = 0) {
      if (!this.podcastEpisode || !Array.isArray(this.podcastEpisode.turns) || this.podcastEpisode.turns.length === 0) return;
      this.stopTts();
      const clampedIdx = Math.max(0, Math.min(this.podcastEpisode.turns.length - 1, Math.floor(startIdx)));
      this.podcastPlaybackToken += 1;
      const token = this.podcastPlaybackToken;

      if (this.podcastFallbackTimer) {
        clearTimeout(this.podcastFallbackTimer);
        this.podcastFallbackTimer = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }

      // Immediately pre-warm current + next 3 turns concurrently to remove inter-speaker pauses
      this.prefetchUpcomingPodcastTurns(clampedIdx, 3);

      const advance = async (idx) => {
        if (token !== this.podcastPlaybackToken || this.closed || !this.podcastEpisode) return;
        const turns = this.podcastEpisode.turns;
        if (idx >= turns.length) {
          this.podcastStatus = 'idle';
          this.podcastActiveTurnIdx = 0;
          this.updatePodcastPlayerDom();
          return;
        }
        const turn = turns[idx];
        this.podcastActiveTurnIdx = idx;
        this.podcastStatus = 'playing';
        this.updatePodcastPlayerDom();
        // Keep the next 3 upcoming turns prefetched in background while this turn plays
        this.prefetchUpcomingPodcastTurns(idx + 1, 3);

        if (turn.isUser) {
          this.podcastFallbackTimer = setTimeout(() => advance(idx + 1), 350);
          return;
        }

        // Try Gemini neural audio (awaiting pre-warmed lookahead cache for zero pause between speakers)
        const synthMode = getPodcastSynthesisMode();
        const keyObj = getStoredKeys().find((k) => k.id === this.keyId) || getStoredKeys()[0];
        if (synthMode !== 'webspeech' && keyObj?.key && typeof Audio !== 'undefined') {
          try {
            const prefetched = await this.prefetchPodcastTurnAudio(turn);
            const dataUrl = prefetched || (await generatePodcastTurnAudio(turn, this.podcastHosts, keyObj));
            if (token !== this.podcastPlaybackToken) return;
            const audio = new Audio(dataUrl);
            audio.preload = 'auto';
            audio.playbackRate = this.podcastRate || 1.0;
            audio.volume = this.ttsVolume ?? 1.0;
            this.podcastAudioEl = audio;
            await new Promise((resolve) => {
              let settled = false;
              const done = () => {
                if (settled) return;
                settled = true;
                resolve();
              };
              audio.onended = done;
              audio.onerror = done;
              audio.play().catch(done);
            });
            this.podcastAudioEl = null;
            if (token === this.podcastPlaybackToken) {
              advance(idx + 1);
            }
            return;
          } catch (_) {
            // Fall through gracefully to Web Speech / timed turn progression
          }
        }

        if (token !== this.podcastPlaybackToken) return;

        // Browser Web Speech fallback with distinct voice & pitch per host (zero self-names)
        if (typeof window !== 'undefined' && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
          let settled = false;
          const finishTurn = () => {
            if (settled) return;
            settled = true;
            if (this.podcastFallbackTimer) {
              clearTimeout(this.podcastFallbackTimer);
              this.podcastFallbackTimer = null;
            }
            if (token === this.podcastPlaybackToken) {
              advance(idx + 1);
            }
          };

          try {
            const hostNames = (this.podcastHosts || []).map((hItem) => hItem.name);
            const speechText = cleanTextForSpeech(
              sanitizeSpokenTurnText(turn.text, hostNames),
              { skipSilence: false }
            );
            const utt = new SpeechSynthesisUtterance(speechText);
            utt.rate = this.podcastRate || 1.0;
            utt.volume = this.ttsVolume ?? 1.0;
            utt.pitch = clampPitch(turn.pitch || 1.0);
            const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
            if (voices.length > 0) {
              const hostIdx = Math.max(0, this.podcastHosts.findIndex((h) => h.name === turn.speaker));
              const enVoices = voices.filter((v) => v.lang?.startsWith('en'));
              const pool = enVoices.length > 0 ? enVoices : voices;
              utt.voice = pool[hostIdx % pool.length];
            }
            utt.onend = finishTurn;
            utt.onerror = finishTurn;
            // Safety guard timer in headless browsers where speechSynthesis callbacks do not fire
            const estMs = Math.max(1100, Math.min(8000, Math.round((speechText.length / 19) * (1000 / (this.podcastRate || 1)))));
            this.podcastFallbackTimer = setTimeout(finishTurn, estMs);
            window.speechSynthesis.speak(utt);
            return;
          } catch (_) {}
        }

        const fallbackMs = Math.max(950, Math.min(4800, Math.round((turn.text.length / 21) * (1000 / (this.podcastRate || 1)))));
        this.podcastFallbackTimer = setTimeout(() => advance(idx + 1), fallbackMs);
      };

      advance(clampedIdx);
    }

    updatePodcastPlayerDom() {
      this.renderDockTab();
      if (!this.bodyEl || this.mode !== 'podcast') return;
      const playBtn = this.bodyEl.querySelector('.yt-podcast-play-btn');
      if (playBtn) {
        clearEl(playBtn);
        playBtn.appendChild(this.podcastStatus === 'playing' ? iconPause(14) : iconPlay(14));
        playBtn.appendChild(h('span', {}, this.podcastStatus === 'playing' ? 'Pause' : this.podcastStatus === 'paused' ? 'Resume' : 'Play Episode'));
        playBtn.classList.toggle('active', this.podcastStatus === 'playing');
      }
      const statusLabel = this.bodyEl.querySelector('.yt-podcast-now-playing');
      const curTurn = this.podcastEpisode?.turns?.[this.podcastActiveTurnIdx || 0];
      if (statusLabel && curTurn && this.podcastEpisode) {
        const partSuffix =
          this.podcastEpisode.totalParts > 1 && !this.podcastEpisode.isComplete
            ? ` · Part ${this.podcastEpisode.generatedParts || 1}/${this.podcastEpisode.totalParts} (generating next part…)`
            : this.podcastEpisode.totalParts > 1
              ? ` · Full summary (${this.podcastEpisode.totalParts} parts)`
              : '';
        statusLabel.textContent = `Turn ${(this.podcastActiveTurnIdx || 0) + 1} of ${this.podcastEpisode.turns.length} · ${curTurn.speaker} (${curTurn.role})${partSuffix}`;
      }
      const genBadge = this.bodyEl.querySelector('.yt-podcast-gen-badge');
      if (genBadge) {
        if (this.podcastEpisode && !this.podcastEpisode.isComplete && this.podcastEpisode.totalParts > 1) {
          genBadge.style.display = 'inline-flex';
          genBadge.textContent = `Live: Part ${this.podcastEpisode.generatedParts || 1} of ${this.podcastEpisode.totalParts} ready`;
        } else {
          genBadge.style.display = 'none';
        }
      }
      const turnCards = Array.from(this.bodyEl.querySelectorAll('.yt-podcast-turn'));
      turnCards.forEach((card) => {
        const idx = parseInt(card.getAttribute('data-turn-idx') || '-1', 10);
        const isActive = idx === (this.podcastActiveTurnIdx || 0);
        card.classList.toggle('active', isActive);
        if (isActive && this.podcastStatus === 'playing') {
          try { card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}
        }
      });
    }

    togglePodcastVoiceInput(micBtn, inputEl) {
      if (this._podcastListening) {
        if (this._podcastSpeechRec) {
          try { this._podcastSpeechRec.stop(); } catch (_) {}
          this._podcastSpeechRec = null;
        }
        this._podcastListening = false;
        if (micBtn) micBtn.classList.remove('yt-mic-recording');
        return;
      }

      // Pause active episode immediately while listener speaks (NotebookLM style)
      if (this.podcastStatus === 'playing') {
        this.pausePodcastPlayback();
      }

      const SpeechRec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
      if (window.__yt_mock_voice_text || !SpeechRec || getVoiceInputEngine() === 'gemini') {
        const spoken = String(
          window.__yt_mock_voice_text || 'How does this compare in practical real-world deployments?'
        ).trim();
        this.podcastQaDraft = spoken;
        if (inputEl) inputEl.value = spoken;
        const engineLabel = getVoiceInputEngine() === 'gemini' ? 'Gemini 3.5 Transcribe' : 'Web Speech';
        this.showTtsFeedback(`🎤 Voice question captured (${engineLabel})`);
        this.submitPodcastInteraction(spoken, { isVoice: true });
        return;
      }

      try {
        const rec = new SpeechRec();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'en-US';
        this._podcastSpeechRec = rec;
        this._podcastListening = true;
        if (micBtn) {
          micBtn.classList.add('yt-mic-recording');
          micBtn.title = 'Listening to your question… Click to stop';
        }
        rec.onresult = (evt) => {
          const transcript = evt.results?.[0]?.[0]?.transcript;
          if (transcript && transcript.trim()) {
            this.podcastQaDraft = transcript.trim();
            if (inputEl) inputEl.value = this.podcastQaDraft;
            this.submitPodcastInteraction(this.podcastQaDraft, { isVoice: true });
          }
        };
        rec.onerror = () => {
          this._podcastListening = false;
          if (micBtn) micBtn.classList.remove('yt-mic-recording');
        };
        rec.onend = () => {
          this._podcastListening = false;
          if (micBtn) micBtn.classList.remove('yt-mic-recording');
        };
        rec.start();
      } catch (_) {
        this._podcastListening = false;
        if (micBtn) micBtn.classList.remove('yt-mic-recording');
      }
    }

    async submitPodcastInteraction(rawQuery, { isVoice = false } = {}) {
      const q = String(rawQuery ?? this.podcastQaDraft ?? '').trim();
      if (!q || !this.podcastEpisode || this.podcastInteracting) return;

      this.pausePodcastPlayback();
      this.podcastInteracting = true;
      this.podcastQaDraft = '';
      this.renderBody();

      const summaryText = this.getResolvedSummaryForPodcast();
      const hosts = this.podcastHosts;
      const insertAfterIdx = this.podcastStatus === 'idle' && this.podcastActiveTurnIdx === 0
        ? this.podcastEpisode.turns.length - 1
        : this.podcastActiveTurnIdx;

      let result = null;
      try {
        const keyObj = getStoredKeys().find((k) => k.id === this.keyId) || getStoredKeys()[0];
        if (keyObj?.key && !String(this.modelId || '').includes('Ask')) {
          const prompt = buildPodcastInteractionPrompt({
            videoTitle: this.title,
            summaryText,
            hosts,
            recentTurns: this.podcastEpisode.turns.slice(Math.max(0, insertAfterIdx - 3), insertAfterIdx + 1),
            listenerQuery: q,
            isVoice
          });
          const res = await callGeminiRaw(
            this.modelId || CONFIG.defaultModel,
            keyObj.key,
            {
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7 }
            },
            60000
          );
          const rawOut = res?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
          const parsed = parsePodcastScriptResponse(rawOut, hosts, { markAsResponse: true });
          if (parsed.turns.length > 0) {
            result = {
              userTurn: {
                id: `pod_user_${Date.now().toString(36)}`,
                speaker: 'You (Listener)',
                role: isVoice ? 'Voice Question' : 'Text Question',
                voiceName: 'Kore',
                pitch: 1.0,
                text: q,
                isUser: true,
                isVoiceInput: Boolean(isVoice),
                timestampSec: null
              },
              responseTurns: parsed.turns
            };
          }
        }
      } catch (err) {
        if (CONFIG.debug) console.warn('[YTAIS] Gemini podcast interaction fallback:', err);
      }

      if (!result) {
        result = buildDeterministicPodcastInteractionResponse({
          videoTitle: this.title,
          summaryText,
          hosts,
          listenerQuery: q,
          isVoice
        });
      }

      const spliced = splicePodcastInteractionTurns(
        this.podcastEpisode.turns,
        insertAfterIdx,
        result.userTurn,
        result.responseTurns
      );
      this.podcastEpisode = Object.assign({}, this.podcastEpisode, {
        turns: spliced.nextTurns,
        updatedAt: Date.now()
      });
      this.podcastActiveTurnIdx = spliced.firstResponseIndex;
      this.podcastInteracting = false;
      writePodcastEpisode(this.videoId, this.podcastEpisode);
      this.renderBody();
      announceLive('Podcast hosts answered your question');
      this.playPodcastFromTurn(spliced.firstResponseIndex);
    }

    buildPodcastStudioView() {
      const wrap = h('div', { className: 'yt-podcast-studio' });
      const resolvedSummary = this.getResolvedSummaryForPodcast();

      // 1. Setup & Host Configuration Card
      const setupCard = h('div', { className: 'yt-podcast-setup-card' });
      const setupTop = h('div', { className: 'yt-podcast-setup-top' });
      const heading = h(
        'div',
        { className: 'yt-podcast-heading' },
        h('div', { className: 'yt-podcast-title' }, 'Audio Overview · Interactive Podcast'),
        h(
          'div',
          { className: 'yt-podcast-subtitle' },
          resolvedSummary
            ? `Grounded in summary (${this.podcastHostCount} AI hosts · Ask via text or voice)`
            : 'Generate a video summary first, or click below to summarize & create your podcast.'
        )
      );

      const hostControls = h('div', { className: 'yt-podcast-host-controls' });
      hostControls.appendChild(h('label', { className: 'yt-podcast-host-label', for: `yt-pod-hosts-${this.videoId}` }, 'Hosts:'));

      const minusBtn = h(
        'button',
        {
          type: 'button',
          className: 'yt-sec-btn yt-podcast-count-btn yt-podcast-count-minus',
          title: 'Decrease number of hosts',
          disabled: this.podcastHostCount <= 2 || this.podcastGenerating,
          onclick: () => this.setPodcastHostCount(this.podcastHostCount - 1)
        },
        '−'
      );

      const countSel = h(
        'select',
        {
          id: `yt-pod-hosts-${this.videoId}`,
          className: 'yt-select yt-podcast-host-count-select',
          'aria-label': 'Number of podcast hosts',
          disabled: this.podcastGenerating,
          onchange: (e) => this.setPodcastHostCount(e.target.value)
        },
        ...[2, 3, 4, 5, 6].map((n) =>
          h('option', { value: String(n), selected: this.podcastHostCount === n }, `${n} Hosts`)
        )
      );

      const plusBtn = h(
        'button',
        {
          type: 'button',
          className: 'yt-sec-btn yt-podcast-count-btn yt-podcast-count-plus',
          title: 'Increase number of hosts',
          disabled: this.podcastHostCount >= (CONFIG.podcastMaxHosts || 6) || this.podcastGenerating,
          onclick: () => this.setPodcastHostCount(this.podcastHostCount + 1)
        },
        '+'
      );

      const genBtn = h(
        'button',
        {
          type: 'button',
          className: 'yt-primary-btn yt-podcast-generate-btn',
          disabled: this.podcastGenerating,
          onclick: () => this.generatePodcastFromSummary()
        },
        this.podcastGenerating
          ? 'Generating Podcast…'
          : !resolvedSummary
          ? 'Summarize & Generate Podcast'
          : this.podcastEpisode
          ? 'Regenerate Podcast'
          : 'Generate Podcast'
      );

      hostControls.appendChild(minusBtn);
      hostControls.appendChild(countSel);
      hostControls.appendChild(plusBtn);
      hostControls.appendChild(genBtn);
      setupTop.appendChild(heading);
      setupTop.appendChild(hostControls);
      setupCard.appendChild(setupTop);

      // Host Roster Grid
      const rosterGrid = h('div', { className: 'yt-podcast-hosts-grid' });
      this.podcastHosts.forEach((host, idx) => {
        const chip = h(
          'div',
          {
            className: 'yt-podcast-host-card',
            'data-host-name': host.name
          },
          h(
            'span',
            {
              className: 'yt-podcast-host-avatar',
              style: `background:${host.color}22;color:${host.color};border-color:${host.color}55;`
            },
            host.name.slice(0, 1).toUpperCase()
          ),
          h(
            'div',
            { className: 'yt-podcast-host-meta' },
            h('input', {
              type: 'text',
              className: 'yt-podcast-host-name-input',
              value: host.name,
              'aria-label': `Host ${idx + 1} name`,
              onchange: (e) => this.updatePodcastHostField(idx, 'name', e.target.value)
            }),
            h('div', { className: 'yt-podcast-host-role' }, host.role)
          ),
          h(
            'select',
            {
              className: 'yt-select yt-podcast-host-voice-select',
              'aria-label': `${host.name} voice`,
              onchange: (e) => this.updatePodcastHostField(idx, 'voiceName', e.target.value)
            },
            ...CONFIG.aiVoices.map((v) =>
              h('option', { value: v.voiceName, selected: host.voiceName === v.voiceName }, v.voiceName)
            )
          )
        );
        rosterGrid.appendChild(chip);
      });
      setupCard.appendChild(rosterGrid);
      wrap.appendChild(setupCard);

      if (this.podcastGenerating) {
        const loadingCard = h(
          'div',
          { className: 'yt-loading-view' },
          h('div', { className: 'yt-big-spinner' }),
          h('div', { className: 'yt-loading-text' }, `Composing ${this.podcastHostCount}-host podcast script…`)
        );
        wrap.appendChild(loadingCard);
        return wrap;
      }

      if (!this.podcastEpisode || !Array.isArray(this.podcastEpisode.turns) || this.podcastEpisode.turns.length === 0) {
        const emptyCard = h(
          'div',
          { className: 'yt-podcast-empty' },
          resolvedSummary
            ? `Choose 2 to 6 hosts above and click "Generate Podcast" to turn this video's summary into an interactive roundtable.`
            : `No summary cached for this video yet. Click "Summarize & Generate Podcast" to summarize the video and start the show.`
        );
        wrap.appendChild(emptyCard);
        return wrap;
      }

      // 2. Player Controls Card
      const ep = this.podcastEpisode;
      const curIdx = Math.max(0, Math.min(ep.turns.length - 1, this.podcastActiveTurnIdx || 0));
      const curTurn = ep.turns[curIdx];
      const playerCard = h('div', { className: 'yt-podcast-player-card' });

      const partSuffix =
        ep.totalParts > 1 && !ep.isComplete
          ? ` · Part ${ep.generatedParts || 1}/${ep.totalParts} (generating next part…)`
          : ep.totalParts > 1
            ? ` · Full summary (${ep.totalParts} parts)`
            : '';

      const playerInfo = h(
        'div',
        { className: 'yt-podcast-player-info' },
        h('div', { className: 'yt-podcast-ep-title' }, ep.title || `Podcast: ${this.title}`),
        h(
          'div',
          { className: 'yt-podcast-now-playing' },
          `Turn ${curIdx + 1} of ${ep.turns.length} · ${curTurn.speaker} (${curTurn.role})${partSuffix}`
        ),
        h(
          'div',
          {
            className: 'yt-podcast-gen-badge',
            style: ep.totalParts > 1 && !ep.isComplete ? 'display:inline-flex;' : 'display:none;'
          },
          ep.totalParts > 1 && !ep.isComplete
            ? `Live: Part ${ep.generatedParts || 1} of ${ep.totalParts} ready`
            : ''
        )
      );

      const controlsRow = h('div', { className: 'yt-podcast-player-controls' });
      const prevBtn = h(
        'button',
        {
          type: 'button',
          className: 'yt-tts-btn yt-podcast-prev-btn',
          title: 'Previous speaker turn',
          onclick: () => this.stepPodcastTurn(-1)
        },
        iconRewind(14),
        h('span', {}, 'Prev')
      );
      const playBtn = h(
        'button',
        {
          type: 'button',
          className: `yt-tts-btn yt-podcast-play-btn ${this.podcastStatus === 'playing' ? 'active' : ''}`,
          onclick: () => this.togglePodcastPlayback()
        },
        this.podcastStatus === 'playing' ? iconPause(14) : iconPlay(14),
        h('span', {}, this.podcastStatus === 'playing' ? 'Pause' : this.podcastStatus === 'paused' ? 'Resume' : 'Play Episode')
      );
      const nextBtn = h(
        'button',
        {
          type: 'button',
          className: 'yt-tts-btn yt-podcast-next-btn',
          title: 'Next speaker turn',
          onclick: () => this.stepPodcastTurn(1)
        },
        iconSkip(14),
        h('span', {}, 'Next')
      );
      const stopBtn = h(
        'button',
        {
          type: 'button',
          className: 'yt-tts-btn yt-podcast-stop-btn',
          title: 'Stop podcast playback',
          onclick: () => this.stopPodcastPlayback()
        },
        iconStop(14)
      );
      const speedSel = h(
        'select',
        {
          className: 'yt-select yt-podcast-speed-select',
          'aria-label': 'Podcast playback speed',
          onchange: (e) => {
            this.podcastRate = parseFloat(e.target.value) || 1.0;
            if (this.podcastAudioEl) this.podcastAudioEl.playbackRate = this.podcastRate;
          }
        },
        ...[0.75, 1.0, 1.25, 1.5, 2.0].map((r) =>
          h('option', { value: String(r), selected: Math.abs((this.podcastRate || 1) - r) < 0.05 }, `${r}x`)
        )
      );

      controlsRow.appendChild(prevBtn);
      controlsRow.appendChild(playBtn);
      controlsRow.appendChild(nextBtn);
      controlsRow.appendChild(stopBtn);
      controlsRow.appendChild(speedSel);
      playerCard.appendChild(playerInfo);
      playerCard.appendChild(controlsRow);
      wrap.appendChild(playerCard);

      // 3. NotebookLM-Style "Join / Ask Hosts" Interactive Bar (Text + Voice)
      const qaBar = h('div', { className: 'yt-podcast-qa-bar' });
      const qaInput = h('input', {
        type: 'text',
        className: 'yt-podcast-qa-input',
        value: this.podcastQaDraft || '',
        placeholder: 'Ask or interrupt the hosts (type or use mic)…',
        disabled: this.podcastInteracting,
        oninput: (e) => {
          this.podcastQaDraft = e.target.value;
        },
        onkeydown: (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.submitPodcastInteraction(qaInput.value, { isVoice: false });
          }
        }
      });
      const micBtn = h(
        'button',
        {
          type: 'button',
          className: `yt-composer-mic-btn yt-podcast-mic-btn ${this._podcastListening ? 'yt-mic-recording' : ''}`,
          title: 'Speak a question to interrupt the hosts',
          'aria-label': 'Voice question to podcast hosts',
          disabled: this.podcastInteracting,
          onclick: () => this.togglePodcastVoiceInput(micBtn, qaInput)
        },
        iconMic(14)
      );
      const askBtn = h(
        'button',
        {
          type: 'button',
          className: 'yt-primary-btn yt-podcast-ask-btn',
          disabled: this.podcastInteracting,
          onclick: () => this.submitPodcastInteraction(qaInput.value, { isVoice: false })
        },
        this.podcastInteracting ? 'Hosts replying…' : 'Ask Hosts'
      );
      qaBar.appendChild(qaInput);
      qaBar.appendChild(micBtn);
      qaBar.appendChild(askBtn);
      wrap.appendChild(qaBar);

      // 4. Dialogue Script & Interactive Q&A Feed
      const dialogueList = h('div', { className: 'yt-podcast-dialogue-list' });
      ep.turns.forEach((turn, idx) => {
        dialogueList.appendChild(this.buildPodcastTurnCard(turn, idx, curIdx));
      });
      wrap.appendChild(dialogueList);

      return wrap;
    }

    onModeOrSourceChanged() {
      if (this.mode === 'podcast') {
        this.podcastSummaryText = this.getResolvedSummaryForPodcast();
        if (!this.podcastEpisode) {
          this.podcastEpisode = readPodcastEpisode(this.videoId);
          if (this.podcastEpisode?.hosts?.length >= 2) {
            this.podcastHostCount = normalizePodcastHostCount(
              this.podcastEpisode.hostCount || this.podcastEpisode.hosts.length,
              2,
              CONFIG.podcastMaxHosts || 6
            );
            this.podcastHosts = buildDefaultPodcastHosts(this.podcastHostCount, this.podcastEpisode.hosts);
          }
        }
        this.status = this.podcastEpisode || this.podcastSummaryText ? 'done' : 'idle';
        this.commit(true);
        this.renderAll();
        return;
      }

      this.stopPodcastPlayback();
      const cached = readCache(this.videoId, this.mode, this.source, false, this.getSummaryPersona());
      if (cached) {
        this.loadFromCache(cached);
      } else {
        this.text = '';
        this.sources = [];
        this.turns = [];
        this.images = {};
        this.fact = null;
        this.status = 'idle';
      }
      this.commit(true);
      this.renderAll();
    }

    loadFromCache(entry) {
      this.text = entry.text || '';
      this.sources = entry.sources || [];
      this.notes = entry.notes || [];
      this.turns = normalizeFollowUpTurnsList(entry.turns || []);
      this.editingTurnIdx = -1;
      this.images = entry.images || {};
      this.fact = entry.fact || null;
      this.factStatus = this.fact ? 'done' : 'idle';
      this.factError = '';
      this.chapters = Array.isArray(entry.chapters) ? entry.chapters : [];
      this.modelId = entry.model || this.modelId;
      this.cacheDate = entry.ts || null;
      this.status = 'done';
      this.busy = false;
      this.unread = false;
    }

    toggleReadability(forceVal = null) {
      this.readabilityMode = forceVal !== null ? Boolean(forceVal) : !this.readabilityMode;
      if (this.readabilityMode && this.syncYouTubeTheme) {
        this.readabilityTheme = detectYouTubeTheme();
        this.setupYouTubeThemeObserver();
      } else if (!this.readabilityMode && this.ytThemeObserver) {
        this.ytThemeObserver.disconnect();
        this.ytThemeObserver = null;
      }
      if (this.windowBox) {
        this.windowBox.classList.toggle('yt-readability-active', this.readabilityMode);
        this.windowBox.classList.remove('yt-theme-system', 'yt-theme-light', 'yt-theme-sepia', 'yt-theme-dark');
        if (this.readabilityMode) {
          this.windowBox.classList.add(`yt-theme-${this.readabilityTheme}`);
        }
        const headerReadBtn = this.windowBox.querySelector('.yt-win-readability-btn');
        if (headerReadBtn) {
          headerReadBtn.classList.toggle('active', this.readabilityMode);
          headerReadBtn.title = this.readabilityMode
            ? 'Exit Readability Mode (Return to standard interactive view)'
            : 'Readability Mode (Clean, centered distraction-free reader)';
        }
      }
      this.renderBody();
    }

    setReadabilityTheme(theme, userInitiated = true) {
      const valid = ['system', 'light', 'sepia', 'dark'];
      this.readabilityTheme = valid.includes(theme) ? theme : 'system';
      if (userInitiated) {
        this.syncYouTubeTheme = false;
      }
      setLastReadabilityTheme(this.readabilityTheme);
      this.commit(true);
      if (this.windowBox) {
        this.windowBox.classList.remove('yt-theme-system', 'yt-theme-light', 'yt-theme-sepia', 'yt-theme-dark');
        this.windowBox.classList.add(`yt-theme-${this.readabilityTheme}`);
      }
      this.renderBody();
    }

    setSyncYouTubeTheme(enable) {
      this.syncYouTubeTheme = Boolean(enable);
      setLastSyncYouTubeTheme(this.syncYouTubeTheme);
      if (this.syncYouTubeTheme) {
        this.readabilityTheme = detectYouTubeTheme();
        setLastReadabilityTheme(this.readabilityTheme);
        this.setupYouTubeThemeObserver();
      }
      this.commit(true);
      if (this.windowBox) {
        this.windowBox.classList.remove('yt-theme-system', 'yt-theme-light', 'yt-theme-sepia', 'yt-theme-dark');
        this.windowBox.classList.add(`yt-theme-${this.readabilityTheme}`);
      }
      this.renderBody();
    }

    setupYouTubeThemeObserver() {
      if (this.ytThemeObserver) return;
      if (typeof MutationObserver === 'undefined') return;

      const handleThemeMutation = () => {
        if (!this.syncYouTubeTheme || !this.readabilityMode) return;
        const detected = detectYouTubeTheme();
        if (this.readabilityTheme !== detected) {
          this.readabilityTheme = detected;
          setLastReadabilityTheme(this.readabilityTheme);
          if (this.windowBox) {
            this.windowBox.classList.remove('yt-theme-system', 'yt-theme-light', 'yt-theme-sepia', 'yt-theme-dark');
            this.windowBox.classList.add(`yt-theme-${this.readabilityTheme}`);
          }
          this.renderBody();
        }
      };

      this.ytThemeObserver = new MutationObserver(() => {
        handleThemeMutation();
      });

      if (document.documentElement) {
        this.ytThemeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['dark', 'theme', 'class', 'style']
        });
      }
      const ytdApp = document.querySelector('ytd-app');
      if (ytdApp) {
        this.ytThemeObserver.observe(ytdApp, {
          attributes: true,
          attributeFilter: ['dark', 'theme']
        });
      }
    }

    buildReadabilityView() {
      const wrap = h('div', {
        className: `yt-readability-container yt-readability-theme-${this.readabilityTheme} theme-${this.readabilityTheme}`
      });
      this.readabilityContainer = wrap;

      // Calculate words and read time
      const words = (this.text || '').trim().split(/\s+/).filter(Boolean).length;
      const readMin = Math.max(1, Math.ceil(words / 220));

      // 1. Reader Controls Bar
      const bar = h('div', { className: 'yt-readability-bar' });

      const exitBtn = h(
        'button',
        {
          className: 'yt-readability-btn yt-readability-exit-btn',
          title: 'Exit Readability Mode',
          onclick: () => this.toggleReadability(false)
        },
        iconClose(14),
        h('span', {}, 'Exit Reader')
      );

      // Theme Selector: System, Light, Sepia, Dark
      const themeGroup = h('div', {
        className: 'yt-readability-theme-group',
        title: `Reading Theme: ${this.readabilityTheme}`
      });

      // Theme Synchronization Toggle with YouTube
      const currentYtTheme = detectYouTubeTheme();
      const syncBtn = h(
        'button',
        {
          className: `yt-readability-btn yt-readability-sync-theme-btn ${this.syncYouTubeTheme ? 'active' : ''}`,
          title: this.syncYouTubeTheme
            ? `YouTube Theme Sync: ON (Detected: ${currentYtTheme.toUpperCase()} mode — auto-matching YouTube)`
            : 'YouTube Theme Sync: OFF (Click to automatically synchronize Reader view with YouTube\'s Dark/Light mode)',
          onclick: () => this.setSyncYouTubeTheme(!this.syncYouTubeTheme)
        },
        iconSync(13),
        h('span', { className: 'yt-sync-label' }, this.syncYouTubeTheme ? `Sync YouTube (${currentYtTheme})` : 'Sync YouTube')
      );

      const themes = [
        { id: 'system', label: 'System', title: 'System default (follows OS dark/light mode)' },
        { id: 'light', label: 'Light', title: 'Comfortable clean light reading mode' },
        { id: 'sepia', label: 'Sepia', title: 'Warm parchment sepia reading mode' },
        { id: 'dark', label: 'Dark', title: 'High-contrast dark mode' }
      ];

      for (const t of themes) {
        const btn = h(
          'button',
          {
            className: `yt-readability-theme-btn ${this.readabilityTheme === t.id ? 'active' : ''}`,
            title: t.title,
            'data-theme': t.id,
            onclick: () => this.setReadabilityTheme(t.id)
          },
          t.label
        );
        themeGroup.appendChild(btn);
      }

      const themeSelect = h(
        'select',
        {
          className: 'yt-select yt-readability-theme-select',
          title: 'Select reading theme',
          onchange: (e) => this.setReadabilityTheme(e.target.value)
        },
        h('option', { value: 'system', selected: this.readabilityTheme === 'system' }, 'System'),
        h('option', { value: 'light', selected: this.readabilityTheme === 'light' }, 'Light'),
        h('option', { value: 'sepia', selected: this.readabilityTheme === 'sepia' }, 'Sepia'),
        h('option', { value: 'dark', selected: this.readabilityTheme === 'dark' }, 'Dark')
      );

      const fontToggleBtn = h(
        'button',
        {
          className: 'yt-readability-btn yt-readability-font-btn',
          title: `Switch font family (currently ${this.readabilityFont})`,
          onclick: () => {
            this.readabilityFont = this.readabilityFont === 'serif' ? 'sans' : 'serif';
            this.renderBody();
          }
        },
        h('span', {}, this.readabilityFont === 'serif' ? 'Serif font' : 'Sans font')
      );

      const sizeGroup = h('div', { className: 'yt-readability-size-group' });
      const decBtn = h(
        'button',
        {
          className: 'yt-readability-size-btn yt-readability-size-dec',
          title: 'Decrease font size',
          onclick: () => {
            this.readabilitySize = Math.max(13, this.readabilitySize - 1);
            this.renderBody();
          }
        },
        'A-'
      );
      const sizeLabel = h('span', { className: 'yt-readability-size-label' }, `${this.readabilitySize}px`);
      const incBtn = h(
        'button',
        {
          className: 'yt-readability-size-btn yt-readability-size-inc',
          title: 'Increase font size',
          onclick: () => {
            this.readabilitySize = Math.min(26, this.readabilitySize + 1);
            this.renderBody();
          }
        },
        'A+'
      );
      sizeGroup.appendChild(decBtn);
      sizeGroup.appendChild(sizeLabel);
      sizeGroup.appendChild(incBtn);

      const statsBadge = h(
        'div',
        { className: 'yt-readability-stats', title: `${words.toLocaleString()} words` },
        `${words.toLocaleString()} words · ~${readMin} min read`
      );

      const exportQuickBtn = h(
        'button',
        {
          className: 'yt-readability-btn yt-readability-export-btn',
          title: 'Export text or PDF',
          onclick: (e) => {
            e.stopPropagation();
            this.openExportMenu(exportQuickBtn);
          }
        },
        iconExport(14),
        h('span', {}, 'Export')
      );

      const exportJsonBtn = h(
        'button',
        {
          className: 'yt-readability-btn yt-readability-export-json-btn',
          title: 'Export transcript summary as JSON (.json) with metadata',
          onclick: (e) => {
            e.stopPropagation();
            this.exportAsJson();
          }
        },
        iconFileText(14),
        h('span', {}, 'JSON')
      );

      const exportMdBtn = h(
        'button',
        {
          className: 'yt-readability-btn yt-readability-export-md-btn',
          title: 'Export self-contained Obsidian/Markdown archive (.md)',
          onclick: (e) => {
            e.stopPropagation();
            this.exportAsMarkdown();
          }
        },
        iconFileText(14),
        h('span', {}, '.md')
      );

      bar.appendChild(exitBtn);
      bar.appendChild(h('div', { className: 'yt-readability-divider' }));
      bar.appendChild(syncBtn);
      bar.appendChild(themeGroup);
      bar.appendChild(themeSelect);
      bar.appendChild(h('div', { className: 'yt-readability-divider' }));
      bar.appendChild(fontToggleBtn);
      bar.appendChild(sizeGroup);
      bar.appendChild(h('div', { className: 'yt-spacer' }));
      bar.appendChild(statsBadge);
      bar.appendChild(exportQuickBtn);
      bar.appendChild(exportMdBtn);
      bar.appendChild(exportJsonBtn);
      wrap.appendChild(bar);

      // 2. Reading Content (Centered typography layout)
      const content = h('div', {
        className: `yt-readability-content font-${this.readabilityFont}`,
        style: {
          fontSize: `${this.readabilitySize}px`,
          fontFamily:
            this.readabilityFont === 'serif'
              ? 'Charter, Georgia, "Times New Roman", Cambria, serif'
              : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }
      });

      // Editorial Title & Meta
      const editorialHeader = h('div', { className: 'yt-readability-header' });
      const docTypeBadge = h(
        'div',
        { className: 'yt-readability-type-badge' },
        this.mode === 'transcript' ? 'YouTube Transcript' : 'Video Summary'
      );
      const editorialTitle = h('h1', { className: 'yt-readability-title' }, this.title);
      const personaInfo = SUMMARY_PERSONA_PRESETS[this.getSummaryPersona()];
      const personaMeta = this.mode === 'summary' && personaInfo ? ` · Persona: ${personaInfo.label}` : '';
      const editorialMeta = h(
        'div',
        { className: 'yt-readability-meta' },
        `Model: ${this.modelId || 'Default'} · Source: ${this.source === 'text' ? 'Transcript' : 'Video'}${personaMeta} · Video ID: ${this.videoId}`
      );
      editorialHeader.appendChild(docTypeBadge);
      editorialHeader.appendChild(editorialTitle);
      editorialHeader.appendChild(editorialMeta);
      content.appendChild(editorialHeader);

      // Clean Editorial Blocks + Visual Cards (when Images & diagrams enabled)
      const renderEditorialTextSegment = (textSegment) => {
        const blocks = parseCleanEditorialBlocks(textSegment);
        let curList = null;

        for (const b of blocks) {
          if (b.type === 'heading') {
            if (curList) { content.appendChild(curList); curList = null; }
            const h2 = h('h2', { className: 'yt-readability-h2' }, b.text);
            content.appendChild(h2);
          } else if (b.type === 'subheading') {
            if (curList) { content.appendChild(curList); curList = null; }
            const h3 = h('h3', { className: 'yt-readability-h3' });
            const tsMatch = /^\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*(.*)$/.exec(b.text);
            if (tsMatch) {
              const tsStr = b.text.slice(0, b.text.indexOf(']') + 1);
              const rest = b.text.slice(tsStr.length).trim();
              const parts = tsStr.slice(1, -1).split(':').map(Number);
              let sec = 0;
              if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
              else sec = parts[0] * 60 + parts[1];

              const link = h(
                'a',
                {
                  className: 'yt-readability-ts',
                  title: `Play video at ${tsStr}`,
                  onclick: (e) => {
                    e.preventDefault();
                    this.seekPlayer(sec);
                  }
                },
                tsStr
              );
              h3.appendChild(link);
              h3.appendChild(document.createTextNode(' ' + rest));
            } else {
              h3.textContent = b.text;
            }
            content.appendChild(h3);
          } else if (b.type === 'bullet') {
            if (!curList || curList.tagName !== 'UL') {
              if (curList) content.appendChild(curList);
              curList = h('ul', { className: 'yt-readability-ul' });
            }
            const li = h('li', { className: 'yt-readability-li' }, b.text);
            curList.appendChild(li);
          } else if (b.type === 'numbered') {
            if (!curList || curList.tagName !== 'OL') {
              if (curList) content.appendChild(curList);
              curList = h('ol', { className: 'yt-readability-ol' });
            }
            const li = h('li', { className: 'yt-readability-li' }, b.text);
            curList.appendChild(li);
          } else if (b.type === 'transcript_line') {
            if (curList) { content.appendChild(curList); curList = null; }
            const lineEl = h('div', { className: 'yt-readability-tx-line' });
            const parts = b.ts.slice(1, -1).split(':').map(Number);
            let sec = 0;
            if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
            else sec = parts[0] * 60 + parts[1];

            const tsLink = h(
              'a',
              {
                className: 'yt-readability-ts',
                title: `Play at ${b.ts}`,
                onclick: (e) => {
                  e.preventDefault();
                  this.seekPlayer(sec);
                }
              },
              b.ts
            );
            lineEl.appendChild(tsLink);
            lineEl.appendChild(document.createTextNode(' ' + b.text));
            content.appendChild(lineEl);
          } else {
            if (curList) { content.appendChild(curList); curList = null; }
            const p = h('p', { className: 'yt-readability-p' }, b.text);
            content.appendChild(p);
          }
        }
        if (curList) content.appendChild(curList);
      };

      const sourceForReader = this.mode === 'summary' && this.opts.img
        ? ensureFallbackVisualMarkers(this.text || '', 3)
        : (this.text || '');
      const readerSegments = this.mode === 'summary' && this.opts.img
        ? tokenizeSummaryTextWithVisuals(sourceForReader)
        : [{ kind: 'markdown', text: sourceForReader }];

      for (const seg of readerSegments) {
        if (seg.kind === 'markdown') {
          renderEditorialTextSegment(seg.text);
        } else if (seg.kind === 'frame') {
          const card = h('div', { className: 'yt-visual-card yt-frame-card yt-readability-visual-card' });
          const previewBox = h('div', {
            className: 'yt-frame-preview',
            title: `Play at ${seg.tsStr}`,
            onclick: () => this.seekPlayer(seg.seconds)
          });
          const fallbackUrl = getVideoThumbnailFallbackUrl(this.videoId, seg.seconds);
          if (fallbackUrl) {
            const img = h('img', {
              src: fallbackUrl,
              alt: seg.caption,
              className: 'yt-frame-fallback-img',
              loading: 'lazy'
            });
            previewBox.appendChild(img);
            fetchStoryboardSpec(this.videoId).then((cfg) => {
              if (!cfg) return;
              const info = getFrameUrlAndOffset(cfg, seg.seconds);
              const probe = new Image();
              probe.onload = () => {
                previewBox.style.backgroundImage = `url("${info.url}")`;
                previewBox.style.backgroundSize = info.bgSize;
                previewBox.style.backgroundPosition = `${info.bgPosX} ${info.bgPosY}`;
                previewBox.style.backgroundRepeat = 'no-repeat';
                img.style.opacity = '0';
              };
              probe.src = info.url;
            });
          }
          previewBox.appendChild(h('div', { className: 'yt-frame-badge' }, `▶ ${seg.tsStr}`));
          card.appendChild(previewBox);
          card.appendChild(h('div', { className: 'yt-visual-caption' }, seg.caption));
          content.appendChild(card);
        } else if (seg.kind === 'img') {
          const card = h('div', { className: 'yt-visual-card yt-commons-card yt-readability-visual-card' });
          const wrap = h('div', { className: 'yt-commons-fallback' });
          wrap.appendChild(buildCommonsSchematicSvg(seg.caption));
          card.appendChild(wrap);
          card.appendChild(h('div', { className: 'yt-visual-caption' }, seg.caption));
          content.appendChild(card);
          searchCommons(seg.terms).then((res) => {
            if (!res?.thumbUrl) return;
            clearEl(wrap);
            wrap.className = 'yt-commons-img-wrap';
            wrap.appendChild(h('img', { src: res.thumbUrl, alt: seg.caption, className: 'yt-commons-img', loading: 'lazy' }));
          });
        } else if (seg.kind === 'image' && this.images && this.images['i' + seg.index]) {
          const imgData = this.images['i' + seg.index];
          const card = h('div', { className: 'yt-visual-card yt-ai-image-card yt-readability-visual-card' });
          card.appendChild(h('img', { src: imgData.url, alt: seg.caption, className: 'yt-ai-img' }));
          card.appendChild(h('div', { className: 'yt-visual-caption' }, seg.caption));
          content.appendChild(card);
        }
      }

      if (this.fact && this.fact.text) {
        const factSec = h('div', { className: 'yt-readability-fact-box' });
        factSec.appendChild(h('h2', { className: 'yt-readability-h2' }, 'Fact-Check & Verification'));
        factSec.appendChild(renderMarkdownToDom(this.fact.text, this, (sec) => this.seekPlayer(sec)));
        if (this.fact.sources && this.fact.sources.length > 0) {
          const srcList = h('div', { className: 'yt-sources-consulted' });
          srcList.appendChild(h('div', { className: 'yt-sources-title' }, 'Sources consulted:'));
          for (const s of this.fact.sources) {
            srcList.appendChild(
              h(
                'div',
                { className: 'yt-source-item' },
                h('a', { href: s.uri, target: '_blank', rel: 'noopener noreferrer', className: 'yt-ext-link' }, s.title || s.uri)
              )
            );
          }
          factSec.appendChild(srcList);
        }
        content.appendChild(factSec);
      }

      if (this.turns && this.turns.length) {
        const qaSec = h('div', { className: 'yt-readability-qa-section' });
        qaSec.appendChild(h('h2', { className: 'yt-readability-h2' }, 'Follow-Up Questions'));
        for (const t of this.turns) {
          const item = h('div', { className: 'yt-readability-qa-item' });
          item.appendChild(h('p', { className: 'yt-readability-q' }, `Q: ${stripInlineMarkdown(t.q)}`));
          item.appendChild(h('p', { className: 'yt-readability-a' }, `A: ${stripInlineMarkdown(t.a)}`));
          qaSec.appendChild(item);
        }
        content.appendChild(qaSec);
      }

      content.appendChild(
        this.buildResponseRatingBar({
          targetType: this.mode === 'transcript' ? 'transcript' : 'summary',
          targetId: 'main',
          label: this.mode === 'transcript' ? 'Was this transcript accurate?' : 'Rate this summary'
        })
      );

      wrap.appendChild(content);
      return wrap;
    }

    openExportMenu(anchorEl) {
      if (this.exportMenuEl) {
        this.exportMenuEl.remove();
        this.exportMenuEl = null;
        return;
      }
      anchorEl = anchorEl || this.windowBox?.querySelector('.yt-win-export-btn') || this.windowBox || document.body;

      const popover = h('div', {
        className: 'yt-export-popover',
        onclick: (e) => e.stopPropagation()
      });

      const header = h('div', { className: 'yt-export-header' }, 'Export Content');
      popover.appendChild(header);

      const itemTxt = h(
        'button',
        {
          className: 'yt-export-item yt-export-txt-btn',
          title: 'Download formatted plain text file (.txt)',
          onclick: () => {
            popover.remove();
            this.exportMenuEl = null;
            this.exportAsTxt();
          }
        },
        iconFileText(16),
        h(
          'div',
          { className: 'yt-export-item-text' },
          h('div', { className: 'yt-export-item-title' }, 'Export as Formatted Text (.txt)'),
          h('div', { className: 'yt-export-item-sub' }, 'Plain text with full metadata header and timestamps')
        )
      );

      const itemPdf = h(
        'button',
        {
          className: 'yt-export-item yt-export-pdf-btn',
          title: 'Export formatted document as PDF (.pdf)',
          onclick: () => {
            popover.remove();
            this.exportMenuEl = null;
            this.exportAsPdf();
          }
        },
        iconPdf(16),
        h(
          'div',
          { className: 'yt-export-item-text' },
          h('div', { className: 'yt-export-item-title' }, 'Export as PDF Document (.pdf)'),
          h('div', { className: 'yt-export-item-sub' }, 'Clean editorial layout ready for Save to PDF')
        )
      );

      const itemCopy = h(
        'button',
        {
          className: 'yt-export-item yt-export-copy-btn',
          title: 'Copy clean text to clipboard',
          onclick: () => {
            const cleanText = formatAsExportText(this);
            copyTextSafely(cleanText);
            popover.remove();
            this.exportMenuEl = null;
          }
        },
        iconCopy(16),
        h(
          'div',
          { className: 'yt-export-item-text' },
          h('div', { className: 'yt-export-item-title' }, 'Copy Clean Text to Clipboard'),
          h('div', { className: 'yt-export-item-sub' }, 'Formatted text with metadata')
        )
      );

      const itemJson = h(
        'button',
        {
          className: 'yt-export-item yt-export-json-btn',
          title: 'Export transcript summary data as JSON (.json) with metadata',
          onclick: () => {
            popover.remove();
            this.exportMenuEl = null;
            this.exportAsJson();
          }
        },
        iconFileText(16),
        h(
          'div',
          { className: 'yt-export-item-text' },
          h('div', { className: 'yt-export-item-title' }, 'Export as JSON (.json)'),
          h('div', { className: 'yt-export-item-sub' }, 'Structured transcript summary with title, channel, and processing mode metadata')
        )
      );

      const itemMd = h(
        'button',
        {
          className: 'yt-export-item yt-export-md-btn',
          title: 'Export self-contained Obsidian / Markdown archive (.md)',
          onclick: () => {
            popover.remove();
            this.exportMenuEl = null;
            this.exportAsMarkdown();
          }
        },
        iconFileText(16),
        h(
          'div',
          { className: 'yt-export-item-text' },
          h('div', { className: 'yt-export-item-title' }, 'Export as Markdown / Obsidian (.md)'),
          h('div', { className: 'yt-export-item-sub' }, 'YAML frontmatter, Unicode math, timestamps, Q&A & ratings')
        )
      );

      popover.appendChild(itemTxt);
      popover.appendChild(itemMd);
      popover.appendChild(itemPdf);
      popover.appendChild(itemJson);
      popover.appendChild(itemCopy);

      const rect = anchorEl.getBoundingClientRect();
      const parentRect = (this.windowBox || document.body).getBoundingClientRect();
      popover.style.top = `${rect.bottom - parentRect.top + 6}px`;
      popover.style.right = `${parentRect.right - rect.right}px`;

      const closeHandler = (e) => {
        if (!popover.contains(e.target) && e.target !== anchorEl) {
          popover.remove();
          this.exportMenuEl = null;
          document.removeEventListener('click', closeHandler, true);
        }
      };
      setTimeout(() => {
        document.addEventListener('click', closeHandler, true);
      }, 50);

      (this.windowBox || modalsContainer).appendChild(popover);
      this.exportMenuEl = popover;
    }

    exportAsTxt() {
      downloadAsTxt(this);
    }

    exportAsMarkdown() {
      downloadAsMarkdown(this);
    }

    exportAsPdf() {
      exportAsPdf(this);
    }

    exportAsJson() {
      downloadAsJson(this);
    }

    renderAll() {
      this.renderDockTab();
      if (maximizedWindow === this) {
        this.showModal();
      }
    }
  }

  // --- SETTINGS & CONTROL CENTER DIALOG (Movable, 8-Dir Resizable & Theme-Synced) ---
  function openSettingsDialog(onClose = null) {
    ensureHostAndShadow();
    const existing = modalsContainer?.querySelector('.yt-key-dialog-scrim');
    if (existing) {
      if (typeof existing._ytaisCleanup === 'function') existing._ytaisCleanup();
      existing.remove();
    }

    const vp = { width: window.innerWidth || 1280, height: window.innerHeight || 800 };
    const savedBounds = getLastSettingsBounds();
    const defaultW = Math.min(720, Math.max(360, vp.width - 32));
    const defaultH = Math.min(680, Math.max(360, vp.height - 88));
    const initBounds = clampWindowBounds(
      savedBounds || {
        left: Math.max(12, Math.round((vp.width - defaultW) / 2)),
        top: Math.max(16, Math.round((vp.height - defaultH) / 2) - 8),
        width: defaultW,
        height: defaultH
      },
      vp,
      360,
      340
    );

    const scrim = h('div', {
      className: 'yt-modal-scrim yt-floating-scrim yt-key-dialog-scrim yt-settings-dialog-scrim',
      style: `z-index: ${2147483000 + Math.min(64, ++topWindowZIndex)};`,
      onclick: (e) => {
        if (e.target === scrim) closeDialog();
      }
    });

    let cleanupInteractions = null;
    function closeDialog() {
      if (cleanupInteractions) cleanupInteractions();
      scrim.remove();
      if (onClose) onClose();
    }
    scrim._ytaisClose = closeDialog;

    const box = h('div', {
      className: 'yt-key-dialog-box yt-floating-window yt-settings-dialog-box',
      style: `left:${initBounds.left}px;top:${initBounds.top}px;width:${initBounds.width}px;height:${initBounds.height}px;`,
      onwheel: (e) => e.stopPropagation()
    });

    const header = h('div', {
      className: 'yt-win-header yt-dialog-header',
      title: 'Drag header or press Arrow keys on grip to move Settings'
    });
    const dragGrip = h(
      'button',
      {
        type: 'button',
        className: 'yt-win-drag-grip',
        tabindex: '0',
        'aria-label': 'Move Settings window with arrow keys',
        title: 'Drag or press Arrow keys to move Settings window'
      },
      iconDragGrip(16)
    );
    const titleCol = h('div', { className: 'yt-win-title-col' });
    titleCol.appendChild(h('h3', { className: 'yt-win-title', style: 'margin:0;font-size:15px;' }, 'Settings & Control Center'));
    titleCol.appendChild(
      h('div', { className: 'yt-win-status-line' }, 'Appearance, summaries, video titles, podcast, transcript/TTS & history dock')
    );

    const headerBtns = h('div', { className: 'yt-win-header-btns' });
    const resetAllBtn = h(
      'button',
      {
        type: 'button',
        className: 'yt-sec-btn yt-reset-all-settings-btn',
        title: 'Reset all Settings to factory defaults',
        onclick: () => {
          resetAllSettings();
          showGlobalToast('All settings reset to defaults');
          announceLive('All settings reset to defaults');
          closeDialog();
          openSettingsDialog(onClose);
        }
      },
      'Reset All'
    );
    const closeBtn = h(
      'button',
      {
        type: 'button',
        className: 'yt-win-btn yt-win-close-btn',
        title: 'Close settings',
        'aria-label': 'Close settings',
        onclick: closeDialog
      },
      iconClose(20)
    );
    headerBtns.appendChild(resetAllBtn);
    headerBtns.appendChild(closeBtn);
    header.appendChild(dragGrip);
    header.appendChild(titleCol);
    header.appendChild(headerBtns);
    box.appendChild(header);

    // Category Filter Tabs (default 'all' so every control is mounted & immediately interactive)
    const CATEGORIES = [
      { id: 'all', label: 'All Settings' },
      { id: 'appearance', label: 'Appearance' },
      { id: 'summaries', label: 'Summaries' },
      { id: 'titles', label: 'Video Titles' },
      { id: 'podcast', label: 'Podcast' },
      { id: 'transcript_tts', label: 'Transcript & TTS' },
      { id: 'history', label: 'History & Dock' },
      { id: 'keys', label: 'Keys & Models' }
    ];
    let activeCat = 'all';
    const sectionEls = [];

    const tabsBar = h('div', {
      className: 'yt-settings-tabs',
      role: 'tablist',
      'aria-label': 'Settings categories'
    });
    function applyCategoryFilter(catId) {
      activeCat = catId;
      for (const btn of tabsBar.querySelectorAll('.yt-settings-tab')) {
        const isAct = btn.getAttribute('data-settings-tab') === catId;
        btn.classList.toggle('active', isAct);
        btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
      }
      for (const sec of sectionEls) {
        const secCat = sec.getAttribute('data-settings-cat');
        sec.style.display = catId === 'all' || secCat === catId ? 'flex' : 'none';
      }
    }
    for (const c of CATEGORIES) {
      tabsBar.appendChild(
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            className: `yt-settings-tab ${c.id === 'all' ? 'active' : ''}`,
            'data-settings-tab': c.id,
            'aria-selected': c.id === 'all' ? 'true' : 'false',
            onclick: () => applyCategoryFilter(c.id)
          },
          c.label
        )
      );
    }
    box.appendChild(tabsBar);

    const scrollBody = h('div', { className: 'yt-settings-scroll-body' });

    const makeSection = (cat, title) => {
      const sec = h('div', { className: 'yt-settings-section yt-settings-section-card', 'data-settings-cat': cat });
      sec.appendChild(h('div', { className: 'yt-settings-group-title' }, title));
      sectionEls.push(sec);
      return sec;
    };

    const makeToggleRow = (label, checked, cls, ariaLabel, onChange) => {
      const row = h('label', { className: 'yt-key-row', style: 'cursor:pointer;' });
      row.appendChild(h('span', { className: 'yt-setting-label' }, label));
      const cb = h('input', {
        type: 'checkbox',
        className: cls,
        checked: Boolean(checked),
        'aria-label': ariaLabel || label,
        onchange: (e) => onChange(Boolean(e.target.checked))
      });
      row.appendChild(cb);
      return { row, cb };
    };

    // --- SECTION 1: APPEARANCE & FORMATTING ---
    const appSec = makeSection('appearance', 'Interface Theme, Formatting & Reader View');

    const themeRow = h('div', { className: 'yt-key-row yt-app-theme-row' });
    themeRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Material You UI Theme'));
    const currentThemeMode = getAppThemeMode();
    const themeGroup = h('div', {
      className: 'yt-app-theme-group',
      role: 'group',
      'aria-label': 'UI Appearance Theme'
    });
    for (const opt of [
      { id: 'system', label: 'System' },
      { id: 'light', label: 'Light' },
      { id: 'dark', label: 'Dark' }
    ]) {
      const isSelected = currentThemeMode === opt.id;
      themeGroup.appendChild(
        h(
          'button',
          {
            type: 'button',
            className: `yt-app-theme-btn ${isSelected ? 'active' : ''}`,
            'data-app-theme': opt.id,
            'aria-pressed': isSelected ? 'true' : 'false',
            onclick: () => setAppThemeMode(opt.id)
          },
          opt.label
        )
      );
    }
    themeRow.appendChild(themeGroup);
    appSec.appendChild(themeRow);

    const uiPrefs = getUiFormattingPrefs();
    const uiFontRow = h('div', { className: 'yt-key-row' });
    uiFontRow.appendChild(h('span', { className: 'yt-setting-label' }, 'UI Font Family'));
    const uiFontSel = h(
      'select',
      {
        className: 'yt-select yt-ui-font-select',
        'aria-label': 'UI Font Family',
        onchange: (e) => setUiFormattingPrefs({ fontFamily: e.target.value })
      },
      h('option', { value: 'system' }, 'System Sans'),
      h('option', { value: 'dm-sans' }, 'DM Sans'),
      h('option', { value: 'serif' }, 'Editorial Serif'),
      h('option', { value: 'mono' }, 'Monospace')
    );
    uiFontSel.value = uiPrefs.fontFamily;
    uiFontRow.appendChild(uiFontSel);
    appSec.appendChild(uiFontRow);

    const uiSizeRow = h('div', { className: 'yt-key-row' });
    const uiSizeVal = h('span', { className: 'yt-setting-val' }, `${uiPrefs.fontSizePx}px`);
    uiSizeRow.appendChild(h('span', { className: 'yt-setting-label' }, 'UI Font Size'));
    const uiSizeRange = h('input', {
      type: 'range',
      min: '11',
      max: '18',
      step: '1',
      value: String(uiPrefs.fontSizePx),
      className: 'yt-setting-range yt-ui-fontsize-range',
      'aria-label': 'UI Font Size',
      oninput: (e) => {
        const next = setUiFormattingPrefs({ fontSizePx: Number(e.target.value) });
        uiSizeVal.textContent = `${next.fontSizePx}px`;
      }
    });
    uiSizeRow.appendChild(uiSizeRange);
    uiSizeRow.appendChild(uiSizeVal);
    appSec.appendChild(uiSizeRow);

    const uiDensityRow = h('div', { className: 'yt-key-row' });
    uiDensityRow.appendChild(h('span', { className: 'yt-setting-label' }, 'UI Density'));
    const uiDensitySel = h(
      'select',
      {
        className: 'yt-select yt-ui-density-select',
        'aria-label': 'UI Density',
        onchange: (e) => setUiFormattingPrefs({ density: e.target.value })
      },
      h('option', { value: 'compact' }, 'Compact'),
      h('option', { value: 'comfortable' }, 'Comfortable'),
      h('option', { value: 'relaxed' }, 'Relaxed')
    );
    uiDensitySel.value = uiPrefs.density;
    uiDensityRow.appendChild(uiDensitySel);
    appSec.appendChild(uiDensityRow);

    const genPrefs = getGeneratedTextPrefs();
    const genFontRow = h('div', { className: 'yt-key-row' });
    genFontRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Summary & Transcript Font'));
    const genFontSel = h(
      'select',
      {
        className: 'yt-select yt-gen-font-select',
        'aria-label': 'Generated Text Font Family',
        onchange: (e) => setGeneratedTextPrefs({ fontFamily: e.target.value })
      },
      h('option', { value: 'sans' }, 'Clean Sans'),
      h('option', { value: 'serif' }, 'Reading Serif'),
      h('option', { value: 'mono' }, 'Code Monospace')
    );
    genFontSel.value = genPrefs.fontFamily;
    genFontRow.appendChild(genFontSel);
    appSec.appendChild(genFontRow);

    const genSizeRow = h('div', { className: 'yt-key-row' });
    const genSizeVal = h('span', { className: 'yt-setting-val' }, `${genPrefs.fontSizePx}px`);
    genSizeRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Generated Font Size'));
    const genSizeRange = h('input', {
      type: 'range',
      min: '12',
      max: '22',
      step: '1',
      value: String(genPrefs.fontSizePx),
      className: 'yt-setting-range yt-gen-fontsize-range',
      'aria-label': 'Generated Font Size',
      oninput: (e) => {
        const next = setGeneratedTextPrefs({ fontSizePx: Number(e.target.value) });
        genSizeVal.textContent = `${next.fontSizePx}px`;
      }
    });
    genSizeRow.appendChild(genSizeRange);
    genSizeRow.appendChild(genSizeVal);
    appSec.appendChild(genSizeRow);

    const genLhRow = h('div', { className: 'yt-key-row' });
    const genLhVal = h('span', { className: 'yt-setting-val' }, `${genPrefs.lineHeight.toFixed(1)}`);
    genLhRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Generated Line Height'));
    const genLhRange = h('input', {
      type: 'range',
      min: '1.3',
      max: '2.0',
      step: '0.1',
      value: String(genPrefs.lineHeight),
      className: 'yt-setting-range yt-gen-lineheight-range',
      'aria-label': 'Generated Text Line Height',
      oninput: (e) => {
        const next = setGeneratedTextPrefs({ lineHeight: Number(e.target.value) });
        genLhVal.textContent = `${next.lineHeight.toFixed(1)}`;
      }
    });
    genLhRow.appendChild(genLhRange);
    genLhRow.appendChild(genLhVal);
    appSec.appendChild(genLhRow);

    const genParaRow = h('div', { className: 'yt-key-row' });
    genParaRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Paragraph Spacing'));
    const genParaSel = h(
      'select',
      {
        className: 'yt-select yt-gen-para-select',
        'aria-label': 'Paragraph Spacing',
        onchange: (e) => setGeneratedTextPrefs({ paragraphSpacing: e.target.value })
      },
      h('option', { value: 'compact' }, 'Compact'),
      h('option', { value: 'normal' }, 'Normal'),
      h('option', { value: 'relaxed' }, 'Relaxed')
    );
    genParaSel.value = genPrefs.paragraphSpacing;
    genParaRow.appendChild(genParaSel);
    appSec.appendChild(genParaRow);

    const richToggle = makeToggleRow(
      'Rich Markdown Formatting (Headings, Bold, Lists)',
      genPrefs.richFormatting,
      'yt-gen-rich-checkbox',
      'Rich Markdown Formatting',
      (checked) => setGeneratedTextPrefs({ richFormatting: checked })
    );
    appSec.appendChild(richToggle.row);

    const readerThemeRow = h('div', { className: 'yt-key-row' });
    readerThemeRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Default Reader View Theme'));
    const readerThemeSel = h(
      'select',
      {
        className: 'yt-select yt-reader-theme-select',
        'aria-label': 'Default Reader View Theme',
        onchange: (e) => setLastReadabilityTheme(e.target.value)
      },
      h('option', { value: 'system' }, 'System / Match UI'),
      h('option', { value: 'light' }, 'Light'),
      h('option', { value: 'sepia' }, 'Sepia'),
      h('option', { value: 'dark' }, 'Dark')
    );
    readerThemeSel.value = getLastReadabilityTheme();
    readerThemeRow.appendChild(readerThemeSel);
    appSec.appendChild(readerThemeRow);

    const syncYtThemeToggle = makeToggleRow(
      'Sync Reader View Theme with YouTube Dark/Light Mode',
      getLastSyncYouTubeTheme(),
      'yt-sync-yt-theme-checkbox',
      'Sync Reader View Theme with YouTube Theme',
      (checked) => setLastSyncYouTubeTheme(checked)
    );
    appSec.appendChild(syncYtThemeToggle.row);

    // Accent Color Picker: Color Wheel + 12 Pastel Presets + Hex Input + Reset
    const accentCard = h('div', { className: 'yt-accent-picker-card' });
    const accentHeader = h('div', { className: 'yt-accent-picker-header' });
    accentHeader.appendChild(h('span', { className: 'yt-setting-label' }, 'UI Accent Color (Wheel & Pastel Palette)'));
    const resetAccentBtn = h(
      'button',
      {
        type: 'button',
        className: 'yt-sec-btn yt-accent-reset-btn',
        title: 'Restore default Material Blue accent',
        onclick: () => {
          setUiAccentColor('');
          showGlobalToast('Restored default UI accent');
        }
      },
      'Reset Accent'
    );
    accentHeader.appendChild(resetAccentBtn);
    accentCard.appendChild(accentHeader);

    const accentPickerBody = h('div', { className: 'yt-accent-picker-body' });
    const curAccent = getUiAccentColor();
    const wheelPt = hexToColorWheelPoint(curAccent || '#93C5FD');
    const wheelThumb = h('div', {
      className: 'yt-accent-wheel-thumb',
      style: `left:${((0.5 + wheelPt.nx * 0.5) * 100).toFixed(2)}%;top:${((0.5 + wheelPt.ny * 0.5) * 100).toFixed(2)}%;background:${curAccent || '#93C5FD'};`
    });
    const wheelEl = h(
      'div',
      {
        className: 'yt-accent-color-wheel',
        role: 'slider',
        tabindex: '0',
        'aria-label': 'UI Accent Color Wheel',
        title: 'Click or drag anywhere on the wheel to choose an accent color'
      },
      wheelThumb
    );
    const pickWheelAtClientPos = (clientX, clientY) => {
      const rect = wheelEl.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const r = Math.min(rect.width, rect.height) / 2;
      let nx = (clientX - cx) / r;
      let ny = (clientY - cy) / r;
      const dist = Math.hypot(nx, ny);
      if (dist > 1) {
        nx /= dist;
        ny /= dist;
      }
      const hex = colorWheelPointToHex(nx, ny, 76);
      setUiAccentColor(hex);
    };
    const onWheelMouseDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      pickWheelAtClientPos(e.clientX, e.clientY);
      const onMove = (ev) => pickWheelAtClientPos(ev.clientX, ev.clientY);
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    wheelEl.addEventListener('mousedown', onWheelMouseDown);
    wheelEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const curHex = getUiAccentColor() || '#93C5FD';
        const rgb = hexToRgb(curHex) || { r: 147, g: 197, b: 253 };
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        const nextH = (hsl.h + (e.key === 'ArrowRight' ? 15 : e.key === 'ArrowLeft' ? -15 : 0) + 360) % 360;
        const nextS = Math.max(10, Math.min(100, hsl.s + (e.key === 'ArrowUp' ? 10 : e.key === 'ArrowDown' ? -10 : 0)));
        setUiAccentColor(hslToHex(nextH, nextS, 76));
      }
    });

    const accentRightCol = h('div', { className: 'yt-accent-right-col' });
    const swatchesGrid = h('div', { className: 'yt-accent-swatches-grid', role: 'group', 'aria-label': '12 Pastel Accent Presets' });
    for (const preset of PASTEL_ACCENT_PRESETS) {
      const isAct = curAccent === preset.hex;
      swatchesGrid.appendChild(
        h('button', {
          type: 'button',
          className: `yt-accent-swatch ${isAct ? 'active' : ''}`,
          'data-accent-hex': preset.hex,
          'data-accent-id': preset.id,
          'aria-label': `Pastel accent ${preset.name} (${preset.hex})`,
          'aria-pressed': isAct ? 'true' : 'false',
          title: `${preset.name} (${preset.hex})`,
          style: `background-color:${preset.hex};`,
          onclick: () => setUiAccentColor(preset.hex)
        })
      );
    }
    accentRightCol.appendChild(swatchesGrid);

    const accentInputsRow = h('div', { className: 'yt-accent-inputs-row' });
    const colorNativeInput = h('input', {
      type: 'color',
      className: 'yt-accent-color-input',
      value: curAccent || '#93C5FD',
      'aria-label': 'Pick custom UI accent color',
      oninput: (e) => setUiAccentColor(e.target.value)
    });
    const hexTextInput = h('input', {
      type: 'text',
      className: 'yt-input yt-accent-hex-input',
      value: curAccent || 'Default (#a3c9ff)',
      placeholder: '#93C5FD',
      'aria-label': 'UI Accent Hex Code',
      onchange: (e) => {
        const val = e.target.value.trim();
        if (!val || val.toLowerCase().startsWith('default')) {
          setUiAccentColor('');
          return;
        }
        const norm = normalizeAccentColorHex(val);
        if (norm) setUiAccentColor(norm);
        else syncSettingsAccentDom(getUiAccentColor());
      }
    });
    accentInputsRow.appendChild(colorNativeInput);
    accentInputsRow.appendChild(hexTextInput);
    accentRightCol.appendChild(accentInputsRow);

    accentPickerBody.appendChild(wheelEl);
    accentPickerBody.appendChild(accentRightCol);
    accentCard.appendChild(accentPickerBody);
    appSec.appendChild(accentCard);

    const resetRow = h('div', { style: 'display:flex;justify-content:flex-end;margin-top:4px;' });
    resetRow.appendChild(
      h(
        'button',
        {
          type: 'button',
          className: 'yt-sec-btn yt-reset-formatting-btn',
          onclick: () => {
            resetFormattingPrefs();
            uiFontSel.value = DEFAULT_UI_FORMATTING_PREFS.fontFamily;
            uiSizeRange.value = String(DEFAULT_UI_FORMATTING_PREFS.fontSizePx);
            uiSizeVal.textContent = `${DEFAULT_UI_FORMATTING_PREFS.fontSizePx}px`;
            uiDensitySel.value = DEFAULT_UI_FORMATTING_PREFS.density;
            genFontSel.value = DEFAULT_GENERATED_TEXT_PREFS.fontFamily;
            genSizeRange.value = String(DEFAULT_GENERATED_TEXT_PREFS.fontSizePx);
            genSizeVal.textContent = `${DEFAULT_GENERATED_TEXT_PREFS.fontSizePx}px`;
            genLhRange.value = String(DEFAULT_GENERATED_TEXT_PREFS.lineHeight);
            genLhVal.textContent = `${DEFAULT_GENERATED_TEXT_PREFS.lineHeight.toFixed(1)}`;
            genParaSel.value = DEFAULT_GENERATED_TEXT_PREFS.paragraphSpacing;
            richToggle.cb.checked = DEFAULT_GENERATED_TEXT_PREFS.richFormatting;
            showGlobalToast('Formatting defaults restored');
          }
        },
        'Reset Formatting Defaults'
      )
    );
    appSec.appendChild(resetRow);

    // --- SECTION 2: VIDEO SUMMARIES ---
    const sumSec = makeSection('summaries', 'Video Summaries');
    let globalOpts = getGlobalOpts();
    const updateGlobalOpt = (patch) => {
      globalOpts = Object.assign({}, getGlobalOpts(), patch);
      saveGlobalOpts(globalOpts);
      for (const win of getOpenWindows()) {
        Object.assign(win.opts, patch);
        win.commit(true);
      }
    };

    const sumModelRow = h('div', { className: 'yt-key-row' });
    sumModelRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Default Summary Model'));
    const sumModelSel = h('select', {
      className: 'yt-select yt-default-model-select',
      'aria-label': 'Default Summary Model',
      onchange: (e) => setLastModel(e.target.value)
    });
    function populateSummaryModelSel() {
      clearEl(sumModelSel);
      const seen = new Set();
      for (const m of [...CONFIG.textModels, 'YouTube Ask (Gemini in the page)', ...getCustomModels()]) {
        if (!seen.has(m)) {
          seen.add(m);
          sumModelSel.appendChild(h('option', { value: m }, m));
        }
      }
      const curM = getLastModel();
      if (!seen.has(curM)) sumModelSel.appendChild(h('option', { value: curM }, curM));
      sumModelSel.value = curM;
    }
    populateSummaryModelSel();
    sumModelRow.appendChild(sumModelSel);
    sumSec.appendChild(sumModelRow);

    const sumSourceRow = h('div', { className: 'yt-key-row' });
    sumSourceRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Default Summary Input Source'));
    const sumSourceSel = h(
      'select',
      {
        className: 'yt-select yt-default-source-select',
        'aria-label': 'Default Summary Source',
        onchange: (e) => setLastSource(e.target.value)
      },
      h('option', { value: 'video' }, 'Video Stream (Multimodal Audio + Visuals)'),
      h('option', { value: 'text' }, 'Transcript / Captions Text')
    );
    sumSourceSel.value = getLastSource();
    sumSourceRow.appendChild(sumSourceSel);
    sumSec.appendChild(sumSourceRow);

    const sumModeRow = h('div', { className: 'yt-key-row' });
    sumModeRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Default Processing Mode'));
    const sumModeSel = h(
      'select',
      {
        className: 'yt-select yt-default-processing-mode-select',
        'aria-label': 'Default Summary Processing Mode',
        onchange: (e) => updateGlobalOpt({ transcriptMode: e.target.value === 'deep' ? 'deep' : 'fast' })
      },
      h('option', { value: 'fast' }, 'Fast (Concise Executive Brief)'),
      h('option', { value: 'deep' }, 'Deep (Exhaustive Analysis + Timestamps)')
    );
    sumModeSel.value = globalOpts.transcriptMode === 'deep' ? 'deep' : 'fast';
    sumModeRow.appendChild(sumModeSel);
    sumSec.appendChild(sumModeRow);

    const sumPersonaRow = h('div', { className: 'yt-key-row' });
    sumPersonaRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Default Summary Persona'));
    const sumPersonaSel = h(
      'select',
      {
        className: 'yt-select yt-settings-persona-select',
        'aria-label': 'Default Summary Persona',
        onchange: (e) => setDefaultSummaryPersona(e.target.value)
      },
      ...Object.values(SUMMARY_PERSONA_PRESETS).map((p) =>
        h('option', { value: p.id }, p.label)
      )
    );
    sumPersonaSel.value = getDefaultSummaryPersona();
    sumPersonaRow.appendChild(sumPersonaSel);
    sumSec.appendChild(sumPersonaRow);

    const langRow = h('div', { className: 'yt-key-row' });
    langRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Summary Output Language'));
    const langInput = h('input', {
      type: 'text',
      className: 'yt-input yt-output-language-input',
      style: 'max-width:170px;',
      value: getOutputLanguage(),
      placeholder: 'English',
      'aria-label': 'Summary Output Language',
      onchange: (e) => {
        e.target.value = setOutputLanguage(e.target.value);
      }
    });
    langRow.appendChild(langInput);
    sumSec.appendChild(langRow);

    sumSec.appendChild(
      makeToggleRow(
        'Auto-start summarizing immediately when Summarize is clicked',
        getAutoStart(),
        'yt-autostart-checkbox',
        'Auto-start Summary on Click',
        (checked) => setAutoStart(checked)
      ).row
    );
    sumSec.appendChild(
      makeToggleRow(
        'Include Fact-Check verification pass by default',
        globalOpts.fc,
        'yt-opt-fc-checkbox',
        'Fact Check Default',
        (checked) => updateGlobalOpt({ fc: checked })
      ).row
    );
    sumSec.appendChild(
      makeToggleRow(
        'Automatically run Fact-Check after summary is generated',
        normalizeAutoFactCheckSetting(globalOpts.autoFactCheck),
        'yt-opt-autofc-checkbox',
        'Auto-Run Fact-Check After Summary',
        (checked) => updateGlobalOpt({ autoFactCheck: checked })
      ).row
    );
    sumSec.appendChild(
      makeToggleRow(
        'Include clickable Source citations & references by default',
        globalOpts.src,
        'yt-opt-src-checkbox',
        'Sources Default',
        (checked) => updateGlobalOpt({ src: checked })
      ).row
    );
    sumSec.appendChild(
      makeToggleRow(
        'Include Visual Diagrams / Video Frame markers',
        globalOpts.img,
        'yt-opt-img-checkbox',
        'Visuals Default',
        (checked) => updateGlobalOpt({ img: checked })
      ).row
    );
    sumSec.appendChild(
      makeToggleRow(
        'Generate AI explanatory illustrations (Nano Banana)',
        globalOpts.gen,
        'yt-opt-gen-checkbox',
        'AI Illustrations Default',
        (checked) => updateGlobalOpt({ gen: checked })
      ).row
    );
    sumSec.appendChild(
      makeToggleRow(
        'Enable Google Search grounding by default',
        globalOpts.gsearch,
        'yt-opt-gsearch-checkbox',
        'Google Search Grounding Default',
        (checked) => updateGlobalOpt({ gsearch: checked })
      ).row
    );
    sumSec.appendChild(
      makeToggleRow(
        'Enable Google Maps grounding by default',
        globalOpts.gmaps,
        'yt-opt-gmaps-checkbox',
        'Google Maps Grounding Default',
        (checked) => updateGlobalOpt({ gmaps: checked })
      ).row
    );
    sumSec.appendChild(
      makeToggleRow(
        'Enable Code Execution tool by default',
        globalOpts.code,
        'yt-opt-code-checkbox',
        'Code Execution Default',
        (checked) => updateGlobalOpt({ code: checked })
      ).row
    );
    sumSec.appendChild(
      makeToggleRow(
        'Automatically fall back down model ladder if model is unavailable',
        globalOpts.fallback,
        'yt-opt-fallback-checkbox',
        'Auto Fallback Down Ladder',
        (checked) => updateGlobalOpt({ fallback: checked })
      ).row
    );
    sumSec.appendChild(
      makeToggleRow(
        'Fallback to Transcript if video duration/quota limit hit',
        globalOpts.txFallback,
        'yt-opt-txfallback-checkbox',
        'Transcript Quota Fallback',
        (checked) => updateGlobalOpt({ txFallback: checked })
      ).row
    );

    const thinkRow = h('div', { className: 'yt-key-row' });
    thinkRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Default Thinking Level & Media Resolution'));
    const thinkSel = h(
      'select',
      {
        className: 'yt-select yt-think-select',
        'aria-label': 'Default Thinking Level',
        onchange: (e) => updateGlobalOpt({ think: e.target.value })
      },
      h('option', { value: '' }, 'Thinking: Auto'),
      h('option', { value: 'low' }, 'Thinking: Low'),
      h('option', { value: 'medium' }, 'Thinking: Medium'),
      h('option', { value: 'high' }, 'Thinking: High')
    );
    thinkSel.value = globalOpts.think || '';
    const mresSel = h(
      'select',
      {
        className: 'yt-select yt-mres-select',
        'aria-label': 'Default Media Resolution',
        onchange: (e) => updateGlobalOpt({ mres: e.target.value })
      },
      h('option', { value: '' }, 'Media: Default'),
      h('option', { value: 'MEDIA_RESOLUTION_LOW' }, 'Media: Low'),
      h('option', { value: 'MEDIA_RESOLUTION_MEDIUM' }, 'Media: Medium'),
      h('option', { value: 'MEDIA_RESOLUTION_HIGH' }, 'Media: High')
    );
    mresSel.value = globalOpts.mres || '';
    thinkRow.appendChild(thinkSel);
    thinkRow.appendChild(mresSel);
    sumSec.appendChild(thinkRow);

    const retryFactRow = h('div', { className: 'yt-key-row' });
    retryFactRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Retries & Fact-Check Model'));
    const retrySel = h(
      'select',
      {
        className: 'yt-select yt-retry-select',
        'aria-label': 'Auto-Retry Count',
        onchange: (e) => updateGlobalOpt({ retries: parseInt(e.target.value, 10) || 0 })
      },
      ...['0', '1', '2', '3', '5', '10'].map((r) => h('option', { value: r }, `Retries: ${r}`))
    );
    retrySel.value = String(globalOpts.retries ?? 2);
    const factModelSel = h(
      'select',
      {
        className: 'yt-select yt-fact-model-select',
        'aria-label': 'Fact-Check Model',
        onchange: (e) => updateGlobalOpt({ factModel: e.target.value })
      },
      h('option', { value: '' }, 'Fact Model: Auto'),
      ...CONFIG.factPreferred.map((m) => h('option', { value: m }, m))
    );
    factModelSel.value = globalOpts.factModel || '';
    retryFactRow.appendChild(retrySel);
    retryFactRow.appendChild(factModelSel);
    sumSec.appendChild(retryFactRow);

    const imgGenRow = h('div', { className: 'yt-key-row' });
    imgGenRow.appendChild(h('span', { className: 'yt-setting-label' }, 'AI Image Model & Aspect'));
    const imgModelSel = h(
      'select',
      {
        className: 'yt-select yt-img-model-select',
        'aria-label': 'AI Image Model',
        onchange: (e) => updateGlobalOpt({ imgModel: e.target.value })
      },
      h('option', { value: '' }, 'Image Model: Auto'),
      ...CONFIG.imageModels.map((m) => h('option', { value: m }, CONFIG.imageModelNames[m] || m))
    );
    imgModelSel.value = globalOpts.imgModel || '';
    const imgAspectSel = h(
      'select',
      {
        className: 'yt-select yt-img-aspect-select',
        'aria-label': 'AI Image Aspect Ratio',
        onchange: (e) => updateGlobalOpt({ imgAspect: e.target.value })
      },
      h('option', { value: '' }, 'Aspect: Auto'),
      ...['1:1', '16:9', '4:3', '9:16', '3:2'].map((a) => h('option', { value: a }, a))
    );
    imgAspectSel.value = globalOpts.imgAspect || '';
    imgGenRow.appendChild(imgModelSel);
    imgGenRow.appendChild(imgAspectSel);
    sumSec.appendChild(imgGenRow);

    // --- SECTION 3: VIDEO TITLE GENERATION ---
    const titleSec = makeSection('titles', 'Video Title Generation');
    const currentAltMode = getAltTitleMode();
    const altModeRow = h('div', { className: 'yt-key-row' });
    altModeRow.appendChild(h('span', { className: 'yt-setting-label' }, 'AI Thumbnail Title Generation Mode'));
    const altModeGroup = h('div', {
      className: 'yt-app-theme-group yt-alt-title-mode-group',
      role: 'group',
      'aria-label': 'AI Video Title Generation Mode'
    });
    for (const opt of [
      { id: 'on', label: 'On (Auto)' },
      { id: 'manual', label: 'Manual' },
      { id: 'off', label: 'Off' }
    ]) {
      const isAct = currentAltMode === opt.id;
      altModeGroup.appendChild(
        h(
          'button',
          {
            type: 'button',
            className: `yt-m3-seg-btn yt-alt-title-mode-btn ${isAct ? 'active' : ''}`,
            'data-alt-title-mode': opt.id,
            'aria-pressed': isAct ? 'true' : 'false',
            onclick: () => {
              const nextM = setAltTitleMode(opt.id);
              announceLive(`Video title generation set to ${nextM}`);
            }
          },
          opt.label
        )
      );
    }
    altModeRow.appendChild(altModeGroup);
    titleSec.appendChild(altModeRow);
    titleSec.appendChild(
      h(
        'div',
        { className: 'yt-dialog-info' },
        'Auto generates factual <=150-char titles automatically (yielding to DeArrow and Music videos). Manual disables automatic page-load fetching while keeping the title-toggle icon active.'
      )
    );

    const chRuleList = h('div', { className: 'yt-keys-list yt-channel-rules-settings-list' });
    function renderChannelRulesList() {
      clearEl(chRuleList);
      const rules = getChannelTitleRules();
      const entries = Object.entries(rules);
      if (entries.length === 0) {
        chRuleList.appendChild(h('div', { className: 'yt-no-keys' }, 'No per-channel rules saved yet.'));
        return;
      }
      for (const [ch, rule] of entries) {
        const rRow = h('div', { className: 'yt-key-row' });
        rRow.appendChild(h('span', { className: 'yt-setting-label' }, ch));
        const rSel = h(
          'select',
          {
            className: 'yt-select',
            'aria-label': `Rule for ${ch}`,
            onchange: (e) => {
              setChannelTitleRule(ch, e.target.value);
              renderChannelRulesList();
            }
          },
          h('option', { value: 'default' }, 'Default (Remove)'),
          h('option', { value: 'exempt' }, 'Exempt'),
          h('option', { value: 'force_ai' }, 'Always AI')
        );
        rSel.value = rule;
        const delR = h(
          'button',
          {
            type: 'button',
            className: 'yt-sec-btn yt-del-btn',
            onclick: () => {
              setChannelTitleRule(ch, 'default');
              renderChannelRulesList();
            }
          },
          'Remove'
        );
        rRow.appendChild(rSel);
        rRow.appendChild(delR);
        chRuleList.appendChild(rRow);
      }
    }
    renderChannelRulesList();
    titleSec.appendChild(chRuleList);

    const addChRuleRow = h('div', { className: 'yt-key-row' });
    const addChName = h('input', {
      type: 'text',
      className: 'yt-input yt-add-channel-rule-input',
      style: 'flex:1;',
      placeholder: 'Channel name (e.g. Veritasium)'
    });
    const addChSel = h(
      'select',
      { className: 'yt-select yt-add-channel-rule-select', 'aria-label': 'Channel Rule Action' },
      h('option', { value: 'exempt' }, 'Exempt'),
      h('option', { value: 'force_ai' }, 'Always AI')
    );
    const addChBtn = h(
      'button',
      {
        type: 'button',
        className: 'yt-primary-btn yt-add-channel-rule-btn',
        onclick: () => {
          const chVal = addChName.value.trim();
          if (!chVal) return;
          setChannelTitleRule(chVal, addChSel.value);
          addChName.value = '';
          renderChannelRulesList();
        }
      },
      'Add Rule'
    );
    addChRuleRow.appendChild(addChName);
    addChRuleRow.appendChild(addChSel);
    addChRuleRow.appendChild(addChBtn);
    titleSec.appendChild(addChRuleRow);

    const clearTitlesRow = h('div', { style: 'display:flex;justify-content:flex-end;' });
    clearTitlesRow.appendChild(
      h(
        'button',
        {
          type: 'button',
          className: 'yt-sec-btn yt-clear-alt-titles-btn',
          onclick: () => {
            const cleared = clearAltTitlesCache();
            showGlobalToast(`Cleared ${cleared} cached AI title${cleared === 1 ? '' : 's'}`);
          }
        },
        'Clear Cached AI Titles'
      )
    );
    titleSec.appendChild(clearTitlesRow);

    // --- SECTION 4: PODCAST GENERATION ---
    const podSec = makeSection('podcast', 'Podcast Generation');

    const podCountRow = h('div', { className: 'yt-key-row' });
    podCountRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Default Podcast Host Count'));
    const podCountSel = h(
      'select',
      {
        className: 'yt-select yt-podcast-host-count-select',
        'aria-label': 'Default Podcast Host Count',
        onchange: (e) => {
          const nextCnt = setDefaultPodcastHostCount(Number(e.target.value));
          const updatedRoster = buildDefaultPodcastHosts(nextCnt, getDefaultPodcastHostsConfig());
          setDefaultPodcastHostsConfig(updatedRoster);
          renderHostRoster();
        }
      },
      ...[2, 3, 4, 5, 6].map((n) => h('option', { value: String(n) }, `${n} Hosts`))
    );
    podCountSel.value = String(getDefaultPodcastHostCount());
    podCountRow.appendChild(podCountSel);
    podSec.appendChild(podCountRow);

    const podSynthRow = h('div', { className: 'yt-key-row' });
    podSynthRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Podcast Audio Synthesis Engine'));
    const podSynthSel = h(
      'select',
      {
        className: 'yt-select yt-podcast-synth-select',
        'aria-label': 'Podcast Audio Synthesis Engine',
        onchange: (e) => setPodcastSynthesisMode(e.target.value)
      },
      h('option', { value: 'gemini_tts' }, 'Gemini Multi-Speaker TTS Audio (with Web Speech fallback)'),
      h('option', { value: 'webspeech' }, 'Browser Web Speech API (Instant Offline)')
    );
    podSynthSel.value = getPodcastSynthesisMode();
    podSynthRow.appendChild(podSynthSel);
    podSec.appendChild(podSynthRow);

    const podRateRow = h('div', { className: 'yt-key-row' });
    const podRateVal = h('span', { className: 'yt-setting-val' }, `${getPodcastDefaultRate().toFixed(2)}x`);
    podRateRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Default Podcast Playback Speed'));
    const podRateRange = h('input', {
      type: 'range',
      min: '0.75',
      max: '2.0',
      step: '0.05',
      value: String(getPodcastDefaultRate()),
      className: 'yt-setting-range yt-podcast-rate-range',
      'aria-label': 'Default Podcast Playback Speed',
      oninput: (e) => {
        const saved = setPodcastDefaultRate(Number(e.target.value));
        podRateVal.textContent = `${saved.toFixed(2)}x`;
      }
    });
    podRateRow.appendChild(podRateRange);
    podRateRow.appendChild(podRateVal);
    podSec.appendChild(podRateRow);

    const hostRosterWrap = h('div', { className: 'yt-settings-host-grid' });
    function renderHostRoster() {
      clearEl(hostRosterWrap);
      const roster = getDefaultPodcastHostsConfig();
      roster.forEach((hostItem, idx) => {
        const hRow = h('div', { className: 'yt-key-row' });
        hRow.appendChild(h('span', { className: 'yt-setting-val', style: 'text-align:left;min-width:52px;' }, `Host ${idx + 1}`));
        const nameIn = h('input', {
          type: 'text',
          className: 'yt-input',
          style: 'flex:1;',
          value: hostItem.name,
          'aria-label': `Podcast Host ${idx + 1} Name`,
          onchange: (e) => {
            const cur = getDefaultPodcastHostsConfig();
            cur[idx] = Object.assign({}, cur[idx], { name: e.target.value.trim() || hostItem.name });
            setDefaultPodcastHostsConfig(cur);
          }
        });
        const vSel = h(
          'select',
          {
            className: 'yt-select',
            'aria-label': `Podcast Host ${idx + 1} Voice`,
            onchange: (e) => {
              const cur = getDefaultPodcastHostsConfig();
              cur[idx] = Object.assign({}, cur[idx], { voiceName: e.target.value });
              setDefaultPodcastHostsConfig(cur);
            }
          },
          ...['Kore', 'Puck', 'Zephyr', 'Fenrir', 'Charon'].map((v) => h('option', { value: v }, v))
        );
        vSel.value = hostItem.voiceName;
        hRow.appendChild(nameIn);
        hRow.appendChild(vSel);
        hostRosterWrap.appendChild(hRow);
      });
    }
    renderHostRoster();
    podSec.appendChild(hostRosterWrap);
    podSec.appendChild(
      makeToggleRow(
        'Continue Podcast & TTS audio when summary window is minimized',
        getContinueAudioOnMinimize(),
        'yt-continue-audio-minimize-checkbox yt-podcast-continue-minimize-checkbox',
        'Continue audio when window is minimized (Podcast)',
        (checked) => setContinueAudioOnMinimize(checked)
      ).row
    );

    // --- SECTION 5: TRANSCRIPTION & TTS ---
    const ttsSec = makeSection('transcript_tts', 'Transcription, Voice Input & TTS');

    ttsSec.appendChild(
      makeToggleRow(
        'Continue TTS & Podcast audio when summary window is minimized',
        getContinueAudioOnMinimize(),
        'yt-continue-audio-minimize-checkbox yt-tts-continue-minimize-checkbox',
        'Continue audio when window is minimized (TTS)',
        (checked) => setContinueAudioOnMinimize(checked)
      ).row
    );
    ttsSec.appendChild(
      makeToggleRow(
        'Follow-Along Lock (auto-scroll active transcript line during playback)',
        getFollowAlongLock(),
        'yt-follow-along-setting-checkbox',
        'Follow-Along Lock',
        (checked) => setFollowAlongLock(checked)
      ).row
    );
    ttsSec.appendChild(
      makeToggleRow(
        'Skip Silence & Non-Speech Cue Brackets ([Music], [Applause])',
        globalOpts.skipSilence !== false,
        'yt-skip-silence-setting-checkbox',
        'Skip Silence',
        (checked) => updateGlobalOpt({ skipSilence: checked })
      ).row
    );

    const voiceEngRow = h('div', { className: 'yt-key-row' });
    voiceEngRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Voice Question Input Engine'));
    const voiceEngSel = h(
      'select',
      {
        className: 'yt-select yt-voice-engine-select',
        'aria-label': 'Voice Question Input Engine',
        onchange: (e) => setVoiceInputEngine(e.target.value)
      },
      h('option', { value: 'browser' }, 'Browser Web Speech Recognition'),
      h('option', { value: 'gemini' }, `Gemini Audio Transcribe (${CONFIG.transcribeModel})`)
    );
    voiceEngSel.value = getVoiceInputEngine();
    voiceEngRow.appendChild(voiceEngSel);
    ttsSec.appendChild(voiceEngRow);

    const ttsVoiceRow = h('div', { className: 'yt-key-row' });
    ttsVoiceRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Default TTS Voice'));
    const ttsVoiceSel = h('select', {
      className: 'yt-select yt-default-tts-voice-select',
      'aria-label': 'Default TTS Voice',
      onchange: (e) => setLastTtsVoice(e.target.value)
    });
    for (const v of CONFIG.aiVoices) {
      ttsVoiceSel.appendChild(h('option', { value: v.id }, v.name));
    }
    try {
      const bVoices = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      for (const bv of bVoices.slice(0, 12)) {
        ttsVoiceSel.appendChild(h('option', { value: bv.name }, `${bv.name} (${bv.lang})`));
      }
    } catch (_) {}
    ttsVoiceSel.value = getLastTtsVoice();
    ttsVoiceRow.appendChild(ttsVoiceSel);
    ttsSec.appendChild(ttsVoiceRow);

    const ttsRateRow = h('div', { className: 'yt-key-row' });
    const ttsRateVal = h('span', { className: 'yt-setting-val' }, `${getLastTtsRate().toFixed(2)}x`);
    ttsRateRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Default TTS Speed'));
    ttsRateRow.appendChild(
      h('input', {
        type: 'range',
        min: '0.5',
        max: '2.0',
        step: '0.1',
        value: String(getLastTtsRate()),
        className: 'yt-setting-range yt-default-tts-rate-range',
        'aria-label': 'Default TTS Speed',
        oninput: (e) => {
          const val = Number(e.target.value);
          setLastTtsRate(val);
          ttsRateVal.textContent = `${val.toFixed(2)}x`;
        }
      })
    );
    ttsRateRow.appendChild(ttsRateVal);
    ttsSec.appendChild(ttsRateRow);

    const ttsPitchRow = h('div', { className: 'yt-key-row' });
    const ttsPitchVal = h('span', { className: 'yt-setting-val' }, `${getLastTtsPitch().toFixed(2)}x`);
    ttsPitchRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Default TTS Pitch'));
    ttsPitchRow.appendChild(
      h('input', {
        type: 'range',
        min: '0.5',
        max: '2.0',
        step: '0.05',
        value: String(getLastTtsPitch()),
        className: 'yt-setting-range yt-default-tts-pitch-range',
        'aria-label': 'Default TTS Pitch',
        oninput: (e) => {
          const val = clampPitch(Number(e.target.value));
          setLastTtsPitch(val);
          ttsPitchVal.textContent = `${val.toFixed(2)}x`;
        }
      })
    );
    ttsPitchRow.appendChild(ttsPitchVal);
    ttsSec.appendChild(ttsPitchRow);

    const ttsVolRow = h('div', { className: 'yt-key-row' });
    const ttsVolVal = h('span', { className: 'yt-setting-val' }, `${Math.round(getLastTtsVolume() * 100)}%`);
    ttsVolRow.appendChild(h('span', { className: 'yt-setting-label' }, 'Default TTS Volume'));
    ttsVolRow.appendChild(
      h('input', {
        type: 'range',
        min: '0',
        max: '1',
        step: '0.05',
        value: String(getLastTtsVolume()),
        className: 'yt-setting-range yt-default-tts-volume-range',
        'aria-label': 'Default TTS Volume',
        oninput: (e) => {
          const val = Number(e.target.value);
          setLastTtsVolume(val);
          ttsVolVal.textContent = `${Math.round(val * 100)}%`;
        }
      })
    );
    ttsVolRow.appendChild(ttsVolVal);
    ttsSec.appendChild(ttsVolRow);

    // --- SECTION 6: HISTORY & DOCK ---
    const histSec = makeSection('history', 'History & Lower-Right Dock');

    histSec.appendChild(
      makeToggleRow(
        'Show History tab in the lower-right of the page',
        getShowHistoryBottomTab(),
        'yt-show-history-tab-checkbox',
        'Show History tab in lower-right dock',
        (checked) => setShowHistoryBottomTab(checked)
      ).row
    );

    const scopeRow = h('div', { className: 'yt-key-row' });
    scopeRow.appendChild(h('span', { className: 'yt-setting-label' }, 'History Dock Page Scope'));
    const curScope = getHistoryPageScope();
    const scopeGroup = h('div', {
      className: 'yt-app-theme-group yt-history-scope-group',
      role: 'group',
      'aria-label': 'History Dock Page Visibility Scope'
    });
    for (const opt of [
      { id: 'all_pages', label: 'Every Page' },
      { id: 'home_only', label: 'Home Feed Only' }
    ]) {
      const isAct = curScope === opt.id;
      scopeGroup.appendChild(
        h(
          'button',
          {
            type: 'button',
            className: `yt-m3-seg-btn yt-history-scope-btn ${isAct ? 'active' : ''}`,
            'data-history-scope': opt.id,
            'aria-pressed': isAct ? 'true' : 'false',
            onclick: () => setHistoryPageScope(opt.id)
          },
          opt.label
        )
      );
    }
    scopeRow.appendChild(scopeGroup);
    histSec.appendChild(scopeRow);

    const settingsRow = h('div', { className: 'yt-key-row' });
    settingsRow.appendChild(h('span', { className: 'yt-setting-label' }, 'History dock display condition'));
    const histVisSel = h(
      'select',
      {
        className: 'yt-select yt-history-visibility-select',
        'aria-label': 'History tab visibility',
        onchange: (e) => setHistoryTabVisibility(e.target.value)
      },
      h('option', { value: 'always' }, 'Always shown'),
      h('option', { value: 'with_tabs' }, 'Only with open/minimized tabs'),
      h('option', { value: 'never' }, 'Never shown')
    );
    histVisSel.value = getHistoryTabVisibility();
    settingsRow.appendChild(histVisSel);
    histSec.appendChild(settingsRow);

    const clearHistRow = h('div', { style: 'display:flex;justify-content:flex-end;' });
    clearHistRow.appendChild(
      h(
        'button',
        {
          type: 'button',
          className: 'yt-sec-btn yt-del-btn yt-settings-clear-history-btn',
          onclick: () => {
            clearAllCache();
            updateDockHistoryTab();
            showGlobalToast('Saved summary history cleared');
          }
        },
        'Clear All Saved History'
      )
    );
    histSec.appendChild(clearHistRow);

    // --- SECTION 7: API KEYS & CUSTOM MODELS ---
    const keysSec = makeSection('keys', 'Google AI Studio API Keys & Custom Models');
    keysSec.appendChild(
      h(
        'div',
        { className: 'yt-dialog-info' },
        'Keys are stored locally in your userscript manager storage and sent only to generativelanguage.googleapis.com.'
      )
    );

    const keysList = h('div', { className: 'yt-keys-list' });
    function renderKeys() {
      clearEl(keysList);
      const keys = getStoredKeys();
      if (keys.length === 0) {
        keysList.appendChild(h('div', { className: 'yt-no-keys' }, 'No API keys stored yet. Add one below:'));
        return;
      }
      for (const k of keys) {
        const row = h('div', { className: 'yt-key-row' });
        const nameInput = h('input', {
          className: 'yt-input yt-key-name-input',
          value: k.name,
          onchange: (e) => {
            k.name = e.target.value.trim() || 'Key';
            saveStoredKeys(keys);
          }
        });
        const last4 = k.key.length >= 4 ? k.key.slice(-4) : k.key;
        const keyMask = h('span', { className: 'yt-key-mask' }, `••••${last4}`);
        const delBtn = h(
          'button',
          {
            type: 'button',
            className: 'yt-sec-btn yt-del-btn',
            onclick: () => {
              const idx = keys.indexOf(k);
              if (idx !== -1) {
                keys.splice(idx, 1);
                saveStoredKeys(keys);
                renderKeys();
              }
            }
          },
          'Delete'
        );
        row.appendChild(nameInput);
        row.appendChild(keyMask);
        row.appendChild(delBtn);
        keysList.appendChild(row);
      }
    }
    renderKeys();
    keysSec.appendChild(keysList);

    const form = h('div', { className: 'yt-add-key-form', style: 'border-top:none;padding-top:4px;' });
    const nicknameInput = h('input', {
      className: 'yt-input',
      placeholder: 'Key Nickname (e.g. Work or Free Tier)',
      value: ''
    });
    const keyInput = h('input', {
      className: 'yt-input',
      type: 'password',
      placeholder: 'AIzaSy...'
    });
    const addBtn = h(
      'button',
      {
        type: 'button',
        className: 'yt-primary-btn',
        onclick: () => {
          const rawKey = keyInput.value.trim();
          if (!rawKey) return;
          const name = nicknameInput.value.trim() || `Key ${getStoredKeys().length + 1}`;
          const keys = getStoredKeys();
          keys.push({
            id: 'k_' + Math.random().toString(36).slice(2, 8),
            name: name,
            key: rawKey
          });
          saveStoredKeys(keys);
          nicknameInput.value = '';
          keyInput.value = '';
          renderKeys();
        }
      },
      'Add Key'
    );
    form.appendChild(nicknameInput);
    form.appendChild(keyInput);
    form.appendChild(addBtn);
    keysSec.appendChild(form);

    // Custom Models Manager
    keysSec.appendChild(h('div', { className: 'yt-settings-group-title', style: 'margin-top:6px;' }, 'Custom Gemini Models'));
    const customList = h('div', { className: 'yt-keys-list' });
    function renderCustomModels() {
      clearEl(customList);
      const list = getCustomModels();
      if (list.length === 0) {
        customList.appendChild(h('div', { className: 'yt-no-keys' }, 'No custom model IDs added.'));
        return;
      }
      for (const mid of list) {
        const cRow = h('div', { className: 'yt-key-row' });
        cRow.appendChild(h('span', { className: 'yt-setting-label' }, mid));
        cRow.appendChild(
          h(
            'button',
            {
              type: 'button',
              className: 'yt-sec-btn yt-del-btn',
              onclick: () => {
                removeCustomModel(mid);
                renderCustomModels();
                populateSummaryModelSel();
              }
            },
            'Remove'
          )
        );
        customList.appendChild(cRow);
      }
    }
    renderCustomModels();
    keysSec.appendChild(customList);

    const addCustomRow = h('div', { className: 'yt-key-row' });
    const customModelInput = h('input', {
      type: 'text',
      className: 'yt-input yt-custom-model-input',
      style: 'flex:1;',
      placeholder: 'Custom model ID (e.g. gemini-3.9-pro-exp)'
    });
    const addCustomBtn = h(
      'button',
      {
        type: 'button',
        className: 'yt-sec-btn yt-add-custom-model-btn',
        onclick: () => {
          const val = customModelInput.value.trim();
          if (!val) return;
          addCustomModel(val);
          customModelInput.value = '';
          renderCustomModels();
          populateSummaryModelSel();
        }
      },
      'Add Model'
    );
    addCustomRow.appendChild(customModelInput);
    addCustomRow.appendChild(addCustomBtn);
    keysSec.appendChild(addCustomRow);

    const maintRow = h('div', { style: 'display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:4px;' });
    maintRow.appendChild(
      h(
        'button',
        {
          type: 'button',
          className: 'yt-sec-btn yt-refresh-models-btn',
          onclick: async () => {
            const keys = getStoredKeys();
            if (!keys.length) {
              showGlobalToast('Add an API key first to check models');
              return;
            }
            showGlobalToast('Refreshing Gemini model availability...');
            for (const k of keys) {
              await checkModelsForKey(k, true);
            }
            if (maximizedWindow) maximizedWindow.renderAll();
            showGlobalToast('Gemini model availability updated.');
          }
        },
        'Refresh Model Availability'
      )
    );
    keysSec.appendChild(maintRow);

    scrollBody.appendChild(appSec);
    scrollBody.appendChild(sumSec);
    scrollBody.appendChild(titleSec);
    scrollBody.appendChild(podSec);
    scrollBody.appendChild(ttsSec);
    scrollBody.appendChild(histSec);
    scrollBody.appendChild(keysSec);
    box.appendChild(scrollBody);

    cleanupInteractions = attachFloatingWindowInteractions({
      box,
      headerEl: header,
      initialBounds: initBounds,
      minWidth: 360,
      minHeight: 340,
      onSaveBounds: (b) => setLastSettingsBounds(b),
      onFocus: () => {
        scrim.style.zIndex = String(2147483000 + Math.min(64, ++topWindowZIndex));
      }
    });
    scrim._ytaisCleanup = cleanupInteractions;

    scrim.appendChild(box);
    modalsContainer.appendChild(scrim);
    applyCategoryFilter(activeCat);
  }
  const openKeyManagerDialog = openSettingsDialog;

  // --- PREVIOUS SUMMARIES & HISTORY DIALOG ---
  let dockHistoryTab = null;

  function updateDockHistoryTab() {
    if (!dockContainer) return;
    const cachedCount = getCachedSummariesCount();
    const currentPage =
      typeof window !== 'undefined' && window.location
        ? `${window.location.pathname || '/'}${window.location.search || ''}`
        : '/';
    const shouldShow = shouldShowHistoryTab({
      visibility: getHistoryTabVisibility(),
      cachedCount,
      activeTabCount: activeWindows.size,
      showHistoryBottomTab: getShowHistoryBottomTab(),
      pageScope: getHistoryPageScope(),
      currentPage
    });
    if (!shouldShow) {
      if (dockHistoryTab) {
        dockHistoryTab.remove();
        dockHistoryTab = null;
      }
      return;
    }
    if (!dockHistoryTab) {
      dockHistoryTab = h(
        'div',
        {
          className: 'yt-dock-tab yt-dock-history-tab',
          title: 'Browse previous summaries that were closed',
          onclick: () => openHistoryDialog()
        },
        h('div', { className: 'yt-dock-status-icon' }, iconHistory(14)),
        h('div', { className: 'yt-dock-title yt-dock-history-title' }, `History (${cachedCount})`),
        h(
          'button',
          {
            className: 'yt-dock-btn yt-dock-open-history-btn',
            title: 'Browse previous summaries',
            onclick: (e) => {
              e.stopPropagation();
              openHistoryDialog();
            }
          },
          iconExternal(12)
        )
      );
      dockContainer.appendChild(dockHistoryTab);
    } else {
      const titleEl = dockHistoryTab.querySelector('.yt-dock-history-title');
      if (titleEl) {
        titleEl.textContent = `History (${cachedCount})`;
      }
      dockContainer.appendChild(dockHistoryTab);
    }
  }

  function openHistoryDialog() {
    ensureHostAndShadow();
    const existing = modalsContainer?.querySelector('.yt-history-dialog-scrim');
    if (existing) {
      if (typeof existing._ytaisCleanup === 'function') existing._ytaisCleanup();
      existing.remove();
    }

    const vp = { width: window.innerWidth || 1280, height: window.innerHeight || 800 };
    const savedHistoryBounds = getLastHistoryBounds();
    const initBounds = clampWindowBounds(
      savedHistoryBounds || {
        width: Math.min(740, vp.width - 32),
        height: Math.min(620, vp.height - 96),
        left: Math.round((vp.width - Math.min(740, vp.width - 32)) / 2),
        top: Math.max(24, Math.round((vp.height - Math.min(620, vp.height - 96)) / 2) - 12)
      },
      vp,
      360,
      300
    );

    const scrim = h('div', {
      className: 'yt-modal-scrim yt-floating-scrim yt-history-dialog-scrim',
      style: `z-index: ${2147483000 + Math.min(60, ++topWindowZIndex)};`
    });

    let cleanupInteractions = null;
    const closeHistory = () => {
      if (cleanupInteractions) cleanupInteractions();
      scrim.remove();
    };
    scrim._ytaisClose = closeHistory;

    const box = h('div', {
      className: 'yt-window-box yt-floating-window yt-history-dialog-box',
      style: `left:${initBounds.left}px;top:${initBounds.top}px;width:${initBounds.width}px;height:${initBounds.height}px;`,
      onwheel: (e) => e.stopPropagation()
    });

    // Header (Movable + Settings next to Close button)
    const header = h('div', { className: 'yt-win-header', title: 'Drag header to move Previous Summaries window' });
    const dragGrip = h(
      'button',
      {
        className: 'yt-win-drag-grip',
        type: 'button',
        tabindex: '0',
        'aria-label': 'Move Previous Summaries window with arrow keys',
        title: 'Drag or press Arrow keys to move window'
      },
      iconDragGrip(16)
    );
    const titleCol = h('div', { className: 'yt-win-title-col' });
    const titleText = h('div', { className: 'yt-win-title' }, 'Previous Summaries');
    const subtitle = h('div', { className: 'yt-win-status-line' });
    titleCol.appendChild(titleText);
    titleCol.appendChild(subtitle);

    const btnGroup = h('div', { className: 'yt-win-header-btns' });
    const settingsBtn = h(
      'button',
      {
        type: 'button',
        className: 'yt-win-btn yt-history-settings-btn',
        title: 'Settings & Appearance',
        'aria-label': 'Open Settings',
        onclick: (e) => {
          e.stopPropagation();
          openSettingsDialog(() => applyShadowAppTheme());
        }
      },
      iconGear(18)
    );
    const closeBtn = h(
      'button',
      {
        type: 'button',
        className: 'yt-win-btn yt-win-close-btn',
        title: 'Close history',
        'aria-label': 'Close history',
        onclick: closeHistory
      },
      iconClose(20)
    );
    btnGroup.appendChild(settingsBtn);
    btnGroup.appendChild(closeBtn);

    header.appendChild(dragGrip);
    header.appendChild(titleCol);
    header.appendChild(btnGroup);
    box.appendChild(header);

    // Search / Filter bar
    const searchBar = h('div', { className: 'yt-history-search-bar' });
    const searchInput = h('input', {
      type: 'text',
      className: 'yt-history-search-input',
      placeholder: 'Search previous summaries by title or content…'
    });
    searchBar.appendChild(searchInput);
    box.appendChild(searchBar);

    // List container
    const listContainer = h('div', { className: 'yt-history-list' });
    box.appendChild(listContainer);

    // Footer actions
    const footer = h('div', { className: 'yt-history-footer' });
    const clearAllBtn = h(
      'button',
      {
        className: 'yt-sec-btn yt-del-btn',
        onclick: () => {
          if (confirm('Clear all cached summaries? (Open windows will remain)')) {
            clearAllCache();
            updateDockHistoryTab();
            renderList();
          }
        }
      },
      'Clear All History'
    );
    const visSelect = h(
      'select',
      {
        className: 'yt-select yt-history-visibility-select',
        title: 'Control when the bottom-right History dock tab is shown',
        'aria-label': 'History tab visibility',
        onchange: (e) => {
          setHistoryTabVisibility(e.target.value);
        }
      },
      h('option', { value: 'always' }, 'History tab: Always shown'),
      h('option', { value: 'with_tabs' }, 'History tab: With open/minimized tabs'),
      h('option', { value: 'never' }, 'History tab: Never shown')
    );
    visSelect.value = getHistoryTabVisibility();
    const doneBtn = h('button', { className: 'yt-primary-btn', onclick: closeHistory }, 'Close');
    footer.appendChild(clearAllBtn);
    footer.appendChild(visSelect);
    footer.appendChild(h('div', { className: 'yt-spacer' }));
    footer.appendChild(doneBtn);
    box.appendChild(footer);

    function renderList(query = '') {
      clearEl(listContainer);
      const allItems = getAllCachedSummaries();
      const q = query.toLowerCase().trim();
      const filtered = q
        ? allItems.filter(
            (it) => it.title.toLowerCase().includes(q) || (it.text || '').toLowerCase().includes(q)
          )
        : allItems;

      subtitle.textContent = `${allItems.length} previous summar${allItems.length === 1 ? 'y' : 'ies'} saved`;

      if (filtered.length === 0) {
        const empty = h(
          'div',
          { className: 'yt-history-empty' },
          q
            ? `No previous summaries match "${query}".`
            : 'No previous summaries yet. Videos you summarize will be saved here so you can access them even after closing the window.'
        );
        listContainer.appendChild(empty);
        return;
      }

      for (const item of filtered) {
        const card = h('div', { className: 'yt-history-card' });

        // Left: Thumbnail preview
        const thumbWrap = h(
          'div',
          {
            className: 'yt-history-thumb-wrap',
            onclick: () => {
              closeHistory();
              openForVideo({ videoId: item.videoId, title: item.title });
            }
          },
          h('img', {
            src: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
            alt: item.title,
            className: 'yt-history-thumb',
            onerror: (e) => {
              e.target.style.display = 'none';
            }
          })
        );

        // Middle: Info & snippet
        const infoCol = h('div', { className: 'yt-history-info' });
        const itemTitle = h(
          'a',
          {
            className: 'yt-history-item-title',
            href: `https://www.youtube.com/watch?v=${item.videoId}`,
            target: '_blank',
            rel: 'noopener noreferrer',
            title: `${item.title} (Open video in new tab)`
          },
          item.title
        );

        const metaRow = h('div', { className: 'yt-history-item-meta' });
        metaRow.appendChild(
          h('span', { className: 'yt-history-badge mode' }, item.mode === 'transcript' ? 'Transcript' : 'Summary')
        );
        if (item.model) {
          metaRow.appendChild(h('span', { className: 'yt-history-badge model' }, item.model));
        }
        metaRow.appendChild(
          h('span', { className: 'yt-history-date' }, new Date(item.ts).toLocaleDateString())
        );

        const snippetText = (item.text || '')
          .replace(/[#*`_\[\]]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 160);
        const snippetEl = h('div', { className: 'yt-history-snippet' }, snippetText ? `${snippetText}…` : 'Summary ready.');

        infoCol.appendChild(itemTitle);
        infoCol.appendChild(metaRow);
        infoCol.appendChild(snippetEl);

        // Right: Actions
        const actionsCol = h('div', { className: 'yt-history-actions' });
        const reopenBtn = h(
          'button',
          {
            className: 'yt-primary-btn yt-history-reopen-btn',
            title: 'Re-open this summary in dock',
            onclick: () => {
              closeHistory();
              openForVideo({ videoId: item.videoId, title: item.title });
            }
          },
          'Open Summary'
        );

        const openVideoBtn = h(
          'a',
          {
            className: 'yt-sec-btn yt-history-video-btn',
            href: `https://www.youtube.com/watch?v=${item.videoId}`,
            target: '_blank',
            rel: 'noopener noreferrer',
            title: 'Open video in new tab'
          },
          iconExternal(12),
          h('span', {}, 'Watch video')
        );

        const delBtn = h(
          'button',
          {
            className: 'yt-sec-btn yt-history-del-btn',
            title: 'Remove from history',
            onclick: () => {
              deleteCachedVideo(item.videoId);
              updateDockHistoryTab();
              renderList(searchInput.value);
            }
          },
          iconClose(12)
        );

        actionsCol.appendChild(reopenBtn);
        actionsCol.appendChild(openVideoBtn);
        actionsCol.appendChild(delBtn);

        card.appendChild(thumbWrap);
        card.appendChild(infoCol);
        card.appendChild(actionsCol);
        listContainer.appendChild(card);
      }
    }

    searchInput.addEventListener('input', (e) => {
      renderList(e.target.value);
    });

    cleanupInteractions = attachFloatingWindowInteractions({
      box,
      headerEl: header,
      initialBounds: initBounds,
      minWidth: 360,
      minHeight: 300,
      onSaveBounds: (b) => setLastHistoryBounds(b),
      onFocus: () => {
        scrim.style.zIndex = String(2147483000 + Math.min(60, ++topWindowZIndex));
      }
    });
    scrim._ytaisCleanup = cleanupInteractions;

    renderList();
    scrim.appendChild(box);
    modalsContainer.appendChild(scrim);
  }

  // --- TOP-LEFT LAUNCHER & QUICK MENU WINDOW ---
  function openQuickMenuWindow(anchorRect = null) {
    ensureHostAndShadow();
    const existing = modalsContainer?.querySelector('.yt-quick-menu-scrim');
    if (existing) {
      if (typeof existing._ytaisCleanup === 'function') existing._ytaisCleanup();
      existing.remove();
      return;
    }

    const vp = { width: window.innerWidth || 1280, height: window.innerHeight || 800 };
    const saved = getLastQuickMenuBounds();
    const defaultLeft = anchorRect ? Math.max(12, Math.round(anchorRect.left)) : 16;
    const defaultTop = anchorRect ? Math.max(12, Math.round(anchorRect.bottom + 8)) : 56;
    const initBounds = clampWindowBounds(
      saved || { left: defaultLeft, top: defaultTop, width: 320, height: 260 },
      vp,
      260,
      210
    );

    const scrim = h('div', {
      className: 'yt-modal-scrim yt-floating-scrim yt-quick-menu-scrim',
      style: `z-index: ${2147483000 + Math.min(65, ++topWindowZIndex)};`
    });

    let cleanupInteractions = null;
    const closeMenu = () => {
      if (cleanupInteractions) cleanupInteractions();
      scrim.remove();
    };
    scrim._ytaisClose = closeMenu;

    const box = h('div', {
      className: 'yt-window-box yt-floating-window yt-quick-menu-box',
      style: `left:${initBounds.left}px;top:${initBounds.top}px;width:${initBounds.width}px;height:${initBounds.height}px;`,
      onwheel: (e) => e.stopPropagation()
    });

    const header = h('div', { className: 'yt-win-header', title: 'Drag header to move Quick Menu' });
    header.appendChild(
      h(
        'button',
        {
          className: 'yt-win-drag-grip',
          type: 'button',
          tabindex: '0',
          'aria-label': 'Move Quick Menu with arrow keys'
        },
        iconDragGrip(15)
      )
    );
    const titleCol = h('div', { className: 'yt-win-title-col' });
    titleCol.appendChild(h('div', { className: 'yt-win-title', style: 'font-size:13px;' }, 'Summariser Menu'));
    header.appendChild(titleCol);
    header.appendChild(
      h(
        'button',
        {
          type: 'button',
          className: 'yt-win-btn yt-win-close-btn yt-quick-menu-close-btn',
          title: 'Close menu',
          'aria-label': 'Close menu',
          onclick: closeMenu
        },
        iconClose(18)
      )
    );
    box.appendChild(header);

    const body = h('div', { className: 'yt-quick-menu-body' });
    const openHistBtn = h(
      'button',
      {
        type: 'button',
        className: 'yt-quick-menu-item yt-quick-open-history-btn',
        onclick: () => {
          closeMenu();
          openHistoryDialog();
        }
      },
      iconHistory(16),
      h('div', { className: 'yt-quick-menu-item-text' },
        h('div', { className: 'yt-quick-menu-item-title' }, 'Previous Summaries'),
        h('div', { className: 'yt-quick-menu-item-sub' }, `${getCachedSummariesCount()} cached items`)
      )
    );
    const openSettingsBtn = h(
      'button',
      {
        type: 'button',
        className: 'yt-quick-menu-item yt-quick-open-settings-btn',
        onclick: () => {
          closeMenu();
          openSettingsDialog();
        }
      },
      iconGear(16),
      h('div', { className: 'yt-quick-menu-item-text' },
        h('div', { className: 'yt-quick-menu-item-title' }, 'Settings & Appearance'),
        h('div', { className: 'yt-quick-menu-item-sub' }, 'Theme, fonts, formatting & API keys')
      )
    );

    body.appendChild(openHistBtn);
    body.appendChild(openSettingsBtn);
    box.appendChild(body);

    cleanupInteractions = attachFloatingWindowInteractions({
      box,
      headerEl: header,
      initialBounds: initBounds,
      minWidth: 260,
      minHeight: 210,
      onSaveBounds: (b) => setLastQuickMenuBounds(b),
      onFocus: () => {
        scrim.style.zIndex = String(2147483000 + Math.min(65, ++topWindowZIndex));
      }
    });
    scrim._ytaisCleanup = cleanupInteractions;

    scrim.appendChild(box);
    modalsContainer.appendChild(scrim);
  }

  function ensureTopbarLauncher() {
    if (typeof document === 'undefined' || !document.body) return null;
    ensureFeedStylesInjected();
    let btn = document.querySelector('.yt-topbar-launcher-btn');
    const mastheadStart = document.querySelector('ytd-masthead #start');
    const logoAnchor = mastheadStart?.querySelector('ytd-topbar-logo-renderer, #logo');

    if (!btn) {
      btn = h(
        'button',
        {
          type: 'button',
          className: 'yt-topbar-launcher-btn',
          'data-ytais-launcher': 'true',
          title: 'Open Summariser Quick Menu (Previous Summaries & Settings)',
          'aria-label': 'Open Summariser Quick Menu',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            openQuickMenuWindow(btn.getBoundingClientRect());
          }
        },
        iconSparkle(16)
      );
    }

    if (mastheadStart && logoAnchor && logoAnchor.parentElement === mastheadStart) {
      btn.classList.remove('yt-topbar-launcher-fixed');
      if (btn.parentElement !== mastheadStart || btn.previousElementSibling !== logoAnchor) {
        logoAnchor.insertAdjacentElement('afterend', btn);
      }
    } else if (mastheadStart) {
      btn.classList.remove('yt-topbar-launcher-fixed');
      if (btn.parentElement !== mastheadStart) {
        mastheadStart.appendChild(btn);
      }
    } else {
      btn.classList.add('yt-topbar-launcher-fixed');
      if (btn.parentElement !== document.body) {
        document.body.appendChild(btn);
      }
    }

    const eff = getEffectiveAppTheme();
    btn.classList.remove('yt-ui-light', 'yt-ui-dark');
    btn.classList.add(eff === 'light' ? 'yt-ui-light' : 'yt-ui-dark');
    return btn;
  }

  // --- OPEN FOR VIDEO HELPER (§4) ---
  function openForVideo({ videoId, title }) {
    if (!videoId) return;

    // 1. Existing local window
    if (activeWindows.has(videoId)) {
      const existing = activeWindows.get(videoId);
      existing.maximize();
      return existing;
    }

    // 2. Existing remote registry entry
    const meta = GM_getValue('win:' + videoId, null);
    const win = new SummaryWindow(videoId, title, meta || {});

    // Check cache
    const cached = readCache(videoId, win.mode, win.source, false, win.getSummaryPersona());
    if (cached) {
      win.loadFromCache(cached);
      win.commit(true);
      win.maximize();
      if (
        normalizeAutoFactCheckSetting(win.opts?.autoFactCheck) &&
        (win.opts.fc || win.opts.src) &&
        win.mode === 'summary' &&
        !win.fact
      ) {
        win.runFactCheck();
      }
      return win;
    }

    // Check auto-start
    const keys = getStoredKeys();
    const isAsk = win.modelId.includes('Ask');
    if (getAutoStart() && (keys.length > 0 || isAsk)) {
      win.commit(true);
      win.startJob();
      return win;
    }

    // Otherwise maximize idle
    win.commit(true);
    win.maximize();

    if (keys.length === 0 && !isAsk) {
      openKeyManagerDialog(() => win.renderAll());
    }
    return win;
  }

  // --- 3-DOT MENU INTEGRATION (§5) ---
  let menuPollTimer = null;

  const GUIDE_SIDEBAR_SELECTOR =
    'ytd-guide-renderer, ytd-mini-guide-renderer, ytd-guide-entry-renderer, ytd-guide-section-renderer, tp-yt-app-drawer, #guide, #guide-inner-content, ytd-masthead';
  const POPUP_MENU_CONTAINER_SELECTOR =
    'tp-yt-iron-dropdown, ytd-popup-container, yt-sheet-view-model, ytd-menu-popup-renderer, tp-yt-paper-listbox, [role="menu"]';

  function initMenuIntegration() {
    document.addEventListener(
      'click',
      (e) => {
        const path = e.composedPath();
        const hitOwnControl = path.some((el) => {
          if (!el) return false;
          if (el.id === 'yt-ai-summary-host' || el?.dataset?.ytaisItem) return true;
          const cl = el.classList;
          return Boolean(
            cl &&
              (cl.contains('yt-alt-title-btn') ||
                cl.contains('yt-channel-rule-btn') ||
                cl.contains('yt-channel-rule-menu') ||
                cl.contains('yt-channel-rule-option') ||
                cl.contains('yt-music-exempt-icon') ||
                cl.contains('yt-topbar-launcher-btn') ||
                cl.contains('cbButton') ||
                cl.contains('cbTitleButton'))
          );
        });
        if (hitOwnControl) return;

        const targetNode = e.target?.nodeType === 3 ? e.target.parentElement : e.target;
        const inGuideSidebar = Boolean(
          targetNode?.closest?.(GUIDE_SIDEBAR_SELECTOR) ||
            path.some((el) => el?.matches?.(GUIDE_SIDEBAR_SELECTOR))
        );
        if (inGuideSidebar) return;

        const card = path.find((el) => {
          if (!el || !el.tagName) return false;
          const tag = el.tagName.toLowerCase();
          return (
            tag.startsWith('yt-lockup-view-model') ||
            tag.startsWith('ytm-shorts-lockup-view-model') ||
            tag === 'ytd-rich-item-renderer' ||
            tag === 'ytd-video-renderer' ||
            tag === 'ytd-compact-video-renderer' ||
            tag === 'ytd-grid-video-renderer' ||
            tag === 'ytd-playlist-video-renderer' ||
            tag === 'ytd-reel-item-renderer'
          );
        });

        if (!card) return;

        // Check if an authentic 3-dot / action menu button was clicked (never title/rule buttons)
        const isMenuClick = path.some((el) => {
          if (!el || !el.getAttribute) return false;
          const tag = el.tagName?.toLowerCase() || '';
          const cl = el.classList;
          if (
            cl &&
            (cl.contains('yt-alt-title-btn') ||
              cl.contains('yt-channel-rule-btn') ||
              cl.contains('yt-channel-rule-option'))
          ) {
            return false;
          }
          if (
            tag === 'ytd-menu-renderer' ||
            cl?.contains('yt-lockup-metadata-view-model__menu-button') ||
            cl?.contains('yt-lockup-metadata-view-model-menu-button')
          ) {
            return true;
          }
          const aria = el.getAttribute('aria-label') || '';
          if (/more actions|action menu/i.test(aria)) return true;
          if (
            (tag === 'button' || tag === 'yt-icon-button' || tag === 'button-view-model') &&
            !el.closest('a[href], ytd-thumbnail, yt-thumbnail-view-model, #hover-overlays, #overlays') &&
            Boolean(el.closest('ytd-menu-renderer, .yt-lockup-metadata-view-model__menu-button, #menu, [class*="menu-button"]'))
          ) {
            return true;
          }
          return false;
        });

        // Extract video ID and Title (prefer live href to survive SPA card recycling)
        let videoId = getCardVideoId(card) || card.dataset.ytaisVideoId || '';
        if (!videoId) {
          const link = card.querySelector('a[href*="/watch?v="], a[href*="/shorts/"], a[href*="/live/"]');
          if (link) {
            const href = link.getAttribute('href') || '';
            const matchV = /[?&]v=([a-zA-Z0-9_-]{8,32})/.exec(href);
            if (matchV) videoId = matchV[1];
            else {
              const matchS = /\/(?:shorts|live)\/([a-zA-Z0-9_-]{8,32})/.exec(href);
              if (matchS) videoId = matchS[1];
            }
          }
        }

        if (
          !shouldTriggerFeedCardMenuPoll({
            hitOwnControl,
            inGuideSidebar,
            isMenuButton: isMenuClick,
            hasVideoId: Boolean(videoId)
          })
        ) {
          return;
        }

        let title = '';
        const titleEl = getCardTitleElement(card) || card.querySelector('#video-title, .yt-lockup-metadata-view-model__title, h3');
        if (titleEl) {
          title = (card._originalTitle || titleEl.getAttribute('title') || getTitleCleanText(titleEl) || '').trim();
        }

        // Poll for popup menu flyout (strictly excluding left sidebar Watch later / guide links)
        if (menuPollTimer) clearInterval(menuPollTimer);
        let ticks = 0;
        menuPollTimer = setInterval(() => {
          ticks++;
          if (ticks > 45) {
            clearInterval(menuPollTimer);
            return;
          }

          const items = Array.from(
            document.querySelectorAll(
              'ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, yt-list-item-view-model, tp-yt-paper-item, [role="menuitem"]'
            )
          ).filter((el) => {
            if (!(el.offsetWidth > 0 && el.offsetHeight > 0 && !el.dataset.ytaisItem)) return false;
            if (el.closest(GUIDE_SIDEBAR_SELECTOR)) return false;
            if (el.closest('a[href]') || el.querySelector?.('a[href*="/playlist?list=WL"]')) return false;
            return Boolean(el.closest(POPUP_MENU_CONTAINER_SELECTOR));
          });

          if (!items.length) return;

          let targetItem = null;
          let insertMode = 'after'; // 'after' or 'before'

          for (const it of items) {
            const label = (it.getAttribute('aria-label') || it.textContent || '').slice(0, 60).trim();
            if (CONFIG.savePattern.test(label)) {
              targetItem = it;
              insertMode = 'after';
              break;
            }
          }
          if (!targetItem) {
            for (const it of items) {
              const label = (it.getAttribute('aria-label') || it.textContent || '').slice(0, 60).trim();
              if (CONFIG.downloadPattern.test(label)) {
                targetItem = it;
                insertMode = 'before';
                break;
              }
            }
          }
          if (!targetItem) {
            for (const it of items) {
              const label = (it.getAttribute('aria-label') || it.textContent || '').slice(0, 60).trim();
              if (CONFIG.watchLaterPattern.test(label)) {
                targetItem = it;
                insertMode = 'after';
                break;
              }
            }
          }

          if (targetItem) {
            clearInterval(menuPollTimer);
            injectMenuItem(targetItem, insertMode, { videoId, title });
          }
        }, 60);
      },
      true
    );
  }

  function injectMenuItem(targetSibling, mode, ctx) {
    if (!targetSibling) return;
    if (
      targetSibling.closest?.(GUIDE_SIDEBAR_SELECTOR) ||
      targetSibling.closest?.('a[href]') ||
      !targetSibling.closest?.(POPUP_MENU_CONTAINER_SELECTOR)
    ) {
      return;
    }
    const parent = targetSibling.parentNode;
    if (!parent) return;

    // Remove existing injected items in this menu
    const existing = parent.querySelectorAll('[data-ytais-item]');
    for (const ex of existing) ex.remove();

    const item = h(
      'div',
      {
        role: 'menuitem',
        className: 'ytd-menu-service-item-renderer yt-ai-menu-item',
        'data-ytais-item': 'true',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: CONFIG.menuFontSize,
          fontWeight: '500',
          minHeight: `${CONFIG.menuMinHeight}px`,
          padding: '0 16px',
          cursor: 'pointer',
          color: 'var(--yt-spec-text-primary, #f1f1f1)',
          userSelect: 'none'
        },
        onmouseenter: () => {
          item.style.backgroundColor = 'var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1))';
        },
        onmouseleave: () => {
          item.style.backgroundColor = 'transparent';
        },
        onclick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Close flyout
          const active = document.activeElement;
          if (active) {
            active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
          }
          document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true }));
          setTimeout(() => {
            document.body.click();
            openForVideo(ctx);
          }, 150);
        }
      },
      iconSparkle(26),
      h('span', {}, CONFIG.menuLabel)
    );

    if (mode === 'before') {
      parent.insertBefore(item, targetSibling);
    } else {
      parent.insertBefore(item, targetSibling.nextSibling);
    }
  }

  // --- ALTERNATIVE TITLES FOR FEED THUMBNAILS (§16) ---
  function isMusicVideo(cardEl, title = '', channel = '') {
    const t = (title || '').toLowerCase();
    const ch = (channel || '').toLowerCase();

    // Check common music cues and patterns in titles
    const musicPatterns = [
      /official\s*(music\s*)?video/i,
      /official\s*audio/i,
      /official\s*lyric\s*video/i,
      /\(lyric\s*video\)/i,
      /\[official\s*video\]/i,
      /\[mv\]|\(mv\)/i,
      /\[music\s*video\]/i,
      /\b(ft\.|feat\.)\b/i,
      /\bvevo\b/i,
      /\b(remix|acoustic\s*version|live\s*performance)\b/i,
      /\b(full\s*album|soundtrack|ost)\b/i
    ];
    if (musicPatterns.some((p) => p.test(t))) return true;

    // Check channel naming and artist branding
    if (ch.endsWith('- topic') || ch.includes('vevo') || ch.endsWith('records') || ch.endsWith('music')) {
      return true;
    }

    // Check badges or metadata within the YouTube card
    if (cardEl) {
      if (cardEl.closest && cardEl.closest('ytd-rich-shelf-renderer[is-music], ytd-music-carousel-shelf-renderer')) {
        return true;
      }
      const badge = cardEl.querySelector && cardEl.querySelector(
        'ytd-badge-supported-renderer, .badge-style-type-simple, [aria-label*="Official Artist" i], [aria-label*="Music" i]'
      );
      if (badge) {
        const badgeText = (badge.getAttribute('aria-label') || badge.textContent || '').toLowerCase();
        if (badgeText.includes('official artist') || badgeText.includes('music')) return true;
      }
    }
    return false;
  }

  const altTitleInFlight = new Map();
  const modelCooldowns = new Map();

  function computeDecorrelatedJitterDelay(prevDelayMs, baseMs = 2000, maxMs = 60000, retryAfterMs = 0) {
    const safeBase = Math.max(250, baseMs);
    const safePrev = Math.max(safeBase, prevDelayMs || safeBase);
    const safeMax = Math.max(safeBase, maxMs);
    const upper = Math.min(safeMax, safePrev * 3);
    const jittered = Math.round(safeBase + Math.random() * Math.max(0, upper - safeBase));
    if (retryAfterMs > 0) {
      return Math.min(safeMax, Math.max(jittered, Math.round(retryAfterMs)));
    }
    return jittered;
  }

  function isModelInCooldown(model) {
    const entry = modelCooldowns.get(model);
    if (!entry) return false;
    if (Date.now() >= entry.until) {
      modelCooldowns.delete(model);
      return false;
    }
    return true;
  }

  function recordModelCooldown(model, err) {
    const prev = modelCooldowns.get(model);
    const delayMs = computeDecorrelatedJitterDelay(prev?.delayMs || 2000, 2000, 60000, err?.retryMs || 0);
    modelCooldowns.set(model, { until: Date.now() + delayMs, delayMs, lastError: err?.message || String(err?.status || '') });
    return delayMs;
  }

  const altTitleLimiter = new AskSemaphore(2);

  function getOrderedKeysForAltTitles() {
    const stored = getStoredKeys();
    const lastId = getLastKeyId();
    if (!lastId) return stored;
    const primary = stored.filter((k) => k && k.id === lastId);
    const rest = stored.filter((k) => k && k.id !== lastId);
    return [...primary, ...rest];
  }

  function getCachedSummaryTextForAltTitle(videoId) {
    if (!videoId) return '';
    const personas = [];
    const activePersona = getDefaultSummaryPersona();
    if (activePersona) personas.push(activePersona);
    if (!personas.includes('executive')) personas.push('executive');
    for (const p of personas) {
      for (const src of ['video', 'text']) {
        const cached = readCache(videoId, 'summary', src, true, p);
        if (cached && typeof cached.text === 'string' && cached.text.trim().length >= 25) {
          return cached.text.trim();
        }
      }
    }
    return '';
  }

  async function generateAlternativeTitle(videoId, originalTitle = '') {
    if (!videoId) return null;
    const cached = getCachedAltTitle(videoId);
    if (cached) return cached;
    if (altTitleInFlight.has(videoId)) return altTitleInFlight.get(videoId);

    const preTx =
      transcriptCache.get(videoId) ||
      (typeof window !== 'undefined' && window.__yt_mock_transcripts?.[videoId]) ||
      '';
    if (preTx && !transcriptCache.has(videoId)) {
      transcriptCache.set(videoId, preTx);
    }
    const preOrderedKeys = getOrderedKeysForAltTitles().filter((k) => k && k.key);
    const preCachedSummary = !preTx || preTx.trim().length < 15 ? getCachedSummaryTextForAltTitle(videoId) : '';
    const hasPreLocalSource = Boolean((preTx && preTx.trim().length >= 15) || preCachedSummary);

    // Pure offline extraction needs zero network calls — never stall behind network semaphore slots
    if (preOrderedKeys.length === 0 && hasPreLocalSource) {
      altTitleFailureReasons.delete(videoId);
      const sourceText = preTx && preTx.trim().length >= 15 ? preTx : preCachedSummary;
      let offlineTitle = extractDescriptiveTitleFromTranscript(sourceText)
        .replace(/^["'#*`]+|["'#*`]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (offlineTitle.length > 150) {
        offlineTitle = offlineTitle.slice(0, 147).trim() + '...';
      }
      const cleanOrig = String(originalTitle || '').replace(/\s+/g, ' ').trim();
      if (offlineTitle && offlineTitle.length >= 5 && (!cleanOrig || offlineTitle.toLowerCase() !== cleanOrig.toLowerCase())) {
        setCachedAltTitle(videoId, offlineTitle);
        return offlineTitle;
      }
      altTitleFailureReasons.set(
        videoId,
        offlineTitle && cleanOrig && offlineTitle.toLowerCase() === cleanOrig.toLowerCase() ? 'same_as_original' : 'no_key'
      );
      return null;
    }

    const task = (async () => {
      await altTitleLimiter.acquire();
      try {
        altTitleFailureReasons.delete(videoId);
        let tx = transcriptCache.get(videoId) || '';
        if (!tx && typeof window !== 'undefined' && window.__yt_mock_transcripts?.[videoId]) {
          tx = window.__yt_mock_transcripts[videoId];
          transcriptCache.set(videoId, tx);
        }

        const orderedKeys = getOrderedKeysForAltTitles().filter((k) => k && k.key);
        const primaryKeyObj = orderedKeys[0] || null;
        let cachedSummaryText = !tx || tx.trim().length < 15 ? getCachedSummaryTextForAltTitle(videoId) : '';

        if ((!tx || tx.trim().length < 15) && !cachedSummaryText) {
          try {
            // Never spawn hidden /watch iframes for background feed cards (prevents multi-video autoplay audio)
            tx = (await getTranscriptText(videoId, 0, null, { allowIframeFallback: false })) || '';
          } catch (_) {
            tx = '';
          }
        }

        const hasTranscript = Boolean(tx && tx.trim().length >= 15);
        if (!hasTranscript && !cachedSummaryText) {
          cachedSummaryText = getCachedSummaryTextForAltTitle(videoId);
        }
        const watchMeta = watchMetadataCache.get(videoId) || null;
        const hasDescription = Boolean(watchMeta && isMeaningfulDescriptionForTitle(watchMeta.shortDescription));
        const hasUsableOfflineText = Boolean(
          (hasTranscript && extractDescriptiveTitleFromTranscript(tx)) ||
          (cachedSummaryText && extractDescriptiveTitleFromTranscript(cachedSummaryText))
        );

        let reqParts = null;
        let useVideoFileData = false;
        const metaHeaderLines = [
          watchMeta?.author ? `Channel: "${watchMeta.author}"` : '',
          watchMeta?.keywords?.length ? `Topics: ${watchMeta.keywords.slice(0, 8).join(', ')}` : ''
        ]
          .filter(Boolean)
          .join('\n');

        if (hasTranscript && (primaryKeyObj?.key || hasUsableOfflineText)) {
          const cleanTx = stripSponsorAndPromoFromText(tx) || tx;
          const cleanDesc = hasDescription ? (stripSponsorAndPromoFromText(watchMeta.shortDescription) || watchMeta.shortDescription) : '';
          const descSnippet = hasDescription ? `\nVIDEO DESCRIPTION:\n"""\n${cleanDesc.slice(0, 1500)}\n"""` : '';
          reqParts = [
            {
              text: `You are a factual, concise video title generator. Given this YouTube video transcript${hasDescription ? ' and description' : ''}, create a single alternative title that:
1. Eliminates all clickbait, hyperbole, sensationalism, and curiosity gaps.
2. Is highly descriptive and factual, summarizing as much of the core subject and key takeaway as possible.
3. EXCLUDES all sponsors, paid promotions/collaborations, merch plugs, Patreon/channel memberships, affiliate links, and promo/discount codes.
4. Is strictly 150 characters or fewer and outputs ONLY the plain title text with no markdown, quotes, or brackets.

Original Title: "${originalTitle || watchMeta?.title || ''}"
${metaHeaderLines ? metaHeaderLines + '\n' : ''}TRANSCRIPT:
"""
${cleanTx.slice(0, 15000)}
"""${descSnippet}`
            }
          ];
        } else if (cachedSummaryText) {
          const cleanSum = stripSponsorAndPromoFromText(cachedSummaryText) || cachedSummaryText;
          reqParts = [
            {
              text: `You are a factual, concise video title generator. Given this video summary, create a single plain alternative title (<= 150 chars, zero clickbait, no markdown or quotes) capturing the exact core subject and takeaway while EXCLUDING sponsors, paid collaborations, merch, Patreon, and self-promotion.

Original Title: "${originalTitle || watchMeta?.title || ''}"
SUMMARY:
"""
${cleanSum.slice(0, 6000)}
"""`
            }
          ];
        } else if (hasDescription && primaryKeyObj?.key) {
          const cleanDesc = stripSponsorAndPromoFromText(watchMeta.shortDescription) || watchMeta.shortDescription;
          reqParts = [
            {
              text: `You are a factual, concise video title generator. Given this YouTube video title and description, create a single alternative title that:
1. Eliminates all clickbait, hyperbole, sensationalism, and curiosity gaps.
2. Is highly descriptive and factual, summarizing the concrete subject matter.
3. EXCLUDES all sponsors, paid promotions/collaborations, merch plugs, Patreon/channel memberships, affiliate links, and promo/discount codes.
4. Is strictly 150 characters or fewer and outputs ONLY the plain title text with no markdown, quotes, or brackets.

Original Title: "${originalTitle || watchMeta?.title || ''}"
${metaHeaderLines ? metaHeaderLines + '\n' : ''}DESCRIPTION:
"""
${cleanDesc.slice(0, 4000)}
"""`
            }
          ];
        } else if (primaryKeyObj?.key) {
          useVideoFileData = true;
          reqParts = [
            { file_data: { file_uri: `https://www.youtube.com/watch?v=${videoId}` } },
            {
              text: `You are a factual, concise video title generator. Watch/inspect this YouTube video and write a single factual alternative title that:
1. Eliminates all clickbait, hyperbole, sensationalism, and curiosity gaps.
2. Summarizes the concrete topic and main takeaway accurately.
3. EXCLUDES all sponsors, paid promotions/collaborations, merch plugs, Patreon/channel memberships, affiliate links, and promo/discount codes.
4. Is strictly 150 characters or fewer and outputs ONLY the plain title text with no markdown, quotes, or brackets.

Original Title: "${originalTitle || watchMeta?.title || ''}"${metaHeaderLines ? '\n' + metaHeaderLines : ''}`
            }
          ];
        } else {
          altTitleFailureReasons.set(videoId, orderedKeys.length === 0 ? 'no_key' : 'no_captions');
          return null;
        }

        let generated = '';
        let generatedFromContent = false;
        let sawApiError = false;

        for (const keyObj of orderedKeys) {
          const availableModels = await checkModelsForKey(keyObj);
          const candidateModels = buildAltTitleModelCandidates({
            factPreferred: CONFIG.factPreferred,
            fallbackLadder: CONFIG.fallbackLadder,
            textModels: CONFIG.textModels,
            availableModels
          });

          let keyRejected = false;
          for (const candidateModel of candidateModels) {
            if (isModelInCooldown(candidateModel)) continue;

            let dropThinkConfig = false;
            let dropMediaRes = false;
            for (let compatTry = 0; compatTry < 3; compatTry++) {
              const genConfig = {
                temperature: 0.2,
                maxOutputTokens: dropThinkConfig ? 1024 : 512
              };
              if (!dropThinkConfig) {
                genConfig.thinkingConfig = { thinkingBudget: 0 };
              }
              if (useVideoFileData && !dropMediaRes) {
                genConfig.mediaResolution = 'MEDIA_RESOLUTION_LOW';
              }
              const body = {
                contents: [{ role: 'user', parts: reqParts }],
                generationConfig: genConfig
              };

              try {
                const data = await callGeminiRaw(candidateModel, keyObj.key, body, useVideoFileData ? 25000 : 15000);
                const parts = data.candidates?.[0]?.content?.parts || [];
                const candidate = extractGeminiNonThoughtText(parts);
                generated = candidate.replace(/^["'`]+|["'`]+$/g, '').trim();
                generatedFromContent = Boolean(generated && generated.length >= 5);
                if (generatedFromContent) break;
                // Empty non-thought response when model emitted thinking-only parts: retry once without thinkingConfig/larger token budget
                if (!dropThinkConfig && parts.some((p) => p && p.thought)) {
                  dropThinkConfig = true;
                  continue;
                }
                break;
              } catch (apiErr) {
                const errMsg = String(apiErr?.message || '');
                const combinedErr = (errMsg + ' ' + String(apiErr?.raw || '')).toLowerCase();
                if (apiErr?.code === 'NO_KEY' || apiErr?.status === 401 || /api key not valid/i.test(errMsg)) {
                  keyRejected = true;
                  break;
                }
                if (apiErr?.status === 400 && !dropThinkConfig && (combinedErr.includes('think') || combinedErr.includes('budget'))) {
                  dropThinkConfig = true;
                  continue;
                }
                if (apiErr?.status === 400 && !dropMediaRes && (combinedErr.includes('resolution') || combinedErr.includes('media'))) {
                  dropMediaRes = true;
                  continue;
                }
                sawApiError = true;
                if (apiErr?.status === 429 || apiErr?.status === 503 || apiErr?.status === 404) {
                  recordModelCooldown(candidateModel, apiErr);
                }
                if (CONFIG.debug) {
                  console.warn(`[YTAIS] Alt-title on ${candidateModel} failed, trying next model on ladder:`, errMsg || apiErr);
                }
                break;
              }
            }

            if (generatedFromContent || keyRejected) break;
          }

          if (generatedFromContent) break;
        }

        const usedOfflineNoKeyFallback = !primaryKeyObj?.key;
        if (!generatedFromContent && (hasTranscript || cachedSummaryText)) {
          // Offline / no-key OR all-API-models failed: extract descriptive key takeaways from transcript or cached summary
          const extracted = extractDescriptiveTitleFromTranscript(hasTranscript ? tx : cachedSummaryText);
          if (extracted) {
            generated = extracted;
            generatedFromContent = true;
          }
        }

        generated = generated.replace(/^["'#*`]+|["'#*`]+$/g, '').replace(/\s+/g, ' ').trim();
        if (generated.length > 150) {
          generated = generated.slice(0, 147).trim() + '...';
        }

        const cleanOrig = String(originalTitle || '').replace(/\s+/g, ' ').trim();
        if (generatedFromContent && generated && generated.length >= 5 && (!cleanOrig || generated.toLowerCase() !== cleanOrig.toLowerCase())) {
          // Always cache AI-generated titles or offline no-key titles; avoid persisting transient API failure fallbacks over good future API runs
          if (usedOfflineNoKeyFallback || primaryKeyObj?.key) {
            setCachedAltTitle(videoId, generated);
          }
          altTitleFailureReasons.delete(videoId);
          return generated;
        }

        if (generatedFromContent && cleanOrig && generated.toLowerCase() === cleanOrig.toLowerCase()) {
          altTitleFailureReasons.set(videoId, 'same_as_original');
        } else if (sawApiError) {
          altTitleFailureReasons.set(videoId, 'api_error');
        } else {
          altTitleFailureReasons.set(videoId, primaryKeyObj?.key ? 'no_captions' : 'no_key');
        }
      } catch (err) {
        altTitleFailureReasons.set(videoId, 'api_error');
        if (CONFIG.debug) console.warn('[YTAIS] Failed to generate alternative title for', videoId, err);
      } finally {
        altTitleLimiter.release();
      }
      return null;
    })();

    altTitleInFlight.set(videoId, task);
    try {
      return await task;
    } finally {
      altTitleInFlight.delete(videoId);
    }
  }

  function getCardVideoId(card) {
    if (!card) return null;
    const links = card.querySelectorAll(
      'a#video-title-link, a#video-title, a[href*="/watch?v="], a[href*="/shorts/"], a[href*="/live/"], a#thumbnail, a.yt-lockup-metadata-view-model__title'
    );
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const watchMatch = /[?&]v=([a-zA-Z0-9_-]{8,32})/.exec(href);
      if (watchMatch) return watchMatch[1];
      const shortsMatch = /\/shorts\/([a-zA-Z0-9_-]{8,32})(?:[?&#/]|$)/.exec(href);
      if (shortsMatch) return shortsMatch[1];
      const liveMatch = /\/live\/([a-zA-Z0-9_-]{8,32})(?:[?&#/]|$)/.exec(href);
      if (liveMatch) return liveMatch[1];
    }
    return null;
  }

  function isNestedFeedCard(card) {
    if (!card || !card.tagName || !card.parentElement) return false;
    const tag = card.tagName.toLowerCase();
    if (tag !== 'yt-lockup-view-model') return false;
    const parentCard = card.parentElement.closest(
      'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer'
    );
    if (!parentCard) return false;
    const myId = getCardVideoId(card);
    const parentId = getCardVideoId(parentCard);
    return !myId || !parentId || myId === parentId;
  }

  function getCanonicalFeedCard(el) {
    if (!el || typeof el.closest !== 'function') return null;
    const matched = el.closest(FEED_CARD_SELECTOR);
    if (!matched) return null;
    if (matched.tagName?.toLowerCase() === 'yt-lockup-view-model' && matched.parentElement) {
      const parentCard = matched.parentElement.closest(
        'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer'
      );
      if (parentCard) {
        const innerId = getCardVideoId(matched);
        const outerId = getCardVideoId(parentCard);
        if (!innerId || !outerId || innerId === outerId) {
          return parentCard;
        }
      }
    }
    return matched;
  }

  function getCardTitleElement(card) {
    if (!card) return null;
    return (
      card.querySelector('#video-title') ||
      card.querySelector('.yt-lockup-metadata-view-model__title a') ||
      card.querySelector('.yt-lockup-metadata-view-model__title') ||
      card.querySelector('a#video-title-link') ||
      card.querySelector('h3 a') ||
      card.querySelector('h3')
    );
  }

  function getTitleTextTarget(titleEl) {
    if (!titleEl) return null;
    const nested = titleEl.querySelector(
      'yt-formatted-string, yt-attributed-string, .yt-core-attributed-string, span#video-title'
    );
    if (nested && !nested.closest('.yt-alt-title-btn, .cbTitleButtonContainer, .dearrow-title-container')) {
      const deeper = nested.querySelector('yt-attributed-string, .yt-core-attributed-string');
      if (deeper && !deeper.closest('.yt-alt-title-btn, .cbTitleButtonContainer, .dearrow-title-container')) {
        return deeper;
      }
      if (
        nested.tagName?.toLowerCase() === 'yt-formatted-string' &&
        nested.children?.length === 1 &&
        nested.children[0].tagName?.toLowerCase() === 'span'
      ) {
        const hasLooseNonEmptyText = Array.from(nested.childNodes || []).some(
          (n) => n.nodeType === 3 && n.textContent && n.textContent.trim().length > 0
        );
        if (!hasLooseNonEmptyText) {
          return nested.children[0];
        }
      }
      return nested;
    }
    if (
      titleEl.tagName?.toLowerCase() === 'yt-formatted-string' &&
      titleEl.children?.length === 1 &&
      titleEl.children[0].tagName?.toLowerCase() === 'span'
    ) {
      const hasLooseNonEmptyText = Array.from(titleEl.childNodes || []).some(
        (n) => n.nodeType === 3 && n.textContent && n.textContent.trim().length > 0
      );
      if (!hasLooseNonEmptyText) {
        return titleEl.children[0];
      }
    }
    if (titleEl.tagName?.toLowerCase() === 'a') return titleEl;
    const a = titleEl.querySelector('a');
    if (a) {
      const innerInA = a.querySelector('yt-formatted-string, yt-attributed-string, .yt-core-attributed-string');
      return innerInA || a;
    }
    return titleEl;
  }

  function getVisibleElementText(el) {
    if (!el) return '';
    let out = '';
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === 3) {
        out += node.textContent || '';
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName?.toLowerCase() || '';
      if (
        tag === 'template' ||
        tag === 'style' ||
        tag === 'script' ||
        tag === 'tp-yt-paper-tooltip' ||
        node.hasAttribute?.('hidden') ||
        node.getAttribute?.('aria-hidden') === 'true'
      ) {
        return;
      }
      const cl = node.classList;
      if (
        cl &&
        (cl.contains('yt-alt-title-btn') ||
          cl.contains('yt-channel-rule-btn') ||
          cl.contains('yt-channel-rule-menu') ||
          cl.contains('yt-music-exempt-icon') ||
          cl.contains('cbTitleButtonContainer') ||
          cl.contains('dearrow-title-container'))
      ) {
        return;
      }
      const children = node.childNodes;
      if (children && children.length > 0) {
        for (let i = 0; i < children.length; i++) walk(children[i]);
      }
    };
    walk(el);
    return out.replace(/\s+/g, ' ').trim();
  }

  function getTitleCleanText(titleEl) {
    const target = getTitleTextTarget(titleEl);
    const raw = getVisibleElementText(target) || getVisibleElementText(titleEl) || (target?.textContent || titleEl?.textContent || '').trim();
    return dedupeAdjacentTitleDuplicate(raw);
  }

  function getCardChannelName(card) {
    if (!card) return '';
    const chEl = card.querySelector(
      '#channel-name, .ytd-channel-name, [id="text"][title], .yt-lockup-metadata-view-model__sub-title, #metadata #text'
    );
    const direct = chEl ? (chEl.getAttribute('title') || chEl.textContent || '').trim() : '';
    if (direct) return direct;

    // Modern yt-lockup-view-model renders channel link inside yt-content-metadata-view-model
    const modernLinks = card.querySelectorAll(
      'yt-content-metadata-view-model a, .yt-content-metadata-view-model__metadata-row a'
    );
    for (const a of modernLinks) {
      const txt = (a.getAttribute('title') || a.textContent || '').trim();
      if (txt && !/^[\d.,]+\s*[KMB]?\s*(?:views?|watching)$/i.test(txt)) {
        return txt;
      }
    }
    const modernRows = card.querySelectorAll(
      'yt-content-metadata-view-model .yt-content-metadata-view-model__metadata-text, yt-content-metadata-view-model .yt-core-attributed-string'
    );
    for (const node of modernRows) {
      const txt = (node.textContent || '').trim();
      if (
        txt &&
        txt.length >= 2 &&
        txt.length <= 80 &&
        !/^\d[\d.,]*\s*[KMB]?\s*(?:views?|watching)/i.test(txt) &&
        !/^\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago$/i.test(txt) &&
        !/^(?:Streamed|Premiered)\s+/i.test(txt) &&
        !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(txt)
      ) {
        return txt;
      }
    }
    return '';
  }

  function getCardButtonMountAnchor(titleEl, card) {
    if (!titleEl) return null;
    const wrappingAnchor = typeof titleEl.closest === 'function' ? titleEl.closest('a') : null;
    if (wrappingAnchor && wrappingAnchor !== card && wrappingAnchor.parentElement) {
      return wrappingAnchor;
    }
    return titleEl;
  }

  function getDeArrowTitleContainer(card, titleEl) {
    if (!card) return null;
    const mountAnchor = getCardButtonMountAnchor(titleEl, card) || titleEl;
    return (
      card.querySelector('.cbTitleButtonContainer, .dearrow-title-container, [class*="cbTitleButton"], [data-dearrow-title], .dearrow-title-button') ||
      (titleEl && titleEl.parentElement ? titleEl.parentElement.querySelector('.cbTitleButtonContainer, .dearrow-title-container, [class*="cbTitleButton"]') : null) ||
      (mountAnchor && mountAnchor.parentElement ? mountAnchor.parentElement.querySelector('.cbTitleButtonContainer, .dearrow-title-container, [class*="cbTitleButton"]') : null)
    );
  }

  function isDeArrowPresent(card, titleEl) {
    if (!card) return false;
    // Strictly scope DeArrow title detection to THIS card/titleEl (never global document/window or thumbnail-only buttons)
    const titleContainer = getDeArrowTitleContainer(card, titleEl);
    if (titleContainer) return true;
    const cardLevelTitleMarker = card.querySelector(
      '[data-dearrow-title], .dearrow-title, [data-dearrow]:not(.cbThumbnailButtonContainer)'
    );
    return Boolean(
      cardLevelTitleMarker ||
      card.hasAttribute('data-dearrow') ||
      card.hasAttribute('data-dearrow-title') ||
      card.dataset?.ytaisDearrow === 'true' ||
      (titleEl && (
        titleEl.hasAttribute('data-dearrow') ||
        titleEl.dataset?.dearrow ||
        titleEl.hasAttribute('data-dearrow-title') ||
        titleEl.classList.contains('dearrow-title')
      ))
    );
  }

  function syncDeArrowState(card) {
    if (!card || card._ytaisMutatingTitle || card.dataset.ytaisMusicExempt === 'true') return;
    const titleEl = getCardTitleElement(card);
    if (!titleEl) return;
    const mountAnchor = getCardButtonMountAnchor(titleEl, card) || titleEl;
    const btnParent = mountAnchor.parentElement;
    if (!btnParent) return;

    // If Polymer bound channel name lazily after initial scan, inject .yt-channel-rule-btn now
    if (!card.dataset.ytaisChannelName) {
      const lateChannel = getCardChannelName(card);
      if (lateChannel) {
        card.dataset.ytaisChannelName = lateChannel;
        const switchBtn = card.querySelector('.yt-alt-title-btn');
        if (switchBtn && !card.querySelector('.yt-channel-rule-btn')) {
          const decision = resolveAutoTitleDecision({
            altTitlesEnabled: getAltTitlesEnabled(),
            altTitleMode: getAltTitleMode(),
            isMusic: false,
            hasDeArrowTitle: card.dataset.ytaisDearrow === 'true',
            channelName: lateChannel,
            channelRules: getChannelTitleRules(),
            manualOverride: null
          });
          card.dataset.ytaisChannelRule = decision.rule;
          const ruleBtn = h('button', {
            type: 'button',
            className: 'yt-channel-rule-btn default',
            'data-video-id': card.dataset.ytaisVideoId || '',
            'data-channel': lateChannel,
            onmousedown: (e) => e.stopPropagation(),
            onpointerdown: (e) => e.stopPropagation(),
            onclick: (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
              openChannelRuleMenu(card, ruleBtn, lateChannel);
            }
          });
          updateChannelRuleButtonUI(ruleBtn, decision.rule, lateChannel);
          switchBtn.insertAdjacentElement('afterend', ruleBtn);
        }
      }
    }

    const dearrowContainer = getDeArrowTitleContainer(card, titleEl);
    const dearrowNowPresent = Boolean(dearrowContainer || isDeArrowPresent(card, titleEl));

    if (dearrowNowPresent) {
      const wasDeArrow = card.dataset.ytaisDearrow === 'true';
      card.dataset.ytaisDearrow = 'true';

      const attrDeArrowTitle = (
        card.getAttribute('data-dearrow-title') ||
        titleEl?.getAttribute('data-dearrow-title') ||
        dearrowContainer?.getAttribute?.('data-dearrow-title') ||
        ''
      ).trim();
      const currentTitleText = getTitleCleanText(titleEl);
      if (attrDeArrowTitle && attrDeArrowTitle !== 'true') {
        card._dearrowTitle = attrDeArrowTitle;
      } else if (currentTitleText && currentTitleText !== card._aiTitle) {
        if (!card._dearrowTitle || currentTitleText !== card._originalTitle) {
          card._dearrowTitle = currentTitleText;
        }
      }

      const switchBtn = card.querySelector('.yt-alt-title-btn');
      if (switchBtn) {
        // Ensure switchBtn sits cleanly outside <a> and after dearrowContainer without colliding or nesting inside it
        if (dearrowContainer && dearrowContainer.parentElement === btnParent) {
          if (switchBtn.nextSibling === dearrowContainer || switchBtn.parentElement === dearrowContainer) {
            if (dearrowContainer.nextSibling) {
              btnParent.insertBefore(switchBtn, dearrowContainer.nextSibling);
            } else {
              btnParent.appendChild(switchBtn);
            }
          }
        }

        if ((!wasDeArrow && card._currentTitleMode === 'original') ||
            (!card._userChoseAi && currentTitleText && currentTitleText !== card._aiTitle && card._currentTitleMode === 'ai')) {
          card._currentTitleMode = 'dearrow';
          updateSwitchButtonUI(switchBtn, 'dearrow', true);
        } else {
          updateSwitchButtonUI(switchBtn, card._currentTitleMode || 'dearrow', true);
        }
      }
    } else {
      const target = getTitleTextTarget(titleEl) || titleEl;
      const rawVisible = getVisibleElementText(target);
      const deduped = dedupeAdjacentTitleDuplicate(rawVisible);
      if (rawVisible && deduped && deduped !== rawVisible) {
        setCardTitleText(card, titleEl, deduped);
      }
    }
  }

  function resetRecycledFeedCardState(card) {
    if (!card) return;
    const oldTitleEl = getCardTitleElement(card);
    if (oldTitleEl?.title && oldTitleEl.title.startsWith('[AI Summary Title]')) {
      oldTitleEl.removeAttribute('title');
    }
    delete card._originalTitle;
    delete card._aiTitle;
    delete card._dearrowTitle;
    delete card._currentTitleMode;
    delete card._userManualOriginal;
    delete card._userChoseAi;
    delete card._ytaisAutoFetchStarted;
    delete card.dataset.ytaisDearrow;
    delete card.dataset.ytaisMusicExempt;
    delete card.dataset.ytaisChannelRule;
    delete card.dataset.ytaisChannelName;
    delete card.dataset.ytaisProcessed;
    delete card.dataset.ytaisVideoId;
    card.querySelectorAll('.yt-alt-title-btn, .yt-channel-rule-btn, .yt-channel-rule-menu, .yt-music-exempt-icon').forEach((n) => n.remove());
  }

  function updateChannelRuleButtonUI(ruleBtn, rule, channelName) {
    if (!ruleBtn) return;
    const safeChannel = channelName || 'this channel';
    const nextTitle =
      rule === 'exempt'
        ? `Channel rule: Exempt "${safeChannel}" (keeps original / DeArrow titles)`
        : rule === 'force_ai'
          ? `Channel rule: Always AI titles for "${safeChannel}"`
          : `Channel auto-title rule for "${safeChannel}" (Default)`;
    if (ruleBtn.dataset?.ytaisRule === rule && ruleBtn.title === nextTitle && ruleBtn.firstChild) {
      return;
    }
    if (ruleBtn.dataset) ruleBtn.dataset.ytaisRule = rule;
    ruleBtn.className = `yt-channel-rule-btn ${rule === 'exempt' ? 'exempt' : rule === 'force_ai' ? 'force-ai' : 'default'}`;
    ruleBtn.title = nextTitle;
    ruleBtn.setAttribute('aria-label', nextTitle);
    clearEl(ruleBtn);
    ruleBtn.appendChild(iconShield(12));
    if (rule === 'exempt') {
      ruleBtn.appendChild(h('span', { className: 'yt-channel-rule-badge' }, 'Exempt'));
    } else if (rule === 'force_ai') {
      ruleBtn.appendChild(h('span', { className: 'yt-channel-rule-badge' }, 'Always AI'));
    }
  }

  function openChannelRuleMenu(card, anchorBtn, channelName) {
    document.querySelectorAll('.yt-channel-rule-menu').forEach((m) => m.remove());
    if (!card || !anchorBtn || !channelName) return;

    const rules = getChannelTitleRules();
    const key = normalizeChannelRuleKey(channelName);
    const currentRule = (key && rules[key]) || 'default';

    const menu = h('div', {
      className: 'yt-channel-rule-menu',
      'data-channel': channelName,
      onmousedown: (e) => e.stopPropagation(),
      onclick: (e) => e.stopPropagation()
    });

    const items = [
      { id: 'default', label: 'Default (Auto AI / Yield DeArrow)' },
      { id: 'exempt', label: `Exempt "${channelName.slice(0, 22)}"` },
      { id: 'force_ai', label: `Always AI for "${channelName.slice(0, 22)}"` }
    ];

    for (const item of items) {
      const btn = h(
        'button',
        {
          type: 'button',
          className: `yt-channel-rule-option ${currentRule === item.id ? 'active' : ''}`,
          'data-rule': item.id,
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            setChannelTitleRule(channelName, item.id);
            menu.remove();
            announceLive(`Channel rule for ${channelName} set to ${item.id}`);
          }
        },
        item.label
      );
      menu.appendChild(btn);
    }

    anchorBtn.insertAdjacentElement('afterend', menu);
    const closeMenu = (ev) => {
      if (!menu.contains(ev.target) && ev.target !== anchorBtn && !anchorBtn.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu, true);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu, true), 20);
  }

  function processFeedCard(card, scanContext = null) {
    if (!card || isNestedFeedCard(card)) return;
    ensureFeedStylesInjected();
    const videoId = getCardVideoId(card);
    if (!videoId) return;
    if (processedFeedCards.has(card) && card.dataset.ytaisVideoId === videoId) return;
    if (processedFeedCards.has(card) && card.dataset.ytaisVideoId !== videoId) {
      resetRecycledFeedCardState(card);
    }

    const titleEl = getCardTitleElement(card);
    if (!titleEl) return;

    const rawAttrTitle = titleEl.getAttribute('title') || titleEl.closest?.('h3[title]')?.getAttribute?.('title') || '';
    const originalTitle = dedupeAdjacentTitleDuplicate(rawAttrTitle || getTitleCleanText(titleEl));
    // Wait for Polymer to populate title text before marking card processed
    if (!originalTitle) return;

    const mountAnchor = getCardButtonMountAnchor(titleEl, card) || titleEl;
    const btnParent = mountAnchor.parentElement;
    if (!btnParent) return;

    processedFeedCards.add(card);
    card.dataset.ytaisProcessed = 'true';
    card.dataset.ytaisVideoId = videoId;

    const channelName = getCardChannelName(card);
    if (channelName) card.dataset.ytaisChannelName = channelName;
    card._originalTitle = originalTitle;

    // Check if music video (exempt from auto replacement; clicking icon manually generates/toggles AI title)
    const isMusic = isMusicVideo(card, originalTitle, channelName);
    if (isMusic) {
      card.dataset.ytaisMusicExempt = 'true';
      card._currentTitleMode = 'original';
      if (!card.querySelector('.yt-music-exempt-icon')) {
        const musicBadge = h(
          'button',
          {
            type: 'button',
            className: 'yt-music-exempt-icon',
            'data-video-id': videoId,
            'aria-label': 'Music video — click to generate AI summary title',
            title: 'Music video (exempt from title replacement) — Click to manually generate AI summary title',
            onmousedown: (e) => e.stopPropagation(),
            onpointerdown: (e) => e.stopPropagation(),
            onclick: async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
              await toggleCardTitle(card, true);
            }
          },
          iconMusic(14)
        );
        if (mountAnchor.nextSibling) {
          btnParent.insertBefore(musicBadge, mountAnchor.nextSibling);
        } else {
          btnParent.appendChild(musicBadge);
        }
      }
      return;
    }

    const dearrowContainer = getDeArrowTitleContainer(card, titleEl);
    const deArrowActive = Boolean(dearrowContainer || isDeArrowPresent(card, titleEl));
    if (deArrowActive) {
      card._dearrowTitle = getTitleCleanText(titleEl) || originalTitle;
      card.dataset.ytaisDearrow = 'true';
    }

    const altTitleMode =
      scanContext && scanContext.altTitleMode
        ? scanContext.altTitleMode
        : getAltTitleMode();
    const altEnabled =
      scanContext && typeof scanContext.altTitlesEnabled === 'boolean'
        ? scanContext.altTitlesEnabled
        : altTitleMode === 'on';
    const channelRules =
      scanContext && scanContext.channelRules ? scanContext.channelRules : getChannelTitleRules();

    const decision = resolveAutoTitleDecision({
      altTitlesEnabled: altEnabled,
      altTitleMode,
      isMusic,
      hasDeArrowTitle: deArrowActive,
      channelName,
      channelRules,
      manualOverride: null
    });
    // Button mode MUST reflect what is currently visible in DOM (never claim 'ai' until AI title actually applies!)
    const initialDisplayMode = deArrowActive ? 'dearrow' : 'original';
    card._currentTitleMode = initialDisplayMode;
    card.dataset.ytaisChannelRule = decision.rule;

    let switchBtn = card.querySelector('.yt-alt-title-btn');
    if (!switchBtn) {
      switchBtn = h(
        'button',
        {
          type: 'button',
          className: 'yt-alt-title-btn',
          'data-video-id': videoId,
          'aria-label': 'Toggle alternative title',
          onmousedown: (e) => e.stopPropagation(),
          onpointerdown: (e) => e.stopPropagation(),
          onclick: async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            toggleCardTitle(card);
          }
        }
      );
      updateSwitchButtonUI(switchBtn, initialDisplayMode, deArrowActive);

      // Safe insertion outside <a> & without clashing with DeArrow's injected container
      if (dearrowContainer && dearrowContainer.parentElement === btnParent) {
        if (dearrowContainer.nextSibling) {
          btnParent.insertBefore(switchBtn, dearrowContainer.nextSibling);
        } else {
          btnParent.appendChild(switchBtn);
        }
      } else if (mountAnchor.nextSibling) {
        if (mountAnchor.nextSibling === dearrowContainer && dearrowContainer?.nextSibling) {
          btnParent.insertBefore(switchBtn, dearrowContainer.nextSibling);
        } else if (mountAnchor.nextSibling === dearrowContainer) {
          btnParent.appendChild(switchBtn);
        } else {
          btnParent.insertBefore(switchBtn, mountAnchor.nextSibling);
        }
      } else {
        btnParent.appendChild(switchBtn);
      }
    }

    if (channelName && !card.querySelector('.yt-channel-rule-btn')) {
      const ruleBtn = h('button', {
        type: 'button',
        className: 'yt-channel-rule-btn default',
        'data-video-id': videoId,
        'data-channel': channelName,
        onmousedown: (e) => e.stopPropagation(),
        onpointerdown: (e) => e.stopPropagation(),
        onclick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          openChannelRuleMenu(card, ruleBtn, channelName);
        }
      });
      updateChannelRuleButtonUI(ruleBtn, decision.rule, channelName);
      switchBtn.insertAdjacentElement('afterend', ruleBtn);
    }

    if (decision.shouldAutoFetchAi) {
      const hasCached = Boolean(card._aiTitle || getCachedAltTitle(videoId));
      const hasTxOrMock = Boolean(
        transcriptCache.has(videoId) || (typeof window !== 'undefined' && window.__yt_mock_transcripts?.[videoId])
      );
      const isExplicit = !scanContext || !scanContext.fromBackgroundScan;
      const fetchGate = shouldDeferBackgroundAltTitleFetch({
        isExplicitCall: isExplicit,
        hasCachedAltTitle: hasCached,
        hasTranscriptInMemoryOrMock: hasTxOrMock,
        pageLoadSettled,
        isIntersectingViewport: scanContext?.isIntersectingViewport
      });

      if (fetchGate.action === 'fetch_now') {
        card._ytaisAutoFetchStarted = true;
        applyAiTitleToCard(card, false, scanContext);
      } else if (fetchGate.action === 'defer_until_load') {
        deferredLoadCards.add(card);
        schedulePageLoadSettle();
      } else if (fetchGate.action === 'observe_visibility') {
        observeCardVisibility(card);
      }
    }
  }

  function updateSwitchButtonUI(switchBtn, mode, isDeArrow) {
    if (!switchBtn) return;
    const nextTitle =
      mode === 'ai'
        ? (isDeArrow
            ? 'Showing AI summary title (Click to switch to DeArrow title)'
            : 'Showing AI summary title (Click to switch to original title)')
        : mode === 'dearrow'
          ? 'Showing DeArrow title (Click to switch to AI summary title)'
          : 'Showing original title (Click to switch to AI summary title)';
    if (switchBtn.dataset?.ytaisBtnMode === mode && switchBtn.title === nextTitle && switchBtn.firstChild) {
      return;
    }
    if (switchBtn.dataset) switchBtn.dataset.ytaisBtnMode = mode;
    clearEl(switchBtn);
    if (mode === 'ai') {
      switchBtn.appendChild(iconSparkle(13));
      switchBtn.className = 'yt-alt-title-btn active';
    } else if (mode === 'dearrow') {
      switchBtn.appendChild(iconBolt(13));
      switchBtn.className = 'yt-alt-title-btn dearrow';
    } else {
      switchBtn.appendChild(iconDocument(13));
      switchBtn.className = 'yt-alt-title-btn original';
    }
    switchBtn.title = nextTitle;
  }

  function setCardTitleText(card, titleEl, newText) {
    if (!titleEl) return;
    const cleanText = dedupeAdjacentTitleDuplicate(newText);
    if (card) {
      card._ytaisMutatingTitle = true;
      card._ytaisSelfMutatedTs = Date.now();
    }
    try {
      const target = getTitleTextTarget(titleEl);
      if (target) {
        // Clean any sibling Polymer text nodes or duplicate sibling spans inside yt-formatted-string
        const fmtParent = target.parentElement;
        if (fmtParent && fmtParent.tagName?.toLowerCase() === 'yt-formatted-string') {
          for (const child of Array.from(fmtParent.childNodes || [])) {
            if (child === target) continue;
            if (child.nodeType === 3) {
              child.textContent = '';
            } else if (child.nodeType === 1) {
              const cl = child.classList;
              const isControl = Boolean(
                cl &&
                  (cl.contains('yt-alt-title-btn') ||
                    cl.contains('yt-channel-rule-btn') ||
                    cl.contains('yt-channel-rule-menu') ||
                    cl.contains('yt-music-exempt-icon') ||
                    cl.contains('cbTitleButtonContainer') ||
                    cl.contains('dearrow-title-container'))
              );
              if (!isControl) {
                child.textContent = '';
              }
            }
          }
        }
        if (target.childNodes?.length === 1 && target.firstChild?.nodeType === 3) {
          target.firstChild.nodeValue = cleanText;
        } else {
          target.textContent = cleanText;
        }
      } else {
        titleEl.textContent = cleanText;
      }
    } finally {
      if (card) {
        card._ytaisMutatingTitle = false;
        card._ytaisSelfMutatedTs = Date.now();
      }
    }
  }

  function revertCardToNonAiTitle(card, allowMusicManual = false) {
    if (!card || (card.dataset.ytaisMusicExempt === 'true' && !allowMusicManual)) return;
    const titleEl = getCardTitleElement(card);
    const switchBtn = card.querySelector('.yt-alt-title-btn');
    const musicIcon = card.querySelector('.yt-music-exempt-icon');
    if (!titleEl) return;
    const isDeArrow = Boolean(card.dataset.ytaisDearrow === 'true' || isDeArrowPresent(card, titleEl));
    if (isDeArrow) {
      card.dataset.ytaisDearrow = 'true';
      const attrDeArrow = (
        card.getAttribute('data-dearrow-title') ||
        titleEl?.getAttribute('data-dearrow-title') ||
        card.querySelector('[data-dearrow-title]')?.getAttribute('data-dearrow-title') ||
        ''
      ).trim();
      if (attrDeArrow && attrDeArrow !== 'true') {
        card._dearrowTitle = attrDeArrow;
      }
    }
    const revertTitle = dedupeAdjacentTitleDuplicate(
      isDeArrow ? (card._dearrowTitle || card._originalTitle) : card._originalTitle
    );
    const currentDisplayed = getTitleCleanText(titleEl);
    if (revertTitle && currentDisplayed !== revertTitle) {
      setCardTitleText(card, titleEl, revertTitle);
    }
    if (revertTitle && (!titleEl.title || titleEl.title.startsWith('[AI Summary Title]'))) {
      titleEl.title = revertTitle;
    }
    card._userChoseAi = false;
    card._currentTitleMode = isDeArrow ? 'dearrow' : 'original';
    if (switchBtn) {
      updateSwitchButtonUI(switchBtn, card._currentTitleMode, isDeArrow);
    }
    if (musicIcon) {
      musicIcon.classList.remove('active');
      musicIcon.title = 'Music video (exempt from title replacement) — Click to manually generate AI summary title';
    }
  }

  async function applyAiTitleToCard(card, forceManual = false, scanContext = null, allowMusicManual = false) {
    if (!card || (card.dataset.ytaisMusicExempt === 'true' && !allowMusicManual)) return;
    const videoId = card.dataset.ytaisVideoId;
    if (!videoId) return;

    const titleEl = getCardTitleElement(card);
    if (!titleEl) return;

    const channelName = card.dataset.ytaisChannelName || getCardChannelName(card);
    const isDeArrowCheck = Boolean(card.dataset.ytaisDearrow === 'true' || isDeArrowPresent(card, titleEl));
    const initAltMode =
      scanContext && scanContext.altTitleMode
        ? scanContext.altTitleMode
        : getAltTitleMode();
    const initAltEnabled =
      scanContext && typeof scanContext.altTitlesEnabled === 'boolean'
        ? scanContext.altTitlesEnabled
        : initAltMode === 'on';
    const initRules =
      scanContext && scanContext.channelRules ? scanContext.channelRules : getChannelTitleRules();

    const decision = resolveAutoTitleDecision({
      altTitlesEnabled: initAltEnabled,
      altTitleMode: initAltMode,
      isMusic: false,
      hasDeArrowTitle: isDeArrowCheck,
      channelName,
      channelRules: initRules,
      manualOverride: forceManual ? 'ai' : null
    });

    if (!forceManual) {
      if (!decision.shouldAutoFetchAi) {
        if (isDeArrowCheck) syncDeArrowState(card);
        return;
      }
      if (card._userManualOriginal) return;
    }

    let aiTitle = card._aiTitle || getCachedAltTitle(videoId);
    if (!aiTitle) {
      if (
        !forceManual &&
        altTitleFailureReasons.get(videoId) === 'no_key' &&
        getStoredKeys().filter((k) => k && k.key).length === 0 &&
        !transcriptCache.has(videoId) &&
        !(typeof window !== 'undefined' && window.__yt_mock_transcripts?.[videoId]) &&
        !getCachedSummaryTextForAltTitle(videoId)
      ) {
        return;
      }
      const switchBtn = card.querySelector('.yt-alt-title-btn');
      const musicIcon = card.querySelector('.yt-music-exempt-icon');
      if (switchBtn) switchBtn.classList.add('loading');
      if (musicIcon) musicIcon.classList.add('loading');
      aiTitle = await generateAlternativeTitle(videoId, card._originalTitle || getTitleCleanText(titleEl));
      if (switchBtn) switchBtn.classList.remove('loading');
      if (musicIcon) musicIcon.classList.remove('loading');
    }

    // Re-check invariants after async fetch to avoid overriding late DeArrow arrival or disabled/exempt rule
    if (!forceManual) {
      const postDeArrow = Boolean(card.dataset.ytaisDearrow === 'true' || isDeArrowPresent(card, titleEl));
      const postDecision = resolveAutoTitleDecision({
        altTitlesEnabled: getAltTitlesEnabled(),
        altTitleMode: getAltTitleMode(),
        isMusic: false,
        hasDeArrowTitle: postDeArrow,
        channelName,
        channelRules: getChannelTitleRules(),
        manualOverride: null
      });
      if (!postDecision.shouldAutoFetchAi) {
        if (postDeArrow) syncDeArrowState(card);
        return;
      }
      if (card._userManualOriginal) return;
    }

    if (aiTitle) {
      const isDeArrow = Boolean(card.dataset.ytaisDearrow === 'true' || isDeArrowPresent(card, titleEl));
      card._aiTitle = aiTitle;
      card._currentTitleMode = 'ai';
      if (forceManual) card._userChoseAi = true;
      setCardTitleText(card, titleEl, aiTitle);
      const baseTitle = isDeArrow ? (card._dearrowTitle || card._originalTitle || '') : (card._originalTitle || '');
      titleEl.title = `[AI Summary Title] ${aiTitle} (${isDeArrow ? 'DeArrow' : 'Original'}: ${baseTitle})`;

      const switchBtn = card.querySelector('.yt-alt-title-btn');
      if (switchBtn) {
        updateSwitchButtonUI(switchBtn, 'ai', isDeArrow);
      }
      const musicIcon = card.querySelector('.yt-music-exempt-icon');
      if (musicIcon) {
        musicIcon.classList.add('active');
        musicIcon.title = 'Music video (exempt from title replacement) — Showing AI summary title (Click to revert)';
      }
    } else {
      // Ensure button reflects truthful visible state when transcript/AI title unavailable
      const isDeArrow = Boolean(card.dataset.ytaisDearrow === 'true' || isDeArrowPresent(card, titleEl));
      const fallbackMode = isDeArrow ? 'dearrow' : 'original';
      card._currentTitleMode = fallbackMode;
      const switchBtn = card.querySelector('.yt-alt-title-btn');
      if (switchBtn) {
        updateSwitchButtonUI(switchBtn, fallbackMode, isDeArrow);
      }
      if (forceManual) {
        const failReason = altTitleFailureReasons.get(videoId) || (getStoredKeys().length === 0 ? 'no_key' : 'no_captions');
        const msg =
          failReason === 'no_key'
            ? 'Cannot generate AI title: no Gemini API key configured and video has no accessible captions.'
            : failReason === 'api_error'
              ? 'Could not generate AI title: Gemini API request failed for this video.'
              : failReason === 'same_as_original'
                ? 'Original title already matches the factual summary title.'
                : 'Could not generate AI title: no captions or video metadata available.';
        showGlobalToast(msg, 3600);
        announceLive(msg);
      }
    }
  }

  async function toggleCardTitle(card, allowMusicManual = false) {
    if (!card || (card.dataset.ytaisMusicExempt === 'true' && !allowMusicManual)) return;
    const titleEl = getCardTitleElement(card);
    if (!titleEl) return;

    const isDeArrow = Boolean(card.dataset.ytaisDearrow === 'true' || isDeArrowPresent(card, titleEl));
    const currentMode = card._currentTitleMode || (isDeArrow ? 'dearrow' : 'original');

    if (currentMode === 'ai') {
      card._userManualOriginal = true;
      revertCardToNonAiTitle(card, allowMusicManual);
    } else {
      card._userManualOriginal = false;
      await applyAiTitleToCard(card, true, null, allowMusicManual);
    }
  }

  function refreshAllFeedCardTitles() {
    const mode = getAltTitleMode();
    const enabled = mode === 'on';
    const channelRules = getChannelTitleRules();
    const scanContext = { altTitlesEnabled: enabled, altTitleMode: mode, channelRules, fromBackgroundScan: false };
    const cards = document.querySelectorAll('[data-ytais-processed="true"]');
    for (const card of cards) {
      if (card.dataset.ytaisMusicExempt === 'true') continue;
      const titleEl = getCardTitleElement(card);
      const channelName = card.dataset.ytaisChannelName || getCardChannelName(card);
      const isDeArrow = Boolean(card.dataset.ytaisDearrow === 'true' || isDeArrowPresent(card, titleEl));
      const decision = resolveAutoTitleDecision({
        altTitlesEnabled: enabled,
        altTitleMode: mode,
        isMusic: false,
        hasDeArrowTitle: isDeArrow,
        channelName,
        channelRules,
        manualOverride: null
      });
      card.dataset.ytaisChannelRule = decision.rule;
      const ruleBtn = card.querySelector('.yt-channel-rule-btn');
      if (ruleBtn) updateChannelRuleButtonUI(ruleBtn, decision.rule, channelName);

      card._userManualOriginal = false;
      if (decision.shouldAutoFetchAi) {
        if (card._currentTitleMode !== 'ai') {
          applyAiTitleToCard(card, false, scanContext);
        }
      } else {
        if (card._currentTitleMode === 'ai') {
          revertCardToNonAiTitle(card);
        }
      }
    }
  }

  const FEED_CARD_SELECTOR =
    'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-reel-item-renderer';
  const FEED_RELEVANT_NODE_SELECTOR =
    'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-reel-item-renderer, .cbTitleButtonContainer, .dearrow-title-container, [data-dearrow-title]';
  const FEED_NOISE_CLOSEST_SELECTOR =
    '#movie_player, ytd-player, .ytp-chrome-bottom, .ytp-time-display, yt-live-chat-app, #chat-container, .ytp-tooltip, .ytp-caption-window-container';
  const FEED_TITLE_DEARROW_CLOSEST_SELECTOR =
    '#video-title, #video-title-link, .yt-lockup-metadata-view-model__title, .cbTitleButtonContainer, .dearrow-title-container, [data-dearrow-title]';

  let feedScanCount = 0;
  let pageLoadSettled = false;
  let pageLoadSettleScheduled = false;
  const deferredLoadCards = new Set();
  const observedVisibilityCards = new WeakSet();
  const observedTargetToCard = new WeakMap();
  let cardVisibilityObserver = null;

  function isCardNearViewport(card, marginPx = 250) {
    if (!card || !card.isConnected || typeof card.getBoundingClientRect !== 'function') return false;
    let rect = card.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      const inner =
        getCardTitleElement(card) ||
        card.querySelector('a#thumbnail, yt-thumbnail-view-model, #content, .yt-lockup-view-model, #video-title, h3');
      if (inner && typeof inner.getBoundingClientRect === 'function') {
        rect = inner.getBoundingClientRect();
      }
    }
    if (rect.width === 0 && rect.height === 0) return false;
    const vh = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 800;
    return rect.bottom >= -marginPx && rect.top <= vh + marginPx;
  }

  function scheduleIdleWork(fn, timeoutMs = 250) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(fn, { timeout: timeoutMs });
    } else {
      setTimeout(fn, 0);
    }
  }

  function pickVisibleObserveTarget(card) {
    if (!card || typeof card.getBoundingClientRect !== 'function') return card;
    const candidates = [
      card,
      card.querySelector('a#thumbnail'),
      card.querySelector('yt-thumbnail-view-model'),
      card.querySelector('.yt-lockup-view-model'),
      card.querySelector('#content'),
      getCardTitleElement(card)
    ];
    for (const el of candidates) {
      if (!el || typeof el.getBoundingClientRect !== 'function') continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) return el;
    }
    return getCardTitleElement(card) || card;
  }

  function flushDeferredLoadCards() {
    if (deferredLoadCards.size === 0) return;
    const altTitleMode = getAltTitleMode();
    const altEnabled = altTitleMode === 'on';
    const channelRules = getChannelTitleRules();
    const batch = Array.from(deferredLoadCards);
    deferredLoadCards.clear();
    for (const card of batch) {
      if (!card || !card.isConnected) continue;
      if (!altEnabled) continue;
      const inView = isCardNearViewport(card, 250);
      const scanCtx = {
        altTitlesEnabled: altEnabled,
        altTitleMode,
        channelRules,
        fromBackgroundScan: true,
        isIntersectingViewport: inView
      };
      if (inView) {
        card._ytaisAutoFetchStarted = true;
        applyAiTitleToCard(card, false, scanCtx);
      } else {
        observeCardVisibility(card, scanCtx);
      }
    }
  }

  function runVisibleUnfetchedCardSweep() {
    if (!pageLoadSettled) return;
    const altTitleMode = getAltTitleMode();
    const altEnabled = altTitleMode === 'on';
    if (!altEnabled) return;
    const channelRules = getChannelTitleRules();
    const cards = document.querySelectorAll(FEED_CARD_SELECTOR);
    for (let i = 0; i < cards.length; i++) {
      const c = getCanonicalFeedCard(cards[i]) || cards[i];
      if (!c || !c.isConnected || isNestedFeedCard(c)) continue;
      if (!processedFeedCards.has(c)) {
        if (isCardNearViewport(c, 250)) {
          processFeedCard(c, {
            altTitlesEnabled: altEnabled,
            altTitleMode,
            channelRules,
            fromBackgroundScan: true,
            isIntersectingViewport: true
          });
        }
        continue;
      }
      if (c.dataset.ytaisMusicExempt === 'true' || c._ytaisAutoFetchStarted || c._userManualOriginal) continue;
      if (c._currentTitleMode === 'ai' || c._aiTitle) continue;
      if (!isCardNearViewport(c, 250)) continue;
      c._ytaisAutoFetchStarted = true;
      applyAiTitleToCard(c, false, {
        altTitlesEnabled: altEnabled,
        altTitleMode,
        channelRules,
        fromBackgroundScan: true,
        isIntersectingViewport: true
      });
    }
  }

  function markPageLoadSettled() {
    if (pageLoadSettled) return;
    pageLoadSettled = true;
    flushDeferredLoadCards();
    setTimeout(() => runVisibleUnfetchedCardSweep(), 450);
  }

  function schedulePageLoadSettle() {
    if (pageLoadSettled || pageLoadSettleScheduled) return;
    pageLoadSettleScheduled = true;
    const triggerSettle = () => {
      scheduleIdleWork(() => markPageLoadSettled(), 300);
    };
    if (typeof document === 'undefined' || document.readyState === 'complete') {
      triggerSettle();
    } else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('load', triggerSettle, { once: true });
      setTimeout(() => markPageLoadSettled(), 1200);
    } else {
      markPageLoadSettled();
    }
  }

  function ensureCardVisibilityObserver() {
    if (cardVisibilityObserver || typeof IntersectionObserver === 'undefined') return cardVisibilityObserver;
    cardVisibilityObserver = new IntersectionObserver(
      (entries) => {
        let scanCtx = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const observedEl = entry.target;
          const card = observedTargetToCard.get(observedEl) || observedEl;
          cardVisibilityObserver.unobserve(observedEl);
          if (!card || !card.isConnected || card.dataset.ytaisMusicExempt === 'true') continue;
          if (!scanCtx) {
            const altMode = getAltTitleMode();
            scanCtx = {
              altTitlesEnabled: altMode === 'on',
              altTitleMode: altMode,
              channelRules: getChannelTitleRules(),
              fromBackgroundScan: true,
              isIntersectingViewport: true
            };
          }
          if (scanCtx.altTitlesEnabled) {
            card._ytaisAutoFetchStarted = true;
            applyAiTitleToCard(card, false, scanCtx);
          }
        }
      },
      { root: null, rootMargin: '250px 0px', threshold: 0 }
    );
    return cardVisibilityObserver;
  }

  function observeCardVisibility(card, scanCtx = null) {
    if (!card || !card.isConnected) return;
    if (!pageLoadSettled) {
      deferredLoadCards.add(card);
      schedulePageLoadSettle();
      return;
    }
    const obs = ensureCardVisibilityObserver();
    if (!obs) {
      const altMode = getAltTitleMode();
      const ctx = scanCtx || {
        altTitlesEnabled: altMode === 'on',
        altTitleMode: altMode,
        channelRules: getChannelTitleRules(),
        fromBackgroundScan: true,
        isIntersectingViewport: true
      };
      if (ctx.altTitlesEnabled) {
        card._ytaisAutoFetchStarted = true;
        applyAiTitleToCard(card, false, ctx);
      }
      return;
    }
    if (!observedVisibilityCards.has(card)) {
      observedVisibilityCards.add(card);
      const observeTarget = pickVisibleObserveTarget(card);
      observedTargetToCard.set(observeTarget, card);
      obs.observe(observeTarget);
    }
  }

  function isFeedMutationRelevant(mutation) {
    if (!mutation) return false;
    if (mutation.type === 'attributes') {
      return mutation.attributeName === 'data-dearrow' || mutation.attributeName === 'data-dearrow-title';
    }
    const rawTarget = mutation.target;
    const targetEl = rawTarget?.nodeType === 3 ? rawTarget.parentElement : rawTarget;
    if (!targetEl || typeof targetEl.closest !== 'function') return true;
    if (targetEl.id === 'yt-ai-summary-host' || targetEl.closest('#yt-ai-summary-host, .yt-alt-title-btn, .yt-channel-rule-btn, .yt-channel-rule-menu, .yt-music-exempt-icon, .yt-topbar-launcher-btn')) {
      return false;
    }

    const ownerCard = targetEl.closest(FEED_CARD_SELECTOR);
    if (ownerCard && ownerCard._ytaisSelfMutatedTs && Date.now() - ownerCard._ytaisSelfMutatedTs < 80) {
      return false;
    }

    const inNoise = Boolean(targetEl.closest(FEED_NOISE_CLOSEST_SELECTOR));
    const inTitleOrDeArrow = Boolean(targetEl.closest(FEED_TITLE_DEARROW_CLOSEST_SELECTOR));

    if (mutation.type === 'characterData') {
      return inTitleOrDeArrow && !inNoise;
    }

    if (mutation.type === 'childList') {
      const addedNodes = mutation.addedNodes;
      const removedNodes = mutation.removedNodes;
      let hasTouched = false;
      let allOurs = true;

      if (addedNodes && addedNodes.length > 0) {
        hasTouched = true;
        for (let i = 0; i < addedNodes.length; i++) {
          const n = addedNodes[i];
          const cl = n?.nodeType === 1 ? n.classList : null;
          if (!cl || !(cl.contains('yt-alt-title-btn') || cl.contains('yt-channel-rule-btn') || cl.contains('yt-channel-rule-menu') || cl.contains('yt-music-exempt-icon') || cl.contains('yt-topbar-launcher-btn'))) {
            allOurs = false;
            break;
          }
        }
      }
      if (allOurs && removedNodes && removedNodes.length > 0) {
        hasTouched = true;
        for (let i = 0; i < removedNodes.length; i++) {
          const n = removedNodes[i];
          const cl = n?.nodeType === 1 ? n.classList : null;
          if (!cl || !(cl.contains('yt-alt-title-btn') || cl.contains('yt-channel-rule-btn') || cl.contains('yt-channel-rule-menu') || cl.contains('yt-music-exempt-icon') || cl.contains('yt-topbar-launcher-btn'))) {
            allOurs = false;
            break;
          }
        }
      }
      if (hasTouched && allOurs) {
        return false;
      }

      if (addedNodes && addedNodes.length > 0) {
        for (let i = 0; i < addedNodes.length; i++) {
          const n = addedNodes[i];
          if (n?.nodeType === 1) {
            if (n.matches?.(FEED_RELEVANT_NODE_SELECTOR) || n.querySelector?.(FEED_RELEVANT_NODE_SELECTOR)) {
              return true;
            }
          }
        }
      }
      if (inNoise && !inTitleOrDeArrow) return false;
      return Boolean(ownerCard || inTitleOrDeArrow);
    }

    return false;
  }

  function observeFeedCards() {
    ensureFeedStylesInjected();
    schedulePageLoadSettle();

    const pendingCards = new Set();
    const pendingSyncCards = new Set();
    let chunkScheduled = false;

    function processBatchChunk() {
      chunkScheduled = false;
      if (pendingCards.size === 0 && pendingSyncCards.size === 0) return;

      const curAltMode = getAltTitleMode();
      const scanContext = {
        altTitlesEnabled: curAltMode === 'on',
        altTitleMode: curAltMode,
        channelRules: getChannelTitleRules(),
        fromBackgroundScan: true,
        isIntersectingViewport: false
      };

      const startTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      let processedInSlice = 0;

      if (pendingCards.size > 0) {
        const iterator = pendingCards.values();
        let next = iterator.next();
        while (!next.done) {
          const c = next.value;
          pendingCards.delete(c);
          if (c && c.isConnected && !isNestedFeedCard(c)) {
            const liveVideoId = getCardVideoId(c);
            const cardScanCtx = {
              altTitlesEnabled: scanContext.altTitlesEnabled,
              altTitleMode: scanContext.altTitleMode,
              channelRules: scanContext.channelRules,
              fromBackgroundScan: true,
              isIntersectingViewport: pageLoadSettled ? isCardNearViewport(c, 250) : false
            };
            if (!processedFeedCards.has(c) || (liveVideoId && c.dataset.ytaisVideoId !== liveVideoId)) {
              processFeedCard(c, cardScanCtx);
            } else {
              syncDeArrowState(c);
            }
          }
          processedInSlice++;
          const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTs;
          if (processedInSlice >= 12 && elapsed > 10 && pendingCards.size > 0) {
            chunkScheduled = true;
            scheduleIdleWork(processBatchChunk, 120);
            return;
          }
          next = iterator.next();
        }
      }

      if (pendingSyncCards.size > 0) {
        for (const sc of Array.from(pendingSyncCards)) {
          pendingSyncCards.delete(sc);
          if (sc && sc.isConnected && !isNestedFeedCard(sc)) {
            syncDeArrowState(sc);
          }
        }
      }
    }

    function enqueueAllVisibleAndExistingCards() {
      feedScanCount++;
      const cards = document.querySelectorAll(FEED_CARD_SELECTOR);
      for (let i = 0; i < cards.length; i++) {
        const canonical = getCanonicalFeedCard(cards[i]) || cards[i];
        if (!isNestedFeedCard(canonical)) pendingCards.add(canonical);
      }
      if (pendingCards.size <= 12) {
        processBatchChunk();
      } else if (!chunkScheduled) {
        chunkScheduled = true;
        scheduleIdleWork(processBatchChunk, 120);
      }
    }

    function collectFromMutation(m) {
      if (m.type === 'attributes') {
        const t = m.target;
        const card = getCanonicalFeedCard(t);
        if (card) pendingSyncCards.add(card);
        return;
      }
      const rawTarget = m.target;
      const targetEl = rawTarget?.nodeType === 3 ? rawTarget.parentElement : rawTarget;
      const ownerCard = getCanonicalFeedCard(targetEl);
      if (ownerCard) {
        if (!processedFeedCards.has(ownerCard)) pendingCards.add(ownerCard);
        else pendingSyncCards.add(ownerCard);
      }
      if (m.type === 'childList' && m.addedNodes && m.addedNodes.length > 0) {
        for (let i = 0; i < m.addedNodes.length; i++) {
          const n = m.addedNodes[i];
          if (n?.nodeType !== 1) continue;
          if (n.matches?.(FEED_CARD_SELECTOR)) {
            const canonical = getCanonicalFeedCard(n) || n;
            if (!isNestedFeedCard(canonical)) pendingCards.add(canonical);
          } else {
            const nestedCards = n.querySelectorAll?.(FEED_CARD_SELECTOR);
            if (nestedCards && nestedCards.length > 0) {
              for (let j = 0; j < nestedCards.length; j++) {
                const canonical = getCanonicalFeedCard(nestedCards[j]) || nestedCards[j];
                if (!isNestedFeedCard(canonical)) pendingCards.add(canonical);
              }
            }
          }
        }
      }
    }

    enqueueAllVisibleAndExistingCards();

    let debounceTimer = null;
    const observer = new MutationObserver((mutations) => {
      if (!Array.isArray(mutations)) return;
      let anyRelevant = false;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (isFeedMutationRelevant(m)) {
          anyRelevant = true;
          collectFromMutation(m);
        }
      }
      if (!anyRelevant) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        feedScanCount++;
        if (pendingCards.size === 0 && pendingSyncCards.size === 0) {
          const cards = document.querySelectorAll(FEED_CARD_SELECTOR);
          for (let i = 0; i < cards.length; i++) {
            const c = cards[i];
            if (!processedFeedCards.has(c)) pendingCards.add(c);
          }
        }
        processBatchChunk();
      }, 180);
    });

    const rootTarget = document.body || document.documentElement;
    if (rootTarget) {
      observer.observe(rootTarget, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-dearrow', 'data-dearrow-title']
      });
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const onSpaNavigate = () => {
        if (typeof updateDockHistoryTab === 'function') updateDockHistoryTab();
        setTimeout(() => {
          if (typeof updateDockHistoryTab === 'function') updateDockHistoryTab();
          enqueueAllVisibleAndExistingCards();
          runVisibleUnfetchedCardSweep();
        }, 180);
      };
      let scrollSweepTimer = null;
      const onScrollSweep = () => {
        if (scrollSweepTimer) return;
        scrollSweepTimer = setTimeout(() => {
          scrollSweepTimer = null;
          runVisibleUnfetchedCardSweep();
        }, 220);
      };
      window.addEventListener('yt-navigate-finish', onSpaNavigate);
      window.addEventListener('yt-page-data-updated', onSpaNavigate);
      window.addEventListener('popstate', onSpaNavigate);
      window.addEventListener('scroll', onScrollSweep, { passive: true });
    }
  }

  const FEED_CSS = `
    .yt-alt-title-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      padding: 0;
      margin-left: 5px;
      margin-right: 2px;
      vertical-align: middle;
      flex-shrink: 0;
      position: relative;
      z-index: 10;
      pointer-events: auto;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 4px;
      color: #aaa;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
      text-decoration: none;
      box-sizing: border-box;
      line-height: normal;
    }
    .yt-alt-title-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.35);
      color: #fff;
      transform: translateY(-1px);
    }
    .yt-alt-title-btn.active {
      background: linear-gradient(135deg, var(--yt-accent-tint, rgba(62, 166, 255, 0.25)), rgba(168, 85, 247, 0.25));
      border-color: var(--yt-accent-border, rgba(62, 166, 255, 0.6));
      color: var(--md-sys-color-primary, #3ea6ff);
    }
    .yt-alt-title-btn.dearrow {
      background: rgba(99, 102, 241, 0.2);
      border-color: rgba(99, 102, 241, 0.5);
      color: #818cf8;
    }
    .yt-alt-title-btn.original {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.16);
      color: #888;
    }
    @keyframes yt-alt-pulse {
      0%, 100% { opacity: 0.45; transform: scale(0.95); }
      50% { opacity: 1; transform: scale(1.05); }
    }
    .yt-alt-title-btn.loading {
      opacity: 0.8;
      pointer-events: none;
      animation: yt-alt-pulse 1s ease-in-out infinite;
    }
    h3:has(> .yt-alt-title-btn),
    .yt-lockup-metadata-view-model__heading-reset:has(> .yt-alt-title-btn) {
      overflow: visible !important;
      max-height: none !important;
      -webkit-line-clamp: unset !important;
    }
    .yt-music-exempt-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      padding: 0;
      margin-left: 5px;
      vertical-align: middle;
      flex-shrink: 0;
      position: relative;
      z-index: 10;
      color: #f472b6;
      background: rgba(244, 114, 182, 0.12);
      border: 1px solid rgba(244, 114, 182, 0.35);
      border-radius: 4px;
      cursor: pointer;
      opacity: 0.9;
      transition: all 0.15s ease;
    }
    .yt-music-exempt-icon:hover {
      opacity: 1;
      background: rgba(244, 114, 182, 0.24);
      transform: translateY(-1px);
    }
    .yt-music-exempt-icon.active {
      background: linear-gradient(135deg, var(--yt-accent-tint, rgba(62, 166, 255, 0.25)), rgba(244, 114, 182, 0.3));
      border-color: var(--yt-accent-border, rgba(62, 166, 255, 0.7));
      color: var(--md-sys-color-primary, #3ea6ff);
    }
    .yt-music-exempt-icon.loading {
      opacity: 0.75;
      pointer-events: none;
      animation: yt-alt-pulse 1s ease-in-out infinite;
    }
    .yt-topbar-launcher-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      margin-left: 8px;
      border-radius: 999px;
      border: 1px solid var(--yt-accent-border, rgba(163, 201, 255, 0.35));
      background: #1d2026;
      color: var(--md-sys-color-primary, #a3c9ff);
      cursor: pointer;
      vertical-align: middle;
      transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .yt-topbar-launcher-btn.yt-ui-light {
      background: #f3f3fa;
      color: var(--md-sys-color-primary, #2d628c);
      border-color: var(--yt-accent-border, #c3c6cf);
      box-shadow: 0 2px 8px rgba(25,28,32,0.12);
    }
    .yt-topbar-launcher-btn:hover {
      transform: scale(1.06);
      background: var(--yt-accent-tint-strong, #282a31);
    }
    .yt-topbar-launcher-btn.yt-ui-light:hover {
      background: var(--yt-accent-tint-strong, #d5e4f7);
    }
    .yt-topbar-launcher-fixed {
      position: fixed;
      top: 10px;
      left: 12px;
      z-index: 2147482999;
      margin-left: 0;
    }

    /* DeArrow Interoperability & Zero Clash Rules */
    .cbTitleButtonContainer,
    .dearrow-title-container {
      display: inline-flex !important;
      align-items: center !important;
      vertical-align: middle !important;
      flex-shrink: 0 !important;
      position: relative !important;
      z-index: 2 !important;
    }
    .cbTitleButtonContainer + .yt-alt-title-btn,
    .dearrow-title-container + .yt-alt-title-btn,
    [data-dearrow] + .yt-alt-title-btn {
      margin-left: 4px !important;
    }
    .yt-alt-title-btn + .cbTitleButtonContainer,
    .yt-alt-title-btn + .dearrow-title-container {
      margin-left: 4px !important;
    }
    .cbThumbnailButtonContainer {
      pointer-events: auto !important;
      z-index: 3 !important;
    }
    .yt-channel-rule-btn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      height: 20px;
      padding: 0 5px;
      margin-left: 3px;
      vertical-align: middle;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 4px;
      color: #aaa;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      position: relative;
      z-index: 2;
      flex-shrink: 0;
    }
    .yt-channel-rule-btn:hover {
      background: rgba(255, 255, 255, 0.16);
      color: #fff;
    }
    .yt-channel-rule-btn.exempt {
      background: rgba(245, 158, 11, 0.16);
      border-color: rgba(245, 158, 11, 0.45);
      color: #fbbf24;
    }
    .yt-channel-rule-btn.force-ai {
      background: rgba(16, 185, 129, 0.16);
      border-color: rgba(16, 185, 129, 0.45);
      color: #34d399;
    }
    .yt-channel-rule-menu {
      position: absolute;
      z-index: 9999;
      margin-top: 4px;
      min-width: 210px;
      background: #1f1f1f;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 8px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .yt-channel-rule-option {
      text-align: left;
      background: transparent;
      border: none;
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 11px;
      color: #e5e5e5;
      cursor: pointer;
    }
    .yt-channel-rule-option:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .yt-channel-rule-option.active {
      background: var(--yt-accent-tint, rgba(62, 166, 255, 0.2));
      color: var(--md-sys-color-primary, #3ea6ff);
      font-weight: 600;
    }
  `;
  let feedStylesInjected = false;
  function ensureFeedStylesInjected() {
    if (feedStylesInjected) return;
    if (typeof GM_addStyle === 'function') {
      try {
        GM_addStyle(FEED_CSS);
        feedStylesInjected = true;
      } catch (_) {}
    }
  }

  // --- STYLES & SHADOW ROOT SETUP (§2) ---
  const CSS_TEXT = `
  :host, :host(.yt-ui-dark) {
    all: initial;
    font-family: var(--yt-ui-font, "DM Sans", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif);
    font-size: var(--yt-ui-font-size, 13px);
    color-scheme: dark;
    --yt-ui-font: "DM Sans", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    --yt-ui-font-size: 13px;
    --yt-ui-density-pad: 12px;
    --yt-gen-font: "DM Sans", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    --yt-gen-font-size: 14px;
    --yt-gen-line-height: 1.6;
    --yt-gen-para-gap: 8px;
    --md-sys-color-surface: #111318;
    --md-sys-color-surface-container-low: #191c22;
    --md-sys-color-surface-container: #1d2026;
    --md-sys-color-surface-container-high: #282a31;
    --md-sys-color-surface-container-highest: #33353c;
    --md-sys-color-on-surface: #e2e2e9;
    --md-sys-color-on-surface-variant: #c3c6cf;
    --md-sys-color-primary: #a3c9ff;
    --md-sys-color-on-primary: #00315d;
    --md-sys-color-primary-container: #1b4876;
    --md-sys-color-on-primary-container: #d3e4ff;
    --md-sys-color-secondary-container: #394857;
    --md-sys-color-on-secondary-container: #d5e4f7;
    --md-sys-color-tertiary-container: #523f5f;
    --md-sys-color-on-tertiary-container: #f2daff;
    --md-sys-color-outline: #8d9199;
    --md-sys-color-outline-variant: #43474e;
    --md-sys-color-error-container: #93000a;
    --md-sys-color-on-error: #ffb4ab;
    --yt-spec-base-background: #191c22;
    --yt-spec-text-primary: #e2e2e9;
    --yt-spec-text-secondary: #c3c6cf;
    --yt-spec-call-to-action: #a3c9ff;
    --yt-spec-10-percent-layer: rgba(163, 201, 255, 0.14);
    --yt-spec-badge-chip-background: #282a31;
    --yt-accent-tint: rgba(163, 201, 255, 0.16);
    --yt-accent-tint-strong: rgba(163, 201, 255, 0.28);
    --yt-accent-border: rgba(163, 201, 255, 0.48);
    --yt-accent-border-strong: rgba(163, 201, 255, 0.72);
  }
  :host(.yt-ui-light) {
    color-scheme: light;
    --md-sys-color-surface: #f9f9ff;
    --md-sys-color-surface-container-low: #f3f3fa;
    --md-sys-color-surface-container: #ededf4;
    --md-sys-color-surface-container-high: #e7e8ee;
    --md-sys-color-surface-container-highest: #e1e2e9;
    --md-sys-color-on-surface: #191c20;
    --md-sys-color-on-surface-variant: #43474e;
    --md-sys-color-primary: #2d628c;
    --md-sys-color-on-primary: #ffffff;
    --md-sys-color-primary-container: #cce5ff;
    --md-sys-color-on-primary-container: #001d32;
    --md-sys-color-secondary-container: #d5e4f7;
    --md-sys-color-on-secondary-container: #0e1d2a;
    --md-sys-color-tertiary-container: #f2daff;
    --md-sys-color-on-tertiary-container: #241432;
    --md-sys-color-outline: #73777f;
    --md-sys-color-outline-variant: #c3c6cf;
    --md-sys-color-error-container: #ffdad6;
    --md-sys-color-on-error: #93000a;
    --yt-spec-base-background: #f3f3fa;
    --yt-spec-text-primary: #191c20;
    --yt-spec-text-secondary: #43474e;
    --yt-spec-call-to-action: #2d628c;
    --yt-spec-10-percent-layer: rgba(45, 98, 140, 0.12);
    --yt-spec-badge-chip-background: #e7e8ee;
    --yt-accent-tint: rgba(45, 98, 140, 0.12);
    --yt-accent-tint-strong: rgba(45, 98, 140, 0.22);
    --yt-accent-border: rgba(45, 98, 140, 0.42);
    --yt-accent-border-strong: rgba(45, 98, 140, 0.68);
  }
  .yt-app-theme-group {
    display: inline-flex;
    align-items: center;
    background: var(--md-sys-color-surface-container-highest);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: 999px;
    padding: 2px;
    gap: 2px;
  }
  .yt-app-theme-btn,
  .yt-m3-seg-btn {
    border: none;
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .yt-app-theme-btn:hover,
  .yt-m3-seg-btn:hover {
    color: var(--md-sys-color-on-surface);
  }
  .yt-app-theme-btn.active,
  .yt-m3-seg-btn.active {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }
  .yt-transcript-processing-panel {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--md-sys-color-surface-container-high);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: 999px;
    padding: 2px 6px;
  }
  .yt-tp-label {
    font-size: 11px;
    color: var(--md-sys-color-on-surface-variant);
    font-weight: 500;
    margin-right: 2px;
  }
  .yt-tp-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .yt-tp-btn:hover {
    background: var(--md-sys-color-surface-container-highest);
    color: var(--md-sys-color-on-surface);
  }
  .yt-tp-btn.active {
    background: var(--md-sys-color-primary-container);
    border-color: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary-container);
  }
  .yt-dock {
    position: fixed;
    right: 24px;
    bottom: 0;
    z-index: 2147483001;
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: flex-end;
    pointer-events: auto;
  }
  .yt-dock-tab {
    flex: 0 1 320px;
    min-width: 150px;
    height: 38px;
    border-radius: 14px 14px 0 0;
    background: var(--md-sys-color-surface-container-high);
    color: var(--md-sys-color-on-surface);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-bottom: none;
    display: flex;
    align-items: center;
    padding: 0 10px;
    gap: 8px;
    cursor: pointer;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.22);
    user-select: none;
    transition: background 0.2s, border-color 0.2s;
  }
  .yt-dock-tab.audio-playing {
    border-color: var(--md-sys-color-primary);
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
  }
  .yt-dock-tab.audio-paused {
    border-color: var(--yt-accent-border, var(--md-sys-color-outline));
  }
  .yt-dock-tab.error {
    background: var(--md-sys-color-error-container);
    color: var(--md-sys-color-on-error);
  }
  .yt-dock-tab.unread {
    background: var(--md-sys-color-tertiary-container);
    color: var(--md-sys-color-on-tertiary-container);
    animation: ytPulse 1.5s infinite 3;
    font-weight: 600;
  }
  @keyframes ytPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.03); }
  }
  .yt-dock-status-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .yt-dock-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    font-weight: 500;
  }
  .yt-dock-audio-controls {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }
  .yt-dock-audio-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 2px 6px;
    border-radius: 999px;
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    white-space: nowrap;
  }
  .yt-dock-tab.audio-paused .yt-dock-audio-badge {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }
  .yt-dock-btn {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.85;
  }
  .yt-dock-btn:hover {
    opacity: 1;
    background: var(--yt-accent-tint-strong, rgba(255,255,255,0.15));
  }
  .yt-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: ytSpin 0.8s linear infinite;
  }
  .yt-big-spinner {
    width: 36px;
    height: 36px;
    border: 3px solid rgba(255,255,255,0.2);
    border-top-color: var(--yt-spec-call-to-action, #3ea6ff);
    border-radius: 50%;
    animation: ytSpin 0.8s linear infinite;
    margin-bottom: 12px;
  }
  @keyframes ytSpin {
    to { transform: rotate(360deg); }
  }
  .yt-modal-scrim {
    position: fixed;
    inset: 0;
    z-index: 2147483050;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
  }
  .yt-modal-scrim.yt-floating-scrim {
    background: transparent;
    pointer-events: none;
    display: block;
    z-index: 2147483001;
  }
  .yt-window-box {
    box-sizing: border-box;
    width: min(940px, 94vw);
    height: min(calc(100vh - 110px), 900px);
    background: var(--md-sys-color-surface-container-low, #191c22);
    color: var(--md-sys-color-on-surface, #e2e2e9);
    border-radius: 24px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 12px 36px rgba(0,0,0,0.45);
    border: 1px solid var(--md-sys-color-outline-variant, #43474e);
  }
  .yt-window-box.yt-floating-window,
  .yt-key-dialog-box.yt-floating-window {
    position: fixed;
    pointer-events: auto;
    min-width: 340px;
    min-height: 300px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 64px);
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
  }
  .yt-window-box.yt-floating-window.focused,
  .yt-key-dialog-box.yt-floating-window.focused {
    border-color: var(--md-sys-color-primary, #a3c9ff);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
  }
  .yt-dock-tab.active-focus {
    outline: 2px solid var(--md-sys-color-primary);
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
  }
  .yt-resize-handle {
    position: absolute;
    z-index: 30;
  }
  .yt-resize-handle:focus-visible, .yt-win-drag-grip:focus-visible {
    outline: 2px solid var(--md-sys-color-primary, #3ea6ff);
    outline-offset: -2px;
    background: var(--yt-accent-tint, rgba(62, 166, 255, 0.25));
  }
  .yt-resize-handle-n {
    top: 0;
    left: 16px;
    right: 16px;
    height: 6px;
    cursor: ns-resize;
  }
  .yt-resize-handle-e {
    top: 12px;
    right: 0;
    width: 6px;
    bottom: 16px;
    cursor: ew-resize;
  }
  .yt-resize-handle-w {
    top: 12px;
    left: 0;
    width: 6px;
    bottom: 16px;
    cursor: ew-resize;
  }
  .yt-resize-handle-s {
    left: 16px;
    right: 16px;
    bottom: 0;
    height: 6px;
    cursor: ns-resize;
  }
  .yt-resize-handle-nw {
    left: 0;
    top: 0;
    width: 14px;
    height: 14px;
    cursor: nwse-resize;
  }
  .yt-resize-handle-ne {
    right: 0;
    top: 0;
    width: 14px;
    height: 14px;
    cursor: nesw-resize;
  }
  .yt-resize-handle-se {
    right: 0;
    bottom: 0;
    width: 14px;
    height: 14px;
    cursor: nwse-resize;
    background: radial-gradient(circle at 75% 75%, rgba(255,255,255,0.45) 1.5px, transparent 1.5px);
  }
  .yt-resize-handle-sw {
    left: 0;
    bottom: 0;
    width: 14px;
    height: 14px;
    cursor: nesw-resize;
  }
  .yt-win-drag-grip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    padding: 4px;
    margin-right: 6px;
    border-radius: 6px;
    cursor: grab;
    flex-shrink: 0;
  }
  .yt-win-drag-grip:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }
  .yt-win-drag-grip:active {
    cursor: grabbing;
  }
  .yt-live-region {
    position: fixed;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .yt-global-toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(-10px);
    z-index: 2147483600;
    background: rgba(24, 24, 28, 0.96);
    color: #f8fafc;
    border: 1px solid var(--yt-accent-border, rgba(62, 166, 255, 0.45));
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65);
    border-radius: 999px;
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 600;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.18s ease, transform 0.18s ease;
    max-width: calc(100vw - 24px);
    text-align: center;
  }
  .yt-global-toast.yt-global-toast-show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  @media (max-width: 420px) {
    .yt-window-box.yt-floating-window,
    .yt-key-dialog-box.yt-floating-window {
      min-width: min(340px, calc(100vw - 16px));
      max-width: calc(100vw - 16px);
      border-radius: 12px;
    }
    .yt-win-header {
      padding: 10px 12px;
    }
  }
  .yt-win-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    cursor: grab;
    user-select: none;
  }
  .yt-win-header:active {
    cursor: grabbing;
  }
  .yt-win-overflow-btn {
    display: none;
  }
  .yt-win-overflow-menu {
    position: absolute;
    z-index: 2147483020;
    width: 240px;
    background: #1f1f1f;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 12px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.8);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .yt-compact-options-bar {
    display: none;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .yt-options-row.yt-options-collapsed {
    display: none !important;
  }
  .yt-window-box.yt-win-compact .yt-win-header {
    padding: 8px 10px;
  }
  .yt-window-box.yt-win-compact .yt-win-title {
    font-size: 14px;
    -webkit-line-clamp: 1;
  }
  .yt-window-box.yt-win-compact .yt-win-header-btns {
    gap: 2px;
    margin-left: 6px;
  }
  .yt-window-box.yt-win-compact .yt-win-secondary-btn {
    display: none !important;
  }
  .yt-window-box.yt-win-compact .yt-win-overflow-btn {
    display: flex;
  }
  .yt-window-box.yt-win-compact .yt-compact-options-bar {
    display: flex;
  }
  .yt-window-box.yt-win-compact .yt-win-toolbar {
    padding: 6px 10px;
    gap: 6px;
  }
  .yt-window-box.yt-win-compact .yt-tts-shortcuts-hint,
  .yt-window-box.yt-win-medium .yt-tts-shortcuts-hint,
  .yt-window-box.yt-tts-compact .yt-tts-shortcuts-hint,
  .yt-window-box.yt-win-compact .yt-tts-rewind-btn span,
  .yt-window-box.yt-win-compact .yt-tts-skip-btn span,
  .yt-window-box.yt-win-compact .yt-tts-stop-btn span,
  .yt-window-box.yt-win-compact .yt-tts-skip-silence-label {
    display: none;
  }
  .yt-window-box.yt-tts-compact .yt-tts-group,
  .yt-window-box.yt-win-compact .yt-tts-group {
    flex: 1 1 100%;
    flex-wrap: wrap;
    max-width: 100%;
    border-radius: 10px;
    padding: 3px 5px;
    gap: 3px;
  }
  .yt-window-box.yt-tts-compact .yt-tts-btn,
  .yt-window-box.yt-win-compact .yt-tts-btn {
    padding: 3px 6px;
    font-size: 11px;
    gap: 3px;
  }
  .yt-window-box.yt-tts-compact .yt-tts-volume-slider,
  .yt-window-box.yt-tts-compact .yt-tts-pitch-slider {
    width: 46px;
  }
  .yt-window-box.yt-win-compact .yt-tts-speed-btns {
    display: none;
  }
  .yt-window-box.yt-win-compact .yt-tts-volume-slider,
  .yt-window-box.yt-win-compact .yt-tts-pitch-slider,
  .yt-window-box.yt-win-compact .yt-tts-speed-slider {
    width: 40px;
  }
  .yt-window-box.yt-win-compact .yt-tts-waveform-canvas {
    width: 52px;
  }
  .yt-window-box.yt-win-compact .yt-tts-voice-select {
    max-width: 100%;
    min-width: 96px;
    flex: 1 1 115px;
  }
  .yt-window-box.yt-tts-narrow .yt-tts-waveform-canvas {
    width: 44px;
  }
  .yt-window-box.yt-tts-narrow .yt-tts-volume-slider,
  .yt-window-box.yt-tts-narrow .yt-tts-pitch-slider,
  .yt-window-box.yt-tts-narrow .yt-tts-speed-slider {
    width: 36px;
  }
  .yt-window-box.yt-win-compact .yt-adv-panel {
    grid-template-columns: 1fr;
  }
  .yt-window-box.yt-win-compact .yt-composer-wrap {
    flex-wrap: wrap;
    padding: 8px 10px;
  }
  .yt-window-box.yt-win-compact .yt-composer-textarea {
    flex: 1 1 100%;
    min-width: 0;
  }
  .yt-window-box.yt-win-compact .yt-readability-theme-group {
    display: none;
  }
  .yt-window-box.yt-win-compact .yt-readability-theme-select {
    display: inline-block;
  }
  .yt-window-box.yt-win-compact .yt-readability-stats {
    display: none;
  }
  .yt-window-box.yt-win-short .yt-win-header {
    padding: 6px 12px;
  }
  .yt-window-box.yt-win-short .yt-win-toolbar {
    padding: 5px 12px;
    gap: 4px;
    max-height: 45%;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .yt-window-box.yt-win-short .yt-summary-page-bar {
    padding: 5px 8px;
    margin-bottom: 6px;
  }
  .yt-rating-bar {
    margin-top: 14px;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .yt-rating-bar.compact {
    margin-top: 8px;
    padding: 5px 8px;
    background: rgba(255, 255, 255, 0.03);
  }
  .yt-rating-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .yt-rating-label {
    font-size: 12px;
    color: var(--yt-spec-text-secondary, #aaa);
    font-weight: 500;
  }
  .yt-rating-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 14px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: var(--yt-spec-text-primary, #f1f1f1);
    transition: all 0.15s ease;
  }
  .yt-rating-btn:hover {
    background: rgba(255, 255, 255, 0.14);
  }
  .yt-rating-up-btn.active {
    background: rgba(34, 197, 94, 0.22);
    border-color: #22c55e;
    color: #4ade80;
  }
  .yt-rating-down-btn.active {
    background: rgba(239, 68, 68, 0.22);
    border-color: #ef4444;
    color: #f87171;
  }
  .yt-rating-status {
    font-size: 11px;
    color: #9ca3af;
  }
  .yt-rating-note-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .yt-rating-note-input {
    flex: 1;
    min-width: 140px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: #f1f1f1;
    font-size: 11px;
    padding: 4px 8px;
    outline: none;
  }
  .yt-rating-note-save-btn {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    background: var(--md-sys-color-primary, #3ea6ff);
    color: var(--md-sys-color-on-primary, #0f0f0f);
    border: none;
    cursor: pointer;
  }
  .yt-window-box.yt-theme-light .yt-rating-bar {
    background: rgba(0, 0, 0, 0.03);
    border-color: #d0d7de;
  }
  .yt-window-box.yt-theme-light .yt-rating-label,
  .yt-window-box.yt-theme-light .yt-rating-status {
    color: #57606a;
  }
  .yt-window-box.yt-theme-light .yt-rating-btn {
    background: #ffffff;
    border-color: #d0d7de;
    color: #1f2328;
  }
  .yt-window-box.yt-theme-sepia .yt-rating-bar {
    background: rgba(67, 52, 34, 0.05);
    border-color: #d8c8a6;
  }
  .yt-window-box.yt-theme-sepia .yt-rating-label,
  .yt-window-box.yt-theme-sepia .yt-rating-status {
    color: #5c4b37;
  }
  .yt-window-box.yt-theme-sepia .yt-rating-btn {
    background: #efe5cd;
    border-color: #d8c8a6;
    color: #433422;
  }
  /* FEAT-07: Interactive Multi-Host Podcast Studio Styles */
  .yt-podcast-studio {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .yt-podcast-setup-card,
  .yt-podcast-player-card,
  .yt-podcast-qa-bar {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    box-sizing: border-box;
  }
  .yt-podcast-setup-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .yt-podcast-title {
    font-size: 14px;
    font-weight: 700;
    color: #f8fafc;
  }
  .yt-podcast-subtitle {
    font-size: 11.5px;
    color: #94a3b8;
    margin-top: 2px;
  }
  .yt-podcast-host-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .yt-podcast-host-label {
    font-size: 11.5px;
    font-weight: 600;
    color: #cbd5e1;
  }
  .yt-podcast-count-btn {
    padding: 4px 9px;
    min-width: 28px;
    font-weight: 700;
  }
  .yt-podcast-hosts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 8px;
  }
  .yt-podcast-host-card {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 6px 8px;
    min-width: 0;
  }
  .yt-podcast-host-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .yt-podcast-host-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .yt-podcast-host-name-input {
    width: 100%;
    min-width: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #f1f5f9;
    font-size: 12px;
    font-weight: 600;
    padding: 1px 4px;
    outline: none;
  }
  .yt-podcast-host-name-input:focus {
    border-color: var(--yt-accent-border, rgba(62, 166, 255, 0.6));
    background: rgba(255, 255, 255, 0.05);
  }
  .yt-podcast-host-role {
    font-size: 10.5px;
    color: #94a3b8;
    padding-left: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .yt-podcast-host-voice-select {
    font-size: 10.5px;
    padding: 2px 4px;
    max-width: 78px;
  }
  .yt-podcast-player-card {
    background: var(--yt-accent-tint, rgba(14, 165, 233, 0.08));
    border-color: var(--yt-accent-border, rgba(56, 189, 248, 0.25));
  }
  .yt-podcast-ep-title {
    font-size: 13px;
    font-weight: 600;
    color: #e2e8f0;
  }
  .yt-podcast-now-playing {
    font-size: 11.5px;
    color: var(--md-sys-color-primary, #7dd3fc);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    margin-top: 2px;
  }
  .yt-podcast-player-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .yt-podcast-qa-bar {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 10px;
  }
  .yt-podcast-qa-input {
    flex: 1 1 180px;
    min-width: 0;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 18px;
    padding: 7px 14px;
    color: #f1f5f9;
    font-size: 12.5px;
    outline: none;
  }
  .yt-podcast-qa-input:focus {
    border-color: var(--md-sys-color-primary, #3ea6ff);
  }
  .yt-podcast-dialogue-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .yt-podcast-turn {
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .yt-podcast-turn:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .yt-podcast-turn.active {
    border-color: var(--yt-accent-border-strong, rgba(56, 189, 248, 0.65));
    background: var(--yt-accent-tint, rgba(56, 189, 248, 0.12));
  }
  .yt-podcast-turn-user {
    background: var(--yt-accent-tint, rgba(62, 166, 255, 0.14));
    border-color: var(--yt-accent-border, rgba(62, 166, 255, 0.4));
    cursor: default;
  }
  .yt-podcast-turn-reply {
    border-color: rgba(52, 211, 153, 0.4);
    background: rgba(52, 211, 153, 0.08);
  }
  .yt-podcast-turn-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .yt-podcast-turn-speaker {
    font-size: 12px;
    font-weight: 700;
  }
  .yt-podcast-turn-role {
    font-size: 10.5px;
    color: #94a3b8;
  }
  .yt-podcast-ts-jump {
    background: transparent;
    border: none;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    padding: 0 2px;
  }
  .yt-podcast-turn-text {
    font-size: 13px;
    line-height: 1.5;
    color: #e2e8f0;
  }
  .yt-podcast-empty {
    padding: 20px 14px;
    text-align: center;
    font-size: 13px;
    color: #94a3b8;
    border: 1px dashed rgba(255, 255, 255, 0.15);
    border-radius: 10px;
  }
  .yt-win-compact .yt-podcast-hosts-grid {
    grid-template-columns: 1fr;
  }
  .yt-podcast-gen-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: rgba(56, 189, 248, 0.16);
    color: #7dd3fc;
    border: 1px solid rgba(56, 189, 248, 0.35);
    width: fit-content;
  }
  .yt-win-title-col {
    flex: 1;
    min-width: 0;
  }
  .yt-win-title-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
  }
  .yt-win-title-switch-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: var(--yt-spec-text-primary, #f1f1f1);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    margin-top: 1px;
    transition: background 0.15s, border-color 0.15s;
  }
  .yt-win-title-switch-btn:hover {
    background: var(--yt-accent-tint, rgba(62, 166, 255, 0.22));
    border-color: var(--yt-accent-border, rgba(62, 166, 255, 0.55));
  }
  .yt-win-title-switch-btn.active-ai {
    background: var(--yt-accent-tint, rgba(62, 166, 255, 0.18));
    border-color: var(--yt-accent-border, rgba(62, 166, 255, 0.5));
    color: var(--md-sys-color-primary, #7dd3fc);
  }
  .yt-win-title {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    flex: 1;
    min-width: 0;
  }
  .yt-win-status-line {
    font-size: 12px;
    color: var(--yt-spec-text-secondary, #aaa);
    margin-top: 2px;
  }
  .yt-win-header-btns {
    display: flex;
    gap: 8px;
    margin-left: 12px;
  }
  .yt-win-btn {
    background: transparent;
    border: none;
    color: var(--yt-spec-text-primary, #f1f1f1);
    cursor: pointer;
    padding: 6px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .yt-win-btn:hover {
    background: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
  }
  .yt-win-btn.copied {
    color: #81c784 !important;
    background: rgba(129, 199, 132, 0.2) !important;
  }
  .yt-win-toolbar {
    padding: 8px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
    flex-shrink: 0;
  }
  .yt-toolbar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }
  .yt-segmented-btn {
    display: flex;
    border-radius: 8px;
    background: rgba(255,255,255,0.08);
    overflow: hidden;
  }
  .yt-seg-btn {
    background: transparent;
    border: none;
    color: var(--yt-spec-text-secondary, #aaa);
    font-size: 12px;
    font-weight: 500;
    padding: 6px 12px;
    cursor: pointer;
  }
  .yt-seg-btn.active {
    background: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.15));
    color: var(--yt-spec-text-primary, #f1f1f1);
  }
  .yt-control-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
  }
  :host, .yt-window-box, .yt-select, .yt-adv-select, .yt-key-dialog-box {
    color-scheme: dark;
  }
  .yt-select {
    color-scheme: dark;
    background: #212121;
    color: var(--yt-spec-text-primary, #f1f1f1);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px;
    font-size: 12px;
    padding: 6px 8px;
    cursor: pointer;
    max-width: min(220px, 100%);
    min-width: 0;
  }
  .yt-select option, .yt-select optgroup, .yt-adv-select option, .yt-adv-select optgroup {
    background-color: #212121 !important;
    color: #f1f1f1 !important;
    color-scheme: dark;
  }
  .yt-select optgroup, .yt-adv-select optgroup {
    background-color: #181818 !important;
    color: var(--md-sys-color-primary, #3ea6ff) !important;
    font-weight: 600;
  }
  .yt-tts-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 16px;
    padding: 3px 6px;
    gap: 3px 4px;
    max-width: 100%;
    min-width: 0;
    flex: 0 1 auto;
    box-sizing: border-box;
  }
  .yt-tts-btn {
    background: transparent;
    border: none;
    color: var(--yt-spec-text-primary, #f1f1f1);
    font-size: 12px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 14px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: background 0.15s, color 0.15s;
  }
  .yt-tts-btn:hover:not(:disabled) {
    background: rgba(255,255,255,0.12);
  }
  .yt-tts-btn.active {
    background: var(--md-sys-color-primary, #3ea6ff);
    color: var(--md-sys-color-on-primary, #0f0f0f);
    font-weight: 600;
  }
  .yt-tts-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .yt-tts-speed-btn {
    padding: 3px 8px;
    font-family: monospace;
    font-size: 11px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--yt-spec-text-primary, #fff);
  }
  .yt-tts-speed-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(56, 189, 248, 0.4);
  }
  .yt-tts-speed-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }
  .yt-tts-speed-indicator.speed-normal {
    background: #38bdf8;
    box-shadow: 0 0 6px rgba(56, 189, 248, 0.8);
  }
  .yt-tts-speed-indicator.speed-boost {
    background: #f59e0b;
    box-shadow: 0 0 6px rgba(245, 158, 11, 0.85);
  }
  .yt-tts-speed-indicator.speed-slow {
    background: #c084fc;
    box-shadow: 0 0 6px rgba(192, 132, 252, 0.85);
  }
  .yt-tts-skip-silence-btn {
    padding: 3px 8px;
    font-size: 11px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    gap: 4px;
  }
  .yt-tts-skip-silence-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }
  .yt-tts-skip-silence-btn.active {
    background: rgba(56, 189, 248, 0.2);
    border-color: rgba(56, 189, 248, 0.45);
    color: #38bdf8;
    font-weight: 600;
  }
  .yt-tts-waveform-wrap {
    display: inline-flex;
    align-items: center;
    position: relative;
    height: 24px;
    padding: 0 4px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    overflow: hidden;
    vertical-align: middle;
    margin: 0 2px;
    transition: border-color 0.2s ease, background 0.2s ease;
  }
  .yt-tts-waveform-wrap.playing {
    background: rgba(56, 189, 248, 0.08);
    border-color: rgba(56, 189, 248, 0.25);
  }
  .yt-tts-waveform-canvas {
    display: block;
    width: 68px;
    height: 18px;
  }
  .yt-tts-waveform-bars {
    display: none;
    align-items: center;
    gap: 2px;
    height: 18px;
  }
  .yt-tts-waveform-bar {
    width: 3px;
    height: 3px;
    min-height: 2px;
    max-height: 16px;
    background: #38bdf8;
    border-radius: 1.5px;
    transition: height 0.08s ease;
  }
  .yt-tts-volume-wrap {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 4px;
    height: 26px;
    max-width: 100%;
    min-width: 0;
  }
  .yt-tts-volume-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--yt-spec-text-secondary, #aaa);
    opacity: 0.85;
    flex-shrink: 0;
  }
  .yt-tts-volume-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 58px;
    height: 4px;
    background: rgba(255, 255, 255, 0.25);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
    vertical-align: middle;
    margin: 0;
    transition: background 0.15s;
  }
  .yt-tts-volume-slider:hover {
    background: rgba(255, 255, 255, 0.4);
  }
  .yt-tts-volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--md-sys-color-primary, #3ea6ff);
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0,0,0,0.5);
    transition: transform 0.1s;
  }
  .yt-tts-volume-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }
  .yt-tts-volume-slider::-moz-range-thumb {
    width: 10px;
    height: 10px;
    border: none;
    border-radius: 50%;
    background: var(--md-sys-color-primary, #3ea6ff);
    cursor: pointer;
  }
  .yt-tts-volume-label {
    font-size: 10px;
    font-family: monospace;
    color: var(--yt-spec-text-secondary, #aaa);
    min-width: 28px;
    text-align: right;
  }
  .yt-tts-pitch-wrap {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 4px;
    height: 26px;
    max-width: 100%;
    min-width: 0;
  }
  .yt-tts-pitch-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--yt-spec-text-secondary, #aaa);
    opacity: 0.85;
    flex-shrink: 0;
  }
  .yt-tts-pitch-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 54px;
    height: 4px;
    background: rgba(255, 255, 255, 0.25);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
    vertical-align: middle;
    margin: 0;
    transition: background 0.15s;
  }
  .yt-tts-pitch-slider:hover {
    background: rgba(255, 255, 255, 0.4);
  }
  .yt-tts-pitch-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #a855f7;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0,0,0,0.5);
    transition: transform 0.1s;
  }
  .yt-tts-pitch-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }
  .yt-tts-pitch-slider::-moz-range-thumb {
    width: 10px;
    height: 10px;
    border: none;
    border-radius: 50%;
    background: #a855f7;
    cursor: pointer;
  }
  .yt-tts-pitch-label {
    font-size: 10px;
    font-family: monospace;
    color: var(--yt-spec-text-secondary, #aaa);
    min-width: 28px;
    text-align: right;
  }
  .yt-readability-export-json-btn {
    border-color: rgba(168, 85, 247, 0.35) !important;
    color: #c084fc !important;
  }
  .yt-readability-export-json-btn:hover {
    background: rgba(168, 85, 247, 0.15) !important;
  }
  .yt-tts-speed-wrap {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    padding: 2px 6px;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .yt-tts-speed-btns {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    max-width: 100%;
    min-width: 0;
  }
  .yt-tts-rate-pill {
    background: transparent;
    border: none;
    color: #aaa;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 5px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    line-height: 1.2;
  }
  .yt-tts-rate-pill:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }
  .yt-tts-rate-pill.active {
    background: var(--md-sys-color-primary, #3ea6ff);
    color: var(--md-sys-color-on-primary, #000);
    font-weight: 700;
  }
  .yt-tts-rate-pill:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .yt-tts-slider-row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    padding-left: 6px;
  }
  .yt-tts-speed-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 44px;
    height: 3px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.25);
    outline: none;
    cursor: pointer;
    vertical-align: middle;
    margin: 0;
    transition: background 0.15s;
  }
  .yt-tts-speed-slider:hover {
    background: rgba(255, 255, 255, 0.4);
  }
  .yt-tts-speed-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--md-sys-color-primary, #3ea6ff);
    cursor: pointer;
  }
  .yt-tts-speed-slider::-moz-range-thumb {
    width: 10px;
    height: 10px;
    border: none;
    border-radius: 50%;
    background: var(--md-sys-color-primary, #3ea6ff);
    cursor: pointer;
  }
  .yt-tts-speed-label {
    font-size: 10px;
    font-family: monospace;
    color: #aaa;
    min-width: 22px;
    text-align: right;
  }
  .yt-tts-voice-select {
    max-width: min(175px, 100%);
    min-width: 0;
    flex: 0 1 160px;
    box-sizing: border-box;
    padding: 3px 8px;
    font-size: 11px;
    height: 26px;
    border-radius: 13px;
    border: 1px solid rgba(255,255,255,0.15);
    background: #212121;
    color: #f1f1f1;
    color-scheme: dark;
  }
  .yt-tts-rewind-btn, .yt-tts-skip-btn {
    padding: 4px 7px;
    font-family: monospace;
    font-size: 11px;
    font-weight: 600;
  }
  .yt-tts-shortcuts-hint {
    display: inline-flex;
    align-items: center;
    font-size: 10px;
    color: var(--yt-spec-text-secondary, #888);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 2px 7px;
    margin-left: 2px;
    cursor: help;
    user-select: none;
    letter-spacing: 0.2px;
    transition: color 0.15s, background 0.15s;
  }
  .yt-tts-shortcuts-hint:hover {
    color: var(--md-sys-color-primary, #3ea6ff);
    background: var(--yt-accent-tint, rgba(62, 166, 255, 0.1));
    border-color: var(--yt-accent-border, rgba(62, 166, 255, 0.25));
  }
  .yt-tts-toast {
    position: absolute;
    top: 56px;
    left: 50%;
    transform: translateX(-50%) translateY(-6px);
    background: rgba(18, 18, 22, 0.94);
    color: #f1f1f1;
    border: 1px solid rgba(255, 255, 255, 0.18);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.7);
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.16s ease, transform 0.16s ease;
    z-index: 2147483010;
    letter-spacing: 0.3px;
    backdrop-filter: blur(8px);
  }
  .yt-tts-toast.yt-tts-toast-show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  .yt-transcript-search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .yt-transcript-input-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #212121;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 4px 8px;
    flex: 1;
    min-width: 200px;
  }
  .yt-transcript-search-input {
    background: transparent;
    border: none;
    color: #f1f1f1;
    font-size: 12px;
    outline: none;
    width: 100%;
  }
  .yt-transcript-search-input::placeholder {
    color: #888;
  }
  .yt-transcript-clear-btn {
    background: transparent;
    border: none;
    color: #888;
    cursor: pointer;
    padding: 2px;
    border-radius: 50%;
    display: flex;
    align-items: center;
  }
  .yt-transcript-clear-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
  }
  .yt-transcript-match-count {
    font-size: 11px;
    color: #aaa;
    font-family: monospace;
    white-space: nowrap;
  }
  .yt-transcript-nav-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #f1f1f1;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 10px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .yt-transcript-nav-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
  }
  .yt-transcript-nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .yt-follow-along-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
    color: #bbb;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .yt-follow-along-btn.active {
    background: var(--yt-accent-tint, rgba(62, 166, 255, 0.18));
    border-color: var(--yt-accent-border, rgba(62, 166, 255, 0.48));
    color: var(--md-sys-color-primary, #3ea6ff);
  }
  .yt-player-seek-badge {
    position: absolute;
    top: 8px;
    left: 10px;
    z-index: 4;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(10, 10, 12, 0.85);
    border: 1px solid var(--yt-accent-border, rgba(62, 166, 255, 0.45));
    color: var(--md-sys-color-primary, #3ea6ff);
    font-size: 11px;
    font-family: monospace;
    font-weight: 600;
  }
  .yt-chapter-bar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    margin-bottom: 10px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
  }
  .yt-chapter-meta {
    font-size: 11px;
    font-weight: 600;
    color: #93c5fd;
    letter-spacing: 0.2px;
  }
  .yt-chapter-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .yt-chapter-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(24, 24, 27, 0.9);
    color: #e4e4e7;
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    max-width: 100%;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .yt-chapter-btn:hover {
    border-color: var(--yt-accent-border, rgba(62, 166, 255, 0.55));
    background: var(--yt-accent-tint, rgba(62, 166, 255, 0.12));
    color: #fff;
  }
  .yt-chapter-btn.active {
    border-color: var(--md-sys-color-primary, #3ea6ff);
    background: var(--yt-accent-tint, rgba(62, 166, 255, 0.2));
    color: var(--md-sys-color-primary, #7dd3fc);
  }
  .yt-chapter-ts {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    color: var(--md-sys-color-primary, #3ea6ff);
    font-weight: 600;
  }
  .yt-chapter-title {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .yt-transcript-line {
    padding: 4px 6px;
    border-radius: 4px;
    line-height: 1.5;
    transition: background 0.15s;
  }
  .yt-transcript-line:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .yt-transcript-line.yt-transcript-line-speaking {
    background: var(--md-sys-color-primary-container) !important;
    border: 1px solid var(--md-sys-color-primary) !important;
    padding: 6px 10px !important;
    border-radius: 10px;
    transition: all 0.2s ease;
  }
  .yt-transcript-line.yt-transcript-line-speaking .yt-ts-link {
    color: var(--md-sys-color-on-primary-container) !important;
    font-weight: 700 !important;
  }
  .yt-transcript-line.yt-transcript-line-speaking .yt-transcript-text {
    color: var(--md-sys-color-on-primary-container) !important;
    font-weight: 500 !important;
  }
  .yt-speaking-indicator {
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    margin-right: 6px;
    color: var(--md-sys-color-primary, #3ea6ff);
    animation: yt-pulse-speaking 1.2s infinite ease-in-out;
  }
  @keyframes yt-pulse-speaking {
    0%, 100% { opacity: 0.7; transform: scale(0.95); }
    50% { opacity: 1; transform: scale(1.1); }
  }
  .yt-transcript-highlight {
    background: #fbc02d;
    color: #000;
    padding: 1px 3px;
    border-radius: 3px;
    font-weight: 600;
  }
  .yt-transcript-highlight.active {
    background: #ff7043;
    color: #fff;
    outline: 2px solid #fff;
  }
  .yt-icon-tool-btn {
    background: transparent;
    border: none;
    color: var(--yt-spec-text-secondary, #aaa);
    padding: 6px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
  }
  .yt-icon-tool-btn:hover {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }
  .yt-spacer {
    flex: 1;
  }
  .yt-primary-btn {
    background: var(--md-sys-color-primary, var(--yt-spec-call-to-action, #3ea6ff));
    color: var(--md-sys-color-on-primary, #0f0f0f);
    border: none;
    border-radius: 18px;
    font-size: 13px;
    font-weight: 600;
    padding: 6px 16px;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .yt-primary-btn:hover {
    opacity: 0.9;
  }
  .yt-sec-btn {
    background: rgba(255,255,255,0.1);
    color: var(--yt-spec-text-primary, #f1f1f1);
    border: none;
    border-radius: 18px;
    font-size: 12px;
    padding: 6px 14px;
    cursor: pointer;
  }
  .yt-sec-btn:hover {
    background: rgba(255,255,255,0.18);
  }
  .yt-ask-fallback-btn {
    background: linear-gradient(135deg, #7c4dff, var(--md-sys-color-primary, #3ea6ff)) !important;
    color: #fff !important;
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(124, 77, 255, 0.4);
  }
  .yt-ask-fallback-btn:hover {
    filter: brightness(1.1);
  }
  .yt-options-row {
    font-size: 12px;
    color: var(--yt-spec-text-secondary, #aaa);
  }
  .yt-checkbox-label {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }
  .yt-checkbox-label.off {
    opacity: 0.4;
    pointer-events: none;
  }
  .yt-link-btn {
    background: transparent;
    border: none;
    color: var(--yt-spec-call-to-action, #3ea6ff);
    font-size: 12px;
    cursor: pointer;
  }
  .yt-adv-panel {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    padding: 12px 16px;
    background: rgba(0,0,0,0.25);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    max-height: 36vh;
    overflow-y: auto;
  }
  .yt-adv-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .yt-adv-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--yt-spec-text-primary, #f1f1f1);
    border-bottom: 1px solid rgba(255,255,255,0.05);
    padding-bottom: 4px;
  }
  .yt-adv-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    gap: 8px;
  }
  .yt-adv-select {
    max-width: 130px;
    padding: 2px 4px;
  }
  .yt-player-slot {
    position: relative;
    width: 100%;
    aspect-ratio: 16/9;
    max-height: 280px;
    background: #000;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .yt-player-iframe {
    width: 100%;
    height: 100%;
    border: none;
  }
  .yt-player-close-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
    background: rgba(0,0,0,0.7);
    color: #fff;
    border: none;
    border-radius: 50%;
    padding: 6px;
    cursor: pointer;
  }
  .yt-window-body {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .yt-loading-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 16px;
    text-align: center;
  }
  .yt-loading-text {
    font-size: 15px;
    font-weight: 500;
    margin-bottom: 6px;
  }
  .yt-loading-phase {
    font-size: 13px;
    color: var(--yt-spec-call-to-action, #3ea6ff);
    margin-bottom: 12px;
  }
  .yt-loading-tip {
    font-size: 12px;
    color: var(--yt-spec-text-secondary, #aaa);
    max-width: 380px;
  }
  .yt-error-view {
    padding: 24px;
    background: rgba(168, 32, 26, 0.15);
    border: 1px solid rgba(168, 32, 26, 0.4);
    border-radius: 12px;
  }
  .yt-error-title {
    font-size: 15px;
    font-weight: 600;
    color: #ff8580;
    margin-bottom: 8px;
  }
  .yt-error-msg {
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    margin-bottom: 16px;
  }
  .yt-error-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .yt-notes-wrap {
    background: var(--md-sys-color-tertiary-container);
    color: var(--md-sys-color-on-tertiary-container);
    border: 1px solid var(--md-sys-color-outline-variant);
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 12px;
    line-height: 1.4;
  }
  .yt-note-line {
    margin: 2px 0;
  }
  .yt-markdown-body {
    font-family: var(--yt-gen-font, inherit);
    font-size: var(--yt-gen-font-size, 14px);
    line-height: var(--yt-gen-line-height, 1.6);
  }
  .yt-md-p {
    margin: var(--yt-gen-para-gap, 8px) 0;
  }
  .yt-md-list {
    margin: var(--yt-gen-para-gap, 8px) 0;
    padding-left: 20px;
  }
  .yt-md-nested-li {
    margin-left: 16px;
    list-style-type: circle;
  }
  .yt-ts-link {
    color: var(--yt-spec-call-to-action, #3ea6ff);
    text-decoration: none;
    font-weight: 500;
    cursor: pointer;
  }
  .yt-ts-link:hover {
    text-decoration: underline;
  }
  .yt-ext-link {
    color: #64b5f6;
    text-decoration: none;
  }
  .yt-ext-link:hover {
    text-decoration: underline;
  }
  .yt-visual-card {
    margin: 12px 0;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    overflow: hidden;
    max-width: 440px;
  }
  .yt-frame-preview {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    min-height: 150px;
    cursor: pointer;
    background-color: #111;
    background-repeat: no-repeat;
    overflow: hidden;
  }
  .yt-frame-fallback-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: opacity 0.2s ease;
  }
  .yt-frame-badge {
    position: absolute;
    bottom: 8px;
    left: 8px;
    z-index: 2;
    background: rgba(0,0,0,0.78);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 6px;
  }
  .yt-commons-fallback {
    padding: 10px 10px 4px;
    color: inherit;
  }
  .yt-commons-fallback-svg {
    width: 100%;
    height: auto;
    display: block;
    border-radius: 6px;
  }
  .yt-commons-loading {
    padding: 14px 12px;
    font-size: 12px;
    color: var(--yt-spec-text-secondary, #aaa);
  }
  .yt-visual-caption {
    padding: 8px 10px;
    font-size: 12px;
    color: var(--yt-spec-text-secondary, #bbb);
    line-height: 1.4;
  }
  .yt-commons-img, .yt-ai-img {
    width: 100%;
    display: block;
    cursor: pointer;
  }
  .yt-fact-box {
    margin-top: 16px;
    background: rgba(129,199,132,0.06);
    border: 1px solid rgba(129,199,132,0.28);
    border-radius: 12px;
    padding: 12px 14px;
  }
  .yt-fact-box.yt-fact-error {
    background: rgba(244,67,54,0.08);
    border-color: rgba(244,67,54,0.32);
  }
  .yt-fact-box.yt-fact-off,
  .yt-fact-box.yt-fact-pending {
    background: rgba(255,255,255,0.03);
    border-color: rgba(255,255,255,0.12);
  }
  .yt-fact-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .yt-fact-header {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 6px;
    color: #81c784;
  }
  .yt-fact-header-row .yt-fact-header {
    margin-bottom: 0;
  }
  .yt-fact-model-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(129,199,132,0.14);
    color: #a5d6a7;
    font-weight: 500;
  }
  .yt-fact-status-line {
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--yt-spec-text-secondary, #cfcfcf);
  }
  .yt-fact-error-msg {
    font-size: 12.5px;
    line-height: 1.45;
    color: #ef9a9a;
  }
  .yt-fact-box.yt-fact-error .yt-fact-header {
    color: #ef9a9a;
  }
  .yt-sources-consulted {
    margin-top: 10px;
    font-size: 11px;
    border-top: 1px solid rgba(255,255,255,0.08);
    padding-top: 8px;
  }
  .yt-sources-title {
    font-weight: 600;
    margin-bottom: 4px;
  }
  .yt-source-item {
    margin: 2px 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .yt-fact-recheck-bar {
    margin-top: 10px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
  .yt-thread-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
  }
  .yt-bubble {
    max-width: 80%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.4;
  }
  .yt-user-bubble {
    align-self: flex-end;
    background: var(--md-sys-color-primary, var(--yt-spec-call-to-action, #3ea6ff));
    color: var(--md-sys-color-on-primary, #0f0f0f);
    font-weight: 500;
    border-bottom-right-radius: 2px;
  }
  .yt-turn-user-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .yt-turn-user-text {
    flex: 1;
    min-width: 0;
  }
  .yt-turn-edit-btn {
    background: rgba(0, 0, 0, 0.14);
    border: 1px solid rgba(0, 0, 0, 0.18);
    color: inherit;
    border-radius: 6px;
    padding: 3px 5px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    opacity: 0.8;
  }
  .yt-turn-edit-btn:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.24);
  }
  .yt-turn-edit-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 220px;
  }
  .yt-turn-edit-input {
    width: 100%;
    box-sizing: border-box;
    border-radius: 8px;
    border: 1px solid rgba(0, 0, 0, 0.25);
    background: rgba(255, 255, 255, 0.92);
    color: #0f0f0f;
    padding: 6px 8px;
    font-size: 12.5px;
    font-family: inherit;
    resize: vertical;
  }
  .yt-turn-edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .yt-ans-bubble {
    align-self: flex-start;
    background: var(--yt-spec-badge-chip-background, rgba(255,255,255,0.08));
    color: var(--yt-spec-text-primary, #f1f1f1);
    border-bottom-left-radius: 2px;
  }
  .yt-turn-ans-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .yt-turn-ver-pager {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    padding: 2px 6px;
  }
  .yt-turn-ver-btn {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border-radius: 50%;
  }
  .yt-turn-ver-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .yt-turn-ver-label {
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 0 3px;
  }
  .yt-turn-model-pill {
    font-size: 10.5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    color: #94a3b8;
  }
  .yt-turn-regen-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: inherit;
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 11px;
    cursor: pointer;
  }
  .yt-turn-regen-btn:hover {
    background: var(--yt-accent-tint, rgba(62, 166, 255, 0.2));
    border-color: var(--yt-accent-border, rgba(62, 166, 255, 0.45));
  }
  .yt-followup-busy {
    font-size: 12px;
    color: var(--yt-spec-call-to-action, #3ea6ff);
    font-style: italic;
    padding: 6px 12px;
  }
  .yt-composer-wrap {
    padding: var(--yt-ui-density-pad, 10px) 16px;
    border-top: 1px solid rgba(255,255,255,0.08);
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    background: var(--md-sys-color-surface-container, #1d2026);
  }
  .yt-composer-model-select {
    max-width: 155px;
    font-size: 11px;
    height: 32px;
    flex-shrink: 0;
  }
  .yt-composer-textarea {
    flex: 1;
    min-width: 180px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 19px;
    padding: 8px 16px;
    color: var(--yt-spec-text-primary, #f1f1f1);
    font-family: var(--yt-ui-font, inherit);
    font-size: var(--yt-ui-font-size, 13px);
    resize: none;
    outline: none;
    line-height: 1.4;
  }
  .yt-composer-textarea:focus {
    border-color: var(--md-sys-color-primary, var(--yt-spec-call-to-action, #3ea6ff));
  }
  .yt-composer-draft-badge {
    display: none;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 600;
    color: #fbbf24;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.35);
    border-radius: 12px;
    white-space: nowrap;
    align-self: center;
  }
  .yt-composer-send-btn {
    background: var(--md-sys-color-primary, var(--yt-spec-call-to-action, #3ea6ff));
    color: var(--md-sys-color-on-primary, #0f0f0f);
    border: none;
    border-radius: 18px;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 16px;
    cursor: pointer;
  }
  .yt-composer-mic-btn {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 50%;
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--yt-spec-text-secondary, #aaa);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }
  .yt-composer-mic-btn:hover:not(:disabled) {
    background: rgba(255,255,255,0.15);
    color: var(--yt-spec-text-primary, #fff);
  }
  .yt-composer-mic-btn.yt-mic-recording {
    background: #ef4444 !important;
    color: #fff !important;
    border-color: #f87171 !important;
    box-shadow: 0 0 10px rgba(239, 68, 68, 0.6);
    animation: yt-pulse-record 1.2s infinite ease-in-out;
  }
  @keyframes yt-pulse-record {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.08); opacity: 0.85; }
  }
  .yt-composer-mic-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .yt-composer-send-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .yt-key-dialog-box {
    background: var(--md-sys-color-surface-container-low, #191c22);
    color: var(--md-sys-color-on-surface, #e2e2e9);
    font-family: var(--yt-ui-font, inherit);
    font-size: var(--yt-ui-font-size, 13px);
    border-radius: 20px;
    padding: 0;
    box-shadow: 0 16px 48px rgba(0,0,0,0.65);
    border: 1px solid var(--md-sys-color-outline-variant, rgba(255,255,255,0.12));
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .yt-settings-tabs {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant, rgba(255,255,255,0.1));
    background: var(--md-sys-color-surface-container, #1e2128);
    overflow-x: auto;
    flex-shrink: 0;
  }
  .yt-settings-tab {
    border: 1px solid var(--md-sys-color-outline-variant, rgba(255,255,255,0.14));
    background: transparent;
    color: var(--md-sys-color-on-surface-variant, #c3c6cf);
    font-size: 11px;
    font-weight: 600;
    padding: 5px 11px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .yt-settings-tab:hover {
    color: var(--md-sys-color-on-surface, #fff);
    background: var(--md-sys-color-surface-container-high, rgba(255,255,255,0.08));
  }
  .yt-settings-tab.active {
    background: var(--md-sys-color-primary-container, #1c4a73);
    color: var(--md-sys-color-on-primary-container, #d3e4ff);
    border-color: var(--md-sys-color-primary, #a3c9ff);
  }
  .yt-settings-scroll-body {
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px 18px 18px 18px;
  }
  .yt-settings-section-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--md-sys-color-surface-container, rgba(255,255,255,0.03));
    border: 1px solid var(--md-sys-color-outline-variant, rgba(255,255,255,0.09));
    border-radius: 14px;
    padding: 12px;
  }
  .yt-settings-host-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .yt-settings-group-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--md-sys-color-primary, #a3c9ff);
    margin-bottom: 2px;
  }
  .yt-setting-label {
    flex: 1;
    font-size: 12px;
    font-weight: 500;
  }
  .yt-setting-val {
    font-size: 11px;
    font-family: monospace;
    min-width: 36px;
    text-align: right;
    color: var(--md-sys-color-on-surface-variant, #c3c6cf);
  }
  .yt-setting-range {
    width: 110px;
    accent-color: var(--md-sys-color-primary, #a3c9ff);
  }
  .yt-accent-picker-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    border-radius: 12px;
    border: 1px solid var(--md-sys-color-outline-variant, rgba(255,255,255,0.12));
    background: var(--md-sys-color-surface-container-low, rgba(255,255,255,0.03));
  }
  .yt-accent-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .yt-accent-reset-btn {
    padding: 4px 10px;
    font-size: 11px;
    border-radius: 8px;
  }
  .yt-accent-picker-body {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
  }
  .yt-accent-color-wheel {
    position: relative;
    width: 132px;
    height: 132px;
    border-radius: 50%;
    flex-shrink: 0;
    cursor: crosshair;
    border: 2px solid var(--md-sys-color-outline-variant, rgba(255,255,255,0.22));
    background:
      radial-gradient(circle closest-side, #ffffff 0%, rgba(255,255,255,0) 100%),
      conic-gradient(from 90deg, #ff0000 0deg, #ffff00 60deg, #00ff00 120deg, #00ffff 180deg, #0000ff 240deg, #ff00ff 300deg, #ff0000 360deg);
    box-shadow: inset 0 0 8px rgba(0,0,0,0.25);
    outline: none;
    user-select: none;
  }
  .yt-accent-color-wheel:focus-visible {
    box-shadow: 0 0 0 2px var(--md-sys-color-primary);
  }
  .yt-accent-wheel-thumb {
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid #ffffff;
    box-shadow: 0 0 0 1.5px rgba(0,0,0,0.65), 0 2px 5px rgba(0,0,0,0.45);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .yt-accent-right-col {
    flex: 1 1 200px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .yt-accent-swatches-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
  }
  .yt-accent-swatch {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.25);
    cursor: pointer;
    padding: 0;
    transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease;
    box-shadow: inset 0 1px 2px rgba(255,255,255,0.4);
  }
  .yt-accent-swatch:hover {
    transform: scale(1.12);
    border-color: var(--md-sys-color-on-surface);
  }
  .yt-accent-swatch.active {
    border-color: #ffffff;
    box-shadow: 0 0 0 2px var(--md-sys-color-primary), 0 2px 8px rgba(0,0,0,0.35);
    transform: scale(1.1);
  }
  .yt-accent-inputs-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .yt-accent-color-input {
    width: 36px;
    height: 28px;
    padding: 1px;
    border-radius: 6px;
    border: 1px solid var(--md-sys-color-outline-variant);
    background: transparent;
    cursor: pointer;
  }
  .yt-accent-hex-input {
    flex: 1;
    min-width: 110px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .yt-dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .yt-dialog-header h3 {
    margin: 0;
    font-size: 16px;
  }
  .yt-dialog-info {
    font-size: 12px;
    color: var(--md-sys-color-on-surface-variant, #aaa);
    line-height: 1.4;
  }
  .yt-keys-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 200px;
    overflow-y: auto;
  }
  .yt-key-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--md-sys-color-surface-container-high, rgba(255,255,255,0.05));
    padding: 6px 10px;
    border-radius: 10px;
  }
  .yt-input {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: var(--md-sys-color-on-surface, #fff);
    padding: 6px 10px;
    font-size: 12px;
    outline: none;
  }
  .yt-key-name-input {
    flex: 1;
  }
  .yt-key-mask {
    font-size: 12px;
    color: #aaa;
    font-family: monospace;
  }
  .yt-del-btn {
    background: rgba(168, 32, 26, 0.4);
    color: #ff8580;
  }
  .yt-add-key-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px solid var(--md-sys-color-outline-variant, rgba(255,255,255,0.08));
    padding-top: 12px;
  }
  .yt-quick-menu-box {
    border-radius: 18px;
    padding: 0;
  }
  .yt-quick-menu-body {
    padding: var(--yt-ui-density-pad, 12px);
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    flex: 1;
  }
  .yt-quick-menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    background: var(--md-sys-color-surface-container-high, rgba(255,255,255,0.06));
    border: 1px solid var(--md-sys-color-outline-variant, rgba(255,255,255,0.1));
    border-radius: 12px;
    padding: 10px 12px;
    color: var(--md-sys-color-on-surface, #e2e2e9);
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .yt-quick-menu-item:hover {
    background: var(--md-sys-color-secondary-container, rgba(163, 201, 255, 0.18));
    border-color: var(--md-sys-color-primary, #a3c9ff);
  }
  .yt-quick-menu-item-title {
    font-size: 13px;
    font-weight: 600;
  }
  .yt-quick-menu-item-sub {
    font-size: 11px;
    color: var(--md-sys-color-on-surface-variant, #c3c6cf);
  }

  /* History dock tab */
  .yt-dock-history-tab {
    background: linear-gradient(135deg, var(--yt-accent-tint, rgba(62, 166, 255, 0.15)), rgba(168, 85, 247, 0.15));
    border: 1px solid var(--yt-accent-border, rgba(62, 166, 255, 0.35));
  }
  .yt-dock-history-tab:hover {
    background: linear-gradient(135deg, var(--yt-accent-tint-strong, rgba(62, 166, 255, 0.25)), rgba(168, 85, 247, 0.25));
  }
  .yt-dock-history-title {
    font-weight: 600;
    color: var(--md-sys-color-primary, #e0e7ff);
  }
  .yt-dock-open-history-btn {
    opacity: 0.8;
  }
  .yt-dock-open-history-btn:hover {
    opacity: 1;
    background: rgba(255,255,255,0.15);
  }

  /* Clickable title anchor */
  .yt-win-title-link {
    text-decoration: none;
    color: inherit;
    cursor: pointer;
    display: inline-block;
    transition: color 0.15s ease;
  }
  .yt-win-title-link:hover {
    color: var(--yt-spec-call-to-action, #3ea6ff);
    text-decoration: underline;
  }

  /* Summary page top bar & Action pills */
  .yt-summary-page-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 8px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .yt-action-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 11px;
    border-radius: 14px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s ease;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: var(--yt-spec-text-primary, #f1f1f1);
  }
  .yt-action-pill:hover {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.25);
    color: #fff;
  }
  .yt-open-video-pill {
    color: #93c5fd;
    border-color: rgba(147, 197, 253, 0.3);
    background: rgba(59, 130, 246, 0.1);
  }
  .yt-open-video-pill:hover {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(147, 197, 253, 0.5);
    color: #bfdbfe;
  }
  .yt-history-pill {
    color: #d8b4fe;
    border-color: rgba(216, 180, 254, 0.3);
    background: rgba(168, 85, 247, 0.1);
  }
  .yt-history-pill:hover {
    background: rgba(168, 85, 247, 0.2);
    border-color: rgba(216, 180, 254, 0.5);
    color: #e9d5ff;
  }

  /* History Dialog Floating Window (Movable, Resizable & Theme-Synced) */
  .yt-history-dialog-box {
    background: var(--md-sys-color-surface-container-low, #191c22);
    color: var(--md-sys-color-on-surface, #e2e2e9);
    font-family: var(--yt-ui-font, inherit);
    font-size: var(--yt-ui-font-size, 13px);
    border-radius: 20px;
    padding: 0;
    box-shadow: 0 16px 48px rgba(0,0,0,0.65);
    border: 1px solid var(--md-sys-color-outline-variant, rgba(255,255,255,0.12));
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .yt-history-search-bar {
    display: flex;
    align-items: center;
    background: var(--md-sys-color-surface-container-high, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--md-sys-color-outline-variant, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    padding: 2px 10px;
    margin: 12px 16px 8px 16px;
  }
  .yt-history-search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--md-sys-color-on-surface, #fff);
    padding: 8px 6px;
    font-size: 13px;
  }
  .yt-history-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    flex: 1;
    padding: 6px 16px 12px 16px;
  }
  .yt-history-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 10px;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .yt-history-card:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(255, 255, 255, 0.15);
  }
  .yt-history-thumb-wrap {
    width: 96px;
    height: 54px;
    flex-shrink: 0;
    border-radius: 6px;
    overflow: hidden;
    background: #1a1a1a;
    cursor: pointer;
  }
  .yt-history-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .yt-history-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .yt-history-item-title {
    font-size: 13px;
    font-weight: 600;
    color: #f1f1f1;
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .yt-history-item-title:hover {
    color: var(--yt-spec-call-to-action, #3ea6ff);
    text-decoration: underline;
  }
  .yt-history-item-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #888;
  }
  .yt-history-badge {
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .yt-history-badge.mode {
    background: rgba(62, 166, 255, 0.18);
    color: #70baff;
  }
  .yt-history-badge.model {
    background: rgba(168, 85, 247, 0.18);
    color: #c084fc;
  }
  .yt-history-date {
    color: #888;
  }
  .yt-history-snippet {
    font-size: 12px;
    color: #aaa;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }
  .yt-history-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .yt-history-reopen-btn {
    padding: 6px 12px !important;
    font-size: 12px !important;
  }
  .yt-history-video-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px !important;
    font-size: 12px !important;
    text-decoration: none;
  }
  .yt-history-del-btn {
    padding: 6px 8px !important;
    color: #ff8580 !important;
  }
  .yt-history-empty {
    padding: 32px 16px;
    text-align: center;
    color: #888;
    font-size: 13px;
    line-height: 1.5;
  }
  .yt-history-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    border-top: 1px solid var(--md-sys-color-outline-variant, rgba(255, 255, 255, 0.08));
    padding: 12px 16px;
    background: var(--md-sys-color-surface-container, rgba(0,0,0,0.15));
  }

  /* Readability Mode & Distraction-Free Typography Layout */
  .yt-win-btn.yt-win-readability-btn.active {
    color: var(--md-sys-color-primary, #3ea6ff) !important;
    background: var(--yt-accent-tint, rgba(62, 166, 255, 0.2)) !important;
  }
  .yt-window-box.yt-readability-active .yt-win-toolbar,
  .yt-window-box.yt-readability-active .yt-adv-panel,
  .yt-window-box.yt-readability-active .yt-composer-wrap,
  .yt-window-box.yt-readability-active .yt-summary-page-bar {
    display: none !important;
  }
  .yt-window-box.yt-readability-active .yt-window-body {
    padding: 0;
    background: #0f0f0f;
  }
  .yt-readability-container {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    background: #0f0f0f;
  }
  .yt-readability-bar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 20px;
    background: rgba(18, 18, 18, 0.95);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex-wrap: wrap;
  }
  .yt-readability-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #f1f1f1;
    font-size: 12px;
    font-weight: 500;
    padding: 5px 12px;
    border-radius: 14px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .yt-readability-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.22);
  }
  .yt-readability-exit-btn {
    color: #ff8580;
    border-color: rgba(255, 133, 128, 0.3);
  }
  .yt-readability-exit-btn:hover {
    background: rgba(255, 133, 128, 0.15);
  }
  .yt-readability-sync-theme-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 11px;
    border-radius: 14px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .yt-readability-sync-theme-btn.active {
    background: rgba(14, 165, 233, 0.22) !important;
    border-color: #0ea5e9 !important;
    color: #38bdf8 !important;
    box-shadow: 0 0 8px rgba(14, 165, 233, 0.25);
  }
  .yt-readability-sync-theme-btn svg {
    transition: transform 0.3s ease;
  }
  .yt-readability-sync-theme-btn.active svg {
    transform: rotate(180deg);
  }
  .yt-readability-divider {
    width: 1px;
    height: 18px;
    background: rgba(255, 255, 255, 0.12);
    margin: 0 4px;
  }
  .yt-readability-theme-group {
    display: inline-flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    overflow: hidden;
  }
  .yt-readability-theme-btn {
    background: transparent;
    border: none;
    color: #bbb;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 10px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .yt-readability-theme-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }
  .yt-readability-theme-btn.active {
    background: var(--md-sys-color-primary, #3ea6ff);
    color: var(--md-sys-color-on-primary, #000);
    font-weight: 700;
  }
  .yt-readability-theme-select {
    display: none;
    height: 26px;
    padding: 2px 8px;
    font-size: 11px;
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }
  @media (max-width: 640px) {
    .yt-readability-theme-group { display: none; }
    .yt-readability-theme-select { display: inline-block; }
  }
  .yt-readability-size-group {
    display: inline-flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    overflow: hidden;
  }
  .yt-readability-size-btn {
    background: transparent;
    border: none;
    color: #ddd;
    font-size: 11px;
    font-weight: 700;
    padding: 5px 9px;
    cursor: pointer;
  }
  .yt-readability-size-btn:hover {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
  }
  .yt-readability-size-label {
    font-size: 11px;
    font-family: monospace;
    color: #aaa;
    padding: 0 4px;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
  }
  .yt-readability-stats {
    font-size: 12px;
    color: #aaa;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .yt-readability-content {
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
    padding: 40px 24px 80px 24px;
    line-height: 1.85;
    color: #e4e4e7;
    box-sizing: border-box;
  }
  .yt-readability-content.font-serif {
    font-family: Charter, Georgia, "Times New Roman", Cambria, serif;
    letter-spacing: 0.01em;
  }
  .yt-readability-content.font-sans {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    letter-spacing: normal;
  }
  .yt-readability-header {
    margin-bottom: 32px;
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }
  .yt-readability-type-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.75px;
    color: var(--md-sys-color-primary, #3ea6ff);
    background: var(--yt-accent-tint, rgba(62, 166, 255, 0.12));
    border: 1px solid var(--yt-accent-border, rgba(62, 166, 255, 0.25));
    padding: 3px 8px;
    border-radius: 4px;
    margin-bottom: 10px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .yt-readability-title {
    font-size: 1.7em;
    font-weight: 700;
    line-height: 1.3;
    margin: 0 0 10px 0;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .yt-readability-meta {
    font-size: 12px;
    color: #888;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .yt-readability-h2 {
    font-size: 1.35em;
    font-weight: 700;
    margin: 36px 0 14px 0;
    color: #fff;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .yt-readability-h3 {
    font-size: 1.15em;
    font-weight: 600;
    margin: 24px 0 10px 0;
    color: #f4f4f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .yt-readability-p {
    margin: 0 0 18px 0;
    color: #d4d4d8;
  }
  .yt-readability-ul, .yt-readability-ol {
    margin: 0 0 20px 0;
    padding-left: 28px;
  }
  .yt-readability-li {
    margin-bottom: 8px;
    color: #d4d4d8;
  }
  .yt-readability-tx-line {
    margin-bottom: 12px;
    color: #d4d4d8;
  }
  .yt-readability-ts {
    display: inline-block;
    color: var(--md-sys-color-primary, #3ea6ff);
    font-family: monospace;
    font-size: 0.9em;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    background: var(--yt-accent-tint, rgba(62, 166, 255, 0.1));
    padding: 1px 6px;
    border-radius: 4px;
    margin-right: 6px;
  }
  .yt-readability-ts:hover {
    background: var(--yt-accent-tint-strong, rgba(62, 166, 255, 0.25));
    text-decoration: underline;
  }
  .yt-readability-fact-box {
    margin-top: 40px;
    padding: 20px;
    background: rgba(34, 197, 94, 0.06);
    border: 1px solid rgba(34, 197, 94, 0.2);
    border-radius: 12px;
  }
  .yt-readability-qa-section {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }
  .yt-readability-qa-item {
    margin-bottom: 18px;
    padding-bottom: 14px;
    border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
  }
  .yt-readability-q {
    font-weight: 600;
    color: #93c5fd;
    margin-bottom: 6px;
  }
  .yt-readability-a {
    color: #d4d4d8;
    margin: 0;
  }

  /* --- Readability Themes (System, Light, Sepia, Dark) --- */
  /* Light Theme */
  .yt-readability-container.theme-light,
  .yt-window-box.yt-theme-light .yt-readability-container {
    background: #fdfbf7 !important;
    color: #1f2328 !important;
  }
  .yt-readability-container.theme-light .yt-readability-bar,
  .yt-window-box.yt-theme-light .yt-readability-bar {
    background: rgba(246, 244, 238, 0.96) !important;
    border-bottom: 1px solid #e1ded5 !important;
  }
  .yt-readability-container.theme-light .yt-readability-btn,
  .yt-window-box.yt-theme-light .yt-readability-btn {
    background: #ffffff !important;
    border-color: #d0d7de !important;
    color: #1f2328 !important;
  }
  .yt-readability-container.theme-light .yt-readability-btn:hover,
  .yt-window-box.yt-theme-light .yt-readability-btn:hover {
    background: #f3f4f6 !important;
  }
  .yt-readability-container.theme-light .yt-readability-theme-btn,
  .yt-window-box.yt-theme-light .yt-readability-theme-btn {
    color: #57606a !important;
  }
  .yt-readability-container.theme-light .yt-readability-theme-btn.active,
  .yt-window-box.yt-theme-light .yt-readability-theme-btn.active {
    background: #0969da !important;
    color: #ffffff !important;
  }
  .yt-readability-container.theme-light .yt-readability-theme-select,
  .yt-window-box.yt-theme-light .yt-readability-theme-select {
    background: #ffffff !important;
    border-color: #d0d7de !important;
    color: #1f2328 !important;
    color-scheme: light;
  }
  .yt-readability-container.theme-light .yt-readability-size-group,
  .yt-window-box.yt-theme-light .yt-readability-size-group {
    background: #ffffff !important;
    border-color: #d0d7de !important;
  }
  .yt-readability-container.theme-light .yt-readability-size-btn,
  .yt-window-box.yt-theme-light .yt-readability-size-btn {
    color: #1f2328 !important;
  }
  .yt-readability-container.theme-light .yt-readability-size-label,
  .yt-window-box.yt-theme-light .yt-readability-size-label {
    color: #57606a !important;
    border-color: #d0d7de !important;
  }
  .yt-readability-container.theme-light .yt-readability-stats,
  .yt-window-box.yt-theme-light .yt-readability-stats {
    color: #57606a !important;
  }
  .yt-readability-container.theme-light .yt-readability-title,
  .yt-window-box.yt-theme-light .yt-readability-title {
    color: #0f1419 !important;
  }
  .yt-readability-container.theme-light .yt-readability-meta,
  .yt-window-box.yt-theme-light .yt-readability-meta {
    color: #57606a !important;
  }
  .yt-readability-container.theme-light .yt-readability-header,
  .yt-window-box.yt-theme-light .yt-readability-header {
    border-bottom: 1px solid #e1ded5 !important;
  }
  .yt-readability-container.theme-light .yt-readability-h2,
  .yt-window-box.yt-theme-light .yt-readability-h2 {
    color: #0f1419 !important;
    border-bottom: 1px solid #e1ded5 !important;
  }
  .yt-readability-container.theme-light .yt-readability-h3,
  .yt-window-box.yt-theme-light .yt-readability-h3 {
    color: #1f2328 !important;
  }
  .yt-readability-container.theme-light .yt-readability-p,
  .yt-readability-container.theme-light .yt-readability-li,
  .yt-readability-container.theme-light .yt-readability-tx-line,
  .yt-window-box.yt-theme-light .yt-readability-p,
  .yt-window-box.yt-theme-light .yt-readability-li,
  .yt-window-box.yt-theme-light .yt-readability-tx-line {
    color: #24292f !important;
  }
  .yt-readability-container.theme-light .yt-readability-ts,
  .yt-window-box.yt-theme-light .yt-readability-ts {
    color: #0969da !important;
    background: #ddf4ff !important;
  }
  .yt-readability-container.theme-light .yt-readability-type-badge,
  .yt-window-box.yt-theme-light .yt-readability-type-badge {
    background: #ddf4ff !important;
    color: #0969da !important;
    border-color: #54aeff !important;
  }
  .yt-readability-container.theme-light .yt-readability-fact-box,
  .yt-window-box.yt-theme-light .yt-readability-fact-box {
    background: #f6fdf7 !important;
    border-color: #8fe09b !important;
    color: #1a7f37 !important;
  }

  /* Sepia Theme */
  .yt-readability-container.theme-sepia,
  .yt-window-box.yt-theme-sepia .yt-readability-container {
    background: #f4ecd8 !important;
    color: #433422 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-bar,
  .yt-window-box.yt-theme-sepia .yt-readability-bar {
    background: rgba(234, 224, 200, 0.96) !important;
    border-bottom: 1px solid #d8c8a6 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-btn,
  .yt-window-box.yt-theme-sepia .yt-readability-btn {
    background: #efe5cd !important;
    border-color: #d8c8a6 !important;
    color: #433422 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-btn:hover,
  .yt-window-box.yt-theme-sepia .yt-readability-btn:hover {
    background: #e3d5b8 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-theme-btn,
  .yt-window-box.yt-theme-sepia .yt-readability-theme-btn {
    color: #5c4b37 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-theme-btn.active,
  .yt-window-box.yt-theme-sepia .yt-readability-theme-btn.active {
    background: #7a4d10 !important;
    color: #ffffff !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-theme-select,
  .yt-window-box.yt-theme-sepia .yt-readability-theme-select {
    background: #efe5cd !important;
    border-color: #d8c8a6 !important;
    color: #433422 !important;
    color-scheme: light;
  }
  .yt-readability-container.theme-sepia .yt-readability-size-group,
  .yt-window-box.yt-theme-sepia .yt-readability-size-group {
    background: #efe5cd !important;
    border-color: #d8c8a6 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-size-btn,
  .yt-window-box.yt-theme-sepia .yt-readability-size-btn {
    color: #433422 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-size-label,
  .yt-window-box.yt-theme-sepia .yt-readability-size-label {
    color: #7c6a53 !important;
    border-color: #d8c8a6 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-stats,
  .yt-window-box.yt-theme-sepia .yt-readability-stats {
    color: #7c6a53 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-title,
  .yt-window-box.yt-theme-sepia .yt-readability-title {
    color: #2c1d0c !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-meta,
  .yt-window-box.yt-theme-sepia .yt-readability-meta {
    color: #7c6a53 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-header,
  .yt-window-box.yt-theme-sepia .yt-readability-header {
    border-bottom: 1px solid #d8c8a6 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-h2,
  .yt-window-box.yt-theme-sepia .yt-readability-h2 {
    color: #2c1d0c !important;
    border-bottom: 1px solid #d8c8a6 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-h3,
  .yt-window-box.yt-theme-sepia .yt-readability-h3 {
    color: #382715 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-p,
  .yt-readability-container.theme-sepia .yt-readability-li,
  .yt-readability-container.theme-sepia .yt-readability-tx-line,
  .yt-window-box.yt-theme-sepia .yt-readability-p,
  .yt-window-box.yt-theme-sepia .yt-readability-li,
  .yt-window-box.yt-theme-sepia .yt-readability-tx-line {
    color: #433422 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-ts,
  .yt-window-box.yt-theme-sepia .yt-readability-ts {
    color: #7a4d10 !important;
    background: #e5d7b5 !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-type-badge,
  .yt-window-box.yt-theme-sepia .yt-readability-type-badge {
    background: #e9dec2 !important;
    color: #7a4d10 !important;
    border-color: #c9b48c !important;
  }
  .yt-readability-container.theme-sepia .yt-readability-fact-box,
  .yt-window-box.yt-theme-sepia .yt-readability-fact-box {
    background: #e8eed9 !important;
    border-color: #b8cb98 !important;
    color: #325016 !important;
  }

  /* Dark Theme (High Contrast) */
  .yt-readability-container.theme-dark,
  .yt-window-box.yt-theme-dark .yt-readability-container {
    background: #0a0a0c !important;
    color: #f4f4f5 !important;
  }
  .yt-readability-container.theme-dark .yt-readability-bar,
  .yt-window-box.yt-theme-dark .yt-readability-bar {
    background: rgba(14, 14, 18, 0.96) !important;
    border-bottom: 1px solid #27272a !important;
  }
  .yt-readability-container.theme-dark .yt-readability-theme-btn.active,
  .yt-window-box.yt-theme-dark .yt-readability-theme-btn.active {
    background: var(--md-sys-color-primary, #3ea6ff) !important;
    color: var(--md-sys-color-on-primary, #000000) !important;
  }

  /* System Theme: Automatically adjusts based on user preference */
  @media (prefers-color-scheme: light) {
    .yt-readability-container.theme-system,
    .yt-window-box.yt-theme-system .yt-readability-container {
      background: #fdfbf7 !important;
      color: #1f2328 !important;
    }
    .yt-readability-container.theme-system .yt-readability-bar,
    .yt-window-box.yt-theme-system .yt-readability-bar {
      background: rgba(246, 244, 238, 0.96) !important;
      border-bottom: 1px solid #e1ded5 !important;
    }
    .yt-readability-container.theme-system .yt-readability-btn,
    .yt-window-box.yt-theme-system .yt-readability-btn {
      background: #ffffff !important;
      border-color: #d0d7de !important;
      color: #1f2328 !important;
    }
    .yt-readability-container.theme-system .yt-readability-theme-select,
    .yt-window-box.yt-theme-system .yt-readability-theme-select {
      background: #ffffff !important;
      border-color: #d0d7de !important;
      color: #1f2328 !important;
    }
    .yt-readability-container.theme-system .yt-readability-title,
    .yt-readability-container.theme-system .yt-readability-h2 {
      color: #0f1419 !important;
    }
    .yt-readability-container.theme-system .yt-readability-p,
    .yt-readability-container.theme-system .yt-readability-li {
      color: #24292f !important;
    }
  }

  /* Export Popover Dropdown */
  .yt-export-popover {
    position: absolute;
    z-index: 2147483010;
    width: 290px;
    background: #1f1f1f;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.75);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    animation: ytPopIn 0.15s ease-out;
  }
  @keyframes ytPopIn {
    from { opacity: 0; transform: translateY(-4px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .yt-export-header {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888;
    padding: 6px 10px 4px 10px;
  }
  .yt-export-item {
    display: flex;
    align-items: center;
    gap: 10px;
    background: transparent;
    border: none;
    color: #f1f1f1;
    text-align: left;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .yt-export-item:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  .yt-export-item-text {
    flex: 1;
    min-width: 0;
  }
  .yt-export-item-title {
    font-size: 13px;
    font-weight: 500;
    color: #f1f1f1;
    line-height: 1.3;
  }
  .yt-export-item-sub {
    font-size: 11px;
    color: var(--md-sys-color-on-surface-variant);
    margin-top: 1px;
  }
  /* Material You Light Theme Overrides (applied when host has .yt-ui-light) */
  :host(.yt-ui-light) .yt-window-box,
  :host(.yt-ui-light) .yt-key-dialog-box,
  :host(.yt-ui-light) .yt-history-dialog-box,
  :host(.yt-ui-light) .yt-quick-menu-box {
    color-scheme: light;
    background: var(--md-sys-color-surface-container-low);
    color: var(--md-sys-color-on-surface);
    border-color: var(--md-sys-color-outline-variant);
    box-shadow: 0 12px 36px rgba(25, 28, 32, 0.14);
  }
  :host(.yt-ui-light) .yt-win-header,
  :host(.yt-ui-light) .yt-win-toolbar,
  :host(.yt-ui-light) .yt-composer-wrap,
  :host(.yt-ui-light) .yt-adv-panel,
  :host(.yt-ui-light) .yt-settings-tabs,
  :host(.yt-ui-light) .yt-history-footer {
    background: var(--md-sys-color-surface-container);
    border-color: var(--md-sys-color-outline-variant);
  }
  :host(.yt-ui-light) .yt-select,
  :host(.yt-ui-light) .yt-adv-select,
  :host(.yt-ui-light) .yt-tts-voice-select {
    color-scheme: light;
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    border-color: var(--md-sys-color-outline-variant);
  }
  :host(.yt-ui-light) .yt-select option,
  :host(.yt-ui-light) .yt-adv-select option {
    background-color: #f9f9ff !important;
    color: #191c20 !important;
    color-scheme: light;
  }
  :host(.yt-ui-light) .yt-select optgroup,
  :host(.yt-ui-light) .yt-adv-select optgroup {
    background-color: #ededf4 !important;
    color: var(--md-sys-color-primary, #2d628c) !important;
  }
  :host(.yt-ui-light) .yt-segmented-btn,
  :host(.yt-ui-light) .yt-tts-group,
  :host(.yt-ui-light) .yt-summary-page-bar,
  :host(.yt-ui-light) .yt-transcript-search-bar,
  :host(.yt-ui-light) .yt-chapter-bar,
  :host(.yt-ui-light) .yt-podcast-setup-card,
  :host(.yt-ui-light) .yt-podcast-qa-bar,
  :host(.yt-ui-light) .yt-history-card,
  :host(.yt-ui-light) .yt-key-row,
  :host(.yt-ui-light) .yt-quick-menu-item {
    background: var(--md-sys-color-surface-container-high);
    border-color: var(--md-sys-color-outline-variant);
    color: var(--md-sys-color-on-surface);
  }
  :host(.yt-ui-light) .yt-seg-btn.active {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }
  :host(.yt-ui-light) .yt-primary-btn,
  :host(.yt-ui-light) .yt-composer-send-btn,
  :host(.yt-ui-light) .yt-user-bubble {
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
  }
  :host(.yt-ui-light) .yt-sec-btn,
  :host(.yt-ui-light) .yt-action-pill,
  :host(.yt-ui-light) .yt-chapter-btn,
  :host(.yt-ui-light) .yt-composer-mic-btn,
  :host(.yt-ui-light) .yt-tts-speed-btn,
  :host(.yt-ui-light) .yt-win-title-switch-btn,
  :host(.yt-ui-light) .yt-turn-ver-pager,
  :host(.yt-ui-light) .yt-turn-regen-btn {
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    border-color: var(--md-sys-color-outline-variant);
  }
  :host(.yt-ui-light) .yt-turn-model-pill,
  :host(.yt-ui-light) .yt-podcast-gen-badge {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
    border-color: var(--md-sys-color-outline-variant);
  }
  :host(.yt-ui-light) .yt-input,
  :host(.yt-ui-light) .yt-composer-textarea,
  :host(.yt-ui-light) .yt-transcript-input-wrap,
  :host(.yt-ui-light) .yt-transcript-search-input,
  :host(.yt-ui-light) .yt-history-search-bar,
  :host(.yt-ui-light) .yt-history-search-input,
  :host(.yt-ui-light) .yt-podcast-qa-input,
  :host(.yt-ui-light) .yt-podcast-host-card,
  :host(.yt-ui-light) .yt-podcast-host-name-input {
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    border-color: var(--md-sys-color-outline-variant);
  }
  :host(.yt-ui-light) .yt-export-popover,
  :host(.yt-ui-light) .yt-win-overflow-menu {
    background: var(--md-sys-color-surface-container-low);
    color: var(--md-sys-color-on-surface);
    border-color: var(--md-sys-color-outline-variant);
    box-shadow: 0 12px 32px rgba(25, 28, 32, 0.16);
  }
  :host(.yt-ui-light) .yt-export-item,
  :host(.yt-ui-light) .yt-export-item-title,
  :host(.yt-ui-light) .yt-podcast-title,
  :host(.yt-ui-light) .yt-podcast-ep-title,
  :host(.yt-ui-light) .yt-podcast-turn-text,
  :host(.yt-ui-light) .yt-history-item-title,
  :host(.yt-ui-light) .yt-win-drag-grip,
  :host(.yt-ui-light) .yt-win-btn {
    color: var(--md-sys-color-on-surface);
  }
  :host(.yt-ui-light) .yt-podcast-turn {
    background: var(--md-sys-color-surface);
    border-color: var(--md-sys-color-outline-variant);
    color: var(--md-sys-color-on-surface);
  }
  :host(.yt-ui-light) .yt-podcast-player-card {
    background: var(--md-sys-color-primary-container);
    border-color: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary-container);
  }
  :host(.yt-ui-light) .yt-podcast-now-playing,
  :host(.yt-ui-light) .yt-chapter-ts,
  :host(.yt-ui-light) .yt-ts-link {
    color: var(--md-sys-color-primary);
  }
  :host(.yt-ui-light) .yt-dock-btn {
    color: inherit;
  }
  :host(.yt-ui-light) .yt-dock-history-title {
    color: var(--md-sys-color-primary);
  }
  :host(.yt-ui-light) .yt-accent-swatch {
    border-color: rgba(25, 28, 32, 0.2);
  }
  :host(.yt-ui-light) .yt-accent-swatch.active {
    border-color: #191c20;
  }
  :host(.yt-ui-light) .yt-visual-card {
    background: var(--md-sys-color-surface-container-low);
    border-color: var(--md-sys-color-outline-variant);
  }
  :host(.yt-ui-light) .yt-visual-caption,
  :host(.yt-ui-light) .yt-fact-status-line {
    color: var(--md-sys-color-on-surface-variant);
  }
  :host(.yt-ui-light) .yt-fact-box {
    background: #eef7ee;
    border-color: #a5d6a7;
    color: var(--md-sys-color-on-surface);
  }
  :host(.yt-ui-light) .yt-fact-header {
    color: #1b5e20;
  }
  :host(.yt-ui-light) .yt-fact-model-badge {
    background: #d7ecd8;
    color: #1b5e20;
  }
  :host(.yt-ui-light) .yt-fact-box.yt-fact-error {
    background: #ffebee;
    border-color: #ef9a9a;
  }
  :host(.yt-ui-light) .yt-fact-box.yt-fact-error .yt-fact-header,
  :host(.yt-ui-light) .yt-fact-error-msg {
    color: #b71c1c;
  }
  :host(.yt-ui-light) .yt-fact-box.yt-fact-off,
  :host(.yt-ui-light) .yt-fact-box.yt-fact-pending {
    background: var(--md-sys-color-surface-container-low);
    border-color: var(--md-sys-color-outline-variant);
  }
  `;

  function ensureHostAndShadow() {
    if (!document.documentElement) return false;
    let host = document.getElementById('yt-ai-summary-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'yt-ai-summary-host';
      document.documentElement.appendChild(host);
    }
    if (!shadowRoot) {
      shadowRoot = host.attachShadow({ mode: 'open' });
      const styleEl = document.createElement('style');
      styleEl.textContent = CSS_TEXT;
      shadowRoot.appendChild(styleEl);

      dockContainer = h('div', { className: 'yt-dock' });
      modalsContainer = h('div', { className: 'yt-modals' });
      liveRegionEl = h('div', {
        className: 'yt-live-region',
        'data-ytais-live-region': 'true',
        'aria-live': 'polite',
        'aria-atomic': 'true'
      });
      shadowRoot.appendChild(dockContainer);
      shadowRoot.appendChild(modalsContainer);
      shadowRoot.appendChild(liveRegionEl);
      updateDockHistoryTab();
    }
    applyShadowAppTheme();
    ensureAppThemeMediaListener();
    return true;
  }

  // --- KEYBOARD & GLOBAL EVENTS (§2) ---
  function setupKeyboardListeners() {
    window.addEventListener(
      'keydown',
      (e) => {
        if (!e.isTrusted && !window.__yt_test_allow_untrusted_events) return;
        const path = e.composedPath();
        const host = document.getElementById('yt-ai-summary-host');
        const inHost = host && path.includes(host);

        const keyDialog = modalsContainer?.querySelector('.yt-key-dialog-scrim');
        const historyDialog = modalsContainer?.querySelector('.yt-history-dialog-scrim');
        const quickMenuDialog = modalsContainer?.querySelector('.yt-quick-menu-scrim');
        const hasActiveModal = keyDialog || historyDialog || quickMenuDialog || maximizedWindow;

        if (inHost || hasActiveModal) {
          if (inHost) {
            e.stopImmediatePropagation();
          }

          // Escape key handler: close dialog if open, else minimize window
          if (e.key === 'Escape') {
            if (keyDialog) {
              e.stopImmediatePropagation();
              keyDialog.remove();
              return;
            }
            if (quickMenuDialog) {
              e.stopImmediatePropagation();
              if (typeof quickMenuDialog._ytaisClose === 'function') quickMenuDialog._ytaisClose();
              else quickMenuDialog.remove();
              return;
            }
            if (historyDialog) {
              e.stopImmediatePropagation();
              if (typeof historyDialog._ytaisClose === 'function') historyDialog._ytaisClose();
              else historyDialog.remove();
              return;
            }
            if (maximizedWindow) {
              e.stopImmediatePropagation();
              maximizedWindow.minimize();
              return;
            }
          }

          // Enter in follow-up textarea sends
          if (inHost && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            const active = shadowRoot?.activeElement;
            if (active && active.classList.contains('yt-composer-textarea')) {
              e.preventDefault();
              e.stopImmediatePropagation();
              if (maximizedWindow) {
                maximizedWindow.sendFollowUp();
              }
              return;
            }
          }

          // Global TTS Keyboard Shortcuts for Active Summary Window
          if (maximizedWindow && !keyDialog && !historyDialog) {
            const activeEl = shadowRoot?.activeElement || document.activeElement;
            const isEditable = activeEl && (
              activeEl.tagName === 'INPUT' ||
              activeEl.tagName === 'TEXTAREA' ||
              activeEl.tagName === 'SELECT' ||
              Boolean(activeEl.isContentEditable) ||
              activeEl.getAttribute?.('contenteditable') === 'true'
            );
            const isWindowHandleFocused = Boolean(
              activeEl?.classList?.contains('yt-resize-handle') ||
              activeEl?.classList?.contains('yt-win-drag-grip')
            );

            if (!isEditable && !isWindowHandleFocused) {
              // Space or K: Toggle Play / Pause
              if (e.code === 'Space' || e.key === ' ' || e.key === 'k' || e.key === 'K') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                maximizedWindow.toggleTts();
                return;
              }

              // Left Arrow or J: Rewind (5s or 10s)
              if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const sec = (e.key === 'j' || e.key === 'J') ? 10 : 5;
                maximizedWindow.rewindTts(sec);
                return;
              }

              // Right Arrow or L: Skip (5s or 10s)
              if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const sec = (e.key === 'l' || e.key === 'L') ? 10 : 5;
                maximizedWindow.skipTts(sec);
                return;
              }

              // Up Arrow: Volume Up (+10%)
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const newVol = Math.min(1.0, Math.round((maximizedWindow.ttsVolume + 0.1) * 10) / 10);
                maximizedWindow.setTtsVolume(newVol);
                maximizedWindow.showTtsFeedback(`🔊 Volume: ${Math.round(newVol * 100)}%`);
                return;
              }

              // Down Arrow: Volume Down (-10%)
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const newVol = Math.max(0.0, Math.round((maximizedWindow.ttsVolume - 0.1) * 10) / 10);
                maximizedWindow.setTtsVolume(newVol);
                maximizedWindow.showTtsFeedback(`🔉 Volume: ${Math.round(newVol * 100)}%`);
                return;
              }

              // [ or ]: Playback Speed Down or Up
              if (e.key === '[' || e.key === ']') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                maximizedWindow.stepTtsRate(e.key === ']' ? 1 : -1);
                return;
              }

              // { or }: Voice Pitch Down or Up (0.05 step)
              if (e.key === '{' || e.key === '}') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const delta = e.key === '}' ? 0.05 : -0.05;
                const nextPitch = clampPitch(Math.round(((maximizedWindow.ttsPitch || 1.0) + delta) * 100) / 100);
                maximizedWindow.setTtsPitch(nextPitch);
                maximizedWindow.showTtsFeedback(`🎵 Pitch: ${nextPitch.toFixed(2)}x`);
                return;
              }

              // M or m: Mute / Unmute
              if (e.key === 'm' || e.key === 'M') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                maximizedWindow.toggleTtsMute();
                return;
              }
            }
          }
        }
      },
      true
    );

    window.addEventListener(
      'keyup',
      (e) => {
        if (!e.isTrusted) return;
        const host = document.getElementById('yt-ai-summary-host');
        if (host && e.composedPath().includes(host)) {
          e.stopImmediatePropagation();
        }
      },
      true
    );

    window.addEventListener(
      'keypress',
      (e) => {
        if (!e.isTrusted) return;
        const host = document.getElementById('yt-ai-summary-host');
        if (host && e.composedPath().includes(host)) {
          e.stopImmediatePropagation();
        }
      },
      true
    );
  }

  // --- CROSS-TAB SYNC & DOM RESTORATION (§4) ---
  function syncFromStorage(videoId) {
    if (!videoId) return;
    const meta = GM_getValue('win:' + videoId, null);
    if (!meta) {
      if (activeWindows.has(videoId)) {
        const win = activeWindows.get(videoId);
        win.close(true);
      }
      return;
    }

    if (activeWindows.has(videoId)) {
      const win = activeWindows.get(videoId);
      win.status = meta.status;
      win.busy = meta.busy;
      win.owner = meta.owner;
      win.hb = meta.hb;
      win.jobId = meta.jobId;
      win.errMsg = meta.errMsg;
      win.errCode = meta.errCode;
      win.modelId = meta.modelId;
      win.keyId = meta.keyId;
      win.opts = meta.opts;
      win.notes = meta.notes || [];

      // Check if remote job done, reload cache
      if (meta.status === 'done') {
        const cached = readCache(videoId, win.mode, win.source, true, win.getSummaryPersona());
        if (cached) win.loadFromCache(cached);
      }

      if (meta.status === 'done' && (maximizedWindow !== win || document.hidden)) {
        win.unread = true;
      } else {
        win.unread = Boolean(meta.unread);
      }

      win.renderAll();
    } else {
      const win = new SummaryWindow(videoId, meta.title, meta);
      const cached = readCache(videoId, win.mode, win.source, true, win.getSummaryPersona());
      if (cached) win.loadFromCache(cached);
      win.renderDockTab();
    }
  }

  function resyncAllWindows() {
    const all = GM_listValues();
    const winKeys = all.filter((k) => k.startsWith('win:'));
    const ids = winKeys.map((k) => k.slice(4));

    for (const id of ids) {
      syncFromStorage(id);
    }
    for (const [id, win] of activeWindows) {
      if (!ids.includes(id)) {
        win.close(true);
      }
    }
  }

  function setupCrossTabSync() {
    GM_addValueChangeListener('sync_ping', (k, oldV, newV, remote) => {
      if (!newV || newV.tab === TAB_ID) return;
      if (newV.id === '*') {
        resyncAllWindows();
      } else {
        syncFromStorage(newV.id);
      }
    });

    GM_addValueChangeListener('keys', () => {
      if (maximizedWindow) maximizedWindow.renderAll();
    });

    GM_addValueChangeListener('history_tab_visibility', () => {
      updateDockHistoryTab();
    });

    GM_addValueChangeListener('show_history_bottom_tab', () => {
      updateDockHistoryTab();
    });

    GM_addValueChangeListener('history_page_scope', () => {
      updateDockHistoryTab();
    });

    GM_addValueChangeListener('response_ratings', () => {
      for (const win of getOpenWindows()) {
        win.renderBody();
      }
    });

    GM_addValueChangeListener('alt_titles_enabled', (_k, _oldV, newV) => {
      const enabled = getAltTitleMode() === 'on';
      if (shadowRoot) {
        const altCheckboxes = shadowRoot.querySelectorAll('.yt-alt-titles-setting-checkbox');
        for (const cb of altCheckboxes) {
          cb.checked = enabled;
        }
      }
      if (typeof refreshAllFeedCardTitles === 'function') {
        refreshAllFeedCardTitles();
      }
    });

    GM_addValueChangeListener('alt_title_mode', (_k, _oldV, newV) => {
      const norm = normalizeAltTitleMode(newV);
      if (shadowRoot) {
        shadowRoot.querySelectorAll('.yt-alt-titles-setting-checkbox').forEach((cb) => {
          cb.checked = norm === 'on';
        });
        shadowRoot.querySelectorAll('.yt-alt-title-mode-btn').forEach((btn) => {
          const isAct = btn.getAttribute('data-alt-title-mode') === norm;
          btn.classList.toggle('active', isAct);
          btn.setAttribute('aria-pressed', isAct ? 'true' : 'false');
        });
      }
      if (typeof refreshAllFeedCardTitles === 'function') {
        refreshAllFeedCardTitles();
      }
    });

    GM_addValueChangeListener('channel_title_rules', () => {
      if (typeof refreshAllFeedCardTitles === 'function') {
        refreshAllFeedCardTitles();
      }
    });

    GM_addValueChangeListener('summary_persona', (_k, _oldV, newV) => {
      const normalized = normalizeSummaryPersona(newV);
      if (shadowRoot) {
        shadowRoot.querySelectorAll('.yt-persona-select').forEach((sel) => {
          sel.value = normalized;
        });
      }
    });

    GM_addValueChangeListener('output_language', (k, _oldV, newV) => {
      CONFIG.outputLanguage = normalizeOutputLanguage(newV);
    });

    GM_addValueChangeListener('app_theme_mode', () => {
      applyShadowAppTheme();
    });

    GM_addValueChangeListener('ui_accent_color', (_k, _oldV, newV) => {
      applyShadowAppTheme();
      syncSettingsAccentDom(normalizeAccentColorHex(newV));
    });

    GM_addValueChangeListener('continue_audio_on_minimize', (_k, _oldV, newV) => {
      const enabled = normalizeContinueAudioOnMinimize(newV);
      if (shadowRoot) {
        shadowRoot.querySelectorAll('.yt-continue-audio-minimize-checkbox').forEach((cb) => {
          cb.checked = enabled;
        });
      }
    });

    GM_addValueChangeListener('ui_formatting_prefs', () => {
      applyShadowAppTheme();
    });

    GM_addValueChangeListener('gen_formatting_prefs', () => {
      applyShadowAppTheme();
      for (const win of getOpenWindows()) {
        win.renderBody();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        resyncAllWindows();
      }
    });

    window.addEventListener('pagehide', () => {
      for (const [, win] of activeWindows) {
        if (win.owner === TAB_ID && (win.status === 'loading' || win.busy)) {
          win.status = 'error';
          win.errCode = 'INTERRUPTED';
          win.errMsg = 'Interrupted (tab closed)';
          win.commit(false);
        }
      }
    });

    // Start heartbeat/stale check loop only while windows exist to avoid idle wakeups
  }

  let windowMonitorTimer = null;
  function ensureWindowMonitorLoop() {
    if (windowMonitorTimer || activeWindows.size === 0) return;
    windowMonitorTimer = setInterval(() => {
      if (activeWindows.size === 0) {
        clearInterval(windowMonitorTimer);
        windowMonitorTimer = null;
        return;
      }
      const now = Date.now();
      for (const [, win] of activeWindows) {
        if (win.owner === TAB_ID && (win.status === 'loading' || win.busy)) {
          if (now - (win._lastHbWriteTs || 0) >= CONFIG.heartbeatMs) {
            win.hb = now;
            win._lastHbWriteTs = now;
            win.commit(true); // quiet commit
          }
        } else if (win.owner !== TAB_ID && (win.status === 'loading' || win.busy)) {
          if (now - (win.hb || 0) > CONFIG.staleMs) {
            win.status = 'error';
            win.busy = false;
            win.errCode = 'INTERRUPTED';
            win.errMsg = 'Operation was interrupted (tab closed or froze)';
            win.commit(false);
            win.renderAll();
          }
        }
      }
    }, 1000);
  }

  function registerMenuCommands() {
    GM_registerMenuCommand('Open Settings & Appearance', () => {
      openSettingsDialog();
    });

    GM_registerMenuCommand('Manage Gemini API keys', () => {
      openKeyManagerDialog();
    });

    GM_registerMenuCommand('Re-check available Gemini models', async () => {
      const keys = getStoredKeys();
      if (!keys.length) {
        openKeyManagerDialog();
        return;
      }
      showGlobalToast('Refreshing Gemini model availability...');
      for (const k of keys) {
        await checkModelsForKey(k, true);
      }
      if (maximizedWindow) maximizedWindow.renderAll();
      showGlobalToast('Gemini model availability updated.');
      announceLive('Gemini model availability updated.');
    });

    GM_registerMenuCommand('Clear cached summaries (keeps open windows)', () => {
      clearAllCache();
      showGlobalToast('Cached summaries cleared.');
      announceLive('Cached summaries cleared.');
    });

    GM_registerMenuCommand('Close all summary windows', () => {
      for (const win of Array.from(activeWindows.values())) {
        win.close();
      }
    });

    GM_registerMenuCommand('Browse previous summaries (History)', () => {
      openHistoryDialog();
    });

    GM_registerMenuCommand(
      `History dock tab visibility (currently: ${getHistoryTabVisibility()})`,
      () => {
        const order = ['always', 'with_tabs', 'never'];
        const cur = getHistoryTabVisibility();
        const next = order[(order.indexOf(cur) + 1) % order.length];
        setHistoryTabVisibility(next);
        showGlobalToast(`History dock tab visibility set to: ${next}`);
        announceLive(`History dock tab visibility set to ${next}`);
      }
    );

    GM_registerMenuCommand(
      `Toggle Alternative AI Titles for Thumbnails (currently ${getAltTitlesEnabled() ? 'ON' : 'OFF'})`,
      () => {
        const nextVal = !getAltTitlesEnabled();
        setAltTitlesEnabled(nextVal);
        showGlobalToast(`Alternative AI Titles: ${nextVal ? 'ON' : 'OFF'}`);
        announceLive(`Alternative AI Titles turned ${nextVal ? 'on' : 'off'}`);
      }
    );

    GM_registerMenuCommand(
      `Cycle Material You UI Theme (currently: ${getAppThemeMode()})`,
      () => {
        const order = ['system', 'light', 'dark'];
        const cur = getAppThemeMode();
        const next = order[(order.indexOf(cur) + 1) % order.length];
        setAppThemeMode(next);
        showGlobalToast(`UI Theme set to: ${next}`);
        announceLive(`UI Theme set to ${next}`);
      }
    );
  }

  // --- INITIALIZATION ---
  setupKeyboardListeners();
  setupCrossTabSync();
  registerMenuCommands();

  function onDomReady() {
    ensureFeedStylesInjected();
    ensureHostAndShadow();
    ensureTopbarLauncher();
    initMenuIntegration();
    observeFeedCards();

    // Restore existing windows from storage (skip cache_index touch writes during page load)
    const all = GM_listValues();
    const winKeys = all.filter((k) => k.startsWith('win:'));
    if (winKeys.length > 0) {
      const metas = [];
      for (const k of winKeys) {
        const meta = GM_getValue(k, null);
        if (meta) metas.push(meta);
      }
      metas.sort((a, b) => (a.created || 0) - (b.created || 0));

      for (const meta of metas) {
        if (!activeWindows.has(meta.videoId)) {
          const win = new SummaryWindow(meta.videoId, meta.title, meta);
          const cached = readCache(meta.videoId, win.mode, win.source, true, win.getSummaryPersona());
          if (cached) win.loadFromCache(cached);
          win.renderDockTab();
        }
      }
    }

    // Defer background model availability check until page load settles & browser is idle
    const runDeferredModelCheck = () => {
      scheduleIdleWork(() => {
        const keys = getStoredKeys();
        for (const k of keys) {
          checkModelsForKey(k, false);
        }
      }, 2000);
    };
    if (document.readyState === 'complete') {
      setTimeout(runDeferredModelCheck, 600);
    } else {
      window.addEventListener('load', () => setTimeout(runDeferredModelCheck, 600), { once: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDomReady, { once: true });
  } else {
    onDomReady();
  }

  window.addEventListener('pagehide', () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  });

  // Expose test helper if window.__yt_summariser_test_hook is requested
  window.__yt_summariser_test = {
    openForVideo,
    activeWindows,
    getActiveWindows: () => activeWindows,
    getOpenWindows,
    getTopZIndex: () => topWindowZIndex,
    CONFIG,
    SummaryWindow,
    readCache,
    writeCache,
    extractVideoIdFromCacheKey,
    cleanTextForSpeech,
    formatMathSymbolsInText,
    parseTranscriptCues,
    findActiveCueByCharIndex,
    findActiveCueByTime,
    findTranscriptCueIndexForSeconds,
    formatSecondsToTimestamp,
    openHistoryDialog,
    getAllCachedSummaries,
    deleteCachedVideo,
    updateDockHistoryTab,
    getHistoryTabVisibility,
    setHistoryTabVisibility,
    shouldShowHistoryTab,
    getResponseRating,
    setResponseRating,
    getResponseRatings,
    clampWindowBounds,
    computeDefaultWindowBounds,
    classifyWindowSizeTier,
    getAdaptiveWindowFlags,
    formatAsExportText,
    downloadAsTxt,
    formatSummaryExportMarkdown,
    formatAsExportMarkdown,
    downloadAsMarkdown,
    parseVideoChaptersFromDescription,
    extractSummaryChapters,
    buildLongVideoTranscriptChunks,
    buildChunkMapPrompt,
    buildChunkReducePrompt,
    exportAsPdf,
    formatAsExportJson,
    downloadAsJson,
    parseCleanEditorialBlocks,
    stripInlineMarkdown,
    getLastTtsRate,
    setLastTtsRate,
    clampPitch,
    createBoundedMap,
    computeWaveformAmplitudes,
    getLastTtsPitch,
    setLastTtsPitch,
    getLastReadabilityTheme,
    setLastReadabilityTheme,
    detectYouTubeTheme,
    getLastSyncYouTubeTheme,
    setLastSyncYouTubeTheme,
    getAltTitlesEnabled,
    setAltTitlesEnabled,
    normalizeChannelRuleKey,
    normalizeChannelTitleRules,
    getChannelTitleRules,
    setChannelTitleRule,
    resolveAutoTitleDecision,
    SUMMARY_PERSONA_PRESETS,
    normalizeSummaryPersona,
    getDefaultSummaryPersona,
    setDefaultSummaryPersona,
    resolveSummaryPersonaInstruction,
    resolveSummaryPersonaPromptSuffix,
    isMusicVideo,
    generateAlternativeTitle,
    getTranscriptText,
    fetchTranscriptRouteB,
    silenceWatchDocumentMedia,
    getDeArrowTitleContainer,
    isDeArrowPresent,
    syncDeArrowState,
    processFeedCard,
    toggleCardTitle,
    getCachedAltTitle,
    setCachedAltTitle,
    getDraftFollowUp,
    setDraftFollowUp,
    clearDraftFollowUp,
    refreshAllFeedCardTitles,
    revertCardToNonAiTitle,
    observeFeedCards,
    getCardVideoId,
    getAltTitleIndex,
    touchCacheIndex,
    isFeedMutationRelevant,
    getFeedScanCount: () => feedScanCount,
    resetFeedScanCount: () => {
      feedScanCount = 0;
    },
    getModelCooldowns: () => Object.fromEntries(modelCooldowns.entries()),
    clearModelCooldowns: () => modelCooldowns.clear(),
    computeDecorrelatedJitterDelay,
    applyKeyboardWindowAdjustment,
    showGlobalToast,
    announceLive,
    getMaximizedWindow: () => maximizedWindow,
    normalizePodcastHostCount,
    buildDefaultPodcastHosts,
    buildPodcastScriptPrompt,
    buildPodcastInteractionPrompt,
    parsePodcastScriptResponse,
    buildDeterministicPodcastEpisode,
    buildDeterministicPodcastInteractionResponse,
    splicePodcastInteractionTurns,
    buildGeminiMultiSpeakerTtsBody,
    readPodcastEpisode,
    writePodcastEpisode,
    countUniqueCachedVideoIds,
    shouldDeferBackgroundAltTitleFetch,
    isPageLoadSettled: () => pageLoadSettled,
    decodeBasicEntities,
    extractCaptionTracksFromHtml,
    parseJson3TranscriptEvents,
    parseXmlTranscriptEvents,
    extractDescriptiveTitleFromTranscript,
    dedupeAdjacentTitleDuplicate,
    shouldTriggerFeedCardMenuPoll,
    buildAltTitleModelCandidates,
    isMeaningfulDescriptionForTitle,
    extractWatchMetadataFromPlayerData,
    extractWatchMetadataFromHtml,
    extractGeminiNonThoughtText,
    getCardChannelName,
    normalizeAppThemeMode,
    resolveEffectiveAppTheme,
    getAppThemeMode,
    setAppThemeMode,
    getEffectiveAppTheme,
    applyShadowAppTheme,
    openKeyManagerDialog,
    openSettingsDialog,
    openQuickMenuWindow,
    ensureTopbarLauncher,
    SPONSOR_OR_PROMO_REGEX,
    isSponsorOrPromoLine,
    stripSponsorAndPromoFromText,
    DEFAULT_UI_FORMATTING_PREFS,
    DEFAULT_GENERATED_TEXT_PREFS,
    normalizeUiFormattingPrefs,
    normalizeGeneratedTextPrefs,
    resolveFormattingCssVars,
    getUiFormattingPrefs,
    setUiFormattingPrefs,
    getGeneratedTextPrefs,
    setGeneratedTextPrefs,
    resetFormattingPrefs,
    buildFollowUpModelCandidates,
    normalizeAltTitleMode,
    getAltTitleMode,
    setAltTitleMode,
    normalizeHistoryPageScope,
    extractYouTubePathAndSearch,
    isYouTubeVideoPage,
    isYouTubeHomeFeedPage,
    getShowHistoryBottomTab,
    setShowHistoryBottomTab,
    getHistoryPageScope,
    setHistoryPageScope,
    getLastSettingsBounds,
    setLastSettingsBounds,
    getOutputLanguage,
    setOutputLanguage,
    getAutoStart,
    setAutoStart,
    getLastModel,
    setLastModel,
    getLastSource,
    setLastSource,
    getGlobalOpts,
    saveGlobalOpts,
    getCustomModels,
    addCustomModel,
    removeCustomModel,
    getDefaultPodcastHostCount,
    setDefaultPodcastHostCount,
    getPodcastDefaultRate,
    setPodcastDefaultRate,
    normalizePodcastSynthesisMode,
    getPodcastSynthesisMode,
    setPodcastSynthesisMode,
    getDefaultPodcastHostsConfig,
    setDefaultPodcastHostsConfig,
    normalizeVoiceInputEngine,
    getVoiceInputEngine,
    setVoiceInputEngine,
    getFollowAlongLock,
    setFollowAlongLock,
    clearAltTitlesCache,
    resetAllSettings,
    getLastTtsVolume,
    setLastTtsVolume,
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
    PASTEL_ACCENT_PRESETS,
    ACCENT_CSS_VAR_KEYS,
    normalizeContinueAudioOnMinimize,
    shouldStopPlaybackOnMinimize,
    getContinueAudioOnMinimize,
    setContinueAudioOnMinimize,
    normalizeAccentColorHex,
    colorWheelPointToHex,
    hexToColorWheelPoint,
    resolveMaterialAccentPalette,
    resolveAccentCssVars,
    getUiAccentColor,
    setUiAccentColor
  };
})();

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  Terminal,
  Play,
  FileCode,
  Info,
  Clock,
  SlidersHorizontal
} from 'lucide-react';
import {
  cleanTextForSpeech,
  parseTranscriptCues,
  findActiveCueByCharIndex,
  findTranscriptCueIndexForSeconds,
  formatSummaryExportJson,
  formatSummaryExportMarkdown,
  extractSummaryChapters,
  parseTimestampToSeconds,
  clampPitch,
  resolveAskFallbackPlan,
  normalizeHistoryTabVisibility,
  applyResponseRating,
  buildResponseRatingKey,
  formatMathSymbolsInText,
  computeDefaultWindowBounds,
  clampWindowBounds,
  getAdaptiveWindowFlags,
  normalizeAltTitlesEnabled,
  normalizeCompactOptionsMap,
  applyKeyboardWindowAdjustment,
  normalizeChannelTitleRules,
  setChannelTitleRuleInMap,
  resolveAutoTitleDecision,
  normalizeSummaryPersona,
  normalizePodcastHostCount,
  buildDefaultPodcastHosts,
  buildDeterministicPodcastEpisode,
  buildDeterministicPodcastInteractionResponse,
  splicePodcastInteractionTurns,
  normalizeAppThemeMode,
  resolveEffectiveAppTheme,
  DEFAULT_UI_FORMATTING_PREFS,
  DEFAULT_GENERATED_TEXT_PREFS,
  normalizeUiFormattingPrefs,
  normalizeGeneratedTextPrefs,
  resolveFormattingCssVars,
  buildFollowUpModelCandidates,
  buildFactCheckModelCandidates,
  normalizeAutoFactCheckSetting,
  getActiveFollowUpVersion,
  appendFollowUpTurnVersion,
  stepFollowUpTurnVersion,
  splitSummaryIntoPodcastSections,
  buildDeterministicPodcastEpisodePart,
  appendPodcastEpisodeTurns,
  sanitizeSpokenTurnText,
  normalizeAltTitleMode,
  normalizeHistoryPageScope,
  normalizePodcastSynthesisMode,
  normalizeVoiceInputEngine,
  normalizeOutputLanguage,
  ACCENT_CSS_VAR_KEYS,
  normalizeContinueAudioOnMinimize,
  shouldStopPlaybackOnMinimize,
  normalizeAccentColorHex,
  resolveAccentCssVars,
  type TranscriptCue,
  type HistoryTabVisibility,
  type HistoryPageScope,
  type AltTitleGenerationMode,
  type PodcastSynthesisMode,
  type VoiceInputEngine,
  type ResponseRatingRecord,
  type WindowBounds,
  type ResizeDirection,
  type ChannelTitleRule,
  type SummaryPersona,
  type SummaryWindowTitleMode,
  type PodcastHost,
  type PodcastEpisode,
  type PodcastTurn,
  type AppThemeMode,
  type EffectiveTheme,
  type UiFormattingPrefs,
  type GeneratedTextFormattingPrefs
} from './utils/userscript-helpers';
import {
  MOCK_VIDEOS,
  parseEditorialBlocks,
  getLocalDiagramDataUri,
  type MockVideo,
  type HistoryItem,
  type ChatTurn,
  type FactCheckData,
  type ActiveSeekState
} from './components/SimulatorTypes';
import { FeedSimulatorGrid } from './components/FeedSimulatorGrid';
import { FloatingSummaryWindow } from './components/FloatingSummaryWindow';
import { HistoryDock } from './components/HistoryDock';
import { SettingsDocsTabs } from './components/SettingsDocsTabs';
import { SettingsModal, type SummaryDefaultOpts, type StoredApiKeyEntry } from './components/SettingsModal';
import { QuickMenuWindow } from './components/QuickMenuWindow';
import { copyTextWithFallback } from './utils/clipboard';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'code' | 'tests' | 'docs'>('simulator');
  const [openWindows, setOpenWindows] = useState<{
    [id: string]: { minimized: boolean; mode: 'summary' | 'transcript' | 'podcast'; source: 'video' | 'text' };
  }>({});
  const [windowBounds, setWindowBounds] = useState<Record<string, WindowBounds>>({});
  const [windowZIndices, setWindowZIndices] = useState<Record<string, number>>({});
  const [focusedVideoId, setFocusedVideoId] = useState<string | null>(null);
  const [windowSizeMap, setWindowSizeMap] = useState<Record<string, { width: number; height: number }>>({});
  const [headerOverflowOpen, setHeaderOverflowOpen] = useState<Record<string, boolean>>({});
  const [compactOptionsExpanded, setCompactOptionsExpanded] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('yt_compact_options_expanded');
      return raw ? normalizeCompactOptionsMap(JSON.parse(raw)) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_compact_options_expanded', JSON.stringify(compactOptionsExpanded));
    } catch {}
  }, [compactOptionsExpanded]);

  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [liveAnnouncementSeq, setLiveAnnouncementSeq] = useState(0);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  }));

  useEffect(() => {
    const onResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const announceLive = (msg: string) => {
    if (!msg) return;
    setLiveAnnouncement(msg);
    setLiveAnnouncementSeq((s) => s + 1);
  };

  // Material You UI Theme Mode (System / Light / Dark) persisted in localStorage
  const [appThemeMode, setAppThemeMode] = useState<AppThemeMode>(() => {
    try {
      return normalizeAppThemeMode(localStorage.getItem('yt_app_theme_mode'));
    } catch {
      return 'system';
    }
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemPrefersDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const effectiveTheme: EffectiveTheme = resolveEffectiveAppTheme(appThemeMode, systemPrefersDark);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', effectiveTheme === 'dark');
    root.dataset.appThemeMode = appThemeMode;
    root.dataset.appTheme = effectiveTheme;
    root.style.colorScheme = effectiveTheme;
    try {
      localStorage.setItem('yt_app_theme_mode', appThemeMode);
    } catch {}
  }, [appThemeMode, effectiveTheme]);

  const handleSetAppThemeMode = (nextMode: AppThemeMode) => {
    const normalized = normalizeAppThemeMode(nextMode);
    setAppThemeMode(normalized);
    announceLive(`Appearance switched to ${normalized} mode`);
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);

  const [uiFormatting, setUiFormatting] = useState<UiFormattingPrefs>(() => {
    try {
      const raw = localStorage.getItem('yt_ui_formatting');
      return normalizeUiFormattingPrefs(raw ? JSON.parse(raw) : DEFAULT_UI_FORMATTING_PREFS);
    } catch {
      return DEFAULT_UI_FORMATTING_PREFS;
    }
  });
  const [genFormatting, setGenFormatting] = useState<GeneratedTextFormattingPrefs>(() => {
    try {
      const raw = localStorage.getItem('yt_gen_formatting');
      return normalizeGeneratedTextPrefs(raw ? JSON.parse(raw) : DEFAULT_GENERATED_TEXT_PREFS);
    } catch {
      return DEFAULT_GENERATED_TEXT_PREFS;
    }
  });

  useEffect(() => {
    const resolved = resolveFormattingCssVars(uiFormatting, genFormatting);
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      for (const [k, v] of Object.entries(resolved.vars)) {
        root.style.setProperty(k, v);
      }
    }
    try {
      localStorage.setItem('yt_ui_formatting', JSON.stringify(uiFormatting));
      localStorage.setItem('yt_gen_formatting', JSON.stringify(genFormatting));
    } catch {}
  }, [uiFormatting, genFormatting]);

  const [uiAccentColor, setUiAccentColor] = useState<string>(() => {
    try {
      return normalizeAccentColorHex(localStorage.getItem('yt_ui_accent_color'));
    } catch {
      return '';
    }
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      const vars = resolveAccentCssVars(uiAccentColor, effectiveTheme);
      for (const k of ACCENT_CSS_VAR_KEYS) {
        if (k in vars) {
          root.style.setProperty(k, vars[k]);
        } else {
          root.style.removeProperty(k);
        }
      }
      root.dataset.uiAccent = uiAccentColor || 'default';
    }
    try {
      localStorage.setItem('yt_ui_accent_color', uiAccentColor);
    } catch {}
  }, [uiAccentColor, effectiveTheme]);

  const [continueAudioOnMinimize, setContinueAudioOnMinimize] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('yt_continue_audio_on_minimize');
      return raw === null ? true : normalizeContinueAudioOnMinimize(raw);
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('yt_continue_audio_on_minimize', String(continueAudioOnMinimize));
    } catch {}
  }, [continueAudioOnMinimize]);

  const computeDefaultSettingsBounds = (vw: number, vh: number): WindowBounds => {
    const w = Math.min(780, Math.max(360, vw - 40));
    const h = Math.min(680, Math.max(340, vh - 96));
    return clampWindowBounds(
      {
        left: Math.max(16, Math.round((vw - w) / 2)),
        top: Math.max(48, Math.round((vh - h) / 2)),
        width: w,
        height: h
      },
      { width: vw, height: vh },
      360,
      340
    );
  };

  const [settingsBounds, setSettingsBounds] = useState<WindowBounds>(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    try {
      const raw = localStorage.getItem('yt_settings_bounds');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.width === 'number' && typeof parsed.height === 'number') {
          return clampWindowBounds(parsed, { width: vw, height: vh }, 360, 340);
        }
      }
    } catch {}
    return computeDefaultSettingsBounds(vw, vh);
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_settings_bounds', JSON.stringify(settingsBounds));
    } catch {}
  }, [settingsBounds]);

  const [historyBounds, setHistoryBounds] = useState<WindowBounds>(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const w = Math.min(720, Math.max(340, vw - 40));
    const h = Math.min(580, Math.max(320, vh - 120));
    return clampWindowBounds(
      {
        left: Math.max(16, Math.round((vw - w) / 2)),
        top: Math.max(84, Math.round((vh - h) / 2)),
        width: w,
        height: h
      },
      { width: vw, height: vh }
    );
  });
  const [quickMenuBounds, setQuickMenuBounds] = useState<WindowBounds>(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return clampWindowBounds(
      { left: 20, top: 68, width: 360, height: 240 },
      { width: vw, height: vh },
      240,
      200
    );
  });
  const [historyZIndex, setHistoryZIndex] = useState(65);
  const [quickMenuZIndex, setQuickMenuZIndex] = useState(70);
  const [settingsZIndex, setSettingsZIndex] = useState(85);

  const topZCounterRef = useRef(88);
  const windowContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragResizeRef = useRef<{
    targetKind: 'video' | 'history' | 'quickMenu' | 'settings';
    type: 'drag' | 'resize';
    videoId?: string;
    dir?: ResizeDirection;
    startX: number;
    startY: number;
    startBounds: WindowBounds;
  } | null>(null);

  const [historyTabVisibility, setHistoryTabVisibility] = useState<HistoryTabVisibility>(() => {
    try {
      return normalizeHistoryTabVisibility(localStorage.getItem('yt_history_tab_visibility'));
    } catch {
      return 'always';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_history_tab_visibility', historyTabVisibility);
    } catch {}
  }, [historyTabVisibility]);

  const [showHistoryBottomTab, setShowHistoryBottomTab] = useState<boolean>(() => {
    try {
      return localStorage.getItem('yt_show_history_bottom_tab') !== 'false';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_show_history_bottom_tab', String(showHistoryBottomTab));
    } catch {}
  }, [showHistoryBottomTab]);

  const [historyPageScope, setHistoryPageScope] = useState<HistoryPageScope>(() => {
    try {
      return normalizeHistoryPageScope(localStorage.getItem('yt_history_page_scope'));
    } catch {
      return 'all_pages';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_history_page_scope', historyPageScope);
    } catch {}
  }, [historyPageScope]);

  const [currentSimPage, setCurrentSimPage] = useState<string>(() => {
    try {
      return localStorage.getItem('yt_sim_current_page') || '/';
    } catch {
      return '/';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_sim_current_page', currentSimPage);
    } catch {}
  }, [currentSimPage]);

  const [responseRatings, setResponseRatings] = useState<Record<string, ResponseRatingRecord>>(() => {
    try {
      const raw = localStorage.getItem('yt_response_ratings');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [openRatingNoteKey, setOpenRatingNoteKey] = useState<string | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem('yt_response_ratings', JSON.stringify(responseRatings));
    } catch {}
  }, [responseRatings]);

  // FEAT-02 Per-Channel Auto-Title Rules persisted in localStorage
  const [channelTitleRules, setChannelTitleRules] = useState<Record<string, 'exempt' | 'force_ai'>>(() => {
    try {
      const raw = localStorage.getItem('yt_channel_title_rules');
      return raw ? normalizeChannelTitleRules(JSON.parse(raw)) : {};
    } catch {
      return {};
    }
  });
  const [ruleMenuOpenId, setRuleMenuOpenId] = useState<string | null>(null);

  // FEAT-03 Summary Persona Preset persisted in localStorage
  const [summaryPersona, setSummaryPersona] = useState<SummaryPersona>(() => {
    try {
      return normalizeSummaryPersona(localStorage.getItem('yt_summary_persona'));
    } catch {
      return 'executive';
    }
  });
  const [windowPersonas, setWindowPersonas] = useState<Record<string, SummaryPersona>>({});

  // FEAT-01 Follow-Along Lock persisted in localStorage + Active Seek State
  const [followAlong, setFollowAlong] = useState<boolean>(() => {
    try {
      return localStorage.getItem('yt_follow_along') !== 'false';
    } catch {
      return true;
    }
  });
  const [activeSeek, setActiveSeek] = useState<Record<string, ActiveSeekState | null>>({});

  const [windowModels, setWindowModels] = useState<{ [id: string]: string }>({});
  const [windowFallbackNote, setWindowFallbackNote] = useState<{ [id: string]: string | null }>({});
  const [simAskFailure, setSimAskFailure] = useState<{ [id: string]: boolean }>({});
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testOutput, setTestOutput] = useState<string | null>(null);

  const DEFAULT_SUMMARY_OPTS: SummaryDefaultOpts = {
    transcriptMode: 'fast',
    fc: true,
    autoFactCheck: true,
    src: true,
    img: true,
    gen: false,
    gsearch: true,
    gmaps: false,
    code: false,
    fallback: true,
    txFallback: true,
    think: '',
    mres: '',
    retries: 2,
    factModel: '',
    imgModel: '',
    imgAspect: ''
  };

  const [headerTitleModes, setHeaderTitleModes] = useState<Record<string, SummaryWindowTitleMode>>({});
  const [factCheckResults, setFactCheckResults] = useState<Record<string, FactCheckData | null>>({});
  const [simFactCheckUnavailable, setSimFactCheckUnavailable] = useState<Record<string, boolean>>({});
  const [factCheckingMap, setFactCheckingMap] = useState<Record<string, boolean>>({});

  const FACT_CHECK_LADDER = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite'
  ];

  const handleRerunFactCheck = (videoId: string) => {
    const video = MOCK_VIDEOS.find((v) => v.id === videoId);
    setFactCheckingMap((prev) => ({ ...prev, [videoId]: true }));
    const preferredModel = summaryDefaults.factModel || windowModels[videoId] || defaultSummaryModel || 'gemini-3.8-flash';
    const candidates = buildFactCheckModelCandidates({
      factModel: summaryDefaults.factModel,
      primaryModel: windowModels[videoId] || defaultSummaryModel,
      defaultModel: 'gemini-3.8-flash',
      fallbackLadder: FACT_CHECK_LADDER,
      availableModels: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']
    });
    const simulateUnavailable = Boolean(simFactCheckUnavailable[videoId]);
    const requestedModel = candidates[0] || preferredModel;
    const effectiveModel = simulateUnavailable
      ? candidates.find((m) => m !== requestedModel) || 'gemini-3.5-flash'
      : requestedModel;
    const fallbackFrom = simulateUnavailable && effectiveModel !== requestedModel ? requestedModel : undefined;

    setTimeout(() => {
      const baseFact = video?.factCheck || {
        model: effectiveModel,
        summary: 'Verified primary claims against authoritative documentation and technical specifications.',
        claims: [
          {
            timestamp: '[00:15]',
            claim: 'Primary technical assertion matches published reference data.',
            verdict: 'supported' as const,
            evidence: 'Cross-checked via Google Search grounding sources.'
          }
        ],
        sources: [
          { uri: 'https://www.youtube.com/watch?v=' + videoId, title: `${video?.title || 'Video'} Reference` }
        ]
      };
      setFactCheckResults((prev) => ({
        ...prev,
        [videoId]: {
          ...baseFact,
          model: effectiveModel,
          fallbackFrom
        }
      }));
      setFactCheckingMap((prev) => ({ ...prev, [videoId]: false }));
      if (fallbackFrom) {
        showTtsToast(`Fact-Check stepped down: ${fallbackFrom} -> ${effectiveModel}`, videoId);
        announceLive(`Fact-Check model ${fallbackFrom} unavailable, stepped down to ${effectiveModel}`);
      } else {
        showTtsToast(`Fact-check refreshed (${effectiveModel})`, videoId);
        announceLive(`Fact-check completed with ${effectiveModel}`);
      }
    }, 280);
  };

  const [defaultSummaryModel, setDefaultSummaryModel] = useState<string>(() => {
    try {
      return localStorage.getItem('yt_default_summary_model') || 'gemini-3.8-flash';
    } catch {
      return 'gemini-3.8-flash';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_default_summary_model', defaultSummaryModel);
    } catch {}
  }, [defaultSummaryModel]);

  const [defaultSummarySource, setDefaultSummarySource] = useState<'video' | 'text'>(() => {
    try {
      return localStorage.getItem('yt_default_summary_source') === 'text' ? 'text' : 'video';
    } catch {
      return 'video';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_default_summary_source', defaultSummarySource);
    } catch {}
  }, [defaultSummarySource]);

  const [outputLanguage, setOutputLanguage] = useState<string>(() => {
    try {
      return normalizeOutputLanguage(localStorage.getItem('yt_output_language') || 'English');
    } catch {
      return 'English';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_output_language', normalizeOutputLanguage(outputLanguage));
    } catch {}
  }, [outputLanguage]);

  const [autoStartSummary, setAutoStartSummary] = useState<boolean>(() => {
    try {
      return localStorage.getItem('yt_auto_start_summary') !== 'false';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_auto_start_summary', String(autoStartSummary));
    } catch {}
  }, [autoStartSummary]);

  const [summaryDefaults, setSummaryDefaults] = useState<SummaryDefaultOpts>(() => {
    try {
      const raw = localStorage.getItem('yt_summary_default_opts');
      if (!raw) return DEFAULT_SUMMARY_OPTS;
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SUMMARY_OPTS,
        ...parsed,
        autoFactCheck: normalizeAutoFactCheckSetting(parsed?.autoFactCheck)
      };
    } catch {
      return DEFAULT_SUMMARY_OPTS;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_summary_default_opts', JSON.stringify(summaryDefaults));
    } catch {}
  }, [summaryDefaults]);

  const [defaultReadabilityTheme, setDefaultReadabilityTheme] = useState<'system' | 'light' | 'sepia' | 'dark'>(() => {
    try {
      const v = localStorage.getItem('yt_default_readability_theme');
      return v === 'light' || v === 'sepia' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_default_readability_theme', defaultReadabilityTheme);
    } catch {}
  }, [defaultReadabilityTheme]);

  const [defaultSyncYouTubeTheme, setDefaultSyncYouTubeTheme] = useState<boolean>(() => {
    try {
      return localStorage.getItem('yt_default_sync_yt_theme') !== 'false';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_default_sync_yt_theme', String(defaultSyncYouTubeTheme));
    } catch {}
  }, [defaultSyncYouTubeTheme]);

  const [defaultPodcastHostCount, setDefaultPodcastHostCount] = useState<number>(() => {
    try {
      return normalizePodcastHostCount(Number(localStorage.getItem('yt_default_podcast_host_count') || 2));
    } catch {
      return 2;
    }
  });
  const [defaultPodcastHosts, setDefaultPodcastHosts] = useState<PodcastHost[]>(() => {
    try {
      const cnt = normalizePodcastHostCount(Number(localStorage.getItem('yt_default_podcast_host_count') || 2));
      const raw = localStorage.getItem('yt_default_podcast_hosts');
      return buildDefaultPodcastHosts(cnt, raw ? JSON.parse(raw) : undefined);
    } catch {
      return buildDefaultPodcastHosts(2);
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_default_podcast_host_count', String(defaultPodcastHostCount));
      localStorage.setItem('yt_default_podcast_hosts', JSON.stringify(defaultPodcastHosts));
    } catch {}
  }, [defaultPodcastHostCount, defaultPodcastHosts]);

  const [podcastSynthesisMode, setPodcastSynthesisMode] = useState<PodcastSynthesisMode>(() => {
    try {
      return normalizePodcastSynthesisMode(localStorage.getItem('yt_podcast_synthesis_mode'));
    } catch {
      return 'gemini_tts';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_podcast_synthesis_mode', podcastSynthesisMode);
    } catch {}
  }, [podcastSynthesisMode]);

  const [defaultPodcastRate, setDefaultPodcastRate] = useState<number>(() => {
    try {
      const n = parseFloat(localStorage.getItem('yt_default_podcast_rate') || '1.0');
      return Number.isFinite(n) ? Math.max(0.75, Math.min(2.0, n)) : 1.0;
    } catch {
      return 1.0;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_default_podcast_rate', String(defaultPodcastRate));
    } catch {}
  }, [defaultPodcastRate]);

  const [defaultSkipSilence, setDefaultSkipSilence] = useState<boolean>(() => {
    try {
      return localStorage.getItem('yt_default_skip_silence') !== 'false';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_default_skip_silence', String(defaultSkipSilence));
    } catch {}
  }, [defaultSkipSilence]);

  const [voiceInputEngine, setVoiceInputEngine] = useState<VoiceInputEngine>(() => {
    try {
      return normalizeVoiceInputEngine(localStorage.getItem('yt_voice_input_engine'));
    } catch {
      return 'browser';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_voice_input_engine', voiceInputEngine);
    } catch {}
  }, [voiceInputEngine]);

  const [defaultTtsVoice, setDefaultTtsVoice] = useState<string>(() => {
    try {
      return localStorage.getItem('yt_default_tts_voice') || 'ai:Kore';
    } catch {
      return 'ai:Kore';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_default_tts_voice', defaultTtsVoice);
    } catch {}
  }, [defaultTtsVoice]);

  const [defaultTtsRate, setDefaultTtsRate] = useState<number>(() => {
    try {
      const n = parseFloat(localStorage.getItem('yt_default_tts_rate') || '1.0');
      return Number.isFinite(n) ? Math.max(0.5, Math.min(2.0, n)) : 1.0;
    } catch {
      return 1.0;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_default_tts_rate', String(defaultTtsRate));
    } catch {}
  }, [defaultTtsRate]);

  const [defaultTtsPitch, setDefaultTtsPitch] = useState<number>(() => {
    try {
      const n = parseFloat(localStorage.getItem('lastTtsPitch') || '1.0');
      return Number.isFinite(n) ? clampPitch(n) : 1.0;
    } catch {
      return 1.0;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('lastTtsPitch', String(defaultTtsPitch));
    } catch {}
  }, [defaultTtsPitch]);

  const [defaultTtsVolume, setDefaultTtsVolume] = useState<number>(() => {
    try {
      const n = parseFloat(localStorage.getItem('yt_default_tts_volume') || '1.0');
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1.0;
    } catch {
      return 1.0;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_default_tts_volume', String(defaultTtsVolume));
    } catch {}
  }, [defaultTtsVolume]);

  const [simApiKeys, setSimApiKeys] = useState<StoredApiKeyEntry[]>(() => {
    try {
      const raw = localStorage.getItem('yt_sim_api_keys');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_sim_api_keys', JSON.stringify(simApiKeys));
    } catch {}
  }, [simApiKeys]);

  const [customModels, setCustomModels] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('yt_custom_models');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('yt_custom_models', JSON.stringify(customModels));
    } catch {}
  }, [customModels]);

  const [altTitleMode, setAltTitleMode] = useState<AltTitleGenerationMode>(() => {
    try {
      const explicitMode = localStorage.getItem('yt_alt_title_mode');
      if (explicitMode !== null) return normalizeAltTitleMode(explicitMode);
      const saved = localStorage.getItem('yt_alt_titles_enabled');
      return saved === null ? 'on' : normalizeAltTitleMode(saved);
    } catch {
      return 'on';
    }
  });
  const altTitlesEnabled = altTitleMode === 'on';
  const [dearrowSimulated, setDearrowSimulated] = useState(true);
  const [dearrowToggledOriginal, setDearrowToggledOriginal] = useState<{ [id: string]: boolean }>({});
  const [cardTitleModes, setCardTitleModes] = useState<{ [id: string]: 'original' | 'dearrow' | 'ai' }>({});
  const [transcriptModes, setTranscriptModes] = useState<{ [id: string]: 'fast' | 'deep' }>({});

  const handleSetAltTitleMode = (nextMode: AltTitleGenerationMode) => {
    const normalized = normalizeAltTitleMode(nextMode);
    setAltTitleMode(normalized);
    try {
      localStorage.setItem('yt_alt_title_mode', normalized);
      localStorage.setItem('yt_alt_titles_enabled', String(normalized === 'on'));
    } catch {}
    setCardTitleModes((prev) => {
      const next: { [id: string]: 'original' | 'dearrow' | 'ai' } = {};
      for (const [id, m] of Object.entries(prev)) {
        if (normalized === 'off' && m === 'ai') continue;
        if (normalized === 'on' && m === 'original') continue;
        if (normalized === 'manual' && m === 'ai') continue;
        next[id] = m;
      }
      return next;
    });
    announceLive(`AI Video Title mode set to ${normalized}`);
  };

  const handleSetAltTitlesEnabled = (nextEnabled: boolean) => {
    handleSetAltTitleMode(nextEnabled ? 'on' : 'off');
  };

  const handleSetChannelTitleRule = (channelName: string, rule: ChannelTitleRule) => {
    setChannelTitleRules((prev) => {
      const next = setChannelTitleRuleInMap(prev, channelName, rule);
      try {
        localStorage.setItem('yt_channel_title_rules', JSON.stringify(next));
      } catch {}
      return next;
    });
    // Clear manual single-card overrides on cards from this channel so the rule applies immediately
    setCardTitleModes((prev) => {
      const next = { ...prev };
      MOCK_VIDEOS.forEach((v) => {
        if (v.channel.trim().toLowerCase() === channelName.trim().toLowerCase()) {
          delete next[v.id];
        }
      });
      return next;
    });
    setRuleMenuOpenId(null);
    announceLive(`Channel rule saved: ${channelName} set to ${rule}`);
  };

  const handleSetDefaultSummaryPersona = (nextPersona: SummaryPersona) => {
    const normalized = normalizeSummaryPersona(nextPersona);
    setSummaryPersona(normalized);
    try {
      localStorage.setItem('yt_summary_persona', normalized);
    } catch {}
  };

  const handleSelectWindowPersona = (videoId: string, nextPersona: SummaryPersona) => {
    const normalized = normalizeSummaryPersona(nextPersona);
    setWindowPersonas((prev) => ({ ...prev, [videoId]: normalized }));
    handleSetDefaultSummaryPersona(normalized);
    announceLive(`Summary persona switched to ${normalized}`);
  };

  const handleToggleFollowAlong = () => {
    setFollowAlong((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('yt_follow_along', String(next));
      } catch {}
      announceLive(next ? 'Transcript follow-along lock enabled' : 'Transcript follow-along lock paused');
      return next;
    });
  };

  const handleSeekTimestamp = (videoId: string, tsStr: string, seconds: number) => {
    const video = MOCK_VIDEOS.find((v) => v.id === videoId);
    let cueIdx = -1;
    let cueLineIdx: number | null = null;
    if (video) {
      const parsed = parseTranscriptCues(video.transcript, { skipSilence: skipSilence[videoId] !== false });
      const idx = findTranscriptCueIndexForSeconds(parsed.cues, seconds);
      if (idx >= 0 && parsed.cues[idx]) {
        cueIdx = idx;
        cueLineIdx = parsed.cues[idx].lineIndex;
      }
    }
    setActiveSeek((prev) => ({
      ...prev,
      [videoId]: {
        seconds,
        tsStr,
        cueIndex: cueIdx >= 0 ? cueIdx : 0,
        updatedAt: Date.now()
      }
    }));
    if (cueLineIdx !== null) {
      setActiveTtsLine((prev) => ({ ...prev, [videoId]: cueLineIdx }));
      setActiveTtsTs((prev) => ({ ...prev, [videoId]: tsStr }));
    }
    const cleanTs = tsStr.replace(/[\[\]]/g, '');
    showTtsToast(`Jumped to ${cleanTs}`, videoId);
    announceLive(`Jumped to ${cleanTs}`);
  };

  const toggleCardTitle = (videoId: string, video: MockVideo, allowMusicManual = false) => {
    if (video.isMusic) {
      if (!allowMusicManual) return;
      setCardTitleModes((prev) => {
        const nextMode = prev[videoId] === 'ai' ? 'original' : 'ai';
        return { ...prev, [videoId]: nextMode };
      });
      announceLive(`Toggled AI title for ${video.title}`);
      return;
    }
    const hasDearrow = Boolean(dearrowSimulated && video.dearrowTitle);
    const currentDecision = resolveAutoTitleDecision({
      altTitlesEnabled,
      altTitleMode,
      isMusic: video.isMusic,
      hasDeArrowTitle: hasDearrow,
      channelName: video.channel,
      channelRules: channelTitleRules,
      manualOverride: cardTitleModes[video.id] || null
    });
    const nextMode = currentDecision.mode === 'ai' ? (hasDearrow ? 'dearrow' : 'original') : 'ai';
    setCardTitleModes((prev) => ({ ...prev, [videoId]: nextMode }));
  };

  // Close menus on outside click
  useEffect(() => {
    const handleClick = () => {
      setActiveMenuId(null);
      setRuleMenuOpenId(null);
      setHeaderOverflowOpen({});
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Global pointer listeners for multi-window drag & resize (summary windows, history, quick menu)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragResizeRef.current;
      if (!state) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      const s = state.startBounds;
      const minW = state.targetKind === 'quickMenu' ? 240 : state.targetKind === 'settings' ? 360 : 340;
      const minH = state.targetKind === 'quickMenu' ? 200 : state.targetKind === 'settings' ? 340 : 300;

      let nextBounds: WindowBounds;
      if (state.type === 'drag') {
        nextBounds = clampWindowBounds(
          { left: s.left + dx, top: s.top + dy, width: s.width, height: s.height },
          { width: vw, height: vh },
          minW,
          minH
        );
      } else {
        const dir = state.dir || 'se';
        let nextLeft = s.left;
        let nextTop = s.top;
        let nextWidth = s.width;
        let nextHeight = s.height;
        const marginX = vw < 400 ? 8 : 12;
        const effMinW = Math.min(minW, Math.max(220, vw - marginX * 2));
        const effMinH = Math.min(minH, Math.max(180, vh - 64));

        if (dir.includes('e')) {
          nextWidth = Math.max(effMinW, s.width + dx);
        }
        if (dir.includes('s')) {
          nextHeight = Math.max(effMinH, s.height + dy);
        }
        if (dir.includes('w')) {
          const maxWFromLeft = s.width + Math.max(0, s.left - marginX);
          const proposedW = Math.max(effMinW, Math.min(maxWFromLeft, s.width - dx));
          nextLeft = s.left + (s.width - proposedW);
          nextWidth = proposedW;
        }
        if (dir.includes('n')) {
          const maxHFromTop = s.height + Math.max(0, s.top - 12);
          const proposedH = Math.max(effMinH, Math.min(maxHFromTop, s.height - dy));
          nextTop = s.top + (s.height - proposedH);
          nextHeight = proposedH;
        }
        nextBounds = clampWindowBounds(
          { left: nextLeft, top: nextTop, width: nextWidth, height: nextHeight },
          { width: vw, height: vh },
          minW,
          minH
        );
      }

      if (state.targetKind === 'history') {
        setHistoryBounds(nextBounds);
      } else if (state.targetKind === 'quickMenu') {
        setQuickMenuBounds(nextBounds);
      } else if (state.targetKind === 'settings') {
        setSettingsBounds(nextBounds);
      } else if (state.videoId) {
        const vid = state.videoId;
        setWindowBounds((prev) => ({ ...prev, [vid]: nextBounds }));
        if (state.type === 'resize') {
          setWindowSizeMap((prev) => ({ ...prev, [vid]: { width: nextBounds.width, height: nextBounds.height } }));
        }
      }
    };

    const handleMouseUp = () => {
      dragResizeRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const openWindowIdsKey = Object.entries(openWindows)
    .filter(([, w]) => !w.minimized)
    .map(([id]) => id)
    .sort()
    .join(',');

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observers: ResizeObserver[] = [];
    const ids = openWindowIdsKey ? openWindowIdsKey.split(',') : [];
    ids.forEach((id) => {
      const el = windowContainerRefs.current[id];
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.round(entry.contentRect.width);
          const h = Math.round(entry.contentRect.height);
          if (w > 0 && h > 0) {
            setWindowSizeMap((prev) => {
              const cur = prev[id];
              if (cur && cur.width === w && cur.height === h) return prev;
              return { ...prev, [id]: { width: w, height: h } };
            });
          }
        }
      });
      ro.observe(el);
      observers.push(ro);
    });
    return () => {
      observers.forEach((o) => o.disconnect());
    };
  }, [openWindowIdsKey]);

  const focusWindow = (id: string) => {
    topZCounterRef.current += 1;
    const nextZ = topZCounterRef.current;
    setWindowZIndices((prev) => ({ ...prev, [id]: nextZ }));
    setFocusedVideoId(id);
  };

  const ensureWindowBounds = (id: string) => {
    setWindowBounds((prev) => {
      if (prev[id]) return prev;
      const existingOpenCount = Object.values(openWindows).filter((w) => !w.minimized).length;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const computed = computeDefaultWindowBounds({ width: vw, height: vh }, existingOpenCount);
      return { ...prev, [id]: computed };
    });
  };

  const openVideoWindow = (video: MockVideo) => {
    ensureWindowBounds(video.id);
    setOpenWindows((prev) => ({
      ...prev,
      [video.id]: {
        minimized: false,
        mode: prev[video.id]?.mode || 'summary',
        source: prev[video.id]?.source || defaultSummarySource
      }
    }));
    setWindowModels((prev) => (prev[video.id] ? prev : { ...prev, [video.id]: defaultSummaryModel }));
    setComposerModel((prev) => (prev[video.id] ? prev : { ...prev, [video.id]: defaultSummaryModel }));
    setTranscriptModes((prev) =>
      prev[video.id] ? prev : { ...prev, [video.id]: summaryDefaults.transcriptMode }
    );
    setSelectedVoice((prev) => (prev[video.id] ? prev : { ...prev, [video.id]: defaultTtsVoice }));
    setTtsState((prev) => (prev[video.id] ? prev : { ...prev, [video.id]: { status: 'idle', rate: defaultTtsRate } }));
    setTtsVolume((prev) => (prev[video.id] !== undefined ? prev : { ...prev, [video.id]: defaultTtsVolume }));
    setTtsPitch((prev) =>
      prev[video.id] !== undefined ? prev : { ...prev, [video.id]: clampPitch(defaultTtsPitch) }
    );
    setSkipSilence((prev) => (prev[video.id] !== undefined ? prev : { ...prev, [video.id]: defaultSkipSilence }));
    setSyncYouTubeTheme((prev) =>
      prev[video.id] !== undefined ? prev : { ...prev, [video.id]: defaultSyncYouTubeTheme }
    );
    setReadabilityTheme((prev) =>
      prev[video.id]
        ? prev
        : {
            ...prev,
            [video.id]: defaultSyncYouTubeTheme ? simulatedYouTubeTheme : defaultReadabilityTheme
          }
    );
    setPodcastHostCount((prev) =>
      prev[video.id] !== undefined ? prev : { ...prev, [video.id]: defaultPodcastHostCount }
    );
    setPodcastHostsMap((prev) =>
      prev[video.id]
        ? prev
        : { ...prev, [video.id]: buildDefaultPodcastHosts(defaultPodcastHostCount, defaultPodcastHosts) }
    );
    setPodcastRate((prev) => (prev[video.id] !== undefined ? prev : { ...prev, [video.id]: defaultPodcastRate }));
    focusWindow(video.id);
    setActiveMenuId(null);
    try {
      const saved = localStorage.getItem('yt_summariser_draft_' + video.id);
      if (saved && !composerText[video.id]) {
        setComposerText((prev) => ({ ...prev, [video.id]: saved }));
      }
    } catch {}
  };

  const handleResetAllSettings = () => {
    setUiAccentColor('');
    setContinueAudioOnMinimize(true);
    setAppThemeMode('system');
    setUiFormatting(DEFAULT_UI_FORMATTING_PREFS);
    setGenFormatting(DEFAULT_GENERATED_TEXT_PREFS);
    setDefaultReadabilityTheme('system');
    setDefaultSyncYouTubeTheme(true);
    setDefaultSummaryModel('gemini-3.8-flash');
    setDefaultSummarySource('video');
    handleSetDefaultSummaryPersona('executive');
    setOutputLanguage('English');
    setAutoStartSummary(true);
    setSummaryDefaults(DEFAULT_SUMMARY_OPTS);
    handleSetAltTitleMode('on');
    setChannelTitleRules({});
    try {
      localStorage.removeItem('yt_channel_title_rules');
    } catch {}
    setDefaultPodcastHostCount(2);
    setDefaultPodcastHosts(buildDefaultPodcastHosts(2));
    setPodcastSynthesisMode('gemini_tts');
    setDefaultPodcastRate(1.0);
    setFollowAlong(true);
    try {
      localStorage.setItem('yt_follow_along', 'true');
    } catch {}
    setDefaultSkipSilence(true);
    setVoiceInputEngine('browser');
    setDefaultTtsVoice('ai:Kore');
    setDefaultTtsRate(1.0);
    setDefaultTtsPitch(1.0);
    setDefaultTtsVolume(1.0);
    setShowHistoryBottomTab(true);
    setHistoryPageScope('all_pages');
    setHistoryTabVisibility('always');
    setCustomModels([]);
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    setSettingsBounds(computeDefaultSettingsBounds(vw, vh));
    announceLive('All settings reset to factory defaults');
  };

  const handleRateResponse = (
    videoId: string,
    targetType: 'summary' | 'transcript' | 'followup',
    rating: 'up' | 'down',
    targetId = 'main',
    note?: string
  ) => {
    const key = buildResponseRatingKey(videoId, targetType, targetId);
    const existing = responseRatings[key];
    const toggledOff = existing && existing.rating === rating && note === undefined;
    setResponseRatings((prev) => {
      const { nextMap } = applyResponseRating(prev, {
        videoId,
        targetType,
        targetId,
        rating,
        note
      });
      return nextMap;
    });
    if (note !== undefined) {
      announceLive('Rating feedback saved');
    } else if (toggledOff) {
      announceLive('Rating cleared');
    } else {
      announceLive(rating === 'up' ? 'Thumbs up rating saved' : 'Thumbs down rating saved');
    }
  };

  const [copiedVideoId, setCopiedVideoId] = useState<string | null>(null);
  const copyVideoUrl = async (videoId: string) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await copyTextWithFallback(url);
    if (res.ok) {
      setCopiedVideoId(videoId);
      announceLive('Copied video URL to clipboard');
      setTimeout(() => setCopiedVideoId((curr) => (curr === videoId ? null : curr)), 2000);
    } else {
      announceLive('Clipboard write permission denied by browser');
    }
  };

  const [transcriptSearch, setTranscriptSearch] = useState<{ [id: string]: string }>({});
  const [transcriptFilterOnly, setTranscriptFilterOnly] = useState<{ [id: string]: boolean }>({});
  const [activeMatchIndex, setActiveMatchIndex] = useState<{ [id: string]: number }>({});
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<{ [id: string]: string }>({});

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length) {
        setBrowserVoices(v);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const [ttsState, setTtsState] = useState<{ [id: string]: { status: 'idle' | 'playing' | 'paused'; rate: number } }>({});
  const [ttsVolume, setTtsVolume] = useState<{ [id: string]: number }>({});
  const [ttsPitch, setTtsPitch] = useState<{ [id: string]: number }>({});
  const [skipSilence, setSkipSilence] = useState<{ [id: string]: boolean }>({});
  const [activeTtsLine, setActiveTtsLine] = useState<{ [id: string]: number | null }>({});
  const [activeTtsTs, setActiveTtsTs] = useState<{ [id: string]: string | null }>({});
  const activeTtsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [ttsToasts, setTtsToasts] = useState<Record<string, { message: string; visible: boolean }>>({});
  const ttsToastTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      Object.values(ttsToastTimersRef.current).forEach((t) => clearTimeout(t));
      ttsToastTimersRef.current = {};
    };
  }, []);

  const showTtsToast = (msg: string, targetVideoId?: string | null) => {
    const targetId = targetVideoId || focusedVideoId;
    if (!targetId) return;
    const prevTimer = ttsToastTimersRef.current[targetId];
    if (prevTimer) clearTimeout(prevTimer);
    setTtsToasts((prev) => ({
      ...prev,
      [targetId]: { message: msg, visible: true }
    }));
    ttsToastTimersRef.current[targetId] = setTimeout(() => {
      setTtsToasts((prev) => ({
        ...prev,
        [targetId]: prev[targetId] ? { ...prev[targetId], visible: false } : { message: '', visible: false }
      }));
      delete ttsToastTimersRef.current[targetId];
    }, 1200);
  };

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [closedSummaries, setClosedSummaries] = useState<HistoryItem[]>([
    {
      id: 'D_fusion_breakthrough',
      title: 'Solid-State Sodium Batteries: Replacing Lithium at Scale',
      channel: 'Energy Frontiers',
      views: '890K views • 1 week ago',
      duration: '14:05',
      mode: 'summary',
      model: 'gemini-3.8-flash',
      persona: 'executive',
      summary: MOCK_VIDEOS[4].summary,
      transcript: MOCK_VIDEOS[4].transcript,
      timestamp: Date.now() - 3600000 * 4
    }
  ]);

  const [readabilityMode, setReadabilityMode] = useState<{ [id: string]: boolean }>({});
  const [readabilityFont, setReadabilityFont] = useState<{ [id: string]: 'serif' | 'sans' }>({});
  const [readabilityTheme, setReadabilityTheme] = useState<{ [id: string]: 'system' | 'light' | 'sepia' | 'dark' }>({});
  const [readabilitySize, setReadabilitySize] = useState<{ [id: string]: number }>({});
  const [exportMenuOpen, setExportMenuOpen] = useState<{ [id: string]: boolean }>({});
  const [simulatedYouTubeTheme, setSimulatedYouTubeTheme] = useState<'dark' | 'light'>('dark');
  const [syncYouTubeTheme, setSyncYouTubeTheme] = useState<{ [id: string]: boolean }>({});

  const [conversationTurns, setConversationTurns] = useState<{ [id: string]: ChatTurn[] }>({
    D_clickbait_chip: [
      {
        q: 'How does the energy efficiency compare to standard servers?',
        a: 'The 128-core RISC-V platform delivers **2.1x higher performance-per-watt** compared to current x86 servers in sparse linear algebra and neural inference workloads, primarily due to out-of-order custom vector units on the 3nm node [02:15].',
        model: 'gemini-3.8-flash',
        sources: [
          { uri: 'https://riscv.org/specifications', title: 'RISC-V Datacenter Benchmarks' },
          { uri: 'https://semianalysis.com/riscv-efficiency', title: 'SemiAnalysis Architecture Analysis' }
        ]
      }
    ]
  });
  const [composerText, setComposerText] = useState<{ [id: string]: string }>({});
  const [composerModel, setComposerModel] = useState<{ [id: string]: string }>({});
  const [simFollowUpUnavailable, setSimFollowUpUnavailable] = useState<Record<string, boolean>>({});
  const [followUpFallbackNote, setFollowUpFallbackNote] = useState<Record<string, string | null>>({});
  const [composerGSearch, setComposerGSearch] = useState<{ [id: string]: boolean }>({});
  const [composerGMaps, setComposerGMaps] = useState<{ [id: string]: boolean }>({});
  const [isRecordingVoice, setIsRecordingVoice] = useState<{ [id: string]: boolean }>({});
  const [isAnsweringFollowUp, setIsAnsweringFollowUp] = useState<{ [id: string]: boolean }>({});
  const [regeneratingTurnIdx, setRegeneratingTurnIdx] = useState<Record<string, number | null>>({});

  // FEAT-07 Multi-Host Podcast State
  const [podcastHostCount, setPodcastHostCount] = useState<Record<string, number>>({});
  const [podcastHostsMap, setPodcastHostsMap] = useState<Record<string, PodcastHost[]>>({});
  const [podcastEpisodes, setPodcastEpisodes] = useState<Record<string, PodcastEpisode | null>>({});
  const [podcastGenerating, setPodcastGenerating] = useState<Record<string, boolean>>({});
  const [podcastInteracting, setPodcastInteracting] = useState<Record<string, boolean>>({});
  const [podcastListeningVoice, setPodcastListeningVoice] = useState<Record<string, boolean>>({});
  const [podcastPlaybackStatus, setPodcastPlaybackStatus] = useState<
    Record<string, 'idle' | 'playing' | 'paused'>
  >({});
  const [podcastActiveTurnIdx, setPodcastActiveTurnIdx] = useState<Record<string, number>>({});
  const [podcastRate, setPodcastRate] = useState<Record<string, number>>({});
  const [podcastQaDraft, setPodcastQaDraft] = useState<Record<string, string>>({});
  const podcastRunSeqRef = useRef<Record<string, number>>({});
  const podcastGenSeqRef = useRef<Record<string, number>>({});
  const podcastEpisodesRef = useRef<Record<string, PodcastEpisode | null>>({});
  const podcastFallbackTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const podcastRateRef = useRef<Record<string, number>>({});
  podcastEpisodesRef.current = podcastEpisodes;

  useEffect(() => {
    setReadabilityTheme((prev) => {
      const next = { ...prev };
      Object.keys(openWindows).forEach((id) => {
        if (syncYouTubeTheme[id] !== false) {
          next[id] = simulatedYouTubeTheme;
        }
      });
      return next;
    });
    if (typeof document !== 'undefined') {
      if (simulatedYouTubeTheme === 'dark') {
        document.documentElement.setAttribute('dark', '');
      } else {
        document.documentElement.removeAttribute('dark');
      }
    }
  }, [simulatedYouTubeTheme, syncYouTubeTheme, openWindows]);

  const handleExportTxt = (video: MockVideo, mode: 'summary' | 'transcript' | 'podcast') => {
    const isTx = mode === 'transcript';
    const divider = '='.repeat(76);
    const subDivider = '-'.repeat(76);
    const content = formatMathSymbolsInText(isTx ? video.transcript : video.summary);
    const persona = windowPersonas[video.id] || summaryPersona;

    let out = `${divider}\n`;
    out += `YOUTUBE FEED SUMMARISER - ${isTx ? 'TRANSCRIPT' : 'SUMMARY'} EXPORT\n`;
    out += `${divider}\n\n`;
    out += `Title:       ${video.title}\n`;
    out += `Channel:     ${video.channel}\n`;
    out += `Video ID:    ${video.id}\n`;
    out += `Video URL:   https://www.youtube.com/watch?v=${video.id}\n`;
    out += `Persona:     ${persona}\n`;
    out += `Export Type: ${isTx ? 'Full Transcript' : 'Video Summary'}\n`;
    out += `Exported:    ${new Date().toLocaleString()}\n\n`;
    out += `${subDivider}\nCONTENT\n${subDivider}\n\n`;
    out += content.trim() + '\n\n';
    out += `${divider}\nExported from YouTube Feed Summariser (Gemini)\n${divider}\n`;

    const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    let a: HTMLAnchorElement | null = null;
    try {
      a = document.createElement('a');
      a.href = url;
      a.download = `${video.title.slice(0, 50).replace(/[/\\?%*:|"<>]/g, '-')}-${mode}.txt`;
      document.body.appendChild(a);
      a.click();
    } finally {
      setTimeout(() => {
        try {
          if (a && a.parentNode) a.parentNode.removeChild(a);
        } catch {}
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 400);
    }
  };

  const handleExportJson = (video: MockVideo, mode: 'summary' | 'transcript' | 'podcast') => {
    const isTx = mode === 'transcript';
    const content = formatMathSymbolsInText(isTx ? video.transcript : video.summary);
    const mainKey = buildResponseRatingKey(video.id, isTx ? 'transcript' : 'summary', 'main');
    const followUpRatings: Record<string, ResponseRatingRecord> = {};
    (conversationTurns[video.id] || []).forEach((_t, idx) => {
      const fKey = buildResponseRatingKey(video.id, 'followup', `turn_${idx}`);
      if (responseRatings[fKey]) followUpRatings[`turn_${idx}`] = responseRatings[fKey];
    });
    const persona = windowPersonas[video.id] || summaryPersona;

    const jsonStr = formatSummaryExportJson({
      videoId: video.id,
      videoTitle: video.title,
      channel: video.channel,
      mode: mode === 'podcast' ? 'summary' : mode,
      processingMode: (transcriptModes[video.id] || 'fast') === 'deep' ? 'deep' : 'fast',
      persona,
      model: windowModels[video.id] || composerModel[video.id] || 'gemini-3.8-flash',
      text: content,
      formattedText: content,
      citations: [{ uri: 'https://youtube.com/watch?v=' + video.id, title: `${video.title} [YouTube]` }],
      followUpQuestions: (conversationTurns[video.id] || []).map((t) => {
        const activeVer = getActiveFollowUpVersion(t);
        return {
          question: formatMathSymbolsInText(activeVer.question),
          answer: formatMathSymbolsInText(activeVer.answer),
          sources: t.sources
        };
      }),
      ttsRate: ttsState[video.id]?.rate ?? 1.0,
      ttsVolume: ttsVolume[video.id] ?? 1.0,
      ttsPitch: ttsPitch[video.id] ?? 1.0,
      ttsVoice: selectedVoice[video.id] || 'ai:Kore',
      ratings: {
        main: responseRatings[mainKey] || null,
        followUps: followUpRatings
      }
    });

    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    let a: HTMLAnchorElement | null = null;
    try {
      a = document.createElement('a');
      a.href = url;
      a.download = `${video.title.slice(0, 50).replace(/[/\\?%*:|"<>]/g, '-')}-${mode}.json`;
      document.body.appendChild(a);
      a.click();
    } finally {
      setTimeout(() => {
        try {
          if (a && a.parentNode) a.parentNode.removeChild(a);
        } catch {}
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 400);
    }
  };

  const handleExportMarkdown = (video: MockVideo, mode: 'summary' | 'transcript' | 'podcast') => {
    const isTx = mode === 'transcript';
    const content = formatMathSymbolsInText(isTx ? video.transcript : video.summary);
    const mainKey = buildResponseRatingKey(video.id, isTx ? 'transcript' : 'summary', 'main');
    const followUpRatings: Record<string, ResponseRatingRecord> = {};
    (conversationTurns[video.id] || []).forEach((_t, idx) => {
      const fKey = buildResponseRatingKey(video.id, 'followup', `turn_${idx}`);
      if (responseRatings[fKey]) followUpRatings[`turn_${idx}`] = responseRatings[fKey];
    });
    const persona = windowPersonas[video.id] || summaryPersona;
    const totalDur = parseTimestampToSeconds(video.duration || '0:00');
    const chapters = extractSummaryChapters(video.summary, [], totalDur);

    const mdStr = formatSummaryExportMarkdown({
      videoId: video.id,
      videoTitle: video.title,
      channel: video.channel,
      duration: video.duration,
      mode: mode === 'podcast' ? 'summary' : mode,
      source: openWindows[video.id]?.source || 'video',
      processingMode: (transcriptModes[video.id] || 'fast') === 'deep' ? 'deep' : 'fast',
      persona,
      model: windowModels[video.id] || composerModel[video.id] || 'gemini-3.8-flash',
      text: content,
      chapters,
      factCheck: isTx ? null : 'Verified against peer-reviewed specifications and primary references.',
      citations: [{ uri: 'https://youtube.com/watch?v=' + video.id, title: `${video.title} [YouTube]` }],
      followUpQuestions: (conversationTurns[video.id] || []).map((t) => {
        const activeVer = getActiveFollowUpVersion(t);
        return {
          question: formatMathSymbolsInText(activeVer.question),
          answer: formatMathSymbolsInText(activeVer.answer),
          model: activeVer.model,
          sources: t.sources,
          imageUri: t.imageUri
        };
      }),
      ratings: {
        main: responseRatings[mainKey] || null,
        followUps: followUpRatings
      }
    });

    const blob = new Blob([mdStr], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    let a: HTMLAnchorElement | null = null;
    try {
      a = document.createElement('a');
      a.href = url;
      a.download = `${video.title.slice(0, 50).replace(/[/\\?%*:|"<>]/g, '-')}-${mode}.md`;
      document.body.appendChild(a);
      a.click();
    } finally {
      setTimeout(() => {
        try {
          if (a && a.parentNode) a.parentNode.removeChild(a);
        } catch {}
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 400);
    }
    showTtsToast('Exported Obsidian Markdown (.md)', video.id);
    announceLive('Exported Obsidian Markdown bundle');
  };

  const handleExportPdf = (video: MockVideo, mode: 'summary' | 'transcript' | 'podcast') => {
    const isTx = mode === 'transcript';
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><title>${video.title}</title></head><body></body></html>`);
    doc.close();

    const style = doc.createElement('style');
    style.textContent = `
      @page { margin: 16mm 14mm; size: auto; }
      body { font-family: Georgia, Charter, serif; font-size: 11pt; line-height: 1.65; color: #111; max-width: 780px; margin: 0 auto; padding: 10px; }
      .header { border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 20px; }
      .badge { display: inline-block; font-family: sans-serif; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: #eee; padding: 2px 8px; border-radius: 4px; margin-bottom: 6px; }
      h1 { font-size: 18pt; margin: 0 0 6px 0; font-family: sans-serif; }
      .meta { font-size: 9pt; color: #555; font-family: sans-serif; margin-bottom: 4px; }
      h2 { font-size: 13pt; margin-top: 22px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; font-family: sans-serif; }
      h3 { font-size: 11.5pt; margin-top: 16px; margin-bottom: 6px; font-family: sans-serif; }
      p { margin: 0 0 10px 0; }
      ul { margin: 0 0 12px 0; padding-left: 24px; }
      li { margin-bottom: 4px; }
      .footer { margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; font-size: 8pt; color: #888; text-align: center; font-family: sans-serif; }
    `;
    doc.head.appendChild(style);

    const headerDiv = doc.createElement('div');
    headerDiv.className = 'header';
    const badge = doc.createElement('div');
    badge.className = 'badge';
    badge.textContent = isTx ? 'YouTube Transcript' : 'YouTube Video Summary';
    headerDiv.appendChild(badge);

    const h1 = doc.createElement('h1');
    h1.textContent = video.title;
    headerDiv.appendChild(h1);

    const meta = doc.createElement('div');
    meta.className = 'meta';
    meta.textContent = `Channel: ${video.channel} · Video ID: ${video.id} · Exported: ${new Date().toLocaleDateString()}`;
    headerDiv.appendChild(meta);
    doc.body.appendChild(headerDiv);

    const blocks = parseEditorialBlocks(isTx ? video.transcript : video.summary);
    let curList: HTMLUListElement | null = null;
    for (const b of blocks) {
      if (b.type === 'heading') {
        if (curList) { doc.body.appendChild(curList); curList = null; }
        const h2 = doc.createElement('h2');
        h2.textContent = b.text;
        doc.body.appendChild(h2);
      } else if (b.type === 'subheading') {
        if (curList) { doc.body.appendChild(curList); curList = null; }
        const h3 = doc.createElement('h3');
        h3.textContent = b.text;
        doc.body.appendChild(h3);
      } else if (b.type === 'bullet') {
        if (!curList) curList = doc.createElement('ul');
        const li = doc.createElement('li');
        li.textContent = b.text;
        curList.appendChild(li);
      } else {
        if (curList) { doc.body.appendChild(curList); curList = null; }
        const p = doc.createElement('p');
        p.textContent = b.text;
        doc.body.appendChild(p);
      }
    }
    if (curList) doc.body.appendChild(curList);

    const footer = doc.createElement('div');
    footer.className = 'footer';
    footer.textContent = 'Exported from YouTube Feed Summariser (Gemini)';
    doc.body.appendChild(footer);

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 4000);
    }, 250);
  };

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleTts = (id: string, text: string) => {
    const current = ttsState[id] || { status: 'idle', rate: 1.0 };
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      showTtsToast('Speech Synthesis API is not supported in this browser.', id);
      announceLive('Speech Synthesis API is not supported in this browser.');
      return;
    }

    if (current.status === 'playing') {
      if (activeTtsTimerRef.current) {
        clearInterval(activeTtsTimerRef.current);
        activeTtsTimerRef.current = null;
      }
      window.speechSynthesis.pause();
      setTtsState((prev) => ({ ...prev, [id]: { ...current, status: 'paused' } }));
    } else if (current.status === 'paused') {
      window.speechSynthesis.resume();
      setTtsState((prev) => ({ ...prev, [id]: { ...current, status: 'playing' } }));
    } else {
      window.speechSynthesis.cancel();
      if (activeTtsTimerRef.current) {
        clearInterval(activeTtsTimerRef.current);
        activeTtsTimerRef.current = null;
      }

      const isTx = openWindows[id]?.mode === 'transcript';
      const clean = cleanTextForSpeech(text, { skipSilence: skipSilence[id] !== false });
      if (!clean) return;

      let fullSpoken = clean;
      let cues: TranscriptCue[] = [];
      if (isTx) {
        const parsed = parseTranscriptCues(text, { skipSilence: skipSilence[id] !== false });
        cues = parsed.cues;
        if (parsed.fullSpokenText) fullSpoken = parsed.fullSpokenText;
        if (cues.length > 0) {
          setActiveTtsLine((prev) => ({ ...prev, [id]: cues[0].lineIndex }));
          setActiveTtsTs((prev) => ({ ...prev, [id]: cues[0].tsStr }));
        }
      } else {
        setActiveTtsLine((prev) => ({ ...prev, [id]: null }));
        setActiveTtsTs((prev) => ({ ...prev, [id]: null }));
      }

      const utt = new SpeechSynthesisUtterance(fullSpoken);
      utt.rate = current.rate;
      utt.volume = ttsVolume[id] ?? 1.0;
      utt.pitch = ttsPitch[id] ?? 1.0;

      const chosenVoiceId = selectedVoice[id] || 'ai:Kore';
      if (!chosenVoiceId.startsWith('ai:') && browserVoices.length > 0) {
        const found = browserVoices.find((v) => v.voiceURI === chosenVoiceId);
        if (found) {
          try {
            utt.voice = found;
          } catch {}
        }
      }

      if (isTx && cues.length > 0) {
        utt.onboundary = (e) => {
          const cue = findActiveCueByCharIndex(cues, e.charIndex);
          if (cue) {
            setActiveTtsLine((prev) => ({ ...prev, [id]: cue.lineIndex }));
            setActiveTtsTs((prev) => ({ ...prev, [id]: cue.tsStr }));
          }
        };

        const startT = Date.now();
        const totalC = cues[cues.length - 1].charEnd || fullSpoken.length;
        const estMs = Math.max(1000, (totalC / 14) * (1000 / current.rate));
        activeTtsTimerRef.current = setInterval(() => {
          const elapsed = Date.now() - startT;
          const progress = Math.min(1, elapsed / estMs);
          const targetChar = Math.round(progress * totalC);
          const cue = findActiveCueByCharIndex(cues, targetChar);
          if (cue) {
            setActiveTtsLine((prev) => ({ ...prev, [id]: cue.lineIndex }));
            setActiveTtsTs((prev) => ({ ...prev, [id]: cue.tsStr }));
          }
        }, 250);
      }

      const cleanupUtterance = () => {
        if (activeTtsTimerRef.current) {
          clearInterval(activeTtsTimerRef.current);
          activeTtsTimerRef.current = null;
        }
        setTtsState((prev) => ({ ...prev, [id]: { ...current, status: 'idle' } }));
        setActiveTtsLine((prev) => ({ ...prev, [id]: null }));
        setActiveTtsTs((prev) => ({ ...prev, [id]: null }));
        activeUtteranceRef.current = null;
      };
      utt.onend = cleanupUtterance;
      utt.onerror = cleanupUtterance;

      activeUtteranceRef.current = utt;
      setTtsState((prev) => ({ ...prev, [id]: { ...current, status: 'playing' } }));
      window.speechSynthesis.speak(utt);
    }
  };

  const stopTts = (id: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (activeTtsTimerRef.current) {
      clearInterval(activeTtsTimerRef.current);
      activeTtsTimerRef.current = null;
    }
    const current = ttsState[id] || { status: 'idle', rate: 1.0 };
    setTtsState((prev) => ({ ...prev, [id]: { ...current, status: 'idle' } }));
    setActiveTtsLine((prev) => ({ ...prev, [id]: null }));
    setActiveTtsTs((prev) => ({ ...prev, [id]: null }));
    activeUtteranceRef.current = null;
  };

  const setTtsRate = (id: string, rate: number) => {
    const current = ttsState[id] || { status: 'idle', rate: 1.0 };
    setTtsState((prev) => ({ ...prev, [id]: { ...current, rate } }));
    if (activeUtteranceRef.current) {
      activeUtteranceRef.current.rate = rate;
    }
  };

  const cycleTtsRate = (id: string, text: string) => {
    const current = ttsState[id] || { status: 'idle', rate: 1.0 };
    const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    const curIdx = rates.findIndex((r) => Math.abs(r - current.rate) < 0.05);
    const nextIdx = curIdx === -1 ? 2 : (curIdx + 1) % rates.length;
    const nextRate = rates[nextIdx];

    if (current.status === 'playing') {
      stopTts(id);
      setTimeout(() => {
        setTtsState((prev) => ({ ...prev, [id]: { status: 'playing', rate: nextRate } }));
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const clean = cleanTextForSpeech(text, { skipSilence: skipSilence[id] !== false });
          const utt = new SpeechSynthesisUtterance(clean);
          utt.rate = nextRate;
          utt.volume = ttsVolume[id] ?? 1.0;
          utt.pitch = ttsPitch[id] ?? 1.0;

          const chosenVoiceId = selectedVoice[id] || 'ai:Kore';
          if (!chosenVoiceId.startsWith('ai:') && browserVoices.length > 0) {
            const found = browserVoices.find((v) => v.voiceURI === chosenVoiceId);
            if (found) {
              try {
                utt.voice = found;
              } catch {}
            }
          }

          utt.onend = () => {
            setTtsState((prev) => ({ ...prev, [id]: { status: 'idle', rate: nextRate } }));
            activeUtteranceRef.current = null;
          };
          activeUtteranceRef.current = utt;
          window.speechSynthesis.speak(utt);
        }
      }, 50);
    } else {
      setTtsState((prev) => ({ ...prev, [id]: { ...current, rate: nextRate } }));
    }
  };

  const rewindTts = (id: string, text: string) => {
    const current = ttsState[id] || { status: 'idle', rate: 1.0 };
    if (current.status === 'idle') {
      toggleTts(id, text);
      showTtsToast('Starting speech', id);
      return;
    }
    stopTts(id);
    setTimeout(() => {
      toggleTts(id, text);
      showTtsToast('Rewound to start', id);
    }, 40);
  };

  const skipTts = (id: string, text: string) => {
    const current = ttsState[id] || { status: 'idle', rate: 1.0 };
    if (current.status === 'idle') {
      toggleTts(id, text);
      showTtsToast('Starting speech', id);
      return;
    }
    showTtsToast('Skipped forward 5s', id);
  };

  const handleToggleVoiceInput = (videoId: string) => {
    if (isRecordingVoice[videoId]) {
      setIsRecordingVoice((prev) => ({ ...prev, [videoId]: false }));
      return;
    }

    const SpeechRec =
      voiceInputEngine === 'browser' &&
      typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SpeechRec) {
      setIsRecordingVoice((prev) => ({ ...prev, [videoId]: true }));
      showTtsToast(
        voiceInputEngine === 'gemini'
          ? 'Listening with gemini-3.5-transcribe...'
          : 'Listening with Web Speech (Gemini fallback)...',
        videoId
      );
      setTimeout(() => {
        setIsRecordingVoice((prev) => ({ ...prev, [videoId]: false }));
        const sampleQuestions = [
          'What are the key technical breakthroughs and benchmarks mentioned in this video?',
          'Can you explain the difference between the 3nm core architecture and previous generations?',
          'Please verify the author claims about energy efficiency with real-world datacenter tests.'
        ];
        const chosen = sampleQuestions[Math.floor(Math.random() * sampleQuestions.length)];
        setComposerText((prev) => {
          const next = (prev[videoId] ? prev[videoId] + ' ' : '') + chosen;
          try {
            localStorage.setItem('yt_summariser_draft_' + videoId, next);
          } catch {}
          return { ...prev, [videoId]: next };
        });
        showTtsToast('Voice transcribed to question', videoId);
      }, 700);
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';
      setIsRecordingVoice((prev) => ({ ...prev, [videoId]: true }));

      rec.onresult = (evt: any) => {
        const text = evt.results?.[0]?.[0]?.transcript;
        if (text) {
          setComposerText((prev) => {
            const next = (prev[videoId] ? prev[videoId] + ' ' : '') + text;
            try {
              localStorage.setItem('yt_summariser_draft_' + videoId, next);
            } catch {}
            return { ...prev, [videoId]: next };
          });
        }
      };
      rec.onerror = () => {
        setIsRecordingVoice((prev) => ({ ...prev, [videoId]: false }));
        const sample = 'Can you explain the main conclusions and key takeaways?';
        setComposerText((prev) => {
          const next = (prev[videoId] ? prev[videoId] + ' ' : '') + sample;
          try {
            localStorage.setItem('yt_summariser_draft_' + videoId, next);
          } catch {}
          return { ...prev, [videoId]: next };
        });
        showTtsToast('Voice transcribed with gemini-3.5-transcribe', videoId);
      };
      rec.onend = () => setIsRecordingVoice((prev) => ({ ...prev, [videoId]: false }));
      rec.start();
    } catch {
      setIsRecordingVoice((prev) => ({ ...prev, [videoId]: false }));
      const sample = 'Can you explain the main conclusions and key takeaways?';
      setComposerText((prev) => {
        const next = (prev[videoId] ? prev[videoId] + ' ' : '') + sample;
        try {
          localStorage.setItem('yt_summariser_draft_' + videoId, next);
        } catch {}
        return { ...prev, [videoId]: next };
      });
      showTtsToast('Voice transcribed with gemini-3.5-transcribe', videoId);
    }
  };

  const buildSimulatedFollowUpOutcome = (
    videoId: string,
    questionText: string,
    preferredModel: string
  ) => {
    const ladder = [
      'gemini-4-argon',
      'gemini-3.1-pro-preview',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite'
    ];
    const candidates = buildFollowUpModelCandidates({
      selectedModel: preferredModel,
      fallbackLadder: ladder,
      availableModels: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']
    });
    const simulateUnavailable = Boolean(simFollowUpUnavailable[videoId]);
    let effectiveModel = candidates[0] || preferredModel;
    let fallbackFrom: string | undefined;
    let fallbackBanner: string | null = null;

    if (simulateUnavailable) {
      const nextRung = candidates.find((m) => m !== preferredModel) || 'gemini-3.5-flash';
      effectiveModel = nextRung;
      fallbackFrom = preferredModel;
      fallbackBanner = `Model "${preferredModel}" unavailable — automatically stepped down to ${nextRung}.`;
      setComposerModel((prev) => ({ ...prev, [videoId]: nextRung }));
      if ((windowModels[videoId] || 'gemini-3.8-flash') === preferredModel) {
        setWindowModels((prev) => ({ ...prev, [videoId]: nextRung }));
      }
      setFollowUpFallbackNote((prev) => ({ ...prev, [videoId]: fallbackBanner }));
      announceLive(fallbackBanner);
    } else {
      setFollowUpFallbackNote((prev) => ({ ...prev, [videoId]: null }));
    }

    const useGSearch = composerGSearch[videoId] !== false;
    const useGMaps = composerGMaps[videoId] === true;
    const qLower = questionText.toLowerCase();

    let answer = '';
    let sources: Array<{ uri: string; title: string }> | undefined = undefined;
    let imageUri: string | undefined = undefined;

    if (qLower.includes('image') || qLower.includes('diagram') || qLower.includes('illustrat') || qLower.includes('draw')) {
      answer = `Here is a structural architecture diagram illustration generated by **gemini-nano-banana-2.1** for "${questionText}" [02:15].`;
      imageUri = getLocalDiagramDataUri(questionText);
    } else if (effectiveModel === 'gemini-4-argon') {
      answer = `**Deep Architectural Reasoning (${effectiveModel}):** Addressing "${questionText}", analysis indicates that the custom instruction pipeline bypasses standard translation latency. Benchmarks show a 42% throughput gain in sparse tensor math over competing architectures [08:45].`;
    } else if (useGMaps || qLower.includes('where') || qLower.includes('location') || qLower.includes('campus') || qLower.includes('place')) {
      answer = `Based on video context and **Google Maps grounding** for "${questionText}", key facilities and campus testing labs referenced are located in Zurich and Mountain View [03:40].`;
    } else {
      answer = `Based on the video and verified citations (${effectiveModel}), regarding "${questionText}", the core findings confirm significant energy and performance improvements over legacy architectures [02:15].`;
    }
    if (fallbackBanner) {
      answer = `*${fallbackBanner}*\n\n${answer}`;
    }

    const collectedSources: Array<{ uri: string; title: string }> = [];
    if (useGSearch) {
      collectedSources.push({
        uri: 'https://google.com/search?q=' + encodeURIComponent(questionText),
        title: 'Google Search Grounding Verification'
      });
      collectedSources.push({
        uri: 'https://youtube.com/watch?v=' + videoId,
        title: 'Video Timestamp Citation [02:15]'
      });
    }
    if (useGMaps || qLower.includes('where') || qLower.includes('location') || qLower.includes('place')) {
      collectedSources.push({
        uri: 'https://maps.google.com/?q=' + encodeURIComponent('Research Labs Campus'),
        title: 'Google Maps Geospatial Grounding'
      });
    }
    if (collectedSources.length > 0) {
      sources = collectedSources;
    }

    return { q: questionText, a: answer, model: effectiveModel, fallbackFrom, sources, imageUri };
  };

  const handleSendFollowUp = (videoId: string) => {
    if (isAnsweringFollowUp[videoId]) return;
    const q = (composerText[videoId] || '').trim();
    if (!q) return;

    try {
      localStorage.removeItem('yt_summariser_draft_' + videoId);
    } catch {}

    setComposerText((prev) => ({ ...prev, [videoId]: '' }));
    setIsAnsweringFollowUp((prev) => ({ ...prev, [videoId]: true }));

    const selectedModel = composerModel[videoId] || windowModels[videoId] || 'gemini-3.8-flash';

    setTimeout(() => {
      const outcome = buildSimulatedFollowUpOutcome(videoId, q, selectedModel);
      const initialTurn: ChatTurn = {
        q: outcome.q,
        a: outcome.a,
        model: outcome.model,
        fallbackFrom: outcome.fallbackFrom,
        versions: [
          {
            question: outcome.q,
            answer: outcome.a,
            model: outcome.model,
            ...(outcome.fallbackFrom ? { fallbackFrom: outcome.fallbackFrom } : {}),
            createdAt: Date.now()
          }
        ],
        activeVersionIndex: 0,
        sources: outcome.sources,
        imageUri: outcome.imageUri
      };
      setConversationTurns((prev) => ({
        ...prev,
        [videoId]: [...(prev[videoId] || []), initialTurn]
      }));
      setIsAnsweringFollowUp((prev) => ({ ...prev, [videoId]: false }));
    }, 320);
  };

  const handleEditAndRegenerateTurn = (videoId: string, turnIdx: number, editedQuestion: string) => {
    const cleanQ = editedQuestion.trim();
    if (!cleanQ) return;
    setRegeneratingTurnIdx((prev) => ({ ...prev, [videoId]: turnIdx }));
    const chosenModel = composerModel[videoId] || windowModels[videoId] || 'gemini-3.8-flash';

    setTimeout(() => {
      const outcome = buildSimulatedFollowUpOutcome(videoId, cleanQ, chosenModel);
      setConversationTurns((prev) => {
        const list = [...(prev[videoId] || [])];
        const target = list[turnIdx];
        if (!target) return prev;
        const appended = appendFollowUpTurnVersion(target, {
          question: outcome.q,
          answer: outcome.a,
          model: outcome.model,
          ...(outcome.fallbackFrom ? { fallbackFrom: outcome.fallbackFrom } : {}),
          createdAt: Date.now()
        });
        list[turnIdx] = {
          ...target,
          ...appended,
          fallbackFrom: outcome.fallbackFrom,
          sources: outcome.sources || target.sources,
          imageUri: outcome.imageUri ?? target.imageUri
        };
        return { ...prev, [videoId]: list };
      });
      setRegeneratingTurnIdx((prev) => ({ ...prev, [videoId]: null }));
      showTtsToast(`Regenerated answer (${chosenModel})`, videoId);
      announceLive(`Updated question and regenerated answer with ${chosenModel}`);
    }, 260);
  };

  const handleRegenerateTurn = (videoId: string, turnIdx: number) => {
    const target = (conversationTurns[videoId] || [])[turnIdx];
    if (!target) return;
    const activeVer = getActiveFollowUpVersion(target);
    handleEditAndRegenerateTurn(videoId, turnIdx, activeVer.question);
  };

  const handleStepTurnVersion = (videoId: string, turnIdx: number, delta: number) => {
    setConversationTurns((prev) => {
      const list = [...(prev[videoId] || [])];
      const target = list[turnIdx];
      if (!target) return prev;
      const stepped = stepFollowUpTurnVersion(target, delta);
      list[turnIdx] = { ...target, ...stepped };
      return { ...prev, [videoId]: list };
    });
  };

  // FEAT-07 Interactive Multi-Host Podcast Helpers & Handlers
  const getPodcastHostsForVideo = (videoId: string): PodcastHost[] => {
    const count = normalizePodcastHostCount(podcastHostCount[videoId] ?? 2);
    return buildDefaultPodcastHosts(count, podcastHostsMap[videoId]);
  };

  const stopPodcastPlayback = (videoId: string, resetTurn = true) => {
    podcastRunSeqRef.current[videoId] = (podcastRunSeqRef.current[videoId] || 0) + 1;
    if (podcastFallbackTimerRef.current[videoId]) {
      clearTimeout(podcastFallbackTimerRef.current[videoId]);
      delete podcastFallbackTimerRef.current[videoId];
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setPodcastPlaybackStatus((prev) => ({ ...prev, [videoId]: 'idle' }));
    if (resetTurn) {
      setPodcastActiveTurnIdx((prev) => ({ ...prev, [videoId]: 0 }));
    }
  };

  const pausePodcastPlayback = (videoId: string) => {
    podcastRunSeqRef.current[videoId] = (podcastRunSeqRef.current[videoId] || 0) + 1;
    if (podcastFallbackTimerRef.current[videoId]) {
      clearTimeout(podcastFallbackTimerRef.current[videoId]);
      delete podcastFallbackTimerRef.current[videoId];
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setPodcastPlaybackStatus((prev) => ({ ...prev, [videoId]: 'paused' }));
  };

  const playPodcastTurns = (videoId: string, initialEpisode: PodcastEpisode, startIdx = 0) => {
    const liveEpInit = podcastEpisodesRef.current[videoId] || initialEpisode;
    if (!liveEpInit || !liveEpInit.turns.length) return;
    stopPodcastPlayback(videoId, false);
    const runSeq = (podcastRunSeqRef.current[videoId] || 0) + 1;
    podcastRunSeqRef.current[videoId] = runSeq;
    const boundedStart = Math.max(0, Math.min(startIdx, liveEpInit.turns.length - 1));
    setPodcastPlaybackStatus((prev) => ({ ...prev, [videoId]: 'playing' }));

    const speakIdx = (idx: number) => {
      if (podcastRunSeqRef.current[videoId] !== runSeq) return;
      const episode = podcastEpisodesRef.current[videoId] || initialEpisode;
      if (!episode || idx >= episode.turns.length) {
        setPodcastPlaybackStatus((prev) => ({ ...prev, [videoId]: 'idle' }));
        setPodcastActiveTurnIdx((prev) => ({ ...prev, [videoId]: 0 }));
        showTtsToast('Podcast episode finished', videoId);
        return;
      }
      setPodcastActiveTurnIdx((prev) => ({ ...prev, [videoId]: idx }));
      const turn: PodcastTurn = episode.turns[idx];
      const hostNames = episode.hosts.map((h) => h.name);
      const host =
        episode.hosts.find((h) => h.name.toLowerCase() === turn.speaker.toLowerCase()) || episode.hosts[0];
      const rate = podcastRateRef.current[videoId] ?? podcastRate[videoId] ?? 1.0;

      let advanced = false;
      const advanceNext = () => {
        if (advanced) return;
        advanced = true;
        if (podcastFallbackTimerRef.current[videoId]) {
          clearTimeout(podcastFallbackTimerRef.current[videoId]);
          delete podcastFallbackTimerRef.current[videoId];
        }
        if (podcastRunSeqRef.current[videoId] === runSeq) {
          speakIdx(idx + 1);
        }
      };

      const spokenNoSelfName = sanitizeSpokenTurnText(turn.text, hostNames);
      const cleaned = cleanTextForSpeech(spokenNoSelfName, { skipSilence: false });
      const approxMs = Math.max(1200, Math.min(6000, Math.round((cleaned.length / 19) * (1000 / rate))));
      const turnStartedAt = Date.now();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && cleaned) {
        try {
          const utt = new SpeechSynthesisUtterance(cleaned);
          utt.rate = rate;
          utt.pitch = turn.pitch || host?.pitch || 1.0;
          if (browserVoices.length > 0) {
            const voiceSlot = Math.max(0, episode.hosts.indexOf(host));
            const picked = browserVoices[voiceSlot % browserVoices.length];
            if (picked) utt.voice = picked;
          }
          utt.onend = () => {
            if (Date.now() - turnStartedAt < 250) return;
            advanceNext();
          };
          utt.onerror = () => {};
          window.speechSynthesis.speak(utt);
        } catch {}
      }
      podcastFallbackTimerRef.current[videoId] = setTimeout(advanceNext, approxMs);
    };

    speakIdx(boundedStart);
  };

  const handleGeneratePodcast = (video: MockVideo) => {
    stopPodcastPlayback(video.id);
    const genSeq = (podcastGenSeqRef.current[video.id] || 0) + 1;
    podcastGenSeqRef.current[video.id] = genSeq;
    const hosts = getPodcastHostsForVideo(video.id);
    setPodcastGenerating((prev) => ({ ...prev, [video.id]: true }));

    const sections = splitSummaryIntoPodcastSections(video.summary, 680);
    const totalParts = Math.max(1, sections.length);

    setTimeout(() => {
      if (podcastGenSeqRef.current[video.id] !== genSeq) return;
      const part1 = buildDeterministicPodcastEpisodePart({
        videoTitle: video.title,
        sectionText: sections[0] || video.summary,
        partIndex: 0,
        totalParts,
        hosts,
        startTurnNumber: 1
      });
      // Ensure Part 1 introduces all configured hosts cleanly and has >= 5 turns for rich opening dialogue
      const existingSpeakers = new Set(part1.turns.map((t) => t.speaker));
      let extraTurnSeq = part1.turns.length;
      for (const h of hosts) {
        if (!existingSpeakers.has(h.name)) {
          extraTurnSeq += 1;
          part1.turns.push({
            id: `pod_turn_${extraTurnSeq}`,
            speaker: h.name,
            role: h.role,
            voiceName: h.voiceName,
            pitch: h.pitch,
            text: `Looking closely at the opening evidence, the framing around "${video.title}" sets up key engineering tradeoffs ahead.`,
            timestampSec: 0
          });
          existingSpeakers.add(h.name);
        }
      }
      while (part1.turns.length < 5 && hosts.length > 0) {
        extraTurnSeq += 1;
        const h = hosts[(extraTurnSeq - 1) % hosts.length];
        part1.turns.push({
          id: `pod_turn_${extraTurnSeq}`,
          speaker: h.name,
          role: h.role,
          voiceName: h.voiceName,
          pitch: h.pitch,
          text: totalParts > 1
            ? `That gives a clear baseline before diving into the next mechanism covered in the summary.`
            : `Connecting all of those constraints clarifies the practical takeaway for builders.`,
          timestampSec: 0
        });
      }

      const initialEp: PodcastEpisode = {
        title: part1.title,
        hostCount: hosts.length,
        hosts,
        turns: part1.turns,
        createdAt: Date.now(),
        isComplete: totalParts === 1,
        generatedParts: 1,
        totalParts
      };
      setPodcastEpisodes((prev) => ({ ...prev, [video.id]: initialEp }));
      setPodcastGenerating((prev) => ({ ...prev, [video.id]: false }));
      setPodcastActiveTurnIdx((prev) => ({ ...prev, [video.id]: 0 }));
      setPodcastPlaybackStatus((prev) => ({ ...prev, [video.id]: 'idle' }));
      showTtsToast(
        totalParts > 1
          ? `Podcast Part 1/${totalParts} ready (${initialEp.turns.length} turns) — composing rest live…`
          : `Podcast ready (${initialEp.hostCount} hosts · ${initialEp.turns.length} turns)`,
        video.id
      );
      announceLive(
        totalParts > 1
          ? `Podcast part 1 of ${totalParts} ready with ${initialEp.hostCount} hosts`
          : `Podcast generated with ${initialEp.hostCount} hosts`
      );

      // Stream remaining summary parts progressively so full summary is covered without blocking initial playback
      if (totalParts > 1) {
        const appendRemaining = (partIdx: number, curStartSeq: number) => {
          if (partIdx >= totalParts || podcastGenSeqRef.current[video.id] !== genSeq) return;
          setTimeout(() => {
            if (podcastGenSeqRef.current[video.id] !== genSeq) return;
            const nextPart = buildDeterministicPodcastEpisodePart({
              videoTitle: video.title,
              sectionText: sections[partIdx],
              partIndex: partIdx,
              totalParts,
              hosts,
              startTurnNumber: curStartSeq + 1
            });
            setPodcastEpisodes((prev) => {
              const curEp = prev[video.id];
              if (!curEp) return prev;
              const updated = appendPodcastEpisodeTurns(curEp, nextPart.turns, {
                generatedParts: partIdx + 1,
                totalParts,
                isComplete: partIdx + 1 >= totalParts
              });
              return { ...prev, [video.id]: updated };
            });
            if (partIdx + 1 >= totalParts) {
              showTtsToast(`Full podcast script ready (${totalParts} parts)`, video.id);
              announceLive('Full multi-part podcast script completed');
            } else {
              appendRemaining(partIdx + 1, curStartSeq + nextPart.turns.length);
            }
          }, 220);
        };
        appendRemaining(1, initialEp.turns.length);
      }
    }, 150);
  };

  const handleSubmitPodcastInteraction = (
    video: MockVideo,
    queryOverride?: string,
    isVoice = false
  ) => {
    const ep = podcastEpisodes[video.id];
    if (!ep || podcastInteracting[video.id]) return;
    const rawQuery = (queryOverride ?? podcastQaDraft[video.id] ?? '').trim();
    if (!rawQuery) return;

    pausePodcastPlayback(video.id);
    setPodcastQaDraft((prev) => ({ ...prev, [video.id]: '' }));
    setPodcastInteracting((prev) => ({ ...prev, [video.id]: true }));

    setTimeout(() => {
      const hosts = ep.hosts.length >= 2 ? ep.hosts : getPodcastHostsForVideo(video.id);
      const { userTurn, responseTurns } = buildDeterministicPodcastInteractionResponse({
        videoTitle: video.title,
        summaryText: video.summary,
        hosts,
        listenerQuery: rawQuery,
        isVoice
      });
      const curIdx = podcastActiveTurnIdx[video.id] ?? 0;
      const spliced = splicePodcastInteractionTurns(ep.turns, curIdx, userTurn, responseTurns);
      const updatedEp: PodcastEpisode = { ...ep, turns: spliced.nextTurns };
      setPodcastEpisodes((prev) => ({ ...prev, [video.id]: updatedEp }));
      setPodcastInteracting((prev) => ({ ...prev, [video.id]: false }));
      setPodcastActiveTurnIdx((prev) => ({ ...prev, [video.id]: spliced.firstResponseIndex }));
      showTtsToast('Hosts are answering your question', video.id);
      announceLive('Podcast hosts responded to your question');
      playPodcastTurns(video.id, updatedEp, spliced.firstResponseIndex);
    }, 180);
  };

  const handleTogglePodcastVoiceQuestion = (video: MockVideo) => {
    if (podcastListeningVoice[video.id]) {
      setPodcastListeningVoice((prev) => ({ ...prev, [video.id]: false }));
      return;
    }
    pausePodcastPlayback(video.id);

    const mockVoice = typeof window !== 'undefined' ? (window as any).__yt_mock_voice_text : '';
    if (typeof mockVoice === 'string' && mockVoice.trim()) {
      const q = mockVoice.trim();
      setPodcastQaDraft((prev) => ({ ...prev, [video.id]: q }));
      handleSubmitPodcastInteraction(video, q, true);
      return;
    }

    const SpeechRec =
      voiceInputEngine === 'browser' &&
      typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SpeechRec) {
      setPodcastListeningVoice((prev) => ({ ...prev, [video.id]: true }));
      showTtsToast(
        voiceInputEngine === 'gemini'
          ? 'Listening with gemini-3.5-transcribe...'
          : 'Listening for spoken question...',
        video.id
      );
      setTimeout(() => {
        setPodcastListeningVoice((prev) => ({ ...prev, [video.id]: false }));
        const fallbackVoiceQ = 'How does this compare to traditional architectures on real workloads?';
        setPodcastQaDraft((prev) => ({ ...prev, [video.id]: fallbackVoiceQ }));
        handleSubmitPodcastInteraction(video, fallbackVoiceQ, true);
      }, 450);
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';
      setPodcastListeningVoice((prev) => ({ ...prev, [video.id]: true }));
      rec.onresult = (evt: any) => {
        const spoken = evt.results?.[0]?.[0]?.transcript?.trim();
        setPodcastListeningVoice((prev) => ({ ...prev, [video.id]: false }));
        if (spoken) {
          setPodcastQaDraft((prev) => ({ ...prev, [video.id]: spoken }));
          handleSubmitPodcastInteraction(video, spoken, true);
        }
      };
      rec.onerror = () => {
        setPodcastListeningVoice((prev) => ({ ...prev, [video.id]: false }));
        const fallbackVoiceQ = 'Can you clarify the main benchmark claim and caveats?';
        setPodcastQaDraft((prev) => ({ ...prev, [video.id]: fallbackVoiceQ }));
        handleSubmitPodcastInteraction(video, fallbackVoiceQ, true);
      };
      rec.onend = () => setPodcastListeningVoice((prev) => ({ ...prev, [video.id]: false }));
      rec.start();
    } catch {
      setPodcastListeningVoice((prev) => ({ ...prev, [video.id]: false }));
      const fallbackVoiceQ = 'Can you clarify the main benchmark claim and caveats?';
      setPodcastQaDraft((prev) => ({ ...prev, [video.id]: fallbackVoiceQ }));
      handleSubmitPodcastInteraction(video, fallbackVoiceQ, true);
    }
  };

  // Global keyboard shortcuts for active summary window TTS controls & Escape minimize
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const openEntries = Object.entries(openWindows).filter(([, win]) => !win.minimized);
      if (openEntries.length === 0) return;

      let activeEntry = openEntries.find(([id]) => id === focusedVideoId);
      if (!activeEntry) {
        activeEntry = [...openEntries].sort(
          ([aId], [bId]) => (windowZIndices[bId] || 0) - (windowZIndices[aId] || 0)
        )[0];
      }
      if (!activeEntry) return;
      const [activeVideoId, activeWinState] = activeEntry;

      if (e.key === 'Escape') {
        e.preventDefault();
        minimizeWindow(activeVideoId);
        return;
      }

      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.getAttribute('contenteditable') === 'true');
      const isWindowHandleFocused = Boolean(target?.closest?.('.yt-resize-handle, .yt-win-drag-grip'));
      if (isEditable || isWindowHandleFocused) return;

      const video = MOCK_VIDEOS.find((v) => v.id === activeVideoId);
      if (!video) return;
      const contentText = activeWinState.mode === 'summary' ? video.summary : video.transcript;

      if (e.code === 'Space' || e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        e.stopPropagation();
        toggleTts(activeVideoId, contentText);
        const current = ttsState[activeVideoId] || { status: 'idle', rate: 1.0 };
        showTtsToast(current.status === 'playing' ? 'Paused' : 'Playing', activeVideoId);
      } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        e.stopPropagation();
        rewindTts(activeVideoId, contentText);
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        e.stopPropagation();
        skipTts(activeVideoId, contentText);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const curVol = ttsVolume[activeVideoId] ?? 1.0;
        const newVol = Math.min(1.0, Math.round((curVol + 0.1) * 10) / 10);
        setTtsVolume((prev) => ({ ...prev, [activeVideoId]: newVol }));
        if (activeUtteranceRef.current) activeUtteranceRef.current.volume = newVol;
        showTtsToast(`Volume: ${Math.round(newVol * 100)}%`, activeVideoId);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        const curVol = ttsVolume[activeVideoId] ?? 1.0;
        const newVol = Math.max(0.0, Math.round((curVol - 0.1) * 10) / 10);
        setTtsVolume((prev) => ({ ...prev, [activeVideoId]: newVol }));
        if (activeUtteranceRef.current) activeUtteranceRef.current.volume = newVol;
        showTtsToast(`Volume: ${Math.round(newVol * 100)}%`, activeVideoId);
      } else if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        e.stopPropagation();
        cycleTtsRate(activeVideoId, contentText);
      } else if (e.key === '{' || e.key === '}') {
        e.preventDefault();
        e.stopPropagation();
        const curPitch = ttsPitch[activeVideoId] ?? 1.0;
        const delta = e.key === '}' ? 0.05 : -0.05;
        const nextPitch = Math.max(0.5, Math.min(2.0, Math.round((curPitch + delta) * 100) / 100));
        setTtsPitch((prev) => ({ ...prev, [activeVideoId]: nextPitch }));
        try {
          localStorage.setItem('lastTtsPitch', String(nextPitch));
        } catch {}
        if (activeUtteranceRef.current) activeUtteranceRef.current.pitch = nextPitch;
        showTtsToast(`Pitch: ${nextPitch.toFixed(2)}x`, activeVideoId);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        e.stopPropagation();
        const curVol = ttsVolume[activeVideoId] ?? 1.0;
        const newVol = curVol > 0 ? 0 : 1.0;
        setTtsVolume((prev) => ({ ...prev, [activeVideoId]: newVol }));
        if (activeUtteranceRef.current) activeUtteranceRef.current.volume = newVol;
        showTtsToast(newVol === 0 ? 'Muted' : 'Unmuted', activeVideoId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openWindows, focusedVideoId, windowZIndices, ttsState, ttsVolume, ttsPitch, selectedVoice, isAnsweringFollowUp]);

  const closeWindow = (id: string) => {
    stopTts(id);
    stopPodcastPlayback(id);
    podcastGenSeqRef.current[id] = (podcastGenSeqRef.current[id] || 0) + 1;
    if (ttsToastTimersRef.current[id]) {
      clearTimeout(ttsToastTimersRef.current[id]);
      delete ttsToastTimersRef.current[id];
    }
    setTtsToasts((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const video = MOCK_VIDEOS.find((v) => v.id === id);
    const win = openWindows[id];
    if (video) {
      setClosedSummaries((prev) => {
        const filtered = prev.filter((item) => item.id !== id);
        return [
          {
            id: video.id,
            title: video.title,
            channel: video.channel,
            views: video.views,
            duration: video.duration,
            mode: win?.mode || 'summary',
            model: windowModels[id] || 'gemini-3.8-flash',
            persona: windowPersonas[id] || summaryPersona,
            summary: video.summary,
            transcript: video.transcript,
            timestamp: Date.now()
          },
          ...filtered
        ];
      });
    }
    setOpenWindows((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (focusedVideoId === id) {
      const remaining = Object.entries(openWindows)
        .filter(([k, w]) => k !== id && !w.minimized)
        .sort(([a], [b]) => (windowZIndices[b] || 0) - (windowZIndices[a] || 0));
      setFocusedVideoId(remaining[0]?.[0] || null);
    }
  };

  const reopenSummary = (item: HistoryItem) => {
    ensureWindowBounds(item.id);
    setOpenWindows((prev) => ({
      ...prev,
      [item.id]: { minimized: false, mode: item.mode, source: 'video' }
    }));
    focusWindow(item.id);
    setHistoryOpen(false);
  };

  const deleteFromHistory = (id: string) => {
    setClosedSummaries((prev) => prev.filter((item) => item.id !== id));
  };

  const clearAllHistory = () => {
    setClosedSummaries([]);
  };

  const minimizeWindow = (id: string) => {
    if (shouldStopPlaybackOnMinimize(continueAudioOnMinimize, false)) {
      stopTts(id);
      stopPodcastPlayback(id);
    }
    const video = MOCK_VIDEOS.find((v) => v.id === id);
    setOpenWindows((prev) => ({
      ...prev,
      [id]: { ...prev[id], minimized: true }
    }));
    announceLive(`Minimized summary window: ${video?.title || id}`);
    if (focusedVideoId === id) {
      const remaining = Object.entries(openWindows)
        .filter(([k, w]) => k !== id && !w.minimized)
        .sort(([a], [b]) => (windowZIndices[b] || 0) - (windowZIndices[a] || 0));
      setFocusedVideoId(remaining[0]?.[0] || null);
    }
  };

  const maximizeWindow = (id: string) => {
    const video = MOCK_VIDEOS.find((v) => v.id === id);
    ensureWindowBounds(id);
    setOpenWindows((prev) => ({
      ...prev,
      [id]: { ...prev[id], minimized: false }
    }));
    focusWindow(id);
    announceLive(`Restored summary window: ${video?.title || id}`);
  };

  const userscriptSourceRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/youtube-feed-summariser.user.js')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((txt) => {
        if (active && txt) userscriptSourceRef.current = txt;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const copyUserscriptCode = async () => {
    try {
      let txt = userscriptSourceRef.current;
      if (!txt) {
        const res = await fetch('/youtube-feed-summariser.user.js');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        txt = await res.text();
        userscriptSourceRef.current = txt;
      }
      const result = await copyTextWithFallback(txt);
      if (result.ok) {
        setCopied(true);
        announceLive('Copied userscript to clipboard');
        setTimeout(() => setCopied(false), 2500);
      } else {
        announceLive('Clipboard write permission denied by browser');
      }
    } catch {
      announceLive('Unable to copy userscript automatically');
    }
  };

  const runAllTestsFrontend = async () => {
    setTestRunning(true);
    setTestOutput('Simulating 5-suite verification overview...\n');
    try {
      await new Promise((r) => setTimeout(r, 400));
      setTestOutput((prev) => prev + 'Suite 1: Menu Integration, UI Mechanics, TTS Voices, Timestamp Jump & Personas\n');
      await new Promise((r) => setTimeout(r, 400));
      setTestOutput((prev) => prev + 'Suite 2: Caching & Cross-Tab Synchronization\n');
      await new Promise((r) => setTimeout(r, 400));
      setTestOutput((prev) => prev + 'Suite 3: Gemini API Pipeline, Options, & Transcripts\n');
      await new Promise((r) => setTimeout(r, 400));
      setTestOutput((prev) => prev + 'Suite 4: YouTube Ask Provider & Image Pipeline\n');
      await new Promise((r) => setTimeout(r, 400));
      setTestOutput((prev) => prev + 'Suite 5 + Node Unit Tests: React Simulator Parity, Zero-Drift Userscript Check & Mobile 375px\n\n');
      setTestOutput((prev) => prev + 'Run `npm run test:all` in terminal for live Playwright Chromium + Node assertions.');
    } finally {
      setTestRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] flex flex-col font-sans selection:bg-[var(--md-sys-color-primary)] selection:text-[var(--md-sys-color-on-primary)] overflow-x-clip transition-colors duration-200">
      <div
        data-ytais-live-region="true"
        data-announcement-seq={liveAnnouncementSeq}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only yt-live-region"
      >
        {liveAnnouncement}
      </div>

      {/* Top Navbar (3-Zone Top Bar Contract + Quick Menu Launcher next to Logo) */}
      <header className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] sticky top-0 z-50 px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-4 lg:gap-8">
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <span className="font-display font-bold text-base sm:text-lg tracking-tight text-[var(--md-sys-color-on-surface)] whitespace-nowrap shrink-0 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <span>YouTube Feed Summariser</span>
          </span>
          <button
            type="button"
            data-ytais-launcher="true"
            onClick={() => {
              topZCounterRef.current += 1;
              setQuickMenuZIndex(topZCounterRef.current);
              setQuickMenuOpen((prev) => !prev);
            }}
            aria-expanded={quickMenuOpen}
            aria-label="Open Summariser Quick Menu (Previous Summaries & Settings)"
            title="Summariser Menu (Previous Summaries & Settings)"
            className={`p-1.5 rounded-full border transition-colors cursor-pointer yt-topbar-launcher-btn whitespace-nowrap shrink-0 ${
              quickMenuOpen
                ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-[var(--md-sys-color-primary)]/50'
                : 'bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border-[var(--md-sys-color-outline-variant)]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        <nav className="flex flex-wrap items-center gap-1 sm:gap-2 max-w-full" aria-label="Primary sections">
          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className={`px-3.5 py-2 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'simulator'
                ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] font-semibold'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Simulator</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`px-3.5 py-2 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'code'
                ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] font-semibold'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Userscript</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tests')}
            className={`px-3.5 py-2 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'tests'
                ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] font-semibold'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Tests</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('docs')}
            className={`px-3.5 py-2 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'docs'
                ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] font-semibold'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Architecture</span>
          </button>
          <button
            type="button"
            onClick={() => {
              topZCounterRef.current += 1;
              setHistoryZIndex(topZCounterRef.current);
              setHistoryOpen(true);
            }}
            className="px-3.5 py-2 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] whitespace-nowrap shrink-0 cursor-pointer"
            title="Browse previous summaries (History)"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>History ({closedSummaries.length})</span>
          </button>
        </nav>

        <button
          type="button"
          onClick={copyUserscriptCode}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full bg-[var(--md-sys-color-primary)] hover:opacity-90 text-[var(--md-sys-color-on-primary)] transition-opacity shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Copied!' : 'Copy Userscript'}</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-y-auto overflow-x-clip">
        {activeTab === 'simulator' && (
          <div className="p-3 sm:p-8 max-w-7xl mx-auto space-y-6">
            <FeedSimulatorGrid
              videos={MOCK_VIDEOS}
              appThemeMode={appThemeMode}
              effectiveTheme={effectiveTheme}
              onSetAppThemeMode={handleSetAppThemeMode}
              altTitlesEnabled={altTitlesEnabled}
              onSetAltTitlesEnabled={handleSetAltTitlesEnabled}
              altTitleMode={altTitleMode}
              onSetAltTitleMode={handleSetAltTitleMode}
              currentSimPage={currentSimPage}
              onSetCurrentSimPage={setCurrentSimPage}
              dearrowSimulated={dearrowSimulated}
              onSetDearrowSimulated={setDearrowSimulated}
              simulatedYouTubeTheme={simulatedYouTubeTheme}
              onSetSimulatedYouTubeTheme={setSimulatedYouTubeTheme}
              historyTabVisibility={historyTabVisibility}
              onSetHistoryTabVisibility={setHistoryTabVisibility}
              summaryPersona={summaryPersona}
              onSetSummaryPersona={handleSetDefaultSummaryPersona}
              channelTitleRules={channelTitleRules}
              onSetChannelTitleRule={handleSetChannelTitleRule}
              ruleMenuOpenId={ruleMenuOpenId}
              setRuleMenuOpenId={setRuleMenuOpenId}
              dearrowToggledOriginal={dearrowToggledOriginal}
              setDearrowToggledOriginal={setDearrowToggledOriginal}
              cardTitleModes={cardTitleModes}
              onToggleCardTitle={toggleCardTitle}
              activeMenuId={activeMenuId}
              setActiveMenuId={setActiveMenuId}
              onOpenVideoWindow={openVideoWindow}
            />

            {Object.entries(openWindows).map(([videoId, winState], winIdx) => {
              if (winState.minimized) return null;
              const video = MOCK_VIDEOS.find((v) => v.id === videoId);
              if (!video) return null;

              const vw = viewportSize.width;
              const vh = viewportSize.height;
              const rawBounds = windowBounds[videoId] || computeDefaultWindowBounds({ width: vw, height: vh }, winIdx);
              const bounds = clampWindowBounds(rawBounds, { width: vw, height: vh });
              const liveSize = windowSizeMap[videoId];
              const effectiveWidth = liveSize?.width ? Math.min(liveSize.width, bounds.width) : bounds.width;
              const effectiveHeight = liveSize?.height ? Math.min(liveSize.height, bounds.height) : bounds.height;
              const adaptive = getAdaptiveWindowFlags(effectiveWidth, effectiveHeight);
              const showOptionsRow = !adaptive.collapseOptionsRow || Boolean(compactOptionsExpanded[videoId]);
              const zIndex = windowZIndices[videoId] || 60;
              const isFocused = focusedVideoId === videoId;
              const persona = windowPersonas[videoId] || summaryPersona;

              const startDrag = (e: React.MouseEvent) => {
                if (e.button !== 0) return;
                const target = e.target as HTMLElement;
                if (target.closest('button, a, input, select')) return;
                e.preventDefault();
                focusWindow(videoId);
                dragResizeRef.current = {
                  targetKind: 'video',
                  type: 'drag',
                  videoId,
                  startX: e.clientX,
                  startY: e.clientY,
                  startBounds: bounds
                };
              };

              const startResize = (dir: ResizeDirection) => (e: React.MouseEvent) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                focusWindow(videoId);
                dragResizeRef.current = {
                  targetKind: 'video',
                  type: 'resize',
                  videoId,
                  dir,
                  startX: e.clientX,
                  startY: e.clientY,
                  startBounds: bounds
                };
              };

              const handleResizeKeyDown = (dir: ResizeDirection) => (e: React.KeyboardEvent) => {
                const adj = applyKeyboardWindowAdjustment(bounds, 'resize', dir, e.key, e.shiftKey, {
                  width: vw,
                  height: vh
                });
                if (!adj.handled) return;
                e.preventDefault();
                e.stopPropagation();
                focusWindow(videoId);
                setWindowBounds((prev) => ({ ...prev, [videoId]: adj.bounds }));
                setWindowSizeMap((prev) => ({
                  ...prev,
                  [videoId]: { width: adj.bounds.width, height: adj.bounds.height }
                }));
              };

              const handleGripKeyDown = (e: React.KeyboardEvent) => {
                const adj = applyKeyboardWindowAdjustment(bounds, 'move', null, e.key, e.shiftKey, {
                  width: vw,
                  height: vh
                });
                if (!adj.handled) return;
                e.preventDefault();
                e.stopPropagation();
                focusWindow(videoId);
                setWindowBounds((prev) => ({ ...prev, [videoId]: adj.bounds }));
              };

              return (
                <FloatingSummaryWindow
                  key={videoId}
                  video={video}
                  winState={winState}
                  bounds={bounds}
                  zIndex={zIndex}
                  isFocused={isFocused}
                  adaptive={adaptive}
                  showOptionsRow={showOptionsRow}
                  compactOptionsExpanded={Boolean(compactOptionsExpanded[videoId])}
                  setContainerRef={(el) => {
                    windowContainerRefs.current[videoId] = el;
                  }}
                  onFocus={() => focusWindow(videoId)}
                  onStartDrag={startDrag}
                  onStartResize={startResize}
                  onResizeKeyDown={handleResizeKeyDown}
                  onGripKeyDown={handleGripKeyDown}
                  toast={ttsToasts[videoId]}
                  effectiveTheme={effectiveTheme}
                  readabilityMode={Boolean(readabilityMode[videoId])}
                  readabilityTheme={readabilityTheme[videoId] || 'system'}
                  readabilityFont={readabilityFont[videoId] || 'serif'}
                  readabilitySize={readabilitySize[videoId] || 17}
                  syncYouTubeTheme={syncYouTubeTheme[videoId] !== false}
                  simulatedYouTubeTheme={simulatedYouTubeTheme}
                  onToggleReadabilityMode={() =>
                    setReadabilityMode((prev) => ({ ...prev, [videoId]: !prev[videoId] }))
                  }
                  onExitReadability={() => setReadabilityMode((prev) => ({ ...prev, [videoId]: false }))}
                  onToggleSyncYouTubeTheme={() => {
                    const isCurrentlySync = syncYouTubeTheme[videoId] !== false;
                    const nextSync = !isCurrentlySync;
                    setSyncYouTubeTheme((prev) => ({ ...prev, [videoId]: nextSync }));
                    if (nextSync) {
                      setReadabilityTheme((prev) => ({ ...prev, [videoId]: simulatedYouTubeTheme }));
                    }
                  }}
                  onSelectReadabilityTheme={(t) => {
                    setSyncYouTubeTheme((prev) => ({ ...prev, [videoId]: false }));
                    setReadabilityTheme((prev) => ({ ...prev, [videoId]: t }));
                  }}
                  onToggleReadabilityFont={() =>
                    setReadabilityFont((prev) => ({
                      ...prev,
                      [videoId]: (prev[videoId] || 'serif') === 'serif' ? 'sans' : 'serif'
                    }))
                  }
                  onChangeReadabilitySize={(delta) =>
                    setReadabilitySize((prev) => ({
                      ...prev,
                      [videoId]: Math.max(13, Math.min(26, (prev[videoId] || 17) + delta))
                    }))
                  }
                  exportMenuOpen={Boolean(exportMenuOpen[videoId])}
                  onToggleExportMenu={() =>
                    setExportMenuOpen((prev) => ({ ...prev, [videoId]: !prev[videoId] }))
                  }
                  headerOverflowOpen={Boolean(headerOverflowOpen[videoId])}
                  onToggleHeaderOverflow={(e) => {
                    e.stopPropagation();
                    setHeaderOverflowOpen((prev) => ({ ...prev, [videoId]: !prev[videoId] }));
                  }}
                  onCloseHeaderOverflow={() => setHeaderOverflowOpen((prev) => ({ ...prev, [videoId]: false }))}
                  copiedVideoUrl={copiedVideoId === videoId}
                  onCopyVideoUrl={() => copyVideoUrl(videoId)}
                  onOpenHistory={() => {
                    topZCounterRef.current += 1;
                    setHistoryZIndex(topZCounterRef.current);
                    setHistoryOpen(true);
                  }}
                  onOpenSettings={() => {
                    topZCounterRef.current += 1;
                    setSettingsZIndex(topZCounterRef.current);
                    setSettingsOpen(true);
                  }}
                  genFormatting={genFormatting}
                  onMinimize={() => minimizeWindow(videoId)}
                  onClose={() => closeWindow(videoId)}
                  onExportTxt={() => {
                    setExportMenuOpen((prev) => ({ ...prev, [videoId]: false }));
                    handleExportTxt(video, winState.mode);
                  }}
                  onExportPdf={() => {
                    setExportMenuOpen((prev) => ({ ...prev, [videoId]: false }));
                    handleExportPdf(video, winState.mode);
                  }}
                  onExportJson={() => {
                    setExportMenuOpen((prev) => ({ ...prev, [videoId]: false }));
                    handleExportJson(video, winState.mode);
                  }}
                  onExportMarkdown={() => {
                    setExportMenuOpen((prev) => ({ ...prev, [videoId]: false }));
                    handleExportMarkdown(video, winState.mode);
                  }}
                  onChangeWinMode={(m) => {
                    if (m !== 'podcast') stopPodcastPlayback(videoId, false);
                    setOpenWindows((prev) => ({ ...prev, [videoId]: { ...prev[videoId], mode: m } }));
                  }}
                  onChangeWinSource={(s) =>
                    setOpenWindows((prev) => ({ ...prev, [videoId]: { ...prev[videoId], source: s } }))
                  }
                  selectedModel={windowModels[videoId] || 'gemini-3.8-flash'}
                  onSelectModel={(val) => {
                    setWindowModels((prev) => ({ ...prev, [videoId]: val }));
                    setWindowFallbackNote((prev) => ({ ...prev, [videoId]: null }));
                  }}
                  simAskFailure={Boolean(simAskFailure[videoId])}
                  onToggleSimAskFailure={(checked) =>
                    setSimAskFailure((prev) => ({ ...prev, [videoId]: checked }))
                  }
                  fallbackNote={windowFallbackNote[videoId] || null}
                  onRegenerate={() => {
                    const selectedModel = windowModels[videoId] || 'gemini-3.8-flash';
                    if (selectedModel === 'Ask' && simAskFailure[videoId]) {
                      const decision = resolveAskFallbackPlan({
                        currentModel: 'YouTube Ask (Gemini in the page)',
                        fallbackLadder: [
                          'gemini-3.1-pro-preview',
                          'gemini-3.8-flash',
                          'gemini-3.7-flash',
                          'gemini-3.5-flash'
                        ],
                        availableModels: [
                          'gemini-3.1-pro-preview',
                          'gemini-3.8-flash',
                          'gemini-3.7-flash',
                          'gemini-3.5-flash'
                        ],
                        hasApiKey: true,
                        errorMessage: "YouTube's Ask button didn't appear on this video"
                      });
                      if (decision.shouldFallback && decision.nextModel) {
                        setWindowModels((prev) => ({ ...prev, [videoId]: decision.nextModel! }));
                        setWindowFallbackNote((prev) => ({ ...prev, [videoId]: decision.note || null }));
                        showTtsToast(`Ask failed — switched to ${decision.nextModel}`, videoId);
                        announceLive(`YouTube Ask failed, switched to ${decision.nextModel}`);
                        return;
                      }
                    }
                    setWindowFallbackNote((prev) => ({ ...prev, [videoId]: null }));
                    showTtsToast(`Regenerated with ${selectedModel} (${persona})`, videoId);
                  }}
                  onToggleCompactOptions={() =>
                    setCompactOptionsExpanded((prev) => ({ ...prev, [videoId]: !prev[videoId] }))
                  }
                  transcriptMode={transcriptModes[videoId] || 'fast'}
                  onSetTranscriptMode={(m) => setTranscriptModes((prev) => ({ ...prev, [videoId]: m }))}
                  persona={persona}
                  onSelectPersona={(p) => handleSelectWindowPersona(videoId, p)}
                  altTitlesEnabled={altTitlesEnabled}
                  onSetAltTitlesEnabled={handleSetAltTitlesEnabled}
                  headerTitleMode={headerTitleModes[videoId] || 'ai'}
                  onToggleHeaderTitleMode={() =>
                    setHeaderTitleModes((prev) => {
                      const nextMode: SummaryWindowTitleMode = (prev[videoId] || 'ai') === 'ai' ? 'original' : 'ai';
                      announceLive(`Window title switched to ${nextMode === 'ai' ? 'AI summary title' : 'original video title'}`);
                      return { ...prev, [videoId]: nextMode };
                    })
                  }
                  showFactCheck={summaryDefaults.fc}
                  autoFactCheck={summaryDefaults.autoFactCheck !== false}
                  showSources={summaryDefaults.src}
                  showVisuals={summaryDefaults.img}
                  factModel={summaryDefaults.factModel || 'gemini-3.8-flash'}
                  factCheckResult={factCheckResults[videoId]}
                  simFactCheckUnavailable={Boolean(simFactCheckUnavailable[videoId])}
                  onToggleSimFactCheckUnavailable={(val) =>
                    setSimFactCheckUnavailable((prev) => ({ ...prev, [videoId]: val }))
                  }
                  isRunningFactCheck={Boolean(factCheckingMap[videoId])}
                  onRerunFactCheck={() => handleRerunFactCheck(videoId)}
                  onToggleSummaryOpt={(patch) => setSummaryDefaults((prev) => ({ ...prev, ...patch }))}
                  tts={ttsState[videoId] || { status: 'idle', rate: 1.0 }}
                  currentVol={ttsVolume[videoId] ?? 1.0}
                  currentPitch={ttsPitch[videoId] ?? 1.0}
                  skipSilence={skipSilence[videoId] !== false}
                  selectedVoice={selectedVoice[videoId] || 'ai:Kore'}
                  browserVoices={browserVoices}
                  activeTtsLine={activeTtsLine[videoId] ?? null}
                  activeTtsTs={activeTtsTs[videoId] ?? null}
                  onSelectVoice={(v) => setSelectedVoice((prev) => ({ ...prev, [videoId]: v }))}
                  onToggleTts={(txt) => toggleTts(videoId, txt)}
                  onRewindTts={(txt) => rewindTts(videoId, txt)}
                  onSkipTts={(txt) => skipTts(videoId, txt)}
                  onStopTts={() => stopTts(videoId)}
                  onSetTtsRate={(r) => setTtsRate(videoId, r)}
                  onCycleTtsRate={(txt) => cycleTtsRate(videoId, txt)}
                  onSetTtsVolume={(val) => {
                    setTtsVolume((prev) => ({ ...prev, [videoId]: val }));
                    if (activeUtteranceRef.current) activeUtteranceRef.current.volume = val;
                  }}
                  onSetTtsPitch={(val) => {
                    const clamped = Math.max(0.5, Math.min(2.0, val));
                    setTtsPitch((prev) => ({ ...prev, [videoId]: clamped }));
                    try {
                      localStorage.setItem('lastTtsPitch', String(clamped));
                    } catch {}
                    if (activeUtteranceRef.current) activeUtteranceRef.current.pitch = clamped;
                  }}
                  onToggleSkipSilence={(txt) => {
                    const next = !(skipSilence[videoId] !== false);
                    setSkipSilence((prev) => ({ ...prev, [videoId]: next }));
                    showTtsToast(next ? 'Skip Silence: ON' : 'Skip Silence: OFF', videoId);
                    if ((ttsState[videoId]?.status || 'idle') === 'playing') {
                      stopTts(videoId);
                      setTimeout(() => toggleTts(videoId, txt), 100);
                    }
                  }}
                  activeSeek={activeSeek[videoId] || null}
                  followAlong={followAlong}
                  onToggleFollowAlong={handleToggleFollowAlong}
                  onSeekTimestamp={(tsStr, sec) => handleSeekTimestamp(videoId, tsStr, sec)}
                  transcriptSearchQuery={transcriptSearch[videoId] || ''}
                  onChangeTranscriptSearch={(q) => setTranscriptSearch((prev) => ({ ...prev, [videoId]: q }))}
                  transcriptFilterOnly={Boolean(transcriptFilterOnly[videoId])}
                  onChangeTranscriptFilterOnly={(checked) =>
                    setTranscriptFilterOnly((prev) => ({ ...prev, [videoId]: checked }))
                  }
                  activeMatchIndex={activeMatchIndex[videoId] ?? 0}
                  onSetActiveMatchIndex={(idx) => setActiveMatchIndex((prev) => ({ ...prev, [videoId]: idx }))}
                  closedSummariesCount={closedSummaries.length}
                  responseRatings={responseRatings}
                  openRatingNoteKey={openRatingNoteKey}
                  setOpenRatingNoteKey={setOpenRatingNoteKey}
                  onRateResponse={handleRateResponse}
                  onShowToast={showTtsToast}
                  turns={conversationTurns[videoId] || []}
                  isAnsweringFollowUp={Boolean(isAnsweringFollowUp[videoId])}
                  regeneratingTurnIdx={regeneratingTurnIdx[videoId] ?? null}
                  onEditAndRegenerateTurn={(tIdx, editedQ) => handleEditAndRegenerateTurn(videoId, tIdx, editedQ)}
                  onRegenerateTurn={(tIdx) => handleRegenerateTurn(videoId, tIdx)}
                  onStepTurnVersion={(tIdx, delta) => handleStepTurnVersion(videoId, tIdx, delta)}
                  composerText={composerText[videoId] || ''}
                  onChangeComposerText={(text) => {
                    setComposerText((prev) => ({ ...prev, [videoId]: text }));
                    try {
                      if (text.trim()) {
                        localStorage.setItem('yt_summariser_draft_' + videoId, text);
                      } else {
                        localStorage.removeItem('yt_summariser_draft_' + videoId);
                      }
                    } catch {}
                  }}
                  composerModel={composerModel[videoId] || 'gemini-3.8-flash'}
                  onSelectComposerModel={(mId) => setComposerModel((prev) => ({ ...prev, [videoId]: mId }))}
                  simFollowUpUnavailable={Boolean(simFollowUpUnavailable[videoId])}
                  onToggleSimFollowUpUnavailable={(checked) =>
                    setSimFollowUpUnavailable((prev) => ({ ...prev, [videoId]: checked }))
                  }
                  followUpFallbackNote={followUpFallbackNote[videoId] || null}
                  composerGSearch={composerGSearch[videoId] !== false}
                  onToggleComposerGSearch={() =>
                    setComposerGSearch((prev) => ({ ...prev, [videoId]: prev[videoId] === false }))
                  }
                  composerGMaps={composerGMaps[videoId] === true}
                  onToggleComposerGMaps={() =>
                    setComposerGMaps((prev) => ({ ...prev, [videoId]: !prev[videoId] }))
                  }
                  isRecordingVoice={Boolean(isRecordingVoice[videoId])}
                  onToggleVoiceInput={() => handleToggleVoiceInput(videoId)}
                  onSendFollowUp={() => handleSendFollowUp(videoId)}
                  podcastHostCount={normalizePodcastHostCount(podcastHostCount[videoId] ?? 2)}
                  podcastHosts={getPodcastHostsForVideo(videoId)}
                  podcastEpisode={podcastEpisodes[videoId] || null}
                  podcastGenerating={Boolean(podcastGenerating[videoId])}
                  podcastInteracting={Boolean(podcastInteracting[videoId])}
                  podcastListeningVoice={Boolean(podcastListeningVoice[videoId])}
                  podcastPlaybackStatus={podcastPlaybackStatus[videoId] || 'idle'}
                  podcastActiveTurnIdx={podcastActiveTurnIdx[videoId] ?? 0}
                  podcastRate={podcastRate[videoId] ?? 1.0}
                  podcastQaDraft={podcastQaDraft[videoId] || ''}
                  onChangePodcastHostCount={(nextCount) => {
                    const clamped = normalizePodcastHostCount(nextCount);
                    setPodcastHostCount((prev) => ({ ...prev, [videoId]: clamped }));
                    setPodcastHostsMap((prev) => ({
                      ...prev,
                      [videoId]: buildDefaultPodcastHosts(clamped, prev[videoId])
                    }));
                  }}
                  onUpdatePodcastHost={(hostIdx, field, val) => {
                    setPodcastHostsMap((prev) => {
                      const current = buildDefaultPodcastHosts(
                        podcastHostCount[videoId] ?? 2,
                        prev[videoId]
                      );
                      const updated = current.map((h, i) =>
                        i === hostIdx
                          ? {
                              ...h,
                              [field]: val
                            }
                          : h
                      );
                      return { ...prev, [videoId]: buildDefaultPodcastHosts(updated.length, updated) };
                    });
                  }}
                  onGeneratePodcast={() => handleGeneratePodcast(video)}
                  onTogglePodcastPlayback={() => {
                    const ep = podcastEpisodes[videoId];
                    if (!ep) return;
                    const st = podcastPlaybackStatus[videoId] || 'idle';
                    if (st === 'playing') {
                      pausePodcastPlayback(videoId);
                    } else {
                      playPodcastTurns(videoId, ep, podcastActiveTurnIdx[videoId] ?? 0);
                    }
                  }}
                  onStepPodcastTurn={(delta) => {
                    const ep = podcastEpisodes[videoId];
                    if (!ep || !ep.turns.length) return;
                    const cur = podcastActiveTurnIdx[videoId] ?? 0;
                    const nextIdx = Math.max(0, Math.min(ep.turns.length - 1, cur + delta));
                    if ((podcastPlaybackStatus[videoId] || 'idle') === 'playing') {
                      playPodcastTurns(videoId, ep, nextIdx);
                    } else {
                      setPodcastActiveTurnIdx((prev) => ({ ...prev, [videoId]: nextIdx }));
                    }
                  }}
                  onStopPodcastPlayback={() => stopPodcastPlayback(videoId, true)}
                  onChangePodcastRate={(nextRate) => {
                    podcastRateRef.current[videoId] = nextRate;
                    setPodcastRate((prev) => ({ ...prev, [videoId]: nextRate }));
                    if ((podcastPlaybackStatus[videoId] || 'idle') === 'playing' && podcastEpisodes[videoId]) {
                      playPodcastTurns(
                        videoId,
                        podcastEpisodes[videoId]!,
                        podcastActiveTurnIdx[videoId] ?? 0
                      );
                    }
                  }}
                  onPlayPodcastFromTurn={(idx) => {
                    const ep = podcastEpisodes[videoId];
                    if (ep) playPodcastTurns(videoId, ep, idx);
                  }}
                  onChangePodcastQaDraft={(val) =>
                    setPodcastQaDraft((prev) => ({ ...prev, [videoId]: val }))
                  }
                  onSubmitPodcastInteraction={(q, isVoice) =>
                    handleSubmitPodcastInteraction(video, q, Boolean(isVoice))
                  }
                  onTogglePodcastVoiceQuestion={() => handleTogglePodcastVoiceQuestion(video)}
                />
              );
            })}

            <HistoryDock
              historyOpen={historyOpen}
              setHistoryOpen={setHistoryOpen}
              historyBounds={clampWindowBounds(historyBounds, viewportSize)}
              historyZIndex={historyZIndex}
              onFocusHistory={() => {
                topZCounterRef.current += 1;
                setHistoryZIndex(topZCounterRef.current);
              }}
              onStartHistoryDrag={(e) => {
                if (e.button !== 0) return;
                if ((e.target as HTMLElement).closest('button, a, input, select')) return;
                e.preventDefault();
                topZCounterRef.current += 1;
                setHistoryZIndex(topZCounterRef.current);
                dragResizeRef.current = {
                  targetKind: 'history',
                  type: 'drag',
                  startX: e.clientX,
                  startY: e.clientY,
                  startBounds: clampWindowBounds(historyBounds, viewportSize)
                };
              }}
              onStartHistoryResize={(dir) => (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                topZCounterRef.current += 1;
                setHistoryZIndex(topZCounterRef.current);
                dragResizeRef.current = {
                  targetKind: 'history',
                  type: 'resize',
                  dir,
                  startX: e.clientX,
                  startY: e.clientY,
                  startBounds: clampWindowBounds(historyBounds, viewportSize)
                };
              }}
              onHistoryResizeKeyDown={(dir) => (e) => {
                const adj = applyKeyboardWindowAdjustment(
                  clampWindowBounds(historyBounds, viewportSize),
                  'resize',
                  dir,
                  e.key,
                  e.shiftKey,
                  viewportSize
                );
                if (!adj.handled) return;
                e.preventDefault();
                e.stopPropagation();
                setHistoryBounds(adj.bounds);
              }}
              onHistoryGripKeyDown={(e) => {
                const adj = applyKeyboardWindowAdjustment(
                  clampWindowBounds(historyBounds, viewportSize),
                  'move',
                  null,
                  e.key,
                  e.shiftKey,
                  viewportSize
                );
                if (!adj.handled) return;
                e.preventDefault();
                e.stopPropagation();
                setHistoryBounds(adj.bounds);
              }}
              onOpenSettings={() => {
                topZCounterRef.current += 1;
                setSettingsZIndex(topZCounterRef.current);
                setSettingsOpen(true);
              }}
              historySearch={historySearch}
              setHistorySearch={setHistorySearch}
              closedSummaries={closedSummaries}
              onReopenSummary={reopenSummary}
              onDeleteFromHistory={deleteFromHistory}
              onClearAllHistory={clearAllHistory}
              historyTabVisibility={historyTabVisibility}
              showHistoryBottomTab={showHistoryBottomTab}
              historyPageScope={historyPageScope}
              currentSimPage={currentSimPage}
              openWindows={openWindows}
              focusedVideoId={focusedVideoId}
              videos={MOCK_VIDEOS}
              ttsState={ttsState}
              podcastPlaybackStatus={podcastPlaybackStatus}
              onToggleTtsPlayback={(vid) => {
                const v = MOCK_VIDEOS.find((m) => m.id === vid);
                if (!v) return;
                const w = openWindows[vid];
                toggleTts(vid, w?.mode === 'transcript' ? v.transcript : v.summary);
              }}
              onStopTtsPlayback={(vid) => stopTts(vid)}
              onTogglePodcastPlayback={(vid) => {
                const ep = podcastEpisodes[vid];
                if (!ep) return;
                const st = podcastPlaybackStatus[vid] || 'idle';
                if (st === 'playing') pausePodcastPlayback(vid);
                else playPodcastTurns(vid, ep, podcastActiveTurnIdx[vid] ?? 0);
              }}
              onStopPodcastPlayback={(vid) => stopPodcastPlayback(vid, true)}
              onMaximizeWindow={maximizeWindow}
              onCloseWindow={closeWindow}
            />
          </div>
        )}

        {activeTab !== 'simulator' && (
          <SettingsDocsTabs
            activeTab={activeTab}
            copied={copied}
            onCopyUserscript={copyUserscriptCode}
            testRunning={testRunning}
            testOutput={testOutput}
            onRunTestsFrontend={runAllTestsFrontend}
            appThemeMode={appThemeMode}
            onSetAppThemeMode={handleSetAppThemeMode}
          />
        )}
      </main>

      <QuickMenuWindow
        open={quickMenuOpen}
        bounds={clampWindowBounds(quickMenuBounds, viewportSize, 240, 200)}
        zIndex={quickMenuZIndex}
        closedSummariesCount={closedSummaries.length}
        onClose={() => setQuickMenuOpen(false)}
        onFocus={() => {
          topZCounterRef.current += 1;
          setQuickMenuZIndex(topZCounterRef.current);
        }}
        onStartDrag={(e) => {
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest('button, a, input, select')) return;
          e.preventDefault();
          topZCounterRef.current += 1;
          setQuickMenuZIndex(topZCounterRef.current);
          dragResizeRef.current = {
            targetKind: 'quickMenu',
            type: 'drag',
            startX: e.clientX,
            startY: e.clientY,
            startBounds: clampWindowBounds(quickMenuBounds, viewportSize, 240, 200)
          };
        }}
        onStartResize={(dir) => (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          topZCounterRef.current += 1;
          setQuickMenuZIndex(topZCounterRef.current);
          dragResizeRef.current = {
            targetKind: 'quickMenu',
            type: 'resize',
            dir,
            startX: e.clientX,
            startY: e.clientY,
            startBounds: clampWindowBounds(quickMenuBounds, viewportSize, 240, 200)
          };
        }}
        onResizeKeyDown={(dir) => (e) => {
          const adj = applyKeyboardWindowAdjustment(
            clampWindowBounds(quickMenuBounds, viewportSize, 240, 200),
            'resize',
            dir,
            e.key,
            e.shiftKey,
            viewportSize,
            240,
            200
          );
          if (!adj.handled) return;
          e.preventDefault();
          e.stopPropagation();
          setQuickMenuBounds(adj.bounds);
        }}
        onGripKeyDown={(e) => {
          const adj = applyKeyboardWindowAdjustment(
            clampWindowBounds(quickMenuBounds, viewportSize, 240, 200),
            'move',
            null,
            e.key,
            e.shiftKey,
            viewportSize,
            240,
            200
          );
          if (!adj.handled) return;
          e.preventDefault();
          e.stopPropagation();
          setQuickMenuBounds(adj.bounds);
        }}
        onOpenHistory={() => {
          topZCounterRef.current += 1;
          setHistoryZIndex(topZCounterRef.current);
          setHistoryOpen(true);
        }}
        onOpenSettings={() => {
          topZCounterRef.current += 1;
          setSettingsZIndex(topZCounterRef.current);
          setSettingsOpen(true);
        }}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        bounds={clampWindowBounds(settingsBounds, viewportSize, 360, 340)}
        zIndex={settingsZIndex}
        onFocus={() => {
          topZCounterRef.current += 1;
          setSettingsZIndex(topZCounterRef.current);
        }}
        onStartDrag={(e) => {
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest('button, a, input, select')) return;
          e.preventDefault();
          topZCounterRef.current += 1;
          setSettingsZIndex(topZCounterRef.current);
          dragResizeRef.current = {
            targetKind: 'settings',
            type: 'drag',
            startX: e.clientX,
            startY: e.clientY,
            startBounds: clampWindowBounds(settingsBounds, viewportSize, 360, 340)
          };
        }}
        onStartResize={(dir) => (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          topZCounterRef.current += 1;
          setSettingsZIndex(topZCounterRef.current);
          dragResizeRef.current = {
            targetKind: 'settings',
            type: 'resize',
            dir,
            startX: e.clientX,
            startY: e.clientY,
            startBounds: clampWindowBounds(settingsBounds, viewportSize, 360, 340)
          };
        }}
        onResizeKeyDown={(dir) => (e) => {
          const adj = applyKeyboardWindowAdjustment(
            clampWindowBounds(settingsBounds, viewportSize, 360, 340),
            'resize',
            dir,
            e.key,
            e.shiftKey,
            viewportSize,
            360,
            340
          );
          if (!adj.handled) return;
          e.preventDefault();
          e.stopPropagation();
          setSettingsBounds(adj.bounds);
        }}
        onGripKeyDown={(e) => {
          const adj = applyKeyboardWindowAdjustment(
            clampWindowBounds(settingsBounds, viewportSize, 360, 340),
            'move',
            null,
            e.key,
            e.shiftKey,
            viewportSize,
            360,
            340
          );
          if (!adj.handled) return;
          e.preventDefault();
          e.stopPropagation();
          setSettingsBounds(adj.bounds);
        }}
        appThemeMode={appThemeMode}
        effectiveTheme={effectiveTheme}
        onSetAppThemeMode={handleSetAppThemeMode}
        uiAccentColor={uiAccentColor}
        onChangeUiAccentColor={(hex) => {
          const norm = normalizeAccentColorHex(hex);
          setUiAccentColor(norm);
          announceLive(norm ? `UI accent color updated to ${norm}` : 'Restored default UI accent color');
        }}
        continueAudioOnMinimize={continueAudioOnMinimize}
        onSetContinueAudioOnMinimize={(next) => {
          const val = normalizeContinueAudioOnMinimize(next);
          setContinueAudioOnMinimize(val);
          announceLive(val ? 'Audio continues playing when minimized' : 'Audio stops when window is minimized');
        }}
        uiFormatting={uiFormatting}
        onChangeUiFormatting={(patch) => setUiFormatting((prev) => normalizeUiFormattingPrefs({ ...prev, ...patch }))}
        genFormatting={genFormatting}
        onChangeGenFormatting={(patch) => setGenFormatting((prev) => normalizeGeneratedTextPrefs({ ...prev, ...patch }))}
        onResetFormattingDefaults={() => {
          setUiFormatting(DEFAULT_UI_FORMATTING_PREFS);
          setGenFormatting(DEFAULT_GENERATED_TEXT_PREFS);
          announceLive('Formatting preferences reset to defaults');
        }}
        defaultReadabilityTheme={defaultReadabilityTheme}
        onSetDefaultReadabilityTheme={setDefaultReadabilityTheme}
        defaultSyncYouTubeTheme={defaultSyncYouTubeTheme}
        onSetDefaultSyncYouTubeTheme={setDefaultSyncYouTubeTheme}
        defaultSummaryModel={defaultSummaryModel}
        onSetDefaultSummaryModel={setDefaultSummaryModel}
        defaultSummarySource={defaultSummarySource}
        onSetDefaultSummarySource={setDefaultSummarySource}
        summaryPersona={summaryPersona}
        onSetSummaryPersona={handleSetDefaultSummaryPersona}
        outputLanguage={outputLanguage}
        onSetOutputLanguage={(val) => setOutputLanguage(normalizeOutputLanguage(val))}
        autoStartSummary={autoStartSummary}
        onSetAutoStartSummary={setAutoStartSummary}
        summaryDefaults={summaryDefaults}
        onChangeSummaryDefaults={(patch) => setSummaryDefaults((prev) => ({ ...prev, ...patch }))}
        altTitleMode={altTitleMode}
        onSetAltTitleMode={handleSetAltTitleMode}
        channelTitleRules={channelTitleRules}
        onSetChannelTitleRule={handleSetChannelTitleRule}
        onClearCachedTitles={() => {
          setCardTitleModes({});
          announceLive('Cleared cached AI video title overrides');
        }}
        defaultPodcastHostCount={defaultPodcastHostCount}
        onSetDefaultPodcastHostCount={(cnt) => {
          const clamped = normalizePodcastHostCount(cnt);
          setDefaultPodcastHostCount(clamped);
          setDefaultPodcastHosts((prev) => buildDefaultPodcastHosts(clamped, prev));
        }}
        defaultPodcastHosts={defaultPodcastHosts}
        onUpdateDefaultPodcastHost={(idx, field, value) => {
          setDefaultPodcastHosts((prev) =>
            buildDefaultPodcastHosts(
              prev.length,
              prev.map((h, i) => (i === idx ? { ...h, [field]: value } : h))
            )
          );
        }}
        podcastSynthesisMode={podcastSynthesisMode}
        onSetPodcastSynthesisMode={(m) => setPodcastSynthesisMode(normalizePodcastSynthesisMode(m))}
        defaultPodcastRate={defaultPodcastRate}
        onSetDefaultPodcastRate={(r) => setDefaultPodcastRate(Math.max(0.75, Math.min(2.0, r)))}
        followAlong={followAlong}
        onToggleFollowAlong={handleToggleFollowAlong}
        defaultSkipSilence={defaultSkipSilence}
        onSetDefaultSkipSilence={setDefaultSkipSilence}
        voiceInputEngine={voiceInputEngine}
        onSetVoiceInputEngine={(eng) => setVoiceInputEngine(normalizeVoiceInputEngine(eng))}
        defaultTtsVoice={defaultTtsVoice}
        onSetDefaultTtsVoice={setDefaultTtsVoice}
        browserVoices={browserVoices}
        defaultTtsRate={defaultTtsRate}
        onSetDefaultTtsRate={(r) => setDefaultTtsRate(Math.max(0.5, Math.min(2.0, r)))}
        defaultTtsPitch={defaultTtsPitch}
        onSetDefaultTtsPitch={(p) => setDefaultTtsPitch(clampPitch(p))}
        defaultTtsVolume={defaultTtsVolume}
        onSetDefaultTtsVolume={(v) => setDefaultTtsVolume(Math.max(0, Math.min(1, v)))}
        showHistoryBottomTab={showHistoryBottomTab}
        onSetShowHistoryBottomTab={setShowHistoryBottomTab}
        historyPageScope={historyPageScope}
        onSetHistoryPageScope={(sc) => setHistoryPageScope(normalizeHistoryPageScope(sc))}
        historyTabVisibility={historyTabVisibility}
        onSetHistoryTabVisibility={setHistoryTabVisibility}
        currentSimPage={currentSimPage}
        onSetCurrentSimPage={setCurrentSimPage}
        closedSummariesCount={closedSummaries.length}
        onClearAllHistory={clearAllHistory}
        apiKeys={simApiKeys}
        onAddApiKey={(name, key) =>
          setSimApiKeys((prev) => [
            ...prev,
            { id: 'k_' + Math.random().toString(36).slice(2, 8), name, key }
          ])
        }
        onRenameApiKey={(id, name) =>
          setSimApiKeys((prev) => prev.map((k) => (k.id === id ? { ...k, name } : k)))
        }
        onDeleteApiKey={(id) => setSimApiKeys((prev) => prev.filter((k) => k.id !== id))}
        customModels={customModels}
        onAddCustomModel={(mid) =>
          setCustomModels((prev) => (prev.includes(mid) ? prev : [...prev, mid]))
        }
        onRemoveCustomModel={(mid) => setCustomModels((prev) => prev.filter((m) => m !== mid))}
        onRefreshModels={() => announceLive('Gemini model availability refreshed')}
        onResetAllSettings={handleResetAllSettings}
      />
    </div>
  );
}

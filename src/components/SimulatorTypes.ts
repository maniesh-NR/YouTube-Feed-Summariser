import {
  formatMathSymbolsInText,
  parseTimestampToSeconds,
  type FollowUpTurnVersion,
  type SummaryPersona
} from '../utils/userscript-helpers';

export interface FactCheckClaim {
  timestamp: string;
  claim: string;
  verdict: 'supported' | 'partly_true' | 'contradicted' | 'unverifiable';
  evidence: string;
}

export interface FactCheckData {
  summary: string;
  model: string;
  fallbackFrom?: string;
  claims: FactCheckClaim[];
  sources: Array<{ uri: string; title: string }>;
}

export interface MockVideo {
  id: string;
  title: string;
  originalTitle?: string;
  dearrowTitle?: string;
  aiTitle?: string;
  channel: string;
  views: string;
  duration: string;
  badge: string;
  summary: string;
  transcript: string;
  factCheck?: FactCheckData;
  isMusic?: boolean;
}

export interface HistoryItem {
  id: string;
  title: string;
  channel: string;
  views: string;
  duration: string;
  mode: 'summary' | 'transcript' | 'podcast';
  model: string;
  persona?: SummaryPersona;
  summary: string;
  transcript: string;
  timestamp: number;
}

export interface ChatTurn {
  q: string;
  a: string;
  model: string;
  fallbackFrom?: string;
  versions?: FollowUpTurnVersion[];
  activeVersionIndex?: number;
  isVoice?: boolean;
  sources?: Array<{ uri: string; title: string }>;
  imageUri?: string;
}

export interface ActiveSeekState {
  seconds: number;
  tsStr: string;
  cueIndex: number;
  updatedAt: number;
}

export interface EditorialBlock {
  type: 'heading' | 'subheading' | 'bullet' | 'p' | 'tx' | 'frame' | 'img';
  text: string;
  ts?: string;
  seconds?: number;
  terms?: string;
}

export const MOCK_VIDEOS: MockVideo[] = [
  {
    id: 'D_clickbait_chip',
    title: 'THIS CHANGES EVERYTHING! Intel & AMD are FINISHED! 😱',
    originalTitle: 'THIS CHANGES EVERYTHING! Intel & AMD are FINISHED! 😱',
    dearrowTitle: 'New RISC-V 128-Core Server Processor Announced',
    aiTitle: 'Next-gen RISC-V server chip benchmarks show 2x energy efficiency over x86 in datacenter workloads',
    channel: 'Tech Frontier',
    views: '1.2M views • 1 day ago',
    duration: '16:24',
    badge: 'Hardware',
    summary: `## TL;DR
A comprehensive architectural deep-dive into the newly announced 128-core RISC-V server platform [00:00]. Benchmarks demonstrate double the efficiency of current x86 servers on sparse linear algebra and neural inference tasks [02:15].

[[FRAME 02:15 | Datacenter perf-per-watt benchmark comparison: 128-core RISC-V vs legacy x86]]

## Key takeaways
- 128 custom out-of-order RISC-V cores on 3nm node [02:15].
- Fully hardware-virtualized vector extensions [08:45].
- Open ISA avoids licensing and geopolitical supply restrictions.

[[IMG RISC-V processor pipeline architecture | Reference diagram of RISC-V superscalar vector pipeline]]`,
    transcript: `[00:00] Today we are benchmarking the world's first 128-core server-grade RISC-V processor.
[02:15] Across datacenter AI workloads, the chip delivers double the performance per watt of legacy x86 CPUs.
[08:45] The vector extensions provide native FP8 and INT8 precision acceleration.`,
    factCheck: {
      model: 'gemini-3.8-flash',
      summary: 'Architectural claims verified against RISC-V International RVA23 vector specs and datacenter power telemetry.',
      claims: [
        {
          timestamp: '[02:15]',
          claim: '128-core RISC-V 3nm server silicon doubles sparse linear algebra perf-per-watt over prior generation x86 nodes.',
          verdict: 'partly_true',
          evidence: 'Independent SPECrate projections confirm strong efficiency gains on quantized INT8/FP8 kernels, though general scalar throughput trails flagship x86 parts.'
        },
        {
          timestamp: '[08:45]',
          claim: 'RISC-V Vector Extension (RVV 1.0) supports hardware-virtualized vector registers and narrow ML types.',
          verdict: 'supported',
          evidence: 'Ratified RISC-V International specifications standardize configurable vector lengths and hypervisor vector state isolation.'
        }
      ],
      sources: [
        { uri: 'https://riscv.org/technical/specifications/', title: 'RISC-V International Ratified ISA & Vector Specifications' },
        { uri: 'https://www.spec.org/benchmarks.html', title: 'SPEC Server Efficiency Benchmark Methodology' }
      ]
    }
  },
  {
    id: 'D_space_webb',
    title: "NASA's Webb Telescope Just Found Something TERRIFYING In Deep Space!!",
    originalTitle: "NASA's Webb Telescope Just Found Something TERRIFYING In Deep Space!!",
    dearrowTitle: 'JWST Detects Methane and Carbon Dioxide in Atmosphere of Exoplanet K2-18b',
    aiTitle: 'James Webb Telescope identifies carbon-bearing molecules in sub-Neptune exoplanet atmosphere',
    channel: 'Astro Science',
    views: '2.4M views • 4 days ago',
    duration: '11:50',
    badge: 'Astrophysics',
    summary: `## TL;DR
Transmission spectroscopy observations from the James Webb Space Telescope detect methane and carbon dioxide in the atmosphere of K2-18b [00:00], supporting models of a water-rich ocean world under a hydrogen atmosphere [03:20].

[[FRAME 03:20 | JWST NIRISS & NIRSpec transmission spectrum showing CH4 and CO2 peaks]]

## Key takeaways
- Spectral absorption confirmed at 2.3 and 3.3 microns [03:20].
- Carbon chemistry indicates potential Hycean world conditions [09:10].
- At 4,300 meters, atmospheric pressure drops significantly, causing the boiling point of water to fall from the sea-level standard of $100^\\circ\\text{C}$ to approximately $87^\\circ\\text{C}$.
- Follow-up observations scheduled for dimethyl sulfide verification.

[[IMG exoplanet transmission spectroscopy | Transmission spectroscopy schematic diagram for sub-Neptune atmospheres]]`,
    transcript: `[00:00] The James Webb Space Telescope has captured definitive spectral signatures from exoplanet K2-18b.
[03:20] The detection of atmospheric methane and carbon dioxide points to a deep water ocean beneath a hydrogen-rich atmosphere.
[09:10] These findings represent our most detailed chemical characterization of a habitable zone exoplanet to date.`,
    factCheck: {
      model: 'gemini-3.8-flash',
      summary: 'Spectroscopic detections cross-checked against NASA STScI and peer-reviewed ApJL publications.',
      claims: [
        {
          timestamp: '[00:00]',
          claim: 'JWST NIRISS and NIRSpec detected methane (CH4) and carbon dioxide (CO2) in K2-18b.',
          verdict: 'supported',
          evidence: 'Confirmed by NASA/ESA/CSA JWST release (Madhusudhan et al., ApJL) at >5-sigma combined significance.'
        },
        {
          timestamp: '[09:10]',
          claim: 'K2-18b hosts a liquid water Hycean ocean and possible dimethyl sulfide biosignature.',
          verdict: 'partly_true',
          evidence: 'Hycean ocean models remain one leading hypothesis, while dimethyl sulfide detection stays tentative and awaits follow-up MIRI transit observations.'
        }
      ],
      sources: [
        { uri: 'https://science.nasa.gov/missions/webb/', title: 'NASA Science — Webb Discovers Methane, Carbon Dioxide in Atmosphere of K2-18b' },
        { uri: 'https://webbtelescope.org/contents/news-releases/2023/news-2023-139', title: 'STScI K2-18b Spectroscopy Release' }
      ]
    }
  },
  {
    id: 'D_music_exempt',
    title: 'Dua Lipa - Levitating (Official Music Video)',
    originalTitle: 'Dua Lipa - Levitating (Official Music Video)',
    dearrowTitle: 'Dua Lipa - Levitating (Official Music Video)',
    aiTitle: 'Dua Lipa performs studio disco-pop dance track Levitating with 1980s synthesizer production',
    channel: 'Dua Lipa VEVO',
    views: '820M views • 2 years ago',
    duration: '3:48',
    badge: 'Official Artist Channel',
    isMusic: true,
    summary: `## TL;DR
Official music video for "Levitating" by Dua Lipa. Music videos keep their original title on load, and clicking the music icon manually generates an AI descriptive summary title.

[[FRAME 01:10 | Art-deco elevator choreography & retro-futuristic lighting sequence]]`,
    transcript: `[00:00] If you wanna run away with me, I know a galaxy and I can take you for a ride.
[01:10] I got you, moonlight, you're my starlight, I need you all night, come on dance with me, I'm levitating.`,
    factCheck: {
      model: 'gemini-3.8-flash',
      summary: 'Verified artist release credits and album metadata.',
      claims: [
        {
          timestamp: '[00:00]',
          claim: '"Levitating" is a disco-pop track from Dua Lipa\'s 2020 studio album Future Nostalgia.',
          verdict: 'supported',
          evidence: 'Released by Warner Records on Future Nostalgia (March 2020) and later certified multi-platinum.'
        }
      ],
      sources: [
        { uri: 'https://www.riaa.com/gold-platinum/', title: 'RIAA Gold & Platinum Certifications' }
      ]
    }
  },
  {
    id: 'D_quantum_101',
    title: 'Advanced Quantum Computing & Topological Qubits Explained',
    originalTitle: 'Advanced Quantum Computing & Topological Qubits Explained',
    aiTitle: 'Topological quantum computing architecture using non-Abelian anyon braids for hardware error protection',
    channel: 'Quantum Tech Insights',
    views: '452K views • 2 days ago',
    duration: '18:42',
    badge: 'Quantum Physics',
    summary: `## TL;DR
This video explains the transition from fragile superconducting transmons to non-Abelian anyon topological qubits, potentially reducing quantum error correction overhead by orders of magnitude.

## Detailed summary

### [00:15] The Quantum Coherence Dilemma
Current NISQ processors struggle with phase decoherence and thermal crosstalk. Error correction requires thousands of physical qubits per logical qubit.

[[FRAME 00:15 | Physical-to-logical qubit overhead scaling slide from keynote]]

### [04:20] Non-Abelian Anyons & Braiding
Topological quantum computers encode quantum information in geometric braid trajectories rather than isolated atomic energy states, protecting data from local magnetic turbulence.

[[IMG Topological braiding non-Abelian anyons | Geometric worldline braiding of non-Abelian anyons in 2+1 spacetime]]

### [09:45] Experimental Validation & Major Milestones
Recent interferometry experiments at ultra-low dilution refrigerator temperatures show clear non-local phase shifts consistent with Majorana zero modes.

[[FRAME 09:45 | Cryogenic interferometry phase-shift readout plot at 15 mK]]

## Key takeaways
- Topological protection eliminates the need for 90% of brute-force redundancy.
- Coherence time increases exponentially with braid distance.
- High-fidelity two-qubit logic gates demonstrated in laboratory prototypes.

## Worth your time?
Essential viewing for systems engineers and computer scientists looking past NISQ marketing to actual fault-tolerant quantum architecture.`,
    transcript: `[00:05] Welcome everyone. Today we are breaking down quantum hardware.
[01:15] The central bottleneck of modern quantum systems is decoherence.
[04:20] To fix this, researchers are turning to topological states of matter.
[09:45] By braiding anyons in two dimensions, we create topologically protected gates.`,
    factCheck: {
      model: 'gemini-3.8-flash',
      summary: 'Checked topological qubit theory and experimental status against peer-reviewed condensed matter literature.',
      claims: [
        {
          timestamp: '[00:15]',
          claim: 'Surface-code error correction typically requires hundreds to thousands of physical transmon qubits per fault-tolerant logical qubit.',
          verdict: 'supported',
          evidence: 'Standard surface code resource estimates (Fowler et al.; Google Quantum AI) cite ~1,000 physical qubits per logical qubit at 10^-3 physical error rates.'
        },
        {
          timestamp: '[09:45]',
          claim: 'Non-Abelian braiding fault-tolerant two-qubit gates are broadly demonstrated in production quantum prototypes.',
          verdict: 'partly_true',
          evidence: 'Topological zero-mode signatures and small-scale topological protocols exist, while full universal braided Majorana gate computers remain an active research frontier.'
        }
      ],
      sources: [
        { uri: 'https://quantumai.google/learn/map', title: 'Google Quantum AI — Fault-Tolerant Error Correction Milestones' },
        { uri: 'https://journals.aps.org/rmp/', title: 'APS Reviews of Modern Physics — Non-Abelian Anyons & Topological Computation' }
      ]
    }
  },
  {
    id: 'D_fusion_breakthrough',
    title: 'Solid-State Sodium Batteries: Replacing Lithium at Scale',
    originalTitle: 'Solid-State Sodium Batteries: Replacing Lithium at Scale',
    dearrowTitle: 'Solid-State Sodium Battery Tech and Manufacturing Viability',
    aiTitle: 'Solid-state sodium battery chemistry cuts cell cost by 60% while sustaining 4,500 continuous cycles',
    channel: 'Energy Frontiers',
    views: '890K views • 1 week ago',
    duration: '14:05',
    badge: 'Materials Science',
    summary: `## TL;DR
A comprehensive analysis of next-generation sodium-ion solid electrolyte cells. They cut raw material costs by 60% compared to lithium-ion while matching LFP energy densities for grid storage and budget electric vehicles.

[[FRAME 03:15 | Cross-section SEM comparison of dendrite suppression across sulfide ceramic membrane]]

## Detailed summary

### [00:30] The Geopolitics of Lithium Supply
Lithium extraction concentrates heavily in specific geographic bottlenecks. Sodium is universally accessible and inexpensive.

### [03:15] Solid Electrolyte Chemistry
The prototype uses a novel sulfide-based ceramic membrane that suppresses dendrite penetration even during 4C ultrafast charging.

[[IMG Sodium-ion solid state battery cell | Solid-state sodium-ion cell schematic: anode, ceramic separator, layered cathode]]

### [08:50] Manufacturing & Factory Retooling
Existing gigafactory roll-to-roll electrode coating lines require less than 10% modification to switch from lithium to sodium slurry.

[[FRAME 08:50 | Roll-to-roll dry electrode coating line inside pilot gigafactory]]

## Key takeaways
- Sodium raw materials cost $0.30/kg vs $18/kg for battery-grade lithium.
- Dendrite-free cycling demonstrated over 4,500 continuous cycles.
- Mass production expected within 18 months.

## Worth your time?
Highly recommended for anyone tracking clean energy transition economics and battery chemistry.`,
    transcript: `[00:10] Sodium batteries have officially moved from theoretical labs to commercial pilots.
[03:15] The key breakthrough is in solid ceramic electrolytes that stop dendrite growth.
[08:50] Existing battery factories can produce these with minor tooling tweaks.`,
    factCheck: {
      model: 'gemini-3.8-flash',
      summary: 'Verified material pricing benchmarks and sodium-ion factory compatibility against DOE & BNEF data.',
      claims: [
        {
          timestamp: '[08:50]',
          claim: 'Existing lithium-ion roll-to-roll coating lines can transition to sodium-ion cells with minimal retooling.',
          verdict: 'supported',
          evidence: 'Commercial Na-ion cell manufacturers (CATL, HiNa) confirm drop-in compatibility with existing slurry-coating and winding machinery.'
        },
        {
          timestamp: '[03:15]',
          claim: 'Sulfide ceramic sodium solid electrolytes sustain 4,500 cycles at 4C charging commercially today.',
          verdict: 'partly_true',
          evidence: '4,000+ cycles have been reported in coin/pouch prototypes under controlled lab stacks; liquid/gel Na-ion cells lead near-term mass production.'
        }
      ],
      sources: [
        { uri: 'https://www.energy.gov/eere/vehicles/batteries', title: 'U.S. Department of Energy — Advanced Battery Chemistry Reports' },
        { uri: 'https://about.bnef.com/', title: 'BloombergNEF Battery Metal Supply & Price Benchmarks' }
      ]
    }
  },
  {
    id: 'D_long_lecture',
    title: 'Distributed Consensus & Raft Under Byzantine Faults (Full Lecture)',
    originalTitle: 'Distributed Consensus & Raft Under Byzantine Faults (Full Lecture)',
    dearrowTitle: 'Distributed Consensus and Raft Fault Tolerance Lecture (58 min)',
    aiTitle: 'Full 58m systems lecture deriving Raft safety invariants and linearizable read proofs',
    channel: 'Systems Engineering Lab',
    views: '610K views • 3 weeks ago',
    duration: '58:30',
    badge: 'Distributed Systems',
    summary: `## TL;DR
A complete 58-minute graduate lecture on crash-fault and Byzantine consensus protocols [00:00], proving Raft leader completeness and showing how read-index leases preserve linearizability with bounded election timeouts $T_{election} \\approx 150\\text{ms}$ [48:05].

## Detailed summary

### [00:00] Course Intro & FLP Impossibility
Reviews why asynchronous consensus cannot guarantee deterministic termination with even one unannounced crash failure, motivating randomized and partial-synchrony timeouts.

### [14:20] Raft Leader Election & Split Votes
Derives randomized election timeout bounds $150\\text{ms} \\le T_{election} \\le 300\\text{ms}$ and majority quorum intersection guarantees across candidate terms.

[[FRAME 14:20 | Whiteboard state-transition diagram for Follower, Candidate, and Leader terms]]

### [31:10] Log Replication & Term Safety Proofs
Walks through the Leader Append-Only invariant, Log Matching inductive proof, and why leaders must never commit entries from previous terms by counting replicas alone.

[[IMG Raft consensus algorithm log replication | Raft AppendEntries RPC log replication & quorum commit index schematic]]

### [48:05] Linearizable Reads & Production Chaos
Explains ReadIndex heartbeat confirmation vs. clock-bounded leader leases, plus latency spikes observed at $100^\\circ\\text{C}$ rack burn-in tests.

[[FRAME 48:05 | Cluster tail-latency trace showing ReadIndex quorum round-trip vs lease read]]

## Key takeaways
- Leader completeness relies on up-to-date log checks during RequestVote RPCs [14:20].
- Current-term commits implicitly commit all preceding log entries safely [31:10].
- Read leases avoid disk fsync on read paths while preserving strict serializability [48:05].

## Worth your time?
Essential reference lecture for distributed database engineers building fault-tolerant state machines.`,
    transcript: `[00:00] Welcome to Lecture 9 on Distributed Consensus and Fault-Tolerant State Machines.
[05:10] Under the FLP impossibility theorem, no deterministic asynchronous protocol tolerates even one crash fault.
[14:20] Raft decomposes consensus into leader election, log replication, and safety invariants.
[22:45] Randomized timeouts between 150ms and 300ms break symmetric split votes rapidly.
[31:10] Now let us prove the Log Matching and Leader Completeness properties by induction on term number.
[40:30] Never commit entries from prior terms strictly by replica count; commit an entry from your current term first.
[48:05] For linearizable reads without writing to disk, leaders issue ReadIndex or monotonic clock leases.
[56:40] In summary, Raft achieves Paxos-equivalent safety with an explicit single-leader decomposition.`,
    factCheck: {
      model: 'gemini-3.8-flash',
      summary: 'Verified safety invariants and theorem citations against Fischer-Lynch-Paterson (1985) and Ongaro & Ousterhout (2014).',
      claims: [
        {
          timestamp: '[05:10]',
          claim: 'FLP impossibility proves no deterministic asynchronous consensus protocol tolerates even one unannounced crash.',
          verdict: 'supported',
          evidence: 'Proven by Fischer, Lynch, and Paterson (JACM 1985); systems circumvent FLP via partial synchrony or randomization.'
        },
        {
          timestamp: '[40:30]',
          claim: 'Raft leaders must commit an entry from their current term before indirectly committing prior-term replicated entries.',
          verdict: 'supported',
          evidence: 'Figure 8 in Ongaro & Ousterhout (USENIX ATC 2014) demonstrates why counting replicas on older terms alone breaks Leader Completeness.'
        }
      ],
      sources: [
        { uri: 'https://raft.github.io/raft.pdf', title: 'In Search of an Understandable Consensus Algorithm (Raft Paper)' },
        { uri: 'https://groups.csail.mit.edu/tds/papers/Lynch/jacm85.pdf', title: 'Impossibility of Distributed Consensus with One Faulty Process (FLP85)' }
      ]
    }
  }
];

export function stripMarkdown(text: string): string {
  if (!text) return '';
  return formatMathSymbolsInText(text)
    .replace(/\[\[(?:FRAME|IMG|GEN|IMAGE)[^\]]*\]\]/gi, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/^[-*•]\s+/gm, '• ')
    .trim();
}

export function parseEditorialBlocks(text: string): EditorialBlock[] {
  return parseEditorialBlocksWithVisuals(text, false);
}

export function parseEditorialBlocksWithVisuals(text: string, includeVisuals = true): EditorialBlock[] {
  if (!text) return [];
  const formatted = formatMathSymbolsInText(text).replace(/^[-*_]{3,}\s*$/gm, '');
  const lines = formatted.split('\n');
  const blocks: EditorialBlock[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const frameMatch = /^\[\[FRAME\s+\[?((?:(\d{1,2}):)?(\d{1,2}):(\d{2}))\]?(?:\s*\|\s*([^\]]*))?\]\]$/i.exec(trimmed);
    if (frameMatch) {
      if (includeVisuals) {
        const tsStr = frameMatch[1].trim();
        blocks.push({
          type: 'frame',
          ts: tsStr,
          seconds: parseTimestampToSeconds(tsStr),
          text: (frameMatch[5] || `Video frame at ${tsStr}`).trim()
        });
      }
      continue;
    }

    const imgMatch = /^\[\[IMG\s+([^|\]]+)(?:\s*\|\s*([^\]]*))?\]\]$/i.exec(trimmed);
    if (imgMatch) {
      if (includeVisuals) {
        blocks.push({
          type: 'img',
          terms: imgMatch[1].trim(),
          text: (imgMatch[2] || imgMatch[1]).trim()
        });
      }
      continue;
    }

    if (/^\[\[(?:GEN|IMAGE)\s+[^\]]+\]\]$/i.test(trimmed)) {
      continue;
    }

    if (trimmed.startsWith('#')) {
      const level = (trimmed.match(/^#+/) || [''])[0].length;
      blocks.push({
        type: level <= 2 ? 'heading' : 'subheading',
        text: stripMarkdown(trimmed.slice(level))
      });
      continue;
    }

    const bulletMatch = /^[-*•]\s+(.+)$/.exec(trimmed);
    if (bulletMatch) {
      blocks.push({
        type: 'bullet',
        text: stripMarkdown(bulletMatch[1])
      });
      continue;
    }

    const tsMatch = /^\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*(.*)$/.exec(trimmed);
    if (tsMatch) {
      const tsStr = trimmed.slice(0, trimmed.indexOf(']') + 1);
      const rest = trimmed.slice(tsStr.length).trim();
      blocks.push({
        type: 'tx',
        ts: tsStr,
        text: stripMarkdown(rest)
      });
      continue;
    }

    const cleanLine = stripMarkdown(trimmed);
    if (cleanLine) {
      blocks.push({
        type: 'p',
        text: cleanLine
      });
    }
  }
  return blocks;
}

export function parseTimestampStringToSeconds(tsStr: string): number | null {
  const clean = String(tsStr || '').replace(/[\[\]]/g, '').trim();
  if (!clean) return null;
  const sec = parseTimestampToSeconds(clean);
  return Number.isFinite(sec) ? sec : null;
}

export function getLocalThumbnailDataUri(label: string, accent = '#38bdf8'): string {
  const safeLabel = (label || 'Summary').slice(0, 18).replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135" viewBox="0 0 240 135">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
    </defs>
    <rect width="240" height="135" fill="url(#bg)"/>
    <path d="M0 95 Q60 70 120 92 T240 80 L240 135 L0 135 Z" fill="${accent}" fill-opacity="0.16"/>
    <circle cx="120" cy="60" r="18" fill="#020617" fill-opacity="0.7" stroke="${accent}" stroke-opacity="0.6" stroke-width="1.5"/>
    <polygon points="116,52 128,60 116,68" fill="${accent}"/>
    <text x="12" y="120" fill="#cbd5e1" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" font-weight="600">${safeLabel}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function getLocalFramePreviewDataUri(tsStr: string, caption: string, accent = '#38bdf8'): string {
  const safeTs = (tsStr || '00:15').replace(/[<>&"']/g, '');
  const safeCaption = (caption || 'Video frame snapshot').slice(0, 44).replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">
    <defs>
      <linearGradient id="fbg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#090f1d"/>
        <stop offset="55%" stop-color="#132238"/>
        <stop offset="100%" stop-color="#0c1524"/>
      </linearGradient>
    </defs>
    <rect width="480" height="270" fill="url(#fbg)"/>
    <g stroke="#1e293b" stroke-width="1" opacity="0.65">
      <line x1="0" y1="68" x2="480" y2="68"/>
      <line x1="0" y1="135" x2="480" y2="135"/>
      <line x1="0" y1="202" x2="480" y2="202"/>
      <line x1="120" y1="0" x2="120" y2="270"/>
      <line x1="240" y1="0" x2="240" y2="270"/>
      <line x1="360" y1="0" x2="360" y2="270"/>
    </g>
    <rect x="0" y="0" width="480" height="36" fill="#020617" fill-opacity="0.72"/>
    <text x="18" y="23" fill="#e2e8f0" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12.5" font-weight="600">${safeCaption}</text>
    <rect x="42" y="54" width="220" height="128" rx="10" fill="#0f172a" stroke="${accent}" stroke-opacity="0.55" stroke-width="1.5"/>
    <path d="M58 152 L104 124 L148 136 L192 90 L242 104" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="192" cy="90" r="4.5" fill="#34d399"/>
    <rect x="284" y="54" width="154" height="58" rx="8" fill="#172554" stroke="#60a5fa" stroke-opacity="0.55" stroke-width="1.5"/>
    <text x="361" y="87" text-anchor="middle" fill="#dbeafe" font-family="ui-monospace,monospace" font-size="13" font-weight="700">FRAME @ ${safeTs}</text>
    <rect x="284" y="124" width="154" height="58" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
    <rect x="300" y="142" width="84" height="8" rx="4" fill="#38bdf8" fill-opacity="0.75"/>
    <rect x="300" y="158" width="118" height="6" rx="3" fill="#64748b" fill-opacity="0.6"/>
    <rect x="16" y="256" width="448" height="3" rx="1.5" fill="#334155"/>
    <rect x="16" y="256" width="178" height="3" rx="1.5" fill="#ef4444"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function getLocalDiagramDataUri(topic: string): string {
  const safeTopic = (topic || 'System Architecture').slice(0, 34).replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="220" viewBox="0 0 600 220">
    <rect width="600" height="220" fill="#090d16"/>
    <g stroke="#1e293b" stroke-width="1">
      <line x1="0" y1="55" x2="600" y2="55"/>
      <line x1="0" y1="110" x2="600" y2="110"/>
      <line x1="0" y1="165" x2="600" y2="165"/>
      <line x1="150" y1="0" x2="150" y2="220"/>
      <line x1="300" y1="0" x2="300" y2="220"/>
      <line x1="450" y1="0" x2="450" y2="220"/>
    </g>
    <rect x="44" y="68" width="132" height="64" rx="10" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/>
    <text x="110" y="104" text-anchor="middle" fill="#e2e8f0" font-family="ui-monospace,monospace" font-size="12">INPUT STREAM</text>
    <line x1="176" y1="100" x2="234" y2="100" stroke="#38bdf8" stroke-width="2"/>
    <rect x="234" y="56" width="142" height="88" rx="10" fill="#172554" stroke="#60a5fa" stroke-width="1.5"/>
    <text x="305" y="96" text-anchor="middle" fill="#f8fafc" font-family="ui-monospace,monospace" font-size="12" font-weight="700">VECTOR CORE</text>
    <text x="305" y="116" text-anchor="middle" fill="#93c5fd" font-family="ui-monospace,monospace" font-size="10">3nm / FP8</text>
    <line x1="376" y1="100" x2="432" y2="100" stroke="#34d399" stroke-width="2"/>
    <rect x="432" y="68" width="126" height="64" rx="10" fill="#064e3b" stroke="#34d399" stroke-width="1.5"/>
    <text x="495" y="104" text-anchor="middle" fill="#ecfdf5" font-family="ui-monospace,monospace" font-size="12">2.1x EFF.</text>
    <text x="20" y="28" fill="#94a3b8" font-family="ui-monospace,monospace" font-size="11">SCHEMA // ${safeTopic}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

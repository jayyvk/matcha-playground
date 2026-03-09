'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ============================================================================
// Mock data for agent steps
// ============================================================================
// Carbon intensity: ~0.4 kg CO2 per kWh (US grid average)
const CARBON_PER_MWH = 0.4; // gCO2 per mWh

const MODELS = {
  'gpt-4o': { label: 'GPT-4o', energyPer1kTokens: 2.8, speed: 45 },
  'gpt-4o-mini': { label: 'GPT-4o Mini', energyPer1kTokens: 0.9, speed: 80 },
  'claude-sonnet': { label: 'Claude Sonnet', energyPer1kTokens: 2.5, speed: 50 },
  'claude-haiku': { label: 'Claude Haiku', energyPer1kTokens: 0.7, speed: 90 },
  'llama-3-70b': { label: 'LLaMA 3 70B', energyPer1kTokens: 3.2, speed: 35 },
  'llama-3-8b': { label: 'LLaMA 3 8B', energyPer1kTokens: 0.5, speed: 95 },
  'mistral-7b': { label: 'Mistral 7B', energyPer1kTokens: 0.4, speed: 100 },
};

const DEFAULT_STEPS = [
  {
    id: 'parse',
    name: 'Query Parser',
    desc: 'Parse user intent and extract entities',
    model: 'claude-haiku',
    tokensIn: 85,
    tokensOut: 42,
    output: '{"intent": "stock_analysis", "ticker": "TSLA", "action": "buy_sell_recommendation", "timeframe": "current"}',
  },
  {
    id: 'research',
    name: 'Research Agent',
    desc: 'Gather financial data, news, and analyst ratings',
    model: 'gpt-4o',
    tokensIn: 320,
    tokensOut: 890,
    output: 'Tesla (TSLA) is currently trading at $248.42, down 2.3% today. Q4 earnings beat expectations with $25.7B revenue. Analyst consensus: 18 buy, 12 hold, 7 sell. Key risks: increased competition from Chinese EVs, margin pressure from price cuts. Positive catalysts: FSD v13 rollout, energy storage growth (+150% YoY), Optimus robot progress. P/E ratio of 62x remains elevated vs industry avg of 15x.',
  },
  {
    id: 'sentiment',
    name: 'Sentiment Analyzer',
    desc: 'Analyze market sentiment from news and social data',
    model: 'gpt-4o-mini',
    tokensIn: 1240,
    tokensOut: 180,
    output: 'Overall sentiment: MIXED-POSITIVE (0.62/1.0). News sentiment: Neutral (earnings met expectations). Social sentiment: Bullish (FSD excitement). Institutional sentiment: Cautious (valuation concerns). Short interest: 3.2% (declining).',
  },
  {
    id: 'technical',
    name: 'Technical Analysis',
    desc: 'Run technical indicators and chart patterns',
    model: 'llama-3-8b',
    tokensIn: 450,
    tokensOut: 220,
    output: 'RSI: 54 (neutral). MACD: bullish crossover 3 days ago. 50-day MA: $235 (price above). 200-day MA: $218 (price above). Support: $230. Resistance: $265. Volume: declining on recent pullback (positive). Pattern: bull flag forming on daily chart.',
  },
  {
    id: 'synthesize',
    name: 'Recommendation Engine',
    desc: 'Synthesize all signals into final recommendation',
    model: 'claude-sonnet',
    tokensIn: 1680,
    tokensOut: 420,
    output: 'BUY with moderate conviction (7/10). Entry: $245-250 range. Target: $290 (3-6 month). Stop loss: $220. Thesis: Strong fundamentals with FSD and energy catalysts justify premium valuation near-term. Risk/reward favorable at current pullback from highs. Position size: 3-5% of portfolio. Key risk: If broader market corrects, high-beta TSLA will amplify losses.',
  },
];

// Token count multiplier per model — bigger models are more verbose
const MODEL_TOKEN_SCALE = {
  'gpt-4o': 1.3,
  'gpt-4o-mini': 0.85,
  'claude-sonnet': 1.2,
  'claude-haiku': 0.6,
  'llama-3-70b': 1.1,
  'llama-3-8b': 0.5,
  'mistral-7b': 0.45,
};

// Vary output per model — every model has a variant for every step
const MODEL_OUTPUT_VARIANTS = {
  'parse': {
    'gpt-4o': '{"intent": "comprehensive_stock_research", "ticker": "TSLA", "analysis_type": "buy_sell_recommendation", "scope": "fundamental_technical_sentiment", "timeframe": "current_with_outlook"}',
    'gpt-4o-mini': '{"intent": "stock_analysis", "ticker": "TSLA", "action": "buy_sell", "scope": "standard"}',
    'claude-sonnet': '{"intent": "stock_research_and_recommendation", "ticker": "TSLA", "analysis_type": "buy_sell", "scope": "comprehensive", "include": ["fundamentals", "technicals", "sentiment"]}',
    'claude-haiku': '{"intent": "stock_analysis", "ticker": "TSLA", "action": "buy_sell_recommendation", "timeframe": "current"}',
    'llama-3-70b': '{"intent": "stock_analysis", "ticker": "TSLA", "type": "buy_sell_recommendation", "depth": "full"}',
    'llama-3-8b': '{"intent": "stock_analysis", "entity": "TSLA", "task": "buy_or_sell"}',
    'mistral-7b': '{"ticker": "TSLA", "action": "recommend"}',
  },
  'research': {
    'gpt-4o': 'Tesla (TSLA) is currently trading at $248.42, representing a 2.3% decline in today\'s session. The company reported Q4 2024 revenue of $25.7B, beating consensus estimates of $25.3B. The analyst community remains divided with 18 buy ratings, 12 hold ratings, and 7 sell ratings. Key risk factors include intensifying competition from Chinese EV manufacturers (BYD, NIO, XPeng) which are gaining global market share, and ongoing margin pressure from Tesla\'s aggressive price reduction strategy. On the positive side, FSD v13 is showing promising real-world results with intervention rates dropping 40%, energy storage deployments surged 150% year-over-year reaching 14.7 GWh, and Optimus humanoid robot development continues ahead of internal timelines. The forward P/E ratio of 62x remains significantly elevated compared to the automotive industry average of 15x and even the broader tech sector average of 28x.',
    'gpt-4o-mini': 'TSLA at $248.42 (-2.3%). Q4 revenue $25.7B beat estimates. Analysts: 18 buy, 12 hold, 7 sell. Risks: Chinese EV competition, margin pressure. Catalysts: FSD v13, energy storage +150% YoY, Optimus progress. P/E 62x vs industry 15x.',
    'claude-sonnet': 'TSLA trades at $248.42 (-2.3%). Revenue of $25.7B beat estimates. The street is split: 18 buys vs 7 sells. Main headwind is Chinese EV competition squeezing margins. Tailwinds include FSD v13 rollout and energy storage surging 150% YoY. Valuation at 62x earnings is steep against sector avg of 15x.',
    'claude-haiku': 'TSLA $248.42 (-2.3%). Q4 beat at $25.7B rev. Mixed consensus. China competition + margin risk vs FSD + energy tailwinds. P/E 62x elevated.',
    'llama-3-70b': 'Tesla stock: $248.42, down 2.3% intraday. Earnings: $25.7B revenue (beat). Consensus: mixed with 18 buy, 12 hold, 7 sell. Analysts worry about margin compression from price wars. Bullish case: FSD, energy, Optimus. Bearish case: valuation, competition. Short interest low at 3.2%.',
    'llama-3-8b': 'TSLA at $248. Earnings were good. Analysts are split. Competition from China is a concern. FSD and energy storage are positives.',
    'mistral-7b': 'TSLA $248.42. Revenue beat. Mixed analyst views. China risk. FSD positive.',
  },
  'sentiment': {
    'gpt-4o': 'Comprehensive sentiment analysis across multiple data sources yields an aggregate score of MIXED-POSITIVE at 0.62/1.0. Breaking this down by channel: Financial news sentiment registers as Neutral (0.48) — earnings met expectations but didn\'t significantly surprise. Social media sentiment is Bullish (0.78) driven primarily by retail investor excitement around FSD v13 demo videos and Optimus updates. Institutional sentiment reads Cautious (0.41) with primary concerns around stretched valuation multiples and sector rotation risk. Short interest has declined to 3.2% of float, down from 4.1% three months ago, suggesting bearish conviction is fading. Options flow shows elevated call buying at $270-$300 strikes for 3-month expiry.',
    'gpt-4o-mini': 'Sentiment: MIXED-POSITIVE (0.62). News: neutral (earnings met, not exceeded). Social: bullish (FSD excitement). Institutional: cautious (valuation). Short interest: 3.2% and declining.',
    'claude-sonnet': 'Overall sentiment aggregate: MIXED-POSITIVE (0.62/1.0). News sentiment neutral — earnings met but didn\'t exceed expectations. Social channels bullish, driven by FSD v13 demos. Institutional positioning cautious on valuation. Short interest at 3.2%, trending down from 4.1% last quarter. Options market showing elevated call activity at $270+ strikes.',
    'claude-haiku': 'Sentiment: MIXED-POSITIVE (0.6). News: neutral. Social: bullish. Institutions: cautious. Short interest declining.',
    'llama-3-70b': 'Sentiment score: 0.62 (mixed-positive). News neutral, social bullish on FSD, institutional cautious. Short interest 3.2% declining. Overall constructive but not uniformly positive.',
    'llama-3-8b': 'Positive sentiment overall. Social media bullish on FSD. News neutral. Shorts decreasing.',
    'mistral-7b': 'Sentiment: 0.58 positive. Mixed signals across sources.',
  },
  'technical': {
    'gpt-4o': 'The technical picture for TSLA is constructive across multiple timeframes. RSI(14) at 54 indicates neither overbought nor oversold conditions. MACD generated a bullish crossover 3 sessions ago with increasing histogram momentum. Price maintains position above both the 50-day MA ($235) and 200-day MA ($218), confirming the intermediate uptrend. Key support at $230 (prior resistance turned support). Primary resistance at $265 (recent swing high). Volume profile shows declining volume on the current 3-day pullback, which is constructive — suggests selling pressure is exhausting. A bull flag pattern is forming on the daily chart with a measured move target of $280-290. Fibonacci retracement of the last leg up shows current price testing the 38.2% level, a common bounce point in uptrends.',
    'gpt-4o-mini': 'RSI 54 (neutral), MACD bullish crossover, price above both 50-day ($235) and 200-day ($218) MAs. Support at $230, resistance at $265. Bull flag pattern forming. Volume declining on pullback — constructive.',
    'claude-sonnet': 'Technical setup is favorable. RSI neutral at 54, MACD crossed bullish recently. Trading above key moving averages (50d: $235, 200d: $218). Support at $230, resistance at $265. Bull flag on daily chart targets $280-290. Volume declining on pullback is a positive sign.',
    'claude-haiku': 'RSI 54 neutral. MACD bullish. Above 50d/200d MA. Support $230, resistance $265. Bull flag forming.',
    'llama-3-70b': 'RSI: 54 (neutral zone). MACD: bullish crossover 3 days ago. Price above 50-day MA ($235) and 200-day MA ($218). Support: $230. Resistance: $265. Volume declining on pullback (constructive). Daily chart: bull flag pattern, target $280-290.',
    'llama-3-8b': 'RSI 54. MACD bullish. Above moving averages. Support $230, resistance $265. Looks okay technically.',
    'mistral-7b': 'RSI: 54. MACD: bullish. Above 50MA and 200MA. Support $230. Resistance $265.',
  },
  'synthesize': {
    'gpt-4o': 'Recommendation: BUY with conviction score of 7.5/10. The investment thesis rests on a confluence of bullish technicals (MACD crossover, price above key MAs, bull flag formation), improving sentiment (declining short interest, bullish options flow), and strong fundamental catalysts (FSD v13 showing 40% improvement in intervention rates, energy storage at inflection point with 150% YoY growth). Suggested entry zone: $245-250 on the current pullback. Price target: $290 over a 3-6 month horizon based on bull flag measured move and peer multiple expansion. Stop loss: $220 (below 200-day MA, invalidates the technical thesis). Recommended position size: 3-5% of portfolio given elevated single-stock risk. Key risk: if broader market corrects, TSLA\'s high beta (~1.8) will amplify downside significantly.',
    'gpt-4o-mini': 'BUY — conviction 7/10. Entry $245-250, target $290, stop $220. Technicals and sentiment supportive. Key catalysts: FSD, energy storage. Risk: high beta in market correction. Size: 3-5% of portfolio.',
    'claude-sonnet': 'BUY with moderate conviction (7/10). Entry: $245-250 range. Target: $290 (3-6 month). Stop loss: $220. Thesis: Strong fundamentals with FSD and energy catalysts justify premium valuation near-term. Risk/reward favorable at current pullback from highs. Position size: 3-5% of portfolio. Key risk: If broader market corrects, high-beta TSLA will amplify losses.',
    'claude-haiku': 'BUY (6/10 conviction). Entry: ~$248. Target: $280. Stop: $225. Catalysts outweigh risks near-term but valuation is stretched.',
    'llama-3-70b': 'BUY — conviction 6.5/10. Fundamentals solid, technicals constructive, sentiment net positive. Entry $245-250, target $285, stop $220. Moderate position size recommended given elevated P/E.',
    'llama-3-8b': 'Buy TSLA around $248. Target $275. Stop $225. Decent setup but valuation is high.',
    'mistral-7b': 'BUY. Entry $248. Target $270. Stop $225.',
  },
};

// ============================================================================
// Position registry & draggable (same as trainmyowngpt)
// ============================================================================
function useNodePositions() {
  const pos = useRef({});
  const [tick, setTick] = useState(0);
  const update = useCallback((id, x, y, w, h) => {
    pos.current[id] = { x, y, w, h };
    setTick(t => t + 1);
  }, []);
  return { positions: pos.current, update, tick };
}

function useDraggable(ix, iy, id, onPos) {
  const [p, setP] = useState({ x: ix, y: iy });
  const drag = useRef(false);
  const off = useRef({ x: 0, y: 0 });
  const ref = useRef(null);

  const onMouseDown = useCallback((e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName)) return;
    drag.current = true;
    off.current = { x: e.clientX - p.x, y: e.clientY - p.y };
    e.preventDefault();
  }, [p]);

  useEffect(() => {
    const mv = (e) => { if (drag.current) setP({ x: e.clientX - off.current.x, y: e.clientY - off.current.y }); };
    const up = () => { drag.current = false; };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, []);

  useEffect(() => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      onPos(id, p.x, p.y, r.width, r.height);
    }
  }, [p, id, onPos]);

  return { p, onMouseDown, ref };
}

// ============================================================================
// Node component (same style as trainmyowngpt)
// ============================================================================
function Node({ x, y, w, title, children, active, accent, id, onPosChange, maxH }) {
  const { p, onMouseDown, ref } = useDraggable(x, y, id, onPosChange);
  return (
    <div ref={ref} onMouseDown={onMouseDown} style={{
      position: 'absolute', left: p.x, top: p.y, width: w,
      background: '#fff', borderRadius: '3px',
      border: '1px solid ' + (active ? (accent || '#333') : '#e0e0e0'),
      boxShadow: active ? '0 2px 12px ' + (accent || '#333') + '15' : '0 1px 3px rgba(0,0,0,0.04)',
      cursor: 'grab', userSelect: 'none', zIndex: 10,
      transition: 'border-color 0.3s, box-shadow 0.3s',
      maxHeight: maxH || undefined, overflow: maxH ? 'hidden' : undefined,
    }}>
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid ' + (active ? (accent || '#333') + '20' : '#f0f0f0'),
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1.5px', color: active ? '#555' : '#bbb', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>{title}</span>
      </div>
      <div style={{ padding: '12px', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', maxHeight: maxH ? (maxH - 40) + 'px' : undefined, overflowY: maxH ? 'auto' : undefined }}>{children}</div>
    </div>
  );
}

// ============================================================================
// Wires
// ============================================================================
const WIRES = [
  ['chat', 'traces'],
  ['traces', 'gpu'],
  ['traces', 'history'],
];

function Wires({ positions, wires, tick }) {
  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
      {wires.map(([from, to], i) => {
        const a = positions[from], b = positions[to];
        if (!a || !b) return null;
        const aCx = a.x + a.w / 2, aCy = a.y + a.h / 2;
        const bCx = b.x + b.w / 2, bCy = b.y + b.h / 2;
        let x1, y1, x2, y2;
        const dx = bCx - aCx, dy = bCy - aCy;
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > 0) { x1 = a.x + a.w; y1 = aCy; x2 = b.x; y2 = bCy; }
          else { x1 = a.x; y1 = aCy; x2 = b.x + b.w; y2 = bCy; }
        } else {
          if (dy > 0) { x1 = aCx; y1 = a.y + a.h; x2 = bCx; y2 = b.y; }
          else { x1 = aCx; y1 = a.y; x2 = bCx; y2 = b.y + b.h; }
        }
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        let d;
        if (Math.abs(dx) > Math.abs(dy)) {
          d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
        } else {
          d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
        }
        return (
          <g key={i}>
            <path d={d} fill="none" stroke="#d4d4d4" strokeWidth="1.5" strokeDasharray="6,4" />
            <circle cx={x2} cy={y2} r="3" fill="#d4d4d4" />
            <circle cx={x1} cy={y1} r="2.5" fill="none" stroke="#d4d4d4" strokeWidth="1" />
          </g>
        );
      })}
    </svg>
  );
}

// ============================================================================
// Sparkline component for GPU metrics
// ============================================================================
function Sparkline({ data, height = 40, color = '#333', label, unit, currentVal }) {
  if (!data.length) return null;
  const mx = Math.max(...data, 1), mn = Math.min(...data, 0);
  const rng = mx - mn || 1;
  const toY = v => ((mx - v) / rng) * 90 + 5;
  const toX = (i) => (i / Math.max(data.length - 1, 1)) * 100;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#bbb', marginBottom: '2px' }}>
        <span>{label}</span>
        <span style={{ color: '#555', fontWeight: 600 }}>{currentVal}{unit}</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        <polyline fill="none" stroke={color} strokeWidth="1.5" points={data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')} vectorEffect="non-scaling-stroke" />
        {data.length > 1 && <circle cx={toX(data.length - 1)} cy={toY(data[data.length - 1])} r="2" fill={color} vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  );
}

// ============================================================================
// Main App
// ============================================================================
export default function MatchaPlayground() {
  const { positions, update: updatePos, tick: posTick } = useNodePositions();

  // State
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(-1);
  const [steps, setSteps] = useState(DEFAULT_STEPS.map(s => ({ ...s })));
  const [chatMessages, setChatMessages] = useState([]);
  const [gpuPower, setGpuPower] = useState([]);
  const [gpuUtil, setGpuUtil] = useState([]);
  const [gpuTemp, setGpuTemp] = useState([]);
  const [runHistory, setRunHistory] = useState([]);
  const [editingStep, setEditingStep] = useState(null);
  const timerRef = useRef(null);
  const gpuTimerRef = useRef(null);

  // Center offset
  const [offset, setOffset] = useState(60);
  useEffect(() => {
    const calc = () => setOffset(Math.max(30, Math.floor((window.innerWidth - 1200) / 2)));
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // Compute totals
  const totals = useMemo(() => {
    const completed = visibleSteps.filter(s => s.status === 'done');
    let totalEnergy = 0, totalTokens = 0, totalLatency = 0, totalCarbon = 0;
    completed.forEach(s => {
      const m = MODELS[s.model];
      const tokens = s.tokensIn + s.tokensOut;
      const energy = (tokens / 1000) * m.energyPer1kTokens;
      totalEnergy += energy;
      totalTokens += tokens;
      totalLatency += s.latency || 0;
      totalCarbon += energy * CARBON_PER_MWH;
    });
    return { totalEnergy: totalEnergy.toFixed(2), totalTokens, totalLatency: totalLatency.toFixed(0), totalCarbon: totalCarbon.toFixed(3) };
  }, [visibleSteps]);

  // GPU metric simulation — realistic noisy curves like real NVML/powermetrics
  const gpuPhase = useRef(0);
  const startGpuSim = useCallback(() => {
    gpuTimerRef.current = setInterval(() => {
      gpuPhase.current += 0.15;
      const t = gpuPhase.current;

      setGpuPower(prev => {
        const last = prev.length ? prev[prev.length - 1] : 85;
        let target;
        if (running) {
          // Realistic GPU load: noisy 220-310W with micro-spikes and dips
          target = 265
            + Math.sin(t * 1.1) * 20
            + Math.sin(t * 3.3) * 12
            + Math.sin(t * 7.7) * 8
            + Math.sin(t * 13.1) * 5
            + (Math.random() - 0.5) * 30;  // heavy noise
        } else {
          // Idle: 75-100W, still noisy
          target = 82
            + Math.sin(t * 0.7) * 5
            + Math.sin(t * 2.1) * 3
            + (Math.random() - 0.5) * 10;
        }
        const smoothed = last * 0.45 + target * 0.55;  // less smoothing = more jagged
        return [...prev.slice(-79), Math.max(55, smoothed)];
      });

      setGpuUtil(prev => {
        const last = prev.length ? prev[prev.length - 1] : 12;
        let target;
        if (running) {
          // Utilization is bursty — jumps between 60-98% with sudden drops
          const burst = Math.sin(t * 2.5) > 0.3 ? 88 + Math.random() * 10 : 62 + Math.random() * 15;
          target = burst + Math.sin(t * 5.2) * 6 + (Math.random() - 0.5) * 12;
        } else {
          // Idle: 2-20%, occasional background spikes
          const spike = Math.random() > 0.85 ? 18 + Math.random() * 8 : 0;
          target = 8 + Math.sin(t * 0.6) * 3 + (Math.random() - 0.5) * 5 + spike;
        }
        const smoothed = last * 0.35 + target * 0.65;  // snappy transitions
        return [...prev.slice(-79), Math.max(0, Math.min(100, smoothed))];
      });

      setGpuTemp(prev => {
        const last = prev.length ? prev[prev.length - 1] : 42;
        let target;
        if (running) {
          // Temp: thermal inertia, rises slowly, 64-78°C with small noise
          target = 71 + Math.sin(t * 0.4) * 4 + Math.sin(t * 1.8) * 2 + (Math.random() - 0.5) * 3;
        } else {
          // Cooling: slow descent, 39-46°C
          target = 42 + Math.sin(t * 0.2) * 2 + (Math.random() - 0.5) * 1.5;
        }
        // Temperature has high thermal inertia
        const smoothed = last * 0.88 + target * 0.12;
        return [...prev.slice(-79), smoothed];
      });
    }, 200);  // faster sampling = more data points = more realistic
  }, [running]);

  useEffect(() => {
    startGpuSim();
    return () => clearInterval(gpuTimerRef.current);
  }, [running]);

  // Run the agent simulation
  const runAgent = useCallback(() => {
    setRunning(true);
    setComplete(false);
    setVisibleSteps([]);
    setCurrentStepIdx(-1);
    setChatMessages([{ role: 'user', text: 'Research Tesla stock and give me a buy/sell recommendation.' }]);

    let stepIdx = 0;
    const runNextStep = () => {
      if (stepIdx >= steps.length) {
        setRunning(false);
        setComplete(true);
        setCurrentStepIdx(-1);
        // Add final chat message
        const lastStep = steps[steps.length - 1];
        const variant = MODEL_OUTPUT_VARIANTS[lastStep.id]?.[lastStep.model];
        const finalOutput = variant || lastStep.output;
        setChatMessages(prev => [...prev, { role: 'assistant', text: finalOutput }]);
        return;
      }

      const step = steps[stepIdx];
      const m = MODELS[step.model];
      const scale = MODEL_TOKEN_SCALE[step.model] || 1;
      const defaultStep = DEFAULT_STEPS.find(d => d.id === step.id);
      const tokensIn = defaultStep ? Math.round(defaultStep.tokensIn * (0.9 + scale * 0.2)) : step.tokensIn;
      const tokensOut = defaultStep ? Math.round(defaultStep.tokensOut * scale) : step.tokensOut;
      const tokens = tokensIn + tokensOut;
      // Simulate latency based on model speed and token count
      const baseLatency = (tokens / m.speed) * 100 + Math.random() * 200 + 150;
      const latency = Math.round(baseLatency);

      setCurrentStepIdx(stepIdx);
      // Add as "running"
      setVisibleSteps(prev => [...prev, { ...step, tokensIn, tokensOut, status: 'running', latency: 0, energy: 0 }]);

      // Add thinking message to chat
      setChatMessages(prev => [...prev, { role: 'thinking', text: `${step.name}: ${step.desc}...` }]);

      setTimeout(() => {
        const energy = (tokens / 1000) * m.energyPer1kTokens;
        // Get output variant if model was swapped
        const variant = MODEL_OUTPUT_VARIANTS[step.id]?.[step.model];
        const output = variant || step.output;

        setVisibleSteps(prev => prev.map((s, i) =>
          i === prev.length - 1 ? { ...s, status: 'done', latency, energy: energy.toFixed(2), output } : s
        ));

        // Remove thinking, don't add individual step outputs to chat (keep it clean)
        setChatMessages(prev => prev.filter(m => m.role !== 'thinking' || m.text !== `${step.name}: ${step.desc}...`));

        stepIdx++;
        setTimeout(runNextStep, 200);
      }, latency);
    };

    setTimeout(runNextStep, 500);
  }, [steps]);

  // Save run to history
  useEffect(() => {
    if (complete && visibleSteps.length > 0) {
      setRunHistory(prev => [...prev, {
        id: Date.now(),
        steps: visibleSteps.map(s => ({ name: s.name, model: s.model })),
        ...totals,
      }]);
    }
  }, [complete]);

  // Swap model for a step — only update config, results change on re-run
  const swapModel = useCallback((stepIdx, newModel) => {
    setSteps(prev => prev.map((s, i) => i === stepIdx ? { ...s, model: newModel } : s));
    // Mark the visible step as "swapped" so user sees which steps changed
    setVisibleSteps(prev => prev.map((s, i) => {
      if (i !== stepIdx) return s;
      return { ...s, pendingModel: newModel };
    }));
    setEditingStep(null);
  }, []);

  // Reset for re-run
  const rerun = useCallback(() => {
    setComplete(false);
    setVisibleSteps([]);
    setChatMessages([]);
    setCurrentStepIdx(-1);
    setGpuPower([]);
    setGpuUtil([]);
    setGpuTemp([]);
    runAgent();
  }, [runAgent]);

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'auto', position: 'relative',
      fontFamily: "'JetBrains Mono', monospace", background: '#fafafa',
      backgroundImage: 'radial-gradient(circle, #e0e0e0 0.8px, transparent 0.8px)', backgroundSize: '20px 20px',
    }}>
      <div style={{ position: 'fixed', top: 16, left: 20, zIndex: 100, fontSize: '10px', fontWeight: 700, letterSpacing: '3px', color: '#ccc' }}>MATCHA PLAYGROUND</div>
      <div style={{ position: 'fixed', top: 16, right: 20, zIndex: 100, fontSize: '9px', letterSpacing: '1px', color: '#ccc' }}>
        agent energy attribution
      </div>

      <Wires positions={positions} wires={WIRES} tick={posTick} />

      {/* 01 CHAT */}
      <Node x={offset} y={80} w={300} title="Agent Chat" active={chatMessages.length > 0} accent="#2563eb" id="chat" onPosChange={updatePos}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {chatMessages.length === 0 && !running && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '10px', color: '#999', lineHeight: '16px' }}>
                Click run to send a query through a multi-step AI agent and see energy attribution for each step.
              </div>
              <button onClick={runAgent} style={{
                padding: '10px', fontSize: '11px', fontWeight: 600, fontFamily: 'inherit', letterSpacing: '1px',
                background: '#333', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer',
              }}>▶ RUN AGENT</button>
            </div>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} style={{
              padding: '6px 8px', borderRadius: '3px', fontSize: '10px', lineHeight: '15px',
              background: msg.role === 'user' ? '#f0f7ff' : msg.role === 'thinking' ? '#fefce8' : '#f0fdf4',
              border: '1px solid ' + (msg.role === 'user' ? '#dbeafe' : msg.role === 'thinking' ? '#fef08a' : '#bbf7d0'),
              color: msg.role === 'thinking' ? '#a16207' : '#333',
              fontStyle: msg.role === 'thinking' ? 'italic' : 'normal',
            }}>
              {msg.role === 'user' && <div style={{ fontSize: '8px', color: '#2563eb', fontWeight: 600, marginBottom: '3px' }}>YOU</div>}
              {msg.role === 'assistant' && <div style={{ fontSize: '8px', color: '#16a34a', fontWeight: 600, marginBottom: '3px' }}>AGENT</div>}
              {msg.role === 'thinking' && <div style={{ fontSize: '8px', color: '#a16207', fontWeight: 600, marginBottom: '3px' }}>⟳ THINKING</div>}
              {msg.text}
            </div>
          ))}
          {complete && (
            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '10px', marginBottom: '8px' }}>
                {[
                  { label: 'ENERGY', value: totals.totalEnergy + ' mWh', color: '#16a34a' },
                  { label: 'TOKENS', value: totals.totalTokens.toLocaleString(), color: '#2563eb' },
                  { label: 'LATENCY', value: totals.totalLatency + 'ms', color: '#d97706' },
                  { label: 'CARBON', value: totals.totalCarbon + ' gCO₂', color: '#7c3aed' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: '#f8f8f8', borderRadius: '3px', padding: '5px 7px' }}>
                    <div style={{ fontSize: '7px', color: '#bbb', letterSpacing: '1px' }}>{label}</div>
                    <div style={{ fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>
              <button onClick={rerun} style={{
                width: '100%', padding: '8px', fontSize: '10px', fontWeight: 600, fontFamily: 'inherit', letterSpacing: '1px',
                background: '#333', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer',
              }}>↻ RE-RUN AGENT</button>
            </div>
          )}
        </div>
      </Node>

      {/* 02 TRACES */}
      <Node x={offset + 330} y={80} w={380} title="Agent Traces" active={visibleSteps.length > 0} accent="#22c55e" id="traces" onPosChange={updatePos} maxH={620}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {visibleSteps.length === 0 && <div style={{ color: '#ddd', fontStyle: 'italic' }}>waiting for agent run...</div>}
          {visibleSteps.map((step, i) => {
            const m = MODELS[step.model];
            const isRunning = step.status === 'running';
            return (
              <div key={step.id + '-' + i} style={{
                border: '1px solid ' + (isRunning ? '#fde68a' : '#d1fae5'),
                borderRadius: '3px', padding: '8px',
                background: isRunning ? '#fffbeb' : '#f0fdf4',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#333' }}>{step.name}</span>
                    {isRunning && <span style={{ fontSize: '8px', color: '#d97706', animation: 'pulse 1s infinite' }}>● running</span>}
                    {!isRunning && <span style={{ fontSize: '8px', color: '#16a34a' }}>✓ done</span>}
                  </div>
                  <span style={{ fontSize: '8px', color: '#999' }}>step {i + 1}/{steps.length}</span>
                </div>
                <div style={{ fontSize: '9px', color: '#888', marginBottom: '6px' }}>{step.desc}</div>

                {/* Model selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '8px', color: '#bbb' }}>model:</span>
                  {editingStep === i && !running ? (
                    <select value={step.pendingModel || step.model} onChange={(e) => swapModel(i, e.target.value)}
                      onBlur={() => setEditingStep(null)}
                      autoFocus
                      style={{ fontSize: '9px', fontFamily: 'inherit', padding: '2px 4px', border: '1px solid #d4d4d4', borderRadius: '2px', background: '#fff', outline: 'none' }}>
                      {Object.entries(MODELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  ) : (
                    <span onClick={() => !running && setEditingStep(i)}
                      style={{ fontSize: '9px', fontWeight: 600, color: step.pendingModel ? '#d97706' : '#2563eb', cursor: running ? 'default' : 'pointer', borderBottom: running ? 'none' : '1px dashed ' + (step.pendingModel ? '#d97706' : '#2563eb') }}>
                      {step.pendingModel ? MODELS[step.pendingModel].label : m.label}
                    </span>
                  )}
                  {step.pendingModel && (
                    <span style={{ fontSize: '7px', color: '#d97706', background: '#fef3c7', padding: '1px 4px', borderRadius: '2px', border: '1px solid #fde68a' }}>
                      re-run to apply
                    </span>
                  )}
                </div>

                {/* Metrics */}
                {!isRunning && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '3px' }}>
                    {[
                      { label: 'ENERGY', value: step.energy + ' mWh', color: '#16a34a' },
                      { label: 'TOKENS', value: (step.tokensIn + step.tokensOut), color: '#555' },
                      { label: 'LATENCY', value: step.latency + 'ms', color: '#d97706' },
                      { label: 'CARBON', value: (parseFloat(step.energy) * CARBON_PER_MWH).toFixed(3) + ' gCO₂', color: '#7c3aed' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: '#fff', borderRadius: '2px', padding: '3px 5px', border: '1px solid #e8e8e8' }}>
                        <div style={{ fontSize: '6px', color: '#bbb', letterSpacing: '0.5px' }}>{label}</div>
                        <div style={{ fontSize: '9px', fontWeight: 600, color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Output preview */}
                {!isRunning && step.output && (
                  <div style={{ marginTop: '4px', fontSize: '8px', color: '#888', lineHeight: '13px', maxHeight: '40px', overflow: 'hidden', background: '#fff', padding: '4px', borderRadius: '2px', border: '1px solid #f0f0f0' }}>
                    {step.output.slice(0, 150)}{step.output.length > 150 ? '...' : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Node>

      {/* 03 GPU METRICS */}
      <Node x={offset + 740} y={80} w={280} title="GPU Metrics" active={gpuPower.length > 0} accent="#ec4899" id="gpu" onPosChange={updatePos}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {gpuPower.length === 0 && <div style={{ color: '#ddd', fontStyle: 'italic' }}>waiting for telemetry...</div>}
          {gpuPower.length > 0 && <>
            <div style={{ fontSize: '9px', color: '#888', display: 'flex', justifyContent: 'space-between' }}>
              <span>NVIDIA A100 · GPU 0</span>
              <span style={{ color: running ? '#d97706' : '#16a34a', fontWeight: 600 }}>{running ? '● ACTIVE' : '● IDLE'}</span>
            </div>
            <Sparkline data={gpuPower} height={45} color="#ec4899" label="POWER DRAW" unit="W" currentVal={Math.round(gpuPower[gpuPower.length - 1] || 0)} />
            <Sparkline data={gpuUtil} height={45} color="#8b5cf6" label="UTILIZATION" unit="%" currentVal={Math.round(gpuUtil[gpuUtil.length - 1] || 0)} />
            <Sparkline data={gpuTemp} height={45} color="#f59e0b" label="TEMPERATURE" unit="°C" currentVal={Math.round(gpuTemp[gpuTemp.length - 1] || 0)} />
            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '6px', fontSize: '8px', color: '#bbb', lineHeight: '14px' }}>
              <div>memory: <span style={{ color: '#555' }}>32.4 / 80 GB</span></div>
              <div>pcie: <span style={{ color: '#555' }}>12.8 GB/s</span></div>
              <div>sm clock: <span style={{ color: '#555' }}>1410 MHz</span></div>
            </div>
          </>}
        </div>
      </Node>

      {/* 04 RUN HISTORY */}
      <Node x={offset + 740} y={460} w={280} title="Run History" active={runHistory.length > 0} accent="#06b6d4" id="history" onPosChange={updatePos}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {runHistory.length === 0 && <div style={{ color: '#ddd', fontStyle: 'italic' }}>completed runs will appear here...</div>}
          {runHistory.map((run, i) => (
            <div key={run.id} style={{ background: '#f8f8f8', borderRadius: '3px', padding: '6px 8px', border: '1px solid #e8e8e8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 700, color: '#333' }}>Run #{i + 1}</span>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>{run.totalEnergy} mWh</span>
              </div>
              <div style={{ fontSize: '8px', color: '#999', lineHeight: '14px' }}>
                {run.steps.map(s => <span key={s.name}>{s.name}: <span style={{ color: '#555' }}>{MODELS[s.model]?.label}</span> · </span>)}
              </div>
              <div style={{ display: 'flex', gap: '8px', fontSize: '8px', color: '#bbb', marginTop: '3px' }}>
                <span>{run.totalTokens} tokens</span>
                <span>{run.totalLatency}ms</span>
                <span>{run.totalCarbon} gCO₂</span>
              </div>
            </div>
          ))}
          {runHistory.length >= 2 && (
            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '6px', fontSize: '9px' }}>
              <div style={{ color: '#bbb', marginBottom: '3px' }}>COMPARISON</div>
              {(() => {
                const first = runHistory[0], last = runHistory[runHistory.length - 1];
                const diff = ((parseFloat(last.totalEnergy) - parseFloat(first.totalEnergy)) / parseFloat(first.totalEnergy) * 100).toFixed(1);
                const saved = parseFloat(diff) < 0;
                return (
                  <div style={{ color: saved ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {saved ? '↓' : '↑'} {Math.abs(parseFloat(diff))}% energy vs Run #1
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </Node>

      {/* Footer */}
      <div style={{ position: 'fixed', bottom: 16, right: 20, zIndex: 100 }}>
        <a href="https://usematcha.dev" target="_blank" rel="noopener noreferrer" style={{ fontSize: '8px', color: '#ccc', letterSpacing: '0.5px', textDecoration: 'none' }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#666'} onMouseLeave={(e) => e.currentTarget.style.color = '#ccc'}>
          usematcha.dev
        </a>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        * { box-sizing: border-box; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        ::selection { background: #d1fae5; }
      `}} />
    </div>
  );
}

# Matcha Playground — Agent Energy Attribution

Interactive demo showing energy-per-step attribution for multi-step AI agent workflows.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## How it works

1. Click **▶ RUN AGENT** to simulate a multi-step AI agent researching Tesla stock
2. Watch each step appear in the **Agent Traces** panel with energy, tokens, latency, and cost
3. **GPU Metrics** show simulated power draw, utilization, and temperature in real-time
4. After the run completes, click any **model name** in the traces to swap it (e.g. GPT-4o → Mistral 7B)
5. Click **↻ RE-RUN AGENT** to see how the new model changes energy consumption
6. **Run History** compares all your runs — see the energy savings

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

## Notes

- All data is simulated — no API calls, no backend
- Energy estimates based on published benchmarks per model family
- Built with Next.js 14 + React 18

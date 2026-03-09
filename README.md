# Matcha Playground

AI models are measured on accuracy, latency, and token usage. But when you run multi-step agent workflows on your own GPUs, one metric stays invisible: **how much energy each step actually consumes.**

Matcha is building the observability layer that connects GPU hardware telemetry with AI workload traces — giving you energy-per-inference attribution across every model, step, and team.

This playground demonstrates that visibility.

## Try it

[demo.usematcha.dev](https://demo.usematcha.dev)

## How it works

1. Click **▶ RUN AGENT** — a multi-step AI agent runs a stock research workflow
2. Each step appears in **Agent Traces** with energy (mWh), tokens, latency, and carbon (gCO₂)
3. **GPU Metrics** show real-time power draw, utilization, and temperature
4. After the run, click any **model name** to swap it (e.g. GPT-4o → Mistral 7B)
5. Click **↻ RE-RUN** to see how the new model changes energy and output
6. **Run History** compares runs side by side — see the savings

Learn more at [usematcha.dev](https://usematcha.dev)

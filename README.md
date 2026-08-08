# 🤖 ai-reviewer

> A fast, cost-effective AI code review CLI for developers. Runs 2-Pass revalidation directly on Git diffs to catch real bugs while cutting LLM token costs.

---

## 💡 The Problem

Most AI code review tools suffer from two major flaws:
1. **High Token Costs:** They send entire 500-line files to the LLM API just to review a 3-line pull request diff.
2. **False Positives & Noise:** LLMs often hallucinate line numbers or produce endless style and whitespace nitpicks instead of identifying genuine security bugs and logical flaws.

`ai-reviewer` solves this by combining **Git diff parsing (`-U1` context lines)** with a **2-Pass Revalidation Engine** and an automatic **Pass 2 Circuit Breaker** for small changes.

---

## ✨ Features

- **Multi-Provider Support:** Plug in **Google Gemini** (`@google/genai`), **OpenAI**, or run completely offline with **Ollama** (`http://localhost:11434`).
- **Dynamic Model Selection:** Automatically queries live models from your provider during interactive setup (`review init`).
- **2-Pass Revalidation Engine:**
  - **Pass 1:** Scans diffs for candidate vulnerabilities and logical flaws.
  - **Pass 2:** Cross-evaluates candidates against the raw diff to eliminate false positives and formatting noise.
- **Token-Aware File Batching & Adaptive Auto-Retry:** Automatically chunks large multi-file diffs into 3,500-token batches. Default cool-down is 2 seconds (fast for paid users). If an API provider returns a `429 Rate Limit` (e.g. Groq 12k TPM limits), the CLI automatically pauses for the requested retry duration and resumes the review.
- **Configurable Batch Cool-Down (`-c, --cooldown`):** Customize cool-down pacing between batches (`0s` for paid tiers, `60s` for free tiers).
- **Circuit Breaker for Small Diffs:** Bypasses Pass 2 on diffs shorter than 500 characters to halve latency and token usage.
- **Local Token Analytics Dashboard:** Track your daily, weekly, and all-time token consumption via `review stats`.
- **Zero AST Overhead:** Lightweight regex & git parser execution for sub-second CLI runs.

---

## 📊 Benchmark & Impact Summary

Measured results from running the automated impact suite (`npm run impact-report`):

| Impact Metric | Whole-File Inspection | `ai-reviewer` Git Diff | Measured Benefit |
| :--- | :--- | :--- | :--- |
| **Prompt Token Usage** | ~2,736 tokens | **258 tokens** | **90.6% Token Cost Savings** |
| **Noise & Nitpick Filter** | 3 candidate findings | 2 verified defects | **33.3% False Positives Filtered** |
| **Execution Latency** | — | **0.61 seconds** | **9.3 ms / line of code** |

---

## 🚀 Quickstart

### Step 1: Install & Link Globally
Clone the repository, install dependencies, and register the `review` binary globally on your machine:

```bash
git clone https://github.com/hum4nBeing/ai-powered-code-reviewer.git
cd ai-powered-code-reviewer
npm install
npm link
```

### Step 2: Configure AI Provider
Run the interactive configuration setup wizard to select your provider (Gemini, OpenAI, Ollama), enter your API key, set an optional Base URL (e.g. Groq, vLLM), pick from dynamically fetched models, and configure batch cool-down:

```bash
review init
```

Alternatively, set your config directly via CLI flags:

```bash
# Groq Example (OpenAI-compatible base URL)
review config -p openai -u https://api.groq.com/openai/v1 -m llama-3.3-70b-versatile -k YOUR_GROQ_KEY -c 2
```

### Step 3: Run Code Review
Navigate to any Git repository on your system, stage your code changes, and run the audit:

```bash
git add .
review
```

To review your latest committed changes:

```bash
review --ref HEAD~1
```

To review your last 3 commits or a feature branch against main:

```bash
review --ref HEAD~3
# or
review --ref main
```

### Step 4: Analytics & Benchmarks
View your local token consumption dashboard:

```bash
review stats
```

Execute the automated system impact benchmark suite:

```bash
npm run impact-report
```

---

## 🛠️ Architecture Overview

```text
ai-reviewer/
├── bin/
│   └── index.js             # CLI entry point (commander)
├── src/
│   ├── config/
│   │   └── configManager.js # Config persistence (~/.ai-reviewer-config.json)
│   ├── git/
│   │   └── diffParser.js    # Git diff execution (-U1 context) & parse-diff
│   ├── providers/
│   │   ├── baseProvider.js  # Abstract BaseProvider class
│   │   ├── geminiProvider.js# Google GenAI integration
│   │   ├── openaiProvider.js# OpenAI SDK integration
│   │   ├── ollamaProvider.js# Ollama local fetch integration
│   │   └── providerFactory.js # Factory Strategy pattern
│   ├── ai/
│   │   └── reviewEngine.js  # 2-Pass pipeline, token batching & circuit breaker logic
│   ├── analytics/
│   │   └── statsTracker.js  # Local token usage tracker (~/.ai-reviewer-stats.json)
│   └── ui/
│       └── renderer.js      # CLI table & terminal output formatter
├── scripts/
│   └── run-impact-report.js # System Impact Benchmark runner
├── package.json
└── README.md
```

---

## 📄 License

MIT

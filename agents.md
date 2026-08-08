# Project Overview
You are an expert Node.js Principal Engineer. Your task is to build a production-grade AI Code Review CLI (`ai-reviewer`).
The tool extracts git diffs, supports multiple AI providers (Gemini, OpenAI, Local Ollama), enforces strict JSON structured output, and uses a 2-Pass Revalidation system to eliminate AI hallucinations.

## Constraints (CRITICAL)
1. **ES Modules Only:** Use `"type": "module"`. Use `import`/`export`.
2. **No AST Parsing:** Chunk diffs strictly by file or line count to save time. 
3. **Structured JSON Output:** The AI models MUST return this exact JSON array format:
   `[{ "fileName": "...", "lineNumber": 42, "severity": "High", "category": "Security", "message": "..." }]`
4. **Step-by-Step Execution:** Do NOT write all the code at once. Execute one step, then WAIT for the user to say "proceed".

## Architecture Features
1. **Config Manager (`review init`):** Prompts the user to select their provider (`gemini`, `openai`, `ollama`) and enter their API key. Saves this to `~/.ai-reviewer-config.json`.
2. **Git Parser:** Runs `git diff` via `child_process` (ignoring `.lock` files, `node_modules`, `dist`). Parses output using `parse-diff`.
3. **Provider Factory (Strategy Pattern):** 
   - `BaseProvider` class.
   - `GeminiProvider` (uses `@google/genai`).
   - `OpenAIProvider` (uses `openai`).
   - `OllamaProvider` (uses native `fetch` to `localhost:11434`).
4. **2-Pass Revalidation Engine:**
   - **Pass 1:** Extract bugs from diff.
   - **Pass 2:** Re-evaluate Pass 1 findings to drop false positives and nitpicks.
5. **Terminal UX:** Uses `ora` for loading states and `cli-table3` + `chalk` to render beautiful, color-coded terminal tables (Red = Critical, Yellow = Medium).

## Directory Structure
```text
ai-reviewer/
├── bin/
│   └── index.js             # CLI entry point (commander)
├── src/
│   ├── config/
│   │   └── configManager.js # Handles ~/.ai-reviewer-config.json
│   ├── git/
│   │   └── diffParser.js    # child_process diff & parse-diff
│   ├── providers/
│   │   ├── providerFactory.js
│   │   ├── baseProvider.js
│   │   ├── geminiProvider.js
│   │   ├── openaiProvider.js
│   │   └── ollamaProvider.js
│   ├── ai/
│   │   └── reviewEngine.js  # Implements the 2-pass pipeline
│   └── ui/
│       └── renderer.js      # ora spinners and cli-table3
├── package.json
└── README.md

## Step-by-Step Implementation Plan

Agent: You must stop after each step and wait for user confirmation.

Step 1: Implement src/config/configManager.js and wire up the review init command in bin/index.js using commander and standard readline (or a lightweight prompt) to ask for the provider and API key.

Step 2: Implement src/git/diffParser.js to run and parse the git diff.

Step 3: Implement the Provider Factory (src/providers/). Write the BaseProvider, GeminiProvider, OpenAIProvider, and OllamaProvider. Ensure they all return the exact same JSON schema.

Step 4: Implement src/ai/reviewEngine.js. Write the exact system prompts for Pass 1 (Draft) and Pass 2 (Revalidation).

Step 5: Implement src/ui/renderer.js. Write the logic to take the final JSON and format it into a color-coded terminal table.

Step 6: Wire everything together in bin/index.js for the main review command. Add error handling and test the end-to-end flow.
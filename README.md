# Safety-aware autonomous AI

[![Open in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/5aurabh19/safety-aware-autonomous-ai/blob/main/Safety_Aware_Autonomous_AI.ipynb)

Run the [Safety-Aware Autonomous AI notebook](Safety_Aware_Autonomous_AI.ipynb) in Google Colab or Jupyter for a guided case-study exercise.

A responsive decision-support app for classifying industrial operational decisions. The classification is advisory: this application cannot trigger equipment actions and does not replace qualified safety, legal, or engineering review.

## Run locally

```sh
npm install
cp .env.example .env
npm run dev
```

Open the URL printed by the dev server (normally http://localhost:5173). The app and API run together on one local port. If that port is already occupied, the server selects the next available port and prints it. Without an API key, the exercise demonstrates its conservative fallback. Add a valid `OPENAI_API_KEY` to `.env` to enable model assessments.

For a production build, run `npm run build` and then `npm start`; the server serves the built client and the API on port 8787.

## Model integration

The default is OpenAI `gpt-4.1-mini` via the Responses API, with strict JSON Schema output. Change `AI_PROVIDER` and `AI_MODEL` through environment variables. For an OpenAI-compatible provider, set `AI_PROVIDER`, `AI_BASE_URL`, and `AI_API_KEY`. The server validates every response with Zod and returns a conservative fallback if the provider is not configured, unavailable, or returns invalid output. API keys are read only by the server and must never use a `VITE_` prefix.

The integration uses structured output rather than a tool call because this classifier needs to produce an assessment only. The model supports tool calling for future, separately reviewed integrations; no equipment-control tool is defined here.

## Audit records

The API appends timestamped assessment records to `outputs/.safety-aware-audit/audit.jsonl`, including the submitted decision, provider/model, result, and whether the model or fallback produced it. Keep access to this file restricted and apply the site's retention policy before using the app with operational or sensitive data.

## Safety boundary

Treat all model output as a recommendation for discussion. Site procedures, engineered interlocks, qualified staff, and applicable regulatory requirements remain authoritative. The fallback routes explicit high-consequence signals to **never delegate** and otherwise requires human approval.

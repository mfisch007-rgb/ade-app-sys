# ADE ORACLE — EXTERNAL INTELLIGENCE OPTIONS

Research note (no installation, no keys, no wiring beyond the 4 already-wired gateway providers).
Researched 2026-09-12 from official provider docs. Quotas change — verify at the linked docs before promising anything.

## Wired today (UniversalAIGateway, provider-neutral cascade + lexical fallback)

| Provider | Capability | Legitimate free tier | Current limitations (verify live docs) | Best Oracle use | Privacy | Lock-in |
|---|---|---|---|---|---|---|
| Gemini (`GEMINI_API_KEY`) | Reasoning, vision, embeddings | Free tier, Flash/Flash-Lite models, no card | Flash-Lite ~30 RPM/1.5K RPD/1M TPM; Flash ~15 RPM; Pro free ~50 RPD, paywalled Apr 2026; monthly spend caps | Primary reasoning fallback | Google DPA review before customer PII | LOW |
| Groq (`GROQ_API_KEY`) | Reasoning, Whisper STT | Free $0, no card, per-model org limits | ~30 RPM / ~6–12K TPM / ~1K RPD per model; audio seconds-capped | Low-latency reasoning + transcription | Review DPA before PII | LOW (OpenAI-compat) |
| DeepSeek (`DEEPSEEK_API_KEY`) | Reasoning | Trial/promo credits; treat as paid | Paid tiers, low $/M | Cost-efficient reasoning | Residency review | LOW |
| Qwen DashScope (`QWEN_API_KEY`) | Reasoning, vision | Trial credits; treat as paid | Paid tiers, regional variance | Multilingual alternate | Residency review | LOW |

Docs: `https://ai.google.dev/gemini-api/docs/rate-limits`, `https://ai.google.dev/gemini-api/docs/billing`, `https://console.groq.com/docs/rate-limits`.

## Available but unconfigured (catalogued in `src/ai/ProviderCatalog.js`, NOT wired, no keys)

| Provider | Capability | Free tier | Limitations | Best use | Privacy | Lock-in |
|---|---|---|---|---|---|---|
| OpenRouter (`OPENROUTER_API_KEY`) | Reasoning/vision breadth | Some `:free` models + new-account credits | Per-model quotas/credit burn; free-model logging may differ | Exotic-model fallback without N accounts | Aggregator = extra subprocessor | MEDIUM |
| Cerebras (`CEREBRAS_API_KEY`) | Fast reasoning | Documented free tier, rate-limited | Verify current quotas | Speed alternate | US-hosted review | LOW |
| Hugging Face (`HF_TOKEN`) | Text/embeddings/vision/speech/rerank | Serverless credits + free CPU Spaces | Credit/rate-limited; per-model licences (some non-commercial) | Specialists + open breadth | Varies by route | LOW |
| Cloudflare Workers AI (`CLOUDFLARE_API_TOKEN`) | Text/embeddings/vision | Workers free-plan neurons/day | Daily neuron caps | Edge-adjacent inference | Edge locality | MEDIUM |

## Specialists (use via the above, not separate vendors where possible)

Embeddings (Gemini/HF/CF) → knowledge lift. Rerank (HF/Cohere-via-OpenRouter) → findings ranking.
Vision (Gemini/HF) → document/photo intake. OCR (vision models + Tesseract-local) → ledger/invoice capture.
Speech (Groq Whisper/HF) → meeting intake. Summarization → reasoning models. Web/research → PublicDiscovery + PublicDataRegistry (no scraping).

## Local models

Managed on-demand only (`src/ai/LocalProvider.js`): `NOT_CONFIGURED` default, `UNAVAILABLE_SERVERLESS` on Vercel, `AVAILABLE_OPERATOR_NODE` only with operator-set `ADE_LOCAL_AI_COMMAND`. Never `ONLINE` unless a managed handshake succeeds. No babysitting: spawn → health → request → timeout → release.

## Rules carried forward

No quota bypass, no session extraction, no restriction evasion, no hidden paid dependency, no key in repo, provider-neutral cascade preserved, deterministic fallback unchanged.

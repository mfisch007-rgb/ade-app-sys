/**
 * ADE PROVIDER CATALOG — researched external intelligence options (expansion batch).
 *
 * Records legitimate free/low-cost options WITHOUT wiring credentials.
 * The canonical live path stays UniversalAIGateway (4 wired providers).
 * Entries marked AVAILABLE_BUT_UNCONFIGURED require an operator key;
 * nothing here implies connectivity. Quotas change — verify at provider docs.
 * Researched 2026-09-12 from official docs (Gemini rate-limits/billing pages,
 * Groq rate-limits/pricing pages).
 */

export const PROVIDER_KINDS = Object.freeze(["REASONING", "KNOWLEDGE", "PERCEPTION", "DATA"]);

export const PROVIDER_CATALOG = Object.freeze([
  {
    id: "gemini", name: "Google Gemini API", kind: "REASONING",
    status: "WIRED_VIA_GATEWAY", envKey: "GEMINI_API_KEY",
    freeTier: "Free tier for Flash/Flash-Lite models (account required, no card for free).",
    limits: "Flash-Lite ~30 RPM / 1,500 RPD / 1M TPM; Flash ~15 RPM / 1,500 RPD; Pro free heavily restricted (50 RPD) — verify ai.google.dev rate-limits.",
    modalities: ["text", "vision", "embeddings"],
    commercial: "Allowed per ToS; billing tiers + monthly spend caps; Pro behind paywall since Apr 2026.",
    privacy: "Google data processing terms apply; review retention settings before customer PII.",
    cardRequired: false, accountRequired: true, lockIn: "LOW (OpenAI-compatible patterns portable)",
    oracleUse: "Primary reasoning fallback when keyed (already wired)."
  },
  {
    id: "groq", name: "Groq (LPU inference)", kind: "REASONING",
    status: "WIRED_VIA_GATEWAY", envKey: "GROQ_API_KEY",
    freeTier: "Free $0 tier, no card; per-model org limits.",
    limits: "Typical 30 RPM / ~6-12K TPM / ~1K RPD per model (e.g., Llama 3.3 70B); Whisper audio seconds-capped — verify console.groq.com/docs/rate-limits.",
    modalities: ["text", "speech-to-text (Whisper)"],
    commercial: "Allowed; Developer pay-go lifts limits ~10x.",
    privacy: "US-hosted inference; review DPA before customer PII.",
    cardRequired: false, accountRequired: true, lockIn: "LOW (OpenAI-compatible endpoint)",
    oracleUse: "Low-latency reasoning + transcription when keyed (already wired)."
  },
  {
    id: "openrouter", name: "OpenRouter (model aggregator)", kind: "REASONING",
    status: "AVAILABLE_BUT_UNCONFIGURED", envKey: "OPENROUTER_API_KEY",
    freeTier: "Some :free models + new-account credits; varies by model.",
    limits: "Per-model free quotas + credit burn; rate limits vary — verify openrouter.ai/docs.",
    modalities: ["text", "vision (model-dependent)"],
    commercial: "Allowed; watch per-model terms; free models may have logging/retention differences.",
    privacy: "Aggregator = extra subprocessor; review per-model routing before PII.",
    cardRequired: false, accountRequired: true, lockIn: "MEDIUM (aggregator convenience vs direct-provider portability)",
    oracleUse: "Breadth fallback: exotic models without per-provider accounts."
  },
  {
    id: "cerebras", name: "Cerebras Inference", kind: "REASONING",
    status: "AVAILABLE_BUT_UNCONFIGURED", envKey: "CEREBRAS_API_KEY",
    freeTier: "Documented free tier with rate limits; verify current quotas.",
    limits: "Rate-limited free tier; paid Developer lifts — verify cerebras.ai docs.",
    modalities: ["text"],
    commercial: "Allowed per ToS.",
    privacy: "US-hosted; review DPA before customer PII.",
    cardRequired: false, accountRequired: true, lockIn: "LOW (OpenAI-compatible)",
    oracleUse: "Fast reasoning alternate when keyed."
  },
  {
    id: "huggingface", name: "Hugging Face Inference Providers", kind: "REASONING",
    status: "AVAILABLE_BUT_UNCONFIGURED", envKey: "HF_TOKEN",
    freeTier: "Serverless inference credits for PRO + limited free calls; Spaces free CPU.",
    limits: "Credit/rate-limited; open-weight breadth — verify huggingface.co/docs.",
    modalities: ["text", "embeddings", "vision", "speech", "rerank (select models)"],
    commercial: "Model licences vary (some non-commercial); check per-model card.",
    privacy: "Varies by provider route; prefer dedicated inference for PII.",
    cardRequired: false, accountRequired: true, lockIn: "LOW (open weights portable)",
    oracleUse: "Embeddings/rerank/vision/speech specialists + open-model breadth."
  },
  {
    id: "cloudflare-workers-ai", name: "Cloudflare Workers AI", kind: "REASONING",
    status: "AVAILABLE_BUT_UNCONFIGURED", envKey: "CLOUDFLARE_API_TOKEN",
    freeTier: "Workers free plan includes limited Workers AI neurons/day.",
    limits: "Daily neuron caps; account-bound — verify developers.cloudflare.com.",
    modalities: ["text", "embeddings", "vision"],
    commercial: "Allowed per plan; edge locality benefits.",
    privacy: "Edge execution; review data-locality needs.",
    cardRequired: false, accountRequired: true, lockIn: "MEDIUM (Workers coupling)",
    oracleUse: "Edge-adjacent inference where ADE already sits behind Workers/CDN."
  },
  {
    id: "deepseek", name: "DeepSeek API", kind: "REASONING",
    status: "WIRED_VIA_GATEWAY", envKey: "DEEPSEEK_API_KEY",
    freeTier: "Low-cost paid API; occasional promo credits — treat as paid.",
    limits: "Paid rate limits by tier — verify platform.deepseek.com.",
    modalities: ["text"],
    commercial: "Allowed; low $/M pricing.",
    privacy: "Review data residency before customer PII.",
    cardRequired: true, accountRequired: true, lockIn: "LOW (OpenAI-compatible)",
    oracleUse: "Cost-efficient reasoning when keyed (already wired)."
  },
  {
    id: "qwen", name: "Alibaba Qwen (DashScope)", kind: "REASONING",
    status: "WIRED_VIA_GATEWAY", envKey: "QWEN_API_KEY",
    freeTier: "Trial credits for new accounts; otherwise paid.",
    limits: "Paid tiers — verify DashScope docs.",
    modalities: ["text", "vision (model-dependent)"],
    commercial: "Allowed; regional availability varies.",
    privacy: "Review residency (multi-region) before customer PII.",
    cardRequired: true, accountRequired: true, lockIn: "LOW (OpenAI-compatible)",
    oracleUse: "Multilingual/regional alternate when keyed (already wired)."
  }
]);

export function getProviderEntry(id) {
  return PROVIDER_CATALOG.find((p) => p.id === id) || null;
}

export function wiredProviders() {
  return PROVIDER_CATALOG.filter((p) => p.status === "WIRED_VIA_GATEWAY");
}

export function unconfiguredProviders() {
  return PROVIDER_CATALOG.filter((p) => p.status === "AVAILABLE_BUT_UNCONFIGURED" && !process.env[p.envKey]);
}

export default { PROVIDER_CATALOG, PROVIDER_KINDS, getProviderEntry, wiredProviders, unconfiguredProviders };

import { URL } from "node:url";

const PROVIDER_DEFINITIONS = [
  {
    id: "IQ_OPTION",
    label: "IQ Option",
    url: "https://iqoption.com/en/login",
    origins: ["iqoption.com", "auth.iqoption.com", "eu.iqoption.com"]
  },
  {
    id: "POCKET_OPTION",
    label: "Pocket Option",
    url: "https://pocketoption.com/en/login",
    origins: ["pocketoption.com"]
  },
  {
    id: "EXPERT_OPTION",
    label: "Expert Option",
    url: "https://expertoption.com/en/login",
    origins: ["expertoption.com"]
  },
  {
    id: "DERIV",
    label: "Deriv",
    url: "https://app.deriv.com/",
    origins: ["deriv.com"]
  },
  {
    id: "FBS",
    label: "FBS",
    url: "https://my.fbs.com/login",
    origins: ["fbs.com"]
  },
  {
    id: "SPORTYBET",
    label: "SportyBet",
    url: "https://www.sportybet.com/",
    origins: ["sportybet.com"]
  },
  {
    id: "SPRIBE_AVIATOR",
    label: "Aviator (Spribe)",
    url: "https://spribe.co/games/aviator",
    origins: ["spribe.co"]
  },
  {
    id: "BLANK",
    label: "Blank local page",
    url: "about:blank",
    origins: []
  }
];

export const BROWSER_PROVIDERS = Object.freeze(
  Object.fromEntries(
    PROVIDER_DEFINITIONS.map((provider) => [
      provider.id,
      Object.freeze({
        ...provider,
        origins: Object.freeze([...provider.origins])
      })
    ])
  )
);

export function listBrowserProviders() {
  return Object.values(BROWSER_PROVIDERS).map((provider) => ({
    id: provider.id,
    label: provider.label,
    url: provider.url,
    origins: [...provider.origins]
  }));
}

export function getBrowserProvider(id) {
  return BROWSER_PROVIDERS[String(id || "").trim().toUpperCase()] || null;
}

function hostMatches(hostname, allowedOrigin) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  const allowed = String(allowedOrigin || "").toLowerCase().replace(/^\./, "");
  return host === allowed || host.endsWith(`.${allowed}`);
}

export function validateBrowserUrl(value, provider = null) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: false, code: "BROWSER_URL_REQUIRED" };
  if (raw === "about:blank") {
    if (provider && provider.id !== "BLANK") {
      return { ok: false, code: "BROWSER_URL_NOT_ALLOWED" };
    }
    return { ok: true, url: raw, origin: null };
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, code: "BROWSER_URL_INVALID" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, code: "BROWSER_URL_NOT_ALLOWED" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, code: "BROWSER_URL_NOT_ALLOWED" };
  }
  if (parsed.port && parsed.port !== "443") {
    return { ok: false, code: "BROWSER_URL_NOT_ALLOWED" };
  }

  const allowed = provider ? provider.origins : PROVIDER_DEFINITIONS.flatMap((item) => item.origins);
  if (!allowed.some((origin) => hostMatches(parsed.hostname, origin))) {
    return { ok: false, code: "BROWSER_URL_NOT_ALLOWED" };
  }

  return { ok: true, url: parsed.toString(), origin: parsed.origin };
}

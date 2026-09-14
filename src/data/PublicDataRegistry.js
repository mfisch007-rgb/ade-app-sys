/**
 * ADE PUBLIC DATA REGISTRY — provider-neutral free-data boundary (expansion batch).
 *
 * Pipeline: SOURCE → VALIDATE → NORMALIZE → CLASSIFY → KNOWLEDGE/CONTEXT
 * → ORACLE → GUARDIAN → DECISION. Every record carries provenance:
 * source, retrievedAt, dataType, confidence, license, freshness, provider,
 * query context. No scraping: documented no-key APIs only.
 */

export const DATA_SOURCE_CATALOG = Object.freeze([
  {
    id: "world-bank", name: "World Bank Open Data API", dataType: "ECONOMIC_STATISTICS",
    access: "GET https://api.worldbank.org/v2/...?format=json (no key)",
    freeLimit: "No key; fair-use rate limits", authRequired: false,
    commercialUse: "Allowed (CC BY-4.0 attribution)", rateLimit: "Fair use; cache aggressively",
    license: "CC BY-4.0", updateFrequency: "Annual/quarterly by indicator",
    reliability: "HIGH (official statistics)", privacyRisk: "NONE (aggregate public stats)",
    adeUse: "Country/sector economic context for opportunity assessment (e.g., NG/Africa).",
    safeNow: true
  },
  {
    id: "open-meteo", name: "Open-Meteo Weather API", dataType: "WEATHER_AGRI",
    access: "GET https://api.open-meteo.com/v1/forecast?... (no key)",
    freeLimit: "Generous no-key tier for non-commercial; commercial via subscription",
    authRequired: false, commercialUse: "Non-commercial free; commercial needs plan — verify",
    rateLimit: "Fair use", license: "CC BY-4.0 (model attribution)",
    updateFrequency: "Hourly model runs", reliability: "HIGH for forecast use",
    privacyRisk: "NONE (location query only; avoid PII in queries)",
    adeUse: "Agriculture/logistics context (rain, temperature windows).",
    safeNow: true
  },
  {
    id: "rest-countries", name: "REST Countries API", dataType: "GEO_REFERENCE",
    access: "GET https://restcountries.com/v3.1/... (no key)",
    freeLimit: "No-key fair use", authRequired: false,
    commercialUse: "Allowed; verify upstream terms", rateLimit: "Fair use",
    license: "MPL-2.0 (service)", updateFrequency: "As countries change",
    reliability: "MEDIUM-HIGH (community-maintained mirror of official data)",
    privacyRisk: "NONE",
    adeUse: "Country reference (region, currency, languages) for intake profiling.",
    safeNow: true
  },
  {
    id: "frankfurter", name: "Frankfurter FX Rates API", dataType: "MARKET_FX",
    access: "GET https://api.frankfurter.app/v1/... (no key)",
    freeLimit: "No-key fair use (open-source ECB mirror)", authRequired: false,
    commercialUse: "Allowed; ECB reference rates (open data)", rateLimit: "Fair use; cache daily",
    license: "Open data (ECB reference)", updateFrequency: "Daily (ECB business days)",
    reliability: "HIGH for reference FX (not tradable quotes)",
    privacyRisk: "NONE",
    adeUse: "Market context for FX reference rates (e.g., EUR/NGN proxies); never tradable pricing.",
    safeNow: true
  },
  {
    id: "reliefweb", name: "ReliefWeb Humanitarian API", dataType: "OPPORTUNITIES_INTEL",
    access: "GET https://api.reliefweb.int/v1/... (no key, appname param)",
    freeLimit: "No-key fair use", authRequired: false,
    commercialUse: "Allowed with attribution; verify ReliefWeb ToS",
    rateLimit: "Fair use; paginated",
    license: "Varies by content source; metadata open",
    updateFrequency: "Continuous (humanitarian updates)",
    reliability: "HIGH (UN OCHA operated)",
    privacyRisk: "NONE (public humanitarian metadata)",
    adeUse: "Grants/opportunities/sector signals for Africa/Nigeria (disasters, appeals, jobs, training).",
    safeNow: true
  },
  {
    id: "world-bank-projects", name: "World Bank Projects API", dataType: "PROCUREMENT_FUNDING",
    access: "GET https://search.worldbank.org/api/v3/projects?...&format=json (no key)",
    freeLimit: "No-key fair use", authRequired: false,
    commercialUse: "Allowed (CC BY-4.0 attribution)",
    rateLimit: "Fair use; cache aggressively",
    license: "CC BY-4.0", updateFrequency: "Continuous (project pipeline)",
    reliability: "HIGH (official procurement/funding pipeline)",
    privacyRisk: "NONE (public project metadata)",
    adeUse: "Funding/procurement pipeline for Nigeria/Africa (project status, sector, commitments).",
    safeNow: true
  }
]);

function nowIso() { return new Date().toISOString(); }

async function fetchJson(url, timeoutMs = 7000, fetchImpl = null) {
  const doFetch = fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

export class PublicDataRegistry {
  constructor({ fetchImpl = null, timeoutMs = 7000 } = {}) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  catalog() {
    return DATA_SOURCE_CATALOG.map((s) => ({ ...s }));
  }

  /**
   * Retrieve + normalize with provenance. Never throws for transport issues:
   * returns { ok:false, provenance, error } so Oracle can degrade honestly.
   */
  async retrieve(sourceId, params = {}) {
    const source = DATA_SOURCE_CATALOG.find((s) => s.id === sourceId);
    const retrievedAt = nowIso();
    if (!source) return { ok: false, provenance: this._prov(null, params, retrievedAt, 0), error: "Unknown data source." };
    try {
      const { url, normalize } = this._build(sourceId, params);
      const raw = await fetchJson(url, this.timeoutMs, this.fetchImpl);
      const records = normalize(raw);
      return {
        ok: true,
        source: source.id,
        records,
        provenance: this._prov(source, params, retrievedAt, 0.8, url)
      };
    } catch (e) {
      return { ok: false, source: source.id, records: [], provenance: this._prov(source, params, retrievedAt, 0), error: e?.message || String(e) };
    }
  }

  _prov(source, params, retrievedAt, confidence, url = null) {
    return {
      source: source?.id || "unknown",
      provider: source?.name || "unknown",
      retrievedAt,
      dataType: source?.dataType || "UNKNOWN",
      confidence,
      license: source?.license || "UNKNOWN",
      access: source ? "DOCUMENTED_PUBLIC_API" : "UNKNOWN",
      freshness: retrievedAt,
      query: params || {},
      endpoint: url ? url.split("?")[0] : null, // host+path only, no query echo
      classification: "EXTERNAL_PUBLIC_DATA"
    };
  }

  _build(sourceId, params) {
    if (sourceId === "frankfurter") {
      const base = String(params.base || "EUR").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "EUR";
      const symbols = String(params.symbols || "NGN,USD,GBP").toUpperCase().replace(/[^A-Z,]/g, "");
      const url = `https://api.frankfurter.app/v1/latest?base=${base}&symbols=${symbols}`;
      return {
        url,
        normalize: (raw) => [{ base: raw?.base || base, date: raw?.date || null, rates: raw?.rates || {}, note: "ECB reference rates; not tradable quotes." }]
      };
    }
    if (sourceId === "reliefweb") {
      const query = String(params.query || params.q || "Nigeria").slice(0, 120);
      const limit = Math.min(20, Math.max(1, Number(params.limit || 5)));
      const url = `https://api.reliefweb.int/v1/reports?appname=ADE-APEX&query[value]=${encodeURIComponent(query)}&limit=${limit}`;
      return {
        url,
        normalize: (raw) => {
          const rows = raw?.data || [];
          return rows.map((r) => ({ id: r?.id || null, title: r?.fields?.title || null, date: r?.fields?.date?.created || null, source: (r?.fields?.source || []).map((s) => s?.name).filter(Boolean).slice(0, 3), url: r?.fields?.url || null }));
        }
      };
    }
    if (sourceId === "world-bank-projects") {
      const country = String(params.country || "NG").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "NG";
      const rows = Math.min(20, Math.max(1, Number(params.rows || 5)));
      const url = `https://search.worldbank.org/api/v3/projects?format=json&countryshortname_exact=${country}&rows=${rows}`;
      return {
        url,
        normalize: (raw) => {
          const list = raw?.projects || raw?.project || [];
          const arr = Array.isArray(list) ? list : Object.values(list || {});
          return arr.slice(0, rows).map((p) => ({ id: p?.id || p?.projectid || null, title: p?.project_name || p?.title || null, status: p?.projectstatusdisplay || p?.status || null, sector: p?.sector || p?.mjsector1 || null, commitment: p?.commitmentamount ?? p?.lendprojectcost ?? null }));
        }
      };
    }
    if (sourceId === "world-bank") {
      const country = String(params.country || "NG").toUpperCase().replace(/[^A-Z]/g, "") || "NG";
      const indicator = String(params.indicator || "NY.GDP.MKTP.CD").replace(/[^A-Z0-9.]/gi, "");
      const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=5`;
      return {
        url,
        normalize: (raw) => {
          const rows = Array.isArray(raw) ? raw[1] : null;
          if (!Array.isArray(rows)) return [];
          return rows.filter(Boolean).map((r) => ({ date: r.date, value: r.value, indicator: r.indicator?.id || indicator, country: r.country?.id || country }));
        }
      };
    }
    if (sourceId === "open-meteo") {
      const lat = Number(params.latitude ?? 6.5244);
      const lon = Number(params.longitude ?? 3.3792);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=3`;
      return {
        url,
        normalize: (raw) => {
          const d = raw?.daily || {};
          return (d.time || []).map((t, i) => ({ date: t, tMax: d.temperature_2m_max?.[i] ?? null, tMin: d.temperature_2m_min?.[i] ?? null, precipMm: d.precipitation_sum?.[i] ?? null }));
        }
      };
    }
    // rest-countries
    const code = String(params.country || params.code || "NGA").replace(/[^A-Za-z]/g, "") || "NGA";
    return {
      url: `https://restcountries.com/v3.1/alpha/${code}?fields=name,region,subregion,currencies,languages,population,cca3`,
      normalize: (raw) => {
        const r = Array.isArray(raw) ? raw[0] : raw;
        if (!r) return [];
        return [{ name: r.name?.common || null, region: r.region || null, subregion: r.subregion || null, currencies: Object.keys(r.currencies || {}), languages: Object.values(r.languages || {}), population: r.population ?? null }];
      }
    };
  }
}

export default PublicDataRegistry;

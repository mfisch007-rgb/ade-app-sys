# ADE FREE DATA INTELLIGENCE

First-class Oracle input category (alongside AI models + internal data). Documented no-key public APIs only. No scraping.
Boundary: `src/data/PublicDataRegistry.js` — SOURCE → VALIDATE → NORMALIZE → CLASSIFY → KNOWLEDGE → ORACLE → GUARDIAN → DECISION, with provenance on every record.

## Integrated now (no key, provenance-tagged)

| Name | Data type | Access | Free limit | Auth | Commercial | Rate | License | Freshness | Reliability | Privacy | ADE use | Safe |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| World Bank Open Data | Economic statistics | `GET api.worldbank.org/v2/...?format=json` | Fair use, no key | No | Yes (attribution) | Fair use, cache | CC BY-4.0 | Annual/quarterly | HIGH | NONE | Country/sector context (NG/Africa) | YES |
| Open-Meteo | Weather/agri | `GET api.open-meteo.com/v1/forecast` | Generous no-key non-commercial | No | Non-commercial free; plan for commercial — verify | Fair use | CC BY-4.0 | Hourly | HIGH | NONE (no PII in query) | Agri/logistics windows | YES |
| REST Countries | Geo reference | `GET restcountries.com/v3.1/...` | Fair use, no key | No | Yes (verify upstream) | Fair use | MPL-2.0 | As changed | MED-HIGH | NONE | Intake profiling (region/currency/language) | YES |

## Researched, not yet integrated (documented APIs; each needs a small adapter + provenance mapping)

- **Procurement/grants:** national e-procurement portals + donor APIs (World Bank Procurement Notices, AfDB project data, UNGM) — high pilot value, fragmented auth/licences → integrate per-opportunity with A2MPro.
- **Public company info:** OpenCorporates (key for higher tiers), GLEIF LEI (no key, `api.gleif.org`) — GLEIF is the safer next adapter (open, no key).
- **Markets:** Stooq/Frankfurter (no key, `frankfurter.app` ECB FX), CoinGecko free (rate-limited) — Frankfurter next for FX context.
- **Statistics:** UN Data API, WHO OData, FAO FAOSTAT — strong for sector context; SDMX complexity → wrap narrowly.
- **Agri:** NASA POWER (no key) for agro-climate series — natural sibling to Open-Meteo.
- **Geospatial/economic:** OSM Nominatim (strict usage policy, cache + attribution), Natural Earth datasets (public domain) for offline boundary data.

## Rules

Cache aggressively, attribute licences, never put PII in queries, degrade honestly (`ok:false` + provenance + error → Oracle marks confidence 0), Guardian/Decision authority unchanged.

/**
 * Supabase/Postgres durable storage adapter for ADE.
 *
 * Implements the canonical `StorageProvider` contract so production
 * operational state (runtime config, cases, audit events, capability
 * state) can be persisted against a durable external provider without a
 * second kernel or parallel persistence authority.
 *
 * This adapter is provider-neutral at the interface boundary: consumers
 * depend only on `StorageProvider`. Local development keeps using
 * `LocalStorageAdapter`; production selects this durable adapter through
 * environment configuration (see `createStorageProvider`).
 *
 * Security boundary:
 *  - No credentials are invented, committed or defaulted.
 *  - If required environment configuration is absent, every operation
 *    fails safely with a clear `STORAGE_NOT_CONFIGURED` boundary error
 *    rather than degrading to an insecure fallback.
 *  - The Supabase client is loaded lazily and only after configuration
 *    is confirmed present, so importing this module never requires the
 *    optional `@supabase/supabase-js` dependency to be installed.
 */

import StorageProvider from "./StorageProvider.js";
import LocalStorageAdapter from "./LocalStorageAdapter.js";

export class SupabaseStorageAdapter extends StorageProvider {
  constructor(config = {}) {
    super();
    // Canonical contract: SUPABASE_URL + key + SUPABASE_STORAGE_TABLE.
    // Key resolution order (newest first, all server-side only):
    //   SUPABASE_SECRET_KEY (current Supabase backend secret-key model)
    //   SUPABASE_SERVICE_ROLE_KEY (previous service_role model)
    //   SUPABASE_STORAGE_KEY (legacy alias used by ADE docs/tests)
    // Never defaulted, never committed, never exposed to client bundles.
    this.config = {
      url: config.url ?? process.env.SUPABASE_URL,
      key: config.key ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_STORAGE_KEY,
      table: config.table ?? process.env.SUPABASE_STORAGE_TABLE
    };
    this._client = null;
    this._clientPromise = null;
    this._restMode = false;
  }

  /**
   * True only when every required configuration value is present.
   * Exposed as a testable seam so the boundary is provable without a
   * live provider instance.
   */
  isConfigured() {
    const { url, key, table } = this.config;
    const isPlaceholder = (v) => !v || String(v).trim()==="[SENSITIVE]" || String(v).trim()==="[PRESENT]" || String(v).trim()==="";
    return Boolean(url && key && table && !isPlaceholder(url) && !isPlaceholder(key) && !isPlaceholder(table));
  }

  /**
   * Return the required-config boundary error, or null when configured.
   */
  configurationError() {
    if (this.isConfigured()) return null;
    const isPlaceholder = (v) => !v || String(v).trim()==="[SENSITIVE]" || String(v).trim()==="[PRESENT]" || String(v).trim()==="";
    const missing = [];
    if (isPlaceholder(this.config.url)) missing.push("SUPABASE_URL");
    if (isPlaceholder(this.config.key)) missing.push("SUPABASE_SECRET_KEY (aliases: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_KEY)");
    if (isPlaceholder(this.config.table)) missing.push("SUPABASE_STORAGE_TABLE");
    return new Error(
      `STORAGE_NOT_CONFIGURED: missing ${missing.join(", ")}`
    );
  }

  #assertConfigured() {
    const err = this.configurationError();
    if (err) throw err;
  }

  #client() {
    if (!this.isConfigured()) {
      throw this.configurationError();
    }
    if (this._client) return Promise.resolve(this._client);
    if (this._restMode) return Promise.resolve(null);
    if (this._clientPromise) return this._clientPromise;

    // Prefer the optional @supabase/supabase-js client when installed,
    // otherwise fall back to dependency-free PostgREST via native fetch.
    // Import failure must NOT throw at import time — it selects REST mode.
    this._clientPromise = import("@supabase/supabase-js").then(
      ({ createClient }) => {
        this._client = createClient(this.config.url, this.config.key);
        return this._client;
      }
    ).catch(() => {
      this._restMode = true;
      this._client = null;
      return null;
    });

    return this._clientPromise;
  }

  #restHeaders(extra = {}) {
    return {
      apikey: this.config.key,
      Authorization: `Bearer ${this.config.key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
      ...extra
    };
  }

  #restBase() {
    return `${String(this.config.url).replace(/\/$/, "")}/rest/v1/${this.config.table}`;
  }

  async #restGet(key) {
    const res = await fetch(`${this.#restBase()}?k=eq.${encodeURIComponent(key)}&select=k,v`, {
      headers: this.#restHeaders()
    });
    if (!res.ok) throw new Error(`SUPABASE_STORAGE_READ_FAILED: HTTP ${res.status}`);
    const rows = await res.json().catch(() => null);
    if (!Array.isArray(rows) || rows.length === 0) return undefined;
    return rows[0]?.v;
  }

  async #restSet(key, value) {
    const res = await fetch(this.#restBase(), {
      method: "POST",
      headers: this.#restHeaders({ Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify({ k: key, v: value })
    });
    if (!res.ok) throw new Error(`SUPABASE_STORAGE_WRITE_FAILED: HTTP ${res.status}`);
  }

  async #restDelete(key) {
    const res = await fetch(`${this.#restBase()}?k=eq.${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: this.#restHeaders()
    });
    if (!res.ok) throw new Error(`SUPABASE_STORAGE_DELETE_FAILED: HTTP ${res.status}`);
  }

  async #restList(prefix = "") {
    const q = prefix
      ? `?k=like.${encodeURIComponent(prefix)}*&select=k,v&order=k.asc`
      : `?select=k,v&order=k.asc`;
    const res = await fetch(`${this.#restBase()}${q}`, { headers: this.#restHeaders() });
    if (!res.ok) throw new Error(`SUPABASE_STORAGE_LIST_FAILED: HTTP ${res.status}`);
    const rows = await res.json().catch(() => []);
    return (Array.isArray(rows) ? rows : []).map((row) => ({ key: row.k, value: row.v }));
  }

  async get(key, defaultValue = null) {
    this.#assertConfigured();
    const client = await this.#client();
    if (!client) {
      const v = await this.#restGet(key);
      return v !== undefined && v !== null ? v : defaultValue;
    }
    const { data, error } = await client
      .from(this.config.table)
      .select("v")
      .eq("k", key)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`SUPABASE_STORAGE_READ_FAILED: ${error.message}`);
    }

    return data?.v !== undefined && data?.v !== null ? data.v : defaultValue;
  }

  async set(key, value) {
    this.#assertConfigured();
    const client = await this.#client();
    if (!client) {
      await this.#restSet(key, value);
      return value;
    }
    const { error } = await client
      .from(this.config.table)
      .upsert({ k: key, v: value });

    if (error) {
      throw new Error(`SUPABASE_STORAGE_WRITE_FAILED: ${error.message}`);
    }
    return value;
  }

  async delete(key) {
    this.#assertConfigured();
    const client = await this.#client();
    if (!client) {
      await this.#restDelete(key);
      return true;
    }
    const { error } = await client
      .from(this.config.table)
      .delete()
      .eq("k", key);

    if (error) {
      throw new Error(`SUPABASE_STORAGE_DELETE_FAILED: ${error.message}`);
    }
    return true;
  }

  async list(prefix = "") {
    this.#assertConfigured();
    const client = await this.#client();
    if (!client) return this.#restList(prefix);

    let query = client
      .from(this.config.table)
      .select("k,v")
      .order("k", { ascending: true });

    if (prefix) {
      query = query.like("k", `${prefix}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`SUPABASE_STORAGE_LIST_FAILED: ${error.message}`);
    }

    return (data || []).map((row) => ({ key: row.k, value: row.v }));
  }

  async append(key, value) {
    const current = await this.get(key, []);
    const next = Array.isArray(current) ? [...current, value] : [value];
    await this.set(key, next);
    return value;
  }

  async transaction(callback) {
    this.#assertConfigured();
    if (typeof callback !== "function") {
      throw new Error("Storage transaction callback is required.");
    }
    const started = await this.get("__tx_started__", false);
    if (started) {
      throw new Error("NESTED_STORAGE_TRANSACTION");
    }
    await this.set("__tx_started__", true);
    const tx = {
      get: async (k, d = null) => this.get(k, d),
      set: async (k, v) => this.set(k, v),
      delete: async (k) => this.delete(k),
      list: async (prefix = "") => this.list(prefix)
    };
    try {
      const result = await callback(tx);
      await this.delete("__tx_started__");
      return result;
    } catch (error) {
      await this.delete("__tx_started__").catch(() => {});
      throw error;
    }
  }
}

/**
 * Canonical storage factory.
 *
 * Selects a durable adapter when a provider is configured and otherwise
 * returns the local/development filesystem adapter. This keeps local
 * development fully functional without a live Supabase instance while
 * allowing production to opt into durable persistence via configuration
 * (no code change, no second kernel).
 */
export function createStorageProvider(options = {}) {
  const provider = String(
    options.provider ?? process.env.ADE_STORAGE_PROVIDER ?? "local"
  ).trim().toLowerCase();

  if (provider === "local") {
    return new LocalStorageAdapter(options.filePath);
  }

  if (provider === "supabase") {
    return new SupabaseStorageAdapter();
  }

  throw new Error(
    `UNKNOWN_STORAGE_PROVIDER: ${provider} (expected "local" or "supabase")`
  );
}

export default SupabaseStorageAdapter;

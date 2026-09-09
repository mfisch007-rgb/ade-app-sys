/**
 * Provider-backed document storage adapter.
 *
 * Implements the synchronous `DocumentStorageProvider` contract over the
 * asynchronous, provider-neutral `StorageProvider` contract. This is what
 * makes durable persistence (e.g. Supabase) usable by the canonical
 * runtime: `RuntimeConfigStore` and the case store keep their sync
 * read/write contract while the durable provider owns the authoritative
 * copy.
 *
 * Boot semantics:
 * - `hydrate()`/`whenHydrated()` loads the authoritative document at boot.
 *   The server boot path awaits hydration before serving, so the loaded
 *   document is never overwritten by a boot-time default.
 * - Writes issued before hydration completes are buffered and flushed only
 *   after the authoritative document is loaded, so no in-flight write is
 *   lost. They are serialized through a single write queue per adapter.
 */
import DocumentStorageProvider from "./DocumentStorageProvider.js";

function clone(value, fallback) {
  const source = value === undefined ? fallback : value;
  try {
    return structuredClone(source);
  } catch {
    return JSON.parse(JSON.stringify(source));
  }
}

export class ProviderDocumentStorageAdapter extends DocumentStorageProvider {
  constructor({
    provider,
    key = "runtime-config:admin.json",
    defaultValue = {}
  } = {}) {
    super();
    if (!provider) {
      throw new Error(
        "ProviderDocumentStorageAdapter requires a StorageProvider."
      );
    }
    this.provider = provider;
    this.key = key;
    this.defaultValue = defaultValue;
    this._cache = null;
    this._hydrated = false;
    this._queuedBeforeHydration = [];
    this._writeQueue = Promise.resolve();
    this._hydratePromise = this.#hydrate();
  }

  async #hydrate() {
    try {
      const stored = await this.provider.get(this.key);
      this._cache = clone(stored, this.defaultValue);
    } catch {
      this._cache = clone(this.defaultValue, this.defaultValue);
    }
    this._hydrated = true;

    const queued = this._queuedBeforeHydration.splice(0);
    for (const value of queued) {
      await this.#persist(value);
    }
    return this._cache;
  }

  whenHydrated() {
    return this._hydratePromise;
  }

  #persist(value) {
    this._writeQueue = this._writeQueue
      .then(async () => {
        await this.provider.set(this.key, value);
      })
      .catch(() => {});
    return this._writeQueue;
  }

  readSync(defaultValue = this.defaultValue) {
    if (this._cache === null) return clone(defaultValue, this.defaultValue);
    return clone(this._cache, this.defaultValue);
  }

  writeSync(value) {
    const doc = clone(value, this.defaultValue);
    this._cache = doc;

    if (this._hydrated) {
      this.#persist(doc);
    } else {
      this._queuedBeforeHydration.push(doc);
    }

    return doc;
  }

  async read(defaultValue = this.defaultValue) {
    if (!this._hydrated) await this.whenHydrated();
    return this.readSync(defaultValue);
  }

  async write(value) {
    const doc = this.writeSync(value);
    if (!this._hydrated) await this.whenHydrated();
    await this._writeQueue;
    return doc;
  }
}

export default ProviderDocumentStorageAdapter;
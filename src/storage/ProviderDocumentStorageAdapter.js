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
 * - Hydration or write failure is recorded and surfaced. The server boot
 *   path rejects instead of serving a default empty document.
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
    this._hydrationError = null;
    this._lastReadError = null;
    this._lastWriteError = null;
    this._queuedBeforeHydration = [];
    this._writeQueue = Promise.resolve();
    this._hydratePromise = this.#hydrate();
  }

  async #loadAuthoritative() {
    try {
      const stored = await this.provider.get(this.key);
      this._cache = clone(stored, this.defaultValue);
      this._hydrated = true;
      this._hydrationError = null;
      this._lastReadError = null;
      return this._cache;
    } catch (error) {
      this._lastReadError = error;
      if (!this._hydrated) {
        this._cache = null;
        this._hydrationError = error;
      }
      throw error;
    }
  }

  async #drainQueuedWrites() {
    const queued = this._queuedBeforeHydration.splice(0);
    for (let index = 0; index < queued.length; index += 1) {
      try {
        await this.#enqueuePersist(queued[index]);
      } catch (error) {
        // Keep the failed snapshot and everything after it; a later strict
        // refresh must be able to retry instead of silently dropping writes.
        this._queuedBeforeHydration.unshift(...queued.slice(index));
        this._lastWriteError = error;
        throw error;
      }
    }
  }

  async #hydrate() {
    await this.#loadAuthoritative();
    await this.#drainQueuedWrites();
    return this._cache;
  }

  async #ensureHydrated() {
    if (this._hydrated) return;
    try {
      await this._hydratePromise;
    } catch (error) {
      if (!this._hydrated) throw this._hydrationError || error;
    }
  }

  whenHydrated() {
    return this._hydratePromise;
  }

  isHydrated() {
    return this._hydrated === true;
  }

  isHealthy() {
    return this._hydrated === true && !this._hydrationError && !this._lastReadError && !this._lastWriteError;
  }

  lastReadError() {
    return this._lastReadError || null;
  }

  lastError() {
    return this._hydrationError || this._lastReadError || this._lastWriteError || null;
  }

  // Re-pull the authoritative remote document into the local cache.
  // The sync read contract intentionally serves cache (serverless-safe);
  // callers that need cross-instance freshness (case lists, notification
  // feeds) await this first. Never throws — callers fall back to cache.
  async refresh() {
    try {
      await this.refreshStrict();
    } catch {}
    return this._cache;
  }

  async refreshStrict() {
    await this.#loadAuthoritative();
    await this.#drainQueuedWrites();
    this._lastWriteError = null;
    return this._cache;
  }

  #enqueuePersist(value) {
    const operation = this._writeQueue.then(async () => {
      await this.provider.set(this.key, value);
    });
    this._writeQueue = operation.catch(() => {});
    return operation;
  }

  readSync(defaultValue = this.defaultValue) {
    if (this._hydrationError) throw this._hydrationError;
    if (this._cache === null) return clone(defaultValue, this.defaultValue);
    return clone(this._cache, this.defaultValue);
  }

  writeSync(value) {
    if (this._hydrationError) throw this._hydrationError;
    if (this._lastReadError) throw this._lastReadError;
    if (this._lastWriteError) throw this._lastWriteError;
    const doc = clone(value, this.defaultValue);
    this._cache = doc;

    if (this._hydrated) {
      const operation = this.#enqueuePersist(doc);
      operation.catch((error) => {
        this._lastWriteError = error;
      });
    } else {
      this._queuedBeforeHydration.push(doc);
    }

    return doc;
  }

  async flush() {
    await this.#ensureHydrated();
    await this._writeQueue;
    if (this._lastWriteError) throw this._lastWriteError;
    return true;
  }

  async read(defaultValue = this.defaultValue) {
    await this.#ensureHydrated();
    return this.readSync(defaultValue);
  }

  async write(value) {
    await this.#ensureHydrated();
    if (this._hydrationError) throw this._hydrationError;
    if (this._lastReadError) throw this._lastReadError;
    const doc = clone(value, this.defaultValue);
    this._cache = doc;
    const operation = this.#enqueuePersist(doc);
    try {
      await operation;
      this._lastWriteError = null;
      return doc;
    } catch (error) {
      try {
        await this.refreshStrict();
      } catch {}
      this._lastWriteError = error;
      throw error;
    }
  }
}

export default ProviderDocumentStorageAdapter;

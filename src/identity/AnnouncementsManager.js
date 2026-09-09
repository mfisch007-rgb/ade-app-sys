import crypto from "node:crypto";

const STORE_KEY = "ade:announcements:v1";
const ALLOWED_KINDS = ["NEWS", "BULLETIN", "ANNOUNCEMENT", "ADVERT"];

export class AnnouncementsManager {
  constructor({ store, eventBus = null } = {}) {
    if (!store) {
      throw new Error("AnnouncementsManager requires a StorageProvider.");
    }
    this.store = store;
    this.eventBus = eventBus;
    this.#state = null;
    this.#ready = null;
  }

  #state = null;
  #ready = null;

  #audit(type, payload = {}) {
    try {
      this.eventBus?.publish?.("SECURITY_EVENT", { type, ...payload });
    } catch {}
  }

  async initialize() {
    if (this.#ready) return this.#ready;
    this.#ready = (async () => {
      let state;
      try {
        state = await this.store.get(STORE_KEY, null);
      } catch {
        state = null;
      }
      if (state === null) {
        state = { announcements: [] };
      }
      if (typeof state !== "object" || !Array.isArray(state.announcements)) {
        throw new Error("ANNOUNCEMENT_STORE_CORRUPT");
      }
      this.#state = state;
      return this;
    })();
    return this.#ready;
  }

  whenReady() {
    return this.#ready || this.initialize();
  }

  async #persist() {
    await this.store.set(STORE_KEY, this.#state);
  }

  #assertKind(kind) {
    const normalized = String(kind || "").toUpperCase();
    if (!ALLOWED_KINDS.includes(normalized)) {
      throw new Error(`ANNOUNCEMENT_KIND_INVALID: ${normalized}`);
    }
    return normalized;
  }

  async create({ kind, title, body = "", link = "", active = true, expiresAt = null, createdBy = null } = {}) {
    await this.whenReady();
    const normalizedKind = this.#assertKind(kind);
    if (typeof title !== "string" || title.trim().length < 3) {
      throw new Error("ANNOUNCEMENT_TITLE_REQUIRED");
    }
    const id = crypto.randomUUID().slice(0, 8).toUpperCase();
    const now = new Date().toISOString();
    const entry = {
      id,
      kind: normalizedKind,
      title: title.trim(),
      body: typeof body === "string" ? body.trim() : "",
      link: typeof link === "string" ? link.trim() : "",
      active: Boolean(active),
      expiresAt: expiresAt ? new Date(expiresAt).getTime() : null,
      createdBy: createdBy || null,
      createdAt: now,
      updatedAt: now
    };
    this.#state.announcements.push(entry);
    await this.#persist();
    this.#audit("ANNOUNCEMENT_CREATED", { id, kind: normalizedKind, createdBy });
    return { ...entry };
  }

  async update(id, patch = {}, actorId = null) {
    await this.whenReady();
    const entry = this.#state.announcements.find((a) => a.id === id);
    if (!entry) throw new Error("ANNOUNCEMENT_NOT_FOUND");
    if (patch.kind !== undefined) entry.kind = this.#assertKind(patch.kind);
    if (typeof patch.title === "string") {
      if (patch.title.trim().length < 3) throw new Error("ANNOUNCEMENT_TITLE_REQUIRED");
      entry.title = patch.title.trim();
    }
    if (typeof patch.body === "string") entry.body = patch.body.trim();
    if (typeof patch.link === "string") entry.link = patch.link.trim();
    if (patch.active !== undefined) entry.active = Boolean(patch.active);
    if (patch.expiresAt !== undefined) {
      entry.expiresAt = patch.expiresAt ? new Date(patch.expiresAt).getTime() : null;
    }
    entry.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("ANNOUNCEMENT_UPDATED", { id, actorId });
    return { ...entry };
  }

  async remove(id, actorId = null) {
    await this.whenReady();
    const idx = this.#state.announcements.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error("ANNOUNCEMENT_NOT_FOUND");
    const [removed] = this.#state.announcements.splice(idx, 1);
    await this.#persist();
    this.#audit("ANNOUNCEMENT_REMOVED", { id, actorId });
    return { id: removed.id };
  }

  async #listRaw() {
    await this.whenReady();
    return [...this.#state.announcements].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt)
    );
  }

  async list(includeInactive = false) {
    await this.whenReady();
    const now = Date.now();
    return (await this.#listRaw()).filter(
      (a) =>
        includeInactive ||
        (a.active && (a.expiresAt === null || a.expiresAt > now))
    );
  }

  async stats() {
    const all = await this.#listRaw();
    return {
      total: all.length,
      active: all.filter((a) => a.active).length,
      news: all.filter((a) => a.kind === "NEWS").length,
      bulletins: all.filter((a) => a.kind === "BULLETIN").length,
      announcements: all.filter((a) => a.kind === "ANNOUNCEMENT").length,
      adverts: all.filter((a) => a.kind === "ADVERT").length
    };
  }
}

export default AnnouncementsManager;
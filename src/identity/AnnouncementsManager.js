import crypto from "node:crypto";

const STORE_KEY = "ade:announcements:v1";
const ALLOWED_KINDS = ["NEWS", "BULLETIN", "ANNOUNCEMENT", "ADVERT"];
export const MAX_ANNOUNCEMENT_IMAGE_BYTES = 1_500_000;
export const MAX_ANNOUNCEMENT_LINK_LENGTH = 2048;

const IMAGE_SIGNATURES = [
  {
    mimeType: "image/png",
    matches: (buffer) =>
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
  },
  {
    mimeType: "image/jpeg",
    matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  },
  {
    mimeType: "image/webp",
    matches: (buffer) =>
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
  }
];

function detectImageMime(buffer) {
  return IMAGE_SIGNATURES.find((signature) => signature.matches(buffer))?.mimeType || null;
}

function normalizeImage(image) {
  if (image == null || image === "") return null;
  if (typeof image !== "object" || Array.isArray(image)) {
    throw new Error("ANNOUNCEMENT_IMAGE_INVALID");
  }
  const dataUrl = String(image.dataUrl || "").trim();
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error("ANNOUNCEMENT_IMAGE_INVALID");
  let buffer;
  try {
    buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  } catch {
    throw new Error("ANNOUNCEMENT_IMAGE_INVALID");
  }
  if (!buffer.length) throw new Error("ANNOUNCEMENT_IMAGE_INVALID");
  if (buffer.length > MAX_ANNOUNCEMENT_IMAGE_BYTES) {
    throw new Error("ANNOUNCEMENT_IMAGE_TOO_LARGE");
  }
  const detected = detectImageMime(buffer);
  if (!detected || detected !== match[1]) {
    throw new Error("ANNOUNCEMENT_IMAGE_INVALID");
  }
  const alt = String(image.alt || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200);
  return {
    dataUrl: `data:${detected};base64,${buffer.toString("base64")}`,
    mimeType: detected,
    bytes: buffer.length,
    alt
  };
}

function normalizeContact(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (!/^\+?[\d\s().-]+$/.test(raw)) throw new Error("ANNOUNCEMENT_CONTACT_INVALID");
  const compact = raw.replace(/[\s().-]/g, "");
  if (!/^\+?\d{7,15}$/.test(compact)) throw new Error("ANNOUNCEMENT_CONTACT_INVALID");
  return compact.startsWith("+") ? compact : `+${compact}`;
}

function normalizeLink(value) {
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (raw.length > MAX_ANNOUNCEMENT_LINK_LENGTH) throw new Error("ANNOUNCEMENT_LINK_INVALID");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("ANNOUNCEMENT_LINK_INVALID");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("ANNOUNCEMENT_LINK_INVALID");
  }
  return parsed.toString();
}

function normalizeExpiry(value) {
  if (value == null || value === "") return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) throw new Error("ANNOUNCEMENT_EXPIRY_INVALID");
  return timestamp;
}

function announcementStatus(entry, now) {
  if (!entry.active) return "DRAFT";
  if (entry.expiresAt !== null && entry.expiresAt <= now) return "EXPIRED";
  return "PUBLIC";
}

function view(entry, now) {
  return {
    ...entry,
    status: announcementStatus(entry, now),
    contactVerified: false,
    contactSource: entry.contactNumber ? "FOUNDER_ENTERED" : null
  };
}

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

  async create({
    kind,
    title,
    body = "",
    link = "",
    image = null,
    contactNumber = null,
    active = true,
    expiresAt = null,
    createdBy = null
  } = {}) {
    await this.whenReady();
    const normalizedKind = this.#assertKind(kind);
    if (typeof title !== "string" || title.trim().length < 3) {
      throw new Error("ANNOUNCEMENT_TITLE_REQUIRED");
    }
    const now = new Date().toISOString();
    const isActive = Boolean(active);
    const entry = {
      id: crypto.randomUUID().slice(0, 8).toUpperCase(),
      kind: normalizedKind,
      title: title.trim(),
      body: typeof body === "string" ? body.trim() : "",
      link: normalizeLink(link),
      image: normalizeImage(image),
      contactNumber: normalizeContact(contactNumber),
      active: isActive,
      status: isActive ? "PUBLIC" : "DRAFT",
      publishedAt: isActive ? now : null,
      expiresAt: normalizeExpiry(expiresAt),
      createdBy: createdBy || null,
      createdAt: now,
      updatedAt: now
    };
    this.#state.announcements.push(entry);
    await this.#persist();
    this.#audit("ANNOUNCEMENT_CREATED", { id: entry.id, kind: normalizedKind, createdBy });
    return view(entry, Date.now());
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
    if (patch.link !== undefined) entry.link = normalizeLink(patch.link);
    if (patch.image !== undefined) entry.image = normalizeImage(patch.image);
    if (patch.contactNumber !== undefined) entry.contactNumber = normalizeContact(patch.contactNumber);
    if (patch.active !== undefined) {
      entry.active = Boolean(patch.active);
      if (entry.active && !entry.publishedAt) entry.publishedAt = new Date().toISOString();
    }
    if (patch.expiresAt !== undefined) {
      entry.expiresAt = normalizeExpiry(patch.expiresAt);
    }
    entry.status = announcementStatus(entry, Date.now());
    entry.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("ANNOUNCEMENT_UPDATED", { id, actorId });
    return view(entry, Date.now());
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
    const now = Date.now();
    const items = (await this.#listRaw()).map((entry) => view(entry, now));
    return includeInactive ? items : items.filter((entry) => entry.status === "PUBLIC");
  }

  async stats() {
    const now = Date.now();
    const all = (await this.#listRaw()).map((entry) => view(entry, now));
    return {
      total: all.length,
      active: all.filter((a) => a.active).length,
      published: all.filter((a) => a.status === "PUBLIC").length,
      public: all.filter((a) => a.status === "PUBLIC").length,
      draft: all.filter((a) => a.status === "DRAFT").length,
      expired: all.filter((a) => a.status === "EXPIRED").length,
      withImages: all.filter((a) => Boolean(a.image?.dataUrl)).length,
      news: all.filter((a) => a.kind === "NEWS").length,
      bulletins: all.filter((a) => a.kind === "BULLETIN").length,
      announcements: all.filter((a) => a.kind === "ANNOUNCEMENT").length,
      adverts: all.filter((a) => a.kind === "ADVERT").length
    };
  }
}

export default AnnouncementsManager;

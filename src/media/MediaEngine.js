/**
 * ADE MEDIA ENGINE — Provider-Neutral Media Architecture
 *
 * This is the canonical ADE Media Engine, not a single-provider
 * integration. It establishes the orchestration, registry, and
 * provider-neutral architecture required for:
 *
 * - Product trailers and demos
 * - Adverts and campaigns
 * - Social content
 * - Future campaign production
 * - Multiple output variants
 * - Product Theater
 *
 * The architecture separates:
 * Creative Intelligence → Orchestration → Provider Selection
 * → Asset/Scene Generation → Audio → Captions → Assembly
 * → Quality Validation → Registry/Storage → Provenance
 *
 * No single provider is hard-wired. All providers are replaceable
 * adapters behind canonical interfaces.
 */

import crypto from "node:crypto";
import EnterpriseEventBus from "../kernel/EnterpriseEventBus.js";

const MEDIA_TYPES = Object.freeze({
  VIDEO: "video",
  IMAGE: "image",
  AUDIO: "audio",
  THREE_D: "3d",
  CAPTIONS: "captions"
});

const MEDIA_PROVIDERS = Object.freeze({
  VIDEO_REPLICATE: { id: "replicate", type: MEDIA_TYPES.VIDEO, status: "UNCONFIGURED", priority: 1 },
  VIDEO_RUNWAY: { id: "runway", type: MEDIA_TYPES.VIDEO, status: "UNCONFIGURED", priority: 2 },
  VIDEO_LOCAL: { id: "local-video", type: MEDIA_TYPES.VIDEO, status: "UNAVAILABLE", priority: 10 },
  IMAGE_STABILITY: { id: "stability", type: MEDIA_TYPES.IMAGE, status: "UNCONFIGURED", priority: 1 },
  IMAGE_DALLE: { id: "dalle", type: MEDIA_TYPES.IMAGE, status: "UNCONFIGURED", priority: 2 },
  IMAGE_LOCAL: { id: "local-image", type: MEDIA_TYPES.IMAGE, status: "UNAVAILABLE", priority: 10 },
  AUDIO_ELEVENLABS: { id: "elevenlabs", type: MEDIA_TYPES.AUDIO, status: "UNCONFIGURED", priority: 1 },
  AUDIO_LOCAL: { id: "local-audio", type: MEDIA_TYPES.AUDIO, status: "UNAVAILABLE", priority: 10 },
  CAPTIONS_LOCAL: { id: "local-captions", type: MEDIA_TYPES.CAPTIONS, status: "AVAILABLE", priority: 1 }
});

const THEATRE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const THEATRE_CHANNELS = Object.freeze(["DEVICE_DOWNLOAD", "FACEBOOK", "DISCORD", "INSTAGRAM", "TIKTOK", "YOUTUBE", "EMAIL", "WHATSAPP"]);
const THEATRE_UPLOAD_KINDS = Object.freeze(["VIDEO", "AUDIO", "IMAGE", "DOCUMENT", "FILE"]);

export class MediaEngine {
  constructor({ eventBus = EnterpriseEventBus.getInstance(), mediaRegistry = null } = {}) {
    this.eventBus = eventBus;
    this.mediaRegistry = mediaRegistry;
    this.registry = new Map();
    this.providers = new Map(Object.entries(MEDIA_PROVIDERS));
    this.maxRequests = Math.max(
      100,
      Number(process.env.ADE_MEDIA_MAX_REQUESTS || 5000)
    );
  }

  // === PRODUCT THEATRE / MEDIA CONSOLE (lightweight, bounded) ============
  // Structural CMD prompts (founder/top-admin console input) are parsed into
  // a generation manifest assembled from: explicit prompt + attached uploads
  // (metadata only) + free/public-source references + ADE internal lexicon
  // fallback. No heavy video containers are built here; the engine produces
  // a truthful manifest (CANDIDATE/PREVIEW) that downstream providers or the
  // founder console can render. All theatre artefacts expire after 7 days
  // and are purged to protect memory.
  parseStructuralCommand(cmd = "") {
    const raw = String(cmd || "");
    const t = raw.toUpperCase();
    const pick = (re) => { const m = raw.match(re); return m ? m[1].trim() : null; };
    const has = (...words) => words.some((w) => t.includes(w));
    const language = pick(/(?:LANG(?:UAGE)?|IN)\s*[:=]?\s*([A-Za-z-]{2,12})/i) || "en";
    const duration = (() => {
      const m = raw.match(/(\d{1,4})\s*(SEC|SECOND|MIN|MINUTE)/i);
      if (!m) return 30;
      const n = Number(m[1]);
      return /MIN/i.test(m[2]) ? Math.min(3600, n * 60) : Math.min(3600, n);
    })();
    return {
      raw: raw.slice(0, 2000),
      kind: has("CARTOON") ? "cartoon" : has("AVATAR") ? "avatar" : has("AUDIO") && !has("VIDEO") ? "audio" : "video",
      topic: pick(/(?:CREATE|GENERATE|MAKE)\s+(?:AN?\s+)?(?:VIDEO|AUDIO|ADVERT|PROMO|CARTOON|AVATAR)?\s*(?:ABOUT|ON|FOR)?\s*:?\s*(.+)/i)?.slice(0, 500) || raw.slice(0, 200),
      language,
      subtitles: has("SUBTITLE", "SUBTITLES", "CAPTION"),
      quality: has("VERY HIGH", "VHD", "4K") ? "VHD" : has("HD", "HIGH DEFINITION", "HIGH-DEFINITION") ? "HD" : "STANDARD",
      durationSeconds: duration,
      destinations: THEATRE_CHANNELS.filter((c) => t.includes(c) || (c === "DEVICE_DOWNLOAD" && has("DOWNLOAD", "DEVICE"))),
      voice: has("VOICEOVER", "VOICE OVER", "NARRAT") ? "voiceover" : null,
      truthClassification: "CANDIDATE"
    };
  }

  generateFromCommand({ cmd, uploads = [], lexicon = null, freeSources = [] } = {}) {
    if (!cmd || typeof cmd !== "string" || !cmd.trim()) throw new Error("THEATRE_CMD_REQUIRED");
    const parsed = this.parseStructuralCommand(cmd);
    const request = this.createMediaRequest({
      type: parsed.kind,
      title: parsed.topic.slice(0, 120) || "ADE Theatre Request",
      description: parsed.raw.slice(0, 500),
      language: parsed.language,
      duration: parsed.durationSeconds,
      truthClassification: "CANDIDATE"
    });
    request.theatre = {
      cmd: parsed.raw.slice(0, 2000),
      parsed,
      uploads: this.#sanitizeUploads(uploads),
      // Free/public-source references + internal lexicon fallback team up here
      // as manifest references only — no binary fetch/encode at this layer.
      assembly: {
        lexicon: lexicon && typeof lexicon === "object" ? { used: true, keys: Object.keys(lexicon).slice(0, 12) } : { used: true, fallback: "ADE_INTERNAL_LEXICON" },
        freeSources: Array.isArray(freeSources) ? freeSources.slice(0, 12) : [],
        captions: parsed.subtitles ? { language: parsed.language, status: "PLANNED" } : { status: "NOT_REQUESTED" },
        quality: parsed.quality
      },
      destinations: parsed.destinations.length ? parsed.destinations : ["DEVICE_DOWNLOAD"],
      delivery: { status: "ASSEMBLED", requiresPin: true, sent: false },
      expiresAt: new Date(Date.now() + THEATRE_RETENTION_MS).toISOString()
    };
    this.registry.set(request.requestId, request);
    this.#boundRegistry();
    try { this.eventBus.publish("MEDIA_THEATRE_ASSEMBLED", { requestId: request.requestId, kind: parsed.kind }); } catch {}
    return request;
  }

  attachUploads(requestId, uploads = []) {
    const request = this.registry.get(requestId);
    if (!request) throw new Error("Media request not found.");
    const clean = this.#sanitizeUploads(uploads);
    request.theatre = request.theatre || { delivery: { status: "ASSEMBLED", requiresPin: true, sent: false }, expiresAt: new Date(Date.now() + THEATRE_RETENTION_MS).toISOString() };
    request.theatre.uploads = [...(request.theatre.uploads || []), ...clean].slice(0, 12);
    this.registry.set(requestId, request);
    return request;
  }

  #sanitizeUploads(uploads) {
    if (!Array.isArray(uploads)) return [];
    return uploads.slice(0, 12).map((u, i) => {
      const kind = String(u?.kind || u?.type || "FILE").toUpperCase();
      return {
        id: `UPLOAD-${Date.now()}-${i}`,
        name: String(u?.name || `upload-${i + 1}`).slice(0, 160),
        kind: THEATRE_UPLOAD_KINDS.includes(kind) ? kind : "FILE",
        mime: String(u?.mime || "").slice(0, 80) || null,
        declaredBytes: Number.isFinite(Number(u?.bytes)) ? Math.max(0, Math.min(Number(u.bytes), 500 * 1024 * 1024)) : null,
        note: "Metadata only — binary content is held by the uploader/client, never buffered into ADE memory."
      };
    });
  }

  authorizeSend(requestId) {
    const request = this.registry.get(requestId);
    if (!request) throw new Error("Media request not found.");
    if (this.#isExpired(request)) throw new Error("THEATRE_EXPIRED: artefact exceeded 7-day retention.");
    request.theatre = request.theatre || {};
    request.theatre.delivery = { ...(request.theatre.delivery || {}), status: "AUTHORIZED", requiresPin: true, sent: false, authorizedAt: new Date().toISOString() };
    this.registry.set(requestId, request);
    return request;
  }

  markSent(requestId, destinations = []) {
    const request = this.registry.get(requestId);
    if (!request) throw new Error("Media request not found.");
    const dest = (Array.isArray(destinations) && destinations.length ? destinations : request.theatre?.destinations || ["DEVICE_DOWNLOAD"])
      .map((d) => String(d).toUpperCase()).filter((d) => THEATRE_CHANNELS.includes(d));
    request.theatre.delivery = {
      status: "QUEUED_FOR_DELIVERY",
      requiresPin: true,
      sent: true,
      sentAt: new Date().toISOString(),
      destinations: dest.length ? dest : ["DEVICE_DOWNLOAD"],
      note: "Queued as a light manifest handoff. Per-channel upload requires that channel's own credential/approval; nothing is claimed as published without provider proof."
    };
    this.registry.set(requestId, request);
    try { this.eventBus.publish("MEDIA_THEATRE_SEND_AUTHORIZED", { requestId, destinations: request.theatre.delivery.destinations }); } catch {}
    return request;
  }

  #isExpired(request) {
    const exp = request?.theatre?.expiresAt || request?.expiresAt;
    if (!exp) return false;
    return Date.now() > new Date(exp).getTime();
  }

  purgeExpired(now = Date.now()) {
    let purged = 0;
    for (const [id, request] of this.registry) {
      const exp = request?.theatre?.expiresAt;
      if (exp && now > new Date(exp).getTime()) {
        this.registry.delete(id);
        purged += 1;
        try { this.eventBus.publish("MEDIA_THEATRE_PURGED", { requestId: id, reason: "7_DAY_RETENTION" }); } catch {}
      }
    }
    return { purged, remaining: this.registry.size };
  }

  listTheatreGallery() {
    this.purgeExpired();
    return [...this.registry.values()]
      .filter((r) => r?.theatre)
      .map((r) => ({
        requestId: r.requestId,
        type: r.type,
        title: r.title,
        status: r.status,
        language: r.language,
        duration: r.duration,
        destinations: r.theatre.destinations || [],
        delivery: r.theatre.delivery || null,
        uploadCount: (r.theatre.uploads || []).length,
        expiresAt: r.theatre.expiresAt || null,
        truthClassification: r.truthClassification || "CANDIDATE",
        createdAt: r.createdAt
      }));
  }

  #boundRegistry() {
    while (this.registry.size > this.maxRequests) {
      const oldestKey = this.registry.keys().next().value;
      if (!oldestKey) break;
      this.registry.delete(oldestKey);
    }
  }

  getProviders() {
    return [...this.providers.values()].map(p => ({ ...p }));
  }

  getProviderStatus(type = null) {
    const providers = type
      ? [...this.providers.values()].filter(p => p.type === type)
      : [...this.providers.values()];
    return providers.map(p => ({
      id: p.id,
      type: p.type,
      status: p.status,
      configured: p.status !== "UNCONFIGURED" && p.status !== "UNAVAILABLE"
    }));
  }

  createMediaRequest(params = {}) {
    const requestId = `ADE-MEDIA-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const request = {
      requestId,
      createdAt: new Date().toISOString(),
      type: params.type || null,
      title: params.title || null,
      description: params.description || null,
      category: params.category || null,
      product: params.product || "ADE",
      campaignObjective: params.campaignObjective || params.category || "DEMO",
      targetAudience: params.targetAudience || params.audience || "general",
      targetMarket: params.targetMarket || "global",
      duration: params.duration || 30,
      brandRules: params.brandRules || {},
      visualStyle: params.visualStyle || "professional",
      aspectRatio: params.aspectRatio || "16:9",
      language: params.language || "en",
      localization: params.localization || null,
      budget: params.budget || "standard",
      scenes: [],
      status: "CREATED",
      truthClassification: params.truthClassification || "PLACEHOLDER"
    };
    this.registry.set(requestId, request);
    this.#boundRegistry();

    if (this.mediaRegistry && typeof this.mediaRegistry.registerAsset === "function") {
      try {
        this.mediaRegistry.registerAsset({
          requestId,
          type: params.type || "video",
          status: "REQUESTED",
          truthClassification: "PLACEHOLDER",
          provider: "unconfigured",
          duration: request.duration,
          outputFormat: "mp4"
        });
      } catch (_e) { /* registry failure does not block request creation */ }
    }

    this.eventBus.publish("MEDIA_REQUEST_CREATED", { requestId, product: request.product });
    return request;
  }

  createCreativeConcept(requestId, concept = {}) {
    const request = this.registry.get(requestId);
    if (!request) throw new Error("Media request not found.");

    const creative = {
      conceptId: `CREATIVE-${Date.now()}`,
      requestId,
      strategy: concept.strategy || "ADE Product Demonstration",
      script: concept.script || null,
      storyboard: concept.storyboard || [],
      scenes: concept.scenes || this._defaultScenes(request),
      voiceOverScript: concept.voiceOverScript || null,
      subtitles: concept.subtitles || [],
      continuityInstructions: concept.continuityInstructions || null,
      createdAt: new Date().toISOString(),
      truthClassification: "PLACEHOLDER"
    };

    request.scenes = creative.scenes;
    request.status = "CONCEPT_CREATED";

    if (this.mediaRegistry && typeof this.mediaRegistry.listAssets === "function") {
      try {
        const existing = this.mediaRegistry.listAssets({ requestId });
        if (existing.length > 0) {
          this.mediaRegistry.updateAsset(existing[0].assetId, {
            status: "PLANNED",
            validationResult: { conceptCreated: true, sceneCount: creative.scenes.length }
          });
        }
      } catch (_e) { /* registry update failure is non-fatal */ }
    }

    this.eventBus.publish("MEDIA_CONCEPT_CREATED", { requestId, conceptId: creative.conceptId });

    return creative;
  }

  getMediaRequest(requestId) {
    return this.registry.get(requestId) || null;
  }

  listMediaRequests() {
    return [...this.registry.values()].map(r => ({
      requestId: r.requestId,
      type: r.type,
      title: r.title,
      description: r.description,
      category: r.category,
      product: r.product,
      language: r.language,
      targetAudience: r.targetAudience,
      status: r.status,
      duration: r.duration,
      sceneCount: r.scenes?.length || 0,
      truthClassification: r.truthClassification,
      createdAt: r.createdAt
    }));
  }

  _defaultScenes(request) {
    const sceneCount = Math.max(1, Math.ceil((request.duration || 30) / 10));
    return Array.from({ length: sceneCount }, (_, i) => ({
      sceneId: `SCENE-${String(i + 1).padStart(3, "0")}`,
      description: `Scene ${i + 1} of ${sceneCount}`,
      duration: Math.ceil((request.duration || 30) / sceneCount),
      type: i === 0 ? "INTRO" : i === sceneCount - 1 ? "OUTRO" : "CONTENT",
      status: "PLACEHOLDER",
      truthClassification: "PLACEHOLDER"
    }));
  }
}

export { MEDIA_TYPES, MEDIA_PROVIDERS, THEATRE_RETENTION_MS, THEATRE_CHANNELS };
export default MediaEngine;

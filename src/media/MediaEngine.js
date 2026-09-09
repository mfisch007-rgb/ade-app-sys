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
      product: params.product || "ADE",
      campaignObjective: params.campaignObjective || "DEMO",
      targetAudience: params.targetAudience || "general",
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
      truthClassification: "PLACEHOLDER"
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
      product: r.product,
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

export { MEDIA_TYPES, MEDIA_PROVIDERS };
export default MediaEngine;

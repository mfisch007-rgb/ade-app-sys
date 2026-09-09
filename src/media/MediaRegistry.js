/**
 * ADE MEDIA REGISTRY
 *
 * Every significant media asset carries appropriate metadata:
 * - request ID, campaign ID, status, provider
 * - model/version where available
 * - prompt/version reference
 * - source/generated asset references
 * - timestamps, output format, resolution, duration
 * - retry history, validation result, approval state
 * - provenance, LIVE/SIMULATED/PLACEHOLDER classification
 *
 * Secrets and provider credentials are NEVER stored in media records.
 */

import crypto from "node:crypto";
import EnterpriseEventBus from "../kernel/EnterpriseEventBus.js";

export class MediaRegistry {
  constructor({ eventBus = EnterpriseEventBus.getInstance() } = {}) {
    this.eventBus = eventBus;
    this.assets = new Map();
    this.maxAssets = 5000;
  }

  registerAsset(metadata = {}) {
    const assetId = metadata.assetId || `MEDIA-ASSET-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const asset = {
      assetId,
      requestId: metadata.requestId || null,
      campaignId: metadata.campaignId || null,
      status: metadata.status || "REGISTERED",
      provider: metadata.provider || "unknown",
      modelVersion: metadata.modelVersion || null,
      promptVersion: metadata.promptVersion || null,
      sourceAssets: metadata.sourceAssets || [],
      generatedAssets: metadata.generatedAssets || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outputFormat: metadata.outputFormat || "mp4",
      resolution: metadata.resolution || "1920x1080",
      duration: metadata.duration || null,
      retryHistory: [],
      validationResult: metadata.validationResult || null,
      approvalState: metadata.approvalState || "PENDING",
      provenance: metadata.provenance || "UNKNOWN",
      truthClassification: metadata.truthClassification || "PLACEHOLDER",
      type: metadata.type || "video"
    };
    this.assets.set(assetId, asset);
    this._trimAssets();
    this.eventBus.publish("ASSET_REGISTERED", {
      assetId,
      requestId: asset.requestId,
      type: asset.type,
      truthClassification: asset.truthClassification
    });
    return asset;
  }

  getAsset(assetId) {
    return this.assets.get(assetId) || null;
  }

  updateAsset(assetId, updates = {}) {
    const asset = this.assets.get(assetId);
    if (!asset) return null;
    Object.assign(asset, updates, { updatedAt: new Date().toISOString() });
    this.eventBus.publish("ASSET_UPDATED", {
      assetId,
      requestId: asset.requestId,
      status: asset.status,
      truthClassification: asset.truthClassification
    });
    return asset;
  }

  listAssets(filter = {}) {
    let results = [...this.assets.values()];
    if (filter.requestId) results = results.filter(a => a.requestId === filter.requestId);
    if (filter.type) results = results.filter(a => a.type === filter.type);
    if (filter.status) results = results.filter(a => a.status === filter.status);
    if (filter.truthClassification) results = results.filter(a => a.truthClassification === filter.truthClassification);
    return results;
  }

  getRegistryStats() {
    const assets = [...this.assets.values()];
    return {
      totalAssets: assets.length,
      byType: this._countBy(assets, "type"),
      byStatus: this._countBy(assets, "status"),
      byTruthClassification: this._countBy(assets, "truthClassification"),
      byProvider: this._countBy(assets, "provider")
    };
  }

  _countBy(items, field) {
    const counts = {};
    for (const item of items) {
      const key = item[field] || "unknown";
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }

  _trimAssets() {
    if (this.assets.size > this.maxAssets) {
      const keys = [...this.assets.keys()];
      for (let i = 0; i < keys.length - this.maxAssets; i++) {
        this.assets.delete(keys[i]);
      }
    }
  }
}

export default MediaRegistry;

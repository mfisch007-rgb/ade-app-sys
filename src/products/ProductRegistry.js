/**
 * ADE PRODUCT INTEGRATION BOUNDARIES
 *
 * Reconciles ADE Core relationships with product/capability modules:
 * - PROCARTA
 * - AWBULI
 * - Provider-Neutral AI
 * - Universal Intake
 * - Internal Operations
 * - Feedback Intelligence
 * - Media Engine
 * - Partner/Pilot pathways
 *
 * Maintains: ONE ADE CORE, MULTIPLE PRODUCTS, MULTIPLE PROVIDERS,
 * INTERCHANGEABLE ADAPTERS, NO REWRITE FOR PRODUCT EXPANSION.
 */

export const ADE_PRODUCTS = Object.freeze({
  ADE_PLATFORM: {
    id: "ade-platform",
    name: "ADE Platform",
    description: "The core Autonomous Development Engine platform.",
    status: "ACTIVE",
    edition: "COMMUNITY"
  },
  PROCARTA: {
    id: "procarta",
    name: "PROCARTA",
    description: "Procarta Workflow Execution Hub — business process automation.",
    status: "INTEGRATED",
    pluginRequired: true
  },
  AWBULI: {
    id: "awbuli",
    name: "AWBULI",
    description: "ADE-AWBULI System Controller & Automation Engine — messaging automation.",
    status: "INTEGRATED",
    pluginRequired: true
  },
  ORACLE: {
    id: "oracle",
    name: "ADE Oracle",
    description: "Oracle System Intelligence Engine & Knowledge Base.",
    status: "INTEGRATED",
    pluginRequired: false
  }
});

export const MEDIA_CAMPAIGN_VARIANTS = Object.freeze([
  { id: "master", label: "Master Campaign", duration: 90, aspectRatio: "16:9", description: "Full-length master campaign" },
  { id: "professional-60", label: "Professional 60s", duration: 60, aspectRatio: "16:9", description: "60-second professional version" },
  { id: "social-30", label: "Social 30s", duration: 30, aspectRatio: "16:9", description: "30-second social media version" },
  { id: "short-15", label: "Short Form 15s", duration: 15, aspectRatio: "16:9", description: "15-second short-form version" },
  { id: "vertical-60", label: "Vertical 60s", duration: 60, aspectRatio: "9:16", description: "60-second vertical mobile version" },
  { id: "square-30", label: "Square 30s", duration: 30, aspectRatio: "1:1", description: "30-second square social version" }
]);

export class ProductRegistry {
  constructor() {
    this.products = new Map(Object.entries(ADE_PRODUCTS));
    this.campaignVariants = [...MEDIA_CAMPAIGN_VARIANTS];
  }

  getProduct(productId) {
    return this.products.get(productId) || null;
  }

  listProducts() {
    return [...this.products.values()];
  }

  getCampaignVariants() {
    return [...this.campaignVariants];
  }

  generateVariantPlan(masterCampaign = {}) {
    return this.campaignVariants.map(variant => ({
      ...variant,
      sharedStrategy: masterCampaign.strategy || null,
      sharedStoryboard: masterCampaign.storyboard || null,
      campaignId: masterCampaign.campaignId || null,
      truthClassification: "PLACEHOLDER",
      status: "PLANNED"
    }));
  }
}

export default ProductRegistry;

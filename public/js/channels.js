/**
 * ADE universal channel configuration module (shared by Admin Command Center
 * and Founder Advanced Controls).
 *
 * Attaches click listeners to ALL channel items + status badges across the
 * 11-channel fabric and opens the interactive config modal, saving via
 * POST /api/v1/connect/channels/configure with live provider endpoints
 * loaded dynamically (never hardcoded).
 *
 * Canonical 11-channel fabric:
 * ADE Portal, Email, WhatsApp/AWBULI, Telegram, API, Webhook,
 * Partner & Provider Integrations, CRM, Marketplace,
 * Enterprise Procurement, Human-assisted Intake.
 */
(function () {
  "use strict";
  var CHANNELS = [
    { id: "WEB", label: "ADE Portal" },
    { id: "EMAIL", label: "Email" },
    { id: "WHATSAPP", label: "WhatsApp / AWBULI" },
    { id: "TELEGRAM", label: "Telegram" },
    { id: "API", label: "API" },
    { id: "WEBHOOK", label: "Webhook" },
    { id: "PARTNER", label: "Partner & Provider Integrations" },
    { id: "CRM", label: "CRM" },
    { id: "MARKETPLACE", label: "Marketplace" },
    { id: "PROCUREMENT", label: "Enterprise Procurement" },
    { id: "HUMAN", label: "Human-assisted Intake" },
  ];

  function api(path, opt) {
    var token = null;
    try {
      token =
        sessionStorage.getItem("ade_admin_token") ||
        sessionStorage.getItem("ade_founder_token") ||
        localStorage.getItem("ade_founder_token") ||
        null;
    } catch (e) {}
    var headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    return fetch("/api/v1" + path, {
      method: (opt && opt.method) || "GET",
      headers: headers,
      body: opt && opt.body ? opt.body : undefined,
    }).then(function (r) {
      return r.json().catch(function () {
        return {};
      });
    });
  }

  function openModal(channelId, label) {
    try {
      if (typeof window.openConfigModal === "function") {
        window.openConfigModal(channelId, label);
        return;
      }
      var m = document.getElementById("config-modal");
      if (!m) return;
      var c = document.getElementById("cfgChannel");
      if (c) c.value = label || channelId;
      var t = document.getElementById("cfgTitle");
      if (t) t.textContent = "Configure " + (label || channelId);
      m.classList.remove("hidden");
      m.style.display = "flex";
      window.__adeCfgChannel = channelId;
    } catch (e) {}
  }

  function saveModal() {
    var id = window.__adeCfgChannel || "EMAIL";
    var body = {
      channelId: id,
      apiKey: (document.getElementById("cfgApiKey") || {}).value || "",
      webhookUrl: (document.getElementById("cfgWebhook") || {}).value || "",
      secret: (document.getElementById("cfgSecret") || {}).value || "",
    };
    // Provider Endpoint field (new universal input) maps to baseUrl.
    try {
      var ep = document.getElementById("cfgEndpoint");
      if (ep && ep.value) body.baseUrl = ep.value;
    } catch (e) {}
    return api("/connect/channels/configure", { method: "POST", body: JSON.stringify(body) });
  }

  function partnerEndpoints() {
    return api("/connect/partner-endpoints").then(function (j) {
      return (j && j.endpoints) || [];
    });
  }

  function bindAll(root) {
    try {
      var scope = root || document;
      var items = scope.querySelectorAll("[data-channel], .channel-card, .channel-item, .channel-badge");
      items.forEach(function (el) {
        if (el.__adeBound) return;
        el.__adeBound = true;
        el.style.cursor = "pointer";
        el.addEventListener("click", function (ev) {
          try {
            ev.stopPropagation();
          } catch (e) {}
          var id = el.getAttribute("data-channel") || el.getAttribute("data-id") || (el.textContent || "").trim().slice(0, 40);
          var label = el.getAttribute("data-label") || id;
          openModal(id, label);
        });
      });
    } catch (e) {}
  }

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        bindAll(document);
      });
    } else {
      bindAll(document);
    }
  } catch (e) {}
  try {
    new MutationObserver(function () {
      bindAll(document);
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  window.ADEChannels = {
    CHANNELS: CHANNELS,
    openModal: openModal,
    save: saveModal,
    partnerEndpoints: partnerEndpoints,
    bindAll: bindAll,
  };
})();

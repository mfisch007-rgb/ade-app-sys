/* ==========================================================================
   ADE-APEX shared API client  ·  v1.0.0
   Plain script (no modules/bundler): assigns window.ADE.
   Conventions mirror the canonical surfaces:
     public/index.html   -> token key "ade_token"      (local+session)
     public/admin/index.html -> token key "ade_admin_token" (session)
     public/founder.html -> token key "ade_founder_token"
   Server stays authoritative: this client only transports + humanizes.
   No secrets are embedded; tokens live in Web Storage per surface.
   ========================================================================== */
(function (global) {
  "use strict";

  var DEFAULT_TIMEOUT_MS = 25000;

  function readToken(key) {
    try {
      return (
        global.localStorage.getItem(key) ||
        global.sessionStorage.getItem(key) ||
        null
      );
    } catch (e) {
      return null;
    }
  }

  function writeToken(key, value) {
    try {
      if (value) {
        global.localStorage.setItem(key, value);
        global.sessionStorage.setItem(key, value);
      } else {
        global.localStorage.removeItem(key);
        global.sessionStorage.removeItem(key);
      }
    } catch (e) {}
  }

  /* Humanized error copy — matches the canonical homepage contract so every
     surface explains failures the same way instead of leaking raw codes. */
  function humanizeError(raw) {
    var s = String(raw || "");
    if (s.indexOf("COMMAND_RBAC_BLOCKED") !== -1)
      return "Access denied — you need higher authorization.";
    if (s.indexOf("EDITION_GATED") !== -1)
      return "This feature is not available in your edition.";
    if (
      s.indexOf("SUPABASE_STORAGE_WRITE_FAILED") !== -1 ||
      s.indexOf("SUPABASE_STORAGE_READ_FAILED") !== -1
    )
      return "Configuration required — durable storage is not yet configured. Your entry was not lost; contact ADE via Community intake.";
    if (s.indexOf("STORAGE_NOT_CONFIGURED") !== -1)
      return "Service temporarily unavailable — please try again later.";
    if (s.indexOf("CONFIGURATION_REQUIRED") !== -1)
      return "Configuration required — follow the action shown on the product card.";
    if (s.indexOf("PARTNER_REQUIRED") !== -1)
      return "Partner implementation required — register interest via Community intake.";
    if (s.indexOf("INVALID_CREDENTIALS") !== -1)
      return "Invalid credentials — please check and try again.";
    if (s.indexOf("BROKER_NOT_CONFIGURED") !== -1)
      return "Live provider not configured — paper/simulation mode only.";
    return s || "Request failed";
  }

  function createClient(opts) {
    opts = opts || {};
    var tokenKey = opts.tokenKey || "ade_token";
    var base = opts.base || "";

    function authHeaders(extra) {
      var headers = { "Content-Type": "application/json" };
      var t = readToken(tokenKey);
      if (t) headers.Authorization = "Bearer " + t;
      if (extra) {
        for (var k in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, k))
            headers[k] = extra[k];
        }
      }
      return headers;
    }

    function request(path, options) {
      options = options || {};
      var controller = null;
      var timer = null;
      try {
        if (typeof AbortController !== "undefined") {
          controller = new AbortController();
          timer = setTimeout(function () {
            try { controller.abort(); } catch (e) {}
          }, options.timeout || DEFAULT_TIMEOUT_MS);
        }
      } catch (e) {}

      var fetchOpts = {
        method: options.method || "GET",
        headers: authHeaders(options.headers),
      };
      if (options.body !== undefined)
        fetchOpts.body =
          typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body);
      if (controller) fetchOpts.signal = controller.signal;

      return global
        .fetch(base + path, fetchOpts)
        .then(function (r) {
          if (timer) clearTimeout(timer);
          return r.json().catch(function () { return {}; }).then(function (d) {
            if (!r.ok) {
              var code =
                typeof d.error === "string"
                  ? d.error
                  : (d.error && d.error.code) || "";
              var msg =
                d.message || (d.error && d.error.message) || "";
              var raw = msg
                ? code ? code + ": " + msg : msg
                : code || "Request failed (" + r.status + ")";
              var err = new Error(humanizeError(raw));
              err.status = r.status;
              err.code = code;
              err.data = d;
              throw err;
            }
            return d;
          });
        })
        .catch(function (e) {
          if (timer) clearTimeout(timer);
          if (e && e.name === "AbortError")
            throw new Error("Request timed out — please try again.");
          throw e;
        });
    }

    return {
      tokenKey: tokenKey,
      getToken: function () { return readToken(tokenKey); },
      setToken: function (v) { writeToken(tokenKey, v); },
      clearToken: function () { writeToken(tokenKey, null); },
      headers: authHeaders,
      request: request,
      get: function (p, o) {
        return request(p, Object.assign({}, o, { method: "GET" }));
      },
      post: function (p, body, o) {
        return request(p, Object.assign({}, o, { method: "POST", body: body }));
      },
      /* Canonical auth endpoints (server-authoritative). */
      pinLogin: function (pin) {
        return request("/api/v1/auth/pin", {
          method: "POST",
          body: { pin: pin },
        });
      },
      revoke: function () {
        return request("/api/v1/auth/revoke", { method: "POST", body: {} });
      },
      session: function () {
        return request("/api/v1/account/session", { method: "GET" });
      },
      health: function () {
        return request("/api/v1/health", { method: "GET" });
      },
      capabilities: function () {
        return request("/api/v1/capabilities", { method: "GET" });
      },
      execute: function (action, payload) {
        return request("/api/command/execute", {
          method: "POST",
          body: { action: action, payload: payload || {} },
        });
      },
      humanizeError: humanizeError,
    };
  }

  /* SSE with heartbeat tolerance + exponential-backoff reconnect.
     onEvent(type, data) — callers branch on data.type. */
  function connectEvents(opts) {
    opts = opts || {};
    var url = opts.url || "/api/v1/events/stream";
    var onEvent = opts.onEvent || function () {};
    var onStatus = opts.onStatus || function () {};
    var maxBackoff = opts.maxBackoff || 30000;
    var attempt = 0;
    var source = null;
    var closed = false;

    function open() {
      if (closed) return;
      onStatus("connecting");
      try {
        source = new global.EventSource(url);
      } catch (e) {
        schedule();
        return;
      }
      source.onopen = function () {
        attempt = 0;
        onStatus("live");
      };
      source.onmessage = function (ev) {
        var data = null;
        try { data = JSON.parse(ev.data); } catch (e) { data = { raw: ev.data }; }
        try { onEvent((data && data.type) || "message", data); } catch (e) {}
      };
      source.onerror = function () {
        onStatus("reconnecting");
        try { source.close(); } catch (e) {}
        schedule();
      };
    }

    function schedule() {
      if (closed) return;
      attempt += 1;
      var wait = Math.min(1000 * Math.pow(2, attempt - 1), maxBackoff);
      setTimeout(open, wait);
    }

    open();
    return {
      close: function () {
        closed = true;
        try { if (source) source.close(); } catch (e) {}
      },
    };
  }

  /* Theme: light default, dark opt-in persisted as ade_theme. */
  function initTheme(toggleId) {
    var root = global.document && global.document.documentElement;
    if (!root) return { theme: "light", set: function () {} };
    var current = "light";
    try {
      current = global.localStorage.getItem("ade_theme") || "light";
    } catch (e) {}
    function apply(t) {
      current = t === "dark" ? "dark" : "light";
      if (current === "dark") root.setAttribute("data-theme", "dark");
      else root.removeAttribute("data-theme");
      try { global.localStorage.setItem("ade_theme", current); } catch (e) {}
      var btn = toggleId && global.document.getElementById(toggleId);
      if (btn) {
        btn.setAttribute("aria-pressed", current === "dark" ? "true" : "false");
        btn.textContent = current === "dark" ? "☀" : "◐";
        btn.title = current === "dark" ? "Switch to light theme" : "Switch to dark theme";
      }
    }
    apply(current);
    var btn = toggleId && global.document.getElementById(toggleId);
    if (btn)
      btn.addEventListener("click", function () {
        apply(current === "dark" ? "light" : "dark");
      });
    if (
      global.matchMedia &&
      !((function () { try { return global.localStorage.getItem("ade_theme"); } catch (e) { return null; } })())
    ) {
      try {
        if (global.matchMedia("(prefers-color-scheme: dark)").matches) apply("dark");
      } catch (e) {}
    }
    return { theme: function () { return current; }, set: apply };
  }

  global.ADE = {
    createClient: createClient,
    shared: createClient({ tokenKey: "ade_token" }),
    admin: createClient({ tokenKey: "ade_admin_token" }),
    founder: createClient({ tokenKey: "ade_founder_token" }),
    connectEvents: connectEvents,
    initTheme: initTheme,
    humanizeError: humanizeError,
  };
})(typeof window !== "undefined" ? window : globalThis);

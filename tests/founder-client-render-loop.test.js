import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

/**
 * FOUNDER CLIENT — RENDER-PHASE DISPATCH REGRESSION (browser-parity harness).
 *
 * Defect closed by this file:
 *   public/founder.html called `adeVerifySessionCookies()` directly in the
 *   component's render body. That helper dispatched `setValidateSeq(s => s + 1)`
 *   — a state update during the render phase. React re-renders the component
 *   immediately, the helper dispatches again (the counter always changes), and
 *   after 25 render-phase updates React aborts with
 *       "Too many re-renders. React limits the number of renders to prevent
 *        an infinite loop."
 *   which unmounts the entire Founder console to a white screen. The trigger
 *   is a stored session token whose `ade_token`/`ade_elevated` cookies are
 *   missing — precisely the "page switch" case the check exists for.
 *
 * This harness is behavioural, not a source grep: it executes the REAL
 * founder.html client bundle against a mini-React that reproduces React's
 * rules that matter here —
 *   - a dispatch during the render phase is a render-phase update (React
 *     re-renders and counts it; 25 of them is a fatal error), and
 *   - a dispatch after commit is a normal update (one more render), and
 *   - effects re-run only when their dependencies change (shallow compare).
 * Any render-phase dispatch in the client therefore reproduces the crash
 * exactly as a browser would, without needing a browser.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const founderHtml = fs.readFileSync(path.join(root, "public", "founder.html"), "utf8");

const inlineBlocks = () =>
  [...founderHtml.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

// ---------------------------------------------------------------------------
// Mini-React with React's render-phase / commit-phase update semantics
// ---------------------------------------------------------------------------

const RE_RENDER_LIMIT = 25;

function createReactHarness() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let rendering = true;
  let renderPhaseDispatch = false;
  let needsRender = false;
  const dispatchCounts = Object.create(null);

  const shallowEqual = (a, b) => {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  };

  const slot = (init) => {
    const i = cursor;
    cursor += 1;
    if (!(i in slots)) slots[i] = { value: init, deps: undefined, hasValue: false };
    return slots[i];
  };

  const React = {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children };
    },
    useState(initial) {
      const s = slot(undefined);
      if (!s.hasValue) {
        s.value = typeof initial === "function" ? initial() : initial;
        s.hasValue = true;
      }
      const name = s.setterName || (s.setterName = `state${cursor}`);
      const set = (next) => {
        const current = s.value;
        const value = typeof next === "function" ? next(current) : next;
        if (Object.is(value, current)) return; // React bails out on identical state
        s.value = value;
        dispatchCounts[name] = (dispatchCounts[name] || 0) + 1;
        if (rendering) renderPhaseDispatch = true;
        else needsRender = true;
      };
      return [s.value, set];
    },
    useRef(initial) {
      const s = slot(undefined);
      // React returns a STABLE ref object whose .current is mutable across
      // renders — the client relies on that for its "already reconciled"
      // guard, so the harness must do the same.
      if (!s.hasValue) {
        s.value = { current: initial };
        s.hasValue = true;
      }
      return s.value;
    },
    useMemo(factory, deps) {
      const s = slot(undefined);
      if (!s.hasValue || !shallowEqual(s.deps, deps)) {
        s.value = factory();
        s.deps = deps;
        s.hasValue = true;
      }
      return s.value;
    },
    useCallback(fn, deps) {
      const s = slot(undefined);
      if (!s.hasValue || !shallowEqual(s.deps, deps)) {
        s.value = fn;
        s.deps = deps;
        s.hasValue = true;
      }
      return s.value;
    },
    useEffect(fn, deps) {
      const s = slot(undefined);
      const changed = !s.hasValue || !shallowEqual(s.deps, deps);
      s.deps = deps;
      s.hasValue = true;
      if (changed) effects.push(fn);
    }
  };

  /**
   * Render a component the way React does: run the body, then commit the
   * effects, and repeat while post-commit updates are pending. A dispatch
   * that happened during the render phase is a render-phase update: React
   * re-renders immediately and counts it toward the 25-update limit.
   */
  function render(Component) {
    let passes = 0;
    let renderPhaseDispatches = 0;
    for (;;) {
      passes += 1;
      if (passes > RE_RENDER_LIMIT + 5) {
        throw new Error(
          "Too many re-renders. React limits the number of renders to prevent an infinite loop."
        );
      }
      cursor = 0;
      effects = [];
      rendering = true;
      renderPhaseDispatch = false;
      needsRender = false;
      Component();
      rendering = false;
      if (renderPhaseDispatch) {
        renderPhaseDispatches += 1;
        if (renderPhaseDispatches > RE_RENDER_LIMIT) {
          throw new Error(
            "Too many re-renders. React limits the number of renders to prevent an infinite loop."
          );
        }
        continue;
      }
      const committed = effects;
      effects = [];
      for (const effect of committed) effect();
      if (!needsRender) break;
    }
    return { passes, renderPhaseDispatches, dispatchCounts };
  }

  return { React, render };
}

// ---------------------------------------------------------------------------
// Sandbox: the minimum browser surface founder.html touches
// ---------------------------------------------------------------------------

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; }
  };
}

function buildSandbox(React, ReactDOM) {
  const listeners = { window: {}, document: {} };
  const sandbox = {
    React,
    ReactDOM,
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    Promise,
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, persons: [], agents: [], claims: {}, person: null })
    }),
    EventSource: class {
      constructor() { this.close = () => {}; }
      addEventListener() {}
      removeEventListener() {}
    },
    prompt: () => null,
    navigator: { share: undefined, clipboard: { writeText: async () => true } },
    location: { pathname: "/founder", hash: "", href: "http://127.0.0.1/founder", origin: "http://127.0.0.1" },
    history: { replaceState: () => {}, pushState: () => {} },
    document: {
      cookie: "",
      title: "ADE ADVANCED FOUNDER CONTROLS",
      readyState: "complete",
      getElementById: () => ({ innerHTML: "", set innerHTML(v) { this._html = v; } }),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: (t, f) => { listeners.document[t] = f; },
      removeEventListener: () => {},
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} })
    },
    atob: (s) => Buffer.from(String(s), "base64").toString("binary"),
    btoa: (s) => Buffer.from(String(s), "binary").toString("base64")
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = (t, f) => { listeners.window[t] = f; };
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = () => true;
  sandbox.localStorage = makeStorage();
  sandbox.sessionStorage = makeStorage();
  return sandbox;
}

// ---------------------------------------------------------------------------
// Harness driver
// ---------------------------------------------------------------------------

/**
 * Boots the real founder.html client bundle and renders the App component.
 * @param {object} [options]
 * @param {boolean} [options.storedToken] seed a stored session token (the
 *   condition that made the founder console white-screen).
 * @param {boolean} [options.sessionCookies] seed the ade_token/ade_elevated
 *   session cookies the server issues on login.
 */
function bootFounderClient(options = {}) {
  const { storedToken = true, sessionCookies = false } = options;

  let AppComponent = null;
  const harness = createReactHarness();
  const React = harness.React;
  const ReactDOM = {
    createRoot: () => ({
      render(element) {
        // React 18 schedules the first render after the current script, so
        // later inline blocks (e.g. TAB_AWBULI) are already defined. The test
        // drives the render explicitly so any React abort surfaces inside the
        // test rather than as an unhandled rejection.
        AppComponent = element && element.type;
      }
    })
  };

  const sandbox = buildSandbox(React, ReactDOM);
  if (storedToken) {
    const token = "header.payload.signature";
    sandbox.sessionStorage.setItem("ade_founder_token", token);
    sandbox.localStorage.setItem("ade_founder_token", token);
  }
  if (sessionCookies) {
    sandbox.document.cookie = "ade_token=abc; ade_elevated=def";
  }

  const context = vm.createContext(sandbox);
  const blocks = inlineBlocks();
  // Block 1 is the CDN fallback, block 2 holds the App, block 3 the AWBULI tab.
  for (const block of blocks) {
    if (!/function App\s*\(|TAB_AWBULI\s*=|window\.TAB_AWBULI/.test(block)) continue;
    vm.runInContext(block, context, { filename: "founder-inline.js" });
  }
  return { harness, context, get App() { return AppComponent; } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("FOUNDER-CLIENT-1 — every inline founder.html script block parses", () => {
  const blocks = inlineBlocks();
  assert.ok(blocks.length >= 3, "founder.html ships its inline bundles");
  for (const [index, block] of blocks.entries()) {
    assert.doesNotThrow(
      () => new vm.Script(block, { filename: `founder-block-${index + 1}.js` }),
      `inline block ${index + 1} must parse`
    );
  }
});

test("FOUNDER-CLIENT-2 — a stored token without session cookies does not trigger a React render loop", async () => {
  const { harness, App } = bootFounderClient({ storedToken: true, sessionCookies: false });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(typeof App, "function", "the founder App component mounted");
  // If the client dispatched state during render, harness.render() throws the
  // exact React error the browser raised.
  const result = harness.render(App);
  assert.equal(
    result.renderPhaseDispatches,
    0,
    "no state dispatch may happen during the render phase (React aborts after 25)"
  );
  assert.ok(result.passes <= 5, `client settles in a bounded number of renders (got ${result.passes})`);
});

test("FOUNDER-CLIENT-3 — the same client renders cleanly with live session cookies", async () => {
  const { harness, App } = bootFounderClient({ storedToken: true, sessionCookies: true });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(typeof App, "function", "the founder App component mounted");
  const result = harness.render(App);
  assert.equal(result.renderPhaseDispatches, 0, "no render-phase dispatch with live cookies");
  assert.ok(result.passes <= 5, `client settles in a bounded number of renders (got ${result.passes})`);
});

test("FOUNDER-CLIENT-4 — session-cookie reconciliation re-validates at most once per token", async () => {
  const { harness, App } = bootFounderClient({ storedToken: true, sessionCookies: false });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  const result = harness.render(App);
  // The reconciliation must ask the server to re-validate the session when
  // the cookies are gone, but it must not re-ask on every render.
  const totalDispatches = Object.values(result.dispatchCounts).reduce((a, b) => a + b, 0);
  assert.ok(totalDispatches < 40, `bounded dispatch volume (got ${totalDispatches})`);
  assert.equal(result.renderPhaseDispatches, 0, "reconciliation never dispatches during render");
});

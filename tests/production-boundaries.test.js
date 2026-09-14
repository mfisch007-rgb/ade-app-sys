import test from "node:test";
import assert from "node:assert/strict";

import { SupabaseStorageAdapter } from "../src/storage/SupabaseStorageAdapter.js";
import { ResendEmailConnector } from "../src/notification/ResendEmailConnector.js";
import { MediaEngine } from "../src/media/MediaEngine.js";

function snapshotEnv() {
  const keys = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_KEY", "SUPABASE_STORAGE_TABLE", "RESEND_API_KEY", "EMAIL_SENDER"];
  const prev = {};
  for (const k of keys) prev[k] = process.env[k];
  return prev;
}
function restoreEnv(prev) {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

test("storage: SUPABASE_SECRET_KEY is accepted as the canonical key", () => {
  const prev = snapshotEnv();
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_STORAGE_KEY;
    process.env.SUPABASE_URL = "https://dydnqiqfndofgwpetwoy.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "secret-key";
    process.env.SUPABASE_STORAGE_TABLE = "ade_kv_store";
    const a = new SupabaseStorageAdapter();
    assert.equal(a.isConfigured(), true);
    assert.equal(a.configurationError(), null);
  } finally { restoreEnv(prev); }
});

test("storage: missing key reports SECRET_KEY boundary without leaking values", () => {
  const prev = snapshotEnv();
  try {
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_STORAGE_KEY;
    delete process.env.SUPABASE_STORAGE_TABLE;
    process.env.SUPABASE_URL = "https://example.supabase.co";
    const a = new SupabaseStorageAdapter();
    assert.equal(a.isConfigured(), false);
    const msg = a.configurationError().message;
    assert.match(msg, /STORAGE_NOT_CONFIGURED/);
    assert.match(msg, /SUPABASE_SECRET_KEY/);
    // Boundary names are listed; no key material is ever echoed.
    assert.doesNotMatch(msg, /eyJ|sb_secret_|sk-live|Bearer /i);
  } finally { restoreEnv(prev); }
});

test("email: unconfigured connector is honest and never claims delivery", () => {
  const c = new ResendEmailConnector({ apiKey: null, sender: "ADE <notifications@vibranthopecarefoundation.com.ng>" });
  assert.equal(c.isConfigured(), false);
  const s = c.status();
  assert.equal(s.provider, "RESEND");
  assert.equal(s.configured, false);
  assert.equal(s.status, "NOT CONFIGURED");
});

test("email: default sender is the verified production domain", async () => {
  const prev = snapshotEnv();
  try {
    delete process.env.EMAIL_SENDER;
    delete process.env.RESEND_FROM;
    const c = new ResendEmailConnector({ apiKey: "test-key" });
    assert.match(c.sender, /notifications@vibranthopecarefoundation\.com\.ng/);
    // Validation boundaries without network:
    await assert.rejects(() => c.send({ to: "not-an-email", subject: "hi", text: "x" }), /EMAIL_INVALID_RECIPIENT/);
    await assert.rejects(() => c.send({ to: "a@b.co", subject: "", text: "x" }), /EMAIL_SUBJECT_REQUIRED/);
    // Successful POST shape with stubbed fetch; key must travel in header only.
    let seen = null;
    const stub = async (url, opts) => {
      seen = { url, opts };
      return { ok: true, json: async () => ({ id: "re_123" }) };
    };
    const c2 = new ResendEmailConnector({ apiKey: "test-key", fetchImpl: stub });
    const out = await c2.send({ to: "a@b.co", subject: "ADE pilot", text: "hello" });
    assert.equal(out.success, true);
    assert.equal(out.id, "re_123");
    assert.equal(seen.url, "https://api.resend.com/emails");
    assert.match(seen.opts.headers.Authorization, /^Bearer /);
    assert.doesNotMatch(JSON.stringify(seen.opts.body), /test-key/);
  } finally { restoreEnv(prev); }
});

test("email: selectable sender profiles stay on the verified domain", async () => {
  const profiles = ResendEmailConnector.senderProfiles();
  assert.deepEqual(Object.keys(profiles).sort(), ["notifications", "partners", "security", "support", "welcome"]);
  assert.match(profiles.notifications, /notifications@vibranthopecarefoundation\.com\.ng/);
  assert.equal(ResendEmailConnector.resolveProfile("security"), profiles.security);
  assert.equal(ResendEmailConnector.resolveProfile(null), profiles.notifications);
  assert.throws(() => ResendEmailConnector.resolveProfile("ceo"), /EMAIL_UNKNOWN_SENDER_PROFILE/);
  assert.throws(() => ResendEmailConnector.assertVerifiedSender("ADE <boss@gmail.com>"), /EMAIL_SENDER_NOT_VERIFIED/);
  // Profile send uses the profile sender; key still travels header-only.
  let seen = null;
  const stub = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ id: "re_456" }) }; };
  const c = new ResendEmailConnector({ apiKey: "test-key", fetchImpl: stub });
  const out = await c.send({ to: "a@b.co", subject: "Welcome", text: "hi", profile: "welcome" });
  assert.equal(out.from, profiles.welcome);
  assert.equal(JSON.parse(seen.opts.body).from, profiles.welcome);
  // Unverified explicit sender is rejected before any network call.
  let called = false;
  const spy = async () => { called = true; return { ok: true, json: async () => ({}) }; };
  const c2 = new ResendEmailConnector({ apiKey: "test-key", fetchImpl: spy });
  await assert.rejects(() => c2.send({ to: "a@b.co", subject: "x", text: "y", from: "x@gmail.com" }), /EMAIL_SENDER_NOT_VERIFIED/);
  assert.equal(called, false);
});

test("theatre: structural CMD parses language, subtitles, quality, destinations", () => {
  const m = new MediaEngine({ eventBus: { publish() {} } });
  const p = m.parseStructuralCommand("CREATE VIDEO about ADE pilot promo LANG:yo SUBTITLES HD 90 SEC SEND TO YOUTUBE AND WHATSAPP, cartoon avatar");
  assert.equal(p.language, "yo");
  assert.equal(p.subtitles, true);
  assert.equal(p.quality, "HD");
  assert.equal(p.durationSeconds, 90);
  assert.ok(p.destinations.includes("YOUTUBE"));
  assert.ok(p.destinations.includes("WHATSAPP"));
});

test("theatre: generate/attach/7-day TTL/purge stays light (metadata only)", () => {
  const m = new MediaEngine({ eventBus: { publish() {} } });
  const r = m.generateFromCommand({
    cmd: "GENERATE VIDEO about ADE future LANG:en SUBTITLES HD 30 SEC",
    uploads: [{ name: "clip.mp4", kind: "VIDEO", mime: "video/mp4", bytes: 12345 }],
    freeSources: ["public-lexicon"]
  });
  assert.ok(r.requestId);
  assert.equal(r.theatre.delivery.requiresPin, true);
  assert.equal(r.theatre.uploads.length, 1);
  assert.equal(r.theatre.uploads[0].name, "clip.mp4");
  assert.ok(new Date(r.theatre.expiresAt).getTime() - Date.now() > 6 * 24 * 3600 * 1000);
  const gallery = m.listTheatreGallery();
  assert.ok(gallery.some((g) => g.requestId === r.requestId));
  // Simulate expiry and prove self-destruct.
  const stored = m.getMediaRequest(r.requestId);
  stored.theatre.expiresAt = new Date(Date.now() - 1000).toISOString();
  const purged = m.purgeExpired();
  assert.equal(purged.purged, 1);
  assert.equal(m.getMediaRequest(r.requestId), null);
});

test("theatre: send requires explicit authorization step (PIN enforced at route)", () => {
  const m = new MediaEngine({ eventBus: { publish() {} } });
  const r = m.generateFromCommand({ cmd: "CREATE VIDEO about ADE LANG:en 20 SEC" });
  assert.equal(r.theatre.delivery.sent, false);
  m.authorizeSend(r.requestId);
  const sent = m.markSent(r.requestId, ["YOUTUBE"]);
  assert.equal(sent.theatre.delivery.sent, true);
  assert.deepEqual(sent.theatre.delivery.destinations, ["YOUTUBE"]);
});

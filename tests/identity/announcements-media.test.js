import { test } from "node:test";
import assert from "node:assert/strict";
import { AnnouncementsManager, MAX_ANNOUNCEMENT_IMAGE_BYTES } from "../../src/identity/AnnouncementsManager.js";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=";
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

function memoryStore() {
  const state = new Map();
  return {
    async get(key, fallback) {
      return state.has(key) ? structuredClone(state.get(key)) : fallback;
    },
    async set(key, value) {
      state.set(key, structuredClone(value));
    }
  };
}

test("announcements: founder image, contact and link are validated and published", async () => {
  const announcements = new AnnouncementsManager({ store: memoryStore() });
  const created = await announcements.create({
    kind: "NEWS",
    title: "Founder media bulletin",
    body: "Image and contact test.",
    image: { dataUrl: PNG_DATA_URL, alt: "Founder desk" },
    contactNumber: "+234 803 123 4567",
    link: "https://example.com/announcement",
    createdBy: "founder"
  });

  assert.equal(created.status, "PUBLIC");
  assert.ok(created.publishedAt);
  assert.equal(created.contactNumber, "+2348031234567");
  assert.equal(created.contactVerified, false);
  assert.equal(created.contactSource, "FOUNDER_ENTERED");
  assert.equal(created.image.mimeType, "image/png");
  assert.equal(created.image.alt, "Founder desk");
  assert.ok(created.image.bytes > 0);
  assert.match(created.link, /^https:\/\/example\.com\//);

  const stats = await announcements.stats();
  assert.equal(stats.public, 1);
  assert.equal(stats.withImages, 1);
});

test("announcements: unsupported, mismatched and oversized images are rejected", async () => {
  const announcements = new AnnouncementsManager({ store: memoryStore() });

  await assert.rejects(
    () =>
      announcements.create({
        kind: "NEWS",
        title: "SVG rejection",
        image: { dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" }
      }),
    /ANNOUNCEMENT_IMAGE_INVALID/
  );

  await assert.rejects(
    () =>
      announcements.create({
        kind: "NEWS",
        title: "MIME mismatch",
        image: { dataUrl: `data:image/png;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xdb]).toString("base64")}` }
      }),
    /ANNOUNCEMENT_IMAGE_INVALID/
  );

  const oversized = Buffer.alloc(MAX_ANNOUNCEMENT_IMAGE_BYTES + 1);
  Buffer.from(PNG_DATA_URL.split(",")[1], "base64").copy(oversized);
  await assert.rejects(
    () =>
      announcements.create({
        kind: "NEWS",
        title: "Oversized image",
        image: { dataUrl: `data:image/png;base64,${oversized.toString("base64")}` }
      }),
    /ANNOUNCEMENT_IMAGE_TOO_LARGE/
  );
});

test("announcements: invalid contact, link and expiry fail closed", async () => {
  const announcements = new AnnouncementsManager({ store: memoryStore() });

  await assert.rejects(
    () => announcements.create({ kind: "NEWS", title: "Bad contact", contactNumber: "call-me" }),
    /ANNOUNCEMENT_CONTACT_INVALID/
  );
  await assert.rejects(
    () => announcements.create({ kind: "NEWS", title: "Bad link", link: "javascript:alert(1)" }),
    /ANNOUNCEMENT_LINK_INVALID/
  );
  await assert.rejects(
    () => announcements.create({ kind: "NEWS", title: "Bad expiry", expiresAt: "not-a-date" }),
    /ANNOUNCEMENT_EXPIRY_INVALID/
  );
});

test("announcements: draft, publish and expiry states are derived from server time", async () => {
  const announcements = new AnnouncementsManager({ store: memoryStore() });
  const draft = await announcements.create({
    kind: "BULLETIN",
    title: "Draft notice",
    active: false,
    image: { dataUrl: PNG_DATA_URL }
  });
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.publishedAt, null);
  assert.equal((await announcements.list()).length, 0);

  const published = await announcements.update(draft.id, { active: true });
  assert.equal(published.status, "PUBLIC");
  assert.ok(published.publishedAt);
  assert.equal((await announcements.list()).length, 1);

  const expired = await announcements.update(draft.id, { expiresAt: Date.now() - 1000 });
  assert.equal(expired.status, "EXPIRED");
  assert.equal((await announcements.list()).length, 0);

  const stats = await announcements.stats();
  assert.equal(stats.total, 1);
  assert.equal(stats.draft, 0);
  assert.equal(stats.expired, 1);
  assert.equal(stats.withImages, 1);
});

test("announcements: media fields survive the storage provider boundary", async () => {
  const store = memoryStore();
  const first = new AnnouncementsManager({ store });
  const created = await first.create({
    kind: "ADVERT",
    title: "Persistent media",
    image: { dataUrl: PNG_DATA_URL, alt: "Stored image" },
    contactNumber: "08031234567"
  });

  const second = new AnnouncementsManager({ store });
  const items = await second.list();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, created.id);
  assert.equal(items[0].image.alt, "Stored image");
  assert.equal(items[0].contactNumber, "+08031234567");
  assert.equal(items[0].contactVerified, false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { LocalStorageAdapter } = await import(
  pathToFileURL(path.resolve("src/storage/LocalStorageAdapter.js")).href
);
const { AnnouncementsManager } = await import(
  pathToFileURL(path.resolve("src/identity/AnnouncementsManager.js")).href
);

function tempStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-ann-test-"));
  const file = path.join(dir, "store.json");
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
  return new LocalStorageAdapter(file);
}

test("announcements: create, classify and list active public items only", async (t) => {
  const ann = new AnnouncementsManager({ store: tempStore(t) });
  await ann.create({ kind: "NEWS", title: "Community Edition published", body: "Public MVP live." });
  await ann.create({ kind: "BULLETIN", title: "Ops note", body: "Kernel is online.", active: false });
  await ann.create({ kind: "ANNOUNCEMENT", title: "Pilot intake open", body: "Register interest." });
  await ann.create({
    kind: "ADVERT",
    title: "Product Theater",
    body: "Explore media showing",
    expiresAt: Date.now() - 1000
  });

  const pub = await ann.list();
  assert.equal(pub.length, 2, "inactive and expired items are hidden from public");

  const admin = await ann.list(true);
  assert.equal(admin.length, 4);

  const stats = await ann.stats();
  assert.equal(stats.news, 1);
  assert.equal(stats.adverts, 1);
});

test("announcements: update, remove and reject invalid kind", async (t) => {
  const ann = new AnnouncementsManager({ store: tempStore(t) });
  const created = await ann.create({ kind: "NEWS", title: "First release" });
  const updated = await ann.update(created.id, { title: "First release v2", active: true });
  assert.equal(updated.title, "First release v2");

  const removed = await ann.remove(created.id);
  assert.equal(removed.id, created.id);
  assert.equal((await ann.list()).length, 0);

  await assert.rejects(
    () => ann.create({ kind: "SPAM", title: "Not allowed" }),
    /ANNOUNCEMENT_KIND_INVALID/
  );
  await assert.rejects(
    () => ann.update("NOPE", { title: "x" }),
    /ANNOUNCEMENT_NOT_FOUND/
  );
});

test("announcements: state persists through the provider boundary", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-ann-persist-"));
  const file = path.join(dir, "store.json");
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  const first = new AnnouncementsManager({ store: new LocalStorageAdapter(file) });
  const created = await first.create({ kind: "NEWS", title: "Persistent note" });

  const second = new AnnouncementsManager({ store: new LocalStorageAdapter(file) });
  const items = await second.list();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, created.id);
});
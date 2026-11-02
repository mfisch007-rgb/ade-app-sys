import { test, expect } from "@playwright/test";
import { FOUNDER, ensureFounder, loginFounderPage } from "./support/founder.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64"
);

function trackPageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe.serial("Founder console journey", () => {
  test.beforeEach(async ({ request }) => {
    await ensureFounder(request);
  });

  test("renders AWBULI, publishes public contact and announcement media", async ({ page }) => {
    const pageErrors = trackPageErrors(page);
    await loginFounderPage(page);
    await expect(page.getByTestId("founder-nav")).toBeVisible();
    await expect(page.getByRole("button", { name: "AWBULI", exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "AWBULI", exact: true }).first().click();
    await expect(page.getByTestId("awbuli-founder-tab")).toBeVisible();
    await page.getByTestId("awbuli-public-number").fill("+2348031234567");
    await page.getByTestId("awbuli-public-save").click();
    await expect(page.getByText(/Saved\. Public click-to-chat is published/)).toBeVisible();

    await page.getByRole("button", { name: "ANNOUNCEMENTS", exact: true }).first().click();
    await expect(page.getByTestId("announcement-title")).toBeVisible();
    const title = `E2E media announcement ${Date.now()}`;
    await page.getByTestId("announcement-title").fill(title);
    await page.getByTestId("announcement-body").fill("Published by the Playwright founder journey.");
    await page.getByTestId("announcement-link").fill("https://example.com/e2e-announcement");
    await page.getByTestId("announcement-contact").fill("+2348031234567");
    await page.getByTestId("announcement-image").setInputFiles({
      name: "e2e.png",
      mimeType: "image/png",
      buffer: PNG
    });
    await page.locator('img[alt="Announcement preview"]').waitFor();
    await page.getByTestId("announcement-publish").click();
    const card = page.getByTestId("announcement-card").filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card).toContainText("PUBLIC");
    await expect(card.locator("img")).toBeVisible();

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const publicCard = page.getByTestId("public-announcement").filter({ hasText: title });
    await expect(publicCard).toBeVisible();
    await expect(publicCard.locator("img")).toBeVisible();
    await expect(publicCard.getByRole("link", { name: "Read more" })).toHaveAttribute("href", "https://example.com/e2e-announcement");
    await expect(publicCard.getByRole("link", { name: "+2348031234567" })).toHaveAttribute("href", /wa\.me\/2348031234567/);
    await expect(page.getByTestId("awbuli-click-to-chat")).toBeVisible();
    await expect(page.getByTestId("awbuli-click-to-chat")).toHaveAttribute("href", /wa\.me\/2348031234567\?text=START/);
    expect(pageErrors).toEqual([]);
  });

  test("launches the Personal Browser on the blank provider and captures a screenshot", async ({ page }) => {
    const pageErrors = trackPageErrors(page);
    await loginFounderPage(page);
    await page.getByRole("button", { name: "PERSONAL BROWSER", exact: true }).first().click();
    await expect(page.getByTestId("personal-browser-tab")).toBeVisible();
    await expect(page.getByTestId("pb-status")).toHaveText("AVAILABLE");
    await page.getByTestId("pb-provider").selectOption("BLANK");
    await page.getByTestId("pb-launch").click();
    await expect(page.getByTestId("pb-session-state")).toHaveText("RUNNING");
    await page.getByTestId("pb-screenshot").click();
    await expect(page.getByTestId("pb-image")).toBeVisible();
    await page.getByTestId("pb-close").click();
    await expect(page.getByTestId("pb-launch")).toBeVisible();
    await expect(page.getByTestId("pb-session-state")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("enforces Founder, PIN and owner boundaries on the browser API", async ({ request }) => {
    const unauthenticated = await request.get("/api/v1/browser/status");
    expect(unauthenticated.status()).toBe(401);

    const baseLogin = await request.post("/api/v1/account/login", {
      data: { username: FOUNDER.username, password: FOUNDER.password }
    });
    expect(baseLogin.ok()).toBeTruthy();
    const baseToken = (await baseLogin.json()).token;
    const baseLaunch = await request.post("/api/v1/browser/sessions", {
      headers: { Authorization: `Bearer ${baseToken}` },
      data: { providerId: "BLANK", headless: true }
    });
    expect(baseLaunch.status()).toBe(403);
    expect((await baseLaunch.json()).error).toBe("ELEVATED_PIN_REQUIRED");

    const pin = await request.post("/api/v1/account/pin", {
      headers: { Authorization: `Bearer ${baseToken}` },
      data: { pin: FOUNDER.pin }
    });
    expect(pin.ok()).toBeTruthy();
    const token = (await pin.json()).token;
    const launch = await request.post("/api/v1/browser/sessions", {
      headers: { Authorization: `Bearer ${token}` },
      data: { providerId: "BLANK", headless: true }
    });
    expect(launch.status()).toBe(201);
    const session = (await launch.json()).session;
    expect(session.authenticated).toBe(false);
    expect(session.provider.id).toBe("BLANK");

    const screenshot = await request.get(`/api/v1/browser/sessions/${session.id}/screenshot`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(screenshot.status()).toBe(200);
    expect(screenshot.headers()["content-type"]).toContain("image/png");
    expect(screenshot.headers()["cache-control"]).toContain("no-store");

    const closed = await request.delete(`/api/v1/browser/sessions/${session.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(closed.ok()).toBeTruthy();

    const afterClose = await request.get(`/api/v1/browser/sessions/${session.id}/screenshot`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(afterClose.status()).toBe(404);

    const invalidImage = await request.post("/api/v1/announcements", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        kind: "NEWS",
        title: "Invalid SVG must fail",
        image: { dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" }
      }
    });
    expect(invalidImage.status()).toBe(400);
    expect((await invalidImage.json()).error).toBe("ANNOUNCEMENT_IMAGE_INVALID");
  });
});

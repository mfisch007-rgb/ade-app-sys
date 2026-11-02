import { expect } from "@playwright/test";

export const FOUNDER = Object.freeze({
  fullName: "E2E Founder",
  username: "e2e_founder",
  password: "E2e-Password-123",
  pin: "246810"
});

let provisionAttempted = false;

export async function ensureFounder(request) {
  if (provisionAttempted) return;
  const response = await request.post("/api/v1/workforce/provision-founder", { data: FOUNDER });
  if (![201, 401, 403, 409].includes(response.status())) {
    throw new Error(`Founder provisioning failed: ${response.status()} ${await response.text()}`);
  }
  provisionAttempted = true;
}

export async function loginBase(request) {
  await ensureFounder(request);
  const response = await request.post("/api/v1/account/login", {
    data: { username: FOUNDER.username, password: FOUNDER.password }
  });
  expect(response.ok(), `Founder login failed: ${response.status()} ${await response.text()}`).toBeTruthy();
  return (await response.json()).token;
}

export async function elevatedFounder(request) {
  const baseToken = await loginBase(request);
  const response = await request.post("/api/v1/account/pin", {
    headers: { Authorization: `Bearer ${baseToken}` },
    data: { pin: FOUNDER.pin }
  });
  expect(response.ok(), `Founder PIN elevation failed: ${response.status()} ${await response.text()}`).toBeTruthy();
  const elevated = await response.json();
  return { token: elevated.token, person: elevated.person };
}

export async function loginFounderPage(page) {
  await page.goto("/founder", { waitUntil: "domcontentloaded" });
  await page.getByTestId("founder-username").fill(FOUNDER.username);
  await page.getByTestId("founder-password").fill(FOUNDER.password);
  await page.getByTestId("founder-signin").click();
  await page.getByTestId("founder-stepup-pin").waitFor();
  await page.getByTestId("founder-stepup-pin").fill(FOUNDER.pin);
  await page.getByTestId("founder-elevate").click();
  await page.getByTestId("founder-nav").waitFor();
}

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("@playwright/test");

const FRONTEND = process.env.FRONTEND_BASE_URL || "http://127.0.0.1:3000";
const ADMIN_PASS = process.env.SEED_ADMIN_PASSWORD || "RotateMe_Admin_2026x1";
const CLIENT_PASS = process.env.SEED_CLIENT_PASSWORD || "RotateMe_Client_2026x1";

// ---------------------------------------------------------------------------
// Browser-based UI automation using Playwright + Chromium
// ---------------------------------------------------------------------------

test("browser: login page renders username and password fields", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(FRONTEND);
    await page.waitForSelector('input[type="password"]', { timeout: 8000 });
    const passwordInput = await page.$('input[type="password"]');
    assert.ok(passwordInput, "login page must have a password field");
    const textInput = await page.$('input:not([type="password"])');
    assert.ok(textInput, "login page must have a username field");
  } finally {
    await browser.close();
  }
});

test("browser: successful admin login shows authenticated shell with Logout button", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(FRONTEND);
    await page.waitForSelector('input[type="password"]', { timeout: 8000 });
    await page.fill('input:not([type="password"])', "administrator");
    await page.fill('input[type="password"]', ADMIN_PASS);
    await page.click('button[type="submit"]');
    await page.waitForSelector('button:has-text("Logout")', { timeout: 10000 });
    const logoutBtn = await page.$('button:has-text("Logout")');
    assert.ok(logoutBtn, "authenticated shell must show a Logout button");
  } finally {
    await browser.close();
  }
});

test("browser: authenticated shell displays username and role chips", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(FRONTEND);
    await page.waitForSelector('input[type="password"]', { timeout: 8000 });
    await page.fill('input:not([type="password"])', "administrator");
    await page.fill('input[type="password"]', ADMIN_PASS);
    await page.click('button[type="submit"]');
    await page.waitForSelector('.identity-chip', { timeout: 10000 });
    const chips = await page.$$('.identity-chip');
    assert.ok(chips.length >= 2, "shell must display username and role identity chips");
  } finally {
    await browser.close();
  }
});

test("browser: client role login does not expose a client selector dropdown", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(FRONTEND);
    await page.waitForSelector('input[type="password"]', { timeout: 8000 });
    await page.fill('input:not([type="password"])', "client");
    await page.fill('input[type="password"]', CLIENT_PASS);
    await page.click('button[type="submit"]');
    await page.waitForSelector('button:has-text("Logout")', { timeout: 10000 });
    const clientSelect = await page.$('select[aria-label="Client"], label:has-text("Client") select');
    assert.ok(!clientSelect, "client role must not see a client selector dropdown");
  } finally {
    await browser.close();
  }
});

test("browser: logout returns user to the login form", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(FRONTEND);
    await page.waitForSelector('input[type="password"]', { timeout: 8000 });
    await page.fill('input:not([type="password"])', "administrator");
    await page.fill('input[type="password"]', ADMIN_PASS);
    await page.click('button[type="submit"]');
    await page.waitForSelector('button:has-text("Logout")', { timeout: 10000 });
    await page.click('button:has-text("Logout")');
    await page.waitForSelector('input[type="password"]', { timeout: 8000 });
    const passwordField = await page.$('input[type="password"]');
    assert.ok(passwordField, "after logout the login form password field must be visible");
  } finally {
    await browser.close();
  }
});

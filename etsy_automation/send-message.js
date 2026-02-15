#!/usr/bin/env node
/**
 * Etsy message automation: send a specific message to order buyers with CSV tracking.
 * - Tracks who received the message so we never send the same message twice.
 * - Supports restart: skips orders already marked sent in the tracking CSV.
 * - Random delay between sends to reduce rate-limit risk.
 *
 * Usage: set env vars (see .env.example), then: node send-message.js [--dry-run] [--test]
 *   --dry-run  print pending count only; no browser, no writes
 *   --test     run full flow but skip clicking Send and do not write to tracking.csv
 */

import { chromium } from "playwright";
import { readFileSync, appendFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname);

config({ path: resolve(ROOT, ".env") });

const TRACKING_CSV = resolve(ROOT, "tracking.csv");
const ORDERS_CSV = resolve(ROOT, "orders.csv");
const DEFAULT_DELAY_MIN_MS = 8_000;
const DEFAULT_DELAY_MAX_MS = 22_000;

function env(name, def = undefined) {
  const v = process.env[name];
  if (v !== undefined && v !== "") return v;
  return def;
}

function randomDelay(minMs, maxMs) {
  const min = minMs ?? DEFAULT_DELAY_MIN_MS;
  const max = maxMs ?? DEFAULT_DELAY_MAX_MS;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parse CSV with header; returns array of objects (header -> row values). */
function parseCsv(path) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const obj = {};
    header.forEach((h, j) => (obj[h] = values[j] ?? ""));
    rows.push(obj);
  }
  return rows;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === "," && !inQuotes) || (c === "\n" && !inQuotes)) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function escapeCsv(val) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Ensure tracking CSV has header; append one row. */
function appendTrackingRow(orderId, buyerIdentifier, messageKey, status, sentAt) {
  const headerExists = existsSync(TRACKING_CSV);
  const line = [orderId, buyerIdentifier, messageKey, status, sentAt].map(escapeCsv).join(",") + "\n";
  if (!headerExists) {
    appendFileSync(TRACKING_CSV, "order_id,buyer_identifier,message_key,status,sent_at\n");
  }
  appendFileSync(TRACKING_CSV, line);
}

/** Load set of "order_id,message_key" that are already sent. */
function loadSentSet() {
  const rows = parseCsv(TRACKING_CSV);
  const set = new Set();
  for (const r of rows) {
    if ((r.status || "").toLowerCase() === "sent" && r.order_id && r.message_key) {
      set.add(`${r.order_id}\t${r.message_key}`);
    }
  }
  return set;
}

/** Load orders from orders.csv: order_id, buyer_identifier, order_url (optional). */
function loadOrders() {
  if (!existsSync(ORDERS_CSV)) {
    console.error("Missing orders.csv. Create it with columns: order_id, buyer_identifier, order_url (order_url optional).");
    process.exit(1);
  }
  return parseCsv(ORDERS_CSV).filter((r) => r.order_id && r.order_id.trim());
}

function getMessageText() {
  const fromFile = env("MESSAGE_FILE");
  if (fromFile) {
    const path = resolve(ROOT, fromFile);
    if (existsSync(path)) return readFileSync(path, "utf-8").trim();
    console.error("MESSAGE_FILE not found:", path);
    process.exit(1);
  }
  const text = env("MESSAGE_TEXT");
  if (text) return text;
  console.error("Set MESSAGE_TEXT or MESSAGE_FILE in .env");
  process.exit(1);
}

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  const testMode = process.argv.includes("--test");
  const messageKey = env("MESSAGE_KEY", "default");
  const messageText = getMessageText();
  const email = env("ETSY_EMAIL");
  const password = env("ETSY_PASSWORD");
  const ordersBaseUrl = env("ORDERS_BASE_URL", "https://www.etsy.com/your/orders/sold/open");
  const delayMin = Number(env("DELAY_MIN_MS", String(DEFAULT_DELAY_MIN_MS))) || DEFAULT_DELAY_MIN_MS;
  const delayMax = Number(env("DELAY_MAX_MS", String(DEFAULT_DELAY_MAX_MS))) || DEFAULT_DELAY_MAX_MS;

  const useExistingBrowser = env("USE_EXISTING_BROWSER", "").toLowerCase() === "true";
  const browserCdpUrl = env("BROWSER_CDP_URL", "http://localhost:9222");

  if (!useExistingBrowser && (!email || !password)) {
    console.error("Set ETSY_EMAIL and ETSY_PASSWORD in .env (or use USE_EXISTING_BROWSER=true)");
    process.exit(1);
  }

  const sentSet = loadSentSet();
  const allOrders = loadOrders();
  const pending = allOrders.filter((o) => !sentSet.has(`${o.order_id}\t${messageKey}`));

  console.log("Message key:", messageKey);
  console.log("Total orders in orders.csv:", allOrders.length);
  console.log("Already sent for this message key:", allOrders.length - pending.length);
  console.log("Pending to process:", pending.length);
  if (dryRun) {
    console.log("Dry run: no browser, no writes.");
    pending.slice(0, 5).forEach((o) => console.log("  Would process:", o.order_id, o.buyer_identifier || ""));
    if (pending.length > 5) console.log("  ... and", pending.length - 5, "more");
    return;
  }
  if (testMode) {
    console.log("Test mode: full flow but will NOT click Send and will NOT update tracking.csv.");
  }
  if (pending.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let browser;
  let page;

  if (useExistingBrowser) {
    console.log("Connecting to existing browser at", browserCdpUrl, "...");
    try {
      browser = await chromium.connectOverCDP(browserCdpUrl);
    } catch (err) {
      console.error("Could not connect to browser (ECONNREFUSED). Either:");
      console.error("  1. Start Chrome with remote debugging, then run this again:");
      console.error("     chromium --remote-debugging-port=9222");
      console.error("     (or on Windows: \"C:\\...\\chrome.exe\" --remote-debugging-port=9222)");
      console.error("  2. Or in .env set USE_EXISTING_BROWSER=false and set ETSY_EMAIL/ETSY_PASSWORD so the script launches its own browser.");
      process.exit(1);
    }
    const context = browser.contexts()[0];
    const pages = context.pages();
    page = pages.find((p) => p.url().includes("etsy.com")) || pages[0];
    if (!page) {
      console.error("No Etsy tab found. Open Etsy (e.g. Shop Manager) in the browser and try again.");
      process.exit(1);
    }
    console.log("Using tab:", page.url());
  } else {
    browser = await chromium.launch({ headless: env("HEADLESS", "true") !== "false" });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0",
      viewport: { width: 1280, height: 720 },
    });
    page = await context.newPage();
    await page.goto("https://www.etsy.com/signin", { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(2000);
    await page.fill('input[name="email"]', email);
    await page.click('button[type="submit"]');
    await sleep(2000);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/etsy\.com/, { timeout: 15000 }).catch(() => {});
    await sleep(3000);
  }

  try {
    for (let i = 0; i < pending.length; i++) {
      const order = pending[i];
      const orderId = order.order_id;
      const buyerId = order.buyer_identifier || orderId;
      const orderUrl = order.order_url?.trim();

      console.log(`[${i + 1}/${pending.length}] Order ${orderId} ...`);

      try {
        if (orderUrl) {
          await page.goto(orderUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        } else {
          await page.goto(ordersBaseUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
          const link = await page.locator(`a[href*="${orderId}"], a[href*="/receipts/"]`).first();
          await link.click({ timeout: 8000 }).catch(() => {});
          await sleep(2000);
        }

        const messageBtn = page.locator('a[href*="conversations"], button:has-text("Message"), [aria-label*="Message"], a:has-text("Message")').first();
        await messageBtn.click({ timeout: 8000 });
        await sleep(2000);

        const textarea = page.locator('textarea, [contenteditable="true"]').first();
        await textarea.fill(messageText);
        await sleep(500);

        if (!testMode) {
          const sendBtn = page.locator('button:has-text("Send"), button[type="submit"], [aria-label*="Send"]').first();
          await sendBtn.click({ timeout: 5000 });
          await sleep(1500);
          appendTrackingRow(orderId, buyerId, messageKey, "sent", new Date().toISOString());
          console.log(`  Sent to ${buyerId}.`);
        } else {
          console.log(`  Test: message filled for ${buyerId} (Send skipped).`);
        }
      } catch (err) {
        console.error(`  Error:`, err.message);
        if (!testMode) appendTrackingRow(orderId, buyerId, messageKey, "failed", new Date().toISOString());
      }

      if (i < pending.length - 1) {
        const delay = randomDelay(delayMin, delayMax);
        console.log(`  Waiting ${Math.round(delay / 1000)}s before next...`);
        await sleep(delay);
      }
    }
  } finally {
    if (!useExistingBrowser) await browser.close();
    else console.log("Left browser open (existing-tab mode).");
  }

  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

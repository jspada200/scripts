# Etsy message automation

Browser automation to send a specific message to Etsy order buyers. Uses a CSV to track who has already received the message so you never send it twice, and supports restarting the script safely.

## Features

- **CSV tracking** — `tracking.csv` records each order, message key, and status (`sent` / `failed`). You can see who did and did not get the message.
- **No duplicate sends** — For a given `MESSAGE_KEY`, the script skips any order already marked `sent` in `tracking.csv`.
- **Restart-safe** — Re-run the script anytime; it will only process orders that have not yet been sent for that message key.
- **Random rate limiting** — Configurable random delay between each message (default 8–22 seconds) to reduce rate-limit and anti-bot risk.
- **Dry run** — Use `--dry-run` to see how many orders would be processed without starting the browser or writing to the tracking file.

## Setup

1. **Node.js** — Use Node 18+ (or 20+).

2. **Install dependencies and browser**

   ```bash
   cd etsy_automation
   npm install
   npx playwright install chromium
   ```

3. **Configure environment**

   - Copy `.env.example` to `.env`.
   - Set `ETSY_EMAIL`, `ETSY_PASSWORD`, and either `MESSAGE_TEXT` or `MESSAGE_FILE`.
   - Set `MESSAGE_KEY` to a unique name for this message (e.g. `thank_you_2025`). Use a new key when you send a different message so the script won’t resend the old one.

4. **Orders list**

   - Create `orders.csv` with columns: `order_id`, `buyer_identifier`, `order_url` (optional).
   - See `orders.csv.example`. You can export order IDs from Etsy or build the list yourself. If you include `order_url`, the script opens each order directly; otherwise it uses the orders list page to find the order.

## Usage

```bash
npm run send
# or
node send-message.js
```

- **Dry run (no browser, no writes):**

  ```bash
  node send-message.js --dry-run
  ```

- **Test mode (browser runs, message is filled, Send is skipped):**  
  Use this to check that the script finds the Message button and textarea without sending or updating the tracking CSV.

  ```bash
  node send-message.js --test
  ```

- **Use an existing tab (sign in by hand first):**
  1. Start Chrome with remote debugging:  
     `chromium --remote-debugging-port=9222`  
     (On Windows: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222`)
  2. In that browser, sign in to Etsy and open Shop Manager (e.g. Orders).
  3. In `.env` set `USE_EXISTING_BROWSER=true` (and optionally `BROWSER_CDP_URL=http://localhost:9222`).
  4. Run the script. It will attach to the existing browser, use the first Etsy tab (or the first tab), and skip the login step. The browser stays open when the script finishes.

- **Watch the browser (debug):** In `.env` set `HEADLESS=false`, then run the script.

## Files

| File | Purpose |
|------|--------|
| `orders.csv` | List of orders to message: `order_id`, `buyer_identifier`, optional `order_url`. You create this. |
| `tracking.csv` | Created/updated by the script. Tracks `order_id`, `buyer_identifier`, `message_key`, `status`, `sent_at`. Use it to see who got the message and who didn’t. |
| `.env` | Your credentials and message (copy from `.env.example`). Do not commit. |

## How tracking and restart work

- Before sending, the script loads `tracking.csv` and builds a set of `(order_id, message_key)` that already have status `sent`.
- It then filters `orders.csv` to only rows that are **not** in that set for the current `MESSAGE_KEY`.
- After each send (or failure), it appends one row to `tracking.csv`.
- If you stop the script and run it again, it will skip all orders already marked `sent` for that `MESSAGE_KEY` and continue with the rest.

To send a **different** message later, set a new `MESSAGE_KEY` in `.env` and optionally add more orders to `orders.csv`. The script will only send the new message to orders that don’t already have a `sent` row for that new key.

## Random limiting

- Between each message, the script waits a random number of milliseconds between `DELAY_MIN_MS` and `DELAY_MAX_MS` (default 8000–22000).
- This helps avoid sending the same message many times in a short period and may reduce the chance of rate limits or blocks. You can tune these in `.env`.

## Caveats

- **Etsy ToS** — Automating the seller site may violate Etsy’s terms. Use at your own risk; consider checking with Etsy.
- **UI changes** — If Etsy updates Shop Manager, selectors in the script may break and will need to be updated.
- **Credentials** — Keep `.env` out of version control and store credentials securely.

## Optional env vars

- `USE_EXISTING_BROWSER=true` — Connect to an existing browser (see “Use an existing tab” above). No login in script; you sign in by hand first.
- `BROWSER_CDP_URL` — CDP URL when using existing browser. Default: `http://localhost:9222`.
- `MESSAGE_FILE` — Path (relative to this folder) to a file whose contents are the message text. Alternative to `MESSAGE_TEXT`.
- `ORDERS_BASE_URL` — Base URL for the orders list if you don’t provide `order_url` in `orders.csv`. Default: `https://www.etsy.com/your/orders/sold/open`.
- `DELAY_MIN_MS` / `DELAY_MAX_MS` — Min and max delay in ms between sends.
- `HEADLESS=false` — Run the browser visible for debugging.

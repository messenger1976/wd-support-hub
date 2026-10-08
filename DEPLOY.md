# WD Support Hub — production deploy

The v2 hub is a **Node.js** app (Express API + built React UI) on **MySQL**. It needs a host that can run a long-lived Node process: a VPS, or cPanel **Setup Node.js App** (Passenger). Plain PHP-only shared hosting cannot run it.

## First-time server setup

1. **Upload the repo** (git clone/pull, or upload). The `node_modules/`, `web/dist/` and `server/.env` folders are not in git.
2. **Install and build** on the server (repo root):
   ```bash
   npm ci
   npm run build
   ```
3. **Create `server/.env`** from `server/.env.example`:
   - `APP_ENV=production`, `BASE_URL=https://support-hub.example.com/`, `APP_TIMEZONE=Asia/Manila`
   - DB credentials for `wd_support_hub`
   - a long random `JWT_SECRET`
   - `SMTP_*` / `MAIL_FROM*` for forgot-password email
   - `FIREBASE_*` (see README → Firebase setup). Store the service-account JSON **outside** the web root.
   - `TRUST_PROXY=1` when behind Apache/Nginx/Passenger
4. **Database:** new install → `sql/install_hub.sql`. Existing hub database → run, in order and only those not yet applied, `sql/add_password_reset.sql`, `sql/add_push_tokens.sql` and `sql/add_admin_modules.sql`. Existing tickets, messages and users carry over; existing users become **Administrator** with all WDs. **Back up the database first** — `add_admin_modules.sql` alters `wd_support_company`, `wd_support_hub_user`, `wd_support_ticket` and `wd_support_message` and is not meant to be run twice.
5. **Attachments:** `uploads/` (or `UPLOAD_DIR`) must be writable by the Node process. Old attachment paths written by the PHP hub are found automatically, even if the absolute path changed.
6. **Start:** `npm start` (repo root) under a process manager:
   - VPS: `pm2 start npm --name wd-support-hub -- start`, with a reverse proxy (Nginx/Apache) from HTTPS to `PORT`.
   - cPanel Node.js App: application root = repo, startup file = `server/src/index.js`.
7. **HTTPS is required** for Firebase web push and for installing the hub as an app (PWA) — browsers only allow both on secure origins.
8. **Sign in** at `BASE_URL`: default **superadmin** / **SuperAdmin@2026** — change it under **My account**. Click **Enable notifications**.
9. **Staff:** **Users → Add user** for each support person. Pick a role (Support Agent for day-to-day support, Viewer for management read-only) and the WDs they handle. Adjust roles under **Roles & Permissions** if needed.

## Installable app (PWA) and branding

- Logo source: `web/public/logo.svg` (rounded tile) and `web/public/icons/maskable.svg` (full-bleed, for Android/iOS masks). `favicon.ico` and the PNG icons in `web/public/icons/` are rendered from these two SVGs — re-render them if the logo changes.
- Sign-in photo: `web/public/img/water-hero*.webp`, from "Ocean ripple" by Matt Hardy (Wikimedia Commons / Unsplash), **CC0 public domain**.
- There is **one** service worker at scope `/`: the server-generated `/firebase-messaging-sw.js`, which always imports `web/public/pwa-sw.js` (caching) and adds Firebase Messaging when `FIREBASE_*` is set. Do not register a second worker at `/` — it would replace this one and stop background push.
- `pwa-sw.js` never caches `/api/*` (tickets, messages, attachments). Pages are network-first with `offline.html` as fallback; `/assets/*` is cache-first. Bump `PWA_VERSION` in `pwa-sw.js` to drop old caches.

## Cut-over from the PHP hub

1. Deploy the Node hub against the **same** database and `uploads/` folder.
2. Change `ms_hub_url` in each WD app's `application/config/message_support.php` to the Node hub URL. No other WD change is needed: `api.php?action=push|poll` and `/api/push|poll` behave as before.
3. Run the smoke test below for each WD.
4. Once stable, remove the legacy PHP files (`index.php`, `api.php`, `lib.php`, `config.php`, `config.php.sample`, `.htaccess`). Until then, keep the legacy PHP inbox (`index.php`) off the public web: it does not apply roles, WD scoping or the audit log. The legacy `api.php` does refuse deactivated WDs.

Rollback: point `ms_hub_url` back at the PHP hub. Both versions read and write the same tables.

## GitHub Actions (FTP)

Workflow: `.github/workflows/main.yml` still FTP-deploys the **legacy PHP hub** only. It excludes `server/`, `web/` and `package*.json`, so Node source is not uploaded into a PHP web root. Replace it with a Node deploy (SSH + `npm ci && npm run build` + restart) once the production host is chosen.

## Onboarding a Water District (WD Setup)

1. **WD Setup → Add Water District:** code (uppercase, permanent), name, short name, ticket prefix, contact person, the WD app URL and SLA targets. A random API token is generated.
2. **Connection tab:** copy the generated `message_support.php` into the WD app at `application/config/message_support.php` (it carries `ms_hub_url` = this hub's `BASE_URL` and the WD's token), then follow the install checklist on the same tab (plugin files, `client-plugin/sql/install.sql`, menu + role key, outbound HTTP).
3. Give the WD's support staff access: **Users → (user) → Water District access**, unless they already have all WDs.
4. The Connection tab turns **Online** once the WD app has polled the hub in the last 5 minutes.

Other actions:

- **Rotate token** (Connection tab) — the old token stops working at once; paste the new config into the WD app straight after.
- **Deactivate** — the WD app's token is refused (it shows "deactivated on the support hub"); tickets and history stay and remain reportable. **Activate** reverses it.
- **Delete** — only while the WD has no tickets (e.g. a WD added by mistake). Type the WD code to confirm.

## Smoke test

1. WD app → Message Support → create a ticket.
2. Hub: a push notification arrives (if enabled), the ticket appears in the inbox and the dashboard's **Needs a hub reply** count rises. Reply.
3. The WD thread shows the reply within ~8 seconds (WD poll interval).
4. **WD Setup** shows the WD as **Online**; **Reports → Ticket Register** lists the ticket.

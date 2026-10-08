# WD Support Hub (Super Admin Vendor Hub)

Central vendor support hub that receives tickets and messages from Water District billing applications (Labason, Roxas, etc.).

## Architecture (v2)

| Part | Stack | Folder |
|------|-------|--------|
| Super Admin UI | React 18 + Vite + Bootstrap 4 | `web/` |
| API + WD client API | Node.js (Express 5) | `server/` |
| Storage | MySQL — same `wd_support_hub` schema as the PHP hub | `sql/` |
| Notifications | Firebase Cloud Messaging (web push to Super Admin browsers) | `server/src/firebase.js`, `web/src/push.js` |
| Attachments | Files on disk, `uploads/{COMPANY}/{ticket-uuid}/` | `uploads/` |

- **Client systems:** the CodeIgniter 2 billing apps (`labasonsandbox`, `waterbilling1`) are unchanged. They keep calling `{hub}api.php?action=push` / `api.php?action=poll` with a Bearer company token; the Node server answers on those same URLs (and `/api/push`, `/api/poll`). Only `ms_hub_url` in each WD's `message_support.php` has to point at the Node hub.
- **Notifications:** when a WD pushes a new ticket or client message, the hub sends a Firebase web push to every Super Admin browser that clicked **Enable notifications**. Clicking it opens the ticket. While the inbox is open it also refreshes immediately and shows an in-page toast. The 8-second poll stays as a fallback.
- **Legacy PHP hub** (`index.php`, `api.php`, `lib.php`, `config.php`, `.htaccess`) is kept for side-by-side running and rollback during cut-over. Both versions share the same database and `uploads/`. The legacy `api.php` also refuses deactivated WDs and records resolved/closed times, so WD apps can stay on either endpoint. The legacy PHP **inbox UI** (`index.php`) knows nothing about roles, WD scoping or the audit log — do not expose it once the Node hub is live, and remove the PHP files after cut-over.

## Modules (v3)

| Menu | What it does | Permission keys |
|------|--------------|-----------------|
| **Dashboard** | KPIs (needs reply, past SLA, active, mine, new, resolved, avg first response / resolution, WDs online), ticket trend, status / category / priority / per-WD charts, needs-attention list, WD health, busiest hours. Period + WD filter. | `dashboard.view` |
| **Inbox** | Tickets from every WD the user may see. Filters (WD, status, Mine / Unassigned, search), SLA badges, assign, Resolved / Close / Reopen, reply with attachment. Mobile: list → thread. | `inbox.view`, `inbox.reply`, `inbox.status`, `inbox.assign` |
| **Reports** | WD Summary, Ticket Register, Response & Resolution Time (SLA), Issue Category Analysis, Backlog Aging, Staff Performance, WD Connectivity & Setup. Sortable tables, charts, **Export CSV** (opens in Excel), Print. | `reports.view`, `reports.export` |
| **WD Setup** | Add a Water District, edit its profile / contact / ticket prefix / SLA targets, see its connection status, reveal or rotate its API token, copy the ready-made `message_support.php`, follow the install checklist. **Deactivate** refuses its token (tickets kept); **Delete** is only possible while it has no tickets. | `companies.view`, `.create`, `.edit`, `.deactivate`, `.token` |
| **Users** | Hub staff: role, active / disabled, password reset, and which WDs each user handles (all, or a chosen list). | `users.view`, `users.manage` |
| **Roles & Permissions** | Editable roles with a per-module permission grid. Seeds: **Administrator** (always full access), **Support Agent**, **Viewer**. Nobody can grant a permission they do not hold; the last active Administrator cannot be removed. | `roles.manage` |
| **Audit Log** | Sign-ins, WD / token / user / role changes, ticket status and assignment changes, report exports. Secrets are never logged. | `audit.view` |
| **My account** | Own name, email and password. | (everyone) |

SLA: each WD has a first-response and a resolution target (default 4 h / 72 h). A ticket's first hub reply sets `first_response_at`; Resolved / Closed set `resolved_at` / `closed_at`.

### Server layout

- `server/src/index.js` — Express app, SPA hosting, generated `firebase-messaging-sw.js`
- `server/src/routes/clientApi.js` — WD push/poll API (port of `api.php`); refuses deactivated WDs
- `server/src/routes/hubAuth.js` — sign in, sign out, forgot/reset password, own profile, change password
- `server/src/routes/hubInbox.js` — scoped companies, tickets, thread, reply, status, assign, attachments, push tokens
- `server/src/routes/hubDashboard.js` — dashboard analytics (`server/src/analytics.js` holds the shared SQL)
- `server/src/routes/hubCompanies.js` — WD Setup (CRUD, token, connection snippet)
- `server/src/routes/hubReports.js` — reports as JSON or CSV
- `server/src/routes/hubUsers.js` — users and roles
- `server/src/routes/hubAudit.js` — audit log
- `server/src/permissions.js` — permission catalogue, `requirePerm`, WD scoping, `audit()`
- `server/src/auth.js` — bcrypt (reads PHP `$2y$` hashes), httpOnly JWT session cookie, role + WD scope loading
- `server/src/firebase.js` — Firebase Admin SDK, token storage, multicast send (only to users who can see that WD)
- `server/src/mail.js` — password reset email over SMTP (nodemailer)

## Local setup

Requires Node.js 18.18+ and MySQL (XAMPP is fine).

1. **Database:** import `sql/install_hub.sql` (new install), or on an existing hub DB run, in order and only those not yet applied: `sql/add_password_reset.sql`, `sql/add_push_tokens.sql`, `sql/add_admin_modules.sql` (v3: roles, user WD scope, WD profile/SLA, ticket assignment + SLA times, audit log). Existing hub users become **Administrator** with access to all WDs.
2. **Config:** copy `server/.env.example` → `server/.env`. Set the DB credentials, `APP_ENV=local`, `BASE_URL=http://localhost:5173/` for dev, and a `JWT_SECRET`.
3. **Install:** `npm install` (repo root; installs `server` and `web` workspaces).
4. **Run (dev):** `npm run dev` → API on http://localhost:3000, UI on http://localhost:5173 (Vite proxies `/api`, `/api.php` and the service worker to the API).
5. **Run (production-style):** `npm run build && npm start` → everything on http://localhost:3000.
6. **Default login:** `superadmin` / `SuperAdmin@2026` (`superadmin@example.com`). Change the password after first login.
7. **Forgot password:** set `SMTP_*` in `server/.env`. With `APP_ENV=local` and no working SMTP, the reset link is shown on screen.
8. **Point a WD app at the Node hub:** **WD Setup → (WD) → Connection** shows the WD's `message_support.php` with the right `ms_hub_url` and token — copy it into `{app}/application/config/message_support.php`.

**New hub users:** **Users → Add user** (role + Water District access). The `npm run hash-password -w server -- "NewPassword123"` script is only needed for recovery when nobody can sign in.

## Firebase setup (push notifications)

1. Create (or reuse) a Firebase project → add a **Web app**.
2. **Project settings → General → Your apps:** copy `apiKey`, `authDomain`, `projectId`, `messagingSenderId`, `appId` into `FIREBASE_*` in `server/.env`.
3. **Project settings → Cloud Messaging → Web Push certificates:** generate a key pair and copy it into `FIREBASE_VAPID_KEY`.
4. **Project settings → Service accounts → Generate new private key:** save the JSON outside the web root (never commit it). Set `FIREBASE_SERVICE_ACCOUNT_PATH` to that file, or put the JSON itself in `FIREBASE_SERVICE_ACCOUNT_JSON`.
5. Restart the server. It logs `[firebase] push notifications enabled`. In the inbox, click **Enable notifications** and allow the browser prompt.

Web push requires HTTPS, except on `localhost`. With no Firebase settings the hub runs normally without notifications.

Registered companies (`wd_support_company`; add more under **WD Setup**):

- `LABASON` (`token: labason-ms-7f3c9a2e1b4d6805c8e0`)
- `ROXAS` (`token: roxas-ms-4e8b1c7a9d2f5603a1b9`)

**Production:** see [DEPLOY.md](DEPLOY.md).

## Client Plugin Package

The `client-plugin/` folder contains the copy-paste plugin pack to install the **Message Support** module onto any Water District billing application (CodeIgniter). It still targets PHP/CodeIgniter because the WD apps are PHP; it works with both the Node and the legacy PHP hub.

- `client-plugin/application/modules/master/...` — Controller, model, view
- `client-plugin/config/message_support.php` — Configuration template
- `client-plugin/sql/install.sql` — Client database schema
- `client-plugin/INSTALL.md` — Step-by-step installation instructions

# WD Support Hub — production deploy

Lightweight PHP app (no CodeIgniter). Deploy the repo root to the web host.

## First-time server setup

1. **Upload files** via git/FTP (GitHub Actions pushes on `main`/`master`; see below).
2. **Create `config.php`** — copy from `config.php.sample`, set DB credentials, `base_url`, and `sa4_url`. This file is **not** overwritten by CI deploy.
3. **Import SQL** — run `sql/install_hub.sql` on the server MySQL (creates `wd_support_hub` + seed companies/user).
4. **Ensure directories exist and are writable:**
   - `uploads/` (755 or 775; web user must write here for attachments)
5. **Verify `.htaccess`** is present so `/api/push` and `/api/poll` route to `api.php`. If the hub lives in a subfolder, edit `RewriteBase` in `.htaccess`.
6. **Sign in** at `{base_url}` — default **superadmin** / **SuperAdmin@2026** (change password in DB after first login).

## GitHub Actions (FTP)

Workflow: `.github/workflows/main.yml`

| Deployed | Excluded (manual on server) |
|----------|----------------------------|
| PHP, `.htaccess`, `uploads/index.html`, `client-plugin/`, SQL | `config.php` (secrets) |
| | `uploads/*` except `index.html` (user attachments) |

After each deploy, confirm `config.php` still exists on the server.

## WD client config

Each Water District app needs `application/config/message_support.php`:

- `ms_hub_url` — must match this hub’s `base_url`
- `ms_api_token` — must match a row in `wd_support_company.token`

Register new companies in SQL:

```sql
INSERT INTO wd_support_company (code, name, token, created_at)
VALUES ('NEWWD', 'New Water District', 'unique-token-here', NOW());
```

## Smoke test

1. WD app → Message Support → create a ticket.
2. Hub inbox → ticket appears → reply.
3. WD thread shows the reply within ~8 seconds (poll interval).

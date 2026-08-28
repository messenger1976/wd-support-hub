# WD Support Hub (Super Admin Vendor Hub)

Central vendor support hub that receives tickets and messages from Water District billing applications (Labason, Roxas, etc.).

## Architecture

- **Hub Type:** Lightweight standalone PHP Web App + REST API (using SmartAdmin 4 layout).
- **Client Systems:** CodeIgniter 2 billing applications (`labasonsandbox`, `waterbilling1`) communicate with this hub via `api.php`.

## Core Files

- `index.php` — Super Admin UI (SmartAdmin 4 layout, ticket thread viewer, reply box, status updater).
- `api.php` — REST API endpoint for clients to push/poll tickets, messages, and attachments.
- `lib.php` — Database abstraction, session management, authentication helpers, UUID generator.
- `config.php` — Database credentials (`wd_support_hub`), `base_url`, and SmartAdmin 4 resource paths.
- `sql/install_hub.sql` — Database schema for `wd_support_hub` (`wd_support_company`, `wd_support_hub_user`, `wd_support_ticket`, `wd_support_message`).
- `uploads/` — Storage directory for ticket attachments organized by company code (e.g. `uploads/LABASON/`).

## Setup & Installation

**Local:** copy `config.php.sample` → `config.php`, then:

1. **Database:** Import `sql/install_hub.sql` into MySQL.
2. **Default Login:**
   - **Username:** `superadmin`
   - **Password:** `SuperAdmin@2026`
3. **Companies:** Registered in `wd_support_company`:
   - `LABASON` (`token: labason-ms-7f3c9a2e1b4d6805c8e0`)
   - `ROXAS` (`token: roxas-ms-4e8b1c7a9d2f5603a1b9`)

**Production:** see [DEPLOY.md](DEPLOY.md) (FTP deploy, `config.php` on server, `uploads/` permissions).

## Client Plugin Package

The `client-plugin/` folder contains the copy-paste plugin pack to install the **Message Support** module onto any Water District billing application (CodeIgniter):
- `client-plugin/application/modules/master/...` — Controller, model, view
- `client-plugin/config/message_support.php` — Configuration template
- `client-plugin/sql/install.sql` — Client database schema
- `client-plugin/INSTALL.md` — Step-by-step installation instructions

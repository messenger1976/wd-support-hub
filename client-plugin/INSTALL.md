# Message Support plugin — install

Copy-install pack for any Water District CodeIgniter 2 app (`master` module). There is no auto-loader.

## 1. Files

Copy from this pack:

| From | To |
|------|----|
| `application/modules/master/controllers/messagesupport.php` | `{app}/application/modules/master/controllers/` |
| `application/modules/master/models/messagesupport_model.php` | `{app}/application/modules/master/models/` |
| `application/modules/master/views/messagesupport.php` | `{app}/application/modules/master/views/` |
| `config/message_support.php` | `{app}/application/config/message_support.php` |

Edit `message_support.php`: `ms_company_code`, `ms_company_name`, `ms_ticket_prefix`, `ms_hub_url`, `ms_api_token` (must match a row in the hub `wd_support_company` table).

Create `{app}/uploads/message_support/` (writable).

## 2. SQL

Run `sql/install.sql` on the **company** database (creates tables + `tbl_responsibilities.message_support`).

## 3. Roles + sidebar

See `patches/NAV_AND_PERMISSIONS.md`. Add key `message_support` to:

- `responsibilities::module_name()` and `module_groups()` (group **Support**)
- `responsibilities_model::module_name()`
- `adminheader_model::module_name()`
- `application/views/admin-includes/navigation.php`

Admin (`usertype == admin`) always has access. Sub-admins need `message_support = 1`.

## 4. Hub (once per vendor machine)

1. Copy `c:\xampp\htdocs\wd-support-hub` (or this pack’s `hub/` files) onto the Super Admin host.
2. Run `sql/install_hub.sql` (creates database `wd_support_hub`).
3. Open `http://localhost/wd-support-hub/`
4. Sign in: **superadmin** / **SuperAdmin@2026** (change after first login).
5. Register each new WD in `wd_support_company` (`code`, `name`, `token`) and put the same token in that WD’s `message_support.php`.

Default companies:

| Code | Token |
|------|--------|
| LABASON | `labason-ms-7f3c9a2e1b4d6805c8e0` |
| ROXAS | `roxas-ms-4e8b1c7a9d2f5603a1b9` |

WD apps must be able to **outbound HTTP** to the hub (`api/push`, `api/poll`).

## 5. Smoke test

1. Log into the WD as admin → **Message Support** → New ticket.
2. Log into the hub → ticket appears → reply.
3. Back in the WD, the thread should show the Super Admin reply within ~8 seconds.

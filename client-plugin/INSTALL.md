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

1. Copy `c:\xampp\htdocs\wd-support-hub` onto the Super Admin host. It is a Node.js app since v2; see the hub `README.md` / `DEPLOY.md`.
2. Run `sql/install_hub.sql` (creates database `wd_support_hub`).
3. Configure `server/.env`, then `npm install && npm run build && npm start`. Open `http://localhost:3000/`.
4. Sign in: **superadmin** / **SuperAdmin@2026** (change it under **My account**).
5. Register each new WD under **WD Setup → Add Water District**. Its **Connection** tab generates the complete `message_support.php` (hub URL, company code, ticket prefix and API token) — copy that file into the WD app instead of editing the template by hand. A deactivated WD's token is refused until it is activated again.

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

---

# Message Board plugin — install

Shows the hub's **Message Board** announcements inside the WD app: a draggable one-line ticker on every
page, a "what's new" popup on the first dashboard view after sign-in, and an **Announcements** page.
It reuses Message Support's `message_support.php` (same `ms_hub_url` and `ms_api_token`), so install
Message Support first. Every signed-in user can read the board, so there is no permission column.

## 1. Files

| From | To |
|------|----|
| `application/modules/master/controllers/messageboard.php` | `{app}/application/modules/master/controllers/` |
| `application/modules/master/models/messageboard_model.php` | `{app}/application/modules/master/models/` |
| `application/modules/master/views/messageboard.php` | `{app}/application/modules/master/views/` |
| `application/modules/master/views/messageboard_popup.php` | `{app}/application/modules/master/views/` |
| `application/views/admin-includes/messageboard_ticker.php` | `{app}/application/views/admin-includes/` |
| `assets/messageboard/*` (css + 2 js) | `{app}/assets/messageboard/` |
| `sql/message_board_install.sql` | `{app}/sql/` |

Add to `{app}/application/config/message_support.php`:

```php
$config['ms_board_enabled'] = TRUE;
$config['ms_board_refresh_minutes'] = 5;
```

## 2. SQL

Run `sql/message_board_install.sql` on the **company** database (`tbl_board_message`, `tbl_board_user_pref`,
`tbl_board_receipt_queue`, `tbl_board_state`). Until it runs, the ticker, popup and menu item stay hidden.

## 3. Hooks (four one-line edits)

1. `application/views/admin-includes/header.php` — right after `</header>`:
   `<?php include __DIR__ . '/messageboard_ticker.php'; ?>`
2. `application/modules/master/controllers/master.php` → `index()` — after `get_admininfo_details()` and
   before the dashboard redirect: `$this->session->set_userdata('mb_popup_pending', 1);`
   (leave `app_login()` alone; the mobile app has no popup).
3. `application/modules/master/views/dashboard.php` — after `<?php include('footer.php'); ?>`:
   `<?php include('messageboard_popup.php'); ?>`
4. `application/views/admin-includes/navigation.php` — after the Message Support `<li>`:

```php
<?php if ($this->db->table_exists('tbl_board_message')) { ?>
<li class="<?php if($this->uri->segment(2)=='messageboard'){echo 'active';}?>">
	<a href="<?php echo ADMIN_URL;?>messageboard" title="Announcements">
		<i class="fal fa-bullhorn"></i>
		<span class="nav-link-text">Announcements <span class="badge badge-primary badge-pill js-mb-nav-badge d-none"></span></span>
	</a>
</li>
<?php } ?>
```

Do not wrap that check in `isset($this->db)`: inside HMVC views `db` is a magic property and `isset()` is false.

## 4. Hub

Run the hub migration `sql/add_message_board.sql` (Node hub) and deploy `board_asset.php` + `.htaccess`
(legacy PHP hub). The WD calls `api.php?action=board` and `api.php?action=board_receipts`.

## 5. Smoke test

1. In the hub, **Message Board → New message**, target this WD, Publish now.
2. In the WD, open **Announcements** (it refreshes from the hub) — the message is listed and the ticker appears.
3. Sign out and in again — the popup shows on the dashboard.
4. In the hub, open the message → **Read statistics**: the WD user's view appears after the WD's next refresh (≤ 5 min).

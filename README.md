# KitRelay

[Cloudflare app](https://kitrelay.arunchandel1780.workers.dev) · [Source](https://github.com/Arun5768/kitrelay)

Equipment planning, packing, checkout, and returns for small production crews. React/Three.js frontend, Cloudflare Worker API, D1 persistence, Google identity, and Google Calendar integration.

## Deployment status

The Cloudflare Worker and D1 database are deployed, and Google OAuth credentials are installed in Cloudflare's secret store. Live Google sign-in, cloud workspace persistence after reload, and Google Calendar event creation were verified on 29 October 2026. A demo shoot appeared in the owner's dedicated "KitRelay productions" calendar; repeating sync reported zero updates and retained one event. The Google app remains in Testing with the owner's account allowed. Two-account invitation acceptance has not yet been verified live; automated tests cover membership and invitation access rules. Calendar automated tests use mocked Google responses in addition to the live smoke test.

## Features

Final workflow and mobile checks, fixes, and remaining verification limits are recorded in [VALIDATION.md](VALIDATION.md). Public [privacy](https://kitrelay.arunchandel1780.workers.dev/privacy.html) and [terms](https://kitrelay.arunchandel1780.workers.dev/terms.html) pages are deployed and configured in Google OAuth branding.

- Google OAuth with verified OpenID tokens, PKCE, nonce, browser-bound single-use state, and HTTP-only sessions.
- Cloud workspaces with server-enforced owner/editor/viewer membership, email-bound invitation links, revocation, and workspace switching.
- D1 persistence with optimistic concurrency. Stale writes are rejected; failed saves remain visible for export. Team changes refresh every 15 seconds when there are no unsaved edits.
- Server-side checkout validation, damaged-item quarantine, and return reconciliation.
- Optional Google Calendar consent using `calendar.app.created`. Creates a separate calendar; user-triggered sync creates/updates events with stable IDs. Sync is **one way, KitRelay to Google**, not background or two-way sync. Disconnect removes stored credentials and retains existing Google events. Provider access can also be revoked in Google account settings.
- AES-GCM encrypted refresh tokens, same-origin mutation checks, request throttling, bounded payloads, and tenant checks on workspace APIs.
- Three.js packing case, QR labels/scanning where supported, portable exports, owner-only cloud backup restoration, and a separate signed-out local demo.

Cloud storage covers workspace records, not uploaded media. Invitations are links you share yourself; no email delivery service is configured. Billing is not included.

## Activate Google

1. Create/select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Google Calendar API**.
3. Configure Google Auth Platform branding, audience, support email, and data access. Add your email as a test user while the app is in Testing.
4. Create an OAuth client of type **Web application**.
5. Add the exact redirect URI `https://kitrelay.arunchandel1780.workers.dev/api/auth/callback`.
6. Download its client JSON to a private local location outside this repository.
7. Run `node scripts/configure-google.mjs "C:/path/to/downloaded-client.json"`. This validates the redirect and passes credentials to Wrangler through stdin without displaying or committing them.
8. Sign in, create a workspace, invite a second account, connect Calendar, and sync a shoot. Verify persistence in another browser and roles using both accounts.

Cloudflare already has `TOKEN_ENCRYPTION_KEY` initialized. Preserve it across deployments; changing it invalidates encrypted refresh tokens. `APP_ORIGIN` is a public Worker variable. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are Worker secrets, never Vite variables. Google Testing mode can limit users and refresh-token lifetime. Follow Google's verification/publishing requirements before opening access broadly.

## Develop and deploy

Node.js 24+ is used for SQLite integration tests.

```sh
npm ci
npm test
npm run build
npm run db:local
# Copy .dev.vars.example to .dev.vars and supply development OAuth credentials.
# Add http://localhost:8787/api/auth/callback to the development OAuth client.
npm run dev:cloud
```

Use port 8787 for full-stack local testing. Vite-only development also proxies `/api` to the Worker; OAuth's callback and origin must match the browser origin.

```sh
npm run db:remote
npm run deploy:cloudflare
```

Wrangler binds D1 and static assets. API routes always execute the Worker. Daily cleanup removes expired sessions, OAuth attempts, rate-limit entries, invitations, and audit records older than 90 days. Tests never seed production accounts.

The old Vercel address is retained as a handoff page with legacy browser-data export. Authentication stays on the canonical Cloudflare origin.

## Validation and limits

Tests cover equipment workflows, tenant isolation, viewer restrictions, CSRF, concurrency, checkout bypass attempts, invitation email matching/replay, member removal, logout, OAuth state rejection, encrypted token account binding, and mocked Google sync/idempotency. Workspace limits are 500 equipment items, 500 shoots, and 1 MB of JSON. This is a bounded early release, not a claimed enterprise SLA.

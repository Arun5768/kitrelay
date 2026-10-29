# KitRelay

[Live application](https://kitrelay.vercel.app) · [Public source](https://github.com/Arun5768/kitrelay)

A visual equipment workspace for small production crews. Prepare a kit, catch conflicting reservations and missing accessories, check equipment out, and record its return.

## Run

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
npm test
npm run build
```

Deploy the Vite output directory `dist` to Vercel. No environment variables are needed for the current release.

The initial production deployment was published with the Vercel CLI. Automatic GitHub deployments are not connected: Vercel requires the owner to add a GitHub login connection. Until then, deploy updates with `npx vercel --prod` from this directory.

## Working features

- Multi-page experience: landing, production desk, shoots, equipment, connections, settings, privacy.
- Empty workspace onboarding or clearly marked fictional sample data.
- Shoot creation with date validation; equipment creation with unique label codes.
- Editable kits and accessory dependencies. Overlapping bookings, unreturned equipment, maintenance, missing dependencies, and unpacked items block checkout.
- Individual returns and maintenance quarantine. An item remains unavailable until returned; damaged returns require service clearance.
- Procedural Three.js case reflects packing state (first nine items shown); full checklist remains authoritative. Reduced-motion support and WebGL fallback.
- Locally generated downloadable QR labels; manual/USB scanning, plus camera QR scanning where the native BarcodeDetector API is available.
- Calendar (.ics), packing-list text, and JSON backup exports; validated backup restoration.

## Honest product boundary

This release is a **single-browser MVP**, not a multi-tenant SaaS. Data is stored in localStorage, is available to anyone using that browser profile, and is lost if site data is cleared. Export backups regularly. No authentication, server database, automatic Google Calendar/Drive sync, shared teams, subscriptions, or payments are enabled. The Connections page distinguishes working exports from planned account integrations. Google Fonts is fetched for typography; a local system fallback is provided.

Camera scanning depends on browser support, permission, and HTTPS/localhost. The printed code always works with manual entry. The 3D case represents kit completeness, not dimensional fit. It does not calculate whether equipment physically fits a real case.

## Next validation step

Pilot with a small production team across three real jobs. Measure packing omissions, reservation conflicts, return reconciliation time, and whether crew members use the checklist on location. Before enabling paid shared workspaces, add authentication, tenant-scoped persistence, server-enforced transactions, role permissions, backup recovery, and audited OAuth token storage. Do not use the local MVP as the only record for valuable equipment.

## Tests

Domain tests cover incomplete kits, accessory requirements, overlapping reservations, an entire checkout/return cycle, damaged equipment, overdue unreturned equipment, calendar dates/escaping, and backup references.

Built with React, Vite, Three.js, Lucide, and QRCode. Product research and implementation developed with Codex; no customer adoption or revenue is claimed.

# Release validation — 29 October 2026

Target: https://kitrelay.arunchandel1780.workers.dev

## Automated checks

`npm test`: 17 passed, zero failures. `npm run build`: passed.

Coverage includes incomplete kits, dependencies and double booking, checkout and damaged returns, overdue equipment, backup references, calendar date boundaries, tenant isolation, role restrictions, same-origin mutation protection, stale-write conflicts, crafted checkout requests, invitation email binding and replay, member removal, session revocation, OAuth state, and encrypted refresh-token account binding. Calendar unit tests mock Google's endpoints; live Calendar verification is recorded separately below.

## Live checks

- Google sign-in with the owner's account, sign-out, and sign-in again succeeded.
- Created an empty cloud workspace and verified persisted records after reload and in a second tab.
- In the isolated **KitRelay QA — demo data** workspace, added one demo camera and one demo shoot. Empty-kit checkout was blocked. Allocation, packing, checkout, damaged return, maintenance quarantine, and restoration to serviceable all succeeded. The shoot remains marked Returned with its handoff history.
- Created an email-bound viewer invitation and verified that switching accounts preserved the invitation route. The second-account login required a password; the owner requested using only the owner account, so live acceptance/editor/viewer testing was stopped. Revoked the unused invitation and verified there were no pending invitations or additional members. No invitation email was sent.
- In **KitRelay Studio**, a demo shoot created one real all-day event on 30 October in the owner's **KitRelay productions** Google calendar. Repeating sync returned zero updates and one accounted-for shoot. The event was inspected in Google Calendar. This is a manual one-way sync.
- Public home, privacy, terms, and configuration routes returned HTTP 200. Google sign-in displayed the published privacy and terms links.
- At a 390px viewport, the workspace fit without horizontal overflow and the mobile navigation opened and navigated successfully. Restored the normal viewport afterward.

## Fixes from verification

- Preserve invitation destinations when switching Google accounts.
- Remember newly created cloud workspace selection.
- Clear team and invitation display state when changing workspaces; ignore stale team reads.
- Publish static privacy and terms pages and link them from the home, sign-in, and workspace screens.
- Count all shoots in the All shoots navigation badge, including returned shoots, and expose mobile navigation expansion state to assistive technology.
- Add a Calendar renewal link that refreshes consent while preserving the existing calendar and event mappings.

The owner completed the renewal flow after production publishing using the same limited permissions; it returned to the connected workspace successfully.

## Deliberate limits and remaining checks

Two-account browser acceptance and editing have **not** been verified live; their authorization rules pass automated tests. Camera scanning was not tested with physical equipment. Billing, media uploads, automatic invitation emails, background Calendar sync, and two-way Calendar sync are outside this release.

The demo workspace and the clearly labelled Calendar test event remain for inspection. Account/workspace deletion is handled through the published support contact. This release is early access and has no uptime SLA.

Google OAuth was published with the owner's approval and visibly reports **In production**. The Verification centre reports **data-access verification is not required**, because the declared scopes are not sensitive or restricted. Custom branding remains unverified; Google currently displays the site's domain. The app uses the limited `calendar.app.created` scope. A repeat live sync after publishing returned zero updates and one accounted-for shoot. Previously issued Testing grants may need renewal; use **Renew Google connection**, which retains the calendar mapping. See [Google's audience documentation](https://support.google.com/cloud/answer/15549945?hl=en).

# Production readiness — what is still open before real users

A running list of everything that works locally (or is stubbed) but must be decided or built before PropCompare goes live. Add to it whenever a task leaves something behind; tick items off with a date and a pointer to where it was resolved. Not a plan — the phase tasklists are the plan.

Last updated: 2026-09-21 (first property live, legal entities)

## Blocking — nothing ships without these

- [ ] **SMS provider for buyer OTP.** `sendOTP` in `src/lib/auth.ts` logs the code in development and throws in production, so no buyer can sign in on a live site. Needs a provider decision recorded in `DECISIONS.md`. For India this usually also means DLT sender/template registration (lead time of days, not hours) — start early. Also decide OTP rate limits per number and per IP, and keep codes and phone numbers out of logs.
- [ ] **Email delivery: partly done (a real Brevo send was confirmed delivered on 2026-09-21).** Brevo is the provider (owner, 2026-09-21); developer invite links are emailed when `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` are set, and shown on screen either way. Still to do: confirm the sender domain is verified in Brevo (SPF/DKIM) so mail is not spam-foldered, send admin notifications, and rate-limit the invite accept page. Not yet sent live (mocked in tests).
- [ ] **Extraction worker on the host.** It runs inside the app server by default (`src/instrumentation.ts`); on a host that runs several web instances or restarts often, run one `bun run ocr:worker` process and set `OCR_WORKER_ENABLED=false` on the web ones (claiming is atomic, so extra workers are safe but wasteful). A job whose worker dies is failed as "interrupted" after `OCR_WORKER_LEASE_MS` and can be retried from the admin screen.
- [ ] **Hosting decision** (GCP as built, or a Hostinger VPS). Everything storage-related goes through `StorageAdapter`, so a move means one new adapter — but the database hosting, deploy pipeline and secrets handling still need a home either way.
- [ ] **Production secrets and config:** a real `BETTER_AUTH_SECRET` (the CI value is a placeholder) and `BETTER_AUTH_URL`; the three `DATABASE_*` URLs with the split roles intact; GCS bucket and service-account key (or the replacement adapter's config); `OPENROUTER_API_KEY`.
- [ ] **Production database setup:** run migrations and both seeds, then verify the privilege split (`propcompare_app` refused on `private`, `propcompare_service` allowed) as `docs/local-database-setup.md` describes. Create the first admin with `bun run db:first-admin` using a strong, unique password, and rotate it after first sign-in.
- [ ] **Auth endpoint rate limiting** (sign-in, OTP send/verify). Better Auth has built-in limits; confirm they are on and tuned, and that they work behind whatever proxy or load balancer is used (client IP forwarding).
- [ ] **HTTPS-only and cookie flags** confirmed in the deployed environment (session cookies `Secure`, `HttpOnly`, `SameSite=Lax`).

- [ ] **Brochure-image copyright exposure (accepted 2026-09-19).** Publishing brochure floor plans and renders before a developer consents needs: visible attribution on every image, a working "request removal" route honoured promptly, media origin recorded per image, and ideally a short takedown policy page. Consider a lawyer's review of the takedown wording before launch.
- [ ] **Enquiry handling with no developer accounts:** admin inbox and follow-up process so no buyer enquiry is left unanswered.

- [ ] **Firefox and Safari check of the brochure PDF viewer** (Chrome, Brave, Edge are verified on the maintainer machine; the other two engines need a person with those browsers).

- [ ] **Uploaded image safety.** Admin-uploaded images are checked by file signature and size only. Before real use add a malware scan, a pixel-dimension limit and re-encoding (which also strips metadata such as location tags).

- [ ] **Native image libraries on the host.** `sharp` and `@napi-rs/canvas` (brochure page rendering) ship platform-specific binaries; install with the host's OS and CPU, keep them in `serverExternalPackages`, and check memory use when rendering large brochures (each request re-reads the whole PDF).

- [ ] **Raw extraction answers on durable storage.** Each paid answer is saved before it is checked (`OCR_CHECKPOINT_DIR`, local disk today), and retries reuse it. On a host with an ephemeral disk that saving is lost on redeploy; move the checkpoint files to the storage adapter (or a table) and back them up.
- [ ] **Buyer pages after publish.** Publishing refreshes `/`, `/properties` and the property page (`revalidatePath`); confirm this on the chosen host, including behind any CDN.

## Should be done before or soon after launch

- [ ] **Admin MFA** (`admin_users.mfa_enforced` is a placeholder; Phase 5). Admins can publish to the live catalog, so this should not wait long.
- [ ] **Buyer retention screens** — saved properties and saved comparisons pages so returning buyers see their activity (backend done; UI is Deep's Phase 3). Also buyer email verification once an email provider exists (emails are stored unverified today).
- [ ] **"Claim this listing" and "report a problem" links** on every property, feeding admin queues (developer recruiting funnel and corrections).
- [ ] **Analytics event capture (beta deadline).** The paid developer analytics platform is future scope, but raw event history cannot be rebuilt: capture must exist by the start of beta. Needs its own tasklist and decision (event taxonomy, anonymous vs signed-in identity, retention, consent, declared trackers) before beta. See `DECISIONS.md` 2026-09-19.
- [ ] **"Last checked" dates and a re-check rhythm** for properties nobody else maintains; "Verified" copy says checked by PropCompare.
- [ ] **Pre-login intake cookie claim** (`docs/tasklists/2026-09-18-pre-login-intake-cookie.md`) — direction agreed, not built.
- [ ] **Password reset** for developer and admin accounts (invite links cover first-time setup only).
- [ ] **Audit trail review:** confirm admin actions (approve, publish, request changes) are attributable to a user and cannot be edited after the fact.
- [ ] **Backups and restore test** for Postgres and the storage bucket; retention policy for source documents and OCR checkpoints (`OCR_CHECKPOINT_DIR` is local disk today).
- [ ] **Logging and monitoring:** error tracking, uptime check, and a review that no log line carries a phone number, OTP, or exact price.
- [ ] **CI runs green on GitHub** with the new Postgres service (added 2026-09-19; not yet observed passing).
- [ ] **Content security policy and security headers.**
- [ ] **OCR cost controls:** the page-routing confirmation gates paid runs; also decide per-developer or per-day limits and who sees the spend.
- [ ] **GujRERA fetch job:** confirm the source's terms of use and set a polite fetch rate before scheduling it.

## Known local-only shortcuts to remove or re-check

- `sendOTP` dev logging (guarded by `NODE_ENV`; verify the guard in the production build).
- Local `.env.example` credentials (`*_dev_only`) must never be reused in production.
- `drizzle/meta/0000–0003_snapshot.json` exist only on the maintainer's machine and are deliberately untracked; migrations apply from the SQL files and journal, so production is unaffected, but a fresh clone cannot run `db:generate` against them (see `docs/local-database-setup.md`).
- The dev server's placeholder portal home pages (`/developers`, `/admin`) are replaced by the real portals.

## Resolved

_(none yet)_

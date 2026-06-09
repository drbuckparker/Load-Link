# Threat Model

## Project Overview

LoadLink Mobile Companion is a public Expo/React Native client backed by a public Express API deployed on Replit. The API proxies authentication to the main LoadLink website, stores local session mappings in `.data/sessions.json`, reads and writes business data in PostgreSQL, and calls third-party services including Google Maps and Expo Push. Production scope is the deployed mobile client plus the Express API in `server/`; dev artifacts such as `server/routes.ts.bak`, screenshots, and local experimental assets are out of scope unless separately exposed. Assume `NODE_ENV=production` in production and treat all publicly reachable API routes as internet-exposed.

## Assets

- **User accounts and session tokens** — local bearer tokens, upstream website JWTs, Apple/Google-linked identities, and the ability to impersonate drivers, contractors, foremen, trucking companies, or admins.
- **Business records** — jobs, assignments, job runs, invoices, projects, availability, favorites, reviews, and notifications. Unauthorized changes can redirect work, falsify timekeeping, or alter billing.
- **Sensitive user and company data** — emails, phone numbers, addresses, CDL and insurance data, company details, location data, and weight-ticket images.
- **Operational integrations and secrets** — `WEBSITE_API_KEY`, upstream auth trust, Google Maps key, and Expo push tokens.

## Trust Boundaries

- **Mobile client to Express API** — every request from the app is untrusted and must be authenticated, authorized, and validated server-side.
- **Express API to PostgreSQL** — route handlers can directly expose or tamper with all shared business data if authorization checks are missing.
- **Express API to LoadLink website API** — upstream auth/login calls rely on a server-held API key; the proxy must not let untrusted clients inherit that trust.
- **Role boundary inside authenticated users** — drivers, contractors, trucking companies, foremen, and admins have materially different permissions. Role switching in the UI is not a security control.
- **Identity-linking boundary** — verified third-party identity tokens must stay bound to the identity claims in those tokens; client-supplied email or role fields are not trusted proof of account ownership.
- **Public deployment boundary** — the deployment is public, so any route reachable without additional platform restrictions must be treated as internet-exposed in production.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, `server/sync.ts`, `contexts/AuthContext.tsx`, `lib/query-client.ts`.
- **Highest-risk code areas:** auth/session proxying in `server/routes.ts`; public auth and account-linking endpoints such as `/api/auth/login`, `/api/auth/social-login`, and `/api/auth/apple/link`; ownership checks across job, assignment, message, vehicle, invoice, project, and driver-directory routes; session persistence in `.data/sessions.json`; weight-ticket and job-run handling.
- **Surface split:** public auth endpoints (`/api/auth/*`, `/api/map-embed`) versus authenticated CRUD endpoints under `/api/*`, with special attention to authenticated directory/search routes like `/api/drivers/search` that can still leak cross-tenant data.
- **Usually dev-only / ignore unless proven reachable:** `server/routes.ts.bak`, screenshots, attached assets, local skill/task metadata.

## Threat Categories

### Spoofing

The server issues local bearer tokens based on upstream companion authentication and persists those mappings locally. The API must require proof that the caller is the legitimate account owner before minting a session, and local session tokens must remain bound to the authenticated user instead of to untrusted client-supplied identity fields.

### Tampering

Authenticated users can submit updates for jobs, assignments, vehicles, projects, invoices, reviews, availability, and job runs. The API must enforce object ownership and role-specific permissions on every state-changing route. Client-visible role toggles, client-selected IDs, and client-supplied account attributes are not trusted authorization signals.

### Information Disclosure

The database contains PII, operational messages, location history, invoice parties, job assignments, weight-ticket images, and platform directory data such as driver contact details. Read endpoints must only return records for the authenticated principal or an explicitly authorized related party. Message threads, assignment rosters, weight tickets, invoices, and directory-style search results are high-sensitivity data sets.

### Denial of Service

Public auth endpoints and authenticated mutation endpoints can trigger sync, notification, and database work. The service must resist repeated login attempts, bulk destructive actions, and unbounded payload abuse, especially on routes that write blobs like weight tickets or can modify many records.

### Elevation of Privilege

Role strings and ownership relationships are security-critical. The API must not let users self-assign privileged roles, change protected account attributes, or act on records they do not own. Any endpoint that accepts arbitrary record IDs must verify both authentication and authorization before reading or mutating data.
# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

LESSSO supports accounts with the roles `owner`, `business_admin`, `seller`, and `readonly`. The repository does not establish the primary day-to-day role, the typical team size, or whether CRM operators and security operators are usually the same people; those product decisions remain open.

## Product Purpose

LESSSO is a self-hosted workspace for managing prospects and follow-up, business and personal accounts, credentials, communications, sales and financial records, security reports, and operational history. Success means keeping these workflows available from one locally operated web app while protecting stored information and keeping optional network-testing services under explicit authorization.

## Positioning

The product is deployed and operated by its owner on a local host or private network. The CRM runs independently; network-testing capabilities are provided by a separate optional service. A more specific market position or comparison with other products has not been established.

## Operating Context

The web app is used through a browser and is deployed with Docker Compose, PostgreSQL, Redis, and a local TLS proxy. An operator can limit access to the host or publish it on a private network. CRM data can be organized by business or personal scope. OpenStreetMap searches run on demand and need network access.

## Capabilities and Constraints

- CRM workflows include prospect management and follow-up, website audits, deduplication and reversible merges, and map-based business discovery. Map results retain their OpenStreetMap references and are added to prospects only when saved individually.
- Account and operations areas include email accounts, linked services, credential and note storage, sales and financial records, reports, preferences, team access, activity history, a security audit, and trash.
- Navigation provides a global overview and a summary at each main area before opening its detailed work sections. Finance separates payments, services and due dates, expenses, and cards/payment methods; overview pages summarize records and link into those workflows.
- The security overview reports aggregate writeup metrics: word count, estimated reading time, fenced code-language counts, export-format distribution, revisions, and the largest document. It does not return report text to the overview UI.
- The credential vault is separately locked and unlocked. Backups have distinct formats and coverage; a partial `.emailsaver` export is not a complete backup.
- C2 is optional and does not start with the CRM by default. The demo mode does not perform real network operations. Real mode requires Linux, compatible host hardware and tools, an owner session, an unlocked vault, and an active engagement authorizing the operation. Target and interface checks fail closed; some operations cannot be fully verified without an isolated hardware lab.
- Secrets, private TLS keys, and deployment-specific values belong in local secret or environment configuration, not tracked source. The local CA certificate may be installed on client devices; its private key must remain on the server.
- Map tiles and capture results are not available offline. OpenStreetMap data is queried on demand, subject to the upstream service's availability and rate limits.
- The primary user, typical team size, relative priority of CRM and security workflows, and target accessibility standard are not confirmed.

## Brand Commitments

Keep the LESSSO name, the “Just a leap of faith” tagline, and the existing dark interface recognizable. The requested migration work preserves NewCRM's identity and does not adopt OldCRM's visual style.

## Evidence on Hand

- `DESIGN.md` records the shared web palette, typography, shell, responsive layout, and interaction conventions.
- `README.md` documents the product areas, local installation, roles, deployment modes, map capture, and optional C2 service.
- `RUNBOOK.md` and `SEGURIDAD.md` document operations, backup scope, key handling, and recovery constraints.
- `docs/c2-scope-audit.md` records C2 authorization checks and hardware-only verification limits.
- `frontend/src/components/layout/Sidebar.tsx` and `frontend/src/components/layout/SectionRenderer.tsx` expose the current navigation and product areas.
- `backend/app/api/v1/crm_capture.py`, `backend/app/services/crm_capture.py`, and `backend/app/services/c2_scope.py` implement map capture and scope enforcement.

## Product Principles

1. Keep business workflows available without requiring the optional C2 service.
2. Protect credentials, keys, and backups through the vault and local secret configuration.
3. Require an explicit, current authorization scope before real network operations and fail closed when scope cannot be verified.
4. Preserve source references and operator review when adding discovered businesses to the CRM.
5. Keep operational history and recovery behavior clear enough for a local operator to manage the installation safely.

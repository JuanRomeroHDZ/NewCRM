# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The application defines owner, worker, and viewer roles. The primary day-to-day user and team size have not been confirmed.

## Product Purpose

Contact | LESSSO brings prospect capture and follow-up together with account security, communications, sales, finances, and day-to-day operations. The requested work is to restore the useful mapping and extraction workflows from OldCRM in NewCRM while retaining NewCRM's existing interface style.

## Positioning

The repository describes a self-hosted system for local operation. A more specific positioning claim has not been confirmed.

## Operating Context

The existing application is a browser-based React and FastAPI system backed by PostgreSQL and Redis. Its deployment configuration targets local network operation. Current capture code and product documentation focus on Tijuana, Baja California.

## Capabilities and Constraints

- Existing product areas include a dashboard, account vault, prospects, connection graph, subscriptions, security audit, activity history, trash, and settings.
- The current backend includes OpenStreetMap capture, website auditing, prospect deduplication, and reversible merges. A map-based capture interface is part of the requested migration.
- Preserve NewCRM's existing visual identity. Do not adopt OldCRM's visual style.
- Make the interface usable on mobile and organize the left navigation as a clear, compact tree.
- Keep secrets and deployment-specific values in environment configuration or secret storage, not source code.
- Preserve the existing product behavior while removing only files proven to be generated or unused.

## Brand Commitments

The user explicitly requested that NewCRM retain its existing style and that OldCRM's style not be carried over. The current repository uses the Contact | LESSSO name and a dark interface. Do not infer or invent additional brand claims.

## Evidence on Hand

- `README.md` and the current application source document the product areas and operating constraints.
- `backend/app/api/v1/crm_capture.py` and `backend/app/services/crm_capture.py` implement the current capture workflow.
- The useful OldCRM map assets and extraction behavior have been reviewed and migrated; its source project is removed after migration.

## Product Principles

1. Keep the current product's workflows and visual identity recognizable during migration.
2. Make prospect capture usable from a map, list, keyboard, touch screen, and narrow viewport.
3. Keep credentials, keys, and host-specific deployment values out of tracked source.
4. Prefer documented, working product behavior over stale migration claims.


# Staging rebuild preparation (synthetic data only)

**Status:** preparation only; blocked on two-person schema review (2026-09-27).  
**Targets changed:** none. This document does not authorize a connection, migration, seed, or
deployment to production or staging.

## Verified starting point

- Production reports **27 recorded migrations**, ordered from `20260821120417` through
  `20260916184458`. These counts and identifiers are operator-provided facts, not artifacts in
  this repository, and do not establish that migration bodies are complete or match the live
  catalog.
- Isolated staging project `vjtvjdhwdwwyjfomxfqs` reports **zero recorded migrations and no
  application tables**. No repository command was run against it for this preparation.
- `supabase/migrations/` deliberately contains no executable baseline. Raw encrypted production
  schema evidence is neither sanitized nor authorized for this repository. It must not be opened,
  decrypted, transformed, or used until a mandatory second human reviewer is available.

## Dependency inventory and confidence

| Area | Confirmed from tracked source | Historical SQL only | Unresolved before rebuild |
| --- | --- | --- | --- |
| Application relations | Direct client access to `recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_categories`, `recipe_subcategories`, `meal_plan`, and `shopping_checks` | `recipe-management.sql` also references `private.recipe_management_owner`, `auth.users`, `storage.buckets`, and `storage.objects` | Exact columns/types/defaults, household membership model, constraints, indexes, triggers, views, owners, grants, and all additional objects |
| RPCs | Client calls: `get_app_bootstrap`, `create_household`, `join_household`, `remove_meal_plan_item`, `create_community_recipe`, `moderate_community_recipe`, `edit_pending_community_recipe`, `update_my_display_name`, `delete_my_account`, `export_my_data`, `get_current_legal_versions`, plus six recipe-management RPCs | Bodies for `recipe_management_access`, `can_manage_recipe`, `save_recipe`, `set_recipe_photo`, `delete_recipe`, and `restore_recipe` | Every live signature/body/owner/grant; all private dependencies; complete `SECURITY DEFINER` set and safe `search_path` review |
| RLS and grants | Client behavior implies anonymous, authenticated, owner, admin, and household boundaries but does not prove enforcement | Three recipe/Storage policy groups and explicit grants/revokes appear in `recipe-management.sql` | RLS enabled/forced state, complete policy composition, direct privileges, default privileges, cross-household denial, and service-role boundaries |
| Storage | Client uses private-style `recipe-photos` upload/sign/delete paths | Bucket size/MIME settings and three object policies appear in historical SQL | Live bucket configuration, all object policies, orphan behavior, URL generation, and whether any production-specific URL remains in reviewed definitions |
| Auth | Email/password sign-up/sign-in, refresh, password update, legal metadata, account export/deletion calls are tracked | No authoritative Auth configuration | Confirmation and redirect URLs, allowed origins, SMTP/templates, providers, hooks, password/MFA/CAPTCHA/rate-limit settings, JWT lifetime, and synthetic-user lifecycle |
| Realtime | Subscriptions to `meal_plan` and `shopping_checks`, filtered by household | None | Publication membership, replica identity, authorization, and synthetic cross-tenant tests |
| HTTP APIs | Observed contracts exist for `GET /api/catalog`, `GET /api/recipe`, and `POST /api/ai-fridge` | None | All three handlers are missing; validation, authorization, CORS, errors, secrets, runtime, and AI quota/privacy behavior remain unknown |
| Environment routing | Tracked frontend contains the production Supabase host and historical SQL constructs a production Storage URL | The hard-coded Storage URL occurs in `recipe-management.sql` | A reviewed environment-neutral configuration design for Supabase HTTP/WebSocket/Storage URLs and staging-only Vercel settings |

“Confirmed” means only that tracked code calls or names the dependency. It is not confirmation
that production currently contains it or that the recovered frontend fully describes production.
Historical SQL is change evidence, not an executable baseline and must not be copied into
`supabase/migrations/`.

## Ordered preparation and rebuild plan

### Work that can be prepared now (repository-only)

1. Keep this inventory and the observed API contracts synchronized with tracked client calls.
2. Keep the staging guards fail-closed: only the named staging ref, explicit synthetic-data
   confirmation, manual link verification, and migration dry-run are permitted.
3. Specify deterministic fixtures using reserved/example values: fixed fictional UUIDs,
   `example.invalid` email addresses, generated images, fictional households, recipes, plans,
   and shopping items. Never use copied, sampled, masked, or pseudonymized production rows.
4. Define the acceptance matrix below without executing it remotely.

### Mandatory gate: two-person schema review

5. Two authorized humans review the encrypted evidence outside Git. They must reconcile all 27
   production migration records against the live structural catalog, separately review raw
   function bodies/constants, and sanitize secrets, personal data, ownership statements, and
   production-specific URLs. At least one reviewer must explicitly disposition every private
   table and every `SECURITY DEFINER` overload.
6. Only after both approvals may a separate PR introduce a deterministic, secret-free baseline
   with provenance and hashes. That PR must resolve catalog/migration discrepancies rather than
   filling gaps from client calls or `scripts/recipe-management.sql`.

### Later execution (separately authorized)

7. Apply the approved baseline twice to fresh local databases and compare fingerprints. Then
   independently confirm the empty staging ref and run the guarded history/dry-run inspection.
8. Apply only to isolated staging under a separate change approval; configure staging-only Auth,
   Storage, Realtime, API handlers, URLs, and integration credentials before synthetic seeding.
9. Seed deterministic synthetic fixtures, execute the acceptance matrix, repeat from a clean
   rebuild, compare fingerprints/results, and remove identities/artifacts per approved retention.
   Nothing from staging is promoted into production.

## Synthetic rebuild and security acceptance checklist

### Schema and provenance blockers

- [ ] Two named human reviewers approve a sanitized baseline; raw evidence remains outside Git.
- [ ] All 27 recorded migration identifiers/bodies are reconciled to the live catalog, including
  drift, extensions, types, constraints, indexes, triggers, views, publications, and grants.
- [ ] Private tables are individually reviewed for contents, dependencies, ownership, direct and
  inherited grants, RLS decision, and intended callers.
- [ ] Every `SECURITY DEFINER` overload has a reviewed body, non-login owner, least-privilege
  execute grants, fixed safe `search_path`, schema-qualified references, and no embedded secret or
  production URL.

### Environment and configuration blockers

- [ ] All production-specific Supabase HTTP, WebSocket, Storage, redirect, OAuth, webhook, SMTP,
  AI-provider, and Vercel URLs are inventoried and replaced by explicit staging configuration.
- [ ] Missing `/api/catalog`, `/api/recipe`, and `/api/ai-fridge` handlers are restored from
  authoritative source or reimplemented in a separately reviewed PR; no contract test is treated
  as proof of server authorization.
- [ ] Auth providers, email confirmation, redirects/origins, templates, password policy, JWT
  lifetime, MFA/CAPTCHA, hooks, and rate limits have staging-safe settings; outbound email/SMS and
  OAuth are disabled or routed only to approved test sinks.
- [ ] Storage bucket limits/MIME types and every `storage.objects` policy are reviewed; generated
  images cover upload/read/sign/delete, invalid paths/types/sizes, other-user denial, deleted and
  pending recipes, and orphan cleanup.

### Synthetic-only API, RLS, and behavior tests

- [ ] Verify anonymous, unconfirmed, authenticated, owner, other household, recipe manager,
  moderator/admin, and service roles with positive and negative cases.
- [ ] Verify direct table writes cannot bypass RPC rules; assert cross-household isolation for
  reads, inserts, updates, deletes, upserts, RPCs, and Realtime events.
- [ ] Validate all observed RPC input/output shapes, authorization failures, invalid identifiers,
  duplicate/replay behavior, transaction rollback, and account export/deletion behavior.
- [ ] Run JSON contract checks for all three HTTP APIs, plus authentication, malformed input,
  quota/rate-limit, error-shape, CORS, timeout, and log-redaction tests.
- [ ] Verify Realtime publication/replica identity and ensure a fictional tenant never receives
  another tenant's changes.
- [ ] Confirm logs, exports, screenshots, and test artifacts contain only synthetic identifiers;
  scan the Git diff for credentials, raw evidence, production records, and executable baseline SQL.
- [ ] Rebuild staging twice from zero migrations/application tables and obtain identical schema
  fingerprints and test results before declaring staging ready.

## Current disposition

Repository-only inventory, guardrails, fixture rules, and the future test matrix can be prepared
now. Baseline creation, any remote dry-run/application, seeding, and API/RLS acceptance testing
remain **blocked** until the mandatory two-person review authorizes sanitized schema source and a
separate change authorizes staging execution.

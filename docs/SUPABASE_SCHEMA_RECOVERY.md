# PR 2C — Supabase Schema Recovery preparation

**Status:** preparation only / blocked on authorized exports (2026-09-27).  
**Production changes:** none. **Remote migrations:** none. **Production data copied:** none.

This document continues the PR 2A inventory/recovery plan and the PR 2B API contracts from
the latest `main` merge (`b639bbe`). There is no production database credential or isolated
staging project in this environment. Therefore this PR does **not** claim that the production
schema has been recovered, that a baseline is complete, or that a restore has passed.

## 1. Repository SQL inventory and confidence

A repository and Git-history scan found exactly these SQL artifacts:

| Artifact | Meaning | May be treated as production baseline? |
| --- | --- | --- |
| `scripts/recipe-management.sql` | Historical change script for recipe management, private photos, functions, grants, and several policies. Its own header says it was applied through a migration API. | No: current catalog state and all prerequisites are unverified. |
| `scripts/verify-recipe-permissions.sql` | Destructive-looking but transaction-wrapped permission fixture that ends in `ROLLBACK`; it requires real users and is not a migration. | No; never run against production. |
| `scripts/sql/catalog-metadata.sql` | New read-only catalog collector for structural evidence. | No: tooling only. |
| `scripts/sql/security-metadata.sql` | New read-only collector for security, Storage bucket, and Realtime publication metadata. | No: tooling only. |

The Git history contains the first two files but no deleted baseline migrations. The PR 2B
deliverables are `docs/API_CONTRACTS.md`, three JSON schemas, and the contract/staging test
scripts. They describe observed HTTP contracts; they do not add database definitions.

## 2. Exact production metadata still missing

An authorized export must establish, without inference:

1. PostgreSQL/Supabase version, region, project ref, installed extensions and versioned
   migration history (`supabase_migrations` metadata, if available).
2. Every non-system schema and its owner/privileges; enum/domain/composite types, sequences,
   tables, partitioning, views and materialized views.
3. Every column's exact type, collation, nullability, default, identity/generated expression;
   primary/unique/check/exclusion/foreign-key constraints, referenced actions and deferrability.
4. All indexes (methods, expressions, predicates, ordering), triggers and trigger enable state.
5. All functions/RPC overloads: identity signature, result, language, full body, owner,
   volatility, parallel/leakproof/strict attributes, `SECURITY DEFINER`, configuration including
   `search_path`, and execute grants. This includes confirming or disproving every RPC named in
   `BACKEND_INVENTORY.md`; client names are not proof that definitions still exist.
6. Relation ownership, RLS enabled/forced flags, replica identity, and publication membership.
7. Migration ordering/checksums and drift between recorded migrations and the live catalog.

The structural export may expose constants embedded in function bodies. It must remain in the
encrypted evidence store until a reviewer removes secrets, email addresses, project-specific
URLs, ownership statements, and other environment-specific values. No user rows, password
hashes, object paths, JWTs, keys, or production personal data are requested.

## 3. Separate security evidence (input to PR 2D)

Security evidence is intentionally kept separate from the baseline transformation:

- every RLS policy with schema/table, permissive or restrictive mode, command, roles, `USING`,
  and `WITH CHECK`, plus table `relrowsecurity` and `relforcerowsecurity` flags;
- schema, table, sequence, and routine grants, owners, default privileges, and role membership
  relevant to `anon`, `authenticated`, `service_role`, `authenticator`, and custom roles;
- all `storage.buckets` configuration and all policies/grants on `storage.objects` and bucket
  tables; object names and owner identities are excluded;
- every publication and member relation (especially `supabase_realtime`), its operations, and
  each member table's replica identity;
- Dashboard-only Auth, API, Storage, and Realtime settings that SQL catalogs cannot expose.

The supplied security query captures policies, explicit role grants, bucket configuration,
publications, and replica identity. The authorized operator must additionally export default
privileges and role memberships through an approved metadata channel if the audit role cannot
see them. PR 2D must evaluate effective access; merely preserving current policies is not a
security approval.

## 4. Authorized read-only export runbook

### Preconditions

1. A Supabase owner approves the production project ref, export window, operator, retention,
   and a **temporary catalog-readable role with no write privilege**. Prefer a read replica or
   backup endpoint. Do not use `service_role`, a pooler transaction URL, or an application user.
2. Store the URI in the operator's secret manager/environment only. Never paste it into Git,
   tickets, shell history, or command output. Run on an encrypted workstation with PostgreSQL
   client tools compatible with the server and record their versions.
3. Create an encrypted evidence directory outside the repository; set `EXPORT_DIR` to a
   temporary location inside it. Confirm the hostname/project ref out-of-band with a second
   reviewer. The script also requires the ref in the URI and forces read-only transactions.

### Collection

```bash
export DATABASE_URL='(retrieve read-only URI from secret manager)'
export EXPECTED_PROJECT_REF='(approved production ref)'
export READ_ONLY_CONFIRMED=yes
export EXPORT_DIR='/encrypted/evidence/pr-2c'
bash scripts/export-supabase-schema.sh
```

The collector runs `pg_dump --schema-only` and read-only catalog queries. It produces a raw SQL
dump, structural JSONL, separate security JSONL, connection identity, and SHA-256 manifest.
It never invokes `supabase db push`, `db reset`, migration repair, DDL, DML, or an HTTP mutation.
If catalog permissions are insufficient, stop and have the owner adjust/read the metadata;
never escalate by substituting an unrestricted production credential.

### Dashboard/API metadata collected by an authorized Viewer

Record, without secret values: project region and Postgres version; enabled Auth providers,
redirect allow-list, JWT lifetime, password/MFA/CAPTCHA/rate-limit settings; exposed schemas;
Storage limits; Realtime limits/authorization; backup/PITR status; migration history; and Edge
Function names/versions. Export configuration screenshots/JSON to encrypted evidence, redact
tenant/user identifiers, and hash the artifacts. Do not commit them by default.

### Review and baseline conversion

Two reviewers compare the raw SQL, catalog JSONL, Dashboard metadata, repository inventory,
and migration history. Resolve every discrepancy. From the approved structural export create
one deterministic `supabase/migrations/YYYYMMDDHHMMSS_production_baseline.sql`; preserve exact
definitions but remove environment ownership and secrets. Record source hashes and every
deliberate transformation. Do not copy the historical recipe script into migrations or invent
household tables/functions to satisfy the client.

## 5. Isolated staging rebuild with synthetic data

1. Create a **new Supabase project**, organization/environment, database password, API keys,
   custom domain, and Vercel project. It must not share production credentials, webhooks,
   OAuth callbacks, SMTP/SMS providers, log drains, Storage objects, or third-party AI billing.
   Deny outbound integrations until explicitly allow-listed.
2. Pin and record the Supabase CLI/Postgres client versions. Link only after verifying the
   staging project ref twice. Add a guard in any future apply script that rejects the production
   ref and requires an explicit staging ref. Never execute remote migration commands from CI
   until that guard is reviewed.
3. Apply the reviewed baseline to a clean local database first, then to the isolated staging
   project. Capture command versions, logs, schema fingerprint, and migration table state.
4. Generate deterministic fictional UUIDs, `example.invalid` emails, households, recipes,
   ingredients, plans, and shopping entries. Use generated image fixtures. Do not dump, mask,
   sample, or clone production user/application rows; pseudonymized production data is also
   prohibited for this exercise.
5. Run the PR 2B contract tests against staging, then positive and negative role tests for all
   tables/RPCs/Storage policies and cross-household isolation. Exercise Realtime with synthetic
   tenants. Run twice after clean rebuilds and compare schema fingerprints.
6. Destroy staging test identities/artifacts according to the approved retention period. Never
   promote the staging database or its credentials into production.

## 6. Evidence and completion criteria

PR 2C can be called **complete schema recovery** only when all boxes below have evidence:

- [ ] Authorized, timestamped production schema-only export and catalog/security metadata have
  matching SHA-256 manifests, tool versions, project identity, and two-person approval.
- [ ] All schemas/types/tables/relationships/constraints/indexes/triggers/functions/RPCs are
  accounted for; inventory discrepancies and migration-history drift are resolved.
- [ ] RLS/grants, Storage policies/config, and Realtime publication/replica identity are captured
  separately and handed to PR 2D; Dashboard-only settings are enumerated.
- [ ] A reviewed, secret-free, deterministic baseline exists under `supabase/migrations/` and
  has the approved export fingerprint/provenance; no guessed object exists.
- [ ] A fresh local and isolated staging rebuild succeeds twice with identical fingerprints.
- [ ] Synthetic-only tests cover PR 2B API contracts and database/RPC relationship integrity;
  no production PII, credentials, object paths, or remote production writes occur.
- [ ] Restore logs, deviations, owners, and follow-up security findings are retained in the
  approved evidence store.

### Current blockers / exact handoff request

To proceed beyond preparation, provide (through approved secret/evidence channels, not Git):

1. a time-limited production **read-only** PostgreSQL URI/catalog role and confirmed project ref,
2. Viewer access/export for Dashboard-only Auth/Storage/Realtime/backup settings,
3. the authoritative migration history or original backend repository/artifacts, and
4. a newly created isolated staging project ref plus authorization to apply only there.

Until those inputs exist and the checks above pass, `supabase/migrations/` remains deliberately
empty and PR 2C remains **blocked at preparation**, exactly as required by the recovery plan.

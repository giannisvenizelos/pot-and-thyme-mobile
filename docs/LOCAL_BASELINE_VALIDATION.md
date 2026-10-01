# Local fresh-database baseline validation

This repository now contains a fail-closed validator for a **future, reviewed, sanitized**
candidate baseline. It has not been run against such a real candidate, no real production
baseline is present, and the passing attestation required by the staging guard must not be added.
The committed SQL fixture is synthetic and lives outside `supabase/migrations/`.

## Local-only usage

Install the Supabase CLI, Docker-compatible local containers, and `psql`, then run:

```sh
npm run test:baseline-validator
# or, for an already reviewed candidate outside the migrations holding area:
node scripts/validate-local-baseline.mjs /absolute/path/to/candidate.sql
```

The validator rejects Supabase remote credentials/target variables and tracked linked-project
markers before launching anything. It creates a different temporary Supabase work directory for
each pass, runs only `supabase start`, `supabase db reset --local`, `supabase status`, and
`supabase stop --no-backup`, and accepts only a loopback database URL before invoking `psql`.
It never uses `supabase link`, `--linked`, `db push`, or `db pull`. Temporary stacks and copied
migrations are removed after each pass. Hash output files are local, ignored artifacts.

The automated test applies the same synthetic migration to two independent fresh local stacks,
requires identical SHA-256 fingerprints, applies a deliberately changed copy twice and requires a
different fingerprint, and verifies that both an explicit remote database target and linked state
are rejected.

## Fingerprint coverage and boundaries

The canonical, sorted JSON-lines fingerprint includes:

- non-system, non-Supabase-managed application schemas;
- tables, partitioned tables, views, materialized views and foreign tables, including columns,
  types, nullability, defaults, identity/generated attributes, RLS and forced-RLS state;
- constraints and indexes using PostgreSQL's canonical deparsers;
- functions/procedures (including overload identity arguments, result, language, security-definer
  flag, per-routine settings and full definition) and non-internal triggers;
- policies on application tables and `storage` tables, including roles, command, mode, `USING`
  and `WITH CHECK` expressions;
- explicit schema, relation, column and routine grants on application objects, plus explicit
  relation and column grants on `storage` objects (including grants to `PUBLIC`);
- publications and their operation flags, plus application/Storage publication members, column
  lists and row filters; and
- catalog dependencies from Storage policies to relations and routines.

The fingerprint intentionally excludes data/rows (including Storage buckets and objects), role
passwords and role memberships, database/server settings, extension-owned and Supabase-managed
implementation objects, Auth/Storage/Realtime service configuration outside PostgreSQL catalogs,
Edge Functions, secrets, ownership, comments, statistics, sequences not represented by column
identity/default definitions, event triggers, and implicit/default/inherited privileges. Those
areas are **unsupported by this fingerprint**, not claimed as validated, and require separate
review before staging. A catalog query error, missing local URL, unavailable tool, failed reset,
non-loopback URL, linked marker, or remote-capable environment variable fails validation rather
than reducing coverage silently.

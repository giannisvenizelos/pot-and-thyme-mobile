#!/usr/bin/env bash
set -euo pipefail

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
command -v pg_dump >/dev/null || die 'pg_dump is required'
command -v psql >/dev/null || die 'psql is required'
: "${DATABASE_URL:?Set DATABASE_URL to the temporary read-only production connection URI}"
: "${EXPECTED_PROJECT_REF:?Set EXPECTED_PROJECT_REF to the approved project ref}"
[[ "${READ_ONLY_CONFIRMED:-}" == yes ]] || die 'Set READ_ONLY_CONFIRMED=yes after the database owner confirms the role is read-only'
[[ "$DATABASE_URL" == *"${EXPECTED_PROJECT_REF}"* ]] || die 'DATABASE_URL does not contain EXPECTED_PROJECT_REF'

umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="${EXPORT_DIR:-supabase/exports}/${stamp}"
mkdir -p "$out"

# Enforce read-only transactions client-side in addition to the required least-privilege role.
export PGOPTIONS="${PGOPTIONS:-} -c default_transaction_read_only=on -c statement_timeout=120000"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
  "select current_setting('transaction_read_only'), current_database(), current_user" \
  >"$out/connection.txt"
[[ "$(cut -d'|' -f1 "$out/connection.txt")" == on ]] || die 'server did not confirm a read-only transaction'

# Raw schema evidence stays outside Git and must be encrypted at rest before transfer.
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-comments --format=plain \
  --file="$out/schema.raw.sql"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
  -f scripts/sql/catalog-metadata.sql >"$out/catalog-metadata.jsonl"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
  -f scripts/sql/security-metadata.sql >"$out/security-metadata.jsonl"

(
  cd "$out"
  sha256sum connection.txt schema.raw.sql catalog-metadata.jsonl security-metadata.jsonl \
    >SHA256SUMS
)
printf 'Read-only schema evidence written to %s\n' "$out"
printf 'Do not commit it. Encrypt it, record operator/project/tool versions, and obtain review.\n'

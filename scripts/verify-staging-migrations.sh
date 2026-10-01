#!/usr/bin/env bash
set -euo pipefail

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
PRODUCTION_PROJECT_REF='ccvdkbdnykfhenhqkicm'
STAGING_PROJECT_REF='vjtvjdhwdwwyjfomxfqs'

: "${TARGET_PROJECT_REF:?Set TARGET_PROJECT_REF to the approved staging project ref}"
[[ "$TARGET_PROJECT_REF" != "$PRODUCTION_PROJECT_REF" ]] || die 'Refusing to inspect or apply migrations against production'
[[ "$TARGET_PROJECT_REF" == "$STAGING_PROJECT_REF" ]] || die 'TARGET_PROJECT_REF is not the approved staging project'
[[ "${STAGING_VERIFICATION_CONFIRMED:-}" == yes ]] || die 'Set STAGING_VERIFICATION_CONFIRMED=yes after independently checking the target ref'

linked_ref_file='supabase/.temp/project-ref'
[[ -f "$linked_ref_file" ]] || die 'No linked Supabase project; link staging manually only after review'
linked_ref="$(tr -d '[:space:]' < "$linked_ref_file")"
[[ "$linked_ref" != "$PRODUCTION_PROJECT_REF" ]] || die 'The Supabase CLI is linked to production; refusing all remote commands'
[[ "$linked_ref" == "$STAGING_PROJECT_REF" ]] || die 'The Supabase CLI link does not match approved staging'

shopt -s nullglob
migrations=(supabase/migrations/*.sql)
(( ${#migrations[@]} > 0 )) || die 'BLOCKED: no reviewed schema baseline exists; nothing may be rebuilt or dry-run'
review_attestation='supabase/migrations/REVIEW_ATTESTATION.md'
[[ -f "$review_attestation" ]] || die 'BLOCKED: solo review attestation is missing'
grep -Eq '^Pass A: approved$' "$review_attestation" || die 'BLOCKED: Pass A is not explicitly approved'
grep -Eq '^Pass B: approved$' "$review_attestation" || die 'BLOCKED: Pass B is not explicitly approved'
grep -Eq '^Automated structural validation: passed$' "$review_attestation" || die 'BLOCKED: structural validation has not passed'
grep -Eq '^Encrypted source SHA-256: [0-9a-f]{64}$' "$review_attestation" || die 'BLOCKED: encrypted source hash is missing'
candidate_hash="$(sha256sum "${migrations[0]}" | awk '{print $1}')"
grep -Fqx "Sanitized candidate SHA-256: $candidate_hash" "$review_attestation" || die 'BLOCKED: candidate hash does not match reviewed baseline'
command -v supabase >/dev/null || die 'supabase CLI is required'

# Both commands are remote read/diff operations. --dry-run must never be removed here.
supabase migration list --linked
supabase db push --linked --dry-run
printf 'Staging migration history inspected and migration push dry-run completed; no migration was applied.\n'

# Production baseline migration holding area

This directory is intentionally empty of executable migrations. The repository does not
currently contain an authorized production schema export, and the two SQL files under
`scripts/` are historical evidence rather than a complete baseline.

Add a baseline here only after following `docs/SUPABASE_SCHEMA_RECOVERY.md`. The first file
must be named `YYYYMMDDHHMMSS_production_baseline.sql`, be generated from the approved
schema-only export, have secrets and environment-specific ownership removed by review, and
carry the export SHA-256 in the recovery evidence. Never infer missing objects from client
calls and never apply this directory to production as part of recovery.

A future baseline PR must also add `REVIEW_ATTESTATION.md` containing exactly one public,
non-sensitive attestation for the encrypted-source hash, sanitized-candidate hash, static offline
structural-validation result, and explicit Pass A and Pass B approvals. It must also contain the
separate field `Fresh-database apply and deterministic fingerprint validation: passed`, but that
value must not be added until this currently unimplemented validator exists and has passed for the
candidate. Detailed findings and raw material remain in the private encrypted evidence store. The
staging guard verifies these fields and the candidate file hash; an absent, incomplete, or stale
attestation fails closed. Pass A/Pass B alone never permits staging inspection. A complete
attestation permits only guarded staging inspection after separate staging authorization; it does
not authorize staging application or any production mutation.

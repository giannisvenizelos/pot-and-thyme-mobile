# Production baseline migration holding area

This directory is intentionally empty of executable migrations. The repository does not
currently contain an authorized production schema export, and the two SQL files under
`scripts/` are historical evidence rather than a complete baseline.

Add a baseline here only after following `docs/SUPABASE_SCHEMA_RECOVERY.md`. The first file
must be named `YYYYMMDDHHMMSS_production_baseline.sql`, be generated from the approved
schema-only export, have secrets and environment-specific ownership removed by review, and
carry the export SHA-256 in the recovery evidence. Never infer missing objects from client
calls and never apply this directory to production as part of recovery.

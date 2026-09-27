# Supabase recovery workspace

`migrations/` is reserved for a reviewed production baseline. It deliberately contains no
executable SQL yet. Production exports belong in an encrypted evidence store, not in Git;
the ignored `exports/` directory is only a local staging location.

See [`docs/SUPABASE_SCHEMA_RECOVERY.md`](../docs/SUPABASE_SCHEMA_RECOVERY.md) for the
read-only export, security inventory, staging rebuild, and acceptance procedure.

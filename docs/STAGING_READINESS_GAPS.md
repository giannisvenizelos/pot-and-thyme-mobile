# Staging readiness gaps

**Status:** draft readiness summary, based only on tracked repository evidence. No remote
environment was contacted. This document does not authorize a staging rebuild, migration,
deployment, seed, or remote test.

## Audit snapshot

The current audit contains **38 dependencies**: **11 covered**, **8 partial**, **0 not covered**,
and **19 blocked on unknown semantics**. “Covered” means covered by an offline synthetic
expectation, not that a server enforces the expectation. In particular, synthetic acceptance
expectations are test-plan inputs; they are **not evidence of RLS, Storage, Realtime, Auth, RPC,
or API enforcement** in staging or production.

The following machine-readable snapshot is intentionally kept in this document so the offline
readiness verifier can detect drift:

```json readiness-audit
{
  "counts": {
    "total": 38,
    "covered": 11,
    "partial": 8,
    "not-covered": 0,
    "blocked-unknown-semantics": 19
  },
  "partial": [
    "postgrest:recipes",
    "postgrest:meal_plan",
    "postgrest:shopping_checks",
    "realtime:shopping_checks",
    "storage:upload",
    "storage:read",
    "storage:sign",
    "storage:delete"
  ],
  "blocked-unknown-semantics": [
    "rpc:get_app_bootstrap",
    "rpc:create_household",
    "rpc:join_household",
    "rpc:remove_meal_plan_item",
    "rpc:create_community_recipe",
    "rpc:moderate_community_recipe",
    "rpc:edit_pending_community_recipe",
    "rpc:update_my_display_name",
    "rpc:delete_my_account",
    "rpc:export_my_data",
    "rpc:get_current_legal_versions",
    "api:GET:/api/catalog",
    "api:GET:/api/recipe",
    "api:POST:/api/ai-fridge",
    "realtime:meal_plan",
    "auth:password-sign-in",
    "auth:sign-up",
    "auth:refresh",
    "auth:update-password"
  ]
}
```

## Work that remains safe now (repository only)

- Keep the inventory, API contracts, fixture references, and audit classifications synchronized
  with tracked client and historical source.
- Add or refine offline checks of observable client request/response shapes and local-only effects
  when tracked source supports them.
- Maintain deterministic synthetic fixtures and the future acceptance matrix without executing
  either against a database or service.
- Maintain fail-closed staging guards and documentation. Do not turn inferred client behavior or
  synthetic expected outcomes into authorization rules.

This work can improve the test plan, but cannot promote a partial or unknown-semantics dependency
to verified server behavior.

## Evidence and execution blockers

| Dependencies | Evidence required before implementation | Runtime verification still required |
| --- | --- | --- |
| `postgrest:recipes`, `postgrest:meal_plan`, `postgrest:shopping_checks` | Reviewed schema, grants, and RLS policies, including actor and household boundaries | Staging reads/writes and positive/negative cross-tenant cases |
| `storage:upload`, `storage:read`, `storage:sign`, `storage:delete` | Reviewed bucket configuration and complete Storage policies/object-key rules | Staging operation, invalid-object, and actor-boundary cases |
| `realtime:meal_plan`, `realtime:shopping_checks` | Reviewed Realtime publication, replica identity, and authorization/RLS evidence | Staging same-tenant delivery and cross-tenant non-delivery |
| All 11 blocked `rpc:*` entries in the snapshot | Reviewed function signatures/bodies, owners, grants, private dependencies, safe `search_path`, schema, and RLS evidence | Staging success, denial, validation, rollback, and replay behavior as applicable |
| `auth:password-sign-in`, `auth:sign-up`, `auth:refresh`, `auth:update-password` | Reviewed staging Auth configuration and its database hooks/triggers or RPC dependencies | Staging lifecycle, redirect, token, rate-limit, and failure behavior |
| `api:GET:/api/catalog`, `api:GET:/api/recipe`, `api:POST:/api/ai-fridge` | **Missing authoritative API/backend handler source** plus reviewed validation, authorization, secrets, quota/privacy, and error behavior | Staging contract, authorization, CORS, quota, timeout, and log-redaction behavior |

Thus, reviewed schema/RLS evidence is required for the PostgREST and RPC groups; reviewed Storage
evidence is required for all four Storage entries; and reviewed Realtime plus applicable RLS
evidence is required for both Realtime entries. The three HTTP API entries specifically require
missing API/backend source. Every dependency in the partial and blocked lists requires staging
runtime verification before its server behavior can be called ready.

## Exact next gate

The next gate before any real staging rebuild work can continue is the existing **mandatory
two-person schema review**: two authorized humans must review the encrypted material outside Git,
reconcile it with the structural catalog, and approve a sanitized, secret-free baseline with
explicit disposition of private tables, grants/RLS, Storage policies, Realtime configuration, and
every `SECURITY DEFINER` overload. This document neither accesses nor approves that evidence.

After that gate, a separate reviewed PR may introduce the baseline. Restoring or authoritatively
reimplementing the three missing API handlers and authorizing staging execution remain later,
independent prerequisites. Until those approvals occur, do not rebuild, connect, seed, deploy, or
run remote tests.

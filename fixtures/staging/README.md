# Synthetic staging fixture specification

These fixtures are a repository-only, domain-level description of data that may eventually be
used to test an isolated staging rebuild. They are **not** database rows, a migration, a seed
script, or authorization to connect to any Supabase project. Every person, household, recipe,
ingredient, plan entry, and shopping item is fictional and deterministic.

`synthetic-fixtures.json` deliberately uses logical names such as `householdRef`, `ownerRef`, and
`visibility`. These names express test relationships, not database columns or RPC parameters.
The observed HTTP response contracts in `contracts/` allow string recipe identifiers, so the
logical recipe identifiers can be used by offline contract fakes without assuming a database key
type.

## Blocked mappings

The following work is **BLOCKED pending the future reviewed schema and its mandatory two-person
approval**:

- mapping logical entities or references to tables, columns, foreign keys, enum values, or Auth
  metadata;
- translating `visibility` into RLS policies, grants, moderation values, RPC arguments, or API
  filtering behavior;
- translating meal-plan and shopping-item concepts into database writes or Realtime filters;
- assigning database-generated identifiers, timestamps, defaults, storage paths, or ownership;
- creating an adapter, executable seed, migration, remote test, or cleanup procedure.

No fixture key should be copied into SQL merely because its name resembles tracked client code.
After the reviewed schema exists, a separate reviewed change must define an explicit adapter and
confirm every authorization expectation before any isolated-staging execution.

## Acceptance scenarios

The `cases` array is executable documentation for a future authorization harness. `allow` cases
cover same-household access and public-recipe discovery. `deny` cases require cross-household
meal-plan/shopping isolation and denial of household-only recipes to outsiders and anonymous
actors. The offline verifier currently checks only fixture safety and logical consistency; it does
not claim that any missing server or database implementation enforces these expectations.

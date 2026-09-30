# Synthetic staging acceptance fixture specification

These fixtures are a repository-only, domain-level description of acceptance expectations that
may eventually be exercised against an isolated staging rebuild. They are **not evidence** that
production or staging currently enforces any expectation. They are also not database rows, a
migration, a seed script, or authorization to connect to any Supabase project. Every identity,
email, household, recipe, identifier, object path, filename, plan entry, and shopping item is
fictional and deterministic.

`synthetic-coverage-audit.json` is the repository-only inventory and gap report for
client-facing RPC, HTTP API, direct PostgREST, Realtime, Storage, and Auth dependencies.
Its classifications measure **test-plan coverage only** and do not prove production or
staging behavior, configuration, authorization, or deployment state. A blocked entry means
that the repository does not establish enough authorization or runtime semantics to invent
an allow/deny expectation safely.

`synthetic-fixtures.json` reuses a single `cases` model for table, RPC, Realtime, and Storage
expectations. Logical names such as `householdRef`, `ownerRef`, `resourceRef`, and `pathRef`
express test relationships, not discovered database columns, RPC parameters, channels, buckets,
or policies. The observed HTTP response contracts in `contracts/` allow string recipe identifiers,
so logical recipe identifiers can be used by offline contract fakes without assuming a database
key type.

## Safety boundary

The fixture and verifier must remain offline and repository-only. Running `npm run test:fixtures`
reads local JSON and contract files; it has no remote adapter and must not be given credentials.
It checks the acceptance model's internal consistency, not a deployed system's behavior.
`npm run test:coverage-audit` likewise reads only tracked local evidence. It verifies the
closed dependency inventory, fixture-case links, and the rule that unknown semantics cannot
be marked fully covered.

The following work remains **BLOCKED pending the future reviewed schema and its mandatory
two-person approval**:

- mapping logical entities or references to tables, columns, foreign keys, enum values, Auth
  metadata, buckets, object keys, publications, or channels;
- translating expectations into RLS or Storage policies, grants, RPC arguments, API filters,
  Realtime filters, or `SECURITY DEFINER` implementations;
- assigning database-generated identifiers, timestamps, defaults, or ownership;
- creating an adapter, executable seed, migration, remote test, or cleanup procedure; and
- claiming that passing this offline verifier proves production or staging enforcement.

No fixture key should be copied into SQL merely because its name resembles tracked client code.
After the reviewed schema exists, a separate reviewed change must define an explicit adapter and
confirm every authorization expectation before any isolated-staging execution.

## Acceptance coverage

The `cases` array records an actor, operation surface, action, resource, and expected `allow` or
`deny` result. It covers:

- read/insert/update/delete isolation across two fictional households for each declared
  household-scoped resource;
- denial of direct table writes for resources whose writes are expected to use an RPC;
- authorized and unauthorized actors for each synthetic `SECURITY DEFINER` RPC path;
- same-household Realtime delivery and cross-household non-delivery in both directions; and
- Storage upload/read/sign/delete behavior for synthetic-only paths, including owner access and
  denial to both another user in the household and a user in another household.

The offline verifier fails closed if identifiers, emails, Storage paths, or RPC names are
duplicated; references or resource types are inconsistent; equivalent scenarios are duplicated
or contradictory; authorization logic is contradicted; or a required category/action is absent.
These are acceptance expectations only and **do not prove that production or staging currently
enforces them**.

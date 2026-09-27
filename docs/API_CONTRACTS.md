# PR 2B — Backend source recovery and API contracts

Audit date: 2026-09-26. This document separates observed client behaviour from facts that
still require the original server source or a staging deployment. It is not a replacement
implementation.

## Recovery result and evidence

The original source for `GET /api/catalog`, `GET /api/recipe`, and
`POST /api/ai-fridge` was **not found**. The following locations were searched:

- every reachable commit, branch, tag, tree, and unreachable Git object in this Mobile
  repository;
- every public branch, tag, and commit in the separate
  `giannisvenizelos/pot-and-thyme-Web` repository, including its original recovery branch;
- the owner's other public repository (`my-app`);
- tracked files and history for paths and strings matching the three endpoints.

Both application repositories start from frontend assets recovered from the public Vercel
deployment. Their histories contain the clients, but no `api/` tree. The Web and Mobile
clients share the relevant `shared/app1.js` and `shared/ai.js` implementation, so the Web
repository adds corroboration but no additional server contract.

The deployment URL could not be inspected from this runner (the network proxy returned
HTTP 403). Even a successful public request would establish only current observable
behaviour, not recover source or identify its commit.

### Access required to continue recovery

| Source | Minimum access | Required evidence (never secret values) |
| --- | --- | --- |
| Vercel | Project Viewer for deployments/settings; owner-assisted artifact/source export | project/repository link, deployment id and commit, function file/artifact, runtime and region, routes, build logs, environment variable **names and scopes**, deployment retention |
| Original source control | read-only access to all repositories, archived forks, deleted/default branches and release artifacts | exact commit/tree containing `api/catalog`, `api/recipe`, `api/ai-fridge`, lockfile, tests and provenance |
| Historical artifacts | read-only access to the pre-split Vercel deployment or approved backup | immutable artifact checksum, build metadata, source map/file provenance and deployment timestamp |
| Supabase | read-only staging/schema metadata; production access only under the separate recovery runbook | RLS/grants and recipe/RPC definitions needed to verify exposure; no user rows or secret values |

If source is recovered, it must first be placed in an access-controlled quarantine, tied to
a deployment checksum/commit, scanned for credentials and personal data, dependency-audited,
and reviewed for privileged Supabase keys, authorization, quota enforcement and logging.
Only the reviewed, secret-free source and unit tests should enter a follow-up commit. It must
not be deployed by this PR.

## Confidence labels

- **Confirmed:** directly exercised by a checked-in client.
- **Implied:** required for that client to work, but not proven server-side.
- **Unknown:** cannot be recovered from the clients and must not be guessed.

The machine-readable response shapes under `contracts/` deliberately describe only fields
the clients consume. They permit extra fields because the recovered clients do so.

## `GET /api/catalog`

### Request

| Item | Contract | Confidence |
| --- | --- | --- |
| Method/path | `GET /api/catalog` | Confirmed |
| `meal` | query string; always emitted by the client, but may be empty; plural Greek labels are normalized to singular | Confirmed |
| `subcategory` | optional non-empty query string | Confirmed |
| `q` | optional trimmed search string | Confirmed |
| `after` | optional string representation of the last received recipe `id` | Confirmed |
| `limit` | decimal string; current client sends `1000` | Confirmed |
| Authentication | client sends no `Authorization`, cookie, or Supabase header to this endpoint | Confirmed |

Anonymous server support is **implied**, not proven. Validation rules, defaults, maximum
limit, cursor semantics, ordering, cache/CORS headers and whether unknown parameters are
rejected are unknown. The direct Supabase fallback orders by `created_at DESC` but filters a
subsequent page with `id > after`; that inconsistency must not be promoted to a server
contract.

### Success response

- JSON top-level array (`application/json` is implied).
- Each consumed row has: `id`, `title`, `meal`, `subcategory`, `prep_minutes`,
  `cook_minutes`, `created_at`, `created_by`, `recipe_origin`, `moderation_status`, and
  `photo_url`. Nullable/type details not forced by client operations remain nullable in the
  recorded schema.
- Empty results are `[]`.

The status code (beyond being 2xx), exact selected columns, visibility policy and pagination
stability are unknown.

### Errors

For non-2xx, the client attempts JSON and consumes `message` when it is a string; otherwise
it shows a fixed catalogue error and attempts direct Supabase fallback. Network errors,
non-JSON bodies and a non-array 2xx body also enter failure/fallback handling. Status codes,
headers and canonical error shape are unknown.

## `GET /api/recipe`

### Request

| Item | Contract | Confidence |
| --- | --- | --- |
| Method/path | `GET /api/recipe` | Confirmed |
| `id` | query value produced with `Number(id)`; normal navigation uses a recipe id | Confirmed client serialization only |
| Authentication | client sends no `Authorization`, cookie, or Supabase header | Confirmed |

Whether the server accepts only positive safe integers, its behaviour for duplicate/missing
ids, and authorization/visibility rules are unknown. Anonymous support for visible recipes
is implied by the request.

### Success response

- JSON top-level array, not an object; the client reads only index `0`.
- A found recipe contains its recipe columns plus `recipe_ingredients` and `recipe_steps`
  arrays. The client sorts each nested array by numeric `position`.
- Ingredient fields demonstrably consumed elsewhere are `position`, `raw`, `qty_min`,
  `qty_max`, `unit`, `item`, `category`, and `option_code`. Step fields are `position` and
  `instruction`. Recipe fields used by renderers are recorded in the schema.
- An empty array is treated as “not found” by the client, even if returned with 2xx.

Exact columns, nullability, nested row ordering from the server, not-found status and cache
headers are unknown.

### Errors

For non-2xx, JSON `message` is consumed if present; otherwise a fixed Greek not-found
message is used. Network, non-JSON and non-2xx responses trigger a direct Supabase fallback.
After fallback, no first row produces the same not-found message. Canonical status/error
codes and whether missing and forbidden are intentionally indistinguishable are unknown.

## `POST /api/ai-fridge`

### Request

| Item | Contract | Confidence |
| --- | --- | --- |
| Method/path | `POST /api/ai-fridge` | Confirmed |
| Content type | `application/json` | Confirmed |
| Body | `{ "text": string }`; UI trims it and refuses lengths below 3 | Confirmed client behaviour |
| Authentication | `Authorization: Bearer <Supabase access token>` | Confirmed |
| UI precondition | authenticated session and a loaded household | Confirmed client routing behaviour |

Token verification, household membership enforcement, text byte/character maximum,
accepted Unicode, JSON/body limits, allowed methods, quota identity and proxy trust are
unknown. The three-character rule is client-side only and is not claimed as server
validation.

### Success response

The response is an object. The client defaults omitted properties, but the useful observed
shape is:

- `matches`: array. Each rendered match consumes `id`, `title`, `missing_count`, `missing`,
  `match_percent`, `prep_minutes`, and `cook_minutes`.
- `ingredients`: array of displayable parsed ingredient values.
- `mode`: the value `ai` receives an AI label; every other truthy value is displayed as a
  local mode. The historical server enum is therefore unknown (the schema records known
  client labels `ai` and `local`).
- `usage`: when truthy, an object with displayable `remaining`.
- `notice`: when truthy, a displayable message.

The provider/model, prompt, parsing/ranking algorithm, match ordering, numeric ranges,
quota limit/window/timezone, and whether a local fallback ran server-side are unknown.

### Errors

For any non-2xx response, the client displays JSON `message` when available or the fixed
search failure message. It does not retry or fall back to another endpoint. Network and
JSON parse failures are also displayed. Authentication, validation, quota/rate-limit,
provider and internal-error status codes/schemas are unknown.

## Reconstruction plan (only if provenance recovery remains impossible)

1. Obtain owner sign-off that all sources/artifacts above were exhausted; preserve the
   evidence manifest and explicitly classify the next work as a new implementation.
2. Agree an OpenAPI contract: validation bounds, stable ordering/cursor, visibility, exact
   status/error envelope, auth challenges, cache/CORS behaviour and AI quota semantics.
3. Export and review the staging schema/RLS and implement a repository layer that uses the
   requester's JWT for public/user-scoped reads. Any privileged credential requires a
   documented threat model and deny-by-default authorization.
4. Implement catalogue and detail first, with deterministic pagination and explicit
   published/pending/deleted visibility tests for anonymous and authenticated roles.
5. Implement AI parsing/ranking behind an interface with a deterministic fake. Define data
   minimization, provider retention, prompt-injection handling, timeouts, capped retries,
   per-user/household quota, abuse controls and redacted observability before enabling a
   provider.
6. Add unit tests for every validation, authorization, visibility, pagination, quota and
   provider-failure path; verify response shapes against `contracts/`.
7. Run `scripts/test-staging-api.mjs` only against an isolated staging deployment seeded
   with fictional recipes/users. Expand it once the unknown status codes are approved.
8. Perform security review, secret/PII scan and staging acceptance. Deployment and any
   production configuration change require a separate approved PR/change record.

## Staging integration safety

`npm run test:integration:staging` is opt-in. It refuses known production/current public
domains, requires `STAGING_CONFIRM_SYNTHETIC_DATA=true`, and only uses recipe identifiers and
tokens supplied specifically for an isolated staging fixture. The test never creates users,
queries Supabase directly, or writes recipe/user data.

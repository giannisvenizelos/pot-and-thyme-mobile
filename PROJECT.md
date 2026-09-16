# Project record

## Purpose

PoT & Thyme TEST is a Greek-language meal-planning web application. It combines a recipe catalogue, household meal plans, an aggregated shopping list, community recipe submissions, moderation, account/privacy controls and an AI-assisted “what is in my fridge?” flow.

## Architecture

- **Frontend:** dependency-free HTML, CSS and browser JavaScript.
- **Hosting:** static files on Vercel, plus server-side `/api/*` endpoints in the deployed project.
- **Data and authentication:** Supabase project `ccvdkbdnykfhenhqkicm` using Auth, PostgREST RPCs and Realtime.
- **Offline support:** service worker with a versioned application-shell cache and IndexedDB catalogue/bootstrap cache.
- **Language/UI:** Greek interface; Google Fonts variable families `Literata` (display/serif) and `Inter` (UI/sans), both loaded with their optical-size axis. Both ship a Greek subset — the previous `Playfair Display`/`Cormorant Garamond` pairing did not, so Greek headings silently fell back to Georgia.

## Independent web and mobile deployments (2026-09-15)

The browser interfaces are split into `apps/web/` and `apps/mobile/`. Each owns its entry point, renderer and styles. Common data/authentication and feature modules, legal pages and artwork live in `shared/`. `scripts/build.mjs` generates each app's static `public/` output and edition-specific service worker. The repository-root Vercel configuration builds the web edition, preserving the existing project URL. The dedicated mobile edition loads its own presentation at all widths.

The module inventory below describes the recovered modules; common files now live under `shared/`, and `app4.js` / `app.css` have separate copies under each app directory. Generated service workers replace the recovered `sw.js`.

## Frontend modules

| File | Responsibility |
| --- | --- |
| `app1.js` | Shared state, Supabase client helpers, IndexedDB cache, catalogue loading and recipe details |
| `app2.js` | Authentication, household membership, meal plan, shopping state and Supabase Realtime |
| `app3.js` | Community recipe creation, recipe modal and moderation UI |
| `app4.js` | Main rendering, events, navigation and service-worker registration |
| `ai.js` | AI fridge search UI and `/api/ai-fridge` client |
| `legal.js` | Registration consent, legal/privacy controls, account export and deletion UI |
| `moderation-edit.js` | Editing pending community recipes |
| `account-settings.js` | Display-name and password management |
| `enhancements.js` | Additional UI/UX enhancements |
| `app.css` | Main responsive application styling |
| `legal-pages.css` | Shared legal-page styling |
| `sw.js` | Offline application-shell cache |

## External API surface used by the frontend

The frontend calls these Vercel endpoints:

- `GET /api/catalog`
- `GET /api/recipe?id=...`
- `POST /api/ai-fridge`

It also calls Supabase Auth, REST and Realtime endpoints. Supabase RPC names visible in the client include `create_household`, `join_household`, `get_app_bootstrap`, `remove_meal_plan_item`, `create_community_recipe`, `moderate_community_recipe`, `edit_pending_community_recipe`, `update_my_display_name`, `delete_my_account`, `export_my_data` and `get_current_legal_versions`.

## Recovery provenance and limits

This repository snapshot was reconstructed on 2026-08-29 from the public assets served by `https://pot-and-thyme-test.vercel.app/`. The repository was empty before the recovery.

The deployed frontend, service worker and public legal pages are included byte-for-byte as served. Vercel serverless function source, Supabase database schema/migrations, row-level-security policies, Edge Functions, seed data and private environment variables cannot be recovered from public browser assets and are therefore not included. The Supabase publishable key in `app1.js` is designed for browser use; authorization must remain enforced by Supabase RLS policies.

To make the project fully reproducible, export the missing backend sources from the original Vercel/Supabase projects and add them under `api/` and `supabase/` respectively.

## Suggested next repository structure

```text
.
├── api/                 # Vercel function sources (not recovered)
├── supabase/
│   ├── migrations/      # Database schema/RLS/RPC migrations (not recovered)
│   └── seed.sql         # Optional catalogue seed (not recovered)
├── *.html               # Static pages
├── *.js                 # Browser modules
├── *.css                # Styles
└── sw.js                # Service worker
```

## Security notes

- Never commit Supabase service-role keys, AI-provider keys or Vercel secrets.
- Keep privileged operations behind server-side endpoints or RLS-protected RPCs.
- Review the account deletion/export RPCs and moderation RPCs before production use.
- Treat this deployment as a recovery snapshot until backend sources and migrations are restored and reviewed.

## Recipe management implementation (2026-09-15)

Added shared `recipe-management.js` / `.css`, a private `recipe-photos` Storage bucket, owner-bound management RPCs (`save_recipe`, `set_recipe_photo`, `delete_recipe`, `restore_recipe`, `can_manage_recipe`, `recipe_management_access`) and recoverable deletion via `recipes.deleted_at`. The owner mapping lives in `private.recipe_management_owner`, inaccessible to client roles. Community authors can edit their own content; curated management is restricted to the mapped owner.

Supabase migrations applied: `recipe_management_and_private_photos`, `preserve_recipe_ingredient_variants_in_editor`, and validation/source-preservation updates. Source and rolled-back permission verification are in `scripts/`.

## Photo-only save regression (2026-09-16)

The imported breakfast recipes have instruction text in `source_text`, but 90 have no rows in `recipe_steps`. The editor previously sent every photo edit through `save_recipe`, which requires at least one structured step. Consequently that RPC rejected the save before any image upload. Its error was displayed only above the ingredients, far from the save button.

Photo-only edits now use the existing authenticated Storage and `set_recipe_photo` flow without rewriting or validating unrelated recipe fields. An editable-field signature distinguishes real edits from number-input serialization changes. Full recipe edits retain validation; errors and upload progress also appear beside Save, and upload retries retain the image without repeating a successful metadata write. Edit-modal row/category controls are explicitly bound after the modal is inserted.

`npm run test:ui` includes integration regressions using each available edition's real renderers and event handlers, with HTTP and canvas boundaries mocked. Cases cover missing imported steps, photo-only preservation, metadata plus photo, upload/link retries and visible validation. These are not authenticated production upload tests. No database records, functions, RLS policies or bucket permissions were changed for this fix.

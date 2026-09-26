# PoT & Thyme Mobile

The dedicated, independently deployable mobile browser application for PoT & Thyme.

| Vercel project | Root Directory | Build command | Output directory |
| --- | --- | --- | --- |
| pot-and-thyme-mobile | repository root | npm run build | apps/mobile/public |

The application is deployed at `https://pot-and-thyme-mobile.vercel.app/`.

## Source layout

- `apps/mobile/`: mobile entry point, stylesheets and renderer. The mobile presentation remains active at every viewport width, including phone rotation.
- `shared/`: data/authentication modules, feature helpers, legal pages and image assets.
- `scripts/build.mjs`: dependency-free build, copies shared and mobile assets and generates a versioned offline shell.

The mobile app uses the existing Supabase project and accounts. Browser login sessions, offline caches and themes are stored on the mobile origin. There is no automatic device redirect.

## Local use

```bash
npm ci
npm run build
npm run dev          # mobile, port 3000
npm run test:ui
```

Build output is generated and ignored by Git. Edit source files rather than `public/`.

## Git deployments

Connect the mobile Vercel project to this repository and use the settings above. Keeping the Root Directory at the repository root lets the build read `shared/` and `scripts/` directly.

## Existing backend limitation

This repository was recovered from public frontend assets on 2026-08-29. Serverless `/api/*` source, database migrations and private environment variables are absent. `/api/catalog` returned HTTP 404 on the existing deployment during the split. Catalogue and recipe details retain their existing direct Supabase fallback. AI fridge search still requires the missing `/api/ai-fridge` endpoint; splitting the frontends does not restore it. See `PROJECT.md` for recovery provenance.

## Recipe management and photos

The mobile edition supports photo upload and native phone camera capture. Desktop browsers can open a live camera preview. Images are resized to at most 1600 pixels, converted to JPEG and uploaded to the private Supabase `recipe-photos` bucket (5 MB limit). Stable authenticated Storage URLs are stored in `recipes.photo_url`; the UI obtains temporary signed URLs for display.

The recipe manager account is bound by user ID to `giannis.venizelos@gmail.com`. It can create and edit curated recipes and manage community submissions. Other users can create, edit and delete their own community recipes; edits and photo changes return their submissions to pending moderation. Database RPC checks and Storage RLS enforce this independently of UI controls.

Recipe deletion sets `deleted_at` and hides the recipe from the catalogue. Undo restores it; household plan references remain intact. Removing a photo clears its reference and requests deletion of its Storage object. Replacement uses a unique path and then removes the old object. Photo-link failures preserve the draft and retry the same recipe ID.

Backend setup is recorded in `scripts/recipe-management.sql`. Permission fixtures in `scripts/verify-recipe-permissions.sql` run inside a rolled-back transaction. Run `npm run test:ui` for the editor, upload/retry, ownership, deletion/undo and camera lifecycle checks. Physical device camera behavior still depends on browser support and user permission.

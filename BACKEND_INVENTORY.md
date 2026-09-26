# Backend Inventory — PR 2A

Ημερομηνία απογραφής: 2026-09-26  
Βάση απογραφής: ο πηγαίος κώδικας του repository, στο merge commit του PR 1 (`ecb00ec`).

## 1. Σκοπός, όρια και βεβαιότητα

Το έγγραφο καταγράφει **μόνο ό,τι αποδεικνύεται από τον υπάρχοντα κώδικα**. Δεν έγινε
σύνδεση στο Supabase/Vercel, SQL σε παραγωγή, μεταβολή δεδομένων ή deployment. Το project
Supabase που αναφέρεται από τον client έχει ref `ccvdkbdnykfhenhqkicm`. Το browser
publishable key υπάρχει ήδη στο recovered source και δεν επαναλαμβάνεται εδώ.

Η απογραφή δεν είναι schema dump. Το repository ανακτήθηκε από public assets και δεν
περιέχει το αρχικό schema, το μεγαλύτερο μέρος των migrations, τις serverless functions ή
τις ιδιωτικές ρυθμίσεις. Συνεπώς:

- **Παρατηρημένο** σημαίνει άμεση χρήση ή ορισμός στον κώδικα.
- **Μερικώς γνωστό** σημαίνει ότι γνωρίζουμε το client contract, όχι τον production ορισμό.
- **Άγνωστο** δεν συμπληρώνεται με υπόθεση και απαιτεί read-only export από εξουσιοδοτημένο
  διαχειριστή.

## 2. Supabase data inventory

### 2.1 Πίνακες που χρησιμοποιούνται άμεσα

| Schema / πίνακας | Πρόσβαση που παρατηρείται | Πεδία/σχέσεις που αποδεικνύονται | Καταναλωτής |
| --- | --- | --- | --- |
| `public.recipes` | `SELECT` μέσω PostgREST, και μεταβολές μέσα από RPC | `id`, `title`, `meal`, `subcategory`, `description`, `servings`, `prep_minutes`, `cook_minutes`, `created_at`, `created_by`, `recipe_origin`, `moderation_status`, `photo_url`, `category_id`, `subcategory_id`, `published_at`, `moderated_at`, `moderated_by`, `deleted_at`; embedded relations `recipe_ingredients`, `recipe_steps` | κατάλογος, detail, moderation, recipe manager |
| `public.recipe_ingredients` | embedded `SELECT`; `INSERT`/`DELETE` από `save_recipe` | `recipe_id`, `position`, `raw`, `qty_min`, `qty_max`, `unit`, `item`, `category`, `option_code` | detail/editor |
| `public.recipe_steps` | embedded `SELECT`; `INSERT`/`DELETE` από `save_recipe` | `recipe_id`, `position`, `instruction` | detail/editor |
| `public.recipe_categories` | `SELECT`, ταξινόμηση `display_order` | `id`, `name`, `display_order` | taxonomy filters |
| `public.recipe_subcategories` | `SELECT`, ταξινόμηση `display_order` | `category_id`, `name`, `display_order` | taxonomy filters |
| `public.meal_plan` | `INSERT`, `PATCH`; Realtime `*` | `id`, `household_id`, `user_id`, `plan_date`, `meal_slot`, `recipe_id`, `servings` και bootstrap `title` | εβδομαδιαίο πλάνο |
| `public.shopping_checks` | upsert; Realtime `*` | `household_id`, `item_key`, `checked`, `updated_by` | κοινή λίστα αγορών |
| `private.recipe_management_owner` | μόνο μέσα από `SECURITY DEFINER` functions | `singleton`, `user_id` → `auth.users.id` | εξουσιοδότηση recipe manager |
| `auth.users` | lookup στο διαθέσιμο migration· κανονικά Supabase Auth | `id`, `email` (μόνο όσα φαίνονται στο SQL) | identity/owner mapping |
| `storage.buckets` | upsert στο διαθέσιμο SQL | private bucket config | photo setup |
| `storage.objects` | Storage API και έλεγχοι/πολιτικές SQL | `bucket_id`, `name`, `owner_id` (στα tests) | φωτογραφίες συνταγών |

Οι `households`/memberships πιθανότατα υπάρχουν πίσω από τα household RPCs και το
bootstrap, αλλά **κανένα όνομα ή schema πίνακα δεν εμφανίζεται στον client**. Δεν
καταγράφονται ως επιβεβαιωμένοι πίνακες. Το ίδιο ισχύει για πιθανούς πίνακες admin,
consent, rate-limit/AI usage ή audit.

### 2.2 RPC inventory

| RPC | Client input που παρατηρείται | Παρατηρούμενο αποτέλεσμα / χρήση | Production definition στο repo |
| --- | --- | --- | --- |
| `get_app_bootstrap` | `{}` | `{household, plan, shopping, is_admin}` | όχι |
| `create_household` | `{household_name}` | επιτυχία και νέο bootstrap | όχι |
| `join_household` | `{code}` | επιτυχία και νέο bootstrap | όχι |
| `remove_meal_plan_item` | `{p_id}` | void/αγνοείται | όχι |
| `create_community_recipe` | meal, subcategory, title, meta, ingredients, steps, prep/cook | void/αγνοείται | όχι |
| `moderate_community_recipe` | `{p_recipe_id,p_action}` (`approve`/`reject`) | void/αγνοείται | όχι |
| `edit_pending_community_recipe` | recipe id και editable recipe payload | void/αγνοείται | όχι |
| `update_my_display_name` | `{p_display_name}` | αποθηκευμένο display name | όχι |
| `delete_my_account` | `{}` | void· ο client καθαρίζει session/cache | όχι |
| `export_my_data` | `{}` | JSON download | όχι |
| `get_current_legal_versions` | `{}`, anonymous bearer | `{terms,privacy,storage}` | όχι |
| `recipe_management_access` | `{}` | boolean | **ναι**, `scripts/recipe-management.sql` |
| `can_manage_recipe` | `{p_recipe_id}` (χρησιμοποιείται server-side από SQL) | boolean | **ναι** |
| `save_recipe` | `{p_recipe_id,p_data}` | recipe integer id | **ναι** |
| `set_recipe_photo` | `{p_recipe_id,p_path}` | authenticated object URL ή null | **ναι** |
| `delete_recipe` | `{p_recipe_id}` | void, soft delete | **ναι** |
| `restore_recipe` | `{p_recipe_id}` | void | **ναι** |

Το SQL αρχείο τεκμηριώνει μια εφαρμοσμένη αλλαγή, όχι αποδεικτικό ότι η production βάση
σήμερα ταυτίζεται byte-for-byte με αυτό. Χρειάζεται catalog export για signatures,
owners, grants, volatility, `SECURITY DEFINER`, `search_path` και πραγματικά bodies όλων
των functions.

## 3. Authentication

Παρατηρούνται οι εξής λειτουργίες Supabase Auth:

1. Email/password sign-in: `POST /auth/v1/token?grant_type=password`.
2. Sign-up: `POST /auth/v1/signup`. Η ειδική registration ροή στέλνει metadata
   `full_name`, `pot_registration`, `legal_acknowledged` και τις τρεις legal versions.
3. Refresh: `POST /auth/v1/token?grant_type=refresh_token`, 90 δευτερόλεπτα πριν τη λήξη,
   και ενημέρωση του Realtime token.
4. Αλλαγή κωδικού: νέα password sign-in για επαλήθευση του τρέχοντος κωδικού και
   `PUT /auth/v1/user` με νέο password.
5. Logout: μόνο client-side διαγραφή του local session και κλείσιμο Realtime. Δεν
   παρατηρείται κλήση `/auth/v1/logout`/server-side revocation.
6. Account deletion και data export γίνονται από τα αντίστοιχα RPCs.
7. Session payload (access και refresh token) αποθηκεύεται σε `localStorage` με key
   `pot_session_v4` (legacy fallback `pot_session_v3`).

**Άγνωστες ρυθμίσεις:** enabled providers, email confirmation/redirect URLs, SMTP και
templates, CAPTCHA, MFA, password policy, JWT lifetime/secret rotation, hook/triggers,
allowed origins, rate limits, Auth audit logs και anonymous sign-in setting. Απαιτείται
read-only Dashboard/Management API export· μυστικά και password hashes δεν πρέπει να
εξαχθούν στο Git.

## 4. RLS και grants

### Επιβεβαιωμένα από το διαθέσιμο SQL

- `recipes_hide_deleted`: restrictive `SELECT` για `anon, authenticated`, μόνο όταν
  `deleted_at IS NULL`.
- `recipes_read_management_owner`: `SELECT` για `authenticated` όταν
  `recipe_management_access()`.
- `recipe_photos_upload`: `INSERT` σε `storage.objects` μόνο για authenticated χρήστη,
  path του ιδίου και recipe που διαχειρίζεται.
- `recipe_photos_read`: `SELECT` για authenticated χρήστη όταν το path αντιστοιχεί σε
  μη διαγραμμένη recipe.
- `recipe_photos_delete`: `DELETE` για uploader ή manager, με επιπλέον έλεγχο recipe.
- Τα έξι recipe-management RPCs έχουν explicit grants/revokes όπως ορίζει το SQL. Ο
  private owner table έχει revoke από `public`, `anon`, `authenticated`.

Το αρχείο **δεν ενεργοποιεί ρητά RLS** και δεν περιέχει τις προϋπάρχουσες policies.
Άρα δεν μπορεί να αποδειχθεί από το repository αν RLS είναι ενεργό/forced ή αν οι παραπάνω
policies συνδυάζονται με permissive policies που αλλάζουν το τελικό αποτέλεσμα.

### Απαιτούμενο read-only RLS export

Για κάθε exposed και Storage table λείπουν: `relrowsecurity`, `relforcerowsecurity`, όλες
οι policies (`cmd`, roles, permissive/restrictive, `USING`, `WITH CHECK`), table/sequence/
function grants, owners και schema privileges. Ιδιαίτερα πρέπει να επαληθευτούν οι
κανόνες για anonymous published recipes, own pending recipes, admins, household isolation,
direct `meal_plan` writes και `shopping_checks` upserts.

## 5. Storage

Ο μόνος επιβεβαιωμένος bucket είναι ο private `recipe-photos`: όριο 5 MiB και MIME
`image/jpeg`, `image/png`, `image/webp`. Το object key είναι
`<auth-user-uuid>/<recipe-id>/<random-uuid>.jpg`.

Παρατηρούμενες πράξεις:

- upload με `POST /storage/v1/object/recipe-photos/<path>` και `Content-Type: image/jpeg`·
- προσωρινό signed URL με `POST /storage/v1/object/sign/recipe-photos/<path>` και
  `{expiresIn:3600}` (client cache ~50 λεπτά)·
- delete με `DELETE /storage/v1/object/recipe-photos/<path>`·
- σύνδεση/αποσύνδεση του object από recipe μέσω `set_recipe_photo`.

Δεν υπάρχει object listing, versioning ή backup client. Δεν γνωρίζουμε άλλους buckets,
ολόκληρο το object inventory, orphan objects, πραγματικές bucket/policy ρυθμίσεις, region,
egress rules ή αν το SQL migration έχει drift.

## 6. Realtime

Ο client ανοίγει απευθείας Phoenix WebSocket στο Supabase Realtime, topic
`realtime:house-<household-id>`, με JWT του χρήστη. Κάνει subscribe σε όλα τα events
(`*`) των:

- `public.meal_plan`, filter `household_id=eq.<current-household-id>`
- `public.shopping_checks`, ίδιο filter.

Broadcast acknowledgements/self και Presence είναι απενεργοποιημένα. Υπάρχει heartbeat
ανά 20s, reconnect μετά 2s και debounced πλήρες `get_app_bootstrap` refresh μετά από
change. Άγνωστα παραμένουν publication membership, replica identity, Realtime limits,
server authorization behavior και αν υπάρχουν άλλες subscriptions εκτός repository.

## 7. Vercel API endpoints

### `GET /api/catalog`

**Client contract:** query `meal`, προαιρετικά `subcategory`, `q`, `after`, και `limit`
(ο client στέλνει `1000`). Αναμένει JSON array recipe summaries. Τα χρησιμοποιούμενα
fields είναι `id`, `title`, `meal`, `subcategory`, `prep_minutes`, `cook_minutes`,
`created_at`, `created_by`, `recipe_origin`, `moderation_status`, `photo_url`.

Σε network/non-2xx/invalid-shape failure ο client κάνει απευθείας PostgREST fallback στο
`recipes`, με φίλτρα meal/subcategory/title, order `created_at.desc`, και για pagination
`id=gt.<cursor>`. Αυτό το cursor δεν είναι συνεπές με το descending `created_at` order και
το API contract του endpoint δεν μπορεί να ανακτηθεί. Το README καταγράφει ότι το endpoint
επέστρεφε 404 κατά το mobile split.

### `GET /api/recipe?id=<id>`

**Client contract:** numeric recipe id και JSON array με πρώτο item τη recipe μαζί με
`recipe_ingredients(*)`, `recipe_steps(*)`. Ο client ταξινομεί τα nested rows με `position`.
Σε failure κάνει direct PostgREST fallback με `select=*` και τα δύο embeds.

Δεν γνωρίζουμε input validation, cache headers, exposure rules, authorization, query,
error schema ή αν ο intended response ήταν array αντί object.

### `POST /api/ai-fridge`

**Client request:** authenticated bearer access token, JSON `{text}` (UI minimum 3 chars).

**Client response:** `{matches, ingredients, mode, usage, notice}`. Κάθε match χρειάζεται
τουλάχιστον `id`, `title`, `missing_count`, `missing[]`, `match_percent` και time fields που
καταναλώνει το κοινό renderer. Το `usage` αναμένεται να έχει `remaining`. Το `mode` είναι
`ai` ή local fallback.

Δεν υπάρχει fallback endpoint. Λείπουν πλήρως provider/model/prompt, secret names,
normalization/ranking algorithm, recipe query, authorization verification, daily quota
scope/storage/reset timezone, abuse controls, privacy/log retention, timeout/retry,
observability και error contract.

### Κοινά άγνωστα των endpoints

Δεν υπάρχει tracked `api/` directory. Δεν γνωρίζουμε runtime/region, deployment version,
environment variables, Supabase credential class, CORS, caching/CDN, log drains,
functions configuration ή production-domain routing. Τα δύο tracked `vercel.json`
περιγράφουν μόνο static build/output και `/sw.js` cache header—όχι functions.

## 8. Πηγαίος κώδικας και πρόσβαση που λείπουν

### Missing source/artifacts

- Ο πηγαίος κώδικας και tests των τριών `/api/*` functions.
- Πλήρες Supabase schema history: tables, types, constraints, indexes, triggers, views,
  functions, grants, RLS, publications, extensions και seed strategy.
- Οι definitions των 11 RPCs που σημειώνονται «όχι» παραπάνω και τυχόν Edge Functions.
- Auth/Storage/Realtime declarative configuration.
- Vercel project configuration-as-code και inventory των env var **names** ανά environment.
- Runbooks, retention/SLO/RPO/RTO, backup evidence και restore drill records.

### Ακριβής πρόσβαση που απαιτείται (χωρίς secrets στο repo)

| Υπηρεσία | Ελάχιστη πρόσβαση | Στοιχεία προς εξαγωγή |
| --- | --- | --- |
| Supabase production | προσωρινός read-only/auditor ρόλος και Dashboard metadata access· ξεχωριστό εξουσιοδοτημένο backup operator μόνο όταν εκτελεστεί backup | schema-only dump, roles/grants χωρίς secrets, policies, functions, triggers, publications, extensions, Auth setting metadata, bucket metadata/object manifest, backup/PITR/retention status, region/version |
| Vercel production | Project Viewer για settings/deployments/log metadata· εξουσιοδοτημένος owner για ασφαλή παράδοση του missing source | linked Git repo/commit, build/functions/runtime/region/routes, domains, env var **names and scopes** (όχι values), integration names, deployment retention/log drains |
| Source control/artifact store | read access στο αρχικό repo και deployment artifacts | ακριβής function source, lockfiles, tests και migration history που παρήγαγε το active deployment |

Όλα τα exports πρέπει να αποθηκευτούν πρώτα σε κρυπτογραφημένο, access-controlled χώρο.
Μόνο reviewed, secret-free declarative source επιτρέπεται σε επόμενο PR.

## 9. Validation checklist για να κλείσει η απογραφή

- [ ] Σύγκριση πλήρους production schema export με τον παραπάνω observed κατάλογο.
- [ ] Καταγραφή όλων των function signatures/bodies/grants και κάθε `SECURITY DEFINER`.
- [ ] Καταγραφή RLS enabled/forced και όλων των policies/grants.
- [ ] Auth settings export χωρίς secrets ή user PII.
- [ ] Storage bucket list, object count/bytes/checksum manifest και orphan report.
- [ ] Realtime publication/replica identity export.
- [ ] Ανάκτηση function source και αντιστοίχιση με συγκεκριμένο Vercel deployment/commit.
- [ ] Env-var names/scopes/owners/rotation dates χωρίς values.
- [ ] Επιβεβαίωση contracts των τριών endpoints με tests σε staging, ποτέ σε production.


# Backend Backup, Recovery & Staging Plan — PR 2A

Ημερομηνία σχεδίου: 2026-09-26  
Κατάσταση: προτεινόμενο runbook· **δεν εκτελέστηκε** σε production.

## 1. Αρχές και στόχοι

Το πρώτο recovery artifact πρέπει να είναι ένα επαληθεύσιμο, κρυπτογραφημένο snapshot
πριν από οποιαδήποτε backend αλλαγή. Προτείνονται αρχικά:

- **RPO:** 24 ώρες για database/configuration και 24 ώρες για φωτογραφίες.
- **RTO:** 8 ώρες για database + Storage + εφαρμογή σε νέο, απομονωμένο project.
- retention: 7 daily, 5 weekly, 12 monthly snapshots, υπό την προϋπόθεση έγκρισης privacy/
  retention owner.
- κανόνας 3-2-1: τρία αντίγραφα, δύο διαφορετικά μέσα, ένα απομονωμένο/off-site.

Τα RPO/RTO είναι προτάσεις προς έγκριση, όχι υφιστάμενες εγγυήσεις. Native Supabase
backup/PITR coverage, retention και αν τα Storage objects περιλαμβάνονται πρέπει να
επαληθευτούν από το production plan/settings. Μέχρι τότε θεωρούμε database και objects
δύο ξεχωριστά backup streams.

## 2. Roles και ασφάλεια

- **Incident commander:** εγκρίνει restore point και go/no-go.
- **Database operator:** προσωρινό least-privilege backup/restore credential.
- **Storage operator:** object export/import και manifest validation.
- **App/Vercel operator:** source/config restoration και smoke checks.
- **Reviewer:** ελέγχει counts, checksums, RLS και sign-off, διαφορετικό άτομο από operator.

Credentials δίνονται από secret manager, ποτέ σε command history, logs ή Git. Τα dumps
θεωρούνται production προσωπικά δεδομένα: encryption in transit/at rest, restricted IAM,
audit logs, expiry/rotation και documented deletion. Δεν γίνεται restore production data σε
developer laptops ή staging.

## 3. Backup set

Κάθε immutable backup set παίρνει UTC id (π.χ. `2026-09-26T120000Z`) και περιλαμβάνει:

1. **Database logical backup:** schema (όλα τα relevant schemas), data, large objects,
   extensions metadata, sequences, functions, triggers, views/materialized views,
   constraints/indexes, grants/default privileges, RLS flags/policies και publications.
   Roles εξάγονται ξεχωριστά χωρίς passwords/secrets. Επιβεβαιώνεται επίσης native physical
   backup/PITR status και earliest restore point.
2. **Auth:** Auth schema μέσα στο εγκεκριμένο database backup και secret-free Auth settings.
   User/password data δεν εξάγονται σε documentation ή staging. JWT/SMTP/OAuth secrets
   αναδημιουργούνται από secret manager.
3. **Storage:** bucket configuration/policies, πλήρες recursive object copy και manifest με
   bucket, key, bytes, MIME, ETag όπου αξιόπιστο και ανεξάρτητο SHA-256. Για
   `recipe-photos`, διατηρούνται ακριβώς τα keys ώστε τα `photo_url` references να μείνουν
   συνεπή. Database row και object snapshot πρέπει να μοιράζονται consistency timestamp ή
   να καταγραφεί το reconciliation window.
4. **Supabase configuration:** project region/version, extensions, API/Auth/Storage/
   Realtime settings, cron/webhooks/Edge Function names/config, custom domains και migration
   history. Values μυστικών μόνο στον secret manager.
5. **Vercel/application:** Git commit/tag, complete API source and lockfile, build/output/
   function/runtime/region/routes/domains/integrations, env variable names + environment
   scopes, και secret-manager references—not values.
6. **Evidence:** tool versions, timestamps, checksums, encrypted archive location, record
   counts/table, object count/bytes/bucket, warnings και dual sign-off.

## 4. Backup procedure (όχι εντολές προς production σε αυτό το PR)

### A. Preflight

1. Εγκρίνεται change ticket, backup id, scope, operators και retention/legal basis.
2. Επιβεβαιώνονται destination encryption, capacity, IAM και restore project quota.
3. Καταγράφονται UTC start time, active Supabase/Vercel project refs και deployed commit.
4. Χρησιμοποιείται vendor-supported CLI/API version pinned στο runbook. Οι ακριβείς CLI
   εντολές οριστικοποιούνται μετά τον έλεγχο της τρέχουσας επίσημης τεκμηρίωσης και
   δοκιμάζονται πρώτα σε staging· δεν αυτοσχεδιάζονται σε production.

### B. Database/config export

1. Λαμβάνεται native backup/PITR status screenshot/API record.
2. Παράγονται logical schema, data και role/grant exports από read-only/backup endpoint.
3. Παράγονται machine-readable inventories για schemas/tables/counts, functions/signatures,
   triggers, RLS, grants, publications και extensions.
4. Γίνεται encryption πριν φύγει το trusted runner, checksum του ciphertext και immutable
   upload. Κανένα dump δεν μπαίνει στο repository.

### C. Storage export

1. Παγώνει ή καταγράφεται το write window ώστε να γίνει deterministic reconciliation.
2. Γίνεται paginated listing όλων των buckets/objects και streaming copy χωρίς public URLs.
3. Δημιουργείται local SHA-256 manifest και συγκρίνεται source count/bytes με destination.
4. Μετά το database snapshot, επαναλαμβάνεται delta listing. Objects χωρίς recipe reference
   και references χωρίς object καταγράφονται—δεν διαγράφονται αυτόματα.

### D. Vercel/source/config capture

1. Επιβεβαιώνεται ποιο Git commit αντιστοιχεί στο active production deployment.
2. Ανακτάται ο missing `/api` source από το canonical repo/artifact και γίνεται secret scan.
3. Εξάγονται settings και env var names/scopes. Secret values παραμένουν στο εγκεκριμένο
   secret manager και χαρτογραφούνται με opaque references.
4. Καταγράφονται domains/DNS/redirects, integrations, schedules και log drains.

### E. Verification

1. `SHA-256` verification σε κάθε archive/object και δεύτερη αντιγραφή.
2. Parse/list test για archives και σύγκριση table/object counts.
3. Automated secret scan των artifacts που πρόκειται να μπουν σε Git (μόνο source/config).
4. Υπογραφή manifest από operator και reviewer. Backup θεωρείται έγκυρο μόνο μετά από
   επιτυχημένο restore drill.

## 5. Recovery procedure

Η ανάκτηση γίνεται πρώτα σε **νέο απομονωμένο Supabase project**, ποτέ πάνω από production.

1. Incident commander επιλέγει backup/PITR timestamp με βάση το τελευταίο known-good event.
2. Δημιουργείται clean project στην ίδια συμβατή region/version. Network και email sending
   παραμένουν περιορισμένα, integrations/webhooks/schedules disabled.
3. Επαναφέρονται extensions και schema, έπειτα data/sequences, functions/triggers, και στο
   τέλος grants/RLS/publications. Ελέγχονται owners και `SECURITY DEFINER search_path`.
4. Επαναφέρονται bucket definitions/policies και objects με τα ίδια keys. Δεν γίνεται
   public bucket. Συγκρίνονται SHA-256/count/bytes και γίνεται reconciliation με
   `recipes.photo_url`.
5. Εφαρμόζονται νέα environment-specific secrets από secret manager. Production keys,
   OAuth callbacks, SMTP, webhooks και custom domains **δεν** αντιγράφονται τυφλά.
6. Γίνεται deploy του pinned commit σε preview/staging Vercel project μόνο αφού ανακτηθεί
   και reviewed ο API source. Το project δείχνει αποκλειστικά στο restored backend.
7. Τρέχουν automated smoke/contract/security tests: anonymous catalogue, recipe detail,
   signup/sign-in/refresh/password change, household isolation, plan/shopping Realtime,
   moderation/ownership, signed photo read/upload/delete, account export/delete και AI quota.
8. Συγκρίνονται schema fingerprint, row counts/critical aggregates, object checksums,
   endpoint responses και RLS negative tests. Ελέγχεται ρητά ότι cross-household, pending
   recipes και private photos δεν διαρρέουν.
9. Ο reviewer υπογράφει RPO/RTO και findings. Production cutover απαιτεί ξεχωριστό approved
   incident plan με maintenance window, fresh delta backup, DNS/domain plan και rollback.

### Restore acceptance criteria

- Όλα τα expected schemas/functions/policies/grants/publications συμφωνούν με το manifest.
- Table counts και agreed critical aggregates συμφωνούν ή κάθε απόκλιση αιτιολογείται.
- 100% object key/size/SHA-256 match και μηδενικά unexplained broken photo references.
- Όλα τα contract tests και τα RLS positive/negative tests περνούν.
- Δεν χρησιμοποιήθηκε production secret ή πραγματικό outbound email/webhook σε staging.
- Measured RPO ≤ 24h και RTO ≤ 8h, αλλιώς ανοίγει remediation item.

## 6. Ξεχωριστό staging backend με συνθετικά δεδομένα

Προτείνεται νέο Supabase project και νέο Vercel project, όχι Supabase branch που μπορεί να
κληρονομήσει production data/config χωρίς σαφή έλεγχο.

### Isolation requirements

- Διαφορετικά project refs, anon/service credentials, JWT, domains, OAuth callbacks,
  Storage buckets, log destinations και budgets/alerts.
- Μόνο staging env vars στο Vercel Preview/Development scope. Production domain και env
  scope απαγορεύονται.
- SMTP sandbox ή email disabled, webhooks/integrations disabled/default-deny, AI mock ή
  ξεχωριστό capped key.
- Schema εφαρμόζεται αποκλειστικά από reviewed migrations. Drift check σε κάθε CI run.
- Seed μόνο deterministic synthetic fixtures· ποτέ production dump, emails, UUID mapping,
  photos ή free-text.

### Synthetic seed matrix

Περιλαμβάνει fictional users manager/admin/member A/member B, δύο απομονωμένα households,
curated + approved/pending/rejected/soft-deleted community recipes, ingredients με ranges/
options, empty and populated plans, checked/unchecked shopping rows, και μικρές generated
JPEG/PNG/WebP fixtures στα ίδια path patterns. Περιλαμβάνει boundary fixtures (5 MiB limit,
invalid MIME, unauthorized object path) χωρίς πραγματικά προσωπικά δεδομένα.

### Staging acceptance criteria

- One-command idempotent reset/migrate/seed σε ephemeral ή staging project.
- Secret scanner επιβεβαιώνει ότι seed/migrations δεν περιέχουν production refs/keys/PII.
- API contract suite καλύπτει και τα τρία endpoints, success + validation + authorization +
  rate-limit/error paths.
- RLS matrix αποδεικνύει anon/authenticated/owner/admin/cross-household allow/deny.
- Storage και Realtime integration tests περνούν με synthetic users.
- Drift report μεταξύ migration state και staging catalog είναι κενό.

## 7. Επόμενα μικρά Pull Requests

### PR 2B — Recover backend source and contracts

**Scope:** προσθήκη secret-free `/api` source των τριών endpoints και contract tests, χωρίς
deployment/config αλλαγή.  
**Done when:** κάθε endpoint έχει documented request/response/error schema, auth behavior,
unit tests και staging-only integration test· το active Vercel deployment έχει αντιστοιχιστεί
σε source commit· secret scan και build περνούν.

### PR 2C — Baseline schema migration (schema only)

**Scope:** canonical migrations για schemas/tables/types/constraints/indexes/extensions και
όλα τα RPC bodies.  
**Done when:** clean staging rebuild succeeds, schema fingerprint matches the approved
production read-only export, every `SECURITY DEFINER` has fixed `search_path`, no production
data/identity/secret is committed, and migration lint passes.

### PR 2D — RLS/grants security baseline

**Scope:** declarative RLS, grants, Storage policies και Realtime publication.  
**Done when:** complete role/action matrix exists; automated positive and negative tests cover
every exposed table/RPC/bucket and cross-household cases; anonymous access is explicitly
enumerated; no unexplained privilege or permissive-policy interaction remains.

### PR 2E — Synthetic staging seed and CI

**Scope:** deterministic synthetic seed, generated image fixtures, reset workflow και CI.
**Done when:** clean one-command rebuild is repeatable, no PII/production refs pass scanners,
all endpoint/RLS/Storage/Realtime suites pass twice from a clean project, and staging egress
guards are documented/tested.

### PR 2F — Automated encrypted backups

**Scope:** reviewed backup scripts/workflow, manifest/checksum/retention logic και operator
runbook; πρώτα staging only.  
**Done when:** least-privilege execution produces encrypted database/config/object artifacts,
independent copy and signed manifest; restore drill meets approved RPO/RTO; failure alerts and
retention deletion are tested; artifacts/logs expose no secret.

### PR 2G — Recovery drill and operational handoff

**Scope:** automated restore validation, incident/cutover/rollback runbook και evidence
template.  
**Done when:** a new isolated project is restored from backup, every acceptance criterion in
§5 passes, timings and gaps are recorded, two-person sign-off exists, and corrective actions
have owners/deadlines.

## 8. Εξωτερικές πληροφορίες που μπλοκάρουν την εκτέλεση

Πριν μετατραπεί το παρόν σχέδιο σε executable runbook απαιτούνται οι ακριβείς πληροφορίες
πρόσβασης του `BACKEND_INVENTORY.md`: Supabase plan/backup/PITR/region/version, πλήρες schema
και Storage inventory, Vercel project/deployment/settings metadata, canonical API source,
env-var names/scopes και secret-manager ownership. Χωρίς αυτά δεν πρέπει να επιλεγούν
τυχαίες dump/restore flags ή να δηλωθεί ότι οι φωτογραφίες καλύπτονται από database backup.


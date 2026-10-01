# Private schema review: retained-copy continuity

**Status:** controlled offline continuity procedure; no evidence is included in this repository.  
**Scope:** use only when the original GitHub Actions artifacts have expired. This procedure does
not authorize production or staging access, decryption in a hosted environment, a migration, or a
deployment.

The schema-evidence artifact from extraction run `36348752361` had a one-day retention period and
is no longer available. Its source database-backup artifact from production backup run
`36339636375` had a three-day retention period and is also no longer available. Structural
validation run `36350856989` previously completed successfully. A maintainer retained encrypted
copies before expiry; those copies remain private and must not be added to this repository.

## Non-negotiable evidence boundary

- Perform real-evidence work only on a trusted, private, local machine with encrypted storage and
  network/cloud synchronization disabled for the working directory. Do not move evidence to a
  Codespace, GitHub, chat, CI, a repository artifact, or any other cloud service.
- Never commit or upload an encrypted retained copy. Plaintext or decrypted schema must **never**
  be committed, uploaded to GitHub, pasted into chat, or stored in repository artifacts.
- Retrieve the backup passphrase only through the maintainer's existing private process. Do not
  request, transmit, record, or handle it as part of repository or PR work.
- Do not connect to production or staging. This path is offline and read-only with respect to the
  retained copies.

## What this path can and cannot establish

The original artifact's SHA-256 was not independently recorded before expiry. Consequently, a
retained copy **does not have the same cryptographic provenance** as an artifact that can be
verified against a contemporaneous, independently stored original hash. Matching retained copies,
lineage records, exact file inventory, and reproduced structural validation establish continuity
and confidence only. They are **not cryptographic proof** that a retained copy is byte-identical
to the expired GitHub Actions artifact.

If stronger provenance is required, stop. Do not substitute this continuity procedure for it and
do not obtain new evidence from production under this procedure.

## Offline retained-copy gate

Complete every step in a private review record stored outside the repository. Any missing result
or mismatch fails closed: stop, preserve the encrypted inputs, remove temporary plaintext, and do
not begin or continue Pass A.

1. **Record the expected lineage before opening either copy.** Record all of the following exactly:
   - expected source production backup run ID: `36339636375`;
   - schema-evidence extraction run ID: `36348752361`;
   - successful structural validation run ID: `36350856989`;
   - retained-copy filenames/storage identifiers, acquisition timestamps if available, and the
     documented relationship from the source backup through extraction to validation; and
   - the validator version or repository commit, command, tool versions, and the complete
     previously accepted structural inventory/counts from validation run `36350856989`.

   Do not reconstruct missing lineage or counts from memory. The recorded source identity must be
   exactly `36339636375`, and the extraction/validation lineage must agree with the values above.
   Any absent or different identity fails closed.

2. **Compare two independently stored encrypted copies.** Select exactly two retained encrypted
   copies that were stored separately. On the trusted offline machine, calculate SHA-256 over each
   encrypted file before either is decrypted. Record the command/tool version, both storage
   identifiers, both hashes, sizes, and timestamp in the private record. The two SHA-256 values
   must be identical. A hash or size mismatch, an unreadable copy, only one available copy, or any
   uncertainty about which files were retained fails closed; decrypt neither copy.

3. **Use only one verified encrypted copy.** After the comparison passes, make a temporary working
   copy on encrypted local storage. Keep the second encrypted copy untouched and separately
   stored. Verify the working copy's SHA-256 again immediately before private decryption; it must
   equal the value recorded in step 2. Decrypt only inside the temporary local workspace. Never
   print plaintext to terminal logs or enable shell tracing.

4. **Require an exact decrypted inventory.** Before inspecting file contents, enumerate the
   decrypted payload without following links. It must contain exactly these two regular files and
   no directories, links, hidden files, metadata sidecars, or other entries:

   ```text
   schema.sql
   migration_history_schema.sql
   ```

   Missing, renamed, duplicate, non-regular, or unexpected files fail closed. Do not delete an
   unexpected file and proceed; invalidate the attempt and clean the entire plaintext workspace.

5. **Reproduce the accepted structural result before Pass A.** Run the existing static structural
   validator locally, offline, against exactly those two files, using the validator version,
   repository commit, command, and tool versions recorded for run `36350856989`. Capture its
   output only in the private encrypted evidence store. Its complete structural inventory and
   every count must exactly reproduce the previously accepted inventory/counts recorded from
   `36350856989`; success exit status alone is insufficient. A validator error, version drift,
   omitted comparison, extra/missing object, or count mismatch fails closed.

6. **Attest the continuity gate.** The private record must state that the expected source ID and
   full extraction/validation lineage matched, the two encrypted-copy hashes matched, the
   decrypted inventory contained exactly the two permitted files, and the static structural
   inventory/counts matched. Include hashes of the validator output and the private record. State
   explicitly that this is a continuity/confidence attestation, not proof of byte identity with
   the expired Actions artifact.

Passing this gate permits Pass A to begin; it does not itself approve the schema, produce a
sanitized candidate, establish migration readiness, or authorize any remote activity.

## Solo-maintainer Pass A / Pass B remains mandatory

This continuity path does not replace or combine review passes. The sole maintainer must continue
the existing two genuinely independent, sequential reviews:

1. **Pass A — provenance and structure.** Begin only after the offline retained-copy gate passes.
   Review the recorded lineage and hashes, structural consistency, complete object inventory,
   private tables, grants/RLS, every `SECURITY DEFINER` routine and overload, and every
   environment-specific constant or URL. Record an explicit disposition and rationale for each
   item. A discrepancy fails closed.
2. Clean the Pass A workspace, including decrypted SQL, extracted metadata, logs, editor swap and
   recovery files, caches, and temporary storage. Record cleanup in the private review record.
3. **Pass B — sanitized candidate.** In a new session, independently verify and review the exact
   candidate hash, bodies, ownership/grants, safe `search_path`, Storage and Realtime definitions,
   and secret/personal-data scan results. Reconcile every finding with Pass A. A candidate change
   invalidates both approvals and requires static validation and both passes again.
4. Clean the Pass B workspace. Both approvals must identify the same source and candidate hashes
   and the same passing static-validation result. Retain only material allowed by the existing
   private evidence policy.

As in the existing process, Pass A and Pass B authorize only later preparation of a sanitized,
secret-free candidate in a separate PR. They do not authorize staging inspection or application,
and they never authorize a production change.

## Fail-closed checklist

- [ ] The private record names source run `36339636375`, extraction run `36348752361`, and
  validation run `36350856989`, with their exact lineage.
- [ ] Two separately stored encrypted copies have identical SHA-256 values before decryption.
- [ ] The decrypted payload contains only `schema.sql` and `migration_history_schema.sql`.
- [ ] The existing static structural validator exactly reproduces every previously accepted
  inventory item and count before Pass A begins.
- [ ] No identity, hash, inventory, count, validator-version, or lineage discrepancy exists.
- [ ] The record labels the result continuity/confidence, not cryptographic proof of byte identity
  with the expired artifact.
- [ ] All real-evidence handling and both solo-maintainer passes remain private, local, and
  offline; no evidence or passphrase enters GitHub, Codespaces, chat, CI, or another cloud service.

If any box cannot be checked from privately retained records and local results, the review remains
blocked. Do not weaken, waive, or infer the missing check.

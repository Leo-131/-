# Current AliMail surface evidence

Pure validation and bounded recovery decisions for a host-observed current composer or independently reopened Sent snapshot. Hidden old message bodies cannot satisfy the new composer check. Body, subject and ordered links must match; pending template dialogs and unknown Send outcomes are rejected.

The module never sends, retries, logs in, reconnects a browser, accesses credentials or grants Send authorization. Actual sender/recipient identity, company/group deduplication, territory, fit and receipt checks remain required. A plain visible URL is distinguished from an observed link href.

For a settled non-Send control failure, the host may make one recovery using a fresh native accessibility observation of one unique visible control. Send timeout handling remains read-only reconciliation; it never authorizes a retry or a browser reset.

Run the standalone pure tests with `node --test tests/alimail-ui-evidence.test.mjs`. The private workspace additionally tests its execution-packet contract and packages the same verifier implementation (Git may normalize line endings) in the production build. Only synthetic examples are included here; no customer, mailbox, message or credential data is published.

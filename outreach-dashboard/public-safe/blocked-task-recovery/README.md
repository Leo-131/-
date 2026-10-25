# Safe recovery of an existing blocked task

Generic code and synthetic tests only. No customer identities, contact details, production task IDs, credentials or mailbox evidence are included.

The patch adds an original-executor-only `resume` transition to the existing revision-CAS queue, with a bounded recovery evidence reference. It preserves original progress, receipts, authorization, channel health and unknown/confirmed-send locks. Repeating the same recovery reference is idempotent; after another block, previously used references remain rejected even if timeline entries were trimmed. Other running tasks and terminal tasks cannot be restarted.

Authenticated MCP and native browser tools expose the bounded action. Resume never logs in, sends, re-notifies a bridge, validates mailbox delivery, clears a security challenge or connects an unattended execution host. Independent channels still require their own checks.

Research-cache no-resend and prior-contact flags are permanent across new source revisions. New research cannot override a historical company/group lock.

Verification on 2026-10-25: 162 focused regressions passed. Independent review reran 32 related tests and 5 additional in-memory probes successfully. These are synthetic/local checks, not customer development results, a full-suite claim, or a guarantee against all future third-party outages.

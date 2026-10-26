# Candidate readiness and historical-plan display

This zero-context patch contains the generic display and translation changes plus the implementation note from private source `4a3b97455e980443d02e489f68effde72aa4ea77`, relative to base `d899fede7660f54215671c83bed8152dc22c14c9`. It covers exactly `web/command-center.js`, `web/i18n.js`, and `docs/plans/2026-10-27-candidate-readiness-display.md`.

Persisted candidates are labelled as awaiting verification. The hosted disabled control directs execution through Codex and explains its disabled reason. Workspace and queue counts no longer claim automatic outreach readiness. The intelligence panel displays its original snapshot timestamp and identifies historical suggestions, preserving the original snapshot data.

Candidate selection, scoring, territory restrictions, company/group and unknown-outcome locks, disabled-state conditions, authentication and send permissions are unchanged. Candidate counts and historical suggestions are not verified sends or current execution readiness. This repair does not restore a held delivery channel or connect an unattended executor.

Only the reviewed differences are included. The complete rendering source contains unrelated private literals and is intentionally excluded. This extract contains no customer identities, business contacts, messages, thread identifiers, screenshots, receipt digests or credentials. Existing anonymous statistics for October 26 and October 27 remain byte-for-byte unchanged.

Apply only to the matching source base. Because unchanged context is intentionally omitted, use `git apply --check --unidiff-zero <patch-file>` before `git apply --unidiff-zero <patch-file>`. This is a source patch, not a standalone application. The private controller owns build, deployment and live acceptance. Publishing this extract introduces no new tests and does not rerun the controller's existing checks.

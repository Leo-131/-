# Fresh history preflight: lower raw-input retention

The operator preflight now reads and parses one fresh source at a time. The
previous worker pool limited simultaneous reads but retained all raw source
buffers until the complete prefetch finished. That retention increased memory
pressure on a busy desktop.

The complete source list, company/group locks, source hashes, source order and
fail-closed behavior are retained. No history source is skipped and no previous
snapshot authorizes a send. The Promise-based calling interface stays compatible.

Validation passed 21 focused checks, including synchronous/operator result parity,
freshly added locks, missing history, corrupt late research inputs, retained site
overlays, CLI behavior and a larger 96-file research fixture. The actual previously
failed preflight then completed with all 1,343 inputs. Only completed agent-created
temporary pages were closed during desktop resource recovery.

These are verified local preflight results. They do not establish a fixed total
process-memory limit, guaranteed outreach throughput, final email delivery,
improved human reply rate or an unattended browser host. Customer identities,
contacts, messages, credentials and private source revisions are not included.

## CLI process profile under allocation pressure

A later real run failed while V8 was committing young-generation memory, despite
the one-source-at-a-time input policy. The same complete check subsequently
passed with a 1 MB semi-space and 256 MB old-space limit. The normal read-only
CLI now starts one child with that profile before reading any workspace input.
Explicit caller nursery and old-space settings are respected. Library imports
do not launch another process. Unsuccessful children stay failures, with no
automatic retry, stale-plan reuse, lock reset or partial success result.

The updated default CLI was verified against the same fresh input digest as the
explicit-profile recovery: all 1,347 files, 9,555 research rows and 8,675 history
rows were retained. Twenty-three focused checks passed, including actual CLI
parity, a hold in the final research file and corruption of that final source.

This is an allocation-pressure mitigation, not a guarantee against every host
memory failure. It does not restore a missing browser interface, authorize any
send or establish improved reply rates. Windows memory/security settings and the
existing scoring and contact gates remain unchanged.

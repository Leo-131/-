# Efficiency v15: invocation-scoped identities and relevant context

User requests autonomous speed improvements and cloud synchronization. Keep all
live safety checks and serial receipt persistence. Options: persistent parsed-file
caching risks stale authorization; concurrent sending risks duplicate contact;
invocation-local identity reuse removes redundant normalization with no lifetime
beyond one synchronous plan. Choose the latter and restrict context indexes to
current survivor identities. An empty survivor set needs no context scan.

Every workspace invocation still reads and hashes its input files. No scores,
contacts, send evidence, protected regions or unknown outcomes are reclassified.
Fresh receipts and changed identities must take effect on the next invocation.
Test queue equivalence, aliases/groups, unknown outcomes, fresh receipts, changed
identity and empty caches. Measure warmed alternating synthetic local runs; do
not describe those measurements as end-to-end customer-development gains.

Measured real input reading: 261 files, about 3 seconds cold, dominates planning.
CLI therefore uses fresh bounded parallel reads (16 workers) and reconstructs
the original deterministic file order before hashing and parsing. There is no
persistent byte cache, checkpoint authorization or concurrent sending. I/O errors
fail the entire preflight. The synchronous API remains compatible. Test identical
queue and digest, fresh locks, duplicate inputs and missing research files.

Publish the tested source to the existing owner-private Site without widening its
audience. No raw customer data or credentials go to the public GitHub repository.

Deployment recovery: isolated Node v24.14.0 `fs.cpSync` on the existing Windows
web tree exited with -1073740791. Replace recursive native copying with explicit
directory traversal and file copying, reject symlinks and propagate failures.
Validate binary content, repeated output updates and the resulting Worker entry.

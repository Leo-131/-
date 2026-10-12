# Flattened source evidence repair

Observed bottleneck: the compact evidence parser assumed newline-delimited source separators and numbered lines. Flattened multi-source tool output could merge references, lose numbered facts or apply one fetch failure to another source. This could force manual re-reading of raw output.

Selected solution: deterministic parsing of long inline source separators and whitespace-delimited numbered lines. Keep short product dashes, exact source references, original line numbers and raw SHA-256. Alternatives: extra model summarization adds cost; naive truncation loses provenance.

This is read-only routing, not verification or send approval. Preserve original output, current agency validation, ICP >70, official public contact, permanent/live group dedup, and serial single-send confirmed receipts. No added model/network calls. Three regression fixtures cover inline sources, isolated failures and CRLF/product dashes.

Do not claim end-to-end acceleration from parser tests. Measure real qualification and confirmed-send throughput separately. Low-yield candidate sources remain a distinct operational bottleneck.

Verification infrastructure: unbounded test concurrency caused a native out-of-memory failure during migration tests on this Windows host (128 passed, one process failed). Bound the normal test command to two workers, retaining every test and customer diagnostic instead of skipping coverage.

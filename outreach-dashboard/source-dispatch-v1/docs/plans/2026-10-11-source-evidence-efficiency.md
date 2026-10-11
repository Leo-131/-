# Source evidence efficiency

Observed bottleneck: raw primary-source batches serialize long navigation and duplicate product lines into the executor context. Local preflight is already sub-second on the recent batch; no end-to-end speed claim is established.

Selected approach: a deterministic, read-only evidence reducer operating on already collected rendered output. Alternatives were extra model summarization (adds cost and latency) and simply truncating raw output (loses per-source references). The reducer retains every source reference, exact line numbers, a hash of the original text, failure markers and a bounded set of product, role, contact and region clues.

This is lossy routing only, never qualification. Keep the original result in the session or private research cache. Missing fields cannot establish a mismatch or absence. Review original source before qualifying and retain agency, ICP, business-contact and live duplicate checks. No browser writes, model calls, repeat sends or parallel sends are introduced.

Verification: regression fixtures cover navigation suppression, failures, metadata-only pages, source boundaries, changed evidence hashes, caps and non-eligibility. Measure output character reduction on the actual collected batch; this is not a token, delivery-rate or end-to-end time benchmark.

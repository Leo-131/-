# Screen before enrichment

Scope: improve local deterministic candidate planning, not email throughput claims.

The previous planner joined source/contact context for every provider seed before
checking permanent company/group and cached failure locks. Screen these locks
first; enrich only survivors. Preserve all surviving alias seeds until evidence
and product/channel ordering selects the best one. Count all screened locks in
the audit; return at most 100 research candidates. Never confer send eligibility.

Alternatives rejected: concurrent sends risk receipt races; reducing live checks
would weaken authenticity. Existing IAB-only serial send, receipt verification,
permanent recording, daily agency checks and ICP strictly above 70 remain intact.

Regression checks cover blocked metadata never being accessed, alias ordering,
new receipts, changed evidence and mandatory live checks. Benchmark compares the
old and new local planning paths on identical synthetic input; it is not an
end-to-end speed guarantee or evidence of additional customer sends.

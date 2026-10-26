# Customer filter navigation performance repair

This patch contains only generic navigation code, synthetic regression tests and the implementation note. Customer ledger changes are deliberately excluded.

Filters require one explicit submit. Customer filtering, sorting, pagination and reset reuse the existing loaded customer data and redraw the main customer panel. Browser back/forward stays consistent; ordinary external and modified-click behavior is preserved. Authentication, cloud data refresh, sending and contact locks are unchanged.

Focused checks: 13 passed, 0 failed. This is not a full-suite claim. Production private source: a2603627a7343235c66b5aff145323ef8928844c. Patch base:53b7fe80323ac93c3fd0138fc11085eff8410d13. Full customer data remains private and is not included in this repository.

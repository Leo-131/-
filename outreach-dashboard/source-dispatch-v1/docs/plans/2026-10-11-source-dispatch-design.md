# Reduce source dispatch overhead, not qualification

The current bottleneck includes failed primary sources and non-buyer categories.
Faster local scoring alone cannot guarantee faster confirmed outreach. Keep the
buyer routing and cached-failure locks already in place.

Compared approaches: lowering ICP would violate qualification; unrestricted
parallel sending risks duplication; bounded read-only batching reduces dispatch
overhead without changing any irreversible action. Select the last approach.

Default independent source batches increase from four to eight. Twenty unique
sources now need three dispatch batches rather than five. Deduplicated URL-to-task
references, one initial read per source, explicit-failure parking, and immediate
handling of ready customers remain unchanged. Executors must respect tool-specific
limits (notably at most four web search queries), splitting search separately.

Routine CLI calls now emit lean tasks and their source batches automatically,
instead of redundant raw rows plus tasks. --full-packet preserves the legacy
twenty-row packet; --compact preserves the full audit. All modes read fresh union
history and research before planning. There is no stored eligibility checkpoint.

Tests cover packet compatibility, source batching, fresh receipt locks, failure
parking and serial sending. Measure dispatch reduction on real current inputs,
but do not advertise it as measured end-to-end speed or additional real sends.

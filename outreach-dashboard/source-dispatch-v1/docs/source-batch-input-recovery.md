## Validated read-only source batches

The controller must build `web.open` requests from the existing validated
`executionPacket(plan, size, true, true).sourceBatches` (or
`OutreachEfficiency.sourceBatches(rows)`).
Map each chosen batch with
`batch.map(item => ({ref_id:item.url}))`; never map nullable raw `website` or
`sourceUrl` fields directly. Keep `taskIndexes` references and separately retain
`unresolvedTaskIndexes` as missing-source work. Do not guess a URL or a country.

A tool schema/argument rejection occurs before source requests execute. It is
not a company `source_failed` result or evidence of logout. Correct the request
arguments, then read only valid sources known not to have executed; do not replay
sources already read. An actual source failure still follows the single-read
policy: record its reason and move on, without URL variants or retry loops.
Validated URLs remain discovery hints, with `eligibleToSend:false`; all live
qualification, history, sender and receipt gates remain unchanged.

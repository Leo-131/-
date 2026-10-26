# Channel recovery and immutable send audit repair

Channel health now separates reading/session access from outbound capability. A successful mailbox read cannot clear a delivery or quota failure. Sending requires both capabilities to be independently verified, plus all existing authorization and contact gates. Legacy ambiguous health fails closed. An isolated source failure remains bound to its original step and does not disable another channel.

Send confirmation requires the complete original company/group/channel/operation binding. Identical receipts are idempotent; conflicting receipt identities and conflicting legacy starts remain locked for reconciliation.

Validation: 40 focused tests passed, zero failed; 18 additional independent synthetic checks passed. Production source commit: 98d7ee785b7332ff0128fd194637631cba94c201. Patch base: 905adbdde397e0110a43ea27510e76b61e5116d3. Only generic code, synthetic fixtures and this note are included. No customer records or credentials are uploaded. This change does not restore a provider account, remove platform limits, create browser access, or connect an unattended executor. Real sends and replies are not inferred from these tests.

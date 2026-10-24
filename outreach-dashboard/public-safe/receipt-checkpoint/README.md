# Receipt checkpoint recovery — safe source extract

Source: private Site commit `4b759e8cb93cf85fc804399471a40fb31a5d9de7`, 2026-10-24 Asia/Shanghai.

This standalone pure-state extract contains no real customer identity, contact address, receipt ID, credential or customer ledger. All addresses and receipts in tests are explicitly synthetic `.test` fixtures, not outreach evidence.

Run `node --test tests/campaign-checkpoint-state.test.mjs` from this directory. The private confirmed-receipt generator integrates the state builder into one apply_patch proposal; it is not included because its operational configuration belongs in the private system.

The repair keeps current count and continuation state aligned, rejects duplicate/excluded/conflicting receipts, binds an unchanged exclusion snapshot in compact campaign proposals, and binds remote coverage to a receipt-content digest. It does not authorize sending, claim delivery/replies, bypass authentication or prove an unattended host is connected.

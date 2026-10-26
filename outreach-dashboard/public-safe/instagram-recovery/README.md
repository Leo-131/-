# Independent Instagram receipt recovery

Safe integration patch for the existing local receipt/checkpoint controller. No real customer data, account handles, conversation IDs, screenshots, credentials or private ledger rows are included. All test records and image fixtures are synthetic.

- Instagram uses a separate local evidence namespace and strict HTTPS profile/numeric-thread grammar; existing email and LinkedIn key bytes remain compatible.
- Actual sending still requires independent reopening and matching sender, official recipient, exact body, timestamp and native screenshot bytes/hash. Opening a chat, a draft, invite or unknown result never counts.
- Company/group/profile deduplication, retained exclusions and same-message observation history apply across supported channels.
- Native PNG and JPEG evidence must match the new Instagram filename extension and file signature. No conversion is needed; established older LinkedIn evidence remains compatible.
- Actual browser account identity must be rechecked immediately before sending. The generator also binds the top-level account/recipient to independently observed proof.

Validation: 29 typed-channel tests and 76 downstream receipt/checkpoint/generator tests passed, with independent read-only review. The patch depends on the existing controller modules and is not a standalone mail service, login daemon or platform-restriction bypass.

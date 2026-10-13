# Daily verified receipt state

Safe code and synthetic tests only; no customer identities, addresses, messages or credentials are included.

Separate actual Asia/Shanghai execution-day receipts from the retained fixed campaign. Closing a fixed 100-company campaign must not report a current daily target as complete or append a 101st record to the closed campaign.

Run: `node --test tests/receipt-state.test.mjs` from this directory.

This module does not send messages, authorize outreach, discover candidates or establish source completeness. It preserves permanent duplicate locks and validates explicit receipt metadata. Actual sent-folder verification, public business-contact validation, daily agency-region checks and ICP greater than 70 remain separate requirements.

Date: 2026-10-14. Missing observations are not zero replies. A saved local file is not proof of remote synchronization.

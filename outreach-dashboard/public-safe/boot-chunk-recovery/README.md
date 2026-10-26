# Bounded recovery for a timed-out startup data chunk

This generic source patch adds one automatic full-page reload when an authenticated workspace is still starting and a required generated-ledger chunk reaches its existing timeout. It contains code and synthetic test fixtures only. It does not include customer records, contacts, messages, screenshots, credentials or private receipt evidence.

The recovery applies only to a same-origin `/generated-data/<manifest hash>/part-<three digits>.js` URL that exactly matches the already validated chunk metadata. A shared budget in same-tab `sessionStorage` allows one reload for the entire manifest and pathname, rather than one per part. The marker must be written and read back before navigation, and is retained after successful startup. No query text or customer search is stored in the key.

A repeated failure, malformed or unavailable storage, authentication failure, ordinary asset failure, script load error or incomplete data retains the existing manual error flow. Active workspaces are not automatically refreshed. The change neither reinjects a timed-out script nor adds any send, POST or PATCH replay. Late callbacks cannot resume the terminated startup or install controls twice. Removing a script is not proof that its network request or execution was cancelled.

Apply only to a compatible source tree containing the existing chunk loader, after inspecting the patch:

```sh
git apply --check boot-chunk-recovery.patch
git apply boot-chunk-recovery.patch
node --test tests/cloud-boot-timeout.test.mjs
```

The focused test file passed 32 tests with zero failures. Before the fix, the selected recovery regressions produced three failures. The tests cover a shared budget across page reloads and different parts, retention after successful startup, a new manifest or pathname, storage failures, authentication boundaries, canonical URL matching, late callbacks and active-page protection. Values such as `workspace.test`, `private_customer` and `private_token` are synthetic fixture strings, not real contacts or credentials.

This is a bounded startup recovery, not a claim that persistent network faults, email delivery restrictions, provider quotas or unattended execution have been resolved. It does not change customer counts or authentication and sending permissions.

# Email receipt PNG/JPEG evidence compatibility

This is a generic code-only zero-context patch for the receipt proposal helper and its synthetic regression tests. It contains no customer records, real sender or recipient addresses, production message identifiers, actual screenshots or credentials. Embedded image bytes are tiny synthetic test fixtures.

The helper accepts an explicitly named PNG, JPG or JPEG confirmation image only after checking a safe basename, a regular non-symlink file, extension-matched magic bytes, minimum size and every supplied SHA-256 claim. The immutable filename and computed hash are retained in proposed daily, permanent and attempt records. The existing no-fields legacy filename fallback is unchanged. These byte checks do not verify image contents or prove that an actual message was sent; the existing independent Sent evidence and all authorization, identity and no-resend gates remain required.

The patch is based on source commit `1d08d38aeb3cb6c034059c7ed816ec86e1b1e11e`; the controller published the repaired owner-private version at `76b54a2c2cda9b2b8596de4a5193f9fc23bcfb54`. Production publication is not a restoration of global email delivery or provider quota. The controller reported 24 focused tests passed, zero failed; no full-suite claim is made.

Hunk function labels and unchanged surrounding source are deliberately omitted. From a compatible project root, review the patch, then check and apply it explicitly:

```sh
git apply --check --unidiff-zero /path/to/receipt-generator.patch
git apply --unidiff-zero /path/to/receipt-generator.patch
```

Only the two named code/test files are changed. Do not apply this patch to customer data or run it as an outreach action. The synthetic fixture tests exercise file/hash validation and legacy compatibility; they are not outreach evidence.

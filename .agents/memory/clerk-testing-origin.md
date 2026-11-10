---
name: Clerk testing redirect origin
description: A testing helper limitation when the preview uses an explicit external port.
---

The programmatic Clerk testing helper can return to the development host's default HTTPS origin rather than the explicit `:5000` preview origin. A successful helper URL generation is not proof that the app received a session.

**Why:** In this environment the default origin returned 404, while the explicit-port app returned its expected authentication response. The helper's Clerk-hosted ticket URL did not contain an editable app redirect target.

**How to apply:** Confirm the helper actually returns to the running app before testing authenticated screens. Do not alter Clerk ticket URLs speculatively or add an authentication bypass. Report authenticated browser coverage as blocked if the session cannot be established.

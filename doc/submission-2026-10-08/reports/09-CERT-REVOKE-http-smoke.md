# D — Local HTTP integration smoke (executed)

- Implementation head: `980a5ef57dda682d95a8e60ee2b19c2c42d2980d`
- Date: 2 October 2026, Asia/Bangkok
- API: local Uvicorn at `127.0.0.1:8059`, started only for this check and terminated afterward
- PostgreSQL: isolated D database `cert_d_test_06`, `127.0.0.1:55459`; no shared credentials or services
- Mobile client: actual `mobile/src/services/inspection-service.ts`, imported by Node; native UI itself tested separately by React Native renderer

Procedure actually executed:

1. Select an ISSUED Certificate produced by the real Order/inspection API fixtures, plus an ACTIVE Admin fixture. Generate a short-lived local test JWT using existing `tests/order_helpers.py` constants. Pass it to the child process environment; do not print or commit it.
2. Snapshot all persisted business records using the same preservation helper as the revoke PostgreSQL tests.
3. Start the real FastAPI app with the isolated database and synthetic JWT configuration; wait for `/health`.
4. Call actual mobile `adminCertificate` and guest `publicCertificate` over HTTP; both must report ISSUED.
5. Call actual mobile `revokeCertificate` with a private synthetic note and stable key; assert REVOKED and `can_revoke=false`. Repeat the same key/body; assert identical result.
6. Re-read Admin detail and guest JSON through the mobile service; assert REVOKED. Fetch HTML and JSON with an old conditional cache header; assert 200, `Cache-Control: no-store`, revoked HTML text, exact four-field public JSON, and omission of private note/actor.
7. Compare persisted business records with the original snapshot; assert equality and exactly one revoke audit for this Certificate.
8. Stop the temporary API process even if a check fails.

Observed output:

```text
PASS: real mobile service -> HTTP API -> PostgreSQL revoke/replay -> public HTML/JSON
PASS: original business records unchanged; exactly one private audit
```

Executed launcher: `D:\projectsa\package-d-tools\http-smoke.py`; service assertions: `D:\projectsa\package-d-tools\http-smoke.mjs`. These are local verification helpers and contain no shared credentials. Repository regression source is `backend/tests/test_certificate_revoke_postgres.py` and `mobile/tests/certificate-revoke-service.test.mjs`.

This proves local service/API/database interoperability. Public HTTPS QR on another phone, Android interaction and real Auth/Storage acceptance remain PENDING for F/task11.

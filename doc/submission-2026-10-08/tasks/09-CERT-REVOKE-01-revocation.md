# 09 / CERT-REVOKE-01 — Minimal Admin revocation

**Priority:** P1 retained FR-23 · **Owner:** Full stack Codex · **Depends:** 01 · **Target:** 4 Oct

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Implement task 09 on the complete release base with CERT storage/public HTML/JSON. Read the submission packet DOC-01-scope.md, RELEASE-DESIGN.md, references/CERT-spec.md and FINISH-00-release-gates.md. Inspect the actual certificate model, inspection/public routes, audit/replay mechanism and Admin UI before edits. Follow mobile AGENTS.md if writing mobile code.

Existing schema/read displays support REVOKED but that is not a completed Admin revoke journey. Reuse certificate/audit columns rather than make new tables unnecessarily. Implement POST /admin/certificates/{id}/revoke for active Admin only, strict body {reason} trimmed10–1000 chars and existing Idempotency-Key semantics. Lock the certificate; one ISSUED→REVOKED write stores server revocation time, actor and private audited reason. Same committed key/payload replays without duplicate audit; changed payload/key conflicts appropriately. Do not alter final inspection snapshot, Buyer decision, Payment/Receipt/settlement, or automatically refund an Order because a certificate is revoked.

Provide a minimal authorized Admin entry from existing work/certificate context, detail and revoke confirmation with reason and error/retry states; add a bounded minimal certificate list only if needed to make the action reachable. Reuse existing public HTML/JSON/native revoked view with consistent status. Public revoked information may use a safe generic reason code/text; do not publish Admin private notes, actor/email, identity evidence or Order addresses. A revoked certificate cannot appear valid by a cached old response; apply appropriate public caching behavior.

Test authorization/IDOR, valid revoke and repeated/concurrent/key-mismatch attempts, invalid reason, immutable inspection/settlement fields, public HTML/JSON/native status and no private fields. Run focused backend/mobile tests and typecheck. Deliver code, API mapping and reports/09-CERT-REVOKE-01.md with exact head/evidence. Actual public HTTPS QR on another phone remains task 11. Do not add wider user administration or change certificate issue timing. Continue through a reachable working UI/API, not a seeded-row-only test.
```

## Acceptance

- Admin can revoke through UI/API; non-Admin cannot.
- One audited irreversible status transition; retry is safe and original business records remain intact.
- Public QR shows revoked status consistently without private notes.

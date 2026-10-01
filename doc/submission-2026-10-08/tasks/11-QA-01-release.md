# 11 / QA-01 + FINISH-06 — Evidence on the combined release

**Priority:** P0 · **Owner:** QA Codex; device owner for inaccessible phone actions · **Depends:** candidate 01–10; final native evidence uses 12 · **Target:** 6–7 Oct

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Audit and test the combined submission candidate, implementing small in-scope fixes for defects you find rather than only reporting them. Locate the packet and read DOC-01-scope.md, QA-MATRIX.md, FINISH-00-release-gates.md, references/FINISH-spec.md acceptance matrix, all delivered task reports and reports/release-manifest.json. Inspect actual source/app/API revision, environment, migration and tests first. This is final integration QA, not another isolated PR review.

Run retained automated backend/PostgreSQL and mobile logic/component/type checks needed for the combined changes, using a disposable test DB. Exercise real API business journeys with distinct authorized Buyer/Seller/Inspector/Courier/Admin accounts: successful sale through RELEASE/payout/review, rejected or negative inspection through durable return/full REFUND/original receipt. Also exercise no-ship, receipt AUTO, timely missing-delivery/Admin resolution, worker no-HTTP restart/two-runner/retry, profile persistence, certificate revoke and private data denial. Use actual Storage and Google integration where available; identify which checks used deterministic adapters.

Use task 12 APK on a real Android device for both main journeys, Google login/return, camera/gallery proof upload, keyboard/back/navigation and profile/review reload. Open public QR in another phone/browser without login, including revoked and invalid cases. Use provided purpose-built tools, browser and adb if authorized/connected. Ask the device owner only for steps tooling cannot reach; give exact checklist and collect evidence. Do not label browser/Expo Web/device simulator results as real Android acceptance. Do not log tokens/PII or mutate an unapproved shared database. Seed only an isolated authorized synthetic demo target.

Record each QA-MATRIX case PASS/FAIL/BLOCKED/NOT_RUN with app/API SHA, migration head, environment, account roles, test command/evidence path and limitations. Fix reproducible local code defects, rerun affected checks and update SHA/artifact mapping. Coordinate rebuild/retest if the APK source changes. Existing issues #49/#50/#63/#65/#105/#106 and FINISH-06 need their own acceptance evidence; inspect the actual issue before claiming it closed. Do not create duplicate issues or close issues based solely on unit tests.

Deliver reports/11-QA-01.md, completed templates/TEST-REPORT.md, evidence index and explicit READY/NOT_READY verdict. READY requires every mandatory QA case and final APK alignment. If real login/storage/device/shared rollout is missing, keep those cases pending, list exact missing access/steps, and finish independent QA. Never invent screenshots/results or declare completion because time is short. Complete the authorized tests and fixes, not only a test plan.

Q01–Q26 are your technical release gate. When they pass, hand off TECHNICAL_READY_HANDOVER_PENDING to task 13; Q27 final handover and Q28 teacher scope disposition are checked by task 13/Lead after it produces the artifacts. Do not create a cycle by waiting for final slides before handing over the technical QA report. Overall READY still requires all mandatory cases, and must not be claimed while Q27/Q28 are pending.
```

## Acceptance

- Two full journeys and security/race/recovery cases passed on the release under test.
- Native/real-service evidence is distinguished from isolated tests; missing access is visible.
- Every retained requirement links to actual evidence and any defect is fixed/retested or a stated blocker.

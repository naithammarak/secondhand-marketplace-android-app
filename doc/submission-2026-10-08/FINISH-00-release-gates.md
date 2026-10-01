# FINISH-00 — refresh สำหรับ release 8 ต.ค.

**วันที่ตรวจ 1 ตุลาคม 2026 · ยังไม่ผ่าน full release gate**

## Baseline ที่ยืนยันแล้ว

- Repo ปัจจุบัน `/home/tmk/project/market-place-mobile-app/secondhand-marketplace-android-app`
- Branch `feat/marketplace-design-ui`, local HEAD `939e4f763c8185e5478b1d4962e746b7a2321a8d`; มี tracked/untracked changes มาก และมี latest UI นอก HEAD
- Snapshot paths/hashes และ PRs/issues: [baseline JSON](manifests/baseline-2026-10-01.json) ห้ามแปล HEAD เป็น workingtree releaseSHA
- Remote PR #108–#120 ยัง OPEN ณ snapshot; #108–#115 เป็น stacked INSPECT/CERT/UI, #116–#120 เป็น review/payment/catalog/buyer-only ชุดใหม่ ต้องตรวจ base/head จริงก่อนใช้
- #117 มี payment correctness fixes ที่ต้องทบทวนรวม; #119 เป็น catalog-only และ #120 เป็น buyer-only runtime ที่ไม่รวม payment/Seller/Admin/INSPECT/CERT ไม่ใช่ app ส่งครบ flow
- Candidate ปัจจุบันมี role COURIER, center delivery/proof, INSPECT/CERT/Buyerdecision; FINAL FINISH states/settlement ยังต้อง implement; existing review routeทำเพียง navigation/mock; ยังไม่มี persisted profileedit

Snapshot เป็น observation ไม่ใช่ acceptance ของสิ่งที่ไม่ได้ทดสอบใหม่ ห้ามรวม overlapping PRs ทั้งหมดโดยอัตโนมัติ; ห้ามแทน UI ล่าสุดด้วย branch เก่า

## Gates / ownership

| Gate | สถานะ | สิ่งที่ทำให้ผ่าน |
|---|---|---|
| G0 scope/linearization | **Selected locally** | DOC-01 ตัดสิน DB-clock-after-lock; issue#98 commentยังไม่ publish; actual handler/workerต้องทำ boundarytests |
| G0 combined base | **Pending 01** | selected source/provenance + latestdirtyUI preserved + one repeatable releasebase + smoke |
| G1 Courier private proof contract | **Partly present; Pending 02/03** | reuse existingroutes/role; bind1–3selectedproofs; confirm readability; minimalqueues; no unauthorizedPII |
| G2 return address | **Pending 02/03** | sellerownedvalidatedimmutableOrder snapshot before center shipment; existingpaidlegacywithoutaddress explicit handling; no invented address/backfill |
| G3 exactly-once settlement | **Pending 04** | single RELEASE/REFUND service; one terminalrecord; locks/replay/allocations/rollback/races tested |
| G4 no-HTTP recovery | **Pending 05/10** | scheduledrunner/restart/twoworker/outage/retry test + runtime monitoring |
| G5 scope implementation | **Pending 06–09** | full UI + real profile/review/revoke APIs; no mocksuccess |
| G6 release/device | **Pending 10–13** | environment, APK, AndroidGoogle/Storage/QR + twojourneys, docs/demo report tiedtoSHA |

## API/schema reconciliation ก่อน implementation

- Reuse canonical center receive `POST /inspections/{id}/receive`; ไม่เปิดอีก route ที่เปลี่ยน facts เดียวกันอิสระ
- FINISH referenceมี conceptual `/shipments*`; integratedcandidateอาจมี `/courier/shipments*` อยู่แล้ว ให้ reuse concrete existingprefix แล้วบันทึก mapping ลง API-MAPPING.md ใน task02 ก่อน frontendต่อ API ไม่เปลี่ยนชื่อ routeเงียบๆ
- งาน02เป็น schema owner ของ finalstates/address/proof/settlement; งาน07/08ต่อmigrationchainตามลำดับ; งาน03/04ไม่เพิ่ม alternate migrationhead
- Order existingmutation lockorder `Order→Shipment→Escrow→Product`; reconcile cancel/expire/ship guards เมื่อเพิ่มFINISH
- Proofdelivery returnต้อง commitdurableก่อนrefundattempt; งาน03เขียนintegrationhook และงาน04เขียนsame settlementservice; งาน05retryไม่สร้างคืนเงินserviceใหม่

## ช่องทางส่งกลับ

แต่ละtaskส่ง [TASK-REPORT](templates/TASK-REPORT.md) + commit/upstreamSHAจริง; integratorนำมารวมหนึ่งcandidateแล้ว QAอีกครั้ง สถานะ MERGED ของ stackedPRอย่างเดียวไม่ยืนยันอยู่ใน main; ตรวจ ancestry และ base ให้ชัด

[Issue#98 draft comment](templates/ISSUE-98-COMMENT.md) เตรียมพร้อมให้ Lead publish เมื่ออนุญาตการเขียน GitHub โดยตรง งานเอกสารรอบนี้ไม่ได้เขียน issue/merge/push แทนผู้ใช้

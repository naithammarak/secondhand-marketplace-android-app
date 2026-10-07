# Wondee redesign — Acceptance and evidence plan

27 กันยายน 2026 · ทุกแถวต่อไปนี้คือ **เกณฑ์ที่ยังต้องทดสอบใน session ลงมือ** ไม่ใช่ผลผ่านจาก session วางแผน

หลักฐานแต่ละกรณีต้องระบุ implementation SHA, backend revision, environment แบบไม่เปิด secret, viewport/device, identity/role สมมติ, expected/actual และที่อยู่ screenshot/log. ใช้สถานะ PASS / FAIL / BLOCKED / NOT RUN / N/A พร้อมเหตุผล; `skipped` ไม่ใช่ PASS

## 1. Visual acceptance inventory

เปิด reference/index.html, เลือกหน้าจอจาก sidebar และ theme controls. เทียบเฉพาะพื้นที่ app ข้างใน phone frame. แถบ demo และ phone chrome ไม่อยู่ในแอปจริง. ตรวจขั้นต่ำทั้ง dark/light ที่ 390px และ mobile-small320px; คัด key screens ตรวจ 430/768 ด้วย

| V-ID | Screen/state | ตรวจภาพและ interaction |
|---|---|---|
| V01 | Guest profile | mascot/guest card, Google CTA, theme setting, 3 tabs; ไม่มี private data |
| V02 | Buyer profile | prominent upgrade card ทั้งสองธีม, role จาก server, no stars/fake stats; hierarchy ตรงต้นแบบ |
| V03 | Seller profile | approval จริง, My products/new product, purchase/sales access, ไม่มีคูปอง/ยอดขายปลอม |
| V04 | Login | Google button, loading/cancel/failure, ไม่ติด role chooser หลัง UX rollout |
| V05 | Verification form | shop/bank/image fields, focus/placeholder/field error อ่านชัด; keyboard ไม่บัง submit |
| V06 | PENDING | status/refresh, ไม่มี submit ซ้ำ/ลงขาย |
| V07 | APPROVED | success/next action, refreshed me ตรง backend |
| V08 | REJECTED | actual reason + edit/resubmit, ข้อความยาวไม่ล้น |
| V09 | Catalog | 2-column cards, labels, prices, images, search/chips/scroll/pagination, no condition% |
| V10 | Product detail | 4:3 gallery, full title, real seller, condition/description, single full-width buy CTA |
| V11 | Checkout | editable address, server quote, simulated copy, keyboard/back/submit state |
| V12 | Orders | purchase/sales tabs ตามสิทธิ์, empty/error/loading, real status; sticky footer ไม่บังแถว |
| V13 | Order detail | timeline จากหลักฐานจริง, cancel/expiry/payment/receipt, unknown state ปลอดภัย |
| V14 | Seller ship | courier mascot, carrier/tracking, honest SLA, submitting/conflict/unavailable |
| V15 | Inspector queue | role guard, counters จาก API, filters/pagination, no mock Inspector ID |
| V16 | Inspector work | 3 steps, evidence selection/progress/error, result/summary validation and final confirmation |
| V17 | Buyer result ×4 | outcome สี/label/mascot ต่างกัน, selected private images/zoom; negative ไม่มี cert/confirm |
| V18 | Certificate modal | real number/result/public URL/QR; no QR placeholder, unavailable แยกจาก error |
| V19 | Product create/edit/mine | font/theme/cards ตรงระบบใหม่; existing validation/upload/recovery ครบ |
| V20 | Admin verification/receipt | readable consistenttheme, privacy/masking/actions คงเดิม |
| V21 | Shared mascot/loading/errors | default/courier/inspector/4results/seal; reduced motion หยุด animation; skeleton ตรง layout |

ภาพของ V14–V18 จาก fixtures ใช้รับ **visual** เท่านั้นและต้องมี label ในรายงาน; ยังไม่ใช่หลักฐาน API integration. ไม่ต้องใส่ debug label ใน production UI แต่ fixture preview ต้องไม่ถูก export เป็นหน้าสาธารณะ

## 2. Functional and regression acceptance

| T-ID | Scenario | Expected | Evidence |
|---|---|---|---|
| T01 | เปิดแอป signed-out | catalog ได้ทันทีโดยไม่รอ/private me; search/detail public ได้ | component + web/device |
| T02 | Guest buy → cancel Google | กลับตาม flow เดิม ไม่มี order/intent ค้างผิดบัญชี | logic/component; real OAuth แยก |
| T03 | Guest buy → successful login | product เดิม/checkout เปิดครั้งเดียว, ยังไม่ POST create จนกดยืนยัน | logic/component + Android OAuth |
| T04 | Intent expired/logout/account switch/invalid return | clear private intent; ไม่เปิด arbitrary URL/สินค้าจากบัญชีเก่า | regression |
| T05 | New Google account/body role=SELLER/ADMIN | default BUYER หรือ reject invalid input; ไม่มี escalation | API + DB |
| T06 | Returning Seller/staff/null legacy | role เดิมไม่โดนทับ; null ตาม migration; legacy role route กำหนดแน่นอน | API + migration |
| T07 | Buyer sends valid application | PENDING, role ยัง BUYER, bank/card private, ซื้อได้แต่ขายไม่ได้ | API+DB+Storage+device |
| T08 | Missing shop/bank/image, huge/wrong image, permission denied | correct field/status error, no partial approval/orphan leak | API/component; upload จริงแยก |
| T09 | Duplicate application / two tabs / upload timeout | one pending record; safe retry/recovery ตาม existing contract | race+DB |
| T10 | Admin approve latest pending | verificationAPPROVED และ roleSELLERcommit ด้วยกัน; me refresh ทำให้ UI อัปเดต | transaction failure/race+API |
| T11 | Reject/resubmit/stale review/suspended target | role ไม่ promote โดยผิด; latest review กติกาตรง; unauthorizedblocked | API+DB |
| T12 | Seller buys another seller's item | quote/create/pay/receipt/cancel อนุญาตตาม state+owner; sales และ purchases แยก | API+component+DB |
| T13 | Seller self-purchase or other account order/evidence | ปฏิเสธ; ไม่มี data หรือ side effect | authorization regressions |
| T14 | Public seller projection | ชื่อร้านจาก approvedrecord, legacygeneric, ไม่มี PII/bank/card/path | exact response checks |
| T15 | Catalog q+category+pagination+slow old response | server filtering เดิม, no duplicate/stale overwrite, retry ไม่เสีย query | existing store/API regressions |
| T16 | API outage / expired image URL / not found | error≠empty, imagefallback/retry, no fabricatedinventory | service/component |
| T17 | Product create uncertain response / edit / cancel | upload binding, checked inventory, no duplicate creation, stale writeguard คงเดิม | existing product tests |
| T18 | Quote changed/product reserved while login | latest server rules; conflict เชื่อถือได้, money ไม่คำนวณเอง | API+component |
| T19 | Double create/pay/cancel / timeout / replay | key เดิมและ onebusinessrecord; no fake success | existing order/store+PG race |
| T20 | #92 unpaid expiry/cancel/public rediscovery | expired product กลับ available ตาม server; paid ไม่ถูก cancel/ดู unpaid | main regressions + PG |
| T21 | Later/unknown order status | ไม่มี pay/cancel ผิด state; paidreceipt ไม่หาย; safe fallback | decoder/component/API |
| T22 | Theme relaunch/OS change/font failure | saved preference, systemfollowsOS, splash ไม่ค้าง, no split theme | component + device/web |
| T23 | Long Thai text, text scale 1.0/1.3/2.0, keyboard, back | no inaccessible CTA/critical truncation/overlap; deliberate gridcollapse ถ้าต้องใช้ | visual/device |
| T24 | Screen reader/web keyboard/reduced motion | labels/roles/focus/busy/selected ครบ; animation หยุดเมื่อร้องขอ | manual accessibility |

## 3. Dependency acceptance — รันเมื่อ API/feature รวมพร้อมแล้ว

| I-ID | Scenario | Expected / gate |
|---|---|---|
| I01 | Inspect absent in base | ไม่มี fake productionworkflow; unavailable state และ deliveryreport ชี้ #93/#94/#95 integration |
| I02 | Seller แจ้งส่ง | actualorderId/carrier/tracking, samekey replay, `SHIPPING_TO_CENTER`จาก API |
| I03 | Receive without Courier proof | server ปฏิเสธ, UI อธิบาย; Sellership ไม่เท่ากับรับเข้าศูนย์ |
| I04 | Inspectorwrongrole/unassigned/finalized | ไม่อ่าน/เขียนข้ามสิทธิ์; accountrefresh ไม่ทำ authorization หาย |
| I05 | Evidence upload/select/result | selected1–5, otherinspectionimagesrejected, immutableafterfinal |
| I06 | PASS/MINOR result/cert atomic | onecertificate, transactionfailure rollback, replay ไม่เพิ่ม cert |
| I07 | NOT_AS_DESCRIBED/FAKE | nocert/nodecision, returnnext_action จริง; ไม่ refund ใน UI |
| I08 | Buyer-as-capability / Seller purchasing | ownerSeller อ่านผลของ purchase ตัวเองได้เมื่อ contract เปิด; unrelatedSeller ไม่ได้ privateevidence |
| I09 | CertificateQR public | realHTTPSURL เปิดบนโทรศัพท์ไม่มีแอป/login ได้; actualHTML/data, noPII/privateevidence |
| I10 | CERTdecision repeat/conflict | exactlyonce, servercan_decide, negativecannotCONFIRM; decision ไม่ releasefunds |
| I11 | FINISHreceipt/release/refund | ใช้เกณฑ์ #98/FINISH; ไม่รับรองจากงาน reskin; timernotclient-only |

ถ้า I02–I11 ยังไม่มี dependency ให้ BLOCKED พร้อม API/issue/owner แทนการเพิ่ม fakeendpoint หรือกดผ่าน checklist. การเตรียม UI ของแถวเหล่านี้ยังต้องเสร็จและตรวจภาพได้

## 4. Commands / operational verification

Mobile: `npm run typecheck`, `npm run lint`, `npm run test:logic`, `npm run test:components -- --silent`, Expo web export, Expo Android export. Inspect current scripts first. หาก dependency ติดตั้งครบและ lockfile ไม่เปลี่ยน ไม่ต้อง `npm ci` ซ้ำทุกครั้ง

Backend หลัก: `test_auth.py`, `test_verifications.py`, `test_admin_verifications.py`, `test_product_reads.py`, `test_orders_api.py`, `test_orders_postgres.py` และ test ใหม่สำหรับ UXmigration/guards. เพิ่ม/รัน inspection tests จาก integrationbranch เฉพาะเมื่อรวม code แล้ว. ไม่กด tests ที่ destructive ใส่ DB จริง; inspect fixture/env names first

Migration gates: one intended Alembic head, supported predecessor upgrade, legacy roles/approvals intact, shop_nameconstraint, rollback ไม่ลดสิทธิ์ผิดคน, raceapproval หนึ่ง winner, failurepromotionrollback. หากมี appliedbranchrevisions ต้องพิสูจน์ upgrade จาก revision นั้นด้วย ไม่เดาว่า emptyDBpass พอ

Browser preview ใช้ isolated fixtures สำหรับ appearance ได้ แต่ productionapi-mode ต้อง error เมื่อ backend หาย. Android export เป็น JS/assets build เท่านั้น ไม่ใช่ APK/device smoke. ห้ามรวมจำนวน tests จาก historical report มารายงานเป็นผลรันครั้งนี้

## 5. Completion gates / delivery template

- **CORE REDESIGN COMPLETE:** WUI01–05 + UX contract/DB/BE ทดสอบผ่าน, baseline regressions ไม่พัง, key visualstates ผ่าน; บอก device/liveitems ที่ยัง notrun
- **VISUAL COVERAGE COMPLETE:** V01–V21 ครอบคลุมครบรวม mocked/gatedviews โดยแยก label หลักฐาน; mainreferenceappearance ครบทั้งธีม
- **FULL INTEGRATION COMPLETE:** core+visual พร้อม, applicable I02–I11 มี realfeature/API/DB/deviceevidence ตาม contract ทั้งหมดและไม่มี requiredgate ค้าง. อย่าใช้ label นี้เพียงเพราะ UI ทุกหน้ามีแล้ว

รายงานส่งมอบควรมีตารางสั้น:

| Check/screen | Environment + SHA | Result | Evidence | Remaining action |
|---|---|---|---|---|
| ตัวอย่าง T03 real Google return | Android build / backend SHA | NOT RUN | ไม่มี | ผู้ทดสอบทำ OAuth ด้วยบัญชีทดสอบ |

Final report ระบุคำสั่งรัน, counts จริง, failures/pre-existingissues และสิ่งที่แก้, paths/screenshots, APIdependencies. ไม่ต้องเขียน tests ที่แค่ asserthexcolors ทุกบรรทัด; ให้ทดสอบ themebehavior/contrast ที่จำเป็นและ flows ที่เปลี่ยนจริง

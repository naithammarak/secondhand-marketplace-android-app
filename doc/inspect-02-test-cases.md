# INSPECT-02 — Acceptance และ test design

สถานะ: DESIGN ONLY — ยังไม่มี executable Inspect API tests; ทุก expected result อ้างข้อเสนอใน API matrix และต้องปรับตาม approved contract

## Traceability ตาม issue

| เกณฑ์เสร็จเมื่อ | หลักฐานที่ต้องได้ | Test IDs |
|---|---|---|
| แจ้งส่ง → รับเข้าศูนย์ตามลำดับ | shipment 1 รายการ, RECEIVED, version/timestamps/actor ถูกต้อง และ GET ล่าสุด | FLOW-01–05, READ-01 |
| รายการไม่จ่าย/ผิดสถานะถูกปฏิเสธ | HTTP error ถูกต้อง และไม่มีข้อมูลเปลี่ยน | ELIG-01–04, STATE-01–03 |
| ผู้ขายอื่น/บทบาทไร้สิทธิ์อ่านหรือแก้ไม่ได้ | list/detail/mutation/replay ไม่รั่วข้อมูล | AUTH-01–07 |
| คำขอซ้ำ/พร้อมกันไม่สร้าง shipment ซ้ำ | PostgreSQL หลาย connection มี shipment เดียวและ version เพิ่มครั้งเดียว | DUP-01–07, TX-01–03 |

## Fixture requirements หลัง dependencies พร้อม

ใช้ namespace `inspect02-v1` กับ ORDER-03/#56 fixture ที่เป็นเจ้าของชัดเจน: Seller A/B, Admin, Inspector A/B, Buyer, role-null และบัญชี inactive; order item แยก paid/eligible, unpaid, cancelled/refunded และ Inspection ครบ 5 สถานะตาม contract งาน RECEIVED มีทั้ง unassigned และงานของ Inspector อื่นสำหรับ negative checks

เริ่ม fixture เฉพาะสถานะที่ระบบอนุญาตจริง: unpaid ปกติไม่มี Inspection; กรณี Inspection เดิมแต่ ineligible ใช้ controlled integration setup เพื่อตรวจ fail-closed behavior ไม่ถือเป็นข้อมูลปกติของทีม ชุดนี้เป็นข้อกำหนด fixture ไม่ใช่ seed ที่พร้อมรัน

reuse namespace/scenario keys จาก fixture owners เมื่อทำได้ ไม่ hardcode PK; รันซ้ำไม่ย้อนสถานะงานที่ทีมใช้แล้ว รายงาน conflict แทน reset; tests ใช้ฐานแยกและไม่เรียกบริการชำระเงินจริง ไม่ TRUNCATE/downgrade ฐานทีม

## Functional และสิทธิ์

| ID | กรณี | Expected |
|---|---|---|
| FLOW-01 | Seller A แจ้งส่งงานตน paid/eligible READY_TO_SHIP v1 | 200, SHIPPED_TO_INSPECTION v2, shipment=1, actor/time/audit ครบ |
| FLOW-02 | ผู้รับของที่อนุมัติรับงานจาก FLOW-01 | 200, RECEIVED v3, received_at จาก server, shipment ยัง 1 |
| FLOW-03 | receive สำเร็จ | ไม่ตั้ง started_at/assignee และไม่เริ่มตรวจ |
| FLOW-04 | carrier/tracking ว่าง/ช่องว่าง/เกิน 100; note เกิน 1000; version <=0 | 422; no writes |
| FLOW-05 | client ส่ง paid/status/role/seller_id/server timestamp | 422; ไม่มีการปลอมข้อมูลหรือสิทธิ์ |
| STATE-01 | Admin receive READY_TO_SHIP ด้วย version ปัจจุบัน | 409 INVALID_STATE; ไม่ข้ามขั้น |
| STATE-02 | shipment/receive ในทุก state ที่ห้ามตาม matrix | 409 INVALID_STATE; ทุกแถวไม่เปลี่ยน |
| STATE-03 | version เก่าและ state ผิดพร้อมกัน | VERSION_CONFLICT ก่อน INVALID_STATE |
| ELIG-01 | unpaid และไม่มี inspection | ไม่มีงานใน queue; POST id ที่ไม่มีจริง 404; ไม่สร้างงาน/shipment |
| ELIG-02 | มีงานที่เห็นได้ READY_TO_SHIP แต่ Order ไม่ eligible | 409 ORDER_NOT_ELIGIBLE; ไม่เพิ่ม shipment/version |
| ELIG-03 | อ่าน authoritative eligibility ไม่ได้ | 503; ไม่เชื่อ paid ที่ client/cache ส่งมา |
| ELIG-04 | cancellation/refund แข่งกับ shipment | serializable business outcome ตาม ORDER-03: ถ้า cancel ชนะ shipment ถูกปฏิเสธ; ถ้า shipment ชนะ cancel ทั่วไปถูกกัน ไม่มี cancelled+new shipment ที่ผิด contract |
| AUTH-01 | token หาย/ผิด/หมดอายุ | 401; no reads/writes ที่เปิดเผยข้อมูล |
| AUTH-02 | Seller B list/detail/shipment/receive งานของ A | list ไม่พบงาน; direct actions/detail 404; ไม่มี status/version รั่ว |
| AUTH-03 | Seller A receive งานตน หรือ Admin shipment งานที่เห็น | 403; no writes |
| AUTH-04 | Buyer/role-null/inactive account ทุก endpoint | 403 ตาม error contract; ไม่รั่วรายการ |
| AUTH-05 | Inspector A list/detail | เห็น RECEIVED unassigned และงานตน; ไม่เห็นงาน Inspector B หรือ READY/SHIPPED นอก scope |
| AUTH-06 | Inspector receive | ใช้ expected ตามบทบาทผู้รับของที่อนุมัติใน #54; จนกว่าจะ sync contract ตารางร่างคาดว่า 403 เมื่อเห็นงาน หรือ 404 เมื่องานนอก scope |
| AUTH-07 | key เคยสำเร็จ แต่ actor ถูก suspend/เสียสิทธิ์ก่อน replay | ปฏิเสธตามสิทธิ์ปัจจุบัน ไม่คืน cached body ที่หลุด scope |

## Read และ Refresh

| ID | กรณี | Expected |
|---|---|---|
| READ-01 | POST commit แล้วใช้ connection ใหม่ GET list/detail | เห็นสถานะ/version ล่าสุด ไม่มี stale cache |
| READ-02 | receive สำเร็จแล้ว replay shipment key เดิม | replay คืน shipment response เดิม; GET คืน RECEIVED/version ล่าสุด |
| READ-03 | pagination มีงานหลายผู้ขาย/Inspector และ created_at เท่ากัน | scope ก่อน limit, tie-break ด้วย id; ไม่มีข้อมูลคนอื่น/รายการซ้ำในข้อมูลคงที่ |
| READ-04 | filter/cursor ผิด, cursor เปลี่ยน actor/filter, limit เกินช่วง | 422 ตาม cursor contract; ไม่หลุดสิทธิ์ |
| READ-05 | serialize list/detail ทุก role รวม nested relations | ไม่มี private user/payment fields; evidence projection ตามสิทธิ์ |
| READ-06 | FE ได้ response version เก่าหลังใหม่ หรือเสียสิทธิ์ | contract ระบุใช้ version กัน state ย้อน; 403/404 ทำให้ล้างงานที่มองไม่ได้; ยืนยันร่วม FE ในงาน UI |

## Idempotency, PostgreSQL concurrency และ rollback

ใช้สอง independent sessions/connections, synchronization barrier และ bounded timeout เพื่อให้ requests ทับซ้อนจริง ไม่ใช้สองคำขอเรียงกันเป็นหลักฐาน concurrency; หลังจบตรวจ persisted rows จาก connection ใหม่

| ID | กรณี | Expected |
|---|---|---|
| DUP-01 | shipment key/payload เดิมซ้ำหลังสำเร็จ | status/body เดิม; shipment=1, version/time/audit ไม่เพิ่ม |
| DUP-02 | receive key/payload เดิมซ้ำหลังสำเร็จ | received_at/version เดิม; shipment ยัง 1; audit receive=1 |
| DUP-03 | key เดิมเปลี่ยน payload รวม expected_version | 409 IDEMPOTENCY_KEY_REUSED; no writes |
| DUP-04 | shipment key เดียวกันพร้อมกันหลาย worker | หนึ่ง commit; อีกคำขอ REQUEST_IN_PROGRESS หากยังทำงาน หรือ replay หากเสร็จแล้ว; retry ไม่เพิ่ม shipment |
| DUP-05 | shipment คนละ key แต่ version เดียวกันพร้อมกัน | หนึ่ง 200 อีก VERSION_CONFLICT; shipment=1, version+1 |
| DUP-06 | receive คนละ key แต่ version เดียวกันพร้อมกัน | หนึ่ง 200 อีก VERSION_CONFLICT; เวลา/audit receive ครั้งเดียว |
| DUP-07 | key ใหม่ version ปัจจุบันหลัง action สำเร็จ | INVALID_STATE; ไม่สร้าง shipment ใหม่หรือเขียนเวลารับใหม่ |
| TX-01 | fail ระหว่าง shipment/status/audit/idempotency ก่อน commit | ทุก write rollback; retry ภายหลังสำเร็จได้ ไม่มี success record ค้าง |
| TX-02 | commit สำเร็จแต่ HTTP response หาย | retry key/payload เดิมคืนผลสำเร็จเดิม ไม่มี row/version เพิ่ม |
| TX-03 | pending reservation worker crash (ถ้าออกแบบใช้) | recovery/retry ทำงานและ stale worker ไม่สามารถ commit ซ้ำ |

## หลักฐานสำหรับปิดงาน

- แนบ approved contract, #56 storage commit/migration และ ORDER-03 integration contract พร้อมผู้รับผิดชอบ
- แนบ OpenAPI และตัวอย่าง successful sequence / denied permission / invalid state / replay
- ทุก acceptance มี automated evidence โดย PostgreSQL concurrency/integration ใช้ฐานทดสอบแยก; tests ที่ skip ไม่ถือว่าผ่าน
- สรุปผล regression suite ตามที่รันจริงและระบุสิ่งที่ยังไม่ได้ทดสอบ; ผล `51 passed, 8 skipped` ของงานก่อนหน้าไม่ใช่หลักฐานว่า INSPECT-02 ผ่าน
- งานเตรียมเอกสารนี้ทบทวนให้สอดคล้องกับ contract ร่างได้ แต่ไม่ปิด issue จน implementation และ tests ข้างต้นครบ

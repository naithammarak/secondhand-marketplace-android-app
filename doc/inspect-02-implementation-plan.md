# INSPECT-02 — แผนส่งต่อ implement agent

สถานะ: PRE_IMPLEMENTATION — จัดทำงานเตรียมแล้ว; ยังไม่ใช่ API ที่ใช้งานได้

เอกสารประกอบ: [API และสิทธิ์](inspect-02-api-matrix.md), [เกณฑ์ทดสอบ](inspect-02-test-cases.md), [ร่าง contract กลาง](inspect-contract.md)

## เป้าหมายและสถานะปัจจุบัน

ให้ผู้ขายแจ้งส่งรายการของตนที่จ่ายสำเร็จ ให้เจ้าหน้าที่รับเข้าศูนย์ตามลำดับ และให้ผู้ขาย/เจ้าหน้าที่/Inspector อ่านสถานะล่าสุดตามสิทธิ์ โดยคำขอซ้ำหรือพร้อมกันไม่สร้าง shipment ซ้ำ

จาก checkout ที่ฐานงาน INSPECT-01 preparation commit `ec7b148`: backend เป็น FastAPI + SQLAlchemy + Alembic; `app/main.py` ลงทะเบียนเฉพาะ auth router; มี `get_current_user` แต่ยังไม่มี Inspection/Order models หรือ Inspect API จึงต้องใช้ model และ contract ที่ต้นทางส่งมอบจริงก่อน implement

ร่าง `inspect-contract.md` เวอร์ชัน 0.1 ยังไม่ได้อนุมัติ ข้อเสนอสถานะ บทบาท endpoint และ error code ทั้งหมดในชุดนี้จึงเป็นข้อเสนอเพื่อทบทวน ไม่ใช่หลักฐานว่าทีมตกลงแล้ว การเปิด issue #54/#56 ผ่านเว็บได้ 404 จึงยืนยันสถานะล่าสุดไม่ได้

## Dependency gate

| ต้องรอ | สิ่งที่ต้องได้รับก่อน implement | หลักฐานที่แนบใน PR |
|---|---|---|
| [#54 INSPECT-00](https://github.com/naithammarak/SA-Project/issues/54) | สถานะ/สิทธิ์ที่อนุมัติ; ผู้รับสินค้าเป็น Admin ตามร่างหรือบทบาทอื่น; รูปแบบ API/errors; idempotency และการยกเลิก | approved contract version และผู้ยืนยัน |
| [#56](https://github.com/naithammarak/SA-Project/issues/56) | ยืนยันว่าเป็นงาน storage ที่ต้องใช้; ส่งมอบ Inspection, shipment, version, constraints, audit/idempotency ตามสัญญาจริง | ชื่อ issue ที่ตรวจสอบได้, merged PR/commit, migration revision และ persistence interface |
| ORDER-03 | แหล่งข้อมูลยืนยัน paid/eligible, seller ownership, cancellation/refund boundary, วิธีอ่านสถานะและความสอดคล้องระหว่างแจ้งส่ง | contract/interface ที่อนุมัติ, merged commit และ fixture ที่ใช้งานได้ |

ห้ามสรุปว่า #56 เสร็จเพียงเพราะมีเอกสาร INSPECT-01; ต้องยืนยันชื่อ/ขอบเขตจาก issue และส่งมอบ storage จริง ห้ามสมมติ ORDER-03 เป็น endpoint หรือ enum ที่ไม่มีใน repository

งานที่ทำได้ตอนนี้คือแผน, API/permission matrix, ลำดับ transaction, test design และ fixture requirements งานที่รอ gate คือ executable schemas/services/routes, migration เสริมที่จำเป็น และ integration tests ที่อ้างโครงสร้างจริง

## ขอบเขต

- สร้าง 4 endpoints: list, detail, shipment, receive ตามชื่อใน API matrix หลังยืนยัน contract
- ใช้ Inspection ที่ต้นทางสร้างไว้แล้ว ไม่สร้างงานตรวจใหม่ระหว่างแจ้งส่ง; รายการยังไม่จ่ายปกติยังไม่มี Inspection
- รับสินค้าเข้าศูนย์ (`receive`) เป็นคนละคำสั่งกับ Inspector รับงาน (`claim`); งานนี้ไม่เริ่มตรวจโดยอัตโนมัติ
- อ่านสถานะ INSPECTING/COMPLETED ที่ส่วนอื่นสร้างได้ตามสิทธิ์ แต่ไม่เพิ่ม claim/reassign/result/evidence/CERT/Return endpoints ใน issue นี้
- การ Refresh ในขอบเขตนี้คือ API ส่งสถานะปัจจุบันให้ client ดึงใหม่ได้; งาน UI และ realtime push แยกตามเจ้าของงาน

## ลำดับ implementation หลัง gate ผ่าน

1. บันทึก contract version, dependency commits และ mapping ชื่อตาราง/ฟิลด์จริงให้ครบ ยืนยัน owner ของ eligibility adapter และ idempotency storage
2. เพิ่ม schemas ใน `backend/app/schemas/inspection.py`: shipment/receive requests, list query, response projections และ error envelope; reject extra fields และ server-owned fields
3. เพิ่ม policy/service ใน `backend/app/services/inspections.py` หรือโครงสร้างที่ repo ใช้: active account, scoped queries, action permissions, transitions, transaction และ replay ห้ามรับ actor/role/seller/status จาก client เพื่อให้สิทธิ์
4. ใช้ `get_current_user` เดิมร่วมกับ guard ตรวจ ACTIVE และบทบาททุกคำขอ รวม replay; ตรวจ 401 สำหรับ token หาย/ผิด และจัด error envelope ของ Inspect ให้ตรง contract โดยไม่ทำให้ auth เดิมเสีย
5. เชื่อม ORDER-03 ผ่าน interface ที่เจ้าของส่งมอบจริง ปฏิเสธเมื่ออ่าน eligibility ไม่ได้ ห้าม fallback เป็น paid=true หรือใช้ cache ฝั่งมือถือ
6. เพิ่ม `backend/app/api/inspections.py` และลงทะเบียนใน `app/main.py`; query กรองสิทธิ์ก่อน pagination และ projection
7. เพิ่ม tests ใน `backend/tests/test_inspection_api.py`, `test_inspection_service.py`, `test_inspection_concurrency.py` ตาม test matrix; ใช้ PostgreSQL แยกสำหรับ transaction/locks/unique จริง
8. ตรวจ OpenAPI, run tests ที่เกี่ยวข้องและ regression suite แล้วแนบผลจริง พร้อมตัวอย่าง shipment → receive → GET และหลักฐานจำนวน shipment หลัง concurrent requests

ไม่สร้างตาราง idempotency/audit ซ้ำ หาก #56 ยังไม่มีส่วนที่ contract บังคับ ให้ประสาน owner เพื่อเพิ่ม migration ใน dependency ที่ถูกต้องก่อนใช้ service

## การบันทึกและป้องกันข้อมูลซ้ำ

ลำดับตรวจตามร่างกลาง: authentication/account → schema → scope/action permission → idempotency → version → state → business validation → commit

### แจ้งส่ง

1. ตรวจว่าเห็นงานและเป็น SELLER เจ้าของตาม Order snapshot ที่เชื่อถือได้
2. ตรวจ idempotency record ภายใน scope `(actor_id, method, path, key)`; same key/payload replay หลังตรวจสิทธิ์ปัจจุบัน; payload ต่างปฏิเสธ
3. เปิด transaction และตรวจสิทธิ์/ข้อมูลที่อาจเปลี่ยนอีกครั้งใต้ lock ที่เกี่ยวข้อง; read/check ที่อยู่นอก transaction ใช้แทนการตรวจภายในไม่ได้
4. ใช้กลไกที่ ORDER-03 ยืนยันเพื่อป้องกัน race ของ payment/cancellation กับ shipment; ตรวจ version และ READY_TO_SHIP แล้วตรวจ paid/eligible จาก authoritative state
5. บันทึก shipment, เปลี่ยนเป็น SHIPPED_TO_INSPECTION, เพิ่ม version ครั้งเดียว, server timestamps, audit และ successful idempotency response ใน transaction เดียว
6. commit ก่อนคืน 200; unique shipment ต่อ inspection เป็นแนวป้องกันสุดท้าย แปลง expected uniqueness conflict เป็น business conflict/replay ไม่คืน 500 แบบไม่จัดการ

ถ้า Order/Inspection อยู่ DB เดียวกัน ให้ทุก flow ใช้ลำดับ lock ร่วมกันที่ทีมตกลง (เช่น Order → Inspection) รวม flow ยกเลิก เพื่อไม่ตรวจ paid แล้วถูกยกเลิกก่อน commit ถ้าอยู่คนละ service ห้ามถือว่า HTTP GET ก่อน write เป็น atomic ต้องมี reservation/atomic handoff หรือ eligibility guarantee จาก ORDER-03 ก่อนปลด gate

### รับเข้าศูนย์

ใช้ scope/idempotency/transaction pattern เดียวกัน ตรวจบทบาทรับของที่อนุมัติ, version และ SHIPPED_TO_INSPECTION จากนั้นบันทึก received_at ด้วย UTC server time, note, ผู้รับผ่าน audit (หรือ received_by ถ้า schema อนุมัติ), RECEIVED และ version+1 อะตอมเดียว ไม่สร้าง shipment ใหม่ ไม่ตั้ง started_at/assignee

### คำขอซ้ำและความล้มเหลว

- key เป็น UUID; เก็บ payload hash ตาม normalization ที่ประกาศชัด รวม expected_version; replay คืน HTTP status/business body เดิมแม้งานเดินต่อแล้ว จึงให้ FE GET เพื่อ Refresh
- คำขอแรกกำลังทำงาน: ตามร่างใช้ 409 REQUEST_IN_PROGRESS + Retry-After: 2; implement กลไก durable reservation/unique arbitration ให้รองรับหลาย worker ไม่ใช้ memory lock ใน process เดียว
- key เดิม/payload ต่าง: 409 IDEMPOTENCY_KEY_REUSED; key ใหม่/version เก่า: VERSION_CONFLICT; key ใหม่/version ปัจจุบันแต่ state ไม่รับ action: INVALID_STATE
- rollback ไม่เหลือ shipment/status/audit/success record ครึ่งชุด; client timeout หลัง commit ต้อง retry key/payload เดิมแล้วได้ผลเดิม ไม่เพิ่มเวลา/version
- หากใช้ pending reservation แยก transaction ต้องกำหนด recovery ของ worker crash, lease และการกันผู้ถือ lease เก่ากลับมาเขียน พร้อม test ก่อนใช้งาน
- ห้ามใช้ tracking_number เป็น global unique หาก contract ไม่กำหนด; ความซ้ำที่งานนี้กันคือ shipment ต่อ Inspection ที่อนุมัติ

## Refresh และข้อมูลที่อ่านได้

- GET list/detail อ่าน committed state ปัจจุบันจากแหล่งที่รองรับ read-after-write; กำหนด Cache-Control: no-store สำหรับ response ตามผู้ใช้ในข้อเสนอ API
- ส่ง status, version, updated_at และ shipment/received_at ตาม projection; mutation response ส่งค่าที่ commit แล้ว
- FE Refresh หลัง success, conflict และเมื่อกลับเข้าหน้า; เมื่อ replay ได้ body เก่าให้ GET ล่าสุด; ใช้ version กัน response เก่าทับ state ใหม่ ส่วน 403/404 จากการเสียสิทธิ์ต้องล้างข้อมูลที่ไม่ควรมองเห็น
- list เรียง `(created_at,id)` แบบทิศทางคงที่ตาม API matrix, cursor ผูก filter/ผู้ใช้และตรวจความถูกต้อง; refresh เริ่มหน้าแรกใหม่ ไม่ใช้ cursor เก่ารับประกันภาพรวมเดิม
- รายการนอกสิทธิ์ต้องไม่รั่วใน items, totals, cursor, error หรือ relation ที่ serializer โหลดมา ห้ามใช้ ORM object ทั้งก้อนเป็น public response

## ผู้รับผิดชอบและการตรวจรับ

BE/implement agent รับ API/service/tests; DB1 รับรอง constraints/transaction storage; เจ้าของ ORDER-03 รับรอง eligibility และ cancellation race; FE/QA ทบทวน Refresh/permission/error behavior; Lead ยืนยัน #54 และขอบเขต #56 โดยต้องใส่ชื่อผู้รับงานจริงใน PR

ปิด INSPECT-02 ได้เมื่อ API จริงผ่าน acceptance ทั้ง 4 ข้อใน [test matrix](inspect-02-test-cases.md), dependencies มีหลักฐานพร้อม, PostgreSQL concurrency/integration tests ผ่านจริง และ regression ไม่เสีย งานเตรียมเสร็จหรือ tests ถูก skip ไม่เท่ากับ issue เสร็จ

## Git handoff

branch `chore/inspect-02-preparation` ต่อยอด `chore/inspect-01-preparation` ที่ `ec7b148` เพื่อใช้ร่าง contract เดียวกัน Diff สำหรับ review เฉพาะ INSPECT-02 ให้เทียบกับ branch INSPECT-01; หากเปิด PR เข้า main ก่อน INSPECT-01 merge จะเห็นไฟล์งานก่อนหน้ารวมอยู่ด้วย

ชุดนี้เพิ่มเอกสาร INSPECT-02 เท่านั้น ไม่ได้เปลี่ยน runtime code หรืออ้างว่าผ่าน integration tests แล้ว

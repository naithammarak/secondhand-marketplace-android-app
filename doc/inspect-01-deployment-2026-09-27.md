# INSPECT-01: ผลนำ migration ขึ้น Supabase จริง

สำเร็จเมื่อ **27 กันยายน 2026 เวลา 19:25 น. (Asia/Bangkok)**

ฐาน Supabase ของโครงการ `hzromkehaftcfthhrunm` เปลี่ยนจาก revision ที่ไม่มีไฟล์ใน repo `ab2409240001` ไปเป็น `f3c1a09d8b56` แล้ว โดยตรวจ schema ปัจจุบัน เก็บความต่างเฉพาะทีม และจัด baseline ใหม่อย่างมีหลักฐานก่อน upgrade ไม่ได้ค้นพบหรืออ้างว่าได้กู้ไฟล์ migration เดิม

## สิ่งที่เปลี่ยน

- กำหนด baseline ภายใน transaction เป็น `9446ec1a2c5d` หลังเทียบ schema และข้อมูลกับสำรองแล้ว
- รัน migration ต้นทาง `b41d7ce09f35` → `a5f1c9d2e7b3` → `c93b7e5a1d84` → `f3c1a09d8b56`
- เพิ่ม deadline/ข้อมูลยกเลิกของ Order, ตาราง `admin_access_logs` และ index ที่งานต้นทางกำหนด
- เพิ่ม 6 ตาราง INSPECT-01: `shipments`, `shipment_delivery_proofs`, `inspections`, `inspection_evidence`, `inspection_result_evidence`, `inspection_idempotency`
- เพิ่มสถานะ Order สำหรับ INSPECT และอนุญาต role COURIER ตาม migration
- เพิ่ม constraints, indexes, triggers ป้องกันแก้ผล/หลักฐานหลังจบ และเปิด RLS ตามโค้ดที่ผ่านการซ้อม

การจัด baseline และ migration ทั้งสี่อยู่ใน PostgreSQL transaction เดียว มี lock timeout และตรวจ revision/schema/data/permissions ก่อนเริ่ม หากผิดเงื่อนไขจะหยุดและ rollback ไม่ได้แยก commit เฉพาะเลข migration ก่อนสร้างตาราง

## หลักฐานตรวจรับ

| รายการ | ผล |
|---|---|
| สำรองชุดใหม่ | public schema/data พร้อมเจ้าของตารางและ grants/default privileges |
| Restore | กู้ 2 สำเนาในเครื่องและเทียบข้อมูล เจ้าของ และ ACL ตรงกับต้นทาง |
| เงื่อนไข restore public schema | แนบ SQL คืน default USAGE ของ PUBLIC ซึ่ง pg_dump อาศัยค่าจาก initdb เมื่อกู้ schema แบบเจาะจง |
| จำลองความล้มเหลวหลัง migration ทั้งชุด | rollback กลับครบทั้งข้อมูล โครงสร้าง สิทธิ์และเลข revision |
| ซ้อม commit โดยใช้ role postgres และสิทธิ์ต้นฉบับ | ผ่าน |
| PostgreSQL integration tests ของ INSPECT-01 | 12/12 จากรอบซ้อมก่อนหน้า |
| ตรวจหลัง commit ด้วย connection ใหม่ | revision `f3c1a09d8b56`; schema ตรงกับเป้าหมายที่ซ้อม |
| ข้อมูลเดิม | count/digest ของ 13 ตารางข้อมูลเดิมและทุกคอลัมน์เดิมเท่าเดิม ไม่รวม alembic_version ที่ตั้งใจเปลี่ยน |
| สิทธิ์เดิม | owner และ ACL ของวัตถุเดิมคงอยู่ ตรวจใน transaction ก่อน commit |
| RLS | เปิดทั้ง 6 ตาราง INSPECT และ `admin_access_logs`; ไม่มี direct-access policy เพิ่มจาก rollout นี้ |
| ฐานทดสอบ | ปิดแล้วหลังตรวจผลสำเร็จ |

เก็บ `users.role` ที่เป็น NOT NULL/default BUYER, default PENDING ของ verification, `shop_name`, `consent_at` และชื่อ PK/FK เฉพาะทีมไว้ทั้งหมด โดยมีผลเทียบ schema และข้อมูลก่อน/หลังเก็บไว้กับไฟล์สำรอง

## Order รอชำระเดิม

ผู้ใช้ยืนยันให้ใช้กติกาเวลาสร้าง + 30 นาทีกับ Order เดิมแล้ว Migration เติม deadline ให้ Order ทั้ง 4 รายการตามกติกา แต่ไม่ได้เรียกงานยกเลิกหรือเปลี่ยนสถานะเอง

ณ เวลาตรวจหลัง commit ทั้ง 4 รายการยังเป็น `WAITING_PAYMENT` และเกิน deadline แล้ว ระบบ expiry อาจยกเลิกรายการเหล่านี้เมื่อเริ่มทำงานตาม flow ปกติ

## สำรองและเอกสารสำหรับผู้ดูแลฐาน

เก็บในโฟลเดอร์ส่วนตัวถาวร:

`C:\Users\User\AppData\Local\SA-Backups\inspect01-20260927`

- `public-with-permissions.dump` — 74,703 bytes
- SHA-256: `39f8f3e042fa1a2b69425395b5dbe60105ea2cb076cc6152b2d8b027ce006751`
- `restore-schema-privileges.sql` — companion สำหรับกู้ public schema ใหม่ให้ default grant ตรงต้นฉบับ
- `before-schema.json`, `before-data.json`, `before-security.json` — โครงสร้าง, count/digest, เจ้าของและสิทธิ์ก่อนรัน
- `restore-result.json`, `atomic-test-result.json` — ผล restore และ atomic rollback/commit
- `deployment-result.json`, `central-verification.json` — ผล commit และการตรวจฐานจริง
- `code-hashes.json` — ค่า hash ของ migration ที่ใช้รัน

Source snapshot ยังอยู่ที่ `C:\Users\User\AppData\Local\Temp\sa-inspect01-reconcile-20260927\source.zip` คัดลอก snapshot เป็น `pinned-source.zip` และรายงานเป็น `deployment-report.md` ไว้ในโฟลเดอร์สำรองถาวรแล้ว

สำรองนี้ครอบคลุม public application schema ที่งานนี้เปลี่ยน ไม่รวม Auth/Storage schemas หรือไฟล์รูป จึงไม่ใช่ backup สำหรับกู้ Supabase ทั้งโครงการ ไฟล์มีข้อมูลแอปจริงและจำกัดสิทธิ์ไว้ ห้ามนำขึ้น Git

หากพบปัญหาภายหลัง อย่า restore ทับฐานที่มีรายการใหม่หรือ downgrade ฝืน ให้ตรวจการเปลี่ยนแปลงหลังเวลา rollout ก่อนตัดสินใจแก้ไปข้างหน้าหรือกู้คืน

## ขอบเขตของผลสำเร็จ

งานนี้ยืนยันการรัน schema และการเก็บข้อมูล/สิทธิ์เดิม ไม่ใช่หลักฐานว่าทางเดิน API, หน้าจอ, Auth หรือ Storage ของ INSPECT-02/03 ผ่าน end-to-end บนระบบร่วมแล้ว และไม่ได้รัน migration Certificate `c7e4b21a9d08`

โค้ดอ้างอิง: main `8254f8d224f62aa765f978f65f110139410a09ab` ร่วมกับ INSPECT-01 `e7bde70aacb654a3c8973a947613518835d00e0a`, tree `47b1348bfc04af7ca5b5c51b3b9eb9a342906884` ใช้ snapshot แยก ไม่ได้แก้ branch ของทีม รายงานนี้เป็นเอกสารผล rollout; ไม่ได้รวมไฟล์สำรองหรือข้อมูลแถวจริงไว้ใน Git

# ส่งต่อ Claude Code — งาน F / 2NDHAND

อัปเดต: 4 ตุลาคม 2026 · ส่งงาน 8 ตุลาคม 2026 (Asia/Bangkok)

## Checkout และสิทธิ์

- ทำงานต่อที่ `/home/tmk/project/market-place-mobile-app/worktrees/e-ui-preview`
- Branch: `claude/certificate-qr-2026-10-03`; HEAD ก่อนแพตช์ `d41720ae831afa5461fd839492aa83a9e046815f`
- แพตช์ทั้งสามงานและเอกสารส่งต่ออยู่ใน local commit ชื่อ `fix: support custom brands and Expo native image submissions` ตรวจ SHA ด้วย `git log -1 --format='%H %s'` และตรวจ working tree ก่อนเริ่ม
- ไม่มี push/deploy/แก้ DB ทีม/เปิด Cron ในรอบ Codex นี้
- **ห้ามอ่านหรือแสดงค่า `.env` และต้องถามเจ้าของก่อน push, แก้ DB ทีม หรือ deploy/ตั้ง remote Render** หากสิทธิ์บล็อก ให้แจ้งเหตุผลและเตรียมคำสั่งให้เจ้าของรันเอง ห้ามข้ามข้อจำกัด
- อ่าน `mobile/AGENTS.md` และ Expo SDK 57 docs ก่อนแก้โค้ด ใช้ `EXPO_NO_DOTENV=1` สำหรับ Expo/Jest/lint/export และปิด dotenv สำหรับ backend tests

## งานที่ commit แล้ว

1. **แบรนด์:** ฟอร์มรองรับชื่อที่ไม่อยู่ในตัวเลือกและไม่ทับชื่อเมื่อ refresh; create/update ส่ง `brand_id` เดิมหรือ `brand_name` ใหม่ API resolve/reuse/เพิ่มใน transaction สินค้าเดิม ไม่มี migration เพิ่ม PostgreSQL advisory lock ป้องกันชื่อซ้ำจากการส่งพร้อมกันผ่านเส้นทางนี้
2. **อัปโหลดรูปสินค้า:** แก้ native `{uri,name,type}` ที่ Expo SDK 57 multipart serializer ไม่รองรับ เป็น `expo-file-system File` ที่ส่ง bytes ได้ เพิ่ม direct dependency `~57.0.6` ตามเวอร์ชันที่ติดตั้งอยู่แล้ว; Web path เดิม, ข้อผิดพลาดไฟล์หาย และ cancellation มี regression
3. **ยืนยันตัวตนขอเปิดร้าน:** แก้ native รูปบัตรแบบเดียวกัน เพิ่ม field error ให้เลือกรูปใหม่และ preflight cancellation กันส่งหลังเปลี่ยนบัญชีระหว่างรอ token ไม่ล้างข้อมูลฟอร์ม
4. เพิ่ม regression, historical offline reproducer, รายงาน, คิว F, QA B1a และ amendment ของ PRODUCT-06

## หลักฐานที่ผ่าน

- แบรนด์/สินค้า: backend SQLite **120**, PostgreSQL แยก **3**, mobile logic **80**, component **23** รวม **226 tests** ผ่าน
- ยืนยันตัวตน: logic **46**, component verification/seller screen/product uploader **30** ผ่าน ตัวเลขนี้มี tests อัปโหลดสินค้าซ้อนกับชุดแบรนด์ ไม่ใช่ยอด tests ที่ไม่ซ้ำของทั้งโปรเจกต์
- TypeScript, lint ที่เกี่ยวข้องและ `git diff --check` ผ่าน; seller screen มี lint warning `require()` ใน mock เดิม และ component tests มีคำเตือน `act(...)` รายงานแยกรายละเอียดไว้
- Android Hermes export ล่าสุดผ่าน **2,151 modules**, bundle ประมาณ **6.2 MB** ที่ `/tmp/2ndhand-f-brand-20261004-android` เป็น compilation check ไม่ใช่ APK/device PASS
- Backend API tests ใช้ TestClient/SQLite ในหน่วยความจำและ Storage mock; PostgreSQL concurrency ใช้ container ชั่วคราว DB `f_brand_test` ที่สร้างและปิดเอง ไม่แตะ DB ทีม

## รายงานและลำดับงาน

อ่านไฟล์เหล่านี้เพื่อดูคำสั่งตรวจซ้ำและข้อจำกัด:

- [คิว F](F-WORK-QUEUE.md)
- [ผลแก้แบรนด์](../reports/F-BRAND-FIX-2026-10-04.md)
- [ผลแก้อัปโหลดรูปสินค้า](../reports/F-UPLOAD-DIAGNOSIS-2026-10-04.md)
- [ผลแก้ยืนยันตัวตน](../reports/F-VERIFICATION-FIX-2026-10-04.md)
- [QA เพื่อน](../QA-FRIEND-CHECKLIST.md)
- [งาน F และ tasks 10–13](../work-packages/F-release-android-presentation.md)

รายงานวินิจฉัยบางส่วนกล่าวถึง working tree และ HEAD ก่อน commit ตามเวลาที่ตรวจ ให้ใช้ local fix commit และ handoff นี้เป็นสถานะหลังจัดเก็บงาน ห้ามตีความ PATCHED_LOCAL เป็น acceptance บนเครื่องจริง

## สิ่งที่ต้องทำต่อ

1. ตรวจแพตช์และสถานะ checkout ก่อนเริ่ม งานแก้แบรนด์/รูปสินค้า/รูปบัตรเสร็จระดับ local code แล้ว ไม่ต้องทำใหม่
2. เตรียมงาน lifecycle worker: `backend/scripts/run_lifecycle_jobs.py` ให้เป็น Render Cron Job ทุก **5 นาที** ตรวจ script, `render.yaml`, `backend/Dockerfile` และ tasks/10 เตรียม definition/คำสั่งที่ review ได้ก่อนขออนุญาตตั้ง remote ปัจจุบัน **ยังไม่ได้เปิด Cron**
3. หลังเจ้าของอนุมัติ push/deploy ให้ deploy **API ใหม่ก่อนแจก APK ใหม่** เพราะ API เดิมไม่รับ `brand_name`; API ใหม่ยังรับ `brand_id` ของ APK เดิม ไม่มี migration ใหม่จากแพตช์นี้
4. สร้าง APK candidate รวมสามแพตช์ บันทึก source/API SHA, DB migration head และ APK hash ให้ตรงกันใน manifest
5. Galaxy A02s และเครื่องเพื่อนทดสอบ **B1a, B1–B3/Q03 และ A6–A8/Q02** โดยใช้ข้อมูลและบัญชีที่ได้รับอนุญาต ตรวจชื่อแบรนด์คงอยู่, รูปสินค้า, รูปบัตร/สถานะรอตรวจสอบ, retry และสลับบัญชี; ทดสอบ API/Auth/private Storage จริงก่อนบันทึก PASS
6. ดำเนิน tasks **10 → 12 → 11 → 13** ตามแพ็กเกจ F โดยแยก local tests, remote rollout, APK/device QA และ presentation/handover ให้ชัด

## Runtime ที่ผู้ใช้ส่งมา

- API: `https://secondhand-api-gksn.onrender.com` (`render.yaml`, `backend/Dockerfile`)
- DB: Supabase ทีม migration `r01e20261002` เป็นข้อมูลที่ผู้ใช้ส่งมา; รอบนี้ไม่ได้ตรวจหรือเปลี่ยน DB ทีม
- APK build 1: `artifacts/android/APK-MANIFEST.md`, EAS project `@thammaraknai/mobile-expo`, profile `preview`; ผู้ใช้แจ้งว่าติดตั้ง Galaxy A02s และ Google login ได้ **APK นี้ยังไม่รวมสามแพตช์ใหม่**

ห้ามอ้างว่า worker/Storage/การบันทึกจริงหรือ APK ใหม่ผ่านแล้ว หากยังไม่มีหลักฐานจาก release candidate นั้น

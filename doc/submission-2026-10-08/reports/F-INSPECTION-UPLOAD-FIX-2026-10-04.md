# F — แก้อัปโหลดรูปหลักฐานตรวจสินค้าและรูปส่งถึงศูนย์ของ Courier

วันที่: 4 ตุลาคม 2026 (Asia/Bangkok)

สถานะ: **PATCHED_LOCAL — แก้ source และตรวจในเครื่องแล้ว ยังไม่ได้สร้าง APK ใหม่หรือทดสอบกับ API/Storage ทีมด้วยบัญชีจริง**

Worktree: `/home/tmk/project/market-place-mobile-app/worktrees/e-ui-preview`

Branch: `claude/certificate-qr-2026-10-03` · HEAD ก่อนแพตช์: `7ab4ab468c3e7ba7b72a2e76d9287d54ce341f4f` · แพตช์อยู่ใน working tree ต่อจากแพตช์คิว 1–3 ที่ยังไม่ commit

## สาเหตุและผลแก้

`inspection-service.ts` ทั้ง `upload` (Inspector แนบรูปหลักฐาน `/inspections/{id}/evidence`) และ `uploadProof` (Courier แนบรูปส่งถึงศูนย์ `/courier/shipments/{id}/proofs`) แนบรูป native เป็น `{ uri, name, type }` เพราะ picker ใน `connected-screens.tsx` และ `inspector-work.tsx` ให้ `asset.file` เป็น `undefined` บนมือถือ Expo SDK 57 global fetch ปฏิเสธ part แบบนี้ก่อนส่ง HTTP จึงขึ้น “เชื่อมต่อระบบไม่ได้” ทำให้ทำ C4 (ผลตรวจ → ใบรับรอง + QR) และยืนยันส่งถึงศูนย์ของ Courier (ต้องมี proof id) ไม่ได้ test เดิมส่ง Blob จึงไม่ครอบคลุมแขนง native

- เพิ่ม `mobile/src/services/upload-file-part.ts`: `uploadFilePart({ file, uri })` ใช้ File ของ Web ตามเดิม ถ้าไม่มีจะเปิด URI ด้วย `File` ของ `expo-file-system` (require แบบ lazy) ตรวจ `exists` และโยน `LocalUploadFileError` ถ้าไฟล์หาย/เปิดไม่ได้
- `inspection-service.ts` ใช้ helper ทั้งสองฟังก์ชัน ไฟล์หายเป็น `InspectionServiceError(422, 'local_file_unreadable')` ก่อนส่งคำขอใดๆ เมื่อเป็น 4xx `useInspectionMutation` จะล้าง key และรูปที่รอส่งให้เลือกใหม่
- `use-inspection-api.ts` เพิ่มข้อความ `local_file_unreadable`: “อ่านรูปภาพไม่สำเร็จ กรุณาเลือกรูปใหม่”
- `image-upload-service.ts` และ `verification-service.ts` เปลี่ยนมาเรียก `readLocalUploadFile` จาก helper เดียวกัน พฤติกรรมและข้อความ error เดิมไม่เปลี่ยน
- ค้น `mobile/src` แล้วไม่พบ FormData ที่แนบ `{ uri, name, type }` จุดอื่น ไม่มีการเปลี่ยน backend, API contract หรือ dependency

## การตรวจในเครื่อง

| การตรวจ | ผล |
|---|---|
| Regression ก่อนแก้ `component-tests/inspection-upload-service.test.tsx` (Expo multipart converter จริง + filesystem mock) | 4 ล้ม (native `upload`/`uploadProof` และกรณีไฟล์หาย) · Web 2 ผ่าน |
| Regression หลังแก้ ไฟล์เดียวกัน | 6/6 ผ่าน: native ทั้งสอง endpoint ตรวจชื่อช่อง/filename/MIME/bytes/header, Web Blob, ไฟล์หาย → 422 `local_file_unreadable` + ข้อความไทย และไม่เรียก fetch |
| Component tests ทั้งหมด (`npm run test:components`) | 40 suites, 327/327 ผ่าน |
| Logic tests ทั้งหมด (`npm run test:logic`) | 352/352 ผ่าน รวม test ใหม่ใน `tests/inspection-service.test.mjs` |
| TypeScript `tsc --noEmit` | ผ่าน |
| ESLint ไฟล์ที่แก้ | 0 errors, 0 warnings |
| Android Hermes export (`EXPO_NO_DOTENV=1`) | ผ่าน bundle ประมาณ 6.2 MB |

ไม่มีการอ่าน/แสดงค่า `.env`, push, deploy หรือเขียน DB/Storage ทีม

## คำสั่งตรวจซ้ำ

จาก `mobile`:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/inspection-service.test.mjs
EXPO_NO_DOTENV=1 npx --no-install jest --runInBand component-tests/inspection-upload-service.test.tsx component-tests/image-upload-service.test.tsx component-tests/verification-service.test.tsx
EXPO_NO_DOTENV=1 npm run typecheck
EXPO_NO_DOTENV=1 npx --no-install expo export --platform android --output-dir /tmp/2ndhand-f-inspection-upload-android
```

## Gate ที่เหลือก่อนปิดงาน

1. สร้าง APK candidate ใหม่ที่รวมแพตช์คิว 1–3 และคิวนี้ Android export ไม่ใช่ APK
2. บนเครื่องจริง: Inspector ถ่าย/เลือกรูปหลักฐาน บันทึก “ผ่าน” แล้วเห็นใบรับรอง + QR (C4) และสแกน QR จากเครื่องอื่น (F1); Courier แนบรูป 1–3 รูปแล้วยืนยันส่งถึงศูนย์ได้
3. ตรวจรูปเกิน 5 MB/ชนิดไม่รองรับ (413/415), network failure/retry ด้วย key เดิม และการเปิดรูป private ผ่าน `privateImageSource`

## อ้างอิง

- [F-UPLOAD-DIAGNOSIS-2026-10-04.md](F-UPLOAD-DIAGNOSIS-2026-10-04.md)
- [F-VERIFICATION-FIX-2026-10-04.md](F-VERIFICATION-FIX-2026-10-04.md)
- [คิวงาน F](../coordination/F-WORK-QUEUE.md)

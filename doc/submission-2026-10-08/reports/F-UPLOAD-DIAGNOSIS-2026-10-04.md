# F — ผลตรวจอัปโหลดรูปลงขาย

วันที่ตรวจ: 4 ตุลาคม 2026 (Asia/Bangkok)

สถานะล่าสุด: **PATCHED_LOCAL — แก้ source อัปโหลดสินค้าและตรวจในเครื่องแล้ว ยังไม่ได้สร้าง APK ใหม่หรือยืนยันบน Android จริง**

## ผลแก้ในเครื่อง

- `mobile/src/services/image-upload-service.ts` เปลี่ยน native URI descriptor เป็น `File` ของ `expo-file-system` และตรวจว่าไฟล์ยังอยู่ หากเข้าถึงไฟล์ไม่ได้จะแสดง “อ่านรูปภาพไม่สำเร็จ กรุณาเลือกรูปใหม่”
- โหลดโมดูล native เฉพาะแขนง URI; Web ยังแนบ `asset.file` เหมือนเดิม และยังให้ fetch สร้าง multipart boundary เอง ตรวจ cancellation อีกครั้งก่อนส่ง request
- เพิ่ม `expo-file-system: ~57.0.6` เป็น direct dependency ใน package/lock ตรงกับ SDK 57 และเวอร์ชันที่มีอยู่แล้ว ไม่ได้อัปเกรด dependency อื่น
- เพิ่ม `mobile/component-tests/image-upload-service.test.tsx` ทดสอบ native JPEG/PNG ผ่าน Expo multipart converter จริง โดยใช้ filesystem mock ที่มากับ Expo ตรวจ binary/filename/MIME และการลงทะเบียน upload metadata รวมถึง Web, ไฟล์หาย และ cancellation
- ก่อนแก้ regression ของ native JPEG/PNG ล้มด้วยข้อความเครือข่าย; หลังแก้ผ่าน ชุดทดสอบฟอร์ม/บริการสินค้า logic **32/32**, component **17/17**, typecheck และ lint ไฟล์ที่เปลี่ยนผ่าน
- Android Hermes export ผ่าน: **2,151 modules**, bundle ประมาณ **6.2 MB**, output `/tmp/2ndhand-f-upload-20261004-android` ใช้ `EXPO_NO_DOTENV=1` และตรวจจากโค้ด Expo ว่า flag นี้ข้ามการโหลด `.env` นี่เป็น compilation check ไม่ใช่ release APK หรือ device QA
- ชุด ProductForm มีคำเตือน `act(...)` แต่ทุก test ผ่าน; ไม่ได้แก้ฟอร์มหรือ suppress คำเตือน
- [คิว F](../coordination/F-WORK-QUEUE.md) เพิ่มปัญหาส่งยืนยันตัวตนหน้าขอเปิดร้านต่อจากอัปโหลดสินค้า และเลื่อน Cron worker เป็นคิว 4
- Reproducer รักษา source อัปโหลดสินค้าและบริการยืนยันตัวตนจาก commit `d41720ae831afa5461fd839492aa83a9e046815f` เพื่อทำซ้ำข้อผิดพลาดเดิมหลัง source ใน working tree ถูกแก้แล้ว ทั้งสองบริการเดิมได้ `network-error` จาก URI object ก่อน HTTP เช่นเดียวกัน บริการยืนยันตัวตนแก้ในคิวถัดมาตาม [F-VERIFICATION-FIX-2026-10-04.md](F-VERIFICATION-FIX-2026-10-04.md)

ยังต้องสร้าง APK ใหม่และทดสอบ Galaxy A02s/เครื่องเพื่อนกับ API/Auth/Storage จริง แพตช์นี้อยู่ใน working tree; ไม่มี push, deploy หรือเขียน DB/Storage ทีม

ข้อมูลด้านล่างเป็นผลการวินิจฉัย source ก่อนแพตช์

## ผลที่พบ

ผู้ใช้และเพื่อนลงรูปในหน้าลงขายไม่ได้ โดยแอปแสดง “เครือข่ายขัดข้อง กรุณาลองใหม่” พบข้อผิดพลาดที่อธิบายอาการนี้ได้ใน `mobile/src/services/image-upload-service.ts`: แอปแนบไฟล์ด้วย object `{ uri, name, type }` ซึ่งเป็นรูปแบบของ React Native เดิม แต่ Expo SDK 57 ใช้ `expo/fetch` เป็น global fetch โดยปริยาย ตัวแปลง multipart ของ Expo ไม่รองรับ URI object นี้ และโยน `Unsupported FormDataPart implementation` ก่อนส่ง HTTP จากนั้น catch ของแอปแปลง exception เป็นข้อความเครือข่ายดังกล่าว

หลักฐานยืนยันข้อผิดพลาดระดับโค้ดครบ เส้นทางนี้เป็นสาเหตุหลักที่อนุมานสำหรับปัญหาบนโทรศัพท์ทั้งสองเครื่อง; ยังไม่มี device log หรือ authenticated upload เพื่อยืนยันว่าไม่มีปัญหาอื่นร่วมด้วย

## หลักฐานที่ตรวจ

- Worktree: `/home/tmk/project/market-place-mobile-app/worktrees/e-ui-preview`
- Branch/head: `claude/certificate-qr-2026-10-03` / `d41720ae831afa5461fd839492aa83a9e046815f`
- APK build 1 อ้างอิง commit `26a7628ddb98f156c7ad7cc7d66ed72bb64cba3a`; `image-upload-service.ts` และ `pick-product-image.ts` ไม่มี diff ระหว่าง commit นี้กับ HEAD
- Dependency ที่ติดตั้ง: Expo `57.0.21`, React Native `0.86.3`, expo-file-system `57.0.6`
- ตรวจ bundle ใน APK พบข้อความ serializer error, ข้อความไทย และเส้นทาง `/products/images/upload` โดยไม่แสดงค่า configuration หรือ secrets
- Render `GET /health`: HTTP 200, `{"status":"ok"}` (ประมาณ 0.14 วินาที)
- Render `POST /products/images/upload` แบบไม่มี Authorization: HTTP 401, `AUTH_REQUIRED` (ประมาณ 0.13 วินาที) ยืนยันการเข้าถึงเส้นทางและขั้นตรวจสิทธิ์เท่านั้น ไม่ใช่หลักฐานว่า Storage/authenticated upload ผ่าน; ไม่ได้บันทึกข้อมูลหรือรูปใน DB/Storage ทีม
- [F-UPLOAD-REPRO.mjs](F-UPLOAD-REPRO.mjs) โหลด `installFormDataPatch` และ `convertFormDataAsync` จาก Expo ที่ติดตั้งจริง โดยจำลองเฉพาะ container ของ RN FormData และไฟล์ที่มี bytes; ไม่เปิด native runtime หรือส่ง HTTP
  - URI object เดิม: serializer ล้มด้วย `Unsupported FormDataPart implementation`
  - เรียก upload service จริงด้วย serializer นี้: ได้ข้อความไทยเดียวกับผู้ใช้ ก่อน HTTP transport จำนวน HTTP request = 0
  - รูปแบบไฟล์ที่มี `bytes()`: serializer สร้าง filename, MIME type และ binary payload ได้
- ชุดทดสอบเดิม `product-service.test.mjs` + `product-form.test.mjs`: **32/32 ผ่าน** ชุดนี้ไม่ได้ทดสอบ multipart serializer ของ Expo จึงไม่ป้องกันปัญหานี้

## วิธีแก้ที่แนะนำ

แก้เฉพาะการส่งไฟล์รูปของสินค้าให้เป็น `File` ของ `expo-file-system` ซึ่งรองรับ `bytes()`/`arrayBuffer()` และทำงานกับ `expo/fetch` แทน URI object เดิม รักษาทาง Web ที่ใช้ `asset.file` อยู่แล้ว และไม่กำหนด multipart boundary เอง

ส่วนสำคัญของ replacement ในแขนง `else if (fileInput?.uri)` ของ `image-upload-service.ts` (โค้ดจริงมีการตรวจไฟล์และแปลง error):

```ts
const { File }: typeof import('expo-file-system') = require('expo-file-system');
formData.append('file', new File(fileInput.uri));
```

ต้องประกาศ `expo-file-system` เป็น direct dependency ใน `mobile/package.json`/lockfile ให้ตรง SDK 57 (ปัจจุบันติดตั้ง `57.0.6` ผ่าน dependency ของ Expo อยู่แล้ว) และตรวจชนิดไฟล์/ชื่อที่ส่งให้ backend รวมถึงกรณีอ่าน local file ไม่ได้ให้เป็น error ที่ตรงสาเหตุ การอ่าน native file จริงยังไม่ได้ทดสอบด้วย reproducer นี้

เพิ่ม regression ที่ใช้ Expo serializer จริงกับ file part หลังแก้ แล้วตรวจ upload success/timeout/cancel/error และ Web ให้ครบก่อนสร้าง APK ใหม่ ข้อผิดพลาดนี้ไม่ต้องเปลี่ยน API contract หรือ migration; การยืนยันว่า Storage ทีมพร้อมยังต้องใช้การทดสอบที่ได้รับอนุญาตบน APK จริง

ทางเลือกชั่วคราวตามเอกสาร Expo คือ `EXPO_PUBLIC_USE_RN_FETCH=1` แต่จะเปลี่ยน fetch ของทั้งแอป จึงแนะนำแก้รูปแบบไฟล์เฉพาะจุดก่อน; ทั้งสองทางต้องให้ APK ใหม่มีโค้ด/การตั้งค่าที่แก้แล้ว

## การยืนยันหลังแก้

1. สร้าง APK candidate ใหม่และผูก source SHA/hash กับ manifest
2. Galaxy A02s และเครื่องเพื่อนเลือกรูป JPEG/PNG ที่รองรับ ตรวจ upload, ลงขาย, เปิดรายละเอียดและเปิดแก้ไขกลับมา
3. ตรวจ expired session, รูปเกิน 5 MiB, request ล้มเหลว, retry และข้อมูลฟอร์มไม่หาย
4. ยืนยันผลด้วย HTTP status/error code/request_id ที่ปกปิด credentials; ไม่อ่านหรือแสดงค่า `.env`

สถานะก่อนแพตช์เป็นการตรวจสาเหตุเท่านั้น; ปัจจุบันแก้ source อัปโหลดสินค้าในเครื่องแล้วตามส่วนผลแก้ด้านบน ยังไม่มี push, deploy, เปิด Cron หรือแก้ DB/Storage ทีม และไม่บันทึก device PASS

## คำสั่งทำซ้ำในเครื่อง

รันจาก worktree root โดยไม่โหลด `.env`:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON doc/submission-2026-10-08/reports/F-UPLOAD-REPRO.mjs
```

## แหล่งอ้างอิงหลัก

- [Expo SDK 57: global fetch และ flag สำหรับ RN fetch](https://docs.expo.dev/versions/v57.0.0/sdk/expo/#expofetch-api)
- [Expo SDK 57: multipart converter](https://github.com/expo/expo/blob/sdk-57/packages/expo/src/winter/fetch/convertFormData.ts)
- [ตัวอย่างอัปโหลดไฟล์ของ Expo ด้วย File](https://github.com/expo/image-upload-example/blob/master/README.md#snippets)

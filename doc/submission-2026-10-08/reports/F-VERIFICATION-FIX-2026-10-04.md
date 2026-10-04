# F — แก้ส่งยืนยันตัวตนหน้าขอเปิดร้าน

วันที่: 4 ตุลาคม 2026 (Asia/Bangkok)

สถานะ: **PATCHED_LOCAL — แก้ source และตรวจในเครื่องแล้ว ยังไม่ได้สร้าง APK ใหม่หรือทดสอบกับ API/Storage ทีมด้วยบัญชีจริง**

Worktree: `/home/tmk/project/market-place-mobile-app/worktrees/e-ui-preview`

Branch: `claude/certificate-qr-2026-10-03` · HEAD ก่อนแพตช์: `d41720ae831afa5461fd839492aa83a9e046815f` · แพตช์อยู่ใน working tree

## สาเหตุและผลแก้

บริการยืนยันตัวตนเดิมแนบรูปบัตร native เป็น `{ uri, name, type }` ซึ่ง Expo SDK 57 global fetch แปลงเป็น multipart ไม่ได้ จึงเกิด `network-error` ก่อนส่ง HTTP เป็นข้อผิดพลาดเดียวกับการอัปโหลดรูปสินค้า ไม่มี device log ของอาการหน้าขอเปิดร้าน จึงยังไม่ยืนยันว่าเป็นสาเหตุเดียวของทุกกรณีบนโทรศัพท์

- `mobile/src/services/verification-service.ts` ใช้ `File` ของ `expo-file-system` เพื่อให้ serializer อ่าน bytes ได้ โหลดโมดูลเฉพาะแขนง native; Web ยังส่ง File จาก picker
- ถ้าไฟล์หายหรือเปิดไม่ได้ ส่ง `validation-error` พร้อม `id_card_image: อ่านรูปบัตรไม่สำเร็จ กรุณาเลือกรูปใหม่` กลับเข้าช่องรูปบัตรผ่าน store เดิม ข้อมูลที่กรอกยังอยู่และเลือกรูปใหม่เพื่อส่งอีกครั้งได้
- ตรวจ AbortSignal ก่อนอ่านไฟล์และก่อน fetch กันส่งคำขอที่ถูกยกเลิก โดยเฉพาะกรณีเปลี่ยนบัญชีระหว่างรอ token
- ชื่อช่อง multipart และ Authorization header คงตาม API contract ให้ fetch สร้าง Content-Type/boundary เอง ไม่มีการเปลี่ยน backend, migration หรือบทบาทบัญชี
- ใช้ direct dependency `expo-file-system ~57.0.6` ที่เพิ่มจากแพตช์อัปโหลดสินค้า ไม่เพิ่ม dependency อื่น

## การตรวจในเครื่อง

| การตรวจ | ผล |
|---|---|
| Regression ก่อนแก้ ใช้ Expo multipart serializer จริง | native JPG/PNG/WEBP ล้มด้วย `network-error`; 6 tests ล้มและ Web 1 test ผ่าน |
| Regression หลังแก้ `component-tests/verification-service.test.tsx` | 7/7 ผ่าน: ไฟล์ native 3 ชนิด, Web, ไฟล์หาย/เลือกรูปใหม่/ส่งซ้ำ, ยกเลิกคำขอ, เปลี่ยนบัญชีระหว่างรอ token |
| Component verification service + seller screen + product uploader | 30/30 ผ่าน รวมการแสดง error รูปบัตรและการคงข้อมูลฟอร์ม |
| Logic verification service/form/store | 46/46 ผ่าน รวม response PENDING, ต่ออายุ token, validation, conflict และ stale response |
| TypeScript | ผ่าน |
| ESLint ไฟล์บริการและ tests ที่แก้ | 0 errors; 1 warning ที่ `require()` ใน mock ของ seller screen บรรทัดเดิม |
| Historical offline reproducer | ผ่านทั้งบริการอัปโหลดสินค้าและยืนยันตัวตนที่ commit ก่อนแพตช์; HTTP request = 0 |
| Android Hermes export | ผ่าน 2,151 modules, bundle ประมาณ 6.2 MB ที่ `/tmp/2ndhand-f-verification-20261004-android` |
| `git diff --check` | ผ่าน |

Native tests ใช้ File/filesystem mock ที่มากับ Expo และ multipart converter จริง ตรวจชื่อช่อง, filename, MIME, binary และ Authorization; คำตอบ PENDING เป็น response จำลอง ไม่มีการบันทึกคำขอใน DB ทีม ชุด screen มีคำเตือน `act(...)` จาก WondeeLoader แต่ tests ผ่านและไม่ได้ suppress คำเตือน

ทุกคำสั่ง Expo/Jest/lint ใช้ `EXPO_NO_DOTENV=1` เพื่อข้าม `.env` ไม่มีการอ่าน/แสดงค่า secrets, push, deploy, ตั้ง Cron หรือเขียน DB/Storage ทีม

## คำสั่งตรวจซ้ำ

จาก `mobile`:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/verification-service.test.mjs tests/verification-form.test.mjs tests/verification-store.test.mjs
EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 npx --no-install jest --runInBand component-tests/verification-service.test.tsx component-tests/seller-verification-screen.test.tsx component-tests/image-upload-service.test.tsx
EXPO_NO_DOTENV=1 npm run typecheck
EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 npx --no-install eslint src/services/verification-service.ts component-tests/verification-service.test.tsx component-tests/seller-verification-screen.test.tsx
EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 npx --no-install expo export --platform android --output-dir /tmp/2ndhand-f-verification-20261004-android
```

จาก worktree root:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON doc/submission-2026-10-08/reports/F-UPLOAD-REPRO.mjs
git diff --check
```

## Gate ที่เหลือก่อนปิดงาน

1. สร้าง APK candidate ใหม่และบันทึก source/hash ให้ตรงแพตช์นี้ APK build 1 ยังมีโค้ดเดิมและ Android export ไม่ใช่ APK
2. ทดสอบ Galaxy A02s/เครื่องเพื่อนด้วยบัญชีทดสอบและข้อมูลที่ได้รับอนุญาต: กรอกข้อมูลร้าน/ธนาคาร แนบรูปที่รองรับ ส่งแล้วเห็น “รอตรวจสอบ” ปิด/เปิดหน้าใหม่แล้วคำขอยังอยู่ พร้อมตรวจ private Storage
3. ตรวจเลือกรูปใหม่หลัง validation, รูปเกิน 5 MB, network failure/retry, สลับบัญชี และการอนุมัติตาม A6–A8/Q02 ใน QA ของเพื่อน บันทึกผลกับ APK candidate เดียว

การ push, deploy/ตั้ง Render หรือเขียน DB ทีมต้องได้รับอนุญาตก่อนตามกฎผู้ใช้ ยังไม่บันทึก device/API acceptance เป็น PASS

## อ้างอิง

- [Expo SDK 57 global fetch](https://docs.expo.dev/versions/v57.0.0/sdk/expo/#expofetch-api)
- [Expo SDK 57 multipart converter](https://github.com/expo/expo/blob/sdk-57/packages/expo/src/winter/fetch/convertFormData.ts)
- [ตัวอย่าง File upload ของ Expo](https://github.com/expo/image-upload-example/blob/master/README.md#snippets)
- [คิวงาน F](../coordination/F-WORK-QUEUE.md)

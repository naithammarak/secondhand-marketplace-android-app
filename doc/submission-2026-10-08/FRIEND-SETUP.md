# ติดตั้งหลัง clone — สำหรับเพื่อนรับงาน Codex

**Source branch:** `codex/friend-handoff-2026-10-01` · **ฐาน:** PR #116 (`codex/project-review-2026-09-30`)

Branch นี้มี source app ทั้งชุดที่แชร์ไว้ใน PR #116 และ submission task pack ปัจจุบัน เปิดเป็น Draft สำหรับรับงานต่อ ไม่ใช่ release ที่ผ่าน Android/FINISH acceptance แล้ว เมื่อ A ส่ง integration/schema commit ใหม่ให้รับ upstream นั้นก่อนเริ่ม task ที่พึ่งมัน

## 1. List ที่ต้องติดตั้ง/รับจาก Lead

| รายการ | ใครต้องมี | รายละเอียด |
|---|---|---|
| Git | ทุกคน | clone/branch/commit และรับ upstream จาก A |
| Node.js + npm | ผู้แก้ mobile หรือรันทั้งระบบ | แนะนำ Node 24.x ตั้งแต่ 24.3.0; เครื่องต้นทาง 24.20.0. Expo SDK57 ต้องการ Node อย่างน้อย 22.13.x |
| Python + pip + venv | backend/full stack | ใช้ Python 3.14.x ให้ตรงเครื่องต้นทางที่ตรวจ: 3.14.7; ติดตั้งตาม `backend/requirements.txt` |
| Database dev/test | backend/full stack | Lead เตรียม dev DB ที่มี schema หรือใช้ PostgreSQL local แยกของตน; DB สำหรับ migration/race tests ต้องเป็น disposable isolated target ตาม task |
| `.env` สำหรับ dev/test | ตามงาน | mobile ต้องใช้ public Supabase config และ API URL; backend ต้องใช้ DB/Auth/Storage config ผ่านช่องทางส่วนตัว |
| API ที่เข้าถึงได้ | ผู้ทำ frontend | ถ้าไม่รัน backend เอง ให้ Lead ส่ง URL ของ dev API ที่ใช้งานได้ |
| Android Studio/SDK + JDK | เฉพาะผู้ build Android local ชุด F | ไม่จำเป็นต่อ backend หรือ Expo Web; ตรวจเวอร์ชันจาก task12/Expo57 ก่อนติดตั้ง toolchain |
| โทรศัพท์ Android + adb | ชุด F/QA | ใช้กับ native tests/ติดตั้งจริง; Google account และสิทธิ์บริการเป็นของ tester จริง |

Expo CLI ใช้จาก dependencies ใน repo ไม่ต้องติดตั้ง `expo-cli` global หรือสร้าง Expo project ใหม่ [ข้อกำหนด Expo57](https://docs.expo.dev/versions/v57.0.0/) เป็นแหล่งอ้างอิงที่ `mobile/AGENTS.md` กำหนดให้อ่านก่อนเขียนโค้ด

## 2. โหลด source และเลือกชุดงาน

```bash
git clone --branch codex/friend-handoff-2026-10-01 https://github.com/naithammarak/secondhand-marketplace-android-app.git
cd secondhand-marketplace-android-app
git rev-parse HEAD
```

ตรวจ SHA กับที่ Lead ส่งให้ แล้วสร้าง branch สำหรับชุดงานของตนจาก upstream ที่ task ต้องใช้ ให้แต่ละคนใช้ checkout ของตน ถ้า A/02 หรือ B/04 ยังไม่ส่งมา ให้เตรียม fixtures/tests/interfaces ที่เป็นอิสระและรับ upstream ก่อนพิสูจน์ integration

อ่าน [work-packages/README](work-packages/README.md) แล้วคัดลอก **Prompt สำหรับ Codex** จากไฟล์ชุด B/C/D ที่ได้รับ เอกสารและ source อยู่ใน branch นี้แล้ว ไม่ต้องโหลด ZIP เอกสารแยกซ้ำ

## 3. Backend dependencies

### Linux/macOS — เริ่มจาก root repo

```bash
cd backend
python3 --version
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

ถ้า `python3` ไม่ใช่ Python 3.14 ให้เลือก executable ของ Python3.14 ที่ติดตั้งไว้ตอนสร้าง venv ไม่ต้องย้าย `.venv` จากเครื่อง Lead

### Windows PowerShell — เริ่มจาก root repo

```powershell
cd backend
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

ใช้ Python ของ venv โดยตรงได้ ไม่ต้องเปลี่ยน PowerShell execution policy เพื่อ activate

## 4. Frontend dependencies — เริ่มจาก root repo

```bash
cd mobile
node --version
npm --version
npm ci
```

`npm ci` ใช้ `package-lock.json` ที่แชร์มา ถ้าติดตั้งไม่ผ่าน ให้ Codex ตรวจเวอร์ชัน/ข้อผิดพลาดและรักษา lockfile เดิม ไม่แก้ด้วยการลบ lockfile หรืออัปเกรด packages ทั้งชุดโดยอัตโนมัติ ไม่ต้องส่ง `node_modules` ให้กัน

## 5. Configuration

สร้างไฟล์เฉพาะเมื่อยังไม่มี `.env` ของตน:

**Linux/macOS — จาก root repo**

```bash
cp -n backend/.env.example backend/.env
cp -n mobile/.env.example mobile/.env
```

**Windows PowerShell — จาก root repo**

```powershell
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (-not (Test-Path mobile/.env)) { Copy-Item mobile/.env.example mobile/.env }
```

### Backend

- `DATABASE_URL`: dev DB หรือ local isolated DB ที่รับผิดชอบ ไม่ชี้ shared target เพื่อรัน destructive migration tests
- `PUBLIC_CERTIFICATE_BASE_URL`: **HTTPS origin** เช่น origin ของ dev API ที่ Lead เตรียม; startup ตรวจค่านี้ แม้เปิด API HTTP สำหรับ local development
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` และ Auth/Storage settings: รับค่า dev/test จาก Lead โดย private channel; seller verification storage ยังต้องใช้ service-role setting ตาม implementation ปัจจุบัน
- `SUPABASE_SECRET_KEY`/JWT algorithm/issuer/legacy secret: ตั้งให้ตรง Supabase test project และ signing configuration ที่ใช้อยู่ ไม่เดาค่าหรือส่ง secret ไป mobile
- `APP_ENV=development` และ `PAYMENT_SIMULATION_ENABLED=true` เฉพาะ dev/test ที่ต้องทดสอบชำระจำลอง

หากมีเพียง local startup smoke ยังไม่มี public origin สามารถใช้ `https://cert.example.test` เป็น placeholder สำหรับ startup validation เท่านั้น ลิงก์ QR ที่สร้างจากค่านี้ใช้งานภายนอกไม่ได้ และ public QR acceptance ยังเป็น PENDING จนเปลี่ยนเป็น origin ที่เข้าถึงได้จริง

### Mobile

- `EXPO_PUBLIC_SUPABASE_URL` และ `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: public config ของ test project
- `EXPO_PUBLIC_API_BASE_URL`: URL API จริง; browser บนเครื่องเดียวกันใช้ `http://127.0.0.1:8001` ได้
- `EXPO_PUBLIC_PRODUCT_CATALOG_ENV=development`, `EXPO_PUBLIC_PRODUCT_CATALOG_MODE=api`, `EXPO_PUBLIC_PRODUCT_MOCK_MODE=false`
- บนโทรศัพท์ `127.0.0.1` คือโทรศัพท์เอง ให้ใช้ LAN IP ของคอมที่เข้าถึงได้หรือ API origin ที่ Lead เตรียม
- หากมี `mobile/.env.local` อยู่แล้ว ให้ตรวจค่าในนั้นด้วย เพราะอาจ override `.env`

ไฟล์ `.env` อยู่เฉพาะเครื่อง ไม่ commit/แนบ PR; mobile `EXPO_PUBLIC_*` ต้องไม่มี service-role key, database password, JWT secret หรือ session token

## 6. Database schema

จาก `backend` ใช้ Python ของ venv:

```bash
.venv/bin/python -m alembic heads
.venv/bin/python -m alembic current
```

บน Windows เปลี่ยน `.venv/bin/python` เป็น `.\.venv\Scripts\python.exe` ต้องมี head เดียวตาม base ที่ A ส่งมอบ

สำหรับ **DB local/dev ใหม่ที่ตนเป็นเจ้าของและตั้ง `DATABASE_URL` ถูกต้องแล้ว** ให้ apply:

```bash
.venv/bin/python -m alembic upgrade head
```

DB shared ที่ Lead เตรียม schema แล้วให้ตรวจ revision และส่งผลให้ A; การเปลี่ยน schema ของ shared target ใช้ migration owner ตามแผน ไม่ให้ทุกคนรัน upgrade/reset/stamp แข่งกัน ไม่ seed ตัวอย่างเข้า shared catalog

Integration/migration tests ใช้ env/ชื่อ DB ที่แต่ละ task กำหนด หลาย tests มีการ reset schema ภายใน isolated target: ห้ามตั้ง test URL เป็น DB ที่ใช้เดโมหรือ shared Supabase [คู่มือ DB/test accounts เดิม](../../backend/test-data/README.md) อธิบาย local roles และ fixture guards; กติกา scope ปัจจุบันใช้ DOC-01 ของแพ็กนี้

## 7. เปิด server

**Terminal 1 — จาก `backend` บน Linux/macOS**

```bash
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Windows ใช้ `.\.venv\Scripts\python.exe` แทน หากทดสอบโทรศัพท์ผ่าน LAN ให้ตั้ง `--host 0.0.0.0`, ใช้ IP ของคอมใน mobile config และตรวจว่าการเชื่อมต่อผ่าน firewall ได้

ตรวจ API ที่ [http://127.0.0.1:8001/health](http://127.0.0.1:8001/health) และ Swagger ที่ [http://127.0.0.1:8001/docs](http://127.0.0.1:8001/docs) `/health` ยืนยัน process; ไม่ได้ยืนยัน DB/Auth/Storage พร้อมทั้งหมด

**Terminal 2 — จาก `mobile`**

```bash
npm run web:live -- --port 8766
```

เปิด [http://127.0.0.1:8766](http://127.0.0.1:8766) คำสั่งนี้ตรวจ public API/Supabase config และบังคับ API catalog mode

Native Android ใช้ขั้นตอน build/dev client ใน [task12](tasks/12-APK-01-android.md) โปรเจกต์มี native Google Sign-In; Expo Web/Expo Go อย่างเดียวไม่ใช่หลักฐาน native Google login ผ่าน

## 8. Checks ก่อนเริ่ม/ส่งงาน

จาก `mobile`:

```bash
npm run typecheck
npm run test:logic
```

จาก `backend`:

```bash
.venv/bin/python -m pytest tests/test_certificate_urls.py tests/test_certificate_public_page.py -q
```

จาก root repo:

```bash
git status --short
git ls-files -- backend/.env mobile/.env mobile/.env.local
```

คำสั่งสุดท้ายต้องไม่แสดงไฟล์ secret ที่ถูก tracked เลือก tests ที่ตรงกับงานจาก task prompt เพิ่ม และแยก baseline failure ออกจาก failure ที่แก้ไขเอง ส่ง commit/patch + report + upstream SHA ให้ A ตาม [คู่มือส่งกลับ](work-packages/README.md)

## สิ่งที่ส่งให้เพื่อนครบชุด

1. Branch/SHA และชื่อชุดงาน
2. Configuration dev/test ผ่าน private channel แยก backend/mobile เท่าที่ต้องใช้
3. Upstream จาก A/02 สำหรับ B/C; upstream B/04 เพิ่มสำหรับ reviews
4. URL dev API/Storage/Auth และบัญชี tester ที่ได้รับอนุญาตเมื่อถึง integration

PR นี้จัด source และเอกสารสำหรับทำต่อ Payment/payout/refund เป็นการจำลอง; FINISH/profile/reviews/revoke ที่แพ็กกำหนดยังต้อง implement และผ่าน gates ตามรายงานจริง

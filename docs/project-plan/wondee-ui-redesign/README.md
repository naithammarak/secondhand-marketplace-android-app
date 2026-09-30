# Wondee UI/UX redesign — AI implementation handoff

จัดทำ 27 กันยายน 2026 · บทบาท Lead/planner · เอกสารสำหรับ session Astra / Extra high (`xhigh`)

เริ่มอ่าน [ui_ux_production_spec.md](ui_ux_production_spec.md) แล้วใช้ [AI_IMPLEMENTATION_PROMPT.md](AI_IMPLEMENTATION_PROMPT.md) ส่งให้ session ลงมือ อ่าน [QA_ACCEPTANCE.md](QA_ACCEPTANCE.md) เป็นเกณฑ์ส่งงาน และ [SOURCE_AUDIT.md](SOURCE_AUDIT.md) เพื่อทราบฐานโค้ดและที่มาของข้อเลือก ผลตรวจชุดเอกสารอยู่ใน [VALIDATION.md](VALIDATION.md)

ชุดนี้เป็น **spec ฉบับเรียบเรียงใหม่สำหรับ repository จริง** ไม่ใช่ไฟล์ต้นฉบับที่ผู้ใช้เรียกชื่อ `ui_ux_production_spec.md` ซึ่งยังหาไม่พบในพื้นที่ที่ตรวจ ณ เวลาวางแผน ต้นทางที่อ่านได้คือ `/home/tmk/Downloads/wondee-mobile-prototype/DESIGN_SPEC.md` และ HTML ในโฟลเดอร์เดียวกัน สำเนาที่ไม่แก้ไขอยู่ใน [reference](reference/) ผู้ใช้ให้ทำต่อหลังแจ้งที่มานี้ จึงจัดชุดส่งต่อจากแหล่งที่มีโดยไม่ค้างรอไฟล์อีกชื่อ

ขอบเขตตั้งต้น: UI ใหม่ทุกหน้าที่เกี่ยวข้อง + backend ที่จำเป็นต่อ UX เปิดร้าน/ซื้อของหลังเป็น Seller; งาน INSPECT/CERT/FINISH ที่มีเจ้าของอยู่แล้วให้ใช้ implementation จริงเมื่อผ่าน dependency gate การเตรียมหน้าจอด้วย fixture ไม่ใช่การปิด feature นั้น

ไฟล์ชุดนี้อยู่ **นอก Git repository ของแอป**. Repository จริงคือ `/home/tmk/project/market-place-mobile-app/secondhand-marketplace-android-app`. ส่ง absolute path ของ prompt ให้ AI ด้วย; หากย้ายเครื่องต้องส่งทั้งโฟลเดอร์นี้พร้อม `docs/project-plan/` ที่อ้างถึง หรือบรรจุเอกสารที่จำเป็นลง repository หลังตรวจว่าไม่มีข้อมูลส่วนตัว

การวางแผนครั้งนี้ไม่ได้แก้ source code ของแอป, migrate ฐานข้อมูล, publish issue/PR หรือเริ่ม session ใหม่

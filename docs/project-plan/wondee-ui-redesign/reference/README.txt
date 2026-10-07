================================================================================
   WONDEE SECONDHAND MARKETPLACE - UX/UI INTERACTIVE PROTOTYPE & DESIGN SYSTEM
================================================================================

✨ วิธีการเปิดใช้งาน (สำหรับผู้ตรวจและทีมงาน):
--------------------------------------------------------------------------------
1. แตกไฟล์ ZIP ออกมาเป็นโฟลเดอร์ (หากได้รับไฟล์เป็น .zip)
2. ดับเบิ้ลคลิกไฟล์ "index.html" เพื่อเปิดดูใน Web Browser ได้ทันที!
   (รองรับ Google Chrome, Microsoft Edge, Safari, Firefox, Brave)
3. โฟลเดอร์นี้มีไฟล์ CSS และ JS ในตัว (Offline-ready 100%) ไม่ต้องต่ออินเทอร์เน็ตก็แสดงผลสวยงาม คมชัด ไม่เพี้ยน

--------------------------------------------------------------------------------
📂 โครงสร้างและรายละเอียดไฟล์ในชุดนี้:
--------------------------------------------------------------------------------
• index.html
  - หน้าจอ Interactive Prototype จำลองแอป Wondee เต็มรูปแบบ
  - รองรับการสลับมุมมองทั้ง 7 ฟีเจอร์:
    1. หน้าหลัก (Home Feed & Inspection Banner)
    2. หน้ารายละเอียดสินค้า & ตรวจสอบสภาพ (Product Detail & Inspection Card)
    3. แดชบอร์ดตรวจสอบสภาพสินค้า (Inspection Status Dashboard)
    4. รายงานผลการตรวจสอบละเอียด (Detailed Inspection Report พร้อมภาพหลักฐาน)
    5. สรุปคำสั่งซื้อและบริการตรวจเช็ค (Checkout & Payment Flow)
    6. คลังผลการตรวจ & ประวัติ (My Inspections Repository)
    7. โค้ดตัวอย่าง Mobile App (React Native Example Screen)
  - แถบควบคุมด้านล่าง (Interactive Controls):
    • Switch Dark Mode / Light Mode
    • Switch Seller View / Buyer View
    • Reset Mock State
  - แท็บนำทางด้านล่าง (Bottom Navigation):
    • หน้าหลัก (Home)
    • หมวดหมู่ (Categories)
    • ตรวจสภาพ (Inspect)
    • แจ้งเตือน (Notifications)
    • ฉัน (Me) -> ไอคอน Mascot สองขาตัวการ์ตูนสุดน่ารัก พร้อมอนิเมชันกระพริบตา (Blinking Eye Animation)

• mascot_showcase.html
  - หน้าแสดงตัว Mascot ดีไซน์เรขาคณิตโมเดิร์น (Minimalist Geometric Mascot)
  - พัฒนาต่อยอดจากเอกลักษณ์โลโก้ Wondee (วงแหวนสีเขียว Emerald + ใบไม้ Teal สองใบ)
  - มาพร้อมกิริยาท่าทางทั้ง 4 แอ็กชัน (Default Stand, Inspecting Magnifier, Guarantee Badge, Happy Thumbs-up)

• tailwind.css
  - ไฟล์ Precompiled CSS แบบสมบูรณ์ รองรับการทำงาน Offline แบบ 100% 
  - ป้องกันปัญหาไอคอนขยายใหญ่ หรือหน้าจอเพี้ยนเมื่อเปิดผ่านเครื่องคอมพิวเตอร์ที่ไม่มีการเชื่อมต่อภายนอก

• tailwindcss.min.js
  - ชุดสคริปต์ Tailwind Engine ในเครื่องสำหรับกรณีสำรอง

• DESIGN_SPEC.md
  - เอกสารสรุปการออกแบบ UI/UX Redesign & Design Token ละเอียดครบถ้วน
  - สเปกสี (Color Palette), Contrast Ratios (WCAG AAA), Typography, Animation Curves

--------------------------------------------------------------------------------
จัดทำโดยทีมพัฒนาระบบ Wondee UX/UI Redesign
================================================================================

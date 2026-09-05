import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base

# โหลดค่าจากไฟล์ .env
load_dotenv()

# ดึงค่า DATABASE_URL จากไฟล์ .env
DATABASE_URL = os.getenv("DATABASE_URL")

# สำหรับ Supabase ที่ใช้ psycopg v3 ต้องแปลงรูปแบบให้รองรับกับ asyncpg (ถ้าจำเป็น) 
# แต่เบื้องต้นใช้ค่าจาก .env ตรงๆ ได้เลยครับตามที่เพื่อนตั้งค่ามา
engine = create_async_engine(DATABASE_URL, echo=True)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
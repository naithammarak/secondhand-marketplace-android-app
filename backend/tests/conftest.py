from pathlib import Path
import os
from dotenv import load_dotenv

# Load .env first if present
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# Safe JWT fallbacks for test execution if not set
if not os.getenv("SUPABASE_JWT_SECRET"):
    os.environ["SUPABASE_JWT_SECRET"] = "test-secret-key-for-jwt-testing-12345678901234567890"
if not os.getenv("SUPABASE_JWT_AUDIENCE"):
    os.environ["SUPABASE_JWT_AUDIENCE"] = "authenticated"
if not os.getenv("SUPABASE_JWT_ISSUER"):
    os.environ["SUPABASE_JWT_ISSUER"] = "https://example-project.supabase.co/auth/v1"
if not os.getenv("SUPABASE_JWT_ALGORITHM"):
    os.environ["SUPABASE_JWT_ALGORITHM"] = "HS256"

import json
from pathlib import Path


EXAMPLE_FILE = Path(__file__).parents[1] / "test-data" / (
    "login-role-assignments.example.json"
)
GITIGNORE_FILE = Path(__file__).parents[2] / ".gitignore"


def test_example_login_role_roster_is_synthetic_and_complete():
    entries = json.loads(EXAMPLE_FILE.read_text(encoding="utf-8"))

    assert entries == [
        {
            "alias": "demo-buyer",
            "supabase_user_id": "00000000-0000-4000-8000-000000000001",
            "role": "BUYER",
        },
        {
            "alias": "demo-seller",
            "supabase_user_id": "00000000-0000-4000-8000-000000000002",
            "role": "SELLER",
        },
        {
            "alias": "demo-admin",
            "supabase_user_id": "00000000-0000-4000-8000-000000000003",
            "role": "ADMIN",
        },
        {
            "alias": "demo-inspector",
            "supabase_user_id": "00000000-0000-4000-8000-000000000004",
            "role": "INSPECTOR",
        },
    ]

    assert {entry["role"] for entry in entries} == {
        "BUYER",
        "SELLER",
        "ADMIN",
        "INSPECTOR",
    }
    assert all(entry["alias"].startswith("demo-") for entry in entries)
    assert all(
        entry["supabase_user_id"].startswith("00000000-") for entry in entries
    )
    assert all("email" not in entry for entry in entries)

    assert "/backend/test-data/login-role-assignments.local.json" in (
        GITIGNORE_FILE.read_text(encoding="utf-8").splitlines()
    )

#!/usr/bin/env python3
"""Start the explicit read-only catalog app using a private env file."""

import argparse
import os
from pathlib import Path
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", required=True, type=Path)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8765, type=int)
    return parser.parse_args()


def load_catalog_environment(env_path: Path) -> None:
    from dotenv import dotenv_values

    if not env_path.is_file():
        raise SystemExit("The supplied catalog environment file does not exist.")

    parsed = dotenv_values(env_path)
    required = ("DATABASE_URL", "SUPABASE_URL")
    missing = [key for key in required if not parsed.get(key)]
    storage_key = next(
        (key for key in ("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY") if parsed.get(key)),
        None,
    )
    if storage_key is None:
        missing.append("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY")
    if missing:
        raise SystemExit(
            "The supplied environment file is missing required catalog settings: "
            + ", ".join(missing)
        )

    # Disable implicit loading of the worktree's backend/.env. Only the three
    # values needed for database reads and Storage URL signing enter this mode.
    os.environ["PYTHON_DOTENV_DISABLED"] = "true"
    for key in ("DATABASE_URL", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
        os.environ.pop(key, None)
    for key in (*required, storage_key):
        os.environ[key] = str(parsed[key])


def main() -> None:
    args = parse_args()
    load_catalog_environment(args.env_file.expanduser().resolve())

    import uvicorn

    uvicorn.run(
        "app.catalog_main:app",
        host=args.host,
        port=args.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()

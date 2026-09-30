#!/usr/bin/env python3
"""Launch buyer orders explicitly; does not migrate, seed or simulate payment."""
import os

from run_catalog_only import load_catalog_environment, parse_args


def main():
    from dotenv import dotenv_values
    args = parse_args()
    path = args.env_file.expanduser().resolve()
    parsed = dotenv_values(path)
    load_catalog_environment(path)
    keys = ("SUPABASE_JWT_SECRET", "SUPABASE_JWT_ISSUER", "SUPABASE_JWT_ALGORITHM",
            "SUPABASE_JWT_AUDIENCE", "SUPABASE_PROJECT_REF")
    for key in keys:
        os.environ.pop(key, None)
        if parsed.get(key):
            os.environ[key] = str(parsed[key])
    os.environ["PAYMENT_SIMULATION_ENABLED"] = "false"
    import uvicorn
    uvicorn.run("app.buyer_main:app", host=args.host, port=args.port)


if __name__ == "__main__":
    main()

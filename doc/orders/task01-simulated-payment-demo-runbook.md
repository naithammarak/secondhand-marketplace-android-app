# TASK-01 simulated payment demo runbook

This runbook starts the API from the TASK-01 checkout and uses a disposable, local PostgreSQL database. Payment simulation is enabled only by `backend/scripts/task01_demo.py`; the backend default remains closed and production/prod remains blocked.

The QR drawing in checkout is non-scannable illustration. It is not a PromptPay or bank QR, and no real money moves. The reserved HTTPS `.test` certificate origin below only passes local configuration validation; it does not prove that certificate links or QR payment work outside this isolated test.

## 1. Create a new isolated database

Use a fresh container name and port that are not already in use. Do not point this demo at the application `.env`, a team database, or an existing test container. The launcher accepts only PostgreSQL on loopback, a database name containing `task01` and `test`, and a target different from the configured application database.

Example with Podman, binding PostgreSQL only to localhost:

```sh
podman run --detach \
  --name task01-simulated-payment-test \
  --publish 127.0.0.1:55441:5432 \
  --env POSTGRES_DB=task01_payment_test \
  --env POSTGRES_USER=postgres \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  docker.io/library/postgres:16-alpine

podman exec task01-simulated-payment-test pg_isready -U postgres -d task01_payment_test
```

`trust` is limited to this disposable container whose port is bound to loopback. Choose another unique local port if `55441` is occupied.

## 2. Migrate and start the matching API

Run from this checkout's `backend` directory with its Python environment active. The shell variable takes precedence over `.env` for migration. Unset `DATABASE_URL` before launching: the launcher refuses the same target in both the task-specific and application settings.

```sh
export TASK01_DEMO_DATABASE_URL='postgresql+psycopg://postgres@127.0.0.1:55441/task01_payment_test'
export DATABASE_URL="$TASK01_DEMO_DATABASE_URL"
python -m alembic upgrade head
unset DATABASE_URL
python scripts/task01_demo.py --host 127.0.0.1 --port 8765
```

The launcher sets `APP_ENV=demo`, explicitly enables simulation, and supplies `https://certificate.task01.test` unless another HTTPS `.test` origin is configured with `TASK01_DEMO_CERTIFICATE_ORIGIN`. It prints no database URL or auth secret. `backend/app/services/certificate_urls.py` still performs the required HTTPS origin validation during startup.

Check the local health endpoint in another terminal:

```sh
curl --fail --silent http://127.0.0.1:8765/health
```

The launcher does not change authentication settings. To use a signed-in mobile account, configure the API with approved non-production JWT verification settings and use an account that exists in this isolated database. Keep secrets in the process environment or an approved local secret store; do not paste or print them. The HTTP smoke command below creates short-lived local test credentials by itself.

## 3. Start Expo against that API

Run from this checkout's `mobile` directory. For browser or emulator testing on the same computer:

```sh
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8765 npm run start -- --host lan --port 8090
```

For a physical Android device, bind the API to the computer's LAN interface, then use the computer's reachable LAN address in the Expo build-time variable. A phone cannot reach the computer through `127.0.0.1`:

```sh
# API terminal: keep the same TASK01_DEMO_DATABASE_URL and run
python scripts/task01_demo.py --host 0.0.0.0 --port 8765

# Mobile terminal; replace the example address with the computer's LAN address
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.25:8765 npm run start -- --host lan --port 8090
```

Allow LAN traffic only on the trusted development network. API source is this TASK-01 checkout; Expo source is its `mobile` directory. The API listens on `8765` and Expo on `8090`. These ports are separate from the existing `8001` and `8081` processes in the original checkout.

## 4. Run isolated real-HTTP evidence

After Alembic has upgraded the same disposable database, run from `backend`:

```sh
TASK01_DEMO_DATABASE_URL='postgresql+psycopg://postgres@127.0.0.1:55441/task01_payment_test' \
  python scripts/task01_payment_http_smoke.py
```

The smoke creates uniquely named fixture rows and does not truncate or delete data. It starts its own loopback API listener on a temporary port and verifies disabled and production 403 guards, successful payment, PAID detail and receipt, same-key idempotent replay without duplicate payment/escrow/receipt rows, and FAILED followed by a new-key SUCCESS. Run it only on the database described above.

Press `Ctrl+C` in the API and Expo terminals to stop those processes. Do not stop or remove containers that this task did not create.

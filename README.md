# 2NDHAND Marketplace

Android marketplace prototype built with React Native / Expo, FastAPI and PostgreSQL / Supabase.

This branch publishes the current local development snapshot and project documents for team review. It includes unfinished work. The final delivery, receipt, seller settlement and buyer refund flows are tracked in the submission review.

## Start reviewing here

- [Submission review, remaining tasks and presentation checklist](docs/project-plan/SUBMISSION-READINESS-REVIEW-2026-09-30.md)
- [Issue and PR evidence snapshot](docs/project-plan/SUBMISSION-READINESS-EVIDENCE-2026-09-30.json)
- [Prototype backlog and team plan](docs/project-plan/GitHub_Prototype_Backlog.md)
- [Software Requirements Specification](docs/requirment/Software%20Requirements%20Specification.pdf)
- [Order state diagram](docs/state-diagram/Order%20State%20Diagram.puml)
- [Core class diagram](docs/class-diagram/Class%20Diagram%20(Core).puml)
- [UI design plan](docs/ux-ui-design/UI-REDESIGN-PLAN.md)
- [UI design handoff](docs/ux-ui-design/HANDOFF-HEAD-DEV.md)
- [Interactive HTML prototype](docs/ux-ui-design/index.html) - download/open locally in a browser
- [Figma wireframe](docs/wireframe/wireframe.fig)

## Repository layout

| Path | Contents |
|---|---|
| `mobile/` | Android/Expo application, services and mobile tests |
| `backend/` | FastAPI routes, business logic, Alembic migrations and backend tests |
| `docs/project-plan/` | Scope, specifications, dependency handoffs and remaining tasks |
| `docs/ux-ui-design/` | Design specifications, interactive prototype and brand assets |
| `docs/class-diagram/`, `docs/state-diagram/`, `docs/wireframe/` | Diagrams and design source files |
| `doc/` | Implementation contracts, handoff reports and existing QA evidence |

## Development setup

Use the branch selected in this PR when cloning/checking out the project.

### Backend

From `backend/`, create/activate a Python virtual environment, install `requirements.txt`, and create a private `.env` from `.env.example`. Obtain the approved database/Auth/Storage settings from the team privately.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
python -m uvicorn app.main:app --reload
```

Configure the environment before starting the API. Swagger is normally at `http://127.0.0.1:8000/docs`. On a physical Android device, the API address must be reachable from that device. The named database owner coordinates migrations for shared environments.

### Mobile

From `mobile/`, install dependencies and configure the API/Auth settings used by the team, including `EXPO_PUBLIC_API_BASE_URL`.

```bash
npm ci
npx expo start
```

Google Sign-In requires the team's native development build and OAuth configuration. See `mobile/eas.json` for build profiles. Run connected acceptance with catalog/API mode enabled.

### Checks

From `mobile/`:

```bash
npm run typecheck
npm run test:logic
npm run test:components
```

Backend PostgreSQL tests use a dedicated disposable test database. Existing reports record their own tested revisions and environments; those results do not automatically cover this newer snapshot.

## Current completion status

Initial login, seller approval, Product and Order/payment code exists. This snapshot also contains INSPECT, CERT-01...04, unpaid expiry worker and newer UI changes. Review the linked task plan for merge, device, Storage, QR and final submission acceptance.

Payment and carrier integrations are simulations. FINISH fulfillment/settlement/refund remains unfinished. Review/consent and other prototype screens require the persistence/scope checks recorded in the review.

## Snapshot provenance

Source checkout at snapshot: `feat/marketplace-design-ui`, commit `939e4f763c8185e5478b1d4962e746b7a2321a8d`, including its current tracked edits and untracked source files. Project documents were copied from the parent workspace's `docs/` directory. The historical F3 report was included for context and refers to PR #115's recorded revision.

Private environment files, credentials, dependency directories and generated build output are excluded from the published snapshot.

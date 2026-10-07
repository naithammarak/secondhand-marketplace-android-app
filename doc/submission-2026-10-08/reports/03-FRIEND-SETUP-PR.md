# Friend source handoff / setup PR — 1 October 2026

## Delivery

- Branch: `codex/friend-handoff-2026-10-01`
- PR base: `codex/project-review-2026-09-30` / existing Draft PR #116
- Base SHA: `521a3822744ac1c67cc75fc2a5574567eb885125`
- Original checkout HEAD: `939e4f763c8185e5478b1d4962e746b7a2321a8d` plus local working-tree files
- Full app source in this branch is inherited from #116 and matches the current working tree semantically. Four trailing-blank-line-only differences in mobile files were omitted. The base's extra node_modules-symlink ignore rule was retained. Source inventory records these exclusions.
- Added complete submission packet, six assignment packages and FRIEND-SETUP.md. Existing application code was not changed for this documentation PR.
- Original checkout/branch and live servers remain available. The isolated handoff checkout holds the new branch.

## Verification

- Packet validation: 14 task files, 59 requirements, 28 QA cases, acyclic dependencies and 151 local links PASS.
- Fresh mobile dependencies installed from lockfile with `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund`: 1109 packages. Dependency lifecycle scripts were not exercised.
- `npm run typecheck`: PASS.
- `npm run test:logic`: 305 passed, 0 failed.
- Backend certificate URL/public-page smoke tests: 13 passed, using the existing source checkout Python venv. A fresh backend pip installation was not exercised.
- `python -m alembic heads`: one head, `714f11c84d53`; no database migration was applied.
- New packet text scanned for credential patterns and actual local backend secret values: no hits. No .env, node_modules, venv, font cache or signing material is included.
- Original source files remain unchanged except the authorized README pointers added for setup guidance.

- Authored-file diff whitespace check passed. Historical reference snapshots and CSV retain original CRLF/Markdown hard breaks; the unfiltered check reports those inherited formatting markers.

## Remaining acceptance

The packet assigns implementation and integration; it does not deliver FINISH/profile/reviews/revoke functionality by itself. Full native Android, Google OAuth, shared Storage, public QR, actual scheduler deployment and both business journeys remain subject to tasks01–13 and the QA matrix. Teachers' scope acknowledgement and presentation are human acceptance steps.

See [setup](../FRIEND-SETUP.md), [assignment index](../work-packages/README.md), [source inventory](02-friend-pr-source-inventory.json) and [validation](03-friend-setup-validation.json).

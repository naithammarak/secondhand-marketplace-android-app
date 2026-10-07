# Task delivery report

- Task ID / owner:
- Status: IMPLEMENTED_AND_TESTED / PARTIAL / BLOCKED
- Repo / branch:
- Upstream SHA:
- Delivered SHA (or reproducible diff/source inventory):
- Migration predecessor/head:
- Date / timezone:

## What changed and why

Describe actual APIs/UI/schema and files. List compatibility mapping and preserved existing work.

## Verification performed

| Check / exact command | Environment / DB isolation | Result / count | Evidence path |
|---|---|---|---|
| Fill with executed checks only | | | |

Separate mocked/isolated PostgreSQL checks, combined API smoke and real Android/Auth/Storage/QR acceptance. List baseline failures separately from failures introduced by this task.

## Contract and safety checks

- Actual routes and upstream interface:
- Auth/PII/idempotency/concurrency/rollback checks relevant to this task:
- One migration head and preservation evidence if schema changed:
- Secrets/shared data handling:

## Remaining work / exact blocker

State the missing dependency/access/decision and independent work completed. Do not mark a task done with untested mandatory behavior. List human actions only where tooling cannot perform them.

## Handoff

- Downstream task IDs and required base/interface:
- Run/setup commands and nonsecret configuration names:
- Related existing issues/PRs; implementation vs acceptance status:
- Candidate merge/retest requirement:

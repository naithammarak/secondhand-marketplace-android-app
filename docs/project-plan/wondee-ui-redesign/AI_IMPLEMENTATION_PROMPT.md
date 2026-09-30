# Prompt สำหรับ Astra / Extra high — คัดลอกข้อความด้านล่างทั้ง block

ตั้ง model ของ session ลงมือเป็น **Astra**, reasoning **Extra high (`xhigh`)**. Session นี้ทำ implementation; session ที่จัดทำชุดเอกสารเป็น Lead/planner และยังไม่ได้เปลี่ยนแอป

```text
You are the implementation engineer for the Wondee marketplace UI/UX redesign.
Use Astra with Extra high reasoning. Implement the selected scope end to end in this session.
Do not stop after producing another plan or after only recoloring the home screen.

Workspace root:
/home/tmk/project/market-place-mobile-app

Actual application Git repository:
/home/tmk/project/market-place-mobile-app/secondhand-marketplace-android-app

Read these files first, in order:
1. /home/tmk/project/market-place-mobile-app/docs/project-plan/wondee-ui-redesign/README.md
2. /home/tmk/project/market-place-mobile-app/docs/project-plan/wondee-ui-redesign/ui_ux_production_spec.md
3. /home/tmk/project/market-place-mobile-app/docs/project-plan/wondee-ui-redesign/SOURCE_AUDIT.md
4. /home/tmk/project/market-place-mobile-app/docs/project-plan/wondee-ui-redesign/QA_ACCEPTANCE.md

Visual references (immutable copies; inspect in a browser, do not just read the prose):
/home/tmk/project/market-place-mobile-app/docs/project-plan/wondee-ui-redesign/reference/index.html
/home/tmk/project/market-place-mobile-app/docs/project-plan/wondee-ui-redesign/reference/mascot_showcase.html
/home/tmk/project/market-place-mobile-app/docs/project-plan/wondee-ui-redesign/reference/DESIGN_SPEC.md

Business contracts when relevant:
/home/tmk/project/market-place-mobile-app/docs/project-plan/FULFILLMENT-00-delivery-proof-and-deadlines.md
/home/tmk/project/market-place-mobile-app/docs/project-plan/INSPECT-spec.md
/home/tmk/project/market-place-mobile-app/docs/project-plan/CERT-spec.md
/home/tmk/project/market-place-mobile-app/docs/project-plan/FINISH-spec.md

Scope selected for this one-shot implementation:
- Adopt the emerald/teal Wondee design across the application: both themes, typography,
  mascot, shared components, loading/error/empty states, 3-tab navigation,
  catalog/detail, profile/login, seller verification, product management,
  checkout/orders/receipts, existing admin verification, and inspection-related views.
- Implement the UX backend prerequisites in specification section 6:
  server-default BUYER, buyer seller-application, shop_name, atomic approval/promotion,
  Seller purchasing other sellers' products, owner-based authorization, public seller projection.
- Reuse existing services/stores, upload safeguards, login-return intent,
  payment idempotency, cancellation/expiry, and private-data isolation.
- Full inspection/CERT/FINISH feature development is a dependency, not implicitly added scope.
  Bind the redesigned views to those real features when their verified implementation
  is in the chosen base. Otherwise complete the view components and isolated visual/test
  fixtures, show an honest unavailable production state, and document exact remaining
  API/PR dependencies. Never replace missing feature behavior with fake success.

First inspect AGENTS.md and the real current repository state. Read the exact Expo 57
versioned docs required by mobile/AGENTS.md before writing mobile code.
Fetch origin and inspect current PR states/commit containment. At planning time:
local checkout was b342523 on feat/marketplace-design-ui; origin/main was 8254f8d.
PR #92 and #97 were in main. #93 and #94 were merged into feature branches,
NOT into main. #95 inspection mobile was still open; CERT #100 and FINISH #98 exist.
These are a dated inventory, not permission to assume today's state is unchanged.

Create an isolated implementation worktree from the refreshed origin/main.
Preserve existing untracked docs/features/UX-00-guest-first-marketplace-plan.md,
docs/prototypes/, other worktrees and all unrelated user changes.
Do not reset/clean the user's checkout or merge active feature stacks automatically.
Inspect/reuse any already integrated inspection implementation; do not duplicate it.
Follow specification section 3.2 for missing dependencies and migration conflicts.

Use ui_ux_production_spec.md as the resolved implementation specification.
Apply its D01-D18 decisions. The supplied DESIGN_SPEC.md is a visual source,
not authority to invent new endpoints/tables/enums, opt out of inspection,
change money amounts/deadlines, enable real payments, or ship fake sample data.
Do not install NativeWind/TanStack Query/Zustand or upgrade the SDK just to do this redesign.
Use installed, documented animation APIs; do not copy withKeyframes from the sample.
Keep branding geometric/vector based; image generation is unnecessary.

Implement all WUI-00 through WUI-07 tasks within the selected scope.
Make reasonable minor implementation decisions and keep progressing without asking
for approval for routine local edits. A dependency block on one feature must not stop
independent UI/UX work. Do not bypass the block or claim the feature is complete.
If direct user clarification changes scope or design precedence, update the spec and
delivery report consistently before dependent changes.

Verify proportionately and fix failures introduced by the changes:
- Mobile typecheck, lint, logic tests, component tests, web export and Android JS export.
- Focused backend auth/verification/admin/product/order tests and meaningful regressions.
- Disposable PostgreSQL for new migration/constraints/concurrency; inspect test fixtures
  first because some drop schemas. Never point these at shared Supabase or production.
- Browser visual review against the reference: both themes and 320/390/430/768 widths,
  Thai long text, large text, keyboard, sticky CTA, reduced motion, image and API failures.
- Real Android/OAuth/private Storage checks only when the environment and test accounts
  permit. Record NOT RUN/BLOCKED honestly; JS bundle export and mocks are not device proof.

Create docs/features/WONDEE-UI-REDESIGN-DELIVERY.md in the implementation worktree
with the final SHA/base, changes, all screen/route/API mappings, checks and exact results,
screenshots, known limitations, dependency owners/links and follow-up acceptance gates.
Update affected UX/VERIFY contracts so the new Buyer-to-Seller flow is documented once.

Do not deploy, migrate a shared DB, send messages to others, close issues, push or merge
remote PRs unless the user separately authorizes that action. Leave reviewable local work.

Final response in Thai: what changed, worktree/branch and important file paths,
what was actually verified, what remains blocked/not run, and whether this is
CORE REDESIGN COMPLETE, VISUAL COVERAGE COMPLETE, or FULL INTEGRATION COMPLETE.
Use only the completion labels whose gates in the spec are actually satisfied.
```

หากผู้ใช้ต้องการ UI-only ให้แก้ scope ให้ชัดก่อนส่ง: เก็บ role chooser/สิทธิ์ปัจจุบันและห้ามเปิด Buyer apply ที่ใช้ไม่ได้; ห้ามใช้ prompt เดิมแต่ละเว้น backend เงียบ ๆ. หากต้องการทั้งระบบถึง settlement ให้ขยาย scope ด้วย CERT/FINISH/INT-01 ทั้งสัญญาและ tests ก่อนเริ่ม ไม่ถือว่าคำว่า “overall” อนุญาตการ merge/deploy หรืองานเงินทั้งหมดโดยปริยาย

# Wondee isolated visual preview

Run from `mobile`:

```sh
WONDEE_VISUAL_QA=1 npx expo start --web --port 8766
```

Open `http://127.0.0.1:8766/?scene=buyer&theme=dark&id=7`.

The explicit QA environment selects this router and aliases providers/services to local fixtures. It renders real UI components with synthetic accounts, local SVG product images and inert actions. The yellow banner identifies it as **QA FIXTURE / no API or real persistence**. Do not use this environment for production exports, OAuth or API acceptance. Standard start/export uses `src/app`; production bundle isolation is audited in `docs/features/wondee-evidence/bundle-isolation.json`.

Scenes: `guest`, `buyer`, `seller`, `login`, `form`, `form-errors`, `pending`, `approved`, `rejected`, `catalog`, `detail`, `checkout`, `checkout-error`, `orders`, `orders-empty`, `orders-error`, `orders-loading`, `order-paid`, `ship`, `inspector-queue`, `inspector-work1`, `inspector-work2`, `inspector-work3`, `result-decision` (inert decision-dialog fixture), `result-PASS`, `result-MINOR_ISSUE`, `result-NOT_AS_DESCRIBED`, `result-FAKE`, `certificate`, `create`, `edit`, `mine`, `admin`, `receipt`, `shared`. Theme is `dark` or `light`. Form submission, approvals, payment and other mutations do not assert successful backend behavior.

Capture after `data-testid=qa-ready` and fonts settle; catalog/detail additionally require loaded content. Use viewport screenshots: browser full-page capture can change a flex-root layout. Review images, not only DOM overflow checks. `contact-sheets.py` assembles the saved 320/390 images for review using Pillow; it does not render UI. The delivery report records checks and remaining native/live gates.

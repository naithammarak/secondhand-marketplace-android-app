# Diagram sources and rendered views

These diagrams describe the **selected target release**. They do not certify that the current application implements every feature. Task13 must reconcile physical field/route details with the tested release before submission.

| Diagram | Editable source | PNG | SVG for zoom/export |
|---|---|---|---|
| Core classes | [Source](class-core.puml) | [PNG](rendered/class-core.png) | [SVG](rendered/class-core.svg) |
| Order states | [Source](order-state.puml) | [PNG](rendered/order-state.png) | [SVG](rendered/order-state.svg) |
| Successful sale | [Source](sale-sequence.puml) | [PNG](rendered/sale-sequence.png) | [SVG](rendered/sale-sequence.svg) |
| Return/policy-aware refund | [Source](return-sequence.puml) | [PNG](rendered/return-sequence.png) | [SVG](rendered/return-sequence.svg) |
| Retained use cases | [Source](use-cases.puml) | [PNG](rendered/use-cases.png) | [SVG](rendered/use-cases.svg) |
| Architecture | [Source](architecture.puml) | [PNG](rendered/architecture.png) | [SVG](rendered/architecture.svg) |

R1–R4 sources/rendered outputs updated for the versioned backend candidate, including two separate 72h clocks, actual return receipt and item-only/full allocations. Historical diagrams in references remain unchanged. Backend local tests do not establish UI/device acceptance.

Validated and rendered locally with PlantUML 1.2026.8, using the embedded Smetana layout for graph diagrams. Source: [official PlantUML release](https://github.com/plantuml/plantuml/releases/tag/v1.2026.8), [layout documentation](https://plantuml.com/smetana02).

From the packet root, after obtaining the official jar in a separate tools directory:

```bash
java -Djava.awt.headless=true -jar /path/to/plantuml.jar -checkonly diagrams/*.puml
java -Djava.awt.headless=true -jar /path/to/plantuml.jar -tpng -o rendered diagrams/*.puml
java -Djava.awt.headless=true -jar /path/to/plantuml.jar -tsvg -o rendered diagrams/*.puml
```

The jar is not included in the handoff ZIP. All rendered outputs are included.

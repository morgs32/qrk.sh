# Pragmatic drag-and-drop shadow stability

Researched 2026-10-29 against the official documentation and the maintainer's
example. Source facts below are separate from the QRK diagnosis and adaptation.

## Source findings

Atlassian's [Board with shadows example](https://atlassian.design/components/pragmatic-drag-and-drop/examples#board-with-shadows)
demonstrates Trello-style insertion space. Its maintainer implementation is
pinned here to commit `e49370e53205b7c32f4164823935685bdd95b5cb`.

The card's outer wrapper contains both the real card and its top/bottom insertion
shadow. The real card has a separate inner ref. The outer wrapper is also the
drop target measured by `attachClosestEdge`. Moving an existing shadow between
the two sides preserves the enclosing target's bounds; the example does not
cache the original card rectangle. This geometric consequence is an inference
from the structure, rather than a documented jitter guarantee.
[Card rendering](https://github.com/alexreardon/pragmatic-board/blob/e49370e53205b7c32f4164823935685bdd95b5cb/src/shared/card.tsx#L75-L103),
[drop-target registration](https://github.com/alexreardon/pragmatic-board/blob/e49370e53205b7c32f4164823935685bdd95b5cb/src/shared/card.tsx#L145-L152).

The example also enables sticky targets. Stickiness retains a target after the
pointer leaves it under specific conditions; directly hovered targets still
recompute `getData`. It does not by itself freeze hit-test geometry.
[Drop-target and stickiness documentation](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/drop-targets).

## QRK diagnosis and adaptation

The reported feedback loop is consistent with inserting a shadow before a
sibling Row while measuring that Row's live top: the shadow can move the origin
that selects its own destination. This was a source-grounded diagnosis, not a
runtime reproduction result.

QRK applies the enclosing-target pattern by placing each Row's owned
before/after shadow inside that Row's drop-target wrapper. Local feedback keeps
the owner separate from the canonical insertion destination. In particular,
after Row A and before Row B can name the same command destination while having
different visual owners. The shadow retains its existing drop target and
committed payload. Empty-Wall and exposed-Stack drops retain their outer paths;
no stickiness change is needed.

QRK also has a middle combine zone, unlike the example's binary edge selection.
An inline shadow can have less total height than a before/after shadow. Measuring
quarters of the enlarged wrapper would therefore allow an after/combine loop.
Both Row instructions and Placement eligibility instead use the wrapper's top
with the existing natural Row height captured at drag start. The logical combine
band stays anchored to that slot while a vertical shadow can move visible Row
content beneath it. This is the deliberate adaptation, not a claim that the
library provides combine-zone stabilization.

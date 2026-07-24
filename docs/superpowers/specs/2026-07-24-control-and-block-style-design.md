# Control and Block Style Design

Issue: [#25 Make controls recognizable and block styling scale-consistent](https://github.com/Zikoat/unblock-me/issues/25)

## Goal

Make controls visibly pressable and keep the blocks' visual proportions stable across generated board sizes, zoom levels, and rendering modes.

## Design

Informational badges and interactive controls use separate visual vocabularies. Badges are flat, muted status chips without pointer or pressed affordances. Controls have a stronger border and fill, a small elevation shadow, and explicit hover, active, focus-visible, selected, and disabled states. Toggle selections remain highlighted with the existing lime accent.

Block geometry is expressed through shared CSS custom properties derived from one rendered grid-cell size. Gameplay blocks and generated-world block cells consume the same corner-radius, inset, type-size, and shadow tokens. The board transform continues to handle zoom, so cells and their styling scale together without changing their proportions.

The implementation remains in the existing HTML/CSS renderer and browser client. Canvas or SVG rendering would add complexity without improving this styling correction.

## Verification

Targeted browser tests verify that controls and badges have distinct computed affordances and that block geometry ratios remain stable across different board dimensions, zoom levels, and block renderers. Desktop and phone screenshots are visually inspected. The issue report contains the requirements, focused evidence, and compact build/test/deployment checks.

## Out of Scope

The independent behavioral review may identify other product issues. Those findings are reported separately and do not expand this styling change.

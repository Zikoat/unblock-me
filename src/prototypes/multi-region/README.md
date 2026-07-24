# Multi-region terminal prototype

Question: does Viewport-driven generation feel understandable when the entire 40×40 World remains visible and a 10×10 Viewport moves across it?

Run:

```powershell
bun run prototype:regions
```

Useful first sequence:

```text
move right 5
move down 5
move right 5
```

The initial Viewport is generated immediately. Each camera command requests every missing cell in the new Viewport plus a small rounded margin. Jumping to a disconnected place therefore starts another region without requiring an existing Generation Boundary. Regions contain several deterministic, differently sized colored Blocks. Block movement is deliberately absent.

ANSI color is supplementary. When terminal escape sequences are stripped, `··` still marks committed cells inside the Viewport, `. ` marks committed cells outside it, and `░░` marks uncommitted Viewport cells. Every occupied cell of a Block prints that Block's ID, so multi-cell shapes remain visible without color.

This is throwaway code. Record the human verdict in issue #9, then delete the terminal shell or absorb only the validated concepts.

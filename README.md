# 木材切割排版｜夾板簡易排料

The software display name remains **木材切割排版｜夾板簡易排料**. **CutNest** is only the English GitHub/project name used for publishing and sharing.

## Live app

[Open the independent app](https://cw91020251212.github.io/plywood-cutting-layout/)

## Available features

- Metric and imperial triple-unit input for parts and sheets
- Kerf/blade thickness and four-side edge-trim settings
- Fewer-sheets or easier-cutting objectives and multiple layout strategies
- Table-saw-first strip/crosscut workflow with bounded equal-width length-combination search
- Candidate validation, layout variations, utilisation and sheet count
- Part diagram appearance selector: flat color, same-hue 3D gradient (e.g. dark red to light red, dark blue to light blue), or metallic sheen (visual only; no gray overlay)
- Part dimension labels: automatic fit, click one part to highlight and read its exact size, or show numbered labels and a full per-sheet dimension list; visual-only and not part of cutting optimization
- One-part rotation followed by full replanning and validation (manual dragging is disabled)
- Cut-by-cut replay, cut tree and material-balance details
- Save/load JSON, print reports and save layout images
- Native share sheet on supported phones, with clipboard fallback
- Installable PWA with an offline-ready service worker
- Settings for language, dark mode, font size and five-level scroll-arrow opacity

## Important limitation

The result is a computer-generated candidate layout, not a workshop-safety certification or a guarantee of globally optimal material use. An experienced woodworker must verify the actual sheet, kerf, supports, tools and machine safety before cutting.

Diagram finishes preserve each part's color hue while changing shade; they are visual cues only and do not represent actual wood grain, material, or cut feasibility.

## Table-saw update

See [the 2026-10-07 release notes](TABLE_SAW_RELEASE.md) for the one-sheet/seven-cut regression example, ranking and remnant fixes, search limits, and remaining limitations.

## AI handoff

See [the complete table-saw algorithm, code map, evidence, safety boundaries, tests, and next-step handoff](AI_HANDOFF_鋸枱排料.md) before making future changes.

## Checks

```sh
node scripts/check-inline-scripts.cjs
node --test tests/*.test.cjs
```

GitHub Pages runs these checks before deployment.

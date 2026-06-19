---
name: skeleton-creator
description: >
  Creates new skeleton JSON files for the fireworks game — buildings, entities, crowd members,
  or any animated visual. Use this skill whenever the user asks to make a new building visual,
  a new entity, a new animated character, or says things like "add a skeleton for X", "create a
  JSON for a new building", "I want a new visual for Y", "make me an animated Z". Even if they
  don't say "skeleton" explicitly, use this skill any time a new game visual that needs animation is requested.
---

# Skeleton Creator

This skill creates skeleton JSON files for the fireworks game. Skeletons live in
`assets/skeletons/` and are registered in `assets/skeletons/manifest.json`.

## How the skeleton system works

Every visual is made of rectangular **parts** arranged in a tree. Each part is a colored
rectangle drawn relative to its parent. Animations keyframe per-part properties over time.

The renderer draws each part as a textured square scaled to `width × height` game units.
Parts are drawn in `z` order (lower z = drawn first = behind).

---

## Part fields

```json
{
  "id": "arm",            // unique string ID, used to reference in animations
  "parentId": "body",     // null for the root part
  "width": 1.5,           // width in game units
  "height": 4.0,          // height in game units
  "color": "ff8800",      // hex color, no # prefix
  "anchorX": 0,           // pivot within THIS part: -0.5=left edge, 0=center, 0.5=right edge
  "anchorY": 0.5,         // pivot within THIS part: -0.5=bottom, 0=center, 0.5=top
  "relX": 0.1,            // position relative to parent, in parent-width fractions (-0.5 to 0.5)
  "relY": 0.8,            // position relative to parent, in parent-height fractions
  "baseRotation": 0,      // rest rotation in radians (applied before any animation)
  "z": 10,                // draw order (lower = behind)
  "alpha": 1              // optional: initial opacity (0=invisible, 1=fully visible)
}
```

### Positioning intuition

- `relX` / `relY` are **fractions of the parent's size**. `relY: 0.5` means "at the top edge of the parent".
- `anchorX` / `anchorY` control where on THIS part the attachment point is. `anchorY: 0.5` means the part hangs from its top edge; `anchorY: -0.5` means it sits on its bottom edge.
- The root part (`parentId: null`) uses `relX: 0, relY: 0` and is positioned by game code.

### Outline pattern

Many skeletons have outline parts: a slightly larger black copy of each part placed behind it (`z` lower by about 1-5 units). Name them `partId_outline` and parent them to the same parent as the original.

---

## Animation fields

```json
"animations": {
  "idle": {
    "duration": 2.0,   // length of one loop in seconds
    "loop": true,      // whether to loop
    "tracks": {
      "partId": [
        {
          "time": 0,        // seconds from start
          "rotation": 0,    // rotation delta in radians (adds to baseRotation)
          "offsetX": 0,     // positional offset in game units (world space)
          "offsetY": 0,
          "scaleX": 1,      // scale multiplier
          "scaleY": 1,
          "r": 1, "g": 1, "b": 1,  // color tint multipliers (1 = normal)
          "a": 1            // alpha multiplier
        }
      ]
    }
  }
}
```

Keyframes are **linearly interpolated**. Any field you omit defaults to its neutral value
(`rotation/offsetX/offsetY → 0`, `scaleX/scaleY/r/g/b/a → 1`).

Only include a part in a track if you want to animate it. Parts not in any track hold their
rest pose. A track must have at least 2 keyframes (start and end); for a loop animation,
the last keyframe usually matches the first.

---

## Registering the skeleton

After creating the JSON, add an entry to `assets/skeletons/manifest.json`:

```json
{
  "id": "my_building",
  "name": "My Building",
  "file": "my_building.json"
}
```

---

## Common animation recipes

**Gentle idle float** (whole body bobs up and down):
```json
"idle": {
  "duration": 2.0, "loop": true,
  "tracks": {
    "base": [
      { "time": 0, "offsetY": 0 },
      { "time": 1, "offsetY": 0.2 },
      { "time": 2, "offsetY": 0 }
    ]
  }
}
```

**Arm swing** (oscillating rotation):
```json
"arm": [
  { "time": 0, "rotation": 0 },
  { "time": 0.5, "rotation": 0.4 },
  { "time": 1, "rotation": 0 }
]
```

**Spinning wheel**:
```json
"wheel": [
  { "time": 0, "rotation": 0 },
  { "time": 1, "rotation": 6.2832 }
]
```

**Color pulse** (glowing effect):
```json
"glow_part": [
  { "time": 0, "r": 1, "g": 1, "b": 1 },
  { "time": 0.5, "r": 2, "g": 1.5, "b": 0.5 },
  { "time": 1, "r": 1, "g": 1, "b": 1 }
]
```

**Scale bounce** (squash and stretch):
```json
"body": [
  { "time": 0, "scaleX": 1, "scaleY": 1 },
  { "time": 0.15, "scaleX": 1.2, "scaleY": 0.8 },
  { "time": 0.3, "scaleX": 0.9, "scaleY": 1.1 },
  { "time": 0.5, "scaleX": 1, "scaleY": 1 }
]
```

---

## Full minimal example — a simple tower building

```json
{
  "parts": [
    {
      "id": "base",
      "parentId": null,
      "width": 4, "height": 1,
      "color": "888888",
      "anchorX": 0, "anchorY": 0,
      "relX": 0, "relY": 0,
      "z": 0
    },
    {
      "id": "body",
      "parentId": "base",
      "width": 2.5, "height": 5,
      "color": "aaaaaa",
      "anchorX": 0, "anchorY": -0.5,
      "relX": 0, "relY": 0.5,
      "z": 5
    },
    {
      "id": "top",
      "parentId": "body",
      "width": 1.2, "height": 1.2,
      "color": "ff6600",
      "anchorX": 0, "anchorY": -0.5,
      "relX": 0, "relY": 0.5,
      "z": 10
    },
    {
      "id": "base_outline",
      "parentId": "base",
      "width": 4.4, "height": 1.4,
      "color": "000000",
      "anchorX": 0, "anchorY": 0,
      "relX": 0, "relY": 0,
      "z": -1
    }
  ],
  "animations": {
    "idle": {
      "duration": 3.0,
      "loop": true,
      "tracks": {
        "top": [
          { "time": 0, "rotation": 0 },
          { "time": 1.5, "rotation": 0.05 },
          { "time": 3.0, "rotation": 0 }
        ]
      }
    }
  }
}
```

---

## Workflow when asked to create a new skeleton

1. **Understand the visual** — ask what it looks like, what it does, what animations it needs.
2. **Design the part hierarchy** — think about what needs to move independently; those need to be separate parts with their own IDs and parents.
3. **Write the JSON** — save to `assets/skeletons/<name>.json`.
4. **Register it** — add to `assets/skeletons/manifest.json`.
5. **Describe the result** — explain what each part is and how the animations work.

If asked for a building visual, also check `js/config/BuildingConfig.js` to see if a `skeletonUrl` field needs to be added there.

You are generating the `animations` object JSON for an existing skeleton asset used by the game.

## What the game expects

Return valid JSON only.
Do not include explanations, notes, or Markdown fences.

The output should be a JSON object that will be used as the skeleton asset's `animations` property. Example runtime shape:

```json
{
  "idle": {
    "duration": 3,
    "loop": true,
    "tracks": {
      "base": [
        { "time": 0, "rotation": 0, "offsetX": 0, "offsetY": 0 },
        { "time": 3, "rotation": 0, "offsetX": 0, "offsetY": 0 }
      ],
      "arm_l": [
        { "time": 0, "rotation": -0.12, "offsetX": 0, "offsetY": 0 },
        { "time": 1.5, "rotation": 0.14, "offsetX": 0, "offsetY": 0 },
        { "time": 3, "rotation": -0.12, "offsetX": 0, "offsetY": 0 }
      ]
    }
  }
}
```

Rules

- Output valid JSON only. No comments. No Markdown fences.
- The top-level JSON you return should represent the `animations` map (clip name → clip object).
- Parts referenced in `tracks` must match `id` values from the skeleton `parts` list (case-sensitive).
- Clips must include `duration` (seconds, number) and `loop` (boolean).
- `tracks` is an object that maps part id → ordered array of keyframes.
- Each keyframe entry MUST include: `time`, `rotation`, `offsetX`, `offsetY`.
- Keyframes must be ordered by increasing `time`. Include explicit keyframes at `time: 0` and `time: duration` for seamless looping.
- Times are in seconds and must be within `[0, duration]`.
- Rotation values are in radians.
- `offsetX` / `offsetY` are in skeleton local units (same units as part sizes/positions).
- Avoid adding custom fields—stick to the four keyframe fields above.

Animation guidelines and heuristics

- Keep animations sparse: typically animate 1–3 focal parts per idle clip.
- Idle durations: 2–6s are usually good; shorter for twitchy things, longer for slow breathing.
- Motion magnitude: small rotation offsets are usually best (±0.1–0.4 radians). For subtle breathing use offsets ≤ 0.2 units.
- Prefer rotation for articulated movement; use `offsetX`/`offsetY` for squash/stretch or small floating motions.
- When a part has `baseRotation`, express each keyframe's `rotation` as the absolute rotation to apply (i.e., the engine will use these values directly, which combine visually with the part's base state).
- To simulate easing (if the runtime uses linear interpolation), add intermediate keyframes to approximate ease-in/out.
- For mirrored parts (`_l` / `_r`), mirror rotations (invert sign) and mirror offsetX as needed.
- Do not animate `anchorX`, `anchorY`, `width`, or `height`—the runtime does not expect those to be animated here.

Design patterns

- Breathe / idle sway: animate a low-frequency rotation on a single mast/head/arm, and a subtle vertical offset on the base for weight shift.
- Pendulum: three keyframes [start, peak, end] with symmetric rotations around the center time produce a clean pendulum loop.
- Blink/flash: use short-duration clip or a dedicated track for a detail part (e.g., `eye`) with on/off offsets or tiny z-favoring details.
- Compound motion: animate a parent mass (body) with small motion and a child focal part (antenna, lens) with a slightly phase-shifted motion for liveliness.

Practical constraints

- Time relationships: ensure child tracks that follow parent motion stay coherent—small phase shifts are fine, but avoid contradictory extrema that break the silhouette.
- Readability at small scale: favor exaggerated single-axis motion rather than tiny multi-axis jitter.
- Layering: animations do not change `z`. If a motion requires re-layering, that must be handled by parts' `z` in the skeleton.

Keyframe examples and patterns

- Minimal idle loop (keeps everything stable):

```json
{
  "idle": {
    "duration": 3,
    "loop": true,
    "tracks": {
      "base": [
        { "time": 0, "rotation": 0, "offsetX": 0, "offsetY": 0 },
        { "time": 3, "rotation": 0, "offsetX": 0, "offsetY": 0 }
      ]
    }
  }
}
```

- Gentle sway on a single arm with phase: add an intermediate keyframe to ease the motion:

```json
{
  "idle": {
    "duration": 3,
    "loop": true,
    "tracks": {
      "arm": [
        { "time": 0, "rotation": -0.08, "offsetX": 0, "offsetY": 0 },
        { "time": 1.5, "rotation": 0.10, "offsetX": 0, "offsetY": 0 },
        { "time": 3, "rotation": -0.08, "offsetX": 0, "offsetY": 0 }
      ]
    }
  }
}
```

- Floating core: vertical ping-pong using offsets (small values):

```json
{
  "idle": {
    "duration": 4,
    "loop": true,
    "tracks": {
      "core": [
        { "time": 0, "rotation": 0, "offsetX": 0, "offsetY": -0.06 },
        { "time": 2, "rotation": 0, "offsetX": 0, "offsetY": 0.06 },
        { "time": 4, "rotation": 0, "offsetX": 0, "offsetY": -0.06 }
      ]
    }
  }
}
```

Self-check before returning JSON

- All `tracks` reference existing part ids from the skeleton `parts` list.
- Every keyframe time is within `[0, duration]` and arrays are sorted.
- 0 and `duration` keyframes exist for looped clips.
- No duplicate track keys.
- Motion magnitudes are appropriate for the object's scale (test visually in-engine if possible).

Output expectations

- If asked to "generate animations" for a skeleton, return only the JSON object described above (the `animations` map).
- If no animation is desired, still return a minimal `idle` clip with identical 0/duration keyframes for each relevant track.

Design request:

[WRITE WHAT YOU WANT HERE]
/**
 * Sprite-sheet animation definitions.
 *
 * Layout convention:
 *   – Each animation occupies one full row in the sprite sheet.
 *   – Frames are read left-to-right inside that row.
 *   – `row` is 0-based from the TOP of the image.
 *   – `columns` / `rows` describe the full grid of the sheet.
 *
 * The renderer computes UV sub-rects on the GPU using only a per-instance
 * frame index (absolute index = animRow * columns + currentFrame).
 */

export const SPRITE_ANIMATIONS = {

    // Add more sprite-sheet definitions here for other entities, e.g.:
    // drone: { texture: '…', columns: …, rows: …, animations: { … } },
};


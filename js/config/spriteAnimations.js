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

    /**
     * Crowd sprite sheets — an array of sheet definitions.
     * Each crowd member is randomly assigned to one sheet at spawn.
     */
    crowd_sheets: [
        {
            id: 'crowd_sheet_a',
            texture: './assets/crowd_member_sheet.png',
            columns: 4,
            rows: 3,
            animations: {
                idle: {
                    row: 0,
                    frameCount: 4,
                    frameDuration: 0.25,
                    loop: true,
                },
                cheer: {
                    row: 1,
                    frameCount: 4,
                    frameDuration: 0.12,
                    loop: true,
                },
                wave: {
                    row: 2,
                    frameCount: 4,
                    frameDuration: 0.18,
                    loop: true,
                },
            },
            defaultAnimation: 'cheer',
        },
        {
            id: 'crowd_sheet_b',
            texture: './assets/crowd_member_sheet_2.png',
            columns: 4,
            rows: 3,
            animations: {
                falling: {
                    row: 0,
                    frameCount: 4,
                    frameDuration: 0.20,
                    loop: true,
                },
                walking_right: {
                    row: 1,
                    frameCount: 4,
                    frameDuration: 0.15,
                    loop: true,
                },
                blinking: {
                    row: 2,
                    frameCount: 4,
                    frameDuration: 0.30,
                    loop: true,
                },
            },
            defaultAnimation: 'blinking',
        },
    ],

    /** Legacy single-entry alias (kept for backward compatibility). */
    crowd_member: {
        texture: './assets/crowd_member_sheet.png',
        columns: 4,
        rows: 3,
        animations: {
            idle: {
                row: 0,
                frameCount: 4,
                frameDuration: 0.25,
                loop: true,
            },
            cheer: {
                row: 1,
                frameCount: 4,
                frameDuration: 0.12,
                loop: true,
            },
            wave: {
                row: 2,
                frameCount: 4,
                frameDuration: 0.18,
                loop: true,
            },
        },
        defaultAnimation: 'cheer',
    },

    // Add more sprite-sheet definitions here for other entities, e.g.:
    // drone: { texture: '…', columns: …, rows: …, animations: { … } },
};

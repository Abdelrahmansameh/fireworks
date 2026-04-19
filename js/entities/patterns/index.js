import ring from './ring.js';
import burst from './burst.js';
import { spherical, solidsphere } from './spherical.js';
import palm from './palm.js';
import { star, brocade } from './star.js';
import willow from './willow.js';
import christmasTree from './christmasTree.js';
import heart from './heart.js';
import brokenHeart from './brokenHeart.js';
import snowflake from './snowflake.js';
import spinner from './spinner.js';
import helix from './helix.js';
import dragonsBreath from './dragonsBreath.js';
import saturn from './saturn.js';

export const patternDefinitions = [
    { key: 'spherical', displayName: 'Spherical', recipe: spherical },
    { key: 'burst', displayName: 'Burst', recipe: burst },
    { key: 'palm', displayName: 'Palm', recipe: palm },
    { key: 'star', displayName: 'Star', recipe: star },
    { key: 'willow', displayName: 'Willow', recipe: willow },
    { key: 'ring', displayName: 'Ring', recipe: ring },

    { key: 'solidsphere', displayName: 'Solid Sphere', recipe: solidsphere },
    { key: 'brocade', displayName: 'Brocade', recipe: brocade },
    { key: 'heart', displayName: 'Heart', recipe: heart },
    { key: 'saturn', displayName: 'Saturn', recipe: saturn, hasSecondaryColor: true },
    { key: 'brokenHeart', displayName: 'Broken Heart', recipe: brokenHeart, unlockId: 'pattern_brokenHeart' },
    { key: 'spinner', displayName: 'Spinner', recipe: spinner, unlockId: 'pattern_spinner' },
    { key: 'helix', displayName: 'Helix', recipe: helix, hasSecondaryColor: true, unlockId: 'pattern_helix' },
    { key: 'christmasTree', displayName: 'Christmas Tree', recipe: christmasTree, hasSecondaryColor: true, unlockId: 'pattern_christmasTree' },
    { key: 'dragonsBreath', displayName: "Dragon's Breath", recipe: dragonsBreath, unlockId: 'pattern_dragonsBreath' },
    { key: 'snowflake', displayName: 'Snowflake', recipe: snowflake, hasSecondaryColor: true, unlockId: 'pattern_snowflake' },
];

export const patternKeys = patternDefinitions.map(({ key }) => key);

export const patternDisplayNames = Object.fromEntries(
    patternDefinitions.map(({ key, displayName }) => [key, displayName])
);

export const recipeMap = Object.fromEntries(
    patternDefinitions.map(({ key, recipe }) => [key, recipe])
);
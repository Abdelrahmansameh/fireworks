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

export const patternDefinitions = [
    { key: 'spherical', displayName: 'Spherical', recipe: spherical },
    { key: 'burst', displayName: 'Burst', recipe: burst },
    { key: 'ring', displayName: 'Ring', recipe: ring },
    { key: 'palm', displayName: 'Palm', recipe: palm },
    { key: 'star', displayName: 'Star', recipe: star },
    { key: 'snowflake', displayName: 'Snowflake', recipe: snowflake },
    { key: 'brocade', displayName: 'Brocade', recipe: brocade },
    { key: 'willow', displayName: 'Willow', recipe: willow },
    { key: 'heart', displayName: 'Heart', recipe: heart },
    { key: 'brokenHeart', displayName: 'Broken Heart', recipe: brokenHeart },
    { key: 'spinner', displayName: 'Spinner', recipe: spinner },
    { key: 'helix', displayName: 'Helix', recipe: helix },
    { key: 'christmasTree', displayName: 'Christmas Tree', recipe: christmasTree },
    { key: 'solidsphere', displayName: 'Solid Sphere', recipe: solidsphere },
    { key: 'dragonsBreath', displayName: "Dragon's Breath", recipe: dragonsBreath },
];

export const patternKeys = patternDefinitions.map(({ key }) => key);

export const patternDisplayNames = Object.fromEntries(
    patternDefinitions.map(({ key, displayName }) => [key, displayName])
);

export const recipeMap = Object.fromEntries(
    patternDefinitions.map(({ key, recipe }) => [key, recipe])
);
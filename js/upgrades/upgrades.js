// id          : unique string key (used for saving/loading)
// group       : 'BASE' or 'PATTERN' etc.
// pattern     : pattern name if group==='PATTERN', else null
// name        : human-readable title
// desc        : description shown in UI
// baseCost    : starting price
// costRatio   : multiplier for each level
// currency    : 'sparkles' | 'gold'
// maxLevel    : maximum purchasable level (1 for single-purchase)
// apply(game, level): callback executed after purchase and on load.

const UPGRADE_DEFINITIONS = [
    {
        id: 'base_mult_1',
        group: 'BASE',
        pattern: null,
        name: 'Spark Core I',
        desc: '+2 sparkles per component',
        baseCost: 1000,
        costRatio: 1.5,
        currency: 'sparkles',
        maxLevel: 3,
        apply: (game, level) => { game.baseSparkleMultiplier += 2 * level; }
    },
    {
        id: 'base_mult_2',
        group: 'BASE',
        pattern: null,
        name: 'Spark Core II',
        desc: '+5 sparkles per component',
        baseCost: 5000,
        costRatio: 1.5,
        currency: 'gold',
        maxLevel: 3,
        apply: (game, level) => { game.baseSparkleMultiplier += 5 * level; }
    },
];

import { FIREWORK_CONFIG } from '../config/config.js';
Object.keys(FIREWORK_CONFIG.patternGravities).forEach(pattern => {
    UPGRADE_DEFINITIONS.push({
        id: `pattern_${pattern}_boost`,
        group: 'PATTERN',
        pattern,
        name: `${pattern.charAt(0).toUpperCase() + pattern.slice(1)} Booster`,
        desc: `x2 sparkles per '${pattern}' component`,
        baseCost: 750,
        costRatio: 1.0,
        currency: 'sparkles',
        maxLevel: 1,
        apply: (game, level) => {
            const current = game.patternSparkleMultipliers[pattern] ?? 1;
            game.patternSparkleMultipliers[pattern] = current * (2 ** level);
        }
    });
});

export { UPGRADE_DEFINITIONS }; 
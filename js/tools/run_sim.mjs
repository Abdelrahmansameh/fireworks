
import { ProgressionSimulator } from './ProgressionSimulator.js';
const simulator = new ProgressionSimulator();
const result = simulator.simulate(40, { clicksPerSec: 4, baseDroneYieldPerSec: 100, baseCatchYieldPerSec: 100 });
result.events.forEach(e => {
    const m = Math.floor(e.time / 60).toString().padStart(2, '0');
    const s = (e.time % 60).toString().padStart(2, '0');
    console.log(`[${m}:${s}] ${e.label}`);
});
console.log("Unpurchased Upgrades:");
// Wait result.unpurchasedUpgrades might not be an array if everything bought
if (result.unpurchasedUpgrades) {
    result.unpurchasedUpgrades.forEach(u => console.log(u.name));
}

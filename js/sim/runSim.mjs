// Node CLI harness for the headless progression simulator.
//   node js/sim/runSim.mjs [minutes] [clicksPerSec] [--events]
// Prints a per-minute income-SHARE table (the key balance diagnostic: which
// source reigns each minute and whether any source dies), plus a final summary.
import { HeadlessSimulator } from './HeadlessSimulator.js';

const minutes = parseFloat(process.argv[2]) || 25;
const clicksPerSec = process.argv[3] !== undefined && !process.argv[3].startsWith('--')
    ? parseFloat(process.argv[3]) : 4;
const showEvents = process.argv.includes('--events');

const sim = new HeadlessSimulator();
const result = sim.simulate(minutes, { clicksPerSec });

const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const n = (v) => Math.floor(v).toLocaleString();

console.log(`\n=== SIM: ${minutes} min @ ${clicksPerSec} clicks/s ===\n`);

// ── Per-minute share table ───────────────────────────────────────────────────
// Parse the per-minute MINUTE events into source deltas.
const SRC = ['clicks', 'launchers', 'generators', 'drones', 'crowdCatch', 'finale'];
const rows = [];
for (const e of result.events) {
    if (e.type !== 'minute') continue;
    const m = /clicks (\d+), launchers (\d+), generators (\d+), drones (\d+), crowdCatch (\d+), finale (\d+); Gold — crowd (\d+)/.exec(e.label);
    if (!m) continue;
    const vals = { clicks: +m[1], launchers: +m[2], generators: +m[3], drones: +m[4], crowdCatch: +m[5], finale: +m[6] };
    const gold = +m[7];
    const tot = SRC.reduce((a, k) => a + vals[k], 0) || 1;
    rows.push({ min: Math.round(e.time / 60), vals, tot, gold });
}

console.log('min |  clicks  launch    gen   drone  catch finale | reign       | spk/s      | gold/s');
console.log('----+------------------------------------------------+-------------+------------+-------');
for (const r of rows) {
    const pct = (k) => `${String(Math.round(r.vals[k] / r.tot * 100)).padStart(5)}%`;
    let reign = SRC[0], rv = -1;
    for (const k of SRC) if (r.vals[k] > rv) { rv = r.vals[k]; reign = k; }
    const reignName = { clicks: 'CLICKS', launchers: 'LAUNCHERS', generators: 'GENERATORS', drones: 'DRONES', crowdCatch: 'CROWD-CATCH', finale: 'FINALE' }[reign];
    console.log(
        `${String(r.min).padStart(3)} |${pct('clicks')}${pct('launchers')}${pct('generators')}${pct('drones')}${pct('crowdCatch')}${pct('finale')} | ${reignName.padEnd(11)} | ${n(r.tot / 60).padStart(10)} | ${n(r.gold / 60).padStart(5)}`
    );
}

// ── Final lifetime summary ───────────────────────────────────────────────────
const s = result.productionBreakdown.sparkles;
const sTotal = Object.values(s).reduce((a, b) => a + b, 0) || 1;
console.log('\n--- Lifetime sparkles by source ---');
console.log(`  Total: ${n(sTotal)}`);
for (const [k, v] of Object.entries(s)) {
    console.log(`    ${k.padEnd(14)} ${n(v).padStart(16)}  (${(v / sTotal * 100).toFixed(1)}%)`);
}
console.log(`  Gold (crowd): ${n(result.productionBreakdown.gold.crowd)}`);

// ── Pacing: upgrade/unlock cadence ───────────────────────────────────────────
const upgradeTimes = result.events.filter(e => e.type === 'upgrade' || e.type === 'building');
const lastMeaningful = upgradeTimes.length ? upgradeTimes[upgradeTimes.length - 1].time : 0;
console.log(`\n--- Pacing ---`);
console.log(`  Last purchase (upgrade/building): ${fmt(lastMeaningful)}`);
const firstCrowd = result.events.find(e => e.type === 'crowd');
console.log(`  First crowd: ${firstCrowd ? fmt(firstCrowd.time) : 'never'}`);
for (const u of ['resource_generator', 'drone_hub', 'catapult']) {
    const ev = result.events.find(e => e.type === 'unlock' && e.label.includes(u));
    console.log(`  Unlock ${u}: ${ev ? fmt(ev.time) : 'never'}`);
}
console.log(`  Unpurchased at end: ${result.unpurchasedUpgrades.map(u => u.name + (u.visible ? '' : '[hidden]')).join(', ') || 'none'}`);

if (showEvents) {
    console.log('\n--- Full timeline ---');
    for (const e of result.events) {
        if (e.type === 'minute' || e.type === 'crowd') continue;
        console.log(`[${fmt(e.time)}] ${e.type.toUpperCase().padEnd(8)} ${e.label}`);
    }
}

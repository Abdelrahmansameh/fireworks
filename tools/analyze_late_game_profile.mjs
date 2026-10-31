#!/usr/bin/env node
// Aggregate profile_late_game.mjs captures into a standalone, shareable HTML report.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'traces/late-game-profile');
const runs = [];
for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = join(root, entry.name);
    let summary;
    try { summary = JSON.parse(await readFile(join(directory, 'summary.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    summary.directory = entry.name;
    try {
        const profile = JSON.parse(await readFile(join(directory, 'cpu.cpuprofile'), 'utf8'));
        const nodes = new Map(profile.nodes.map(node => [node.id, node]));
        const parents = new Map();
        for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
        const totals = new Map();
        let sampled = 0, idle = 0, gc = 0;
        for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
            const id = profile.samples[i];
            const milliseconds = (profile.timeDeltas[i] ?? 0) / 1000;
            sampled += milliseconds;
            const node = nodes.get(id);
            if (node.callFrame.functionName === '(idle)') idle += milliseconds;
            if (node.callFrame.functionName === '(garbage collector)') gc += milliseconds;
            let current = id;
            const visited = new Set();
            while (current !== undefined && !visited.has(current)) {
                visited.add(current);
                const frame = nodes.get(current).callFrame;
                const key = JSON.stringify([frame.functionName, frame.url, frame.lineNumber, frame.columnNumber]);
                const total = totals.get(key) ?? { name: frame.functionName || '(anonymous)', url: frame.url,
                    line: frame.lineNumber + 1, column: frame.columnNumber + 1, selfMs: 0, inclusiveMs: 0 };
                total.inclusiveMs += milliseconds;
                if (current === id) total.selfMs += milliseconds;
                totals.set(key, total);
                current = parents.get(current);
            }
        }
        summary.cpu = { sampledMs: sampled, idleMs: idle, activeMs: sampled - idle, gcMs: gc,
            functions: [...totals.values()].map(total => ({ ...total,
                selfPercentActive: total.selfMs / (sampled - idle) * 100,
                inclusivePercentActive: total.inclusiveMs / (sampled - idle) * 100,
            })).sort((a, b) => b.selfMs - a.selfMs) };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    runs.push(summary);
}
runs.sort((a, b) => ['baseline', 'late', 'finale', 'stress'].indexOf(a.scenario)
    - ['baseline', 'late', 'finale', 'stress'].indexOf(b.scenario) || a.mode.localeCompare(b.mode) || a.variant.localeCompare(b.variant));
await writeFile(join(root, 'results.json'), JSON.stringify(runs, null, 2));
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fixed = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const link = (run, name, label = name) => `<a href="${encodeURI(run.directory)}/${name}">${escape(label)}</a>`;
const by = (scenario, mode, variant = 'normal') => runs.find(run => run.scenario === scenario && run.mode === mode && run.variant === variant);
const lateTiming = by('late', 'timing');
const finaleTiming = by('finale', 'timing');
const stressTiming = by('stress', 'timing');
const lateObserve = by('late', 'observe');
const stressLight = by('stress', 'gpu');
const breakdown = ['particles', 'renderer', 'crowd', 'buildings', 'ui', 'save', 'drones', 'fireworks', 'background'];
const friendly = { particles: 'Particle simulation', renderer: 'WebGL render submission', crowd: 'Crowd physics + animation + scans',
    buildings: 'Building updates + animations', ui: 'UI refresh', save: 'Serialize + localStorage saves', drones: 'Drones + spatial grid',
    fireworks: 'Rocket movement + explosions', background: 'Background twinkle update' };
const measurements = runs.map(run => `<tr><td>${escape(run.scenario)}</td><td>${escape(run.mode)}</td><td>${escape(run.variant)}</td>
    <td>${fixed(run.fps, 1)}</td><td>${fixed(run.mainThreadWorkMs.mean)}</td><td>${fixed(run.mainThreadWorkMs.p95)}</td>
    <td>${fixed(run.frameIntervalMs.p95)}</td><td>${run.final.particles.toLocaleString('en')}</td><td>${run.final.drones ?? '—'}</td>
    <td>${run.gpu?.supported ? fixed(run.gpu.timeMs.mean) : '—'}</td><td>${link(run, 'summary.json', 'JSON')} · ${link(run, 'scene.png', 'scene')}
    ${run.mode === 'cpu' ? ' · ' + link(run, 'cpu.cpuprofile', 'CPU') : ''}${run.mode === 'trace' ? ' · ' + link(run, 'trace.json', 'trace') : ''}</td></tr>`).join('');
const subsystemRows = breakdown.map(name => `<tr><td>${escape(friendly[name])}</td>${[lateTiming, finaleTiming, stressTiming].map(run => `<td>${fixed(run?.functions[name]?.inclusive.mean)}</td>`).join('')}</tr>`).join('');
const timingRows = runs.filter(run => run.mode === 'timing').map(run => {
    const base = by(run.scenario, 'timing');
    return `<tr><td>${escape(run.scenario)}</td><td>${escape(run.variant)}</td><td>${fixed(run.mainThreadWorkMs.mean)}</td>
    <td>${run.variant === 'normal' ? 'reference' : fixed(base?.mainThreadWorkMs.mean - run.mainThreadWorkMs.mean) + ' ms'}</td>
    <td>${fixed(run.functions.particles?.inclusive.mean)}</td><td>${fixed(run.functions.drawNormal?.inclusive.mean)}</td></tr>`;
}).join('');
const cpuSections = runs.filter(run => run.cpu).map(run => `<h3>${escape(run.scenario)} CPU samples</h3>
    <p>${fixed(run.cpu.sampledMs / 1000)} seconds sampled; ${fixed(run.cpu.idleMs / 1000)} seconds idle. GC: ${fixed(run.cpu.gcMs)} ms,
    ${fixed(run.cpu.gcMs / run.cpu.activeMs * 100)}% of non-idle samples. Inclusive values overlap child functions.</p>
    <div class="scroll"><table><thead><tr><th>Function</th><th>Location</th><th>Self, active CPU</th><th>Inclusive, active CPU</th></tr></thead><tbody>
    ${run.cpu.functions.filter(row => row.url || row.name === '(garbage collector)').slice(0, 18).map(row => `<tr><td>${escape(row.name)}</td>
    <td><code>${escape(row.url.replace(/^.*\/js\//, 'js/'))}:${row.line}</code></td><td>${fixed(row.selfPercentActive)}%</td><td>${fixed(row.inclusivePercentActive)}%</td></tr>`).join('')}
    </tbody></table></div>`).join('');
let traceAnalysis;
let stressFrames;
try { traceAnalysis = JSON.parse(await readFile(join(root, 'finale-trace-normal-713/trace-analysis.json'), 'utf8')); } catch {}
try { stressFrames = JSON.parse(await readFile(join(root, 'stress-timing-normal-713/frame-analysis.json'), 'utf8')); } catch {}
const gpuRows = runs.filter(run => run.mode === 'gpu').map(run => `<tr><td>${escape(run.scenario)}</td><td>${escape(run.variant)}</td>
    <td>${fixed(run.gpu?.timeMs.mean)}</td><td>${fixed(run.gpu?.timeMs.p95)}</td><td>${run.gpu?.samples ?? 0}</td><td>${run.gpu?.disjoint ?? 0}</td></tr>`).join('');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fireworks — late game performance profile</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#101622;color:#e9edf5}body{max-width:1250px;margin:auto;padding:40px 28px 80px}
h1{font-size:38px;letter-spacing:-1px;margin:0 0 10px}h2{font-size:25px;margin:42px 0 14px}h3{margin-top:30px}p,li{line-height:1.65;color:#bdcadb}
a{color:#92d1ff}strong{color:#fff}code{font-size:12px;color:#c4d9e8}table{border-collapse:collapse;width:100%;font-size:14px;text-align:left}th,td{padding:11px 13px;border-bottom:1px solid #2b374a;vertical-align:top}th{background:#1c2739;color:#fff;white-space:nowrap}td{color:#cad6e6}tbody tr:nth-child(even){background:#151e2b}.scroll{overflow:auto}.lead{font-size:18px;max-width:1000px}.note{border-left:3px solid #7199cb;padding:12px 18px;background:#172133}.findings li{margin-bottom:17px}img{width:100%;border-radius:8px;border:1px solid #344057}summary{cursor:pointer;color:#92d1ff;padding:12px 0}.meta{font-size:13px;color:#91a5bb}.pill{display:inline-block;padding:5px 10px;background:#22344b;border-radius:7px;margin:0 8px 8px 0}</style>
<h1>Fireworks: late game performance profile</h1>
<p class="lead">Live Chrome measurements with all progression and upgrades unlocked, 32 automatic launchers, 3 generators, 3 catapults, 3 drone hubs, 40 crowd members, and a fleet capped at 6 drones.</p>
<p><span class="pill">Ryzen 7 5800X</span><span class="pill">RTX 3070 · D3D11 ANGLE</span><span class="pill">1600 × 900 · DPR 1</span><span class="pill">Chrome 155 · Windows</span></p>
<p class="meta">Captured October 17, 2026. Game revision f680a21d8a1565a57a56bfeb1c859f189d3d1ac3. Disposable Chrome profile with real localStorage; the player's save is untouched. Diagnostic variants modify runtime methods in that session only.</p>
<p class="note">Preset late game: <strong>${fixed(lateObserve?.mainThreadWorkMs.mean)} ms</strong> mean update/render work at <strong>${fixed(lateObserve?.fps, 0)} FPS</strong>. Heavy custom recipes + finale: <strong>${fixed(stressLight?.mainThreadWorkMs.mean)} ms</strong> in the light GPU capture at <strong>${fixed(stressLight?.fps, 0)} FPS</strong>; detailed instrumentation reaches <strong>${fixed(stressTiming?.mainThreadWorkMs.p95)} ms p95</strong>. Preset scenes have headroom at 60 Hz on this desktop; the heavy scene exposes scaling and tail-latency problems.</p>
<h2>Highest-priority findings</h2><ol class="findings">
<li><strong>Particle simulation is the largest CPU cost.</strong> The bulk per-shape loop in <code>js/particles/InstancedParticleSystem.js:208</code> dominates CPU sampling. Detailed captures spend ${fixed(lateTiming?.functions.particles.inclusive.mean)} ms per frame here in late game, ${fixed(finaleTiming?.functions.particles.inclusive.mean)} ms with preset finale, and ${fixed(stressTiming?.functions.particles.inclusive.mean)} ms with custom recipes. In the stress CPU capture it accounts for <strong>53.3% of active CPU</strong>; the <strong>Dragon's Breath callback alone takes 11.5%</strong> (<code>dragonsBreath.js:117</code>, repeated exponential/power/trigonometric plume calculations). Cache invariant curve/motion terms and investigate cheaper evaluation of those particle callbacks. Trail effects keep the sphere buffer at its 24,000-particle cap even during ordinary maxed play. Focus on the hot update loop and a controllable particle budget. Allocation in <code>addParticle</code> is only about 1% of active CPU, and GC is below 1% in these CPU captures.</li>
<li><strong>The 60,000 threshold is not a hard total cap, and slow frames repeat simulation work.</strong> In-flight rockets and ordinary launchers can raise the population beyond the finale's threshold; stress snapshots reached about 101,000 particles. <code>GrandFinaleManager.js:90</code> checks the current population before spawning more rockets, rather than admitting each explosion against a global budget. Separately, <code>FireworkGame.js:342</code> uses <code>ceil(frameDelta * 60)</code>: crossing 16.67 ms repeats the full world traversal at smaller time steps. In the detailed stress run, 119 frames used two passes and two used three, adding 15.15% traversals; 108 of 110 frames with more than 16.67 ms work were multi-pass. A 95-frame chain averaged about 20.4 ms work/frame. Decouple cosmetic/animation updates from physics substeps and investigate a stable simulation cadence while preserving gameplay time.</li>
<li><strong>Background stars generate 922 separate shapes and draws each frame.</strong> All background geometry accounts for 953 normal shapes before rockets. <code>ProcduralBackground.js:207</code> creates individual core/halo/sparkle polygons; <code>Renderer.js:1432</code> sorts and submits all of them without visibility culling. Instance or batch these, then consider batching rocket heads. The star-drawing ablation below isolates the fixed rendering overhead.</li>
<li><strong>Skeleton pose computation is the next substantial simulation cost.</strong> Every crowd member and building evaluates its animation continuously. <code>SkeletonAnimator.js:47</code> allocates a pose Map and per-bone transforms; reuse pose storage, cache invariant data, and consider fewer animation evaluations for distant or offscreen actors. GC is small in these captures, so the main opportunity is the pose computation itself.</li>
<li><strong>An idle cursor path forces layout every frame.</strong> <code>CursorParticles.js:97</code> calls <code>_toWorld</code> from <code>setGrabOutline(null)</code> even without a grab; <code>Renderer.js:1452</code> calls <code>getBoundingClientRect</code> after the UI has been updated. The trace confirms 327.7 ms forced style/layout over 1,421 measured frames, about <strong>0.231 ms/frame</strong>, with every stack pointing to this cursor path. UI <code>textContent</code> writes invalidate layout beforehand. Avoid the bounds read when no outline particles need it and cache the canvas bounds between resizes.</li>
<li><strong>Collector scans spike under custom recipes.</strong> Only falling crowd members scan every particle (<code>Crowd.js:447,954</code>); the full cheering crowd does not. The drones build a shared grid (<code>InstancedDroneSystem.js:199</code>). Scan phases are staggered by one simulation pass, but multi-pass frames can contain both. A representative 29.3 ms stress frame spent 15.7 ms in particles, 3.8 ms building the drone grid, and 3.5 ms scanning for crowd catches. Share the grid and budget or stagger scan work.</li>
<li><strong>Secondary steady costs: UI and saving.</strong> UI text/buttons and full-state serialization plus roughly 20 localStorage writes run each rendered frame (<code>FireworkGame.js:304</code>, <code>GameCore.js:569</code>). These each cost roughly 0.2–0.3 ms per frame in the detailed captures, before the cursor-triggered layout. Throttle these independently and skip unchanged DOM writes.</li>
</ol>
<h2>Measured frame cost</h2><p>Work is elapsed time inside the actual <code>update</code> and <code>render</code> calls. This includes synchronous layout and WebGL submission, but excludes browser work scheduled afterward. FPS here is often limited by the display's roughly 144 Hz cadence. GPU timer values, when supported, measure GPU elapsed time separately and must not be added to CPU timings.</p>
<div class="scroll"><table><thead><tr><th>Scenario</th><th>Capture</th><th>Variant</th><th>FPS</th><th>Work mean, ms</th><th>Work p95, ms</th><th>Interval p95, ms</th><th>Particles at end</th><th>Drones</th><th>GPU mean, ms</th><th>Artifacts</th></tr></thead><tbody>${measurements}</tbody></table></div>
<h2>Subsystem attribution</h2><p>Mean milliseconds per rendered frame, measured with nested wrappers. These rows are separate top-level subsystems; the CPU tables below contain overlapping inclusive rows. Wrapper overhead makes these captures slower than observe mode. Compare variants captured in the same mode.</p>
<table><thead><tr><th>Subsystem</th><th>Late game</th><th>Finale</th><th>Custom recipe stress</th></tr></thead><tbody>${subsystemRows}</tbody></table>
<h2>Controlled diagnostic removals</h2><p>Each capture starts a fresh, seeded session and warms up before recording. Disabling effects is a way to attribute cost, not a proposed visual change. These short runs are directional measurements, not statistically established speedups.</p>
<table><thead><tr><th>Scenario</th><th>Variant</th><th>Mean work, ms</th><th>Work reduction from normal</th><th>Particles update, ms</th><th>Normal draws, ms</th></tr></thead><tbody>${timingRows}</tbody></table>
<h2>Hardware GPU timer queries</h2><p>One asynchronous <code>EXT_disjoint_timer_query_webgl2</code> query is sampled every ten rendered frames. Invalid disjoint samples are excluded. GPU timing overlaps CPU execution; these are not GPU-process trace task durations.</p>
<table><thead><tr><th>Scenario</th><th>Variant</th><th>GPU mean, ms</th><th>GPU p95, ms</th><th>Samples</th><th>Disjoint samples</th></tr></thead><tbody>${gpuRows}</tbody></table>
<p>The finale star-drawing removal reduces GPU time from about 4.31 to 2.98 ms (31%). Removing trails is less useful during the finale: freed sphere-buffer capacity admits more expensive explosion particles, so that variant has a different particle mix and even higher CPU work. A lower trail count alone is not a reliable whole-game optimization.</p>
<h2>CPU sampling</h2><p>V8 samples are weighted by their actual time deltas, with idle samples excluded from percentages. Native browser and driver activity can be charged to the caller or program node; these are main-thread samples, not whole-device CPU utilization.</p>${cpuSections}
<h2>Scenario and measurement details</h2><ul>
<li><strong>Baseline:</strong> fresh game, no buildings or particles. Includes normal background rendering and UI.</li>
<li><strong>Late:</strong> all upgrades at their configured maximum; all 17 unlocked preset recipes assigned round-robin across launchers; about 41.43 automatic fireworks/sec. Game time is set to two hours and firework count to 100,000 to mature the normal crowd formula. Buildings are placed through the milestone helper, with launchers spread and other positions as generated by that helper. Six drones are prefilled through the hubs using their upgraded settings.</li>
<li><strong>Finale:</strong> late state plus the actual Grand Finale. Recording begins eight seconds after triggering, past its six-second ramp; it adds up to 65 fireworks/sec. The actual event duration and 60,000-particle safety threshold remain unchanged.</li>
<li><strong>Stress:</strong> same building and upgrade limits plus finale, using three-layer recipes with all seven particle shapes, lifetime 4, size 0.7, spread 1 (legal editor values). This is deliberately heavier than the starter presets, not a claim about typical play. Each layer preserves its selected pattern and colors.</li>
<li>Simulation remains on its normal engine clock and substep policy. No bot fast-forward, CPU throttling, or software GPU is used. There is no pointer activity during recording; browser audio autoplay permissions are not explicitly unlocked. Recording and sampling have overhead; headless results on this desktop do not predict phone performance. Particle counts oscillate, so variant captures are not identical frozen scenes.</li>
<li>The existing GameProfiler excludes rendering and rocket updates from its frame bracket, records even when its recording flag is false, and treats simulation substeps as frames. It was left enabled to preserve production behavior; all reported total frame costs come from the external harness.</li>
<li>Heap snapshots sampled over seconds do not establish a leak. No runtime page errors are expected; inspect each summary's <code>errors</code> field.</li>
</ul>
<h2>Reproduce</h2><p>Serve the repository on port 8765, then run the commands from its root. Each command uses a fresh disposable Chrome profile.</p>
<pre><code>node tools/profile_late_game.mjs --scenario=late --mode=observe --seconds=12
node tools/profile_late_game.mjs --scenario=late --mode=timing --seconds=12
node tools/profile_late_game.mjs --scenario=finale --mode=cpu --seconds=12
node tools/profile_late_game.mjs --scenario=late --mode=timing --variant=no-star-draw
node tools/profile_late_game.mjs --scenario=late --mode=timing --variant=no-trails
node tools/profile_late_game.mjs --scenario=stress --mode=gpu --seconds=10
node tools/analyze_late_game_profile.mjs</code></pre>
<p>Raw Chrome CPU captures can be loaded in DevTools' JavaScript Profiler; the timeline trace can be loaded in the Performance panel. <a href="results.json">All structured results</a>.</p>
${traceAnalysis ? '<p><a href="finale-trace-normal-713/trace-analysis.json">Detailed timeline analysis</a>: style/layout, GC, paint, and a driver/vsync-correlated scheduling hitch.</p>' : ''}
${stressFrames ? '<p><a href="stress-timing-normal-713/frame-analysis.json">Stress frame and simulation-pass analysis</a>: one/two/three-pass comparisons, consecutive slow frames, and scan phases.</p>' : ''}
${runs.filter(run => run.variant === 'normal' && ['late', 'stress'].includes(run.scenario) && run.mode === 'timing').map(run => `<details><summary>${escape(run.scenario)} scene</summary><img alt="${escape(run.scenario)} profiling scene" src="${encodeURI(run.directory)}/scene.png"></details>`).join('')}
</html>`;
await writeFile(join(root, 'report.html'), html);
console.log(JSON.stringify({ report: join(root, 'report.html'), runs: runs.length,
    failures: runs.filter(run => run.errors.length).map(run => ({ directory: run.directory, errors: run.errors })) }));

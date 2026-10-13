# Architecture Refactor Plan — Entities, Systems, Events, Saves, UI

## Why (evidence from the current code)

The game works, but four structural problems make every change harder than it should be:

1. **Three god objects.**
   - `GameCore` (600 lines) owns resources, buildings, upgrades, recipes, unlocks,
     stat buckets, persistence, and the headless economy — *and* calls 20+ named UI
     methods (`showBuildingsTab`, `updateBuildingCosts`, …).
   - `FireworkGame` (1080 lines) extends it and adds renderer, particles, drones,
     crowd, camera, cinematics, input glue, *and recipe editing that reads the DOM
     directly* (`document.getElementById('recipe-name')` inside game logic).
   - `UIManager` (1940 lines) does DOM updates **and** canvas input: camera panning,
     launcher dragging, crowd grabbing — world interactions living in the UI layer.
   - Coupling counts: game classes call `this.ui.*` at **43** sites; UI files reach
     into `this.game.*` at **154** sites. Bidirectional, by name, untyped.

2. **Serialization is scattered.** 43 direct `localStorage`/`storage` calls across 5
   files, ~14 separate keys, ad-hoc `JSON.parse` with per-site error handling.
   `saveProgress()` runs **every rendered frame** (FireworkGame `updateGame` →
   `isFinalStep` branch) — a dozen `JSON.stringify` + storage writes per frame.
   A `SAVE_VERSION` bump **wipes the player's save** instead of migrating.

3. **Dependencies are implicit and duplicated.** Everything receives `this.game` and
   pokes at everything else. Callbacks are assigned ad hoc (`crowd.onCoinDrop = …`,
   re-assigned again in `resetGame`). Cost math exists twice
   (`Building.getPurchaseCost` and `GameCore.calculateAutoLauncherCost`, with a
   "mirror" comment). `resetGame()` re-declares every stat-bucket default verbatim.
   `NullUI` is a Proxy that swallows *any* method call — a typo'd UI call never errors.

4. **The UI pattern is push-by-name.** Game logic decides *which* DOM refresh to call
   (`updateBuildingCounts`, `updateLauncherList`, `renderUpgrades` …). Adding a fact
   to the game means finding every UI method that might display it.

**What must be preserved:** the headless simulator (`js/sim/runSim.mjs` →
`HeadlessSimulator` → `GameCore.stepHeadless`) is the balance-validation tool and the
best thing about the current architecture. Every phase below keeps it running and is
verified against it.

---

## Target architecture

Four pillars: **Entities+Components** for placed gameplay objects, **World+Systems**
for global behaviour, **one EventBus + facades** for dependencies, **SaveSystem** with
per-participant serialization. UI becomes a subscriber, never a callee.

### Guiding decisions (with reasoning)

| Decision | Choice | Why |
|---|---|---|
| ECS vs GameObject/Component | **GameObject/Component** (Unity-style actors), *not* archetype ECS | Entity counts are tiny (dozens of buildings). The high-count things (particles, drones, crowd) are already data-oriented instanced systems — that *is* the correct pattern for them; wrap them as systems, don't force them into entities. Full ECS buys nothing here and costs readability. |
| Events both directions? | **Commands down, events up** | UI → game goes through a small `GameAPI` facade (plain method calls: traceable, steppable in a debugger). Game → UI/audio/stats goes through events (decoupled: emitters don't know listeners). Events in both directions makes control flow untraceable. |
| Continuous values (sparkle count, rates) | **Polled, not evented** | Emitting `resource.changed` 60×/s per resource is an event storm. UI polls a read-only `GameView` once per frame and dirty-checks before touching the DOM. Events are for *discrete* facts only (purchase, unlock, finale start…). This is the standard engine split. |
| Framework / bundler | **Stay vanilla ES modules** | Matches the repo; no build step to maintain; nothing here needs a framework. |
| Inheritance for buildings | **Composition from config** | `AutoLauncher extends Building` mixes mesh creation, animation, economy, and hit-testing in one class. Components split those; building *types* become data. |

### Layout

```
js/
  engine/                      ← generic, knows nothing about fireworks
    core/World.js              ← entity registry + system registry + update order
    core/Entity.js             ← id, transform, component map
    core/Component.js          ← base: init/update/serialize/deserialize/dispose
    core/System.js             ← base: init/update/serialize/deserialize
    events/EventBus.js         ← see "Events" below
    save/SaveSystem.js         ← versioned document, saveable registry, migrations
    loop/GameLoop.js           ← fixed-timestep sim + interpolated render
  game/
    Game.js                    ← LIVE composition root (replaces FireworkGame-as-subclass)
    HeadlessGame.js            ← SIM composition root (same world, fewer systems)
    events.js                  ← every event name as a constant + payload shape docs
    api/GameAPI.js             ← the only object UI may call
    api/GameView.js            ← read-only model UI polls each frame
    systems/                   ← EconomySystem, ProgressionSystem, BuildingSystem,
                                 FireworkSystem, CrowdSystem, DroneSystem,
                                 ParticleSystem, FinaleSystem, CinematicSystem,
                                 InputSystem, CameraSystem, AudioSystem,
                                 StatsSystem, SaveSystem(wired), RecipeSystem
    components/                ← SkeletonSprite, StaticSprite, RecipeLauncher,
                                 ResourceProduction, DroneSpawner, CatapultBehaviour,
                                 Draggable, Highlightable, …
  ui/                          ← panels keep their current data-driven structure,
                                 but mount(api, view, events) — never see the game
```

---

## Pillar 1 — Entities + Components (buildings and future actors)

```js
// engine/core/Entity.js
class Entity {
    constructor(type, id) {
        this.type = type;                 // 'AUTO_LAUNCHER' — config key
        this.id = id;
        this.transform = { x: 0, y: 0, rotation: 0, scale: 1 };
        this.components = [];             // ordered array (stable iteration, no Map overhead)
        this._byName = new Map();         // lookup by component name
    }
    add(component) { … }                  // sets component.entity, calls init(ctx)
    get(name) { return this._byName.get(name); }
    update(dt) { for (const c of this.components) c.enabled && c.update(dt); }
    serialize() {
        const out = { type: this.type, id: this.id, transform: { ...this.transform } };
        for (const c of this.components) {
            const d = c.serialize?.();
            if (d) (out.components ??= {})[c.name] = d;
        }
        return out;
    }
}
```

Building types become **data**, not classes:

```js
// config/BuildingConfig.js — each type declares its components
AUTO_LAUNCHER: {
    …existing cost/size/ui fields…,
    components: [
        ['SkeletonSprite',  { skeleton: 'auto_launcher', scale: 0.9 }],
        ['RecipeLauncher',  { baseInterval: 5 }],
        ['Draggable',       { boundsKey: 'LAUNCHER' }],
        ['Highlightable',   {}],
    ],
},
RESOURCE_GENERATOR: {
    …,
    components: [
        ['StaticSprite',        { textureKey: 'generator_texture' }],
        ['ResourceProduction',  { resource: 'sparkles' }],
        ['Highlightable',       {}],
    ],
},
```

`BuildingSystem.create(typeKey, x, y, savedData)` instantiates the entity from a
component registry. **Adding a building type = a config entry + at most one new
component.** No subclass, no manager edits, and the existing data-driven UI panel
already renders it from `BUILDING_TYPES`.

**Headless story improves:** presentation components (`SkeletonSprite`,
`StaticSprite`) are simply *not attached* when the world has no renderer service
(component registry filters on `ctx.renderer == null`). Logic components
(`RecipeLauncher`, `ResourceProduction`) run identically live and headless — today
this separation is done per-class with NullRenderer tricks; it becomes per-component
and automatic.

Rules that keep this honest:
- Components hold **their own** state only; they reach siblings via `entity.get()`
  and the world via the context handed to `init(ctx)` (services + event bus + stats).
- Logic components never touch the renderer; sprite components never touch the economy.
- `update` order within an entity = declaration order in config (deterministic).

---

## Pillar 2 — World + Systems

```js
// engine/core/World.js
class World {
    constructor(services) {
        this.services = services;   // { renderer, audio, storage, rng, now, events, stats }
        this.systems = [];          // explicit, ordered
        this.entities = new Map();
    }
    addSystem(system) { … }         // system.init(this)
    update(dt) { for (const s of this.systems) s.update(dt); }
}
```

- **Systems own global behaviour** (economy tick, progression checks, crowd sim,
  particle sim, finale, camera, input). Current managers map ~1:1 onto systems —
  `BuildingManager`→`BuildingSystem`, `ProgressionManager`→`ProgressionSystem`,
  `ResourceManager`→`EconomySystem`, `GrandFinaleManager`→`FinaleSystem`, etc.
  The instanced particle/drone/crowd internals **stay exactly as they are** —
  they're already the right design — they just get a System wrapper with a clean
  boundary instead of being fields poked from three places.
- **Update order is one array in the composition root** — today it's implicit in
  `updateGame()`'s body with ordering comments ("cinematic runs after crowd so
  camera reads final person.x"). Make that comment structural.
- **Composition roots replace inheritance.** `FireworkGame extends GameCore` becomes:

```js
// game/Game.js (live)
const world = new World({ renderer, audio, storage: localStorage, rng, events, … });
world.addSystem(new EconomySystem());
world.addSystem(new ProgressionSystem());
world.addSystem(new BuildingSystem());
world.addSystem(new FireworkSystem());
world.addSystem(new DroneSystem());       // presentation-dependent
world.addSystem(new CrowdSystem());       // presentation-dependent
world.addSystem(new CinematicSystem());   // "
world.addSystem(new FinaleSystem());
world.addSystem(new InputSystem());       // canvas pointer → world interactions
world.addSystem(new CameraSystem());
world.addSystem(new StatsSystem());
world.addSystem(new SaveSystem());

// game/HeadlessGame.js (sim) — same list minus presentation systems,
// plus EmergentYieldSystem + HeadlessCrowdSystem standing in for them.
```

The headless sim stops being "a base class with nulls" and becomes "the same world
with a different system list" — which is what it conceptually is.

- **Fixed-timestep loop.** `GameLoop` accumulates real time and runs
  `world.update(FIXED_DT)` N times per frame, rendering once with interpolation.
  Live game, headless sim, and the bot's fast-forward all become "run N fixed
  ticks" — the bot's sub-stepping loop and `isFinalStep` plumbing disappear.

---

## Pillar 3 — Dependencies: commands down, events up

### EventBus (performance-first)

```js
// engine/events/EventBus.js
class EventBus {
    constructor() { this._listeners = new Map(); }        // name → array of fns
    on(name, fn)  { … push, return unsubscribe … }
    emit(name, payload) {                                  // no spread, no varargs,
        const arr = this._listeners.get(name);             // no allocation on the
        if (!arr) return;                                  // zero-listener path
        for (let i = 0; i < arr.length; i++) arr[i](payload);
    }
}
```

```js
// game/events.js — constants, not string literals (typo → immediate error, greppable)
export const EV = {
    BUILDING_PURCHASED: 'building.purchased',   // { type, entityId, cost, count }
    UPGRADE_PURCHASED:  'upgrade.purchased',    // { id, level, cost }
    UNLOCK_GRANTED:     'unlock.granted',       // { id }
    PATTERN_UNLOCKED:   'pattern.unlocked',     // { key }
    RECIPES_CHANGED:    'recipes.changed',      // { recipes }
    FIREWORK_LAUNCHED:  'firework.launched',    // { source }
    FINALE_STARTED:     'finale.started',
    NOTIFY:             'ui.notify',            // { message }
    GAME_RESET:         'game.reset',
};
```

**Performance rules (the part that keeps events fast):**
- Events are for **discrete facts**, never continuous values. No `resource.changed`
  60×/s; no per-particle events. Continuous numbers go through `GameView` polling.
- Emit sites reuse payload objects where hot (none should be hot if the rule above
  is followed).
- Listener arrays, indexed loop, no closures allocated at emit time.
- Optional (only if re-entrancy bites): a deferred queue flushed at one fixed point
  per tick. Start synchronous — it's simpler and traceable.

### Commands: the GameAPI facade

```js
// game/api/GameAPI.js — the ONLY surface the UI (and the bot, and cheats) may call
class GameAPI {
    buyBuilding(typeKey) { … }        // delegates to BuildingSystem
    buyUpgrade(id) { … }
    resetUpgrades() { … }             // returns refunds
    saveRecipe(name, components) { … }// takes DATA — no DOM reads in game code
    eraseRecipes() { … }
    launchAt(x, y) { … }
    cheat = { addSparkles(n) {…}, unlockAll() {…}, spawnDrones(n) {…}, … };
}
```

### Reads: the GameView read-model

```js
// game/api/GameView.js — read-only; UI polls this once per frame
class GameView {
    get sparkles() {…}  get gold() {…}  get sps() {…}  get gps() {…}
    get crowdCount() {…}
    buildingCount(type) {…}  buildingCost(type) {…}
    upgradeInfo(id) {…}      // { level, cost, canBuy, visible, reason }
    get recipes() {…}
    isUnlocked(id) {…}
}
```

Net effect on the god-object coupling:
- The **43** `this.ui.*` call sites in game code → `events.emit(EV.…)` (or deleted:
  most of the `showXTab` zoo becomes one generic unlock listener, below).
- The **154** `this.game.*` reaches in UI code → `api.*` calls + `view.*` reads.
- `NullUI`, and most of `NullRenderer`'s reason to exist, are deleted — headless
  simply has no subscribers and no presentation systems. Typos now throw.

---

## Pillar 4 — Serialization: SaveSystem

One versioned document, one storage key, per-system/per-entity ownership:

```json
{
  "version": 5,
  "savedAt": 1770000000000,
  "systems": {
    "economy":     { "sparkles": …, "gold": … },
    "progression": { "upgrades": {…}, "unlocked": […], "firstClicks": {…} },
    "recipes":     { "recipes": […], "current": […], "cursorIndex": 0 },
    "fireworks":   { "count": … },
    "stats":       { … },
    "flags":       { "seenFirstCrowdCinematic": true, "advancedCreator": false }
  },
  "entities": [
    { "type": "AUTO_LAUNCHER", "id": "…", "transform": {…},
      "components": { "RecipeLauncher": { "assignedRecipeIndex": 3 } } }
  ]
}
```

```js
// engine/save/SaveSystem.js
class SaveSystem {
    register(key, saveable) { … }   // saveable: { save(): data, load(data): void }
    snapshot() { … }                // build the document from all registrants
    persist() { … }                 // one storage.setItem
    restore() { … }                 // read, run migrations, dispatch to registrants
}
```

- Every system that persists registers itself; entities are serialized by
  `BuildingSystem` via `entity.serialize()` — **each component serializes only its
  own fields** (`RecipeLauncher` saves `assignedRecipeIndex`; `SkeletonSprite`
  saves nothing).
- **Migrations replace save-wiping.** `migrations = { 4: (old) => new5 }`, run in
  sequence. The 4→5 migration reads today's ~14 scattered keys into the new
  document once, so **no player loses progress** in this refactor.
- **Autosave is throttled**: every 15s, plus on `visibilitychange`/`beforeunload`,
  plus after important events (purchase, unlock). Kills the current
  every-frame save — one of the cheapest real perf wins available.
- UI *preferences* (volume, floating-sparkle toggle) live in a separate small
  `settings` registrant so a game reset can keep them (fixes `localStorage.clear()`
  in `resetGame()` nuking audio settings today).

---

## Pillar 5 — UI pattern

Keep the good part (data-driven chrome: `uiSchema` + `UIBuilder` + panels from the
previous refactor). Fix the flow:

- **Panels get a lifecycle and their own dependencies:**

```js
// each panel module/class
export function mount(container, { api, view, events }) {
    // build DOM once, cache element refs locally
    // wire buttons → api.* calls
    // subscribe to discrete events (unsubs kept for unmount)
    return {
        update() { /* per-frame: read view.*, dirty-check, write cached refs */ },
        unmount() { /* remove listeners */ },
    };
}
```

- **UIManager shrinks to a shell** (~200 lines): tab bar, panel mount/unmount,
  notification toasts (listening to `EV.NOTIFY`), confirmation dialog. It never
  touches game internals.
- **Unlock reveals become fully generic.** Any DOM element that appears on an
  unlock is tagged `data-unlock-id="buildings_tab"`. One listener:

```js
events.on(EV.UNLOCK_GRANTED, ({ id }) => {
    document.querySelectorAll(`[data-unlock-id="${id}"]`)
        .forEach(el => el.classList.remove('unlock-hidden'));
});
```

  This deletes `showBuildingsTab / showCrowdsTab / showRecipesTab / showTabMenu /
  showSparkleCounter / updateBuildingTypeVisibility / handleUnlock` and the big
  switch in `GameCore._handleUnlock`. Notifications on unlock come from config
  (`unlockDef.notify: 'New building unlocked: …'`), not code.
- **Canvas input leaves the UI layer.** Pointer→world routing, camera panning,
  launcher dragging, crowd grabbing move to `InputSystem` + `CameraSystem` in the
  world (they are gameplay, and they're the reason UIManager needs renderer access
  today). The UI keeps only DOM input.
- **Per-frame UI updates are polled + dirty-checked**: the active panel's `update()`
  runs once per rendered frame, compares against last-written values, and touches
  the DOM only on change. (Panels already cache refs; this formalizes it.)

---

## Extra improvements (recommended, fold into phases below)

1. **Stat/modifier system** replacing the hand-maintained buckets
   (`droneStats`, `crowdStats`, `launcherStats`, …, reset+recomputed by
   `progression.applyAll(this)` mutating the game, and re-declared verbatim in
   `resetGame()`):

```js
stats.define('drone.speedMult', 1);
stats.define('crowd.goldRateMult', 1);
// upgrades contribute modifiers; recompute invalidates a cache + emits nothing
upgradeDef.effects = [{ stat: 'drone.speedMult', op: 'mult', value: 1.15 }];
const v = stats.get('drone.speedMult');   // cached read, hot-path safe
```

   Upgrade *effects* become data in `SkillTreeConfig` instead of code in `applyAll`,
   `resetGame`'s duplicate initializers disappear, and systems read stats instead of
   `this.game.droneStats?.x ?? 1` chains.

2. **One cost module.** `EconomyMath.buildingCost(type, count)` /
   `upgradeCost(def, level)` — delete the duplicated launcher-cost formula in
   `GameCore` and the static on `Building`.

3. **Deterministic RNG service.** `services.rng` already exists in GameCore —
   thread it through systems/components (Crowd, particles use `Math.random`
   directly today). Seeded runs make the sim reproducible and bugs replayable.

4. **Reset = rebuild.** `resetGame()` currently hand-unwinds state (and re-wires
   crowd callbacks, re-creates managers). With composition roots it becomes:
   dispose world → clear save → construct a fresh world. ~10 lines, can't drift.

5. **Tiny test harness.** `node --test` files for: EconomyMath, save
   migrations (old-keys fixture → new document), EventBus, and a sim smoke test
   asserting the balance target (~15 min completion @ 1 click/s) stays within
   tolerance. No framework needed.

6. **JSDoc typedefs + `// @ts-check`** on engine/, api/, and events.js — free
   editor-level type safety for the new seams (payload shapes, component
   interfaces) with no build step.

---

## Migration plan — each phase ships a working game

**Phase 0 — Safety net (half a day).**
Record golden baselines: `runSim.mjs` output (history + events) saved to
`traces/baseline.json`, plus a scripted bot run. Every later phase re-runs these and
diffs. Sim numbers must match (bit-exact where RNG is seeded, tolerance elsewhere).

**Phase 1 — EventBus + event constants (low risk).**
Add `engine/events/EventBus.js`, `game/events.js`. Instantiate on the game object.
Emit facts from existing code paths (purchase, unlock, notify, recipes-changed…).
Nothing subscribes yet except a debug logger (`?events=1` query param). Zero
behaviour change.

**Phase 2 — SaveSystem (high value, self-contained).**
Build registry + versioned document + throttled autosave + the 4→5 migration that
ingests the old scattered keys. Point `GameCore.saveProgress` / `init` loading at it,
delete the scattered calls (GameMetrics, AudioManager, UIManager settings included).
*Verify:* load an existing production save → identical state; autosave no longer
runs per frame.

**Phase 3 — UI decoupling (biggest visible payoff).**
3a. Add `GameAPI` + `GameView`. Panels mount with `{ api, view, events }`; replace
    all `this.game.*` reaches panel by panel (buildings → upgrades → recipes →
    stats → crowd → settings → cheats → bot).
3b. Replace the `this.ui.*` call sites in GameCore/FireworkGame with event emits;
    implement the generic `data-unlock-id` reveal; move recipe DOM logic
    (name reading, list rendering) fully into recipesPanel, with
    `api.saveRecipe(name, components)` taking data.
3c. Move canvas pointer/camera/drag code out of UIManager into
    `InputSystem`/`CameraSystem`. UIManager is now a shell. Delete `NullUI`.

**Phase 4 — World + Systems (structural core).**
Introduce `World`, `System`, `GameLoop` (fixed timestep). Convert managers 1:1 into
systems with an explicit ordered list; `Game.js`/`HeadlessGame.js` composition roots
replace the `FireworkGame extends GameCore` inheritance. `stepHeadless` dissolves
into "the same world minus presentation systems, plus EmergentYieldSystem".
*Verify:* sim baseline matches; bot fast-forward works via tick multiplier.

**Phase 5 — Entities + Components (buildings).**
Add `Entity`/`Component` + component registry. Port building types one at a time
(ResourceGenerator first — simplest; AutoLauncher last — skeleton+overlay animation
becomes `SkeletonSprite`). `BuildingSystem` handles purchase/placement/hit-testing
via a `Draggable`/bounds query instead of `Building` subclass methods. Entity
serialization slots into SaveSystem (same document, version 6 migration).
Delete `Building`, `AutoLauncher`, `ResourceGenerator`, `Catapult`, `DroneHub`,
`BuildingManager` classes.

**Phase 6 — Stats/modifier system.**
Replace multiplier buckets + `applyAll` code-effects with data-driven modifiers.
Delete the duplicated defaults in reset; reset becomes world rebuild.

**Phase 7 — Cleanup + hardening.**
Delete dead shims, unify cost math, seed RNG through services, add the `node --test`
suite, `@ts-check` the new seams, update CLAUDE-facing docs.

Rough sizing: phases 1–2 are days; phase 3 is the largest (touches every panel);
phases 4–5 are structural but mechanical once 1–3 exist. Order matters: events and
saves first because everything later leans on them; UI before World so the
UI seam doesn't have to be rebuilt twice; entities last because they need the
services/event scaffolding.

## Verification per phase

1. `node js/sim/runSim.mjs` output diffs clean against `traces/baseline.json`
   (balance target: skill tree completes ~15 min @ 1 click/s).
2. Manual smoke: fresh boot, load-from-existing-save boot, buy each building,
   buy upgrades, recipe save/assign, reset game, finale trigger, mobile viewport.
3. Bot run (`?bot=1`) at high speed multiplier for stability.
4. From Phase 7: `node --test` green.

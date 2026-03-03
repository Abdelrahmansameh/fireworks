# Entity-Component Architecture Refactoring Plan

This document outlines the step-by-step refactoring plan to transition the game from a monolithic architecture to a clean Entity-Component (EC) and WorldComponent architecture.

## 1. Core Engine Philosophy (js/engine/core/)

All structural classes will implement a standard lifecycle interface conceptually, ensuring standardized scaling and memory management:
*   `init()`: One-time setup, allocations, and event bindings.
*   `start()`: Triggered when the component/entity becomes active.
*   `update(dt)`: Per-frame logic update.
*   `stop()`: Pausing or deactivating logic.
*   `shutdown()`: Complete destruction and garbage collection preparation.
*   `serialize()`: Returns a plain JSON-safe object representing the current state. Must be overridden by any class that holds persistent data.
*   `deserialize(data)`: Restores state from the plain object returned by `serialize()`. Must be symmetric with `serialize()`.

### Files to Create/Update:
*   **`js/engine/Entity.js` (NEW)**
    *   Represents a base container.
    *   Properties: `id` (unique, e.g., uuid/increment), `components` (Map/Array).
    *   Methods: `addComponent(comp)`, `getComponent(type)`, `removeComponent(type)`.
    *   Lifecycle handling: Loops through all active components calling their respective lifecycle methods (`init`, `start`, `update`, etc.).
    *   `serialize()`: Returns `{ id, type: this.constructor.name, components: Object.fromEntries([...this.components.entries()].map(([k, v]) => [k, v.serialize()])) }`.
    *   `static deserialize(data, world)`: Looks up the entity class in `Serializer`, instantiates it, then calls `comp.deserialize(compData)` for each saved component entry.
*   **`js/engine/Component.js` (NEW)**
    *   Base class for all discrete logic chunks.
    *   Properties: `entity` (reference to parent, set by `Entity.addComponent`).
    *   Methods: Implements empty standard lifecycles to be overridden.
    *   `getOwner()`: Returns `this.entity`. Convenience accessor so component subclasses never need to reference the raw property directly.
    *   `getComponentByType(Type)`: Returns `this.entity.getComponent(Type)`, or `undefined` if the component is not present on the owner. Allows components to reach sibling components without holding direct references (e.g., `RocketAscentComponent` calling `this.getComponentByType(TransformComponent)`).
    *   `serialize()`: Returns `{}` by default. Subclasses override to return all persistent fields as a plain object (no class instances, no circular refs).
    *   `deserialize(data)`: No-op by default. Subclasses override to restore fields from the object returned by `serialize()`.
*   **`js/engine/WorldComponent.js` (NEW)**
    *   Base class for all global Systems/Managers.
    *   Properties: `world` (reference to Engine/Game).
    *   `serialize()`: Returns `{}` by default. Stateful world components (e.g., `ResourceManager`) override to snapshot their runtime data.
    *   `deserialize(data)`: No-op by default. Symmetric with `serialize()`.
*   **`js/engine/Engine.js`**
    *   Refactor to maintain lists: `worldComponents` and `entities`.
    *   Methods: `registerWorldComponent(component)`, `addEntity(entity)`, `removeEntity(id)`.
  *   Lookup helper: `getWorldComponent(TypeOrName)` to fetch registered world components by class or name.
    *   Update Loop: Modify `_loop` to iterate over all active `worldComponents[i].update(dt)` and then `entities[i].update(dt)`.
    *   `serializeWorld()`: Returns `{ worldComponents: { [name]: wc.serialize() }, entities: this.entities.map(e => e.serialize()) }`. Safe to call at any point between frames.
    *   `loadWorld(snapshot)`: Calls `wc.deserialize(snapshot.worldComponents[name])` for each registered world component, then reconstructs each entity via `Entity.deserialize(data, this)` and calls `addEntity()`.

## 2. Exhaustive List of World Components (Managers & Systems)

These will act as the core Systems in the ECS and manage global data. They extend `WorldComponent`.

*   **`BuildingSystem`**: Manages all logic for buildings (placement validation, grid management, applying Auras from EfficiencyBoosters).
*   **`InstancedParticleSystem`**: Manages the WebGL instanced rendering buffer for high-count particles (firework explosions, rocket trails, drone trails, sparkle bursts). Handles physics integration.
*   **`DroneSystem`**: Manages steering behaviors, wandering logic, trail emission, and particle detection/pulling for all active drones.
*   **`CrowdSystem`**: Manages the state machine (cheering, grabbed, falling, walking), SpriteSheet animation mapping, ground collisions (bouncing), particle catching, and gold accumulation for crowd members.
*   **`ResourceManager`**: Tracks global currencies (`sparkles`, `gold`) and handles accumulation rates from generators.
*   **`FireworkLaunchSystem`**: Handles spawning Rockets from AutoLaunchers and player input using direct method calls with specific Recipe components.
*   **`InteractionSystem` / `UIManager`**: Handles raycasting/point-in-bounds checks for clicking on buildings, grabbing/dropping crowd members, and upgrading structures. Refactoring DOM updates to run safely inside `update(dt)`.
*   **`AudioManager`**: Plays launch, explosion, coin drop, and other sounds via direct calls from gameplay systems.

## 3. Exhaustive List of Entities (Prefabs)

These are the composite archetypes that will be spawned into the game world:

*   **`AutoLauncher` (Building)**: A fixed structure that periodically spawns Firework Rockets.
*   **`DroneHub` (Building)**: A fixed structure that periodically spawns wandering Drone entities.
*   **`ResourceGenerator` (Building)**: A fixed structure that ticks up global Sparkles or Gold over time, occasionally emitting a visual particle burst.
*   **`EfficiencyBooster` (Building)**: A fixed structure that provides an area-of-effect multiplier to other buildings within its radius.
*   **`Firework Rocket`**: A fast-moving projectile flying upwards with a target Y-coordinate, emitting a trail of particles.
*   **`Drone`**: A flying vehicle entity that wanders aimlessly, steers using vehicular physics, emits a thruster trail, and acts as a magnet for explosion particles.
*   **`Crowd Member`**: A sprite-animated entity on the ground that bobs/cheers, can be dragged and dropped, collects falling particles, and slowly generates gold coins.

## 4. Exhaustive List of Components

The specific data bags and logic units that define behavior across all entities:

### Transform & Visuals
*   **`TransformComponent`**: `x`, `y`, `rotation`, `scale`.
*   **`RenderComponent`**: `color` (RGBA), `mesh/geometry`, `zIndex`, `blendMode`.
*   **`SpriteAnimationComponent`**: `sheetIndex`, `animName`, `currentFrame`, `frameTimer`, `frameCount`, `frameDuration`, `loop`, `bobOffset`, `bobSpeed`.
*   **`HighlightPulseComponent`**: `timer`, `originalColor`, used for flashing yellow when a building is interacted with or upgraded.

### Physics & Movement
*   **`PhysicsFlightComponent`**: `vx`, `vy`, `gravity`, `friction`, `acceleration`, `bounceCount`.
*   **`VehicularSteeringComponent`**: `vx`, `vy`, `targetX`, `targetY`, `currentSpeed`, `maxSpeed`, `oscillationPhase`, `oscillationAmplitude`, `turnThresholdDot`.
*   **`RocketAscentComponent`**: `targetY`, `ascentSpeed`.

### Behaviors & Logic
*   **`BuildingComponent` (base)**: `level`, `baseWidth`, `baseHeight`, `bounds`. Abstract base class — not instantiated directly; each building type implements a concrete subclass that extends it.
*   **`LauncherBuildingComponent`** extends `BuildingComponent`: `spawnInterval`, `accumulator`, `assignedRecipeIndex`, `colorOverride`, `patternOverride`. `update(dt)` ticks accumulator and directly calls `world.getWorldComponent(FireworkLaunchSystem).launchFromBuilding(...)` when ready. Reads `EfficiencyReceiverComponent.currentMultiplier` to scale `spawnInterval`.
*   **`DroneBuildingComponent`** extends `BuildingComponent`: `spawnInterval`, `accumulator`, `maxDrones`. `update(dt)` ticks and directly calls `world.getWorldComponent(DroneSystem).spawnFromHub(...)` when ready. Reads `EfficiencyReceiverComponent`.
*   **`ResourceBuildingComponent`** extends `BuildingComponent`: `resourceType` ('sparkles' | 'gold'), `productionRate`, `accumulator`. `update(dt)` ticks and calls `world.getWorldComponent(ResourceManager).add(type, amount * multiplier)`.
*   **`EfficiencyBuildingComponent`** extends `BuildingComponent`: `radius`, `boostMultiplier`. Data-only — read each frame by `BuildingSystem` to write multipliers into nearby `EfficiencyReceiverComponent`s.
*   **`EfficiencyReceiverComponent`**: `currentMultiplier` (written dynamically by `BuildingSystem` from nearby `EfficiencyBuildingComponent` auras). Present on all non-efficiency building entities.
*   **`DroneAIComponent`**: `lifetime`, `wanderTimer`, `collectionRadius`, `collectedCount`.
*   **`CrowdMemberStateComponent`**: `state` ('cheering' | 'grabbed' | 'falling' | 'walking'), `goldAccumulator`, `coinAnimTimer`.
*   **`LifeTimeComponent`**: `currentAge`, `maxLifetime`.

### Interactions & Emitters
*   **`ClickableComponent` / `BoundsComponent`**: `halfWidth`, `halfHeight` (used for `isPointInside` checks).
*   **`DraggableComponent`**: `isGrabbed`, `grabOffsetX`, `grabOffsetY`, `cursorHistory` (for calculating throw velocity on release).
*   **`ParticleEmitterComponent`**: `spawnRate`, `timer`, `perBurst`, `velocitySpread`, `particleSize`, `particleLifetime`, `particleColor` (used for rocket trails, drone trails, and generator bursts).
*   **`ParticleMagnetComponent`**: `radius`, `pullForce`, `arrivalThreshold`, `maxCaptureTime` (used by Drones and catching Crowd members to suck in nearby particles).

### Upgrade Ownership
*   **Upgrade definitions remain in `js/upgrades/upgrades.js`** and continue to define upgrade costs/effects.
*   **`UIManager`** triggers upgrades via direct calls (no event bus) into owning systems.
*   **Ownership split:**
  *   Building upgrades (`AutoLauncher`, `DroneHub`, `ResourceGenerator`, `EfficiencyBooster`) are applied by `BuildingSystem.upgradeBuilding(entityId)`.
  *   Global drone upgrades are applied by `DroneSystem.applyUpgrade(upgradeId, value)`.
  *   Global economy/resource multipliers are applied by `ResourceManager.applyUpgrade(upgradeId, value)`.
*   This preserves current behavior where upgrades can target both per-entity and global runtime stats.

## 5. Main Game Loop (js/game/FireworkGame.js)

The God Object must be dismantled.

### Files to Update:
*   **`js/game/FireworkGame.js`**
    *   Extend `Engine` (or `World`).
    *   `constructor()` / `init()`:
        *   `this.registerWorldComponent(new ResourceManager())`
    *   `this.registerWorldComponent(new BuildingSystem())`
        *   `this.registerWorldComponent(new AudioManager())`
        *   `this.registerWorldComponent(new UIManager())`
    *   `this.registerWorldComponent(new InstancedParticleSystem())`
    *   `this.registerWorldComponent(new FireworkLaunchSystem())`
    *   `this.registerWorldComponent(new DroneSystem())`
    *   `this.registerWorldComponent(new CrowdSystem())`
    *   `this.registerWorldComponent(new InteractionSystem())`
    *   Remove all raw updates (e.g., `this.buildingManager.update()`, `this.fireworks.forEach(...)`).
    *   Rely entirely on the `super.update(dt)` from `Engine` to iterate naturally through the `WorldComponent` and `Entity` arrays.

## 6. Execution Order & Git Steps

Each step maps to a single focused git commit. No step should touch more than one "domain" at a time. The game must remain playable (or gracefully degraded) after every commit.

---

### Step 1 — Engine Scaffold
**Files to create:**
- `js/engine/Entity.js`
- `js/engine/Component.js`
- `js/engine/WorldComponent.js`

**Files to modify:**
- `js/engine/Engine.js`

**What to do:**
- `Entity.js`: Implement `id` (auto-incrementing integer), `components` Map keyed by class name. Implement `addComponent(comp)` (sets `comp.entity = this`, calls `comp.init()`), `getComponent(Type)`, `removeComponent(Type)` (calls `comp.shutdown()`). Implement `update(dt)` which iterates all components and calls their `update(dt)`. Implement `serialize()` / `static deserialize(data, world)` as specified in Section 1.
- `Component.js`: Empty base class with stub lifecycle methods — `init()`, `start()`, `update(dt)`, `stop()`, `shutdown()`. Each is a no-op by default. Add stub `serialize()` returning `{}` and stub `deserialize(data)` as no-op.
- `WorldComponent.js`: Empty base class with same stub lifecycle methods plus `world` property. `init(world)` stores the reference. Add stub `serialize()` returning `{}` and stub `deserialize(data)` as no-op.
- `Engine.js`: Add `this.worldComponents = []` and `this.entities = []`. Add `registerWorldComponent(wc)` (calls `wc.init(this)`), `getWorldComponent(TypeOrName)`, `addEntity(e)` (calls `e.start()` after adding), `removeEntity(id)` (calls `e.shutdown()`, splices from array). Modify `_loop(dt)` to call `worldComponents[i].update(dt)` then `entities[i].update(dt)`. Implement `serializeWorld()` and `loadWorld(snapshot)` as specified in Section 1.

**Does NOT touch:** any game logic, managers, or existing classes.


---

### Step 1b — Implement Serialization Interface
**Files to create:**
- `js/engine/Serializer.js`

**What to do:**
- `Serializer.js` is a static utility / singleton that acts as the **component and entity registry**. This is required for `deserialize` to reconstruct class instances from plain type-name strings.
- `Serializer.register(Class)`: Stores `Class` in an internal `Map` keyed by `Class.name`. Called once per class at module load time (e.g., `Serializer.register(TransformComponent)`).
- `Serializer.create(typeName)`: Returns `new Registry[typeName]()` or throws a descriptive error if the name is not registered.
- `Serializer.serializeWorld(engine)`: Delegates to `engine.serializeWorld()` and returns the snapshot as a JSON string.
- `Serializer.loadWorld(engine, jsonString)`: Parses the JSON and delegates to `engine.loadWorld(snapshot)`.

**Registration convention:** Each component/entity file calls `Serializer.register(ClassName)` at the bottom of its module, after the class declaration. This keeps the registry self-maintaining — no central import list required.

**Serialization contract for Components:**
- `serialize()` must return a flat, JSON-safe object containing only persistent data fields. Transient runtime state (e.g., `accumulator`, `frameTimer`) **should** be included; purely derived or GPU-side data **should not**.
- `deserialize(data)` must restore the exact fields written by `serialize()`. It is called on a freshly constructed instance before `init()`, so it must not assume `this.entity` exists.

**Serialization contract for WorldComponents:**
- Only override `serialize()` / `deserialize()` if the component holds durable runtime state (e.g., `ResourceManager` saves `{ sparkles, gold }`). Stateless systems (e.g., `InteractionSystem`) return `{}` and skip `deserialize()`.

**Engine.serializeWorld() snapshot shape:**
```json
{
  "worldComponents": {
    "ResourceManager": { "sparkles": 420, "gold": 15 }
  },
  "entities": [
    {
      "id": 7,
      "type": "AutoLauncherEntity",
      "components": {
        "TransformComponent": { "x": 200, "y": 580, "rotation": 0, "scale": 1 },
        "LauncherBuildingComponent": { "level": 2, "spawnInterval": 3.0, "assignedRecipeIndex": 1 }
      }
    }
  ]
}
```

**Engine.loadWorld(snapshot) algorithm:**
1. Call `stop()` on all current entities and clear `this.entities`.
2. For each entry in `snapshot.worldComponents`, call `wc.deserialize(data)` on the matching registered world component.
3. For each entry in `snapshot.entities`, call `Entity.deserialize(entityData, this)` — which uses `Serializer.create(entityData.type)` to instantiate the correct subclass, then calls `comp.deserialize(compData)` on each component before calling `addEntity()`.

**Does NOT touch:** any game logic, render systems, or asset loading.


---

### Step 2 — Migrate ResourceManager to WorldComponent
**Files to modify:**
- `js/resources/ResourceManager.js`
- `js/game/FireworkGame.js`

**What to do:**
- Make `ResourceManager` extend `WorldComponent`.
- Move constructor logic into `init(world)`.
- Verify `update(dt)` accumulates generator income correctly (no behavior change).
- In `FireworkGame.js`, swap `this.resourceManager = new ResourceManager()` for `this.registerWorldComponent(new ResourceManager())`. Store a reference via `this.resourceManager = this.worldComponents.find(...)` if needed for transition period.


---

### Step 3 — Migrate AudioManager to WorldComponent
**Files to modify:**
- `js/audio/AudioManager.js`
- `js/game/FireworkGame.js`

**What to do:**
- Make `AudioManager` extend `WorldComponent`.
- Move constructor logic into `init(world)`.
- All event listener bindings happen in `init()` so they have access to `this.world`.
- No behavior change.


---

### Step 4 — Implement Foundational Data Components
**Files to create:**
- `js/engine/components/TransformComponent.js`
- `js/engine/components/LifeTimeComponent.js`
- `js/engine/components/RenderComponent.js`
- `js/engine/components/BoundsComponent.js`

**What to do:**
- `TransformComponent`: stores `x`, `y`, `rotation`, `scale`. No logic — pure data. `update()` is a no-op.
- `LifeTimeComponent`: stores `currentAge = 0`, `maxLifetime`. `update(dt)` increments `currentAge`. Exposes `isExpired()` getter. On expiry, calls `this.entity.destroy()` (add `destroy()` to `Entity` that delegates to Engine).
- `RenderComponent`: stores `color` (Float32Array RGBA), `zIndex`, `blendMode`, `visible`. No logic.
- `BoundsComponent`: stores `halfWidth`, `halfHeight`. Exposes `isPointInside(px, py)` that reads `TransformComponent` from its entity.


---

### Step 5 — Refactor FireworkRocket into an Entity
**Files to modify:**
- `js/entities/Firework.js` → becomes `js/entities/FireworkRocket.js`

**Files to create:**
- `js/engine/components/RocketAscentComponent.js`
- `js/engine/components/ParticleEmitterComponent.js`

**Entity: `FireworkRocket`**

| Layer | What lives there |
|---|---|
| **Direct entity logic** | `_onReachedTarget()` — a one-shot method called when `RocketAscentComponent` signals arrival. Reads recipe data from `RocketAscentComponent`, directly calls `world.getWorldComponent(InstancedParticleSystem).emit(x, y, recipeConfig)` to spawn explosion particles, then calls `this.world.removeEntity(this.id)` to destroy itself. No event is emitted — the rocket owns its own death. |
| **`TransformComponent`** | `x`, `y`, `rotation`, `scale` |
| **`RocketAscentComponent`** | `vx`, `vy`, `targetY`, `ascentSpeed`, `recipeConfig` (explosion params snapshot — color, pattern, size, count). `update(dt)` moves the entity upward via its own `vy`. When `transform.y >= targetY`, sets `this.arrived = true` and calls `entity._onReachedTarget()`. |
| **`ParticleEmitterComponent`** | Trail emission config: `spawnRate`, `particleSize`, `particleLifetime`, `particleColor`. `update(dt)` accumulates timer and emits particles via `world.getWorldComponent(InstancedParticleSystem).emit(...)`. |
| **`LifeTimeComponent`** | Safety auto-destroy if rocket somehow never triggers. |
| **`RenderComponent`** | Color, zIndex for the rocket head sprite/glyph. |


---

### Step 6 — Implement FireworkLaunchSystem
**Files to create:**
- `js/entities/systems/FireworkLaunchSystem.js`

**Files to modify:**
- `js/game/FireworkGame.js`

**FireworkLaunchSystem (WorldComponent)**
- Exposes direct APIs such as `launchFromBuilding(buildingEntity, launchConfig)` and `launchFromPlayerInput(worldX, worldY, launchConfig)`.
- On direct call: reads the recipe params, constructs a new `FireworkRocket` entity with correct components pre-configured (including `recipeConfig` on `RocketAscentComponent`), calls `world.addEntity(rocket)`.
- Relies on the Engine's entity list for bookkeeping — no separate rocket array needed.

> **Note:** There is no `FireworkExplosionSystem`. When a rocket reaches its target, `FireworkRocket._onReachedTarget()` directly spawns explosion particles via `InstancedParticleSystem` and removes itself. Explosion is self-contained within the entity.


---

### Step 7 — Implement InstancedParticleSystem as WorldComponent
**Files to modify:**
- `js/particles/InstancedParticleSystem.js`

**What to do:**
- Extend `WorldComponent`.
- `init(world)`: Store world reference and keep current buffer/setup behavior unchanged.
- `update(dt)`: Keep existing behavior unchanged (no rendering pipeline rewrite in this step).
- Expose `emit(x, y, config)` for other systems/components to spawn particles.
- All particle data lives in typed arrays internal to this system (not as entities — particles are too numerous).
- Do not refactor `Renderer.js` or rendering ownership as part of this step.


---

### Step 8 — Implement Drone Entity and DroneSystem
**Files to create:**
- `js/entities/DroneEntity.js`
- `js/engine/components/VehicularSteeringComponent.js`
- `js/engine/components/DroneAIComponent.js`
- `js/engine/components/ParticleMagnetComponent.js`
- `js/entities/systems/DroneSystem.js`

**Entity: `DroneEntity`**

| Layer | What lives there |
|---|---|
| **Direct entity logic** | `_pickNewWanderTarget()` — randomly selects a new target position within world bounds. Called by `DroneAIComponent` when the wander timer fires. This is entity-unique because target selection depends on knowing world canvas dimensions (`this.world.width`, etc.). |
| **`TransformComponent`** | `x`, `y`, `rotation`, `scale` |
| **`VehicularSteeringComponent`** | `vx`, `vy`, `targetX`, `targetY`, `currentSpeed`, `maxSpeed`, `oscillationPhase`, `oscillationAmplitude`, `turnThresholdDot`. `update(dt)` applies steering force toward target, integrates its own `vx`/`vy` into `TransformComponent`, applies oscillation to `TransformComponent.rotation`. |
| **`DroneAIComponent`** | `lifetime`, `wanderTimer`, `wanderInterval`, `collectedCount`. `update(dt)` ticks down `wanderTimer`; on expiry calls `entity._pickNewWanderTarget()` and resets. Ticks `lifetime` and calls `entity.destroy()` when expired. |
| **`ParticleMagnetComponent`** | `radius`, `pullForce`, `arrivalThreshold`. Consulted by `DroneSystem` — no self-`update`. |
| **`ParticleEmitterComponent`** | Thruster trail config. Emits via `InstancedParticleSystem`. |
| **`RenderComponent`** | Drone sprite color/zIndex. |

**DroneSystem (WorldComponent)**
- `update(dt)`: Iterates all entities with `DroneAIComponent`. For each, queries `InstancedParticleSystem` for nearby particles within `ParticleMagnetComponent.radius`, applies pull force to those particles, increments `collectedCount`, and explicitly preserves metrics via `GameMetrics.recordDroneParticle(...)` at the same gameplay moments as current code.
- Handles drone spawning via direct calls from `DroneBuildingComponent` (no world event bus).


---

### Step 9 — Refactor Building Entities
**Files to modify:**
- `js/buildings/Building.js`
- `js/buildings/AutoLauncher.js`
- `js/buildings/DroneHub.js`
- `js/buildings/ResourceGenerator.js`
- `js/buildings/EfficiencyBooster.js`

**Files to create:**
- `js/engine/components/BuildingComponent.js` (base class)
- `js/engine/components/LauncherBuildingComponent.js`
- `js/engine/components/DroneBuildingComponent.js`
- `js/engine/components/ResourceBuildingComponent.js`
- `js/engine/components/EfficiencyBuildingComponent.js`
- `js/engine/components/EfficiencyReceiverComponent.js`
- `js/engine/components/HighlightPulseComponent.js`
- `js/engine/components/DraggableComponent.js`

**Entity: `AutoLauncherEntity`**

| Layer | What lives there |
|---|---|
| **Direct entity logic** | None — fully data driven by components. |
| **`TransformComponent`** | `x`, `y`, `rotation = 0`, `scale = 1` |
| **`LauncherBuildingComponent`** | extends `BuildingComponent`. `level`, `baseWidth`, `baseHeight`, `bounds`, `spawnInterval`, `accumulator`, `assignedRecipeIndex`, `colorOverride`, `patternOverride`. `update(dt)` ticks accumulator and directly calls `FireworkLaunchSystem.launchFromBuilding(...)` when ready. Reads `EfficiencyReceiverComponent.currentMultiplier` to scale `spawnInterval`. |
| **`EfficiencyReceiverComponent`** | `currentMultiplier = 1.0` — written by `BuildingSystem` each frame. |
| **`ClickableComponent`** | marks entity as selectable/interactable by `InteractionSystem`. |
| **`BoundsComponent`** | `halfWidth`, `halfHeight` |
| **`HighlightPulseComponent`** | `timer`, `originalColor`, `pulseColor`, `pulseDuration`. `update(dt)` decays timer and lerps color back. |

**Entity: `DroneHubEntity`**

| Layer | What lives there |
|---|---|
| **Direct entity logic** | None. |
| **`TransformComponent`** | position |
| **`DroneBuildingComponent`** | extends `BuildingComponent`. `level`, `baseWidth`, `baseHeight`, `bounds`, `spawnInterval`, `accumulator`, `maxDrones`. `update(dt)` ticks and directly calls `DroneSystem.spawnFromHub(...)` when ready. Reads `EfficiencyReceiverComponent`. |
| **`EfficiencyReceiverComponent`** | `currentMultiplier` |
| **`ClickableComponent`** | marks entity as selectable/interactable by `InteractionSystem`. |
| **`BoundsComponent`** | hit area |
| **`HighlightPulseComponent`** | interaction flash |

**Entity: `ResourceGeneratorEntity`**

| Layer | What lives there |
|---|---|
| **Direct entity logic** | None. |
| **`TransformComponent`** | position |
| **`ResourceBuildingComponent`** | extends `BuildingComponent`. `level`, `baseWidth`, `baseHeight`, `bounds`, `resourceType` ('sparkles' \| 'gold'), `productionRate`, `accumulator`. `update(dt)` ticks and calls `world.getWorldComponent(ResourceManager).add(type, amount * multiplier)`. |
| **`EfficiencyReceiverComponent`** | `currentMultiplier` |
| **`ClickableComponent`** | marks entity as selectable/interactable by `InteractionSystem`. |
| **`BoundsComponent`** | hit area |
| **`ParticleEmitterComponent`** | Optional sparkle-burst visual on income tick. |
| **`HighlightPulseComponent`** | interaction flash |

**Entity: `EfficiencyBoosterEntity`**

| Layer | What lives there |
|---|---|
| **Direct entity logic** | None. |
| **`TransformComponent`** | position |
| **`EfficiencyBuildingComponent`** | extends `BuildingComponent`. `level`, `baseWidth`, `baseHeight`, `bounds`, `radius`, `boostMultiplier`. Data-only — read each frame by `BuildingSystem`. Does NOT receive an `EfficiencyReceiverComponent` (cannot boost itself). |
| **`ClickableComponent`** | marks entity as selectable/interactable by `InteractionSystem`. |
| **`BoundsComponent`** | hit area |
| **`HighlightPulseComponent`** | interaction flash |

**Git commit:** `refactor(buildings): all four Building types migrated to Entity + Component model`

---

### Step 10 — Implement BuildingSystem as WorldComponent
**Files to modify:**
- `js/buildings/BuildingManager.js` → becomes `js/buildings/BuildingSystem.js`

**What to do:**
- Extend `WorldComponent`.
- `init(world)`: Set up grid data structures.
- `update(dt)`: Each frame, scan all entities with `EfficiencyBuildingComponent`. For each, find all entities with `EfficiencyReceiverComponent` within `aura.radius`, write computed `currentMultiplier` to their component. (O(n*m) but building count is tiny.)
- Exposes `placeBuilding(type, gridX, gridY)` which constructs the appropriate entity prefab and calls `world.addEntity(e)`. Building type is inferred from the concrete `BuildingComponent` subclass rather than a string enum.
- Exposes `upgradeBuilding(entityId)` which reads the entity's `BuildingComponent` subclass `.level` and modifies component data accordingly, then triggers `HighlightPulseComponent`.
- Exposes `applyUpgrade(upgradeId, value, context)` to map upgrade definitions onto entity-level building stats without event indirection.

**Git commit:** `refactor(buildings): BuildingManager becomes BuildingSystem WorldComponent`

---

### Step 11 — Refactor CrowdMember into Entity
**Files to modify:**
- `js/entities/Crowd.js`

**Files to create:**
- `js/entities/CrowdMemberEntity.js`
- `js/engine/components/CrowdMemberStateComponent.js`
- `js/engine/components/SpriteAnimationComponent.js`
- `js/entities/systems/CrowdSystem.js`

**Entity: `CrowdMemberEntity`**

| Layer | What lives there |
|---|---|
| **Direct entity logic** | `_playAnimation(name)` — looks up `SpriteAnimationComponent` and sets `animName`, resets `currentFrame` and `frameTimer`. Justified as direct entity logic because animation selection is tightly coupled to state transitions that only this entity type experiences. `_emitCoin()` — triggers a one-shot coin particle burst + gold increment. Direct because the visual AND resource change are simultaneously triggered and specific to this entity. |
| **`TransformComponent`** | `x`, `y`, `rotation`, `scale` |
| **`PhysicsFlightComponent`** | `vx`, `vy`, `gravity`, `friction`, `bounceCount`, `groundY`. `update(dt)` integrates its own `vx`/`vy`, applies gravity, handles ground collision/bounce logic, writes back to `TransformComponent`. |
| **`SpriteAnimationComponent`** | `sheetIndex`, `animName`, `currentFrame`, `frameTimer`, `frameDuration`, `loop`, `bobOffset`, `bobSpeed`. `update(dt)` advances frame timer and cycles frames. |
| **`CrowdMemberStateComponent`** | `state` ('cheering' \| 'grabbed' \| 'falling' \| 'walking'), `goldAccumulator`, `coinAnimTimer`. `update(dt)` ticks `goldAccumulator`; on threshold, calls `entity._emitCoin()`. |
| **`DraggableComponent`** | `isGrabbed`, `grabOffsetX`, `grabOffsetY`, `cursorHistory[]`. Logic: in `update(dt)` if grabbed, copies world cursor position to transform. On release (via `InteractionSystem`), computes throw velocity from cursor history and writes it directly into `PhysicsFlightComponent.vx`/`vy`. Must preserve config parity with current `CROWD_CONFIG` throw/grab tunables (pick radius, history size, throw clamp, bounce behavior). |
| **`BoundsComponent`** | `halfWidth`, `halfHeight` for cursor pick test |
| **`ClickableComponent`** | marks entity as selectable/interactable by `InteractionSystem`. |
| **`ParticleMagnetComponent`** | `radius`, `pullForce`. Consulted by `CrowdSystem`. |

**CrowdSystem (WorldComponent)**
- `update(dt)`: Iterates all entities with `CrowdMemberStateComponent`. For each in state `'cheering'` or `'walking'`, queries `InstancedParticleSystem` for nearby particles within `ParticleMagnetComponent.radius`, applies pull forces and increments `goldAccumulator` on catch. Explicitly preserves metrics hooks via `GameMetrics.recordCrowdCatchParticle(...)` at the same moments as current gameplay code. Manages crowd spawn count.

**Git commit:** `refactor(crowd): CrowdMember migrated to Entity + CrowdSystem WorldComponent`

---

### Step 12 — Implement InteractionSystem and UIManager
**Files to modify:**
- `js/ui/UIManager.js`

**Files to create:**
- `js/entities/systems/InteractionSystem.js`
- `js/engine/components/ClickableComponent.js`

**InteractionSystem (WorldComponent)**
- `init(world)`: Binds `mousedown`, `mousemove`, `mouseup`, `touchstart`, etc. on the canvas.
- `update(dt)`: Flushes the queued input events (input was buffered during event callbacks). For `mousedown`: iterates all entities with `BoundsComponent` + `ClickableComponent`, runs `isPointInside` check, then directly calls `UIManager.handleEntityClicked(entity)` and/or `BuildingSystem.upgradeBuilding(...)` as needed. For entities with `DraggableComponent`, sets `isGrabbed = true`. For `mouseup`: releases dragged entity, writes throw velocity.
- Uses direct method calls; no world event bus required.

**UIManager (WorldComponent, refactor existing class)**
- `init(world)`: Builds DOM and stores references to owner systems for direct calls.
- `update(dt)`: Flushes DOM diff updates (batched to avoid per-frame thrash). Updates gold/sparkle counters, building panel state.


---


### Step 14 — Final FireworkGame.js Cleanup (God Object Removal)
**Files to modify:**
- `js/game/FireworkGame.js`

**What to do:**
- `FireworkGame` extends `Engine`.
- `init()` registers ALL world components in correct dependency order:
  1. `ResourceManager`
  2. `AudioManager`
  3. `InstancedParticleSystem`
  4. `BuildingSystem`
  5. `FireworkLaunchSystem`
  6. `DroneSystem`
  7. `CrowdSystem`
  8. `InteractionSystem`
  9. `UIManager`
- Remove ALL direct `update()` calls, direct manager references, and inline forEach loops.
- `start()` calls `super.start()`, places initial buildings via `BuildingSystem.placeBuilding(...)`.
- The entire per-frame logic is: `super.update(dt)` — nothing else.


---

### Complete File Creation Checklist

#### Engine Core
- [ ] `js/engine/Entity.js`
- [ ] `js/engine/Component.js`
- [ ] `js/engine/WorldComponent.js`
- [ ] `js/engine/Serializer.js`

#### Foundational Components
- [ ] `js/engine/components/TransformComponent.js`
- [ ] `js/engine/components/LifeTimeComponent.js`
- [ ] `js/engine/components/RenderComponent.js`
- [ ] `js/engine/components/BoundsComponent.js`

#### Physics & Movement Components
- [ ] `js/engine/components/PhysicsFlightComponent.js`
- [ ] `js/engine/components/VehicularSteeringComponent.js`
- [ ] `js/engine/components/RocketAscentComponent.js`

#### Behavior Components
- [ ] `js/engine/components/BuildingComponent.js` (base class)
- [ ] `js/engine/components/LauncherBuildingComponent.js`
- [ ] `js/engine/components/DroneBuildingComponent.js`
- [ ] `js/engine/components/ResourceBuildingComponent.js`
- [ ] `js/engine/components/EfficiencyBuildingComponent.js`
- [ ] `js/engine/components/EfficiencyReceiverComponent.js`
- [ ] `js/engine/components/DroneAIComponent.js`
- [ ] `js/engine/components/CrowdMemberStateComponent.js`
- [ ] `js/engine/components/SpriteAnimationComponent.js`

#### Interaction & FX Components
- [ ] `js/engine/components/HighlightPulseComponent.js`
- [ ] `js/engine/components/DraggableComponent.js`
- [ ] `js/engine/components/ClickableComponent.js`
- [ ] `js/engine/components/ParticleEmitterComponent.js`
- [ ] `js/engine/components/ParticleMagnetComponent.js`

#### World Components (Systems/Managers)
- [ ] `js/resources/ResourceManager.js` (refactor)
- [ ] `js/audio/AudioManager.js` (refactor)
- [ ] `js/particles/InstancedParticleSystem.js` (refactor)
- [ ] `js/buildings/BuildingSystem.js` (refactor from BuildingManager)
- [ ] `js/entities/systems/FireworkLaunchSystem.js` (new)
- [ ] `js/entities/systems/DroneSystem.js` (new)
- [ ] `js/entities/systems/CrowdSystem.js` (new)
- [ ] `js/entities/systems/InteractionSystem.js` (new)
- [ ] `js/ui/UIManager.js` (refactor to WorldComponent)

#### Entities (Prefabs)
- [ ] `js/entities/FireworkRocket.js` (refactor from Firework.js)
- [ ] `js/entities/DroneEntity.js` (refactor from Drone logic in InstancedDroneSystem)
- [ ] `js/entities/CrowdMemberEntity.js` (refactor from Crowd.js)
- [ ] `js/entities/buildings/AutoLauncherEntity.js` (refactor from AutoLauncher.js)
- [ ] `js/entities/buildings/DroneHubEntity.js` (refactor from DroneHub.js)
- [ ] `js/entities/buildings/ResourceGeneratorEntity.js` (refactor from ResourceGenerator.js)
- [ ] `js/entities/buildings/EfficiencyBoosterEntity.js` (refactor from EfficiencyBooster.js)
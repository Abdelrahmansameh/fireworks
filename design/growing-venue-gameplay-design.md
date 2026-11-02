# Growing the Fireworks Venue — Gameplay Design

## The player fantasy

The show begins as an intimate patch of ground and sky. The player makes the first fireworks themselves, installs portals, welcomes an audience, and gradually turns the same place into a busy festival. The venue grows because the show needs more room: every camera expansion accompanies an actual achievement, and the higher sky gives later fireworks a larger stage. The player should still be able to zoom in to enjoy the fans and machines.

## Core rules

- Start at the game's existing close framing, with a fixed horizontal view. There is no empty map to explore at the beginning.
- Venue progress is permanent for the current save. Buying, being granted, or unlocking a relevant element can expand it; selling or moving buildings cannot contract it. A full game reset starts a new venue.
- Each milestone increases the available content extent or the maximum firework burst height; the visible zoom range grows when that extent exceeds the starting viewport. Unlocking a wider view introduces the new space with a gentle four-second zoom-out; the player can interrupt it to zoom and pan within the unlocked venue.
- The ground stays at the same screen height as the player zooms. Camera movement compensates vertically, showing more sky instead of letting the floor drift up or down. There is no free vertical panning.
- The venue stage determines the permitted sky, not the current camera zoom. Zooming in is a viewing choice, never an economy upgrade. A rocket already in flight keeps its chosen target.
- Milestones are based on gameplay achievements, not a clock or currency balance. Optional branches can be bought in different orders; use the highest stage earned rather than requiring a strict sequence.

## Progression scorecard

Coordinates below are world units, not screen pixels. X increases to the right and Y increases upward. The ground is at Y = -540. The height is the maximum **burst centre**, not the topmost particle: large shapes can extend beyond it. `Left` and `right` are the stage’s content extents. The camera uses their union with the initial viewport, so the opening view never shrinks; the resulting extent depends on screen aspect ratio.

| Stage | Trigger | Left | Right | Highest burst centre Y | What the player experiences |
| --- | --- | ---: | ---: | ---: | --- |
| 0 — First sparks | New game | -960 | 960 | 324 | The current close view, fixed in place, gives the player an immediate stage for manual fireworks. |
| 1 — One machine | Own the first portal | -200 | 400 | 380 | The first machine belongs to the intimate opening scene. The sky can already climb a little higher. |
| 2 — Building a show | Own 3 portals | -300 | 1000 | 440 | Additional room is available when the content extent exceeds the initial viewport, and the show qualifies for Opening Night. |
| 3 — Opening Night | The first fan arrives | -1250 | 1000 | 500 | The audience side is revealed and the existing first-fan introduction remains the emotional centre of this beat. The crowd enters at the left of the portals. |
| 4 — Festival ground | Own 7 portals, or the first catapult or generator | -1250 | 1900 | 575 | A deeper portal field and sky accommodate the growing show. The workshop is optional; if it is obtained early it earns this stage without requiring a catapult. |
| 5 — Bigger sky | Own 14 portals or a flyer | -1250 | 2500 | 675 | More ground opens to the right and more sky above. Flyers require 14 portals in the current tree, but either condition restores the correct stage for older saves. |
| 6 — Full Salvo ground | Own 20 portals | -1250 | 3100 | 775 | More capacity for dense automation and the Full Salvo branch. The purchase of the 20th portal itself earns the space; the Full Salvo upgrade is a separate choice. |
| 7 — Sky Curtain ground | Own 25 portals | -1250 | 4000 | 875 | The venue widens again as the Sky Curtain upgrade becomes eligible. |
| 8 — Grand venue | Own 32 portals | -1250 | 4150 | 975 | The full portal field and tallest normal burst height are available before the Grand Finale is purchased. Finale eligibility still follows its existing upgrade requirements. |

The table describes a high-water mark. For example, if the player buys seven portals before the first fan arrives, stage 4 takes precedence; the fan still arrives and plays its introduction, but does not force a smaller stage. A workshop purchased at three portals similarly reveals stage 4. On loading an older save, owned buildings and already unlocked crowd/flyers provide the minimum earned stage.

## A concrete playthrough

1. The player launches the first fireworks by hand. There are no blank stretches of terrain to scroll through. The initial height and camera match the established opening composition.
2. The player unlocks automation and buys portal 1. It appears near the middle of the opening field, and the sky gains its first small increase. Portals 2 and 3 occupy separate positions, with the third earning the next expansion.
3. Opening Night becomes available after three portals and its existing prerequisite. Buying it starts the existing arrival sequence; the **arrival of the first fan**, not merely seeing the upgrade, earns the audience reveal. Fans create a new gold economy.
4. More portals extend the show rightward. The optional Sparkle Workshop is given a distinct building position rather than appearing on top of the first portal. A first workshop or the seventh portal earns the festival-ground view, whichever comes first.
5. The Catapult upgrade requires seven portals and its current prerequisites. Its granted machine sits in the crowd area near the portals and throws fans toward the fireworks. Catapult Team adds machines beside it; the audience and machines may share the same ground region.
6. At 14 portals the sky and ground have enough headroom for the next phase. The Flyers upgrade remains a separate, earned purchase; its first fan uses the same venue rather than opening an unrelated map.
7. At 20, 25 and 32 portals, further room and height arrive at the moment the growing portal line needs them. The corresponding Full Salvo, Sky Curtain and Grand Finale upgrades remain choices in the existing progression tree, not hidden camera prerequisites.

## Ground layout and capacity

The audience occupies X = -1200 to -100 in three rows. Existing crowd placement uses 72-unit columns; roughly 14 columns allow around 40 fans with some spacing. The catapult zone is X = -900 to -450, overlapping that audience area by design, with the first machine closest to the portals and later machines spaced leftward. Their rightward throw speed is reduced from 3500 to 1500 world units per second to suit the shorter distance to the show; their loading interaction must remain readable even when fans stand nearby.

The portal/workshop field starts at X = 100 and reaches X = 4000 at the full venue. New portals and generators use a shared set of 35 default ground positions, starting at X = 220 and spaced 110 units apart. This gives the configured maximum of 32 portals and 3 generators a separate slot each in the default layout. A shared occupancy check avoids putting a newly bought machine directly on another type. Player-arranged positions should be preserved during purchases and save/load; spreading buildings remains an explicit player action. If a player deliberately obstructs every default position, the best available clearance is a fallback, not a guarantee against all overlap.

Crowd, catapults and machines are layered visual objects, so shared ground is acceptable, but important silhouettes and interactions must stay legible. The spacing values are starting balance targets: verify actual skeleton art, animation envelopes and interaction hit areas in play, especially with all 40 fans, three catapults, 32 portals and three generators present. The system must not silently place every late portal at the same right-edge coordinate.

## Camera and controls

The starting camera is the reference composition. Each stage increases the available overview rather than increasing magnification: in renderer terms, zooming out means a **smaller** zoom number. From the first earned expansion onward, use the mouse wheel on desktop or pinch on a touch screen to zoom between the earned wide view and the original close view. On desktop, press and hold on open ground, then drag horizontally to pan; on touch screens, swipe on open ground. Panning is available when the view is narrower than the unlocked area, and a tap still launches a firework. The first stage may still fit entirely inside the initial viewport, in which case there is no visible zoom or pan range until more space is earned. At the widest view, there is no useless empty scrolling past the venue. Desktop fits the earned venue in its widest view. On a narrow phone the widest zoom stops at 0.4 so characters remain readable; when the full venue does not fit, the player can pan even at that widest setting. A new offscreen building is brought into view when the camera is free.

Anchor the ground in screen space throughout zoom and stage transitions. On mobile, preserve the space reserved for the bottom navigation and adapt when a sheet covers the play area. Inputs over a menu belong to that menu; game gestures must not steal taps for fireworks, drags of fans, or building manipulation. The first-fan cinematic and Grand Finale temporarily own their camera, then return control to the earned venue framing. A camera expansion must not reset purchases, move already placed buildings, or change a rocket already in flight.

## Firework height and game balance

The lowest normal burst centre remains Y = -105; the stage table raises the upper centre. Manual targets are limited to the earned sky, and portals select their targets within that same earned range. A manual click at or below Y = 0 chooses a random height from the same range as a portal; clicks higher in the sky aim directly. In stages 0 and 1, untargeted bursts stop at Y = 200; in stage 2 they stop at Y = 375. This leaves room for their particles in the closer early view without restricting manual aiming. A finale or a scripted cinematic can have its own presentation, but should respect the venue's intended sky unless explicitly designed as a special shot. Existing recipes, costs and base yields do not change just because the camera moves.

Greater flight height changes timing and the geometry of catching, even with unchanged nominal rewards. Catapult fans have a finite arc, and flyers travel through the scene. During balancing, measure actual caught particles and sparkle income before and after each expansion; keep lower bursts in the mix so a higher ceiling does not make a newly purchased catapult ineffective. Preserve the special character of manual aiming: a player can still choose a lower visible target.

## Save, reset and unusual sequences

- Persist the highest earned stage, and derive at least that much progress from older saves with existing buildings or unlocks. A refund, reset of a building type, or temporary lack of fans cannot remove an already earned view or sky.
- A full game reset clears the earned stage with the rest of progression. Loading an advanced save should restore the appropriate overview without replaying all milestone animations.
- Buying several buildings in quick succession should settle at the highest stage achieved rather than play a queue of competing camera moves. A milestone achieved during a scripted camera sequence should become visible when normal control resumes.
- A viewport resize or orientation change recalculates the available view and ground anchor without changing the earned stage or firework ceiling. Existing buildings remain in world coordinates.
- A player can buy the workshop before the catapult, delay either branch, refund buildings, or earn later portal thresholds early. None of those paths should dead-end venue growth.

## Acceptance and tuning

Verify a fresh desktop and mobile game; each milestone and optional ordering; dragging and zooming at each limit; a fan arrival during an expansion; both cinematic handoffs; refund, reload, older-save migration and full reset; resize and orientation changes; and the fully populated venue. Check that the floor is stationary during zoom, all earned building positions are reachable, and new purchases remain visible and distinct. Test small and large firework patterns at low and high burst targets and measure the effects on catapult and flyer collection. Treat actual pacing, animation timing, crowd readability and catch income as playtest questions rather than asserting that world-unit values alone prove the game is balanced.

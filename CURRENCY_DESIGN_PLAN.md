# Currency Roles Plan — Fireworks

Goal: every currency gets one recognizable verb, its own place on screen, and links to the others only through a few deliberate bridges ("classic intertwining").

Data: live-bot run `traces/live-balance/currency-audit-active.json` (active preset, seed 1, 38.2 game-min to Grand Finale) plus the current `SkillTreeConfig.js`.

---

## 1. Diagnosis: why the currencies blur together

### 1a. Gold is "slow sparkles"

| Gold spent on upgrades | Cost (all levels) | Share |
|---|---|---|
| → sparkle income (Sparkle Powder, Louder Chants, Quick Reload, Catapult Team, Confetti Catchers, both "Helping Hands", Long Toss, all flyer nodes) | 207,080 | **94%** |
| → gold income (Better Tips, Festival Sponsors, Full House) | 12,600 | 6% |

Gold's buildings and recruits (catapults, cultists, flyers) also only make sparkles. So almost every gold choice resolves to "more sparkles".

Lostgarden's term for this is *undifferentiated inputs*: two currencies feed the same outcome, so the player can't name what either one is *for*.

### 1b. The two currencies cross over arbitrarily

- **Sparkles buy people:** Extra Tickets (+4 fans) and Sky Catchers.
- **Gold buys machine power:** Sparkle Powder (+25% *portal* sparkles).

No rule like "sparkles = X, gold = Y" survives contact with the tree.

### 1c. Gold dies late

| Game time | Sparkles/s | Gold/s | Crowd |
|---|---|---|---|
| 15 m | 40 | 47 | 33 |
| 21 m | 50 | 51 | 37 |
| 27 m | 158 | 120 | 43 |
| 36 m | 1,479 | 119 | 43 (capped) |

Over the final 11 minutes sparkle income grows ×9, while gold stays flat because the crowd is capped. The last gold purchase is at 36:13, after which ~14k gold sits idle. Gold has no source that grows with the show and no sink that scales.

### 1d. Some systems aren't tied into the economy at all

- **Shapes:** 15 shape unlocks cost 11k of 539k sparkles spent (2%) and have no economic effect. The Firework Creator, the game's most distinctive feature, has no economic role.
- **Clicks:** taps earn 0.5% of all sparkles. The active verb barely matters after minute 3.

### 1e. What already works (keep it)

- **Purchase cadence:** median gap is 38 s for sparkles and 76 s for gold, and the longest is 75 s. That fits the research targets: early seconds, mid-game 30 s–2 min.
- **The worker bridge:** gold buys performers who catch or conjure sparkles. They produce 35% of all sparkles: catching 18%, flyers 9%, cultists 8%. This is a good intertwining. It just shouldn't be the *only* thing gold does.

---

## 2. What the research says (condensed)

| Lesson | Source |
|---|---|
| **One currency per verb.** Each needs one main source, one main sink, and a goal the player can name. Nodes that don't lead anywhere read as pointless. | Cook, *Value Chains* (lostgarden.com/2021/12/12/value-chains) |
| **Link chains with buffs or two-currency recipes, never shared sinks.** "Differentiated inputs": a key purchase that needs both currencies pulls the player through both chains. | Cook; Kittens Game (manuscript = culture + parchment) |
| **Clearest prestige is never spent.** Egg Inc soul eggs, CC prestige level and RG gems are pure multipliers. The most complained-about pattern is a currency that is both your multiplier and your spend (AdCap angels, old Clicker Heroes souls). | wiki research |
| **Each currency should live on a visible object.** Sugar lumps grow on screen, Egg Inc's eggs are colored, ADR's resources each have a job row. | wiki research |
| **Converters make roles legible.** "The cult turns X into Y" is a role you can name. Paperclips, ADR jobs and Machinations converters all work this way. | Dormans, *Machinations*; Paperclips source |
| **Sublinear prestige.** The usual formulas are roots: CC cube root (×8 lifetime to double prestige), AdCap/RG square root (×4), Egg Inc ^0.14 (×128). Aim for the first reset to make the next run ~2–3× faster. | Pecorella, *Math of Idle Games* Part III |
| **Steps under ~20% go unnoticed.** Introduce one new variable at a time. | Guan, *Idle Game Design Principles*; Apptrove |
| **Each currency gets its own clock:** per-second, per-session, per-run. | Guan |

---

## 3. The proposed model

```
                   ┌────────────── SPARKLES ✦ ──────────────┐
   taps, portals │  "BUILD THE SHOW" — machines & sky      │ portals, fire rate,
   bursts ────────►│  spent only on hardware / shapes        │ payload, shapes, finale
                   └──────┬──────────────────────▲───────────┘
          the show itself │ (buff)               │ caught / conjured sparkles
                          ▼                      │ (workers)
                   ┌──── HYPE ♪ (meter) ───┐     │
   intensity,      │ "THE MOOD" — 1×..3×   │     │
   variety, taps ─►│ never spent, decays   │     │
                   └──────┬────────────────┘     │
                          │ multiplies tips      │
                          ▼                      │
                   ┌──────────────── TIPS ● (gold) ───────────┐
   fans toss coins │  "HIRE THE PEOPLE" — audience & crew     │ tickets, catapults,
   ───────────────►│  spent only on people & their training   │ cultists, flyers,
                   └────────────────────┬─────────────────────┘ crew training
                                        │ cult tithe (converter)
                                        └──────► sparkles at a visible rate

   Keystones (Catapult, Flyers, Grand Finale) cost BOTH ✦ + ●.
   After the finale (phase 3): lifetime ✦ → STARS ★ (never spent, +10% each).
```

### Roles

| Currency | Verb | Where it lives on screen | Earned by | Spent on (only) | Clock |
|---|---|---|---|---|---|
| **Sparkles ✦** | Build the show | sky and portals | bursts (tap, portal), catches, cult tithe | portals, portal stats, base sparkle multipliers, shapes, finale | per second |
| **Tips ● (gold)** | Hire the people | crowd and coin tosses | fan tosses × Hype | fans/tickets, catapults, cultists, flyers, crew training | per second, slower |
| **Hype ♪** | The mood (a multiplier, never spent) | crowd cheer bar; fans cheer harder | burst intensity, shape variety, manual taps, catches; decays | multiplies tips (and speeds fan arrivals) | ~10 s swings |
| **Stars ★** (phase 3) | Legacy | constellation in the sky | Grand Finale / "go on tour" reset | never spent: +10% to all income each | per run |

**Tests for clarity:**
- The player can finish "Sparkles build the ___, tips hire the ___."
- Every cost chip in the Buildings panel is ✦. Every cost chip in the Crowd panel is ●.

### The four bridges

1. **Core engine (✦ → ✦).** Sparkles buy portals, portals make sparkles. Already in place.
2. **Show → Hype → Tips (buff bridge).** A better show earns better tips. Sparkles never convert *directly* into gold, so gold stays its own scarcer currency, yet it now grows with the show. This fixes 1c and gives shapes and taps a job, fixing 1d.
3. **Tips → crew → Sparkles (worker bridge).** Keep catapults and flyers as "people who harvest the sky." Their output scales with the sky, so they stay relevant.
4. **Cult tithe (converter, plus a sink that never runs out).** Cultists take a visible share of incoming tips and turn it into sparkles at a stated rate ("1 ● → 3 ✦"). Upgrades improve the rate. Gold now has a scaling late-game use instead of idling.

**Keystones need both currencies.** Catapult, Flyers and Grand Finale get a `secondaryCost`, which `LivePurchasePolicy` already supports. That is the "classic intertwining" moment: neither economy can be ignored. Limit it to about 3–5 keystones so it stays special.

---

## 4. The math

### Hype (bounded, so it can't blow up the economy)

```
intensity  = 1 − exp(−FPS_onscreen / FPS_ref)          // 0..1, FPS_ref per venue stage
variety    = min(1, (distinctShapesInLast20Bursts − 1) / 5)
tapBoost   = +0.04 per manual burst, capped +0.25, decays with the meter
target     = 0.55·intensity + 0.35·variety + tapBoost  (clamp 0..1)
Hype      += (target − Hype) · (1 − exp(−dt / 6s))     // ~6 s smoothing
tipsPerToss = BASE_GOLD_PER_TOSS × goldRateMultiplier × (1 + 2·Hype)   // 1×..3×
```

- **Bounded at 3×:** Hype is a mood, not a second exponential engine. This is Machinations' "stopping mechanism".
- **Variety needs 6 distinct shapes for full credit.** Shapes now pay. Price them at roughly 10–25% of the current sparkle band, not 2%.
- **Readable steps:** with 20% just-noticeable steps, show Hype in 5 tiers (Polite → Cheering → Roaring → Ecstatic → Legendary). Each tier is +40% tips, so every tier is visible.
- **Late growth:** FPS_ref grows with venue stage (`VenueProgression.js`), so intensity drops when the venue expands and has to be earned back. That keeps the meter alive instead of pinned at 1.

**Predicted effect on the late flatline.** Take the bot's FPS curve (5.7 at 15 m → 26.6 at 36 m) with FPS_ref = 10:
- Intensity goes 0.44 → 0.93.
- The intensity term alone takes the tip multiplier from 1.48× to 2.02× (×1.37). Variety and taps can add up to another +0.7×.
- Stacked on the existing ×2.4 from Festival Sponsors and Full House, late gold grows about ×3.3, inside the ×2–4 target. Today it flatlines after the step.
- That's still far below sparkles' ×30, so gold remains the scarce currency.

These numbers come from a spreadsheet estimate. Confirm them with the live bot after Phase 2.

### Cult tithe

```
tithe share     = 8% of incoming tips per cultist (max 3 → 24%)
sparkles out    = tithe × rate, rate starts at 3 ✦/●, Louder Chants ×1.75 each
```

**Reference value:** this run returned about 270k sparkles from performers bought with ~124k gold, roughly 2.2 ✦ per ●. A starting rate of 3 ✦/● is a fair trade that upgrades push into a good one.

### Role purity target

```
purity(c) = (spend of c on sinks with c's role) / (total spend of c)
```

| Currency | Today | Target |
|---|---|---|
| Sparkles | ~99% (only 2 people nodes) | ≥ 95% |
| Gold | 6% "people", 94% "sparkle output" | ≥ 90% people/crew |

Gold still ends up making sparkles through crew and the tithe. That's fine, because the player *buys a person*, not a sparkle multiplier.

### Stars (phase 3, optional)

```
stars = floor( sqrt( lifetimeSparkles / 5,000 ) )      // AdCap/RG-style square root
bonus = +10% all income per star (Egg-Inc style, never spent)
```

- First finale ≈ 770k lifetime ✦, which gives about 12 stars (+120%). The second run is about 2.2× faster, inside the 2–3× rule.
- Doubling stars needs 4× the lifetime sparkles, so runs lengthen gently.

### Pacing guardrails (keep what works)

| Metric | Now | Target |
|---|---|---|
| Median gap, sparkle purchases | 38 s | 30–45 s |
| Median gap, gold purchases | 76 s | 60–90 s |
| Max purchase gap | 75 s | ≤ 90 s |
| Gold/s growth, last 15 min | ×1.0 (flat) | ×2–4 |
| Idle gold at finale | 14k (no sinks) | tithe absorbing; no stranded balance |
| Share of sparkles from taps after 10 min | 0.5% | ~0% directly; taps matter through Hype |
| Time to finale (active) | 38 min | unchanged ±10% |

---

## 5. Concrete changes to the current tree

| Node / system | Today | Change |
|---|---|---|
| Sparkle Powder (`crowd_fireworks`) | gold → +25% portal sparkles | Move to the PORTAL branch, costing ✦. Or replace with **Encore Chant** (● → +Hype decay time). |
| Extra Tickets (`crowd_invite_1`) | ✦ → +4 fans | Cost ● |
| Sky Catchers (`crowd_catcher_unlock`) | ✦ | Fold into the Catapult keystone (catapult already enables catching), or cost ● |
| Catapult, Flyers, Grand Finale | single currency | Add `secondaryCost` in the other currency (keystones) |
| Louder Chants | +75% cultist sparkles | +75% **tithe rate** |
| Cultists | make sparkles from nothing | Convert a share of tips into sparkles (converter). Ritual VFX already reads as "bowl → sparkles"; add coin motes flowing in. |
| Shapes (15 nodes) | cosmetic, 2% of spend | Feed Hype variety. Re-price. Tooltip: "+variety". |
| Flyer "Helping Hands" (`flyer_reach`) | same name as the crowd node | Rename it (e.g. "Long Arms") |
| Milestones | currency goals already roughly match roles | Add one **Hype** goal right after Opening Night ("Get the crowd Roaring") to teach the meter. Keep gold goals before people unlocks and sparkle goals before machine unlocks. |
| Crowd cap | gold rate hits a hard ceiling at 43 fans | Keep the cap. Hype is the late growth axis, not fan count. |

### UI legibility

- One glyph and color per currency everywhere: wallet, cost chips, the coin/sparkle VFX that flies to the wallet, and upgrade card borders.
- A one-line role subtitle in the wallet on first reveal: "✦ Sparkles — build the show", "● Tips — hire the crowd".
- A Hype bar attached to the crowd, not the wallet, so it lives on its own object.
- The tithe shown as a live flow ("−18 ●/s → +54 ✦/s") on the cult card.

---

## 6. Rollout

**Phase 1 — Re-sort (low risk, no new systems).**
- Move the misassigned nodes, rename the duplicate, add the keystone dual costs, apply the UI color/glyph pass.
- Re-tune costs with `node tools/run_live_bot.mjs --preset active|relaxed|idle`. Don't use the headless sim, which is stale.

**Phase 2 — Hype + cult tithe.**
- Add `HypeSystem` (meter, tiers, crowd cheer VFX).
- Rework cultists into the converter and re-price shapes.
- Extend `GameMetrics` / bot trace with `hype`, `tithe`, and per-currency purity.
- Check the pacing guardrails.

**Phase 3 — Stars (optional, larger).**
- After the first Grand Finale, add a "Take the show on tour" reset: keep shapes, recipes and Stars, reset the venue.
- Only worth doing if the game should outlive the first finale.

### Open questions for us

1. Is the game meant to end at the Grand Finale? That decides whether Phase 3 exists.
2. Should Hype also speed fan *arrivals*, or only tips? Arrivals are currently time-gated by `CROWD_CONFIG.arrivals`.
3. Should the tithe be automatic (simple) or a slider (more agency, more UI)?

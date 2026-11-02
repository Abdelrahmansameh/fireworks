# Milestones — Pacing Design

## Why

The show used to pace itself through the skill tree: big unlocks were expensive cards hidden behind launcher counts and upgrade chains. The live bot (active preset) showed three problems:

- **Minutes 2–6 were a dead zone.** With three launchers and about 2 sparkles/s, Opening Night (330 sparkles) took 172 s and nothing else happened.
- **The mid-game had no beats.** Fans arrived at 5.7 min, then nothing new until the Workshop at 14.5 and the Catapult at 15.9, and then nothing until Flyers at 29.0.
- **The ending crawled.** The last purchases were 112–194 s apart while the player saved for Sky Curtain II and the Grand Finale.

Milestones replace that with one visible goal at a time. Each goal is short, says exactly what to do, shows its progress, and pays out something new.

## Rules

- **One goal, always visible.** A minimal widget at the top centre shows only the current goal, its count and a progress bar.
- **Milestones are for major unlocks only.** No currency rewards, no filler. Fewer, longer goals are fine.
- **Milestones unlock; the shop sells.** Fans, flyers, Sky Catchers, the Firework Creator and the Grand Finale are **only** earned through milestones. Building milestones (Auto Launcher, Sparkle Workshop, Catapult) unlock that building for purchase and never build one for free; Catapult Team likewise only raises the catapult limit. Big launcher upgrades (Full Salvo, Sky Curtain, Festival Sponsors) are *opened* by a milestone and then bought with currency.
- **Goals never go backwards.** Earn, collect and catch goals count from the moment the goal starts, so spending never undoes progress. Ownership goals (launchers, catapults, fans, upgrades) read what the player owns now.
- **No shopping goals.** Goals never say "buy this upgrade"; they count sparkles, gold, catches, fans or buildings. Late launcher-count goals were also dropped: while a player saves for launchers they skip the multipliers, and income stalled for over 10 minutes.
- **Rewards are claimed, not given.** A met goal turns the widget into a paper sticker that names what the tap gives. The reward arrives only when the player taps it; a notification names it. The next goal starts counting at the claim.
- **Hands-off players never get stuck.** Every goal on the chain can be finished without dragging fans or clicking. The idle bot completes the game.

## The chain (12 milestones, 6 chapters)

Times are game minutes from the live browser bot at 50× (`tools/run_live_bot.mjs`). Every milestone opens something major; none pays out currency, and none asks the player to buy an upgrade.

| # | Goal | Reward | Active | Relaxed |
| --: | --- | --- | --: | --: |
| | **1 · First Sparks** | | | |
| 1 | Launch 5 fireworks | **Upgrade shop** | 0.0 | 0.1 |
| 2 | Earn 40 sparkles | **Firework Creator** | 0.3 | 0.7 |
| 3 | Earn 60 sparkles | **Auto Launcher** | 0.6 | 1.2 |
| 4 | Own 3 Auto Launchers | **Opening Night** | 1.3 | 3.3 |
| | **2 · Opening Night** | | | |
| 5 | Welcome 5 fans | **Sky Catchers** | 4.3 | 6.8 |
| 6 | Collect 1,600 gold | **Sparkle Workshop** | 7.2 | 9.8 |
| | **3 · Festival Ground** | | | |
| 7 | Collect 1,800 gold | **Catapult** | 8.8 | 11.6 |
| 8 | Own 2 Catapults | Opens **Festival Sponsors** | 12.5 | 15.4 |
| | **4 · Bigger Sky** | | | |
| 9 | Collect 7,000 gold | **Flyers** | 15.3 | 18.2 |
| 10 | Earn 18K sparkles | Opens **Full Salvo** | 20.9 | 24.0 |
| | **5 · Sky Curtain** | | | |
| 11 | Earn 70K sparkles | Opens **Sky Curtain** | 28.2 | 31.5 |
| | **6 · Grand Finale** | | | |
| 12 | Earn 500K sparkles | **Grand Finale** | 36.7 | 40.1 |

The venue still grows on its own launcher and fan thresholds (`VenueProgression.js`). Milestone rewards don't claim venue expansions.

## Results

| Live bot run | Finale done | Longest milestone gap | Median gap | Longest gap between purchases |
| --- | --: | --: | --: | --: |
| Before milestones (active) | 45.2 min | — | — | 194 s |
| Milestones (active) | 37.2 min | 509 s | 170 s | 72 s |
| Milestones (relaxed) | 40.6 min | 516 s | 180 s | 113 s |
| Milestones (idle) | 44.4 min | 520 s | 233 s | 142 s |

Total length stays close to the old 45 minutes, but there is never a long stretch without a purchase (at most 72–142 s between them). To lengthen it, raise the cumulative targets (gold, catch, earn) or add goals. Avoid launcher-count goals late in the chain: they make players save for launchers instead of buying multipliers.

## Pricing changes that came with the chain

- Opening Night, Sky Catchers, Workshop, Catapult, Flyers and the Grand Finale are milestone rewards. Their old upgrade prices and launcher-count gates are gone; the Workshop and Catapult unlock their building for purchase instead of building one.
- Catapult Team (+1 catapult limit) no longer builds the extra catapult; you buy it.
- Full Salvo now costs 25,000 (was 55,000) and Sky Curtain costs 60,000 / 150,000 (was 120,000 / 300,000). They open about 15 minutes earlier than before, when income is roughly a third of what it was at their old unlock time.
- Full Salvo, Sky Curtain and Festival Sponsors are gated by `requires.milestone` instead of their tree parent, so a "New upgrade" reward always produces a buyable card.

## The widget

- One button styled like the menu rail (dotted indigo panel, hand-drawn border, hard shadow, bold Shantell Sans): goal text, count (`2/3`, `412K/600K`) and a thin cream progress bar. No reward, hint or chapter text.
- When the goal is met it becomes a paper sticker like the active rail tab, reading what the tap gives ("Unlock Catapult"). Tapping grants it.
- Desktop: top centre, 300 px. Between 701 and 1199 px it centres between the menu rail and the wallet. Phone: full width under the wallet; notifications move below it.
- The widget disappears once every milestone is claimed.

## Saves, resets and edge cases

- State (`milestoneState`) stores completions by id plus the starting totals of the current goal, so the chain can be reordered or extended later.
- **Older saves** skip, silently, every milestone up to the furthest one the save already shows (an owned reward, or an ownership goal already met). Skipped feature rewards are granted.
- **Reset all upgrades** refunds only paid upgrades. Milestone rewards stay unlocked, and the crowd stays.
- A full game reset restarts the chain. Save export/import includes milestones; an import without them migrates as above.
- The cheats "Unlock all upgrades" and "Unlock everything" complete the chain silently.

## Files

- `js/config/MilestoneConfig.js`: the chain. All tuning happens here.
- `js/upgrades/MilestoneManager.js`: progress, grants, persistence, migration.
- `js/ui/MilestoneWidget.js` and `milestones.css`: the widget.
- `js/ui/SkillTreeConfig.js` / `ProgressionManager.js`: `milestoneReward` nodes, `requires.milestone` gates.
- `js/bot/GameBot.js` claims a reward as soon as it is ready; `js/bot/LivePurchasePolicy.js` follows the current milestone and spends freely during earn/collect goals. `run_live_bot.mjs` prints the milestone timeline.

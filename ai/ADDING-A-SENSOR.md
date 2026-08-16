# Adding a Sensor: Question Blocks

A walkthrough for wiring a new sensor into the neural network,
using the `isQuestionBlock` tile check as the worked example.

This is a guide, not a patch. It tells you what to build, where
it plugs in, and which parts will silently do nothing if you
miss them. Write the code yourself.

---

## 0. First, your primitive is correct — here's why

`isQuestionBlock(tileX, tileY)` compares `block.sprite` against
`level.qblockSprite`. That identity check holds up across the
whole block lifecycle, which is worth understanding before you
build on it.

`Level.putQBlock` (`js/levels/level.js:120`) builds the block with
`sprite: this.qblockSprite` and **no `bounceSprite`**. Bricks
(`:129-130`) get `brickSprite` *plus* a `brickBounceSprite`. That
difference matters:

| Event | Q-block | Brick |
|---|---|---|
| Mario bonks it | `sprite = usedSprite` **immediately** (no bounce sprite to swap in) | `sprite = bounceSprite`, original saved in `osprite` |
| While bouncing | already `usedSprite` → your check returns `false` | restores `osprite` when it lands |
| After it settles | converted to a `Mario.Floor` in `level.statics`, **deleted from `level.blocks`** | stays a block |

So a spent Q-block stops matching twice over: its sprite changes
on impact, and it leaves `level.blocks` entirely a few frames
later (`js/block.js:70-74`). Your sensor will only ever report
*unused* Q-blocks. That is what you want.

**One blind spot to be aware of:** item-bearing *bricks* are
invisible to this check. In `js/levels/11.js`, `putBrick(100, 9,
new Mario.Star(...))` hides a Star inside an ordinary-looking
brick. Your sensor will never see it, because its sprite is
`brickSprite`. That is a reasonable limitation — just know it is
there, and don't be confused when Mario ignores that block.

**Also:** like every other sensor here, yours reads the global
`level`, which is only correct while an environment is active.
That is fine — `getInputs()` is called from inside `think()`,
which runs inside the activation window. Don't call it from
anywhere else.

---

## 1. Decide what the number *means*

The network takes a flat array of numbers. `isQuestionBlock`
answers a question about **one tile**; you need a **single scalar
per frame**. So pick the question you're actually asking:

| Option | Value | Good for |
|---|---|---|
| "Is there a Q-block directly above me?" | `1` / `0` | Teaching Mario to *hit* blocks he's standing under |
| "How many tiles ahead is the next Q-block?" | normalized distance | Teaching Mario to *navigate toward* blocks |

These teach different behaviours. Pick one and commit — you can
always add the other later as a seventh input.

Worth knowing before you choose: most Q-blocks in world 1-1 sit at
**row 9**, and Mario stands around **rows 12-13**. Row 9 is about
two tiles above his head, so he has to be *airborne* to bonk one.
A few sit at row 5 (`putQBlock(22, 5, ...)`, `(94, 5)`, `(108, 5)`,
`(129, 5)`, `(130, 5)`) and can only be reached from on top of
something. An "above me" sensor therefore needs to scan several
rows up, not just one.

---

## 2. Build the scanning sensor

Add a **second function** to `MarioSensors`, next to your
primitive. It loops; the primitive answers one tile at a time.

Model it on **`obstacleDistance`** in the same file — it is the
closest existing analogue and already solves the same problems.
Copy these three habits from it:

1. **Guard first.** Every sensor starts with
   `if (!level || !player || !player.pos)`. Sensors get called
   before the world exists and will throw without this.

2. **Derive tiles from pixels.** `Math.floor(player.pos[0] /
   this.TILE_SIZE)` — never assume Mario is tile-aligned.

3. **Return the max on "found nothing", not zero.**
   `obstacleDistance` returns `maxTiles` when the scan comes up
   empty. After normalizing, that means *bigger = further away or
   nothing there*. If you return `0` for "nothing found", your
   input reads **inverted** relative to every other distance
   sensor, and the network has to burn capacity learning around
   your inconsistency.

---

## 3. Append it to the input vector

**File:** `ai/inputs.js`, the returned array at **line 110**.

Current shape:

```
[ obstacle, ground, enemy, velocityX, velocityY ]
    0          1       2        3          4
```

Add yours at **index 5**.

> ### Append. Do not insert.
>
> `ai/environment.js` `think()` reads `sensors[0]`, `sensors[1]`
> and `sensors[2]` **by index** to decide jumping —
> `obstacleClose`, `pitAhead`, `enemyClose`. Insert your value in
> the middle and those three silently re-map to the wrong
> sensors. Jumping breaks, nothing errors, and you will spend an
> afternoon blaming the network.

While you're in that file, match the local conventions:

- **Normalize into the same range as its neighbours.** Booleans →
  `1`/`0`. Distances → divide by max tiles to land in `0..1`.
  Inputs on wildly different scales make the initial random
  weights badly conditioned and slow convergence.
- **Guard non-finite values.** Every other input has a
  `Number.isFinite` fallback. Do the same, or one `NaN` poisons
  every downstream weight and Mario's position becomes `NaN` —
  this has already happened once in this codebase.

---

## 4. Tell the network it has a sixth input

**File:** `ai/trainer.js`, **line 40** — `INPUT_COUNT = 5` → `6`.

> ### The silent failure
>
> `ai/neuralnetwork.js:180` loops:
>
> ```js
> for (var i = 0; i < network.inputCount; i++)
> ```
>
> It bounds by **`inputCount`**, not by the array's length. Pass a
> 6-element array to a network built with `inputCount: 5` and the
> sixth element is **quietly discarded**. No error. No warning.
> Training proceeds normally and your sensor does nothing.
>
> If your new sensor "has no effect", check this first.

Also update the stale hardcoded `NeuralNetwork.create(5, 8, 3)` at
**`ai/population.js:317`**. The trainer no longer uses that path,
but leaving a wrong literal there will mislead you later — fix it
or delete the dead code.

You do **not** need to touch `neuralnetwork.js` itself. `create`,
`copy`, `mutate` and `predict` all read `inputCount` off the
network object, so they adapt automatically.

---

## 5. Expect your saved brain to be rejected

`AITrainer.isValidNetwork()` validates a loaded model's
`inputCount` against the constant and refuses a mismatch. After
step 4 you will see:

```
Saved network is missing or has the wrong shape - ignoring it and starting fresh.
```

**That is correct behaviour, not a bug.** It exists precisely to
stop a 5-input brain loading into a 6-input world, where every
weight would be shifted by one and the thing would behave like
noise.

Clear these keys and accept that training restarts at generation 1:

- `mario_ai_best_network`
- `mario_ai_checkpoint_*`

---

## 6. Optional — see it on screen

Turn on **Sensors** in the training panel to check your sensor is
reading what you think it is.

- **Numeric readout:** add a line in `MarioSensors.readoutLines()`.
  It renders into the DOM overlay, so it stays sharp.
- **Drawn ray or tile highlight:** record into `this.lastReadings`
  (guarded by `if (this.debugDraw)` so it costs nothing when off),
  then draw it in `drawDebug`.

> **Gotcha:** `ai/environment.js` `think()` snapshots
> `MarioSensors.lastReadings` into `env.sensorReadings` by copying
> **three named keys** (`obstacle`, `ground`, `enemy`). Add a
> fourth reading and you must add it there too — otherwise all
> eleven viewports draw the *last* environment's reading, because
> `lastReadings` is a singleton and rendering happens after every
> environment has already updated.

---

## 7. The part that decides whether any of this works

Everything above wires the sensor **in**. None of it gives the
network a reason to **use** it.

Fitness is currently distance and nothing else. In
`ai/episode.js` it is set in **two** places:

- **line 751** — `this.env.result.fitness = this.maxX;` (per frame)
- **line 830** — `result.fitness = this.maxX;` (on episode end)

**Change both, or the end-of-episode value overwrites your work
and you'll see no effect.**

Nothing rewards hitting a Q-block, collecting a coin, or growing.
So selection has no preference for a network that uses your input
— those weights just drift as noise. Wire it perfectly and you
will most likely observe *no behaviour change at all*, then
conclude the sensor is broken when the reward is what's missing.

It is also mildly **negative** on its own: a sixth input adds 8
more weights (one per hidden neuron) to the genome. The current
setup completes the level in roughly **4 of 6 seeds** over 120
generations — a bigger search space with no added signal makes
that a little worse, not better.

### Reward hooks already available

| Signal | Where it updates | Notes |
|---|---|---|
| `player.coins` | `js/coin.js:44`, `js/bcoin.js:32` | Integer, only ever increases within an episode. Simplest hook. |
| `player.power` | `js/player.js:343` (→1), `:352` (→2) | `0` small, `1` big, `2` fire. Drops back to `0` on damage. |

### Scaling the reward

Distance runs to about **3162** (the flagpole). A coin is worth
`1`. So a naive `fitness = maxX + coins` is a rounding error — a
single extra pixel of progress outweighs a coin.

Pick a per-coin bonus large enough to matter against the distance
term, but small enough that farming coins never beats finishing
the level. Somewhere in the tens is the right order of magnitude.
There is prior art in `ai/fitness.js` (`enemyPassBonus: 15`,
`jumpBonus: 5`) — that file is legacy and unused by the trainer,
but the *scale* it chose is a reasonable starting point.

---

## 8. How to tell whether it actually helped

Do not trust one run. This is a stochastic search and a single
result means nothing — that mistake has already been made in this
project, twice.

The current baseline is **4 of 6 seeds reaching ~3162 over 120
generations**. Measure your change the same way:

- `scratchpad/variance.js` runs N seeds and reports the spread.
- `scratchpad/ab.js` compares configurations head to head.

If your change is real, the success rate or the average climbs
across several seeds. If a single seed jumps and the average
doesn't move, you got lucky.

---

## Anchor reference

| What | Where |
|---|---|
| Your tile primitive | `ai/sensors.js` — `isQuestionBlock` |
| Sensor to model it on | `ai/sensors.js` — `obstacleDistance` |
| Input vector | `ai/inputs.js:110` |
| Jump gate reading `sensors[0..2]` | `ai/environment.js` — `think()` |
| Network input count | `ai/trainer.js:40` |
| Stale hardcoded shape | `ai/population.js:317` |
| Loop that silently truncates | `ai/neuralnetwork.js:180` |
| Saved-model validation | `ai/trainer.js` — `isValidNetwork()` |
| Fitness (per frame) | `ai/episode.js:751` |
| Fitness (episode end) | `ai/episode.js:830` |
| Coin counter | `js/coin.js:44`, `js/bcoin.js:32` |
| Power level | `js/player.js:343`, `:352` |
| Debug readout | `ai/sensors.js` — `readoutLines()` |
| Per-env reading snapshot | `ai/environment.js` — `think()` |

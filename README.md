# Mario AI — evolving a neural network to play Super Mario Bros. 1-1

A population of small neural networks learns to play World 1-1 by natural
selection. No training data, no backpropagation, no gradients — just ten Marios
playing at once, keeping whatever worked, and mutating it.

**Live demo:** https://sup-Udh.github.io/mario/

![Mario](http://www.garrettjohnson.net/images/fulls/mariofull.png)

The game engine underneath is [reruns/mario](https://github.com/reruns/mario),
a hand-built HTML5 Canvas clone of Super Mario Bros. **The engine is unmodified**
— everything in `ai/` was added on top, and the trick that made that possible is
described below.

---

## What you see on screen

| Region | What it is |
|---|---|
| **Grid of 10 viewports** | The current generation. Ten networks, ten independent Mario worlds, all simulating at once. |
| **BEST panel** | The reigning champion, replayed at true 60fps. It ignores the current generation and only adopts a new brain when a record is actually broken. |
| **Dashboard** | Live stats plus the learning curve: all-time record, per-generation best, and population average. |
| **Top-right panel** | Turbo toggle and speed, hand env 1 to the keyboard, and a sensor-overlay toggle. |

Training runs at 10x by default while the champion's screen stays at real time,
so you can watch one Mario play properly while a thousand others rip through
the level behind him.

---

## The interesting part: one engine, eleven worlds

The engine was written as a single-player game. It keeps the world in module-level
globals — `player`, `level`, `vX`, `fireballs`, `updateables`, `ctx` — and every
entity reads them directly. Running ten independent games would normally mean
rewriting all of it to thread a world object through every call site.

Instead, `ai/environment.js` gives each world its own copy of those globals and
**swaps them in around each tick**:

```js
env.run(function() {
    handleInput(dt);        // the original functions,
    updateEntities(dt, t);  // completely unmodified,
    checkCollisions();      // operating on env's world
});
```

`activate()` saves the current globals and installs this environment's; `deactivate()`
pulls the (possibly reassigned) values back out and restores what was there. A
`try/finally` guarantees the restore, and re-entrancy throws rather than corrupting
two worlds at once.

Three consequences shaped the rest of the design:

- **A finished environment is frozen, not reset.** Simulating past the end of an
  episode reaches a level-exit path that schedules a 5-second `setTimeout` mutating
  `player` and `level` from *outside* any activation window — and reschedules it
  every frame.
- **Episode endings are queued, not called.** The end-of-episode callback rebuilds
  the world, which needs to activate the environment again — impossible from inside
  its own activation. So `_pendingEnd` defers it by a few lines.
- **Each environment owns its own input bank.** One shared key map would let one
  network press another network's buttons.

---

## The learning loop

```
                MASTER NETWORK
                      |
        +-------------+-------------+
        v             v             v
    NETWORK 1     NETWORK 2 ...  NETWORK 10
        |             |             |
     MARIO 1       MARIO 2       MARIO 10
        |             |             |
        +-------------+-------------+
                      v
               FITNESS RESULTS
                      v
             SELECT BEST NETWORK
                      v
                 NEW MASTER
```

All ten run to completion (**generation barrier**) before anything is scored. Then:

1. **The master is copied unchanged** into slot 0, so the best known strategy is
   never lost to an unlucky mutation.
2. The next elites are copied and *lightly* mutated.
3. Two **brand-new random networks** are injected every generation. Without them the
   population is one master plus small mutations of it — and since the level is
   deterministic, that means ten identical Marios, ten identical scores, no selection
   signal, and a master that can never change.
4. The remaining slots are mutated children of a random elite.

Mutation size decays each generation (0.35 → 0.02 floor): coarse exploration early,
fine-tuning later, never zero.

### The network

A 5-8-3 MLP with sigmoid activations, evolved rather than trained — `ai/neuralnetwork.js`
is about 300 lines and has no dependencies.

**Inputs** (`ai/inputs.js`, all normalised to roughly ±1):

| # | Sensor | Meaning |
|---|---|---|
| 0 | `obstacleDistance` | tiles to solid terrain ahead, /10 |
| 1 | `groundAhead` | 0 if a pit is within 3 tiles, else 1 |
| 2 | `enemyDistance` | tiles to the nearest enemy ahead, /10 |
| 3 | `velocityX` | horizontal speed |
| 4 | `velocityY` | vertical speed |

**Outputs:** left, right, jump.

Index order is load-bearing — new sensors go on the **end**. See
[`ai/ADDING-A-SENSOR.md`](ai/ADDING-A-SENSOR.md), and note that saved networks are
*migrated* rather than discarded when the input count grows: a new zero-initialised
weight row means the brain behaves exactly as before until mutation finds a use for it.

### Honest note on how much the network actually decides

The network **proposes**; a hand-written policy in `MarioEnvironment.think()` decides
whether jumping is appropriate at all. A jump requires a *reason* (pit, obstacle, or
enemy near) **and** the network's vote above a threshold. There is also a deadlock
breaker that jumps regardless of the network when Mario has been shoving into a wall
for 0.3s, and RUN is held permanently.

Direction is the network's own call, but debounced — raw sigmoid outputs sit near a
tie (median margin ~0.06), and comparing them directly caused a reversal every ~25
frames. The debounce values are load-bearing in the other direction too: tightening
the margin to 0.15 capped learning at x=498 across every seed, because the network
could then never express a direction preference at all.

### Fitness

```
score = distance
      + 15 per enemy left behind
      +  5 per jump that actually cleared a pit
      - 50 if the run ended in death        (never below 0)
```

Distance alone can't tell "reached x=2000 and survived" from "reached x=2000 and died
on the next frame". The bonus terms break that tie. Raw distance is tracked separately
and is what the stuck-detector and the HUD use, so a bonus can never make a stationary
Mario look like he's progressing.

---

## Persistence

The champion is saved to `localStorage` whenever a record is broken, and reloaded
automatically on the next visit.

| Key | Contents |
|---|---|
| `mario_ai_best_network` | Champion weights, its score, generation, mutation step, scoring version |
| `mario_ai_checkpoint_<gen>` | Snapshot every 200 generations, 3 most recent kept |

`localStorage` is per-origin, so a champion trained on `localhost` will **not** appear
on the deployed page — they are separate stores.

Saved runs carry a `scoringVersion`. When the fitness function changes, the network is
kept but its old score is dropped: a record set under different rules may be unreachable
under the new ones, and since networks are only written when the record is beaten, a
stale target would silently stop anything from ever being saved again.

---

## Running it

Any static server works — `localStorage` and canvas both need a real origin:

```sh
python -m http.server 8000     # then open http://localhost:8000
```

**Controls:** arrow keys to move, `X` to jump, `Z` to run — after clicking
*"AI training (click to play ENV 1)"* to take over environment 1.

### Console knobs

```js
TRAINING.turbo = false            // watch training at real speed
TRAINING.stepsPerFrame = 30       // or go faster

MarioSensors.debugDraw = true     // draw the sensor rays
MarioEnvironment.debugJumps = true

AITrainer.verboseLog = true       // full per-environment dump each generation
AITrainer.mutationRate = 0.5

MarioFitness.deathPenalty = 200   // picked up by every environment immediately

AUDIO.allowTraining = true        // hear all 11 worlds at once (don't)
```

Audio is scoped to whichever environment is currently active, so only the champion's
screen — and a human-played environment — is ever heard. Every clip is a shared `Audio`
object played from inside entity code, so without that scoping, eleven worlds fire the
same twelve sounds at 10x speed.

---

## Known limitations

- **The level is deterministic and there is only one of it.** No randomness anywhere in
  the engine, so the same network always produces the same run. The population is
  memorising 1-1, not learning to play Mario — there is no generalisation pressure.
- **One evaluation slot per generation is wasted** on the exact master copy, which by
  determinism re-derives a score already known.
- **Fitness has no time term.** Clearing the level slowly ties with clearing it quickly.
- **Evolution only, no gradient learning.** A 5-8-3 network with ~70 parameters explores
  a small space; NEAT-style topology evolution or a proper RL method would go further.

---

## Credit

Game engine, sprites and level data: **[Garrett Johnson](http://garrettjohnson.net)** —
[reruns/mario](https://github.com/reruns/mario). The `ai/` directory and the
multi-environment/AI changes to `js/game.js` are this fork's additions.

The graphics, sounds, and original design of Super Mario Bros. are owned by Nintendo.
This project is for demonstration only.

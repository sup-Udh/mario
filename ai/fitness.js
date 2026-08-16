// ==================================================
// Fitness
//
// Distance is the backbone of the score, but distance
// ALONE cannot tell these two runs apart:
//
//   A: reached x=2000 and was standing there, alive
//   B: reached x=2000 and died on the next frame
//
// Under pure distance they tie, so evolution has no way
// to prefer surviving. This adds the terms that break
// that tie:
//
//   + enemyPassBonus  per enemy left behind
//   + jumpBonus       per jump that actually cleared a pit
//   - deathPenalty    once, if the episode ended in death
//
// ONE INSTANCE PER ENVIRONMENT. The bonus accumulator and
// the passed-enemy set are episode state, and eleven
// worlds tick interleaved - a shared singleton would let
// environment 1's kills pay out on environment 7's score.
// Same reasoning as MarioInput.create and
// MarioEpisode.create.
// ==================================================

(function() {

    var scope =
        (typeof window !== 'undefined') ? window : globalThis;


    function EnvironmentFitness(env) {

        this.env = env;


        // ------------------------------------------
        // Bonuses and penalties ONLY.
        //
        // Distance is owned by the episode (which needs
        // the raw value for its stuck detector, and shows
        // it in the HUD as true distance). Keeping the two
        // apart means neither can quietly corrupt the
        // other.
        // ------------------------------------------

        this.bonus = 0;


        // Enemies already paid out this episode, keyed by
        // enemy.idx (assigned in js/goomba.js and
        // js/koopa.js), so each one pays exactly once.
        this.passedEnemies = {};


        // Was this airtime the result of an actual jump,
        // rather than walking off a ledge?
        this.jumpedThisAirtime = false;


        // What the ground-ahead sensor read at the moment
        // Mario left the ground. Captured at takeoff, so it
        // reflects what the network could actually see when
        // it made the decision - not what happened to be
        // under him when he landed.
        this.groundAheadAtJump = true;
    }


    EnvironmentFitness.prototype.reset = function() {

        this.bonus = 0;

        this.passedEnemies = {};

        this.jumpedThisAirtime = false;

        this.groundAheadAtJump = true;
    };


    // ----------------------------------------------
    // Called once per tick from EnvironmentEpisode,
    // which runs INSIDE this environment's activation
    // window - so the globals below belong to us.
    // ----------------------------------------------

    EnvironmentFitness.prototype.update = function() {

        var player = scope.player;

        if (!player || !player.pos) {
            return;
        }

        this.checkEnemiesPassed(player.pos[0]);

        this.checkJump(player);
    };


    // ----------------------------------------------
    // Small reward for every enemy Mario gets past -
    // stomped, dodged or jumped clean over - paid the
    // first time it ends up behind him.
    // ----------------------------------------------

    EnvironmentFitness.prototype.checkEnemiesPassed = function(marioX) {

        var level = scope.level;

        if (!level || !level.enemies) {
            return;
        }

        for (var i = 0; i < level.enemies.length; i++) {

            var enemy = level.enemies[i];

            if (!enemy || !enemy.pos) {
                continue;
            }

            if (this.passedEnemies[enemy.idx]) {
                continue;
            }

            if (enemy.pos[0] < marioX) {

                this.passedEnemies[enemy.idx] = true;

                this.bonus += MarioFitness.enemyPassBonus;
            }
        }
    };


    // ----------------------------------------------
    // Reward jumping specifically to clear a gap.
    //
    // - Jumped while groundAhead was false, then landed
    //   safely -> a real pit clear, rewarded.
    // - Jumped over flat ground -> nothing, that jump
    //   wasn't needed.
    // - Fell off a ledge without jumping -> nothing,
    //   gap or not.
    // ----------------------------------------------

    EnvironmentFitness.prototype.checkJump = function(player) {

        if (player.jumping) {

            if (!this.jumpedThisAirtime) {

                this.groundAheadAtJump =
                    MarioSensors.groundAhead();
            }

            this.jumpedThisAirtime = true;
        }

        if (player.standing) {

            if (
                this.jumpedThisAirtime &&
                !this.groundAheadAtJump
            ) {
                this.bonus += MarioFitness.jumpBonus;
            }

            this.jumpedThisAirtime = false;

            this.groundAheadAtJump = true;
        }
    };


    // ----------------------------------------------
    // Applied once by the episode, when the run ended
    // because Mario died.
    // ----------------------------------------------

    EnvironmentFitness.prototype.applyDeathPenalty = function() {

        this.bonus -= MarioFitness.deathPenalty;
    };


    // ----------------------------------------------
    // Final score for a run of the given distance.
    //
    // Clamped at zero: fitness drives selection, and a
    // death penalty must never push a network that got
    // somewhere BELOW a network that never moved.
    // ----------------------------------------------

    EnvironmentFitness.prototype.score = function(maxX) {

        var total = maxX + this.bonus;

        if (!isFinite(total) || total < 0) {
            total = 0;
        }

        return total;
    };


    // ----------------------------------------------
    // Tunables live on the module, so they can be
    // changed from the console mid-run and every
    // environment picks the new value up immediately.
    //
    //   MarioFitness.deathPenalty = 200
    // ----------------------------------------------

    scope.MarioFitness = {

        enemyPassBonus: 15,

        jumpBonus: 5,

        deathPenalty: 50,


        // Bumped whenever any of the above changes the
        // meaning of a score. A saved record from an older
        // scoring rule is not comparable to a new one, and
        // AITrainer uses this to avoid resuming behind an
        // unreachable high score (see loadBestNetwork).
        scoringVersion: 2,


        create: function(env) {

            return new EnvironmentFitness(env);
        }
    };

})();

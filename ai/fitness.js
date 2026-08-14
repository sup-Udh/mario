var MarioFitness  = {

    // --------------------------------------------------
    // Distance tracking (main reward)
    // --------------------------------------------------

    maxX: 0,


    // --------------------------------------------------
    // Reward tuning
    // --------------------------------------------------

    enemyPassBonus: 15,

    jumpBonus: 5,

    deathPenalty: 50,


    // --------------------------------------------------
    // Bonus/penalty accumulator, kept separate from
    // maxX so MarioEpisode's stuck-detector (which
    // reads maxX directly) only ever sees raw distance.
    // --------------------------------------------------

    bonus: 0,


    // --------------------------------------------------
    // Enemies already rewarded this episode, keyed by
    // enemy.idx, so each enemy only pays out once.
    // --------------------------------------------------

    passedEnemies: null,


    // --------------------------------------------------
    // Was Mario's current time in the air the result
    // of an actual jump (vs falling off a ledge)?
    // --------------------------------------------------

    jumpedThisAirtime: false,


    // --------------------------------------------------
    // Was there ground ahead the moment Mario left the
    // ground this airtime? Captured at takeoff so it
    // reflects what the network actually saw when it
    // decided to jump (or not).
    // --------------------------------------------------

    groundAheadAtJump: true,


    reset: function() {

        this.maxX = 0;

        this.bonus = 0;

        this.passedEnemies = {};

        this.jumpedThisAirtime = false;

        this.groundAheadAtJump = true;
    },


    // --------------------------------------------------
    // Update fitness
    // --------------------------------------------------

    update: function() {

        if (!player || !player.pos) {
            return;
        }

        var marioX = player.pos[0];

        // Reward forward progress
        if (marioX > this.maxX) {
            this.maxX = marioX;
        }

        this.checkEnemiesPassed(marioX);

        this.checkJump();
    },


    // --------------------------------------------------
    // Small bonus for every enemy Mario gets past
    // (stomped, dodged, or jumped over) - awarded once
    // per enemy the first time it ends up behind him.
    // --------------------------------------------------

    checkEnemiesPassed: function(marioX) {

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

                this.bonus += this.enemyPassBonus;
            }
        }
    },


    // --------------------------------------------------
    // Reward jumping specifically to clear a gap.
    //
    // - Jumping while groundAhead is false, then landing
    //   safely, is a real pit-clear -> rewarded.
    // - Jumping while groundAhead is true (flat ground)
    //   earns nothing - that jump wasn't needed.
    // - Falling off a ledge without jumping earns
    //   nothing, whether or not it was over a gap.
    // --------------------------------------------------

    checkJump: function() {

        if (!player) {
            return;
        }

        if (player.jumping) {

            if (!this.jumpedThisAirtime) {

                // First frame of this jump - record what
                // the ground-ahead sensor read at takeoff.
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
                this.bonus += this.jumpBonus;
            }

            this.jumpedThisAirtime = false;

            this.groundAheadAtJump = true;
        }
    },


    // --------------------------------------------------
    // Penalty applied once, by MarioEpisode, when an
    // episode ends because Mario died.
    // --------------------------------------------------

    applyDeathPenalty: function() {

        this.bonus -= this.deathPenalty;
    },


    // --------------------------------------------------
    // Get current fitness
    // --------------------------------------------------

    getFitness: function() {

        var total = this.maxX + this.bonus;

        // Fitness drives selection - never let a death
        // penalty push a network below a network that
        // barely moved at all.
        if (total < 0) {
            total = 0;
        }

        return total;

    }

}

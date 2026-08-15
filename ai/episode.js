var MarioEpisode = {

    // --------------------------------------------------
    // Episode state
    // --------------------------------------------------

    active: false,

    episodeNumber: 0,

    resetPending: false,


    // --------------------------------------------------
    // Stuck / no-progress detector
    // --------------------------------------------------

    // Highest X position Mario had reached at the
    // beginning of the current check interval.
    lastMaxX: 0,

    // Time since the last progress check.
    stuckCheckTime: 0,

    // Check progress every 0.5 seconds.
    stuckCheckInterval: 0.5,

    // Mario must gain at least this many pixels
    // of NEW maximum X during the interval.
    progressThreshold: 2,

    // Maximum amount of time without meaningful
    // forward progress.
    maxStuckTime: 2,

    // Total time without meaningful progress.
    stuckTime: 0,


    // --------------------------------------------------
    // Start episode
    // --------------------------------------------------

    start: function() {

        // Don't start another episode while
        // the game is being reset.
        if (this.resetPending) {
            return;
        }


        this.active = true;

        this.episodeNumber++;


        // ----------------------------------------------
        // Reset fitness
        // ----------------------------------------------

        MarioFitness.reset();


        // ----------------------------------------------
        // Reset stuck detector
        // ----------------------------------------------

        if (
            player &&
            player.pos &&
            typeof player.pos[0] === "number"
        ) {

            this.lastMaxX = player.pos[0];

        } else {

            this.lastMaxX = 0;
        }


        this.stuckCheckTime = 0;

        this.stuckTime = 0;


        // ----------------------------------------------
        // Debug
        // ----------------------------------------------

        console.log(
            "================================"
        );

        console.log(
            "Starting episode:",
            this.episodeNumber
        );

        console.log(
            "Testing network:",
            AIPopulation.current + 1,
            "/",
            AIPopulation.size
        );

        console.log(
            "Starting Mario X:",
            this.lastMaxX
        );

        console.log(
            "================================"
        );
    },


    // --------------------------------------------------
    // Update episode
    // --------------------------------------------------

    update: function(dt) {

        // ----------------------------------------------
        // Episode isn't active
        // ----------------------------------------------

        if (!this.active) {
            return;
        }


        // ----------------------------------------------
        // Validate dt
        // ----------------------------------------------

        if (
            typeof dt !== "number" ||
            !isFinite(dt) ||
            dt <= 0
        ) {
            return;
        }


        // ----------------------------------------------
        // Make sure player exists
        // ----------------------------------------------

        if (
            !player ||
            !player.pos
        ) {
            return;
        }


        // ----------------------------------------------
        // Mario died
        // ----------------------------------------------

        if (player.dying) {

            console.log(
                "Episode ended: Mario died."
            );

            this.end();

            return;
        }


        // ----------------------------------------------
        // Add time to progress check
        // ----------------------------------------------

        this.stuckCheckTime += dt;


        // ----------------------------------------------
        // Don't check until interval is reached
        // ----------------------------------------------

        if (
            this.stuckCheckTime <
            this.stuckCheckInterval
        ) {
            return;
        }


        // ----------------------------------------------
        // Current Mario X
        // ----------------------------------------------

        var currentX =
            player.pos[0];


        // ----------------------------------------------
        // Get Mario's furthest X position
        // ----------------------------------------------

        var currentMaxX =
            MarioFitness.maxX;


        // ----------------------------------------------
        // Calculate NEW forward progress
        // ----------------------------------------------

        var progress =
            currentMaxX -
            this.lastMaxX;


        // ----------------------------------------------
        // Debug
        // ----------------------------------------------

        console.log({

            episode:
                this.episodeNumber,

            network:
                AIPopulation.current + 1,

            marioX:
                currentX,

            maxX:
                currentMaxX,

            progress:
                progress,

            stuckTime:
                this.stuckTime,

            checkTime:
                this.stuckCheckTime

        });


        // ----------------------------------------------
        // Did Mario make meaningful progress?
        // ----------------------------------------------

        if (
            progress <
            this.progressThreshold
        ) {

            // Mario did not reach enough new
            // territory during this interval.

            this.stuckTime +=
                this.stuckCheckTime;

        } else {

            // Mario reached new territory.
            this.stuckTime = 0;
        }


        // ----------------------------------------------
        // Remember current maximum X
        // ----------------------------------------------

        this.lastMaxX =
            currentMaxX;


        // ----------------------------------------------
        // Start another check interval
        // ----------------------------------------------

        this.stuckCheckTime = 0;


        // ----------------------------------------------
        // Mario hasn't made progress for too long
        // ----------------------------------------------

        if (
            this.stuckTime >=
            this.maxStuckTime
        ) {

            console.log(
                "================================"
            );

            console.log(
                "MARIO MADE NO PROGRESS!"
            );

            console.log(
                "Mario X:",
                currentX
            );

            console.log(
                "Maximum X:",
                currentMaxX
            );

            console.log(
                "Progress:",
                progress
            );

            console.log(
                "Stuck time:",
                this.stuckTime
            );

            console.log(
                "Ending episode..."
            );

            console.log(
                "================================"
            );


            this.end();

            return;
        }
    },


    // --------------------------------------------------
    // End episode
    // --------------------------------------------------

    end: function() {

        // ----------------------------------------------
        // Prevent ending twice
        // ----------------------------------------------

        if (!this.active) {
            return;
        }


        // ----------------------------------------------
        // Stop episode immediately
        // ----------------------------------------------

        this.active = false;


        // ----------------------------------------------
        // Penalize dying. Running out of progress
        // (stuck timeout) is not a death, so it stays
        // unpenalized - the episode simply banks
        // whatever fitness was earned up to that point.
        // ----------------------------------------------

        if (player && player.dying) {

            MarioFitness.applyDeathPenalty();
        }


        // ----------------------------------------------
        // Get final fitness
        // ----------------------------------------------

        var finalFitness =
            MarioFitness.getFitness();


        // ----------------------------------------------
        // Save fitness
        // ----------------------------------------------

        if (
            AIPopulation &&
            typeof AIPopulation.setCurrentFitness ===
            "function"
        ) {

            AIPopulation.setCurrentFitness(
                finalFitness
            );

        } else {

            console.error(
                "AIPopulation.setCurrentFitness() is not available!"
            );
        }


        // ----------------------------------------------
        // Save raw distance (how far Mario actually
        // got), separate from fitness.
        // ----------------------------------------------

        if (
            AIPopulation &&
            typeof AIPopulation.setCurrentDistance ===
            "function"
        ) {

            AIPopulation.setCurrentDistance(
                MarioFitness.maxX
            );

        } else {

            console.error(
                "AIPopulation.setCurrentDistance() is not available!"
            );
        }


        // ----------------------------------------------
        // Debug
        // ----------------------------------------------

        console.log(
            "================================"
        );

        console.log(
            "Episode finished!"
        );

        console.log(
            "Episode:",
            this.episodeNumber
        );

        console.log(
            "Network:",
            AIPopulation.current + 1
        );

        console.log(
            "Fitness:",
            finalFitness
        );

        console.log(
            "================================"
        );


        // ----------------------------------------------
        // Move to next network
        // ----------------------------------------------

        if (
            AIPopulation &&
            typeof AIPopulation.next ===
            "function"
        ) {

            AIPopulation.next();

        } else {

            console.error(
                "AIPopulation.next() is not available!"
            );
        }


        // ----------------------------------------------
        // Reset actual Mario game
        // ----------------------------------------------

        this.resetGame();
    },


    // --------------------------------------------------
    // Reset actual Mario game
    // --------------------------------------------------

    resetGame: function() {

        // Prevent multiple reset calls.
        if (this.resetPending) {
            return;
        }


        this.resetPending = true;


        console.log(
            "Resetting Mario game..."
        );


        // ----------------------------------------------
        // Wait until the current game update has
        // completely finished.
        // ----------------------------------------------

        setTimeout(function() {

            try {

                // --------------------------------------
                // Reset camera
                // --------------------------------------

                if (
                    typeof vX !== "undefined"
                ) {
                    vX = 0;
                }

                if (
                    typeof vY !== "undefined"
                ) {
                    vY = 0;
                }


                // --------------------------------------
                // Clear AI controls
                // --------------------------------------

                if (
                    typeof input !== "undefined"
                ) {

                    input.setAI(
                        'LEFT',
                        false
                    );

                    input.setAI(
                        'RIGHT',
                        false
                    );

                    input.setAI(
                        'JUMP',
                        false
                    );

                    input.setAI(
                        'RUN',
                        false
                    );
                }


                // --------------------------------------
                // Clear fireballs
                // --------------------------------------

                if (
                    typeof fireballs !== "undefined"
                ) {

                    fireballs.length = 0;
                }


                // --------------------------------------
                // Recreate level/player
                // --------------------------------------

                if (
                    typeof Mario !== "undefined" &&
                    typeof Mario.oneone === "function"
                ) {

                    console.log(
                        "Calling Mario.oneone()..."
                    );

                    Mario.oneone();

                } else {

                    console.error(
                        "Mario.oneone() is not available!"
                    );
                }


                // --------------------------------------
                // Reset episode state
                // --------------------------------------

                MarioEpisode.resetPending = false;


                console.log(
                    "Mario game reset complete."
                );


            } catch (error) {

                console.error(
                    "ERROR while resetting Mario:",
                    error
                );

                MarioEpisode.resetPending = false;
            }

        }, 0);
    }
};


// ==================================================
// Per-environment episode
//
// The object above is the original single-world episode
// and is left untouched for backward compatibility.
//
// Parallel training needs one episode PER environment -
// if environment 4 dies, only environment 4's episode
// ends; the other nine keep running. So each
// MarioEnvironment owns an instance created here.
// ==================================================

(function() {

    var scope =
        (typeof window !== 'undefined') ? window : globalThis;


    function EnvironmentEpisode(env) {

        this.env = env;

        this.active = false;

        this.episodeNumber = 0;


        // ------------------------------------------
        // Progress tracking
        // ------------------------------------------

        this.maxX = 0;

        this.lastMaxX = 0;


        // ------------------------------------------
        // Stuck detector (all configurable)
        //
        // Progress is measured as newly-reached maximum
        // X, so a Mario who is bouncing on the spot -
        // moving vertically but not forward - still
        // counts as stuck.
        // ------------------------------------------

        this.stuckCheckTime = 0;

        this.stuckTime = 0;

        this.stuckCheckInterval = 0.5;

        this.stuckMovementThreshold = 5;

        this.maxStuckTime = 2;
    }


    // ----------------------------------------------
    // Read the player belonging to THIS environment,
    // whether or not we are inside its activation
    // window (during update() the globals are live;
    // outside it the environment holds the truth).
    // ----------------------------------------------

    EnvironmentEpisode.prototype.currentPlayer = function() {

        if (scope.MarioEnvironment.active === this.env) {
            return scope.player;
        }

        return this.env.player;
    };


    EnvironmentEpisode.prototype.start = function() {

        var player = this.currentPlayer();

        this.active = true;

        this.episodeNumber++;

        this.maxX =
            (player && player.pos) ? player.pos[0] : 0;

        this.lastMaxX = this.maxX;

        this.stuckCheckTime = 0;

        this.stuckTime = 0;

        this.env.status = 'RUNNING';
    };


    EnvironmentEpisode.prototype.update = function(dt) {

        if (!this.active) {
            return;
        }

        if (
            typeof dt !== 'number' ||
            !isFinite(dt) ||
            dt <= 0
        ) {
            return;
        }


        var player = this.currentPlayer();

        if (!player || !player.pos) {
            return;
        }


        // ------------------------------------------
        // Forward progress (this IS the fitness)
        // ------------------------------------------

        if (player.pos[0] > this.maxX) {
            this.maxX = player.pos[0];
        }

        this.env.result.maxX = this.maxX;
        this.env.result.fitness = this.maxX;


        // ------------------------------------------
        // Reached the flagpole - level complete.
        //
        // Ending here also discards the 5-second
        // setTimeout that js/player.js:283 schedules on
        // the exit path, which would otherwise fire
        // outside this environment's activation window.
        // ------------------------------------------

        if (player.flagging || player.exiting) {

            this.end('completed');

            return;
        }


        // ------------------------------------------
        // Died
        // ------------------------------------------

        if (player.dying) {

            this.end('died');

            return;
        }


        // ------------------------------------------
        // Stuck detector
        // ------------------------------------------

        this.stuckCheckTime += dt;

        if (this.stuckCheckTime < this.stuckCheckInterval) {
            return;
        }

        var progress = this.maxX - this.lastMaxX;

        if (progress < this.stuckMovementThreshold) {

            this.stuckTime += this.stuckCheckTime;

        } else {

            this.stuckTime = 0;
        }

        this.lastMaxX = this.maxX;

        this.stuckCheckTime = 0;


        if (this.stuckTime >= this.maxStuckTime) {

            this.end('stuck');
        }
    };


    EnvironmentEpisode.prototype.end = function(reason) {

        if (!this.active) {
            return;
        }

        this.active = false;


        var result = this.env.result;

        result.maxX = this.maxX;

        // PART 7 baseline: fitness is purely distance.
        result.fitness = this.maxX;

        result.died = (reason === 'died');
        result.stuck = (reason === 'stuck');
        result.completed = (reason === 'completed');


        if (reason === 'died') {
            this.env.status = 'DEAD';
        } else if (reason === 'stuck') {
            this.env.status = 'STUCK';
        } else {
            this.env.status = 'FINISHED';
        }


        // Queue rather than call: the environment reports
        // this once it has left its activation window, so
        // the callback is free to rebuild the world.
        this.env._pendingEnd = result;
    };


    // ----------------------------------------------
    // Factory used by MarioEnvironment.
    // ----------------------------------------------

    MarioEpisode.create = function(env) {

        return new EnvironmentEpisode(env);
    };

})();
// ==================================================
// Per-environment episode
//
// One episode instance per MarioEnvironment. If
// environment 4 dies, only environment 4's episode ends;
// the other nine keep running to the generation barrier.
//
// The episode owns three things:
//
//   1. termination  - died / stuck / completed
//   2. distance     - the furthest X reached
//   3. the score    - distance combined with the bonus
//                     terms tracked by MarioFitness
//
// Distance and score are deliberately kept apart. The
// stuck detector below runs on RAW distance, so a bonus
// can never make a Mario who is standing still look like
// he is making progress.
// ==================================================

(function() {

    var scope =
        (typeof window !== 'undefined') ? window : globalThis;


    function EnvironmentEpisode(env) {

        this.env = env;

        this.active = false;

        this.episodeNumber = 0;


        // ------------------------------------------
        // Scoring
        // ------------------------------------------

        this.fitness = scope.MarioFitness.create(env);


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

        this.fitness.reset();

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
        // Distance
        // ------------------------------------------

        if (player.pos[0] > this.maxX) {
            this.maxX = player.pos[0];
        }


        // ------------------------------------------
        // Bonus terms
        //
        // Called after the game pipeline has run for this
        // tick (see MarioEnvironment.update), so
        // player.standing / player.jumping are current.
        // ------------------------------------------

        this.fitness.update();


        this.env.result.maxX = this.maxX;
        this.env.result.fitness = this.fitness.score(this.maxX);


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


        // Dying costs, once, before the final score is
        // taken. Running out of progress is NOT a death -
        // a stuck run simply banks what it earned.
        if (reason === 'died') {
            this.fitness.applyDeathPenalty();
        }


        var result = this.env.result;

        result.maxX = this.maxX;

        result.fitness = this.fitness.score(this.maxX);

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

    scope.MarioEpisode = {

        create: function(env) {

            return new EnvironmentEpisode(env);
        }
    };

})();

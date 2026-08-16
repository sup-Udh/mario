
(function() {

    var scope =
        (typeof window !== 'undefined') ? window : globalThis;


    // ----------------------------------------------
    // Every global that belongs to one game world.
    // ----------------------------------------------

    var SWAPPED = [
        'player',
        'level',
        'vX',
        'vY',
        'fireballs',
        'updateables',
        'gameTime',
        'input',
        'ctx',
        'canvas'
    ];


    function MarioEnvironment(id) {

        this.id = id;


        // ------------------------------------------
        // World state (the swapped globals)
        // ------------------------------------------

        this.player = null;
        this.level = null;

        this.vX = 0;
        this.vY = 0;

        this.fireballs = [];
        this.updateables = [];

        this.gameTime = 0;

        // Own AI key bank, so this environment's network
        // cannot press another environment's buttons.
        // Keyboard input is off until manual play is
        // switched on for this environment specifically.
        this.input = scope.MarioInput.create(false);

        this.manual = false;

        this.canvas = null;
        this.ctx = null;


        // ------------------------------------------
        // AI state
        // ------------------------------------------

        this.network = null;

        this.episode = scope.MarioEpisode.create(this);

        // PART 7 baseline: fitness is simply furthest X,
        // plus enough flags to tell the outcomes apart.
        this.result = {
            maxX: 0,
            fitness: 0,
            died: false,
            stuck: false,
            completed: false
        };

        this.status = 'IDLE';


        // ------------------------------------------
        // Internals
        // ------------------------------------------

        this._saved = null;
        this._active = false;

        // Result of an episode that ended mid-tick, handed
        // to the finish callback once the globals are safe
        // to touch again (see update()).
        this._pendingEnd = null;


        // ------------------------------------------
        // Jump decision state (see think())
        // ------------------------------------------

        this.jumpCooldown = 0;

        this.jumpPressTime = 0;

        this.jumpReason = null;

        // Held long enough to clear the 20-frame window in
        // Player.jump(). Releasing earlier makes
        // Player.noJump() zero the upward velocity, which
        // caps the arc too low to clear a two-tile pit.
        this.jumpPressDuration = 0.35;

        this.jumpCooldownDuration = 0.5;

        // Sigmoid outputs cluster around the middle, so a
        // 0.5 gate means "jump nearly always". These are
        // deliberately higher.
        this.jumpThreshold = 0.65;

        // A pit is more urgent than a distant enemy.
        this.pitJumpThreshold = 0.45;

        // Sensor distances are normalized as tiles/10, so
        // SMALLER means CLOSER. 0.35 is about three tiles.
        this.obstacleNearThreshold = 0.35;

        this.enemyNearThreshold = 0.35;

        // ------------------------------------------
        // Direction commitment
        //
        // LEFT and RIGHT come out of a sigmoid pair that
        // sits near a tie most of the time (measured
        // median margin 0.08, and a third of frames under
        // 0.05). Comparing them directly turns that noise
        // into a reversal every ~25 frames: acc[0] flips
        // sign, velocity fights itself, and the skid
        // sprite fires constantly.
        //
        // So a reversal has to be MEANT: the other
        // direction must win by a margin AND keep winning
        // for a short while before Mario commits.
        // ------------------------------------------

        this.direction = 'RIGHT';

        this.pendingDirection = null;

        this.pendingDirectionTime = 0;

        // These values are load-bearing - do not raise them
        // without re-running the A/B in scratchpad/ab.js.
        //
        // Measured, 100 generations x 3 seeds, best X:
        //
        //   no commitment        3162 / 3161 / 3162
        //   0.05 / 0.12 / 0      3162 / 3162 / 3162
        //   0.15 / 0.20 / 1.2     498 /  498 /  498
        //
        // The tight setting caps learning at 498 in EVERY
        // seed. Champion margins have a median around 0.06,
        // so a 0.15 gate means the network can essentially
        // never express a direction preference: LEFT/RIGHT
        // fall out of its action space, those weights stop
        // being selected on, and the population collapses
        // to one deterministic behaviour (hence identical
        // results across seeds).
        //
        // 0.05 is enough to reject the noise that caused
        // the flicker while leaving the network its vote.
        this.directionMargin = 0.05;

        this.directionSwitchDelay = 0.12;

        // Hard rate limit on reversals. Kept for tuning but
        // DEFAULT OFF: anything above ~0 starts eating the
        // network's ability to steer, per the A/B above.
        this.directionCooldown = 0;

        this.directionCooldownTime = 0;


        // Question-block sensor reporting (see
        // readQuestionBlockSensor).
        this.lastQuestionBlock = null;
        this._lastQBValue = null;
        this._lastQBLogTime = 0;


        // How long Mario has been shoving into something
        // without actually moving.
        this.blockedTime = 0;

        // Pressed against a wall while grounded, there is
        // exactly ONE useful action. Past this many
        // seconds the jump fires regardless of what the
        // network wants, because standing there is always
        // fatal and the network may simply never have
        // learned to ask.
        this.blockedJumpDelay = 0.3;
    }


    // ----------------------------------------------
    // Give this environment its own drawing surface.
    // ----------------------------------------------

    MarioEnvironment.prototype.attachCanvas = function(canvas, ctx) {

        this.canvas = canvas;
        this.ctx = ctx;
    };


    // ----------------------------------------------
    // Install this environment's world into the globals.
    // ----------------------------------------------

    MarioEnvironment.prototype.activate = function() {

        if (this._active) {

            throw new Error(
                "MarioEnvironment " + this.id +
                " is already active (re-entrant tick?)"
            );
        }

        if (MarioEnvironment.active) {

            throw new Error(
                "MarioEnvironment " + MarioEnvironment.active.id +
                " is still active; cannot activate " + this.id
            );
        }


        var saved = {};

        for (var i = 0; i < SWAPPED.length; i++) {

            var key = SWAPPED[i];

            saved[key] = scope[key];

            scope[key] = this[key];
        }

        this._saved = saved;
        this._active = true;

        MarioEnvironment.active = this;
    };


    // ----------------------------------------------
    // Pull the (possibly reassigned) globals back into
    // this environment, then restore what was there.
    // ----------------------------------------------

    MarioEnvironment.prototype.deactivate = function() {

        if (!this._active) {
            return;
        }

        for (var i = 0; i < SWAPPED.length; i++) {

            var key = SWAPPED[i];

            this[key] = scope[key];

            scope[key] = this._saved[key];
        }

        this._saved = null;
        this._active = false;

        MarioEnvironment.active = null;
    };


    // ----------------------------------------------
    // Run a function with this environment active,
    // always restoring the globals afterwards.
    // ----------------------------------------------

    MarioEnvironment.prototype.run = function(fn) {

        this.activate();

        try {

            return fn();

        } finally {

            this.deactivate();
        }
    };


    // ----------------------------------------------
    // Build (or rebuild) this environment's world.
    // ----------------------------------------------

    MarioEnvironment.prototype.build = function() {

        this.run(function() {

            // Mario.oneone() READS the global player and
            // WRITES the global level, so the player has
            // to exist before we call it.
            scope.player = new Mario.Player([0, 0]);

            // Prime the movement constants.
            //
            // Player.run() sets maxSpeed but NOT moveAcc -
            // only Player.noRun() sets moveAcc. Because the
            // controller holds RUN from the very first
            // frame, noRun() would otherwise never run, so
            // moveAcc would stay undefined and the first
            // moveRight() would drive pos[0] to NaN.
            scope.player.noRun();

            scope.vX = 0;
            scope.vY = 0;

            scope.fireballs = [];
            scope.updateables = [];

            scope.gameTime = 0;

            Mario.oneone();
        });

        this.input.resetAI();
    };


    // ----------------------------------------------
    // Reset ONLY this environment.
    //
    // Nothing here touches any other environment - that
    // is the whole point of the design.
    // ----------------------------------------------

    MarioEnvironment.prototype.reset = function() {

        this.build();

        this.result = {
            maxX: 0,
            fitness: 0,
            died: false,
            stuck: false,
            completed: false
        };

        this.status = 'IDLE';

        this.jumpCooldown = 0;
        this.jumpPressTime = 0;
        this.jumpReason = null;
        this.blockedTime = 0;

        this.direction = 'RIGHT';
        this.pendingDirection = null;
        this.pendingDirectionTime = 0;
        this.directionCooldown = 0;

        this.lastQuestionBlock = null;

        // _lastQBValue deliberately SURVIVES the reset, so a
        // looping showcase does not re-log the same reading
        // once per episode.

        this._pendingEnd = null;

        this.episode.start();
    };


    // ----------------------------------------------
    // Advance this environment by dt seconds.
    // ----------------------------------------------

    MarioEnvironment.prototype.update = function(dt) {

        // A finished environment is FROZEN.
        //
        // Not just an optimization. Simulating past the end
        // of an episode walks into js/player.js:283, whose
        // level-exit branch schedules a 5-second setTimeout
        // that mutates `player` and `level` from OUTSIDE any
        // activation window - and it re-schedules one every
        // frame. Freezing here keeps that unreachable
        // without having to modify the original Player.
        if (!this.episode.active) {
            return;
        }


        var self = this;

        this.run(function() {

            scope.gameTime += dt;

            self.think(dt);

            // Original game pipeline, unmodified.
            scope.handleInput(dt);
            scope.updateEntities(dt, scope.gameTime);
            scope.checkCollisions();

            self.episode.update(dt);
        });


        // An episode that ended during the tick above is
        // reported HERE, outside the activation window.
        //
        // The callback typically rebuilds this world, which
        // has to activate the environment again - impossible
        // while we are still inside our own activation.
        if (this._pendingEnd) {

            var result = this._pendingEnd;

            this._pendingEnd = null;

            this.onEpisodeEnd(result);
        }
    };


    // ----------------------------------------------
    // Draw this environment to its own canvas.
    // ----------------------------------------------

    MarioEnvironment.prototype.render = function() {

        if (!this.ctx) {
            return;
        }

        this.run(function() {

            scope.renderWorld();
        });
    };


    // ----------------------------------------------
    // Hand this environment over to the keyboard, so the
    // original single-player game is still playable.
    //
    // Only ONE environment should be manual at a time -
    // the keyboard is shared, so two manual environments
    // would move together.
    // ----------------------------------------------

    MarioEnvironment.prototype.setManual = function(on) {

        on = !!on;


        // Only save/restore on an actual transition.
        // Toggling on twice must not overwrite the saved
        // value with the Infinity we ourselves installed.
        if (on && !this.manual) {

            // A human is allowed to stand still and think.
            this._savedMaxStuckTime = this.episode.maxStuckTime;

            this.episode.maxStuckTime = Infinity;

        } else if (!on && this.manual) {

            if (this._savedMaxStuckTime !== undefined) {

                this.episode.maxStuckTime = this._savedMaxStuckTime;

                this._savedMaxStuckTime = undefined;
            }
        }


        this.manual = on;

        this.input.humanEnabled = on;

        // Drop any keys the network was holding, or Mario
        // would keep running after the handover.
        this.input.resetAI();
    };


    // ----------------------------------------------
    // Read (and optionally report) the question-block
    // sensor.
    //
    // Called from think(), so the globals belong to THIS
    // environment. Costs nothing unless console logging
    // or the debug overlay is switched on.
    // ----------------------------------------------

    MarioEnvironment.prototype.readQuestionBlockSensor = function() {

        var cfg = MarioSensors.questionBlockLog || {};

        var wantLog =
            !!cfg.enabled &&
            (cfg.envId === null ||
             cfg.envId === undefined ||
             cfg.envId === this.id);

        var wantDraw = !!MarioSensors.debugDraw;


        // Purely diagnostic: the question block is NOT a
        // network input, so this scan only runs when someone
        // is actually looking.
        if (!wantLog && !wantDraw) {
            this.lastQuestionBlock = null;
            return;
        }

        if (typeof MarioSensors.questionBlockDistance !== 'function' ||
            typeof MarioSensors.isQuestionBlock !== 'function') {
            this.lastQuestionBlock = null;
            return;
        }


        var maxTiles = cfg.maxTiles || 10;

        var distance =
            MarioSensors.questionBlockDistance(maxTiles);

        this.lastQuestionBlock = distance;


        if (!wantLog) {
            return;
        }


        // Only speak up when the reading actually moves.
        if (distance === this._lastQBValue) {
            return;
        }

        var now = Date.now();

        if (now - this._lastQBLogTime < (cfg.minIntervalMs || 0)) {
            return;
        }

        this._lastQBValue = distance;
        this._lastQBLogTime = now;


        console.log(
            'Q-BLOCK  env ' + this.id +
            '   marioTile ' +
                Math.floor(scope.player.pos[0] / MarioSensors.TILE_SIZE) +
            '   distance ' +
                (distance >= maxTiles ? 'none' : distance + ' tiles') +
            '   normalized ' + (distance / maxTiles).toFixed(2)
        );
    };


    // ----------------------------------------------
    // Is Mario able to start a jump right now?
    //
    // Mirrors the real precondition in Player.jump()
    // (js/player.js): standing, allowed to jump, and not
    // already moving downward.
    // ----------------------------------------------

    MarioEnvironment.prototype.isGrounded = function() {

        var p = scope.player;

        return !!(
            p &&
            p.standing &&
            p.canJump &&
            p.vel[1] <= 0
        );
    };


    // ----------------------------------------------
    // Network outputs -> Mario actions.
    //
    // The network PROPOSES a jump; the controller decides
    // whether jumping is actually appropriate. Mario runs
    // by default and only leaves the ground when a sensor
    // says there is a reason to.
    //
    // Four things must agree before a jump happens:
    //
    //   1. a reason exists  (pit / obstacle / enemy near)
    //   2. the network wants it above a real threshold
    //   3. the cooldown has expired
    //   4. Mario is actually able to jump right now
    // ----------------------------------------------

    MarioEnvironment.prototype.think = function(dt) {

        // Manual play: the keyboard drives this Mario and
        // the network stays out of the way entirely.
        if (this.manual) {
            return;
        }

        if (!this.network) {
            return;
        }


        var io = this.input;


        // ------------------------------------------
        // Timers
        // ------------------------------------------

        this.jumpCooldown =
            Math.max(0, this.jumpCooldown - dt);

        this.jumpPressTime =
            Math.max(0, this.jumpPressTime - dt);


        io.setAI('LEFT', false);
        io.setAI('RIGHT', false);


        var sensors = MarioInputs.getInputs();

        // Snapshot what the sensors just saw.
        //
        // MarioSensors.lastReadings is a singleton, but
        // rendering happens after ALL environments have
        // updated - so without copying it here, every
        // viewport would draw the last environment's rays.
        if (MarioSensors.debugDraw) {

            this.sensorReadings = {
                obstacle: MarioSensors.lastReadings.obstacle,
                ground: MarioSensors.lastReadings.ground,
                enemy: MarioSensors.lastReadings.enemy
            };
        }

        this.readQuestionBlockSensor();

        var outputs =
            NeuralNetwork.predict(this.network, sensors);


        // ------------------------------------------
        // Movement
        //
        // A direction is only adopted once the network
        // has asked for it, by a clear margin, for
        // directionSwitchDelay seconds. Anything closer
        // than the margin is treated as "no opinion" and
        // Mario keeps doing what he was doing - which is
        // what stops the animation flickering.
        //
        // RUN is held throughout, so his normal state is
        // running forward.
        // ------------------------------------------

        var desired = null;

        if (outputs[0] > outputs[1] + this.directionMargin) {
            desired = 'LEFT';
        } else if (outputs[1] > outputs[0] + this.directionMargin) {
            desired = 'RIGHT';
        }


        // Shoving into something is a dead end, and holding
        // a committed direction would make it a permanent
        // one. While blocked, take the network's preference
        // immediately so it can turn around - the debounce
        // exists to filter noise, not to trap Mario.
        var wasBlocked =
            (this.blockedTime >= this.blockedJumpDelay);

        this.directionCooldown =
            Math.max(0, this.directionCooldown - dt);


        if (desired && desired !== this.direction) {

            if (wasBlocked) {

                // Deadlock beats every rate limit.
                this.direction = desired;
                this.directionCooldown = 0;
                this.pendingDirection = null;
                this.pendingDirectionTime = 0;

            } else if (this.pendingDirection === desired) {

                this.pendingDirectionTime += dt;

                if (
                    this.pendingDirectionTime >=
                    this.directionSwitchDelay &&
                    this.directionCooldown <= 0
                ) {
                    this.direction = desired;
                    this.directionCooldown = this.directionCooldownTime;
                    this.pendingDirection = null;
                    this.pendingDirectionTime = 0;
                }

            } else {

                this.pendingDirection = desired;
                this.pendingDirectionTime = 0;
            }

        } else {

            // Agrees with us, or too close to call.
            this.pendingDirection = null;
            this.pendingDirectionTime = 0;
        }


        io.setAI('LEFT', this.direction === 'LEFT');
        io.setAI('RIGHT', this.direction === 'RIGHT');

        io.setAI('RUN', true);


        // ------------------------------------------
        // Is there a REASON to jump?
        //
        // Sensor normalization (verified against
        // MarioSensors): obstacle and enemy distances are
        // tiles/10, so smaller means closer and 1.0 means
        // "nothing in range". groundAhead is 1 when there
        // is floor ahead and 0 when there is a gap.
        //
        // enemyDistance CAN legitimately read 0 when an
        // enemy is on top of Mario, so unlike obstacle
        // distance it must not be excluded by a > 0 test.
        // ------------------------------------------

        var pitAhead = (sensors[1] === 0);

        var obstacleClose =
            (sensors[0] < this.obstacleNearThreshold);

        var enemyClose =
            (sensors[2] < this.enemyNearThreshold);

        var needsJump =
            pitAhead || obstacleClose || enemyClose;


        // A pit is the one thing Mario cannot recover
        // from, so it clears a lower bar.
        var threshold =
            pitAhead ? this.pitJumpThreshold : this.jumpThreshold;


        // ------------------------------------------
        // Deadlock breaker
        //
        // Grounded, commanded to move, and going
        // nowhere: Mario is shoving into a wall. Waiting
        // there is always fatal, so jump whatever the
        // network says.
        // ------------------------------------------

        var grounded = this.isGrounded();

        var stalled =
            grounded &&
            Math.abs(scope.player.vel[0]) < 0.15;

        if (stalled) {
            this.blockedTime += dt;
        } else {
            this.blockedTime = 0;
        }

        var blocked =
            (this.blockedTime >= this.blockedJumpDelay);


        var wantsJump =
            blocked ||
            (needsJump && outputs[2] > threshold);


        if (
            wantsJump &&
            this.jumpPressTime <= 0 &&
            this.jumpCooldown <= 0 &&
            grounded
        ) {

            this.jumpPressTime = this.jumpPressDuration;

            this.jumpCooldown = this.jumpCooldownDuration;

            this.blockedTime = 0;

            this.jumpReason =
                pitAhead ? 'pit' :
                enemyClose ? 'enemy' :
                obstacleClose ? 'obstacle' : 'blocked';


            if (MarioEnvironment.debugJumps) {

                console.log({
                    env: this.id,
                    jumpScore: outputs[2],
                    obstacleDistance: sensors[0],
                    groundAhead: sensors[1],
                    enemyDistance: sensors[2],
                    jumpReason: this.jumpReason
                });
            }
        }


        // Press, don't hold forever: JUMP is down only for
        // the duration of the press window.
        io.setAI('JUMP', this.jumpPressTime > 0);


        this.lastSensors = sensors;
        this.lastOutputs = outputs;


        // Why the jump did or didn't happen. Drawn on the
        // canvas by the sensor overlay - never logged.
        if (MarioEnvironment.debugJumps || MarioSensors.debugDraw) {

            this.jumpDebug = {
                allowed: this.jumpPressTime > 0,
                reason:
                    this.jumpPressTime > 0 ? this.jumpReason :
                    !grounded ? 'NOT GROUNDED' :
                    this.jumpCooldown > 0 ? 'COOLDOWN' :
                    !needsJump ? 'NO REASON' :
                    'SCORE ' + outputs[2].toFixed(2) +
                        ' < ' + threshold,
                cooldown: this.jumpCooldown,
                grounded: grounded,
                score: outputs[2],
                threshold: threshold
            };
        }
    };


    // ----------------------------------------------
    // Called by the episode when it finishes. The
    // trainer decides what happens next; on its own an
    // environment just parks in its final state.
    // ----------------------------------------------

    MarioEnvironment.prototype.onEpisodeEnd = function(result) {

        if (this.onFinished) {
            this.onFinished(this, result);
        }
    };


    MarioEnvironment.active = null;

    // Flip to true from the console to see why each jump
    // fired. Off by default - ten environments logging
    // every jump would bury everything else.
    MarioEnvironment.debugJumps = false;

    scope.MarioEnvironment = MarioEnvironment;

})();

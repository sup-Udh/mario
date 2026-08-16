var MarioSensors = {

    TILE_SIZE: 16,

  
    debugDraw: false,

  
    GROUND_LOOKAHEAD_TILES: 3,




    lastReadings: {
        obstacle: null,
        ground: null,
        enemy: null
    },


    // --------------------------------------------------
    // Console reporting for the question-block sensor.
    //
    // Logging every frame would mean 60 lines per second
    // per environment - eleven worlds is ~660/sec, which
    // is heavy enough to cost real frame time. So this
    // reports ONE environment, and only when the reading
    // actually changes.
    //
    // Silence it:   MarioSensors.questionBlockLog.enabled = false
    // Watch env 3:  MarioSensors.questionBlockLog.envId = 3
    // Watch all:    MarioSensors.questionBlockLog.envId = null
    // --------------------------------------------------

    questionBlockLog: {

        enabled: true,

        // 'BEST' is the showcase environment. A number
        // picks a training viewport; null reports all of
        // them (noisy).
        envId: 'BEST',

        maxTiles: 10,

        minIntervalMs: 120
    },


    // gap below detection

    groundAhead: function() {
    if(!level || !player || !player.pos) {
        return false;
    }

    var marioX = Math.floor(player.pos[0] / this.TILE_SIZE)

    var marioY = Math.floor(player.pos[1] / this.TILE_SIZE)

    var startY = marioY  + 1

    var probes = this.debugDraw ? [] : null;

    // Check every tile column between here and the lookahead
    // distance. If ANY of them has no floor within the next
    // 4 rows down, that's a gap coming up soon - report "no
    // ground ahead" now instead of waiting until Mario is
    // standing right on the edge of it.

    for (
        var dx = 1;
        dx <= this.GROUND_LOOKAHEAD_TILES;
        dx ++
    ) {

        var checkX = marioX + dx;
        var foundGround = false;
        var hitY = -1;

        // loing downward a few tiles

        for (
            var y = startY;
            y < startY + 4;
            y ++
        ) {
            if (this.isSolid(checkX, y)){
                foundGround = true;
                hitY = y;
                break;
            }
        }

        if (probes) {
            probes.push({
                tileX: checkX,
                topY: startY,
                hitY: hitY,
                solid: foundGround
            });
        }

        if (!foundGround) {

            if (probes) {
                this.lastReadings.ground =
                    { probes: probes, result: false };
            }

            return false;
        }
    }

    if (probes) {
        this.lastReadings.ground =
            { probes: probes, result: true };
    }

    return true;

    },

    // --------------------------------------------------
    // Is this tile an UNUSED question block?
    //
    // Identity check against the level's own qblockSprite
    // instance. It stays correct for free across the whole
    // block lifecycle: putQBlock passes no bounceSprite, so
    // a bonked Q-block swaps to usedSprite immediately, and
    // js/block.js then converts it to a Floor in
    // level.statics and deletes it from level.blocks.
    // Either way it stops matching once it has been used.
    // --------------------------------------------------

    isQuestionBlock: function(tileX, tileY) {

        if (!level || !level.blocks) {
            return false;
        }

        if (
            tileY < 0 ||
            tileY >= level.blocks.length ||
            tileX < 0
        ) {
            return false;
        }

        var row = level.blocks[tileY];

        if (!row || !row[tileX]) {
            return false;
        }

        var block = row[tileX];

        return block.sprite === level.qblockSprite;
    },


  questionBlockDistance: function(maxTiles) {

    if (!level || !player || !player.pos) {
        return maxTiles;
    }

    var marioX = Math.floor(
        player.pos[0] / this.TILE_SIZE
    );

    var marioY = Math.floor(
        player.pos[1] / this.TILE_SIZE
    );

    for (
        var distance = 1;
        distance <= maxTiles;
        distance++
    ) {

        var tileX = marioX + distance;

        // Check several rows above Mario.
        for (
            var y = marioY - 1;
            y >= marioY - 4;
            y--
        ) {

            if (
                this.isQuestionBlock(tileX, y)
            ) {
                return distance;
            }
        }
    }

    return maxTiles;
},
    // enemy ditstance calculation:

enemyDistance: function(maxTiles) {

    // Make sure the game is ready.
    if (!level || !player || !player.pos) {
        return maxTiles;
    }

    // Mario's X position in pixels.
    var marioX = player.pos[0];

    // One tile = 16 pixels.
    var TILE_SIZE = 16;

    // Maximum distance we want the sensor to see.
    var maxDistance = maxTiles * TILE_SIZE;

    // Start by assuming there is no enemy nearby.
    var closestDistance = maxDistance;

    var closestEnemy = null;


    // Look through every enemy in the level.
    for (var i = 0; i < level.enemies.length; i++) {

        var enemy = level.enemies[i];


        // Ignore invalid enemies.
        if (!enemy) {
            continue;
        }


        // Ignore enemies that are already dying.
        if (enemy.dying) {
            continue;
        }


        // Make sure the enemy has a position.
        if (!enemy.pos || typeof enemy.pos[0] !== 'number') {
            continue;
        }


        // Enemy's X position in pixels.
        var enemyX = enemy.pos[0];


        // Ignore enemies behind Mario.
        if (enemyX <= marioX) {
            continue;
        }


        // Calculate horizontal distance.
        var distance = enemyX - marioX;


        // Ignore enemies outside our sensor range.
        if (distance > maxDistance) {
            continue;
        }


        // Keep the closest enemy.
        if (distance < closestDistance) {
            closestDistance = distance;
            closestEnemy = enemy;
        }
    }


    if (this.debugDraw) {

        this.lastReadings.enemy = {
            tiles: Math.ceil(closestDistance / TILE_SIZE),
            maxTiles: maxTiles,
            found: !!closestEnemy,
            x: closestEnemy ? closestEnemy.pos[0] : marioX + maxDistance,
            y: closestEnemy ? closestEnemy.pos[1] : player.pos[1]
        };
    }


    // Convert pixels back into tiles.
    return Math.ceil(
        closestDistance / TILE_SIZE
    );
},


    // --------------------------------------------------
    // Does a warp pipe cover this tile?
    //
    // Pipe hitboxes are pixel rectangles anchored at
    // pipe.pos, so this is a straight box overlap against
    // the tile's own 16x16 box.
    // --------------------------------------------------

    isPipeAt: function(tileX, tileY) {

        if (!level || !level.pipes || !level.pipes.length) {
            return false;
        }

        var left = tileX * this.TILE_SIZE;
        var top = tileY * this.TILE_SIZE;
        var right = left + this.TILE_SIZE;
        var bottom = top + this.TILE_SIZE;

        for (var i = 0; i < level.pipes.length; i++) {

            var pipe = level.pipes[i];

            if (!pipe || !pipe.pos || !pipe.hitbox) {
                continue;
            }

            var px = pipe.pos[0] + pipe.hitbox[0];
            var py = pipe.pos[1] + pipe.hitbox[1];
            var pw = pipe.hitbox[2];
            var ph = pipe.hitbox[3];

            if (
                left < px + pw &&
                right > px &&
                top < py + ph &&
                bottom > py
            ) {
                return true;
            }
        }

        return false;
    },


    // --------------------------------------------------
    // Safely check whether a tile contains a solid
    // terrain object.
    // --------------------------------------------------

    isSolid: function(tileX, tileY) {

        // The level may not exist during initialization.
        if (!level) {
            return false;
        }

        if (!level.statics || !level.blocks) {
            return false;
        }

        // Invalid row
        if (
            tileY < 0 ||
            tileY >= level.statics.length
        ) {
            return false;
        }

        // Invalid column
        if (tileX < 0) {
            return false;
        }

        var staticsRow = level.statics[tileY];
        var blocksRow = level.blocks[tileY];

        // Static terrain
        if (
            staticsRow &&
            staticsRow[tileX] !== undefined
        ) {
            return true;
        }

        // Blocks
        if (
            blocksRow &&
            blocksRow[tileX] !== undefined
        ) {
            return true;
        }

        // Pipes
        //
        // Warp pipes built with putRealPipe() live in
        // level.pipes and are NOT written into statics or
        // blocks, so without this check they are solid to
        // Mario but invisible to his sensors. That is a
        // deadlock: he walks into the pipe at tile 57,
        // collideWall stops him, no sensor reports an
        // obstacle, so the jump gate never opens and he
        // stands there until something kills him.
        if (this.isPipeAt(tileX, tileY)) {
            return true;
        }

        return false;
    },


    // --------------------------------------------------
    // Detect solid terrain in front of Mario.
    //
    // We intentionally DON'T scan marioY + 1,
    // because that is usually the ground Mario
    // is standing on.
    // --------------------------------------------------

    obstacleDistance: function(maxTiles) {

        // Level isn't ready yet.
        if (!level) {
            return maxTiles;
        }

        if (!player || !player.pos) {
            return maxTiles;
        }

        var marioX =
            Math.floor(
                player.pos[0] / this.TILE_SIZE
            );

        var marioY =
            Math.floor(
                player.pos[1] / this.TILE_SIZE
            );


        // Search forward
        for (
            var distance = 1;
            distance <= maxTiles;
            distance++
        ) {

            var tileX =
                marioX + distance;


            // Check Mario's current body row
            if (
                this.isSolid(
                    tileX,
                    marioY
                )
            ) {
                if (this.debugDraw) {
                    this.lastReadings.obstacle = {
                        distance: distance, maxTiles: maxTiles,
                        hit: true, tileX: tileX, tileY: marioY,
                        rowY: marioY
                    };
                }
                return distance;
            }


            // Also check one row above Mario
            if (
                this.isSolid(
                    tileX,
                    marioY - 1
                )
            ) {
                if (this.debugDraw) {
                    this.lastReadings.obstacle = {
                        distance: distance, maxTiles: maxTiles,
                        hit: true, tileX: tileX, tileY: marioY - 1,
                        rowY: marioY
                    };
                }
                return distance;
            }
        }


        if (this.debugDraw) {
            this.lastReadings.obstacle = {
                distance: maxTiles, maxTiles: maxTiles,
                hit: false, tileX: marioX + maxTiles, tileY: marioY,
                rowY: marioY
            };
        }

        // Nothing found
        return maxTiles;
    },


    // --------------------------------------------------
    // Debug information
    // --------------------------------------------------

    debug: function() {

        if (!level || !player) {
            return;
        }

        console.log({

            marioX: player.pos[0],
            marioY: player.pos[1],

            velocityX: player.vel[0],
            velocityY: player.vel[1],

            obstacleDistance:
                this.obstacleDistance(10),

        
            

        });
    },


    // --------------------------------------------------
    // Draw sensor
    // --------------------------------------------------

    drawDebug: function(ctx, vX, vY, env) {

        // Presentation mode: no sensor overlay.
        if (!this.debugDraw) {
            return;
        }

        // Don't draw until the game is ready.
        if (!level || !player || !player.pos) {
            return;
        }

        var T = this.TILE_SIZE;

        // World -> screen, the same conversion the game's
        // own renderer uses (see renderEntity).
        function sx(worldX) { return worldX - vX; }
        function sy(worldY) { return worldY - vY; }

        function tileBox(tileX, tileY, stroke, fill) {
            if (fill) {
                ctx.fillStyle = fill;
                ctx.fillRect(sx(tileX * T), sy(tileY * T), T, T);
            }
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.strokeRect(
                sx(tileX * T) + 0.5, sy(tileY * T) + 0.5, T - 1, T - 1);
        }

        function dot(x, y, color) {
            ctx.beginPath();
            ctx.arc(sx(x), sy(y), 3, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        }

        // Never leak stroke/fill state into the next draw.
        ctx.save();

        var originX = player.pos[0] + 8;
        var originY = player.pos[1] + 8;

        // Per-environment snapshot taken at think() time.
        // Falling back to the singleton keeps this working
        // for a lone environment with no trainer.
        var readings =
            (env && env.sensorReadings) ?
                env.sensorReadings : this.lastReadings;

        var obstacle = readings.obstacle;
        var ground = readings.ground;
        var enemy = readings.enemy;


        // ------------------------------------------
        // Obstacle ray (red) - along Mario's body row,
        // exactly where obstacleDistance() scanned.
        // ------------------------------------------

        if (obstacle) {

            var obsEndX = obstacle.tileX * T + (obstacle.hit ? 0 : T);

            ctx.beginPath();
            ctx.moveTo(sx(originX), sy(originY));
            ctx.lineTo(sx(obsEndX), sy(originY));
            ctx.strokeStyle = obstacle.hit ? '#ff4444' : 'rgba(255,80,80,0.35)';
            ctx.lineWidth = 2;
            ctx.stroke();

            if (obstacle.hit) {
                tileBox(obstacle.tileX, obstacle.tileY,
                    '#ff4444', 'rgba(255,68,68,0.30)');
                dot(obsEndX, originY, '#ffffff');
            }
        }


        // ------------------------------------------
        // Ground probes (blue = ground, orange = pit)
        // one box per column groundAhead() actually
        // looked at, in scan order.
        // ------------------------------------------

        if (ground && ground.probes) {

            for (var g = 0; g < ground.probes.length; g++) {

                var p = ground.probes[g];

                if (p.solid) {
                    tileBox(p.tileX, p.hitY,
                        '#4499ff', 'rgba(68,153,255,0.25)');
                } else {
                    // The gap: outline the whole probed column.
                    for (var r = 0; r < 4; r++) {
                        tileBox(p.tileX, p.topY + r,
                            '#ffaa33', 'rgba(255,170,51,0.18)');
                    }
                }

                ctx.beginPath();
                ctx.moveTo(sx(originX), sy(originY));
                ctx.lineTo(sx(p.tileX * T + T / 2),
                    sy((p.solid ? p.hitY : p.topY) * T));
                ctx.strokeStyle = p.solid ?
                    'rgba(68,153,255,0.55)' : '#ffaa33';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }


        // ------------------------------------------
        // Enemy ray (yellow)
        // ------------------------------------------

        if (enemy) {

            ctx.beginPath();
            ctx.moveTo(sx(originX), sy(originY));
            ctx.lineTo(sx(enemy.x), sy(enemy.y + 8));
            ctx.strokeStyle = enemy.found ? '#ffdd33' : 'rgba(255,221,51,0.25)';
            ctx.lineWidth = enemy.found ? 2 : 1;
            ctx.stroke();

            if (enemy.found) {
                dot(enemy.x, enemy.y + 8, '#ffffff');
            }
        }


        // The numeric readout is deliberately NOT drawn
        // here. Canvas text on a 256x240 surface that gets
        // upscaled 3x (far more in fullscreen) is
        // unreadable; it is rendered as a DOM overlay
        // instead - see readoutLines() and updateEnvHud().

        ctx.restore();
    },


    // --------------------------------------------------
    // The sensor readout, as text lines.
    //
    // Returns the values the network was ACTUALLY fed this
    // frame (env.lastSensors / lastOutputs), so the panel
    // can never disagree with the rays beside it.
    // --------------------------------------------------

    readoutLines: function(env) {

        if (!env || !env.lastSensors) {
            return null;
        }

        var s = env.lastSensors;
        var o = env.lastOutputs || [0, 0, 0];
        var j = env.jumpDebug || {};

        var lines = [
            'obstacle ' + s[0].toFixed(2) +
                '   ground ' + s[1],
            'enemy    ' + s[2].toFixed(2) +
                '   vx ' + s[3].toFixed(2) +
                '  vy ' + s[4].toFixed(2),
            'left ' + o[0].toFixed(2) +
                '  right ' + o[1].toFixed(2) +
                '  jump ' + o[2].toFixed(2),
            'jump ' + (j.allowed ? 'YES' : 'NO') +
                '  ' + (j.reason || 'NONE'),
            'cooldown ' + (j.cooldown || 0).toFixed(2) +
                '   grounded ' + (j.grounded ? 'YES' : 'NO')
        ];

        // Not a network input yet - shown here so the
        // sensor can be verified before it is wired in.
        if (env.lastQuestionBlock !== null &&
            env.lastQuestionBlock !== undefined) {

            var maxTiles =
                (this.questionBlockLog && this.questionBlockLog.maxTiles) || 10;

            lines.push(
                'qblock   ' +
                (env.lastQuestionBlock >= maxTiles ?
                    'none' : env.lastQuestionBlock + ' tiles')
            );
        }

        return lines;
    }

};
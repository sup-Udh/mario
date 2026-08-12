var MarioSensors = {

    TILE_SIZE: 16,




    // gap below detection

    groundAhead: function() {
    if(!level || !player || !player.pos) {
        return false;
    }

    var marioX = Math.floor(player.pos[0] / this.TILE_SIZE)

    var marioY = Math.floor(player.pos[1] / this.TILE_SIZE)

    var checkX = marioX + 1;
    var startY = marioY  + 1

    // loing downward a few tiles

    for (
        var y = startY;
        y < startY + 4;
        y ++
    ) {
        if (this.isSolid(checkX, y)){
            return true
        }
    }

    return false 

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
        }
    }


    // Convert pixels back into tiles.
    return Math.ceil(
        closestDistance / TILE_SIZE
    );
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
                return distance;
            }


            // Also check one row above Mario
            if (
                this.isSolid(
                    tileX,
                    marioY - 1
                )
            ) {
                return distance;
            }
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
                this.obstacleDistance(10)

        });
    },


    // --------------------------------------------------
    // Draw sensor
    // --------------------------------------------------

    drawDebug: function(ctx, vX, vY) {

        // Don't draw until the game is ready.
        if (!level || !player || !player.pos) {
            return;
        }

        var startX =
            player.pos[0] - vX + 8;

        var startY =
            player.pos[1] - vY + 8;

        var distance =
            this.obstacleDistance(10);

        var endX =
            startX +
            distance * this.TILE_SIZE;


        // Sensor line
        ctx.beginPath();

        ctx.moveTo(
            startX,
            startY
        );

        ctx.lineTo(
            endX,
            startY
        );

        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;

        ctx.stroke();


        // Endpoint
        ctx.beginPath();

        ctx.arc(
            endX,
            startY,
            3,
            0,
            Math.PI * 2
        );

        ctx.fillStyle = 'red';

        ctx.fill();
    }

};
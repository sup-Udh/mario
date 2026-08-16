var MarioInputs = {

    getInputs: function() {

        // --------------------------------------------------
        // Get sensor values
        // --------------------------------------------------

        var obstacle =
            MarioSensors.obstacleDistance(10);

        var ground =
            MarioSensors.groundAhead();

        var enemy =
            MarioSensors.enemyDistance(10);


        // --------------------------------------------------
        // Get Mario velocity
        // --------------------------------------------------

        var velocityX =
            player.vel[0];

        var velocityY =
            player.vel[1];


        // --------------------------------------------------
        // Safety checks
        // --------------------------------------------------

        if (!Number.isFinite(obstacle)) {
            obstacle = 10;
        }

        if (!Number.isFinite(enemy)) {
            enemy = 10;
        }


        if (!Number.isFinite(velocityX)) {
            velocityX = 0;
        }

        if (!Number.isFinite(velocityY)) {
            velocityY = 0;
        }


        // --------------------------------------------------
        // Normalize obstacle distance
        //
        // 10 tiles → 1
        // 5 tiles  → 0.5
        // 1 tile   → 0.1
        // --------------------------------------------------

        obstacle = obstacle / 10;


        // --------------------------------------------------
        // Normalize enemy distance
        //
        // 10 tiles → 1
        // 5 tiles  → 0.5
        // 1 tile   → 0.1
        // --------------------------------------------------

        enemy = enemy / 10;


        // --------------------------------------------------
        // Convert ground boolean into a number
        //
        // true  → 1
        // false → 0
        // --------------------------------------------------

        ground = ground ? 1 : 0;


        // --------------------------------------------------
        // Normalize horizontal velocity
        //
        // Approximately:
        //
        // -1.55 → -1
        //     0 →  0
        // +1.55 → +1
        // --------------------------------------------------

       // Normalize horizontal velocity
velocityX = velocityX / 1.56;

// Keep between -1 and +1
velocityX = Math.max(-1, Math.min(1, velocityX));


// Normalize vertical velocity
velocityY = velocityY / 5.75;

// Keep between -1 and +1
velocityY = Math.max(-1, Math.min(1, velocityY));

        // --------------------------------------------------
        // Return neural-network input vector
        // --------------------------------------------------

        // Index order is load-bearing: environment.js think()
        // reads [0], [1] and [2] by position for the jump
        // gate. New inputs go on the END.
        return [

            obstacle,     // 0
            ground,       // 1
            enemy,        // 2
            velocityX,    // 3
            velocityY     // 4

        ];

    }

};
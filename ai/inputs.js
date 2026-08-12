var MarioInputs = {
    getInputs: function() {
        var obstacle = 
        MarioSensors.obstacleDistance(10);
        
        var ground = MarioSensors.groundAhead();

        var enemy = MarioSensors.enemyDistance(10);

        var velocityX = player.vel[0];
        var velocityY = player.vel[1];


        // -----------------------------
        // Safety checks
        // -----------------------------

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

         // -----------------------------
        // Normalize distances
        // -----------------------------

        obstacle = obstacle / 10;

        enemy = enemy / 10;


         // Convert ground boolean
        // -----------------------------

        ground = ground ? 1 : 0;


        // -----------------------------
        // Normalize horizontal velocity
        //
        // Mario's approximate maximum
        // horizontal speed is ±1.55
        // -----------------------------

        velocityX = velocityX / 1.55;


        // -----------------------------
        // Return neural-network inputs
        // -----------------------------

        

        return [
            obstacle,
            ground, 
            enemy,
            velocityX,
            velocityY
        ]

    }

}
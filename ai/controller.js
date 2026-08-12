var AIController = {

    debugTimer: 0,

    update: function() {
// Clear AI controls
input.setAI('LEFT', false);
input.setAI('RIGHT', false);
input.setAI('JUMP', false);
input.setAI('RUN', false);


// Temporary movement test
// Switch direction every 2 seconds.

if (Math.floor(gameTime / 2) % 2 === 0) {

    // Move right
    input.setAI('RIGHT', true);

} else {

    // Move left
    input.setAI('LEFT', true);
}

        // Sensor
        var obstacleDistance =
            MarioSensors.obstacleDistance(10);

        var groundAhead = MarioSensors.groundAhead()
        var enemyDistance = MarioSensors.enemyDistance(10)
        var normalizationInputs = MarioInputs.getInputs();


        // Debug every 30 frames
        this.debugTimer++;

        if (this.debugTimer % 30 === 0) {


            console.log({
    velocityX: player.vel[0],
    velocityY: player.vel[1]
});

            console.log({

                marioX: player.pos[0],
                marioY: player.pos[1],

                velocityX: player.vel[0],
                velocityY: player.vel[1],

                obstacleDistance:
                    obstacleDistance,
                groundAhead:
                    groundAhead,
                enemyDistance: 
                    enemyDistance,
                inputsMario:
                    normalizationInputs


            });
        }
    }

};
var MarioFitness  = {
    maxX: 0,
    fitness: 0,

    reset: function() {
        this.maxX = 0;
        this.fitness = 0;
    },


    // --------------------------------------------------
    // Update fitness
    // --------------------------------------------------

    update: function() {

        // Make sure Mario exists
        if (!player || !player.pos) {
            return;
        }


        var marioX = player.pos[0];


        // Keep the furthest position reached
        if (marioX > this.maxX) {

            this.maxX = marioX;

        }


        // For now, fitness is simply
        // the furthest X position.
        this.fitness = this.maxX;

    },


    // --------------------------------------------------
    // Get current fitness
    // --------------------------------------------------

    getFitness: function() {

        return this.fitness;

    }

}
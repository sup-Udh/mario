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

    if (!player || !player.pos) {
        return;
    }

    var marioX = player.pos[0];

    // Reward forward progress
    if (marioX > this.maxX) {
        this.maxX = marioX;
    }

    // Fitness is based on furthest distance reached
    this.fitness = this.maxX;
},


    // --------------------------------------------------
    // Get current fitness
    // --------------------------------------------------

    getFitness: function() {

        return this.fitness;

    }

}
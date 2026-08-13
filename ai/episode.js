var MarioEpisode = {
        // --------------------------------------------------
    // Is an episode currently running?
    // --------------------------------------------------

    active: false,


    // Number of completed attempts
    episodeNumber: 0,


    // --------------------------------------------------
    // Start an episode
    // --------------------------------------------------

    start: function() {

        this.active = true;

        this.episodeNumber++;

        MarioFitness.reset();

        console.log(
            "Starting episode:",
            this.episodeNumber
        );

    },


    // --------------------------------------------------
    // Check whether the current episode is over
    // --------------------------------------------------

    update: function() {

        if (!this.active) {
            return;
        }


        // Mario is dying / dead
        if (player && player.dying) {

            this.end();

        }

    },


    // --------------------------------------------------
    // End the current episode
    // --------------------------------------------------

    end: function() {

        if (!this.active) {
            return;
        }


        this.active = false;


        var finalFitness =
            MarioFitness.getFitness();


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
            "Fitness:",
            finalFitness
        );

        console.log(
            "================================"
        );

    }

}
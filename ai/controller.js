var AIController = {

    debugTimer: 0,

    network: null,

    update: function(dt) {

        // ----------------------------------------------
        // Population
        // ----------------------------------------------

        if (
            !AIPopulation.networks ||
            AIPopulation.networks.length === 0
        ) {
            AIPopulation.create();
        }


        // ----------------------------------------------
        // Start episode
        // ----------------------------------------------

        if (
            !MarioEpisode.active &&
            !MarioEpisode.resetPending &&
            player &&
            !player.dying
        ) {
            MarioEpisode.start();
        }


        // ----------------------------------------------
        // Don't control Mario while dying/resetting
        // ----------------------------------------------

        if (
            !player ||
            player.dying ||
            MarioEpisode.resetPending
        ) {
            return;
        }


        // ----------------------------------------------
        // Current network
        // ----------------------------------------------

        this.network =
            AIPopulation.getCurrentNetwork();


        if (!this.network) {

            console.error(
                "AIController: No neural network!"
            );

            return;
        }


        // ----------------------------------------------
        // Clear controls
        // ----------------------------------------------

        input.setAI('LEFT', false);
        input.setAI('RIGHT', false);
        input.setAI('JUMP', false);
        input.setAI('RUN', false);


        // ----------------------------------------------
        // Sensors
        // ----------------------------------------------

        var inputs =
            MarioInputs.getInputs();


        // ----------------------------------------------
        // Fitness
        // ----------------------------------------------

        MarioFitness.update();


        // ----------------------------------------------
        // Episode
        // ----------------------------------------------

        MarioEpisode.update(dt);


        // Episode may have ended.
        if (
            !MarioEpisode.active
        ) {
            return;
        }


        // ----------------------------------------------
        // Neural network
        // ----------------------------------------------

        var outputs =
            NeuralNetwork.predict(
                this.network,
                inputs
            );


        var leftScore =
            outputs[0];

        var rightScore =
            outputs[1];

        var jumpScore =
            outputs[2];


        // ----------------------------------------------
        // Movement
        // ----------------------------------------------

        if (
            leftScore >
            rightScore
        ) {

            input.setAI(
                'LEFT',
                true
            );

        } else {

            input.setAI(
                'RIGHT',
                true
            );
        }


        // ----------------------------------------------
        // Jump
        // ----------------------------------------------

        if (
            jumpScore >
            0.5
        ) {

            input.setAI(
                'JUMP',
                true
            );
        }


        // ----------------------------------------------
        // Debug
        // ----------------------------------------------

        this.debugTimer++;


        if (
            this.debugTimer %
            30 ===
            0
        ) {

            console.log({

                network:
                    AIPopulation.current + 1,

                generation:
                    AIPopulation.generation,

                inputs:
                    inputs,

                left:
                    leftScore,

                right:
                    rightScore,

                jump:
                    jumpScore,

                fitness:
                    MarioFitness.getFitness(),

                stuckTime:
                    MarioEpisode.stuckTime

            });
        }
    }
};
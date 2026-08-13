var AIController = {

    debugTimer: 0,

    // --------------------------------------------------
    // Our neural network
    //
    // 5 inputs
    // 8 hidden neurons
    // 3 outputs
    // --------------------------------------------------

    network: NeuralNetwork.create(5, 8, 3),


    // --------------------------------------------------
    // Called every game update
    // --------------------------------------------------

    update: function() {

        if (!MarioEpisode.active && !player.dying) {
            MarioEpisode.start();
        }


        // --------------------------------------------------
        // Clear previous AI controls
        // --------------------------------------------------

        input.setAI('LEFT', false);
        input.setAI('RIGHT', false);
        input.setAI('JUMP', false);
        input.setAI('RUN', false);


        // --------------------------------------------------
        // Get the 5 inputs from Mario's sensors
        // --------------------------------------------------

        var inputs =
            MarioInputs.getInputs();


        MarioFitness.update();

        MarioEpisode.update();


        // --------------------------------------------------
        // Run the neural network
        // --------------------------------------------------

        var outputs =
            NeuralNetwork.predict(
                this.network,
                inputs
            );


        // --------------------------------------------------
        // Read the three outputs
        // --------------------------------------------------

        var leftScore =
            outputs[0];

        var rightScore =
            outputs[1];

        var jumpScore =
            outputs[2];


        // --------------------------------------------------
        // LEFT vs RIGHT
        // --------------------------------------------------

        if (leftScore > rightScore) {

            input.setAI('LEFT', true);

        } else {

            input.setAI('RIGHT', true);

        }


        // --------------------------------------------------
        // JUMP
        // --------------------------------------------------

        if (jumpScore > 0.5) {

            input.setAI('JUMP', true);

        }


        // --------------------------------------------------
        // Debug
        // --------------------------------------------------

        this.debugTimer++;


        if (this.debugTimer % 30 === 0) {

            console.log({

                inputs: inputs,

                left: leftScore,

                right: rightScore,

                jump: jumpScore,

                fitness: MarioFitness.getFitness()

            });

        }

    }

};
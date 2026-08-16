var NeuralNetwork = {

    // --------------------------------------------------
    // Create a new neural network
    // --------------------------------------------------

    create: function(inputCount, hiddenCount, outputCount) {

        var network = {

            inputCount: inputCount,
            hiddenCount: hiddenCount,
            outputCount: outputCount,

            weightsInputHidden: [],
            weightsHiddenOutput: [],

            biasHidden: [],
            biasOutput: []
        };


        // ----------------------------------------------
        // Input -> Hidden weights
        // ----------------------------------------------

        for (var i = 0; i < inputCount; i++) {

            network.weightsInputHidden[i] = [];

            for (var h = 0; h < hiddenCount; h++) {

                network.weightsInputHidden[i][h] =
                    Math.random() * 2 - 1;
            }
        }


        // ----------------------------------------------
        // Hidden -> Output weights
        // ----------------------------------------------

        for (var h = 0; h < hiddenCount; h++) {

            network.weightsHiddenOutput[h] = [];

            for (var o = 0; o < outputCount; o++) {

                network.weightsHiddenOutput[h][o] =
                    Math.random() * 2 - 1;
            }
        }


        // ----------------------------------------------
        // Hidden biases
        // ----------------------------------------------

        for (var h = 0; h < hiddenCount; h++) {

            network.biasHidden[h] =
                Math.random() * 2 - 1;
        }


        // ----------------------------------------------
        // Output biases
        // ----------------------------------------------

        for (var o = 0; o < outputCount; o++) {

            network.biasOutput[o] =
                Math.random() * 2 - 1;
        }


        return network;
    },


    // --------------------------------------------------
    // Make an exact copy of a network
    // --------------------------------------------------

    copy: function(original) {

        var network = {

            inputCount: original.inputCount,
            hiddenCount: original.hiddenCount,
            outputCount: original.outputCount,

            weightsInputHidden: [],
            weightsHiddenOutput: [],

            biasHidden: [],
            biasOutput: []
        };


        // ----------------------------------------------
        // Copy Input -> Hidden weights
        // ----------------------------------------------

        for (var i = 0; i < original.inputCount; i++) {

            network.weightsInputHidden[i] = [];

            for (var h = 0; h < original.hiddenCount; h++) {

                network.weightsInputHidden[i][h] =
                    original.weightsInputHidden[i][h];
            }
        }


        // ----------------------------------------------
        // Copy Hidden -> Output weights
        // ----------------------------------------------

        for (var h = 0; h < original.hiddenCount; h++) {

            network.weightsHiddenOutput[h] = [];

            for (var o = 0; o < original.outputCount; o++) {

                network.weightsHiddenOutput[h][o] =
                    original.weightsHiddenOutput[h][o];
            }
        }


        // ----------------------------------------------
        // Copy hidden biases
        // ----------------------------------------------

        for (var h = 0; h < original.hiddenCount; h++) {

            network.biasHidden[h] =
                original.biasHidden[h];
        }


        // ----------------------------------------------
        // Copy output biases
        // ----------------------------------------------

        for (var o = 0; o < original.outputCount; o++) {

            network.biasOutput[o] =
                original.biasOutput[o];
        }


        return network;
    },


    // --------------------------------------------------
    // Mutate a network
    //
    // rate = probability that any individual weight/bias
    // mutates at all (default 1 = mutate everything, the
    // old behavior). Mutating only a fraction of the
    // genome per child keeps most of what already works
    // intact instead of redrawing the whole network.
    // --------------------------------------------------

    mutate: function(network, amount, rate) {

        if (rate === undefined) {
            rate = 1;
        }


        // ----------------------------------------------
        // Mutate Input -> Hidden weights
        // ----------------------------------------------

        for (var i = 0; i < network.inputCount; i++) {

            for (var h = 0; h < network.hiddenCount; h++) {

                if (Math.random() < rate) {

                    network.weightsInputHidden[i][h] +=
                        (Math.random() * 2 - 1) * amount;
                }
            }
        }


        // ----------------------------------------------
        // Mutate Hidden -> Output weights
        // ----------------------------------------------

        for (var h = 0; h < network.hiddenCount; h++) {

            for (var o = 0; o < network.outputCount; o++) {

                if (Math.random() < rate) {

                    network.weightsHiddenOutput[h][o] +=
                        (Math.random() * 2 - 1) * amount;
                }
            }
        }


        // ----------------------------------------------
        // Mutate hidden biases
        // ----------------------------------------------

        for (var h = 0; h < network.hiddenCount; h++) {

            if (Math.random() < rate) {

                network.biasHidden[h] +=
                    (Math.random() * 2 - 1) * amount;
            }
        }


        // ----------------------------------------------
        // Mutate output biases
        // ----------------------------------------------

        for (var o = 0; o < network.outputCount; o++) {

            if (Math.random() < rate) {

                network.biasOutput[o] +=
                    (Math.random() * 2 - 1) * amount;
            }
        }


        return network;
    },


    // --------------------------------------------------
    // Activation function
    // --------------------------------------------------

    sigmoid: function(x) {

        return 1 / (1 + Math.exp(-x));

    },


    // --------------------------------------------------
    // Run the network
    // --------------------------------------------------

    predict: function(network, inputs) {

        var hidden = [];
        var outputs = [];


        // ----------------------------------------------
        // INPUT -> HIDDEN
        // ----------------------------------------------

        for (var h = 0; h < network.hiddenCount; h++) {

            var sum = network.biasHidden[h];


            for (var i = 0; i < network.inputCount; i++) {

                // A short input array (or a NaN sensor) would
                // otherwise poison every hidden unit, every
                // output, and silently make all networks
                // identical - treat anything non-finite as 0.
                var value = inputs[i];

                if (typeof value !== 'number' || !isFinite(value)) {
                    value = 0;
                }

                sum +=
                    value *
                    network.weightsInputHidden[i][h];
            }


            hidden[h] = this.sigmoid(sum);
        }


        // ----------------------------------------------
        // HIDDEN -> OUTPUT
        // ----------------------------------------------

        for (var o = 0; o < network.outputCount; o++) {

            var sum = network.biasOutput[o];


            for (var h = 0; h < network.hiddenCount; h++) {

                sum +=
                    hidden[h] *
                    network.weightsHiddenOutput[h][o];
            }


            outputs[o] = this.sigmoid(sum);
        }


        return outputs;
    }

};
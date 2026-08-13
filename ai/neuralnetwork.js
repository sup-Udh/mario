var NeuralNetwork = {

    // --------------------------------------------------
    // Create a new neural network
    // --------------------------------------------------

    create: function(inputCount, hiddenCount, outputCount) {

        var network = {

            inputCount: inputCount,
            hiddenCount: hiddenCount,
            outputCount: outputCount,

            // We will store the weights here.
            weightsInputHidden: [],
            weightsHiddenOutput: [],

            // Biases help the neurons make decisions.
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

                sum +=
                    inputs[i] *
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
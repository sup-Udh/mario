var AIPopulation = {

    // --------------------------------------------------
    // Population settings
    // --------------------------------------------------

    size: 5,

    networks: [],

    fitness: [],

    current: 0,

    generation: 1,

    mutationAmount: 0.20,


    // --------------------------------------------------
    // Create first population
    // --------------------------------------------------

    create: function() {

        this.networks = [];

        this.fitness = [];

        this.current = 0;

        this.generation = 1;


        for (var i = 0; i < this.size; i++) {

            var network =
                NeuralNetwork.create(
                    5,
                    8,
                    3
                );

            this.networks.push(network);

            this.fitness.push(0);
        }


        console.log(
            "Created population:",
            this.networks.length
        );

        console.log(
            "Generation:",
            this.generation
        );
    },


    // --------------------------------------------------
    // Get current network
    // --------------------------------------------------

    getCurrentNetwork: function() {

        return this.networks[this.current];

    },


    // --------------------------------------------------
    // Store fitness for current network
    // --------------------------------------------------

    setCurrentFitness: function(value) {

        this.fitness[this.current] = value;

    },


    // --------------------------------------------------
    // Move to next network
    // --------------------------------------------------

next: function() {

    var oldNetwork = this.current + 1;

    this.current++;

    console.log(
        "Moving from network:",
        oldNetwork,
        "to:",
        this.current + 1
    );


    // ----------------------------------------------
    // Population finished - evolve into the
    // next generation instead of just looping
    // back over the same unmutated networks.
    // ----------------------------------------------

    if (this.current >= this.size) {

        this.evolve();

        return;
    }


    console.log(
        "CURRENT NETWORK IS NOW:",
        this.current + 1
    );
},


    // --------------------------------------------------
    // Evolve population
    // --------------------------------------------------

    evolve: function() {

        console.log(
            "================================"
        );

        console.log(
            "Population finished!"
        );

        console.log(
            "Generation:",
            this.generation
        );

        console.log(
            "Fitness:",
            this.fitness
        );


        // ----------------------------------------------
        // Find best network
        // ----------------------------------------------

        var bestIndex =
            this.getBestIndex();

        var bestFitness =
            this.fitness[bestIndex];

        var bestNetwork =
            this.networks[bestIndex];


        console.log(
            "Best network:",
            bestIndex + 1
        );

        console.log(
            "Best fitness:",
            bestFitness
        );


        // ----------------------------------------------
        // Create next generation
        // ----------------------------------------------

        var newNetworks = [];

        var newFitness = [];


        // ----------------------------------------------
        // Keep the best network unchanged
        // ----------------------------------------------

        newNetworks.push(
            NeuralNetwork.copy(bestNetwork)
        );

        newFitness.push(0);


        // ----------------------------------------------
        // Fill remaining population
        // with mutated copies of the best
        // ----------------------------------------------

        for (
            var i = 1;
            i < this.size;
            i++
        ) {

            var child =
                NeuralNetwork.copy(bestNetwork);


            NeuralNetwork.mutate(
                child,
                this.mutationAmount
            );


            newNetworks.push(child);

            newFitness.push(0);
        }


        // ----------------------------------------------
        // Replace old population
        // ----------------------------------------------

        this.networks = newNetworks;

        this.fitness = newFitness;

        this.current = 0;

        this.generation++;


        console.log(
            "Starting generation:",
            this.generation
        );

        console.log(
            "Population evolved!"
        );

        console.log(
            "================================"
        );
    },


    // --------------------------------------------------
    // Find best network
    // --------------------------------------------------

    getBestIndex: function() {

        var bestIndex = 0;


        for (
            var i = 1;
            i < this.fitness.length;
            i++
        ) {

            if (
                this.fitness[i] >
                this.fitness[bestIndex]
            ) {

                bestIndex = i;
            }
        }


        return bestIndex;
    },


    // --------------------------------------------------
    // Get best network
    // --------------------------------------------------

    getBestNetwork: function() {

        var bestIndex =
            this.getBestIndex();

        return this.networks[bestIndex];

    },


    // --------------------------------------------------
    // Get best fitness
    // --------------------------------------------------

    getBestFitness: function() {

        var bestIndex =
            this.getBestIndex();

        return this.fitness[bestIndex];

    }

};
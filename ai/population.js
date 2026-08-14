var AIPopulation = {

    // --------------------------------------------------
    // Population settings
    // --------------------------------------------------

    size: 12,

    networks: [],

    fitness: [],

    // Raw distance (MarioFitness.maxX) each network reached,
    // kept separate from fitness since fitness also includes
    // bonuses/penalties - this is purely "how far did it get."
    distances: [],

    // All-time furthest distance reached by any network,
    // across every generation of this training run.
    bestDistanceEver: 0,

    current: 0,

    generation: 1,


    // --------------------------------------------------
    // Evolution tuning
    //
    // eliteCount    - top performers copied unchanged
    //                 into the next generation (guards
    //                 against losing a good strategy,
    //                 and keeps more than one alive so
    //                 the whole population doesn't
    //                 collapse onto a single lineage).
    // freshCount    - brand-new random networks injected
    //                 each generation, so a bad lineage
    //                 always has a way out instead of
    //                 just re-mutating the same mistake.
    // mutationRate  - probability that any individual
    //                 weight/bias mutates at all.
    // mutationAmount/mutationDecay/minMutationAmount -
    //                 mutation step size shrinks each
    //                 generation (coarse exploration
    //                 early, fine-tuning later) but
    //                 never fully stops exploring.
    // --------------------------------------------------

    eliteCount: 2,

    freshCount: 2,

    mutationRate: 0.15,

    mutationAmount: 0.20,

    mutationDecay: 0.98,

    minMutationAmount: 0.02,


    // --------------------------------------------------
    // Create first population
    // --------------------------------------------------

    create: function() {

        this.networks = [];

        this.fitness = [];

        this.distances = [];

        this.bestDistanceEver = 0;

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

            this.distances.push(0);
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
    // Store raw distance for current network, and track
    // the all-time record across the whole training run.
    // --------------------------------------------------

    setCurrentDistance: function(value) {

        this.distances[this.current] = value;

        if (value > this.bestDistanceEver) {
            this.bestDistanceEver = value;
        }
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
        // Rank networks best -> worst
        // ----------------------------------------------

        var ranked =
            this.getRankedIndices();

        console.log(
            "Best network:",
            ranked[0] + 1
        );

        console.log(
            "Best fitness:",
            this.fitness[ranked[0]]
        );


        // ----------------------------------------------
        // One-line trend summary - easy to eyeball (or
        // filter the console for "SUMMARY") across many
        // generations without scrolling through the
        // full per-episode logs.
        // ----------------------------------------------

        var fitnessSum = 0;

        var distanceSum = 0;

        var farthestThisGen = 0;

        for (var s = 0; s < this.fitness.length; s++) {

            fitnessSum += this.fitness[s];

            distanceSum += this.distances[s] || 0;

            if ((this.distances[s] || 0) > farthestThisGen) {
                farthestThisGen = this.distances[s];
            }
        }

        var avgFitness = fitnessSum / this.fitness.length;

        var avgDistance = distanceSum / this.fitness.length;

        console.log(
            "SUMMARY | Gen " + this.generation +
            " | best fitness " + this.fitness[ranked[0]].toFixed(1) +
            " | avg fitness " + avgFitness.toFixed(1) +
            " | farthest X this gen " + farthestThisGen.toFixed(1) +
            " | avg X this gen " + avgDistance.toFixed(1) +
            " | all-time best X " + this.bestDistanceEver.toFixed(1) +
            " | mutation " + this.mutationAmount.toFixed(3)
        );


        // ----------------------------------------------
        // Create next generation
        // ----------------------------------------------

        var newNetworks = [];

        var newFitness = [];

        var newDistances = [];


        // ----------------------------------------------
        // Elites: keep the top performers unchanged so
        // a good strategy is never lost, and more than
        // one survives so the population doesn't
        // collapse onto a single lineage.
        // ----------------------------------------------

        for (
            var e = 0;
            e < this.eliteCount && e < ranked.length;
            e++
        ) {

            newNetworks.push(
                NeuralNetwork.copy(
                    this.networks[ranked[e]]
                )
            );

            newFitness.push(0);

            newDistances.push(0);
        }


        // ----------------------------------------------
        // Fresh blood: brand-new random networks, so a
        // bad lineage always has a way out instead of
        // just re-mutating the same mistake forever.
        // ----------------------------------------------

        for (
            var f = 0;
            f < this.freshCount;
            f++
        ) {

            newNetworks.push(
                NeuralNetwork.create(5, 8, 3)
            );

            newFitness.push(0);

            newDistances.push(0);
        }


        // ----------------------------------------------
        // Fill the rest with mutated children of a
        // randomly chosen elite parent.
        // ----------------------------------------------

        while (newNetworks.length < this.size) {

            var eliteSlots =
                Math.min(this.eliteCount, ranked.length);

            var parentIndex =
                ranked[Math.floor(Math.random() * eliteSlots)];

            var child =
                NeuralNetwork.copy(this.networks[parentIndex]);


            NeuralNetwork.mutate(
                child,
                this.mutationAmount,
                this.mutationRate
            );


            newNetworks.push(child);

            newFitness.push(0);

            newDistances.push(0);
        }


        // ----------------------------------------------
        // Replace old population
        // ----------------------------------------------

        this.networks = newNetworks;

        this.fitness = newFitness;

        this.distances = newDistances;

        this.current = 0;

        this.generation++;


        // ----------------------------------------------
        // Shrink the mutation step size a little every
        // generation - coarse exploration early, finer
        // tuning later - but never let it hit zero.
        // ----------------------------------------------

        this.mutationAmount = Math.max(
            this.minMutationAmount,
            this.mutationAmount * this.mutationDecay
        );


        console.log(
            "Starting generation:",
            this.generation
        );

        console.log(
            "Mutation amount now:",
            this.mutationAmount
        );

        console.log(
            "Population evolved!"
        );

        console.log(
            "================================"
        );
    },


    // --------------------------------------------------
    // Rank network indices best -> worst by fitness
    // --------------------------------------------------

    getRankedIndices: function() {

        var fitness = this.fitness;

        var indices = [];

        for (var i = 0; i < fitness.length; i++) {
            indices.push(i);
        }

        indices.sort(function(a, b) {
            return fitness[b] - fitness[a];
        });

        return indices;
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
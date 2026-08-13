var AIPopulation = {
    size: 5, // number of brains required
    networks: [], // storage of the brains
    fitness: [], // storage of each fitness
    current: 0, // which brain we are currently testing 

  create: function() {

        this.networks = [];
        this.fitness = [];
        this.current = 0;

        for (var i = 0; i < this.size; i++) {

            var network =
                NeuralNetwork.create(5, 8, 3);

            this.networks.push(network);
            this.fitness.push(0);
        }

        console.log(
            "Created population:",
            this.networks.length
        );
    },


    // Get the network currently being tested
    getCurrentNetwork: function() {

        return this.networks[this.current];

    },


    // Give the current network its fitness
    setCurrentFitness: function(value) {

        this.fitness[this.current] = value;

    },


    // Move to the next network
    next: function() {

        this.current++;

        if (this.current >= this.size) {

            this.current = 0;

        }

    }

};
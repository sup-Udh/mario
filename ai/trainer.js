// ==================================================
// AITrainer
//
//                 MASTER NETWORK
//                       |
//         +-------------+-------------+
//         v             v             v
//     NETWORK 1     NETWORK 2  ...  NETWORK 10
//         |             |             |
//      MARIO 1       MARIO 2       MARIO 10
//         |             |             |
//         +-------------+-------------+
//                       v
//                FITNESS RESULTS
//                       v
//              SELECT BEST NETWORK
//                       v
//                  NEW MASTER
//
// The trainer owns generations, networks, selection and
// persistence. The environments own the game worlds. The
// neural network only maps inputs to outputs.
//
// Generation barrier: all environments run at once; an
// environment that dies simply parks (it is NOT reset,
// and no other environment is disturbed). Once every
// environment has finished, the generation is scored and
// the whole population is respawned together.
// ==================================================

(function() {

    var scope =
        (typeof window !== 'undefined') ? window : globalThis;


    // Network shape. Saved models are rejected if they do
    // not match, so changing this can never silently load
    // an incompatible brain.
    var INPUT_COUNT = 5;
    var HIDDEN_COUNT = 8;
    var OUTPUT_COUNT = 3;


    var AITrainer = {

        // ------------------------------------------
        // Population
        // ------------------------------------------

        // Per-environment and per-generation console spam.
        //
        // At turbo a generation can finish ~3x per second,
        // and the full dump is ~25 console calls each time.
        // Formatting and printing that from inside the
        // frame loop is itself a measurable cost, so it is
        // off by default; a single summary line per
        // generation always survives.
        verboseLog: false,


        environmentCount: 10,

        environments: [],

        masterNetwork: null,

        // Best networks of the previous generation, kept
        // so a good strategy is never lost to one unlucky
        // mutation.
        elites: [],

        generation: 1,


        // ------------------------------------------
        // Evolution tuning
        // ------------------------------------------

        eliteCount: 3,

        // Brand-new random networks injected every
        // generation.
        //
        // Without these the whole population is one
        // master plus small mutations, and because the
        // level is deterministic that means ten IDENTICAL
        // Marios, ten identical fitness values, no
        // selection signal, and a master that can never
        // change. Fresh blood is what keeps the search
        // from locking up.
        freshCount: 2,

        mutationRate: 0.35,

        mutationAmount: 0.35,

        mutationDecay: 0.98,

        minMutationAmount: 0.02,

        // Elites are only nudged, not shaken.
        eliteMutationAmount: 0.05,


        // ------------------------------------------
        // Stats
        // ------------------------------------------

        bestFitnessEver: 0,

        bestFitnessThisGen: 0,

        averageFitness: 0,

        bestEnvironmentId: 1,


        // ------------------------------------------
        // Persistence
        // ------------------------------------------

        // ------------------------------------------
        // Showcase (the 11th screen)
        //
        // Replays the best network found so far, in real
        // time, on its own screen. It deliberately does
        // NOT follow the current generation - it keeps
        // looping the reigning champion and only adopts a
        // new brain when a new all-time best distance is
        // actually beaten, and even then only at the next
        // episode boundary so a run is never cut in half.
        // ------------------------------------------

        showcase: null,

        showcaseNetwork: null,

        showcaseFitness: 0,

        showcaseGeneration: 1,

        showcasePending: false,


        storageKey: 'mario_ai_best_network',

        checkpointPrefix: 'mario_ai_checkpoint_',

        generationsPerSave: 200,

        maxCheckpoints: 3,


        // ==========================================
        // Setup
        // ==========================================

        init: function(surfaces) {

            this.environments = [];


            // --------------------------------------
            // Master network: resume if we can.
            // --------------------------------------

            var saved = this.loadBestNetwork();

            if (saved) {

                this.masterNetwork = saved.network;

                this.generation = saved.generation || 1;

                this.bestFitnessEver = saved.fitness || 0;

                console.log(
                    "Loaded master network.\n" +
                    "Generation: " + this.generation + "\n" +
                    "Best fitness: " + Math.floor(this.bestFitnessEver)
                );

            } else {

                this.masterNetwork = NeuralNetwork.create(
                    INPUT_COUNT,
                    HIDDEN_COUNT,
                    OUTPUT_COUNT
                );

                console.log(
                    "No saved network found.\n" +
                    "Creating new master network."
                );
            }


            this.elites = [
                NeuralNetwork.copy(this.masterNetwork)
            ];


            // --------------------------------------
            // Environments
            // --------------------------------------

            for (var i = 0; i < this.environmentCount; i++) {

                var env = new MarioEnvironment(i + 1);

                if (surfaces && surfaces[i]) {
                    env.attachCanvas(
                        surfaces[i].canvas,
                        surfaces[i].ctx
                    );
                }

                env.trainer = this;

                // Parking, not resetting: the other nine
                // environments must keep running.
                env.onFinished = function(finished, result) {

                    if (!AITrainer.verboseLog) {
                        return;
                    }

                    console.log(
                        "Environment " + finished.id +
                        " -> " + finished.status +
                        "   Fitness: " + Math.floor(result.fitness)
                    );
                };

                this.environments.push(env);
            }


            this.startGeneration();
        },


        // ==========================================
        // Showcase screen
        // ==========================================

        initShowcase: function(surface) {

            if (!surface) {
                return;
            }

            this.showcase = new MarioEnvironment('BEST');

            this.showcase.attachCanvas(surface.canvas, surface.ctx);

            this.showcase.trainer = this;

            this.showcaseNetwork =
                NeuralNetwork.copy(this.masterNetwork);

            this.showcaseFitness = this.bestFitnessEver;

            this.showcaseGeneration = this.generation;

            this.showcase.network =
                NeuralNetwork.copy(this.showcaseNetwork);

            this.showcase.generation = this.generation;

            this.showcase.reset();
        },


        // ------------------------------------------
        // Driven once per animation frame, never at
        // turbo speed - the whole point is that a human
        // can watch it.
        // ------------------------------------------

        updateShowcase: function(dt) {

            if (!this.showcase) {
                return;
            }

            if (this.showcase.episode.active) {

                this.showcase.update(dt);

                return;
            }


            // Episode over: loop it, picking up a new
            // champion only if one has actually been
            // crowned since the last run.
            if (this.showcasePending) {

                this.showcase.network =
                    NeuralNetwork.copy(this.showcaseNetwork);

                this.showcase.generation = this.showcaseGeneration;

                this.showcasePending = false;
            }

            this.showcase.reset();
        },


        // ==========================================
        // Spawn a fresh candidate set
        // ==========================================

        startGeneration: function() {

            var networks = this.buildCandidates();

            for (var i = 0; i < this.environments.length; i++) {

                var env = this.environments[i];

                env.network = networks[i];

                env.generation = this.generation;

                env.reset();
            }
        },


        // ------------------------------------------
        // Candidate networks for this generation.
        //
        // Index 0 is the master, copied EXACTLY, so the
        // best known strategy is always still in play.
        // The remaining slots are mutated descendants of
        // the elites.
        // ------------------------------------------

        buildCandidates: function() {

            var networks = [];


            // 1. the master, untouched
            networks.push(
                NeuralNetwork.copy(this.masterNetwork)
            );


            // 2. the other elites, only lightly mutated
            for (
                var e = 1;
                e < this.eliteCount && e < this.elites.length;
                e++
            ) {

                var eliteChild =
                    NeuralNetwork.copy(this.elites[e]);

                NeuralNetwork.mutate(
                    eliteChild,
                    this.eliteMutationAmount,
                    this.mutationRate
                );

                networks.push(eliteChild);
            }


            // 3. fresh blood - guarantees the population can
            //    always escape a stagnant master
            for (
                var f = 0;
                f < this.freshCount &&
                    networks.length < this.environmentCount;
                f++
            ) {

                networks.push(
                    NeuralNetwork.create(
                        INPUT_COUNT,
                        HIDDEN_COUNT,
                        OUTPUT_COUNT
                    )
                );
            }


            // 4. the rest: mutated children of a random elite
            while (networks.length < this.environmentCount) {

                var parent =
                    this.elites[
                        Math.floor(Math.random() * this.elites.length)
                    ];

                var child = NeuralNetwork.copy(parent);

                NeuralNetwork.mutate(
                    child,
                    this.mutationAmount,
                    this.mutationRate
                );

                networks.push(child);
            }


            return networks;
        },


        // ==========================================
        // Per-frame
        // ==========================================

        update: function(dt) {

            var running = 0;

            for (var i = 0; i < this.environments.length; i++) {

                var env = this.environments[i];

                if (env.episode.active) {

                    env.update(dt);

                    if (env.episode.active) {
                        running++;
                    }
                }
            }


            // Generation barrier.
            if (running === 0) {
                this.evolve();
            }
        },


        // ==========================================
        // Score the generation and breed the next one
        // ==========================================

        evolve: function() {

            var ranked = this.environments.slice().sort(function(a, b) {
                return b.result.fitness - a.result.fitness;
            });


            var best = ranked[0];

            this.bestFitnessThisGen = best.result.fitness;

            this.bestEnvironmentId = best.id;


            var sum = 0;

            for (var i = 0; i < this.environments.length; i++) {
                sum += this.environments[i].result.fitness;
            }

            this.averageFitness = sum / this.environments.length;


            // --------------------------------------
            // Report
            // --------------------------------------

            if (this.verboseLog) {

                console.log("====================================");
                console.log("GENERATION " + this.generation);
                console.log("====================================");

                for (var r = 0; r < this.environments.length; r++) {

                    var e = this.environments[r];

                    console.log(
                        "Environment " + e.id +
                        " -> Fitness: " + Math.floor(e.result.fitness) +
                        "   (" + e.status + ")"
                    );
                }

                console.log("");
                console.log("BEST: Environment " + best.id);
                console.log("BEST FITNESS: " + Math.floor(best.result.fitness));

            } else {

                // One cheap line per generation.
                console.log(
                    "Gen " + this.generation +
                    " | best " + Math.floor(this.bestFitnessThisGen) +
                    " | avg " + Math.floor(this.averageFitness) +
                    " | record " + Math.floor(this.bestFitnessEver) +
                    " | env #" + best.id
                );
            }


            // --------------------------------------
            // New master + elites
            // --------------------------------------

            this.masterNetwork =
                NeuralNetwork.copy(best.network);

            this.elites = [];

            for (
                var k = 0;
                k < this.eliteCount && k < ranked.length;
                k++
            ) {

                this.elites.push(
                    NeuralNetwork.copy(ranked[k].network)
                );
            }

            if (this.verboseLog) {
                console.log("New master network selected.");
            }


            // --------------------------------------
            // Persistence
            // --------------------------------------

            if (best.result.fitness > this.bestFitnessEver) {

                this.bestFitnessEver = best.result.fitness;

                this.saveBestNetwork();

                // Crown a new showcase champion. It is
                // swapped in at the next episode boundary,
                // so the screen only ever changes when a
                // record is actually broken.
                this.showcaseNetwork =
                    NeuralNetwork.copy(best.network);

                this.showcaseFitness = best.result.fitness;

                this.showcaseGeneration = this.generation;

                this.showcasePending = true;

                console.log(
                    "New all-time best: " +
                    Math.floor(this.bestFitnessEver) +
                    " (saved, showcase updated)"
                );
            }


            this.generation++;

            if (this.generation % this.generationsPerSave === 0) {
                this.saveCheckpoint();
            }


            // --------------------------------------
            // Mutation step shrinks over time: coarse
            // exploration early, fine tuning later, but
            // never zero.
            // --------------------------------------

            this.mutationAmount = Math.max(
                this.minMutationAmount,
                this.mutationAmount * this.mutationDecay
            );


            this.startGeneration();
        },


        // ==========================================
        // Persistence
        // ==========================================

        isValidNetwork: function(network) {

            if (!network || typeof network !== 'object') {
                return false;
            }

            if (
                network.inputCount !== INPUT_COUNT ||
                network.hiddenCount !== HIDDEN_COUNT ||
                network.outputCount !== OUTPUT_COUNT
            ) {
                return false;
            }

            if (
                !Array.isArray(network.weightsInputHidden) ||
                !Array.isArray(network.weightsHiddenOutput) ||
                !Array.isArray(network.biasHidden) ||
                !Array.isArray(network.biasOutput)
            ) {
                return false;
            }

            if (
                network.weightsInputHidden.length !== INPUT_COUNT ||
                network.weightsHiddenOutput.length !== HIDDEN_COUNT ||
                network.biasHidden.length !== HIDDEN_COUNT ||
                network.biasOutput.length !== OUTPUT_COUNT
            ) {
                return false;
            }

            return true;
        },


        storage: function() {

            try {

                return scope.localStorage || null;

            } catch (e) {

                return null;
            }
        },


        saveBestNetwork: function() {

            var store = this.storage();

            if (!store) {
                return false;
            }

            try {

                store.setItem(this.storageKey, JSON.stringify({
                    network: this.masterNetwork,
                    fitness: this.bestFitnessEver,
                    generation: this.generation,
                    timestamp: Date.now()
                }));

                return true;

            } catch (e) {

                console.warn(
                    "Could not save network:",
                    e && e.message
                );

                return false;
            }
        },


        loadBestNetwork: function() {

            var store = this.storage();

            if (!store) {
                return null;
            }

            try {

                var raw = store.getItem(this.storageKey);

                if (!raw) {
                    return null;
                }

                var data = JSON.parse(raw);

                if (!data || !this.isValidNetwork(data.network)) {

                    console.warn(
                        "Saved network is missing or has the wrong " +
                        "shape - ignoring it and starting fresh."
                    );

                    return null;
                }

                return data;

            } catch (e) {

                console.warn(
                    "Could not load saved network:",
                    e && e.message
                );

                return null;
            }
        },


        saveCheckpoint: function() {

            var store = this.storage();

            if (!store) {
                return;
            }

            try {

                store.setItem(
                    this.checkpointPrefix + this.generation,
                    JSON.stringify({
                        network: this.masterNetwork,
                        fitness: this.bestFitnessEver,
                        generation: this.generation,
                        timestamp: Date.now()
                    })
                );

                console.log(
                    "Checkpoint saved at generation " + this.generation
                );

                this.pruneCheckpoints();

            } catch (e) {

                console.warn(
                    "Could not save checkpoint:",
                    e && e.message
                );
            }
        },


        // ------------------------------------------
        // Keep storage bounded - only the most recent
        // few checkpoints are worth keeping.
        // ------------------------------------------

        pruneCheckpoints: function() {

            var store = this.storage();

            if (!store) {
                return;
            }

            try {

                var keys = [];

                for (var i = 0; i < store.length; i++) {

                    var key = store.key(i);

                    if (
                        key &&
                        key.indexOf(this.checkpointPrefix) === 0
                    ) {
                        keys.push(key);
                    }
                }

                keys.sort(function(a, b) {

                    var ga = parseInt(a.split('_').pop(), 10);
                    var gb = parseInt(b.split('_').pop(), 10);

                    return ga - gb;
                });

                while (keys.length > this.maxCheckpoints) {

                    store.removeItem(keys.shift());
                }

            } catch (e) {
                // Pruning is best-effort.
            }
        }

    };


    scope.AITrainer = AITrainer;

})();

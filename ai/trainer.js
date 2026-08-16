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

        // The value mutationAmount decays FROM. Kept
        // separately because mutationAmount is live state -
        // starting a fresh run has to put it back, and by
        // then the original is long gone.
        initialMutationAmount: 0.35,

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
        // Learning curve
        //
        // One sample per generation, kept in memory and
        // drawn as a sparkline in the dashboard. This is
        // the only place the per-generation numbers
        // survive at all - everything else on this object
        // is overwritten by the next generation.
        //
        // Bounded because training runs for hours: at
        // ~3 generations/second a session would otherwise
        // accumulate a sample per frame forever.
        // ------------------------------------------

        history: [],

        historyLimit: 600,


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

        // Champions displaced by a "start fresh" choice.
        archivePrefix: 'mario_ai_archive_',

        generationsPerSave: 200,

        maxCheckpoints: 3,

        maxArchives: 5,


        // ==========================================
        // Setup
        // ==========================================

        // options.resume === false starts a brand-new run
        // even when a saved champion exists. Anything else
        // resumes if there is something to resume from.

        init: function(surfaces, options) {

            options = options || {};

            var resume = (options.resume !== false);

            this.environments = [];


            // --------------------------------------
            // Master network: resume if we can.
            // --------------------------------------

            var saved = resume ? this.loadBestNetwork() : null;

            if (saved) {

                this.masterNetwork = saved.network;

                this.generation = saved.generation || 1;

                this.bestFitnessEver = saved.fitness || 0;

                // Resume the decayed step size, not the
                // initial one - see savePayload().
                if (
                    typeof saved.mutationAmount === 'number' &&
                    isFinite(saved.mutationAmount)
                ) {
                    this.mutationAmount = Math.max(
                        this.minMutationAmount,
                        saved.mutationAmount
                    );
                }

                console.log(
                    "Loaded master network.\n" +
                    "Generation: " + this.generation + "\n" +
                    "Best fitness: " + Math.floor(this.bestFitnessEver) + "\n" +
                    "Mutation amount: " + this.mutationAmount.toFixed(3)
                );

            } else {

                // Starting over by request means the saved
                // champion is about to be overwritten: the
                // very first generation will beat a record
                // of 0 and trigger a save. Archive it first
                // so choosing "start fresh" can never cost
                // someone a brain they spent hours on.
                if (!resume) {
                    this.archiveBestNetwork();
                }

                this.masterNetwork = NeuralNetwork.create(
                    INPUT_COUNT,
                    HIDDEN_COUNT,
                    OUTPUT_COUNT
                );

                // Every piece of live state has to go back
                // to its starting value, not just the
                // network - init() can be called on a
                // trainer that has already run.
                this.generation = 1;

                this.bestFitnessEver = 0;

                this.bestFitnessThisGen = 0;

                this.averageFitness = 0;

                this.mutationAmount = this.initialMutationAmount;

                this.history = [];

                console.log(
                    resume ?
                        "No saved network found.\n" +
                        "Creating new master network." :
                        "Starting a fresh run.\n" +
                        "Any previous champion has been archived."
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
            // Mutation step shrinks over time: coarse
            // exploration early, fine tuning later, but
            // never zero.
            //
            // Decayed BEFORE saving, not after, so the
            // value written to storage is the one the next
            // generation will actually use. Saving the
            // pre-decay value would hand a resumed run a
            // step size it had already grown out of.
            // --------------------------------------

            this.mutationAmount = Math.max(
                this.minMutationAmount,
                this.mutationAmount * this.mutationDecay
            );


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


            // --------------------------------------
            // Learning curve sample
            //
            // Recorded AFTER the record check above, so
            // `record` is the all-time best as of this
            // generation, and `gen` is the generation
            // that was just scored.
            // --------------------------------------

            this.history.push({
                gen: this.generation,
                best: this.bestFitnessThisGen,
                avg: this.averageFitness,
                record: this.bestFitnessEver
            });

            // while, not if: the cap then holds even when
            // historyLimit is lowered from the console
            // mid-run.
            while (this.history.length > this.historyLimit) {
                this.history.shift();
            }


            this.generation++;

            if (this.generation % this.generationsPerSave === 0) {
                this.saveCheckpoint();
            }


            this.startGeneration();
        },


        // ==========================================
        // Persistence
        // ==========================================

        // ------------------------------------------
        // Grow an older saved brain to fit a new input.
        //
        // Adding a sensor changes inputCount, which would
        // otherwise make every saved network invalid and
        // throw away all previous training. Instead we
        // append one weight row for the new input,
        // initialised to ZERO.
        //
        // Zero matters: the migrated network behaves
        // EXACTLY as before, because the new input
        // contributes nothing until mutation discovers a
        // use for it. Nothing learned is lost, and the new
        // sensor starts as a neutral option rather than as
        // noise injected into a working brain.
        //
        // Returns the network, or null if it cannot be
        // sensibly migrated.
        // ------------------------------------------

        migrateNetwork: function(network) {

            if (!network || typeof network !== 'object') {
                return null;
            }

            if (this.isValidNetwork(network)) {
                return network;
            }

            var growable =
                typeof network.inputCount === 'number' &&
                network.inputCount < INPUT_COUNT &&
                network.hiddenCount === HIDDEN_COUNT &&
                network.outputCount === OUTPUT_COUNT &&
                Array.isArray(network.weightsInputHidden) &&
                network.weightsInputHidden.length === network.inputCount;

            if (!growable) {
                return null;
            }

            var added = 0;

            while (network.weightsInputHidden.length < INPUT_COUNT) {

                var row = [];

                for (var h = 0; h < HIDDEN_COUNT; h++) {
                    row.push(0);
                }

                network.weightsInputHidden.push(row);

                added++;
            }

            var from = network.inputCount;

            network.inputCount = INPUT_COUNT;

            if (!this.isValidNetwork(network)) {
                return null;
            }

            console.log(
                "Migrated saved network from " + from + " to " +
                INPUT_COUNT + " inputs (" + added +
                " new weight row(s), zeroed - behaviour unchanged)."
            );

            return network;
        },


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


        // ------------------------------------------
        // Everything needed to resume a run.
        //
        // mutationAmount is part of the state, not just a
        // setting: it decays from 0.35 toward 0.02 over a
        // long run, and resuming at the initial 0.35 would
        // shake a finely-tuned champion with the coarse
        // noise it had already grown out of.
        //
        // scoringVersion records WHICH fitness function
        // produced `fitness`, so a record from an older
        // scoring rule is never treated as a target the
        // current rule has to beat (see loadBestNetwork).
        // ------------------------------------------

        savePayload: function() {

            return {
                network: this.masterNetwork,
                fitness: this.bestFitnessEver,
                generation: this.generation,
                mutationAmount: this.mutationAmount,
                scoringVersion: MarioFitness.scoringVersion,
                timestamp: Date.now()
            };
        },


        // ------------------------------------------
        // What is in storage, for display only.
        //
        // Deliberately does NOT validate or migrate - the
        // resume dialog needs to describe the save as it
        // actually is, including a shape that will turn out
        // to be unusable. Returns null when there is
        // nothing to resume from.
        // ------------------------------------------

        savedRunInfo: function() {

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

                if (!data || !data.network) {
                    return null;
                }

                return {
                    generation: data.generation || 1,
                    fitness: data.fitness || 0,
                    savedAt: data.timestamp ? new Date(data.timestamp) : null,

                    // A save from an older fitness function
                    // keeps its brain but loses its score,
                    // and the dialog should say so rather
                    // than promise a record it will drop.
                    staleScore:
                        data.scoringVersion !== MarioFitness.scoringVersion,

                    usable: !!this.migrateNetwork(data.network)
                };

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

                store.setItem(
                    this.storageKey,
                    JSON.stringify(this.savePayload())
                );

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

                // Try to grow an older brain onto the current
                // input count before giving up on it.
                var migrated =
                    data ? this.migrateNetwork(data.network) : null;

                if (!migrated) {

                    console.warn(
                        "Saved network is missing or has the wrong " +
                        "shape - ignoring it and starting fresh."
                    );

                    return null;
                }

                data.network = migrated;


                // A record scored under a DIFFERENT fitness
                // function is not a record, it is a number
                // from another game.
                //
                // This matters more than it sounds. The old
                // scoring was pure distance; the current one
                // subtracts a death penalty. Carrying the old
                // figure over would leave the run chasing a
                // high score the new rule may be unable to
                // reach - and since networks are only saved
                // when the record is beaten, NOTHING would
                // ever be saved again.
                //
                // The brain is kept (it is still the best one
                // we have); only its now-meaningless score is
                // dropped, to be re-established on the first
                // generation.
                if (data.scoringVersion !== MarioFitness.scoringVersion) {

                    console.warn(
                        "Saved record was scored under fitness v" +
                        (data.scoringVersion || 1) +
                        ", current is v" + MarioFitness.scoringVersion +
                        " - keeping the network, re-establishing its score."
                    );

                    data.fitness = 0;
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


        // ==========================================
        // Archives
        //
        // "Start fresh" must never be a destructive act.
        // The outgoing champion is copied aside before the
        // new run is allowed to overwrite it, and can be
        // put back from the console:
        //
        //   AITrainer.listArchives()
        //   AITrainer.restoreArchive('mario_ai_archive_...')
        //   location.reload()
        // ==========================================

        archiveBestNetwork: function() {

            var store = this.storage();

            if (!store) {
                return null;
            }

            try {

                var raw = store.getItem(this.storageKey);

                // Nothing to lose.
                if (!raw) {
                    return null;
                }

                var key = this.archivePrefix + Date.now();

                store.setItem(key, raw);

                store.removeItem(this.storageKey);

                var label = '';

                try {
                    var data = JSON.parse(raw);
                    label =
                        ' (gen ' + (data.generation || '?') +
                        ', fitness ' + Math.floor(data.fitness || 0) + ')';
                } catch (e) {
                    // Label is decoration; the copy is what matters.
                }

                console.log(
                    "Previous champion archived" + label + " as:\n  " + key +
                    "\nRestore it with:\n" +
                    "  AITrainer.restoreArchive('" + key + "'); location.reload();"
                );

                this.pruneArchives();

                return key;

            } catch (e) {

                console.warn(
                    "Could not archive the previous network:",
                    e && e.message
                );

                return null;
            }
        },


        // Newest first.
        listArchives: function() {

            var store = this.storage();

            if (!store) {
                return [];
            }

            var found = [];

            try {

                for (var i = 0; i < store.length; i++) {

                    var key = store.key(i);

                    if (key && key.indexOf(this.archivePrefix) === 0) {

                        var entry = { key: key, savedAt: null, generation: null, fitness: null };

                        try {

                            var data = JSON.parse(store.getItem(key));

                            entry.savedAt =
                                data.timestamp ? new Date(data.timestamp) : null;
                            entry.generation = data.generation;
                            entry.fitness = data.fitness;

                        } catch (e) {
                            // Keep the key even if unreadable.
                        }

                        found.push(entry);
                    }
                }

                found.sort(function(a, b) {

                    var ta = parseInt(a.key.split('_').pop(), 10) || 0;
                    var tb = parseInt(b.key.split('_').pop(), 10) || 0;

                    return tb - ta;
                });

            } catch (e) {
                // Best effort.
            }

            return found;
        },


        restoreArchive: function(key) {

            var store = this.storage();

            if (!store) {
                return false;
            }

            var raw = store.getItem(key);

            if (!raw) {

                console.warn(
                    "No archive under '" + key +
                    "'. Use AITrainer.listArchives() to see what exists."
                );

                return false;
            }

            // The champion currently in place is itself
            // worth keeping - swapping, not clobbering.
            this.archiveBestNetwork();

            store.setItem(this.storageKey, raw);

            console.log(
                "Restored " + key +
                ". Reload the page and choose Resume to train from it."
            );

            return true;
        },


        pruneArchives: function() {

            var store = this.storage();

            if (!store) {
                return;
            }

            try {

                var keys = this.listArchives().map(function(a) {
                    return a.key;
                });

                // listArchives is newest-first, so anything
                // past the limit is the oldest.
                while (keys.length > this.maxArchives) {
                    store.removeItem(keys.pop());
                }

            } catch (e) {
                // Pruning is best-effort.
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
                    JSON.stringify(this.savePayload())
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

(function() {

    // --------------------------------------------------
    // Human keyboard controls
    //
    // Shared across every environment on purpose: there is
    // only one physical keyboard, so manual play always
    // drives whichever environment is currently active.
    // --------------------------------------------------

    var pressedKeys = {};


    // --------------------------------------------------
    // Convert keyboard events into readable names
    // --------------------------------------------------

    function setKey(event, status) {

        var code = event.keyCode;
        var key;


        switch(code) {

            case 32:
                key = 'SPACE';
                break;

            case 37:
                key = 'LEFT';
                break;

            case 38:
                key = 'UP';
                break;

            case 39:
                key = 'RIGHT';
                break;

            case 40:
                key = 'DOWN';
                break;

            case 88:
                key = 'JUMP';
                break;

            case 90:
                key = 'RUN';
                break;

            default:
                key = String.fromCharCode(code);
        }


        pressedKeys[key] = status;
    }


    if (typeof document !== 'undefined') {

        // ----------------------------------------------
        // Keyboard pressed
        // ----------------------------------------------

        document.addEventListener('keydown', function(e) {

            setKey(e, true);

        });


        // ----------------------------------------------
        // Keyboard released
        // ----------------------------------------------

        document.addEventListener('keyup', function(e) {

            setKey(e, false);

        });
    }


    if (typeof window !== 'undefined') {

        // ----------------------------------------------
        // Clear keyboard controls when the window
        // loses focus.
        // ----------------------------------------------

        window.addEventListener('blur', function() {

            pressedKeys = {};

        });
    }


    // --------------------------------------------------
    // Input factory
    //
    // Each environment needs its OWN set of AI keys -
    // otherwise ten networks would all write into one
    // shared key bank and control each other's Mario.
    // The human keyboard stays shared (see above).
    // --------------------------------------------------

    function createInput(acceptHuman) {

        // AI controls, private to this input object.
        var aiKeys = {};


        return {

            // ------------------------------------------
            // Does this input listen to the keyboard?
            //
            // Off for AI environments. The keyboard is a
            // single shared device, so if every
            // environment listened to it, one arrow key
            // would drive all ten Marios at once. Manual
            // play turns this on for exactly one
            // environment.
            // ------------------------------------------

            humanEnabled: !!acceptHuman,

            // ------------------------------------------
            // Check whether a key is currently pressed.
            //
            // It checks BOTH:
            //
            // 1. Human keyboard
            // 2. AI controls
            //
            // If either one is true, the key is
            // considered down.
            // ------------------------------------------

            isDown: function(key) {

                key = key.toUpperCase();

                return (
                    (this.humanEnabled && pressedKeys[key]) ||
                    aiKeys[key]
                );

            },


            // ------------------------------------------
            // AI presses/releases a key.
            //
            // Example:
            //
            // input.setAI('RIGHT', true);
            //
            // means:
            // "AI is pressing RIGHT."
            // ------------------------------------------

            setAI: function(key, status) {

                key = key.toUpperCase();

                aiKeys[key] = status;

            },


            // ------------------------------------------
            // Clear all AI controls.
            // ------------------------------------------

            resetAI: function() {

                aiKeys = {};

            },


            // ------------------------------------------
            // Reset everything.
            //
            // Called by Player.die(). Clears the shared
            // human keys too, matching the original
            // single-player behavior.
            // ------------------------------------------

            reset: function() {

                pressedKeys['RUN'] = false;
                pressedKeys['LEFT'] = false;
                pressedKeys['RIGHT'] = false;
                pressedKeys['DOWN'] = false;
                pressedKeys['JUMP'] = false;

                aiKeys = {};

            }

        };
    }


    // --------------------------------------------------
    // Public factory, used by MarioEnvironment.
    // --------------------------------------------------

    var scope =
        (typeof window !== 'undefined') ? window : globalThis;

    scope.MarioInput = {
        create: createInput
    };


    // --------------------------------------------------
    // Default global input object.
    //
    // Keyboard-enabled, so any code that still refers to
    // the bare `input` global behaves exactly as it did
    // in the original single-player game.
    // --------------------------------------------------

    scope.input = createInput(true);

})();

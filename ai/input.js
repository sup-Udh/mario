(function() {

    // --------------------------------------------------
    // Human keyboard controls
    // --------------------------------------------------

    var pressedKeys = {};


    // --------------------------------------------------
    // AI controls
    //
    // The neural network/controller will use this.
    // --------------------------------------------------

    var aiKeys = {};


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


    // --------------------------------------------------
    // Keyboard pressed
    // --------------------------------------------------

    document.addEventListener('keydown', function(e) {

        setKey(e, true);

    });


    // --------------------------------------------------
    // Keyboard released
    // --------------------------------------------------

    document.addEventListener('keyup', function(e) {

        setKey(e, false);

    });


    // --------------------------------------------------
    // Clear keyboard controls when the window
    // loses focus.
    // --------------------------------------------------

    window.addEventListener('blur', function() {

        pressedKeys = {};

    });


    // --------------------------------------------------
    // Public input object
    // --------------------------------------------------

    window.input = {


        // --------------------------------------------------
        // Check whether a key is currently pressed.
        //
        // It checks BOTH:
        //
        // 1. Human keyboard
        // 2. AI controls
        //
        // If either one is true, the key is considered down.
        // --------------------------------------------------

        isDown: function(key) {

            key = key.toUpperCase();

            return (
                pressedKeys[key] ||
                aiKeys[key]
            );

        },


        // --------------------------------------------------
        // AI presses/releases a key.
        //
        // Example:
        //
        // input.setAI('RIGHT', true);
        //
        // means:
        // "AI is pressing RIGHT."
        // --------------------------------------------------

        setAI: function(key, status) {

            key = key.toUpperCase();

            aiKeys[key] = status;

        },


        // --------------------------------------------------
        // Clear all AI controls.
        // --------------------------------------------------

        resetAI: function() {

            aiKeys = {};

        },


        // --------------------------------------------------
        // Reset everything.
        // --------------------------------------------------

        reset: function() {

            pressedKeys['RUN'] = false;
            pressedKeys['LEFT'] = false;
            pressedKeys['RIGHT'] = false;
            pressedKeys['DOWN'] = false;
            pressedKeys['JUMP'] = false;

            aiKeys = {};

        }

    };

})();
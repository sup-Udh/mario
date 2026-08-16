var requestAnimFrame = (function(){
  return window.requestAnimationFrame       ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame    ||
    window.oRequestAnimationFrame      ||
    window.msRequestAnimationFrame     ||
    function(callback){
      window.setTimeout(callback, 1000 / 60);
    };
})();

var updateables = [];
var fireballs = [];
var player = new Mario.Player([0,0]);

// --------------------------------------------------
// Rendering surfaces
//
// One canvas per environment, laid out in a grid, so
// every Mario is visible at once.
//
// `canvas` and `ctx` are the ACTIVE environment's
// surfaces - MarioEnvironment swaps them in for the
// duration of each render, exactly like the rest of the
// world state. They are null until then.
// --------------------------------------------------

var VIEW_WIDTH = 256;
var VIEW_HEIGHT = 240;

var canvas = null;
var ctx = null;

var dashboard = document.createElement("div");
dashboard.id = "training-dashboard";
document.body.appendChild(dashboard);

// The readout's innerHTML is rebuilt as the numbers
// change, so it gets its own element - the chart canvas
// below must NOT live inside anything that is rewritten,
// or it would be destroyed and recreated every frame.
var dashReadout = document.createElement("div");
dashReadout.id = "dash-readout";
dashboard.appendChild(dashReadout);

// --------------------------------------------------
// Learning curve
//
// AITrainer computes a best/avg/record triple every
// generation and then overwrites it. Buffered in
// AITrainer.history and drawn here, that same data is
// the clearest evidence on screen that the population
// is actually improving rather than just moving.
// --------------------------------------------------

var chartWrap = document.createElement("div");
chartWrap.id = "fitness-chart-wrap";

var chartCanvas = document.createElement("canvas");
chartCanvas.id = "fitness-chart";

var chartLegend = document.createElement("div");
chartLegend.id = "fitness-legend";
chartLegend.innerHTML =
  '<span class="k-record">record</span>' +
  '<span class="k-best">gen best</span>' +
  '<span class="k-avg">gen avg</span>';

chartWrap.appendChild(chartCanvas);
chartWrap.appendChild(chartLegend);
dashboard.appendChild(chartWrap);

var chartCtx = chartCanvas.getContext('2d');

// Redraw only when there is something new to show.
var lastChartLength = -1;

// --------------------------------------------------
// Showcase: the champion's own screen.
// --------------------------------------------------

var showcasePanel = document.createElement("div");
showcasePanel.id = "showcase";

var showcaseBar = document.createElement("div");
showcaseBar.id = "showcase-bar";

var showcaseTitle = document.createElement("span");
showcaseTitle.id = "showcase-title";

var fullscreenButton = document.createElement("button");
fullscreenButton.id = "showcase-fullscreen";
fullscreenButton.textContent = "Fullscreen";

fullscreenButton.addEventListener("click", function() {

  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }

  if (showcasePanel.requestFullscreen) {
    showcasePanel.requestFullscreen();
  } else if (showcasePanel.webkitRequestFullscreen) {
    showcasePanel.webkitRequestFullscreen();
  }
});

showcaseBar.appendChild(showcaseTitle);
showcaseBar.appendChild(fullscreenButton);
showcasePanel.appendChild(showcaseBar);
document.body.appendChild(showcasePanel);

function createShowcaseSurface() {

  var stage = document.createElement("div");
  stage.id = "showcase-stage";

  var surface = document.createElement("canvas");
  surface.width = VIEW_WIDTH;
  surface.height = VIEW_HEIGHT;
  surface.className = "showcase-canvas";

  showcaseHud = document.createElement("div");
  showcaseHud.className = "env-hud showcase-hud";

  stage.appendChild(surface);
  stage.appendChild(showcaseHud);
  showcasePanel.appendChild(stage);

  return {
    canvas: surface,
    ctx: surface.getContext('2d')
  };
}

var envGrid = document.createElement("div");
envGrid.id = "env-grid";
document.body.appendChild(envGrid);

// Per-viewport HUD elements.
//
// These are DOM overlays, NOT canvas text. The canvas is
// only 256x240 and gets CSS-upscaled (3x in the grid,
// much more in fullscreen) with image-rendering:pixelated,
// so anything drawn into it at 6-8px comes out unreadable.
// DOM text is rendered at native device resolution and
// stays sharp at any zoom.
var envHuds = [];
var showcaseHud = null;

function createEnvSurface(id) {

  var cell = document.createElement("div");
  cell.className = "env-cell";

  var surface = document.createElement("canvas");
  surface.width = VIEW_WIDTH;
  surface.height = VIEW_HEIGHT;
  surface.className = "env-canvas";

  var hud = document.createElement("div");
  hud.className = "env-hud";

  cell.appendChild(surface);
  cell.appendChild(hud);
  envGrid.appendChild(cell);

  envHuds.push(hud);

  return {
    canvas: surface,
    ctx: surface.getContext('2d')
  };
}

//viewport
var vX = 0,
    vY = 0,
    vWidth = 256,
    vHeight = 240;

//load our images
resources.load([
  'sprites/player.png',
  'sprites/enemy.png',
  'sprites/tiles.png',
  'sprites/playerl.png',
  'sprites/items.png',
  'sprites/enemyr.png',
]);

resources.onReady(init);
var level;
var sounds;
var music;

// --------------------------------------------------
// Audio
//
// Two problems are solved here.
//
// 1. Browsers reject play() until the user has
//    interacted with the page, which surfaces as an
//    unhandled NotAllowedError rejection. Audio must
//    never be able to interrupt the training loop.
//
// 2. Every clip is a SHARED Audio object played from
//    inside entity code (`sounds.stomp.play()`,
//    `music.overworld.pause()`). Entity code always runs
//    inside some environment's activation window, so
//    without scoping, eleven worlds fire the same twelve
//    clips at once - and at 10x turbo that is not a
//    soundtrack, it is a fault condition.
//
// So audio is scoped to whichever environment is
// currently active, and only the showcase (which always
// runs in real time) and a human-played environment are
// allowed to be heard.
// --------------------------------------------------

var AUDIO = {

  // Master switch. Safe to leave on now that sound is
  // scoped to one environment.
  enabled: true,

  // Let the training grid make noise too. Off for a
  // reason; flip it once to hear why.
  allowTraining: false
};


function audioAllowed() {

  if (!AUDIO.enabled) {
    return false;
  }

  if (AUDIO.allowTraining) {
    return true;
  }

  var active = MarioEnvironment.active;

  // Outside any environment tick nobody owns the sound.
  if (!active) {
    return false;
  }

  // The champion's screen is the one viewport running at
  // true speed, so it is the only one worth hearing.
  if (AITrainer.showcase && active === AITrainer.showcase) {
    return true;
  }

  // A human at the keyboard should hear their own game.
  return !!active.manual;
}


// Writes to currentTime have to be intercepted as well,
// not just play/pause: js/player.js zeroes
// music.overworld on death, and training Marios die
// several times a second, which would drag the
// showcase's music back to the start over and over.
var mediaCurrentTime =
  (typeof HTMLMediaElement !== 'undefined') ?
    Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype, 'currentTime') :
    null;


function makeAudioSafe(bank) {

  Object.keys(bank).forEach(function(name) {

    var clip = bank[name];

    var originalPlay = clip.play.bind(clip);
    var originalPause = clip.pause.bind(clip);

    clip.play = function() {

      if (!audioAllowed()) {
        return;
      }

      try {

        var promise = originalPlay();

        if (promise && promise.catch) {
          promise.catch(function() {});
        }

        return promise;

      } catch (e) {
        // Never let audio break the training loop.
      }
    };

    clip.pause = function() {

      if (!audioAllowed()) {
        return;
      }

      try {
        return originalPause();
      } catch (e) {
        // As above.
      }
    };

    if (mediaCurrentTime && mediaCurrentTime.set) {

      Object.defineProperty(clip, 'currentTime', {

        configurable: true,

        get: function() {
          return mediaCurrentTime.get.call(this);
        },

        set: function(value) {
          if (audioAllowed()) {
            mediaCurrentTime.set.call(this, value);
          }
        }
      });
    }
  });
}


// --------------------------------------------------
// Environments
//
// Ten independent Mario worlds, driven by the trainer.
// --------------------------------------------------

var ENVIRONMENT_COUNT = 10;

var environments = [];


//initialize
var lastTime;
function init() {
  music = {
    overworld: new Audio('sounds/aboveground_bgm.ogg'),
    underground: new Audio('sounds/underground_bgm.ogg'),
    clear: new Audio('sounds/stage_clear.wav'),
    death: new Audio('sounds/mariodie.wav')
  };



  sounds = {
    smallJump: new Audio('sounds/jump-small.wav'),
    bigJump: new Audio('sounds/jump-super.wav'),
    breakBlock: new Audio('sounds/breakblock.wav'),
    bump: new Audio('sounds/bump.wav'),
    coin: new Audio('sounds/coin.wav'),
    fireball: new Audio('sounds/fireball.wav'),
    flagpole: new Audio('sounds/flagpole.wav'),
    kick: new Audio('sounds/kick.wav'),
    pipe: new Audio('sounds/pipe.wav'),
    itemAppear: new Audio('sounds/itemAppear.wav'),
    powerup: new Audio('sounds/powerup.wav'),
    stomp: new Audio('sounds/stomp.wav')
  };

  makeAudioSafe(music);
  makeAudioSafe(sounds);

  buildEnvironments();

  lastTime = Date.now();
  main();
}


function buildEnvironments() {

  var surfaces = [];

  for (var i = 0; i < ENVIRONMENT_COUNT; i++) {
    surfaces.push(createEnvSurface(i + 1));
  }

  AITrainer.environmentCount = ENVIRONMENT_COUNT;

  AITrainer.init(surfaces);

  AITrainer.initShowcase(createShowcaseSurface());

  environments = AITrainer.environments;
}

// --------------------------------------------------
// Training speed control
//
// Normally the loop is paced by real wall-clock time
// (dt from Date.now()), so an AI episode takes as long
// as it would for a human. Turbo mode instead runs
// several fixed-dt simulation steps per animation
// frame - physics stay identical (each step is still a
// normal 1/60s tick), it just doesn't wait on the
// display's real refresh rate to advance them.
//
// Tweak from the console any time:
//   TRAINING.turbo = false        // watch it play live
//   TRAINING.stepsPerFrame = 30   // go even faster
// --------------------------------------------------

var TRAINING = {

    turbo: true,

    stepsPerFrame: 10,

    fixedDt: 1 / 60

};

console.log(
    "Training mode:",
    TRAINING.turbo ? "TURBO (" + TRAINING.stepsPerFrame + "x)" : "real-time"
);


// --------------------------------------------------
// On-page training panel - a visible toggle so you can
// flip between real-time playback and turbo/fast-forward
// (plus adjust turbo speed) without touching devtools.
// --------------------------------------------------

// --------------------------------------------------
// Manual play
//
// Turbo is forced off while playing - a human cannot
// react to ten simulation steps per frame.
// --------------------------------------------------

var MANUAL_ENV = null;

function setManualPlay(on) {

    if (!environments.length) {
        return;
    }

    if (MANUAL_ENV) {
        MANUAL_ENV.setManual(false);
        MANUAL_ENV = null;
    }

    // Audio follows the active environment now (see
    // audioAllowed), so handing env 1 to the keyboard is
    // enough - it starts being heard automatically.
    if (on) {
        MANUAL_ENV = environments[0];
        MANUAL_ENV.setManual(true);
        TRAINING.turbo = false;
    }
}


function createTrainingPanel() {

    var panel = document.createElement("div");
    panel.id = "training-panel";

    var toggleButton = document.createElement("button");
    toggleButton.id = "turbo-toggle";

    var speedInput = document.createElement("input");
    speedInput.type = "range";
    speedInput.min = "1";
    speedInput.max = "60";
    speedInput.value = TRAINING.stepsPerFrame;
    speedInput.id = "turbo-speed";

    var speedValue = document.createElement("span");
    speedValue.id = "turbo-speed-value";

    // Hand environment 1 to the keyboard, so the original
    // single-player game is still playable.
    var manualButton = document.createElement("button");
    manualButton.id = "manual-toggle";

    var sensorButton = document.createElement("button");
    sensorButton.id = "sensor-toggle";

    function refresh() {

        toggleButton.textContent =
            TRAINING.turbo ?
                "Turbo ON  (click for real-time)" :
                "Real-time  (click for turbo)";

        speedInput.disabled = !TRAINING.turbo;

        speedValue.textContent = TRAINING.stepsPerFrame + "x";

        manualButton.textContent =
            MANUAL_ENV ?
                "Playing ENV 1  (click for AI)" :
                "AI training  (click to play ENV 1)";

        sensorButton.textContent =
            MarioSensors.debugDraw ?
                "Sensors ON  (debug)" :
                "Sensors OFF  (presentation)";
    }

    toggleButton.addEventListener("click", function() {
        TRAINING.turbo = !TRAINING.turbo;
        refresh();
    });

    speedInput.addEventListener("input", function() {
        TRAINING.stepsPerFrame = parseInt(speedInput.value, 10);
        refresh();
    });

    manualButton.addEventListener("click", function() {
        setManualPlay(!MANUAL_ENV);
        refresh();
    });

    sensorButton.addEventListener("click", function() {
        MarioSensors.debugDraw = !MarioSensors.debugDraw;
        refresh();
    });

    panel.appendChild(toggleButton);
    panel.appendChild(speedInput);
    panel.appendChild(speedValue);
    panel.appendChild(manualButton);
    panel.appendChild(sensorButton);

    document.body.appendChild(panel);

    refresh();
}

createTrainingPanel();


var gameTime = 0;

// --------------------------------------------------
// Fixed-timestep accumulators
//
// Mario's physics takes NO dt - js/player.js does
// `pos += vel` and `vel += acc` with per-frame constants
// (gravity 0.25, jump impulse -6). So one update() call
// IS one frame of motion, and simulation speed is set
// purely by how many times update() is called.
//
// Two consequences drive this design:
//
//   1. Feeding wall-clock dt does nothing to the motion,
//      so pacing has to come from the CALL COUNT.
//   2. Calling update() once per animation frame ties
//      Mario's speed to the display: he would run 2.4x
//      too fast on a 144Hz monitor and half speed on a
//      30Hz one.
//
// An accumulator fixes both: bank real elapsed time and
// spend it in whole 1/60 steps.
// --------------------------------------------------

var FIXED_DT = 1 / 60;

// Anti "spiral of death": after a stall (tab switch,
// breakpoint) never try to replay the whole backlog.
var MAX_CATCHUP_STEPS = 5;

var playAccumulator = 0;
var showcaseAccumulator = 0;


// --------------------------------------------------
// Frame timing instrumentation
//
// Rolling one-second window, drawn into the dashboard
// rather than logged - console output inside a 60Hz
// loop is itself a performance problem.
// --------------------------------------------------

var PERF = {

  enabled: true,

  frames: 0,
  windowStart: 0,

  dtSum: 0,
  dtMin: Infinity,
  dtMax: 0,

  updateMs: 0,
  renderMs: 0,

  // Published once per second.
  fps: 0,
  avgDt: 0,
  minDt: 0,
  maxDt: 0,
  avgUpdateMs: 0,
  avgRenderMs: 0,
  simStepsPerSec: 0,

  steps: 0
};

function perfNow() {
  return (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now();
}

function perfSample(frameTime, steps, updateMs, renderMs) {

  if (!PERF.enabled) return;

  var now = perfNow();
  if (!PERF.windowStart) PERF.windowStart = now;

  PERF.frames++;
  PERF.steps += steps;
  PERF.dtSum += frameTime;
  PERF.updateMs += updateMs;
  PERF.renderMs += renderMs;

  if (frameTime < PERF.dtMin) PERF.dtMin = frameTime;
  if (frameTime > PERF.dtMax) PERF.dtMax = frameTime;

  var elapsed = now - PERF.windowStart;

  if (elapsed >= 1000) {

    PERF.fps = PERF.frames / (elapsed / 1000);
    PERF.avgDt = PERF.dtSum / PERF.frames;
    PERF.minDt = PERF.dtMin;
    PERF.maxDt = PERF.dtMax;
    PERF.avgUpdateMs = PERF.updateMs / PERF.frames;
    PERF.avgRenderMs = PERF.renderMs / PERF.frames;
    PERF.simStepsPerSec = PERF.steps / (elapsed / 1000);

    PERF.frames = 0;
    PERF.steps = 0;
    PERF.dtSum = 0;
    PERF.dtMin = Infinity;
    PERF.dtMax = 0;
    PERF.updateMs = 0;
    PERF.renderMs = 0;
    PERF.windowStart = now;
  }
}


//set up the game loop
function main() {

  var now = Date.now();
  var frameTime = (now - lastTime) / 1000.0;
  lastTime = now;

  // A tab switch can hand us many seconds at once.
  if (!isFinite(frameTime) || frameTime < 0) frameTime = 0;
  if (frameTime > 0.25) frameTime = 0.25;


  var updateStart = perfNow();
  var stepsThisFrame = 0;

  if (TRAINING.turbo) {

    // Fast-forward: a fixed number of simulation steps
    // per frame, deliberately decoupled from the clock.
    // This is a training monitor, not a gameplay view -
    // at 10x Mario advances ~22px between rendered
    // frames, which is a fast-forward, not a glitch.
    for (var i = 0; i < TRAINING.stepsPerFrame; i++) {
      update(FIXED_DT);
      stepsThisFrame++;
    }

    playAccumulator = 0;

  } else {

    // Real-time: spend banked time in whole 1/60 steps,
    // so Mario moves at true original-game speed on any
    // refresh rate.
    playAccumulator += frameTime;

    var steps = 0;

    while (
      playAccumulator >= FIXED_DT &&
      steps < MAX_CATCHUP_STEPS
    ) {
      update(FIXED_DT);
      playAccumulator -= FIXED_DT;
      steps++;
      stepsThisFrame++;
    }

    if (steps >= MAX_CATCHUP_STEPS) {
      playAccumulator = 0;
    }
  }


  // The showcase is ALWAYS real time, whatever the
  // trainer is doing - training can rip ahead at 10x in
  // the background while the champion's screen plays at
  // exactly 60 simulation steps per real second.
  showcaseAccumulator += frameTime;

  var showSteps = 0;

  while (
    showcaseAccumulator >= FIXED_DT &&
    showSteps < MAX_CATCHUP_STEPS
  ) {
    AITrainer.updateShowcase(FIXED_DT);
    showcaseAccumulator -= FIXED_DT;
    showSteps++;
  }

  if (showSteps >= MAX_CATCHUP_STEPS) {
    showcaseAccumulator = 0;
  }

  var updateMs = perfNow() - updateStart;


  var renderStart = perfNow();

  render();

  var renderMs = perfNow() - renderStart;

  perfSample(frameTime, stepsThisFrame, updateMs, renderMs);

  requestAnimFrame(main);
}

// Each environment advances its own world. The per-tick
// pipeline (handleInput / updateEntities / checkCollisions)
// now runs inside MarioEnvironment.update(), which installs
// that environment's globals first.
function update(dt) {

    AITrainer.update(dt);
}

function handleInput(dt) {
  if (player.piping || player.dying || player.noInput) return; //don't accept input

  if (input.isDown('RUN')){
    player.run();
  } else {
    player.noRun();
  }
  if (input.isDown('JUMP')) {
    player.jump();
  } else {
    //we need this to handle the timing for how long you hold it
    player.noJump();
  }

  if (input.isDown('DOWN')) {
    player.crouch();
  } else {
    player.noCrouch();
  }

  if (input.isDown('LEFT')) { // 'd' or left arrow
    player.moveLeft();
  }
  else if (input.isDown('RIGHT')) { // 'k' or right arrow
    player.moveRight();
  } else {
    player.noWalk();
  }
}

//update all the moving stuff
function updateEntities(dt, gameTime) {
  player.update(dt, vX);
  updateables.forEach (function(ent) {
    ent.update(dt, gameTime);
  });

  //This should stop the jump when he switches sides on the flag.
  if (player.exiting) {
    if (player.pos[0] > vX + 96)
      vX = player.pos[0] - 96
  }else if (level.scrolling && player.pos[0] > vX + 80) {
    vX = player.pos[0] - 80;
  }

  if (player.powering.length !== 0 || player.dying) { return; }
  level.items.forEach (function(ent) {
    ent.update(dt);
  });

  level.enemies.forEach (function(ent) {
    ent.update(dt, vX);
  });

  fireballs.forEach(function(fireball) {
    fireball.update(dt);
  });
  level.pipes.forEach (function(pipe) {
    pipe.update(dt);
  });
}

//scan for collisions
function checkCollisions() {
  if (player.powering.length !== 0 || player.dying) { return; }
  player.checkCollisions();

  //Apparently for each will just skip indices where things were deleted.
  level.items.forEach(function(item) {
    item.checkCollisions();
  });
  level.enemies.forEach (function(ent) {
    ent.checkCollisions();
  });
  fireballs.forEach(function(fireball){
    fireball.checkCollisions();
  });
  level.pipes.forEach (function(pipe) {
    pipe.checkCollisions();
  });
}

// Draw every environment, each to its own canvas.
function render() {

  for (var i = 0; i < environments.length; i++) {
    environments[i].render();
    updateEnvHud(envHuds[i], environments[i], false);
  }

  if (AITrainer.showcase) {

    AITrainer.showcase.render();

    updateEnvHud(showcaseHud, AITrainer.showcase, true);

    showcaseTitle.textContent =
      "BEST RUN  —  record " + Math.floor(AITrainer.showcaseFitness) +
      "  from gen " + AITrainer.showcaseGeneration +
      "  —  now at " + Math.floor(AITrainer.showcase.result.maxX);
  }

  renderDashboard();
}


// --------------------------------------------------
// Per-viewport HUD
//
// Written into a DOM overlay rather than the canvas, so
// it stays sharp however far the canvas is upscaled -
// including fullscreen, where the 256px-wide canvas is
// blown up to the whole display.
// --------------------------------------------------

function updateEnvHud(hud, env, isShowcase) {

  if (!hud || !env) {
    return;
  }

  var currentX = env.player && env.player.pos ? env.player.pos[0] : 0;

  var label = isShowcase ?
    'BEST' :
    'ENV ' + env.id;

  var text =
    label +
    '   GEN ' + (env.generation || 1) + '\n' +
    'X ' + Math.floor(currentX) +
    '   BEST ' + Math.floor(env.result.maxX) + '\n' +
    'FIT ' + Math.floor(env.result.fitness) +
    '   ' + env.status;

  // Sensor readout rides along in the same crisp overlay,
  // so the numbers stay legible however far the canvas is
  // upscaled. The rays themselves stay on the canvas -
  // they are world-space geometry and belong there.
  if (MarioSensors.debugDraw) {

    var readout = MarioSensors.readoutLines(env);

    if (readout) {
      text += '\n\n' + readout.join('\n');
    }
  }

  // textContent, not innerHTML: this runs every frame for
  // eleven viewports and must stay cheap.
  if (hud.__text !== text) {
    hud.textContent = text;
    hud.__text = text;
  }

  var cls = 'env-hud' +
    (isShowcase ? ' showcase-hud' : '') +
    ' ' + env.status.toLowerCase();

  if (hud.className !== cls) {
    hud.className = cls;
  }
}


// --------------------------------------------------
// Training dashboard (PART 26)
// --------------------------------------------------

// --------------------------------------------------
// Fitness vs generation
//
// Three series, all in fitness units:
//
//   record   all-time best  (monotonic staircase)
//   best     best of that generation
//   avg      population mean - the one that shows
//            whether the WHOLE population is learning
//            or just one lucky lineage
// --------------------------------------------------

function renderFitnessChart() {

  var history = AITrainer.history;

  if (!history) {
    return;
  }


  // Match the backing store to the CSS box, at device
  // resolution - a canvas scaled by CSS alone renders
  // blurry on any HiDPI display.
  var dpr = window.devicePixelRatio || 1;

  var cssWidth = chartCanvas.clientWidth || 560;
  var cssHeight = chartCanvas.clientHeight || 110;

  var needW = Math.round(cssWidth * dpr);
  var needH = Math.round(cssHeight * dpr);

  var resized =
    (chartCanvas.width !== needW || chartCanvas.height !== needH);

  if (resized) {
    chartCanvas.width = needW;
    chartCanvas.height = needH;
  }

  // Nothing new to draw, and the box hasn't moved.
  if (!resized && history.length === lastChartLength) {
    return;
  }

  lastChartLength = history.length;


  var g = chartCtx;

  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cssWidth, cssHeight);


  var padL = 34;
  var padR = 6;
  var padT = 8;
  var padB = 14;

  var plotW = cssWidth - padL - padR;
  var plotH = cssHeight - padT - padB;

  if (plotW <= 0 || plotH <= 0) {
    return;
  }


  // The record is monotonic, so the last sample is the
  // maximum of every series. Headroom keeps the newest
  // point off the ceiling.
  var yMax = 1;

  if (history.length) {
    yMax = Math.max(1, history[history.length - 1].record * 1.1);
  }


  function px(i) {
    if (history.length <= 1) {
      return padL;
    }
    return padL + (i / (history.length - 1)) * plotW;
  }

  function py(value) {
    var v = (typeof value === 'number' && isFinite(value)) ? value : 0;
    return padT + plotH - Math.min(1, v / yMax) * plotH;
  }


  // ------------------------------------------
  // Gridlines + y labels
  // ------------------------------------------

  g.font = '9px monospace';
  g.textBaseline = 'middle';

  for (var t = 0; t <= 2; t++) {

    var value = yMax * (t / 2);
    var y = py(value);

    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(padL, Math.round(y) + 0.5);
    g.lineTo(padL + plotW, Math.round(y) + 0.5);
    g.stroke();

    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.textAlign = 'right';
    g.fillText(String(Math.round(value)), padL - 5, y);
  }


  if (!history.length) {

    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.textAlign = 'center';
    g.fillText(
      'waiting for generation 1...',
      padL + plotW / 2,
      padT + plotH / 2
    );

    return;
  }


  // ------------------------------------------
  // Series
  // ------------------------------------------

  function line(key, color, width) {

    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();

    for (var i = 0; i < history.length; i++) {

      var x = px(i);
      var y = py(history[i][key]);

      if (i === 0) {
        g.moveTo(x, y);
      } else {
        g.lineTo(x, y);
      }
    }

    g.stroke();
  }

  line('avg', '#ea4', 1);
  line('best', '#4c8', 1);
  line('record', '#7cf', 2);


  // Mark the newest record so the eye lands on it.
  var last = history[history.length - 1];

  g.fillStyle = '#7cf';
  g.beginPath();
  g.arc(px(history.length - 1), py(last.record), 2.5, 0, Math.PI * 2);
  g.fill();


  // ------------------------------------------
  // Generation range along the bottom
  // ------------------------------------------

  g.fillStyle = 'rgba(255,255,255,0.4)';
  g.textBaseline = 'bottom';

  g.textAlign = 'left';
  g.fillText('gen ' + history[0].gen, padL, cssHeight - 2);

  g.textAlign = 'right';
  g.fillText('gen ' + last.gen, padL + plotW, cssHeight - 2);
}


function renderDashboard() {

  if (!dashboard || typeof AITrainer === 'undefined') {
    return;
  }

  renderFitnessChart();

  var rows = environments.map(function(env) {

    return '<div class="env-stat ' + env.status.toLowerCase() + '">' +
      '<b>ENV ' + env.id + '</b>' +
      '<span>fit ' + Math.floor(env.result.fitness) + '</span>' +
      '<span>' + env.status + '</span>' +
      '</div>';

  }).join('');

  var perfRow =
    '<div class="dash-perf">' +
      '<span>FPS <b>' + PERF.fps.toFixed(1) + '</b></span>' +
      '<span>dt avg <b>' + (PERF.avgDt * 1000).toFixed(1) + 'ms</b></span>' +
      '<span>dt max <b>' + (PERF.maxDt * 1000).toFixed(1) + 'ms</b></span>' +
      '<span>update <b>' + PERF.avgUpdateMs.toFixed(2) + 'ms</b></span>' +
      '<span>render <b>' + PERF.avgRenderMs.toFixed(2) + 'ms</b></span>' +
      '<span>sim steps/s <b>' + PERF.simStepsPerSec.toFixed(0) + '</b></span>' +
      '<span>envs <b>' + environments.length + '</b></span>' +
    '</div>';

  var html =
    perfRow +
    '<div class="dash-main">' +
      '<span>MASTER GENERATION: <b>' + AITrainer.generation + '</b></span>' +
      '<span>ALL-TIME BEST: <b>' + Math.floor(AITrainer.bestFitnessEver) + '</b></span>' +
      '<span>LAST GEN BEST: <b>' + Math.floor(AITrainer.bestFitnessThisGen) + '</b></span>' +
      '<span>AVG FITNESS: <b>' + Math.floor(AITrainer.averageFitness) + '</b></span>' +
      '<span>ELITE ENV: <b>#' + AITrainer.bestEnvironmentId + '</b></span>' +
      '<span>MUTATION: <b>' + AITrainer.mutationAmount.toFixed(3) + '</b></span>' +
    '</div>' +
    '<div class="dash-envs">' + rows + '</div>';

  // Reparsing this markup 60 times a second for eleven
  // viewports is pure waste when nothing has changed -
  // same dirty-check the per-viewport HUDs use.
  if (dashReadout.__html !== html) {
    dashReadout.innerHTML = html;
    dashReadout.__html = html;
  }
}


// Draw ONE environment's world. The caller
// (MarioEnvironment.render) has already installed that
// environment's globals, so this is the original
// rendering code, unchanged.
function renderWorld() {
  updateables = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = level.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  //scenery gets drawn first to get layering right.
  for(var i = 0; i < 15; i++) {
    for (var j = Math.floor(vX / 16) - 1; j < Math.floor(vX / 16) + 20; j++){
      if (level.scenery[i][j]) {
        renderEntity(level.scenery[i][j]);
      }
    }
  }

  //then items
  level.items.forEach (function (item) {
    renderEntity(item);
  });

  level.enemies.forEach (function(enemy) {
    renderEntity(enemy);
  });



  fireballs.forEach(function(fireball) {
    renderEntity(fireball);
  })

  //then we draw every static object.
  for(var i = 0; i < 15; i++) {
    for (var j = Math.floor(vX / 16) - 1; j < Math.floor(vX / 16) + 20; j++){
      if (level.statics[i][j]) {
        renderEntity(level.statics[i][j]);
      }
      if (level.blocks[i][j]) {
        renderEntity(level.blocks[i][j]);
        updateables.push(level.blocks[i][j]);
      }
    }
  }

  //then the player
  if (player.invincibility % 2 === 0) {
    renderEntity(player);
  }

  //Mario goes INTO pipes, so naturally they go after.
  level.pipes.forEach (function(pipe) {
    renderEntity(pipe);
  });

  MarioSensors.drawDebug(ctx, vX, vY, MarioEnvironment.active);

}



function renderEntity(entity) {
  entity.render(ctx, vX, vY);
}


// The per-viewport HUD used to be drawn into the canvas
// here. It now lives in a DOM overlay (see updateEnvHud)
// because canvas text at 8px is destroyed by the 3x-plus
// upscale the viewports get.

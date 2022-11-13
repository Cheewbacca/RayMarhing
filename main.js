"use strict";

/**
 * @typedef {object} ChangeEvent - Change event that fired by change events listener
 * @typedef {object} HTMLElement - DOM element
 */

let mMouseIsDown = false;

/**
 * This function is used to calculate current mouse position by X coordinate inside canvas.
 * @param {number} clientX - X coordinate inside window
 * @param {number} left - X position of left side of canvas
 * @param {number} right - X position of right side of canvas
 * @param {number} canvasWidth - canvas width
 * @returns {number} X coordinate of mouse position inside canvas
 */
const calculateMouseX = (clientX, left, right, canvasWidth) =>
  Math.floor(((clientX - left) / (right - left)) * canvasWidth);

/**
 * This function is used to calculate current mouse position by Y coordinate inside canvas.
 * @param {number} canvasHeight - canvas height
 * @param {number} clientY - Y coordinate inside window
 * @param {number} top - Y position of top side of canvas
 * @param {number} bottom - Y position of bottom side of canvas
 * @returns {number} Y coordinate of mouse position inside canvas
 */
const calculateMouseY = (canvasHeight, clientY, top, bottom) =>
  Math.floor(canvasHeight - ((clientY - top) / (bottom - top)) * canvasHeight);

/**
 * @const {Array.<number>} - initial color in rgb format
 */
let color = [Math.random(), Math.random(), Math.random()];

/**
 * @const {number} - initial state for camera Y position
 */
let cameraHeight = 7;

/**
 * @const {Array.<number>} - initial state of light [x,z,y] position
 */
let lightPos = [0.7, 0.52, -0.45];

/**
 * @const {1|0} - if '1' that means animation is enabled
 */
let animation = 1;

/**
 * @const {number} - initial phase of animation
 */
let animationPhase = 15.0;

/**
 * This class is used to create shaders, initiate them, register all uniform variables and
 * start painting in the GPU.
 * @class
 */
class EffectPass {
  /**
   * Initiates inputs, sources and renderer for the scene.
   * @param {Object} renderer - webgl renderer exemplar
   * @param {Effect} effect - exemplar of class Effect
   * @constructor
   */
  constructor(renderer, effect) {
    this.mInputs = [null, null, null, null];
    this.mOutputs = [null, null, null, null];
    this.mSource = null;
    this.mProgram = null;
    this.mEffect = effect;
    this.mRenderer = renderer;
  }

  Create(code) {
    this.mType = "image";
    this.mSource = code;
    this.mHeader = HEADER;
  }

  NewShader_Image(shaderCode) {
    let fsSource = this.mHeader;

    fsSource += "\n\n" + shaderCode;

    return fsSource;
  }

  NewShader(preventCache, onResolve) {
    const vs_fs = this.NewShader_Image(this.mSource);

    this.mRenderer.CreateShader(
      "layout(location = 0) in vec2 pos; void main() { gl_Position = vec4(pos.xy,0.0,1.0); }",
      vs_fs,
      preventCache,
      false,
      (worked, info) => {
        if (worked === true) {
          if (this.mProgram !== null) {
            this.mRenderer.DestroyShader(this.mProgram);
          }

          this.mProgram = info;
        }
        onResolve();
      }
    );
  }

  Paint(time, mouseOriX, mouseOriY, mousePosX, mousePosY, xres, yres) {
    this.mRenderer.SetRenderTarget(null);

    let mouse = [mousePosX, mousePosY, mouseOriX, mouseOriY];

    let prog = this.mProgram;

    this.mRenderer.AttachShader(prog);
    this.mRenderer.SetShaderConstant1F("iTime", time);
    this.mRenderer.SetShaderConstant3F("iResolution", xres, yres, 1.0);
    this.mRenderer.SetShaderConstant4FV("iMouse", mouse);
    this.mRenderer.SetShaderConstant3FV("iColor", color);
    this.mRenderer.SetShaderConstant1F("iCameraPos", cameraHeight);
    this.mRenderer.SetShaderConstant3F("iLightPos", ...lightPos);
    this.mRenderer.SetShaderConstant1I("iAnimation", animation);
    this.mRenderer.SetShaderConstant1F("iAnimationPhase", animationPhase);

    let l1 = this.mRenderer.GetAttribLocation(this.mProgram, "pos");

    this.mRenderer.DrawFullScreenTriangle_XY(l1);
    this.mRenderer.DettachTextures();
  }
}

/**
 * This class is used like orchestrator of scene painting.
 * Gets canvas like argument, creates its context, webgl renderer exemplar and initialize webgl context.
 * Register animation frame of canvas rerender, loads vertex shader code into webgl context
 * Has methods:
 * RequestAnimationFrame - to register new animation frame of scene rerender
 * Paint - method that calls paint on canvas
 * NewShader - register new shader
 * Load - loads shader
 * Compile - method that will load shader and start painting
 * @class
 */
class Effect {
  /**
   * Gets canvas width and height, creates webgl context and renderer exemplar
   * @param {HTMLElement} canvas - HTML canvas element
   * @returns {void} returns nothing in case of bad initializing by webgl
   */
  constructor(canvas) {
    this.mGLContext = piCreateGlContext(canvas, false, false, true, false); // need preserve-buffer to true in order to capture screenshots
    this.mRenderer = piRenderer();
    this.mXres = canvas.width;
    this.mYres = canvas.height;
    this.mPasses = null;

    if (!this.mRenderer.Initialize(this.mGLContext)) {
      return;
    }
  }

  RequestAnimationFrame(id) {
    requestAnimFrame(id);
  }

  Paint(time, mouseOriX, mouseOriY, mousePosX, mousePosY) {
    let xres = this.mXres / 1;
    let yres = this.mYres / 1;

    this.mPasses.Paint(
      time,
      mouseOriX,
      mouseOriY,
      mousePosX,
      mousePosY,
      xres,
      yres
    );
  }

  NewShader(preventCache, onResolve) {
    this.mPasses.NewShader(preventCache, onResolve);
  }

  Load(code) {
    const wpass = new EffectPass(this.mRenderer, this);
    wpass.Create(code);
    this.mPasses = wpass;
  }

  Compile(onResolve) {
    new Promise((resolve) => {
      this.NewShader(true, resolve.bind(null, 1));
    }).then(onResolve.bind(null, false));
  }
}

/**
 * This class is used to initialize canvas, canvas properties and mouse position.
 * Classes constructor gets canvas inside the document, calculates canvas size, ads mouse events on canvas.
 * Canvas class has methods:
 * Load - to load and initialize shader
 * startRendering - method to start render of the scene.
 * @class
 */
class Canvas {
  /**
   * Constructor of class Canvas gets HTML parent element of canvas, calculates it properties.
   * Defines canvas mouse events.
   * @constructor
   * @param {HTMLElement} parentElement - HTML element, that contains canvas
   */
  constructor(parentElement) {
    this.parentElement = parentElement;

    this.mTOffset = 0;
    this.mFPS = piCreateFPSCounter();

    const canvas = document.getElementById("demogl");

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    this.mTo = getRealTime();
    this.mTf = 0;
    this.mFPS.Reset(this.mTo);
    this.mMouseOriX = 0;
    this.mMouseOriY = 0;
    this.mMousePosX = 0;
    this.mMousePosY = 0;

    const rect = canvas.getBoundingClientRect();

    canvas.onmousedown = (ev) => {
      this.mMouseOriX = calculateMouseX(
        ev.clientX,
        rect.left,
        rect.right,
        canvas.width
      );

      this.mMouseOriY = calculateMouseY(
        canvas.height,
        ev.clientY,
        rect.top,
        rect.bottom
      );

      this.mMousePosX = this.mMouseOriX;
      this.mMousePosY = this.mMouseOriY;
      mMouseIsDown = true;
    };

    canvas.onmousemove = (ev) => {
      if (mMouseIsDown) {
        this.mMousePosX = calculateMouseX(
          ev.clientX,
          rect.left,
          rect.right,
          canvas.width
        );
        this.mMouseOriY = calculateMouseY(
          canvas.height,
          ev.clientY,
          rect.top,
          rect.bottom
        );
      }
    };

    window.onkeydown = (e) => {
      if (e.keyCode === 37) {
        this.mMousePosX = this.mMouseOriX + 100;
      } else if (e.keyCode === 39) {
        this.mMousePosX = this.mMouseOriX - 100;
      }
    };

    canvas.onmouseup = () => {
      mMouseIsDown = false;
    };

    this.mEffect = new Effect(canvas, this);
  }

  /**
   * This method is used to start rendering the scene inside canvas, update fps and timer counters
   * Calls to paint function on each change of the scene
   * @private
   */
  startRendering() {
    const renderLoop2 = () => {
      this.mEffect.RequestAnimationFrame(renderLoop2);

      const time = getRealTime();

      const ltime = this.mTOffset + time - this.mTo;
      this.mTf = ltime;

      let mouseOriX = Math.abs(this.mMouseOriX);
      let mouseOriY = Math.abs(this.mMouseOriY);

      if (!mMouseIsDown) {
        mouseOriX = -mouseOriX;
      }

      this.mEffect.Paint(
        ltime / 1000.0,
        mouseOriX,
        mouseOriY,
        this.mMousePosX,
        this.mMousePosY,
        false
      );

      document.getElementById("myTime").textContent = (ltime / 1000.0).toFixed(
        2
      );

      const newFPS = this.mFPS.Count(time);

      if (newFPS) {
        document.getElementById("myFramerate").textContent =
          this.mFPS.GetFPS().toFixed(1) + " fps";
      }
    };

    renderLoop2();
  }

  /**
   * This method is used to load vertex shader code and call to startRendering function
   * after code will be compiled
   * @private
   * @param {string} code - vertex shader in string format
   */
  Load(code) {
    this.mEffect.Load(code);

    this.mEffect.Compile(() => {
      this.startRendering();
    });
  }
}

/**
 * Function that will be executed when the document is loaded to run scripts
 * of creation 3d scene.
 */
function watchInit() {
  const gShaderToy = new Canvas(document.getElementById("player"));
  gShaderToy.Load(CODE);
}

/**
 * Function to handle change of current color
 * @param {ChangeEvent} e - input event object
 */
const changeColor = (e) => {
  const { value } = e.target;
  const rgbColor = value.slice(1, value.length).convertToRGB();
  color = rgbColor.map((el) => el / 255);
};

/**
 * Function to handle change of camera position
 * @param {ChangeEvent} e - input event object
 */
const changeCameraPos = (e) => {
  const newHeightValue = cameraHeight + e.deltaY * 0.01;

  if (newHeightValue >= 20 || newHeightValue <= 2) {
    return;
  }

  cameraHeight = newHeightValue;
};

/**
 * Function to handle change of the light position
 * @param {ChangeEvent} e - input event object
 * @param {number} index - index of input from light inputs array
 */
const changeLightPos = (e, index) => {
  const newValue = lightPos;
  newValue[index] = +e.target.value;
  lightPos = newValue;
};

/**
 * Function to handle animation change checkbox event
 * @param {ChangeEvent} e - input event object
 */
const toggleAnimation = (e) => {
  animation = e.target.checked ? 1 : 0;
  document.querySelector("#animationBlock").classList.toggle("hide");
};

/**
 * Function to handle animation phase change
 * @param {ChangeEvent} e - input event object
 */
const changeAnimationPhase = (e) => {
  animationPhase = e.target.value;
  document.querySelector("#animationPhaseText").innerText = e.target.value;
};

/**
 * This function is used to add and handle all possible clients events
 * inside the program.
 */
function watchInputs() {
  // color
  const colorPicker = document.querySelector('input[name="colorPicker"]');
  colorPicker.addEventListener("change", changeColor);
  colorPicker.addEventListener("input", changeColor);

  // wheel event
  document.addEventListener("wheel", changeCameraPos);

  // light direction
  const lightPickerX = document.querySelector('input[name="lightPickerX"]');
  const lightPickerY = document.querySelector('input[name="lightPickerY"]');
  const lightPickerZ = document.querySelector('input[name="lightPickerZ"]');

  const lightPickers = [lightPickerX, lightPickerZ, lightPickerY];

  let changeLightDirection;

  lightPickers.map((picker, index) => {
    changeLightDirection = (e) => {
      changeLightPos(e, index);
    };

    picker.addEventListener("change", changeLightDirection);
    picker.addEventListener("input", changeLightDirection);
  });

  // animation
  const animationCheckbox = document.querySelector('input[name="animation"]');
  animationCheckbox.addEventListener("change", toggleAnimation);

  const animationPhasePicked = document.querySelector(
    'input[name="animationPhase"]'
  );

  document.querySelector("#animationPhaseText").innerText = animationPhase;

  animationPhasePicked.addEventListener("change", changeAnimationPhase);
  animationPhasePicked.addEventListener("input", changeAnimationPhase);
}

document.addEventListener("DOMContentLoaded", watchInputs);

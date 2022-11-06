"use strict";

let mMouseIsDown = false;
let lightX = 7.0;

const calculateMouseX = (clientX, left, right, canvasWidth) =>
  Math.floor(((clientX - left) / (right - left)) * canvasWidth);

const calculateMouseY = (canvasHeight, clientY, top, bottom) =>
  Math.floor(canvasHeight - ((clientY - top) / (bottom - top)) * canvasHeight);

const color = [Math.random(), Math.random(), Math.random()];

class EffectPass {
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

    let l1 = this.mRenderer.GetAttribLocation(this.mProgram, "pos");

    this.mRenderer.DrawFullScreenTriangle_XY(l1);
    this.mRenderer.DettachTextures();
  }
}

class Effect {
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

class Canvas {
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

  Load(code) {
    this.mEffect.Load(code);

    this.mEffect.Compile(() => {
      this.startRendering();
    });
  }
}

function watchInit() {
  const gShaderToy = new Canvas(document.getElementById("player"));
  gShaderToy.Load(CODE);
}

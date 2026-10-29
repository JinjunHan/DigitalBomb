const VS_LOGO = `
attribute vec4 a_Position;
attribute vec2 a_TexCoord;
varying vec2 v_TexCoord;
void main() {
    gl_Position = a_Position;  
    v_TexCoord = a_TexCoord;
}`;

const FS_LOGO = `
precision mediump float;
uniform sampler2D u_Sampler;
varying vec2 v_TexCoord;
void main() {
    gl_FragColor = texture2D(u_Sampler, v_TexCoord);
}`;

const VS_BG = `
attribute vec4 a_Position;
attribute vec2 a_TexCoord;
varying vec2 v_TexCoord;
void main() {
    gl_Position = a_Position;  
    v_TexCoord = a_TexCoord;
}`;

const FS_BG = `
precision mediump float;
uniform sampler2D u_Sampler;
uniform float u_flip;
varying vec2 v_TexCoord;
void main() {
    vec2 texCoord = v_TexCoord;
    if(u_flip > 0.5) {
        texCoord.y = 1.0 - texCoord.y;
    }
    gl_FragColor = texture2D(u_Sampler, texCoord);
}`;

const VS_PROGRESSBAR = `
precision mediump float;
attribute vec4 a_Position;
attribute float a_Progress;
varying float v_Progress;
void main() {
    gl_Position = a_Position;  
    v_Progress = a_Progress;
}`;

const FS_PROGRESSBAR = `
precision mediump float;
uniform float u_CurrentProgress;
varying float v_Progress;
uniform vec4 u_ProgressBarColor;
uniform vec4 u_ProgressBackground;
void main() {
    gl_FragColor = v_Progress <= u_CurrentProgress ? u_ProgressBarColor : u_ProgressBackground;
}`;

const options = {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'default',
    failIfMajorPerformanceCaveat: false,
};

let gl = null;
let image = null;
let slogan = null;
let bg = null;
let program = null;
let programBg = null;
let programProgress = null;
let rafHandle = null;
let logoTexture = null;
let sloganTexture = null;
let bgTexture = null;
let vertexBuffer = null;
let sloganVertexBuffer = null;
let bgVertexBuffer = null;
let vertexBufferProgress = null;
let progress = 0.0;
let progressBarColor = [139 / 255, 27 / 255, 48 / 255, 1];
let progressBackground = [228 / 255, 213 / 255, 204 / 255, 1];
let afterTick = null;
let backgroundFilp = 1.0; // set 0 to not flip
let displayRatio = 1;
let bgColor = [0.01568627450980392,0.03529411764705882,0.0392156862745098,0.00392156862745098];
let useCustomBg = false;
let useLogo = true;
let useDefaultLogo = false;
let logoName = 'logo.png';
let bgName = 'background.png';
let fitWidth = true;
let fitHeight = false;

function initShaders(vshader, fshader) {
    return createProgram(vshader, fshader);
}

function createProgram(vshader, fshader) {
    var vertexShader = loadShader(gl.VERTEX_SHADER, vshader);
    var fragmentShader = loadShader(gl.FRAGMENT_SHADER, fshader);
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked) {
        var error = gl.getProgramInfoLog(program);
        console.log('Failed to link program: ' + error);
        gl.deleteProgram(program);
        program = null;
    }
    gl.deleteShader(fragmentShader);
    gl.deleteShader(vertexShader);
    return program;
}

function loadShader(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    var compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!compiled) {
        var error = gl.getShaderInfoLog(shader);
        console.log('Failed to compile shader: ' + error);
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function initVertexBuffer() {
    const widthRatio = 2 / canvas.width;
    const heightRatio = 2 / canvas.height;
    const heightOffset = 0.225;
    const vertices = new Float32Array([
        widthRatio,heightRatio + heightOffset, 1.0, 1.0,
        widthRatio, heightRatio + heightOffset, 1.0, 0.0,
        -widthRatio, heightRatio + heightOffset, 0.0, 1.0,
        -widthRatio, heightRatio + heightOffset, 0.0, 0.0,
    ]);
    vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
}

function initSloganVertexBuffer() {
    const widthRatio = 2 / canvas.width;
    const heightRatio = 2 / canvas.height;
    const vertices = new Float32Array([
        widthRatio, heightRatio, 1.0, 1.0,
        widthRatio, heightRatio, 1.0, 0.0,
        -widthRatio, heightRatio, 0.0, 1.0,
        -widthRatio, heightRatio, 0.0, 0.0,
    ]);
    sloganVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sloganVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
}

function initBgVertexBuffer() {
    const vertices = new Float32Array([
        1.0, 1.0, 1.0, 1.0,
        1.0, 0.0, 1.0, 0.0,
        0.0, 1.0, 0.0, 1.0,
        0.0, 0.0, 0.0, 0.0,
    ]);
    bgVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bgVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
}

function initProgressVertexBuffer() {
    // the ratio value may be adjusted according to the image pixels
    const widthRatio = 0.46;
    const heightRatio = (window.devicePixelRatio >= 2 ? 6 : 3) / canvas.height * 1.35;
    const heightOffset = -0.56;
    const vertices = new Float32Array([
        widthRatio, heightOffset - heightRatio, 1,
        widthRatio, heightOffset + heightRatio, 1,
        -widthRatio, heightOffset - heightRatio, 0,
        -widthRatio, heightOffset + heightRatio, 0,
    ]);
    vertexBufferProgress = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBufferProgress);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
}

function updateVertexBuffer() {
    // The branded offscreen canvas has the same aspect ratio as the viewport.
    const vertices = new Float32Array([
        1, -1, 1, 1, 1, 1, 1, 0,
        -1, -1, 0, 1, -1, 1, 0, 0,
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
}

function updateSloganVertexBuffer() {
    // the ratio value may be adjusted according to the image pixels
    const widthRatio = slogan.width / canvas.width * 0.75;
    const heightRatio = slogan.height / canvas.height * 0.75;
    const logoHeightRatio = image.height / canvas.height * 1.35 * displayRatio;
    const heightOffset = (5/12 + logoHeightRatio * 1/2 + heightRatio * 3/2)  * (-2) + 1; // 5/12 is ui design layout for logo
    const vertices = new Float32Array([
        widthRatio, heightOffset - heightRatio, 1.0, 1.0,
        widthRatio, heightOffset + heightRatio, 1.0, 0.0,
        -widthRatio, heightOffset - heightRatio, 0.0, 1.0,
        -widthRatio, heightOffset + heightRatio, 0.0, 0.0,
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, sloganVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
}

function updateBgVertexBuffer() {
    let widthRatio = 1;
    let heightRatio = 1;
    if(fitWidth && !fitHeight) {
        widthRatio = canvas.width;
        heightRatio = (canvas.width / bg.width) * bg.height;
    } else if(!fitWidth && fitHeight) {
        widthRatio = (canvas.height / bg.height) * bg.width;
        heightRatio = canvas.height;
    } else if(fitWidth && fitHeight) {
        if ((bg.width / bg.height) > (canvas.width / canvas.height)) {
            widthRatio = canvas.width;
            heightRatio = (canvas.width / bg.width) * bg.height;
        } else {
            widthRatio = (canvas.height / bg.height) * bg.width;
            heightRatio = canvas.height;
        }
    } else if(!fitWidth && !fitHeight) {
        if ((bg.width / bg.height) > (canvas.width / canvas.height)) {
            widthRatio = (canvas.height / bg.height) * bg.width;
            heightRatio = canvas.height;
        } else {
            widthRatio = canvas.width;
            heightRatio = (canvas.width / bg.width) * bg.height;
        }
    } else {
        widthRatio = canvas.width;
        heightRatio = canvas.height;
    }
    widthRatio /= canvas.width;
    heightRatio /= canvas.height;

    const vertices = new Float32Array([
        widthRatio, heightRatio, 1.0, 1.0,
        widthRatio, -heightRatio, 1.0, 0.0,
        -widthRatio, heightRatio, 0.0, 1.0,
        -widthRatio, -heightRatio, 0.0, 0.0,
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, bgVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
}

function loadBackground(bgPath) {
    return new Promise((resolve, reject) => {
        bg = new Image();
        bg.premultiplyAlpha = false;
        bg.onload = function() {
            resolve(bg);
        };
        bg.onerror = function(err) {
            reject(err);
        };
        bg.src = bgPath.replace('#', '%23');
    });
}

function loadImage(imgPath) {
    return new Promise((resolve, reject) => {
        const icon = new Image();
        icon.onload = () => {
            // A second canvas is offscreen in WeChat; retain WebGL on the main canvas.
            const surface = wx.createCanvas();
            surface.width = 750;
            surface.height = Math.round(750 * canvas.height / canvas.width);
            const ctx = surface.getContext('2d');
            const w = surface.width, h = surface.height;
            ctx.fillStyle = '#F7F1E7'; ctx.fillRect(0, 0, w, h);
            const iconSize = 208, iconY = h * 0.32;
            ctx.save();
            ctx.shadowColor = 'rgba(92, 26, 38, 0.15)';
            ctx.shadowBlur = 28; ctx.shadowOffsetY = 12;
            ctx.fillStyle = '#8B1B30';
            ctx.fillRect((w - iconSize) / 2, iconY, iconSize, iconSize);
            ctx.restore();
            ctx.drawImage(icon, (w - iconSize) / 2, iconY, iconSize, iconSize);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#48272D'; ctx.font = 'bold 46px sans-serif';
            ctx.fillText('猜数字暗号', w / 2, iconY + iconSize + 66);
            ctx.fillStyle = '#8F7772'; ctx.font = '24px sans-serif';
            ctx.fillText('四位数字，藏着你的暗号', w / 2, iconY + iconSize + 121);
            ctx.fillStyle = '#8B1B30'; ctx.font = '24px sans-serif';
            ctx.fillText('正在准备牌桌…', w / 2, h * 0.78 - 38);
            ctx.fillStyle = '#A18D82'; ctx.font = '20px sans-serif';
            ctx.fillText('观察 · 推理 · 默契', w / 2, h * 0.78 + 43);
            image = surface;
            resolve(surface);
        };
        icon.onerror = reject;
        icon.src = imgPath.replace('#', '%23');
    });
}

function loadSlogan(sloganPath) {
    return new Promise((resolve, reject) => {
        slogan = new Image();
        slogan.premultiplyAlpha = false;
        slogan.onload = function() {
            resolve(slogan);
        };
        slogan.onerror = function(err) {
            reject(err);
        };
        slogan.src = sloganPath.replace('#', '%23');
    });
}


function initLogoTexture() {
    logoTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, logoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]));
}

function initSloganTexture() {
    sloganTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sloganTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]));
}

function initBgTexture() {
    bgTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bgTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]));
}

function updateLogoTexture() {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, logoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
}

function updateSloganTexture() {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sloganTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, slogan);
}

function updateBgTexture() {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bgTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bg);
}

function drawTexture(gl, program, texture, vertexBuffer, vertexFormatLength) {
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    var uSampler = gl.getUniformLocation(program, 'u_Sampler');
    gl.uniform1i(uSampler, 0);
    var uFlip = gl.getUniformLocation(program, 'u_flip');
    gl.uniform1f(uFlip, backgroundFilp);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    var aPosition = gl.getAttribLocation(program, 'a_Position');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, vertexFormatLength * 4, 0);
    var aTexCoord = gl.getAttribLocation(program, 'a_TexCoord');
    gl.enableVertexAttribArray(aTexCoord);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, vertexFormatLength * 4, vertexFormatLength * 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function drawProgressBar(gl, program, vertexBuffer, vertexFormatLength, progress, progressBarColor, progressBackground) {
    gl.useProgram(program);
    var uCurrentProgress = gl.getUniformLocation(program, 'u_CurrentProgress');
    gl.uniform1f(uCurrentProgress, progress);
    var uProgressBarColor = gl.getUniformLocation(program, 'u_ProgressBarColor');
    gl.uniform4fv(uProgressBarColor, progressBarColor);
    var uProgressBackground = gl.getUniformLocation(program, 'u_ProgressBackground');
    gl.uniform4fv(uProgressBackground, progressBackground);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    var aPosition = gl.getAttribLocation(program, 'a_Position');
    gl.enableVertexAttribArray(aPosition);
    var vertexFormatLength = 4;
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, vertexFormatLength * 3, 0);
    var aProgress = gl.getAttribLocation(program, 'a_Progress');
    gl.enableVertexAttribArray(aProgress);
    gl.vertexAttribPointer(aProgress, 1, gl.FLOAT, false, vertexFormatLength * 3, vertexFormatLength * 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function draw() {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(bgColor[0], bgColor[1], bgColor[2], bgColor[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // draw background
    useCustomBg && drawTexture(gl, programBg, bgTexture, bgVertexBuffer, 4);
    // draw logo
    useLogo && drawTexture(gl, program, logoTexture, vertexBuffer, 4);
    // draw slogan
    useLogo && useDefaultLogo && drawTexture(gl, program, sloganTexture, sloganVertexBuffer, 4);
    // draw progress bar
    drawProgressBar(gl, programProgress, vertexBufferProgress, 3, progress, progressBarColor, progressBackground);
}

function tick() {
    rafHandle = requestAnimationFrame(() => {
        draw();
        tick();
        if (afterTick) {
            afterTick();
            afterTick = null;
        }
    });
}

function end() {
    // The scene keeps this exact screen visible while authenticating. Transfer
    // only the offscreen canvas: the engine must own the main WebGL context.
    if (image && image.getContext) {
        const ctx = image.getContext('2d');
        const width = image.width * 0.46;
        const height = (window.devicePixelRatio >= 2 ? 6 : 3) * 1.35 * image.height / canvas.height;
        ctx.fillStyle = '#E4D5CC';
        ctx.fillRect((image.width - width) / 2, image.height * 0.78 - height / 2, width, height);
        ctx.fillStyle = '#8B1B30';
        ctx.fillRect((image.width - width) / 2, image.height * 0.78 - height / 2, width * 0.9, height);
        globalThis.__digitalBombStartupImage = image;
    }
    return setProgress(0.9).then(() => {
        cancelAnimationFrame(rafHandle);
        gl.useProgram(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        useLogo && gl.deleteTexture(logoTexture);
        useLogo && useDefaultLogo && gl.deleteTexture(sloganTexture);
        useCustomBg && gl.deleteTexture(bgTexture);
        gl.deleteBuffer(vertexBuffer);
        useCustomBg && gl.deleteBuffer(bgVertexBuffer);
        useLogo && useDefaultLogo && gl.deleteBuffer(sloganVertexBuffer);
        gl.deleteBuffer(vertexBufferProgress);
        gl.deleteProgram(program);
        gl.deleteProgram(programBg);
        gl.deleteProgram(programProgress);
    });
}

function setProgress(val) {
    progress = val;
    return new Promise((resolve, reject) => {
        afterTick = () => {
            resolve();
        };
    });
}

function start(alpha, antialias, useWebgl2) {
    options.alpha = alpha === 'true' ? true : false;
    options.antialias = antialias === 'false' ? false : true;
    if (useWebgl2 === 'true') {
        gl = window.canvas.getContext("webgl2", options);
    }
    // TODO: this is a hack method to detect whether WebGL2RenderingContext is supported
    if (gl) {
        window.WebGL2RenderingContext = true;
    } else {
        window.WebGL2RenderingContext = false;
        gl = window.canvas.getContext("webgl", options);
    }
    initVertexBuffer();
    useCustomBg && initBgVertexBuffer();
    useLogo && useDefaultLogo && initSloganVertexBuffer();
    initProgressVertexBuffer();

    initLogoTexture();
    useCustomBg && initBgTexture();
    useLogo && useDefaultLogo && initSloganTexture();

    if (useLogo) {
        program = initShaders(VS_LOGO, FS_LOGO);
    }
    if (useCustomBg) {
        programBg = initShaders(VS_BG, FS_BG);
    }
    programProgress = initShaders(VS_PROGRESSBAR, FS_PROGRESSBAR);
    tick();
    
    return Promise.all([
        //logo should be loaded earlier than slogan
        useLogo && loadImage(logoName).then(() => {
            updateVertexBuffer();
            updateLogoTexture();
        }).then(() => {
            return useLogo && useDefaultLogo && loadSlogan('slogan.png').then(() => {
                updateSloganVertexBuffer();
                updateSloganTexture();
            });
        }),
        useCustomBg && loadBackground(bgName).then(() => {
            updateBgVertexBuffer();
            updateBgTexture();
        })
    ]).then(() => {
        return setProgress(0);
    });
}
module.exports = { start, end, setProgress };

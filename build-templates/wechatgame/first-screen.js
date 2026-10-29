// Native WeChat startup renderer. Its offscreen canvas is handed to Cocos so
// engine loading and authentication share the same artwork and layout.
const DESIGN_WIDTH = 941, DESIGN_HEIGHT = 1672;
let gl, program, buffer, texture, frame, screen;
let progress = 0;
let pending = [];
let stopped = false;

function loadImage(path) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Startup asset failed: ' + path));
        image.src = path;
    });
}

function createScreen(background, fill) {
    const surface = wx.createCanvas();
    surface.width = 750;
    surface.height = Math.round(750 * canvas.height / canvas.width);
    const ctx = surface.getContext('2d');
    // Fill the viewport without stretching. Crop only the decorative outer edges.
    const scale = Math.max(surface.width / DESIGN_WIDTH, surface.height / DESIGN_HEIGHT);
    const x = (surface.width - DESIGN_WIDTH * scale) / 2;
    const y = (surface.height - DESIGN_HEIGHT * scale) / 2;
    return {
        surface,
        // Source coordinates are shared with the scene's retry hit target.
        retryRect: { x: x + 180 * scale, y: y + 1340 * scale, width: 581 * scale, height: 96 * scale },
        draw(value, status) {
            ctx.fillStyle = '#092C2A';
            ctx.fillRect(0, 0, surface.width, surface.height);
            ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
            if (background) ctx.drawImage(background, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
            else {
                ctx.fillStyle = '#F7E7C8'; ctx.textAlign = 'center'; ctx.font = 'bold 52px serif';
                ctx.fillText('猜数字暗号', DESIGN_WIDTH / 2, 450);
            }
            if (fill) {
                // Clip the original gold texture inside the ornate, baked frame.
                const left = 202, top = 1298, width = 537, height = 32, radius = 16;
                ctx.save(); ctx.beginPath();
                ctx.moveTo(left + radius, top); ctx.lineTo(left + width - radius, top);
                ctx.quadraticCurveTo(left + width, top, left + width, top + radius);
                ctx.quadraticCurveTo(left + width, top + height, left + width - radius, top + height);
                ctx.lineTo(left + radius, top + height);
                ctx.quadraticCurveTo(left, top + height, left, top + radius);
                ctx.quadraticCurveTo(left, top, left + radius, top); ctx.closePath(); ctx.clip();
                ctx.beginPath(); ctx.rect(left, top, width * Math.max(0, Math.min(1, value)), height); ctx.clip();
                ctx.drawImage(fill, left, top, width, height); ctx.restore();
            }
            ctx.fillStyle = '#F3D7A1'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = '28px serif'; ctx.fillText(status, DESIGN_WIDTH / 2, 1382);
            ctx.restore();
        }
    };
}

function shader(type, source) {
    const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
}
function draw() {
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(program, 'image'), 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
function tick() {
    frame = requestAnimationFrame(() => {
        if (stopped) return;
        draw();
        const callbacks = pending; pending = [];
        callbacks.forEach(resolve => resolve());
        if (!stopped) tick();
    });
}
function setProgress(value) {
    progress = Math.max(progress, Math.min(0.9, value));
    screen.draw(progress, '正在准备牌桌…');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, screen.surface);
    return new Promise(resolve => pending.push(resolve));
}
async function start(alpha, antialias, useWebgl2) {
    const options = { alpha: alpha === 'true', antialias: antialias !== 'false', depth: true, stencil: true };
    gl = useWebgl2 === 'true' ? canvas.getContext('webgl2', options) : null;
    window.WebGL2RenderingContext = !!gl;
    gl = gl || canvas.getContext('webgl', options);
    const vs = shader(gl.VERTEX_SHADER, 'attribute vec2 position; varying vec2 uv; void main(){gl_Position=vec4(position,0.,1.); uv=vec2((position.x+1.)*.5,(1.-position.y)*.5);}');
    const fs = shader(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec2 uv; uniform sampler2D image; void main(){gl_FragColor=texture2D(image,uv);}');
    program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // An asset failure still leaves a usable startup and login/retry path.
    const images = await Promise.all(['startup/background.jpg', 'startup/progress.png'].map(path => loadImage(path).catch(() => null)));
    screen = createScreen(...images);
    stopped = false; tick();
    return setProgress(0);
}
async function end() {
    await setProgress(0.9);
    stopped = true; cancelAnimationFrame(frame);
    globalThis.__digitalBombStartup = screen;
    screen = null; // The cached native module must not retain the artwork after the scene releases it.
    gl.useProgram(null); gl.bindTexture(gl.TEXTURE_2D, null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program);
}
module.exports = { start, end, setProgress };

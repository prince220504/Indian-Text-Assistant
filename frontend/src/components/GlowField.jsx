import { useEffect, useRef } from "react";

// The page's light source: a wide cream light and a tight coral core on navy (60/30/10), refracted through vertical glass flutes.
// Raw WebGL2, one full-screen triangle, one fragment shader. Colours come from the CSS tokens.
// Falls back to the CSS layer underneath (.glow-fallback) when WebGL2 is missing; draws one still
// frame under reduced motion; stops drawing when off-screen.

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uFlute; uniform float uCalm;
uniform vec3 uNavy; uniform vec3 uNavy2; uniform vec3 uCoral; uniform vec3 uCream;
out vec4 o;
float hash(vec2 q){ return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
// the light behind the glass: a warm core, a second warm pocket, a cool blue haze, all drifting
vec3 field(vec2 s, float a, float t){
  vec2 q = vec2(s.x * a, s.y);
  float k = 1.0 / pow(min(a, 1.0), 2.0);           // portrait screens size the bloom by width, not height
  vec2 c1 = vec2((0.62 + 0.05 * sin(t * 0.11) + (uMouse.x - 0.5) * 0.22) * a, 0.55 + 0.07 * cos(t * 0.09) + (uMouse.y - 0.5) * 0.16);
  vec2 c2 = vec2((0.84 + 0.04 * cos(t * 0.08)) * a, 0.66 + 0.05 * sin(t * 0.12));
  vec2 c3 = vec2((0.18 + 0.06 * cos(t * 0.07)) * a, 0.86 + 0.04 * sin(t * 0.13));
  vec2 c4 = vec2((0.38 + 0.05 * sin(t * 0.06)) * a, 0.35);
  float g1 = exp(-dot(q - c1, q - c1) * 6.0 * k);  // coral: the 10, a tight core
  float g2 = exp(-dot(q - c2, q - c2) * 2.0 * k);  // cream: the 30, a wide soft light
  float g3 = exp(-dot(q - c3, q - c3) * 4.0 * k);
  float g4 = exp(-dot(q - c4, q - c4) * 7.0 * k);
  float peak = (0.9 - uCalm * 0.55) * mix(0.62, 1.0, clamp(a, 0.0, 1.0));
  vec3 col = mix(uNavy, uNavy2, smoothstep(0.0, 1.0, s.y) * 0.7);
  col = mix(col, uNavy2 * 1.7, g3 * 0.6);          // blue haze
  col = mix(col, uNavy * 0.6, g4 * 0.35);          // a darker pocket
  col = mix(col, uCream * 0.9, min(g2 * peak * 1.05, 0.85));
  col = mix(col, uCoral, g1 * peak);
  col += uCream * g1 * g1 * (0.08 - uCalm * 0.05);
  return col;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float n = max(uRes.x / uFlute, 8.0);
  float f = fract(uv.x * n);                       // position inside one flute, 0..1
  float bend = f - 0.5;
  float a = uRes.x / uRes.y;
  float t = uTime;
  vec2 s = uv;
  s.x += bend * (1.0 / n) * 2.4;                   // each flute is a small lens
  s.y += bend * bend * 0.03;
  // the glass diffuses: sample the light twice across the rib and blend
  vec3 col = 0.5 * (field(s + vec2(0.012, 0.0), a, t) + field(s - vec2(0.012, 0.004), a, t));
  float edge = smoothstep(0.0, 0.2, f) * smoothstep(1.0, 0.8, f);
  col *= 0.95 + 0.05 * edge;                       // a light trough, not blinds
  col += (1.0 - smoothstep(0.0, 0.08, f)) * 0.035; // the bright ridge where two flutes meet
  col = mix(col, uNavy, smoothstep(0.42, 0.0, uv.y) * (0.6 + uCalm * 0.2));   // quiet floor for text
  col += (hash(gl_FragCoord.xy + floor(t * 24.0)) - 0.5) * 0.028;            // film grain
  o = vec4(col, 1.0);
}`;

// resolve a CSS colour token (oklch included) to linear-ish RGB 0..1 via a 1px canvas
function tokenRGB(name) {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const g = c.getContext("2d");
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  g.fillRect(0, 0, 1, 1);
  const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
  return [r / 255, gg / 255, b / 255];
}

// `fixed`: one calm glow pinned behind the whole page, so glass panels below the hero have light to blur
function GlowField({ calm = false, fixed = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) { canvas.dataset.fallback = "true"; return; }

    const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.dataset.fallback = "true"; return; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (n) => gl.getUniformLocation(prog, n);
    gl.uniform3fv(u("uNavy"), tokenRGB("--color-navy"));
    gl.uniform3fv(u("uNavy2"), tokenRGB("--color-navy-3"));
    gl.uniform3fv(u("uCoral"), tokenRGB("--color-accent"));
    gl.uniform3fv(u("uCream"), tokenRGB("--color-cream"));
    gl.uniform1f(u("uCalm"), calm ? 1 : 0);
    const uRes = u("uRes"), uTime = u("uTime"), uMouse = u("uMouse"), uFlute = u("uFlute");

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    const onMove = (e) => { mouse.tx = e.clientX / window.innerWidth; mouse.ty = 1 - e.clientY / window.innerHeight; };
    if (!still) window.addEventListener("pointermove", onMove, { passive: true });

    // the glow is soft, so render at reduced resolution and let the browser scale it
    const scale = Math.min(window.devicePixelRatio, 1.5) * 0.6;
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uFlute, Math.max(5, 9 * scale));      // ~9 CSS px ribs, independent of the render scale
      if (still) draw(0);
    };

    let raf = 0, visible = true;
    const t0 = performance.now();
    function draw(now) {
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      gl.uniform1f(uTime, still ? 8 : (now - t0) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function loop(now) {
      if (!visible) return;
      draw(now);
      raf = requestAnimationFrame(loop);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible && !still) raf = requestAnimationFrame(loop);
    });
    // a fixed canvas is always "on screen"; watch the section it lights instead, so it rests while the hero shows
    io.observe(fixed ? canvas.closest(".page-glow") ?? canvas : canvas);
    resize();
    if (still) draw(0); else raf = requestAnimationFrame(loop);
    canvas.dataset.ready = "true";

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      window.removeEventListener("pointermove", onMove);
      gl.deleteBuffer(buf); gl.deleteProgram(prog);
    };
  }, [calm, fixed]);

  return (
    <div className={fixed ? "glow glow--fixed" : "glow"} aria-hidden="true">
      <div className="glow-fallback" />
      <canvas ref={ref} className="glow-canvas" />
    </div>
  );
}

export default GlowField;

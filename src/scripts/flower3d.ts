// The DocSera mark as a slowly turning glass object — one small WebGL shader,
// no library (~4 KB). Loaded only after the page has finished loading, and only
// on devices that can afford it (see download.astro); everyone else keeps the
// flat SVG mark drawn underneath, which looks almost the same at rest.
//
// The mark is four teardrop petals (up, down, left, right) meeting at a small
// hub. The shader ray-marches a signed distance field of that shape: the four
// petals come from folding space into one petal (abs + swap), so the cost is
// one petal, not four. What makes it read as a solid object: real depth, lights
// and reflections that stay fixed while it turns, self-shadow, and glass that
// is pale where thin and deep teal where thick.

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uTilt;
uniform float uTurn;

// 1.0 = as round as a ball. The first version used 2.1 and read as a flat sticker.
const float DEPTH = 1.22;

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float petal(vec3 p) {
  float bulb = length(p - vec3(0.60, 0.0, 0.0)) - 0.31;
  float neck = sdCapsule(p, vec3(0.06, 0.0, 0.0), vec3(0.55, 0.0, 0.0), 0.095);
  return smin(bulb, neck, 0.20);
}

float map(vec3 p) {
  vec3 q = vec3(p.xy, p.z * DEPTH);
  vec3 a = vec3(abs(q.x), abs(q.y), q.z);  // fold the four petals into one
  if (a.y > a.x) a.xy = a.yx;
  float d = petal(a);
  d = smin(d, length(q) - 0.17, 0.12);     // the hub
  return d / DEPTH;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0012, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

// A small photo studio: bright ceiling, dark floor, one window, one side light.
// It stays fixed while the object turns, so reflections slide over the surface.
vec3 studio(vec3 d) {
  vec3 c = mix(vec3(0.02, 0.20, 0.22), vec3(0.72, 0.95, 0.94), smoothstep(-0.25, 0.9, d.y));
  float win = smoothstep(0.24, 0.15, abs(d.x + 0.36)) * smoothstep(0.26, 0.17, abs(d.y - 0.50)) * smoothstep(0.0, 0.2, d.z);
  float side = smoothstep(0.955, 0.995, dot(d, normalize(vec3(0.80, -0.12, 0.58))));
  return c + win * 1.5 + side * vec3(0.55, 0.8, 0.8);
}

float softShadow(vec3 p, vec3 l) {
  float res = 1.0, t = 0.04;
  for (int i = 0; i < 10; i++) {
    float d = map(p + l * t);
    res = min(res, 4.5 * d / t);
    t += clamp(d, 0.03, 0.22);
    if (res < 0.02 || t > 1.6) break;
  }
  return clamp(res, 0.0, 1.0);
}

float occlusion(vec3 p, vec3 n) {
  float o = 0.0, w = 1.0;
  for (int i = 1; i <= 4; i++) {
    float h = 0.04 + 0.07 * float(i);
    o += w * (h - map(p + n * h));
    w *= 0.62;
  }
  return clamp(1.0 - 1.9 * o, 0.0, 1.0);
}

// How much glass the light crosses: thin rims glow, thick bulbs go deep teal.
float thickness(vec3 p, vec3 dir) {
  float s = 0.03;
  for (int i = 0; i < 10; i++) {
    float d = map(p + dir * s);
    if (d > -0.001) break;
    s += max(-d, 0.03);
  }
  return s;
}

void main() {
  float res = min(uRes.x, uRes.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / res;
  vec3 roW = vec3(0.0, 0.0, 4.1);
  vec3 rdW = normalize(vec3(uv, -1.75));

  // Swings up to ~60° each way, so the side is seen but the mark stays readable.
  float ay = 1.02 * sin(uTime * 0.36 + uTurn) + uTilt.x * 0.55;
  float ax = 0.34 * sin(uTime * 0.23 + 1.3) + uTilt.y * 0.42;
  float az = uTime * 0.10;
  mat3 R = rotX(ax) * rotY(ay) * rotZ(az);
  vec3 ro = R * roW;
  vec3 rd = R * rdW;

  // Rays that miss the bounding sphere cost nothing.
  float b = dot(ro, rd);
  float h = b * b - dot(ro, ro) + 1.08 * 1.08;
  if (h < 0.0) { gl_FragColor = vec4(0.0); return; }
  h = sqrt(h);
  float t = max(-b - h, 0.0), tMax = -b + h;

  float hit = 0.0, near = 1.0, tNear = t;
  for (int i = 0; i < 56; i++) {
    float d = map(ro + rd * t);
    float m = d / t;
    if (m < near) { near = m; tNear = t; }
    if (d < 0.0009) { hit = 1.0; break; }
    t += d;
    if (t > tMax) break;
  }
  // A soft silhouette, one pixel wide.
  float cover = hit > 0.5 ? 1.0 : 1.0 - smoothstep(0.0, 1.5 / (res * 1.75), near);
  if (cover <= 0.0) { gl_FragColor = vec4(0.0); return; }
  if (hit < 0.5) t = tNear;

  vec3 p = ro + rd * t;
  vec3 n = normalAt(p);
  vec3 nW = n * R;                          // back to the fixed world of the lights
  vec3 L1 = normalize(vec3(-0.55, 0.72, 0.62));
  vec3 L2 = normalize(vec3(0.80, -0.25, 0.35));

  vec3 inner = refract(rd, n, 0.72);
  float th = thickness(p - n * 0.012, inner);
  vec3 body = mix(vec3(0.0, 0.47, 0.48), vec3(0.42, 0.96, 0.92), exp(-th * 2.1));
  body = mix(body, body * (0.55 + studio(normalize(inner * R))), 0.55);

  float key = clamp(dot(nW, L1), 0.0, 1.0);
  float fill = clamp(dot(nW, L2), 0.0, 1.0);
  float sh = softShadow(p + n * 0.012, R * L1);
  float ao = occlusion(p, n);
  vec3 col = body * (0.62 + 0.62 * key * sh + 0.22 * fill) * (0.52 + 0.48 * ao);

  vec3 rf = reflect(rdW, nW);
  float ndv = clamp(dot(nW, -rdW), 0.0, 1.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  col = mix(col, studio(rf), clamp(fres * 1.05, 0.0, 0.85) * (0.35 + 0.65 * ao));
  // The necks and the hub curve inward: a highlight there is a stray white dash.
  col += pow(clamp(dot(rf, L1), 0.0, 1.0), 90.0) * sh * 1.25 * smoothstep(0.30, 0.46, length(p.xy));
  col += pow(1.0 - ndv, 3.0) * vec3(0.22, 0.46, 0.46) * (0.4 + 0.6 * ao);
  col = col / (1.0 + col * 0.10);
  gl_FragColor = vec4(col * cover, cover);
}
`;

function shader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
	const s = gl.createShader(type);
	if (!s) return null;
	gl.shaderSource(s, src);
	gl.compileShader(s);
	if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
	return s;
}

/**
 * Can this GPU draw the mark as one solid piece? It needs real highp floats in
 * the fragment shader: phones run mediump as 16-bit, and the ray-march then
 * breaks into hundreds of dots (Android, 2026-11-23). A software renderer would
 * burn the CPU. In both cases the page keeps the flat mark.
 */
export function canDrawFlower(gl: WebGLRenderingContext): boolean {
	const high = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
	if (!high || high.precision < 20) return false;
	const dbg = gl.getExtension('WEBGL_debug_renderer_info');
	const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
	return !/swiftshader|llvmpipe|software|basic render/i.test(renderer);
}

/**
 * Starts the flower on `canvas`. Returns false when WebGL is unavailable or
 * drawn in software. If the first second of frames is slow, it stops by
 * itself and calls `onGiveUp` (the page then keeps the flat mark).
 */
export function mountFlower(canvas: HTMLCanvasElement, onGiveUp?: () => void): boolean {
	const gl = canvas.getContext('webgl', {
		alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power',
	}) as WebGLRenderingContext | null;
	if (!gl) return false;
	if (!canDrawFlower(gl)) return false;
	const vs = shader(gl, gl.VERTEX_SHADER, VERT);
	const fs = shader(gl, gl.FRAGMENT_SHADER, FRAG);
	if (!vs || !fs) return false;
	const prog = gl.createProgram();
	if (!prog) return false;
	gl.attachShader(prog, vs);
	gl.attachShader(prog, fs);
	gl.linkProgram(prog);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
	gl.useProgram(prog);

	const buf = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buf);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	const aPos = gl.getAttribLocation(prog, 'aPos');
	gl.enableVertexAttribArray(aPos);
	gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
	const uRes = gl.getUniformLocation(prog, 'uRes');
	const uTime = gl.getUniformLocation(prog, 'uTime');
	const uTilt = gl.getUniformLocation(prog, 'uTilt');
	const uTurn = gl.getUniformLocation(prog, 'uTurn');

	let scale = Math.min(window.devicePixelRatio || 1, 2);
	const resize = () => {
		const w = Math.max(1, Math.round(canvas.clientWidth * scale));
		const h = Math.max(1, Math.round(canvas.clientHeight * scale));
		if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.uniform2f(uRes, canvas.width, canvas.height);
	};
	resize();
	window.addEventListener('resize', resize, { passive: true });

	// The finger or the mouse leans the flower a little; it eases back.
	let tx = 0, ty = 0, cx = 0, cy = 0;
	window.addEventListener('pointermove', (e) => {
		tx = (e.clientX / window.innerWidth - 0.5) * 2;
		ty = (e.clientY / window.innerHeight - 0.5) * 2;
	}, { passive: true });
	// Tilting an Android phone turns it too (iOS needs a permission we don't ask for).
	const lean = (v: number) => Math.max(-1, Math.min(1, v / 32));
	window.addEventListener('deviceorientation', (e) => {
		if (e.gamma == null || e.beta == null) return;
		tx = lean(e.gamma);
		ty = lean(e.beta - 50);
	}, { passive: true });

	let visible = true;
	new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true; }).observe(canvas);

	const t0 = performance.now();
	let last = 0, n = 0, slow = 0, stopped = false, turn = window.scrollY * 0.0045;
	const frame = (now: number) => {
		if (stopped) return;
		requestAnimationFrame(frame);
		if (!visible || document.hidden) { last = 0; return; }
		// Watch the first 60 drawn frames: mostly slower than ~30 fps = give up.
		if (last && n < 60) {
			n++;
			if (now - last > 34) slow++;
			if (n === 60 && slow > 30) {
				// First try half the pixels; only then fall back to the flat mark.
				if (scale > 1) { scale = 1; resize(); n = 0; slow = 0; last = 0; return; }
				stopped = true; onGiveUp?.(); return;
			}
		}
		last = now;
		cx += (tx - cx) * 0.05; cy += (ty - cy) * 0.05;
		turn += (window.scrollY * 0.0045 - turn) * 0.08; // scrolling turns it
		gl.uniform1f(uTurn, turn);
		gl.uniform1f(uTime, (now - t0) / 1000);
		gl.uniform2f(uTilt, cx, -cy);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	};
	requestAnimationFrame(frame);
	return true;
}

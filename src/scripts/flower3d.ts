// The DocSera mark as a slowly turning glass object — one small WebGL shader,
// no library (~4 KB). Loaded only after the page has finished loading, and only
// on devices that can afford it (see download.astro); everyone else keeps the
// flat SVG mark drawn underneath, which looks almost the same at rest.
//
// The mark is four teardrop petals (up, down, left, right) meeting at a small
// hub. The shader ray-marches a signed distance field of that shape: the four
// petals come from folding space into one petal (abs + swap), so the cost is
// one petal, not four. Colours are the brand teal (#009092 → #66B8B8).

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uTilt;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

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
  float neck = sdCapsule(p, vec3(0.06, 0.0, 0.0), vec3(0.55, 0.0, 0.0), 0.085);
  return smin(bulb, neck, 0.20);
}

float map(vec3 p) {
  vec3 q = vec3(p.xy, p.z * 2.1);          // a pebble, not a ball
  vec3 a = vec3(abs(q.x), abs(q.y), q.z);  // fold the four petals into one
  if (a.y > a.x) a.xy = a.yx;
  float d = petal(a);
  d = smin(d, length(q) - 0.15, 0.10);     // the hub
  return d / 2.1;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, 4.1);
  vec3 rd = normalize(vec3(uv, -1.75));

  float ay = 0.55 * sin(uTime * 0.32) + uTilt.x * 0.7;
  float ax = 0.30 * sin(uTime * 0.23 + 1.3) + uTilt.y * 0.5;
  float az = uTime * 0.12;
  ro.xz = rot(ay) * ro.xz; rd.xz = rot(ay) * rd.xz;
  ro.yz = rot(ax) * ro.yz; rd.yz = rot(ax) * rd.yz;
  ro.xy = rot(az) * ro.xy; rd.xy = rot(az) * rd.xy;

  float t = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 64; i++) {
    float d = map(ro + rd * t);
    if (d < 0.0012) { hit = 1.0; break; }
    t += d;
    if (t > 6.0) break;
  }

  if (hit < 0.5) { gl_FragColor = vec4(0.0); return; }

  vec3 p = ro + rd * t;
  vec3 n = normalAt(p);
  vec3 l = normalize(vec3(-0.45, 0.75, 0.55));
  float diff = max(dot(n, l), 0.0);
  float fres = pow(1.0 - max(dot(n, -rd), 0.0), 2.6);
  float spec = pow(max(dot(reflect(rd, n), l), 0.0), 48.0);
  float spec2 = pow(max(dot(reflect(rd, n), normalize(vec3(0.6, -0.3, 0.7))), 0.0), 20.0);

  vec3 deep = vec3(0.0, 0.42, 0.43);
  vec3 teal = vec3(0.0, 0.565, 0.573);
  vec3 light = vec3(0.40, 0.72, 0.72);
  vec3 refr = refract(rd, n, 0.72);
  vec3 env = mix(deep, vec3(0.86, 0.97, 0.97), clamp(refr.y * 0.55 + 0.5, 0.0, 1.0));
  vec3 col = mix(teal, light, diff * 0.85);
  col = mix(col, env, 0.32);
  col += fres * vec3(0.75, 1.0, 1.0) * 0.55;
  col += spec * 0.95 + spec2 * 0.25;
  gl_FragColor = vec4(col, 1.0);
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
 * Starts the flower on `canvas`. Returns false when WebGL is unavailable or
 * drawn in software. If the first second of frames is slow, it stops by
 * itself and calls `onGiveUp` (the page then keeps the flat mark).
 */
export function mountFlower(canvas: HTMLCanvasElement, onGiveUp?: () => void): boolean {
	const gl = canvas.getContext('webgl', {
		alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power',
	}) as WebGLRenderingContext | null;
	if (!gl) return false;
	// A software renderer (no GPU) would burn the phone's CPU: keep the flat mark.
	const dbg = gl.getExtension('WEBGL_debug_renderer_info');
	const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
	if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) return false;
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

	const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.25 : 1.5);
	const resize = () => {
		const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
		const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
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

	let visible = true;
	new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true; }).observe(canvas);

	const t0 = performance.now();
	let last = 0, n = 0, slow = 0, stopped = false;
	const frame = (now: number) => {
		if (stopped) return;
		requestAnimationFrame(frame);
		if (!visible || document.hidden) { last = 0; return; }
		// Watch the first 60 drawn frames: mostly slower than ~30 fps = give up.
		if (last && n < 60) {
			n++;
			if (now - last > 34) slow++;
			if (n === 60 && slow > 30) { stopped = true; onGiveUp?.(); return; }
		}
		last = now;
		cx += (tx - cx) * 0.05; cy += (ty - cy) * 0.05;
		gl.uniform1f(uTime, (now - t0) / 1000);
		gl.uniform2f(uTilt, cx, -cy);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	};
	requestAnimationFrame(frame);
	return true;
}

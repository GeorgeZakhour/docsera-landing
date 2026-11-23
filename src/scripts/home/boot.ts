// The home page story «أربع بتلات»: one scroll drives everything on the stage.
// Loaded async and alone (like flower-boot on /download). Without it, or with
// reduced motion, the page is a plain readable column.
import { mountDial, type DialPose } from './dial';

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const q = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const qa = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));

// Where each of the four worlds sits on the story's 0..1 scroll.
const CH: [number, number][] = [[0.15, 0.35], [0.35, 0.56], [0.56, 0.76], [0.76, 0.985]];
// Each phone screen: visible from..to, and when to start fetching it.
const SHOTS: [number, number, number][] = [
	[-1, 0.275, 0], [0.265, 0.345, 0.12], [0.335, 0.555, 0.24], [0.545, 0.625, 0.45],
	[0.615, 0.69, 0.53], [0.68, 0.765, 0.6], [0.755, 2, 0.68],
];
const NOTES: [number, number][] = [[0.372, 0.43], [0.432, 0.49], [0.492, 0.548]];
// The loose papers belong to the first world only: around the phone, x / y in phone sizes.
const PAPERS: [number, number, number][] = [
	[-0.8, -0.3, -12], [0.72, -0.36, 9], [-0.88, 0.05, 7], [0.76, 0.1, -8], [-0.74, 0.37, 5], [0.68, 0.4, -6],
];
// The small cards floating around the laptop, iPad and phone: x / y in the rig's size.
const FLOATS: [number, number][] = [[0.13, 0.12], [0.93, 0.27], [0.15, 0.93]];

const pose: DialPose = { tilt: 0.22, turn: 0.3, roll: 0, petals: [0, 0, 0, 0] };

function startFlower(): void {
	const fl = q('[data-fl]');
	const canvas = q<HTMLCanvasElement>('[data-fl-canvas]');
	const still = q<HTMLImageElement>('[data-fl-still]');
	if (!fl || !canvas || !still) return;
	const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
	if (conn && conn.saveData) return;
	const showStill = () => {
		still.addEventListener('load', () => {
			still.classList.add('on');
			canvas.classList.remove('on');
		}, { once: true });
		still.src = still.dataset.src || '';
	};
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
	let live = false;
	if (!reduce && (navigator.hardwareConcurrency || 2) >= 4) {
		try {
			live = mountDial(canvas, pose, { onReady: () => canvas.classList.add('on'), onGiveUp: showStill });
		} catch { /* the still below */ }
	}
	if (!live) showStill();
}

function startStory(): void {
	const root = q('[data-story]');
	const stick = q('[data-stick]');
	if (!root || !stick) return;
	const fl = q('[data-fl]')!, aHero = q('[data-a-hero]')!, aDial = q('[data-a-dial]')!;
	const hero = q('[data-hero]')!, phone = q('[data-phone]')!, aFan = q('[data-a-fan]')!, bgHero = q('[data-bg-hero]')!;
	const rigBox = q('[data-rig-box]')!, rigs = qa('[data-rig]'), floats = qa('[data-float]'), cue = q<HTMLButtonElement>('[data-cue]')!;
	const t0 = performance.now();
	// «There is more below»: until the first scroll the devices lift now and then.
	let nudge = 0, nudgeAt = t0 + 2400, nudges = 0, touched = false;
	let mx = 0, my = 0, px = 0, py = 0;
	const chapters = qa('[data-ch]'), papers = qa('[data-paper]'), notes = qa('[data-note]');
	const shots = qa<HTMLImageElement>('[data-shot]');
	const night = q('[data-night]')!, twi = q('[data-twi]')!, dusk = q('[data-dusk]')!, sun = q('[data-sun]')!;
	const sunDisc = q('[data-sun-disc]')!, moonDisc = q('[data-moon-disc]')!;
	const map = q('[data-map]')!, roads = qa<SVGPathElement>('[data-road]'), pins = qa<SVGGElement>('[data-pin]');
	const clinic = q('[data-clinic]')!, chip = q('[data-chip]')!, boxes = qa('[data-box]'), check = q('[data-check]')!;

	let A = { x: 0, y: 0, s: 1 }, B = { x: 0, y: 0, s: 1 };
	let from = { x: 0, y: 0 }, to = { x: 0, y: 0 };
	let F = { x: 0, y: 0, w: 1, h: 1 }, P = { x: 0, y: 0, w: 1, h: 1 }, R = { x: 0, y: 0, w: 1, h: 1 };
	const layout = () => {
		const sr = stick.getBoundingClientRect();
		const c = (e: HTMLElement) => { const r = e.getBoundingClientRect(); return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2, s: r.width }; };
		A = c(aHero); B = c(aDial);
		fl.style.width = fl.style.height = A.s + 'px';
		const off = (e: HTMLElement) => ({ x: e.offsetLeft + e.offsetWidth / 2, y: e.offsetTop + e.offsetHeight / 2 });
		const ph = off(phone);
		const fr = aFan.getBoundingClientRect();
		F = { x: fr.left - sr.left + fr.width / 2, y: fr.top - sr.top + fr.height / 2, w: fr.width, h: fr.height };
		P = { x: ph.x, y: ph.y, w: phone.offsetWidth, h: phone.offsetHeight };
		const rr = rigBox.getBoundingClientRect();
		R = { x: rr.left - sr.left, y: rr.top - sr.top, w: rr.width, h: rr.height };
		from = { x: ph.x, y: ph.y - phone.offsetHeight * 0.14 };
		to = off(clinic);
		last = -1;
	};

	let target = 0, p = 0, last = -1, running = false;
	const read = () => {
		const r = root.getBoundingClientRect();
		target = clamp(-r.top / Math.max(1, r.height - window.innerHeight));
	};

	const apply = (now: number) => {
		const seg = (a: number, b: number) => clamp((p - a) / (b - a));
		const sm = (a: number, b: number) => ease(seg(a, b));
		const narrow = window.innerWidth < 900;
		const enter = ease(clamp((now - t0) / 950));
		const h = sm(0.05, 0.15), off = sm(0.972, 0.998);

		// The opening: a laptop, an iPad and the phone; the phone carries on into the story.
		bgHero.style.opacity = String(1 - h);
		const out = sm(0.025, 0.11), W = stick.clientWidth;
		rigs.forEach((e, i) => {
			const d = Number(e.dataset.rig) || 0;
			const a = ease(clamp((now - t0 - i * 130) / 850)), o = 1 - sm(0.035, 0.105);
			const bob = Math.sin(now / 1900 + i * 2.1) * (narrow ? 2.5 : 4) * (1 - out);
			e.style.opacity = String(a * o);
			e.style.visibility = o < 0.01 ? 'hidden' : 'visible';
			e.style.transform = `translate3d(${d * out * W * 0.16 + px * (i + 1) * 5}px,${(1 - a) * 70 - out * 46 + bob - nudge * (16 + i * 8) + py * (i + 1) * 3}px,0)`;
		});
		floats.forEach((e, i) => {
			const [fx, fy0] = FLOATS[i];
			// On a phone the medicine card sits just above the phone, not on its screen.
			const fy = narrow && i === 1 ? 0.14 : fy0;
			const a = ease(clamp((now - t0 - 450 - i * 140) / 600)), o = 1 - sm(0.02, 0.07);
			const w = e.offsetWidth, hh = e.offsetHeight;
			const x = clamp(R.x + fx * R.w, w / 2 + 8, W - w / 2 - 8);
			e.style.opacity = String(a * o);
			e.style.visibility = o < 0.01 ? 'hidden' : 'visible';
			e.style.transform = `translate3d(${x - w / 2 + px * 16}px,${R.y + fy * R.h - hh / 2 + Math.sin(now / 1300 + i * 2) * 5 + (1 - a) * 16 - nudge * 22 + py * 8}px,0) scale(${lerp(0.9, 1, a)})`;
		});
		const cueIn = ease(clamp((now - t0 - 1000) / 500)), cueOut = 1 - sm(0.003, 0.028);
		cue.style.opacity = String(cueIn * cueOut);
		cue.style.visibility = cueOut < 0.01 ? 'hidden' : 'visible';
		cue.style.transform = `translate3d(0,${-nudge * 7}px,0)`;

		// World 1: the loose papers appear around the phone and fly into it.
		papers.forEach((el, i) => {
			const [ox, oy, r] = PAPERS[i];
			const a = sm(0.17 + i * 0.004, 0.2 + i * 0.004), t = sm(0.235 + i * 0.006, 0.295 + i * 0.006);
			const w = el.offsetWidth, ph = el.offsetHeight;
			const x = P.x + ox * P.w * (narrow ? 0.68 : 1) * (1 - t), y = P.y + oy * P.h * (1 - t) + Math.sin(now / 1100 + i * 1.7) * 5 * (1 - t) + (1 - a) * 18;
			el.style.opacity = String(a * (1 - sm(0.283 + i * 0.006, 0.303 + i * 0.006)));
			el.style.transform = `translate3d(${x - w / 2}px,${y - ph / 2}px,0) rotate(${r * (1 - t) + t * 140}deg) scale(${lerp(0.86, 1, a) * lerp(1, 0.16, t)})`;
		});

		const k = sm(0.085, 0.17);
		const bump = Math.sin(Math.PI * seg(0.255, 0.315)) * 0.1;
		// On a phone only a sliver of the mark would show behind the laptop: it arrives with world 1.
		fl.style.opacity = narrow ? String(sm(0.07, 0.13)) : '';
		fl.style.transform = `translate3d(${lerp(A.x, B.x, k) - A.s / 2}px,${lerp(A.y, B.y, k) - A.s / 2}px,0) scale(${lerp(1, B.s / A.s, k) * (1 + bump)})`;

		// Every world turns the dial a quarter: the next petal comes to the top.
		const steps = sm(0.335, 0.365) + sm(0.545, 0.575) + sm(0.745, 0.775);
		pose.roll = -(1 - sm(0.03, 0.16)) * Math.PI + steps * Math.PI / 2;
		pose.turn = 0.3 + 0.34 * Math.sin(p * Math.PI * 6);
		pose.tilt = 0.2;
		const open = CH.map(([s, e]) => sm(s + 0.012, s + 0.04) * (1 - sm(e - 0.03, e - 0.005)));
		pose.petals = [open[3], open[0], open[1], open[2]];

		const heroOut = sm(0.012, 0.06);
		hero.style.opacity = String(1 - heroOut);
		hero.style.transform = `translateY(${-30 * heroOut}px)`;
		hero.style.visibility = heroOut > 0.99 ? 'hidden' : 'visible';

		chapters.forEach((c, i) => {
			const [s, e] = CH[i];
			const a = sm(s + 0.006, s + 0.032), b = sm(e - 0.03, e - 0.008), o = a * (1 - b);
			c.style.opacity = String(o);
			c.style.transform = `translateY(${(1 - a) * 26 - b * 26}px)`;
			c.style.visibility = o > 0.01 ? 'visible' : 'hidden';
		});

		phone.style.opacity = String(enter * (1 - off));
		phone.style.transform = `translate3d(${(F.x - P.x) * (1 - h) + px * 11 * (1 - h)}px,${(F.y - P.y) * (1 - h) + (1 - enter) * 70 - off * 30 + (py * 6 - nudge * 34) * (1 - h)}px,0) scale(${lerp(F.w / P.w, 1, h) * (1 - 0.06 * off)})`;
		shots.forEach((img, i) => {
			const [a, b, fetchAt] = SHOTS[i];
			if (img.dataset.src && p >= fetchAt) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
			img.style.opacity = String((a < 0 ? 1 : sm(a, a + 0.012)) * (1 - sm(b - 0.002, b + 0.01)));
		});

		// Routine: one day, from morning to night.
		// Sunset, then blue hour, then night: a direct fade from peach to dark teal goes brown.
		const twiT = sm(0.452, 0.492), nightT = sm(0.49, 0.54);
		dusk.style.opacity = String(sm(0.385, 0.44));
		twi.style.opacity = String(twiT);
		night.style.opacity = String(nightT);
		stick.classList.toggle('dark', twiT > 0.55);
		const u = seg(0.355, 0.55);
		sun.style.opacity = String(sm(0.345, 0.365) * (1 - sm(0.548, 0.57)));
		// On a phone the sun crosses the gap between the text and the phone.
		sun.style.left = lerp(narrow ? 88 : 76, narrow ? 12 : 20, u) + '%';
		sun.style.top = (narrow ? 31 - Math.sin(u * Math.PI) * 2.5 : 30 - Math.sin(u * Math.PI) * 15) + '%';
		const sunT = 1 - sm(0.455, 0.5);
		sunDisc.style.opacity = String(sunT);
		moonDisc.style.opacity = String(1 - sunT);
		notes.forEach((n, i) => {
			const [a, b] = NOTES[i];
			const ni = sm(a, a + 0.01), o = ni * (1 - sm(b - 0.008, b));
			n.style.opacity = String(o);
			n.style.transform = `translateY(${(1 - ni) * -22}px) scale(${lerp(0.96, 1, ni)})`;
			n.classList.toggle('tap', seg(a, b) > 0.55);
		});

		// Booking: the city draws itself, the clinics light up.
		map.style.opacity = String(sm(0.555, 0.59) * (1 - sm(0.75, 0.78)));
		roads.forEach((r, i) => { r.style.strokeDashoffset = String(1 - sm(0.56 + i * 0.004, 0.63 + i * 0.004)); });
		pins.forEach((g, i) => {
			const t = sm(0.615 + i * 0.006, 0.637 + i * 0.006);
			g.style.opacity = String(t);
			g.style.transform = `scale(${t})`;
		});

		// Your doctor: the code goes from the phone to the clinic.
		const cl = sm(0.775, 0.805) * (1 - sm(0.972, 0.995));
		clinic.style.opacity = String(cl);
		clinic.style.transform = `translateY(${(1 - cl) * 20}px)`;
		const f = sm(0.83, 0.875);
		chip.style.opacity = String(sm(0.805, 0.82) * (1 - sm(0.875, 0.89)));
		chip.style.transform = `translate3d(${lerp(from.x, to.x, f) - chip.offsetWidth / 2}px,${lerp(from.y, to.y, f) - chip.offsetHeight / 2}px,0) scale(${lerp(1, 0.62, f)})`;
		boxes.forEach((b, i) => b.classList.toggle('on', p > 0.878 + i * 0.006));
		check.classList.toggle('on', p > 0.92);
	};

	const loop = (now: number) => {
		if (!running) return;
		requestAnimationFrame(loop);
		read();
		p += (target - p) * 0.14;
		if (Math.abs(target - p) < 0.0002) p = target;
		px += (mx - px) * 0.07; py += (my - py) * 0.07;
		if (!touched && target < 0.001 && nudges < 3) {
			const u = (now - nudgeAt) / 1300;
			if (u >= 1) { nudge = 0; nudges++; nudgeAt = now + 3400; } else if (u > 0) nudge = Math.sin(Math.PI * u) ** 2;
		} else nudge = 0;
		// The opening and the papers keep moving at rest.
		if (p !== last || p < 0.31) { apply(now); last = p; }
	};
	new IntersectionObserver((es) => {
		const on = es[0].isIntersecting;
		if (on && !running) { running = true; requestAnimationFrame(loop); }
		if (!on) running = false;
	}).observe(root);

	layout();
	read();
	p = target;
	apply(performance.now());
	stick.classList.add('ready');
	addEventListener('resize', () => { layout(); }, { passive: true });
	addEventListener('load', layout, { once: true });
	document.fonts?.ready.then(layout);

	const touch = () => { touched = true; };
	(['wheel', 'touchstart', 'keydown'] as const).forEach((ev) => addEventListener(ev, touch, { passive: true, once: true }));
	addEventListener('pointermove', (e) => {
		if (e.pointerType === 'touch') return;
		mx = (e.clientX / innerWidth - 0.5) * 2;
		my = (e.clientY / innerHeight - 0.5) * 2;
	}, { passive: true });
	cue.addEventListener('click', () => {
		touched = true;
		const r = root.getBoundingClientRect();
		scrollTo({ top: scrollY + r.top + (r.height - innerHeight) * 0.2, behavior: 'smooth' });
	});
	// The laptop and iPad screens wait until the page itself has loaded.
	const late = () => qa<HTMLImageElement>('img[data-late]', rigBox).forEach((img) => {
		img.addEventListener('load', () => img.classList.add('in'), { once: true });
		img.srcset = img.dataset.late || '';
	});
	if (document.readyState === 'complete') setTimeout(late, 80);
	else addEventListener('load', () => setTimeout(late, 80), { once: true });
}

function startTry(): void {
	const root = q('[data-try]');
	if (!root) return;
	const tabs = qa<HTMLButtonElement>('[data-tab]', root), shots = qa<HTMLImageElement>('[data-try-shot]', root);
	const load = (i: number) => {
		const s = shots[(i + shots.length) % shots.length];
		if (s?.dataset.src) { s.src = s.dataset.src; s.removeAttribute('data-src'); }
	};
	let cur = 0, timer = 0, auto = true;
	const show = (i: number, scroll = false) => {
		cur = i;
		load(i); load(i + 1);
		shots.forEach((s, k) => s.classList.toggle('on', k === i));
		tabs.forEach((t, k) => {
			t.classList.toggle('on', k === i);
			t.setAttribute('aria-pressed', String(k === i));
		});
		if (scroll) {
			const bar = tabs[i].parentElement!;
			bar.scrollTo({ left: tabs[i].offsetLeft - bar.clientWidth / 2 + tabs[i].offsetWidth / 2, behavior: 'smooth' });
		}
	};
	tabs.forEach((t, i) => t.addEventListener('click', () => { auto = false; clearInterval(timer); show(i, true); }));
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
	new IntersectionObserver((es) => {
		clearInterval(timer);
		if (!es[0].isIntersecting) return;
		load(cur);
		shots[cur].classList.add('on');
		if (auto && !reduce) timer = window.setInterval(() => show((cur + 1) % shots.length, true), 2600);
	}, { rootMargin: '200px 0px' }).observe(root);
}

function startWall(): void {
	const wall = q('[data-wall]');
	if (!wall) return;
	const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
	const load = () => qa<HTMLImageElement>('img[data-src]', wall).forEach((img) => {
		if (!img.offsetParent) return;
		const big = innerWidth >= 769 && !(conn && conn.saveData);
		img.addEventListener('load', () => img.classList.add('in'), { once: true });
		img.src = (img.dataset.src || '').replace(/\.webp$/, big ? '-390.webp' : '.webp');
		img.removeAttribute('data-src');
	});
	let near = false;
	new IntersectionObserver((es) => { if (es[0].isIntersecting && !near) { near = true; load(); } }, { rootMargin: '500px 0px' }).observe(wall);
	addEventListener('resize', () => { if (near) load(); }, { passive: true });
	new IntersectionObserver((es) => wall.classList.toggle('run', es[0].isIntersecting), { threshold: 0.1 }).observe(wall);
	const toggle = q<HTMLButtonElement>('[data-wall-toggle]', wall);
	toggle?.addEventListener('click', () => {
		const paused = wall.classList.toggle('paused');
		const label = paused ? 'تشغيل الحركة' : 'إيقاف الحركة';
		toggle.setAttribute('aria-pressed', String(paused));
		toggle.setAttribute('aria-label', label);
		toggle.title = label;
	});
}

function startExpand(): void {
	const root = q('[data-expand]');
	const dev = q('[data-dev]');
	const big = q('[data-dev-big]');
	const lit = q('[data-ex-light]');
	if (!root || !dev || !big || !lit) return;
	let on = false;
	const tick = () => {
		if (!on) return;
		requestAnimationFrame(tick);
		const r = root.getBoundingClientRect();
		const t = clamp(-r.top / Math.max(1, r.height - innerHeight));
		const grow = ease(clamp((t - 0.12) / 0.5));
		const maxW = Math.min(innerWidth * 0.9, 940), maxH = Math.min(maxW * 0.75, innerHeight * 0.66);
		const fullW = maxH / 0.75;
		const phoneH = Math.min(innerHeight * 0.6, 520), phoneW = phoneH * 0.4614;
		dev.style.width = lerp(phoneW, Math.min(fullW, maxW), grow) + 'px';
		dev.style.height = lerp(phoneH, Math.min(maxH, maxW * 0.75), grow) + 'px';
		dev.style.borderRadius = lerp(34, 22, grow) + 'px';
		big.style.opacity = String(ease(clamp((grow - 0.3) / 0.45)));
		const l = ease(clamp((t - 0.62) / 0.3));
		lit.style.opacity = String(l);
		root.classList.toggle('lit', l > 0.5);
	};
	new IntersectionObserver((es) => {
		const v = es[0].isIntersecting;
		if (v && !on) { on = true; requestAnimationFrame(tick); }
		if (!v) on = false;
	}).observe(root);
}

// The comparison: a line of light passes over a cluttered desk, and each paper it
// reaches turns over into its tidy card. The handle only scrubs the page's scroll,
// so there is one source of truth and dragging can never fight scrolling.
const MESS: [number, number, number][] = [[0.035, 0.006, -2.6], [-0.04, -0.004, 1.6], [0.045, 0.004, -1.4], [-0.03, -0.006, 2.2], [0.03, 0.004, -1.8]];

function startCompare(): void {
	const root = q('[data-cmp]'), stage = q('[data-cmp-stage]'), night = q('[data-cmp-night]');
	const inner = q('[data-cmp-night-in]'), line = q('[data-cmp-line]'), grip = q('[data-cmp-grip]'), hint = q('[data-cmp-hint]');
	if (!root || !stage || !night || !inner || !line || !grip || !hint) return;
	const items = qa('[data-pair]', root).map((slot) => ({ slot, card: q('[data-pair-in]', slot)!, y: 0 }));
	let H = 1, W = 1, p = 0, last = -1, on = false, shown = -1, radius = -1;
	const START = 90;
	const travel = () => Math.max(1, root.offsetHeight - stage.offsetHeight);
	const measure = () => {
		H = stage.offsetHeight; W = stage.offsetWidth;
		const top = stage.getBoundingClientRect().top;
		items.forEach((it) => { const r = it.slot.getBoundingClientRect(); it.y = r.top - top + r.height / 2; });
		last = -1;
	};
	const apply = () => {
		const s = clamp((p - 0.05) / 0.87);
		const y = lerp(START, H + 26, s);
		// Two opposite moves instead of a clip-path: only the compositor works.
		night.style.transform = `translate3d(0,${y - H}px,0)`;
		inner.style.transform = `translate3d(0,${H - y}px,0)`;
		line.style.transform = `translate3d(0,${y}px,0)`;
		line.style.opacity = String(1 - clamp((s - 0.96) / 0.04));
		hint.style.opacity = String(1 - clamp(s / 0.05));
		const band = Math.max(40, H * 0.075), wide = W >= 900 ? 1.35 : 1;
		items.forEach((it, i) => {
			const [mx, my, r] = MESS[i];
			const f = ease(clamp((y - (it.y - band)) / (2 * band)));
			const k = 1 - f;
			it.card.style.transform = `perspective(800px) translate3d(${mx * W * wide * k}px,${my * H * k}px,${Math.sin(Math.PI * f) * 46}px) rotate(${r * k}deg) rotateX(${f * 180}deg) scale(${lerp(0.94, 1, f)})`;
		});
		const v = Math.round(s * 100);
		if (v !== shown) { shown = v; grip.setAttribute('aria-valuenow', String(v)); }
	};
	const tick = () => {
		if (!on) return;
		requestAnimationFrame(tick);
		const r = root.getBoundingClientRect();
		const target = clamp(-r.top / travel());
		p += (target - p) * 0.17;
		if (Math.abs(target - p) < 0.0005) p = target;
		if (p !== last) { apply(); last = p; }
		const rr = Math.round(clamp(r.top / 120) * 30);
		if (rr !== radius) { radius = rr; stage.style.borderRadius = rr ? `${rr}px ${rr}px 0 0` : ''; }
	};
	let drag: { y: number; s: number } | null = null;
	grip.addEventListener('pointerdown', (e) => {
		drag = { y: e.clientY, s: scrollY };
		grip.setPointerCapture(e.pointerId);
		e.preventDefault();
	});
	grip.addEventListener('pointermove', (e) => {
		if (!drag) return;
		const k = (travel() * 0.87) / Math.max(1, H + 26 - START);
		scrollTo({ top: drag.s + (e.clientY - drag.y) * k, behavior: 'instant' as ScrollBehavior });
	});
	const end = () => { drag = null; };
	grip.addEventListener('pointerup', end);
	grip.addEventListener('pointercancel', end);
	grip.addEventListener('keydown', (e) => {
		const d = e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowRight' ? -1 : 0;
		if (!d) return;
		e.preventDefault();
		scrollBy({ top: d * travel() * 0.08, behavior: 'instant' as ScrollBehavior });
	});
	new ResizeObserver(measure).observe(stage);
	measure();
	apply();
	new IntersectionObserver((es) => {
		const v = es[0].isIntersecting;
		if (v && !on) { measure(); on = true; requestAnimationFrame(tick); }
		if (!v) on = false;
	}, { rootMargin: '120px 0px' }).observe(root);
}

// The clinic: every world opens out of the one app, then hangs at its own depth.
function startPro(): void {
	const root = q('[data-pro]'), scene = q('[data-pro-scene]'), links = q('[data-pro-links]'), hub = q('[data-pro-hub]');
	if (!root || !scene || !links || !hub) return;
	const worlds = qa('[data-world]', scene).map((el) => ({ el, d: Number(el.dataset.depth) || 1, dx: 0, dy: 0 }));
	const measure = () => {
		const W = scene.offsetWidth, H = scene.offsetHeight;
		worlds.forEach((w) => { w.dx = W / 2 - w.el.offsetLeft; w.dy = H / 2 - w.el.offsetTop; });
	};
	let on = false, mx = 0, my = 0, cx = 0, cy = 0, open = 0;
	addEventListener('pointermove', (e) => {
		if (!on || e.pointerType === 'touch') return;
		mx = (e.clientX / innerWidth - 0.5) * 2;
		my = (e.clientY / innerHeight - 0.5) * 2;
	}, { passive: true });
	const tick = (now: number) => {
		if (!on) return;
		requestAnimationFrame(tick);
		cx += (mx - cx) * 0.07; cy += (my - cy) * 0.07;
		const top = root.querySelector('.pv-view')!.getBoundingClientRect().top;
		const target = ease(clamp((innerHeight * 0.96 - top) / (innerHeight * 0.62)));
		open += (target - open) * 0.12;
		if (Math.abs(target - open) < 0.001) open = target;
		const wide = innerWidth >= 900;
		scene.style.transform = `rotateY(${(wide ? 6 : 0) + cx * 4}deg) rotateX(${(wide ? 3 : 2) - cy * 3}deg)`;
		links.style.opacity = String(clamp((open - 0.35) / 0.6));
		worlds.forEach((w, i) => {
			const k = 1 - open, bob = Math.sin(now / 1600 + i * 1.9) * 4 * open;
			w.el.style.opacity = String(clamp(open * 1.7));
			w.el.style.transform = `translate3d(${w.dx * k + cx * w.d * 8}px,${w.dy * k + bob}px,${w.d * 30}px) scale(${lerp(0.5, 1, open)})`;
		});
		hub.style.transform = `translate3d(${cx * 5}px,${Math.sin(now / 1900) * 3}px,70px) scale(${lerp(0.82, 1, open)})`;
	};
	new ResizeObserver(measure).observe(scene);
	measure();
	new IntersectionObserver((es) => {
		const v = es[0].isIntersecting;
		if (v && !on) { measure(); on = true; requestAnimationFrame(tick); }
		if (!v) on = false;
	}, { rootMargin: '80px 0px' }).observe(root);
}

// The end of the page: the night turns to dawn and the phone rises with the sun.
function startFinale(): void {
	const root = q('[data-fin]'), dawn = q('[data-fin-dawn]'), sun = q('[data-fin-sun]'), phone = q('[data-fin-phone]');
	if (!root || !dawn || !sun || !phone) return;
	let on = false, p = 0, last = -1;
	const tick = () => {
		if (!on) return;
		requestAnimationFrame(tick);
		const r = root.getBoundingClientRect();
		const target = clamp((innerHeight - r.top) / Math.max(1, r.height * 0.94));
		p += (target - p) * 0.14;
		if (Math.abs(target - p) < 0.0005) p = target;
		if (p === last) return;
		last = p;
		const e = ease(p);
		dawn.style.opacity = String(ease(clamp((p - 0.08) / 0.72)));
		sun.style.transform = `translate3d(0,${lerp(56, 0, e)}%,0)`;
		phone.style.transform = `translate3d(0,${lerp(46, 0, e)}%,0)`;
	};
	dawn.style.opacity = '0';
	sun.style.transform = 'translate3d(0,56%,0)';
	phone.style.transform = 'translate3d(0,46%,0)';
	new IntersectionObserver((es) => {
		const v = es[0].isIntersecting;
		if (v && !on) { on = true; requestAnimationFrame(tick); }
		if (!v) on = false;
	}).observe(root);
}

requestAnimationFrame(() => {
	startFlower();
	if (document.documentElement.classList.contains('story')) {
		startStory();
		startExpand();
		startCompare();
		startPro();
		startFinale();
	}
	startTry();
	startWall();
});

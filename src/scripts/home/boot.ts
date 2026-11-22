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
	[-1, 0.345, 0.015], [0.335, 0.555, 0.24], [0.545, 0.625, 0.45],
	[0.615, 0.69, 0.53], [0.68, 0.765, 0.6], [0.755, 2, 0.68],
];
const NOTES: [number, number][] = [[0.372, 0.43], [0.432, 0.49], [0.492, 0.548]];
const PAPERS: [number, number, number][] = [
	[-0.62, -0.44, -12], [0.6, -0.5, 9], [-0.7, 0.2, 7], [0.66, 0.26, -8], [-0.24, 0.68, 5], [0.3, 0.72, -6],
];

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
	const hero = q('[data-hero]')!, phone = q('[data-phone]')!;
	const chapters = qa('[data-ch]'), papers = qa('[data-paper]'), notes = qa('[data-note]');
	const shots = qa<HTMLImageElement>('[data-shot]');
	const night = q('[data-night]')!, twi = q('[data-twi]')!, dusk = q('[data-dusk]')!, sun = q('[data-sun]')!;
	const sunDisc = q('[data-sun-disc]')!, moonDisc = q('[data-moon-disc]')!;
	const map = q('[data-map]')!, roads = qa<SVGPathElement>('[data-road]'), pins = qa<SVGGElement>('[data-pin]');
	const clinic = q('[data-clinic]')!, chip = q('[data-chip]')!, boxes = qa('[data-box]'), check = q('[data-check]')!;

	let A = { x: 0, y: 0, s: 1 }, B = { x: 0, y: 0, s: 1 };
	let from = { x: 0, y: 0 }, to = { x: 0, y: 0 };
	const layout = () => {
		const sr = stick.getBoundingClientRect();
		const c = (e: HTMLElement) => { const r = e.getBoundingClientRect(); return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2, s: r.width }; };
		A = c(aHero); B = c(aDial);
		fl.style.width = fl.style.height = A.s + 'px';
		const off = (e: HTMLElement) => ({ x: e.offsetLeft + e.offsetWidth / 2, y: e.offsetTop + e.offsetHeight / 2 });
		const ph = off(phone);
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

		// The papers swirl in and the mark takes shape.
		papers.forEach((el, i) => {
			const [ox, oy, r] = PAPERS[i];
			const t = sm(0.035 + i * 0.008, 0.125 + i * 0.008);
			const bob = Math.sin(now / 1100 + i * 1.7) * 6 * (1 - t);
			const w = el.offsetWidth, h = el.offsetHeight;
			el.style.opacity = String(1 - sm(0.105 + i * 0.008, 0.13 + i * 0.008));
			el.style.transform = `translate3d(${A.x + ox * A.s * (1 - t) - w / 2}px,${A.y + oy * A.s * (1 - t) - h / 2 + bob}px,0) rotate(${r * (1 - t) + t * 220}deg) scale(${lerp(1, 0.12, t)})`;
		});

		const k = sm(0.115, 0.19);
		const bump = Math.sin(Math.PI * seg(0.085, 0.15)) * 0.09;
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

		const up = sm(0.135, 0.205), off = sm(0.972, 0.998);
		phone.style.opacity = String(Math.min(1, up * 2) * (1 - off));
		phone.style.transform = `translate3d(0,${(1 - up) * 112 - off * 6}%,0) scale(${lerp(0.9, 1, up) * (1 - 0.06 * off)})`;
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
		const narrow = window.innerWidth < 900;
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
		// The papers bob at rest, so the hero keeps drawing while it is on screen.
		if (p !== last || p < 0.14) { apply(now); last = p; }
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

requestAnimationFrame(() => {
	startFlower();
	if (document.documentElement.classList.contains('story')) {
		startStory();
		startExpand();
	}
	startTry();
	startWall();
});

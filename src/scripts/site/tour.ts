// «عن التطبيق»: one real phone walks through the whole app as the page scrolls. Each step
// scrolls the real screen to one feature and lifts that card out of it in 3D.
interface Step { c: number; k: number; p: string; r: number[] | null; rad: number }
interface TourData {
	pages: Record<string, { h: number; foot: number }>;
	steps: Step[];
	spins: boolean[];
}

// The screens come in two sizes: 640 px (light) and the render's own 860 px (tour/hd). A screen
// that is shown — zoomed — wider than the 640 copy holds gets the 860 one, so it never upscales.
const LIGHT = '/images/tour';
const HD = '/images/tour/hd';
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function startTour(root: HTMLElement): void {
	const q = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
	const qa = <T extends Element = HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s));
	const data: TourData = JSON.parse(q('[data-tour-json]').textContent || '{}');
	const scroller = q('[data-scroll]'), stick = q('[data-stick]'), hero = q('[data-hero]');
	const rig = q('[data-rig]'), pivot = q('[data-pivot]'), box = q('[data-box]'), lift = q('[data-lift]'), dim = q('[data-dim]');
	const status = q<HTMLImageElement>('[data-status]');
	const nav = q('[data-nav]'), navs = qa<HTMLButtonElement>('[data-go]');
	const chapters = qa('[data-ch]'), stepBtns = qa<HTMLButtonElement>('[data-step]');
	const auras = qa('[data-aura]');
	const { pages, steps, spins } = data;
	// The phone is laid out at its zoomed size (features.astro --zr) and only scaled down, so its
	// layout width is the widest it is ever shown: pick the copy that covers it in device pixels.
	const shown = box.offsetWidth || innerWidth * (innerWidth >= 900 ? 0.34 : 0.8);
	const BASE = shown * (window.devicePixelRatio || 1) > 660 ? HD : LIGHT;

	const layers = new Map<string, HTMLElement>();
	const layer = (id: string) => {
		let el = layers.get(id);
		if (el) return el;
		el = document.createElement('div');
		el.className = 'lay';
		const img = new Image();
		img.alt = ''; img.decoding = 'async'; img.width = 640; img.height = pages[id].h;
		img.src = `${BASE}/${id}.webp`;
		el.append(img);
		if (pages[id].foot) {
			const f = new Image();
			f.alt = ''; f.className = 'foot'; f.decoding = 'async'; f.width = 640; f.height = pages[id].foot;
			f.src = `${BASE}/${id}-foot.webp`;
			el.append(f);
		}
		box.insertBefore(el, dim);
		layers.set(id, el);
		return el;
	};

	let u = 0.45, view = 1387, heroPx = 1, stepPx = 1, wide = true, cur = -1, shownPage = '', liftTimer = 0, moveTimer = 0, started = false;
	const measure = () => {
		wide = innerWidth >= 900;
		u = box.clientWidth / 640 || u;
		view = box.clientHeight / u;
		rig.style.setProperty('--u', `${u}px`);
		const room = scroller.offsetHeight - stick.offsetHeight;
		heroPx = stick.offsetHeight * 0.85;
		stepPx = Math.max(1, (room - heroPx) / steps.length);
	};
	const yFor = (s: Step) => {
		const max = Math.max(0, pages[s.p].h - view);
		if (!s.r) return 0;
		const usable = view - pages[s.p].foot;
		return clamp(s.r[1] + s.r[3] / 2 - usable / 2, 0, max);
	};
	const centre = (bar: HTMLElement, el: HTMLElement) => {
		const a = bar.getBoundingClientRect(), b = el.getBoundingClientRect();
		bar.scrollBy({ left: b.left + b.width / 2 - (a.left + a.width / 2), behavior: 'smooth' });
	};
	const hideLift = () => {
		clearTimeout(liftTimer);
		lift.classList.remove('on');
		dim.classList.remove('on');
	};
	const setStep = (i: number) => {
		const s = steps[i], prev = steps[cur];
		cur = i;
		// Only the pages around the visitor stay in memory: a long page is heavy once decoded.
		const near = new Set<string>();
		for (let k = Math.max(0, i - 2); k <= Math.min(steps.length - 1, i + 5); k++) { near.add(steps[k].p); layer(steps[k].p); }
		layers.forEach((el, id) => {
			if (!near.has(id) && id !== shownPage) { el.remove(); layers.delete(id); }
		});
		const el = layer(s.p), y = yFor(s), img = el.querySelector('img')!;
		const target = `translate3d(0, calc(var(--u) * ${-y.toFixed(1)}), 0)`;
		// A page always opens at its top, then travels to the feature.
		const fresh = s.p !== shownPage;
		clearTimeout(moveTimer);
		if (fresh) {
			img.style.transition = 'none';
			img.style.transform = 'translate3d(0, 0, 0)';
			void img.offsetHeight;
			img.style.transition = '';
			layers.get(shownPage)?.classList.remove('on');
			el.classList.add('on');
			shownPage = s.p;
		}
		const travels = fresh && y > 0;
		if (travels) moveTimer = window.setTimeout(() => { img.style.transform = target; }, 300);
		else img.style.transform = target;
		status.classList.toggle('on', y > 26);
		hideLift();
		if (s.r) {
			const [x, ry, w, h] = s.r;
			liftTimer = window.setTimeout(() => {
				lift.style.cssText = `--x:${x};--y:${ry};--top:${ry - y};--w:${w};--h:${h};--rad:${s.rad};background-image:url(${BASE}/${s.p}.webp)`;
				lift.classList.add('on');
				dim.classList.add('on');
			}, travels ? 860 : 430);
		}
		if (!prev || prev.c !== s.c) {
			chapters.forEach((c, k) => c.classList.toggle('on', k === s.c));
			navs.forEach((b, k) => {
				b.classList.toggle('on', k === s.c);
				if (k === s.c) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
			});
			centre(nav, navs[s.c]);
			auras.forEach((a, k) => a.classList.toggle('on', k === s.c % auras.length));
		}
		stepBtns.forEach((b, k) => b.classList.toggle('on', k === i));
		if (!wide) centre(stepBtns[i].closest('ol')!, stepBtns[i]);
		wake();
	};

	const now = { x: 0, y: 0, s: 1, ry: 0, rx: 12 };
	let running = false;
	const targets = () => {
		const sc = -scroller.getBoundingClientRect().top;
		const t = ease(clamp(sc / heroPx));
		const c = cur < 0 ? 0 : steps[cur].c;
		const side = c % 2 === 0 ? -1 : 1;
		const reach = wide ? Math.min(innerWidth * 0.19, 280) : 0;
		const turned = wide ? 15 : 5;
		const spun = wide ? spins.slice(0, c + 1).filter(Boolean).length : 0;
		return {
			x: reach * side * t,
			y: lerp(stick.offsetHeight * (wide ? 0.46 : 0.34), 0, t),
			// laid out at the zoomed size: 1 = zoomed in, 1 / zoom = the resting size
			s: lerp(1, 1 / (wide ? 1.42 : 1.18), t),
			ry: side * -turned * t + spun * 360,
			rx: lerp(13, wide ? 3 : 1, t),
		};
	};
	const apply = () => {
		rig.style.transform = `translate3d(${now.x.toFixed(1)}px,${now.y.toFixed(1)}px,0) scale(${now.s.toFixed(4)})`;
		pivot.style.transform = `rotateX(${now.rx.toFixed(2)}deg) rotateY(${now.ry.toFixed(2)}deg)`;
	};
	const tick = () => {
		const g = targets();
		let moving = false;
		(Object.keys(now) as (keyof typeof now)[]).forEach((k) => {
			const d = g[k] - now[k];
			if (Math.abs(d) > 0.02) moving = true;
			now[k] += d * (k === 'ry' ? 0.085 : 0.16);
		});
		apply();
		if (moving) requestAnimationFrame(tick); else running = false;
	};
	function wake() {
		if (!running) { running = true; requestAnimationFrame(tick); }
	}

	const onScroll = () => {
		const sc = -scroller.getBoundingClientRect().top;
		const heroT = clamp(sc / (heroPx * 0.55));
		hero.style.opacity = String(1 - heroT);
		hero.style.transform = `translateY(${-26 * heroT}px)`;
		hero.style.visibility = heroT >= 1 ? 'hidden' : 'visible';
		root.classList.toggle('past', sc > scroller.offsetHeight - stick.offsetHeight - 4);
		const go = sc > heroPx * 0.7;
		if (go !== started) {
			started = go;
			root.classList.toggle('going', go);
			if (!go) hideLift();
			else if (cur >= 0) { const i = cur; cur = -1; setStep(i); }
		}
		const i = clamp(Math.floor((sc - heroPx) / stepPx), 0, steps.length - 1);
		if (i !== cur && go) setStep(i);
		wake();
	};
	const jump = (i: number) => {
		const top = scrollY + scroller.getBoundingClientRect().top + heroPx + stepPx * i + 2;
		scrollTo({ top, behavior: 'instant' as ScrollBehavior });
	};
	navs.forEach((b, c) => b.addEventListener('click', () => jump(steps.findIndex((s) => s.c === c))));
	stepBtns.forEach((b) => b.addEventListener('click', () => jump(Number(b.dataset.step))));

	measure();
	layer(steps[0].p).classList.add('on');
	shownPage = steps[0].p;
	const start = targets();
	Object.assign(now, start);
	apply();
	addEventListener('scroll', onScroll, { passive: true });
	addEventListener('resize', () => {
		measure();
		if (cur >= 0) { const i = cur; cur = -1; setStep(i); }
		onScroll();
	});
	onScroll();
	root.classList.add('ready');
}

// The /pro page: each feature family shows one real screen at a time. Nothing plays by
// itself and nothing loads before it is about to be seen, so a slow connection only pays
// for what the visitor opens.
const load = (root: ParentNode | HTMLImageElement) => {
	const imgs = root instanceof HTMLImageElement ? [root] : Array.from(root.querySelectorAll<HTMLImageElement>('img[data-src]'));
	imgs.forEach((img) => {
		if (!img.dataset.src) return;
		img.src = img.dataset.src;
		img.removeAttribute('data-src');
	});
};

function startExplorer(fx: HTMLElement) {
	const shots = Array.from(fx.querySelectorAll<HTMLElement>('[data-shot]'));
	const rises = Array.from(fx.querySelectorAll<HTMLElement>('[data-rise]'));
	const items = Array.from(fx.querySelectorAll<HTMLElement>('[data-item]'));
	let cur = 0, near = false;
	const riseOf = (i: number) => rises.find((r) => Number(r.dataset.rise) === i);
	const loadAt = (i: number) => {
		if (shots[i]) load(shots[i]);
		const r = riseOf(i);
		if (r) load(r);
	};
	const show = (i: number) => {
		cur = i;
		loadAt(i);
		shots.forEach((s, k) => s.classList.toggle('on', k === i));
		rises.forEach((r) => r.classList.toggle('on', Number(r.dataset.rise) === i));
		items.forEach((it, k) => {
			it.classList.toggle('on', k === i);
			it.querySelector('button')?.setAttribute('aria-expanded', k === i ? 'true' : 'false');
		});
		if (near && shots[i + 1]) loadAt(i + 1);
	};
	items.forEach((it, i) => {
		const b = it.querySelector<HTMLElement>('[data-pick]')!;
		b.addEventListener('click', () => show(i));
		b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') loadAt(i); });
	});
	new IntersectionObserver(([e], io) => {
		if (!e.isIntersecting) return;
		near = true;
		loadAt(cur);
		io.disconnect();
	}, { rootMargin: '500px 0px' }).observe(fx);
}

function startJump() {
	const nav = document.querySelector<HTMLElement>('[data-jump]');
	if (!nav) return;
	const links = new Map(Array.from(nav.querySelectorAll<HTMLAnchorElement>('a')).map((a) => [a.getAttribute('href')!.slice(1), a]));
	const mark = (id: string) => {
		links.forEach((a, k) => {
			const on = k === id;
			a.classList.toggle('on', on);
			if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
			if (on) nav.scrollTo({ left: a.offsetLeft - nav.clientWidth / 2 + a.clientWidth / 2, behavior: 'smooth' });
		});
	};
	const io = new IntersectionObserver((entries) => {
		entries.forEach((e) => { if (e.isIntersecting) mark((e.target as HTMLElement).dataset.spy!); });
	}, { rootMargin: '-38% 0px -56% 0px' });
	document.querySelectorAll<HTMLElement>('[data-spy]').forEach((s) => io.observe(s));
}

// The first view: the dashboard tilts a little with the pointer and its cards keep their depth.
function startHero() {
	const stage = document.querySelector<HTMLElement>('[data-hv]');
	if (!stage) return;
	const after = () => stage.querySelectorAll<HTMLImageElement>('img[data-src]').forEach((img) => load(img));
	if (document.readyState === 'complete') after(); else addEventListener('load', after, { once: true });
	if (matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(pointer: fine)').matches) return;
	let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
	const tick = () => {
		x += (tx - x) * 0.08; y += (ty - y) * 0.08;
		stage.style.setProperty('--mx', x.toFixed(3));
		stage.style.setProperty('--my', y.toFixed(3));
		raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(tick) : 0;
	};
	addEventListener('pointermove', (e) => {
		if (scrollY > innerHeight) return;
		tx = (e.clientX / innerWidth - 0.5) * 2;
		ty = (e.clientY / innerHeight - 0.5) * 2;
		if (!raf) raf = requestAnimationFrame(tick);
	}, { passive: true });
}

export function startProPage() {
	document.querySelectorAll<HTMLElement>('[data-fx]').forEach(startExplorer);
	startJump();
	startHero();
}

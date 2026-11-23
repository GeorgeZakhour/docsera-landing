// The phone that really scrolls the app's pages (components/site/AppPhone.astro).
// A page's first screen loads when it is shown; its full length only once the visitor
// takes the phone. The phone scrolls only when it is on screen, so a thumb passing over
// it keeps moving the website, and at the end of a page the scroll carries on to the site.
export interface AppPhone {
	readonly size: number;
	readonly current: number;
	show(i: number, next?: number): void;
	engage(loadCurrent?: boolean): void;
	activate(): void;
	setInView(inView: boolean): void;
}

export function mountAppPhone(phone: HTMLElement, onEngage?: () => void): AppPhone {
	const pages = Array.from(phone.querySelectorAll<HTMLElement>('[data-try-shot]'));
	const hint = phone.querySelector<HTMLElement>('[data-try-hint]');
	const status = phone.querySelector<HTMLImageElement>('img[data-status]');
	const scrollers = pages.map((p) => p.querySelector<HTMLElement>('[data-pg-scroll]')!);
	const n = pages.length;

	const load = (i: number) => pages[(i + n) % n].querySelectorAll<HTMLImageElement>('img[data-src]').forEach((img) => {
		img.src = img.dataset.src || '';
		img.removeAttribute('data-src');
	});
	const loadFull = (i: number) => {
		const img = pages[i].querySelector<HTMLImageElement>('img[data-full]');
		if (!img) return;
		img.addEventListener('load', () => img.classList.add('in'), { once: true });
		img.src = img.dataset.full || '';
		img.removeAttribute('data-full');
	};

	let cur = 0, engaged = false, hinted = false, inView = false, canScroll = false;
	const refreshHint = () => hint?.classList.toggle('show', inView && !hinted && pages[cur].dataset.long === '1');

	const engage = (loadCurrent = true) => {
		if (!engaged) {
			if (status?.dataset.status) { status.src = status.dataset.status; status.removeAttribute('data-status'); }
			engaged = true;
			onEngage?.();
		}
		if (loadCurrent) loadFull(cur);
	};
	const show = (i: number, next?: number) => {
		cur = i;
		load(i);
		if (next !== undefined) load(next);
		if (engaged) loadFull(i);
		scrollers[i].scrollTop = 0;
		phone.classList.remove('scrolled');
		pages.forEach((p, k) => p.classList.toggle('on', k === i));
		scrollers.forEach((s, k) => { s.tabIndex = k === i ? 0 : -1; });
		refreshHint();
	};

	scrollers.forEach((s, i) => {
		s.addEventListener('scroll', () => {
			if (i !== cur) return;
			phone.classList.toggle('scrolled', s.scrollTop > 26);
			if (s.scrollTop > 8 && !hinted) { hinted = true; refreshHint(); }
		}, { passive: true });
		s.addEventListener('focus', () => engage());
	});

	new IntersectionObserver(([e]) => {
		canScroll = e.intersectionRect.height >= Math.min(e.boundingClientRect.height, innerHeight) * 0.85;
		phone.classList.toggle('can-scroll', canScroll);
	}, { threshold: [0, 0.25, 0.5, 0.7, 0.85, 0.95, 1] }).observe(phone);
	['touchstart', 'wheel'].forEach((ev) => phone.addEventListener(ev, () => { if (canScroll) engage(); }, { passive: true }));

	// With a mouse: drag the page like a finger would.
	let drag: { y: number; top: number } | null = null;
	phone.addEventListener('pointerdown', (e) => {
		if (e.pointerType !== 'mouse' || e.button !== 0 || !canScroll) return;
		engage();
		drag = { y: e.clientY, top: scrollers[cur].scrollTop };
		phone.setPointerCapture(e.pointerId);
		phone.classList.add('drag');
	});
	phone.addEventListener('pointermove', (e) => { if (drag) scrollers[cur].scrollTop = drag.top - (e.clientY - drag.y); });
	const endDrag = () => { drag = null; phone.classList.remove('drag'); };
	phone.addEventListener('pointerup', endDrag);
	phone.addEventListener('pointercancel', endDrag);

	return {
		size: n,
		get current() { return cur; },
		show,
		engage,
		activate() {
			load(cur);
			pages[cur].classList.add('on');
			scrollers[cur].tabIndex = 0;
		},
		setInView(v) {
			inView = v;
			refreshHint();
		},
	};
}

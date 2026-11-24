// An article: the phone beside the steps always shows the screen of the step being read.
export function startArticle() {
	const steps = Array.from(document.querySelectorAll<HTMLElement>('[data-step]'));
	const pages = Array.from(document.querySelectorAll<HTMLElement>('[data-page]'));
	const count = document.querySelector<HTMLElement>('[data-phone-step]');
	const load = (el?: HTMLElement) => {
		const img = el?.querySelector<HTMLImageElement>('img[data-src]');
		if (img) { img.src = img.dataset.src!; img.removeAttribute('data-src'); }
	};
	let cur = -1;
	const pageFor = (i: number) => {
		for (let k = i; k >= 0; k--) { const p = steps[k].dataset.step; if (p) return Number(p); }
		return steps.findIndex((s) => s.dataset.step) >= 0 ? Number(steps[steps.findIndex((s) => s.dataset.step)].dataset.step) : -1;
	};
	const show = (i: number) => {
		if (i === cur) return;
		cur = i;
		steps.forEach((s, k) => { s.classList.toggle('on', k === i); s.classList.toggle('past', k < i); });
		const page = pageFor(i);
		pages.forEach((p, k) => {
			const on = k === page;
			if (on && !p.classList.contains('on')) { load(p); p.scrollTop = 0; }
			p.classList.toggle('on', on);
		});
		load(pages[page + 1]);
		if (count) count.textContent = `الخطوة ${i + 1} من ${steps.length}`;
	};
	if (steps.length) {
		show(0);
		const wide = matchMedia('(min-width: 900px)');
		const io = new IntersectionObserver((entries) => {
			if (!wide.matches) return;
			const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
			if (seen) show(steps.indexOf(seen.target as HTMLElement));
		}, { rootMargin: '-34% 0px -52% 0px' });
		steps.forEach((s, i) => { io.observe(s); s.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('button,a')) show(i); }); });
	}

	// On a phone a picture opens large.
	const box = document.querySelector<HTMLDialogElement>('[data-zoom-box]');
	if (box) {
		const big = box.querySelector('img')!;
		document.querySelectorAll<HTMLElement>('[data-zoom]').forEach((b) => b.addEventListener('click', () => { big.src = b.dataset.zoom!; box.showModal(); box.scrollTop = 0; }));
		box.querySelector('button')!.addEventListener('click', () => box.close());
		box.addEventListener('click', (e) => { if (e.target === box) box.close(); });
	}
}

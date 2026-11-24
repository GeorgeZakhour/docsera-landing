// The help search. People type the way they talk («بدي الغي موعدي», «ما وصلني الرمز»), so it
// folds Arabic spelling, drops filler words, forgives one typo, and ranks on title and keywords.
interface Row { i: string; t: string; s: string; k: string; w: string; nt: string[]; nk: string[]; ns: string[]; ft: string; fk: string; }

const STOP = new Set(['كيف', 'ما', 'ماذا', 'هل', 'لماذا', 'اين', 'من', 'في', 'على', 'عن', 'الي', 'او', 'و', 'بدي', 'عم', 'شو', 'ليش', 'لا', 'لم', 'انا', 'هو', 'هي', 'متي', 'لي', 'ان', 'مع', 'هذا', 'هذه', 'يا', 'اريد', 'ابغي', 'كيفيه', 'طريقه']);

export function fold(s: string): string {
	return s.toLowerCase()
		.replace(/[\u064B-\u065F\u0670\u0640]/g, '')
		.replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
		.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
		.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
const stem = (w: string) => (w.length > 4 && w.startsWith('ال') ? w.slice(2) : w.length > 5 && /^(وال|بال|لل)/.test(w) ? w.slice(w.startsWith('لل') ? 2 : 3) : w);
const words = (s: string) => fold(s).split(' ').filter(Boolean).map(stem);
const queryWords = (s: string) => fold(s).split(' ').filter((w) => w && !STOP.has(w)).map(stem);

function near(a: string, b: string): boolean {
	if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
	let i = 0, j = 0, edits = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) { i++; j++; continue; }
		if (++edits > 1) return false;
		if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
	}
	return edits + (a.length - i) + (b.length - j) <= 1;
}
function hit(q: string, list: string[], full: number, pre: number, inner: number, typo: number) {
	let best = 0;
	for (const w of list) {
		const v = w === q ? full : w.startsWith(q) ? pre : q.length > 2 && w.includes(q) ? inner : near(q, w) ? typo : 0;
		if (v > best) best = v;
	}
	return best;
}
function rank(rows: Row[], text: string): Row[] {
	const q = queryWords(text), phrase = fold(text);
	if (!q.length) return [];
	return rows.map((r) => {
		let score = 0, matched = 0;
		for (const w of q) {
			const s = Math.max(hit(w, r.nt, 12, 9, 6, 5), hit(w, r.nk, 10, 7, 5, 4), hit(w, r.ns, 3, 2, 1, 0));
			if (s) matched++;
			score += s;
		}
		if (phrase.length > 3 && r.ft.includes(phrase)) score += 20;
		else if (phrase.length > 3 && r.fk.includes(phrase)) score += 16;
		return { r, score: score * (matched / q.length) ** 2 };
	}).filter((x) => x.score > 3).sort((a, b) => b.score - a.score).slice(0, 8).map((x) => x.r);
}

let index: Promise<Row[]> | null = null;
const load = () => (index ??= fetch('/help-index.json').then((res) => res.json()).then((rows: Row[]) => rows.map((r) => ({
	...r, nt: words(r.t), nk: words(r.k), ns: words(r.s), ft: fold(r.t), fk: fold(r.k),
}))).catch(() => { index = null; return []; }));

function startOne(box: HTMLElement) {
	const input = box.querySelector('input')!, list = box.querySelector<HTMLElement>('.hp-results')!;
	let active = -1, seq = 0;
	const items = () => Array.from(list.querySelectorAll<HTMLAnchorElement>('a'));
	const setOpen = (on: boolean) => { list.hidden = !on; input.setAttribute('aria-expanded', String(on)); box.classList.toggle('is-open', on); };
	const mark = (i: number) => {
		active = i;
		items().forEach((a, k) => { a.classList.toggle('on', k === i); a.setAttribute('aria-selected', String(k === i)); });
		if (i >= 0) { input.setAttribute('aria-activedescendant', items()[i].id); items()[i].scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
	};
	const render = (rows: Row[], text: string) => {
		list.replaceChildren();
		active = -1;
		if (!rows.length) {
			const empty = document.createElement('p'); empty.className = 'hp-none';
			empty.textContent = 'لم نجد إجابة بهذه الكلمات. جرّب كلمة أخرى، أو راسلنا على support@docsera.app';
			list.append(empty);
		}
		rows.forEach((r, k) => {
			const a = document.createElement('a'), b = document.createElement('b'), s = document.createElement('span'), w = document.createElement('small');
			a.href = `/help/${r.i}`; a.id = `${list.id}-${k}`; a.setAttribute('role', 'option'); a.setAttribute('aria-selected', 'false');
			b.textContent = r.t; s.textContent = r.s; w.textContent = r.w;
			a.append(b, s, w); list.append(a);
		});
		setOpen(text.trim().length > 0);
	};
	const run = async () => {
		const text = input.value, me = ++seq;
		if (!text.trim()) { setOpen(false); return; }
		const rows = await load();
		if (me === seq) render(rank(rows, text), text);
	};
	input.addEventListener('focus', () => { load(); if (input.value.trim()) run(); });
	input.addEventListener('input', run);
	input.addEventListener('keydown', (e) => {
		const all = items();
		if (e.key === 'ArrowDown' && all.length) { e.preventDefault(); mark((active + 1) % all.length); }
		else if (e.key === 'ArrowUp' && all.length) { e.preventDefault(); mark((active - 1 + all.length) % all.length); }
		else if (e.key === 'Enter' && all.length) { e.preventDefault(); window.location.href = all[Math.max(active, 0)].href; }
		else if (e.key === 'Escape') { setOpen(false); }
	});
	document.addEventListener('pointerdown', (e) => { if (!box.contains(e.target as Node)) setOpen(false); });

	// The first search box writes what people really ask, until they touch it.
	if (box.dataset.typing && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
		const lines = ['بدي الغي موعدي', 'ما وصلني رمز التحقق', 'كيف أضيف ابني؟', 'نسيت كلمة المرور', 'من يرى ملفي الطبي؟', 'كيف أذكّر نفسي بالدواء؟'];
		let n = 0, c = 0, back = false, stop = false;
		const stopIt = () => { stop = true; input.placeholder = 'اكتب سؤالك هنا'; };
		input.addEventListener('focus', stopIt, { once: true });
		const tick = () => {
			if (stop) return;
			const line = lines[n];
			c += back ? -1 : 1;
			input.placeholder = line.slice(0, c) + (c > 0 ? '|' : '');
			let wait = back ? 26 : 62;
			if (!back && c === line.length) { back = true; wait = 1500; }
			else if (back && c === 0) { back = false; n = (n + 1) % lines.length; wait = 280; }
			window.setTimeout(tick, wait);
		};
		window.setTimeout(tick, 700);
	}
}

export function startHelpSearch() {
	document.querySelectorAll<HTMLElement>('[data-help-search]').forEach(startOne);
}

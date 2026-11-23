// What the doctor and centre pages share: the 3D card (tilt, depth, sheen, the turn to its
// QR), the booking sheet, and the profile sections that read the same columns.
import qrcode from 'qrcode-generator';

export const byData = (name: string) => document.querySelector(`[data-${name}]`) as HTMLElement;

export function showSec(name: string, on: boolean) {
	const el = document.querySelector<HTMLElement>(`[data-sec="${name}"]`);
	if (el) el.hidden = !on;
}

export function showChip(name: string, on: boolean) {
	const el = document.querySelector<HTMLElement>(`[data-chip="${name}"]`);
	if (el) el.hidden = !on;
}

/** A column that may hold its value or the value's JSON text. */
export function parsed(raw: any): any {
	if (typeof raw !== 'string') return raw;
	try { return JSON.parse(raw); } catch { return raw; }
}

export function stringList(raw: any): string[] {
	const list = parsed(raw);
	if (!Array.isArray(list)) return [];
	return list.map((x) => String(x ?? '').trim()).filter((x) => x && x.toLowerCase() !== 'null');
}

// ----- The app's placeholder rule: a photo or an approved illustration, never initials ------
export const isPhysician = (d: any) => ['د.', '.د', 'dr.', 'د', 'doctor'].includes(String(d.title || '').toLowerCase().trim());

export function placeholderFor(d: any): string {
	const g = String(d.gender || '').toLowerCase().trim();
	const male = g === 'ذكر' || g === 'male';
	const hijab = !male && String(d.placeholder_style || '').toLowerCase().trim() === 'hijab';
	const who = isPhysician(d) ? 'doctor' : 'specialist';
	return `/images/placeholders/ph_${who}_${male ? 'male' : hijab ? 'female_hijab' : 'female'}.svg`;
}

// ----- Sections: each one stays hidden when the profile left it empty ----------
export function bioText(value: any): string {
	let d = value;
	if (typeof d === 'string') {
		try { d = JSON.parse(d); } catch { return /^[…\.\s]*$/.test(d) ? '' : d.trim(); }
	}
	const ops = (x: any) => (Array.isArray(x) ? x : (x?.ops || []))
		.map((o: any) => (typeof o?.insert === 'string' ? o.insert : ''))
		.join('');
	const text = Array.isArray(d?.parts)
		? d.parts.map((p: any) => ops(p?.delta).trim()).filter(Boolean).join('\n\n')
		: ops(d).trim();
	return /^[…\.\s]*$/.test(text) ? '' : text;
}

export function renderBio(value: any) {
	const text = bioText(value);
	showSec('bio', !!text);
	if (!text) return;
	const el = byData('bio'), more = byData('bio-more');
	el.textContent = text;
	more.hidden = text.length < 230;
	el.classList.toggle('short', text.length >= 230);
	more.onclick = () => { el.classList.remove('short'); more.hidden = true; };
}

const DAYS: [string, string][] = [['sat', 'السبت'], ['sun', 'الأحد'], ['mon', 'الاثنين'], ['tue', 'الثلاثاء'], ['wed', 'الأربعاء'], ['thu', 'الخميس'], ['fri', 'الجمعة']];
function clock(t: string): string {
	const [h, m] = String(t).split(':').map(Number);
	if (!Number.isFinite(h)) return '';
	const pm = h >= 12 && h < 24;
	return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${pm ? 'م' : 'ص'}`;
}
function ranges(list: any): string {
	if (!Array.isArray(list)) return '';
	return list.map((x: any) => (x?.from && x?.to ? `${clock(x.from)} – ${clock(x.to)}` : '')).filter(Boolean).join('،  ');
}
const minutes = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };

export function hasHours(raw: any): boolean {
	const hours = parsed(raw);
	return !!hours && typeof hours === 'object' && DAYS.some(([k]) => ranges(hours[k]));
}

export function renderHours(raw: any) {
	const hours = parsed(raw);
	const any = hasHours(hours);
	showSec('hours', any);
	showChip('hours', any);
	if (!any) return;
	const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Damascus', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
	const get = (k: string) => parts.find((p) => p.type === k)?.value || '';
	const today = get('weekday').toLowerCase(), nowM = Number(get('hour')) * 60 + Number(get('minute'));
	const list: any[] = Array.isArray(hours[today]) ? hours[today].filter((x: any) => x?.from && x?.to) : [];
	const open = list.find((x) => nowM >= minutes(x.from) && nowM < minutes(x.to));
	const next = list.find((x) => nowM < minutes(x.from));
	const status = open ? `مفتوح حتى ${clock(open.to)}` : next ? `يفتح اليوم ${clock(next.from)}` : 'مغلق الآن';
	const pill = byData('now');
	pill.textContent = status;
	pill.classList.toggle('on', !!open);
	byData('today').textContent = ranges(list) || 'مغلق';
	byData('chip-hours-k').textContent = open ? 'مفتوح الآن' : 'اليوم';
	byData('chip-hours').textContent = open ? `حتى ${clock(open.to)}` : next ? `يفتح ${clock(next.from)}` : (list.length ? 'انتهى الدوام' : 'مغلق');
	const week = byData('week');
	week.replaceChildren();
	DAYS.forEach(([key, label]) => {
		const line = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
		if (key === today) line.className = 'is-today';
		dt.textContent = label;
		dd.textContent = ranges(hours[key]) || 'مغلق';
		line.append(dt, dd);
		week.append(line);
	});
}

export function serviceTitles(v: any): string[] {
	let d = v;
	if (typeof d === 'string') {
		try { d = JSON.parse(d); } catch { return []; }
	}
	if (Array.isArray(d)) return d.map((x: any) => (typeof x === 'string' ? x : x?.title || '')).map((s: string) => s.trim()).filter(Boolean);
	if (d && typeof d === 'object') return Object.keys(d).map((s) => s.trim()).filter(Boolean);
	return [];
}

export function renderServices(v: any) {
	const items = serviceTitles(v);
	showSec('services', items.length > 0);
	showChip('svc', items.length > 0);
	if (!items.length) return;
	const chip = document.querySelector<HTMLElement>('[data-chip-svc]');
	if (chip) chip.textContent = items[0];
	const ul = byData('services'), more = byData('svc-more');
	const draw = (list: string[]) => ul.replaceChildren(...list.map((t) => {
		const li = document.createElement('li');
		li.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.500 4.600 4.600L19 7.600"/></svg>';
		li.append(document.createTextNode(t));
		return li;
	}));
	draw(items.slice(0, 6));
	more.hidden = items.length <= 6;
	more.onclick = () => { draw(items); more.hidden = true; };
}

const LANGS: Record<string, string> = { ar: 'العربية', en: 'الإنجليزية', fr: 'الفرنسية', de: 'الألمانية', ru: 'الروسية', tr: 'التركية', es: 'الإسبانية', it: 'الإيطالية', fa: 'الفارسية', ku: 'الكردية', hy: 'الأرمنية' };
export function renderLanguages(v: any) {
	const list = stringList(v).map((x) => LANGS[x.toLowerCase()] || x);
	showSec('langs', list.length > 0);
	byData('langs').replaceChildren(...list.map((l) => { const s = document.createElement('span'); s.textContent = l; return s; }));
}

export function setMapLink(location: any) {
	const point = parsed(location);
	const lat = Number(point?.lat), lng = Number(point?.lng), map = byData('map-link') as HTMLAnchorElement;
	const has = point?.lat != null && point?.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
	map.hidden = !has;
	if (has) map.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

// ----- The card: tilt, depth, sheen, and a turn to its QR ------
export function startCard() {
	const stage = byData('stage'), wrap = byData('cd-wrap'), card = byData('cd');
	const front = byData('cd-front'), back = byData('cd-back'), sheen = byData('cd-sheen');
	const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
	let rx = still ? 0 : 15, ry = still ? 0 : -26, tx = 0, ty = 0, flip = 0, flipTo = 0, sx = 30, sy = 18, tsx = 30, tsy = 18;
	let lastInput = 0, inView = true, running = false, showing = true, qrDone = false;
	const drawQr = () => {
		if (qrDone) return;
		qrDone = true;
		const qr = qrcode(0, 'M');
		// The page's own address, without whatever query brought this visitor here.
		qr.addData(window.location.origin + window.location.pathname);
		qr.make();
		byData('cd-qr').innerHTML = qr.createSvgTag({ scalable: true, margin: 0 });
	};
	const apply = () => {
		const a = ry + flip;
		card.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${a.toFixed(2)}deg)`;
		const faceFront = Math.cos((a * Math.PI) / 180) >= 0;
		if (faceFront !== showing) {
			showing = faceFront;
			front.style.visibility = faceFront ? 'visible' : 'hidden';
			back.style.visibility = faceFront ? 'hidden' : 'visible';
		}
		sheen.style.setProperty('--sx', `${sx.toFixed(1)}%`);
		sheen.style.setProperty('--sy', `${sy.toFixed(1)}%`);
	};
	const tick = (t: number) => {
		if (!inView) { running = false; return; }
		if (performance.now() - lastInput > 1600 && !still) {
			tx = Math.cos(t / 3100) * 3.4;
			ty = Math.sin(t / 2300) * 8;
			tsx = 50 + ty * 3.4;
			tsy = 26 - tx * 4;
		}
		rx += (tx - rx) * 0.075;
		ry += (ty - ry) * 0.075;
		flip += (flipTo - flip) * 0.1;
		sx += (tsx - sx) * 0.1;
		sy += (tsy - sy) * 0.1;
		apply();
		requestAnimationFrame(tick);
	};
	const run = () => { if (!running && inView && !still) { running = true; requestAnimationFrame(tick); } };
	const aim = (x: number, y: number) => {
		const r = wrap.getBoundingClientRect();
		const nx = Math.max(-1, Math.min(1, (x - r.left - r.width / 2) / (r.width * 0.75)));
		const ny = Math.max(-1, Math.min(1, (y - r.top - r.height / 2) / (r.height * 0.75)));
		ty = nx * 17; tx = -ny * 12;
		tsx = 50 + nx * 46; tsy = 40 + ny * 46;
		stage.style.setProperty('--px', nx.toFixed(3));
		stage.style.setProperty('--py', ny.toFixed(3));
		lastInput = performance.now();
	};
	if (!still) {
		stage.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') aim(e.clientX, e.clientY); });
		wrap.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') aim(e.clientX, e.clientY); });
		wrap.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') aim(e.clientX, e.clientY); });
		new IntersectionObserver(([e]) => { inView = e.isIntersecting; run(); }).observe(stage);
	}
	document.querySelectorAll<HTMLElement>('[data-cd-flip]').forEach((b) => b.addEventListener('click', () => {
		drawQr();
		flipTo = flipTo === 0 ? 180 : 0;
		wrap.classList.toggle('is-flipped', flipTo !== 0);
		if (still) { flip = flipTo; apply(); }
	}));
	apply();
	run();
}

// Safe to call again when a section arrives later (a centre's team).
export function revealCards() {
	const cards = Array.from(document.querySelectorAll<HTMLElement>('.sc:not([hidden]):not([data-rv])'));
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) { cards.forEach((c) => c.classList.add('in')); return; }
	const io = new IntersectionObserver((es) => es.forEach((e) => {
		if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
	}), { rootMargin: '0px 0px -6% 0px' });
	cards.forEach((c, i) => { c.dataset.rv = '1'; c.style.setProperty('--d', `${(i % 2) * 90}ms`); io.observe(c); });
}

// ----- The booking steps rise as a sheet (a dialog on wide screens) -----
export function wireSheet() {
	const sheet = document.querySelector<HTMLElement>('[data-book-sheet]')!;
	const scrim = document.querySelector<HTMLElement>('[data-book-scrim]')!;
	const closeBtn = document.querySelector<HTMLElement>('[data-book-close]')!;
	let opener: HTMLElement | null = null;
	const setOpen = (on: boolean, focus = true) => {
		sheet.classList.toggle('open', on);
		scrim.classList.toggle('open', on);
		document.documentElement.classList.toggle('bk-lock', on);
		if (on) {
			sheet.setAttribute('role', 'dialog');
			sheet.setAttribute('aria-modal', 'true');
			sheet.setAttribute('aria-label', document.querySelector('[data-book-label]')?.textContent || 'احجز موعداً');
		} else {
			sheet.removeAttribute('role');
			sheet.removeAttribute('aria-modal');
			sheet.removeAttribute('aria-label');
		}
		if (focus) (on ? closeBtn : opener)?.focus();
	};
	document.querySelectorAll<HTMLElement>('[data-book-open]').forEach((b) => b.addEventListener('click', () => { opener = b; setOpen(true); }));
	closeBtn.addEventListener('click', () => setOpen(false));
	scrim.addEventListener('click', () => setOpen(false));
	document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.classList.contains('open')) setOpen(false); });
	// Back from the store, step 2 is the thing to press: bring it back.
	const back = () => {
		if (document.visibilityState === 'visible' && sheet.querySelector('[data-step-open].is-ready')) setOpen(true, false);
	};
	document.addEventListener('visibilitychange', back);
	back();
}

// Wires the EntityCta block on /doctor/<token> and /center/<id>.
//
// Everything here is built from the page URL alone — it runs before the
// profile request and keeps working if that request never completes. A
// patient scanning a clinic QR on a weak connection must still be able to
// install the app and open the profile.
import qrcode from 'qrcode-generator';
import { playUrl } from '../config/links';
import { attributionSource, trackStoreTaps } from './reach';

export function initEntityCta(kind: 'doctor' | 'center', id: string): void {
	const root = document.querySelector<HTMLElement>('[data-entity-cta]');
	if (!root) return;

	const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
	const enc = encodeURIComponent(id);
	const src = attributionSource();
	const suffix = src !== 'direct' ? '?s=' + encodeURIComponent(src) : '';

	// docsera://<kind>/<id> — the OS routes it to the app when installed.
	const inAppUrl = 'docsera://' + kind + '/' + enc + suffix;
	const webAppUrl = 'https://my.docsera.app/' + kind + '/' + enc + suffix;

	// Google Play carries the profile through the install (install referrer);
	// data-play-fixed keeps Layout's generic source rewrite off these links.
	root.querySelectorAll<HTMLAnchorElement>('a[data-play-link]').forEach((a) => {
		a.href = playUrl(src, kind, id);
		a.setAttribute('data-play-fixed', '');
	});

	root.querySelectorAll<HTMLAnchorElement>('[data-webapp-link]').forEach((a) => {
		a.href = webAppUrl;
	});

	trackStoreTaps(root, kind + '_landing');

	// ----- Phone or not ---------------------------------------
	const os = document.documentElement.getAttribute('data-os');
	const isMobile = os === 'ios' || os === 'android';
	const mobile = q('[data-cta-mobile]');
	const desktop = q('[data-cta-desktop]');
	if (mobile) mobile.hidden = !isMobile;
	if (desktop) desktop.hidden = isMobile;
	if (!isMobile) {
		renderQrCode(q('[data-qr-canvas]'));
		return;
	}

	// ----- Step 2: open in the app ----------------------------
	const openBtn = q<HTMLAnchorElement>('[data-open-app]');
	const hint = q('[data-open-hint]');
	const stepInstall = q('[data-step-install]');
	const stepOpen = q('[data-step-open]');
	const label = q('[data-open-label]');
	if (!openBtn || !stepInstall || !stepOpen) return;

	openBtn.href = inAppUrl;

	// If the app is installed the OS switches to it and this tab goes
	// hidden. If 1.5 s later we are still in front, nothing opened: say so
	// and point back at step 1, instead of leaving a tap that did nothing.
	openBtn.addEventListener('click', () => {
		if (hint) hint.hidden = true;
		const timer = window.setTimeout(() => {
			if (document.visibilityState === 'visible' && hint) hint.hidden = false;
		}, 1500);
		const onHide = () => {
			if (document.visibilityState === 'hidden') {
				window.clearTimeout(timer);
				document.removeEventListener('visibilitychange', onHide);
			}
		};
		document.addEventListener('visibilitychange', onHide);
	});

	// ----- Back from the store → light up step 2 ---------------
	// Remembered per profile for the tab's lifetime, so a reload (or iOS
	// evicting the tab while the App Store was in front) keeps the state.
	const key = 'ds_store_' + kind + '_' + id;
	let wentToStore = false;
	const markReady = () => {
		stepInstall.classList.add('is-done');
		stepOpen.classList.add('is-ready');
		if (hint) hint.hidden = true;
		const ready = label?.dataset.readyText;
		if (label && ready) label.textContent = ready;
	};

	root.querySelectorAll<HTMLAnchorElement>('a[data-store]').forEach((a) => {
		a.addEventListener('click', () => {
			wentToStore = true;
			try { sessionStorage.setItem(key, '1'); } catch { /* fine */ }
		});
	});
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible' && wentToStore) markReady();
	});
	try {
		if (sessionStorage.getItem(key)) markReady();
	} catch { /* storage blocked → the plain two steps still read fine */ }
}

function renderQrCode(container: HTMLElement | null): void {
	if (!container) return;
	// Type 0 = auto-pick the smallest QR version that fits. Error correction
	// 'M' (~15%) is plenty for a ~50-character profile URL.
	const qr = qrcode(0, 'M');
	qr.addData(window.location.href);
	qr.make();
	container.innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
}

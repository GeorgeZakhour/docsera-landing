// Screenshots of the LIVE /careers page from a preview build, through
// headless Chromium's DevTools protocol — no visible browser, and device
// metrics emulated so a phone width works (headless Chromium enforces a
// minimum window width, which is why build.py frames the mockup in an
// iframe; this drives the real page instead).
//
//   1. PUBLIC_SUPABASE_URL=https://api-staging.docsera.app npm run build && npm run preview
//   2. <Chromium> --headless=new --remote-debugging-port=9333 --use-mock-keychain … about:blank
//   3. node docs/careers/live_shots.mjs phone1|phone3|desktop|closed|submit [--block-open]
//
// --block-open fails the page's {action:"open"} request, so the form stays
// up whatever staging answers (an unreachable server keeps the form; the
// token is asked for on send). Without it, the page shows what staging
// really says — with the flag off, the closed panel.
//
// `submit` fills everything, attaches the files and sends for real: a row
// in staging's job_applications. Never run it against production.
import { writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = process.env.CAREERS_URL || 'http://localhost:4321/careers?s=poster';
const CDP = process.env.CDP || 'http://127.0.0.1:9333';
const mode = process.argv[2] || 'phone1';
const blockOpen = process.argv.includes('--block-open');
const outName = process.argv.find((a) => a.startsWith('--out='))?.slice(6);

const targets = await (await fetch(CDP + '/json')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let seq = 0;
const pending = new Map();
const listeners = [];
ws.onmessage = (m) => {
	const msg = JSON.parse(m.data);
	if (msg.id && pending.has(msg.id)) {
		const { resolve, reject } = pending.get(msg.id);
		pending.delete(msg.id);
		msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
	} else if (msg.method) {
		listeners.forEach((l) => l(msg));
	}
};
const send = (method, params = {}) =>
	new Promise((resolve, reject) => {
		const id = ++seq;
		pending.set(id, { resolve, reject });
		ws.send(JSON.stringify({ id, method, params }));
	});
const once = (method, test = () => true) =>
	new Promise((resolve) => {
		const l = (msg) => {
			if (msg.method === method && test(msg.params)) {
				listeners.splice(listeners.indexOf(l), 1);
				resolve(msg.params);
			}
		};
		listeners.push(l);
	});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression, awaitPromise = false) => {
	const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
	if (r.exceptionDetails) throw new Error('evaluate: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
	return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
// Set either way: the tab is reused between runs and keeps the last list.
await send('Network.setBlockedURLs', { urls: blockOpen ? ['*/functions/v1/job_application'] : [] });

const phone = mode !== 'desktop';
const width = phone ? 390 : 1280;
await send('Emulation.setDeviceMetricsOverride', { width, height: phone ? 844 : 900, deviceScaleFactor: phone ? 2 : 1, mobile: phone });

await send('Page.navigate', { url: PAGE });
await once('Page.loadEventFired');
await evaluate('document.fonts.ready.then(() => true)', true);
await sleep(2500); // the open answer (or its failure) and the step animation
console.log('state:', await evaluate('document.querySelector("[data-cr]").dataset.state'),
	'| viewport', await evaluate('window.innerWidth + "x" + window.innerHeight'),
	'| scrollWidth', await evaluate('document.documentElement.scrollWidth'));

// ---------------------------------------------------------------- drive the form
const fill = `
	const set = (name, v) => { const el = document.querySelector('[name="' + name + '"]'); el.value = v;
		el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
	const pick = (name, v) => document.querySelector('input[name="' + name + '"][value="' + v + '"]').click();
	const next = () => document.querySelector('#cr-next').click();
	window.__drive = { set, pick, next };
	true`;
await evaluate(fill);

const step1 = `(() => { const d = window.__drive;
	d.set('full_name', 'لمى حداد'); d.set('phone', '0944000123'); d.set('email', 'lama@example.com');
	d.set('residence', 'القصاع'); d.pick('military_status', 'not_applicable'); return true; })()`;
const step2 = `(() => { const d = window.__drive;
	d.set('degree_level', 'bachelor'); d.set('university', 'جامعة دمشق'); d.pick('degree_field', 'pharmacy');
	d.pick('sales_experience', '1_2'); d.pick('medical_sector', 'yes'); d.set('medical_sector_detail', 'مندوبة طبية — شركة أدوية');
	d.set('last_employer', 'مندوبة طبية — شركة أدوية');
	d.set('achievement', 'أقنعت عيادة كانت تعمل بالورق بالانتقال إلى برنامج إلكتروني خلال شهر، وبقيت العيادة مشتركة بعد سنة.');
	return true; })()`;
const step3 = `(() => { const d = window.__drive;
	d.pick('areas', 'mazzeh'); d.pick('areas', 'rawda_malki_abu_rummaneh'); d.pick('start_availability', 'immediately');
	d.pick('has_transport', 'no'); d.set('linkedin_url', 'linkedin.com/in/lama-haddad');
	d.set('message', 'أعرف عيادات المزة جيداً وأستطيع البدء فوراً.'); return true; })()`;

async function attach(selector, paths) {
	const { root } = await send('DOM.getDocument', { depth: 1 });
	const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
	await send('DOM.setFileInputFiles', { nodeId, files: paths });
	await sleep(200);
}

if (mode === 'phone3' || mode === 'submit') {
	await evaluate(step1);
	await evaluate('window.__drive.next(); true');
	await sleep(400);
	await evaluate(step2);
	await evaluate('window.__drive.next(); true');
	await sleep(400);
	await evaluate(step3);
	const files = process.env.CAREERS_FILES ? process.env.CAREERS_FILES.split(',') : [];
	if (files[0]) await attach('#cr-cv', [files[0]]);
	if (files[1]) await attach('#cr-extra', [files[1]]);
	await sleep(300);
	const step = await evaluate('[...document.querySelectorAll("[data-step]")].find((s) => !s.hidden)?.dataset.step');
	console.log('on step', step);
}

if (mode === 'submit') {
	await evaluate('window.__drive.next(); true');
	// wait for the thank-you, the failure box, or the closed panel — up to 4 minutes
	const started = Date.now();
	let outcome = '';
	while (Date.now() - started < 250_000) {
		await sleep(1000);
		outcome = await evaluate(`(() => {
			const r = document.querySelector('[data-cr]');
			const label = document.querySelector('[data-progress-label]')?.textContent || '';
			if (r.dataset.state === 'thanks') return 'thanks:' + (document.querySelector('[data-code]')?.textContent || '');
			if (r.dataset.state === 'closed') return 'closed';
			const fail = document.querySelector('#cr-fail');
			if (fail && !fail.hidden) return 'fail:' + document.querySelector('#cr-fail-title').textContent;
			const err = [...document.querySelectorAll('.err')].filter((e) => !e.hidden).map((e) => e.id + '=' + e.textContent);
			if (err.length && document.querySelector('[data-actions]') && !document.querySelector('[data-actions]').hidden) return 'invalid:' + err.join('|');
			return 'busy:' + label; })()`);
		if (!outcome.startsWith('busy')) break;
		process.stdout.write('\r' + outcome + '   ');
	}
	console.log('\noutcome:', outcome);
}

// ---------------------------------------------------------------- shoot
await evaluate('window.scrollTo(0, 0); true');
await sleep(300);
const height = await evaluate('Math.ceil(document.documentElement.scrollHeight)');
// The viewport keeps its size; captureBeyondViewport renders the rest. (Resizing
// the viewport to the page height shifts a desktop RTL layout sideways.)
const shot = await send('Page.captureScreenshot', {
	format: 'png',
	captureBeyondViewport: true,
	clip: { x: 0, y: 0, width, height, scale: 1 },
});
const file = outName && isAbsolute(outName) ? outName : join(HERE, outName || `live-${mode === 'desktop' ? 'desktop' : mode === 'closed' ? 'closed' : mode === 'submit' ? 'thanks' : 'phone-step' + mode.slice(-1)}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));
console.log('wrote', file, `${width}x${height}`);
ws.close();

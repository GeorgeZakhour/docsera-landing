// The application form at /careers: a three-step wizard that posts ONE
// request — the fields and the files together — to the edge function
// `job_application` (DocSera-Pro).
//
// Two halves:
//   1. The send path (askOpen from the Pro form, submitApplication) — contract
//      C0. It takes its network, its XHR and its clock as arguments, so
//      careers-flow.test.ts runs it without a browser.
//   2. The page (initCareers) — steps, inline errors, the draft, the file
//      rows, the progress bar, and what the applicant sees for each answer.
//
// Transport: multipart/form-data through XMLHttpRequest (fetch has no upload
// progress), parts `token`, `hp`, `source`, `form` (JSON string), `cv`, and
// one `extra` per extra file — the plan's default. The edge function reads
// exactly these parts (handler.ts). Its header records the staging probe
// of this transport (plan A1).
//
// This module must stay importable outside a browser: no DOM access at the
// top level, and nothing imported that reads `import.meta.env`. The page
// passes in what comes from there (endpoint, key, beacon, the WhatsApp
// link) — see careers.astro.

import {
	FAILURE_COPY,
	FIELD_ERRORS,
	NEXT_LABEL,
	SEND_LABEL,
	sendingLabel,
	stepLabel,
	whatsappTextWithCode,
} from '../config/careers.ts';
import { careersWhatsAppUrl } from '../config/links.ts';
import { MIN_TOKEN_AGE_MS, askOpen, cleanCode } from './pro-join.ts';
import type { Clock, JoinApi, Token, TokenBox } from './pro-join.ts';
import {
	checkAnswers,
	checkFileChoice,
	draftOf,
	fileExt,
	firstBadStep,
	flattenLines,
	formatBytes,
	knownFields,
	latinDigits,
	reviveAnswers,
	stepOfField,
	validateStep,
} from './careers-validate.ts';
import type { CareersAnswers, CareersForm, FileKind, Step } from './careers-validate.ts';

export { MIN_TOKEN_AGE_MS, askOpen, cleanCode } from './pro-join.ts';
export type { Clock, Token, TokenBox } from './pro-join.ts';

// ================================================================ send path

/** Waited on top of MIN_TOKEN_AGE_MS, so the token is past the line when the request lands. */
const TOKEN_AGE_SLACK_MS = 250;
/** The whole send, a 16 MB CV on a slow line included. */
export const SUBMIT_TIMEOUT_MS = 240_000;
/** Without an upload-progress event for this long, the line is dead. */
export const STALL_MS = 45_000;

/** The slice of XMLHttpRequest the send path uses — a test hands in a fake. */
export interface XhrLike {
	open(method: string, url: string): void;
	setRequestHeader(name: string, value: string): void;
	send(body: FormData): void;
	abort(): void;
	upload: { onprogress: ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null };
	onload: (() => void) | null;
	onerror: (() => void) | null;
	onabort: (() => void) | null;
	ontimeout: (() => void) | null;
	readonly status: number;
	readonly responseText: string;
}

export interface CareersApi extends JoinApi {
	/** A fresh request for each send. */
	xhr(): XhrLike;
}

export interface SubmitRequest {
	form: CareersForm;
	cv: File;
	extras: File[];
	/** The honeypot's value, sent as it is. */
	hp: string;
	source: string;
}

export type SubmitOutcome =
	| { kind: 'accepted'; code: string }
	| { kind: 'invalid'; fields: string[] }
	/** Refused twice for its token; the applicant decides whether to try again. */
	| { kind: 'retry' }
	/** The network has sent too much, or the server failed; nothing is resent on its own. */
	| { kind: 'busy' }
	| { kind: 'closed' }
	/** The server's limit is the page's limit: this reaches only a tampered page. */
	| { kind: 'too_large' }
	/** No network, a timeout, a stall, or an answer outside the contract. */
	| { kind: 'failed' };

export type ProgressReport = (sent: number, total: number) => void;

/** Resolves once the token is old enough for the server to accept it. */
function oldEnough(clock: Clock, token: Token): Promise<void> {
	const full = MIN_TOKEN_AGE_MS + TOKEN_AGE_SLACK_MS;
	// Capped: a device clock set back while the page was open must not turn
	// four seconds into an hour.
	const wait = Math.min(full - (clock.now() - token.at), full);
	if (wait <= 0) return Promise.resolve();
	return new Promise((resolve) => {
		clock.setTimer(resolve, wait);
	});
}

/** The multipart body of one submit, as the server reads it. */
export function buildBody(token: string, request: SubmitRequest): FormData {
	const body = new FormData();
	body.append('token', token);
	body.append('hp', request.hp);
	body.append('source', request.source);
	body.append('form', JSON.stringify(request.form));
	body.append('cv', request.cv, request.cv.name);
	for (const extra of request.extras) body.append('extra', extra, extra.name);
	return body;
}

/**
 * One multipart POST. Resolves with the status and the parsed body (null when
 * the status is not 200 or the body is not JSON); rejects on a network
 * failure, the overall timeout, or a stall. Both timers run on the injected
 * clock, never on the XHR's own, so a test can move time by hand.
 */
function upload(api: CareersApi, body: FormData, onProgress: ProgressReport): Promise<{ status: number; data: unknown }> {
	return new Promise((resolve, reject) => {
		const xhr = api.xhr();
		let settled = false;
		let stall: unknown = null;
		const overall = api.clock.setTimer(() => fail('timeout'), SUBMIT_TIMEOUT_MS);

		const clear = (): void => {
			api.clock.clearTimer(overall);
			if (stall !== null) api.clock.clearTimer(stall);
		};
		const fail = (why: string): void => {
			if (settled) return;
			settled = true;
			clear();
			try {
				xhr.abort();
			} catch { /* already gone */ }
			reject(new Error(why));
		};
		const armStall = (): void => {
			if (stall !== null) api.clock.clearTimer(stall);
			stall = api.clock.setTimer(() => fail('stall'), STALL_MS);
		};

		xhr.upload.onprogress = (event) => {
			if (settled) return;
			armStall();
			if (event.lengthComputable) onProgress(event.loaded, event.total);
		};
		xhr.onload = () => {
			if (settled) return;
			settled = true;
			clear();
			let data: unknown = null;
			if (xhr.status === 200) {
				try {
					data = JSON.parse(xhr.responseText);
				} catch {
					data = null;
				}
			}
			resolve({ status: xhr.status, data });
		};
		xhr.onerror = () => fail('network');
		xhr.onabort = () => fail('abort');
		xhr.ontimeout = () => fail('timeout');

		try {
			xhr.open('POST', api.endpoint);
			xhr.setRequestHeader('apikey', api.anonKey);
			xhr.setRequestHeader('Authorization', 'Bearer ' + api.anonKey);
			// No Content-Type: the browser writes the multipart boundary itself.
			armStall();
			xhr.send(body);
		} catch (e) {
			fail('send');
		}
	});
}

/**
 * Send one application and reduce whatever happens to an outcome the page
 * can show. Never rejects.
 *
 * A token is always in hand, and at least four seconds old, before anything
 * is sent (the Pro form's rule — see submitRequest there). A `retry` from
 * the server means the token is expired or no longer recognised: it is
 * replaced and the request resent once, files and all, without the
 * applicant doing anything. A second `retry` is handed back.
 */
export async function submitApplication(
	api: CareersApi,
	box: TokenBox,
	request: SubmitRequest,
	onProgress: ProgressReport = () => {},
): Promise<SubmitOutcome> {
	for (let attempt = 1; ; attempt++) {
		if (!box.token) {
			const opened = await askOpen(api);
			if (opened.kind === 'closed') return { kind: 'closed' };
			if (opened.kind === 'unreachable') return { kind: 'failed' };
			box.token = opened.token;
		}
		await oldEnough(api.clock, box.token);

		let answer: { status: number; data: unknown };
		try {
			answer = await upload(api, buildBody(box.token.value, request), onProgress);
		} catch {
			return { kind: 'failed' };
		}

		const data = record(answer.data);
		switch (data.status) {
			case 'accepted':
				return { kind: 'accepted', code: cleanCode(data.code) };
			case 'invalid':
				return { kind: 'invalid', fields: knownFields(data.fields) };
			case 'closed':
				return { kind: 'closed' };
			case 'busy':
				return { kind: 'busy' };
			case 'too_large':
				return { kind: 'too_large' };
			case 'retry':
				box.token = null;
				if (attempt === 2) return { kind: 'retry' };
				continue;
			default:
				return { kind: 'failed' };
		}
	}
}

function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

// ================================================================ history

/**
 * What this page keeps in `history.state`. Each step is its own entry, so
 * the phone's Back button walks the steps instead of leaving the form; the
 * finished application replaces its entry, so coming Back to it (or
 * reloading) shows the thank-you again and never a form ready to be sent
 * twice.
 */
export interface Entry {
	cr: Step | 'done';
	/** How many entries of this form lie below this one. */
	d: number;
	/** True when the entry below is the step before this one. */
	prev: boolean;
	code?: string;
}

/** `history.state` read back — it survives reloads and is not ours to trust. */
export function parseEntry(state: unknown): Entry | null {
	const s = record(state);
	const d = typeof s.d === 'number' && Number.isInteger(s.d) && s.d >= 0 && s.d < 100 ? s.d : 0;
	if (s.cr === 'done') return { cr: 'done', d, prev: false, code: cleanCode(s.code) };
	if (s.cr === 1 || s.cr === 2 || s.cr === 3) return { cr: s.cr, d, prev: s.prev === true && s.cr > 1 };
	return null;
}

// ================================================================ the page

export interface CareersPageEnv {
	endpoint: string;
	anonKey: string;
	/** The validated `?s=` tag, or `direct`. */
	source: string;
	/** `fireBeacon` from reach.ts. */
	beacon(eventName: string, category: string, dedupeKey: string | null, properties: Record<string, string>): void;
	/** The WhatsApp option, or null while no number is set (then nothing is drawn). */
	whatsappUrl: string | null;
}

const DRAFT_KEY = 'ds_careers_draft';

type View = 'form' | 'thanks' | 'closed';
type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function initCareers(env: CareersPageEnv): void {
	const root = document.querySelector<HTMLElement>('[data-cr]');
	const form = root?.querySelector<HTMLFormElement>('#cr-form');
	if (!root || !form) return;

	const one = <T extends HTMLElement>(selector: string): T => {
		const found = root.querySelector<T>(selector);
		if (!found) throw new Error('careers: missing ' + selector);
		return found;
	};
	const many = <T extends HTMLElement>(selector: string): T[] => Array.from(root.querySelectorAll<T>(selector));
	const named = <T extends Control>(name: string): T => one<T>(`[name="${name}"]`);

	const api: CareersApi = {
		fetch: (url, init) => fetch(url, init),
		xhr: () => new XMLHttpRequest() as unknown as XhrLike,
		clock: {
			now: () => Date.now(),
			setTimer: (fn, ms) => setTimeout(fn, ms),
			clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
		},
		endpoint: env.endpoint,
		anonKey: env.anonKey,
	};
	const box: TokenBox = { token: null };
	const tags = { source: env.source };

	// ---------------------------------------------------------- elements

	const views: Record<View, HTMLElement> = {
		form: one('[data-view="form"]'),
		thanks: one('[data-view="thanks"]'),
		closed: one('[data-view="closed"]'),
	};
	const card = one('[data-card]');
	const steps = many('[data-step]');
	const bars = many('[data-bar]');
	const stepName = one('#cr-stepname');
	const backButton = one<HTMLButtonElement>('#cr-back');
	const nextButton = one<HTMLButtonElement>('#cr-next');
	const nextLabel = one('[data-next-label]');
	const actions = one('[data-actions]');
	const progress = one('[data-progress]');
	const progressBar = one('[data-progress-bar]');
	const progressLabel = one('[data-progress-label]');
	const consent = one('[data-consent]');
	const failure = one('#cr-fail');
	const failureTitle = one('#cr-fail-title');
	const failureBody = one('#cr-fail-body');
	const retryButton = one<HTMLButtonElement>('#cr-retry');

	const honeypot = named<HTMLInputElement>('reference');
	const whatsappSame = named<HTMLInputElement>('whatsapp_same');
	const degreeLevel = named<HTMLSelectElement>('degree_level');
	const cvInput = named<HTMLInputElement>('cv');
	const extraInput = named<HTMLInputElement>('extra');
	const fileLists: Record<FileKind, HTMLElement> = {
		cv: one('[data-files="cv"]'),
		extra: one('[data-files="extra"]'),
	};
	const dropTitles: Record<FileKind, HTMLElement> = {
		cv: one('[data-drop="cv"] [data-drop-title]'),
		extra: one('[data-drop="extra"] [data-drop-title]'),
	};
	const dropTitleCopy: Record<FileKind, [string, string]> = {
		cv: ['اختر ملف السيرة الذاتية', 'استبدل ملف السيرة الذاتية'],
		extra: ['أضف ملفاً', 'أضف ملفاً آخر'],
	};

	let view: View = 'form';
	let step: Step = 1;
	let entry: Entry = { cr: 1, d: 0, prev: false };
	let busy = false;
	let doneCode = '';
	/** The chosen files: the only state the DOM does not hold (a file input cannot be edited). */
	const files: { cv: File | null; extras: File[] } = { cv: null, extras: [] };
	/** The optional radio groups' current answer, so a second tap can take it back. */
	const optional: Record<string, string> = { military_status: '', has_transport: '' };
	/** Set while the browser's Forward button is being turned back from a step not reached yet. */
	let turnedBack = false;

	// ---------------------------------------------------------- answers

	function readAnswers(): CareersAnswers {
		const value = (name: string): string => named<Control>(name).value;
		const picked = (name: string): string[] =>
			many<HTMLInputElement>(`input[name="${name}"]:checked`).map((input) => input.value);
		const yesNo = (name: string): boolean | null => {
			const v = picked(name)[0];
			return v === 'yes' ? true : v === 'no' ? false : null;
		};
		return {
			full_name: value('full_name'),
			phone: value('phone'),
			whatsapp_same: whatsappSame.checked,
			whatsapp: value('whatsapp'),
			email: value('email'),
			residence: value('residence'),
			military_status: picked('military_status')[0] ?? '',
			degree_level: degreeLevel.value,
			degree_field: picked('degree_field')[0] ?? '',
			degree_field_other: value('degree_field_other'),
			university: value('university'),
			sales_experience: picked('sales_experience')[0] ?? '',
			medical_sector: yesNo('medical_sector'),
			medical_sector_detail: value('medical_sector_detail'),
			last_employer: value('last_employer'),
			achievement: flattenLines(value('achievement')),
			areas: picked('areas'),
			start_availability: picked('start_availability')[0] ?? '',
			has_transport: yesNo('has_transport'),
			linkedin_url: value('linkedin_url'),
			message: flattenLines(value('message')),
			cvFile: files.cv,
			extraFiles: [...files.extras],
		};
	}

	function writeAnswers(a: CareersAnswers): void {
		const check = (name: string, values: string[]): void => {
			many<HTMLInputElement>(`input[name="${name}"]`).forEach((input) => {
				input.checked = values.includes(input.value);
			});
		};
		const yesNo = (v: boolean | null): string[] => (v === true ? ['yes'] : v === false ? ['no'] : []);
		named<HTMLInputElement>('full_name').value = a.full_name;
		named<HTMLInputElement>('phone').value = a.phone;
		whatsappSame.checked = a.whatsapp_same;
		named<HTMLInputElement>('whatsapp').value = a.whatsapp;
		named<HTMLInputElement>('email').value = a.email;
		named<HTMLInputElement>('residence').value = a.residence;
		check('military_status', [a.military_status]);
		degreeLevel.value = a.degree_level;
		if (degreeLevel.value !== a.degree_level) degreeLevel.value = '';
		check('degree_field', [a.degree_field]);
		named<HTMLInputElement>('degree_field_other').value = a.degree_field_other;
		named<HTMLInputElement>('university').value = a.university;
		check('sales_experience', [a.sales_experience]);
		check('medical_sector', yesNo(a.medical_sector));
		named<HTMLInputElement>('medical_sector_detail').value = a.medical_sector_detail;
		named<HTMLInputElement>('last_employer').value = a.last_employer;
		named<HTMLTextAreaElement>('achievement').value = a.achievement;
		check('areas', a.areas);
		check('start_availability', [a.start_availability]);
		check('has_transport', yesNo(a.has_transport));
		named<HTMLInputElement>('linkedin_url').value = a.linkedin_url;
		named<HTMLTextAreaElement>('message').value = a.message;
	}

	/** Fields that exist only on one branch: shown with it, hidden without it. */
	function syncBranches(): void {
		const picked = (name: string): string => many<HTMLInputElement>(`input[name="${name}"]:checked`)[0]?.value ?? '';
		one('[data-branch="whatsapp"]').hidden = whatsappSame.checked;
		one('[data-branch="degree_field_other"]').hidden = picked('degree_field') !== 'other';
		one('[data-branch="medical_sector_detail"]').hidden = picked('medical_sector') !== 'yes';
		// A select has no placeholder attribute; an unanswered one is dimmed like one.
		degreeLevel.classList.toggle('is-empty', degreeLevel.value === '');
		// The area cards colour as a whole, not only their box.
		many<HTMLElement>('.chk').forEach((chk) => {
			chk.classList.toggle('on', chk.querySelector<HTMLInputElement>('input')?.checked === true);
		});
	}

	// ---------------------------------------------------------- files

	function renderFiles(kind: FileKind): void {
		const list = fileLists[kind];
		list.textContent = '';
		const chosen = kind === 'cv' ? (files.cv ? [files.cv] : []) : files.extras;
		chosen.forEach((file, index) => {
			const row = document.createElement('div');
			row.className = 'file';
			const ext = document.createElement('span');
			ext.className = 'ext';
			ext.textContent = fileExt(file.name);
			ext.dataset.ext = fileExt(file.name);
			const name = document.createElement('span');
			name.className = 'name';
			name.textContent = file.name;
			const size = document.createElement('span');
			size.className = 'sz en';
			size.textContent = formatBytes(file.size);
			const remove = document.createElement('button');
			remove.type = 'button';
			remove.className = 'rm';
			remove.setAttribute('aria-label', 'إزالة ' + file.name);
			remove.textContent = '×';
			remove.addEventListener('click', () => {
				if (busy) return;
				if (kind === 'cv') files.cv = null;
				else files.extras.splice(index, 1);
				renderFiles(kind);
				clearSlot(errorSlot(kind));
				clearSlot(errorSlot('files_total'));
			});
			row.append(ext, name, size, remove);
			list.append(row);
		});
		dropTitles[kind].textContent = dropTitleCopy[kind][chosen.length > 0 ? 1 : 0];
	}

	/** Files the applicant has just picked: each is taken or refused on the spot, with the reason. */
	function takeFiles(kind: FileKind, picked: FileList | null): void {
		if (!picked || picked.length === 0) return;
		clearSlot(errorSlot(kind));
		clearSlot(errorSlot('files_total'));
		let refused = '';
		for (const file of Array.from(picked)) {
			const reason = checkFileChoice(file, kind, readAnswers());
			if (reason) {
				refused = reason;
				break; // the ones before it are kept; the rest wait for a new choice
			}
			if (kind === 'cv') files.cv = file;
			else files.extras.push(file);
		}
		renderFiles(kind);
		if (refused) {
			const slot = errorSlot(kind);
			slot.textContent = refused;
			slot.hidden = false;
		}
	}

	// ---------------------------------------------------------- draft

	function loadDraft(): CareersAnswers | null {
		try {
			const stored = sessionStorage.getItem(DRAFT_KEY);
			return stored ? reviveAnswers(JSON.parse(stored)) : null;
		} catch {
			return null; // storage blocked, or not JSON
		}
	}

	function saveDraft(): void {
		try {
			sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draftOf(readAnswers())));
		} catch { /* storage blocked or full → the form still works */ }
	}

	function clearDraft(): void {
		try {
			sessionStorage.removeItem(DRAFT_KEY);
		} catch { /* nothing to clear */ }
	}

	// ---------------------------------------------------------- errors

	const RADIO_GROUPS = new Set([
		'military_status', 'degree_field', 'sales_experience', 'medical_sector', 'areas', 'start_availability', 'has_transport',
	]);

	/** The control a field's error belongs to — where focus goes. */
	function controlOf(field: string): HTMLElement {
		if (RADIO_GROUPS.has(field)) return many<HTMLInputElement>(`input[name="${field}"]`)[0];
		switch (field) {
			case 'cv':
				return cvInput;
			case 'extra':
			case 'files_total':
				return extraInput;
			default:
				return named(field);
		}
	}

	function errorSlot(field: string): HTMLElement {
		return one('#cr-err-' + field);
	}

	function clearSlot(slot: HTMLElement): void {
		if (slot.hidden) return;
		slot.hidden = true;
		slot.textContent = '';
		many(`[aria-describedby~="${slot.id}"]`).forEach((control) => control.removeAttribute('aria-invalid'));
	}

	/** Clear every error, or only those of one step. */
	function clearErrors(within: HTMLElement = root!): void {
		within.querySelectorAll<HTMLElement>('.err').forEach(clearSlot);
	}

	/** Write each field's message under it and move focus to the first one on screen. */
	function showErrors(fields: string[]): void {
		for (const field of fields) {
			const slot = errorSlot(field);
			slot.textContent = FIELD_ERRORS[field] ?? '';
			slot.hidden = false;
			many(`[aria-describedby~="${slot.id}"]`).forEach((control) => control.setAttribute('aria-invalid', 'true'));
		}
		const first = fields.find((field) => stepOfField(field) === step);
		if (first) controlOf(first).focus();
	}

	// ---------------------------------------------------------- steps

	function showStep(target: Step, moved: boolean): void {
		// Stepping back abandons the attempt that raised this step's errors;
		// they are not waiting for the applicant when he returns.
		if (target < step) clearErrors(steps[step - 1]);
		step = target;
		steps.forEach((el) => {
			el.hidden = Number(el.dataset.step) !== target;
		});
		bars.forEach((bar, index) => {
			bar.classList.toggle('active', index + 1 === target);
			bar.classList.toggle('done', index + 1 < target);
		});
		stepName.textContent = stepLabel(target); // aria-live announces the change
		backButton.hidden = target === 1;
		labelNext();
		consent.hidden = target !== 3;
		hideFailure();
		if (!moved) return;
		// Keyboard and screen-reader users continue from the top of the new
		// step, not from the button they just pressed at the bottom of the old.
		const shown = steps.find((el) => !el.hidden);
		shown?.focus({ preventScroll: true });
		if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start' });
	}

	/** The furthest step up to `target` whose earlier steps are all answered. */
	function reachable(target: Step): Step {
		const answers = readAnswers();
		for (const earlier of [1, 2] as const) {
			if (earlier < target && validateStep(earlier, answers).length > 0) return earlier;
		}
		return target;
	}

	function writeEntry(next: Entry, push: boolean): boolean {
		try {
			if (push) history.pushState(next, '');
			else history.replaceState(next, '');
			entry = next;
			return true;
		} catch {
			return false; // history unavailable → the buttons still work
		}
	}

	/** Change step without adding a history entry. */
	function moveInPlace(target: Step): void {
		if (!writeEntry({ cr: target, d: entry.d, prev: false }, false)) entry = { cr: target, d: entry.d, prev: false };
		showStep(target, true);
	}

	function goNext(): void {
		const refused = validateStep(step, readAnswers());
		// Only this step's errors: one the server raised on a later step stays
		// until the applicant gets there.
		clearErrors(steps[step - 1]);
		if (refused.length > 0) {
			showErrors(refused);
			return;
		}
		const target = (step + 1) as Step;
		if (!writeEntry({ cr: target, d: entry.d + 1, prev: true }, true)) {
			entry = { cr: target, d: entry.d, prev: false };
		}
		showStep(target, true);
		// Once per session and step, so the funnel counts visitors, not taps.
		env.beacon('careers_step', 'acquisition', 'ds_careers_step_' + target, { ...tags, step: String(target) });
	}

	function goBack(): void {
		if (step === 1 || busy) return;
		if (entry.prev) {
			history.back(); // popstate shows the step
			return;
		}
		moveInPlace((step - 1) as Step);
	}

	// ---------------------------------------------------------- views

	function showView(next: View): void {
		view = next;
		root!.dataset.state = next; // the side panel follows it
		(Object.keys(views) as View[]).forEach((name) => {
			views[name].hidden = name !== next;
		});
		if (next === 'closed') env.beacon('careers_closed_seen', 'acquisition', 'ds_careers_closed', tags);
		if (next === 'form') return;
		views[next].querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
		if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start' });
	}

	function showThanks(code: string): void {
		doneCode = code;
		one('[data-code]').textContent = code;
		one('[data-code-row]').hidden = code === '';
		const hint = root!.querySelector<HTMLElement>('[data-code-hint]');
		if (hint) hint.hidden = code === '';
		// The WhatsApp button exists only when the number is set (ruling 9).
		const wa = root!.querySelector<HTMLAnchorElement>('a[data-wa="thanks"]');
		const url = careersWhatsAppUrl(whatsappTextWithCode(code));
		if (wa && url) wa.href = url;
		showView('thanks');
	}

	function showFailure(kind: keyof typeof FAILURE_COPY): void {
		failureTitle.textContent = FAILURE_COPY[kind].title;
		failureBody.textContent = FAILURE_COPY[kind].body;
		failure.hidden = false;
		failure.scrollIntoView({ block: 'nearest' });
	}

	function hideFailure(): void {
		failure.hidden = true;
	}

	function setProgress(sent: number, total: number): void {
		const percent = total > 0 ? Math.min(100, Math.floor((sent / total) * 100)) : 0;
		progressBar.style.width = percent + '%';
		progressLabel.textContent = sendingLabel(percent);
	}

	/** While sending, the progress bar replaces the buttons. */
	function setBusy(on: boolean): void {
		busy = on;
		nextButton.disabled = on;
		backButton.disabled = on;
		retryButton.disabled = on;
		form!.setAttribute('aria-busy', String(on));
		actions.hidden = on;
		progress.hidden = !on;
		if (on) setProgress(0, 1);
		labelNext();
	}

	function labelNext(): void {
		nextLabel.textContent = step === 3 ? SEND_LABEL : NEXT_LABEL;
	}

	// ---------------------------------------------------------- sending

	/** Send the applicant back to the earliest step holding a refused field. */
	function refuse(fields: string[]): void {
		const target = firstBadStep(fields);
		if (target !== null && target !== step) moveInPlace(target);
		clearErrors();
		showErrors(fields);
		// A refused field the applicant cannot see — one on a branch he did
		// not take — must not leave him with a form that silently will not send.
		const shown = many('.err').some((slot) => slot.getClientRects().length > 0);
		if (!shown) showFailure('invalid');
	}

	async function send(): Promise<void> {
		if (busy) return;
		const checked = checkAnswers(readAnswers());
		if (!checked.ok || !files.cv) {
			refuse(checked.ok ? ['cv'] : checked.fields);
			return;
		}
		clearErrors();
		hideFailure();
		setBusy(true);
		const outcome = await submitApplication(
			api,
			box,
			{ form: checked.form, cv: files.cv, extras: [...files.extras], hp: honeypot.value, source: tags.source },
			setProgress,
		);
		setBusy(false);

		switch (outcome.kind) {
			case 'accepted':
				clearDraft();
				env.beacon('careers_submitted', 'acquisition', null, tags);
				// Replace, never push: Back from here must not reach a filled form.
				writeEntry({ cr: 'done', d: entry.d, prev: false, code: outcome.code }, false);
				showThanks(outcome.code);
				break;
			case 'invalid':
				if (outcome.fields.length > 0) refuse(outcome.fields);
				else showFailure('invalid');
				break;
			case 'too_large':
				refuse(['files_total']);
				showFailure('too_large');
				break;
			case 'closed':
				showView('closed');
				break;
			case 'retry':
				showFailure('retry');
				break;
			case 'busy':
			case 'failed':
				showFailure('failed'); // the draft is kept, the files stay chosen
				break;
		}
	}

	// ---------------------------------------------------------- wiring

	form.addEventListener('submit', (event) => {
		event.preventDefault();
		if (busy) return;
		if (step < 3) goNext();
		else void send();
	});
	backButton.addEventListener('click', goBack);
	retryButton.addEventListener('click', () => void send());

	// The two number fields show Latin digits whatever the keyboard (the Pro
	// form's rule). latinDigits maps one character to one, so the caret is
	// put back exactly where the applicant left it.
	const NUMBER_FIELDS = new Set(['phone', 'whatsapp']);
	const keepLatinDigits = (field: HTMLInputElement): void => {
		const latin = latinDigits(field.value);
		if (latin === field.value) return;
		const start = field.selectionStart;
		const end = field.selectionEnd;
		field.value = latin;
		try {
			if (start !== null && end !== null) field.setSelectionRange(start, end);
		} catch { /* a field that has no caret to restore */ }
	};

	// Two controls share an error with their neighbour.
	const SHARED_SLOT: Record<string, string> = { whatsapp_same: 'whatsapp' };

	const onEdit = (event: Event): void => {
		const target = event.target as Control;
		if (target === honeypot || view !== 'form') return;
		if (target === cvInput || target === extraInput) return; // handled below
		if (NUMBER_FIELDS.has(target.name)) keepLatinDigits(target as HTMLInputElement);
		if (target.name in optional) optional[target.name] = target.value;
		syncBranches();
		const slot = root.querySelector<HTMLElement>('#cr-err-' + (SHARED_SLOT[target.name] ?? target.name));
		if (slot) clearSlot(slot);
		saveDraft();
	};
	form.addEventListener('input', onEdit);
	form.addEventListener('change', onEdit);

	cvInput.addEventListener('change', () => {
		if (busy) return;
		takeFiles('cv', cvInput.files);
		cvInput.value = ''; // the state holds the file; the input is free for the next choice
	});
	extraInput.addEventListener('change', () => {
		if (busy) return;
		takeFiles('extra', extraInput.files);
		extraInput.value = '';
	});

	// The optional questions: a second tap on the chosen answer takes it
	// back, which a radio group does not do on its own. `optional` still
	// holds the answer from before this click — a new choice is recorded by
	// the change event, which fires after it.
	many<HTMLInputElement>('input[data-optional]').forEach((radio) => {
		radio.addEventListener('click', () => {
			if (optional[radio.name] !== radio.value) return;
			radio.checked = false;
			optional[radio.name] = '';
			syncBranches();
			saveDraft();
		});
	});

	many<HTMLAnchorElement>('a[data-wa]').forEach((link) => {
		link.addEventListener('click', () => {
			env.beacon('careers_whatsapp', 'acquisition', null, { ...tags, where: link.dataset.wa || 'form' });
		});
	});

	window.addEventListener('popstate', (event) => {
		const landed = parseEntry(event.state) ?? { cr: 1 as const, d: 0, prev: false };
		if (view !== 'form') {
			// The application is sent (or the form is closed). Back means
			// leaving the form, not walking its steps again: skip the entries below.
			const leaving = landed.d < entry.d;
			entry = landed;
			if (view === 'thanks') writeEntry({ cr: 'done', d: landed.d, prev: false, code: doneCode }, false);
			if (leaving) {
				try {
					history.go(-(landed.d + 1));
				} catch { /* stay on the thank-you */ }
			}
			return;
		}
		const target = reachable(landed.cr === 'done' ? 1 : landed.cr);
		entry = landed;
		if (target !== landed.cr) {
			// Forward onto a step whose earlier answers do not hold. Its own
			// entry is still below: go there rather than relabel this one.
			turnedBack = true;
			if (landed.prev) {
				history.back();
				return;
			}
			writeEntry({ cr: target, d: landed.d, prev: false }, false);
		}
		showStep(target, true);
		if (turnedBack) {
			turnedBack = false;
			showErrors(validateStep(target, readAnswers())); // why he is here
		}
	});

	// ---------------------------------------------------------- start

	const restored = parseEntry(history.state);
	if (restored?.cr === 'done') {
		// Reloaded, or came Back to, an application that was already sent.
		entry = restored;
		showThanks(restored.code ?? '');
		return;
	}

	const draft = loadDraft();
	if (draft) {
		// Anything typed while this script was still loading is newer than the draft.
		const typed = readAnswers();
		const text = [
			'full_name', 'phone', 'whatsapp', 'email', 'residence', 'degree_field_other', 'university',
			'medical_sector_detail', 'last_employer', 'achievement', 'linkedin_url', 'message',
		] as const;
		for (const key of text) if (typed[key] !== '') draft[key] = typed[key];
		writeAnswers(draft);
	}
	const current = readAnswers();
	optional.military_status = current.military_status;
	optional.has_transport = current.has_transport === true ? 'yes' : current.has_transport === false ? 'no' : '';
	syncBranches();
	renderFiles('cv');
	renderFiles('extra');

	// Files never survive a reload, so a restored step 3 is reached through
	// the earlier steps' answers only; the CV is asked for again on send.
	const start = reachable(restored ? restored.cr : 1);
	writeEntry({ cr: start, d: restored?.d ?? 0, prev: restored?.cr === start ? restored.prev : false }, false);
	showStep(start, false);

	env.beacon('careers_opened', 'acquisition', 'ds_careers_opened', tags);

	void askOpen(api).then((answer) => {
		if (answer.kind === 'open') {
			if (!box.token) box.token = answer.token;
		} else if (answer.kind === 'closed' && view === 'form') {
			showView('closed');
		}
		// unreachable → the form stays; the token is asked for again on send.
	});
}

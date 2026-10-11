// The Pro request form at /pro/join: a three-step wizard that posts one
// request to the edge function `pro_join_request` (DocSera-Pro).
//
// Two halves:
//   1. The send path (askOpen, submitRequest) — contract C2. It takes its
//      network and its clock as arguments, so pro-join-flow.test.ts runs it
//      without a browser.
//   2. The page (initProJoin) — steps, inline errors, the draft, and what the
//      doctor sees for each answer.
//
// This module must stay importable outside a browser: no DOM access at the
// top level, and nothing imported that reads `import.meta.env`. The page
// passes in what comes from there (endpoint, key, beacon) — see join.astro.

import { proWhatsAppUrl } from '../config/links.ts';
import {
	FAILURE_COPY,
	FIELD_ERRORS,
	NEXT_LABEL,
	ROLE_COPY,
	SENDING_LABEL,
	SEND_LABEL,
	SPECIALTY_OTHER,
	stepLabel,
	whatsappTextWithCode,
} from '../config/pro-join.ts';
import {
	checkAnswers,
	cleanCta,
	firstBadStep,
	flattenLines,
	knownFields,
	reviveAnswers,
	stepOfField,
	validateStep,
} from './pro-join-validate.ts';
import type { JoinAnswers, JoinForm, Role, Step } from './pro-join-validate.ts';

// ================================================================ send path

/** The server refuses a token younger than this (contract C2). */
export const MIN_TOKEN_AGE_MS = 4_000;
/** Waited on top, so the token is past the line when the request lands. */
const TOKEN_AGE_SLACK_MS = 250;
export const SUBMIT_TIMEOUT_MS = 20_000;
export const OPEN_TIMEOUT_MS = 10_000;

export interface Clock {
	now(): number;
	setTimer(fn: () => void, ms: number): unknown;
	clearTimer(handle: unknown): void;
}

export interface HttpAnswer {
	ok: boolean;
	status: number;
	json(): Promise<unknown>;
}

export type FetchLike = (
	url: string,
	init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<HttpAnswer>;

export interface JoinApi {
	fetch: FetchLike;
	clock: Clock;
	/** `{SUPABASE_URL}/functions/v1/pro_join_request` */
	endpoint: string;
	anonKey: string;
}

/** A form token and the moment it reached this page. */
export interface Token {
	value: string;
	at: number;
}

/** Where the page keeps its token between sends. */
export interface TokenBox {
	token: Token | null;
}

export interface SubmitRequest {
	/** The honeypot's value, sent as it is. */
	hp: string;
	source: string;
	cta: string;
	form: JoinForm;
}

export type OpenAnswer =
	| { kind: 'open'; token: Token }
	/** The server said no, or is not there: WhatsApp only. */
	| { kind: 'closed' }
	/** No usable answer: keep the form, ask again when sending. */
	| { kind: 'unreachable' };

export type SubmitOutcome =
	| { kind: 'accepted'; code: string }
	| { kind: 'invalid'; fields: string[] }
	/** Refused twice for its token; the doctor decides whether to try again. */
	| { kind: 'retry' }
	/** `busy`, no network, a timeout, or an answer outside the contract. */
	| { kind: 'failed' }
	| { kind: 'closed' };

/** One POST. Rejects when the network fails, the time runs out, or a 200 carries no JSON. */
async function call(api: JoinApi, payload: unknown, timeoutMs: number): Promise<{ status: number; data: unknown }> {
	const abort = typeof AbortController === 'function' ? new AbortController() : null;
	let timer: unknown;
	const timedOut = new Promise<never>((_, reject) => {
		timer = api.clock.setTimer(() => {
			abort?.abort();
			reject(new Error('timeout'));
		}, timeoutMs);
	});
	const exchange = (async () => {
		const res = await api.fetch(api.endpoint, {
			method: 'POST',
			headers: {
				apikey: api.anonKey,
				Authorization: 'Bearer ' + api.anonKey,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
			signal: abort?.signal,
		});
		// Every outcome in the contract is a 200. Anything else has no body we act on.
		return { status: res.status, data: res.status === 200 ? await res.json() : null };
	})();
	try {
		return await Promise.race([exchange, timedOut]);
	} finally {
		api.clock.clearTimer(timer);
	}
}

/** `{action:"open"}` — is the form taking requests, and with which token. */
export async function askOpen(api: JoinApi): Promise<OpenAnswer> {
	let answer: { status: number; data: unknown };
	try {
		answer = await call(api, { action: 'open' }, OPEN_TIMEOUT_MS);
	} catch {
		return { kind: 'unreachable' };
	}
	// Not 200 covers a function that is not deployed yet: the page then offers
	// WhatsApp alone, which makes an early deploy of this site harmless.
	if (answer.status !== 200) return { kind: 'closed' };
	const data = record(answer.data);
	if (data.open === false) return { kind: 'closed' };
	if (data.open === true && typeof data.token === 'string' && data.token !== '') {
		return { kind: 'open', token: { value: data.token, at: api.clock.now() } };
	}
	return { kind: 'unreachable' };
}

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

/**
 * Send one request and reduce whatever happens to an outcome the page can
 * show. Never rejects.
 *
 * A token is always in hand, and at least four seconds old, before anything
 * is sent — so a doctor whose connection dropped when the page opened loses
 * nothing: the token is fetched here, aged, and the request goes out. That
 * also means a `retry` from the server is never about a token being too
 * young; the token is expired or no longer recognised, so it is replaced and
 * the request is resent once without the doctor doing anything. A second
 * `retry` is handed back.
 */
export async function submitRequest(api: JoinApi, box: TokenBox, request: SubmitRequest): Promise<SubmitOutcome> {
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
			answer = await call(
				api,
				{
					action: 'submit',
					token: box.token.value,
					hp: request.hp,
					source: request.source,
					cta: request.cta,
					form: request.form,
				},
				SUBMIT_TIMEOUT_MS,
			);
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

/** A request code as the server writes it (`K7M-42Q`), or '' for anything else. */
export function cleanCode(raw: unknown): string {
	return typeof raw === 'string' && /^[A-Z0-9-]{4,12}$/.test(raw) ? raw : '';
}

// ================================================================ history

/**
 * What this page keeps in `history.state`. Each step is its own entry, so
 * the phone's Back button walks the steps instead of leaving the form; the
 * finished request replaces its entry, so coming Back to it (or reloading)
 * shows the thank-you again and never a form ready to be sent twice.
 */
export interface Entry {
	pj: Step | 'done';
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
	if (s.pj === 'done') return { pj: 'done', d, prev: false, code: cleanCode(s.code) };
	if (s.pj === 1 || s.pj === 2 || s.pj === 3) return { pj: s.pj, d, prev: s.prev === true && s.pj > 1 };
	return null;
}

// ================================================================ the page

export interface JoinPageEnv {
	endpoint: string;
	anonKey: string;
	/** The validated `?s=` tag, or `direct`. */
	source: string;
	/** `fireBeacon` from reach.ts. */
	beacon(eventName: string, category: string, dedupeKey: string | null, properties: Record<string, string>): void;
}

const DRAFT_KEY = 'ds_pro_join_draft';

type View = 'form' | 'thanks' | 'closed';
type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function initProJoin(env: JoinPageEnv): void {
	const root = document.querySelector<HTMLElement>('[data-pj]');
	const form = root?.querySelector<HTMLFormElement>('#pj-form');
	if (!root || !form) return;

	const one = <T extends HTMLElement>(selector: string): T => {
		const found = root.querySelector<T>(selector);
		if (!found) throw new Error('pro-join: missing ' + selector);
		return found;
	};
	const many = <T extends HTMLElement>(selector: string): T[] => Array.from(root.querySelectorAll<T>(selector));
	const named = <T extends Control>(name: string): T => one<T>(`[name="${name}"]`);

	const api: JoinApi = {
		fetch: (url, init) => fetch(url, init),
		clock: {
			now: () => Date.now(),
			setTimer: (fn, ms) => setTimeout(fn, ms),
			clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
		},
		endpoint: env.endpoint,
		anonKey: env.anonKey,
	};
	const box: TokenBox = { token: null };
	const tags = {
		source: env.source,
		cta: cleanCta(new URLSearchParams(window.location.search).get('cta')),
	};

	// ---------------------------------------------------------- elements

	const views: Record<View, HTMLElement> = {
		form: one('[data-view="form"]'),
		thanks: one('[data-view="thanks"]'),
		closed: one('[data-view="closed"]'),
	};
	const card = one('[data-card]');
	const steps = many('[data-step]');
	const bars = many('[data-bar]');
	const stepName = one('#pj-stepname');
	const backButton = one<HTMLButtonElement>('#pj-back');
	const nextButton = one<HTMLButtonElement>('#pj-next');
	const nextLabel = one('[data-next-label]');
	const consent = one('[data-consent]');
	const failure = one('#pj-fail');
	const failureTitle = one('#pj-fail-title');
	const failureBody = one('#pj-fail-body');
	const retryButton = one<HTMLButtonElement>('#pj-retry');

	const honeypot = named<HTMLInputElement>('reference');
	const whatsappSame = named<HTMLInputElement>('whatsapp_same');
	const specialty = named<HTMLSelectElement>('specialty');
	const governorate = named<HTMLSelectElement>('governorate');
	const placeName = named<HTMLInputElement>('place_name');
	const doctorsCount = named<HTMLInputElement>('doctors_count');
	const schedulingRadios = many<HTMLInputElement>('input[name="scheduling_method"]');
	// «متعدد الاختصاصات» is in the markup once; it is taken out of the list
	// for every role but the center owner (an <option> cannot be reliably
	// hidden on iOS, only removed).
	const multiOption = one<HTMLOptionElement>('option[data-multi]');
	const specialtyPlaceholder = one<HTMLOptionElement>('option[data-specialty-placeholder]');

	let view: View = 'form';
	let step: Step = 1;
	let entry: Entry = { pj: 1, d: 0, prev: false };
	let busy = false;
	let scheduling = '';
	let doneCode = '';
	/** Set while the browser's Forward button is being turned back from a step not reached yet. */
	let turnedBack = false;

	// ---------------------------------------------------------- answers

	function readAnswers(): JoinAnswers {
		const value = (name: string): string => named<Control>(name).value;
		const picked = (name: string): string[] =>
			many<HTMLInputElement>(`input[name="${name}"]:checked`).map((input) => input.value);
		return {
			role: picked('role')[0] ?? '',
			full_name: value('full_name'),
			phone: value('phone'),
			whatsapp_same: whatsappSame.checked,
			whatsapp: value('whatsapp'),
			specialty: specialty.value,
			specialty_other: value('specialty_other'),
			place_name: placeName.value,
			governorate: governorate.value,
			area: value('area'),
			doctors_count: doctorsCount.value,
			scheduling_method: picked('scheduling_method')[0] ?? '',
			competitor_name: value('competitor_name'),
			interests: picked('interests'),
			note: flattenLines(value('note')),
		};
	}

	function writeAnswers(a: JoinAnswers): void {
		const check = (name: string, values: string[]): void => {
			many<HTMLInputElement>(`input[name="${name}"]`).forEach((input) => {
				input.checked = values.includes(input.value);
			});
		};
		check('role', [a.role]);
		named<HTMLInputElement>('full_name').value = a.full_name;
		named<HTMLInputElement>('phone').value = a.phone;
		whatsappSame.checked = a.whatsapp_same;
		named<HTMLInputElement>('whatsapp').value = a.whatsapp;
		applyRole(); // the specialty list depends on the role
		specialty.value = a.specialty;
		if (specialty.value !== a.specialty) specialty.value = ''; // no longer on the list
		named<HTMLInputElement>('specialty_other').value = a.specialty_other;
		placeName.value = a.place_name;
		governorate.value = a.governorate;
		if (governorate.value !== a.governorate) governorate.value = '';
		named<HTMLInputElement>('area').value = a.area;
		doctorsCount.value = a.doctors_count;
		check('scheduling_method', [a.scheduling_method]);
		named<HTMLInputElement>('competitor_name').value = a.competitor_name;
		check('interests', a.interests);
		named<HTMLTextAreaElement>('note').value = a.note;
	}

	function currentRole(): Role {
		const role = many<HTMLInputElement>('input[name="role"]:checked')[0]?.value;
		return role === 'center_owner' || role === 'center_staff' ? role : 'clinic';
	}

	/** Step 2 reads differently for each role. */
	function applyRole(): void {
		const role = currentRole();
		const copy = ROLE_COPY[role];
		one('[data-specialty-label]').textContent = copy.specialtyLabel;
		specialtyPlaceholder.textContent = copy.specialtyPlaceholder;
		one('[data-place-label]').textContent = copy.placeLabel;
		one('[data-place-required]').hidden = !copy.placeRequired;
		one('[data-place-optional]').hidden = copy.placeRequired;
		placeName.placeholder = copy.placePlaceholder;
		placeName.required = copy.placeRequired;

		const offered = multiOption.parentNode === specialty;
		if (role === 'center_owner' && !offered) {
			specialtyPlaceholder.after(multiOption);
		} else if (role !== 'center_owner' && offered) {
			if (specialty.value === multiOption.value) specialty.value = '';
			multiOption.remove();
		}
	}

	/** Fields that exist only on one branch: shown with it, hidden without it. */
	function syncBranches(): void {
		one('[data-branch="whatsapp"]').hidden = whatsappSame.checked;
		one('[data-branch="specialty_other"]').hidden = specialty.value !== SPECIALTY_OTHER;
		one('[data-branch="doctors_count"]').hidden = currentRole() !== 'center_owner';
		one('[data-branch="competitor_name"]').hidden = scheduling !== 'competitor';
		// A select has no placeholder attribute; an unanswered one is dimmed like one.
		specialty.classList.toggle('is-empty', specialty.value === '');
		governorate.classList.toggle('is-empty', governorate.value === '');
	}

	// ---------------------------------------------------------- draft

	function loadDraft(): JoinAnswers | null {
		try {
			const stored = sessionStorage.getItem(DRAFT_KEY);
			return stored ? reviveAnswers(JSON.parse(stored)) : null;
		} catch {
			return null; // storage blocked, or not JSON
		}
	}

	function saveDraft(): void {
		try {
			sessionStorage.setItem(DRAFT_KEY, JSON.stringify(readAnswers()));
		} catch { /* storage blocked or full → the form still works */ }
	}

	function clearDraft(): void {
		try {
			sessionStorage.removeItem(DRAFT_KEY);
		} catch { /* nothing to clear */ }
	}

	// ---------------------------------------------------------- errors

	/** The control a field's error belongs to — where focus goes. */
	function controlOf(field: string): HTMLElement {
		switch (field) {
			case 'whatsapp_same':
				return named('whatsapp');
			case 'specialty':
				return specialty.value === SPECIALTY_OTHER ? named('specialty_other') : specialty;
			case 'role':
			case 'scheduling_method':
			case 'interests':
				return many<HTMLInputElement>(`input[name="${field}"]`)[0];
			default:
				return named(field);
		}
	}

	function errorSlot(field: string): HTMLElement {
		return one('#pj-err-' + (field === 'whatsapp_same' ? 'whatsapp' : field));
	}

	function messageFor(field: string): string {
		if (field === 'place_name') return ROLE_COPY[currentRole()].placeError;
		if (field === 'specialty' && specialty.value === SPECIALTY_OTHER) return FIELD_ERRORS.specialty_other;
		return FIELD_ERRORS[field] ?? '';
	}

	function clearSlot(slot: HTMLElement): void {
		if (slot.hidden) return;
		slot.hidden = true;
		slot.textContent = '';
		many(`[aria-describedby~="${slot.id}"]`).forEach((control) => control.removeAttribute('aria-invalid'));
	}

	/** Clear every error, or only those of one step. */
	function clearErrors(within: HTMLElement = root!): void {
		within.querySelectorAll<HTMLElement>('.pj-err').forEach(clearSlot);
	}

	/** Write each field's message under it and move focus to the first one on screen. */
	function showErrors(fields: string[]): void {
		for (const field of fields) {
			const slot = errorSlot(field);
			slot.textContent = messageFor(field);
			slot.hidden = false;
			many(`[aria-describedby~="${slot.id}"]`).forEach((control) => control.setAttribute('aria-invalid', 'true'));
		}
		const first = fields.find((field) => stepOfField(field) === step);
		if (first) controlOf(first).focus();
	}

	// ---------------------------------------------------------- steps

	function showStep(target: Step, moved: boolean): void {
		// Stepping back abandons the attempt that raised this step's errors;
		// they are not waiting for the doctor when he returns.
		if (target < step) clearErrors(steps[step - 1]);
		step = target;
		steps.forEach((el) => {
			el.hidden = Number(el.dataset.step) !== target;
		});
		bars.forEach((bar, index) => bar.classList.toggle('on', index < target));
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
		if (!writeEntry({ pj: target, d: entry.d, prev: false }, false)) entry = { pj: target, d: entry.d, prev: false };
		showStep(target, true);
	}

	function goNext(): void {
		const refused = validateStep(step, readAnswers());
		// Only this step's errors: one the server raised on a later step stays
		// until the doctor gets there.
		clearErrors(steps[step - 1]);
		if (refused.length > 0) {
			showErrors(refused);
			return;
		}
		const target = (step + 1) as Step;
		if (!writeEntry({ pj: target, d: entry.d + 1, prev: true }, true)) {
			entry = { pj: target, d: entry.d, prev: false };
		}
		showStep(target, true);
		// Once per session and step, so the funnel counts visitors, not taps.
		env.beacon('pro_join_step', 'acquisition', 'ds_pro_join_step_' + target, { ...tags, step: String(target) });
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
		if (next === 'form') return;
		views[next].querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
		if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start' });
	}

	function showThanks(code: string): void {
		doneCode = code;
		one('[data-code]').textContent = code;
		one('[data-code-row]').hidden = code === '';
		one('[data-code-hint]').hidden = code === '';
		one<HTMLAnchorElement>('a[data-wa="thanks"]').href = proWhatsAppUrl(whatsappTextWithCode(code));
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

	function setBusy(on: boolean): void {
		busy = on;
		nextButton.disabled = on;
		backButton.disabled = on;
		retryButton.disabled = on;
		form!.setAttribute('aria-busy', String(on));
		labelNext();
	}

	function labelNext(): void {
		nextLabel.textContent = busy ? SENDING_LABEL : step === 3 ? SEND_LABEL : NEXT_LABEL;
	}

	// ---------------------------------------------------------- sending

	/** Send the doctor back to the earliest step holding a refused field. */
	function refuse(fields: string[]): void {
		const target = firstBadStep(fields);
		if (target !== null && target !== step) moveInPlace(target);
		clearErrors();
		showErrors(fields);
		// A refused field the doctor cannot see — one on a branch he did not
		// take — must not leave him with a form that silently will not send.
		const shown = many('.pj-err').some((slot) => slot.getClientRects().length > 0);
		if (!shown) showFailure('invalid');
	}

	async function send(): Promise<void> {
		if (busy) return;
		const checked = checkAnswers(readAnswers());
		if (!checked.ok) {
			refuse(checked.fields);
			return;
		}
		clearErrors();
		hideFailure();
		setBusy(true);
		const outcome = await submitRequest(api, box, {
			hp: honeypot.value,
			source: tags.source,
			cta: tags.cta,
			form: checked.form,
		});
		setBusy(false);

		switch (outcome.kind) {
			case 'accepted':
				clearDraft();
				env.beacon('pro_join_submitted', 'acquisition', null, tags);
				// Replace, never push: Back from here must not reach a filled form.
				writeEntry({ pj: 'done', d: entry.d, prev: false, code: outcome.code }, false);
				showThanks(outcome.code);
				break;
			case 'invalid':
				if (outcome.fields.length > 0) refuse(outcome.fields);
				else showFailure('invalid');
				break;
			case 'closed':
				showView('closed');
				break;
			case 'retry':
				showFailure('retry');
				break;
			case 'failed':
				showFailure('failed');
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

	const onEdit = (event: Event): void => {
		const target = event.target as Control;
		if (target === honeypot || view !== 'form') return;
		if (target.name === 'role') applyRole();
		if (target.name === 'scheduling_method') scheduling = target.value;
		syncBranches();
		// Two controls share an error with their neighbour.
		const shared: Record<string, string> = { specialty_other: 'specialty', whatsapp_same: 'whatsapp' };
		const slot = root.querySelector<HTMLElement>('#pj-err-' + (shared[target.name] ?? target.name));
		if (slot) clearSlot(slot);
		saveDraft();
	};
	form.addEventListener('input', onEdit);
	form.addEventListener('change', onEdit);

	// The scheduling question is optional: a second tap on the chosen answer
	// takes it back, which a radio group does not do on its own. `scheduling`
	// still holds the answer from before this click — a new choice is recorded
	// by the change event, which fires after it.
	schedulingRadios.forEach((radio) => {
		radio.addEventListener('click', () => {
			if (scheduling !== radio.value) return;
			radio.checked = false;
			scheduling = '';
			syncBranches();
			saveDraft();
		});
	});

	many<HTMLAnchorElement>('a[data-wa]').forEach((link) => {
		link.addEventListener('click', () => {
			env.beacon('pro_join_whatsapp', 'acquisition', null, { ...tags, where: link.dataset.wa || 'form' });
		});
	});

	window.addEventListener('popstate', (event) => {
		const landed = parseEntry(event.state) ?? { pj: 1 as const, d: 0, prev: false };
		if (view !== 'form') {
			// The request is sent (or the form is closed). Back means leaving
			// the form, not walking its steps again: skip the entries below.
			const leaving = landed.d < entry.d;
			entry = landed;
			if (view === 'thanks') writeEntry({ pj: 'done', d: landed.d, prev: false, code: doneCode }, false);
			if (leaving) {
				try {
					history.go(-(landed.d + 1));
				} catch { /* stay on the thank-you */ }
			}
			return;
		}
		const target = reachable(landed.pj === 'done' ? 1 : landed.pj);
		entry = landed;
		if (target !== landed.pj) {
			// Forward onto a step whose earlier answers do not hold. Its own
			// entry is still below: go there rather than relabel this one.
			turnedBack = true;
			if (landed.prev) {
				history.back();
				return;
			}
			writeEntry({ pj: target, d: landed.d, prev: false }, false);
		}
		showStep(target, true);
		if (turnedBack) {
			turnedBack = false;
			showErrors(validateStep(target, readAnswers())); // why he is here
		}
	});

	// ---------------------------------------------------------- start

	const restored = parseEntry(history.state);
	if (restored?.pj === 'done') {
		// Reloaded, or came Back to, a request that was already sent.
		entry = restored;
		showThanks(restored.code ?? '');
		return;
	}

	const draft = loadDraft();
	if (draft) {
		// Anything typed while this script was still loading is newer than the draft.
		const typed = readAnswers();
		const text = ['full_name', 'phone', 'whatsapp', 'specialty_other', 'place_name', 'area', 'competitor_name', 'note'] as const;
		for (const key of text) if (typed[key] !== '') draft[key] = typed[key];
		writeAnswers(draft);
	}
	scheduling = readAnswers().scheduling_method;
	applyRole();
	syncBranches();

	const start = reachable(restored ? restored.pj : 1);
	writeEntry({ pj: start, d: restored?.d ?? 0, prev: restored?.pj === start ? restored.prev : false }, false);
	showStep(start, false);

	env.beacon('pro_join_opened', 'acquisition', 'ds_pro_join_opened', tags);

	void askOpen(api).then((answer) => {
		if (answer.kind === 'open') {
			if (!box.token) box.token = answer.token;
		} else if (answer.kind === 'closed' && view === 'form') {
			showView('closed');
		}
		// unreachable → the form stays; the token is asked for again on send.
	});
}

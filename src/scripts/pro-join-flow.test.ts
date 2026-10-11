// The send path of /pro/join against contract C2, with the network and the
// clock replaced: no browser, no server. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PRO_WHATSAPP_NUMBER, proWhatsAppUrl } from '../config/links.ts';
import { WHATSAPP_TEXT, whatsappTextWithCode } from '../config/pro-join.ts';
import {
	MIN_TOKEN_AGE_MS,
	OPEN_TIMEOUT_MS,
	SUBMIT_TIMEOUT_MS,
	askOpen,
	cleanCode,
	parseEntry,
	submitRequest,
} from './pro-join.ts';
import type { FetchLike, JoinApi, SubmitRequest, TokenBox } from './pro-join.ts';
import { checkAnswers, emptyAnswers } from './pro-join-validate.ts';

const ENDPOINT = 'https://api.example.test/functions/v1/pro_join_request';
const ANON_KEY = 'anon-key';

// ---------------------------------------------------------------- doubles

/** Time moves only when a test says so; due timers fire in order as it does. */
function fakeClock(start = 1_700_000_000_000) {
	let now = start;
	let timers: { at: number; fn: () => void }[] = [];
	const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
	return {
		now: () => now,
		setTimer(fn: () => void, ms: number): unknown {
			const handle = { at: now + ms, fn };
			timers.push(handle);
			return handle;
		},
		clearTimer(handle: unknown): void {
			timers = timers.filter((t) => t !== handle);
		},
		/** Jump without firing anything — a phone whose clock was corrected. */
		jump(ms: number): void {
			now += ms;
		},
		async advance(ms: number): Promise<void> {
			const end = now + ms;
			for (;;) {
				await settle();
				const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
				if (!due) break;
				timers = timers.filter((t) => t !== due);
				now = Math.max(now, due.at);
				due.fn();
			}
			now = Math.max(now, end);
			await settle();
		},
	};
}

type Reply =
	| { status?: number; body?: unknown } // an HTTP answer; status defaults to 200
	| 'hang' // never answers
	| 'offline' // fetch throws
	| 'garbage'; // 200 with a body that is not JSON

interface Call {
	at: number;
	url: string;
	headers: Record<string, string>;
	body: Record<string, unknown>;
	signal: AbortSignal | undefined;
}

/** A server that answers from a script, one reply per request, and remembers what it was asked. */
function server(clock: ReturnType<typeof fakeClock>, script: (body: Record<string, unknown>, n: number) => Reply) {
	const calls: Call[] = [];
	const fetch: FetchLike = (url, init) => {
		const body = JSON.parse(init.body) as Record<string, unknown>;
		calls.push({ at: clock.now(), url, headers: init.headers, body, signal: init.signal });
		const reply = script(body, calls.length);
		if (reply === 'offline') return Promise.reject(new TypeError('Failed to fetch'));
		if (reply === 'hang') {
			return new Promise((_, reject) => {
				init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
			});
		}
		if (reply === 'garbage') {
			return Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('not JSON')) });
		}
		const status = reply.status ?? 200;
		return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(reply.body) });
	};
	const api: JoinApi = { fetch, clock, endpoint: ENDPOINT, anonKey: ANON_KEY };
	return {
		api,
		calls,
		submits: () => calls.filter((c) => c.body.action === 'submit'),
		opens: () => calls.filter((c) => c.body.action === 'open'),
	};
}

function request(): SubmitRequest {
	const checked = checkAnswers({
		...emptyAnswers(),
		full_name: 'سامر الحلبي',
		phone: '0944123456',
		specialty: 'طب الأسنان',
		governorate: 'دمشق',
		area: 'المزة',
	});
	assert.ok(checked.ok);
	return { hp: '', source: 'instagram', cta: 'hero', form: checked.form };
}

/** A token the page has held long enough to send at once. */
function seasoned(clock: ReturnType<typeof fakeClock>, value = 'tok-1'): TokenBox {
	return { token: { value, at: clock.now() - 60_000 } };
}

const ACCEPTED = { body: { status: 'accepted', code: 'K7M-42Q' } };
const OPEN = (token: string) => ({ body: { open: true, token } });

/** Lets the flow run to its end, however long it waits. */
async function finish<T>(clock: ReturnType<typeof fakeClock>, flow: Promise<T>): Promise<T> {
	await clock.advance(120_000);
	return flow;
}

// ---------------------------------------------------------------- open

test('open: a token is kept with the moment it arrived', async () => {
	const clock = fakeClock();
	const s = server(clock, () => OPEN('tok-1'));
	const answer = await finish(clock, askOpen(s.api));
	assert.deepEqual(answer, { kind: 'open', token: { value: 'tok-1', at: 1_700_000_000_000 } });

	const [call] = s.calls;
	assert.equal(call.url, ENDPOINT);
	assert.deepEqual(call.body, { action: 'open' });
	assert.equal(call.headers.apikey, ANON_KEY);
	assert.equal(call.headers.Authorization, 'Bearer ' + ANON_KEY);
	assert.equal(call.headers['Content-Type'], 'application/json');
});

test('open: open:false closes the form', async () => {
	const clock = fakeClock();
	const s = server(clock, () => ({ body: { open: false } }));
	assert.deepEqual(await finish(clock, askOpen(s.api)), { kind: 'closed' });
});

test('open: an answer that is not 200 closes the form — an early deploy is harmless', async () => {
	for (const status of [404, 400, 500, 502]) {
		const clock = fakeClock();
		const s = server(clock, () => ({ status, body: { message: 'no such function' } }));
		assert.deepEqual(await finish(clock, askOpen(s.api)), { kind: 'closed' }, String(status));
	}
});

test('open: offline, a timeout or an unreadable answer leaves the form up', async () => {
	for (const reply of ['offline', 'hang', 'garbage'] as const) {
		const clock = fakeClock();
		const s = server(clock, () => reply);
		assert.deepEqual(await finish(clock, askOpen(s.api)), { kind: 'unreachable' }, reply);
	}
	// A 200 that says open but carries no token is no use either.
	const clock = fakeClock();
	const s = server(clock, () => ({ body: { open: true } }));
	assert.deepEqual(await finish(clock, askOpen(s.api)), { kind: 'unreachable' });
});

test('open: gives up after its timeout and lets go of the request', async () => {
	const clock = fakeClock();
	const s = server(clock, () => 'hang');
	let answer: unknown = null;
	void askOpen(s.api).then((a) => (answer = a));
	await clock.advance(OPEN_TIMEOUT_MS - 1);
	assert.equal(answer, null);
	await clock.advance(1);
	assert.deepEqual(answer, { kind: 'unreachable' });
	assert.equal(s.calls[0].signal?.aborted, true);
});

// ---------------------------------------------------------------- submit: each answer

test('accepted: one request, the contract body, the code comes back', async () => {
	const clock = fakeClock();
	const s = server(clock, () => ACCEPTED);
	const box = seasoned(clock);
	const sent = request();

	const outcome = await finish(clock, submitRequest(s.api, box, sent));
	assert.deepEqual(outcome, { kind: 'accepted', code: 'K7M-42Q' });

	assert.equal(s.calls.length, 1);
	const [call] = s.calls;
	assert.equal(call.url, ENDPOINT);
	assert.equal(call.headers.apikey, ANON_KEY);
	assert.equal(call.headers.Authorization, 'Bearer ' + ANON_KEY);
	assert.deepEqual(call.body, {
		action: 'submit',
		token: 'tok-1',
		hp: '',
		source: 'instagram',
		cta: 'hero',
		form: sent.form,
	});
});

test('accepted: the honeypot value travels as hp, untouched', async () => {
	const clock = fakeClock();
	const s = server(clock, () => ACCEPTED);
	await finish(clock, submitRequest(s.api, seasoned(clock), { ...request(), hp: 'http://spam.example' }));
	assert.equal(s.calls[0].body.hp, 'http://spam.example');
});

test('accepted: a code that does not look like one is not shown', async () => {
	for (const code of [undefined, 42, '<b>x</b>', 'a'.repeat(40)]) {
		const clock = fakeClock();
		const s = server(clock, () => ({ body: { status: 'accepted', code } }));
		const outcome = await finish(clock, submitRequest(s.api, seasoned(clock), request()));
		assert.deepEqual(outcome, { kind: 'accepted', code: '' });
	}
});

test('invalid: the refused fields come back, known names only, in page order', async () => {
	const clock = fakeClock();
	const s = server(clock, () => ({ body: { status: 'invalid', fields: ['note', 'phone', 'not_a_field', 7] } }));
	const outcome = await finish(clock, submitRequest(s.api, seasoned(clock), request()));
	assert.deepEqual(outcome, { kind: 'invalid', fields: ['phone', 'note'] });
	assert.equal(s.calls.length, 1);
});

test('invalid: with no field names it is still invalid, not a crash', async () => {
	const clock = fakeClock();
	const s = server(clock, () => ({ body: { status: 'invalid' } }));
	const outcome = await finish(clock, submitRequest(s.api, seasoned(clock), request()));
	assert.deepEqual(outcome, { kind: 'invalid', fields: [] });
});

test('busy: the send failed for now; nothing is resent on its own', async () => {
	const clock = fakeClock();
	const s = server(clock, () => ({ body: { status: 'busy' } }));
	const box = seasoned(clock);
	const outcome = await finish(clock, submitRequest(s.api, box, request()));
	assert.deepEqual(outcome, { kind: 'failed' });
	assert.equal(s.calls.length, 1);
	assert.equal(box.token?.value, 'tok-1'); // still good for «أعد المحاولة»
});

test('closed: the form is to be replaced', async () => {
	const clock = fakeClock();
	const s = server(clock, () => ({ body: { status: 'closed' } }));
	const outcome = await finish(clock, submitRequest(s.api, seasoned(clock), request()));
	assert.deepEqual(outcome, { kind: 'closed' });
	assert.equal(s.calls.length, 1);
});

test('network failure: the send failed for now', async () => {
	const clock = fakeClock();
	const s = server(clock, () => 'offline');
	const outcome = await finish(clock, submitRequest(s.api, seasoned(clock), request()));
	assert.deepEqual(outcome, { kind: 'failed' });
	assert.equal(s.calls.length, 1);
});

test('timeout: twenty seconds without an answer is a failure, not a second before', async () => {
	const clock = fakeClock();
	const s = server(clock, () => 'hang');
	let outcome: unknown = null;
	void submitRequest(s.api, seasoned(clock), request()).then((o) => (outcome = o));

	assert.equal(SUBMIT_TIMEOUT_MS, 20_000);
	await clock.advance(SUBMIT_TIMEOUT_MS - 1);
	assert.equal(outcome, null);
	assert.equal(s.calls[0].signal?.aborted, false);

	await clock.advance(1);
	assert.deepEqual(outcome, { kind: 'failed' });
	assert.equal(s.calls[0].signal?.aborted, true); // the request is let go
	assert.equal(s.calls.length, 1);
});

test('an answer outside the contract is a failure', async () => {
	const replies: Reply[] = [
		{ status: 500, body: { status: 'accepted', code: 'K7M-42Q' } },
		{ status: 400, body: { error: 'bad request' } },
		{ body: { status: 'something_new' } },
		{ body: null },
		{ body: 'accepted' },
		'garbage',
	];
	for (const reply of replies) {
		const clock = fakeClock();
		const s = server(clock, () => reply);
		const outcome = await finish(clock, submitRequest(s.api, seasoned(clock), request()));
		assert.deepEqual(outcome, { kind: 'failed' }, JSON.stringify(reply));
	}
});

// ---------------------------------------------------------------- submit: the token

test('retry waits and resends once', async () => {
	// Review focus 2. The server refuses the token; the page gets a fresh one,
	// lets it reach four seconds, and sends the same request again by itself.
	const clock = fakeClock();
	const s = server(clock, (body, n) => {
		if (body.action === 'open') return OPEN('tok-2');
		return n === 1 ? { body: { status: 'retry' } } : ACCEPTED;
	});
	const box = seasoned(clock, 'tok-stale');
	const sent = request();

	let outcome: unknown = null;
	void submitRequest(s.api, box, sent).then((o) => (outcome = o));

	await clock.advance(0);
	assert.deepEqual(s.calls.map((c) => c.body.action), ['submit', 'open']);
	const tokenArrived = s.opens()[0].at;

	await clock.advance(MIN_TOKEN_AGE_MS - 1);
	assert.equal(s.submits().length, 1, 'nothing is resent while the token is younger than four seconds');
	assert.equal(outcome, null, 'and the doctor is shown nothing yet');

	await clock.advance(1_000);
	assert.deepEqual(outcome, { kind: 'accepted', code: 'K7M-42Q' });
	assert.deepEqual(s.calls.map((c) => c.body.action), ['submit', 'open', 'submit']);

	const resend = s.submits()[1];
	assert.ok(resend.at - tokenArrived >= MIN_TOKEN_AGE_MS);
	assert.equal(resend.body.token, 'tok-2');
	assert.deepEqual(resend.body.form, sent.form, 'the same request, not a blank one');
	assert.equal(box.token?.value, 'tok-2');
});

test('a second retry is handed to the doctor: two sends, never a third', async () => {
	const clock = fakeClock();
	const s = server(clock, (body) => (body.action === 'open' ? OPEN('tok-2') : { body: { status: 'retry' } }));
	const box = seasoned(clock, 'tok-stale');

	const outcome = await finish(clock, submitRequest(s.api, box, request()));
	assert.deepEqual(outcome, { kind: 'retry' });
	assert.equal(s.submits().length, 2);
	assert.equal(box.token, null, 'the refused token is not kept for «أعد المحاولة»');
});

test('no token at submit time: one is fetched, aged four seconds, and the request goes through', async () => {
	// Review focus 2. The connection dropped when the page opened, so the page
	// holds no token. The request must not be lost, and must not be sent
	// without a token or with one the server would call too young.
	const clock = fakeClock();
	const s = server(clock, (body) => (body.action === 'open' ? OPEN('tok-late') : ACCEPTED));
	const box: TokenBox = { token: null };

	let outcome: unknown = null;
	void submitRequest(s.api, box, request()).then((o) => (outcome = o));

	await clock.advance(MIN_TOKEN_AGE_MS - 1);
	assert.deepEqual(s.calls.map((c) => c.body.action), ['open']);
	assert.equal(outcome, null);

	await clock.advance(1_000);
	assert.deepEqual(outcome, { kind: 'accepted', code: 'K7M-42Q' });
	assert.deepEqual(s.calls.map((c) => c.body.action), ['open', 'submit']);
	assert.equal(s.submits()[0].body.token, 'tok-late');
	assert.ok(s.submits()[0].at - s.opens()[0].at >= MIN_TOKEN_AGE_MS);
});

test('a token fetched a moment ago is aged before the first send, not sent to be refused', async () => {
	const clock = fakeClock();
	const s = server(clock, () => ACCEPTED);
	const box: TokenBox = { token: { value: 'tok-young', at: clock.now() - 1_000 } };

	let outcome: unknown = null;
	void submitRequest(s.api, box, request()).then((o) => (outcome = o));

	await clock.advance(MIN_TOKEN_AGE_MS - 1_000 - 1);
	assert.equal(s.calls.length, 0);
	await clock.advance(1_000);
	assert.deepEqual(outcome, { kind: 'accepted', code: 'K7M-42Q' });
	assert.equal(s.calls.length, 1);
});

test('no token and the form has been closed meanwhile: nothing is sent', async () => {
	for (const reply of [{ body: { open: false } }, { status: 404, body: {} }]) {
		const clock = fakeClock();
		const s = server(clock, () => reply);
		const outcome = await finish(clock, submitRequest(s.api, { token: null }, request()));
		assert.deepEqual(outcome, { kind: 'closed' });
		assert.equal(s.submits().length, 0);
	}
});

test('no token and still offline: a failure the doctor can retry, nothing sent', async () => {
	const clock = fakeClock();
	const s = server(clock, () => 'offline');
	const box: TokenBox = { token: null };
	const outcome = await finish(clock, submitRequest(s.api, box, request()));
	assert.deepEqual(outcome, { kind: 'failed' });
	assert.equal(s.submits().length, 0);
	assert.equal(box.token, null);
});

test('after a retry, a closed or unreachable server ends the attempt', async () => {
	const closing = fakeClock();
	const a = server(closing, (body) => (body.action === 'open' ? { body: { open: false } } : { body: { status: 'retry' } }));
	assert.deepEqual(await finish(closing, submitRequest(a.api, seasoned(closing), request())), { kind: 'closed' });
	assert.equal(a.submits().length, 1);

	const dropping = fakeClock();
	const b = server(dropping, (body) => (body.action === 'open' ? 'offline' : { body: { status: 'retry' } }));
	assert.deepEqual(await finish(dropping, submitRequest(b.api, seasoned(dropping), request())), { kind: 'failed' });
	assert.equal(b.submits().length, 1);
});

test('a phone whose clock was set back does not wait forever', async () => {
	const clock = fakeClock();
	const s = server(clock, () => ACCEPTED);
	// The token looks as if it arrived an hour in the future.
	const box: TokenBox = { token: { value: 'tok-1', at: clock.now() + 3_600_000 } };

	let outcome: unknown = null;
	void submitRequest(s.api, box, request()).then((o) => (outcome = o));
	await clock.advance(MIN_TOKEN_AGE_MS + 1_000);
	assert.deepEqual(outcome, { kind: 'accepted', code: 'K7M-42Q' });
});

test('one request at a time leaves no timer behind', async () => {
	const clock = fakeClock();
	const s = server(clock, () => ACCEPTED);
	const pending: unknown[] = [];
	const counting = {
		...clock,
		setTimer(fn: () => void, ms: number) {
			const handle = clock.setTimer(fn, ms);
			pending.push(handle);
			return handle;
		},
		clearTimer(handle: unknown) {
			pending.splice(pending.indexOf(handle), 1);
			clock.clearTimer(handle);
		},
	};
	await finish(clock, submitRequest({ ...s.api, clock: counting }, seasoned(clock), request()));
	assert.equal(pending.length, 0);
});

// ---------------------------------------------------------------- around the send

test('a request code is shown only when it looks like one', () => {
	assert.equal(cleanCode('K7M-42Q'), 'K7M-42Q');
	assert.equal(cleanCode('K7M42Q'), 'K7M42Q');
	for (const raw of ['', 'k7m-42q', 'K7M 42Q', '<i>', 'A'.repeat(13), null, 1042]) {
		assert.equal(cleanCode(raw), '', String(raw));
	}
});

test('history state read back is not trusted', () => {
	assert.deepEqual(parseEntry({ pj: 2, d: 1, prev: true }), { pj: 2, d: 1, prev: true });
	assert.deepEqual(parseEntry({ pj: 1, d: 0, prev: true }), { pj: 1, d: 0, prev: false }); // nothing lies before step 1
	assert.deepEqual(parseEntry({ pj: 3 }), { pj: 3, d: 0, prev: false });
	assert.deepEqual(parseEntry({ pj: 3, d: -4, prev: 'yes' }), { pj: 3, d: 0, prev: false });
	assert.deepEqual(parseEntry({ pj: 'done', d: 2, code: 'K7M-42Q' }), { pj: 'done', d: 2, prev: false, code: 'K7M-42Q' });
	assert.deepEqual(parseEntry({ pj: 'done', code: '<script>' }), { pj: 'done', d: 0, prev: false, code: '' });
	for (const state of [null, undefined, 'x', 7, {}, { pj: 4 }, { pj: '2' }, { step: 2 }]) {
		assert.equal(parseEntry(state), null, JSON.stringify(state));
	}
});

test('the WhatsApp link goes to the Pro line and carries its text', () => {
	assert.equal(PRO_WHATSAPP_NUMBER, '963983322665');
	assert.equal(proWhatsAppUrl(), 'https://wa.me/963983322665');

	const fromForm = new URL(proWhatsAppUrl(WHATSAPP_TEXT));
	assert.equal(fromForm.origin + fromForm.pathname, 'https://wa.me/963983322665');
	assert.equal(fromForm.searchParams.get('text'), WHATSAPP_TEXT);

	// The thank-you button: the message carries the request code.
	const fromThanks = new URL(proWhatsAppUrl(whatsappTextWithCode('K7M-42Q')));
	assert.ok(fromThanks.searchParams.get('text')?.includes('K7M-42Q'));
	assert.equal(whatsappTextWithCode('').includes('undefined'), false);
});

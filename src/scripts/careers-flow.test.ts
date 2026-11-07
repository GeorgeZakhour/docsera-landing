// The send path of /careers against contract C0, with the network, the XHR
// and the clock replaced: no browser, no server. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	ANSWER_MS,
	MIN_TOKEN_AGE_MS,
	STALL_MS,
	SUBMIT_TIMEOUT_MS,
	askOpenCareers,
	buildBody,
	parseEntry,
	submitApplication,
} from './careers.ts';
import type { CareersApi, SubmitRequest, TokenBox, XhrLike } from './careers.ts';
import type { FetchLike } from './pro-join.ts';
import { checkAnswers, emptyAnswers } from './careers-validate.ts';

const ENDPOINT = 'https://api.example.test/functions/v1/job_application';
const ANON_KEY = 'anon-key';
const MB = 1024 * 1024;

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
type FakeClock = ReturnType<typeof fakeClock>;

type JsonReply = { status?: number; body?: unknown } | 'offline' | 'hang';

/** The JSON side (open): a server that answers from a script. */
function jsonServer(clock: FakeClock, script: (n: number) => JsonReply) {
	const opens: { at: number; body: Record<string, unknown> }[] = [];
	const fetch: FetchLike = (_url, init) => {
		opens.push({ at: clock.now(), body: JSON.parse(init.body) });
		const reply = script(opens.length);
		if (reply === 'offline') return Promise.reject(new TypeError('Failed to fetch'));
		if (reply === 'hang') return new Promise(() => {});
		const status = reply.status ?? 200;
		return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(reply.body) });
	};
	return { fetch, opens };
}

interface Progress {
	/** ms after send */
	at: number;
	loaded: number;
	total: number;
}

type XhrReply =
	| { status?: number; body?: unknown; text?: string; progress?: Progress[]; answerAt?: number }
	| 'hang' // never answers (progress events, if any, still fire)
	| 'offline'; // the network errors out

interface Upload {
	at: number;
	headers: Record<string, string>;
	body: FormData;
	xhr: FakeXhr;
}

class FakeXhr implements XhrLike {
	upload: XhrLike['upload'] = { onprogress: null };
	onload: XhrLike['onload'] = null;
	onerror: XhrLike['onerror'] = null;
	onabort: XhrLike['onabort'] = null;
	ontimeout: XhrLike['ontimeout'] = null;
	status = 0;
	responseText = '';
	aborted = false;
	opened: [string, string] | null = null;
	headers: Record<string, string> = {};
	private clock: FakeClock;
	private reply: XhrReply;
	private log: Upload[];
	constructor(clock: FakeClock, reply: XhrReply, log: Upload[]) {
		this.clock = clock;
		this.reply = reply;
		this.log = log;
	}
	open(method: string, url: string): void {
		this.opened = [method, url];
	}
	setRequestHeader(name: string, value: string): void {
		this.headers[name] = value;
	}
	abort(): void {
		this.aborted = true;
		this.onabort?.();
	}
	send(body: FormData): void {
		this.log.push({ at: this.clock.now(), headers: this.headers, body, xhr: this });
		const reply = this.reply;
		if (reply === 'offline') {
			this.clock.setTimer(() => this.onerror?.(), 0);
			return;
		}
		const progress = reply === 'hang' ? [] : reply.progress ?? [];
		for (const p of progress) {
			this.clock.setTimer(() => {
				if (!this.aborted) this.upload.onprogress?.({ loaded: p.loaded, total: p.total, lengthComputable: true });
			}, p.at);
		}
		if (reply === 'hang') return;
		this.clock.setTimer(() => {
			if (this.aborted) return;
			this.status = reply.status ?? 200;
			this.responseText = reply.text ?? JSON.stringify(reply.body ?? null);
			this.onload?.();
		}, reply.answerAt ?? 0);
	}
}

/** The multipart side (submit): one fake XHR per send, answering from a script. */
function xhrServer(clock: FakeClock, script: (n: number) => XhrReply) {
	const uploads: Upload[] = [];
	const xhr = (): XhrLike => new FakeXhr(clock, script(uploads.length + 1), uploads);
	return { xhr, uploads };
}

function api(clock: FakeClock, json: ReturnType<typeof jsonServer>, multipart: ReturnType<typeof xhrServer>): CareersApi {
	return { fetch: json.fetch, xhr: multipart.xhr, clock, endpoint: ENDPOINT, anonKey: ANON_KEY };
}

function file(name: string, size: number, type = 'application/pdf'): File {
	return new File([new Uint8Array(size)], name, { type });
}

function request(over: Partial<SubmitRequest> = {}): SubmitRequest {
	const checked = checkAnswers({
		...emptyAnswers(),
		full_name: 'لمى حداد',
		phone: '0944123456',
		degree_level: 'university',
		degree_field: 'pharmacy',
		sales_experience: '1_2',
		medical_sector: true,
		areas: ['mazzeh'],
		start_availability: 'immediately',
		cvFile: file('cv.pdf', 10),
	});
	assert.ok(checked.ok);
	return { form: checked.form, cv: file('CV-Lama.pdf', 2048), extras: [], hp: '', source: 'instagram', ...over };
}

/** A token the page has held long enough to send at once. */
function seasoned(clock: FakeClock, value = 'tok-1'): TokenBox {
	return { token: { value, at: clock.now() - 60_000 } };
}

const ACCEPTED: XhrReply = { body: { status: 'accepted', code: 'K7M-42Q' } };
const OPEN = (token: string): JsonReply => ({ body: { open: true, token } });

/** Lets the flow run to its end, however long it waits. */
async function finish<T>(clock: FakeClock, flow: Promise<T>): Promise<T> {
	await clock.advance(SUBMIT_TIMEOUT_MS + 60_000);
	return flow;
}

// ---------------------------------------------------------------- the body

test('the multipart body carries the contract parts: token, hp, source, form, cv, one extra per file', async () => {
	const sent = request({ extras: [file('cert.jpg', 100, 'image/jpeg'), file('ref.png', 50, 'image/png')], hp: '', source: 'poster' });
	const body = buildBody('tok-1', sent);

	assert.equal(body.get('token'), 'tok-1');
	assert.equal(body.get('hp'), '');
	assert.equal(body.get('source'), 'poster');
	assert.deepEqual(JSON.parse(body.get('form') as string), sent.form);

	const cv = body.get('cv') as File;
	assert.equal(cv.name, 'CV-Lama.pdf');
	assert.equal(cv.size, 2048);
	const extras = body.getAll('extra') as File[];
	assert.deepEqual(extras.map((f) => f.name), ['cert.jpg', 'ref.png']);
	assert.deepEqual([...body.keys()], ['token', 'hp', 'source', 'form', 'cv', 'extra', 'extra']);
	// the files are never inside the JSON
	assert.equal((body.get('form') as string).includes('CV-Lama'), false);
});

test('without extras there is no extra part at all', () => {
	const body = buildBody('tok-1', request());
	assert.deepEqual(body.getAll('extra'), []);
	assert.deepEqual([...body.keys()], ['token', 'hp', 'source', 'form', 'cv']);
});

// ---------------------------------------------------------------- submit: each answer

test('accepted: one upload, the headers, the code comes back', async () => {
	const clock = fakeClock();
	const json = jsonServer(clock, () => OPEN('tok-x'));
	const multipart = xhrServer(clock, () => ACCEPTED);
	const sent = request();

	const outcome = await finish(clock, submitApplication(api(clock, json, multipart), seasoned(clock), sent));
	assert.deepEqual(outcome, { kind: 'accepted', code: 'K7M-42Q' });

	assert.equal(json.opens.length, 0, 'a seasoned token is used as it is');
	assert.equal(multipart.uploads.length, 1);
	const [up] = multipart.uploads;
	assert.deepEqual(up.xhr.opened, ['POST', ENDPOINT]);
	assert.equal(up.headers.apikey, ANON_KEY);
	assert.equal(up.headers.Authorization, 'Bearer ' + ANON_KEY);
	assert.equal('Content-Type' in up.headers, false, 'the browser writes the multipart boundary itself');
	assert.equal(up.body.get('token'), 'tok-1');
	assert.deepEqual(JSON.parse(up.body.get('form') as string), sent.form);
	assert.equal((up.body.get('cv') as File).name, 'CV-Lama.pdf');
});

test('accepted: the honeypot value travels as hp, untouched', async () => {
	const clock = fakeClock();
	const multipart = xhrServer(clock, () => ACCEPTED);
	await finish(clock, submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), seasoned(clock), request({ hp: 'http://spam.example' })));
	assert.equal(multipart.uploads[0].body.get('hp'), 'http://spam.example');
});

test('accepted: a code that does not look like one is not shown', async () => {
	for (const code of [undefined, 42, '<b>x</b>', 'a'.repeat(40)]) {
		const clock = fakeClock();
		const multipart = xhrServer(clock, () => ({ body: { status: 'accepted', code } }));
		const outcome = await finish(clock, submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), seasoned(clock), request()));
		assert.deepEqual(outcome, { kind: 'accepted', code: '' });
	}
});

test('invalid: the refused fields come back, known names only, in page order — the file names included', async () => {
	const clock = fakeClock();
	const multipart = xhrServer(clock, () => ({ body: { status: 'invalid', fields: ['message', 'cv', 'phone', 'not_a_field', 7, 'form'] } }));
	const outcome = await finish(clock, submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), seasoned(clock), request()));
	assert.deepEqual(outcome, { kind: 'invalid', fields: ['phone', 'cv', 'message'] });
	assert.equal(multipart.uploads.length, 1);
});

test('invalid with no field names is still invalid; form alone is invalid with no fields', async () => {
	for (const body of [{ status: 'invalid' }, { status: 'invalid', fields: ['form'] }]) {
		const clock = fakeClock();
		const multipart = xhrServer(clock, () => ({ body }));
		const outcome = await finish(clock, submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), seasoned(clock), request()));
		assert.deepEqual(outcome, { kind: 'invalid', fields: [] });
	}
});

test('busy, closed and too_large are each their own outcome; nothing is resent on its own', async () => {
	for (const status of ['busy', 'closed', 'too_large'] as const) {
		const clock = fakeClock();
		const multipart = xhrServer(clock, () => ({ body: { status } }));
		const box = seasoned(clock);
		const outcome = await finish(clock, submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), box, request()));
		assert.deepEqual(outcome, { kind: status });
		assert.equal(multipart.uploads.length, 1);
		assert.equal(box.token?.value, 'tok-1', 'still good for «أعد المحاولة»');
	}
});

test('network failure: the send failed for now', async () => {
	const clock = fakeClock();
	const multipart = xhrServer(clock, () => 'offline');
	const outcome = await finish(clock, submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), seasoned(clock), request()));
	assert.deepEqual(outcome, { kind: 'failed' });
	assert.equal(multipart.uploads.length, 1);
});

test('an answer outside the contract is a failure', async () => {
	const replies: XhrReply[] = [
		{ status: 500, body: { status: 'accepted', code: 'K7M-42Q' } },
		{ status: 400, body: { error: 'bad_request' } },
		{ status: 413, text: 'Request Entity Too Large' },
		{ body: { status: 'something_new' } },
		{ body: null },
		{ text: 'accepted' },
		{ text: '<html>gateway</html>' },
	];
	for (const reply of replies) {
		const clock = fakeClock();
		const multipart = xhrServer(clock, () => reply);
		const outcome = await finish(clock, submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), seasoned(clock), request()));
		assert.deepEqual(outcome, { kind: 'failed' }, JSON.stringify(reply));
	}
});

// ---------------------------------------------------------------- progress, stall, timeout

test('upload progress is forwarded as it happens', async () => {
	// Review focus 1: the bar keeps moving while bytes flow.
	const clock = fakeClock();
	const total = 10 * MB;
	const multipart = xhrServer(clock, () => ({
		progress: [
			{ at: 1_000, loaded: 1 * MB, total },
			{ at: 5_000, loaded: 4 * MB, total },
			{ at: 9_000, loaded: total, total },
		],
		answerAt: 10_000,
		body: { status: 'accepted', code: 'K7M-42Q' },
	}));
	const seen: [number, number][] = [];
	const outcome = await finish(clock, submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), seasoned(clock), request(), (sent, all) => seen.push([sent, all])));
	assert.deepEqual(outcome, { kind: 'accepted', code: 'K7M-42Q' });
	assert.deepEqual(seen, [[1 * MB, total], [4 * MB, total], [total, total]]);
});

test('forty-five seconds without a progress event is a stall: the request is let go and the send fails', async () => {
	const clock = fakeClock();
	const multipart = xhrServer(clock, () => 'hang');
	let outcome: unknown = null;
	void submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), seasoned(clock), request()).then((o) => (outcome = o));

	assert.equal(STALL_MS, 45_000);
	await clock.advance(STALL_MS - 1);
	assert.equal(outcome, null);
	assert.equal(multipart.uploads[0].xhr.aborted, false);

	await clock.advance(1);
	assert.deepEqual(outcome, { kind: 'failed' });
	assert.equal(multipart.uploads[0].xhr.aborted, true);
	assert.equal(multipart.uploads.length, 1, 'never resent on its own');
});

test('a stall is counted from the last progress event, not from the start', async () => {
	const clock = fakeClock();
	const total = 16 * MB;
	// bytes keep flowing for 40 s, then the line dies
	const multipart = xhrServer(clock, () => ({
		progress: [{ at: 20_000, loaded: 2 * MB, total }, { at: 40_000, loaded: 4 * MB, total }],
		answerAt: 999_999,
	}));
	let outcome: unknown = null;
	void submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), seasoned(clock), request()).then((o) => (outcome = o));

	await clock.advance(40_000 + STALL_MS - 1);
	assert.equal(outcome, null, 'the last event was 44.999 s ago');
	await clock.advance(1);
	assert.deepEqual(outcome, { kind: 'failed' });
	assert.equal(multipart.uploads[0].xhr.aborted, true);
});

// Review M3 — once every byte is up there is no progress event to wait for.
test('after 100 % the stall clock stops: no progress for 100 s does not abort; 130 s does (one 120 s answer timer)', async () => {
	assert.equal(ANSWER_MS, 120_000);
	const clock = fakeClock();
	const total = 4 * MB;
	// the body is up at 9 s; the server never answers
	const multipart = xhrServer(clock, () => ({
		progress: [{ at: 3_000, loaded: 1 * MB, total }, { at: 9_000, loaded: total, total }],
		answerAt: 999_999,
	}));
	let outcome: unknown = null;
	void submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), seasoned(clock), request()).then((o) => (outcome = o));

	await clock.advance(9_000 + 100_000);
	assert.equal(outcome, null, '100 s after 100 % the request is still alive');
	assert.equal(multipart.uploads[0].xhr.aborted, false);
	await clock.advance(ANSWER_MS - 100_000 - 1);
	assert.equal(outcome, null, '119.999 s after 100 %');
	await clock.advance(1);
	assert.deepEqual(outcome, { kind: 'failed' }, '120 s after 100 %: let go');
	assert.equal(multipart.uploads[0].xhr.aborted, true);
	assert.equal(multipart.uploads.length, 1, 'never resent on its own');
});

test('an answer within the 120 s after 100 % is taken; a late final progress event does not restart the clock', async () => {
	const clock = fakeClock();
	const total = 4 * MB;
	const multipart = xhrServer(clock, () => ({
		// the browser may repeat the final progress event; it must not re-arm anything
		progress: [{ at: 9_000, loaded: total, total }, { at: 60_000, loaded: total, total }],
		answerAt: 9_000 + ANSWER_MS - 1_000,
		body: { status: 'accepted', code: 'K7M-42Q' },
	}));
	let outcome: unknown = null;
	void submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), seasoned(clock), request()).then((o) => (outcome = o));
	await clock.advance(9_000 + ANSWER_MS - 1_001);
	assert.equal(outcome, null);
	await clock.advance(1);
	assert.deepEqual(outcome, { kind: 'accepted', code: 'K7M-42Q' });
	assert.equal(multipart.uploads[0].xhr.aborted, false);
});

test('a slow line that keeps moving is never cut: progress every 10 s for 200 s, then accepted', async () => {
	// Review focus 1: a 16 MB CV at 1 Mbit/s. The overall limit is 240 s.
	const clock = fakeClock();
	const total = 16 * MB;
	const progress: Progress[] = [];
	for (let t = 10_000; t <= 200_000; t += 10_000) progress.push({ at: t, loaded: Math.round((t / 200_000) * total), total });
	const multipart = xhrServer(clock, () => ({ progress, answerAt: 205_000, body: { status: 'accepted', code: 'K7M-42Q' } }));
	let outcome: unknown = null;
	let last = 0;
	void submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), seasoned(clock), request(), (sent) => (last = sent)).then((o) => (outcome = o));

	await clock.advance(204_999);
	assert.equal(outcome, null);
	assert.equal(multipart.uploads[0].xhr.aborted, false);
	assert.equal(last, total);
	await clock.advance(1);
	assert.deepEqual(outcome, { kind: 'accepted', code: 'K7M-42Q' });
});

test('the overall timeout ends a send that keeps reporting progress but never finishes', async () => {
	const clock = fakeClock();
	const total = 16 * MB;
	const progress: Progress[] = [];
	for (let t = 10_000; t <= 300_000; t += 10_000) progress.push({ at: t, loaded: Math.min(total, t * 10), total });
	const multipart = xhrServer(clock, () => ({ progress, answerAt: 999_999 }));
	let outcome: unknown = null;
	void submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), seasoned(clock), request()).then((o) => (outcome = o));

	assert.equal(SUBMIT_TIMEOUT_MS, 240_000);
	await clock.advance(SUBMIT_TIMEOUT_MS - 1);
	assert.equal(outcome, null);
	await clock.advance(1);
	assert.deepEqual(outcome, { kind: 'failed' });
	assert.equal(multipart.uploads[0].xhr.aborted, true);
});

test('a send that took its time but answered leaves no timer behind', async () => {
	const clock = fakeClock();
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
	const multipart = xhrServer(clock, () => ({ progress: [{ at: 30_000, loaded: 1, total: 2 }], answerAt: 60_000, body: { status: 'accepted', code: 'K7M-42Q' } }));
	const a = { ...api(clock, jsonServer(clock, () => OPEN('t')), multipart), clock: counting };
	await finish(clock, submitApplication(a, seasoned(clock), request()));
	assert.equal(pending.length, 0);
});

// ---------------------------------------------------------------- submit: the token

test('retry waits and resends once, files and all', async () => {
	// The server refuses the token; the page gets a fresh one, lets it reach
	// four seconds, and sends the same request again by itself.
	const clock = fakeClock();
	const json = jsonServer(clock, () => OPEN('tok-2'));
	const multipart = xhrServer(clock, (n) => (n === 1 ? { body: { status: 'retry' } } : ACCEPTED));
	const box = seasoned(clock, 'tok-stale');
	const sent = request({ extras: [file('cert.jpg', 64, 'image/jpeg')] });

	let outcome: unknown = null;
	void submitApplication(api(clock, json, multipart), box, sent).then((o) => (outcome = o));

	await clock.advance(0);
	assert.equal(multipart.uploads.length, 1);
	assert.equal(json.opens.length, 1);
	const tokenArrived = json.opens[0].at;

	await clock.advance(MIN_TOKEN_AGE_MS - 1);
	assert.equal(multipart.uploads.length, 1, 'nothing is resent while the token is younger than four seconds');
	assert.equal(outcome, null, 'and the applicant is shown nothing yet');

	await clock.advance(1_000);
	assert.deepEqual(outcome, { kind: 'accepted', code: 'K7M-42Q' });
	assert.equal(multipart.uploads.length, 2);

	const resend = multipart.uploads[1];
	assert.ok(resend.at - tokenArrived >= MIN_TOKEN_AGE_MS);
	assert.equal(resend.body.get('token'), 'tok-2');
	assert.deepEqual(JSON.parse(resend.body.get('form') as string), sent.form, 'the same request, not a blank one');
	assert.equal((resend.body.get('cv') as File).name, 'CV-Lama.pdf');
	assert.deepEqual((resend.body.getAll('extra') as File[]).map((f) => f.name), ['cert.jpg']);
	assert.equal(box.token?.value, 'tok-2');
});

test('a second retry is handed to the applicant: two sends, never a third', async () => {
	const clock = fakeClock();
	const multipart = xhrServer(clock, () => ({ body: { status: 'retry' } }));
	const box = seasoned(clock, 'tok-stale');
	const outcome = await finish(clock, submitApplication(api(clock, jsonServer(clock, () => OPEN('tok-2')), multipart), box, request()));
	assert.deepEqual(outcome, { kind: 'retry' });
	assert.equal(multipart.uploads.length, 2);
	assert.equal(box.token, null, 'the refused token is not kept for «أعد المحاولة»');
});

test('no token at submit time: one is fetched, aged four seconds, and the request goes through', async () => {
	const clock = fakeClock();
	const json = jsonServer(clock, () => OPEN('tok-late'));
	const multipart = xhrServer(clock, () => ACCEPTED);
	const box: TokenBox = { token: null };

	let outcome: unknown = null;
	void submitApplication(api(clock, json, multipart), box, request()).then((o) => (outcome = o));

	await clock.advance(MIN_TOKEN_AGE_MS - 1);
	assert.equal(json.opens.length, 1);
	assert.equal(multipart.uploads.length, 0);
	assert.equal(outcome, null);

	await clock.advance(1_000);
	assert.deepEqual(outcome, { kind: 'accepted', code: 'K7M-42Q' });
	assert.equal(multipart.uploads[0].body.get('token'), 'tok-late');
	assert.ok(multipart.uploads[0].at - json.opens[0].at >= MIN_TOKEN_AGE_MS);
});

test('a token fetched a moment ago is aged before the first send', async () => {
	const clock = fakeClock();
	const multipart = xhrServer(clock, () => ACCEPTED);
	const box: TokenBox = { token: { value: 'tok-young', at: clock.now() - 1_000 } };
	let outcome: unknown = null;
	void submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), box, request()).then((o) => (outcome = o));

	await clock.advance(MIN_TOKEN_AGE_MS - 1_000 - 1);
	assert.equal(multipart.uploads.length, 0);
	await clock.advance(1_000);
	assert.deepEqual(outcome, { kind: 'accepted', code: 'K7M-42Q' });
});

// Review M2 — the network's hourly cap on «open» is not the founder's switch.
test('askOpenCareers: busy is its own answer; closed, open and unreachable read as the Pro form reads them', async () => {
	const ask = async (reply: JsonReply) => {
		const clock = fakeClock();
		const json = jsonServer(clock, () => reply);
		const answer = askOpenCareers({ fetch: json.fetch, clock, endpoint: ENDPOINT, anonKey: ANON_KEY });
		await clock.advance(60_000);
		return { answer: await answer, sent: json.opens[0]?.body };
	};
	assert.deepEqual((await ask({ body: { open: false, reason: 'busy' } })).answer, { kind: 'busy' });
	assert.deepEqual((await ask({ body: { open: false } })).answer, { kind: 'closed' });
	assert.deepEqual((await ask({ body: { open: false, reason: 'anything_else' } })).answer, { kind: 'closed' });
	assert.deepEqual((await ask({ status: 404, body: {} })).answer, { kind: 'closed' });
	assert.deepEqual((await ask('offline')).answer, { kind: 'unreachable' });
	assert.deepEqual((await ask('hang')).answer, { kind: 'unreachable' });
	assert.deepEqual((await ask({ body: { open: true } })).answer, { kind: 'unreachable' });
	const opened = await ask({ body: { open: true, token: 'tok-9' } });
	assert.equal(opened.answer.kind, 'open');
	assert.equal(opened.answer.kind === 'open' && opened.answer.token.value, 'tok-9');
	assert.deepEqual(opened.sent, { action: 'open' });
});

test('the busy panel\'s retry asks again, and the form opens only when the server opens it', async () => {
	const clock = fakeClock();
	// first call: over the cap; second: open
	const json = jsonServer(clock, (n) => (n === 1 ? { body: { open: false, reason: 'busy' } } : OPEN('tok-2')));
	const a = { fetch: json.fetch, clock, endpoint: ENDPOINT, anonKey: ANON_KEY };
	assert.deepEqual(await askOpenCareers(a), { kind: 'busy' });
	const again = await askOpenCareers(a);
	assert.equal(again.kind, 'open');
	assert.equal(again.kind === 'open' && again.token.value, 'tok-2');
	assert.equal(json.opens.length, 2);
});

test('no token and the network is over its cap at submit time: busy, nothing sent, no token kept', async () => {
	const clock = fakeClock();
	const multipart = xhrServer(clock, () => ACCEPTED);
	const box: TokenBox = { token: null };
	const outcome = await finish(clock, submitApplication(api(clock, jsonServer(clock, () => ({ body: { open: false, reason: 'busy' } })), multipart), box, request()));
	assert.deepEqual(outcome, { kind: 'busy' });
	assert.equal(multipart.uploads.length, 0);
	assert.equal(box.token, null);
});

test('no token and the form has been closed meanwhile: nothing is sent', async () => {
	for (const reply of [{ body: { open: false } }, { status: 404, body: {} }] as JsonReply[]) {
		const clock = fakeClock();
		const multipart = xhrServer(clock, () => ACCEPTED);
		const outcome = await finish(clock, submitApplication(api(clock, jsonServer(clock, () => reply), multipart), { token: null }, request()));
		assert.deepEqual(outcome, { kind: 'closed' });
		assert.equal(multipart.uploads.length, 0);
	}
});

test('no token and still offline: a failure the applicant can retry, nothing sent', async () => {
	const clock = fakeClock();
	const multipart = xhrServer(clock, () => ACCEPTED);
	const box: TokenBox = { token: null };
	const outcome = await finish(clock, submitApplication(api(clock, jsonServer(clock, () => 'offline'), multipart), box, request()));
	assert.deepEqual(outcome, { kind: 'failed' });
	assert.equal(multipart.uploads.length, 0);
	assert.equal(box.token, null);
});

test('a phone whose clock was set back does not wait forever', async () => {
	const clock = fakeClock();
	const multipart = xhrServer(clock, () => ACCEPTED);
	const box: TokenBox = { token: { value: 'tok-1', at: clock.now() + 3_600_000 } };
	let outcome: unknown = null;
	void submitApplication(api(clock, jsonServer(clock, () => OPEN('t')), multipart), box, request()).then((o) => (outcome = o));
	await clock.advance(MIN_TOKEN_AGE_MS + 1_000);
	assert.deepEqual(outcome, { kind: 'accepted', code: 'K7M-42Q' });
});

// ---------------------------------------------------------------- around the send

test('history state read back is not trusted', () => {
	assert.deepEqual(parseEntry({ cr: 2, d: 1, prev: true }), { cr: 2, d: 1, prev: true });
	assert.deepEqual(parseEntry({ cr: 1, d: 0, prev: true }), { cr: 1, d: 0, prev: false });
	assert.deepEqual(parseEntry({ cr: 3 }), { cr: 3, d: 0, prev: false });
	assert.deepEqual(parseEntry({ cr: 'done', d: 2, code: 'K7M-42Q' }), { cr: 'done', d: 2, prev: false, code: 'K7M-42Q' });
	assert.deepEqual(parseEntry({ cr: 'done', code: '<script>' }), { cr: 'done', d: 0, prev: false, code: '' });
	for (const state of [null, undefined, 'x', 7, {}, { cr: 4 }, { cr: '2' }, { pj: 2 }, { step: 2 }]) {
		assert.equal(parseEntry(state), null, JSON.stringify(state));
	}
});

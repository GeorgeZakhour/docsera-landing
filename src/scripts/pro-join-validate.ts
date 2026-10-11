// Field rules for the Pro request form — contract C1.
//
// The same table is implemented three times: here, in the edge function
// `pro_join_request` (DocSera-Pro, validate.ts) and in the SQL checks on
// `pro_join_requests`. They must change together. This copy is the one the
// doctor meets first, so it is the strict one: where the contract's wording
// leaves room (how a character is counted, whether a blank is trimmed) it
// accepts only what every reading accepts, and it sends values already in
// their canonical form. A request this file lets through is therefore never
// refused by the other two.
//
// Pure functions only — no DOM, no storage, no network. Covered by
// pro-join-validate.test.ts (`npm test`).

import {
	GOVERNORATES,
	INTERESTS,
	ROLES,
	SCHEDULING_METHODS,
	SPECIALTY_OTHER,
	specialtiesFor,
} from '../config/pro-join.ts';

export type Role = (typeof ROLES)[number]['key'];
export type SchedulingMethod = (typeof SCHEDULING_METHODS)[number]['key'];
export type Step = 1 | 2 | 3;

/** What the wizard holds: every answer as it was typed or picked. */
export interface JoinAnswers {
	role: string;
	full_name: string;
	phone: string;
	whatsapp_same: boolean;
	whatsapp: string;
	/** A label from the list, or SPECIALTY_OTHER. */
	specialty: string;
	/** The free text behind «اختصاص آخر». */
	specialty_other: string;
	place_name: string;
	governorate: string;
	area: string;
	doctors_count: string;
	/** '' while unanswered. */
	scheduling_method: string;
	competitor_name: string;
	interests: string[];
	note: string;
}

/** What is sent as `form`: the contract's keys, canonical values. */
export interface JoinForm {
	role: Role;
	full_name: string;
	phone: string;
	whatsapp_same: boolean;
	whatsapp: string | null;
	specialty: string;
	place_name: string | null;
	governorate: string;
	area: string;
	doctors_count: number | null;
	scheduling_method: SchedulingMethod | null;
	competitor_name: string | null;
	interests: string[];
	note: string | null;
}

export type Checked = { ok: true; form: JoinForm } | { ok: false; fields: string[] };

/** Contract keys in the order the page asks for them, grouped by step. */
const STEP_FIELDS: Record<Step, readonly string[]> = {
	1: ['role', 'full_name', 'phone', 'whatsapp_same', 'whatsapp'],
	2: ['specialty', 'place_name', 'governorate', 'area', 'doctors_count'],
	3: ['scheduling_method', 'competitor_name', 'interests', 'note'],
};
const FIELD_ORDER: readonly string[] = [...STEP_FIELDS[1], ...STEP_FIELDS[2], ...STEP_FIELDS[3]];

const ROLE_KEYS: readonly string[] = ROLES.map((r) => r.key);
const SCHEDULING_KEYS: readonly string[] = SCHEDULING_METHODS.map((m) => m.key);
const INTEREST_KEYS: readonly string[] = INTERESTS.map((i) => i.key);

// ---------------------------------------------------------------- text

// Control characters (which include line breaks and tabs) and the bidi
// embedding / override / isolate controls. Nothing else is refused: angle
// brackets, quotes and emoji are text.
const FORBIDDEN = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;

/**
 * One text answer against its rule. Returns the value to send, null when
 * the answer is empty and may be, or false when it breaks the rule.
 *
 * `min` counts characters (an emoji is one); `max` counts the way a text
 * input's maxlength does, in UTF-16 units — whichever way the server
 * counts, a value inside both bounds is inside its bounds too.
 */
function text(raw: unknown, min: number, max: number, required: boolean): string | null | false {
	if (typeof raw !== 'string') return false;
	if (FORBIDDEN.test(raw)) return false;
	const value = raw.trim().replace(/\s+/g, ' ');
	if (value === '') return required ? false : null;
	if ([...value].length < min || value.length > max) return false;
	return value;
}

/**
 * A textarea lets the doctor press Enter, and a line break is a control
 * character the contract refuses. The page flattens them before the rule is
 * applied, as a single-line input does on its own.
 */
export function flattenLines(raw: string): string {
	return raw.replace(/[ \t]*[\r\n\t]+[ \t]*/g, ' ');
}

// ---------------------------------------------------------------- phone

function latinDigits(raw: string): string {
	return raw
		.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic
		.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)); // Eastern Arabic
}

// Direction marks are invisible and travel with a number copied out of a
// chat or a contact card. They are stripped here, before the contract's rule
// is applied; what is sent is the canonical number, which carries none.
const PHONE_NOISE = /[\s\-().\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const SYRIAN_MOBILE = /^(?:\+963|00963|963|0)?(9\d{8})$/;

/** A Syrian mobile in any of the forms people type → `+9639XXXXXXXX`, else null. */
export function normalizePhone(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const match = SYRIAN_MOBILE.exec(latinDigits(raw).replace(PHONE_NOISE, ''));
	return match ? '+963' + match[1] : null;
}

// ---------------------------------------------------------------- source, cta

/** Where the visitor came from: the `?s=` tag when it is well-formed, else `direct`. */
export function cleanSource(raw: unknown): string {
	return typeof raw === 'string' && /^[a-z_]{1,24}$/.test(raw) ? raw : 'direct';
}

/** Which button on /pro brought the visitor: `hero`, `closing`, else `direct`. */
export function cleanCta(raw: unknown): 'hero' | 'closing' | 'direct' {
	return raw === 'hero' || raw === 'closing' ? raw : 'direct';
}

// ---------------------------------------------------------------- the form

function evaluate(a: JoinAnswers): { form: JoinForm; bad: Set<string> } {
	const bad = new Set<string>();
	/** Records a refusal and hands back a placeholder so the form keeps its shape. */
	const need = <T>(field: string, value: T | false, fallback: T): T => {
		if (value !== false) return value;
		bad.add(field);
		return fallback;
	};

	// ---- step 1
	const role = need('role', ROLE_KEYS.includes(a.role) ? (a.role as Role) : false, 'clinic' as Role);
	const fullName = need('full_name', text(a.full_name, 2, 80, true), '') ?? '';
	const phone = need('phone', normalizePhone(a.phone) ?? false, '');
	if (typeof a.whatsapp_same !== 'boolean') bad.add('whatsapp_same');
	const whatsappSame = a.whatsapp_same !== false;
	// A second number typed and then abandoned is dropped, not checked.
	const whatsapp = whatsappSame ? null : need('whatsapp', normalizePhone(a.whatsapp) ?? false, '');

	// ---- step 2
	let specialty = '';
	if (a.specialty === SPECIALTY_OTHER) {
		specialty = need('specialty', text(a.specialty_other, 2, 80, true), '') ?? '';
	} else if (typeof a.specialty === 'string' && specialtiesFor(role).includes(a.specialty)) {
		specialty = a.specialty;
	} else {
		bad.add('specialty');
	}
	const placeName = need('place_name', text(a.place_name, 2, 100, role !== 'clinic'), null);
	const governorate = need(
		'governorate',
		(GOVERNORATES as readonly string[]).includes(a.governorate) ? a.governorate : false,
		'',
	);
	const area = need('area', text(a.area, 2, 80, true), '') ?? '';
	// Only a center owner is asked; for anyone else a typed count is dropped.
	const doctorsCount = role === 'center_owner' ? need('doctors_count', count(a.doctors_count), null) : null;

	// ---- step 3
	const scheduling = need(
		'scheduling_method',
		a.scheduling_method === '' ? null : SCHEDULING_KEYS.includes(a.scheduling_method) ? (a.scheduling_method as SchedulingMethod) : false,
		null,
	);
	const competitorName = scheduling === 'competitor' ? need('competitor_name', text(a.competitor_name, 0, 60, false), null) : null;
	const interests = need('interests', subset(a.interests), []);
	const note = need('note', text(a.note, 0, 500, false), null);

	return {
		bad,
		form: {
			role,
			full_name: fullName,
			phone,
			whatsapp_same: whatsappSame,
			whatsapp,
			specialty,
			place_name: placeName,
			governorate,
			area,
			doctors_count: doctorsCount,
			scheduling_method: scheduling,
			competitor_name: competitorName,
			interests,
			note,
		},
	};
}

/** A whole number 1–200; empty is "not answered". */
function count(raw: unknown): number | null | false {
	if (typeof raw !== 'string') return false;
	const typed = latinDigits(raw).trim();
	if (typed === '') return null;
	if (!/^\d{1,3}$/.test(typed)) return false;
	const n = Number(typed);
	return n >= 1 && n <= 200 ? n : false;
}

/** A unique subset of the interest keys. */
function subset(raw: unknown): string[] | false {
	if (!Array.isArray(raw)) return false;
	if (raw.some((key) => !INTEREST_KEYS.includes(key))) return false;
	if (new Set(raw).size !== raw.length) return false;
	return [...raw];
}

/** Every answer against the contract: the form to send, or the fields it refuses. */
export function checkAnswers(answers: JoinAnswers): Checked {
	const { form, bad } = evaluate(answers);
	if (bad.size === 0) return { ok: true, form };
	return { ok: false, fields: FIELD_ORDER.filter((field) => bad.has(field)) };
}

/** The refused fields that belong to one step, in the order the step shows them. */
export function validateStep(step: Step, answers: JoinAnswers): string[] {
	const { bad } = evaluate(answers);
	return STEP_FIELDS[step].filter((field) => bad.has(field));
}

/** The step that asks for a field, or null for a name the form does not know. */
export function stepOfField(field: string): Step | null {
	for (const step of [1, 2, 3] as const) {
		if (STEP_FIELDS[step].includes(field)) return step;
	}
	return null;
}

/** The earliest step holding one of these fields — where the doctor is sent back to. */
export function firstBadStep(fields: readonly string[]): Step | null {
	const steps = fields.map(stepOfField).filter((step): step is Step => step !== null);
	return steps.length ? (Math.min(...steps) as Step) : null;
}

/** Known field names only, in page order — the server's list is not trusted as is. */
export function knownFields(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return FIELD_ORDER.filter((field) => raw.includes(field));
}

// ---------------------------------------------------------------- draft

export function emptyAnswers(): JoinAnswers {
	return {
		role: 'clinic',
		full_name: '',
		phone: '',
		whatsapp_same: true,
		whatsapp: '',
		specialty: '',
		specialty_other: '',
		place_name: '',
		governorate: '',
		area: '',
		doctors_count: '',
		scheduling_method: '',
		competitor_name: '',
		interests: [],
		note: '',
	};
}

/**
 * Answers read back from sessionStorage. Storage is outside our control, so
 * every value is coerced to its type and unknown keys are left behind.
 */
export function reviveAnswers(raw: unknown): JoinAnswers {
	const answers = emptyAnswers();
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return answers;
	const stored = raw as Record<string, unknown>;
	const str = (key: string): string => (typeof stored[key] === 'string' ? (stored[key] as string) : '');

	if (ROLE_KEYS.includes(str('role'))) answers.role = str('role');
	answers.full_name = str('full_name');
	answers.phone = str('phone');
	if (stored.whatsapp_same === false) answers.whatsapp_same = false;
	answers.whatsapp = str('whatsapp');
	answers.specialty = str('specialty');
	answers.specialty_other = str('specialty_other');
	answers.place_name = str('place_name');
	answers.governorate = str('governorate');
	answers.area = str('area');
	answers.doctors_count = str('doctors_count');
	answers.scheduling_method = str('scheduling_method');
	answers.competitor_name = str('competitor_name');
	if (Array.isArray(stored.interests)) {
		answers.interests = stored.interests.filter((key): key is string => typeof key === 'string');
	}
	answers.note = str('note');
	return answers;
}

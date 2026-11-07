// Field rules for the careers application form — contract C0.
//
// The same table is implemented three times: here, in the edge function
// `job_application` (DocSera-Pro, validate.ts) and in the SQL checks on
// `job_applications`. They must change together. This copy is the one the
// applicant meets first, so it is the strict one: where the contract's
// wording leaves room (how a character is counted, whether a blank is
// trimmed) it accepts only what every reading accepts, and it sends values
// already in their canonical form. A request this file lets through is
// therefore never refused by the other two — except for a file whose bytes
// do not match its name, which only the server can see.
//
// Pure functions only — no DOM, no storage, no network. A `File` is read for
// its name and size alone. Covered by careers-validate.test.ts (`npm test`).

import {
	AREAS,
	DEGREE_FIELDS,
	DEGREE_LEVELS,
	EXPERIENCE,
	FILE_LIMITS,
	FILE_REASONS,
	FILE_TYPES,
	START,
} from '../config/careers.ts';
import { normalizePhone, normalizeWhatsApp } from './pro-join-validate.ts';

export { flattenLines, latinDigits, normalizePhone, normalizeWhatsApp } from './pro-join-validate.ts';

export type AreaKey = (typeof AREAS)[number]['key'];
export type DegreeLevel = (typeof DEGREE_LEVELS)[number]['key'];
export type DegreeField = (typeof DEGREE_FIELDS)[number]['key'];
export type Experience = (typeof EXPERIENCE)[number]['key'];
export type StartKey = (typeof START)[number]['key'];
export type Step = 1 | 2 | 3;
export type FileKind = 'cv' | 'extra';

/** What the wizard holds: every answer as it was typed or picked. */
export interface CareersAnswers {
	full_name: string;
	phone: string;
	whatsapp_same: boolean;
	whatsapp: string;
	email: string;
	degree_level: string;
	degree_field: string;
	/** The free text behind «أخرى». */
	degree_field_other: string;
	university: string;
	sales_experience: string;
	/** null while unanswered — and it may stay so (optional since round 2). */
	medical_sector: boolean | null;
	medical_sector_detail: string;
	last_employer: string;
	areas: string[];
	/** The place behind the area «أخرى». */
	areas_other: string;
	start_availability: string;
	message: string;
	/** Files are held here, never in the draft. */
	cvFile: File | null;
	extraFiles: File[];
}

/** What is sent as the `form` part: the contract's keys, canonical values. */
export interface CareersForm {
	full_name: string;
	phone: string;
	/** The applicant's WhatsApp, or the phone itself. */
	whatsapp: string;
	email: string;
	degree_level: DegreeLevel;
	degree_field: DegreeField;
	degree_field_other: string;
	university: string;
	sales_experience: Experience;
	/** null = the question was left unanswered. */
	medical_sector: boolean | null;
	medical_sector_detail: string;
	last_employer: string;
	areas: AreaKey[];
	/** '' unless `areas` holds `other`. */
	areas_other: string;
	start_availability: StartKey;
	message: string;
}

export type Checked = { ok: true; form: CareersForm } | { ok: false; fields: string[] };

/**
 * Contract keys in the order the page asks for them, grouped by step. `cv`,
 * `extra` and `files_total` are the server's names for the file parts; they
 * belong to step 3 like the fields around them.
 */
const STEP_FIELDS: Record<Step, readonly string[]> = {
	1: ['full_name', 'phone', 'whatsapp', 'email'],
	2: [
		'degree_level',
		'degree_field',
		'degree_field_other',
		'university',
		'sales_experience',
		'medical_sector',
		'medical_sector_detail',
		'last_employer',
	],
	3: ['areas', 'areas_other', 'start_availability', 'cv', 'extra', 'files_total', 'message'],
};
const FIELD_ORDER: readonly string[] = [...STEP_FIELDS[1], ...STEP_FIELDS[2], ...STEP_FIELDS[3]];

const AREA_KEYS: readonly string[] = AREAS.map((a) => a.key);
const DEGREE_LEVEL_KEYS: readonly string[] = DEGREE_LEVELS.map((d) => d.key);
const DEGREE_FIELD_KEYS: readonly string[] = DEGREE_FIELDS.map((d) => d.key);
const EXPERIENCE_KEYS: readonly string[] = EXPERIENCE.map((e) => e.key);
const START_KEYS: readonly string[] = START.map((s) => s.key);

// ---------------------------------------------------------------- text

// Control characters (which include line breaks and tabs) and the bidi
// embedding / override / isolate controls. Nothing else is refused: angle
// brackets, quotes and emoji are text. (The Pro form's rule, and the
// server's `fn_pro_join_line_ok`.)
const FORBIDDEN = /[\p{Cc}‪-‮⁦-⁩]/u;

/**
 * One text answer against its rule. Returns the value to send, '' when the
 * answer is empty and may be, or false when it breaks the rule.
 *
 * `min` counts characters (an emoji is one); `max` counts the way a text
 * input's maxlength does, in UTF-16 units — whichever way the server
 * counts, a value inside both bounds is inside its bounds too.
 */
function text(raw: unknown, min: number, max: number, required: boolean): string | false {
	if (typeof raw !== 'string') return false;
	if (FORBIDDEN.test(raw)) return false;
	const value = raw.trim().replace(/\s+/g, ' ');
	if (value === '') return required ? false : '';
	if ([...value].length < min || value.length > max) return false;
	return value;
}

/** One of a closed list, or '' when empty is allowed. */
function pick(raw: unknown, keys: readonly string[], required: boolean): string | false {
	if (typeof raw !== 'string') return false;
	if (raw === '') return required ? false : '';
	return keys.includes(raw) ? raw : false;
}

// A plain address shape: one @, a dotted domain, nothing that is not an
// address character. Stricter than the server needs to be.
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

function email(raw: unknown): string | false {
	const value = text(raw, 0, 120, false);
	if (value === false || value === '') return value;
	return EMAIL.test(value) ? value : false;
}

// A paragraph — the message — keeps its line breaks. The
// other control characters and the bidi controls are STRIPPED rather than
// shown back as an error the applicant cannot see (pasted text carries them
// invisibly); the server's `fn_pro_join_note_ok` refuses them, so this copy
// sends the text already clean. Tabs become spaces, runs of blank lines fold
// to one, each line and the whole are trimmed.
// eslint-disable-next-line no-control-regex
const STRIPPED_IN_PARAGRAPH = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/gu;

/**
 * One multi-line answer against its rule. Returns the value to send, '' when
 * the answer is empty and may be, or false when it breaks the rule. Counted
 * as `text` counts, a line break being one character in every copy.
 */
function paragraph(raw: unknown, min: number, max: number, required: boolean): string | false {
	if (typeof raw !== 'string') return false;
	const value = raw
		.replace(/\r\n?/g, '\n')
		.replace(/\t/g, ' ')
		.replace(STRIPPED_IN_PARAGRAPH, '')
		.replace(/ {2,}/g, ' ')
		.replace(/ *\n */g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	if (value === '') return required ? false : '';
	if ([...value].length < min || value.length > max) return false;
	return value;
}

// ---------------------------------------------------------------- files

/** The extension in lower case, '' when there is none. */
function extensionOf(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** The chip a chosen file shows: `PDF`, `DOCX`, `JPG`… '' for a name without a known extension. */
export function fileExt(name: string): string {
	return FILE_TYPES[extensionOf(name)] ?? '';
}

/** `1.8 MB`, `512 KB` — the way the mockup writes a size. */
export function formatBytes(bytes: number): string {
	const MB = 1024 * 1024;
	if (bytes >= MB) {
		const mb = bytes / MB;
		return (Number.isInteger(mb) ? String(mb) : mb.toFixed(1).replace(/\.0$/, '')) + ' MB';
	}
	return Math.max(0, Math.round(bytes / 1024)) + ' KB';
}

function fileLooksRight(file: File): boolean {
	return typeof file.name === 'string' && typeof file.size === 'number' && fileExt(file.name) !== '';
}

function totalBytes(cv: File | null, extras: readonly File[]): number {
	return (cv?.size ?? 0) + extras.reduce((sum, f) => sum + f.size, 0);
}

/**
 * A file the applicant has just chosen, against what is already chosen:
 * the Arabic reason it is refused, or null when it may be taken. `current`
 * is the state before this file is added — a CV being replaced is not
 * counted twice.
 */
export function checkFileChoice(file: File, kind: FileKind, current: CareersAnswers): string | null {
	if (!fileLooksRight(file)) return FILE_REASONS.type;
	if (file.size <= 0) return FILE_REASONS.empty;
	if (file.size > FILE_LIMITS.maxFile) return FILE_REASONS.size;
	if (kind === 'extra' && current.extraFiles.length >= FILE_LIMITS.maxExtras) return FILE_REASONS.count;
	const others = kind === 'cv' ? totalBytes(null, current.extraFiles) : totalBytes(current.cvFile, current.extraFiles);
	if (others + file.size > FILE_LIMITS.maxTotal) return FILE_REASONS.total;
	return null;
}

// ---------------------------------------------------------------- the form

function evaluate(a: CareersAnswers): { form: CareersForm; bad: Set<string> } {
	const bad = new Set<string>();
	/** Records a refusal and hands back a placeholder so the form keeps its shape. */
	const need = <T>(field: string, value: T | false, fallback: T): T => {
		if (value !== false) return value;
		bad.add(field);
		return fallback;
	};

	// ---- step 1
	const fullName = need('full_name', text(a.full_name, 2, 80, true), '');
	const phone = need('phone', normalizePhone(a.phone) ?? false, '');
	let whatsapp = phone;
	if (typeof a.whatsapp_same !== 'boolean') {
		bad.add('whatsapp');
	} else if (!a.whatsapp_same) {
		// A second number typed and then abandoned is dropped, not checked.
		whatsapp = need('whatsapp', normalizeWhatsApp(a.whatsapp) ?? false, '');
	}
	const mail = need('email', email(a.email), '');

	// ---- step 2
	const degreeLevel = need('degree_level', pick(a.degree_level, DEGREE_LEVEL_KEYS, true), 'university') as DegreeLevel;
	const degreeField = need('degree_field', pick(a.degree_field, DEGREE_FIELD_KEYS, true), 'other') as DegreeField;
	// Only «أخرى» asks for the text; for any other field a typed value is dropped.
	const degreeFieldOther = a.degree_field === 'other' ? need('degree_field_other', text(a.degree_field_other, 2, 60, true), '') : '';
	const university = need('university', text(a.university, 0, 80, false), '');
	const experience = need('sales_experience', pick(a.sales_experience, EXPERIENCE_KEYS, true), 'none') as Experience;
	// Optional, and `false` is an answer — so not through `need`: unanswered
	// stays null; anything that is not a yes, a no or nothing is refused.
	if (a.medical_sector !== null && typeof a.medical_sector !== 'boolean') bad.add('medical_sector');
	const medical = typeof a.medical_sector === 'boolean' ? a.medical_sector : null;
	const medicalDetail = a.medical_sector === true ? need('medical_sector_detail', text(a.medical_sector_detail, 0, 200, false), '') : '';
	const lastEmployer = need('last_employer', text(a.last_employer, 0, 120, false), '');

	// ---- step 3
	const areas = need('areas', areaSubset(a.areas), []);
	// Only «أخرى» asks for the place; without it a typed value is dropped.
	const areasOther = areas.includes('other') ? need('areas_other', text(a.areas_other, 2, 80, true), '') : '';
	const start = need('start_availability', pick(a.start_availability, START_KEYS, true), 'later') as StartKey;
	const message = need('message', paragraph(a.message, 0, 500, false), '');

	// ---- the files: counted again here, so nothing refused on choice slips through
	const cv = a.cvFile;
	const extras = Array.isArray(a.extraFiles) ? a.extraFiles : [];
	if (!cv || !fileLooksRight(cv) || cv.size <= 0 || cv.size > FILE_LIMITS.maxFile) bad.add('cv');
	if (extras.length > FILE_LIMITS.maxExtras || extras.some((f) => !fileLooksRight(f) || f.size <= 0 || f.size > FILE_LIMITS.maxFile)) {
		bad.add('extra');
	}
	// The sum is a separate reason only when no single file is already over
	// its own limit — one message, naming the real problem.
	if (!bad.has('cv') && !bad.has('extra') && totalBytes(cv, extras) > FILE_LIMITS.maxTotal) bad.add('files_total');

	return {
		bad,
		form: {
			full_name: fullName,
			phone,
			whatsapp,
			email: mail,
			degree_level: degreeLevel,
			degree_field: degreeField,
			degree_field_other: degreeFieldOther,
			university,
			sales_experience: experience,
			medical_sector: medical,
			medical_sector_detail: medicalDetail,
			last_employer: lastEmployer,
			areas,
			areas_other: areasOther,
			start_availability: start,
			message,
		},
	};
}

/** One to four distinct area keys, sent in the order the page lists them (A · B · C · أخرى). */
function areaSubset(raw: unknown): AreaKey[] | false {
	if (!Array.isArray(raw)) return false;
	if (raw.length === 0 || raw.length > AREA_KEYS.length) return false;
	if (raw.some((key) => !AREA_KEYS.includes(key))) return false;
	if (new Set(raw).size !== raw.length) return false;
	return AREA_KEYS.filter((key) => raw.includes(key)) as AreaKey[];
}

/** Every answer against the contract: the form to send, or the fields it refuses. */
export function checkAnswers(answers: CareersAnswers): Checked {
	const { form, bad } = evaluate(answers);
	if (bad.size === 0) return { ok: true, form };
	return { ok: false, fields: FIELD_ORDER.filter((field) => bad.has(field)) };
}

/** The refused fields that belong to one step, in the order the step shows them. */
export function validateStep(step: Step, answers: CareersAnswers): string[] {
	const { bad } = evaluate(answers);
	return STEP_FIELDS[step].filter((field) => bad.has(field));
}

/** The step that asks for a field, or null for a name the form does not know (`form` included). */
export function stepOfField(field: string): Step | null {
	for (const step of [1, 2, 3] as const) {
		if (STEP_FIELDS[step].includes(field)) return step;
	}
	return null;
}

/** The earliest step holding one of these fields — where the applicant is sent back to. */
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

export function emptyAnswers(): CareersAnswers {
	return {
		full_name: '',
		phone: '',
		whatsapp_same: true,
		whatsapp: '',
		email: '',
		degree_level: '',
		degree_field: '',
		degree_field_other: '',
		university: '',
		sales_experience: '',
		medical_sector: null,
		medical_sector_detail: '',
		last_employer: '',
		areas: [],
		areas_other: '',
		start_availability: '',
		message: '',
		cvFile: null,
		extraFiles: [],
	};
}

/**
 * Answers read back from sessionStorage. Storage is outside our control, so
 * every value is coerced to its type and unknown keys are left behind. A
 * file is never revived: the browser cannot keep one across a reload, and a
 * stored object claiming to be one is not.
 */
export function reviveAnswers(raw: unknown): CareersAnswers {
	const answers = emptyAnswers();
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return answers;
	const stored = raw as Record<string, unknown>;
	const str = (key: string): string => (typeof stored[key] === 'string' ? (stored[key] as string) : '');
	const listed = (key: string, keys: readonly string[]): string => (keys.includes(str(key)) ? str(key) : '');
	const bool = (key: string): boolean | null => (typeof stored[key] === 'boolean' ? (stored[key] as boolean) : null);

	answers.full_name = str('full_name');
	answers.phone = str('phone');
	if (stored.whatsapp_same === false) answers.whatsapp_same = false;
	answers.whatsapp = str('whatsapp');
	answers.email = str('email');
	answers.degree_level = listed('degree_level', DEGREE_LEVEL_KEYS);
	answers.degree_field = listed('degree_field', DEGREE_FIELD_KEYS);
	answers.degree_field_other = str('degree_field_other');
	answers.university = str('university');
	answers.sales_experience = listed('sales_experience', EXPERIENCE_KEYS);
	answers.medical_sector = bool('medical_sector');
	answers.medical_sector_detail = str('medical_sector_detail');
	answers.last_employer = str('last_employer');
	const storedAreas = stored.areas;
	if (Array.isArray(storedAreas)) {
		answers.areas = AREA_KEYS.filter((key) => storedAreas.includes(key)) as string[];
	}
	answers.areas_other = str('areas_other');
	answers.start_availability = listed('start_availability', START_KEYS);
	answers.message = str('message');
	return answers;
}

/** The draft to store: the typed answers without the files. */
export function draftOf(answers: CareersAnswers): Record<string, unknown> {
	const { cvFile: _cv, extraFiles: _extras, ...typed } = answers;
	return typed;
}

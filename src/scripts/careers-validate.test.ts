// Contract C0 for /careers — one table, three implementations (this file's
// subject, the edge function `job_application`, the SQL checks on
// `job_applications`). Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	AREAS,
	DEGREE_FIELDS,
	DEGREE_LEVELS,
	EXPERIENCE,
	FILE_LIMITS,
	PRIVACY_LINE,
	START,
	TITLE,
	WHATSAPP_TEXT,
	whatsappTextWithCode,
} from '../config/careers.ts';
import { CAREERS_WHATSAPP_NUMBER, careersWhatsAppUrl } from '../config/links.ts';
import {
	careersSource,
	checkAnswers,
	checkFileChoice,
	emptyAnswers,
	fileExt,
	firstBadStep,
	formatBytes,
	knownFields,
	reviveAnswers,
	stepOfField,
	validateStep,
} from './careers-validate.ts';
import type { CareersAnswers, CareersForm } from './careers-validate.ts';

const MB = 1024 * 1024;

/** A file as the page sees one: only its name and size matter to the rules. */
function file(name: string, size: number, type = ''): File {
	return { name, size, type } as unknown as File;
}

/** A complete, valid set of answers; each test bends one thing. */
function answers(over: Partial<CareersAnswers> = {}): CareersAnswers {
	return {
		...emptyAnswers(),
		full_name: 'لمى حداد',
		phone: '0944123456',
		degree_level: 'university',
		degree_field: 'pharmacy',
		sales_experience: '1_2',
		medical_sector: true,
		areas: ['mazzeh'],
		start_availability: 'immediately',
		cvFile: file('CV-Lama.pdf', 2 * MB, 'application/pdf'),
		...over,
	};
}

function bad(over: Partial<CareersAnswers>): string[] {
	const result = checkAnswers(answers(over));
	return result.ok ? [] : result.fields;
}

function form(over: Partial<CareersAnswers> = {}): CareersForm {
	const result = checkAnswers(answers(over));
	assert.ok(result.ok, 'expected valid answers, got bad fields: ' + (result.ok ? '' : result.fields.join(', ')));
	return result.form;
}

const CONTROL = 'لمى\u0007حداد'; // a bell character
const NEWLINE = 'لمى\nحداد';
const BIDI_OVERRIDE = 'لمى‮حداد';
const BIDI_ISOLATE = 'لمى⁦حداد⁩';
const LONG_ENOUGH = 'ا'.repeat(20);

// ---------------------------------------------------------------- the lists are the contract

test('the closed lists carry exactly the contract keys, in order (round 2, founder 2026-11-07)', () => {
	assert.deepEqual(AREAS.map((a) => a.key), ['mazzeh', 'rawda_malki_abu_rummaneh', 'city_center', 'other']);
	// only the three hiring areas carry a letter; «أخرى» carries none
	assert.deepEqual(AREAS.map((a) => a.letter), ['A', 'B', 'C', '']);
	// one «شهادة جامعية» — never bachelor or master
	assert.deepEqual(DEGREE_LEVELS.map((d) => d.key), ['high_school', 'institute', 'student', 'university']);
	assert.equal(DEGREE_LEVELS.find((d) => d.key === 'university')?.label, 'شهادة جامعية');
	assert.doesNotMatch(DEGREE_LEVELS.map((d) => d.label).join(' '), /بكالوريوس|ماجستير/);
	// nursing and health sciences out, biomedical engineering in
	assert.deepEqual(DEGREE_FIELDS.map((d) => d.key), [
		'dentistry', 'pharmacy', 'medicine', 'biomedical_engineering', 'business_marketing', 'economics', 'other',
	]);
	// the first four are the medical ones
	assert.deepEqual(DEGREE_FIELDS.map((d) => d.medical), [true, true, true, true, false, false, false]);
	assert.deepEqual(EXPERIENCE.map((e) => e.key), ['none', 'under_1', '1_2', '3_5', 'over_5']);
	assert.deepEqual(START.map((s) => s.key), ['immediately', 'two_weeks', 'one_month', 'later']);
});

test('the file limits are the contract: 16 MB each, 16 MB together, two extras', () => {
	assert.equal(FILE_LIMITS.maxFile, 16 * MB);
	assert.equal(FILE_LIMITS.maxTotal, 16 * MB);
	assert.equal(FILE_LIMITS.maxExtras, 2);
	assert.equal(FILE_LIMITS.accept, '.pdf,.doc,.docx,.jpg,.jpeg,.png,.heic');
});

// Founder rulings, 2026-11-07.
test('the title, the privacy sentence and the copy follow the rulings', () => {
	assert.equal(TITLE, 'مندوب/ة مبيعات');
	assert.equal(PRIVACY_LINE, 'بياناتك وسيرتك الذاتية تُستخدم لغرض التوظيف فقط ولا تُشارك مع أي جهة أخرى.');
	assert.doesNotMatch(PRIVACY_LINE, /http|سياسة/); // one plain sentence, no link
	assert.match(WHATSAPP_TEXT, /مندوب\/ة مبيعات/);
	assert.ok(whatsappTextWithCode('K7M-42Q').includes('K7M-42Q'));
	assert.equal(whatsappTextWithCode('').includes('undefined'), false);
});

test('the careers WhatsApp number is the founder\'s (2026-11-07), and the link carries the prefilled text', () => {
	assert.equal(CAREERS_WHATSAPP_NUMBER, '963983322665');
	const url = careersWhatsAppUrl(WHATSAPP_TEXT);
	assert.ok(url && url.startsWith('https://wa.me/963983322665?text='));
	assert.ok(url.includes(encodeURIComponent('مندوب/ة مبيعات')));
	assert.ok(careersWhatsAppUrl(whatsappTextWithCode('K7M-42Q'))?.includes(encodeURIComponent('K7M-42Q')));
	assert.equal(careersWhatsAppUrl(), 'https://wa.me/963983322665');
});

// ---------------------------------------------------------------- step 1

test('full_name: trimmed, inner whitespace collapsed, 2–80 characters', () => {
	assert.equal(form({ full_name: '   لمى    حداد  ' }).full_name, 'لمى حداد');
	assert.equal(form({ full_name: 'ab' }).full_name, 'ab');
	assert.equal(form({ full_name: 'a'.repeat(80) }).full_name.length, 80);
	assert.deepEqual(bad({ full_name: 'a' }), ['full_name']);
	assert.deepEqual(bad({ full_name: '' }), ['full_name']);
	assert.deepEqual(bad({ full_name: 'a'.repeat(81) }), ['full_name']);
	assert.deepEqual(bad({ full_name: '😀' }), ['full_name']);
	assert.equal(form({ full_name: '😀😀' }).full_name, '😀😀');
});

test('phone: a Syrian mobile in any form is sent canonical; anything else names phone', () => {
	assert.equal(form({ phone: '٠٩٤٤ ١٢٣ ٤٥٦' }).phone, '+963944123456');
	assert.equal(form({ phone: '+963 944 123 456' }).phone, '+963944123456');
	assert.deepEqual(bad({ phone: '12345' }), ['phone']);
	assert.deepEqual(bad({ phone: '' }), ['phone']);
	assert.deepEqual(bad({ phone: '+4915732113277' }), ['phone']);
});

test('whatsapp: the phone itself while it is the same number; required and checked when it is not', () => {
	assert.equal(form({ whatsapp_same: true }).whatsapp, '+963944123456');
	assert.equal(form({ whatsapp_same: true, whatsapp: 'not a number' }).whatsapp, '+963944123456');

	assert.equal(form({ whatsapp_same: false, whatsapp: '+963 955 000 111' }).whatsapp, '+963955000111');
	// the Pro form's rule, verbatim: a number from abroad is written with its code
	assert.equal(form({ whatsapp_same: false, whatsapp: '+49 157 3211 3277' }).whatsapp, '+4915732113277');
	assert.equal(form({ whatsapp_same: false, whatsapp: '0049 157-3211-3277' }).whatsapp, '+4915732113277');

	assert.deepEqual(bad({ whatsapp_same: false, whatsapp: '' }), ['whatsapp']);
	assert.deepEqual(bad({ whatsapp_same: false, whatsapp: '011223344' }), ['whatsapp']);
	assert.deepEqual(bad({ whatsapp_same: false, whatsapp: '4915732113277' }), ['whatsapp']);
});

test('whatsapp_same must be a boolean', () => {
	const broken = { ...answers(), whatsapp_same: 'yes' } as unknown as CareersAnswers;
	const result = checkAnswers(broken);
	assert.equal(result.ok, false);
	assert.deepEqual(result.ok ? [] : result.fields, ['whatsapp']);
});

test('email: optional; a valid address up to 120 characters, else email', () => {
	assert.equal(form({ email: '' }).email, '');
	assert.equal(form({ email: '   ' }).email, '');
	assert.equal(form({ email: ' lama.haddad@example.com ' }).email, 'lama.haddad@example.com');
	assert.equal(form({ email: 'a@b.co' }).email, 'a@b.co');
	const long = 'a'.repeat(108) + '@example.com'; // 120
	assert.equal(form({ email: long }).email.length, 120);
	assert.deepEqual(bad({ email: 'a'.repeat(109) + '@example.com' }), ['email']);
	for (const typed of ['lama', 'lama@', '@example.com', 'lama@example', 'lama haddad@example.com', 'lama@exa mple.com', 'lama@@example.com']) {
		assert.deepEqual(bad({ email: typed }), ['email'], typed);
	}
});

// ---------------------------------------------------------------- step 2

test('degree_level: one of the four; the old bachelor / master keys are refused', () => {
	for (const key of DEGREE_LEVELS.map((d) => d.key)) assert.equal(form({ degree_level: key }).degree_level, key);
	assert.deepEqual(bad({ degree_level: '' }), ['degree_level']);
	assert.deepEqual(bad({ degree_level: 'phd' }), ['degree_level']);
	assert.deepEqual(bad({ degree_level: 'bachelor' }), ['degree_level']);
	assert.deepEqual(bad({ degree_level: 'master_plus' }), ['degree_level']);
});

test('degree_field: one of the seven; «أخرى» needs its text, 2–60; the dropped keys are refused', () => {
	for (const key of DEGREE_FIELDS.map((d) => d.key).filter((k) => k !== 'other')) {
		const sent = form({ degree_field: key });
		assert.equal(sent.degree_field, key);
		assert.equal(sent.degree_field_other, '');
	}
	assert.deepEqual(bad({ degree_field: '' }), ['degree_field']);
	assert.deepEqual(bad({ degree_field: 'law' }), ['degree_field']);
	assert.deepEqual(bad({ degree_field: 'nursing' }), ['degree_field']);
	assert.deepEqual(bad({ degree_field: 'health_sciences' }), ['degree_field']);
	assert.equal(form({ degree_field: 'biomedical_engineering' }).degree_field, 'biomedical_engineering');

	assert.equal(form({ degree_field: 'other', degree_field_other: '  هندسة   معلوماتية ' }).degree_field_other, 'هندسة معلوماتية');
	assert.equal(form({ degree_field: 'other', degree_field_other: 'a'.repeat(60) }).degree_field_other.length, 60);
	assert.deepEqual(bad({ degree_field: 'other', degree_field_other: '' }), ['degree_field_other']);
	assert.deepEqual(bad({ degree_field: 'other', degree_field_other: 'a' }), ['degree_field_other']);
	assert.deepEqual(bad({ degree_field: 'other', degree_field_other: 'a'.repeat(61) }), ['degree_field_other']);
	// typed, then a listed field chosen: dropped, never a reason to refuse
	assert.equal(form({ degree_field: 'medicine', degree_field_other: CONTROL }).degree_field_other, '');
});

test('university: optional, at most 80 characters', () => {
	assert.equal(form({ university: '' }).university, '');
	assert.equal(form({ university: ' جامعة  دمشق ' }).university, 'جامعة دمشق');
	assert.equal(form({ university: 'a'.repeat(80) }).university.length, 80);
	assert.deepEqual(bad({ university: 'a'.repeat(81) }), ['university']);
});

test('sales_experience: one of the five; «لا خبرة» is accepted, not refused', () => {
	for (const key of EXPERIENCE.map((e) => e.key)) assert.equal(form({ sales_experience: key }).sales_experience, key);
	assert.equal(form({ sales_experience: 'none' }).sales_experience, 'none');
	assert.deepEqual(bad({ sales_experience: '' }), ['sales_experience']);
	assert.deepEqual(bad({ sales_experience: '10_plus' }), ['sales_experience']);
});

test('medical_sector: optional — yes, no or unanswered; its detail only with a yes, at most 200', () => {
	assert.equal(form({ medical_sector: true }).medical_sector, true);
	assert.equal(form({ medical_sector: false }).medical_sector, false);
	// round 2: the question may be left alone — null travels as null, never as «no»
	assert.equal(form({ medical_sector: null }).medical_sector, null);
	assert.deepEqual(validateStep(2, answers({ medical_sector: null })), []);
	const broken = { ...answers(), medical_sector: 'yes' } as unknown as CareersAnswers;
	assert.deepEqual((checkAnswers(broken) as { fields: string[] }).fields, ['medical_sector']);

	assert.equal(form({ medical_sector: true, medical_sector_detail: '' }).medical_sector_detail, '');
	assert.equal(form({ medical_sector: true, medical_sector_detail: ' مندوب  طبي ' }).medical_sector_detail, 'مندوب طبي');
	assert.equal(form({ medical_sector: true, medical_sector_detail: 'a'.repeat(200) }).medical_sector_detail.length, 200);
	assert.deepEqual(bad({ medical_sector: true, medical_sector_detail: 'a'.repeat(201) }), ['medical_sector_detail']);
	// a detail typed, then «لا» or the answer taken back: dropped
	assert.equal(form({ medical_sector: false, medical_sector_detail: 'a'.repeat(201) }).medical_sector_detail, '');
	assert.equal(form({ medical_sector: null, medical_sector_detail: 'a'.repeat(201) }).medical_sector_detail, '');
});

test('last_employer: optional, at most 120 characters', () => {
	assert.equal(form({ last_employer: '' }).last_employer, '');
	assert.equal(form({ last_employer: 'a'.repeat(120) }).last_employer.length, 120);
	assert.deepEqual(bad({ last_employer: 'a'.repeat(121) }), ['last_employer']);
});

// ---------------------------------------------------------------- step 3

test('areas: one to four of the four keys, no duplicates, sent in A·B·C·أخرى order', () => {
	assert.deepEqual(form({ areas: ['mazzeh'] }).areas, ['mazzeh']);
	assert.deepEqual(form({ areas: ['city_center', 'mazzeh'] }).areas, ['mazzeh', 'city_center']);
	assert.deepEqual(form({ areas: ['city_center', 'rawda_malki_abu_rummaneh', 'mazzeh'] }).areas, [
		'mazzeh', 'rawda_malki_abu_rummaneh', 'city_center',
	]);
	assert.deepEqual(form({ areas: ['other', 'city_center'], areas_other: 'جرمانا' }).areas, ['city_center', 'other']);
	assert.deepEqual(bad({ areas: [] }), ['areas']);
	assert.deepEqual(bad({ areas: ['mazzeh', 'mazzeh'] }), ['areas']);
	assert.deepEqual(bad({ areas: ['damascus'] }), ['areas']);
	assert.deepEqual(bad({ areas: ['mazzeh', 'rawda_malki_abu_rummaneh', 'city_center', 'other', 'mazzeh'], areas_other: 'جرمانا' }), ['areas']);
	assert.deepEqual(bad({ areas: 'mazzeh' as unknown as string[] }), ['areas']);
});

test('areas_other: the place behind «أخرى» — required with it (2–80), dropped without it', () => {
	assert.equal(form({ areas: ['other'], areas_other: ' جرمانا ' }).areas_other, 'جرمانا');
	assert.equal(form({ areas: ['other'], areas_other: 'a'.repeat(80) }).areas_other.length, 80);
	assert.deepEqual(bad({ areas: ['other'], areas_other: '' }), ['areas_other']);
	assert.deepEqual(bad({ areas: ['other'], areas_other: 'ج' }), ['areas_other']);
	assert.deepEqual(bad({ areas: ['other'], areas_other: 'a'.repeat(81) }), ['areas_other']);
	assert.deepEqual(bad({ areas: ['mazzeh', 'other'], areas_other: '' }), ['areas_other']);
	// typed, then «أخرى» unticked: dropped, never a reason to refuse
	assert.equal(form({ areas: ['mazzeh'], areas_other: CONTROL }).areas_other, '');
	// and «أخرى» alone is a valid choice — the applicant lives in Jaramana
	assert.deepEqual(validateStep(3, answers({ areas: ['other'], areas_other: 'جرمانا' })), []);
});

test('start_availability: one of the four', () => {
	for (const key of START.map((s) => s.key)) assert.equal(form({ start_availability: key }).start_availability, key);
	assert.deepEqual(bad({ start_availability: '' }), ['start_availability']);
	assert.deepEqual(bad({ start_availability: 'tomorrow' }), ['start_availability']);
});

test('message: optional, at most 500 characters, keeps its line breaks', () => {
	assert.equal(form({ message: '' }).message, '');
	assert.equal(form({ message: ' أعمل  مساءً فقط ' }).message, 'أعمل مساءً فقط');
	assert.equal(form({ message: 'a'.repeat(500) }).message.length, 500);
	assert.deepEqual(bad({ message: 'a'.repeat(501) }), ['message']);
	assert.equal(form({ message: NEWLINE }).message, NEWLINE);
	// 500 counted with the line breaks: 250 + 1 + 250 is over
	assert.deepEqual(bad({ message: 'a'.repeat(250) + '\n' + 'a'.repeat(250) }), ['message']);
});

// ---------------------------------------------------------------- text rules

test('every one-line field refuses control and bidi characters, and names itself', () => {
	for (const poison of [CONTROL, NEWLINE, BIDI_OVERRIDE, BIDI_ISOLATE]) {
		assert.deepEqual(bad({ full_name: poison }), ['full_name']);
		assert.deepEqual(bad({ areas: ['other'], areas_other: poison }), ['areas_other']);
		assert.deepEqual(bad({ degree_field: 'other', degree_field_other: poison }), ['degree_field_other']);
		assert.deepEqual(bad({ university: poison }), ['university']);
		assert.deepEqual(bad({ medical_sector: true, medical_sector_detail: poison }), ['medical_sector_detail']);
		assert.deepEqual(bad({ last_employer: poison }), ['last_employer']);
	}
});

// Review drift #1 — the edge function and the table accept «\n» in these two;
// the page used to flatten them to one line, losing the applicant's paragraphs.

test('the message is a paragraph: line breaks kept, the rest cleaned', () => {
	const two = 'سطر أول\nسطر ثان';
	assert.equal(form({ message: two }).message, two);
	// tabs and runs of spaces fold, a line's edges are trimmed, 3+ blank lines become 2
	assert.equal(form({ message: 'سطر أول  \t بمسافات \r\nسطر ثان' }).message, 'سطر أول بمسافات\nسطر ثان');
	assert.equal(form({ message: '\n\n' + LONG_ENOUGH + '\n\n\n\n' + LONG_ENOUGH + '\n' }).message, LONG_ENOUGH + '\n\n' + LONG_ENOUGH);
	// control characters and bidi marks are stripped, not shown back as an error the applicant cannot see
	assert.equal(form({ message: LONG_ENOUGH + CONTROL }).message, LONG_ENOUGH + 'لمىحداد');
	assert.equal(form({ message: LONG_ENOUGH + BIDI_OVERRIDE }).message, LONG_ENOUGH + 'لمىحداد');
	// a line break is one character; only blank lines is nothing
	assert.equal(form({ message: 'ا'.repeat(10) + '\n' + 'ا'.repeat(9) }).message.length, 20);
	assert.equal(form({ message: '\n\n\n' }).message, '');
	assert.equal(form({ message: '\n \n' }).message, '');
});

test('angle brackets, quotes and emoji are text, not a reason to refuse', () => {
	const odd = '<script>alert("x")</script> \'لمى\' 😀';
	const sent = form({ full_name: odd, university: odd, last_employer: odd, areas: ['other'], areas_other: odd, message: odd });
	assert.equal(sent.full_name, odd);
	assert.equal(sent.university, odd);
	assert.equal(sent.last_employer, odd);
	assert.equal(sent.areas_other, odd);
	assert.equal(sent.message, odd);
});

// ---------------------------------------------------------------- files

test('cv: required; step 3 without one names cv', () => {
	assert.deepEqual(bad({ cvFile: null }), ['cv']);
	assert.deepEqual(validateStep(3, answers({ cvFile: null })), ['cv']);
	assert.deepEqual(validateStep(3, answers()), []);
});

test('a file is refused on the spot for its type, with the reason', () => {
	const current = answers();
	for (const name of ['cv.svg', 'cv.html', 'cv.exe', 'cv.zip', 'cv', 'cv.pdf.js', 'CV.PDF.txt']) {
		assert.match(checkFileChoice(file(name, 1 * MB), 'cv', current) ?? '', /نوع الملف غير مدعوم/, name);
	}
	for (const name of ['cv.pdf', 'CV.PDF', 'cv.doc', 'cv.docx', 'cv.jpg', 'cv.jpeg', 'cv.png', 'cv.heic', 'سيرتي الذاتية.pdf', 'my.cv.v2.PDF']) {
		assert.equal(checkFileChoice(file(name, 1 * MB), 'cv', current), null, name);
	}
});

test('a file is refused on the spot for its size: 16 MB passes, one byte more does not', () => {
	const current = answers({ cvFile: null });
	assert.equal(checkFileChoice(file('cv.pdf', 16 * MB), 'cv', current), null);
	assert.match(checkFileChoice(file('cv.pdf', 16 * MB + 1), 'cv', current) ?? '', /الحد 16 ميغابايت/);
	assert.match(checkFileChoice(file('cv.pdf', 0), 'cv', current) ?? '', /فارغ/);
});

test('a third extra file is refused', () => {
	const current = answers({ extraFiles: [file('a.jpg', 1 * MB), file('b.jpg', 1 * MB)] });
	assert.match(checkFileChoice(file('c.jpg', 1 * MB), 'extra', current) ?? '', /حتى ملفّين/);
	// replacing the CV is still allowed with two extras in place
	assert.equal(checkFileChoice(file('cv.pdf', 1 * MB), 'cv', current), null);
	assert.deepEqual(bad({ extraFiles: [file('a.jpg', 1 * MB), file('b.jpg', 1 * MB), file('c.jpg', 1 * MB)] }), ['extra']);
});

test('the files together may not pass 16 MB', () => {
	// 9 MB CV already chosen, an 8 MB extra offered
	const withCv = answers({ cvFile: file('cv.pdf', 9 * MB) });
	assert.match(checkFileChoice(file('cert.jpg', 8 * MB), 'extra', withCv) ?? '', /مجموع الملفات/);
	assert.equal(checkFileChoice(file('cert.jpg', 7 * MB), 'extra', withCv), null);
	// an 8 MB extra already chosen, a 9 MB CV offered
	const withExtra = answers({ cvFile: null, extraFiles: [file('cert.jpg', 8 * MB)] });
	assert.match(checkFileChoice(file('cv.pdf', 9 * MB), 'cv', withExtra) ?? '', /مجموع الملفات/);
	// a CV being replaced does not count twice
	const replacing = answers({ cvFile: file('old.pdf', 10 * MB), extraFiles: [file('cert.jpg', 6 * MB)] });
	assert.equal(checkFileChoice(file('new.pdf', 10 * MB), 'cv', replacing), null);
	// and the whole set is checked again before sending
	assert.deepEqual(bad({ cvFile: file('cv.pdf', 9 * MB), extraFiles: [file('cert.jpg', 8 * MB)] }), ['files_total']);
	assert.deepEqual(bad({ cvFile: file('cv.pdf', 16 * MB + 1) }), ['cv']);
	assert.deepEqual(bad({ cvFile: file('cv.pdf', 16 * MB) }), []);
});

test('a file name is shown with its type chip and a readable size', () => {
	assert.equal(fileExt('CV-Lama.pdf'), 'PDF');
	assert.equal(fileExt('الشهادة.JPEG'), 'JPG');
	assert.equal(fileExt('a.jpg'), 'JPG');
	assert.equal(fileExt('a.docx'), 'DOCX');
	assert.equal(fileExt('a.heic'), 'HEIC');
	assert.equal(fileExt('noext'), '');
	assert.equal(formatBytes(1.8 * MB), '1.8 MB');
	assert.equal(formatBytes(16 * MB), '16 MB');
	assert.equal(formatBytes(512 * 1024), '512 KB');
	assert.equal(formatBytes(999), '1 KB');
	assert.equal(formatBytes(0), '0 KB');
});

// ---------------------------------------------------------------- steps

test('each step answers for its own fields only', () => {
	const blank = emptyAnswers();
	assert.deepEqual(validateStep(1, blank), ['full_name', 'phone']);
	assert.deepEqual(validateStep(2, blank), ['degree_level', 'degree_field', 'sales_experience']);
	assert.deepEqual(validateStep(3, blank), ['areas', 'start_availability', 'cv']);

	const other = { ...blank, whatsapp_same: false, degree_field: 'other', areas: ['other'] };
	assert.deepEqual(validateStep(1, other), ['full_name', 'phone', 'whatsapp']);
	assert.deepEqual(validateStep(2, other), ['degree_level', 'degree_field_other', 'sales_experience']);
	assert.deepEqual(validateStep(3, other), ['areas_other', 'start_availability', 'cv']);
});

test('a refused field leads back to the step that holds it', () => {
	assert.equal(stepOfField('phone'), 1);
	assert.equal(stepOfField('whatsapp'), 1);
	assert.equal(stepOfField('medical_sector'), 2);
	assert.equal(stepOfField('degree_field_other'), 2);
	assert.equal(stepOfField('areas'), 3);
	assert.equal(stepOfField('areas_other'), 3);
	// the fields of round 2 are gone from the form
	for (const gone of ['residence', 'military_status', 'achievement', 'has_transport', 'linkedin_url']) {
		assert.equal(stepOfField(gone), null, gone);
	}
	assert.equal(stepOfField('cv'), 3);
	assert.equal(stepOfField('extra'), 3);
	assert.equal(stepOfField('files_total'), 3);
	assert.equal(stepOfField('message'), 3);
	assert.equal(stepOfField('form'), null);
	assert.equal(stepOfField('not_a_field'), null);

	assert.equal(firstBadStep(['message', 'degree_field_other', 'cv']), 2);
	assert.equal(firstBadStep(['cv', 'phone']), 1);
	assert.equal(firstBadStep(['files_total']), 3);
	assert.equal(firstBadStep([]), null);
	assert.equal(firstBadStep(['form']), null);
});

test('the server\'s field list is reduced to known names in page order', () => {
	assert.deepEqual(knownFields(['message', 'cv', 'phone', 'not_a_field', 7, 'form']), ['phone', 'cv', 'message']);
	assert.deepEqual(knownFields('phone'), []);
	assert.deepEqual(knownFields(null), []);
});

test('a complete request carries every contract key and nothing else', () => {
	const sent = form({
		whatsapp_same: false,
		whatsapp: '0955000111',
		email: 'lama@example.com',
		degree_field: 'other',
		degree_field_other: 'هندسة',
		university: 'جامعة دمشق',
		sales_experience: 'none',
		medical_sector: true,
		medical_sector_detail: 'مندوب طبي',
		last_employer: 'شركة أدوية — مندوب',
		areas: ['other', 'city_center', 'mazzeh'],
		areas_other: 'جرمانا',
		start_availability: 'two_weeks',
		message: 'أعمل مساءً فقط',
		extraFiles: [file('cert.jpg', 1 * MB)],
	});
	assert.deepEqual(sent, {
		full_name: 'لمى حداد',
		phone: '+963944123456',
		whatsapp: '+963955000111',
		email: 'lama@example.com',
		degree_level: 'university',
		degree_field: 'other',
		degree_field_other: 'هندسة',
		university: 'جامعة دمشق',
		sales_experience: 'none',
		medical_sector: true,
		medical_sector_detail: 'مندوب طبي',
		last_employer: 'شركة أدوية — مندوب',
		areas: ['mazzeh', 'city_center', 'other'],
		areas_other: 'جرمانا',
		start_availability: 'two_weeks',
		message: 'أعمل مساءً فقط',
	});
	// the fields of round 2 never travel, not even empty
	for (const gone of ['residence', 'military_status', 'achievement', 'has_transport', 'linkedin_url']) {
		assert.equal(gone in sent, false, gone);
	}
	// the files travel as parts, never inside the JSON
	assert.equal('cv' in sent, false);
	assert.equal('cvFile' in sent, false);
	assert.equal('extraFiles' in sent, false);
});

test('a minimal request sends the optionals as empty strings and nulls, as the contract allows', () => {
	const sent = form({ medical_sector: null });
	assert.equal(sent.email, '');
	assert.equal(sent.degree_field_other, '');
	assert.equal(sent.university, '');
	assert.equal(sent.medical_sector, null);
	assert.equal(sent.medical_sector_detail, '');
	assert.equal(sent.last_employer, '');
	assert.equal(sent.areas_other, '');
	assert.equal(sent.message, '');
	assert.equal(sent.whatsapp, sent.phone);
});

// ---------------------------------------------------------------- source

test('the source tag: letters, digits and underscores up to 24 — «?s=3» is a source, not direct', () => {
	assert.equal(careersSource('?s=3'), '3');
	assert.equal(careersSource('?s=poster'), 'poster');
	assert.equal(careersSource('?s=poster_2&x=1'), 'poster_2');
	assert.equal(careersSource('?x=1&s=12'), '12');
	assert.equal(careersSource(''), 'direct');
	assert.equal(careersSource('?s='), 'direct');
	assert.equal(careersSource('?s=Insta%20gram'), 'direct');
	assert.equal(careersSource('?s=Facebook'), 'direct');
	assert.equal(careersSource('?s=' + 'a'.repeat(25)), 'direct');
});

// ---------------------------------------------------------------- draft

test('a draft read back from storage is never trusted, and never carries a file', () => {
	assert.deepEqual(reviveAnswers(null), emptyAnswers());
	assert.deepEqual(reviveAnswers('nonsense'), emptyAnswers());
	assert.deepEqual(reviveAnswers([1, 2]), emptyAnswers());

	const revived = reviveAnswers({
		full_name: 'لمى',
		phone: 944123456,
		whatsapp_same: 'no',
		medical_sector: true,
		areas: ['mazzeh', 5, 'city_center', 'nowhere'],
		areas_other: { a: 1 },
		cvFile: { name: 'cv.pdf', size: 10 },
		extraFiles: [{ name: 'a.jpg', size: 10 }],
		extra: 'ignored',
	});
	assert.equal(revived.full_name, 'لمى');
	assert.equal(revived.phone, '');
	assert.equal(revived.whatsapp_same, true);
	assert.equal(revived.medical_sector, true);
	assert.deepEqual(revived.areas, ['mazzeh', 'city_center']);
	assert.equal(revived.areas_other, '');
	assert.equal(revived.cvFile, null);
	assert.deepEqual(revived.extraFiles, []);
	assert.equal('extra' in revived, false);

	assert.equal(reviveAnswers({ whatsapp_same: false }).whatsapp_same, false);
	assert.equal(reviveAnswers({ medical_sector: false }).medical_sector, false);
	assert.deepEqual(reviveAnswers({ areas: ['other'], areas_other: 'جرمانا' }).areas, ['other']);
	assert.equal(reviveAnswers({ areas: ['other'], areas_other: 'جرمانا' }).areas_other, 'جرمانا');
	// a draft from before round 2 revives without its dead keys
	const old = reviveAnswers({ residence: 'القصاع', military_status: 'completed', achievement: 'x', has_transport: true, linkedin_url: 'y' }) as unknown as Record<string, unknown>;
	for (const gone of ['residence', 'military_status', 'achievement', 'has_transport', 'linkedin_url']) assert.equal(gone in old, false, gone);
	assert.equal(reviveAnswers({ degree_field: 'law' }).degree_field, '');
	assert.equal(reviveAnswers({ degree_field: 'pharmacy' }).degree_field, 'pharmacy');
});

test('the default answers: WhatsApp on the same number, nothing picked, no files', () => {
	const blank = emptyAnswers();
	assert.equal(blank.whatsapp_same, true);
	assert.equal(blank.medical_sector, null);
	assert.deepEqual(blank.areas, []);
	assert.equal(blank.areas_other, '');
	assert.equal(blank.cvFile, null);
	assert.deepEqual(blank.extraFiles, []);
});

// Contract C1 for /pro/join — one table, three implementations (this file's
// subject, the edge function, the SQL checks). Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	GOVERNORATES,
	INTERESTS,
	SPECIALTIES,
	SPECIALTY_MULTI,
	SPECIALTY_OTHER,
	specialtiesFor,
} from '../config/pro-join.ts';
import {
	checkAnswers,
	cleanCta,
	cleanSource,
	emptyAnswers,
	firstBadStep,
	flattenLines,
	normalizePhone,
	reviveAnswers,
	stepOfField,
	validateStep,
	normalizeWhatsApp,
	latinDigits,
	showsDentalChart,
} from './pro-join-validate.ts';
import type { JoinAnswers, JoinForm } from './pro-join-validate.ts';

/** A complete, valid set of answers; each test bends one thing. */
function answers(over: Partial<JoinAnswers> = {}): JoinAnswers {
	return {
		...emptyAnswers(),
		role: 'clinic',
		full_name: 'سامر الحلبي',
		phone: '0944123456',
		specialty: 'طب الأسنان',
		governorate: 'دمشق',
		area: 'المزة',
		...over,
	};
}

function bad(over: Partial<JoinAnswers>): string[] {
	const result = checkAnswers(answers(over));
	return result.ok ? [] : result.fields;
}

function form(over: Partial<JoinAnswers> = {}): JoinForm {
	const result = checkAnswers(answers(over));
	assert.ok(result.ok, 'expected valid answers, got bad fields: ' + (result.ok ? '' : result.fields.join(', ')));
	return result.form;
}

const CONTROL = 'سامر\u0007الحلبي'; // a bell character
const NEWLINE = 'سامر\nالحلبي';
const BIDI_OVERRIDE = 'سامر\u202Eالحلبي';
const BIDI_ISOLATE = 'سامر\u2066الحلبي\u2069';

// ---------------------------------------------------------------- phone

test('phone forms normalise to one value', () => {
	// Review focus 1: a mobile typed the way people type it.
	const forms = [
		'٠٩٤٤ ١٢٣ ٤٥٦',
		'0944-123-456',
		'+963 944 123 456',
		'00963944123456',
		'963944123456',
		'944123456',
		'(0944) 123.456',
		'۰۹۴۴۱۲۳۴۵۶', // Eastern Arabic digits
		'  0944123456  ',
	];
	for (const typed of forms) {
		assert.equal(normalizePhone(typed), '+963944123456', typed);
	}
});

test('phone pasted from a contact card with invisible direction marks is the same number', () => {
	assert.equal(normalizePhone('\u202A+963 944 123 456\u202C'), '+963944123456');
	assert.equal(normalizePhone('\u200E0944123456\u200F'), '+963944123456');
});

test('phone that is not a Syrian mobile is refused', () => {
	const refused = [
		'',
		'   ',
		'0112345678', // landline
		'094412345', // one digit short
		'09441234567', // one digit long
		'0944x23456',
		'+964944123456', // another country
		'+9630944123456', // trunk zero after the country code
		'0844123456',
	];
	for (const typed of refused) assert.equal(normalizePhone(typed), null, JSON.stringify(typed));
	assert.equal(normalizePhone(undefined), null);
	assert.equal(normalizePhone(944123456), null);
});

test('phone: a good number is sent canonical, a bad one names phone', () => {
	assert.equal(form({ phone: '٠٩٤٤ ١٢٣ ٤٥٦' }).phone, '+963944123456');
	assert.deepEqual(bad({ phone: '12345' }), ['phone']);
	assert.deepEqual(bad({ phone: '' }), ['phone']);
});

// ---------------------------------------------------------------- role

test('role: the three roles are accepted, anything else names role', () => {
	assert.equal(form({ role: 'clinic' }).role, 'clinic');
	assert.equal(form({ role: 'center_owner', place_name: 'مركز الشام' }).role, 'center_owner');
	assert.equal(form({ role: 'center_staff', place_name: 'مركز الشام' }).role, 'center_staff');
	assert.ok(bad({ role: 'owner' }).includes('role'));
	assert.ok(bad({ role: '' }).includes('role'));
});

// ---------------------------------------------------------------- full_name

test('full_name: trimmed, inner whitespace collapsed, 2–80 characters', () => {
	assert.equal(form({ full_name: '   سامر    الحلبي  ' }).full_name, 'سامر الحلبي');
	assert.equal(form({ full_name: 'ab' }).full_name, 'ab');
	assert.equal(form({ full_name: 'a'.repeat(80) }).full_name.length, 80);
	assert.deepEqual(bad({ full_name: 'a' }), ['full_name']);
	assert.deepEqual(bad({ full_name: '   a   ' }), ['full_name']);
	assert.deepEqual(bad({ full_name: '' }), ['full_name']);
	assert.deepEqual(bad({ full_name: 'a'.repeat(81) }), ['full_name']);
	assert.deepEqual(bad({ full_name: 'a'.repeat(5000) }), ['full_name']);
});

test('full_name: one emoji is one character, not two', () => {
	assert.deepEqual(bad({ full_name: '😀' }), ['full_name']);
	assert.equal(form({ full_name: '😀😀' }).full_name, '😀😀');
});

// ---------------------------------------------------------------- text rules

test('every text field refuses control and bidi characters, and names itself', () => {
	const owner = { role: 'center_owner', place_name: 'مركز الشام' };
	for (const poison of [CONTROL, NEWLINE, BIDI_OVERRIDE, BIDI_ISOLATE]) {
		assert.deepEqual(bad({ full_name: poison }), ['full_name']);
		assert.deepEqual(bad({ specialty: SPECIALTY_OTHER, specialty_other: poison }), ['specialty']);
		assert.deepEqual(bad({ ...owner, place_name: poison }), ['place_name']);
		assert.deepEqual(bad({ area: poison }), ['area']);
		assert.deepEqual(bad({ scheduling_method: 'competitor', competitor_name: poison }), ['competitor_name']);
		assert.deepEqual(bad({ note: poison }), ['note']);
	}
});

test('angle brackets, quotes and emoji are text, not a reason to refuse', () => {
	const odd = '<script>alert("x")</script> \'دكتور\' 😀';
	const sent = form({
		full_name: odd,
		specialty: SPECIALTY_OTHER,
		specialty_other: odd,
		place_name: odd,
		area: odd,
		scheduling_method: 'competitor',
		competitor_name: odd,
		note: odd,
	});
	assert.equal(sent.full_name, odd);
	assert.equal(sent.specialty, odd);
	assert.equal(sent.place_name, odd);
	assert.equal(sent.area, odd);
	assert.equal(sent.competitor_name, odd);
	assert.equal(sent.note, odd);
});

// ---------------------------------------------------------------- whatsapp

test('whatsapp: null while it is the same number; required and checked when it is not', () => {
	assert.equal(form({ whatsapp_same: true }).whatsapp, null);
	assert.equal(form({ whatsapp_same: true }).whatsapp_same, true);

	const other = form({ whatsapp_same: false, whatsapp: '+963 955 000 111' });
	assert.equal(other.whatsapp_same, false);
	assert.equal(other.whatsapp, '+963955000111');

	assert.deepEqual(bad({ whatsapp_same: false, whatsapp: '' }), ['whatsapp']);
	assert.deepEqual(bad({ whatsapp_same: false, whatsapp: '011223344' }), ['whatsapp']);
});

// Founder, 2026-10-11: a doctor's WhatsApp is often on a number from abroad.
test('whatsapp: a number from any country, written with its code', () => {
	for (const [typed, stored] of [
		['+4915732113277', '+4915732113277'],
		['+49 157 3211 3277', '+4915732113277'],
		['0049 157-3211-3277', '+4915732113277'],
		['+1 (415) 555-0100', '+14155550100'],
		['+٩٧١ ٥٠ ١٢٣ ٤٥٦٧', '+971501234567'],
		['+963 11 222 3344', '+963112223344'],
		['0933 000 111', '+963933000111'],
		['٠٩٣٣٠٠٠١١١', '+963933000111'],
		['933000111', '+963933000111'],
	]) assert.equal(normalizeWhatsApp(typed), stored, typed);
	assert.equal(form({ whatsapp_same: false, whatsapp: '+49 157 3211 3277' }).whatsapp, '+4915732113277');
});

test('whatsapp: a foreign number without its country code is not guessed', () => {
	for (const typed of ['4915732113277', '015732113277', '+96394412345', '+9639441234567', '+0123456789', '+49', '+491573211327712345', '', null, 49157]) {
		assert.equal(normalizeWhatsApp(typed), null, String(typed));
	}
	assert.deepEqual(bad({ whatsapp_same: false, whatsapp: '4915732113277' }), ['whatsapp']);
});

test('the mobile itself stays a Syrian mobile', () => {
	assert.equal(normalizePhone('+4915732113277'), null);
	assert.deepEqual(bad({ phone: '+4915732113277' }), ['phone']);
});

// Founder, 2026-10-11: «make the field write the numbers in English even if
// the keyboard was Arabic».
test('digits typed on an Arabic keyboard become Latin digits, and nothing else changes', () => {
	assert.equal(latinDigits('٠٩٤٤ ١٢٣ ٤٥٦'), '0944 123 456');
	assert.equal(latinDigits('۰۹۴۴۱۲۳۴۵۶'), '0944123456');
	assert.equal(latinDigits('+٤٩ 157'), '+49 157');
	assert.equal(latinDigits('١٢'), '12');
	assert.equal(latinDigits('0944 abc د.'), '0944 abc د.');
	// one character in, one character out: the caret does not move
	assert.equal(latinDigits('٠٩٤٤-١٢٣').length, '٠٩٤٤-١٢٣'.length);
});

test('whatsapp_same must be a boolean', () => {
	const broken = { ...answers(), whatsapp_same: 'yes' } as unknown as JoinAnswers;
	const result = checkAnswers(broken);
	assert.equal(result.ok, false);
	assert.deepEqual(result.ok ? [] : result.fields, ['whatsapp_same']);
});

// ---------------------------------------------------------------- specialty

test('specialty: a listed one is sent as its label', () => {
	for (const label of SPECIALTIES) assert.equal(form({ specialty: label }).specialty, label);
	assert.deepEqual(bad({ specialty: '' }), ['specialty']);
	assert.deepEqual(bad({ specialty: 'ليس في القائمة' }), ['specialty']);
});

test('specialty: «اختصاص آخر» sends the typed text, 2–80 characters', () => {
	assert.equal(form({ specialty: SPECIALTY_OTHER, specialty_other: '  طب   النوم ' }).specialty, 'طب النوم');
	assert.equal(form({ specialty: SPECIALTY_OTHER, specialty_other: 'a'.repeat(80) }).specialty.length, 80);
	assert.deepEqual(bad({ specialty: SPECIALTY_OTHER, specialty_other: '' }), ['specialty']);
	assert.deepEqual(bad({ specialty: SPECIALTY_OTHER, specialty_other: 'a' }), ['specialty']);
	assert.deepEqual(bad({ specialty: SPECIALTY_OTHER, specialty_other: 'a'.repeat(81) }), ['specialty']);
});

test('specialty: «متعدد الاختصاصات» is offered to a center owner only', () => {
	const owner = { role: 'center_owner', place_name: 'مركز الشام' };
	assert.equal(form({ ...owner, specialty: SPECIALTY_MULTI }).specialty, SPECIALTY_MULTI);
	assert.deepEqual(bad({ role: 'clinic', specialty: SPECIALTY_MULTI }), ['specialty']);
	assert.deepEqual(bad({ role: 'center_staff', place_name: 'مركز الشام', specialty: SPECIALTY_MULTI }), ['specialty']);
});

// ---------------------------------------------------------------- place_name

test('place_name: optional for a clinic, required for both center roles, 2–100', () => {
	assert.equal(form({ role: 'clinic', place_name: '' }).place_name, null);
	assert.equal(form({ role: 'clinic', place_name: '   ' }).place_name, null);
	assert.equal(form({ role: 'clinic', place_name: ' عيادة  الشفاء ' }).place_name, 'عيادة الشفاء');
	assert.deepEqual(bad({ role: 'clinic', place_name: 'ع' }), ['place_name']);
	assert.deepEqual(bad({ role: 'clinic', place_name: 'a'.repeat(101) }), ['place_name']);
	assert.equal(form({ role: 'clinic', place_name: 'a'.repeat(100) }).place_name?.length, 100);

	for (const role of ['center_owner', 'center_staff']) {
		assert.equal(form({ role, place_name: 'مركز الشام' }).place_name, 'مركز الشام');
		assert.deepEqual(bad({ role, place_name: '' }), ['place_name']);
		assert.deepEqual(bad({ role, place_name: 'م' }), ['place_name']);
	}
});

// ---------------------------------------------------------------- governorate, area

test('governorate: one of the fourteen, spelled as the contract spells them', () => {
	assert.deepEqual([...GOVERNORATES], [
		'دمشق', 'ريف دمشق', 'حلب', 'حمص', 'حماة', 'اللاذقية', 'طرطوس',
		'إدلب', 'دير الزور', 'الرقة', 'الحسكة', 'درعا', 'السويداء', 'القنيطرة',
	]);
	for (const name of GOVERNORATES) assert.equal(form({ governorate: name }).governorate, name);
	assert.deepEqual(bad({ governorate: '' }), ['governorate']);
	assert.deepEqual(bad({ governorate: 'بيروت' }), ['governorate']);
	assert.deepEqual(bad({ governorate: 'ادلب' }), ['governorate']); // spelling matters
});

test('area: 2–80 characters', () => {
	assert.equal(form({ area: '  باب   توما ' }).area, 'باب توما');
	assert.equal(form({ area: 'a'.repeat(80) }).area.length, 80);
	assert.deepEqual(bad({ area: '' }), ['area']);
	assert.deepEqual(bad({ area: 'م' }), ['area']);
	assert.deepEqual(bad({ area: 'a'.repeat(81) }), ['area']);
});

// ---------------------------------------------------------------- doctors_count

test('doctors_count: a whole number 1–200 for a center owner, empty is fine', () => {
	const owner = { role: 'center_owner', place_name: 'مركز الشام' };
	assert.equal(form({ ...owner, doctors_count: '' }).doctors_count, null);
	assert.equal(form({ ...owner, doctors_count: '1' }).doctors_count, 1);
	assert.equal(form({ ...owner, doctors_count: ' 200 ' }).doctors_count, 200);
	assert.equal(form({ ...owner, doctors_count: '١٢' }).doctors_count, 12);
	for (const typed of ['0', '201', '2.5', '-3', 'abc', '1e2', '12 أطباء']) {
		assert.deepEqual(bad({ ...owner, doctors_count: typed }), ['doctors_count'], typed);
	}
});

// ---------------------------------------------------------------- scheduling

test('scheduling_method: unanswered or one of the three', () => {
	assert.equal(form({ scheduling_method: '' }).scheduling_method, null);
	for (const key of ['paper', 'competitor', 'none']) {
		assert.equal(form({ scheduling_method: key }).scheduling_method, key);
	}
	assert.deepEqual(bad({ scheduling_method: 'excel' }), ['scheduling_method']);
});

test('competitor_name: optional, at most 60 characters', () => {
	const competitor = { scheduling_method: 'competitor' };
	assert.equal(form({ ...competitor, competitor_name: '' }).competitor_name, null);
	assert.equal(form({ ...competitor, competitor_name: ' برنامج  ما ' }).competitor_name, 'برنامج ما');
	assert.equal(form({ ...competitor, competitor_name: 'a'.repeat(60) }).competitor_name?.length, 60);
	assert.deepEqual(bad({ ...competitor, competitor_name: 'a'.repeat(61) }), ['competitor_name']);
});

// ---------------------------------------------------------------- interests, note

test('interests: a unique subset of the twelve keys', () => {
	assert.deepEqual(INTERESTS.map((i) => i.key), [
		'self_booking', 'waiting_room', 'patient_files', 'reports', 'accounting', 'messaging',
		'team', 'insights', 'visibility', 'offers', 'loyalty', 'dental_chart',
	]);
	assert.deepEqual(form({ interests: [] }).interests, []);
	assert.deepEqual(form({ interests: ['accounting', 'self_booking'] }).interests, ['accounting', 'self_booking']);
	// a center is shown every option, the dental chart included
	const center = { role: 'center_owner', place_name: 'مركز الشام الطبي', specialty: 'متعدد الاختصاصات' };
	assert.deepEqual(form({ ...center, interests: INTERESTS.map((i) => i.key) }).interests.length, 12);
	assert.deepEqual(bad({ interests: ['self_booking', 'pricing'] }), ['interests']);
	// the key the first version of the form used is gone
	assert.deepEqual(bad({ interests: ['appointments'] }), ['interests']);
	assert.deepEqual(bad({ interests: ['reports', 'reports'] }), ['interests']);
	assert.deepEqual(bad({ interests: 'reports' as unknown as string[] }), ['interests']);
});

test('note: optional, at most 500 characters', () => {
	assert.equal(form({ note: '' }).note, null);
	assert.equal(form({ note: '   ' }).note, null);
	assert.equal(form({ note: ' أعمل  مساءً فقط ' }).note, 'أعمل مساءً فقط');
	assert.equal(form({ note: 'a'.repeat(500) }).note?.length, 500);
	assert.deepEqual(bad({ note: 'a'.repeat(501) }), ['note']);
});

test('note: the page turns line breaks into spaces before the rule sees them', () => {
	assert.equal(flattenLines('سطر أول\nسطر ثانٍ\r\n\tسطر ثالث'), 'سطر أول سطر ثانٍ سطر ثالث');
	assert.equal(form({ note: flattenLines('سطر أول\n\nسطر ثانٍ') }).note, 'سطر أول سطر ثانٍ');
	// The rule itself stays the contract's: a raw line break is a control character.
	assert.deepEqual(bad({ note: 'سطر أول\nسطر ثانٍ' }), ['note']);
});

// ---------------------------------------------------------------- other role / branch

test('switching role clears hidden fields from the payload', () => {
	// Review focus 5: an owner who typed a doctors count and then chose
	// «لديّ عيادة خاصة». The count is dropped, never a reason to refuse.
	const asOwner = answers({ role: 'center_owner', place_name: 'مركز الشام', doctors_count: '12' });
	assert.equal(form(asOwner).doctors_count, 12);

	assert.equal(form({ ...asOwner, role: 'clinic' }).doctors_count, null);
	assert.equal(form({ ...asOwner, role: 'center_staff' }).doctors_count, null);

	// Even a count that would be refused for an owner is no longer a question.
	assert.deepEqual(bad({ ...asOwner, role: 'clinic', doctors_count: '999' }), []);
	assert.deepEqual(validateStep(2, answers({ ...asOwner, role: 'clinic', doctors_count: 'abc' })), []);
});

test('answers on a branch not taken are dropped, not refused', () => {
	// A competitor name typed, then «ورق أو دفتر» chosen.
	assert.equal(form({ scheduling_method: 'paper', competitor_name: 'برنامج ما' }).competitor_name, null);
	assert.deepEqual(bad({ scheduling_method: 'paper', competitor_name: 'a'.repeat(61) }), []);
	assert.deepEqual(bad({ scheduling_method: '', competitor_name: CONTROL }), []);

	// A second number typed, then «واتساب على الرقم نفسه» ticked again.
	assert.equal(form({ whatsapp_same: true, whatsapp: 'not a number' }).whatsapp, null);

	// A free-text specialty typed, then a listed one chosen.
	assert.equal(form({ specialty: 'طب العيون', specialty_other: CONTROL }).specialty, 'طب العيون');
});

// ---------------------------------------------------------------- source, cta

test('source: a short lower-case tag, else direct', () => {
	assert.equal(cleanSource('instagram'), 'instagram');
	assert.equal(cleanSource('rep_card'), 'rep_card');
	assert.equal(cleanSource('a'.repeat(24)), 'a'.repeat(24));
	for (const raw of ['', 'Instagram', 'a'.repeat(25), 'qr-1', 'x y', '<s>', null, undefined, 7]) {
		assert.equal(cleanSource(raw), 'direct', String(raw));
	}
});

test('cta: hero, closing or direct', () => {
	assert.equal(cleanCta('hero'), 'hero');
	assert.equal(cleanCta('closing'), 'closing');
	assert.equal(cleanCta('direct'), 'direct');
	for (const raw of ['', 'footer', 'HERO', null, undefined]) assert.equal(cleanCta(raw), 'direct', String(raw));
});

// ---------------------------------------------------------------- steps

test('each step answers for its own fields only', () => {
	const blank = emptyAnswers();
	assert.deepEqual(validateStep(1, blank), ['full_name', 'phone']);
	assert.deepEqual(validateStep(2, blank), ['specialty', 'governorate', 'area']);
	assert.deepEqual(validateStep(3, blank), []);

	const center = { ...blank, role: 'center_owner', whatsapp_same: false, doctors_count: '0' };
	assert.deepEqual(validateStep(1, center), ['full_name', 'phone', 'whatsapp']);
	assert.deepEqual(validateStep(2, center), ['specialty', 'place_name', 'governorate', 'area', 'doctors_count']);

	const last = { ...blank, scheduling_method: 'competitor', competitor_name: 'a'.repeat(61), note: 'a'.repeat(501) };
	assert.deepEqual(validateStep(3, last), ['competitor_name', 'note']);
});

test('a refused field leads back to the step that holds it', () => {
	assert.equal(stepOfField('phone'), 1);
	assert.equal(stepOfField('whatsapp'), 1);
	assert.equal(stepOfField('doctors_count'), 2);
	assert.equal(stepOfField('note'), 3);
	assert.equal(stepOfField('not_a_field'), null);

	assert.equal(firstBadStep(['note', 'area', 'interests']), 2);
	assert.equal(firstBadStep(['note', 'phone']), 1);
	assert.equal(firstBadStep(['interests']), 3);
	assert.equal(firstBadStep([]), null);
	assert.equal(firstBadStep(['not_a_field']), null);
});

test('a complete request carries every contract key and nothing else', () => {
	const sent = form({
		role: 'center_owner',
		whatsapp_same: false,
		whatsapp: '0955000111',
		specialty: SPECIALTY_MULTI,
		place_name: 'مركز الشام الطبي',
		doctors_count: '8',
		scheduling_method: 'competitor',
		competitor_name: 'برنامج ما',
		interests: ['self_booking', 'visibility'],
		note: 'نعمل على فترتين',
	});
	assert.deepEqual(sent, {
		role: 'center_owner',
		full_name: 'سامر الحلبي',
		phone: '+963944123456',
		whatsapp_same: false,
		whatsapp: '+963955000111',
		specialty: SPECIALTY_MULTI,
		place_name: 'مركز الشام الطبي',
		governorate: 'دمشق',
		area: 'المزة',
		doctors_count: 8,
		scheduling_method: 'competitor',
		competitor_name: 'برنامج ما',
		interests: ['self_booking', 'visibility'],
		note: 'نعمل على فترتين',
	});
});

// ---------------------------------------------------------------- draft

test('a draft read back from storage is never trusted', () => {
	assert.deepEqual(reviveAnswers(null), emptyAnswers());
	assert.deepEqual(reviveAnswers('nonsense'), emptyAnswers());
	assert.deepEqual(reviveAnswers([1, 2]), emptyAnswers());

	const revived = reviveAnswers({
		role: 'center_staff',
		full_name: 'سامر',
		phone: 944123456,
		whatsapp_same: 'no',
		interests: ['reports', 5, 'accounting'],
		note: { a: 1 },
		extra: 'ignored',
	});
	assert.equal(revived.role, 'center_staff');
	assert.equal(revived.full_name, 'سامر');
	assert.equal(revived.phone, '');
	assert.equal(revived.whatsapp_same, true);
	assert.deepEqual(revived.interests, ['reports', 'accounting']);
	assert.equal(revived.note, '');
	assert.equal('extra' in revived, false);

	assert.equal(reviveAnswers({ role: 'admin' }).role, 'clinic');
	assert.equal(reviveAnswers({ whatsapp_same: false }).whatsapp_same, false);
});

test('the default answers are a private clinic with WhatsApp on the same number', () => {
	const blank = emptyAnswers();
	assert.equal(blank.role, 'clinic');
	assert.equal(blank.whatsapp_same, true);
	assert.deepEqual(blank.interests, []);
});

// ---------------------------------------------------------------- lists

test('the specialty list keeps the database order and ends with the free-text option', () => {
	assert.equal(SPECIALTIES.length, 51);
	assert.equal(SPECIALTIES[0], 'التوليد وأمراض النساء');
	assert.equal(SPECIALTIES[4], 'طب الأسنان');
	assert.equal(SPECIALTIES[50], 'صيدلة سريرية');
	assert.equal(new Set(SPECIALTIES).size, 51);

	const clinic = specialtiesFor('clinic');
	assert.equal(clinic[0], 'التوليد وأمراض النساء');
	assert.equal(clinic.at(-1), SPECIALTY_OTHER);
	assert.equal(clinic.length, 52);
	assert.equal(clinic.includes(SPECIALTY_MULTI), false);
	assert.deepEqual(specialtiesFor('center_staff'), clinic);

	const owner = specialtiesFor('center_owner');
	assert.equal(owner[0], SPECIALTY_MULTI);
	assert.equal(owner[1], 'التوليد وأمراض النساء');
	assert.equal(owner.at(-1), SPECIALTY_OTHER);
	assert.equal(owner.length, 53);
});

// The founder's wording, 2026-10-11: two words, three at most, nothing cheesy.
test('the interests carry the labels the founder chose', () => {
	assert.deepEqual(Object.fromEntries(INTERESTS.map((i) => [i.key, i.label])), {
		self_booking: 'حجز ذاتي للمريض',
		waiting_room: 'غرفة الانتظار',
		patient_files: 'ملفات شاملة',
		reports: 'التقارير الطبية',
		accounting: 'محاسبة ذكية',
		messaging: 'مراسلة المرضى',
		team: 'إدارة الفريق',
		insights: 'إحصاءات العيادة',
		visibility: 'مرضى جدد',
		offers: 'عروض وخصومات',
		loyalty: 'نقاط الولاء',
		dental_chart: 'مخطط الأسنان',
	});
});

test('every interest has an icon and a short, specific note behind its info button', () => {
	for (const interest of INTERESTS) {
		assert.match(interest.icon, /^[a-z0-9-]+$/, interest.key);
		// long enough to say something real, short enough to read on a phone
		assert.ok(interest.info.length >= 80 && interest.info.length <= 240, interest.key + ': ' + interest.info.length);
		assert.ok(interest.label.split(' ').length <= 3, interest.label);
	}
});

// Founder, 2026-10-11: «we make each feature much weaker than how it is in
// real… be accurate». These pin what he corrected and what the app does not do.
test('the notes say what the app really does', () => {
	const info = Object.fromEntries(INTERESTS.map((i) => [i.key, i.info as string]));
	// accounting: the centre's and the visiting doctor's percentages
	assert.match(info.accounting, /نسبة المركز/);
	assert.match(info.accounting, /الطبيب الزائر/);
	// team: permissions are the secretary's, set by each doctor
	assert.match(info.team, /صلاحيات سكرتيره/);
	// messages live in the clinic's inbox, not inside the patient's file
	assert.doesNotMatch(info.messaging, /محفوظة في ملف المريض/);
	// offers: the app counts codes; it shows no income figure per offer
	assert.doesNotMatch(info.offers, /دخل/);
	// points are for visits booked through the app, not for every visit
	assert.match(info.loyalty, /المحجوزة عبر التطبيق/);
	// the founder's additions, 2026-10-11: both dental models, the profile's
	// numbers and the referral programme, and the patient's central file
	assert.match(info.dental_chart, /ثنائي الأبعاد/);
	assert.match(info.dental_chart, /ثلاثي الأبعاد/);
	assert.doesNotMatch(info.dental_chart, /قريباً/);
	// his second pass: each tooth's history, no colours, no lists of details
	assert.match(info.dental_chart, /لكل سن تاريخه/);
	assert.doesNotMatch(info.dental_chart, /لون/);
	// new patients: exposure and room to grow, with the two tools he added
	assert.match(info.visibility, /من وصل إليك ومن أين/);
	assert.match(info.visibility, /برنامج إحالة/);
	// the central file is named and not explained — and nothing here promises
	// a doctor the records of the patient's other doctors
	assert.match(info.patient_files, /ملفه المركزي/);
	assert.doesNotMatch(info.patient_files, /أطبائه الآخرين/);
});

// Founder, 2026-10-11: «dont list them exactly… tell always (and more…)».
test('every note is open-ended: examples and «and more», never a closed list or a count', () => {
	for (const interest of INTERESTS) {
		assert.match(interest.info, /وغيرها|وغيرهما|وغير ذلك|وأكثر|والكثير غيرها/, interest.key);
		assert.doesNotMatch(interest.info, /[0-9٠-٩]|عشرون|خمسة أنواع|سبع مناسبات/, interest.key);
	}
});

test('the dental chart is offered to dentists and to centers only', () => {
	assert.equal(showsDentalChart('clinic', 'طب الأسنان', ''), true);
	assert.equal(showsDentalChart('clinic', 'تقويم الأسنان', ''), true);
	assert.equal(showsDentalChart('clinic', 'جراحة الفم والوجه والفكين', ''), true);
	assert.equal(showsDentalChart('clinic', 'اختصاص آخر', 'زراعة أسنان'), true);
	assert.equal(showsDentalChart('clinic', 'أمراض القلب', ''), false);
	assert.equal(showsDentalChart('clinic', 'اختصاص آخر', 'طب الأعشاب'), false);
	assert.equal(showsDentalChart('clinic', '', ''), false);
	assert.equal(showsDentalChart('center_owner', 'أمراض القلب', ''), true);
	assert.equal(showsDentalChart('center_staff', 'أمراض القلب', ''), true);
});

test('an option that is not offered is dropped, not refused', () => {
	// a cardiologist who somehow carries the dental chart (he switched specialty)
	assert.deepEqual(form({ specialty: 'أمراض القلب', interests: ['dental_chart', 'reports'] }).interests, ['reports']);
	assert.deepEqual(form({ specialty: 'طب الأسنان', interests: ['dental_chart', 'reports'] }).interests, ['dental_chart', 'reports']);
});

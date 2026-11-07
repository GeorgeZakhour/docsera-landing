// Closed lists and copy for the careers page (/careers).
//
// The keys below are one side of a contract: the edge function
// `job_application` and the SQL checks on `job_applications` (both in
// DocSera-Pro) refuse anything else. Change a key here only together with
// them — see CLAUDE.md → "Careers page". Labels are the Arabic shown.
//
// Design and rulings: DocSera-Pro
// docs/superpowers/specs/2026-11-07-hiring-applications-design.md (§2c, §2d, §5).
// Round 2 (founder, 2026-11-07 evening — §2d): residence, military status,
// the achievement, transport and LinkedIn are GONE; one «شهادة جامعية»
// instead of bachelor / master; nursing and health sciences out, biomedical
// engineering in, and the medical field is an advantage, not a condition;
// the medical-sector question is optional; a fourth area «أخرى» with a text.

/** The title everywhere — page, form, Admin, email, post (ruling 2). */
export const TITLE = 'مندوب/ة مبيعات';
export const SUBTITLE = 'القطاع الطبي · دمشق';

/**
 * The three areas the founder is hiring for, and «أخرى» — any other place the
 * applicant names in `areas_other` (round 2). Only the three carry a letter.
 */
export const AREAS = [
	{ key: 'mazzeh', letter: 'A', label: 'مزة' },
	{ key: 'rawda_malki_abu_rummaneh', letter: 'B', label: 'روضة · مالكي · أبو رمانة' },
	{ key: 'city_center', letter: 'C', label: 'مركز المدينة' },
	{ key: 'other', letter: '', label: 'أخرى' },
] as const;

/** The placeholder of the text behind «أخرى» (founder: «… جرمانا»). */
export const AREAS_OTHER_PLACEHOLDER = 'مثلاً: جرمانا';

/** One «شهادة جامعية», never bachelor / master (founder, round 2). */
export const DEGREE_LEVELS = [
	{ key: 'high_school', label: 'ثانوية' },
	{ key: 'institute', label: 'معهد' },
	{ key: 'student', label: 'طالب/ة جامعي/ة' },
	{ key: 'university', label: 'شهادة جامعية' },
] as const;

/** The first four are the medical ones (Admin shows them in teal). */
export const DEGREE_FIELDS = [
	{ key: 'dentistry', label: 'طب أسنان', medical: true },
	{ key: 'pharmacy', label: 'صيدلة', medical: true },
	{ key: 'medicine', label: 'طب بشري', medical: true },
	{ key: 'biomedical_engineering', label: 'هندسة طبية', medical: true },
	{ key: 'business_marketing', label: 'إدارة أعمال / تسويق', medical: false },
	{ key: 'economics', label: 'اقتصاد', medical: false },
	{ key: 'other', label: 'أخرى', medical: false },
] as const;

/** Under «مجال الدراسة» and in «المطلوب»: an advantage, not a condition (founder, round 2). */
export const DEGREE_FIELD_HINT = 'الاختصاص الطبي أو الصحي أفضلية، لا شرطاً.';

/** Asked, not enforced: «لا خبرة» is accepted (spec §2a). */
export const EXPERIENCE = [
	{ key: 'none', label: 'لا خبرة' },
	{ key: 'under_1', label: 'أقل من سنة' },
	{ key: '1_2', label: '1 – 2' },
	{ key: '3_5', label: '3 – 5' },
	{ key: 'over_5', label: 'أكثر من 5' },
] as const;

export const START = [
	{ key: 'immediately', label: 'فوراً' },
	{ key: 'two_weeks', label: 'خلال أسبوعين' },
	{ key: 'one_month', label: 'خلال شهر' },
	{ key: 'later', label: 'لاحقاً' },
] as const;

/**
 * Each file ≤ 16 MB and all files together ≤ 16 MB — the size already proven
 * on this stack. The server checks the same numbers and the type from the
 * bytes; `accept` is what the file picker offers.
 */
export const FILE_LIMITS = {
	maxFile: 16 * 1024 * 1024,
	maxTotal: 16 * 1024 * 1024,
	maxExtras: 2,
	accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png,.heic',
} as const;

/** Extensions the picker offers, lower-case, and the chip each one shows. */
export const FILE_TYPES: Record<string, string> = {
	pdf: 'PDF',
	doc: 'DOC',
	docx: 'DOCX',
	jpg: 'JPG',
	jpeg: 'JPG',
	png: 'PNG',
	heic: 'HEIC',
};

// ---------------------------------------------------------------- copy

export const STEP_NAMES: Record<1 | 2 | 3, string> = {
	1: 'من أنت',
	2: 'خبرتك',
	3: 'السيرة والتفاصيل',
};

export function stepLabel(step: 1 | 2 | 3): string {
	return `الخطوة ${step} من 3 · ${STEP_NAMES[step]}`;
}

/**
 * One message per field: the server names the field it refused, not the
 * reason. Numbers are written without spaces so they read left to right
 * inside an Arabic sentence.
 */
export const FIELD_ERRORS: Record<string, string> = {
	full_name: 'اكتب اسمك الكامل',
	phone: 'اكتب رقم موبايل صحيحاً، مثل 0944123456',
	whatsapp: 'اكتب رقم واتساب صحيحاً. إن كان من خارج سوريا فابدأه برمز الدولة، مثل ‎+49',
	email: 'تحقّق من البريد الإلكتروني، أو اترك الحقل فارغاً',
	degree_level: 'اختر المؤهل العلمي',
	degree_field: 'اختر مجال الدراسة',
	degree_field_other: 'اكتب مجال دراستك',
	university: 'تحقّق من اسم الجامعة، وأبقِه ضمن 80 حرفاً',
	sales_experience: 'اختر سنوات خبرتك',
	medical_sector: 'اختر نعم أو لا، أو اترك السؤال بلا إجابة',
	medical_sector_detail: 'أبقِ الإجابة ضمن 200 حرف',
	last_employer: 'أبقِ الإجابة ضمن 120 حرفاً',
	areas: 'اختر منطقة واحدة على الأقل',
	areas_other: 'اكتب المنطقة التي تناسبك، مثل جرمانا — ضمن 80 حرفاً',
	start_availability: 'اختر متى تستطيع البدء',
	cv: 'أرفق سيرتك الذاتية — PDF أو Word أو صورة',
	extra: 'تحقّق من الملفات الإضافية — حتى ملفّين، PDF أو Word أو صورة',
	files_total: 'مجموع الملفات يتجاوز 16 ميغابايت — صغّر ملفاً أو أزل واحداً',
	message: 'تحقّق من الرسالة، وأبقِها ضمن 500 حرف',
};

/** Why a file was refused the moment it was chosen. */
export const FILE_REASONS = {
	type: 'نوع الملف غير مدعوم — اختر PDF أو Word أو صورة (JPG، PNG، HEIC)',
	size: 'الملف أكبر من المسموح — الحد 16 ميغابايت',
	empty: 'الملف فارغ',
	count: 'يمكنك إرفاق حتى ملفّين إضافيين',
	total: FIELD_ERRORS.files_total,
} as const;

export const CV_HELP = 'ملف PDF بحجم 2–3 ميغابايت يكفي — الحد 16';
export const EXTRAS_HELP = 'الشهادة الجامعية، شهادة خبرة، أو أي ملف يدعم طلبك.';

export const SEND_LABEL = 'إرسال الطلب';
export const NEXT_LABEL = 'التالي';
export const BACK_LABEL = 'السابق';

/** The button while the request is on its way; `percent` 0–100. */
export function sendingLabel(percent: number): string {
	const p = Math.max(0, Math.min(100, Math.round(percent)));
	return `جارٍ إرسال طلبك… ${p}٪`;
}

/** Shown in the failure box; the draft and the files are still there when any appears. */
export const FAILURE_COPY = {
	failed: {
		title: 'تعذّر الإرسال الآن',
		body: 'ما كتبته محفوظ وملفاتك ما زالت مختارة. تحقّق من اتصالك ثم أعد المحاولة.',
	},
	retry: {
		title: 'لم يكتمل الإرسال',
		body: 'ما كتبته محفوظ وملفاتك ما زالت مختارة. أعد المحاولة.',
	},
	invalid: {
		title: 'لم نتمكّن من قبول الطلب',
		body: 'راجع ما كتبته والملفات المرفقة ثم أعد المحاولة.',
	},
	too_large: {
		title: 'الملفات أكبر من المسموح',
		body: 'مجموع الملفات يتجاوز 16 ميغابايت. صغّر ملفاً أو أزل واحداً ثم أعد المحاولة.',
	},
} as const;

export const THANKS_COPY = {
	title: 'وصلنا طلبك',
	body: 'احتفظ بالرقم المرجعي. نراجع كل طلب ونتواصل مع من تنطبق عليه الشروط.',
	codeLabel: 'الرقم المرجعي',
} as const;

export const CLOSED_COPY = {
	title: 'أُغلق باب التقديم حالياً',
	body: 'تابعنا لنشر الشواغر القادمة.',
} as const;

/**
 * The server said «busy» to opening the form — this network's hourly cap, not
 * the founder's switch. A panel with a retry, never the closed panel.
 */
export const BUSY_COPY = {
	title: 'الخدمة مشغولة الآن',
	body: 'أعد المحاولة بعد قليل.',
	retry: 'أعد المحاولة',
} as const;

/** Under the send button: one plain sentence, no link, no legal page (ruling 8). */
export const PRIVACY_LINE = 'بياناتك وسيرتك الذاتية تُستخدم لغرض التوظيف فقط ولا تُشارك مع أي جهة أخرى.';

/** The second option, drawn only when the number is set (ruling 9). */
export const WHATSAPP_LINE = 'أو أرسل سيرتك الذاتية على واتساب';

/** Prefilled WhatsApp message from under the form. */
export const WHATSAPP_TEXT = `مرحباً، أودّ التقديم على وظيفة ${TITLE} في DocSera، وأرسل سيرتي الذاتية هنا.`;

/** Prefilled WhatsApp message from the thank-you screen. */
export function whatsappTextWithCode(code: string): string {
	return code
		? `مرحباً، أرسلتُ طلب توظيف (${TITLE}) عبر الموقع. رقمي المرجعي: ${code}`
		: `مرحباً، أرسلتُ طلب توظيف (${TITLE}) عبر الموقع.`;
}

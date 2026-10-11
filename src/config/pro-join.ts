// Closed lists and copy for the DocSera Pro request form (/pro/join).
//
// The role, governorate, scheduling and interest values below are one side of
// a contract: the edge function `pro_join_request` and the SQL checks behind
// it (both in DocSera-Pro) refuse anything else. Change a key or a spelling
// here only together with them — see CLAUDE.md → "Pro request form".

export const ROLES = [
	{ key: 'clinic', label: 'لديّ عيادة خاصة' },
	{ key: 'center_owner', label: 'أملك أو أدير مركزاً طبياً' },
	{ key: 'center_staff', label: 'أعمل طبيباً في مركز طبي' },
] as const;

export const GOVERNORATES = [
	'دمشق',
	'ريف دمشق',
	'حلب',
	'حمص',
	'حماة',
	'اللاذقية',
	'طرطوس',
	'إدلب',
	'دير الزور',
	'الرقة',
	'الحسكة',
	'درعا',
	'السويداء',
	'القنيطرة',
] as const;

// Snapshot of public.specialties (Arabic names), in database order. The
// request stores the label text, never an id, so the server accepts any
// label: adding one here needs no change there.
export const SPECIALTIES = [
	'التوليد وأمراض النساء',
	'الجراحة العامة',
	'الطب النفسي',
	'العلاج الطبيعي',
	'طب الأسنان',
	'طب العيون',
	'طب عام',
	'أمراض الأذن والأنف والحنجرة',
	'التغذية',
	'الطب الباطني',
	'الطب التناسلي',
	'تقويم الأسنان',
	'جراحة العظام',
	'علم النفس',
	'جراحة الفم والوجه والفكين',
	'جراحة المسالك البولية',
	'طب الأسرة',
	'طب الطوارئ',
	'الأشعة',
	'الجراحة التجميلية',
	'طب الأطفال',
	'أمراض القلب',
	'جراحة الأعصاب',
	'علم الأمراض',
	'الأمراض العصبية',
	'التخدير',
	'جراحة القلب',
	'الأمراض الجلدية',
	'الطب الرياضي',
	'جراحة الصدر',
	'الرعاية التلطيفية',
	'الغدد الصماء',
	'جراحة الأوعية',
	'أمراض الجهاز الهضمي',
	'جراحة الأطفال',
	'أمراض الرئة',
	'أمراض الكلى',
	'أمراض الروماتيزم',
	'أمراض الدم',
	'الأمراض المعدية',
	'الأورام',
	'الحساسية والمناعة',
	'طب الشيخوخة',
	'تجميل',
	'بصريات',
	'مخبري',
	'فني أشعة',
	'علاج النطق',
	'علاج وظيفي',
	'تدليك',
	'صيدلة سريرية',
] as const;

/** Offered first, and only to someone who owns or runs a center. */
export const SPECIALTY_MULTI = 'متعدد الاختصاصات';
/** Always last; choosing it reveals a free-text field. */
export const SPECIALTY_OTHER = 'اختصاص آخر';

/** The specialty choices a role sees, in the order it sees them. */
export function specialtiesFor(role: string): string[] {
	return [
		...(role === 'center_owner' ? [SPECIALTY_MULTI] : []),
		...SPECIALTIES,
		SPECIALTY_OTHER,
	];
}

export const SCHEDULING_METHODS = [
	{ key: 'paper', label: 'ورق أو دفتر' },
	{ key: 'competitor', label: 'برنامج آخر' },
	{ key: 'none', label: 'لا شيء' },
] as const;

export const INTERESTS = [
	{ key: 'appointments', label: 'المواعيد' },
	{ key: 'patient_files', label: 'ملفات المرضى' },
	{ key: 'accounting', label: 'المحاسبة' },
	{ key: 'reports', label: 'التقارير' },
	{ key: 'dental_chart', label: 'مخطط الأسنان' },
	{ key: 'visibility', label: 'الظهور للمرضى' },
] as const;

// ---------------------------------------------------------------- copy

export const STEP_NAMES: Record<1 | 2 | 3, string> = {
	1: 'من أنت',
	2: 'مكان عملك',
	3: 'ما تحتاجه',
};

export function stepLabel(step: 1 | 2 | 3): string {
	return `الخطوة ${step} من 3 · ${STEP_NAMES[step]}`;
}

/** Step 2 reads differently for each role. */
export const ROLE_COPY: Record<
	(typeof ROLES)[number]['key'],
	{
		specialtyLabel: string;
		specialtyPlaceholder: string;
		placeLabel: string;
		placePlaceholder: string;
		placeRequired: boolean;
		placeError: string;
	}
> = {
	clinic: {
		specialtyLabel: 'اختصاصك',
		specialtyPlaceholder: 'اختر اختصاصك',
		placeLabel: 'اسم العيادة',
		placePlaceholder: 'عيادة…',
		placeRequired: false,
		placeError: 'اسم العيادة قصير جداً',
	},
	center_owner: {
		specialtyLabel: 'اختصاص المركز',
		specialtyPlaceholder: 'اختر، أو «متعدد الاختصاصات»',
		placeLabel: 'اسم المركز',
		placePlaceholder: 'مركز…',
		placeRequired: true,
		placeError: 'اكتب اسم المركز',
	},
	center_staff: {
		specialtyLabel: 'اختصاصك',
		specialtyPlaceholder: 'اختر اختصاصك',
		placeLabel: 'اسم المركز الذي تعمل فيه',
		placePlaceholder: 'مركز…',
		placeRequired: true,
		placeError: 'اكتب اسم المركز',
	},
};

/**
 * One message per field: the server names the field it refused, not the
 * reason. Numbers are written without spaces so they read left to right
 * inside an Arabic sentence.
 */
export const FIELD_ERRORS: Record<string, string> = {
	role: 'اختر أين تعمل',
	full_name: 'اكتب اسمك الكامل',
	phone: 'اكتب رقم موبايل صحيحاً، مثل 0944123456',
	whatsapp_same: 'اكتب رقم واتساب صحيحاً، مثل 0944123456',
	whatsapp: 'اكتب رقم واتساب صحيحاً، مثل 0944123456',
	specialty: 'اختر الاختصاص',
	specialty_other: 'اكتب الاختصاص',
	governorate: 'اختر المحافظة',
	area: 'اكتب المنطقة أو الحي',
	doctors_count: 'اكتب عدداً بين 1 و200',
	scheduling_method: 'اختر أحد الخيارات المعروضة',
	competitor_name: 'تحقّق من اسم البرنامج',
	interests: 'اختر من الخيارات المعروضة',
	note: 'تحقّق من الملاحظة، وأبقِها ضمن 500 حرف',
};

export const SEND_LABEL = 'إرسال الطلب';
export const NEXT_LABEL = 'التالي';
export const SENDING_LABEL = 'جارٍ الإرسال…';

/** Shown in the failure box; the draft is still there when either appears. */
export const FAILURE_COPY = {
	failed: {
		title: 'تعذّر الإرسال الآن',
		body: 'ما كتبته محفوظ. تحقّق من اتصالك ثم أعد المحاولة، أو راسلنا على واتساب.',
	},
	retry: {
		title: 'لم يكتمل الإرسال',
		body: 'ما كتبته محفوظ. أعد المحاولة، أو راسلنا على واتساب.',
	},
	invalid: {
		title: 'لم نتمكّن من قبول الطلب',
		body: 'راجع ما كتبته ثم أعد المحاولة، أو راسلنا على واتساب.',
	},
} as const;

/** Prefilled WhatsApp message from the form and from the closed panel. */
export const WHATSAPP_TEXT = 'مرحباً، أودّ تجربة DocSera Pro لعيادتي.';

/** Prefilled WhatsApp message from the thank-you screen. */
export function whatsappTextWithCode(code: string): string {
	return code
		? `مرحباً، أرسلتُ طلب تجربة DocSera Pro. رمز طلبي: ${code}`
		: 'مرحباً، أرسلتُ طلب تجربة DocSera Pro.';
}

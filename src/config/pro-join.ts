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

// What the platform does, as the last thing a doctor sees before sending.
// The founder's wording (2026-10-11): two words, three at most, nothing that
// reads like an advertisement; the sentence behind the info button says what
// the Pro page itself says, no more. The keys are part of the field rules —
// they have twins in the edge function and in the table's CHECK.
// `icon` is a Lucide name, except `tooth`, which the page draws itself.
export const INTERESTS = [
	{ key: 'self_booking', label: 'حجز ذاتي للمريض', icon: 'calendar-check',
		info: 'المريض يحجز من هاتفه في الأوقات التي تحددها، فتقلّ المكالمات.' },
	{ key: 'waiting_room', label: 'غرفة الانتظار', icon: 'armchair',
		info: 'من وصل، من ينتظر، ومن دخل المعاينة. تتابعها مباشرة.' },
	{ key: 'patient_files', label: 'ملفات شاملة', icon: 'folder-heart',
		info: 'تاريخ المريض وزياراته وتحاليله وصوره ووصفاته في ملف واحد.' },
	{ key: 'reports', label: 'التقارير الطبية', icon: 'file-text',
		info: 'قوالب جاهزة للشكوى والتشخيص والإجراءات، مع تصدير PDF ومشاركته مع المريض.' },
	{ key: 'accounting', label: 'محاسبة ذكية', icon: 'calculator',
		info: 'فواتير ودفعات جزئية وخصومات بالليرة والدولار، مع إيراداتك ومصاريفك وصافي ربحك في لوحة واحدة.' },
	{ key: 'messaging', label: 'مراسلة المرضى', icon: 'messages-square',
		info: 'نصوص وصور وملاحظات صوتية، محفوظة في ملف المريض لا في هاتفك الشخصي.' },
	{ key: 'team', label: 'إدارة الفريق', icon: 'users-round',
		info: 'تضيف السكرتير والزملاء بدعوة، وتحدد لكل واحد ما يراه وما يفعله.' },
	{ key: 'insights', label: 'إحصاءات العيادة', icon: 'chart-column',
		info: 'عدد المواعيد والمرضى والدخل، وأوقات الازدحام ونسبة المتغيّبين.' },
	{ key: 'visibility', label: 'مرضى جدد', icon: 'user-plus',
		info: 'صفحتك تظهر في تطبيق دوكسيرا لمن يبحث عن طبيب، مع رابط ورمز خاص بك.' },
	{ key: 'offers', label: 'عروض وخصومات', icon: 'badge-percent',
		info: 'استشارة أولى مجانية أو خصم يُحسب تلقائياً عند الفاتورة، وترى أثره على دخلك.' },
	{ key: 'loyalty', label: 'نقاط الولاء', icon: 'gift',
		info: 'نقاط للمريض مع كل زيارة، وتذكير بمناسباته وبمن غاب عنك منذ مدة.' },
	// Offered to dentists and to centers only — see showsDentalChart.
	{ key: 'dental_chart', label: 'مخطط الأسنان', icon: 'tooth',
		info: 'مخطط ثنائي الأبعاد لكامل الفكّين يسجّل حالة كل سن وإجراءه، ونموذج ثلاثي الأبعاد يوضّح الحالة وخطة العلاج للمريض.' },
] as const;

/** A clinic of one of these is offered the dental chart. */
export const DENTAL_SPECIALTIES: readonly string[] = ['طب الأسنان', 'تقويم الأسنان', 'جراحة الفم والوجه والفكين'];

export const INTERESTS_ALL_LABEL = 'اختيار الكل';
export const INTERESTS_NONE_LABEL = 'إلغاء الكل';

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
	whatsapp_same: 'اكتب رقم واتساب صحيحاً. إن كان من خارج سوريا فابدأه برمز الدولة، مثل \u200E+49',
	whatsapp: 'اكتب رقم واتساب صحيحاً. إن كان من خارج سوريا فابدأه برمز الدولة، مثل \u200E+49',
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

// A fictional centre for local previews of /center/?preview=1. Never reached by a
// production build (the flag lives only in the untracked .env.local).
const HOURS = {
	sat: [{ from: '09:00', to: '20:00' }], sun: [{ from: '09:00', to: '20:00' }], mon: [{ from: '09:00', to: '20:00' }],
	tue: [{ from: '09:00', to: '20:00' }], wed: [{ from: '09:00', to: '20:00' }], thu: [{ from: '09:00', to: '16:00' }],
};

export const CENTER_PREVIEW = {
	id: 'preview',
	name: 'مركز النخيل الطبي',
	type: 'medical_center',
	description: { version: 3, parts: [{ delta: [{ insert: 'مركز طبي يجمع عدة اختصاصات تحت سقف واحد، لتجد طبيبك ومتابعتك وفحوصك في مكان واحد. يعمل فريقنا معاً حول كل مريض، بمواعيد واضحة وملف منظّم يرافقك من أول زيارة.\n' }] }] },
	address: { street: 'شارع بغداد', neighborhood: 'القصاع', city: 'دمشق', details: 'الطابق الثاني' },
	location: { lat: 33.5186, lng: 36.3126 },
	opening_hours: HOURS,
	specialties: ['طب الأسنان', 'طب الأطفال', 'الجلدية', 'الأمراض الداخلية', 'التغذية'],
	offered_services: [{ title: 'فحص شامل' }, { title: 'تنظيف الأسنان' }, { title: 'لقاحات الأطفال' }, { title: 'علاج حب الشباب' }, { title: 'خطة غذائية' }, { title: 'متابعة الأمراض المزمنة' }, { title: 'تبييض الأسنان' }],
	languages: ['ar', 'en'],
	insurance_accepted: ['التأمين الصحي الخاص'],
	facilities: ['موقف سيارات', 'مصعد', 'غرفة انتظار للأطفال'],
};

export const CENTER_PREVIEW_TEAM = [
	{ title: 'د.', first_name: 'ريم', last_name: 'منصور', specialty: 'الجلدية', gender: 'أنثى', is_bookable_subscription: true },
	{ title: 'د.', first_name: 'ماهر', last_name: 'نصار', specialty: 'طب الأسنان', gender: 'ذكر', is_bookable_subscription: true },
	{ title: 'د.', first_name: 'ليان', last_name: 'حداد', specialty: 'طب الأطفال', gender: 'أنثى', placeholder_style: 'hijab', is_bookable_subscription: true },
	{ title: 'أ.', first_name: 'نور', last_name: 'العلي', specialty: 'التغذية', gender: 'أنثى', is_bookable_subscription: false },
];

// The shape of a one-doctor practice: a name, a specialty, an address, one doctor.
export const CENTER_PREVIEW_SOLO = {
	id: 'preview',
	name: 'عيادة د. ماهر نصار',
	type: 'solo',
	address: { street: 'شارع بغداد', neighborhood: 'القصاع', city: 'دمشق' },
	location: { lat: 33.5186, lng: 36.3126 },
	specialties: ['طب الأسنان'],
};

export const CENTER_PREVIEW_SOLO_TEAM = [
	{ title: 'د.', first_name: 'ماهر', last_name: 'نصار', specialty: 'طب الأسنان', gender: 'ذكر', is_bookable_subscription: true, center_kind: 'member', opening_hours: HOURS },
];

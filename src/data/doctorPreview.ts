// A fictional doctor for local previews of /doctor/?preview=1. Never reached by a
// production build (the flag lives only in the untracked .env.local).
export const DOCTOR_PREVIEW = {
	title: 'د.',
	first_name: 'ريم',
	last_name: 'منصور',
	specialty: 'الغدد الصماء',
	verification_status: 'verified',
	gender: 'أنثى',
	doctor_image: '',
	is_bookable_subscription: true,
	require_confirmation: false,
	messages_enabled: true,
	is_messageable_subscription: true,
	location: { lat: 33.5, lng: 36.26 },
	clinic: 'مركز الشفاء الطبي',
	address: { street: 'أوتوستراد المزة', city: 'دمشق' },
	profile_description: { version: 3, parts: [{ delta: [{ insert: 'اختصاصية في الغدد الصماء والسكري. أتابع مرضى السكري واضطرابات الغدة الدرقية منذ أكثر من عشر سنوات، بخطة علاج واضحة يشارك فيها المريض، ومتابعة منتظمة تناسب حياته اليومية. أؤمن بأن فهم المريض لحالته جزء أساسي من علاجه، لذلك أخصص وقتاً كافياً لشرح كل خطوة والإجابة عن أسئلته.\n' }] }] },
	opening_hours: {
		sat: [{ from: '10:00', to: '14:00' }], sun: [{ from: '10:00', to: '14:00' }, { from: '17:00', to: '21:00' }],
		mon: [{ from: '10:00', to: '14:00' }, { from: '17:00', to: '21:00' }], tue: [{ from: '10:00', to: '14:00' }],
		wed: [{ from: '10:00', to: '14:00' }, { from: '17:00', to: '21:00' }], thu: [{ from: '10:00', to: '14:00' }],
	},
	offered_services: ['علاج ومتابعة السكري', 'اضطرابات الغدة الدرقية', 'هشاشة العظام', 'مشاكل النمو والبلوغ', 'السمنة الهرمونية', 'اضطرابات الغدة الكظرية', 'تكيس المبايض'],
	languages: ['ar', 'en'],
};

// The real app pages the website's phone can show, rendered full length with fake data.
// h: page height at 640 wide. foot: height of the fixed bottom strip (tab bar or floating
// button) at 640 wide, 0 when there is none. long: the page is longer than one screen.
export interface AppPage {
	label: string;
	id: string;
	h: number;
	foot: number;
	long: boolean;
}

export const APP_PAGES: AppPage[] = [
	{ label: 'الرئيسية', id: 'home', h: 3465, foot: 176, long: true },
	{ label: 'البحث', id: 'search', h: 3513, foot: 0, long: true },
	{ label: 'الطبيب', id: 'doctor', h: 3209, foot: 176, long: true },
	{ label: 'الحجز', id: 'booking', h: 1387, foot: 0, long: false },
	{ label: 'مواعيدي', id: 'appointments', h: 1387, foot: 268, long: false },
	{ label: 'ملفي', id: 'health', h: 2259, foot: 176, long: true },
	{ label: 'التقارير', id: 'reports', h: 1820, foot: 0, long: true },
	{ label: 'الأدوية', id: 'medications', h: 2478, foot: 186, long: true },
	{ label: 'القياسات', id: 'vitals', h: 1613, foot: 0, long: true },
	{ label: 'روتيني', id: 'routine', h: 3764, foot: 217, long: true },
	{ label: 'الرسائل', id: 'chat', h: 1919, foot: 156, long: true },
	{ label: 'العائلة', id: 'family', h: 1387, foot: 149, long: false },
];

export const pageIndex = (id: string): number => APP_PAGES.findIndex((p) => p.id === id);

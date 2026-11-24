// The help centre: 200+ articles written from the code of DocSera 1.1.0 (landing-3d/help/build.py
// builds guide.json). Topics group the categories the way a patient thinks about the app.
import raw from './guide.json';

export interface HelpImg { src: string; w: number; h: number; }
export interface HelpStep { text: string; img?: HelpImg; }
export interface HelpNote { kind: 'tip' | 'warn' | 'info'; text: string; }
export interface HelpArticle { id: string; category: string; title: string; summary: string; intro: string; keywords: string[]; steps: HelpStep[]; notes: HelpNote[]; faq: { q: string; a: string }[]; related: string[]; }
export interface HelpCategory { id: string; title: string; lead: string; icon: string; }
export interface HelpWorld { id: string; title: string; lead: string; icon: string; cats: string[]; peek?: string; }

export const ARTICLES = raw.articles as HelpArticle[];
export const CATEGORIES = raw.categories as HelpCategory[];

export const WORLDS: HelpWorld[] = [
	{ id: 'appointments', title: 'المواعيد', lead: 'الحجز والتذكير والتعديل والإلغاء، وكل ما قد يعترضك.', icon: 'calendar', cats: ['book-steps', 'book-problems', 'visit-after', 'visit-change'], peek: 'appointments-upcoming-ap1' },
	{ id: 'health', title: 'ملفي الصحي', lead: 'سجلاتك وتقاريرك ووثائقك في مكان واحد.', icon: 'heart', cats: ['health-file', 'reports-visits', 'documents-files'], peek: 'health-tab' },
	{ id: 'routine', title: 'روتيني', lead: 'تذكير الأدوية والجرعات والقراءات والفحوص.', icon: 'pill', cats: ['routine-reminders'], peek: '10-routine' },
	{ id: 'start', title: 'البداية', lead: 'ثبّت التطبيق، أنشئ حسابك، وتعرّف على أقسامه.', icon: 'rocket', cats: ['start-basics', 'start-signup', 'start-web'] },
	{ id: 'find', title: 'البحث عن طبيب', lead: 'بالاسم أو التخصص أو المدينة أو على الخريطة.', icon: 'search', cats: ['find-search', 'find-profiles'] },
	{ id: 'messages', title: 'الرسائل والإشعارات', lead: 'مراسلة طبيبك وضبط ما يصلك من تنبيهات.', icon: 'message', cats: ['messages-start', 'messages-chat', 'notify-center', 'notify-help'] },
	{ id: 'family', title: 'العائلة', lead: 'ملفات أقاربك ومواعيدهم من حسابك.', icon: 'users', cats: ['family-relatives'] },
	{ id: 'privacy', title: 'الخصوصية والأمان', lead: 'من يرى ملفك، وكيف تحمي حسابك.', icon: 'shield', cats: ['access-consent', 'privacy-data', 'privacy-safety'] },
	{ id: 'account', title: 'حسابي', lead: 'الدخول وملفك الشخصي والإعدادات وحذف الحساب.', icon: 'user', cats: ['account-signin', 'account-profile', 'account-security', 'account-settings', 'account-legal', 'account-delete'] },
	{ id: 'rewards', title: 'النقاط والدعوات', lead: 'نقاطك وقسائمك ودعوة الأصدقاء.', icon: 'gift', cats: ['rewards-points', 'rewards-invite'] },
	{ id: 'fix', title: 'حل المشكلات', lead: 'خطوات واضحة عندما لا يعمل شيء كما تتوقع.', icon: 'wrench', cats: ['fix-connection', 'fix-signin', 'fix-files', 'fix-device', 'fix-support'] },
];

export const POPULAR = ['how-to-book', 'cancel-appointment', 'fix-code-not-arriving', 'forgot-password', 'family-add-relative', 'access-consent-code'];
export const FIRST_TIME = ['create-account', 'search-doctor', 'how-to-book', 'health-complete-profile', 'routine-what-is'];
export const QUICK_FIXES = ['fix-cannot-sign-in', 'fix-code-not-arriving', 'no-slots', 'too-late-to-cancel', 'notify-android', 'fix-upload-file'];

const byId = new Map(ARTICLES.map((a) => [a.id, a]));
export const articleById = (id: string) => byId.get(id);
export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);
export const worldOfCategory = (id: string) => WORLDS.find((w) => w.cats.includes(id));
export const articlesIn = (category: string) => ARTICLES.filter((a) => a.category === category);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Escapes the text and draws every «label» as the button it names in the app. */
export const rich = (s: string) => esc(s).replace(/«([^»]{1,60})»/g, '<b class="hp-ui">$1</b>');

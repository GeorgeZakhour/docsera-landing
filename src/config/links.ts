// Single source of truth for every app / store link on the site.
// The patient app went live on both stores on 2026-10-06.

export const APP_STORE_ID = '6811104221';

// Country-neutral on purpose: the App Store resolves it to the visitor's
// own storefront. Never hard-code /us/ or /ae/ — Syria has no storefront
// of its own, so visitors arrive with accounts from many regions.
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

export const PLAY_PACKAGE = 'com.docsera.app';
export const PLAY_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;

// In-Syria APK (nginx 302 → Supabase storage). Same signing key as the Play
// build, so an APK install later updates from Play in place.
export const APK_URL = '/downloads/docsera.apk';

export const WEB_APP_URL = 'https://my.docsera.app';
export const INSTAGRAM_URL = 'https://www.instagram.com/docsera.app/';

const SOURCE_RE = /^[a-z_]{1,24}$/;

/**
 * Google Play link carrying an install referrer.
 *
 * The referrer survives the store install: Play hands the string back to the
 * app through the Install Referrer API, and Play Console groups acquisitions
 * by the utm_* keys. Contract (the patient app parses exactly this):
 *   utm_source   = docsera.app
 *   utm_medium   = where the visitor came from (qr, share, ref, instagram, site…)
 *   utm_campaign = site | doctor | center
 *   utm_content  = the doctor public_token / center id, when there is one
 */
export function playUrl(
	medium: string = 'site',
	campaign: 'site' | 'doctor' | 'center' = 'site',
	content: string = '',
): string {
	const m = SOURCE_RE.test(medium) ? medium : 'site';
	let ref = `utm_source=docsera.app&utm_medium=${m}&utm_campaign=${campaign}`;
	if (content && /^[A-Za-z0-9_-]{1,64}$/.test(content)) {
		ref += `&utm_content=${content}`;
	}
	return `${PLAY_URL}&referrer=${encodeURIComponent(ref)}`;
}

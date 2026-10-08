// Anonymous landing analytics, shared by every page that reports anything.
//
// Counts page opens and store-button taps even when the visitor never
// installs the app. Fire-and-forget: a failure here must never affect the
// page. anonymous_id is a device-scoped random UUID — no fingerprinting,
// no PII.

// Same anon Supabase credentials the patient app uses (lib/app/const.dart).
// Safe to embed client-side — RLS limits what anon reads.
export const SUPABASE_URL: string =
	import.meta.env.PUBLIC_SUPABASE_URL || 'https://api.docsera.app';
export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc0Mzg4NDY0LCJleHAiOjE5MzIwNjg0NjR9.Q9lVxKdVMbZge7vOgn_Ffroc8iVrpNtkFxqUugfwkPs';

/** Where the visitor came from: the validated `?s=` tag, or 'direct'. */
export function attributionSource(): string {
	const s = new URLSearchParams(window.location.search).get('s') || '';
	return /^[a-z_]{1,24}$/.test(s) ? s : 'direct';
}

function anonymousId(): string {
	try {
		let id = localStorage.getItem('ds_aid');
		if (!id) {
			id = crypto.randomUUID();
			localStorage.setItem('ds_aid', id);
		}
		return id;
	} catch {
		return crypto.randomUUID(); // storage blocked → still count, less dedup
	}
}

/**
 * Send one event. `dedupeKey` limits it to once per browser session (the
 * HTTP cache never suppresses this script, so we dedupe ourselves); pass
 * null for events that should count every time, such as a button tap.
 */
export function fireBeacon(
	eventName: string,
	category: string,
	dedupeKey: string | null,
	properties: Record<string, string>,
): void {
	// The local dev server talks to the production API — never let a
	// developer's page loads land in the real numbers.
	if (import.meta.env.DEV) return;
	if (dedupeKey) {
		try {
			if (sessionStorage.getItem(dedupeKey)) return;
			sessionStorage.setItem(dedupeKey, '1');
		} catch { /* storage blocked → fire anyway */ }
	}
	try {
		fetch(SUPABASE_URL + '/rest/v1/rpc/rpc_track_events_batch', {
			method: 'POST',
			headers: {
				apikey: SUPABASE_ANON_KEY,
				Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
				'Content-Type': 'application/json',
			},
			keepalive: true,
			body: JSON.stringify({
				p_events: [{
					event_name: eventName,
					category: category,
					occurred_at: new Date().toISOString(),
					anonymous_id: anonymousId(),
					platform: 'web_landing',
					properties: properties,
				}],
			}),
		}).catch(() => {});
	} catch { /* never break the page */ }
}

/**
 * Report taps on the store badges inside `root`. keepalive lets the request
 * finish while the browser is already leaving for the store.
 */
export function trackStoreTaps(root: ParentNode, surface: string): void {
	root.querySelectorAll<HTMLAnchorElement>('a[data-store]').forEach((a) => {
		a.addEventListener('click', () => {
			fireBeacon('store_link_clicked', 'acquisition', null, {
				store: a.dataset.store || '',
				surface: surface,
				source: attributionSource(),
			});
		});
	});
}

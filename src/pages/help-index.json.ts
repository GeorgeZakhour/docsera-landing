// What the help search reads: loaded only when someone starts searching.
import { ARTICLES, WORLDS } from '../data/help';

export function GET() {
	const rows = ARTICLES.map((a) => ({
		i: a.id,
		t: a.title,
		s: a.summary,
		k: a.keywords.join(' '),
		w: WORLDS.find((w) => w.cats.includes(a.category))?.title || '',
	}));
	return new Response(JSON.stringify(rows), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}

// Starts the 3D DocSera mark on /download. Built as its own small file and loaded
// with `async`, so it depends on nothing else on the page: module scripts run in
// document order, and the others wait for the links / analytics chunks, which
// queue behind the fonts on a slow line (that alone cost about 2 s).
import { mountFlower } from './flower3d';

// A frame callback runs after the render-blocking CSS, so the canvas has its size.
requestAnimationFrame(() => {
	// The 3D mark starts now and shows nothing until its first frame is ready.
	// A device that can't run it gets one still picture of the same object
	// (fetched only then); on Data Saver, nothing at all.
	const gem = document.querySelector<HTMLElement>('[data-gem]');
	const canvas = document.querySelector<HTMLCanvasElement>('[data-flower]');
	const still = document.querySelector<HTMLImageElement>('[data-still]');
	const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
	const saveData = !!(conn && conn.saveData);
	if (gem && canvas && still && !saveData) {
		const showStill = () => {
			still.addEventListener('load', () => {
				gem.classList.add('ready');
				still.classList.add('on');
				canvas.classList.remove('on');
			}, { once: true });
			still.src = still.dataset.src || '';
		};
		let live = false;
		if (!reduce && (navigator.hardwareConcurrency || 2) >= 4) {
			try {
				live = mountFlower(canvas, {
					onReady: () => { canvas.classList.add('on'); gem.classList.add('ready'); },
					onGiveUp: showStill,
				});
			} catch { /* falls through to the still */ }
		}
		if (!live) showStill();
	}

});

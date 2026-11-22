// The 3D mark on real phones: mediump (16-bit) floats break the ray-march into
// hundreds of dots (seen on Android, 2026-11-23), so it must run in highp or not at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAG, canDrawFlower } from './flower3d.ts';

const HIGH_FLOAT = 1, FRAGMENT_SHADER = 2, RENDERER = 3;
function fakeGl(precision: number, renderer = 'Mali-G78') {
	return {
		HIGH_FLOAT, FRAGMENT_SHADER,
		getShaderPrecisionFormat: () => ({ precision, rangeMin: 127, rangeMax: 127 }),
		getExtension: () => ({ UNMASKED_RENDERER_WEBGL: RENDERER }),
		getParameter: () => renderer,
	} as unknown as WebGLRenderingContext;
}

test('the fragment shader runs in highp, never mediump', () => {
	assert.match(FRAG, /precision highp float;/);
	assert.doesNotMatch(FRAG, /mediump/);
});

test('a phone with real highp draws the flower', () => {
	assert.equal(canDrawFlower(fakeGl(23)), true);
});

test('no highp in the fragment shader keeps the flat mark', () => {
	assert.equal(canDrawFlower(fakeGl(0)), false);
	assert.equal(canDrawFlower(fakeGl(10)), false);
});

test('a software renderer keeps the flat mark', () => {
	assert.equal(canDrawFlower(fakeGl(23, 'Google SwiftShader')), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {DIRECTIONS_8, directionVector, isDiagonal, sectorForKeys, sectorForVector} from '../js/directions.js';

function atAngle(degrees, radius = 100) {
  const radians = degrees * Math.PI / 180;
  return [Math.sin(radians) * radius, -Math.cos(radians) * radius];
}

test('clasifica los ocho sectores de 45° con coordenadas de pantalla', () => {
  assert.equal(DIRECTIONS_8.length, 8);
  DIRECTIONS_8.forEach((direction, index) => {
    for (const offset of [-22, 0, 22]) {
      assert.equal(sectorForVector(...atAngle(index * 45 + offset)), direction);
    }
    const [x, y] = directionVector(direction);
    assert.equal(sectorForVector(x * 100, y * 100), direction);
    assert.equal(isDiagonal(direction), index % 2 === 1);
  });
  assert.equal(isDiagonal(null), false);
  assert.equal(isDiagonal('desconocida'), false);
});

test('mantiene histéresis angular simétrica entre sectores y alrededor de 360°', () => {
  assert.equal(sectorForVector(...atAngle(25), {previous: 'up'}), 'up');
  assert.equal(sectorForVector(...atAngle(30), {previous: 'up'}), 'up-right');
  assert.equal(sectorForVector(...atAngle(20), {previous: 'up-right'}), 'up-right');
  assert.equal(sectorForVector(...atAngle(15), {previous: 'up-right'}), 'up');
  assert.equal(sectorForVector(...atAngle(334), {previous: 'up'}), 'up');
  assert.equal(sectorForVector(...atAngle(330), {previous: 'up'}), 'up-left');
});

test('la zona neutral tiene umbrales de inicio y salida separados', () => {
  assert.equal(sectorForVector(32.9, 0), null);
  assert.equal(sectorForVector(33, 0), 'right');
  assert.equal(sectorForVector(25, 0, {previous: 'right'}), 'right');
  assert.equal(sectorForVector(24.9, 0, {previous: 'right'}), null);
  assert.equal(sectorForVector(NaN, 42), null);
  assert.equal(sectorForVector(0, 0, {enter: 0}), null);
});

test('flechas compatibles forman las cuatro diagonales, sin combinar opuestos', () => {
  const chord = (...keys) => sectorForKeys(new Set(keys));
  assert.equal(chord('ArrowUp', 'ArrowRight'), 'up-right');
  assert.equal(chord('ArrowDown', 'ArrowRight'), 'down-right');
  assert.equal(chord('ArrowDown', 'ArrowLeft'), 'down-left');
  assert.equal(chord('ArrowUp', 'ArrowLeft'), 'up-left');
  assert.equal(chord('ArrowLeft'), 'left');
  assert.equal(chord('ArrowUp', 'ArrowDown'), null);
  assert.equal(chord('ArrowLeft', 'ArrowRight'), null);
  assert.equal(chord('ArrowRight', 'ArrowDown', 'ArrowUp'), null);
  assert.equal(chord('ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'), null);
  assert.equal(chord(), null);
});

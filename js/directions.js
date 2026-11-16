// Orden angular en pantalla, desde arriba y en sentido horario.
export const DIRECTIONS_8 = Object.freeze([
  'up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left',
]);

const SECTOR_DEGREES = 45;
const HALF_SECTOR_DEGREES = SECTOR_DEGREES / 2;
const DIAGONAL_COMPONENT = Math.SQRT1_2;
const vectors = Object.freeze({
  up: Object.freeze([0, -1]),
  'up-right': Object.freeze([DIAGONAL_COMPONENT, -DIAGONAL_COMPONENT]),
  right: Object.freeze([1, 0]),
  'down-right': Object.freeze([DIAGONAL_COMPONENT, DIAGONAL_COMPONENT]),
  down: Object.freeze([0, 1]),
  'down-left': Object.freeze([-DIAGONAL_COMPONENT, DIAGONAL_COMPONENT]),
  left: Object.freeze([-1, 0]),
  'up-left': Object.freeze([-DIAGONAL_COMPONENT, -DIAGONAL_COMPONENT]),
});

export const KEY_DIRECTIONS = Object.freeze({
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowLeft: 'left',
});

export function isDiagonal(direction) {
  return DIRECTIONS_8.indexOf(direction) % 2 === 1;
}

export function directionVector(direction) {
  return Object.hasOwn(vectors, direction) ? vectors[direction] : [0, 0];
}

export function sectorForVector(x, y, {previous = null, enter = 33, exit = 25, hysteresis = 7} = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const previousIndex = DIRECTIONS_8.indexOf(previous);
  const length = Math.hypot(x, y);
  if (length === 0 || length < (previousIndex < 0 ? enter : exit)) return null;

  const degrees = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
  if (previousIndex >= 0) {
    const delta = (degrees - previousIndex * SECTOR_DEGREES + 540) % 360 - 180;
    if (Math.abs(delta) < HALF_SECTOR_DEGREES + hysteresis) return previous;
  }

  return DIRECTIONS_8[Math.round(degrees / SECTOR_DEGREES) % DIRECTIONS_8.length];
}

export function sectorForKeys(keys) {
  const up = keys.has('ArrowUp');
  const right = keys.has('ArrowRight');
  const down = keys.has('ArrowDown');
  const left = keys.has('ArrowLeft');
  if ((up && down) || (left && right)) return null;
  return sectorForVector(Number(right) - Number(left), Number(down) - Number(up), {enter: 0});
}

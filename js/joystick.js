import {directionVector, isDiagonal, KEY_DIRECTIONS, sectorForKeys, sectorForVector} from './directions.js';

// Un breve margen permite formar un acorde sin enviar primero una cardinal.
const DEFAULT_CHORD_MS = 65;

export function initJoystick(onDirection, onRelease, {
  isEnabled = () => true,
  isPreviewEnabled = isEnabled,
  canContinueChord = () => false,
  onPreview = () => {},
  chordDelay = DEFAULT_CHORD_MS,
} = {}) {
  const el = document.querySelector('#joystick');
  const knob = document.querySelector('#joystickStick');
  const listeners = new AbortController();
  const listen = (target, type, handler) => target.addEventListener(type, handler, {signal: listeners.signal});

  let pointer = null;
  let direction = null;
  let source = null;
  let chordTimer = null;
  const heldKeys = new Set();

  function geometry({width, height} = el.getBoundingClientRect()) {
    const size = Math.min(width, height);
    return {travel: Math.min(46, size * .24), enter: Math.min(33, size * .165), exit: Math.min(25, size * .125)};
  }

  function moveVisual(x, y) {
    knob.style.transform = `translate(${x}px, ${y}px)`;
  }

  function moveToSector(next) {
    const {travel} = geometry();
    const [x, y] = directionVector(next);
    moveVisual(x * travel, y * travel);
  }

  function clearChord() {
    clearTimeout(chordTimer);
    chordTimer = null;
  }

  function clearInput() {
    const captured = pointer;
    pointer = null;
    heldKeys.clear();
    clearChord();
    // Invalidar el puntero antes de liberar la captura evita un segundo cierre.
    if (captured !== null && el.hasPointerCapture(captured)) {
      el.releasePointerCapture(captured);
    }
  }

  function preview(next, input, previewOnly) {
    direction = next;
    source = next ? input : null;
    el.dataset.direction = next ?? 'neutral';
    el.classList.toggle('is-active', Boolean(next));
    onPreview(next, {source: input, previewOnly});
  }

  function neutral({notify = false, reason = 'release'} = {}) {
    const previous = direction;
    const previousSource = source;
    clearInput();
    moveVisual(0, 0);
    if (!previous) return;
    preview(null, previousSource, true);
    if (notify) onRelease({source: previousSource, held: false, reason});
  }

  function dispatch(next, input) {
    if (direction !== next || !isPreviewEnabled()) return;
    if (!isDiagonal(next) && !isEnabled()) {
      preview(next, input, true);
      return;
    }
    if (onDirection(next) === false) neutral();
  }

  function apply(next, input, {previewOnly = false, defer = false, reason = 'center'} = {}) {
    if (next === direction) return;
    clearChord();
    if (!next) {
      const previousSource = source;
      preview(null, input, true);
      onRelease({source: previousSource, held: true, reason});
      return;
    }
    const diagonal = isDiagonal(next);
    const mayDispatch = !previewOnly && (diagonal || isEnabled());
    preview(next, input, diagonal || !mayDispatch);
    if (!mayDispatch || direction !== next) return;

    if (defer && !diagonal && chordDelay > 0) {
      chordTimer = setTimeout(() => {
        chordTimer = null;
        dispatch(next, input);
      }, chordDelay);
      return;
    }
    dispatch(next, input);
  }

  function startPointer(event) {
    if (event.button !== 0 || event.isPrimary === false || pointer !== null || heldKeys.size || !isPreviewEnabled()) return;
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    pointer = event.pointerId;
    el.focus({preventScroll: true});
    updatePointer(event);
    event.preventDefault();
  }

  function updatePointer(event) {
    if (pointer !== event.pointerId) return;
    if (!isPreviewEnabled()) {
      neutral({notify: true, reason: 'disabled'});
      return;
    }
    if (event.type === 'pointermove' && event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      neutral({notify: true});
      return;
    }
    const bounds = el.getBoundingClientRect();
    const dx = event.clientX - bounds.left - bounds.width / 2;
    const dy = event.clientY - bounds.top - bounds.height / 2;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;

    const {travel, enter, exit} = geometry(bounds);
    const length = Math.hypot(dx, dy);
    const scale = length > travel ? travel / length : 1;
    moveVisual(dx * scale, dy * scale);
    apply(sectorForVector(dx, dy, {previous: direction, enter, exit}), 'pointer');
  }

  function finishPointer(event) {
    if (pointer !== event.pointerId) return;
    neutral({notify: true, reason: event.type === 'pointerup' ? 'release' : event.type});
  }

  function updateKeys({partial = false} = {}) {
    const next = sectorForKeys(heldKeys);
    // Sólo una diagonal continua admitida puede conservar un eje al soltar el otro.
    // Volver de un conflicto o de una diagonal visual no inicia una orden nueva.
    const continues = partial && next && !isDiagonal(next) && isDiagonal(direction) && canContinueChord();
    moveToSector(next);
    apply(next, 'keyboard', {previewOnly: partial && !continues, defer: !partial, reason: 'conflict'});
  }

  listen(el, 'pointerdown', startPointer);
  listen(el, 'pointermove', updatePointer);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(el, type, finishPointer);
  listen(el, 'blur', () => neutral({notify: true, reason: 'blur'}));
  listen(el, 'keydown', event => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' || event.key === ' ') {
      if (event.key === ' ') event.preventDefault();
      neutral({notify: true, reason: event.key === 'Escape' ? 'escape' : 'release'});
      return;
    }
    if (!Object.hasOwn(KEY_DIRECTIONS, event.key)) return;
    event.preventDefault();
    if (!isPreviewEnabled() || pointer !== null || event.repeat || heldKeys.has(event.key)) return;
    heldKeys.add(event.key);
    updateKeys();
  });
  listen(el, 'keyup', event => {
    if (!heldKeys.delete(event.key)) return;
    if (heldKeys.size) updateKeys({partial: true});
    else neutral({notify: true});
  });

  const isLandscape = () => window.innerWidth > window.innerHeight;
  let landscape = isLandscape();
  function endForOrientation() {
    landscape = isLandscape();
    neutral({notify: true, reason: 'orientation'});
  }
  listen(window, 'resize', () => {
    if (landscape !== isLandscape()) endForOrientation();
  });
  if (window.screen?.orientation?.addEventListener) {
    listen(window.screen.orientation, 'change', endForOrientation);
  } else {
    listen(window, 'orientationchange', endForOrientation);
  }

  listen(window, 'blur', () => neutral({notify: true, reason: 'blur'}));
  listen(window, 'pagehide', () => neutral({notify: true, reason: 'pagehide'}));
  listen(document, 'visibilitychange', () => {
    if (document.hidden) neutral({notify: true, reason: 'hidden'});
  });
  el.dataset.direction = 'neutral';

  return {
    neutral,
    get direction() { return direction; },
    destroy() {
      neutral();
      listeners.abort();
    },
  };
}

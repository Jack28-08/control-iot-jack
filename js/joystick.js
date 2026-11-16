import {directionVector, isDiagonal, KEY_DIRECTIONS, sectorForKeys, sectorForVector} from './directions.js';

// Un breve margen permite formar un acorde sin enviar primero una cardinal.
const DEFAULT_CHORD_MS = 65;
const ACCESSIBLE_PREVIEW_MS = 650;
const ACTIVATE_KEYS = new Set(['Enter', ' ']);

export function initJoystick(onDirection, onRelease, {
  isEnabled = () => true,
  isPreviewEnabled = isEnabled,
  onPreview = () => {},
  diagonalButtons = [],
  chordDelay = DEFAULT_CHORD_MS,
} = {}) {
  const el = document.querySelector('#joystick');
  const knob = document.querySelector('#joystickStick');
  const buttons = Array.from(diagonalButtons).filter(button => isDiagonal(button.dataset.direction));
  const listeners = new AbortController();
  const listen = (target, type, handler) => target.addEventListener(type, handler, {signal: listeners.signal});

  let pointer = null;
  let direction = null;
  let source = null;
  let heldButton = null;
  let chordTimer = null;
  let previewTimer = null;
  let transferringFocus = false;
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

  function clearTimers() {
    clearTimeout(chordTimer);
    clearTimeout(previewTimer);
    chordTimer = null;
    previewTimer = null;
  }

  function setActiveButton(button = null) {
    for (const item of buttons) item.setAttribute('aria-pressed', String(item === button));
  }

  function clearInput() {
    const captured = pointer;
    pointer = null;
    heldKeys.clear();
    heldButton = null;
    clearTimers();
    // Invalidar el puntero antes de liberar la captura evita un segundo cierre.
    if (captured?.element.hasPointerCapture(captured.id)) {
      captured.element.releasePointerCapture(captured.id);
    }
    setActiveButton();
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
    if (!isDiagonal(next) && !isEnabled()) {
      preview(next, input, true);
      return;
    }
    if (onDirection(next) === false) neutral();
  }

  function apply(next, input, {previewOnly = false, defer = false, reason = 'center'} = {}) {
    if (next === direction) return;
    clearTimeout(chordTimer);
    chordTimer = null;
    if (!next) {
      const previousSource = source;
      preview(null, input, true);
      onRelease({source: previousSource, held: true, reason});
      return;
    }
    const diagonal = isDiagonal(next);
    const mayDispatch = !previewOnly && (diagonal || isEnabled());
    preview(next, input, diagonal || !mayDispatch);
    if (!mayDispatch) return;

    if (defer && !diagonal && chordDelay > 0) {
      chordTimer = setTimeout(() => {
        chordTimer = null;
        if (direction === next && isPreviewEnabled()) dispatch(next, input);
      }, chordDelay);
      return;
    }
    dispatch(next, input);
  }

  function focusInput(element) {
    transferringFocus = true;
    try {
      element.focus({preventScroll: true});
    } finally {
      transferringFocus = false;
    }
  }

  function startPointer(event, element, forced = null) {
    if (event.button !== 0 || !isPreviewEnabled() || pointer?.id === event.pointerId) return;
    if (!forced && (event.isPrimary === false || pointer || heldKeys.size || heldButton)) return;
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    clearInput();
    pointer = {id: event.pointerId, element, forced};
    focusInput(element);
    if (forced) setActiveButton(element);
    updatePointer(event);
    event.preventDefault();
  }

  function updatePointer(event) {
    if (pointer?.id !== event.pointerId) return;
    if (!isPreviewEnabled()) {
      neutral({notify: true, reason: 'disabled'});
      return;
    }
    if (event.type === 'pointermove' && event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      neutral({notify: true});
      return;
    }
    if (pointer.forced) {
      moveToSector(pointer.forced);
      apply(pointer.forced, 'button');
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
    if (pointer?.id !== event.pointerId) return;
    neutral({notify: true, reason: event.type === 'pointerup' ? 'release' : event.type});
  }

  function bindPointer(element, forced = null) {
    listen(element, 'pointerdown', event => startPointer(event, element, forced));
    listen(element, 'pointermove', updatePointer);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(element, type, finishPointer);
    listen(element, 'blur', () => {
      if (!transferringFocus) neutral({notify: true, reason: 'blur'});
    });
  }

  function updateKeys({partial = false} = {}) {
    const next = sectorForKeys(heldKeys);
    moveToSector(next);
    apply(next, 'keyboard', {previewOnly: partial, defer: true, reason: 'conflict'});
  }

  bindPointer(el);
  listen(el, 'keydown', event => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' || event.key === ' ') {
      if (event.key === ' ') event.preventDefault();
      neutral({notify: true, reason: event.key === 'Escape' ? 'escape' : 'release'});
      return;
    }
    if (!Object.hasOwn(KEY_DIRECTIONS, event.key)) return;
    event.preventDefault();
    if (!isPreviewEnabled() || pointer || heldButton || event.repeat || heldKeys.has(event.key)) return;
    clearTimeout(previewTimer);
    previewTimer = null;
    setActiveButton();
    heldKeys.add(event.key);
    updateKeys();
  });
  listen(el, 'keyup', event => {
    if (!heldKeys.delete(event.key)) return;
    if (heldKeys.size) updateKeys({partial: true});
    else neutral({notify: true});
  });

  for (const button of buttons) {
    const forced = button.dataset.direction;
    bindPointer(button, forced);
    listen(button, 'keydown', event => {
      if (event.key === 'Escape') {
        neutral({notify: true, reason: 'escape'});
        return;
      }
      if (!ACTIVATE_KEYS.has(event.key)) return;
      event.preventDefault();
      if (event.repeat || !isPreviewEnabled()) return;
      clearInput();
      heldButton = {element: button, key: event.key};
      moveToSector(forced);
      setActiveButton(button);
      apply(forced, 'button');
    });
    listen(button, 'keyup', event => {
      if (heldButton?.element !== button || heldButton.key !== event.key) return;
      event.preventDefault();
      neutral({notify: true});
    });
    listen(button, 'click', event => {
      // Activación de tecnología de asistencia sin una secuencia pointer/teclado.
      if (event.detail !== 0 || pointer || heldButton || !isPreviewEnabled()) return;
      clearInput();
      moveToSector(forced);
      setActiveButton(button);
      apply(forced, 'button');
      previewTimer = setTimeout(() => neutral({notify: true}), ACCESSIBLE_PREVIEW_MS);
    });
  }

  listen(window, 'blur', () => neutral({notify: true, reason: 'blur'}));
  listen(document, 'visibilitychange', () => {
    if (document.hidden) neutral({notify: true, reason: 'hidden'});
  });
  el.dataset.direction = 'neutral';
  setActiveButton();

  return {
    neutral,
    get direction() { return direction; },
    destroy() {
      neutral();
      listeners.abort();
    },
  };
}

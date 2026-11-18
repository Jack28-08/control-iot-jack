import {DIRECTIONS_8, directionVector, isDiagonal} from './directions.js';

const MAX_TTL_MS = 1000;
const MAX_SAMPLES = 40;

function validCapability(value) {
  return typeof value?.habilitado === 'boolean'
    && typeof value.disponible === 'boolean'
    && typeof value.diagonales === 'boolean'
    && typeof value.barrera === 'string' && value.barrera.length > 0
    && Number.isInteger(value.ttl_ms) && value.ttl_ms >= 200 && value.ttl_ms <= MAX_TTL_MS
    && Number.isInteger(value.renovar_ms) && value.renovar_ms >= 50 && value.renovar_ms <= value.ttl_ms / 2;
}

// Una sola renovación en vuelo. Liberar siempre puede enviarse en paralelo.
export class SustainedControl {
  #api;
  #now;
  #uuid;
  #view;
  #gesture = null;
  #cap = null;
  #revision = 0;
  #loading = null;
  #release = null;
  #managedSeen = false;
  #mode = 'checking';
  #samples = [];

  constructor(api, view = {}, {now = () => performance.now(), uuid = () => crypto.randomUUID()} = {}) {
    this.#api = api;
    this.#now = now;
    this.#uuid = uuid;
    this.#view = {change() {}, accepted() {}, released() {}, failed() {}, ...view};
  }
  get mode() { return this.#mode; }
  get active() { return this.#gesture !== null; }
  get releasing() { return this.#release !== null; }
  get ready() { return this.#mode === 'managed' && this.#cap?.disponible === true && !this.releasing; }
  get diagonals() { return this.ready && this.#cap.diagonales; }
  get latencySamples() { return this.#samples.map(sample => ({...sample})); }

  #measure(action, started, accepted) {
    const sample = {action, milliseconds: Math.round(this.#now() - started), accepted};
    this.#samples.push(sample);
    if (this.#samples.length > MAX_SAMPLES) this.#samples.shift();
    return sample;
  }

  refresh() {
    if (this.#loading) return this.#loading;
    if (this.active || this.releasing) return Promise.resolve(this.ready);
    const revision = this.#revision;
    const started = this.#now();
    const request = Promise.resolve().then(() => this.#api.sustainedCapability()).then(value => {
      this.#measure('capacidad', started, true);
      if (revision !== this.#revision) return false;
      if (value?.habilitado === false && !this.#managedSeen) {
        this.#cap = null;
        this.#mode = 'legacy';
      } else if (validCapability(value) && value.habilitado) {
        this.#cap = value;
        this.#managedSeen = true;
        this.#mode = 'managed';
      } else {
        this.#cap = null;
        this.#mode = 'unavailable';
      }
      return this.ready;
    }).catch(error => {
      this.#measure('capacidad', started, false);
      if (revision === this.#revision) {
        this.#cap = null;
        this.#mode = error.status === 404 && !this.#managedSeen ? 'legacy' : 'unavailable';
      }
      return false;
    }).finally(() => {
      if (this.#loading === request) this.#loading = null;
      this.#view.change();
    });
    this.#loading = request;
    return request;
  }

  direction(direction) {
    if (!this.ready || !DIRECTIONS_8.includes(direction) || (isDiagonal(direction) && !this.diagonals)) return false;
    let input = this.#gesture;
    if (!input) {
      input = {
        barrera: this.#cap.barrera, gesto: this.#uuid(), ttl: this.#cap.ttl_ms, interval: this.#cap.renovar_ms,
        direction, sequence: 0, timer: null, expiry: null, pending: null, lastSent: null,
      };
      this.#gesture = input;
      this.#view.change();
    } else {
      if (input.direction === direction) return true;
      input.direction = direction;
    }
    this.#send(input);
    return true;
  }

  async #send(input) {
    if (this.#gesture !== input || input.pending) return;
    clearTimeout(input.timer);
    const controller = new AbortController();
    input.pending = controller;
    const secuencia = ++input.sequence;
    const action = secuencia === 1 ? 'permiso' : 'vector';
    const direction = input.direction;
    const [x, y] = directionVector(direction);
    const payload = {
      barrera: input.barrera, gesto: input.gesto, secuencia,
      longitudinal: y === 0 ? 0 : -Math.sign(y), lateral: Math.sign(x),
    };
    const started = this.#now();
    if (secuencia === 1) this.#arm(input, input.ttl);
    try {
      const response = await this.#api.sustainedRequest(action, payload, controller.signal);
      if (response?.barrera !== input.barrera || response.gesto !== input.gesto
          || response.secuencia !== secuencia || !Number.isInteger(response.ttl_ms)
          || response.ttl_ms < 1 || response.ttl_ms > input.ttl) {
        throw new Error('Respuesta de permiso no verificable.');
      }
      const sample = this.#measure(action, started, true);
      if (this.#gesture !== input) return;
      const remaining = response.ttl_ms - (this.#now() - started);
      if (remaining <= 0) throw new Error('El permiso expiró antes de la confirmación.');
      this.#arm(input, remaining);
      input.pending = null;
      if (action === 'vector' && direction !== input.lastSent) {
        input.lastSent = direction;
        this.#view.accepted(direction, sample);
      }
      // El permiso inicial reserva en neutral. La primera orden viaja únicamente
      // si la interacción sigue vigente cuando llega esa confirmación.
      if (action === 'permiso' || input.direction !== direction) void this.#send(input);
      else input.timer = setTimeout(() => void this.#send(input), Math.max(0, input.interval - sample.milliseconds));
    } catch {
      if (this.#gesture !== input) return;
      const sample = this.#measure(action, started, false);
      void this.release();
      this.#view.failed(sample);
    }
  }

  #arm(input, timeout) {
    clearTimeout(input.expiry);
    input.expiry = setTimeout(() => {
      if (this.#gesture !== input) return;
      const sample = {action: 'vencimiento', milliseconds: Math.round(timeout), accepted: false};
      void this.release();
      this.#view.failed(sample);
    }, timeout);
  }

  #detach() {
    const input = this.#gesture;
    this.#gesture = null;
    this.#cap = null;
    this.#revision++;
    this.#loading = null;
    if (input) {
      clearTimeout(input.timer);
      clearTimeout(input.expiry);
      input.pending?.abort('release');
    }
    return input;
  }

  // DETENER global aplica su propia barrera en el servidor.
  invalidate() {
    if (!this.#managedSeen) return;
    this.#detach();
    this.#release = null;
    this.#view.change();
  }

  release() {
    if (!this.#gesture) return this.#release ?? Promise.resolve(false);
    const {barrera, gesto} = this.#detach();
    const revision = this.#revision;
    const started = this.#now();
    // Invocar antes de devolver el control: pagehide borra las credenciales en
    // memoria al terminar el manejador. El plazo del equipo cubre la entrega incierta.
    const request = this.#api.sustainedRequest('liberar', {barrera, gesto});
    const release = request.then(response => {
        if (response?.liberado !== true) throw new Error('Liberación sin confirmar.');
        const sample = this.#measure('liberar', started, true);
        if (revision === this.#revision) this.#view.released(sample);
        return true;
      }).catch(() => {
        const sample = this.#measure('liberar', started, false);
        if (revision === this.#revision) this.#view.failed(sample);
        return false;
      }).finally(() => {
        if (this.#release === release) this.#release = null;
        this.#view.change();
        if (revision === this.#revision) void this.refresh();
      });
    this.#release = release;
    this.#view.change();
    return release;
  }
}

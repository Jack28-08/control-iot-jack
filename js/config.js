// Contratos verificables en https://github.com/Jack28-08/api-vehiculo-iot
// NO escribir la API key en este archivo ni en ningún archivo de GitHub Pages.
export const API_BASE = 'https://184-72-72-255.sslip.io';
export const VEHICLE_ID = 1;
export const WS_URL = `wss://184-72-72-255.sslip.io/ws/vehiculos/${VEHICLE_ID}`;
export const API_HEALTH = '/health';
export const DB_HEALTH = '/health/db';
export const ORIGIN_TAG = 'CONTROL-WEB';
export const API_CHECK_MS = 30000;
export const RDS_CHECK_MS = 60000;
export const REQUEST_TIMEOUT_MS = 12000;
export const PATHS = Object.freeze({
  vehicle: id => `/vehiculos/${id}`,
  commands: id => `/vehiculos/${id}/comandos`,
  demos: id => `/vehiculos/${id}/demos`,
  demoSteps: (id,demo) => `/vehiculos/${id}/demos/${demo}/movimientos`,
  movement: id => `/vehiculos/${id}/movimientos`,
  startDemo: (id,demo) => `/vehiculos/${id}/demos/${demo}/iniciar`,
  cancelDemo: (id,demo) => `/vehiculos/${id}/demos/${demo}/cancelar`,
  stop: id => `/vehiculos/${id}/detener`,
});

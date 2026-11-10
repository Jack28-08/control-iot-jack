// El catálogo final SIEMPRE proviene de GET /vehiculos/{id}/comandos.
// Esta tabla sólo decide cómo se etiqueta cada acción conocida para la interfaz.
export const LABELS = Object.freeze({
  AVANZAR: { label:'AVANZAR', icon:'↑', group:'drive' },
  RETROCEDER: { label:'RETROCEDER', icon:'↓', group:'drive' },
  GI: { label:'GI · IZQUIERDA', icon:'←', group:'drive' },
  GIRAR_IZQUIERDA: { label:'IZQUIERDA', icon:'←', group:'drive' },
  GIRAR_DERECHA: { label:'DERECHA', icon:'→', group:'drive' },
  CAMBIAR_VELOCIDAD: { label:'CAMBIAR VELOCIDAD', icon:'↗', group:'extra' },
  VELOCIDAD: { label:'VELOCIDAD', icon:'↗', group:'extra' },
  SUBIR_GRUA: { label:'SUBIR GRÚA', icon:'↟', group:'extra' },
  BAJAR_GRUA: { label:'BAJAR GRÚA', icon:'↡', group:'extra' },
  DEMO: { label:'DEMO DEL CONTROL', icon:'◎', group:'extra' },
});
export const DIRECTIONS = Object.freeze({ up:'AVANZAR',down:'RETROCEDER',left:'GIRAR_IZQUIERDA',right:'GIRAR_DERECHA' });
export const KEY_DIRECTIONS = Object.freeze({ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'});
export function validCommands(catalog, vehicleId){
  if (!Array.isArray(catalog)) return [];
  return catalog.filter(c => c && c.activo === true && c.id_vehiculo === vehicleId && Number.isInteger(c.id_comando) && Number.isInteger(c.codigo) && typeof c.nombre === 'string' && c.nombre.trim() !== '');
}
export function commandByName(catalog, name){
  // Los alias sólo buscan objetos del GET; no crean comandos ni infieren IDs.
  const aliases={GIRAR_IZQUIERDA:'GI',GI:'GIRAR_IZQUIERDA',CAMBIAR_VELOCIDAD:'VELOCIDAD',VELOCIDAD:'CAMBIAR_VELOCIDAD'};
  return catalog.find(c=>c.nombre===name)||catalog.find(c=>c.nombre===aliases[name])||null;
}
export function computeDemoDuration(steps){
  if(!Array.isArray(steps)) return 0;
  return steps.reduce((sum,s)=>sum+Math.max(0,Number(s.duracion_ms)||0)+Math.max(0,Number(s.pausa_ms)||0),0);
}
export function directionForVector(x, y, threshold){
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  if(Math.hypot(x,y)<threshold) return null;
  return Math.abs(x)>=Math.abs(y) ? (x>0?'right':'left') : (y>0?'down':'up');
}
export function safeEventPayload(raw, vehicleId){
  if(typeof raw!=='string' || raw.length>65536)return null;
  try {
    const v=JSON.parse(raw);
    if(!v||typeof v!=='object'||Array.isArray(v)||v.id_vehiculo!==vehicleId||typeof v.tipo!=='string')return null;
    return v;
  }catch{return null;}
}

// El conector MySQL de la API fija time_zone='+00:00'. Sólo las dos columnas
// TIMESTAMP de estado/historial pueden llegar sin offset; WSS lo trae siempre.
export const EVENT_TYPES = Object.freeze([
  'estado_inicial','movimiento_individual','detencion_logica','demo_inicio',
  'demo_movimiento','demo_fin','demo_cancelada','demo_error','salida_dispositivo',
]);
export const positiveId = value => Number.isSafeInteger(value) && value > 0;
export const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nullable = (value, test) => value == null || test(value);
const uuid = value => typeof value==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

export function timestamp(value, {mysqlUtc=false}={}) {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!parts) return null;
  const [,year,month,day,hour,minute,second,fraction='',offset]=parts;
  if ((!offset && !mysqlUtc) || Number(year)<1 || Number(month)<1 || Number(month)>12 || Number(hour)>23 || Number(minute)>59 || Number(second)>59) return null;
  const leap=Number(year)%4===0 && (Number(year)%100!==0 || Number(year)%400===0);
  if (Number(day)<1 || Number(day)>[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][Number(month)-1]) return null;
  const milliseconds=Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}${offset||'Z'}`);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

export function validEvent(value, vehicleId) {
  if (!record(value) || value.id_vehiculo!==vehicleId || !EVENT_TYPES.includes(value.tipo) || !timestamp(value.fecha_hora)) return false;
  if(!nullable(value.id_evento,uuid)||!nullable(value.id_operacion,uuid)||!nullable(value.id_historial,positiveId))return false;
  if(value.tipo==='salida_dispositivo'){
    const applied=value.estado_salida==='aplicado';
    return uuid(value.id_operacion)&&typeof value.simulado==='boolean'
      &&Number.isSafeInteger(value.ms_ida_vuelta)&&value.ms_ida_vuelta>=0
      &&Number.isInteger(value.mascara)&&(applied?value.mascara>0&&value.mascara<=255:
        value.estado_salida==='liberado'&&value.mascara===0);
  }
  if (!nullable(value.id_comando,positiveId) || !nullable(value.comando,v=>typeof v==='string') ||
      !nullable(value.codigo,Number.isSafeInteger) || !nullable(value.conectado,v=>typeof v==='boolean') ||
      !nullable(value.id_ejecucion,v=>typeof v==='string'&&v.trim().length>0&&v.length<=128) ||
      !nullable(value.id_demo,positiveId) || !nullable(value.total_movimientos,positiveId) ||
      !nullable(value.mensaje,v=>typeof v==='string')) return false;
  if ((value.tipo==='movimiento_individual' || value.tipo==='demo_movimiento') && !positiveId(value.id_comando)) return false;
  if (value.tipo.startsWith('demo_') && (value.id_ejecucion==null || !positiveId(value.id_demo) || !positiveId(value.total_movimientos))) return false;
  return value.tipo!=='demo_movimiento' || (positiveId(value.orden) && positiveId(value.duracion_ms) && Number.isSafeInteger(value.pausa_ms) && value.pausa_ms>=0);
}

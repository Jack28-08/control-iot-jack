/** Formatos de presentación. Los objetos originales del catálogo no se modifican. */
const movements=Object.freeze({
  AVANZAR:['Avanzar','↑','drive'],
  RETROCEDER:['Retroceder','↓','drive'],
  GI:['Girar a la izquierda','←','drive'],
  IZQUIERDA:['Girar a la izquierda','←','drive'],
  GIRAR_IZQUIERDA:['Girar a la izquierda','←','drive'],
  GIRAR_A_LA_IZQUIERDA:['Girar a la izquierda','←','drive'],
  DERECHA:['Girar a la derecha','→','drive'],
  GIRAR_DERECHA:['Girar a la derecha','→','drive'],
  GIRAR_A_LA_DERECHA:['Girar a la derecha','→','drive'],
  SUBIR_GRUA:['Subir grúa','↟','extra'],
  BAJAR_GRUA:['Bajar grúa','↡','extra'],
  CAMBIAR_VELOCIDAD:['Cambiar velocidad','↗','extra'],
  VELOCIDAD:['Cambiar velocidad','↗','extra'],
  DEMO:['Demo del control','◎','extra'],
  DETENER:['Detener','■','drive'],
});
const phases=Object.freeze({
  estado_inicial:'Lectura inicial',
  movimiento_individual:'Movimiento individual',
  detencion_logica:'Detención lógica',
  demo_inicio:'Demo iniciada',
  demo_movimiento:'Paso de demo',
  demo_fin:'Demo finalizada',
  demo_cancelada:'Demo cancelada',
  demo_error:'Demo sin confirmación',
});
function key(value){
  if(typeof value!=='string')return '';
  return value.trim().normalize('NFD').replace(/\p{M}/gu,'')
    .replace(/[\s_-]+/g,'_').toUpperCase();
}
function titleCase(value){
  if(!value)return value;
  const lower=value.toLocaleLowerCase('es-MX');
  return lower[0].toLocaleUpperCase('es-MX')+lower.slice(1);
}
export function formatName(value,fallback='Sin información'){
  if(typeof value!=='string'||!value.trim()||/^(?:null|undefined)$/i.test(value.trim()))return fallback;
  const cleaned=value.trim().replace(/_+/g,' ').replace(/\s+/g,' ');
  if(!cleaned.trim())return fallback;
  return cleaned===cleaned.toLocaleUpperCase('es-MX')&&/[\p{L}]/u.test(cleaned)
    ? titleCase(cleaned) : cleaned;
}
export function formatMovement(value,fallback='Sin movimiento'){
  return movements[key(value)]?.[0]??formatName(value,fallback);
}
export function movementIcon(value){return movements[key(value)]?.[1]??'◇';}
export function movementGroup(value){return movements[key(value)]?.[2]??'extra';}
export function formatEvent(value,fallback=''){
  return Object.hasOwn(phases,value)?phases[value]:formatName(value,fallback);
}
export function formatMessage(value,fallback=''){
  if(typeof value!=='string'||!value.trim())return fallback;
  let text=value.replace(/\b(?:null|undefined)\b/gi,'').trim();
  text=text.replace(/\b[\p{L}\d]+(?:_[\p{L}\d]+)+\b/gu,word=>
    Object.hasOwn(phases,word.toLowerCase())?phases[word.toLowerCase()]:formatMovement(word));
  text=text.replace(/\bGI\b/g,formatMovement('GI')).replace(/_+/g,' ');
  if(!text.trim())return fallback;
  // El controlador compone estados como «COMANDO · solicitado» y «Evento WSS · COMANDO».
  const tokens=text.split(/\s+·\s+/);
  return tokens.map(token=>{
    const k=key(token);
    if(k!=='DEMO'&&Object.hasOwn(movements,k))return movements[k][0];
    if(k==='NEUTRAL')return 'Neutral';
    if(k==='DETENIENDO')return 'Deteniendo';
    if(k==='SIN_CONFIRMAR')return 'Sin confirmar';
    if(k==='DEMO_EN_CURSO')return 'Demo en curso';
    if(k==='DEMO'||k==='CANCELAR_DEMO')return formatName(token);
    return token;
  }).join(' · ');
}
export function formatTimestamp(value,{timeZone}={}){
  const blank={date:'—',time:'—'};
  if(typeof value!=='string')return blank;
  // La capa REST/WSS normaliza la zona antes de entregar el valor a presentación.
  const iso=value.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i);
  if(!iso)return blank;
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))return blank;
  const [,y,m,day]=iso.map(Number);
  const check=new Date(0);check.setUTCFullYear(y,m-1,day);
  if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==day)return blank;
  const tz=timeZone?{timeZone}:{};
  const date=new Intl.DateTimeFormat('es-MX',{...tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  const time=new Intl.DateTimeFormat('es-MX',{...tz,hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(d);
  return {date,time};
}
export function formatDuration(ms){
  if(!Number.isFinite(ms)||ms<0)return '—';
  return `${new Intl.NumberFormat('es-MX',{maximumFractionDigits:3}).format(ms/1000)} s`;
}

import {LABELS} from './catalog.js';
const $=s=>document.querySelector(s);
let messageTimer=null;
export function setIndicator(kind,label,state){
  const tile=$(`[data-kind="${kind}"]`);
  const id={ws:'#wsStatus',api:'#apiStatus',db:'#dbStatus'}[kind];
  if(!tile||!id)return;
  $(id).textContent=label;
  tile.classList.remove('state-ok','state-wait','state-error');
  tile.classList.add(`state-${state}`);
}
export function setOperation(title,detail){
  $('#operationState').textContent=title;
  $('#operationDetail').textContent=detail;
  $('#operationTime').textContent=new Date().toLocaleTimeString('es-MX',{hour12:false});
}
export function notify(message){
  const n=$('#notice');n.textContent=message;n.hidden=false;
  clearTimeout(messageTimer);messageTimer=setTimeout(()=>n.hidden=true,9000);
}
export function setAccessLabel(enabled){
  $('#credentialsButton span').textContent=enabled?'Clave activa':'Acceso';
}
export function renderCommands(catalog,onClick){
  const target=$('#commandButtons');target.replaceChildren();
  const sorted=[...catalog].sort((a,b)=>(LABELS[a.nombre]?.group==='drive'?0:1)-(LABELS[b.nombre]?.group==='drive'?0:1)||a.codigo-b.codigo);
  $('#commandsCount').textContent=`${sorted.length} COMANDOS`;
  if(!sorted.length){const p=document.createElement('p');p.className='empty-state';p.textContent='No se pudo cargar un catálogo activo desde la API.';target.append(p);return;}
  for(const c of sorted){
    const b=document.createElement('button');b.type='button';b.className='command-button';
    if(LABELS[c.nombre]?.group==='extra')b.classList.add('is-extra');
    b.dataset.commandId=String(c.id_comando);
    const icon=document.createElement('span');icon.className='cmd-icon';icon.setAttribute('aria-hidden','true');icon.textContent=LABELS[c.nombre]?.icon||'◇';
    const label=document.createElement('span');label.textContent=LABELS[c.nombre]?.label||c.nombre.replaceAll('_',' ');
    const status=document.createElement('small');status.className='cmd-status';status.hidden=true;
    const copy=document.createElement('span');copy.className='cmd-copy';copy.append(label,status);
    b.append(icon,copy);b.title=`${c.nombre} · código ${c.codigo}`;
    b.addEventListener('click',()=>onClick(c));target.append(b);
  }
}
export function lockCommands(locked){
  for(const b of document.querySelectorAll('[data-command-id]'))b.disabled=locked;
}
export function markCommandState(last,phase,pending){
  const labels={sending:'Enviando…',accepted:'Aceptado por API',received:'Evento WSS recibido',error:'Sin confirmación'};
  for(const button of document.querySelectorAll('[data-command-id]')){
    const current=String(last?.id_comando)===button.dataset.commandId;
    const queued=String(pending?.id_comando)===button.dataset.commandId;
    const value=queued?'queued':current?phase:'idle';
    button.dataset.operationPhase=value;
    button.setAttribute('aria-busy',String(value==='sending'));
    button.classList.toggle('is-busy',value==='sending'||queued);
    const status=button.querySelector('.cmd-status');
    status.textContent=queued?'Pendiente':labels[value]||'';
    status.hidden=!status.textContent;
  }
}
export function renderDemos(demos,{verified=true}={}){
  const s=$('#demoSelect');s.replaceChildren();
  const def=document.createElement('option');def.value='';def.textContent=demos.length?'Elige una DEMO':verified?'Sin DEMO disponibles':'Catálogo DEMO sin verificar';s.append(def);
  for(const d of demos){const opt=document.createElement('option');opt.value=String(d.id_demo);opt.textContent=d.nombre;s.append(opt);}
}
export function renderDemoSteps(steps=[]){
  const target=$('#demoSteps');target.replaceChildren();
  $('#demoCount').textContent=steps.length?`${steps.length} MOVIMIENTOS`:'— MOVIMIENTOS';
  const ms=steps.reduce((s,x)=>s+Math.max(0,Number(x.duracion_ms)||0)+Math.max(0,Number(x.pausa_ms)||0),0);
  $('#demoDuration').textContent=steps.length?`${(ms/1000).toFixed(1)} s aprox.`:'Duración pendiente';
  if(!steps.length){const p=document.createElement('p');p.className='empty-state';p.textContent='Selecciona una secuencia para consultar sus pasos reales.';target.append(p);return;}
  for(const step of [...steps].sort((a,b)=>a.orden-b.orden)){
    const line=document.createElement('div');line.className='demo-step';line.dataset.step=String(step.orden);
    const left=document.createElement('span');const index=document.createElement('b');index.textContent=String(step.orden).padStart(2,'0');
    left.append(index,document.createTextNode(step.comando||'Movimiento'));
    const right=document.createElement('small');right.textContent=`${step.duracion_ms}ms / +${step.pausa_ms}ms`;
    line.append(left,right);target.append(line);
  }
}
export function markDemoStep(n){
  for(const row of document.querySelectorAll('.demo-step'))row.classList.toggle('is-current',Number(row.dataset.step)===Number(n));
}
export function setDemoButtons({canStart=false,canCancel=false,selectionDisabled=false}={}){
  $('#startDemoButton').disabled=!canStart;
  $('#cancelDemoButton').disabled=!canCancel;
  $('#demoSelect').disabled=selectionDisabled;
}
export function displayMovement(label){$('#movementDisplay').textContent=label||'NEUTRAL';}
export function displayVehicle(name){$('#unitName').textContent=name;}
export function showAuth(){const d=$('#authDialog');if(!d.open)d.showModal();$('#keyInput').focus();}

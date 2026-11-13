import test from 'node:test';
import assert from 'node:assert/strict';
import {initJoystick} from '../js/joystick.js';

const event=(type,props={})=>Object.assign(new Event(type,{cancelable:true}),props);
class Element extends EventTarget {
  style={}; capture=null; classes=new Set();
  classList={
    remove:name=>this.classes.delete(name),
    toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name),
  };
  focus(){}
  getBoundingClientRect(){return {left:0,top:0,width:200,height:200};}
  setPointerCapture(id){this.capture=id;}
  hasPointerCapture(id){return this.capture===id;}
  releasePointerCapture(id){
    if(this.capture!==id)return;
    this.capture=null;
    this.dispatchEvent(event('lostpointercapture',{pointerId:id}));
  }
}
function setup(t,{onDirection}={}){
  const oldDocument=globalThis.document,oldWindow=globalThis.window;
  const el=new Element(),knob=new Element(),win=new EventTarget(),doc=new EventTarget();
  doc.hidden=false;doc.querySelector=s=>s==='#joystick'?el:knob;
  globalThis.document=doc;globalThis.window=win;
  t.after(()=>{globalThis.document=oldDocument;globalThis.window=oldWindow;});
  const directions=[];let releases=0,enabled=true;
  const joystick=initJoystick(d=>{directions.push(d);return onDirection?.(d);},()=>releases++,{isEnabled:()=>enabled});
  const pointer=(type,x=100,y=100,props={})=>el.dispatchEvent(event(type,{pointerId:1,pointerType:'mouse',button:0,buttons:1,isPrimary:true,clientX:x,clientY:y,...props}));
  const key=(type,key,props={})=>el.dispatchEvent(event(type,{key,repeat:false,...props}));
  return {el,knob,doc,win,joystick,directions,pointer,key,get releases(){return releases;},setEnabled:v=>enabled=v};
}

test('envía por cambio, resiste vibración en diagonal y termina una sola vez',t=>{
  const h=setup(t);
  h.pointer('pointerdown',150,100);
  for(let i=0;i<30;i++)h.pointer('pointermove',151+i%2,100);
  h.pointer('pointermove',150,151); // Sólo un píxel de diferencia de eje.
  h.pointer('pointermove',150,155);
  assert.deepEqual(h.directions,['right']);
  h.pointer('pointermove',130,165);
  assert.deepEqual(h.directions,['right','down']);
  h.pointer('pointerup');
  assert.equal(h.releases,1);
  assert.equal(h.el.capture,null);
  assert.equal(h.knob.style.transform,'translate(0px, 0px)');
});

test('neutral tiene histéresis y no repite STOP al soltar dentro del centro',t=>{
  const h=setup(t);
  h.pointer('pointerdown',130,100);
  assert.deepEqual(h.directions,[]);
  h.pointer('pointermove',135,100);
  h.pointer('pointermove',129,100);
  assert.equal(h.releases,0);
  h.pointer('pointermove',120,100);
  h.pointer('pointerup');
  assert.deepEqual(h.directions,['right']);
  assert.equal(h.releases,1);
});

test('neutral programático es silencioso y un puntero viejo no reactiva movimiento',t=>{
  const h=setup(t);
  h.pointer('pointerdown',150,100);
  h.joystick.neutral();
  h.pointer('pointermove',100,150);
  h.pointer('pointerup');
  assert.deepEqual(h.directions,['right']);
  assert.equal(h.releases,0);
  assert.equal(h.el.capture,null);
});

for(const type of ['pointercancel','lostpointercapture'])test(`${type} libera touch y solicita detener una vez`,t=>{
  const h=setup(t);
  h.pointer('pointerdown',100,40,{pointerType:'touch'});
  h.pointer(type,100,40,{pointerType:'touch'});
  h.pointer('pointerup');
  assert.deepEqual(h.directions,['up']);assert.equal(h.releases,1);assert.equal(h.el.capture,null);
});

test('ignora clic derecho, otro dedo y segunda fuente de entrada simultánea',t=>{
  const h=setup(t);
  h.pointer('pointerdown',150,100,{button:2});
  h.pointer('pointerdown',150,100,{isPrimary:false,pointerId:2,pointerType:'touch'});
  assert.deepEqual(h.directions,[]);
  h.pointer('pointerdown',150,100);
  h.pointer('pointermove',100,150,{pointerId:2});
  h.key('keydown','ArrowDown');
  assert.deepEqual(h.directions,['right']);
  h.pointer('pointerup');
  h.key('keydown','ArrowUp');
  h.pointer('pointerdown',150,100);
  assert.deepEqual(h.directions,['right','up']);
});

test('teclado ignora repetición y soltar la flecha anterior no termina la actual',t=>{
  const h=setup(t);
  h.key('keydown','ArrowUp');
  h.key('keydown','ArrowUp',{repeat:true});
  h.key('keydown','ArrowRight');
  h.key('keyup','ArrowUp');
  assert.equal(h.releases,0);
  h.key('keyup','ArrowRight');
  assert.equal(h.releases,1);
  h.key('keydown','ArrowUp',{repeat:true});
  assert.deepEqual(h.directions,['up','right']);
});

for(const kind of ['element-blur','window-blur','hidden','Escape',' '])test(`abandono ${kind} neutraliza teclado`,t=>{
  const h=setup(t);
  h.key('keydown','ArrowUp');
  if(kind==='element-blur')h.el.dispatchEvent(event('blur'));
  else if(kind==='window-blur')h.win.dispatchEvent(event('blur'));
  else if(kind==='hidden'){h.doc.hidden=true;h.doc.dispatchEvent(event('visibilitychange'));}
  else h.key('keydown',kind);
  h.key('keyup','ArrowUp');
  assert.equal(h.releases,1);assert.equal(h.knob.style.transform,'translate(0px, 0px)');
});

test('botón de mouse perdido termina gesto y bloqueo impide nueva entrada',t=>{
  const h=setup(t);
  h.pointer('pointerdown',150,100);
  h.pointer('pointermove',100,150,{buttons:0});
  assert.equal(h.releases,1);
  h.setEnabled(false);
  h.pointer('pointerdown',100,150);
  h.key('keydown','ArrowDown');
  assert.deepEqual(h.directions,['right']);
});

test('rechazo de dirección centra sin emitir STOP ni permitir reactivación',t=>{
  const h=setup(t,{onDirection:()=>false});
  h.pointer('pointerdown',150,100);
  h.pointer('pointermove',100,150);
  assert.deepEqual(h.directions,['right']);assert.equal(h.releases,0);assert.equal(h.el.capture,null);
});

test('el joystick compacto limita el recorrido y conserva neutral y STOP',t=>{
  const h=setup(t);
  h.el.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100});
  h.pointer('pointerdown',62,50,{pointerType:'touch'});
  assert.deepEqual(h.directions,[]);
  h.pointer('pointermove',95,50,{pointerType:'touch'});
  assert.deepEqual(h.directions,['right']);
  assert.equal(h.knob.style.transform,'translate(24px, 0px)');
  h.pointer('pointermove',58,50,{pointerType:'touch'});
  h.pointer('pointerup',58,50,{pointerType:'touch'});
  assert.equal(h.releases,1);
  h.key('keydown','ArrowLeft');
  assert.equal(h.knob.style.transform,'translate(-24px, 0px)');
  h.key('keyup','ArrowLeft');
  assert.equal(h.releases,2);
});

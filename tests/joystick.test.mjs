import test from 'node:test';
import assert from 'node:assert/strict';
import {initJoystick} from '../js/joystick.js';

const event=(type,props={})=>Object.assign(new Event(type,{cancelable:true}),props);
class Element extends EventTarget {
  style={}; dataset={}; capture=null; classes=new Set();
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
function setup(t,{onDirection,onPreview,canContinueChord,chordDelay=0,initialEnabled=true,alwaysPreview=false}={}){
  const oldDocument=globalThis.document,oldWindow=globalThis.window;
  const el=new Element(),knob=new Element(),win=new EventTarget(),doc=new EventTarget();
  win.innerWidth=360;win.innerHeight=640;
  doc.hidden=false;doc.querySelector=s=>s==='#joystick'?el:knob;
  globalThis.document=doc;globalThis.window=win;
  t.after(()=>{globalThis.document=oldDocument;globalThis.window=oldWindow;});
  const directions=[], releases=[], previews=[];
  let enabled=initialEnabled;
  const joystick=initJoystick(d=>{directions.push(d);return onDirection?.(d);},meta=>releases.push(meta),{
    chordDelay,canContinueChord,isEnabled:()=>enabled,isPreviewEnabled:()=>alwaysPreview||enabled,
    onPreview:(direction,meta)=>{previews.push({direction,...meta});onPreview?.(direction);},
  });
  t.after(()=>joystick.destroy());
  const pointer=(type,x=100,y=100,props={})=>el.dispatchEvent(event(type,{
    pointerId:1,pointerType:'mouse',button:0,buttons:1,isPrimary:true,clientX:x,clientY:y,...props,
  }));
  const key=(type,key,props={})=>el.dispatchEvent(event(type,{key,repeat:false,...props}));
  return {el,knob,doc,win,joystick,directions,pointer,key,previews,releaseEvents:releases,
    get releases(){return releases.length;},setEnabled:v=>enabled=v};
}

test('emite sólo cambios entre cardinales y diagonales y termina una sola vez',t=>{
  const h=setup(t);
  h.pointer('pointerdown',150,100);
  for(let i=0;i<30;i++)h.pointer('pointermove',151+i%2,100);
  h.pointer('pointermove',150,122); // Dentro de la histéresis de derecha.
  assert.deepEqual(h.directions,['right']);
  h.pointer('pointermove',150,150);
  h.pointer('pointermove',135,173); // Dentro de la histéresis de la diagonal.
  assert.deepEqual(h.directions,['right','down-right']);
  h.pointer('pointermove',105,165);
  assert.deepEqual(h.directions,['right','down-right','down']);
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

test('teclado combina dos flechas, ignora repetición y sólo previsualiza liberación parcial',t=>{
  const h=setup(t);
  h.key('keydown','ArrowUp');
  h.key('keydown','ArrowUp',{repeat:true});
  h.key('keydown','ArrowRight');
  h.key('keyup','ArrowUp');
  assert.equal(h.releases,0);
  h.key('keyup','ArrowRight');
  assert.equal(h.releases,1);
  h.key('keydown','ArrowUp',{repeat:true});
  assert.deepEqual(h.directions,['up','up-right']);
  assert.deepEqual(h.previews.map(({direction})=>direction),['up','up-right','right',null]);
  assert.equal(h.previews[2].previewOnly,true);
});

for(const kind of ['element-blur','window-blur','pagehide','hidden','Escape',' '])test(`abandono ${kind} neutraliza teclado`,t=>{
  const h=setup(t);
  h.key('keydown','ArrowUp');
  if(kind==='element-blur')h.el.dispatchEvent(event('blur'));
  else if(kind==='window-blur')h.win.dispatchEvent(event('blur'));
  else if(kind==='pagehide')h.win.dispatchEvent(event('pagehide'));
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

test('dos flechas próximas no despachan la cardinal previa ni la restante al liberar',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=setup(t,{chordDelay:65});
  h.key('keydown','ArrowUp');
  assert.equal(h.el.dataset.direction,'up');
  assert.deepEqual(h.directions,[]);
  t.mock.timers.tick(40);
  h.key('keydown','ArrowLeft');
  t.mock.timers.tick(100);
  assert.deepEqual(h.directions,['up-left']);
  h.key('keyup','ArrowUp');
  assert.equal(h.joystick.direction,'left');
  t.mock.timers.tick(100);
  assert.deepEqual(h.directions,['up-left']);
  h.key('keyup','ArrowLeft');
  assert.equal(h.joystick.direction,null);
});

test('liberar un eje de la diagonal continua actualiza la cardinal restante inmediatamente',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=setup(t,{chordDelay:65,canContinueChord:()=>true});
  h.key('keydown','ArrowUp');
  h.key('keydown','ArrowRight');
  assert.deepEqual(h.directions,['up-right']);
  h.key('keyup','ArrowUp');
  assert.deepEqual(h.directions,['up-right','right']);
  assert.equal(h.previews.at(-1).previewOnly,false);
  h.key('keyup','ArrowRight');
  t.mock.timers.tick(100);
  assert.equal(h.joystick.direction,null);
  assert.equal(h.releases,1);
  assert.deepEqual(h.directions,['up-right','right']);
});

test('revocar la diagonal continua conserva sólo el indicador al soltar parte del acorde',t=>{
  let canContinue=true;
  const h=setup(t,{canContinueChord:()=>canContinue});
  h.key('keydown','ArrowUp');
  h.key('keydown','ArrowRight');
  canContinue=false;
  h.key('keyup','ArrowUp');
  assert.equal(h.joystick.direction,'right');
  assert.equal(h.previews.at(-1).previewOnly,true);
  assert.deepEqual(h.directions,['up','up-right']);
});

test('al mantener una sola flecha sale una cardinal, y cancelar antes no envía nada',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=setup(t,{chordDelay:65});
  h.key('keydown','ArrowDown');h.key('keyup','ArrowDown');
  t.mock.timers.tick(65);
  assert.deepEqual(h.directions,[]);
  h.key('keydown','ArrowRight');
  t.mock.timers.tick(65);
  assert.deepEqual(h.directions,['right']);
  h.key('keydown','Escape');
  assert.equal(h.joystick.direction,null);
});

test('flechas opuestas neutralizan y su liberación parcial no reactiva una cardinal',t=>{
  const h=setup(t);
  h.key('keydown','ArrowUp');
  h.key('keydown','ArrowDown');
  assert.equal(h.el.dataset.direction,'neutral');
  assert.deepEqual(h.releaseEvents,[{source:'keyboard',held:true,reason:'conflict'}]);
  h.key('keydown','ArrowRight');
  assert.equal(h.joystick.direction,null);
  h.key('keyup','ArrowRight');
  h.key('keyup','ArrowDown');
  assert.equal(h.el.dataset.direction,'up');
  assert.deepEqual(h.directions,['up']);
  h.key('keyup','ArrowUp');
  assert.equal(h.joystick.direction,null);
});

test('estado visual funciona con acceso cerrado y sólo despacha diagonales al callback',t=>{
  const h=setup(t,{initialEnabled:false,alwaysPreview:true});
  h.pointer('pointerdown',100,47,{pointerType:'touch'});
  assert.equal(h.el.dataset.direction,'up');
  assert.equal(h.previews.at(-1).previewOnly,true);
  h.pointer('pointermove',150,50,{pointerType:'touch'});
  assert.equal(h.el.dataset.direction,'up-right');
  assert.deepEqual(h.directions,['up-right']);
  h.pointer('pointerup',150,50,{pointerType:'touch'});
  assert.equal(h.el.dataset.direction,'neutral');
});

test('un dedo recorre los sectores del joystick; otro dedo no roba la captura',t=>{
  const h=setup(t);
  const first={pointerType:'touch'};
  const second={pointerType:'touch',pointerId:2,isPrimary:false};
  h.pointer('pointerdown',100,50,first);
  h.pointer('pointerdown',55,145,second);
  h.pointer('pointermove',45,145,second);
  h.pointer('pointerup',45,145,second);
  assert.equal(h.el.capture,1);
  assert.deepEqual(h.directions,['up']);
  h.pointer('pointermove',150,50,first);
  h.pointer('pointermove',150,100,first);
  assert.deepEqual(h.directions,['up','up-right','right']);
  h.pointer('pointerup',150,100,first);
  assert.equal(h.joystick.direction,null);
  assert.equal(h.releases,1);
});

test('cambiar de orientación invalida la captura y una nueva pulsación usa las medidas nuevas',t=>{
  const h=setup(t);
  h.pointer('pointerdown',100,45,{pointerType:'touch'});
  h.win.innerHeight=610;
  h.win.dispatchEvent(event('resize'));
  assert.equal(h.el.capture,1,'un cambio de altura en vertical conserva el gesto');
  [h.win.innerWidth,h.win.innerHeight]=[610,360];
  h.win.dispatchEvent(event('resize'));
  h.win.dispatchEvent(event('orientationchange'));
  assert.deepEqual(h.releaseEvents,[{source:'pointer',held:false,reason:'orientation'}]);
  assert.equal(h.el.capture,null);
  assert.equal(h.el.dataset.direction,'neutral');
  h.pointer('pointermove',190,100,{pointerType:'touch'});
  assert.deepEqual(h.directions,['up']);
  h.el.getBoundingClientRect=()=>({left:20,top:10,width:100,height:100});
  h.pointer('pointerdown',91,81,{pointerType:'touch'});
  assert.deepEqual(h.directions,['up','down-right']);
});

test('orientación cancela una tecla durante el margen del acorde',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=setup(t,{chordDelay:65});
  h.key('keydown','ArrowRight');
  h.win.dispatchEvent(event('orientationchange'));
  t.mock.timers.tick(65);
  h.key('keyup','ArrowRight');
  assert.equal(h.joystick.direction,null);
  assert.deepEqual(h.directions,[]);
  assert.deepEqual(h.releaseEvents,[{source:'keyboard',held:false,reason:'orientation'}]);
});

test('si la aplicación neutraliza al previsualizar, no sale una orden tardía',t=>{
  const h=setup(t,{onPreview:direction=>{if(direction)h.joystick.neutral();}});
  h.pointer('pointerdown',150,100);
  assert.equal(h.joystick.direction,null);
  assert.deepEqual(h.directions,[]);
});

test('destrucción libera captura, cancela tiempo y elimina listeners',t=>{
  const h=setup(t);
  h.pointer('pointerdown',50,150);
  h.joystick.destroy();
  assert.equal(h.el.capture,null);
  assert.equal(h.el.dataset.direction,'neutral');
  h.key('keydown','ArrowUp');
  h.pointer('pointerdown',150,100);
  assert.deepEqual(h.directions,['down-left']);
  assert.equal(h.releases,0);
});

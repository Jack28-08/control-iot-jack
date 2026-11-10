import {directionForVector, KEY_DIRECTIONS} from './catalog.js';
export function initJoystick(onDirection,onRelease,{isEnabled=()=>true}={}){
  const el=document.querySelector('#joystick');
  const knob=document.querySelector('#joystickStick');
  let pointer=null, direction=null, key=null;
  const heldKeys=new Set();
  const moveVisual=(x,y)=>{knob.style.transform=`translate(${x}px, ${y}px)`;};
  const neutral=({notify=false}={})=>{
    const moved=direction!==null;
    const captured=pointer;
    // Invalidar antes de liberar evita una segunda liberación por lostpointercapture.
    pointer=null;direction=null;key=null;heldKeys.clear();
    if(captured!==null&&el.hasPointerCapture(captured))el.releasePointerCapture(captured);
    moveVisual(0,0);el.classList.remove('is-active');
    if(moved&&notify)onRelease();
  };
  const apply=(next)=>{
    if(next===direction)return;
    direction=next;
    el.classList.toggle('is-active',Boolean(next));
    if(next){if(onDirection(next)===false)neutral();}
    else onRelease();
  };
  const update=(ev)=>{
    const bounds=el.getBoundingClientRect(),cX=bounds.left+bounds.width/2,cY=bounds.top+bounds.height/2;
    const dx=ev.clientX-cX,dy=ev.clientY-cY;
    const max=46, length=Math.hypot(dx,dy), scale=length>max?max/length:1;
    const x=dx*scale,y=dy*scale;
    moveVisual(x,y);
    // Histéresis: evita alternancias por unos píxeles en neutral o diagonales.
    let next=directionForVector(dx,dy,direction?25:33);
    if(direction&&next&&next!==direction){
      const horizontal=direction==='left'||direction==='right';
      const nextHorizontal=next==='left'||next==='right';
      if(horizontal!==nextHorizontal&&Math.abs(Math.abs(dx)-Math.abs(dy))<12)next=direction;
    }
    apply(next);
  };
  el.addEventListener('pointerdown',ev=>{
    if(ev.button!==0||ev.isPrimary===false||pointer!==null||key!==null||!isEnabled())return;
    el.focus({preventScroll:true});
    pointer=ev.pointerId;
    try{el.setPointerCapture(pointer);}catch{neutral();return;}
    update(ev);ev.preventDefault();
  });
  el.addEventListener('pointermove',ev=>{
    if(pointer!==ev.pointerId)return;
    if(!isEnabled()){neutral();return;}
    // Algunos navegadores pueden perder pointerup al cambiar de ventana.
    if(ev.pointerType==='mouse'&&(ev.buttons&1)===0){neutral({notify:true});return;}
    update(ev);
  });
  const finish=ev=>{if(pointer!==ev.pointerId)return;neutral({notify:true});};
  el.addEventListener('pointerup',finish);
  el.addEventListener('pointercancel',finish);
  el.addEventListener('lostpointercapture',finish);
  el.addEventListener('keydown',ev=>{
    const d=KEY_DIRECTIONS[ev.key];
    if(d){
      ev.preventDefault();
      if(!isEnabled()){neutral();return;}
      if(pointer!==null||ev.repeat||heldKeys.has(ev.key))return;
      heldKeys.add(ev.key);key=ev.key;
      const vectors={up:[0,-46],down:[0,46],left:[-46,0],right:[46,0]};
      moveVisual(...vectors[d]);apply(d);
    }
    if(ev.key==='Escape'||ev.key===' '){ev.preventDefault();neutral({notify:true});}
  });
  el.addEventListener('keyup',ev=>{heldKeys.delete(ev.key);if(ev.key===key)neutral({notify:true});});
  el.addEventListener('blur',()=>neutral({notify:true}));
  window.addEventListener('blur',()=>neutral({notify:true}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)neutral({notify:true});});
  return {neutral};
}

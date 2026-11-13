// Una pestaña activa, con foco itinerante y navegación de teclado accesible.
export function initNavigation(onViewChange){
  const tabs=['Control','Monitor'].map(name=>document.querySelector(`#show${name}`));
  const panels=['control','monitor'].map(name=>document.querySelector(`#${name}View`));
  let current=0;
  function select(index,{focus=false,notify=true}={}){
    const previous=current;current=index;
    tabs.forEach((tab,i)=>{tab.tabIndex=i===index?0:-1;tab.setAttribute('aria-selected',String(i===index));});
    panels.forEach((panel,i)=>{panel.hidden=i!==index;});
    if(focus)tabs[index].focus({preventScroll:true});
    if(notify&&previous!==index)onViewChange(index===0?'control':'monitor');
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>select(index));
    tab.addEventListener('keydown',event=>{
      const next={ArrowLeft:(index+tabs.length-1)%tabs.length,ArrowRight:(index+1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
      if(next!==undefined){event.preventDefault();select(next,{focus:true});}
    });
  });
  select(0,{notify:false});
  return {get view(){return current===0?'control':'monitor';}};
}

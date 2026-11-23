// Una pestaña activa, con foco itinerante y navegación de teclado accesible.
export function initNavigation(onViewChange){
  const views=['control','monitor','demo','platform'];
  const tabs=Array.from(document.querySelectorAll('.view-tabs [role="tab"]'));
  const panels=tabs.map(tab=>document.getElementById(tab.getAttribute('aria-controls')));
  let current=0;
  const visible=()=>tabs.map((tab,i)=>tab.hidden?-1:i).filter(i=>i>=0);
  function select(index,{focus=false,notify=true}={}){
    const previous=current;current=index;
    tabs.forEach((tab,i)=>{tab.tabIndex=i===index?0:-1;tab.setAttribute('aria-selected',String(i===index));});
    panels.forEach((panel,i)=>{panel.hidden=i!==index;});
    if(focus)tabs[index].focus({preventScroll:true});
    if(notify&&previous!==index)onViewChange(views[index]);
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>select(index));
    tab.addEventListener('keydown',event=>{
      const enabled=visible(),position=enabled.indexOf(index);
      const next={ArrowLeft:enabled[(position+enabled.length-1)%enabled.length],ArrowRight:enabled[(position+1)%enabled.length],
        Home:enabled[0],End:enabled.at(-1)}[event.key];
      if(next!==undefined){event.preventDefault();select(next,{focus:true});}
    });
  });
  select(0,{notify:false});
  return {get view(){return views[current];},
    show(view,{focus=false}={}){
      const index=views.indexOf(view);
      if(index>=0&&!tabs[index]?.hidden)select(index,{focus});
    },
    available(viewsAllowed){
      tabs.forEach((tab,index)=>{tab.hidden=!viewsAllowed.includes(views[index]);});
      const enabled=visible();
      tabs[0].parentElement.style.setProperty('--tab-count',enabled.length);
      if(enabled.length&&tabs[current].hidden)select(enabled[0]);
    },
  };
}

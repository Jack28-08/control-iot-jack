const ROOT='/plataforma';
const ADMIN='administrador',BUYER='comprador',GUEST='invitado';
const labels={
  dashboard:'Resumen',modelos:'Modelos',unidades:'Unidades',clientes:'Clientes',
  demos:'DEMOS de fábrica',reservas:'Reservas',auditoria:'Auditoría',perfil:'Perfil',
};
const metricLabels={
  modelos_activos:'Modelos activos',unidades_activas:'Unidades activas',
  unidades_inventario:'Inventario',unidades_vendidas:'Unidades asignadas',
  unidades_exhibicion:'Exhibición',clientes_activos:'Clientes activos',
  demos_activas:'DEMOS activas',reservas_activas:'Reservas activas',
};
const commandNames={
  1:'Girar a la izquierda',2:'Avanzar',3:'Velocidad',4:'Subir grúa',5:'Retroceder',
  6:'Demo del control',7:'Bajar grúa',8:'Girar a la derecha',
  9:'Avanzar a la izquierda',10:'Avanzar a la derecha',
  11:'Retroceder a la izquierda',12:'Retroceder a la derecha',
};
const showStatus=value=>({inventario:'Inventario',exhibicion:'Exhibición',vendida:'Asignada',inactiva:'Inactiva'}[value]??value);
const dateLabel=value=>{
  if(!value)return '—';
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toLocaleString('es-MX'):'—';
};
const array=value=>Array.isArray(value)?value:[];
const integer=value=>Number.isSafeInteger(value)&&value>0;
let nextFieldId=0;

function element(tag,text,classes){
  const result=document.createElement(tag);
  if(text!==undefined&&text!==null)result.textContent=String(text);
  if(classes)result.className=classes;
  return result;
}
function block(title,...children){
  const container=element('section',null,'panel platform-card');
  container.append(element('h3',title),...children);
  return container;
}
function button(label,activate,classes='btn-ghost'){
  const result=element('button',label,classes);
  result.type='button';result.addEventListener('click',activate);return result;
}
const opt=(value,label)=>({value:String(value),label});
const options=(rows,property='nombre')=>rows.map(row=>opt(row.id,row[property]??row.id));

function field(spec,value){
  const [name,label,type='text',config={}]=spec;
  const box=element('label',null,type==='checkbox'?'platform-check':'platform-field');
  const caption=element('span',label);
  const input=element(type==='select'?'select':type==='textarea'?'textarea':'input');
  caption.id=`platform-field-${++nextFieldId}`;
  input.setAttribute('aria-labelledby',caption.id);
  if(input.tagName==='INPUT')input.type=type;
  input.name=name;
  if(type==='select'){
    if(config.optional||!value)input.append(new Option(config.placeholder??'Seleccionar',''));
    for(const item of config.options??[])input.append(new Option(item.label,item.value));
  }
  if(type==='checkbox'){
    input.checked=Boolean(value);box.append(input,caption);
  }else{
    input.value=value??'';input.required=!config.optional;
    if(config.min!==undefined)input.min=config.min;
    if(config.max!==undefined)input.max=config.max;
    if(config.maxLength!==undefined)input.maxLength=config.maxLength;
    if(config.pattern)input.pattern=config.pattern;
    if(config.minLength!==undefined)input.minLength=config.minLength;
    if(config.autocomplete)input.autocomplete=config.autocomplete;
    box.append(caption,input);
  }
  return {box,input};
}
function readFields(controls){
  return Object.fromEntries(controls.map(({input,numeric})=>{
    const value=input.type==='checkbox'?input.checked:input.type==='password'?input.value:input.value.trim();
    return [input.name,numeric?(value===''?null:Number(value)):value];
  }));
}
function formFields(specs,initial){
  const grid=element('div',null,'platform-grid'), controls=[];
  for(const spec of specs){
    const result=field(spec,initial?.[spec[0]]);
    controls.push({...result,numeric:spec[2]==='number'||spec[3]?.numeric===true});
    grid.append(result.box);
  }
  return {grid,controls,read:()=>readFields(controls)};
}
function searchTable(headers,rows,rowValues,action){
  const wrap=element('div',null,'platform-table-wrap'),table=element('table',null,'platform-table');
  const head=table.createTHead().insertRow(),body=table.createTBody();
  for(const name of headers){const th=element('th',name);th.scope='col';head.append(th);}
  if(action){const th=element('th','Acciones');th.scope='col';head.append(th);}
  const search=field(['buscar','Buscar','search',{optional:true}]);
  const empty=element('p',null,'platform-meta');
  search.input.addEventListener('input',paint);
  function paint(){
    const term=search.input.value.trim().toLocaleLowerCase('es-MX');
    body.replaceChildren();
    for(const row of rows){
      const values=rowValues(row);
      if(term&&!values.join(' ').toLocaleLowerCase('es-MX').includes(term))continue;
      const rendered=body.insertRow();
      for(const value of values)rendered.insertCell().textContent=value??'—';
      if(action){const op=action(row);if(op)rendered.insertCell().append(op);else rendered.insertCell();}
    }
    table.hidden=!body.rows.length;empty.hidden=!table.hidden;
    empty.textContent=rows.length?'No hay resultados para la búsqueda.':'Sin registros.';
  }
  wrap.append(table);
  const root=element('div',null,'platform-items');
  root.append(search.box,wrap,empty);paint();return root;
}

export class Platform43 {
  #api;#nav;#scope;#root;#reloadCatalog;
  #profile=null;
  #unit=null;
  #sessionTimer=null;
  #expiry=0;
  #revision=0;
  #guestSeconds=null;
  #ending=false;
  #claiming=false;
  #status=null;
  #content=null;

  constructor(api,navigation,selectVehicle,reloadCatalog){
    this.#api=api;this.#nav=navigation;this.#scope=selectVehicle;
    this.#reloadCatalog=reloadCatalog;
    this.#root=document.querySelector('#platformRoot');
  }
  #request(path,{method='GET',body=null,publicAccess=false}={}){
    return this.#api.request(ROOT+path,{method,body,authorized:!publicAccess});
  }
  #tab(label,views=['platform']){
    const tab=document.querySelector('#showPlatform span');
    tab.textContent=label;
    this.#nav.available(views);
  }
  #layout(title,description,actions=[]){
    const shell=element('div',null,'platform-shell');
    const header=element('header',null,'panel platform-card');
    const heading=element('div',null,'platform-heading'),lead=element('div');
    lead.append(element('h2',title));
    if(description)lead.append(element('p',description,'platform-lead'));
    heading.append(lead);
    if(actions.length){const group=element('div',null,'platform-tools');group.append(...actions);heading.append(group);}
    header.append(heading);
    this.#status=element('p',null,'platform-status');
    this.#status.setAttribute('role','status');this.#status.hidden=true;
    header.append(this.#status);
    shell.append(header);
    this.#content=element('div',null,'platform-items');shell.append(this.#content);
    this.#root.replaceChildren(shell);
    return this.#content;
  }
  #alert(message,error=false){
    this.#status.textContent=message;
    this.#status.hidden=!message;
    this.#status.dataset.level=error?'error':'normal';
  }
  #error(error){
    this.#alert(error?.message||'No se completó la operación.',true);
  }
  start(){
    if(this.#profile)return;
    this.#tab('Plataforma');
    const content=this.#layout('Plataforma NODE/01','Accede a tus unidades o consulta el catálogo de exhibición.');
    this.#nav.show('platform');
    content.append(this.#login(),this.#catalog());
  }
  unavailable(){
    this.#tab('Plataforma');
    this.#layout('Acceso sin verificar','Comprueba la conexión y pulsa Reintentar conexión.');
    this.#nav.show('platform');
  }
  #login(){
    const fields=formFields([
      ['usuario','Correo','email',{autocomplete:'username',maxLength:254}],
      ['contrasena','Contraseña','password',{autocomplete:'current-password',maxLength:128}],
    ]);
    return block('Iniciar sesión',this.#form(fields.grid,'Entrar',async()=>{
      if(this.#claiming||this.#profile)return;
      this.#claiming=true;
      try{
        const result=await this.#request('/auth/login',{method:'POST',body:fields.read(),publicAccess:true});
        const profile=result?.perfil;
        if(![ADMIN,BUYER].includes(profile?.rol))throw Error('El servidor no devolvió un perfil válido.');
        this.#startSession(result.token,result.expira_en,profile);
      }finally{
        fields.controls[1].input.value='';
        this.#claiming=false;
      }
    }));
  }
  #form(fields,label,submit,cancel){
    const form=element('form',null,'platform-form'),tools=element('div',null,'platform-tools');
    const save=element('button',label,'action-primary');save.type='submit';
    tools.append(save);
    if(cancel)tools.append(button('Cancelar',cancel));
    form.append(fields,tools);
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(save.disabled||!form.reportValidity())return;
      save.disabled=true;form.setAttribute('aria-busy','true');
      this.#alert('Guardando…');
      try{await submit();}
      catch(error){this.#error(error);}
      finally{save.disabled=false;form.removeAttribute('aria-busy');}
    });
    return form;
  }
  #startSession(token,expiresAt,profile){
    const expires=new Date(expiresAt).getTime();
    if(typeof token!=='string'||token.length<20||!Number.isFinite(expires)||expires<=Date.now())
      throw Error('El servidor no devolvió un acceso vigente.');
    this.#profile=profile;this.#expiry=expires;
    this.#api.setPlatformSession(token,expires,profile.rol!==ADMIN);
    clearInterval(this.#sessionTimer);
    this.#sessionTimer=setInterval(()=>this.#tick(),500);
    if(profile.rol===ADMIN){this.#tab('Administración');void this.#admin('dashboard');}
    else if(profile.rol===BUYER){this.#tab('Mi cuenta');void this.#buyer();}
  }
  #tick(){
    const remaining=Math.max(0,Math.ceil((this.#expiry-Date.now())/1000));
    if(this.#guestSeconds)this.#guestSeconds.textContent=`Tiempo restante · ${remaining} s`;
    if(!remaining)void this.#end(false);
  }
  sessionEnded(){
    if(this.#profile&&!this.#ending)void this.#end(false);
  }
  async #end(request=true){
    if(this.#ending)return;
    this.#ending=true;const role=this.#profile?.rol;
    clearInterval(this.#sessionTimer);this.#guestSeconds=null;this.#revision++;
    try{
      await this.#scope(null);
      if(request&&this.#api.signedIn){
        await this.#request(role===GUEST?'/reservas/actual':'/auth/logout',
          {method:role===GUEST?'DELETE':'POST'});
      }
    }catch(error){this.#error(error);}
    finally{
      this.#profile=null;this.#unit=null;this.#api.setPlatformSession(null,0);
      this.#ending=false;this.start();
    }
  }
  #signedActions(){
    return [button('Cerrar sesión',()=>void this.#end())];
  }
  #catalog(){
    const results=element('div',null,'platform-cards');
    results.append(element('p','Cargando catálogo…','platform-meta'));
    void this.#request('/catalogo',{publicAccess:true}).then(value=>{
      results.replaceChildren();
      for(const row of array(value)){
        const card=element('article',null,'platform-item');
        const artwork=element('img',null,'platform-art');
        artwork.src='./assets/favicon.svg';artwork.alt='';
        card.append(artwork,element('h3',row.nombre),element('p',row.descripcion||'Modelo IoT','platform-meta'));
        const capacities=array(row.capacidades).filter(item=>item.invitado);
        if(capacities.length)card.append(element('p',capacities.map(c=>commandNames[c.codigo]??`Código ${c.codigo}`).join(' · '),'platform-meta'));
        const units=array(row.unidades);
        for(const unit of units){
          const reserve=button(unit.disponible?'Reservar prueba virtual':'Unidad sin disponibilidad',()=>{
            reserve.disabled=true;
            void this.#reserve(unit.id).catch(error=>this.#error(error)).finally(()=>{reserve.disabled=!unit.disponible;});
          });
          reserve.disabled=!unit.disponible;card.append(reserve);
        }
        if(!units.length)card.append(element('p','Sin unidades de exhibición.','platform-meta'));
        results.append(card);
      }
      if(!results.children.length)results.append(element('p','Sin modelos publicados.','platform-meta'));
    }).catch(error=>{results.replaceChildren(element('p',error.message,'platform-meta'));});
    return block('Prueba nuestros vehículos IoT',results);
  }
  async #reserve(id){
    if(this.#profile||this.#claiming||!integer(id))return;
    this.#claiming=true;
    let result;
    try{result=await this.#request('/reservas',{method:'POST',body:{id_unidad:id},publicAccess:true});}
    finally{this.#claiming=false;}
    const unit=result?.unidad;
    this.#startSession(result.token,result.expires_at,{rol:GUEST,nombre:'Invitado'});
    this.#unit=unit;
    const content=this.#layout('Prueba en exhibición',unit?.nombre??'Unidad virtual',[button('Finalizar prueba',()=>void this.#end())]);
    this.#guestSeconds=element('p',null,'platform-status');
    this.#guestSeconds.setAttribute('role','timer');
    content.append(block('Reserva temporal',element('p','La exhibición registra operaciones lógicas en la unidad virtual.','platform-meta'),this.#guestSeconds));
    this.#tick();
    if(integer(unit?.id_vehiculo)){
      await this.#scope(unit.id_vehiculo);
      if(this.#profile?.rol===GUEST){
        this.#tab('Mi reserva',['control','monitor','platform']);
        this.#nav.show('control',{focus:true});
      }
    }else content.append(element('p','La reserva está vigente. La unidad no tiene un canal lógico de control asociado.','platform-meta'));
  }
  async #admin(section){
    if(this.#profile?.rol!==ADMIN)return;
    const revision=++this.#revision;
    const target=this.#layout('Administración',this.#profile.nombre??'Cuenta administrativa',this.#signedActions());
    const columns=element('div',null,'platform-columns'),sections=element('nav',null,'panel platform-card platform-sections');
    sections.setAttribute('aria-label','Secciones de administración');
    const result=element('div',null,'platform-items');
    for(const [key,label] of Object.entries(labels)){
      const item=button(label,()=>void this.#admin(key));item.setAttribute('aria-pressed',String(key===section));
      sections.append(item);
    }
    columns.append(sections,result);target.append(columns);
    result.textContent='Cargando…';
    try{
      const view=await this.#adminContent(section,revision);
      if(revision===this.#revision)result.replaceChildren(view);
    }catch(error){
      if(revision===this.#revision){result.replaceChildren();this.#error(error);}
    }
  }
  async #adminContent(section,revision){
    if(section==='dashboard'){
      const data=await this.#request('/admin/dashboard');
      const list=element('dl',null,'platform-stat-grid');
      const entries=Object.entries(metricLabels).map(([key,label])=>[label,data?.[key]??'Sin datos']);
      for(const [label,id] of [['AWS','#apiStatus'],['RDS','#dbStatus'],['WSS','#wsStatus']]){
        entries.push([label,document.querySelector(id)?.textContent??'Sin verificar']);
      }
      for(const [label,value] of entries){
        const card=element('div',null,typeof value==='number'?'platform-stat':'platform-stat platform-stat-status');
        card.append(element('dt',label),element('dd',value));list.append(card);
      }
      return block('Resumen de operaciones',list,button('Actualizar',()=>void this.#admin('dashboard')));
    }
    if(section==='modelos')return this.#models();
    if(section==='unidades')return this.#units();
    if(section==='clientes')return this.#clients();
    if(section==='demos'){
      const models=array(await this.#request('/admin/modelos'));
      const result=element('div',null,'platform-items');
      const filter=field(['modelo','Modelo de fábrica','select',{options:options(models)}]);
      const inner=element('div',null,'platform-items');
      filter.input.addEventListener('change',()=>{
        const id=Number(filter.input.value);
        if(integer(id))void this.#demos(inner,'id_modelo',id,array(models.find(model=>model.id===id)?.capacidades),revision);
        else inner.replaceChildren();
      });
      result.append(filter.box,inner);
      return block('DEMOS de fábrica',result);
    }
    if(section==='reservas'){
      const data=array(await this.#request('/admin/reservas'));
      return block('Reservas de exhibición',searchTable(['Reserva','Unidad','Vencimiento','Estado'],data,
        row=>[row.id,row.unidad??row.id_unidad,dateLabel(row.expires_at),row.activa?'Activa':'Finalizada'],
        row=>row.activa?button('Revocar',()=>void this.#mutation(`/admin/reservas/${row.id}/revocar`,
          {method:'POST'},()=>this.#admin(section))):null));
    }
    if(section==='auditoria'){
      const data=array(await this.#request('/admin/auditoria'));
      return block('Auditoría',searchTable(['Fecha','Actor','Acción','Recurso','Resultado'],data,
        row=>[dateLabel(row.fecha),row.actor??row.id_actor,row.accion,
          [row.recurso,row.id_recurso].filter(value=>value!==null&&value!==undefined).join(' · '),row.resultado]));
    }
    return this.#profileForm();
  }
  async #mutation(path,options,after){
    try{await this.#request(path,options);await after();this.#alert('Operación registrada.');}
    catch(error){this.#error(error);}
  }
  async #models(){
    const rows=array(await this.#request('/admin/modelos'));
    const editor=element('div');
    const edit=row=>{
      const fields=formFields([
        ['sku','SKU','text',{maxLength:40,pattern:'[A-Za-z0-9][A-Za-z0-9._\\-]*'}],['nombre','Nombre','text',{maxLength:100}],
        ['descripcion','Descripción','textarea',{optional:true,maxLength:255}],
        ['publicado','Publicar en catálogo','checkbox'],['activo','Modelo activo','checkbox'],
      ],row??{activo:true});
      const caps=element('fieldset',null,'platform-form');caps.append(element('legend','Capacidades'));
      const current=array(row?.capacidades), boxes=[];
      const capabilities=element('div',null,'platform-grid');
      const availableCodes=new Map(Object.entries(commandNames).map(([code,name])=>[Number(code),name]));
      for(const capability of current){
        if(!availableCodes.has(capability.codigo))availableCodes.set(capability.codigo,`Código ${capability.codigo}`);
      }
      for(const [code,name] of availableCodes){
        const selected=current.find(c=>c.codigo===code);
        const card=element('div',null,'platform-item');card.append(element('strong',name));
        const control=field(['control','Control de comprador','checkbox'],selected?.control);
        const guest=field(['invitado','Prueba de invitado','checkbox'],selected?.invitado);
        card.append(control.box,guest.box);capabilities.append(card);
        boxes.push({codigo:code,control:control.input,guest:guest.input});
      }
      caps.append(capabilities);
      const content=element('div',null,'platform-form');content.append(fields.grid,caps);
      editor.replaceChildren(block(row?'Editar modelo':'Nuevo modelo',this.#form(content,'Guardar modelo',async()=>{
        const capacidades=boxes.filter(item=>item.control.checked||item.guest.checked).map(item=>({
          codigo:item.codigo,control:item.control.checked||item.guest.checked,invitado:item.guest.checked,
        }));
        await this.#request(row?`/admin/modelos/${row.id}`:'/admin/modelos',
          {method:row?'PUT':'POST',body:{...fields.read(),capacidades}});
        await this.#admin('modelos');this.#alert('Modelo guardado.');
      },()=>editor.replaceChildren())));
    };
    return block('Modelos comerciales',button('Nuevo modelo',()=>edit(null),'action-primary'),editor,
      searchTable(['SKU','Modelo','Estado'],rows,row=>[row.sku,row.nombre,row.activo?'Activo':'Inactivo'],row=>button('Editar',()=>edit(row))));
  }
  async #units(){
    const [units,models,clients]=await Promise.all([
      this.#request('/admin/unidades'),this.#request('/admin/modelos'),this.#request('/admin/clientes'),
    ]).then(values=>values.map(array));
    const editor=element('div');
    const edit=row=>{
      const fields=formFields([
        ['id_vehiculo','Identificador de vehículo existente','number',{optional:true,min:1}],
        ['id_modelo','Modelo comercial','select',{numeric:true,options:options(models)}],
        ['serie','Serie','text',{maxLength:60}],['nombre','Nombre','text',{maxLength:100}],
        ['estado','Estado comercial','select',{options:['inventario','exhibicion','inactiva'].map(value=>opt(value,showStatus(value)))}],
        ['fisico','Unidad física','checkbox'],
      ],row??{fisico:false,estado:'inventario'});
      if(row?.estado==='vendida'){
        fields.controls.find(value=>value.input.name==='estado').input.prepend(new Option('Asignada','vendida',true,true));
      }
      if(row){
        fields.controls.find(value=>value.input.name==='id_vehiculo').input.readOnly=true;
        fields.controls.find(value=>value.input.name==='fisico').input.disabled=true;
      }
      editor.replaceChildren(block(row?'Editar unidad':'Nueva unidad',this.#form(fields.grid,'Guardar unidad',async()=>{
        await this.#request(row?`/admin/unidades/${row.id}`:'/admin/unidades',
          {method:row?'PUT':'POST',body:{...fields.read(),...(row?.version?{version:row.version}:{})}});
        await this.#admin('unidades');this.#alert('Unidad guardada.');
      },()=>editor.replaceChildren())));
    };
    const assign=row=>{
      const fields=formFields([
        ['id_cliente','Comprador','select',{optional:true,numeric:true,placeholder:'Sin comprador',
          options:options(clients.filter(item=>item.activo))}],
      ],row);
      editor.replaceChildren(block(`Asignación de ${row.nombre}`,this.#form(fields.grid,'Confirmar asignación',async()=>{
        await this.#request(`/admin/unidades/${row.id}/asignacion`,{method:'POST',body:{...fields.read(),version:row.version}});
        await this.#admin('unidades');this.#alert('Asignación registrada.');
      },()=>editor.replaceChildren())));
    };
    const owners=async row=>{
      try{
        const history=array(await this.#request(`/admin/unidades/${row.id}/titularidad`));
        editor.replaceChildren(block('Historial de titularidad',searchTable(['Comprador','Desde','Hasta','Actor'],history,entry=>[
          entry.cliente??entry.id_cliente,dateLabel(entry.inicio),entry.fin?dateLabel(entry.fin):'Vigente',entry.id_actor,
        ]),button('Cerrar',()=>editor.replaceChildren())));
      }catch(error){this.#error(error);}
    };
    return block('Inventario de unidades',button('Nueva unidad',()=>edit(null),'action-primary'),editor,
      searchTable(['Unidad','Serie','Estado','Equipo'],units,row=>[row.nombre,row.serie,showStatus(row.estado),
        row.despacho??(row.fisico?'Sin verificar':'Virtual')],row=>{
        const actions=element('div',null,'platform-tools');
        actions.append(button('Editar',()=>edit(row)),button('Asignar',()=>assign(row)),button('Titularidad',()=>void owners(row)));
        return actions;
      }));
  }
  async #clients(){
    const rows=array(await this.#request('/admin/clientes'));
    const editor=element('div');
    const add=()=>{
      const fields=formFields([
        ['nombre','Nombre','text',{maxLength:100}],['correo','Correo','email',{autocomplete:'off',maxLength:254}],
        ['contrasena','Contraseña inicial','password',{autocomplete:'new-password',minLength:12,maxLength:128}],
      ]);
      editor.replaceChildren(block('Registrar cliente',this.#form(fields.grid,'Registrar',async()=>{
        await this.#request('/admin/clientes',{method:'POST',body:fields.read()});
        fields.controls[2].input.value='';
        await this.#admin('clientes');this.#alert('Cuenta registrada.');
      },()=>editor.replaceChildren())));
    };
    return block('Clientes',button('Registrar cliente',add,'action-primary'),editor,
      searchTable(['Nombre','Correo','Estado'],rows,row=>[row.nombre,row.correo??row.usuario,row.activo?'Habilitada':'Bloqueada'],
        row=>button(row.activo?'Bloquear':'Habilitar',()=>void this.#mutation(`/admin/clientes/${row.id}`,
          {method:'PATCH',body:{activo:!row.activo}},()=>this.#admin('clientes')))));
  }
  #profileForm(){
    const fields=formFields([
      ['actual','Contraseña actual','password',{autocomplete:'current-password',maxLength:128}],
      ['nueva','Contraseña nueva','password',{autocomplete:'new-password',minLength:12,maxLength:128}],
    ]);
    return block('Perfil',element('p',this.#profile.usuario??this.#profile.nombre,'platform-meta'),
      this.#form(fields.grid,'Cambiar contraseña',async()=>{
        await this.#request('/auth/contrasena',{method:'POST',body:fields.read()});
        for(const item of fields.controls)item.input.value='';
        await this.#end(false);this.#alert('Contraseña actualizada. Inicia sesión de nuevo.');
      }));
  }
  async #buyer(){
    if(this.#profile?.rol!==BUYER)return;
    const revision=++this.#revision;
    const content=this.#layout('Mis vehículos',this.#profile.nombre??'Cuenta de comprador',this.#signedActions());
    try{
      const units=array(await this.#request('/mis-unidades'));
      if(revision!==this.#revision)return;
      const view=element('div',null,'platform-items'),list=element('div',null,'platform-cards');
      for(const unit of units){
        const selection=button(this.#unit?.id===unit.id?'Abrir control':'Seleccionar unidad',()=>{
          selection.disabled=true;
          void this.#choose(unit,revision).catch(error=>this.#error(error)).finally(()=>{selection.disabled=false;});
        },'action-primary');
        if(!integer(unit.id_vehiculo))selection.disabled=true;
        const card=element('article',null,'platform-item');
        card.append(element('h3',unit.nombre),element('p',[unit.modelo,unit.serie].filter(Boolean).join(' · '),'platform-meta'),selection);
        list.append(card);
      }
      if(!list.children.length)list.append(element('p','Sin unidades asignadas.','platform-meta'));
      content.replaceChildren(block('Unidades asignadas',list),view,this.#profileForm());
      if(this.#unit){
        const commands=array(await this.#api.commands()).map(command=>({codigo:command.codigo,nombre:command.nombre}));
        if(revision===this.#revision)void this.#demos(view,'id_unidad',this.#unit.id,commands,revision);
      }
    }catch(error){if(revision===this.#revision)this.#error(error);}
  }
  async #choose(unit,revision){
    this.#alert('Abriendo unidad…');
    await this.#scope(unit.id_vehiculo,unit.id,Boolean(unit.fisico));
    if(revision!==this.#revision||this.#profile?.rol!==BUYER)return;
    this.#unit=unit;this.#tab('Mi cuenta',['control','monitor','demo','platform']);
    this.#nav.show('control',{focus:true});
    void this.#buyer();
  }
  async #demos(target,key,id,capabilities,revision){
    try{
      const rows=array(await this.#request(`/demos?${key}=${encodeURIComponent(id)}`));
      if(revision!==this.#revision||!target.isConnected)return;
      const editor=element('div'),edit=row=>this.#editDemo(editor,key,id,capabilities,row,
        ()=>this.#demos(target,key,id,capabilities,revision));
      target.replaceChildren(block(key==='id_modelo'?'Secuencias del modelo':'DEMOS compatibles',
        button('Nueva DEMO',()=>edit(null),'action-primary'),editor,
        searchTable(['Secuencia','Tipo','Pasos','Estado'],rows,row=>[row.nombre,row.tipo==='fabrica'?'Fábrica':'Privada',
          array(row.pasos).length,row.activo?'Activa':'Inactiva'],
          row=>key==='id_unidad'&&row.tipo==='fabrica'?null:button('Editar',()=>edit(row)))));
    }catch(error){if(revision===this.#revision)this.#error(error);}
  }
  #editDemo(target,key,id,capabilities,row,reload){
    const allowed=capabilities.filter(item=>Number.isSafeInteger(item.codigo)&&item.control!==false)
      .map(item=>opt(item.codigo,commandNames[item.codigo]??item.nombre??`Código ${item.codigo}`));
    if(!allowed.length){target.replaceChildren(element('p','Este recurso no tiene comandos compatibles.','platform-meta'));return;}
    const fields=formFields([
      ['nombre','Nombre','text',{maxLength:80}],['descripcion','Descripción','textarea',{optional:true,maxLength:255}],
      ['activo','Secuencia activa','checkbox'],
    ],row??{activo:true});
    let steps=array(row?.pasos).map(step=>({...step}));
    if(!steps.length)steps=[{codigo:Number(allowed[0].value),duracion_ms:500,pausa_ms:0}];
    const editor=element('div',null,'platform-form'),items=element('div',null,'platform-items'),total=element('p',null,'platform-status');
    const sumDuration=()=>steps.reduce((sum,item)=>sum+Number(item.duracion_ms||0)+Number(item.pausa_ms||0),0);
    const updateTotal=()=>{total.textContent=`Duración total · ${(sumDuration()/1000).toFixed(2)} s`;};
    const paint=()=>{
      items.replaceChildren();updateTotal();
      steps.forEach((step,index)=>{
        const node=element('div',null,'platform-step');
        const settings=formFields([
          ['codigo','Comando','select',{numeric:true,options:allowed}],
          ['duracion_ms','Duración (ms)','number',{min:1,max:5000}],
          ['pausa_ms','Pausa (ms)','number',{min:0,max:5000}],
        ],step);
        for(const {input} of settings.controls)input.addEventListener('input',()=>{Object.assign(step,settings.read());updateTotal();});
        const arrows=element('div',null,'platform-tools');
        const swap=offset=>{[steps[index],steps[index+offset]]=[steps[index+offset],steps[index]];paint();};
        const up=button('Subir paso',()=>swap(-1)),down=button('Bajar paso',()=>swap(1));
        up.disabled=index===0;down.disabled=index===steps.length-1;
        arrows.append(up,down,button('Quitar paso',()=>{steps.splice(index,1);paint();}));
        node.append(element('strong',`Paso ${index+1}`),settings.grid,arrows);items.append(node);
      });
    };
    editor.append(fields.grid,items,total,button('Agregar paso',()=>{
      if(steps.length>=30){this.#alert('La secuencia admite hasta 30 pasos.',true);return;}
      steps.push({codigo:Number(allowed[0].value),duracion_ms:500,pausa_ms:0});paint();
    }));
    paint();
    target.replaceChildren(block(row?'Editar DEMO':'Nueva DEMO',this.#form(editor,'Guardar DEMO',async()=>{
      if(!steps.length)throw Error('Agrega al menos un paso.');
      if(sumDuration()>60_000)throw Error('La secuencia puede durar hasta 60 segundos.');
      if(steps.some(step=>!Number.isSafeInteger(step.codigo)||!integer(step.duracion_ms)||!Number.isSafeInteger(step.pausa_ms)||step.pausa_ms<0))
        throw Error('Revisa los tiempos y comandos de los pasos.');
      await this.#request(row?`/demos/${row.id}`:'/demos',{method:row?'PUT':'POST',body:{...fields.read(),[key]:id,
        ...(row?.version?{version:row.version}:{}),
        pasos:steps.map(({codigo,duracion_ms,pausa_ms})=>({codigo,duracion_ms,pausa_ms}))}});
      await reload();
      if(key==='id_unidad')void this.#reloadCatalog();
      this.#alert('Secuencia guardada.');
    },()=>target.replaceChildren())));
  }
}

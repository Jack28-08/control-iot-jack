// Coordinación local. Los tests inyectan un API ficticio; aquí no hay datos de RDS fijos.
export class ControlSession {
  constructor(api, view={}) {
    this.api=api;
    this.view={change(){},operation(){},movement(){},step(){},neutral(){},confirmed(){},
      canDispatch:()=>true,barrier:()=>null,refreshBarrier(){},...view};
    this.state={commands:[],selectedDemo:null,stepsReady:false,demoActive:false,demoBusy:false,
      movementBusy:false,stopBusy:false,pending:null,lastRequested:null,activeDemoId:null,
      execution:null,lastOrder:0,uncertain:false,movementPhase:'idle',demoStatus:'En espera'};
    this.epoch=0;this.demoRevision=0;this.finished=new Set();this.activeController=null;
    this.demoStartController=null;this.observing=false;this.observationRevision=0;
  }
  changed(){this.view.change(this.state);}
  canMove(){const s=this.state;return Boolean(s.commands.length&&!s.demoActive&&!s.demoBusy&&!s.stopBusy&&!s.uncertain);}
  canStart(){const s=this.state;return this.canMove()&&!s.movementBusy&&s.stepsReady&&Boolean(s.selectedDemo);}
  fail(label,error){this.view.operation(`${label} · sin confirmación`,error.message);}
  invalidateMovement(reason){
    const controller=this.activeController;
    // Una promesa abortada puede seguir viva. Desvincularla antes de abortar
    // deja que un gesto posterior sea dueño de su propia cola y de su estado.
    this.activeController=null;
    this.state.movementBusy=false;
    this.state.pending=null;
    controller?.abort(reason);
  }
  async move(command){
    const s=this.state;
    if(!this.canMove()||!s.commands.includes(command)||!this.view.canDispatch())return;
    if(s.movementBusy){s.pending=s.lastRequested?.id_comando===command.id_comando?null:command;this.changed();return;}
    const epoch=this.epoch, controller=new AbortController();
    this.activeController=controller;s.movementBusy=true;s.pending=null;
    s.lastRequested={...command,when:Date.now(),epoch};s.movementPhase='sending';this.changed();
    try{
      if(this.activeController!==controller)return;
      this.view.movement(command.nombre);
      this.view.operation(`${command.nombre} · solicitado`,'Enviando por REST a AWS.');
      const result=await this.api.move(command.id_comando,controller.signal,this.view.barrier());
      if(epoch!==this.epoch)return;
      if(result?.id_comando!==command.id_comando)throw Error('La respuesta no corresponde al comando solicitado.');
      this.view.confirmed(result);
      if(s.movementPhase!=='received'){
        s.movementPhase='accepted';
        this.view.operation(`${command.nombre} · aceptado por API`,'HTTP confirmado; WSS es independiente y no confirma motores físicos.');
      }
    }catch(error){if(epoch===this.epoch){
      if(error.status===409)this.view.refreshBarrier();
      if(s.movementPhase==='received')this.view.operation(`${command.nombre} · HTTP sin confirmación; evento WSS recibido`,`${error.message} La coincidencia WSS no identifica de forma única esta solicitud.`);
      else{s.movementPhase='error';this.fail(command.nombre,error);}
    }}
    finally{
      if(this.activeController===controller){
        this.activeController=null;
        s.movementBusy=false;
        const next=s.pending;s.pending=null;this.changed();
        if(next&&epoch===this.epoch&&this.canMove()&&this.view.canDispatch())void this.move(next);
      }
    }
  }
  async stop({preserveInput=false}={}){
    const s=this.state;
    if(s.stopBusy){
      if(!preserveInput)this.view.neutral();
      return;
    }
    const epoch=++this.epoch;
    s.stopBusy=true;s.movementPhase='idle';
    this.invalidateMovement('priority_stop');
    this.demoStartController?.abort('priority_stop');
    if(!preserveInput)this.view.neutral();
    this.changed();
    this.view.movement('DETENIENDO');
    this.view.operation('DETENER · solicitado','Prioridad local. Abortar un fetch no revierte una orden ya recibida por AWS.');
    try{
      const result=await this.api.stop();
      if(epoch!==this.epoch)return;
      if(result?.detencion_logica!==true)throw Error('La respuesta no confirma detención lógica.');
      this.demoRevision++;s.demoActive=false;s.uncertain=false;s.activeDemoId=null;
      s.demoStatus='Detenida';
      if(s.execution)this.finished.add(s.execution);
      s.execution=null;s.lastOrder=0;this.view.step(-1);this.view.movement('NEUTRAL');
      this.view.operation('DETENER · aceptado por API','Detención lógica confirmada. Una solicitud previa ya procesada no puede deshacerse desde el navegador. No certifica motores.');
    }catch(error){if(epoch===this.epoch){s.uncertain=true;this.fail('DETENER',error);this.view.movement('SIN CONFIRMAR');}}
    finally{s.stopBusy=false;this.changed();}
  }
  async start(){
    if(!this.canStart()||!this.view.canDispatch())return;
    const s=this.state, id=s.selectedDemo, epoch=this.epoch, revision=this.demoRevision,observation=this.observationRevision;
    const controller=new AbortController();
    this.demoStartController=controller;
    s.demoBusy=true;s.activeDemoId=id;s.lastOrder=0;s.demoStatus='Iniciando';this.view.neutral();this.changed();
    try{
      if(controller.signal.aborted)return;
      this.view.operation('DEMO · inicio solicitado','Esperando HTTP 202; la secuencia se ejecuta en AWS.');
      const result=await this.api.startDemo(id,controller.signal,this.view.barrier());
      if(epoch!==this.epoch)return;
      if(result?.id_demo!==id||typeof result.id_ejecucion!=='string')throw Error('Respuesta DEMO inesperada.');
      if(revision!==this.demoRevision||this.finished.has(result.id_ejecucion))return;
      s.execution=result.id_ejecucion;s.demoActive=true;s.uncertain=!this.observing||observation!==this.observationRevision;
      s.demoStatus=s.lastOrder>0?'En curso':'Inicio aceptado';
      this.view.operation('DEMO · aceptada por API con HTTP 202','Los eventos WSS permiten observar el orden; no prueban movimiento físico.');
    }catch(error){
      if(epoch===this.epoch&&revision===this.demoRevision){
        if(error.status===409){
          s.activeDemoId=null;s.demoStatus='Inicio rechazado';this.view.refreshBarrier();
        }else{
          s.uncertain=true;s.demoStatus='Inicio sin confirmar';
        }
        this.fail('DEMO',error);
      }
    }finally{
      this.demoStartController=null;
      s.demoBusy=false;this.changed();
    }
  }
  async cancel(){
    const s=this.state;
    if((!s.demoActive&&!s.uncertain)||s.demoBusy||s.stopBusy||!s.activeDemoId)return;
    const id=s.activeDemoId,epoch=this.epoch,revision=this.demoRevision;
    s.demoBusy=true;s.demoStatus='Cancelando';this.changed();
    try{
      const result=await this.api.cancelDemo(id);
      if(epoch!==this.epoch||revision!==this.demoRevision)return;
      if(result?.id_demo!==id||!['cancelada','finalizada','error'].includes(result.estado))throw Error('Cancelación sin estado concluyente.');
      this.demoRevision++;s.demoActive=false;s.uncertain=false;s.lastOrder=0;this.view.step(-1);this.view.movement('NEUTRAL');
      s.demoStatus={cancelada:'Cancelada',finalizada:'Finalizada',error:'Error'}[result.estado];
      if(s.execution)this.finished.add(s.execution);
      this.view.operation('DEMO · respuesta de cancelación',`Estado del servidor: ${result.estado}. Verifica también el evento WSS externo.`);
    }catch(error){if(epoch===this.epoch&&revision===this.demoRevision){s.uncertain=true;s.demoStatus='Cancelación sin confirmar';this.fail('CANCELAR DEMO',error);}}
    finally{s.demoBusy=false;this.changed();}
  }
  event(event){
    const s=this.state,type=event.tipo;
    if(type==='estado_inicial')return; // El snapshot real no contiene el estado del ejecutor DEMO.
    if(type==='movimiento_individual'){
      const last=s.lastRequested;
      if(last&&last.epoch!==this.epoch)return;
      const matched=Boolean(last&&event.id_comando===last.id_comando&&Date.now()-last.when<25000);
      if(matched){s.movementPhase='received';this.changed();}
      this.view.operation(`Evento WSS · ${event.comando||'Movimiento'}`,matched?'Coincidencia temporal con la solicitud; no es correlación única ni confirma motores.':'Puede provenir de otro cliente. No confirma motores físicos.');
      return;
    }
    const isDemo=['demo_inicio','demo_movimiento','demo_fin','demo_cancelada','demo_error'].includes(type);
    if(isDemo){
      if(typeof event.id_ejecucion!=='string'||this.finished.has(event.id_ejecucion))return;
      if(s.execution&&s.execution!==event.id_ejecucion&&s.demoActive)return;
      if(s.stopBusy)return;
      const newExecution=s.execution!==event.id_ejecucion;
      s.execution=event.id_ejecucion;s.activeDemoId=event.id_demo;
      if(type==='demo_inicio'||type==='demo_movimiento'){
        if(newExecution){s.lastOrder=0;if(s.movementBusy){this.epoch++;this.invalidateMovement('demo_started');}}
        if(type==='demo_movimiento'){
          if(!Number.isInteger(event.orden)||event.orden<=s.lastOrder)return;
          s.lastOrder=event.orden;this.view.step(event.orden);
        }else if(!newExecution&&s.lastOrder>0)return;
        s.demoActive=true;s.uncertain=false;s.pending=null;this.view.neutral();
        s.demoStatus='En curso';
        this.view.movement(type==='demo_inicio'?'DEMO EN CURSO':event.comando||'DEMO');
        this.view.operation(type==='demo_inicio'?'DEMO · evento de inicio':`DEMO · paso ${event.orden}`,'Evento recibido de AWS. La recepción parcial no certifica toda la secuencia ni motores físicos.');
      }else{
        this.finished.add(event.id_ejecucion);this.demoRevision++;s.demoActive=false;s.uncertain=false;
        s.demoStatus={demo_fin:'Finalizada',demo_cancelada:'Cancelada',demo_error:'Error'}[type];
        s.execution=null;s.lastOrder=0;this.view.step(-1);this.view.movement(type==='demo_error'?'SIN CONFIRMAR':'NEUTRAL');
        this.view.operation(`Evento WSS · ${type}`,'AWS notificó el cierre de esta ejecución. No certifica actuación física.');
      }
    }else if(type==='detencion_logica'){
      this.epoch++;this.demoRevision++;s.movementPhase='idle';
      this.invalidateMovement('remote_stop');
      this.demoStartController?.abort('remote_stop');
      if(s.execution)this.finished.add(s.execution);
      if(event.id_ejecucion)this.finished.add(event.id_ejecucion);
      s.execution=null;s.demoActive=false;s.uncertain=false;this.view.neutral({preservePreview:true});this.view.step(-1);this.view.movement('NEUTRAL');
      s.demoStatus='Detenida';
      this.view.operation('Evento WSS · detencion_logica','Detención lógica publicada por AWS; no confirma motores físicos.');
    }
    this.changed();
  }
  disconnected(){
    this.observing=false;this.observationRevision++;const s=this.state;
    if(s.demoActive||s.demoBusy){s.uncertain=true;this.changed();
      this.view.operation('DEMO · observación interrumpida','El estado inicial de WSS no informa si la DEMO sigue activa. Usa Cancelar o DETENER para recuperar un estado confirmado.');}
  }
  interruptManual(){
    this.epoch++;
    this.state.uncertain=true;
    this.state.movementPhase='error';
    this.invalidateMovement('connection_lost');
    this.view.neutral();
    this.view.operation('Movimiento sin confirmar','Recupera el acceso y solicita DETENER para confirmar la detención lógica.');
    this.changed();
  }
  connected(){this.observing=true;}
}

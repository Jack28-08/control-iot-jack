# Lista de verificación y siete evidencias — práctica 4.1

Guía cotejada con [el enunciado institucional](./Enunciado_Practica_4_1_IoT.txt). Las capturas deben corresponder a pruebas ejecutadas. No incluir API keys, contraseñas, encabezados de autorización ni datos de conexión RDS. No presentar un test con dobles como prueba de AWS.

## Estado de esta revisión

- [x] Lectura del proyecto y del enunciado completo (archivo con nombre diferente al inicialmente indicado).
- [x] `npm test`: **55/55**; pruebas locales sin red ni POST reales.
- [x] Frontend abierto por HTTP; revisión de consola sin errores JavaScript capturados en la sesión inspeccionada.
- [x] Escritorio 1440×1000; emulación vertical 390×844, horizontal 844×390 y estrecha 320×568, sin desbordamiento horizontal.
- [x] Teclado: Acceso, Escape, retorno de foco, Tab y neutral con catálogo ausente.
- [x] Diagnóstico desde esta PC: DNS correcto, TCP 443 con timeout; GET/OPTIONS de ambos orígenes sin respuesta HTTP.
- [ ] Teléfono físico y segundo navegador.
- [ ] Respuesta real de AWS, RDS, certificado, CORS y WSS en línea.
- [ ] POST de movimiento, STOP y DEMO, pendientes de autorización explícita.
- [x] Repositorio público y GitHub Pages publicados con autorización; HTTPS y recursos relativos verificados.

Las capturas auténticas están en `evidencias/`, excluidas de Git/Pages: `02-desktop.jpg`, `02-movil-vertical.jpg`, `02-movil-horizontal.jpg`, sus variantes `-viewport` legibles y `06-conexion-sin-verificar.jpg`. Muestran la aplicación real local, sin catálogos inventados. La emulación no sustituye un teléfono real; una captura del estado sin verificar no demuestra caída y recuperación completas.

## Preparación y orden seguro

1. Comprobar primero respuesta de [GET /health](https://184-72-72-255.sslip.io/health), conservando validación TLS. Un timeout no demuestra EC2 apagado. Revisar AWS con el responsable si no responde; no cambiar seguridad, infraestructura o backend desde esta guía.
2. Tras recuperar API, consultar `/health/db`; 200 con `status=ok` acredita el diagnóstico RDS, 503 indica su indisponibilidad, y falta de respuesta concluyente significa **Sin verificar**.
3. Consultar vehículo, comandos, DEMO y los movimientos de **cada `id_demo` recibido**, mediante sus GET reales. Registrar fecha y número de pasos. No copiar una secuencia fija al JavaScript.
4. Verificar CORS desde localhost y desde Pages. [Propuesta mínima](./CORS_PROPUESTO.md) sólo documental: aplicar al backend exige autorización distinta. Un preflight OPTIONS no ejecuta un movimiento; nunca sustituirlo por un POST sin permiso.
5. Publicar el frontend sólo tras autorización siguiendo [DESPLIEGUE](./DESPLIEGUE.md). Comprobar HTTPS sin omitir validación de certificado.
6. Conectar un cliente WSS independiente: en Postman elegir **New → WebSocket**, usar `wss://184-72-72-255.sslip.io/ws/vehiculos/1` y Connect. Puede utilizarse Thunder Client o una extensión confiable si la versión instalada permite WSS. No enviar órdenes por el socket: este canal es monitor. La aplicación mantiene además su propia sesión.
7. Antes de cualquier prueba de escritura, obtener permiso explícito para el escenario concreto y tener un operador presente. Introducir la clave personalmente sólo en **Acceso**. No pegarla en chats, comandos, archivos o URLs. En DevTools cerrar Request Headers y no exportar HAR con claves.

## Evidencia 1 — Estructura modular

- [ ] VS Code muestra `assets`, `css`, `js`, `tests`, `docs`, README e index, con `js` expandido.
- [ ] GitHub muestra el repositorio **control-iot-jack**, distinto de **api-vehiculo-iot**, con commits reales descriptivos.

Capturar el árbol de archivos y el código modular, evitando otras carpetas o conexiones. Como soporte local ejecutar `git rev-parse --show-toplevel`, `git log --oneline` y `npm test` mediante PowerShell: la raíz debe ser únicamente esta carpeta. El listado o test no acredita que el repositorio ya esté publicado. Completar la parte GitHub después del push autorizado.

## Evidencia 2 — Mobile First

- [x] Capturas locales reales de escritorio y tamaños móviles emulados.
- [ ] Captura de la versión publicada en teléfono físico vertical y horizontal.
- [ ] Joystick, todos los botones del GET, DEMO, STOP, foco y footer legibles con el catálogo real.
- [ ] Favicon propio visible en pestaña.

En el teléfono abrir la URL Pages completa, alternar orientaciones y desplazarse hasta los créditos. Tomar más de una captura si el control y el pie no caben legiblemente. No recortar la URL en la evidencia de publicación. Los botones táctiles buscan al menos 44 CSS px. Registrar navegador y dispositivo reales, sin inventar modelos. Una emulación local es evidencia parcial de diseño.

## Evidencia 3 — Movimiento individual

- [ ] Con permiso y desde Pages, seleccionar AVANZAR recibido del GET.
- [ ] Network muestra POST `/vehiculos/1/movimientos`, body con `id_comando` del catálogo y `origen: CONTROL-WEB`, respuesta HTTP real.
- [ ] Cliente WSS externo muestra `movimiento_individual` con mismo `id_vehiculo`, `id_comando`, `comando`, `codigo` y `fecha_hora`, cuando esos campos están presentes.

Capturar la interfaz con la acción y el evento externo legible, además de la fila Network y Response si hace falta. Mantener Headers cerrado. No deducir identificador de `codigo`; no asumir que todos los vehículos usan el mismo mapeo. La coincidencia temporal no es una correlación única. HTTP 200 confirma aceptación por API, no motores físicos.

## Evidencia 4 — Cambio y DETENER

- [ ] Con permiso, cambiar de dirección durante un gesto y soltar.
- [ ] Network muestra el nuevo movimiento y POST `/vehiculos/1/detener` sin ráfagas por píxel.
- [ ] Cliente WSS externo recibe los movimientos y `detencion_logica`.
- [ ] Cancelar/pérdida de captura, teclado y foco se comportan conforme a las pruebas locales y a la prueba real autorizada.

Observar tiempos/orden en Network, no sólo el color del joystick. Para documentar prioridad, registrar las solicitudes y respuesta reales sin repetir acciones innecesarias. Abortar fetch no revierte una petición que AWS ya estaba procesando. STOP lógico no certifica detención física. Las 55 regresiones locales incluyen respuestas tardías y pérdida de puntero, pero no sustituyen esta prueba en el despliegue.

## Evidencia 5 — DEMO desde RDS

- [ ] GET de DEMO y GET de pasos para todos los identificadores obtenidos, sin secuencias fijas.
- [ ] Inicio autorizado POST `.../iniciar` devuelve **202** real.
- [ ] WSS externo muestra `demo_inicio`, N `demo_movimiento` ordenados y `demo_fin` para el mismo `id_ejecucion` y `id_demo`.
- [ ] Comparar `orden`, `duracion_ms`, `pausa_ms` y fechas recibidas con el plan consultado; no exigir precisión de reloj del navegador como temporizador del servidor.
- [ ] Escenario de cancelación autorizado muestra POST `.../cancelar` y `demo_cancelada` o el terminal realmente devuelto si ya terminó.
- [ ] Ausencia de altas en historial individual verificada mediante la herramienta existente y lectura autorizada del backend antes/después; no desarrollar un módulo histórico para esta práctica.

Iniciar/cancelar sólo tras permiso para ese escenario. Guardar las capturas de inicio, pasos y terminal que hagan falta para mostrar N sin inventar eventos ausentes. La revisión del código confirmó la regla de no historial individual, pero la comprobación en RDS desplegado sigue pendiente. Si se pierde WSS, el snapshot inicial no permite reconstruir una DEMO completa; documentar el hueco y recuperar estado con Cancelar/STOP autorizado.

## Evidencia 6 — Conexiones independientes

- [x] Captura auténtica local del panel; API/RDS sin resultado concluyente, WSS desconectado o intentando recuperar.
- [ ] WSS pasa por En línea, Desconectado y Reconectando/En línea en una pérdida y recuperación reales.
- [ ] API se comprueba con GET `/health`, independientemente de WSS; no acredita las 21 operaciones.
- [ ] RDS sólo Disponible por `/health/db` con 200 y `status=ok`, No disponible con 503 y Sin verificar sin diagnóstico concluyente.

El [diagnóstico medido](./DIAGNOSTICO_RED.md) no demuestra un fallo de RDS ni permite determinar si EC2 está apagado. No apagar recursos AWS o RDS para obtener evidencia sin permiso. Puede comprobarse recuperación de la sesión WSS mediante una desconexión controlada del cliente; describir exactamente qué se interrumpió. Capturar tres momentos si la apertura, pérdida y reconexión no caben en una sola imagen. WSS del navegador no equivale a vehículo físico conectado.

## Evidencia 7 — GitHub Pages

- [ ] Captura de teléfono real con la URL pública completa funcionando.
- [ ] Favicon en pestaña y créditos al final del contenido.
- [x] Repositorio público del frontend y configuración Pages **main → raíz**.
- [x] Certificado HTTPS válido y GET de recursos relativos con HTTP 200 desde la subruta.

Destinos publicados y verificados: `https://jack28-08.github.io/control-iot-jack/` y `https://github.com/Jack28-08/control-iot-jack`. No presentarlos como publicados por existir en un README. No publicar capturas, Word/PDF ni material local excluido de Git.

## Entrega institucional

- [x] URL Pages y URL GitHub verificadas, completas y clicables en el informe.
- [x] Portada de referencia adaptada con los datos académicos proporcionados, sin semestre/grupo inventados.
- [ ] Siete evidencias completas con descripciones que indiquen lo realmente observado.
- [x] Word editable conservado en `entregables/`.
- [x] PDF exportado del DOCX mediante WPS y revisado visualmente en sus ocho páginas.
- [ ] Cotejo y exportación específica en **Microsoft Word**, exigidos por el punto 15.3; WPS es la aplicación registrada en esta computadora.
- [x] Conclusiones de avance en primera persona, distinguiendo pruebas locales de integración pendiente.

La carpeta `entregables/` contiene un informe de avance, no la certificación de entrega completa. Se exporta el DOCX a PDF con WPS, la aplicación registrada en esta PC, y se revisan las páginas resultantes. El cotejo específico en Microsoft Word del punto 15.3 sigue pendiente. Las capturas públicas 07-pages-* muestran la página real y emulación de tamaño, sin teléfono físico ni POST.

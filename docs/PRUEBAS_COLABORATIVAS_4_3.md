# Matriz de aceptación P01 a P17

Las pruebas locales emplean cuentas sintéticas, MySQL aislado o dobles REST/WSS. Ninguna prueba automatizada opera un dispositivo físico. La evaluación colaborativa presencial sigue pendiente. El apartado 6 del enunciado 4.3 oficial se debe cotejar al recibir el documento completo.

| Caso | Precondición y pasos | Resultado esperado | Resultado observado y evidencia | Estado |
| --- | --- | --- | --- | --- |
| P01 Login del administrador | Cuenta habilitada. Intenta entrada inválida y luego inicia sesión válida. | 401 para credencial inválida. Perfil Admin en la válida. | Pasó en ASGI/MySQL y en Chromium con REST sustituido. `test_platform43_commercial.py`, `platform43-browser-results.json`. | Local comprobado |
| P02 Alta de unidad | Modelo activo. Abre inventario y registra serie única. Repite la serie. | Alta atómica con ID histórico. Conflicto si la serie existe. | Alta de unidad en ASGI/MySQL. Captura de inventario en Chromium local. | Local comprobado para alta |
| P03 Alta de cliente | Sesión Admin. Registra cliente con contraseña temporal. | Cuenta habilitada, sin contraseña en respuesta ni auditoría. | Creación persistida en ASGI/MySQL. Captura `administracion-clientes-local.png`. | Local comprobado |
| P04 Asignación | Unidad y comprador de prueba. Asigna y repite usando la revisión anterior. | Titularidad vigente, rastro histórico y rechazo de una actualización concurrente obsoleta. | Asignación y conflicto de versión verificados en ASGI/MySQL y visibles en Chromium. | Local comprobado |
| P05 Aislamiento | Compradores A y B con titulares distintos. Consulta cada listado y cambia de vehículo en la interfaz. | Cada comprador ve sus unidades. La selección anterior no contamina datos. | Listado y bloqueo comprobados en ASGI/MySQL. Cambio en Chromium de `comprador-control-local.png` a MONITOREO de otra unidad. | Local comprobado |
| P06 Compatibilidad REST | Política 4.3 apagada. Ejecuta consultas y pruebas de contrato 4.1/4.2. | GET y POST históricos mantienen modelos, límites y códigos. | Inventario OpenAPI generado de la revisión base. Suite completa local de 226 pruebas y capturas en `regresion/`. | Local comprobado. Producción pendiente |
| P07 WSS autorizado | Comprador con permiso y ticket vigente. Abre socket y prueba reutilizarlo. | Recibe eventos de su unidad. Reuso o falta de ticket se rechaza. | ASGI y MySQL aislado verificaron ticket, estado inicial y rechazo del reuso. Chromium también probó emisión por unidad con dobles. | Local comprobado |
| P08 Historial | Unidad con más de diez movimientos en fixture. Abre MONITOREO y página. | Diez movimientos individuales, orden descendente y paginación. | `historial-paginado.png` y regresión Chromium. El laboratorio preservó las filas históricas al migrar. | Local con dobles |
| P09 DETENER | Reserva virtual o escenario local de conducción. Pulsa DETENER. | Revocación lógica prioritaria. Una solicitud anterior no reanuda. | ASGI y MySQL verificaron DEMO comercial aceptada, DETENER y conservación del historial. Chromium probó DETENER virtual. Los tiempos mecánicos quedan pendientes. | Lógico comprobado en local |
| P10 Editor de DEMOS | Modelo con capacidades. Agrega pasos, cambia orden, duración y pausa y vuelve a abrir. | Guarda los pasos en MySQL. Rechaza comandos incompatibles y acceso ajeno. | Edición, reordenación y persistencia en ASGI/MySQL. Captura `administracion-editor-demo-local.png`. | Local comprobado |
| P11 Invitado | Catálogo con exhibición virtual. Inicia reserva desde sesión limpia. | Acceso sin cuenta, limitado a una unidad y plazo. | Flujo ASGI/MySQL y Chromium. Capturas de catálogo y reserva. | Local comprobado |
| P12 Unidad ajena | Compradores con unidades diferentes. Envía un GET o POST sobre unidad vendida desde sesión no titular. | HTTP 401, 403 o 404 según estado y permiso. Sin datos de la unidad ajena. | Pruebas de prohibición de unidad o DEMO ajena en ASGI/MySQL. El frontend probó 401 de login inválido. | Local comprobado |
| P13 Exclusividad | Exhibición virtual. Dos solicitudes concurrentes contra la misma unidad y una tras expirar. | Una reserva activa. Competidora 409. Tras caducar puede abrirse otra. | 201 y 409 simultáneos, caducidad y sustitución en ASGI/MySQL. | Local comprobado |
| P14 Capacidades | Modelo con capacidades limitadas. Intenta editar pasos con comando fuera de catálogo. | Rechazo del comando incompatible. En invitado manda la lista permitida de esa unidad. | Editor con código no compatible rechazado en ASGI/MySQL. | Local comprobado para editor |
| P15 Reconexión y revocación | Reasigna, bloquea o finaliza la reserva durante la sesión. Intenta insistir con credencial anterior. | Se cierra el alcance revocado y la reconexión legítima resincroniza. | El WSS del titular anterior cerró con 4403 antes del evento de la nueva titularidad. Se comprobó revocación de contraseña y caducidad de reserva. Reconexión de navegador con dobles. | Local comprobado. WSS productivo pendiente |
| P16 Responsividad | CONTROL, MONITOREO y ADMINISTRACIÓN a distinto ancho y altura. | ADMINISTRACIÓN usable y sin desbordamiento horizontal. CONTROL y MONITOREO conservan sus reglas previas. | 18 tamaños de navegador sin desbordamiento horizontal en 4.3. Reportes de 4.3 y regresión 4.1/4.2 adjuntos. | Local con dobles |
| P17 Auditoría | Ejecuta alta, cambio, rechazo y cierre desde cuentas ficticias. | Fecha, actor, acción, recurso y resultado. Sin contraseñas ni tokens. | Operaciones y negativas comprobadas en MySQL aislado. Captura `administracion-auditoria-local.png`. | Local comprobado |

## Matriz de permisos

| Recurso | Administrador | Comprador | Invitado |
| --- | --- | --- | --- |
| Catálogo publicado | Consulta | Consulta | Consulta |
| Dashboard e inventario privado | Gestión | Sin acceso | Sin acceso |
| Clientes y asignaciones | Gestión y titularidad | Solo relación propia | Sin acceso |
| CONTROL y MONITOREO | Sin permiso automático sobre unidades vendidas | Unidad propia vigente y capacidades del modelo | Solo unidad virtual de exhibición durante la reserva |
| DEMOS de fábrica | Crea y edita por modelo | Consulta y ejecución compatibles | Sin edición |
| DEMOS privadas | Sin edición como titular | Unidad y titularidad vigentes | Sin acceso |
| Reservas | Enumera y revoca | Portal de invitado en sesión correspondiente | Abre y finaliza la propia |
| Auditoría | Consulta | Sin acceso administrativo | Sin acceso |
| Sesiones y contraseña | Sus propias credenciales | Sus propias credenciales | Token temporal de su reserva |
| Ticket WSS | Su ámbito autorizado | Sesión y unidad propias | Reserva vigente y datos abreviados |

## Rondas en equipo

Usa un ambiente de prueba por plataforma. Sustituye nombres y correos por identificadores ficticios. Guarda los resultados, horas y responsables por separado.

1. **Ronda A.** En la plataforma A, una persona opera Admin, otra la cuenta compradora y otra abre Invitado en un navegador limpio. Prueba P01 a P09 y documenta el resultado.
2. **Ronda B.** Cambia a la plataforma B y rota los roles. Prueba P10 a P15 con nuevas cuentas de ensayo y conserva por separado cada reporte.
3. **Ronda C.** Cambia a la plataforma C y rota nuevamente. Observa P16 y P17. Repite los casos que fallaron por disponibilidad y registra la diferencia.

En cada ronda revisa que las credenciales de ensayo queden fuera de las capturas y que se finalicen las reservas. La revisión compartida conserva las tres bases de datos, repositorios y entregas individuales.

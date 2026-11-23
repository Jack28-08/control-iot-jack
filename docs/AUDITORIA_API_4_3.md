# Auditoría de contratos históricos de NODE/01

Base examinada `3821657` de api-vehiculo-iot y frontend `ad4207c`. El inventario cruza los routers, Pydantic, los servicios, el OpenAPI generado en local y el contrato RDS. Swagger público agotó su tiempo de espera; no se dedujeron respuestas productivas de las pruebas locales.

Hay **21 procedimientos almacenados y 20 operaciones REST históricas**. Los 7 GET y los 13 POST de la primera tabla comparten los procedimientos; mover un vehículo usa dos procedimientos dentro de una transacción. DETENER y la ejecución programada se ofrecen por otras rutas. Las denominaciones Admin y Operador de esta tabla son las históricas, con API key. La política comercial 4.3 debe aplicar autenticación y propiedad a los mismos recursos en modo activo. [Backend base](https://github.com/Jack28-08/api-vehiculo-iot) · [Contrato de producción](https://184-72-72-255.sslip.io/docs)

## Operaciones históricas

Las abreviaturas de ruta `V`, `C`, `D`, `M` corresponden a `{id_vehiculo}`, `{id_comando}`, `{id_demo}`, `{id_demo_movimiento}`. Los modelos JSON se detallan debajo de la tabla. Las lecturas devuelven `200`. El distintivo `201` identifica altas. Para las rutas con recurso, aplica `404` por ausencia o cadena de pertenencia inválida. Los IDs y cuerpos inválidos producen `422`. Las escrituras devuelven además `401` por credencial ausente o inválida, `403` por alcance incorrecto y `409` por duplicado, conflicto de integridad o ejecución incompatible. Las rutas pueden devolver `500` por fallo interno y `503` por dependencia indisponible. El significado de éxito sigue siendo lógico.

| Método y ruta | JSON de entrada | JSON de salida | Acceso histórico | Validación, pertenencia y uso |
| --- | --- | --- | --- | --- |
| GET `/vehiculos` | — | `200 Vehículo[]` | Público | Lista ordenada. Base del catálogo y selector. |
| GET `/vehiculos/V` | — | `200 Vehículo` | Público | Valida V. Identificación de la unidad en CONTROL y MONITOREO. |
| GET `/vehiculos/V/comandos` | — | `200 Comando[]` | Público | V existente. Catálogo por código y selección por ID real en CONTROL. |
| GET `/vehiculos/V/estado` | — | `200 Estado\|null` | Público | V existente. MONITOREO consulta al entrar y reconectar. |
| GET `/vehiculos/V/historial` | — | `200 FilaHistorial[]` | Público | V existente. Hasta diez movimientos individuales, por fecha e ID descendentes. |
| GET `/vehiculos/V/demos` | — | `200 Demo[]` | Público | V existente. Selector de secuencias en CONTROL. |
| GET `/vehiculos/V/demos/D/movimientos` | — | `200 Paso[]` | Público | D pertenece a V. CONTROL consulta orden, duración y pausa. |
| POST `/vehiculos` | alta de Vehículo | `201 Vehículo` | Admin | Nombre requerido. Alta desde API, activa por defecto. |
| POST `/vehiculos/V/actualizar` | edición de Vehículo | `200 Vehículo` | Admin | Valida V y exige `activo`. Gestión REST heredada. |
| POST `/vehiculos/V/eliminar` | — | `200 Eliminación` | Admin | Valida V. Las relaciones históricas tienen cascadas. |
| POST `/vehiculos/V/comandos` | alta de Comando | `201 Comando` | Admin | Valida V y unicidad del código y el nombre dentro de V. |
| POST `/vehiculos/V/comandos/C/actualizar` | edición de Comando | `200 Comando` | Admin | C pertenece a V. Mismas restricciones de unicidad. |
| POST `/vehiculos/V/comandos/C/eliminar` | — | `200 Eliminación` | Admin | C pertenece a V. RESTRICT si un paso lo referencia. |
| POST `/vehiculos/V/demos` | alta de Demo | `201 Demo` | Admin | V existente. Alta sin ejecutar secuencia. |
| POST `/vehiculos/V/demos/D/actualizar` | edición de Demo | `200 Demo` | Admin | D pertenece a V. |
| POST `/vehiculos/V/demos/D/eliminar` | — | `200 Eliminación` | Admin | D pertenece a V. Cascada a los pasos heredados. |
| POST `/vehiculos/V/demos/D/movimientos` | alta de Paso | `201 Paso` | Admin | D y C pertenecen a V. Orden único por D. |
| POST `/vehiculos/V/demos/D/movimientos/M/actualizar` | edición de Paso | `200 Paso` | Admin | D y C pertenecen a V y M pertenece a D. |
| POST `/vehiculos/V/demos/D/movimientos/M/eliminar` | — | `200 Eliminación` | Admin | D pertenece a V y M pertenece a D. |
| POST `/vehiculos/V/movimientos` | `id_comando, origen, id_solicitud?` | `200 Movimiento` | Operador o Admin | V y C activos y C pertenece a V. Persiste estado e historial en una transacción. CONTROL usa el ID real. |

En los cuerpos siguientes el signo `?` indica que el campo puede omitirse. Las actualizaciones históricas reemplazan los campos editables y exigen booleano estricto `activo` cuando se indica. Se rechazan campos adicionales. Para entradas numéricas, ID, orden y duración son enteros positivos de hasta 2 147 483 647, código es entero firmado y pausa es entero no negativo en ese rango. Los campos de texto conservan los límites del esquema.

| Familia | Entrada | Salida |
| --- | --- | --- |
| Vehículo | `nombre` (1–80), `modelo?` (80), `descripcion?` (255), `microcontrolador?` (50); edición añade `activo`. | `id_vehiculo,nombre,modelo,descripcion,microcontrolador,fecha_registro,activo` |
| Comando | `nombre` (1–60), `codigo`, `descripcion?` (255); edición añade `activo`. | `id_comando,id_vehiculo,nombre,codigo,descripcion,activo` |
| Demo | `nombre` (1–80), `descripcion?` (255); edición añade `activo`. | `id_demo,id_vehiculo,nombre,descripcion,activo` |
| Paso | `id_comando,orden,duracion_ms,pausa_ms?`; pausa por defecto 0. | `id_demo_movimiento,orden,id_comando,comando,codigo,duracion_ms,pausa_ms` |
| Estado | — | `id_vehiculo,vehiculo,id_comando,comando,codigo,conectado,fecha_actualizacion` |
| FilaHistorial | — | `id_historial,id_vehiculo,comando,codigo,fecha_hora,origen` |
| Movimiento | `id_comando,origen` (1–30), `id_solicitud?` UUID; en modo sostenido el ciclo usa `X-IoT-Barrier`. | `id_vehiculo,id_comando,origen,conectado,estado,historial,id_operacion` |
| Eliminación | — | `eliminado,id` |

## Operaciones complementarias

| Método y ruta | Entrada y validación | Respuesta | Uso |
| --- | --- | --- | --- |
| GET `/health` | — | `200 {"status":"ok"}` | Estado independiente de API. |
| GET `/health/db` | — | `200 {"status":"ok"}` o `503` | SELECT 1 mediante el conector, independiente de WSS. |
| POST `/vehiculos/V/demos/D/iniciar` | Operador, pertenencia de D, barrera donde aplica. | `202` con IDs, número de pasos y estado. | Usa el plan real. No añade filas individuales por paso. |
| POST `/vehiculos/V/demos/D/cancelar` | Operador, asociación con la ejecución activa. | `200` con estado terminal. | Cancela la secuencia. |
| POST `/vehiculos/V/detener` | Operador y V. | `200` con detención lógica e identificadores. | Revoca antes de confirmar otras dependencias. |
| GET `/evaluacion/vehiculos/1` | Política histórica, origen y disponibilidad. | `200` con sesión o rechazo. | Compatibilidad 4.2. La política 4.3 restringe este acceso. |
| GET `/vehiculos/V/control/capacidad` | V. | `200` con habilitación, disponibilidad, barrera, plazos y compatibilidad. | Prepara el control sostenido. |
| POST `/vehiculos/V/control/permiso` | `barrera,gesto,secuencia,longitudinal,lateral` y acceso autorizado. | `200` permiso en neutral, `409` en conflicto. | Admisión del joystick. |
| POST `/vehiculos/V/control/vector` | Mismo cuerpo. Se comprueban secuencia creciente, vector y vigencia. | `200` renovación o transición, con identificadores y métricas cuando corresponden. | La renovación del mismo vector no escribe historial. |
| POST `/vehiculos/V/control/liberar` | `barrera,gesto` y acceso autorizado. | `200` revocación lógica e identificador. | Al soltar, salir o perder foco. |

## WebSocket

El socket de monitor histórico usa `/ws/vehiculos/V`. Su carga valida `tipo`, `id_vehiculo` y los campos del evento específico. Informa `estado_inicial`, `movimiento_individual`, `detencion_logica`, `demo_inicio`, `demo_movimiento`, `demo_fin`, `demo_cancelada`, `demo_error` y `salida_dispositivo`. WSS usa marcas temporales con zona. Los sellos históricos REST proceden del conector en UTC y el navegador los presenta en hora local. El identificador de evento evita duplicados y el de operación permite correlacionar el acuse, el registro y la solicitud.

El canal HTTPS/WSS del dispositivo tiene identidad propia, retos crecientes, permisos de corta duración y salida neutra al vencer. Un HTTP 200 indica confirmación lógica. Un acuse digital describe lo que informó el ESP8266. La respuesta mecánica se observa en banco. La práctica 4.3 añade tickets de navegador por unidad y sesión y evita que la autorización de un recurso se reutilice en otro.

## Procedimientos almacenados

La reproducción aislada del DDL cuenta **21** procedimientos. Los SP de lectura y escritura existentes siguen separados de las tablas comerciales. Las definiciones y sus parámetros se conservan en el inventario histórico del backend. [Mapa funcional](https://github.com/Jack28-08/api-vehiculo-iot)

| Tabla o uso | Procedimientos |
| --- | --- |
| Vehículos | `sp_obtener_vehiculos`, `sp_obtener_vehiculo`, `sp_crear_vehiculo`, `sp_actualizar_vehiculo`, `sp_eliminar_vehiculo` |
| Comandos | `sp_obtener_comandos_vehiculo`, `sp_crear_comando`, `sp_actualizar_comando`, `sp_eliminar_comando` |
| Estado | `sp_obtener_estado`, `sp_actualizar_estado` |
| Historial | `sp_obtener_historial`, `sp_registrar_historial` |
| DEMOS | `sp_obtener_demos`, `sp_crear_demo`, `sp_actualizar_demo`, `sp_eliminar_demo` |
| Pasos | `sp_obtener_movimientos_demo`, `sp_agregar_movimiento_demo`, `sp_actualizar_movimiento_demo`, `sp_eliminar_movimiento_demo` |

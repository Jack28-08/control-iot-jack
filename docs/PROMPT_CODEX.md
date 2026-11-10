# Prompt para Codex (abrir esta carpeta en VS Code)

Quiero terminar mi práctica **4.1 Aplicación de control para IoT** en esta carpeta. Trabaja sobre el proyecto existente `control-iot-jack`; NO lo reemplaces ni borres funcionalidades. Lee primero `README.md`, `docs/PRUEBAS.md`, `js/config.js`, `js/api.js`, `js/main.js`, `js/socket.js`, `js/joystick.js` y el enunciado institucional.

## Contrato existente del backend (verificado en código GitHub)
- Repositorio de API ya desplegada: https://github.com/Jack28-08/api-vehiculo-iot (no la regeneres).
- URL base HTTPS: `https://184-72-72-255.sslip.io`; WSS: `wss://184-72-72-255.sslip.io/ws/vehiculos/1`.
- Vehículo `id_vehiculo=1`. Nombres de comandos sólo los obtenidos de GET `/vehiculos/1/comandos` (1 GI, 2 AVANZAR, 3 VELOCIDAD, 4 SUBIR_GRUA, 5 RETROCEDER, 6 DEMO del control, 7 BAJAR_GRUA, 8 GIRAR_DERECHA). Usa `id_comando` del GET, NO des por hecho que el `codigo` y el identificador se correspondan en otros vehículos.
- GET `/vehiculos/1` (nombre), `/vehiculos/1/comandos`, `/vehiculos/1/demos`, `/vehiculos/1/demos/{id_demo}/movimientos`.
- POST `/vehiculos/1/movimientos` body `{"id_comando":2,"origen":"CONTROL-WEB"}`; POST `/vehiculos/1/demos/{id_demo}/iniciar`; POST `/vehiculos/1/demos/{id_demo}/cancelar`; POST `/vehiculos/1/detener`.
- Autenticación para POST: `X-API-Key` operador. **NUNCA escribas ni imprimas claves reales en archivos, commits, consola, capturas o una página pública**. La app debe pedirla temporalmente en runtime, sólo en memoria. No divulgar ni almacenar claves permanentes.
- Salud API: GET `/health`. Diagnóstico RDS: GET `/health/db` con HTTP 200/503 según respuesta real.
- Eventos WSS: `estado_inicial`, `movimiento_individual`, `demo_inicio`, `demo_movimiento`, `demo_fin`, `demo_cancelada`, `demo_error`, `detencion_logica`. No inventar propiedades. Monitor WebSocket del navegador es distinto del cliente WS externo.

## Trabajo que necesito de Codex
1. Ejecuta y revisa los tests (`npm test`) y los módulos JS. Abre el frontend con servidor HTTP local, inspecciona consola y diseño en móvil vertical/horizontal, desktop y teclado. Corrige bugs manteniendo UI premium oscura/teal de NODE/01; mejora accesibilidad y legibilidad si hace falta.
2. Haz pruebas de red reales en MI computadora contra Swagger/API sólo después de verificar el estado de AWS. Nunca ejecutes movimientos físicos de forma automática ni DEMO sin pedirme permiso explícito. Puedes hacer GET de salud y catálogos; no hacer POST de prueba sin mi autorización.
3. Verifica CORS desde `http://localhost:5500` y el origen definitivo `https://jack28-08.github.io`. El backend actual `app/main.py` no expone CORSMiddleware. Si falta CORS, propón un parche mínimo que limite el origen, los headers y métodos al frontend, pero **NO cambies ni publiques el backend sin mi autorización explícita**, porque la consigna prohíbe modificaciones salvo ajustes necesarios y autorizados.
4. Verifica control de joystick con Pointer Events, neutral, envíos por cambio de dirección sin ráfagas, compatibilidad táctil/mouse, cancelación/pérdida de puntero, botones válidos, STOP prioritario y condiciones de carrera. Explica una posible limitación de STOP si el POST anterior ya está procesándose en el servidor. Nunca digas que un HTTP 200 certifica movimiento físico.
5. Verifica que todas las secuencias y pasos DEMO se consultan en RDS a través de GET reales, sin secuencias fijas. Confirmar 202 de inicio, eventos ordenados, final/cancelación, sin registros en historial individual.
6. Comprueba estados independientes: WSS navegador y reconexión, AWS salud por `/health`, RDS por `/health/db` sin confundir fallo de conexión con fallo de RDS. Mostrar `Sin verificar` cuando corresponda.
7. Prepara el repositorio GitHub **SEPARADO DEL BACKEND**, con nombre `control-iot-jack` en mi cuenta `Jack28-08`, comandos Git reales, commits descriptivos y README completo. Si tienes permisos y te autorizo, súbelo; si no, dame exactamente los comandos de PowerShell para `gh` y guíame. Publica SÓLO el frontend en GitHub Pages (rama main, raíz); nunca Vercel. Comprueba rutas relativas, certificado HTTPS, favicon propio y pie `Desarrollado por José Héctor Rosales Cabrera · 2026`.
8. Guíame en las 7 evidencias del archivo `docs/PRUEBAS.md`: capturas reales, no simuladas, ocultando claves. La entrega final será URL Pages + URL GitHub + PDF institucional con portada de siempre, editable Word conservado, primera persona natural y conclusiones veraces. En el documento NO uses «profesor» para referirte al M.C. Víctor Manuel Pinedo Fernández: usa «docente», «catedrático» o «M.C.».

No desarrolles MONITOREO histórico ni ADMINISTRACIÓN, ni agregues backend, nuevos SP o conexiones directas RDS desde navegador. Si falta evidencia o hay bloqueo real de AWS/CORS, repórtalo sin inventar éxito. Antes de cada cambio, explica qué archivos tocarás y después ejecuta pruebas.

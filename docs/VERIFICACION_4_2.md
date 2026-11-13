# Verificación de la práctica 4.2

[Enunciado completo](./ENUNCIADO_PRACTICA_4_2.txt) ·
[Sitio original](https://jack28-08.github.io/control-iot-jack/) ·
[Repositorio](https://github.com/Jack28-08/control-iot-jack) ·
[Swagger](https://184-72-72-255.sslip.io/docs)

## Alcance de las pruebas

En la PC se usan dobles para cualquier POST automatizado. Los datos de
los dobles no son evidencia de RDS. La preparación del acceso temporal
se verifica con FastAPI y sus dependencias de negocio sustituidas;
activar la evaluación en EC2 es un paso separado. No introducir claves
en archivos públicos. No mostrar encabezados de autenticación en
capturas, ni exportar un HAR que los contenga.

| Evidencia institucional | Qué conservar y qué comprobar |
| --- | --- |
| 14.1 Repositorio | Commit 4.2, README y estructura modular en el repositorio 4.1. |
| 14.2 Vistas | Capturas de navegador Control y Monitoreo en vertical, horizontal y escritorio; anotar si son emuladas. |
| 14.3 REST real | Capturar solicitudes de estado e historial de vehículo 1, sus códigos y respuestas reales; fecha, hora y hasta diez registros. |
| 14.4 Actualización | Registrar un movimiento autorizado desde Control, evento del cliente WSS independiente y tabla/tarjeta actualizadas sin recarga. |
| 14.5 Límite y cliente externo | Confirmar más de diez movimientos individuales autorizados y actualización desde otra pestaña; guardar IDs de las diez filas más nuevas sin duplicados. |
| 14.6 Indicadores y DEMO | Capturar caída/recuperación de WSS, nuevas lecturas REST y diagnóstico separado de AWS/RDS. DEMO y cancelación no añaden filas individuales. |
| 14.7 Pages y teléfono | URL HTTPS del mismo sitio y repositorio, favicon, créditos y capturas reales en teléfono vertical y horizontal. La emulación no sustituye al equipo físico. |

## Recorrido real, acompañado por el operador

1. Abrir [Pages](https://jack28-08.github.io/control-iot-jack/) en dos pestañas y un cliente WSS independiente (Postman, Thunder Client o equivalente) a `wss://184-72-72-255.sslip.io/ws/vehiculos/1`. El monitor no requiere clave. Mantener abierta la pestaña de Monitoreo con DevTools/Network y sin recargarla durante el recorrido.
2. En Monitoreo, comprobar `GET /vehiculos/1/estado` y `GET /vehiculos/1/historial`. Capturar códigos HTTP, campos y sus correspondencias de fecha/hora. Si hay menos de diez registros, mostrar los disponibles; si está vacío, capturar ese estado y repetir después con datos reales autorizados.
3. Verificar la [ventana temporal de EC2](https://github.com/Jack28-08/api-vehiculo-iot/blob/codex/evaluacion-iot-4-2/docs/evaluacion_4_2_ec2.md) y su estado en la barra. Hacer el recorrido de movimiento solo en evaluación supervisada. En la pestaña Control solicitar Avanzar, Girar a la derecha y Detener. Correlacionar el evento individual con las lecturas REST de Monitoreo y el registro persistido. Detener no debe fabricar una fila.
4. Desde una segunda pestaña o Swagger, solicitar un comando real y confirmar que la primera pestaña recibe el evento y reconcilia el historial sin recargar. Si se necesita demostrar más de diez movimientos para la entrega, ejecutarlos manualmente con autorización; corroborar que los diez más recientes permanecen en orden, sin IDs repetidos. Una tabla con diez filas por sí sola no demuestra que haya más de diez registros persistidos.
5. Interrumpir WSS de la pestaña de prueba sin tocar servicios compartidos; por ejemplo, usar desconexión en DevTools y luego recuperar la conexión. Registrar estados WSS y las nuevas consultas de estado e historial. Si se corta toda la red, RDS debe quedar sin verificar; solo su propio diagnóstico 503 permite marcarlo no disponible. Repetir con WSS recuperado y salud real.
6. Guardar el historial anterior y, sin otros movimientos individuales concurrentes, ejecutar una secuencia real y observar inicio, pasos y fin. Verificar que el GET no cambió. Para demostrar que tampoco se modificaron filas fuera de la ventana visible, usar el verificador de solo lectura de RDS del repositorio backend donde esté autorizado. En otra ejecución, comprobar cancelación y prioridad de Detener; no repetir POST cuando la respuesta sea ambigua.
7. Desde el teléfono físico abrir Pages con HTTPS, probar vertical y horizontal, verificar el favicon y el pie, y capturar ambas vistas. Mientras la ventana esté vigente no se debe abrir un formulario de clave. Al terminar detener/cancelar, revocar la ventana y confirmar que la emisión de sesión queda cerrada.

Guardar las imágenes en `evidencias/` o `entregables/`, ambas carpetas
ignoradas. Anotar para cada captura fecha, URL, versión, dispositivo
y si el dato es real o simulado. Si un paso falla, conservar el resultado
y su causa observada en vez de marcarlo aprobado.

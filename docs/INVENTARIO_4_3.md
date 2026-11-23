# Inventario inicial de NODE/01 para la práctica 4.3

Revisión del 23 de noviembre de 2026. La plataforma y sus respaldos pertenecen a una entrega individual. Los equipos de tres intervienen en las pruebas colaborativas de las plataformas individuales.

| Componente | Existe | Se reutiliza | Se modifica | Se crea |
| --- | --- | --- | --- | --- |
| Frontend propio | Base local `ad4207c`, con `1112313`, `09692e2` y el bundle de control sostenido en su historial. | CONTROL, MONITOREO, DEMO, joystick y navegación. | Selección de vehículo, sesión por rol y alcance de REST/WSS. | Portal de acceso, administración comercial, editor y catálogo de exhibición. |
| Backend propio | Base local `3821657`, con `99b99b2`, `012cd21` y respaldo de la práctica 4.2. | FastAPI, Pydantic, repositorios, gestores de DEMO, prioridad de DETENER y broker del dispositivo. | Admisión de la API histórica y WSS cuando la política 4.3 esté activa. | Sesiones, autorización por unidad, inventario comercial y auditoría. |
| MySQL | Contrato histórico local de seis tablas y 21 procedimientos. | IDs físicos, comandos, estado, historial y DEMOS históricos. | Puesta en producción mediante una migración aditiva aprobada. | Tablas comerciales, titularidad, reservas y planes versionados de migración. |
| ESP8266 | Firmware original local y respaldos integrados. | Mapa eléctrico propio, canal privado y protecciones del firmware. | En 4.3 cambia la autorización del origen web. | Ensayos independientes de banco cuando estén autorizados. |
| Distribución | Repositorios de Jack28-08, GitHub Pages y EC2 con Caddy. | Mismo frontend y backend. | Publicación coordinada con migración y activación por política. | Matriz P01–P17, evidencias y guía de mantenimiento. |

La ruta local `C:/Users/joseh/Downloads/Montacargas_AWS_Final_Reconexion_V2.ino` existe. Se localizaron `NODE01_Frontend_Control_Sostenido.bundle`, `NODE01_Backend_Control_Sostenido.bundle` y `NODE01_ESP8266_Sketch_Candidato.zip` en `entregables/`, junto con las versiones integradas posteriores. La guía previa permanece en [CONTROL_SOSTENIDO_DESPLIEGUE.md](CONTROL_SOSTENIDO_DESPLIEGUE.md).

Se localizaron el [enunciado 4.1](Enunciado_Practica_4_1_IoT.txt), el [enunciado 4.2](ENUNCIADO_PRACTICA_4_2.txt) y el prompt maestro adjunto de 4.3. La búsqueda en Descargas, Documentos y OneDrive no encontró un enunciado oficial de 4.3 separado. El apartado 6 y la cantidad institucional exacta de evidencias se deben cotejar con ese original.

## Referencia leída

El punto de partida de la referencia fue el HEAD del backend `5aeac9198e383f7403f498a3284d1924eb0147d4` y el del frontend `9bfff9fc`. Los módulos `platform43` muestran un patrón de separación entre sesión, comercio, operaciones, DEMOS, reservas y WebSocket. La implementación propia conserva la semántica del vehículo, su esquema histórico y sus componentes existentes. [Backend de referencia](https://github.com/yori7v7/vehiculo_iot_api_dev/tree/5aeac9198e383f7403f498a3284d1924eb0147d4) · [Frontend de referencia](https://github.com/yori7v7/control-iot-u4/tree/9bfff9fc)

## Estado de los servicios consultados

El GET de GitHub Pages respondió HTTP 200. El GET de salud de la API y el de Swagger agotaron un plazo de 7 segundos. La consulta de salud de RDS no pudo resolver el nombre del host en su intento. RDS productivo queda sin verificar. [GitHub Pages](https://jack28-08.github.io/control-iot-jack/) · [Swagger](https://184-72-72-255.sslip.io/docs)

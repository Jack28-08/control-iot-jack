# Entrega individual de NODE/01

La práctica 4.3 agrega administración comercial al mismo frontend y backend de CONTROL y MONITOREO. El trabajo de base se puede revisar en estas cinco guías.

- [Inventario inicial](INVENTARIO_4_3.md)
- [Auditoría REST, WSS y procedimientos](AUDITORIA_API_4_3.md)
- [Inventario MySQL y diagrama de relaciones](VERIFICACION_MYSQL_4_3.md)
- [Matriz P01 a P17, permisos y rondas](PRUEBAS_COLABORATIVAS_4_3.md)
- [Guía de instalación y recuperación](DESPLIEGUE_4_3.md)

En `entregables/practica-4.3/` se conservan el informe Word/PDF, exportaciones OpenAPI, copia del DDL histórico verificado en un servidor aislado, scripts versionados, reportes y capturas. Las capturas de Chromium se generaron con dobles REST/WSS. Los casos MySQL utilizaron servidores aislados y registros ficticios. Amazon RDS requiere verificación, respaldo y autorización propios antes de la migración.

La revisión pasó 226 pruebas de Python y 104 de Node.js. Chromium verificó Administración 4.3 en 18 tamaños y la regresión de CONTROL, MONITOREO y DEMO en 22. En la copia histórica de MySQL se comprobó el cierre del monitor tras reasignar, el rechazo del ticket usado y el bloqueo de lecturas anteriores a la titularidad. El historial conserva la precisión de segundos del esquema histórico. La vista omite un registro ambiguo del mismo segundo que la reasignación para proteger los datos del titular anterior.

El OpenAPI local de esta revisión registra 51 rutas diferentes. La compatibilidad queda disponible con `IOT43_ENABLED=false`. La activación coordinada y la revisión del firmware en sitio figuran en la guía de instalación.

Las revisiones publicadas mantienen las URLs originales. [GitHub Pages](https://jack28-08.github.io/control-iot-jack/) · [Frontend](https://github.com/Jack28-08/control-iot-jack) · [Backend](https://github.com/Jack28-08/api-vehiculo-iot) · [Swagger](https://184-72-72-255.sslip.io/docs)

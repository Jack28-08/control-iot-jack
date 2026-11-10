# Publicación verificada del frontend

El 9 de noviembre de 2026, después de la autorización expresa del alumno, se creó el repositorio público [Jack28-08/control-iot-jack](https://github.com/Jack28-08/control-iot-jack) y se publicó [NODE/01 en GitHub Pages](https://jack28-08.github.io/control-iot-jack/).

- Rama: `main`; carpeta de publicación: `/`.
- `build_type=legacy`; `https_enforced=true`; estado de Pages: `built`.
- Primer despliegue: commit `90ad738`, posterior al commit de código `a8e2b18`.
- [Ejecución de Pages](https://github.com/Jack28-08/control-iot-jack/actions/runs/42759163363): `completed / success`.
- Desde esta PC, curl devolvió HTTP **200** y `ssl_verify_result=0`, sin desactivar validación TLS.
- Se abrieron la URL pública y sus vistas de escritorio y tamaños móviles emulados en navegador. No se capturaron errores JavaScript en la consola inspeccionada.

| Recurso de la subruta | Respuesta real |
| --- | --- |
| `index.html` | HTTP 200 |
| `js/main.js` | HTTP 200 |
| `js/control.js` | HTTP 200 |
| `js/api.js` | HTTP 200 |
| `js/socket.js` | HTTP 200 |
| `js/joystick.js` | HTTP 200 |
| `css/styles.css?v=1.1.1` | HTTP 200 |
| `assets/favicon.svg` | HTTP 200 |

El DOM público contiene el favicon relativo y el pie exacto `Desarrollado por José Héctor Rosales Cabrera · 2026`. Se verificó ausencia de desbordamiento en 1440×1000, 390×844 y 844×390. Las capturas auténticas de la revisión pública están en `evidencias/07-pages-*`, excluidas de Git; son capturas de navegador, no un teléfono físico.

Los comandos ejecutados fueron `gh repo create ... --public --source . --remote origin`, `git push -u origin main` mediante la sesión existente de gh, y la API de Pages con JSON `source: {branch: main, path: /}`. No se imprimieron tokens ni se añadieron credenciales al proyecto. [DESPLIEGUE](./DESPLIEGUE.md) conserva el procedimiento completo de PowerShell.

No se publicaron Word/PDF, capturas ni archivos locales; las carpetas `entregables`, `evidencias` y `.local` están ignoradas y no aparecen en `git ls-files`. Sólo se publicó el frontend. No se modificó el repositorio del backend, AWS ni RDS.

**Límite de integración:** publicar Pages no resuelve el timeout de TCP 443 hacia la API. La página pública mantiene los estados sin verificar, sin inventar catálogos ni habilitar DEMO sin pasos reales. Faltan la disponibilidad de AWS, CORS con respuesta real, los POST autorizados, el cliente WSS independiente y el teléfono físico. No se ejecutó ningún POST de control o DEMO.

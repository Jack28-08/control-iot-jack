# Publicación exclusiva del frontend en GitHub Pages

Repositorio previsto: [Jack28-08/control-iot-jack](https://github.com/Jack28-08/control-iot-jack). Página prevista: [https://jack28-08.github.io/control-iot-jack/](https://jack28-08.github.io/control-iot-jack/). Son destinos previstos: no afirmar que están publicados hasta verificar las respuestas reales.

Los comandos de creación, push y configuración de Pages sólo se ejecutan tras autorización explícita para publicar este frontend. No afectan `Jack28-08/api-vehiculo-iot`, AWS, SP ni RDS. Los entregables Word/PDF y capturas permanecen en carpetas locales excluidas de Git. No se usa Vercel.

## 1. Revisar carpeta y cuenta

PowerShell, desde la carpeta del frontend:

```powershell
Set-Location -LiteralPath 'C:\Users\joseh\Downloads\control-iot-jack'
$frontendRoot = (Get-Location).Path
$actualGitRoot = git rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0) { throw 'Falta inicializar el repositorio local del frontend.' }
$actualGitRoot = (Resolve-Path -LiteralPath $actualGitRoot).Path
if ($actualGitRoot -ne $frontendRoot) { throw 'Git apunta fuera de control-iot-jack. No continuar.' }
git status --short --branch
git remote -v
npm test
if ($LASTEXITCODE -ne 0) { throw 'Resolver los tests antes de publicar.' }
gh auth status
$connectedLogin = gh api user --jq .login
if ($LASTEXITCODE -ne 0 -or $connectedLogin -ne 'Jack28-08') { throw 'La cuenta activa debe ser Jack28-08.' }
```

No ejecutar `gh auth token` ni imprimir variables de autenticación. Si falta sesión, realizar personalmente `gh auth login --hostname github.com --web` y repetir la comprobación de cuenta.

La raíz Git debe ser exactamente esta carpeta, nunca `C:\Users\joseh`. Si aún no existe su `.git` propio, inicializarlo explícitamente aquí con `git init -b main`; esto no borra ni mueve el repositorio del perfil. Si ya existe historial, conservarlo y revisar la rama antes de cualquier cambio.

## 2. Revisar y confirmar sólo archivos del frontend

Si los commits ya están preparados, revisar `git log --oneline` y omitir el commit duplicado. Para registrar cambios nuevos se usa una lista explícita:

```powershell
git add -- .gitignore .nojekyll index.html package.json README.md assets css js tests
git add -- docs/PRUEBAS.md docs/CONCLUSIONES_BASE.md docs/DESPLIEGUE.md docs/CORS_PROPUESTO.md
git diff --cached --stat
git diff --cached --name-only
git status --short
```

Revisar que no entren claves, archivos `.env`, certificados privados, capturas, Word/PDF ni archivos de backend. Los patrones de `.gitignore` no retiran archivos que ya estuvieran versionados: `git ls-files entregables evidencias .local` debe estar vacío. No guardar claves reales ni siquiera en tests o documentación. Ejecutar nuevamente `npm test` si se modificó código.

Después de revisar el contenido y sólo si existen cambios preparados:

```powershell
git commit -m 'fix: reforzar control IoT, detencion prioritaria y diagnosticos independientes'
git branch --show-current
git log --oneline -5
```

La rama que se publicará debe llamarse `main`. En un repositorio nuevo, si el commit quedó en otra rama y aún no existe `main`, usar `git branch -m main`. No renombrar ramas con trabajo ajeno ni usar `--force`.

## 3. Crear el repositorio separado y subir main

Consultar primero si el destino existe:

```powershell
gh repo view Jack28-08/control-iot-jack --json nameWithOwner,url,isPrivate
```

Si GitHub confirma 404 y la cuenta tiene permiso para crear, ejecutar el siguiente bloque tras autorizar la publicación. Otro error, por ejemplo de red o permiso, no prueba inexistencia.

```powershell
gh repo create Jack28-08/control-iot-jack --public --source . --remote origin --description 'Practica 4.1: frontend NODE/01 de control IoT para la API existente en AWS'
if ($LASTEXITCODE -ne 0) { throw 'No se creo el repositorio; revisar el error antes de continuar.' }
git remote -v
```

Si el repositorio ya existe y fue revisado como destino correcto, omitir `gh repo create`. Si falta `origin`, agregarlo con `git remote add origin https://github.com/Jack28-08/control-iot-jack.git`. Si `origin` ya apunta a otro proyecto, detenerse y revisarlo; no sustituirlo automáticamente.

Comprobar el destino antes del push:

```powershell
$frontendRemote = git remote get-url origin
if ($frontendRemote -notin @('https://github.com/Jack28-08/control-iot-jack.git', 'git@github.com:Jack28-08/control-iot-jack.git')) { throw 'El remoto no es el frontend autorizado.' }
if ((git branch --show-current) -ne 'main') { throw 'Revisar la rama; se requiere main.' }
git push -u origin main
if ($LASTEXITCODE -ne 0) { throw 'El push fallo; no usar force ni sobrescribir el remoto.' }
gh repo view Jack28-08/control-iot-jack --json nameWithOwner,url,defaultBranchRef
```

`--source` enlaza el proyecto local y `--remote` nombra el remoto; se omite `--push` para revisar el destino antes de subir. [Manual oficial de gh repo create](https://cli.github.com/manual/gh_repo_create).

## 4. Publicar main desde la raíz

La rama remota `main` debe existir. En la web también puede configurarse **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**. GitHub permite raíz o `/docs`; esta práctica utiliza la raíz. [Fuente oficial de publicación](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Alternativa exacta con `gh`, tras la misma autorización de publicación: consultar primero si Pages existe con `gh api repos/Jack28-08/control-iot-jack/pages`. Sólo si devuelve 404, crearlo con POST. Si ya existe, revisar sus valores y usar PUT en lugar de POST para actualizarlo.

```powershell
$pagesPayload = @{ build_type = 'legacy'; source = @{ branch = 'main'; path = '/' } } | ConvertTo-Json -Depth 4
$pagesInputPath = Join-Path ([IO.Path]::GetTempPath()) ('control-iot-pages-' + [guid]::NewGuid().ToString() + '.json')
[IO.File]::WriteAllText($pagesInputPath, $pagesPayload, [Text.UTF8Encoding]::new($false))
try {
    gh api repos/Jack28-08/control-iot-jack/pages --method POST --input $pagesInputPath
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo configurar Pages; revisar la respuesta.' }
} finally {
    Remove-Item -LiteralPath $pagesInputPath
}
```

El JSON temporal no contiene secretos. `--input` evita problemas de escape en PowerShell. `build_type=legacy` corresponde a publicación desde rama. Un 409/422 no es éxito y debe revisarse. [API oficial de Pages](https://docs.github.com/en/rest/pages/pages), [manual oficial de gh api](https://cli.github.com/manual/gh_api).

## 5. HTTPS y verificación pública

Consultar el estado real; repetir manualmente tras unos minutos si el build sigue pendiente:

```powershell
gh api repos/Jack28-08/control-iot-jack/pages --jq '{url:.html_url,status:.status,source:.source,https_enforced:.https_enforced,certificate:.https_certificate}'
gh api repos/Jack28-08/control-iot-jack/pages/builds/latest --jq '{status:.status,error:.error,commit:.commit}'
gh run list --repo Jack28-08/control-iot-jack --limit 5
```

El dominio `github.io` soporta HTTPS. Cuando Pages esté listo, activar **Enforce HTTPS** en Settings → Pages, o mediante este PUT autorizado:

```powershell
$httpsInputPath = Join-Path ([IO.Path]::GetTempPath()) ('control-iot-https-' + [guid]::NewGuid().ToString() + '.json')
[IO.File]::WriteAllText($httpsInputPath, '{"https_enforced":true}', [Text.UTF8Encoding]::new($false))
try {
    gh api repos/Jack28-08/control-iot-jack/pages --method PUT --input $httpsInputPath
    if ($LASTEXITCODE -ne 0) { throw 'HTTPS pendiente: revisar el certificado y Pages.' }
} finally {
    Remove-Item -LiteralPath $httpsInputPath
}
curl.exe --connect-timeout 10 --max-time 20 --include --head https://jack28-08.github.io/control-iot-jack/
curl.exe --connect-timeout 10 --max-time 20 --include --head https://jack28-08.github.io/control-iot-jack/assets/favicon.svg
```

No usar `-k`: una respuesta HTTPS obtenida con validación normal aporta una comprobación del certificado desde esta computadora. Abrir además la página en el navegador y comprobar que no exista advertencia TLS ni contenido mixto. [Guía oficial de HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

En Network verificar 200 de `./css/styles.css`, `./js/main.js`, módulos importados y favicon; revisar consola, diseño móvil y pie `Desarrollado por José Héctor Rosales Cabrera · 2026`. Comprobar salud y catálogos mediante GET reales, y CORS del origen `https://jack28-08.github.io` según [CORS_PROPUESTO.md](./CORS_PROPUESTO.md). Una página publicada puede cargar su diseño aunque AWS esté inaccesible o CORS bloquee sus consultas.

No ejecutar movimientos, STOP ni DEMO para validar el despliegue sin autorización explícita. La API key se introduce personalmente en Acceso y vive sólo en memoria; nunca va a GitHub, una variable de Pages ni un archivo de configuración. Completar las siete evidencias según [PRUEBAS.md](./PRUEBAS.md), sin declarar pruebas pendientes como aprobadas.

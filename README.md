# PR Radar

Extensión de navegador (Chrome, Edge, Brave… cualquier Chromium) que te avisa de lo que de verdad importa en GitHub:

- **Reviews**: alguien te pide revisión. Si ya revisaste y te la vuelven a pedir, vuelve a avisar.
- **Mis PRs**: avisa cuando cambia el estado de review (aprobada, cambios pedidos) o el CI (en verde, fallando).
- **Menciones**: issues y PRs abiertas donde te mencionan.

Cada vista es una búsqueda normal de GitHub, así que puedes editarlas, añadir las tuyas y decidir cuáles avisan y cuáles cuentan en el icono.

## Instalación (desde el código)

```bash
pnpm install
pnpm build
```

1. Abre `chrome://extensions` y activa el **Modo desarrollador**.
2. Pulsa **Cargar descomprimida** y elige la carpeta `dist/`.
3. Se abrirá la página de ajustes: pega un token de GitHub y guarda.

### Token

- Lo más sencillo: un [token clásico con scope `repo`](https://github.com/settings/tokens/new?scopes=repo&description=PR%20Radar).
- Alternativa: un token *fine-grained* con lectura de Pull requests e Issues (tu organización tiene que permitirlos).

El token se guarda solo en `chrome.storage.local` de tu navegador y únicamente se envía a `api.github.com`. No hay servidor intermedio.

## Cómo funciona

- Un service worker consulta la API GraphQL de GitHub cada N minutos (configurable), con todas las vistas en una sola petición.
- La primera vez que ve una vista se queda con el estado actual en silencio, así no te llegan 50 avisos al instalarla.
- "Marcar como hecha" oculta un elemento hasta que su estado cambia.

## Desarrollo

```bash
pnpm dev        # recompila dist/ en cada cambio; recarga la extensión en chrome://extensions
pnpm typecheck
```

Stack: Manifest V3, React 19, TypeScript, Vite y Tailwind CSS 4.

## Licencia

[MIT](LICENSE)

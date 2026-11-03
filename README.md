# PR Radar

Extensión de navegador (Chrome, Brave, Edge… cualquier Chromium) que te avisa solo de lo que tiene que ver contigo en GitHub, y solo en los repos que elijas:

- **Para revisar**: te piden review. Si ya la revisaste y te la vuelven a pedir, lo marca como tal.
- **Mis PRs**: tus PRs abiertas. Avisa cuando alguien hace review (quién y qué: aprobada, cambios pedidos, comentario) o cuando el CI pasa a verde o falla.
- **Revisadas**: PRs que ya revisaste. Avisa cuando suben commits nuevos.
- **Menciones**: dónde te mencionan, quién y el trozo exacto del comentario, con enlace directo a él.

Cada pestaña es una búsqueda de GitHub editable, y puedes añadir las tuyas. Los ajustes se guardan solos.

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

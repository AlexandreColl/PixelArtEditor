# Contribuir a Pixel Art Editor

¡Gracias por tu interés en contribuir! Esta guía resume cómo trabajamos.

## Flujo de ramas

El proyecto sigue un modelo inspirado en Git Flow:

| Rama               | Propósito                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `main`             | Código publicado. Cada commit en `main` corresponde a una versión etiquetada (`vX.Y.Z`).                                |
| `develop`          | Rama de integración. Aquí se fusionan las funcionalidades terminadas.                                                   |
| `feature/<nombre>` | Nuevas funcionalidades. Salen de `develop` y vuelven a `develop` mediante PR.                                           |
| `fix/<nombre>`     | Correcciones no urgentes. Salen de `develop`.                                                                           |
| `release/X.Y.Z`    | Preparación de una versión (changelog, versión, ajustes finales). Sale de `develop` y se fusiona en `main` y `develop`. |
| `hotfix/X.Y.Z`     | Correcciones urgentes sobre una versión publicada. Sale de `main` y se fusiona en `main` y `develop`.                   |

## Convención de commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) precedidos de un emoji de [gitmoji](https://gitmoji.dev/):
`<emoji> <tipo>(<ámbito>): <descripción>`. El emoji va como carácter Unicode, el ámbito es opcional y la
descripción va en imperativo, en minúsculas y sin punto final.

```
✨ feat(canvas): add line tool
🐛 fix(fill): keep transparent edges when flooding
📝 docs: update readme
♻️ refactor(editor): simplify history handling
⬆️ build(deps): bump vite to 8.1
🔀 Merge branch 'feature/line-tool' into develop
```

| Emoji | Tipo             | Cuándo                                |
| ----- | ---------------- | ------------------------------------- |
| ✨    | `feat`           | nueva funcionalidad                   |
| 🐛    | `fix`            | corrección de error                   |
| 🚑️    | `fix`            | hotfix crítico                        |
| 🔒️    | `fix`            | corrección de seguridad               |
| 📝    | `docs`           | documentación                         |
| ♻️    | `refactor`       | refactor sin cambio de comportamiento |
| 🎨    | `style`          | formato / estructura del código       |
| ⚡️    | `perf`           | rendimiento                           |
| ✅    | `test`           | tests                                 |
| 👷    | `ci`             | CI/CD                                 |
| ⬆️    | `build(deps)`    | actualizar dependencias               |
| 🔧    | `chore`          | ficheros de configuración             |
| 🔥    | `chore`          | eliminar código o ficheros            |
| 🔖    | `chore(release)` | release / etiqueta de versión         |
| ⏪️    | `revert`         | revertir cambios                      |

## Entorno de desarrollo

Consulta la sección **Primeros Pasos** del [README](README.md). Antes de abrir un PR:

```sh
pnpm install
pnpm run format:check
pnpm run build
```

## Pull Requests

1. Crea tu rama desde `develop`.
2. Mantén los cambios acotados a un único objetivo.
3. Añade una entrada en la sección `[Unreleased]` del [CHANGELOG](CHANGELOG.md).
4. Abre el PR contra `develop` y rellena la plantilla.

## Proceso de release

1. Crea `release/X.Y.Z` desde `develop`.
2. Actualiza la versión en `package.json`, `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json`.
3. Mueve las entradas de `[Unreleased]` a `[X.Y.Z] - AAAA-MM-DD` en el CHANGELOG.
4. Fusiona en `main` con `--no-ff` y crea la etiqueta anotada `vX.Y.Z`.
5. Fusiona `main` de vuelta en `develop`.
6. Sube `main`, `develop` y la etiqueta: el workflow de release genera los instaladores en un borrador de GitHub Release.

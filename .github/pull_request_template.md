## Descripción

<!-- ¿Qué cambia este PR y por qué? -->

## Tipo de cambio

- [ ] feat: nueva funcionalidad
- [ ] fix: corrección de error
- [ ] docs / chore / refactor

## Checklist

- [ ] El PR apunta a `develop` (o a `main` si es un `release/*` o `hotfix/*`)
- [ ] `pnpm run format:check`, `pnpm run lint`, `pnpm test` y `pnpm run build` pasan en local
- [ ] Si toca `src-tauri/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` y `cargo test` pasan
- [ ] He añadido una entrada en `[Unreleased]` del CHANGELOG
- [ ] He probado el cambio con `pnpm run tauri:dev`

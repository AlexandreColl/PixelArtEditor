# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto se adhiere a [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

## [0.1.0] - 2026-10-22

Primera versión pública.

### Añadido

- Editor de pixel art de escritorio construido con Tauri 2, React 19 y TypeScript.
- Herramientas de dibujo: lápiz, borrador, bote de pintura, selector de color, selección rectangular y sombreado.
- Tamaño de pincel ajustable (1–16) para lápiz y borrador.
- Historial ilimitado de deshacer/rehacer (`Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+Y`).
- Apertura y guardado de PNG en disco (`Ctrl+O`, `Ctrl+S`) y carga mediante arrastrar y soltar.
- Creación de un lienzo nuevo en blanco.
- Zoom con la rueda del ratón y paneo con el botón central.
- Paleta con color primario/secundario y muestras predefinidas.
- Panel de IA para editar el arte con lenguaje natural, con soporte para OpenAI, Anthropic, Google Gemini y Groq.
- Barra de herramientas con iconos de lucide-react.
- Scripts `dev.bat` / `build.bat` y helper `scripts/dev.ps1` para Windows.

[Unreleased]: https://github.com/AlexandreColl/PixelArtEditor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AlexandreColl/PixelArtEditor/releases/tag/v0.1.0

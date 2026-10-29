# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto se adhiere a [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Añadido

- Conversión de imágenes a pixel art al importarlas: tamaño de salida, número de colores (paleta por median cut), dithering Floyd–Steinberg, umbral de transparencia y vista previa en vivo.
- Botón **Import image as pixel art** para convertir cualquier imagen, aunque sea pequeña.
- Botón y atajo (`G`) para mostrar u ocultar la cuadrícula. Con zoom inferior a 4x no se dibuja, porque taparía los píxeles.
- Botón y atajo (`Ctrl+0`) para ajustar el lienzo a la ventana.
- Dibujo simétrico con espejo horizontal y/o vertical para lápiz, borrador y formas, con los ejes marcados en el lienzo.
- Herramientas de línea, rectángulo y elipse, con vista previa mientras se arrastra, relleno opcional y grosor según el tamaño de pincel.
- Exportación de PNG escalado (×1, ×2, ×4, ×8) sin suavizado y con transparencia.

### Cambiado

- La barra de herramientas usa dos columnas y agrupa los botones de zoom para que quepan las herramientas nuevas en la ventana de 800×600.
- Las imágenes de más de 128 px o con muchos colores ya no se importan a resolución completa: se abre el diálogo de conversión. Abrirlas sin convertir está limitado a 512 px.

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
- Paleta con color primario/secundario y muestras predefinidas: el clic izquierdo usa el primario y el derecho el secundario, con botón para intercambiarlos.
- Panel de IA para editar el arte (o solo la región seleccionada) con lenguaje natural, con soporte para OpenAI, Anthropic y Google Gemini. Las ediciones de IA se pueden deshacer.
- Barra de herramientas con iconos de lucide-react.
- Scripts `dev.bat` / `build.bat` y helper `scripts/dev.ps1` para Windows.

[Unreleased]: https://github.com/AlexandreColl/PixelArtEditor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AlexandreColl/PixelArtEditor/releases/tag/v0.1.0

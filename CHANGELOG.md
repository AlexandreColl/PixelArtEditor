# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto se adhiere a [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

## [0.4.0] - 2026-11-14

### Añadido

- Animación por fotogramas: tira de fotogramas para añadir, duplicar, borrar y reordenar, y `,` / `.` para moverse entre ellos. Deshacer y rehacer cubren toda la animación.
- Papel cebolla: el fotograma anterior se ve en rojo y transparente bajo el actual.
- Vista previa de la animación con play/pausa (`P`), velocidad en fps y alternancia entre tamaño real y ampliado.
- Guardar con varios fotogramas los escribe en fila en el PNG, con la disposición y la velocidad en un bloque de texto del archivo, y al abrirlo se recuperan los fotogramas.
- Diálogo de exportación (`Ctrl+E`): fotograma actual, sprite sheet con columnas a elegir o GIF animado, a escala ×1–×8.
- Importar un sprite sheet cortándolo en fotogramas del tamaño indicado.
- Atajos de una tecla para las herramientas (`B` `E` `F` `I` `L` `R` `O` `S` `M`) y `X` para intercambiar colores.
- Tooltips propios que muestran el nombre y el atajo de cada botón; los botones de solo icono tienen ahora nombre accesible.
- Contorno sobre el lienzo de los píxeles que pintará la herramienta, con el tamaño de pincel y el espejo.
- Coordenadas y color del píxel bajo el cursor, y tamaño de la selección, en la barra de estado.
- Selector de color integrado (saturación/brillo, tono y campo hexadecimal) siempre visible, y colores primario y secundario superpuestos con botón de intercambio.

### Corregido

- Los píxeles transparentes se pintaban de gris `#e0e0e0` y no se distinguían de ese color; ahora se ven sobre un fondo de cuadros, y los semitransparentes se ven como al exportar.

### Cambiado

- Las cuatro entradas **Export PNG ×N** del menú File se sustituyen por **Export…**, que incluye la escala.
- **Reducir a la paleta** sin selección se aplica a todos los fotogramas.
- Las acciones de archivo (nuevo, abrir, importar como pixel art, guardar y exportar PNG) pasan a un menú **File** en la cabecera, junto al botón de guardar.
- El tamaño del lienzo también se aplica pulsando Enter en los campos W/H.
- `App.tsx` se divide: los atajos de teclado, las acciones de archivo, los avisos y el tamaño del lienzo tienen ahora su propio hook o componente.

## [0.3.0] - 2026-11-10

Paletas editables con importación y exportación, bloqueo del dibujo a la paleta, tests automáticos y toolchain actualizado.

### Añadido

- Paleta editable que se recuerda entre sesiones: añadir el color primario, quitar con `Ctrl+clic`, reordenar arrastrando y restaurar la predefinida.
- Importación y exportación de paletas `.gpl` (GIMP, Aseprite, Krita) y `.hex` (Lospec).
- Bloqueo del dibujo a la paleta: los colores elegidos, el sombreado y los resultados de la IA se ajustan al color más cercano.
- Reducir el lienzo o la selección a los colores de la paleta, en un solo paso deshacible.
- Tests automáticos con Vitest para las utilidades (color, formas, conversión a pixel art, PNG) y para el historial, el dibujo y la selección del editor; se ejecutan en el CI.

### Cambiado

- El CI ejecuta los tests de Rust (`cargo test`) en lugar de `cargo check`.
- La exportación a sprite sheet pasa al roadmap de la 0.4, porque necesita fotogramas.
- Toolchain y dependencias actualizadas a sus últimas versiones: Node 26 LTS, pnpm 12, TypeScript 7, Vite 8.3, React 19.3, Tauri 2.12, Rust edition 2024 y acciones de GitHub (checkout v7, setup-node v7, pnpm/action-setup v6, tauri-action v1).
- La configuración de pnpm pasa de `.npmrc` a `pnpm-workspace.yaml`, y los tipos y el plugin de Vite pasan a `devDependencies`.

## [0.2.0] - 2026-10-29

Herramientas de dibujo y selección, importación de imágenes y exportación escalada.

### Añadido

- Conversión de imágenes a pixel art al importarlas: tamaño de salida, número de colores (paleta por median cut), dithering Floyd–Steinberg, umbral de transparencia y vista previa en vivo.
- Botón **Import image as pixel art** para convertir cualquier imagen, aunque sea pequeña.
- Botón y atajo (`G`) para mostrar u ocultar la cuadrícula. Con zoom inferior a 4x no se dibuja, porque taparía los píxeles.
- Botón y atajo (`Ctrl+0`) para ajustar el lienzo a la ventana.
- Mover, copiar, cortar, pegar y borrar la selección (arrastre, `Alt`+arrastre para copiar, flechas, `Ctrl+C/X/V/A`, `Supr` y `Esc`), con botones en la barra lateral. Cada operación se deshace de una vez y deshacer recupera también la selección.
- Dibujo simétrico con espejo horizontal y/o vertical para lápiz, borrador y formas, con los ejes marcados en el lienzo.
- Herramientas de línea, rectángulo y elipse, con vista previa mientras se arrastra, relleno opcional y grosor según el tamaño de pincel.
- Exportación de PNG escalado (×1, ×2, ×4, ×8) sin suavizado y con transparencia.

### Corregido

- El rectángulo de selección dejaba de fijarse al soltar el botón y seguía cambiando de tamaño al mover el ratón sin pulsar.

### Cambiado

- Un clic sin arrastrar con la herramienta de selección ahora deselecciona, en lugar de crear una selección de 1×1.
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

[Unreleased]: https://github.com/AlexandreColl/PixelArtEditor/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/AlexandreColl/PixelArtEditor/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/AlexandreColl/PixelArtEditor/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/AlexandreColl/PixelArtEditor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/AlexandreColl/PixelArtEditor/releases/tag/v0.1.0

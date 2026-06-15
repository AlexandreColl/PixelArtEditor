<a id="readme-top"></a>

[![License](https://img.shields.io/badge/license-MIT-e94560?style=for-the-badge)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge)]()
[![pnpm](https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white)]()
[![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131?style=for-the-badge&logo=tauri&logoColor=white)]()
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)]()
[![PRs](https://img.shields.io/badge/PRs-welcome-3FC7EB?style=for-the-badge)]()
[![GitHub](https://img.shields.io/badge/GitHub-AlexandreColl-181717?style=for-the-badge&logo=github)](https://github.com/AlexandreColl/PixelArtEditor)

<br />
<div align="center">
  <a href="https://github.com/AlexandreColl/PixelArtEditor">
    <img src="src-tauri/icons/icon.png" alt="Logo" width="80" height="80">
  </a>
  <h1 align="center">Pixel Art Editor</h1>

  <p align="center">
    Editor de pixel art de escritorio con agente IA integrado
    <br />
    <a href="#-funcionalidades"><strong>Explorar funcionalidades »</strong></a>
    <br />
    <br />
    <a href="#-primeros-pasos">Primeros Pasos</a>
    &middot;
    <a href="https://github.com/AlexandreColl/PixelArtEditor/issues/new?labels=bug">Reportar Error</a>
    &middot;
    <a href="https://github.com/AlexandreColl/PixelArtEditor/issues/new?labels=enhancement">Solicitar Funcionalidad</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Tabla de Contenidos</summary>
  <ol>
    <li>
      <a href="#-sobre-el-proyecto">Sobre el Proyecto</a>
      <ul>
        <li><a href="#construido-con">Construido Con</a></li>
      </ul>
    </li>
    <li>
      <a href="#-primeros-pasos">Primeros Pasos</a>
      <ul>
        <li><a href="#requisitos">Requisitos</a></li>
        <li><a href="#instalación">Instalación</a></li>
      </ul>
    </li>
    <li><a href="#-uso">Uso</a></li>
    <li><a href="#-atajos-de-teclado">Atajos de Teclado</a></li>
    <li><a href="#-desarrollo">Desarrollo</a></li>
    <li><a href="#-estructura-del-proyecto">Estructura del Proyecto</a></li>
    <li><a href="#-roadmap">Roadmap</a></li>
    <li><a href="#-contribuir">Contribuir</a></li>
    <li><a href="#-licencia">Licencia</a></li>
    <li><a href="#-contacto">Contacto</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## 🎨 Sobre el Proyecto

Pixel Art Editor es una aplicación de escritorio para crear y editar pixel art, sprites y assets para videojuegos. Está construida con **Tauri** + **React** + **TypeScript**, lo que resulta en un binario pequeño, rápido y nativo.

El editor ofrece herramientas esenciales de dibujo (lápiz, borrador, bote de pintura, selector de color, selección y paneo), historia completa de deshacer/rehacer, y la posibilidad de abrir y guardar archivos PNG directamente desde el sistema de archivos.

Además, incluye un **panel de IA** que permite modificar el arte mediante lenguaje natural usando OpenAI GPT-4o con visión, ideal para iterar rápido sin necesidad de editar píxel por píxel.

Características principales:
* :pencil2: Herramientas completas: lápiz, borrador, relleno, selector de color, selección, sombreado y mano
* :floppy_disk: Abre y guarda PNG reales directamente en tu disco
* :robot: Agente IA integrado que entiende tu arte y lo modifica con lenguaje natural
* :arrows_counterclockwise: Historia ilimitada de deshacer/rehacer (Ctrl+Z / Ctrl+Shift+Z)
* :mag: Zoom y paneo con rueda del ratón y herramienta mano
* :rainbow: Paleta de colores con colores primario/secundario y muestras predefinidas

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

### Construido Con

* [![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131?style=for-the-badge&logo=tauri&logoColor=white)](https://v2.tauri.app/)
* [![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
* [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
* [![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
* [![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
* [![pnpm](https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](https://pnpm.io/)
* [![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/)

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

<!-- GETTING STARTED -->
## 🚀 Primeros Pasos

Para obtener una copia local y ejecutarla, sigue estos pasos.

### Requisitos

* **Node.js** v18 o superior
* **pnpm**
  ```sh
  npm install -g pnpm
  ```
* **Rust** (instalar via [rustup.rs](https://rustup.rs/))
* **Visual Studio Build Tools 2022** con el workload "Desarrollo de escritorio con C++" (solo Windows)

### Instalación

1. Clona el repositorio
   ```sh
   git clone https://github.com/AlexandreColl/PixelArtEditor.git
   cd PixelArtEditor
   ```
2. Instala las dependencias de JavaScript
   ```sh
   pnpm install
   ```
3. Inicia en modo desarrollo
   ```sh
   pnpm run tauri:dev
   ```

> [!NOTE]
> En Windows, `pnpm run tauri:dev` configura automáticamente el entorno de Visual Studio C++. Si ejecutas `pnpm tauri dev` directamente, usa la "Developer Command Prompt for VS 2022".

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

<!-- USAGE -->
## 🎮 Uso

### Herramientas

| Icono | Herramienta | Descripción |
|-------|-------------|-------------|
| ✏️ | Lápiz | Dibuja píxel a píxel con el color primario |
| 🧹 | Borrador | Elimina píxeles (los deja transparentes) |
| 💧 | Bote de pintura | Rellena una región conectada del mismo color |
| 💉 | Selector de color | Captura el color de un píxel |
| 🌗 | Sombreado | Difumina mezclando colores de píxeles adyacentes |
| 👉 | Selección | Selecciona una región rectangular |
| ✋ | Mano | Desplaza la vista (pan) |

### Carga y guardado

* **Abrir imagen** — `Ctrl+O` o arrastra un PNG directamente al editor
* **Guardar** — `Ctrl+S` sobrescribe el archivo original
* **Guardar como** — `Ctrl+Shift+S` elige una nueva ubicación

### Agente IA

1. Abre el panel IA con el botón 🤖 en la esquina superior derecha
2. Introduce tu clave de API de OpenAI (se guarda localmente)
3. Selecciona una región con la herramienta 👉
4. Describe el cambio que quieres (ej: "haz el fondo azul" o "duplica este sprite")
5. Revisa el resultado y haz clic en **Aplicar Edición**

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

<!-- KEYBOARD SHORTCUTS -->
## ⌨️ Atajos de Teclado

| Tecla | Acción |
|-------|--------|
| `Ctrl+Z` | Deshacer |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Rehacer |
| `Ctrl+S` | Guardar PNG |
| `Ctrl+Shift+S` | Guardar como... |
| `Ctrl+O` | Abrir imagen |

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

<!-- DEVELOPMENT -->
## 🛠️ Desarrollo

### Build producción

```sh
pnpm run tauri:build
```

El ejecutable se genera en `src-tauri/target/release/app.exe`. También se crean instaladores MSI y NSIS en la carpeta `bundle/`.

### Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `pnpm run dev` | Compila el frontend (sin Tauri) |
| `pnpm run build` | Compila TypeScript + Vite |
| `pnpm run tauri:dev` | Inicia en modo desarrollo con recarga en caliente |
| `pnpm run tauri:build` | Compila el binario de producción |

### Windows

Puedes hacer doble clic en `build.bat` o `dev.bat` para compilar o ejecutar sin abrir la terminal.

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

<!-- PROJECT STRUCTURE -->
## 📁 Estructura del Proyecto

```
pixel-art-editor/
├── src/                        # Frontend React
│   ├── components/             # Canvas, Toolbar, ColorPalette, AIChat
│   │   ├── Canvas.tsx          # Lienzo con zoom, grid y dibujo
│   │   ├── Toolbar.tsx         # Barra de herramientas
│   │   ├── ColorPalette.tsx    # Selector de colores
│   │   └── AIChat.tsx          # Panel de chat con IA
│   ├── hooks/
│   │   └── useEditor.ts        # Estado global, herramientas e historial
│   ├── ai/
│   │   └── openai.ts           # Cliente OpenAI (visión + JSON)
│   ├── types/
│   │   └── index.ts            # Tipos compartidos
│   └── App.tsx                 # Layout principal y lógica de guardado
├── src-tauri/                  # Backend Rust (Tauri)
│   ├── src/
│   │   └── lib.rs              # Comandos Tauri (save_png_file)
│   ├── capabilities/
│   │   └── default.json        # Permisos de plugins
│   ├── icons/                  # Iconos de la aplicación
│   └── tauri.conf.json         # Configuración de ventana y build
├── scripts/
│   └── dev.ps1                 # Helper que configura VS + Node + Cargo
├── build.bat                   # Build con un clic
├── dev.bat                     # Dev con un clic
└── package.json
```

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

<!-- ROADMAP -->
## 🗺️ Roadmap

- [x] Herramientas básicas de dibujo
- [x] Deshacer/rehacer con historial
- [x] Abrir y guardar PNG
- [x] Panel de IA con OpenAI GPT-4o
- [x] Herramienta de sombreado (difuminado)
- [ ] Exportar a formatos adicionales (GIF, sprite sheet)
- [ ] Herramienta de línea y rectángulo
- [ ] Capa de guías (transparencia on/off)
- [ ] Atajos de teclado personalizables
- [ ] Plugins / scripting

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

<!-- CONTRIBUTING -->
## 🤝 Contribuir

Las contribuciones hacen que la comunidad open source sea un lugar increíble para aprender, inspirar y crear. **Cualquier contribución que hagas será muy apreciada.**

Si tienes una sugerencia que mejore el proyecto, por favor haz un fork del repositorio y crea un pull request. También puedes abrir un issue con la etiqueta "enhancement".

1. Haz un Fork del Proyecto
2. Crea tu Rama de Funcionalidad (`git checkout -b feature/AmazingFeature`)
3. Commit tus Cambios (`git commit -m 'feat: add some amazing feature'`)
4. Push a la Rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

<!-- LICENSE -->
## 📄 Licencia

Distribuido bajo la licencia MIT. Consulta `LICENSE` para más información.

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

<!-- CONTACT -->
## 📫 Contacto

Alexandre Coll Molina - [LinkedIn](https://www.linkedin.com/in/alexandre-coll-molina/)

Project Link: [https://github.com/AlexandreColl/PixelArtEditor](https://github.com/AlexandreColl/PixelArtEditor)

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

# Growtopia World Planner

[![Growtopia World Planner Demo](https://img.youtube.com/vi/Au0LMJvMEsw/maxresdefault.jpg)](https://www.youtube.com/watch?v=Au0LMJvMEsw)

A comprehensive toolset and web application for planning, visualizing, and manipulating Growtopia worlds.

## Project Structure

This repository is a monorepo containing several interconnected components:

### Core Libraries (Rust)
- **`gtitem-r/`**: A Rust library for parsing and reading Growtopia's `items.dat` file.
- **`gtworld-r/`**: A Rust library for parsing, serializing, and deserializing Growtopia world files (`.dat`).
- **`rttex/`**: A Rust library for parsing and converting Growtopia's proprietary `.rttex` texture format.

### WebAssembly Engine
- **`wasm-engine/`**: A Rust library compiled to WebAssembly (Wasm) that provides high-performance world manipulation logic for the frontend and MCP server.

### Asset Pipeline
- **`asset-builder/`**: Rust-based tools for processing game assets.
  - `convert_textures`: Converts `.rttex` spritesheets into standard `.png` files for the web frontend.
  - `build_blocks_json`: Parses `items.dat` to generate JSON metadata (`items.json`, `blocks.json`) used by the frontend.

### Web Frontend
- **`frontend/`**: A React application built with Vite that provides an interactive canvas for visualizing and planning Growtopia worlds. It uses the generated assets and connects to the MCP server for real-time updates.

### MCP Server
- **`mcp-server/`**: A Node.js server implementing the Model Context Protocol (MCP). It uses the `wasm-engine` to manipulate world data and broadcasts updates to the frontend via WebSockets.

## Prerequisites

To build and run this project, you will need:
- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v18 or newer)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) (for building the Wasm engine)

## Setup Instructions

### 1. Prepare Game Assets
You need to provide the original game assets for the tools to work:
1. Place the `items.dat` file in the root directory (or the respective tool directories).
2. Place the `growtopia-sprites/` folder (containing `.rttex` files) in the root directory.

*Note: Game assets (`items.dat`, `.rttex`, `.dat` worlds) are excluded from version control via `.gitignore`.*

### 2. Build the WebAssembly Engine
```bash
cd wasm-engine
wasm-pack build --target web --out-dir ../mcp-server/pkg
```

### 3. Process Assets
Run the asset builder tools to generate the required files for the frontend:
```bash
cd asset-builder
cargo run --bin convert_textures
cargo run --bin build_blocks_json
```
This will populate `frontend/public/sprites/` and `frontend/public/items.json`.

### 4. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```

### 5. Start the MCP Server
```bash
cd mcp-server
npm install
npm start
```

## License

This project is licensed under the MIT License. See the individual sub-crates for specific license details if applicable.

*Disclaimer: This project is not affiliated with, endorsed, or sponsored by Ubisoft or Growtopia. All game assets and trademarks belong to their respective owners.*

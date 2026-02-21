import { useEffect, useRef, useState, useCallback } from "react";

const WORLD_WIDTH = 100;
const WORLD_HEIGHT = 60;
const TILE_SIZE = 8;           // Render size on canvas
const SPRITE_SIZE = 32;        // Source sprite size in sprite sheets
const CANVAS_WIDTH = WORLD_WIDTH * TILE_SIZE;   // 800
const CANVAS_HEIGHT = WORLD_HEIGHT * TILE_SIZE; // 480

/**
 * Fallback hash-to-color for block IDs whose sprite hasn't loaded.
 */
function idToColor(id) {
  if (id === 0) return null;
  const hue = (id * 137.508) % 360;
  const sat = 50 + (id % 4) * 10;
  const lit = 40 + (id % 3) * 10;
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

/**
 * Load an image and return a promise.
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Draw sky gradient background (before tiles).
 */
function drawSkyBackground(ctx) {
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  grad.addColorStop(0, "#87CEEB");   // light blue sky at top
  grad.addColorStop(1, "#4682B4");   // darker blue at bottom
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

/**
 * Draw a single tile using sprite data if available, falling back to color.
 */
function drawTile(ctx, blockId, px, py, blockData, images, alpha) {
  if (blockId === 0) return;

  const block = blockData[blockId];
  if (block) {
    const img = images[block.file];
    if (img) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        img,
        block.tx * SPRITE_SIZE,
        block.ty * SPRITE_SIZE,
        SPRITE_SIZE,
        SPRITE_SIZE,
        px,
        py,
        TILE_SIZE,
        TILE_SIZE
      );
      ctx.globalAlpha = 1.0;
      return;
    }
  }

  // Fallback: colored rectangle
  const color = idToColor(blockId);
  if (color) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    ctx.globalAlpha = 1.0;
  }
}

function drawWorld(ctx, data, blockData, images) {
  // Draw sky gradient first
  drawSkyBackground(ctx);

  for (let i = 0; i < WORLD_WIDTH * WORLD_HEIGHT; i++) {
    const x = i % WORLD_WIDTH;
    const y = Math.floor(i / WORLD_WIDTH);
    const fg_id = data[i * 2];
    const bg_id = data[i * 2 + 1];
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;

    // Background layer (fully opaque)
    drawTile(ctx, bg_id, px, py, blockData, images, 1.0);

    // Foreground layer (fully opaque)
    drawTile(ctx, fg_id, px, py, blockData, images, 1.0);
  }
}

export default function WorldCanvas() {
  const canvasRef = useRef(null);
  const dataRef = useRef(null);
  const blockDataRef = useRef(null);
  const imagesRef = useRef({});
  const wsRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Redraw helper — also sends screenshot to backend
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const data = dataRef.current;
    if (!canvas || !data || !blockDataRef.current) return;
    const ctx = canvas.getContext("2d");
    drawWorld(ctx, data, blockDataRef.current, imagesRef.current);

    // Send screenshot back to MCP server for AI image feedback
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) {
        const b64 = canvas.toDataURL("image/png").split(",")[1]; // strip data:image/png;base64,
        ws.send(JSON.stringify({ type: "screenshot", data: b64 }));
      }
    } catch (_) {}
  }, []);

  // Load blocks.json + sprite images on mount
  useEffect(() => {
    let cancelled = false;

    async function loadAssets() {
      try {
        const resp = await fetch("/items.json");
        const blockData = await resp.json();
        if (cancelled) return;
        blockDataRef.current = blockData;

        // Collect unique texture filenames — only load tile/block spritesheets
        const textureSet = new Set();
        for (const v of Object.values(blockData)) {
          if (v.file && v.file.startsWith("tiles_")) textureSet.add(v.file);
        }
        // Also add other relevant sheets
        for (const v of Object.values(blockData)) {
          if (v.file) textureSet.add(v.file);
        }

        const images = {};
        const entries = [...textureSet];
        let loaded = 0;

        const results = await Promise.allSettled(
          entries.map(async (name) => {
            const img = await loadImage(`/sprites/${name}`);
            loaded++;
            return { name, img };
          })
        );

        for (const r of results) {
          if (r.status === "fulfilled") {
            images[r.value.name] = r.value.img;
          }
        }

        if (cancelled) return;
        imagesRef.current = images;
        setReady(true);
        console.log(`[sprites] Loaded ${Object.keys(images).length}/${entries.length} sprite sheets`);
        redraw();
      } catch (err) {
        console.error("[sprites] Failed to load assets:", err);
        setReady(true); // still mark ready so canvas renders with fallback colors
      }
    }

    loadAssets();
    return () => { cancelled = true; };
  }, [redraw]);

  // WebSocket connection
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8080");
    wsRef.current = ws;

    ws.onopen = () => console.log("[ws] connected");
    ws.onclose = () => console.log("[ws] disconnected");
    ws.onerror = (e) => console.error("[ws] error", e);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "world_update" && Array.isArray(msg.data)) {
          dataRef.current = msg.data;
          redraw();
        }
      } catch (err) {
        console.error("[ws] bad message", err);
      }
    };

    return () => {
      wsRef.current = null;
      ws.close();
    };
  }, [redraw]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      style={{
        border: "1px solid #333",
        background: "#0d1b2a",
        imageRendering: "pixelated",
        display: "block",
      }}
    />
  );
}

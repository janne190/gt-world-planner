import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer } from "ws";
import { WorldPlanner } from "../pkg/wasm_engine.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Constants ────────────────────────────────────────────────────────
const WORLD_W = 100;
const WORLD_H = 60;

// ── Wasm world instance ──────────────────────────────────────────────
const world = new WorldPlanner();

// ── Screenshot handling ──────────────────────────────────────────────
// The frontend sends a base64 PNG screenshot after each render.
// We store the latest one so MCP tool responses can include it.
let latestScreenshot = null;
let screenshotResolve = null; // resolve callback for pending screenshot request

function waitForScreenshot(timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (latestScreenshot) {
      // Use already-cached screenshot as fallback
    }
    screenshotResolve = resolve;
    setTimeout(() => {
      screenshotResolve = null;
      resolve(latestScreenshot); // resolve with whatever we have (may be stale)
    }, timeoutMs);
  });
}

// ── WebSocket server (port 8080) ─────────────────────────────────────
const wss = new WebSocketServer({ port: 8080 });

wss.on("listening", () => {
  console.error("[ws] WebSocket server listening on ws://localhost:8080");
});

wss.on("connection", (ws) => {
  console.error("[ws] client connected");
  // Send current state immediately to new clients
  const buf = world.get_world_buffer();
  ws.send(JSON.stringify({ type: "world_update", data: Array.from(buf) }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "screenshot" && msg.data) {
        latestScreenshot = msg.data; // base64 PNG string
        if (screenshotResolve) {
          screenshotResolve(msg.data);
          screenshotResolve = null;
        }
      }
    } catch (_) {}
  });
});

function broadcast() {
  const buf = world.get_world_buffer(); // Uint16Array
  const msg = JSON.stringify({ type: "world_update", data: Array.from(buf) });
  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(msg);
    }
  }
}

/** Broadcast world update, wait for screenshot, return MCP image content */
async function broadcastAndCapture() {
  broadcast();
  const b64 = await waitForScreenshot(3000);
  if (b64) {
    return { type: "image", data: b64, mimeType: "image/png" };
  }
  return null;
}

// ── Bounds validation ────────────────────────────────────────────────
function validateCoord(x, y) {
  if (typeof x !== "number" || typeof y !== "number") {
    return `Error: x and y must be numbers, got x=${x}, y=${y}`;
  }
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return `Error: x and y must be integers, got x=${x}, y=${y}`;
  }
  if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) {
    return `Error: Coordinates out of bounds (x=${x}, y=${y}). World size is ${WORLD_W}×${WORLD_H}, valid ranges: x=0..${WORLD_W - 1}, y=0..${WORLD_H - 1}`;
  }
  return null;
}

function validateRect(x1, y1, x2, y2) {
  const e1 = validateCoord(x1, y1);
  if (e1) return e1;
  const e2 = validateCoord(x2, y2);
  if (e2) return e2;
  return null;
}

function errorResponse(text) {
  return { content: [{ type: "text", text }], isError: true };
}

// ── MCP Server (stdio transport) ─────────────────────────────────────
const server = new Server(
  { name: "gt-world-planner", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// ── Tool definitions ─────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "place_block",
      description:
        "Place a single block at (x, y). fg_id=0 means empty foreground, bg_id=0 means empty background. Use fill_rect or fill_bg_rect for areas. Coordinates: x=0..99, y=0..59.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "integer", description: "X coordinate (0-99)" },
          y: { type: "integer", description: "Y coordinate (0-59)" },
          fg_id: { type: "integer", description: "Foreground item ID (0=empty)" },
          bg_id: { type: "integer", description: "Background item ID (0=empty)" },
        },
        required: ["x", "y", "fg_id", "bg_id"],
      },
    },
    {
      name: "fill_rect",
      description:
        "Fill a rectangle of tiles with the given block_id as FOREGROUND (background unchanged). For backgrounds use fill_bg_rect instead. Coordinates: x=0..99, y=0..59.",
      inputSchema: {
        type: "object",
        properties: {
          x1: { type: "integer", description: "Start X (0-99)" },
          y1: { type: "integer", description: "Start Y (0-59)" },
          x2: { type: "integer", description: "End X (0-99)" },
          y2: { type: "integer", description: "End Y (0-59)" },
          block_id: { type: "integer", description: "Foreground item ID to fill" },
        },
        required: ["x1", "y1", "x2", "y2", "block_id"],
      },
    },
    {
      name: "fill_bg_rect",
      description:
        "CRITICAL: ALWAYS use this tool to fill background areas (wallpapers, cave backgrounds, sky backgrounds). DO NOT use place_block in a loop for backgrounds. Fills a rectangle from (x1, y1) to (x2, y2) with the given bg_id. Foreground is NOT changed. Coordinates: x=0..99, y=0..59.",
      inputSchema: {
        type: "object",
        properties: {
          x1: { type: "integer", description: "Start X (0-99)" },
          y1: { type: "integer", description: "Start Y (0-59)" },
          x2: { type: "integer", description: "End X (0-99)" },
          y2: { type: "integer", description: "End Y (0-59)" },
          bg_id: { type: "integer", description: "Background item ID to fill" },
        },
        required: ["x1", "y1", "x2", "y2", "bg_id"],
      },
    },
    {
      name: "clear_world",
      description: "Reset all tiles in the 100×60 world to empty (id 0).",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_tile",
      description:
        "Get the foreground and background item IDs at a specific tile coordinate. Coordinates: x=0..99, y=0..59.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "integer", description: "X coordinate (0-99)" },
          y: { type: "integer", description: "Y coordinate (0-59)" },
        },
        required: ["x", "y"],
      },
    },
    {
      name: "get_world_state",
      description:
        "Returns a summary of the current world buffer (total tiles, non-empty tile count, dimensions).",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "search_item",
      description: "Search for Growtopia block IDs by name (e.g., 'Gold', 'Dirt', 'Door'). ALWAYS use this tool before placing blocks if you don't know the exact ID.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The name of the block to search for" }
        },
        required: ["query"]
      }
    },
  ],
}));

// ── Tool handlers ────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "place_block": {
      const { x, y, fg_id, bg_id } = args;
      const err = validateCoord(x, y);
      if (err) return errorResponse(err);
      world.place_block(x, y, fg_id, bg_id);
      const imgContent = await broadcastAndCapture();
      const content = [
        { type: "text", text: `Placed block at (${x}, ${y}): fg=${fg_id}, bg=${bg_id}` },
      ];
      if (imgContent) content.push(imgContent);
      return { content };
    }

    case "fill_rect": {
      const { x1, y1, x2, y2, block_id } = args;
      const err = validateRect(x1, y1, x2, y2);
      if (err) return errorResponse(err);
      world.fill_rect(x1, y1, x2, y2, block_id);
      const imgContent = await broadcastAndCapture();
      const content = [
        { type: "text", text: `Filled fg rect (${x1},${y1})→(${x2},${y2}) with block ${block_id}` },
      ];
      if (imgContent) content.push(imgContent);
      return { content };
    }

    case "fill_bg_rect": {
      const { x1, y1, x2, y2, bg_id } = args;
      const err = validateRect(x1, y1, x2, y2);
      if (err) return errorResponse(err);
      world.fill_bg_rect(x1, y1, x2, y2, bg_id);
      const imgContent = await broadcastAndCapture();
      const content = [
        { type: "text", text: `Filled bg rect (${x1},${y1})→(${x2},${y2}) with bg=${bg_id}` },
      ];
      if (imgContent) content.push(imgContent);
      return { content };
    }

    case "clear_world": {
      world.clear_world();
      const imgContent = await broadcastAndCapture();
      const content = [{ type: "text", text: "World cleared" }];
      if (imgContent) content.push(imgContent);
      return { content };
    }

    case "get_tile": {
      const { x, y } = args;
      const err = validateCoord(x, y);
      if (err) return errorResponse(err);
      const tile = world.get_tile(x, y);
      return {
        content: [{ type: "text", text: JSON.stringify(tile) }],
      };
    }

    case "get_world_state": {
      const buf = world.get_world_buffer();
      let nonEmpty = 0;
      for (let i = 0; i < buf.length; i += 2) {
        if (buf[i] !== 0 || buf[i + 1] !== 0) nonEmpty++;
      }
      const imgContent = await broadcastAndCapture();
      const content = [
        {
          type: "text",
          text: JSON.stringify({
            width: world.width(),
            height: world.height(),
            totalTiles: world.width() * world.height(),
            nonEmptyTiles: nonEmpty,
          }),
        },
      ];
      if (imgContent) content.push(imgContent);
      return { content };
    }

    case "search_item": {
      const { query } = args;
      try {
        const itemsPath = path.join(__dirname, "../../frontend/public/items.json");
        const itemsData = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
        
        const results = [];
        const q = query.toLowerCase();
        
        for (const [id, item] of Object.entries(itemsData)) {
          if (item.name.toLowerCase().includes(q)) {
            results.push({ id, ...item });
          }
        }
        
        // Sort by exact match first, then by length
        results.sort((a, b) => {
          const aExact = a.name.toLowerCase() === q;
          const bExact = b.name.toLowerCase() === q;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return a.name.length - b.name.length;
        });
        
        const topResults = results.slice(0, 10);
        
        if (topResults.length === 0) {
          return { content: [{ type: "text", text: `No items found matching "${query}".` }] };
        }
        
        const resultText = `Found ${results.length} items (showing top ${topResults.length}):\n` + 
          topResults.map(r => `ID ${r.id} (${r.name}, ${r.bg ? 'Background' : 'Foreground'})`).join("\n");
          
        return { content: [{ type: "text", text: resultText }] };
      } catch (e) {
        return errorResponse(`Failed to search items: ${e.message}`);
      }
    }

    default:
      return errorResponse(`Unknown tool: ${name}`);
  }
});

// ── Start ────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp] GT World Planner MCP server running on stdio");
}

main().catch((err) => {
  console.error("[mcp] Fatal error:", err);
  process.exit(1);
});

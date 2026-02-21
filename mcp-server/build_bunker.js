import { WorldPlanner } from "./pkg/wasm_engine.js";
import { WebSocketServer } from "ws";

const world = new WorldPlanner();

// 1. Tyhjennä maailma
world.clear_world();

// 2. Täytä alaosa mullalla (Dirt, ID 2)
world.fill_rect(0, 20, 99, 59, 2);

// 3. Koverra tyhjä tila bunkkeria varten (ID 0)
world.fill_rect(30, 30, 70, 45, 0);

// 4. Täytä bunkkerin tausta Cave Backgroundilla (ID 14)
world.fill_bg_rect(30, 30, 70, 45, 14);

// 5. Laita bunkkerin ympärille muutamat ovet (ID 12 on Door)
// Laitetaan ovet bunkkerin reunoille
world.place_block(30, 45, 12, 14); // Vasen ovi
world.place_block(70, 45, 12, 14); // Oikea ovi

console.log("Bunkkeri rakennettu!");

// Käynnistetään WebSocket-palvelin, jotta frontend näkee tuloksen
const wss = new WebSocketServer({ port: 8080 });

wss.on("listening", () => {
  console.log("[ws] WebSocket server listening on ws://localhost:8080");
});

wss.on("connection", (ws) => {
  console.log("[ws] client connected");
  const buf = world.get_world_buffer();
  ws.send(JSON.stringify({ type: "world_update", data: Array.from(buf) }));
});

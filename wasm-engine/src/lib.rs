use wasm_bindgen::prelude::*;
use js_sys::Uint16Array;
use serde::Serialize;

const WORLD_WIDTH: usize = 100;
const WORLD_HEIGHT: usize = 60;
const TILE_COUNT: usize = WORLD_WIDTH * WORLD_HEIGHT;

#[derive(Clone, Copy, Default, Serialize)]
struct Tile {
    fg_id: u16,
    bg_id: u16,
}

#[wasm_bindgen]
pub struct WorldPlanner {
    tiles: Vec<Tile>,
}

#[wasm_bindgen]
impl WorldPlanner {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WorldPlanner {
        WorldPlanner {
            tiles: vec![Tile::default(); TILE_COUNT],
        }
    }

    fn index(x: usize, y: usize) -> Option<usize> {
        if x < WORLD_WIDTH && y < WORLD_HEIGHT {
            Some(y * WORLD_WIDTH + x)
        } else {
            None
        }
    }

    /// Place a single block at (x, y). fg_id=0 means empty foreground, bg_id=0 means empty background.
    #[wasm_bindgen]
    pub fn place_block(&mut self, x: u32, y: u32, fg_id: u16, bg_id: u16) {
        if let Some(idx) = Self::index(x as usize, y as usize) {
            self.tiles[idx].fg_id = fg_id;
            self.tiles[idx].bg_id = bg_id;
        }
    }

    /// Fill a rectangle of tiles with the given block_id as foreground (bg unchanged).
    #[wasm_bindgen]
    pub fn fill_rect(&mut self, x1: u32, y1: u32, x2: u32, y2: u32, block_id: u16) {
        let x_start = (x1 as usize).min(WORLD_WIDTH - 1);
        let x_end = (x2 as usize).min(WORLD_WIDTH - 1);
        let y_start = (y1 as usize).min(WORLD_HEIGHT - 1);
        let y_end = (y2 as usize).min(WORLD_HEIGHT - 1);

        for y in y_start..=y_end {
            for x in x_start..=x_end {
                if let Some(idx) = Self::index(x, y) {
                    self.tiles[idx].fg_id = block_id;
                }
            }
        }
    }

    /// Fill a rectangle with separate foreground and background ids.
    #[wasm_bindgen]
    pub fn fill_rect_full(&mut self, x1: u32, y1: u32, x2: u32, y2: u32, fg_id: u16, bg_id: u16) {
        let x_start = (x1 as usize).min(WORLD_WIDTH - 1);
        let x_end = (x2 as usize).min(WORLD_WIDTH - 1);
        let y_start = (y1 as usize).min(WORLD_HEIGHT - 1);
        let y_end = (y2 as usize).min(WORLD_HEIGHT - 1);

        for y in y_start..=y_end {
            for x in x_start..=x_end {
                if let Some(idx) = Self::index(x, y) {
                    self.tiles[idx].fg_id = fg_id;
                    self.tiles[idx].bg_id = bg_id;
                }
            }
        }
    }

    /// Reset all tiles to empty (id 0).
    #[wasm_bindgen]
    pub fn clear_world(&mut self) {
        for tile in &mut self.tiles {
            *tile = Tile::default();
        }
    }

    /// Get tile at (x, y) as a JsValue ({fg_id, bg_id}). Returns {fg_id:0, bg_id:0} for out-of-bounds.
    #[wasm_bindgen]
    pub fn get_tile(&self, x: u32, y: u32) -> JsValue {
        let tile = Self::index(x as usize, y as usize)
            .map(|idx| self.tiles[idx])
            .unwrap_or_default();
        serde_wasm_bindgen::to_value(&tile).unwrap()
    }

    /// Get foreground id at (x, y). Returns 0 for out-of-bounds.
    #[wasm_bindgen]
    pub fn get_fg(&self, x: u32, y: u32) -> u16 {
        Self::index(x as usize, y as usize)
            .map(|idx| self.tiles[idx].fg_id)
            .unwrap_or(0)
    }

    /// Get background id at (x, y). Returns 0 for out-of-bounds.
    #[wasm_bindgen]
    pub fn get_bg(&self, x: u32, y: u32) -> u16 {
        Self::index(x as usize, y as usize)
            .map(|idx| self.tiles[idx].bg_id)
            .unwrap_or(0)
    }

    /// Returns flat Uint16Array: [fg0, bg0, fg1, bg1, ...] for all 6000 tiles (row-major).
    /// Total length = 12000 u16 values.
    #[wasm_bindgen]
    pub fn get_world_buffer(&self) -> Uint16Array {
        let mut buf = vec![0u16; TILE_COUNT * 2];
        for (i, tile) in self.tiles.iter().enumerate() {
            buf[i * 2] = tile.fg_id;
            buf[i * 2 + 1] = tile.bg_id;
        }
        let arr = Uint16Array::new_with_length((TILE_COUNT * 2) as u32);
        arr.copy_from(&buf);
        arr
    }

    /// World dimensions
    #[wasm_bindgen]
    pub fn width(&self) -> u32 {
        WORLD_WIDTH as u32
    }

    #[wasm_bindgen]
    pub fn height(&self) -> u32 {
        WORLD_HEIGHT as u32
    }
}

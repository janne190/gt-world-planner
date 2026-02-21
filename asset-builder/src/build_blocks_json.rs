/// Parse items.dat and generate frontend/public/items.json
/// Maps each block ID to: { name, file, tx, ty, bg }
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
struct BlockInfo {
    name: String,
    file: String,
    tx: u8,
    ty: u8,
    bg: bool,
}

fn main() {
    let items_dat_path = "items.dat";
    let output_path = Path::new("frontend/public/items.json");

    println!("Loading items.dat from {} ...", items_dat_path);

    let db = gtitem_r::load_from_file(items_dat_path)
        .expect("Failed to load items.dat");

    println!(
        "Loaded items.dat v{}: {} items",
        db.version, db.item_count
    );

    // Build a sorted map (BTreeMap for deterministic JSON key order)
    let mut blocks: BTreeMap<u32, BlockInfo> = BTreeMap::new();

    for (id, item) in &db.items {
        // Skip items with no texture file, or item 0 (Blank/Fist)
        if item.texture_file_name.is_empty() || *id == 0 {
            continue;
        }

        // Convert the .rttex filename to .png (what our converter outputs)
        let texture_png = item
            .texture_file_name
            .replace(".rttex", ".png");

        // In Growtopia, action_type 18 is Background, 28 is also a background type sometimes,
        // but let's also check if it's a background by checking if it's not a foreground.
        // Actually, action_type 18 is the standard background.
        let is_bg = item.action_type == 18 || item.action_type == 28;

        blocks.insert(
            *id,
            BlockInfo {
                name: item.name.clone(),
                file: texture_png,
                tx: item.texture_x,
                ty: item.texture_y,
                bg: is_bg,
            },
        );
    }

    // Ensure output directory exists
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).ok();
    }

    let json = serde_json::to_string(&blocks).expect("Failed to serialize blocks");
    fs::write(output_path, &json).expect("Failed to write items.json");

    println!(
        "Wrote {} block entries to {}",
        blocks.len(),
        output_path.display()
    );

    // Print a few samples
    let sample_ids = [2u32, 4, 6, 8, 10, 14];
    for id in sample_ids {
        if let Some(b) = blocks.get(&id) {
            println!(
                "  ID {}: {} -> {} @ ({}, {}) bg: {}",
                id, b.name, b.file, b.tx, b.ty, b.bg
            );
        }
    }
}

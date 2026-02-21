/// Convert all tiles_page*.rttex files from growtopia-sprites/game/ to PNG
/// and save them into frontend/public/sprites/
use std::fs;
use std::path::Path;

fn main() {
    let sprites_dir = Path::new("growtopia-sprites/game");
    let output_dir = Path::new("frontend/public/sprites");

    fs::create_dir_all(output_dir).expect("Failed to create output directory");

    let mut converted = 0u32;
    let mut failed = 0u32;

    // Collect all .rttex files that are tile/block spritesheets
    // Include tiles_page*, tiles_switch*, tiles_candyblock, tiles_gch, stopia, fish, gd_page, etc.
    let tile_prefixes = [
        "tiles_", "stopia_", "fish_page", "gd_page", "bb_page",
        "tf_page", "slobby_page",
    ];

    let entries: Vec<_> = fs::read_dir(sprites_dir)
        .expect("Cannot read growtopia-sprites/game/")
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.ends_with(".rttex")
                && tile_prefixes.iter().any(|p| name.starts_with(p))
        })
        .collect();

    println!("Found {} tiles_page*.rttex files", entries.len());

    for entry in &entries {
        let path_str = entry.path().to_string_lossy().to_string();
        let file_stem = entry
            .path()
            .file_stem()
            .unwrap()
            .to_string_lossy()
            .to_string();

        let out_path = output_dir.join(format!("{}.png", file_stem));

        print!("  {} -> {} ... ", path_str, out_path.display());

        match rttex::get_image_buffer(&path_str) {
            Some(img) => {
                img.save(&out_path).expect("Failed to save PNG");
                let (w, h) = img.dimensions();
                println!("OK ({}x{})", w, h);
                converted += 1;
            }
            None => {
                println!("FAILED (could not decode)");
                failed += 1;
            }
        }
    }

    println!(
        "\nDone: {} converted, {} failed out of {} total",
        converted,
        failed,
        entries.len()
    );
}

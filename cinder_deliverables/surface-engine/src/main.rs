// surface-engine — read-only entropy X-ray of a disk image or block device.
//
// WHAT IT DOES
//   Opens an image/device READ-ONLY (mmap), tiles the surface into fixed-size
//   blocks, and for each block computes:
//     - Shannon entropy (0..8 bits)          -> "how random"
//     - zero fraction                         -> zeroed / wiped
//     - printable-ASCII fraction              -> text / structured
//     - a head magic-byte signature           -> claimed file type
//   From that field it derives forensic LEADS (never proofs):
//     - texture class per block
//     - layer/boundary detection (aligned entropy discontinuities) ->
//       "how many volumes were layered on", even with a wiped partition table
//     - data-within-data anomalies (signature says X, entropy says Y)
//
// CRYPTOGRAPHICALLY HONEST
//   It never decrypts, never guesses a key, never writes. Every output is a
//   measurable, reproducible statistic. Findings are triage leads with a
//   confidence tier and a standing caveat: strong deniable encryption
//   (e.g. VeraCrypt hidden volumes) is engineered to look like random free
//   space, so absence of a flag is NOT absence of a hidden volume.
//
// USAGE
//   surface-engine --image disk.img [--block-size 1048576] [--json] [--grid WxH]
//   surface-engine --image /dev/sdb --json          # block device, read-only
//
// OUTPUT
//   default: a human-readable forensic summary on stdout
//   --json:  the full SurfaceField + findings as JSON (for scribe to render)

use std::fs::File;
use std::path::PathBuf;

use memmap2::Mmap;
use rayon::prelude::*;
use serde::Serialize;

const DEFAULT_BLOCK: u64 = 1 << 20; // 1 MiB

// ───────────────────────── data model (the heat field) ──────────────────────

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "snake_case")]
enum Texture {
    Zeroed,        // flat ~0, mostly zero bytes  -> wiped / unallocated
    Text,          // low-mid entropy, printable  -> logs, source, structured
    StructuredFs,  // mottled mid entropy         -> filesystem metadata + small files
    MixedFiles,    // mid-high, varied            -> ordinary file data
    FlatHigh,      // aligned ~8.0, no fs texture -> candidate encrypted/compressed container
    Anomalous,     // signature/entropy contradiction
    Empty,         // block past EOF / unreadable
}

#[derive(Serialize, Clone)]
struct SurfaceCell {
    idx: u64,
    offset: u64,
    len: u64,
    entropy: f32,       // 0..8 bits/byte
    zero_frac: f32,     // 0..1
    print_frac: f32,    // 0..1 printable ASCII
    sig: &'static str,  // head magic-byte tag, or "-"
    texture: Texture,
}

#[derive(Serialize)]
struct Layer {
    kind: &'static str,     // "high-entropy region (candidate container)"
    start_offset: u64,
    end_offset: u64,
    blocks: u64,
    mean_entropy: f32,
    aligned_512: bool,
    aligned_4k: bool,
    confidence: &'static str, // low | moderate | notable
}

#[derive(Serialize)]
struct Anomaly {
    offset: u64,
    len: u64,
    sig: &'static str,
    entropy: f32,
    note: String,
    confidence: &'static str,
}

#[derive(Serialize)]
struct Findings {
    layered_high_entropy_regions: usize,
    layers: Vec<Layer>,
    boundaries: Vec<u64>,      // offsets where texture class changes on an aligned edge
    anomalies: Vec<Anomaly>,
    caveat: &'static str,
}

#[derive(Serialize)]
struct SurfaceField {
    engine_version: &'static str,
    source: String,
    source_bytes: u64,
    block_size: u64,
    block_count: u64,
    read_only: bool,
    cells: Vec<SurfaceCell>,
    findings: Findings,
}

// ───────────────────────── per-block statistics ─────────────────────────────

fn shannon_entropy(block: &[u8], hist: &mut [u32; 256]) -> f32 {
    if block.is_empty() { return 0.0; }
    hist.iter_mut().for_each(|c| *c = 0);
    for &b in block { hist[b as usize] += 1; }
    let n = block.len() as f64;
    let mut h = 0.0f64;
    for &c in hist.iter() {
        if c == 0 { continue; }
        let p = c as f64 / n;
        h -= p * p.log2();
    }
    h as f32 // 0..8
}

fn zero_fraction(block: &[u8]) -> f32 {
    if block.is_empty() { return 1.0; }
    let z = block.iter().filter(|&&b| b == 0).count();
    z as f32 / block.len() as f32
}

fn printable_fraction(block: &[u8]) -> f32 {
    if block.is_empty() { return 0.0; }
    let p = block.iter().filter(|&&b| (0x20..=0x7e).contains(&b) || b == b'\n' || b == b'\r' || b == b'\t').count();
    p as f32 / block.len() as f32
}

fn head_signature(block: &[u8]) -> &'static str {
    let h = block;
    let starts = |sig: &[u8]| h.len() >= sig.len() && &h[..sig.len()] == sig;
    if starts(&[0xFF, 0xD8, 0xFF]) { "jpeg" }
    else if starts(&[0x89, b'P', b'N', b'G']) { "png" }
    else if starts(b"GIF8") { "gif" }
    else if starts(b"%PDF") { "pdf" }
    else if starts(&[0x50, 0x4B, 0x03, 0x04]) { "zip" }
    else if starts(&[0x1F, 0x8B]) { "gzip" }
    else if starts(b"SQLite format 3\0") { "sqlite" }
    else if starts(b"BZh") { "bzip2" }
    else if starts(&[0x37, 0x7A, 0xBC, 0xAF]) { "7z" }
    else if starts(&[0x52, 0x61, 0x72, 0x21]) { "rar" }
    else { "-" }
}

fn classify(entropy: f32, zero_frac: f32, print_frac: f32, sig: &str) -> Texture {
    // Order matters — most specific first.
    if zero_frac > 0.90 && entropy < 0.5 { return Texture::Zeroed; }
    if print_frac > 0.85 && entropy < 6.0 { return Texture::Text; }
    if entropy >= 7.90 {
        // Flat-high: candidate encrypted/compressed. A real media header on a
        // flat-high body is a contradiction we flag later as an anomaly.
        return Texture::FlatHigh;
    }
    if entropy >= 6.5 { return Texture::MixedFiles; }
    if (2.0..6.5).contains(&entropy) { return Texture::StructuredFs; }
    let _ = sig;
    Texture::MixedFiles
}

// ───────────────────────── findings derivation ──────────────────────────────

fn derive_findings(cells: &[SurfaceCell], block_size: u64) -> Findings {
    // 1) Layer detection: contiguous runs of FlatHigh of meaningful length.
    //    Each run = a candidate encrypted/compressed *container*. Counting them
    //    answers "how many volumes were layered on".
    let min_run: u64 = std::cmp::max(4, (8 * (1 << 20)) / block_size.max(1)); // >= 8 MiB or 4 blocks
    let mut layers = Vec::new();
    let mut i = 0usize;
    while i < cells.len() {
        if cells[i].texture == Texture::FlatHigh {
            let start = i;
            let mut sum = 0.0f32;
            while i < cells.len() && cells[i].texture == Texture::FlatHigh {
                sum += cells[i].entropy; i += 1;
            }
            let run = (i - start) as u64;
            if run >= min_run {
                let start_off = cells[start].offset;
                let end_off = cells[i - 1].offset + cells[i - 1].len;
                let conf = if run >= min_run * 4 { "notable" }
                           else if run >= min_run * 2 { "moderate" }
                           else { "low" };
                layers.push(Layer {
                    kind: "high-entropy region (candidate encrypted/compressed container)",
                    start_offset: start_off,
                    end_offset: end_off,
                    blocks: run,
                    mean_entropy: sum / run as f32,
                    aligned_512: start_off % 512 == 0,
                    aligned_4k: start_off % 4096 == 0,
                    confidence: conf,
                });
            }
        } else {
            i += 1;
        }
    }

    // 2) Boundaries: aligned texture-class transitions (volume/partition edges,
    //    visible even with a wiped partition table).
    let mut boundaries = Vec::new();
    for w in cells.windows(2) {
        if w[0].texture != w[1].texture {
            let off = w[1].offset;
            if off % 512 == 0 { boundaries.push(off); }
        }
    }

    // 3) Anomalies: media signature but flat-high body (stego/packed/masked),
    //    or high entropy where a filesystem believes there's nothing (handled
    //    upstream by texture); here we catch signature/entropy contradictions.
    let mut anomalies = Vec::new();
    for c in cells {
        let media = matches!(c.sig, "jpeg" | "png" | "gif" | "pdf");
        if media && c.entropy > 7.5 {
            anomalies.push(Anomaly {
                offset: c.offset,
                len: c.len,
                sig: c.sig,
                entropy: c.entropy,
                note: format!(
                    "signature claims '{}' but block entropy {:.3} is higher/flatter than typical for that type — possible packed/encrypted payload or heavy steganography",
                    c.sig, c.entropy
                ),
                confidence: "low",
            });
        }
    }

    Findings {
        layered_high_entropy_regions: layers.len(),
        layers,
        boundaries,
        anomalies,
        caveat: "LEADS, not proof. Every value is a reproducible statistic derived read-only. \
                 Strong deniable encryption (e.g. VeraCrypt hidden volumes) is engineered to be \
                 statistically indistinguishable from random free space; absence of a flag is NOT \
                 absence of a hidden volume. Confirm any lead with a focused carve and an examiner.",
    }
}

// ───────────────────────── scan ─────────────────────────────────────────────

fn scan(path: &PathBuf, block_size: u64) -> std::io::Result<SurfaceField> {
    let file = File::open(path)?;                 // read-only handle
    let mmap = unsafe { Mmap::map(&file)? };      // read-only mapping
    let total = mmap.len() as u64;
    let bs = block_size.max(4096);
    let block_count = (total + bs - 1) / bs;

    // Parallel per-block stats. Each block gets its own histogram (thread-local).
    let cells: Vec<SurfaceCell> = (0..block_count)
        .into_par_iter()
        .map(|idx| {
            let start = idx * bs;
            let end = std::cmp::min(start + bs, total);
            let block = &mmap[start as usize..end as usize];
            let mut hist = [0u32; 256];
            let entropy = shannon_entropy(block, &mut hist);
            let zero_frac = zero_fraction(block);
            let print_frac = printable_fraction(block);
            let sig = head_signature(block);
            let texture = if block.is_empty() { Texture::Empty }
                          else { classify(entropy, zero_frac, print_frac, sig) };
            SurfaceCell {
                idx, offset: start, len: (end - start),
                entropy, zero_frac, print_frac, sig, texture,
            }
        })
        .collect();

    let findings = derive_findings(&cells, bs);

    Ok(SurfaceField {
        engine_version: env!("CARGO_PKG_VERSION"),
        source: path.to_string_lossy().into_owned(),
        source_bytes: total,
        block_size: bs,
        block_count,
        read_only: true,
        cells,
        findings,
    })
}

// ───────────────────────── output ───────────────────────────────────────────

fn human(bytes: u64) -> String {
    const U: [&str; 6] = ["B", "K", "M", "G", "T", "P"];
    let mut v = bytes as f64; let mut i = 0;
    while v >= 1024.0 && i < U.len() - 1 { v /= 1024.0; i += 1; }
    if i == 0 { format!("{} {}", bytes, U[0]) } else { format!("{:.1} {}", v, U[i]) }
}

fn print_summary(f: &SurfaceField) {
    println!("surface-engine {} — READ-ONLY entropy X-ray", f.engine_version);
    println!("source      : {}", f.source);
    println!("size        : {} ({} blocks of {})", human(f.source_bytes), f.block_count, human(f.block_size));
    // texture histogram
    let mut counts = std::collections::BTreeMap::new();
    for c in &f.cells {
        *counts.entry(format!("{:?}", c.texture)).or_insert(0u64) += 1;
    }
    println!("\ntexture map :");
    for (k, v) in &counts {
        let pct = 100.0 * *v as f64 / f.block_count.max(1) as f64;
        println!("  {:<14} {:>6} blocks  {:>5.1}%", k, v, pct);
    }
    let fd = &f.findings;
    println!("\nLAYERS (candidate encrypted/compressed containers): {}", fd.layered_high_entropy_regions);
    for (n, l) in fd.layers.iter().enumerate() {
        println!("  #{:<2} {}..{}  ({} blocks, mean H={:.3}, {}{}, {})",
            n + 1, human(l.start_offset), human(l.end_offset), l.blocks, l.mean_entropy,
            if l.aligned_4k { "4K-aligned" } else if l.aligned_512 { "512-aligned" } else { "unaligned" },
            "", l.confidence);
    }
    println!("\nBOUNDARIES (aligned texture transitions): {}", fd.boundaries.len());
    if !fd.boundaries.is_empty() {
        let show: Vec<String> = fd.boundaries.iter().take(12).map(|o| human(*o)).collect();
        println!("  at: {}{}", show.join(", "), if fd.boundaries.len() > 12 { ", …" } else { "" });
    }
    println!("\nANOMALIES (data-within-data leads): {}", fd.anomalies.len());
    for a in &fd.anomalies {
        println!("  @{}  {}  H={:.3}  [{}]\n     {}", human(a.offset), a.sig, a.entropy, a.confidence, a.note);
    }
    println!("\ncaveat: {}", fd.caveat);
}

// ───────────────────────── CLI ──────────────────────────────────────────────

fn main() {
    let mut image: Option<PathBuf> = None;
    let mut block_size = DEFAULT_BLOCK;
    let mut json = false;

    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "--image" => image = it.next().map(PathBuf::from),
            "--block-size" => block_size = it.next().and_then(|s| s.parse().ok()).unwrap_or(DEFAULT_BLOCK),
            "--json" => json = true,
            "-h" | "--help" => { eprintln!("usage: surface-engine --image PATH [--block-size N] [--json]"); return; }
            other => { eprintln!("surface-engine: unknown arg '{other}'"); std::process::exit(2); }
        }
    }
    let path = match image {
        Some(p) => p,
        None => { eprintln!("surface-engine: --image PATH required"); std::process::exit(2); }
    };
    match scan(&path, block_size) {
        Ok(field) => {
            if json {
                println!("{}", serde_json::to_string(&field).unwrap());
            } else {
                print_summary(&field);
            }
        }
        Err(e) => { eprintln!("surface-engine: {e}"); std::process::exit(1); }
    }
}

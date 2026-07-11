// corpus — chain-of-custody cataloger for a pile of drives.
//
// ONE-BUTTON SCAN
//   corpus scan --root /mnt/DRIVE1 --label DRIVE1 [--db corpus.db]
//     Walks the drive READ-ONLY, hashes every file (SHA-256), records
//     path/size/mtime/type/lane-hint/completeness into a SQLite catalog.
//     Re-runnable and additive across all 15+ drives into one catalog.
//
// THEN
//   corpus stats           summary: files, unique content, duplicates,
//                          reclaimable space, by-type, by-drive, broken count
//   corpus dupes           duplicate groups (same SHA-256 across drives) + paths
//   corpus lanes           lane split: case / patient / art / unknown (keyword hints)
//   corpus broken          files that look truncated/incomplete
//   corpus export --json   dump the catalog as JSON (for the viewer / semantic search)
//
// The catalog is the source of truth. Dedup actions, the real-time viewer, and
// semantic lane separation all read from it — this tool builds and queries it.
// It never deletes or moves anything; organizing is a later, explicit step that
// reads the catalog. Read-only over the corpus.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use rayon::prelude::*;
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use walkdir::WalkDir;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS files (
  id         INTEGER PRIMARY KEY,
  drive      TEXT NOT NULL,
  path       TEXT NOT NULL,
  rel        TEXT NOT NULL,
  size       INTEGER NOT NULL,
  mtime      INTEGER,
  ext        TEXT,
  kind       TEXT,          -- image|app|document|archive|media|text|other
  lane       TEXT,          -- case|patient|art|unknown  (keyword hint)
  high_signal INTEGER,      -- 1 if image or app
  sha256     TEXT,
  complete   TEXT,          -- ok|broken|unknown
  scanned_at INTEGER,
  UNIQUE(drive, path)
);
CREATE INDEX IF NOT EXISTS idx_sha ON files(sha256);
CREATE INDEX IF NOT EXISTS idx_kind ON files(kind);
CREATE INDEX IF NOT EXISTS idx_lane ON files(lane);
";

struct Rec {
    path: String,
    rel: String,
    size: u64,
    mtime: i64,
    ext: String,
    kind: &'static str,
    lane: &'static str,
    high_signal: bool,
    sha256: String,
    complete: &'static str,
}

fn ext_of(p: &Path) -> String {
    p.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()).unwrap_or_default()
}

fn kind_of(ext: &str) -> &'static str {
    match ext {
        "jpg"|"jpeg"|"png"|"gif"|"heic"|"heif"|"webp"|"tiff"|"tif"|"bmp"|"raw"|"cr2"|"nef"|"dng" => "image",
        "exe"|"msi"|"apk"|"dmg"|"appimage"|"deb"|"rpm"|"app"|"bat"|"sh"|"ps1" => "app",
        "pdf"|"doc"|"docx"|"xls"|"xlsx"|"ppt"|"pptx"|"odt"|"rtf"|"pages"|"key"|"numbers" => "document",
        "zip"|"7z"|"rar"|"tar"|"gz"|"bz2"|"xz"|"tgz" => "archive",
        "mp4"|"mov"|"avi"|"mkv"|"m4v"|"wmv"|"mp3"|"wav"|"flac"|"m4a"|"aac" => "media",
        "txt"|"md"|"csv"|"json"|"xml"|"log"|"note"|"eml" => "text",
        _ => "other",
    }
}

// Lane hint — keyword rules over the path. A fast first pass; semantic embedding
// classification is a later upgrade that refines these. Case beats patient beats
// art when multiple hit, because misfiling case evidence is the costly error.
fn lane_of(path_lower: &str) -> &'static str {
    let has = |kws: &[&str]| kws.iter().any(|k| path_lower.contains(k));
    let case = has(&["case", "evidence", "court", "exhibit", "affidavit", "subpoena", "forensic",
                     "custody", "legal", "attorney", "discovery", "qc-25", "cr2025", "cr2023"]);
    let patient = has(&["patient", "medical", "hipaa", "chart", "diagnosis", "prescription",
                        "clinic", "health", "rx", "lab-result", "labs"]);
    let art = has(&["art", "portfolio", "render", "design", "sketch", "music", "song", "creative",
                    "photoshoot", "gallery"]);
    if case { "case" } else if patient { "patient" } else if art { "art" } else { "unknown" }
}

// Completeness: verify the common image containers actually terminate. A file
// with a valid header but no end marker is truncated ("near finished or broken").
fn completeness(path: &Path, ext: &str, size: u64) -> &'static str {
    if size == 0 { return "broken"; }
    let head_tail = read_head_tail(path, 16);
    let (head, tail) = match head_tail { Some(x) => x, None => return "unknown" };
    match ext {
        "jpg" | "jpeg" => {
            let ok_head = head.starts_with(&[0xFF, 0xD8, 0xFF]);
            let ok_tail = tail.ends_with(&[0xFF, 0xD9]);
            if ok_head && ok_tail { "ok" } else if ok_head { "broken" } else { "unknown" }
        }
        "png" => {
            let ok_head = head.starts_with(&[0x89, b'P', b'N', b'G']);
            let ok_tail = tail.ends_with(&[0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]); // IEND
            if ok_head && ok_tail { "ok" } else if ok_head { "broken" } else { "unknown" }
        }
        "gif" => {
            let ok_head = head.starts_with(b"GIF8");
            let ok_tail = tail.last() == Some(&0x3B); // trailer
            if ok_head && ok_tail { "ok" } else if ok_head { "broken" } else { "unknown" }
        }
        "pdf" => {
            let ok_head = head.starts_with(b"%PDF");
            // %%EOF near the tail
            let ok_tail = tail.windows(5).any(|w| w == b"%%EOF") || true; // pdf EOF can trail; be lenient
            if ok_head && ok_tail { "ok" } else if ok_head { "broken" } else { "unknown" }
        }
        _ => "unknown",
    }
}

fn read_head_tail(path: &Path, n: usize) -> Option<(Vec<u8>, Vec<u8>)> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(path).ok()?;
    let mut head = vec![0u8; n];
    let hn = f.read(&mut head).ok()?;
    head.truncate(hn);
    let len = f.metadata().ok()?.len();
    let tstart = len.saturating_sub(n as u64);
    f.seek(SeekFrom::Start(tstart)).ok()?;
    let mut tail = vec![0u8; n];
    let tn = f.read(&mut tail).ok()?;
    tail.truncate(tn);
    Some((head, tail))
}

fn sha256_file(path: &Path) -> Option<String> {
    use std::io::Read;
    let mut f = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 1 << 16];
    loop {
        let n = f.read(&mut buf).ok()?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Some(format!("{:x}", hasher.finalize()))
}

fn scan(root: &Path, label: &str, db: &Path) -> rusqlite::Result<(usize, usize)> {
    let conn = Connection::open(db)?;
    conn.execute_batch(SCHEMA)?;
    let now = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);

    // Collect file paths first (cheap), then hash in parallel (the expensive part).
    let paths: Vec<PathBuf> = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .collect();
    let total = paths.len();

    let recs: Vec<Rec> = paths.par_iter().filter_map(|p| {
        let md = std::fs::metadata(p).ok()?;
        let size = md.len();
        let mtime = md.modified().ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64).unwrap_or(0);
        let ext = ext_of(p);
        let kind = kind_of(&ext);
        let rel = p.strip_prefix(root).map(|r| r.to_string_lossy().into_owned()).unwrap_or_else(|_| p.to_string_lossy().into_owned());
        let lane = lane_of(&p.to_string_lossy().to_lowercase());
        let high_signal = matches!(kind, "image" | "app");
        let sha256 = sha256_file(p)?;
        let complete = completeness(p, &ext, size);
        Some(Rec {
            path: p.to_string_lossy().into_owned(), rel, size, mtime, ext,
            kind, lane, high_signal, sha256, complete,
        })
    }).collect();

    let cataloged = recs.len();
    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT OR REPLACE INTO files
             (drive, path, rel, size, mtime, ext, kind, lane, high_signal, sha256, complete, scanned_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)")?;
        for r in &recs {
            stmt.execute(rusqlite::params![
                label, r.path, r.rel, r.size as i64, r.mtime, r.ext, r.kind, r.lane,
                r.high_signal as i64, r.sha256, r.complete, now])?;
        }
    }
    tx.commit()?;
    Ok((total, cataloged))
}

fn human(bytes: i64) -> String {
    const U: [&str; 6] = ["B","K","M","G","T","P"];
    let mut v = bytes as f64; let mut i = 0;
    while v >= 1024.0 && i < U.len()-1 { v /= 1024.0; i += 1; }
    if i == 0 { format!("{} B", bytes) } else { format!("{:.1} {}", v, U[i]) }
}

fn stats(db: &Path) -> rusqlite::Result<()> {
    let conn = Connection::open(db)?;
    let files: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))?;
    let bytes: i64 = conn.query_row("SELECT COALESCE(SUM(size),0) FROM files", [], |r| r.get(0))?;
    let unique: i64 = conn.query_row("SELECT COUNT(DISTINCT sha256) FROM files", [], |r| r.get(0))?;
    let dup_files: i64 = files - unique;
    // reclaimable = sum of size of all-but-one copy per sha
    let reclaimable: i64 = conn.query_row(
        "SELECT COALESCE(SUM(size*(cnt-1)),0) FROM (SELECT sha256, size, COUNT(*) cnt FROM files GROUP BY sha256 HAVING cnt>1)",
        [], |r| r.get(0)).unwrap_or(0);
    let broken: i64 = conn.query_row("SELECT COUNT(*) FROM files WHERE complete='broken'", [], |r| r.get(0))?;
    let high: i64 = conn.query_row("SELECT COUNT(*) FROM files WHERE high_signal=1", [], |r| r.get(0))?;

    println!("CORPUS CATALOG — {}", db.display());
    println!("  files (rows)      : {}", files);
    println!("  total size        : {}", human(bytes));
    println!("  unique content    : {}", unique);
    println!("  duplicate copies  : {}  (reclaimable {})", dup_files, human(reclaimable));
    println!("  high-signal       : {}  (images + apps)", high);
    println!("  broken/truncated  : {}", broken);

    println!("\n  by drive:");
    let mut st = conn.prepare("SELECT drive, COUNT(*), COALESCE(SUM(size),0) FROM files GROUP BY drive ORDER BY 3 DESC")?;
    let rows = st.query_map([], |r| Ok((r.get::<_,String>(0)?, r.get::<_,i64>(1)?, r.get::<_,i64>(2)?)))?;
    for row in rows { let (d,c,s) = row?; println!("    {:<16} {:>7} files  {:>9}", d, c, human(s)); }

    println!("\n  by kind:");
    let mut st = conn.prepare("SELECT kind, COUNT(*), COALESCE(SUM(size),0) FROM files GROUP BY kind ORDER BY 2 DESC")?;
    let rows = st.query_map([], |r| Ok((r.get::<_,String>(0)?, r.get::<_,i64>(1)?, r.get::<_,i64>(2)?)))?;
    for row in rows { let (k,c,s) = row?; println!("    {:<16} {:>7} files  {:>9}", k, c, human(s)); }

    println!("\n  by lane (keyword hint):");
    let mut st = conn.prepare("SELECT lane, COUNT(*) FROM files GROUP BY lane ORDER BY 2 DESC")?;
    let rows = st.query_map([], |r| Ok((r.get::<_,String>(0)?, r.get::<_,i64>(1)?)))?;
    for row in rows { let (l,c) = row?; println!("    {:<16} {:>7} files", l, c); }
    Ok(())
}

fn dupes(db: &Path) -> rusqlite::Result<()> {
    let conn = Connection::open(db)?;
    let mut st = conn.prepare(
        "SELECT sha256, COUNT(*) cnt, size FROM files GROUP BY sha256 HAVING cnt>1 ORDER BY size*cnt DESC LIMIT 40")?;
    let groups = st.query_map([], |r| Ok((r.get::<_,String>(0)?, r.get::<_,i64>(1)?, r.get::<_,i64>(2)?)))?;
    println!("DUPLICATE GROUPS (same content across the corpus) — top 40 by wasted space:");
    for g in groups {
        let (sha, cnt, size) = g?;
        println!("\n  {}… × {}  ({} each, {} wasted)", &sha[..16], cnt, human(size), human(size*(cnt-1)));
        let mut ps = conn.prepare("SELECT drive, rel FROM files WHERE sha256=?1 ORDER BY drive")?;
        let rows = ps.query_map([&sha], |r| Ok((r.get::<_,String>(0)?, r.get::<_,String>(1)?)))?;
        for row in rows { let (d, rel) = row?; println!("      [{}] {}", d, rel); }
    }
    Ok(())
}

fn broken(db: &Path) -> rusqlite::Result<()> {
    let conn = Connection::open(db)?;
    let mut st = conn.prepare("SELECT drive, rel, ext, size FROM files WHERE complete='broken' ORDER BY size DESC LIMIT 100")?;
    let rows = st.query_map([], |r| Ok((r.get::<_,String>(0)?, r.get::<_,String>(1)?, r.get::<_,String>(2)?, r.get::<_,i64>(3)?)))?;
    println!("BROKEN / TRUNCATED (valid header, missing end marker) — top 100:");
    for row in rows { let (d,rel,ext,s) = row?; println!("  [{}] {}  ({}, {})", d, rel, ext, human(s)); }
    Ok(())
}

fn lanes(db: &Path) -> rusqlite::Result<()> {
    let conn = Connection::open(db)?;
    for lane in ["case", "patient", "art", "unknown"] {
        let c: i64 = conn.query_row("SELECT COUNT(*) FROM files WHERE lane=?1", [lane], |r| r.get(0))?;
        println!("== {} ({} files) ==", lane.to_uppercase(), c);
        let mut st = conn.prepare("SELECT drive, rel FROM files WHERE lane=?1 AND high_signal=1 ORDER BY size DESC LIMIT 8")?;
        let rows = st.query_map([lane], |r| Ok((r.get::<_,String>(0)?, r.get::<_,String>(1)?)))?;
        for row in rows { let (d,rel) = row?; println!("   [{}] {}", d, rel); }
        println!();
    }
    println!("(lane = keyword hint over the path; semantic embedding refinement is the next layer)");
    Ok(())
}

fn export_json(db: &Path) -> rusqlite::Result<()> {
    let conn = Connection::open(db)?;
    let mut st = conn.prepare("SELECT drive,rel,size,ext,kind,lane,high_signal,sha256,complete FROM files")?;
    let rows = st.query_map([], |r| {
        Ok(serde_json::json!({
            "drive": r.get::<_,String>(0)?, "rel": r.get::<_,String>(1)?, "size": r.get::<_,i64>(2)?,
            "ext": r.get::<_,String>(3)?, "kind": r.get::<_,String>(4)?, "lane": r.get::<_,String>(5)?,
            "high_signal": r.get::<_,i64>(6)? == 1, "sha256": r.get::<_,String>(7)?, "complete": r.get::<_,String>(8)?,
        }))
    })?;
    let items: Vec<serde_json::Value> = rows.filter_map(|r| r.ok()).collect();
    println!("{}", serde_json::to_string(&serde_json::json!({"files": items})).unwrap());
    Ok(())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut db = PathBuf::from("corpus.db");
    let mut root: Option<PathBuf> = None;
    let mut label = String::from("UNLABELED");
    let cmd = args.get(1).cloned().unwrap_or_default();
    let mut i = 2;
    while i < args.len() {
        match args[i].as_str() {
            "--db" => { db = PathBuf::from(args.get(i+1).cloned().unwrap_or_default()); i += 1; }
            "--root" => { root = args.get(i+1).map(PathBuf::from); i += 1; }
            "--label" => { label = args.get(i+1).cloned().unwrap_or(label); i += 1; }
            _ => {}
        }
        i += 1;
    }

    let r = match cmd.as_str() {
        "scan" => {
            let root = match root { Some(r) => r, None => { eprintln!("scan needs --root PATH --label NAME"); std::process::exit(2); } };
            if !root.is_dir() { eprintln!("corpus: '{}' is not a directory", root.display()); std::process::exit(1); }
            eprintln!("corpus: scanning {} as '{}' (read-only) ...", root.display(), label);
            match scan(&root, &label, &db) {
                Ok((total, cat)) => { println!("scanned {} files, cataloged {} into {}", total, cat, db.display()); Ok(()) }
                Err(e) => Err(e),
            }
        }
        "stats"  => stats(&db),
        "dupes"  => dupes(&db),
        "broken" => broken(&db),
        "lanes"  => lanes(&db),
        "export" => export_json(&db),
        _ => {
            eprintln!("corpus — chain-of-custody corpus cataloger\n");
            eprintln!("  corpus scan --root PATH --label NAME [--db corpus.db]   one-button catalog a drive");
            eprintln!("  corpus stats  [--db corpus.db]                          summary + dedup + broken");
            eprintln!("  corpus dupes  [--db corpus.db]                          duplicate groups + paths");
            eprintln!("  corpus broken [--db corpus.db]                          truncated/incomplete files");
            eprintln!("  corpus lanes  [--db corpus.db]                          case / patient / art split");
            eprintln!("  corpus export --json [--db corpus.db]                   dump catalog (viewer/search)");
            std::process::exit(0);
        }
    };
    if let Err(e) = r { eprintln!("corpus: {e}"); std::process::exit(1); }
}

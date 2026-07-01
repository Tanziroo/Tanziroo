// scribe 0.3 — rescue TUI with visual simulation rendering.
//
// CHANGES from 0.2:
//   - §7.2 sim-result JSON renders as a visual panel (projected bars + action
//     badges + fit gauge). Fallback to raw text if the executor stdout isn't a
//     valid sim-result, so every existing mod keeps working.
//   - Executor WATCHDOG: 60 s timeout (override with --executor-timeout SECS).
//     A hung mod can no longer freeze scribe.
//   - Plan files[] include the `ext` field (free for downstream filtering).
//   - generated scribe-copy.sh defaults to `--dry-run` with a clear UNLOCK
//     comment, matching scribe's "look before you touch" ethos.
//   - Visual pass: sub-cell heatmap bars (8× resolution via Unicode eighths),
//     ◉/◯ selection marks, refined tab chips, status colour chip, total row
//     in the list title.
//   - Esc only closes the popup; `q` is the only quit.
//   - serde / serde_json for stable, schema-clean I/O.
//
// SAFETY (unchanged): scribe only READS the scanned tree. It writes only the
// three artifacts in the current directory. No file is copied or deleted until
// you run scribe-copy.sh.

use std::collections::{BTreeMap, HashSet};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use ratatui::{
    prelude::*,
    widgets::{Block, BorderType, Borders, Clear, Gauge, List, ListItem, ListState, Paragraph, Wrap},
};
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

const VERSION: &str = "0.3.0";
const DEFAULT_AREAS: &[&str] = &[
    "home", "medical_backups", "backup", "recovered", "forensics", "images",
    "srv", "opt", "GROK", "mnt2",
];
const DEFAULT_EXECUTOR_TIMEOUT_SECS: u64 = 60;

// ───────────────────────── data ──────────────────────────────────────────────

struct FileRec {
    rel:   String,
    size:  u64,
    ext:   String,
    group: String,
}

#[derive(Clone, Copy, PartialEq)]
enum View { Folders, Exts }

struct Row {
    key:   String,
    size:  u64,
    count: u64,
}

struct Config {
    root:             PathBuf,
    areas:            Vec<String>,
    depth:            usize,
    executor:         Option<String>,
    executor_timeout: Duration,
}

// ───────────────────────── plan / scan / sim schemas ────────────────────────

#[derive(Serialize)]
struct PlanSelection<'a> { folders: Vec<&'a str>, extensions: Vec<&'a str> }
#[derive(Serialize)]
struct PlanSummary { files: u64, bytes: u64 }
#[derive(Serialize)]
struct PlanFile<'a> { path: &'a str, bytes: u64, ext: &'a str }
#[derive(Serialize)]
struct Plan<'a> {
    scribe_version: &'static str,
    root:           String,
    selection:      PlanSelection<'a>,
    summary:        PlanSummary,
    files:          Vec<PlanFile<'a>>,
}

#[derive(Serialize)]
struct ScanRow<'a> { key: &'a str, bytes: u64, files: u64 }
#[derive(Serialize)]
struct ScanReport<'a> {
    scribe_version: &'static str,
    root:           String,
    total_bytes:    u64,
    folders:        Vec<ScanRow<'a>>,
    extensions:     Vec<ScanRow<'a>>,
}

/// §7.2 sim-result: emitted by a mod, rendered by scribe.
#[derive(Deserialize)]
struct SimResult {
    sim_version:        u32,
    #[serde(default)] dest:             String,
    #[serde(default)] dest_free_bytes:  u64,
    #[serde(default)] fits:             bool,
    #[serde(default)] eta_seconds:      u64,
    #[serde(default)] totals:           SimTotals,
    #[serde(default)] rows:             Vec<SimRow>,
}

#[derive(Deserialize, Default)]
struct SimTotals {
    #[serde(default)] copy_bytes:  u64,
    #[serde(default)] skip_bytes:  u64,
    #[serde(default)] conflicts:   u64,
}

#[derive(Deserialize, Default)]
struct SimRow {
    #[serde(default)] key:    String,
    #[serde(default)] bytes:  u64,
    #[serde(default)] action: String, // COPY | SKIP | CONFLICT | DEDUP
}

// ───────────────────────── popup content ─────────────────────────────────────

enum Popup {
    Text(String),
    Sim { result: SimResult, raw: String, raw_view: bool },
}

// ───────────────────────── app ───────────────────────────────────────────────

struct App {
    cfg:         Config,
    files:       Vec<FileRec>,
    total_bytes: u64,
    folders:     Vec<Row>,
    exts:        Vec<Row>,
    view:        View,
    state:       ListState,
    sel_folders: HashSet<String>,
    sel_exts:    HashSet<String>,
    status:      String,
    status_kind: StatusKind,
    popup:       Option<Popup>,
}

#[derive(Clone, Copy, PartialEq)]
enum StatusKind { Help, Ok, Warn, Err }

impl App {
    fn current_rows(&self) -> &[Row] {
        match self.view { View::Folders => &self.folders, View::Exts => &self.exts }
    }

    fn is_selected(&self, key: &str) -> bool {
        match self.view {
            View::Folders => self.sel_folders.contains(key),
            View::Exts    => self.sel_exts.contains(key),
        }
    }

    fn toggle_current(&mut self) {
        let idx = self.state.selected().unwrap_or(0);
        let key = match self.current_rows().get(idx) { Some(r) => r.key.clone(), None => return };
        let set = match self.view { View::Folders => &mut self.sel_folders, View::Exts => &mut self.sel_exts };
        if !set.remove(&key) { set.insert(key); }
    }

    fn select_all(&mut self, all: bool) {
        let keys: Vec<String> = self.current_rows().iter().map(|r| r.key.clone()).collect();
        let set = match self.view { View::Folders => &mut self.sel_folders, View::Exts => &mut self.sel_exts };
        set.clear();
        if all { set.extend(keys); }
    }

    fn selected_files(&self) -> Vec<&FileRec> {
        self.files.iter()
            .filter(|f| self.sel_folders.contains(&f.group) || self.sel_exts.contains(&f.ext))
            .collect()
    }

    fn selected_summary(&self) -> (u64, u64) {
        let v = self.selected_files();
        (v.iter().map(|f| f.size).sum(), v.len() as u64)
    }

    fn move_by(&mut self, delta: isize) {
        let len = self.current_rows().len();
        if len == 0 { return; }
        let cur = self.state.selected().unwrap_or(0) as isize;
        let next = (cur + delta).clamp(0, len as isize - 1);
        self.state.select(Some(next as usize));
    }

    fn set_status(&mut self, msg: impl Into<String>, kind: StatusKind) {
        self.status = msg.into();
        self.status_kind = kind;
    }

    /// The hook contract. Stable schema. Build your mod against this.
    fn build_plan_json(&self) -> String {
        let files = self.selected_files();
        let (bytes, n) = (files.iter().map(|f| f.size).sum::<u64>(), files.len() as u64);
        let mut folders: Vec<&str> = self.sel_folders.iter().map(|s| s.as_str()).collect();
        let mut exts:    Vec<&str> = self.sel_exts.iter().map(|s| s.as_str()).collect();
        folders.sort();
        exts.sort();
        let plan = Plan {
            scribe_version: VERSION,
            root:           self.cfg.root.to_string_lossy().into_owned(),
            selection:      PlanSelection { folders, extensions: exts },
            summary:        PlanSummary { files: n, bytes },
            files: files.iter().map(|f| PlanFile {
                path: &f.rel, bytes: f.size, ext: &f.ext,
            }).collect(),
        };
        serde_json::to_string_pretty(&plan).unwrap_or_else(|e| format!("{{\"error\":\"{e}\"}}"))
    }

    fn write_plan(&mut self) {
        let files = self.selected_files();
        if files.is_empty() {
            self.set_status("Nothing selected — pick folders/extensions first (Space).", StatusKind::Warn);
            return;
        }
        let lines: Vec<String> = files.iter().map(|f| f.rel.clone()).collect();
        let n = lines.len();
        let plan = self.build_plan_json();

        let copy = format!(
            "#!/usr/bin/env bash\n\
             # Generated by scribe {v}. Edit DEST then run.\n\
             #\n\
             # SAFETY: --dry-run is on by default. Verify the output looks right,\n\
             # then REMOVE the --dry-run flag to actually copy.\n\
             set -euo pipefail\n\
             DEST=\"/mnt/backup/KHETPRIME-rescue\"\n\
             mkdir -p \"$DEST\"\n\
             rsync -aAX --dry-run --info=progress2 \\\n\
                   --files-from=scribe-selection.txt \"{root}\" \"$DEST/\"\n\
             echo\n\
             echo \"DRY RUN above. If correct, re-run after removing --dry-run.\"\n\
             echo \"Selected: {n} files\"\n",
            v = VERSION, root = self.cfg.root.display(), n = n,
        );

        let r1 = std::fs::write("scribe-selection.txt", lines.join("\n") + "\n");
        let r2 = std::fs::write("scribe-plan.json",     &plan);
        let r3 = std::fs::write("scribe-copy.sh",       copy);
        match (r1, r2, r3) {
            (Ok(_), Ok(_), Ok(_)) => {
                #[cfg(unix)] {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(meta) = std::fs::metadata("scribe-copy.sh") {
                        let mut p = meta.permissions(); p.set_mode(0o755);
                        let _ = std::fs::set_permissions("scribe-copy.sh", p);
                    }
                }
                self.set_status(
                    format!("✓ wrote plan / selection / copy.sh ({n} files). Dry-run rsync: bash scribe-copy.sh"),
                    StatusKind::Ok,
                );
            }
            _ => self.set_status("✗ error writing artifacts (permission? disk full?)", StatusKind::Err),
        }
    }

    fn simulate(&mut self) {
        let prog = match &self.cfg.executor {
            Some(p) => p.clone(),
            None => {
                self.set_status("No --executor set. Run scribe with --executor /path/to/your-mod.", StatusKind::Warn);
                return;
            }
        };
        if self.selected_files().is_empty() {
            self.set_status("Nothing selected to simulate.", StatusKind::Warn);
            return;
        }
        let plan = self.build_plan_json();
        let (raw, timed_out) = run_executor_with_timeout(&prog, &plan, self.cfg.executor_timeout);
        if timed_out {
            self.set_status(
                format!("executor exceeded {}s — killed", self.cfg.executor_timeout.as_secs()),
                StatusKind::Err,
            );
        }
        // Try parsing as sim-result; fall back to text.
        let parsed: Option<SimResult> = serde_json::from_str(&raw).ok()
            .filter(|s: &SimResult| s.sim_version == 1);
        self.popup = Some(match parsed {
            Some(result) => Popup::Sim { result, raw, raw_view: false },
            None         => Popup::Text(raw),
        });
    }
}

// ───────────────────────── scan + aggregate ──────────────────────────────────

fn ext_of(p: &Path) -> String {
    match p.extension().and_then(|e| e.to_str()) {
        Some(e) => e.to_lowercase(),
        None    => "(no ext)".into(),
    }
}

fn group_of(rel: &str, depth: usize) -> String {
    let mut comps: Vec<&str> = rel.split('/').collect();
    comps.pop(); // drop filename
    if comps.is_empty() { return "(root files)".into(); }
    let take = depth.min(comps.len()).max(1);
    comps[..take].join("/")
}

fn scan(cfg: &Config) -> (Vec<FileRec>, u64) {
    let mut files = Vec::new();
    let mut skipped = 0u64;
    for area in &cfg.areas {
        let base = cfg.root.join(area);
        if !base.is_dir() { continue; }
        for entry in WalkDir::new(&base).follow_links(false).into_iter() {
            let entry = match entry { Ok(e) => e, Err(_) => { skipped += 1; continue; } };
            if !entry.file_type().is_file() { continue; }
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let rel = match entry.path().strip_prefix(&cfg.root) {
                Ok(r) => r.to_string_lossy().into_owned(),
                Err(_) => { skipped += 1; continue; }
            };
            let group = group_of(&rel, cfg.depth);
            files.push(FileRec { ext: ext_of(entry.path()), rel, size, group });
        }
    }
    (files, skipped)
}

fn aggregate(files: &[FileRec], by_folder: bool) -> Vec<Row> {
    let mut map: BTreeMap<String, (u64, u64)> = BTreeMap::new();
    for f in files {
        let key = if by_folder { &f.group } else { &f.ext };
        let e = map.entry(key.clone()).or_insert((0, 0));
        e.0 += f.size; e.1 += 1;
    }
    let mut rows: Vec<Row> = map.into_iter()
        .map(|(key, (size, count))| Row { key, size, count }).collect();
    rows.sort_by(|a, b| b.size.cmp(&a.size));
    rows
}

// ───────────────────────── visual helpers ────────────────────────────────────

fn human(bytes: u64) -> String {
    const U: [&str; 6] = ["B", "K", "M", "G", "T", "P"];
    let mut v = bytes as f64; let mut i = 0;
    while v >= 1024.0 && i < U.len() - 1 { v /= 1024.0; i += 1; }
    if i == 0 { format!("{} {}", bytes, U[0]) } else { format!("{:.1} {}", v, U[i]) }
}

fn human_secs(s: u64) -> String {
    if s < 60 { format!("{}s", s) }
    else if s < 3600 { format!("{}m {}s", s / 60, s % 60) }
    else { format!("{}h {}m", s / 3600, (s % 3600) / 60) }
}

/// Smooth horizontal bar with 1/8th-cell precision via Unicode left-blocks.
fn heat_bar(size: u64, max: u64, width: usize) -> (String, Color) {
    let ratio = if max == 0 { 0.0 } else { (size as f64 / max as f64).clamp(0.0, 1.0) };
    let eighths = (ratio * width as f64 * 8.0).round() as usize;
    let full = (eighths / 8).min(width);
    let rem  = eighths % 8;
    const PARTIAL: [char; 8] = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
    let mut bar = String::with_capacity(width * 3);
    for _ in 0..full { bar.push('█'); }
    let mut chars_used = full;
    if full < width && rem > 0 { bar.push(PARTIAL[rem]); chars_used += 1; }
    for _ in chars_used..width { bar.push(' '); }
    // SPEC §5.2 color bands — preserved exactly.
    let color = if      ratio >= 0.75 { Color::Red }
                else if ratio >= 0.50 { Color::LightRed }
                else if ratio >= 0.30 { Color::Yellow }
                else if ratio >= 0.15 { Color::Green }
                else if ratio >  0.0  { Color::Cyan }
                else                  { Color::DarkGray };
    (bar, color)
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n { s.to_string() }
    else {
        let mut t: String = s.chars().take(n.saturating_sub(1)).collect();
        t.push('…'); t
    }
}

fn tab_chip(label: &str, active: bool) -> Span<'static> {
    if active {
        Span::styled(
            format!(" ● {label} "),
            Style::default().fg(Color::Black).bg(Color::Cyan).add_modifier(Modifier::BOLD),
        )
    } else {
        Span::styled(
            format!(" ○ {label} "),
            Style::default().fg(Color::DarkGray),
        )
    }
}

fn status_dot(kind: StatusKind) -> Span<'static> {
    match kind {
        StatusKind::Help => Span::styled("● ", Style::default().fg(Color::DarkGray)),
        StatusKind::Ok   => Span::styled("● ", Style::default().fg(Color::Green)),
        StatusKind::Warn => Span::styled("● ", Style::default().fg(Color::Yellow)),
        StatusKind::Err  => Span::styled("● ", Style::default().fg(Color::Red)),
    }
}

fn action_badge(action: &str) -> Span<'static> {
    let (bg, fg) = match action {
        "COPY"     => (Color::Green,  Color::Black),
        "SKIP"     => (Color::Yellow, Color::Black),
        "CONFLICT" => (Color::Red,    Color::White),
        "DEDUP"    => (Color::Cyan,   Color::Black),
        _          => (Color::DarkGray, Color::White),
    };
    Span::styled(
        format!(" {action} "),
        Style::default().fg(fg).bg(bg).add_modifier(Modifier::BOLD),
    )
}

// ───────────────────────── UI ────────────────────────────────────────────────

fn ui(f: &mut Frame, app: &mut App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(3), Constraint::Min(0), Constraint::Length(6)])
        .split(f.area());

    render_header(f, app, chunks[0]);
    render_list(f, app, chunks[1]);
    render_footer(f, app, chunks[2]);

    if let Some(popup) = &app.popup {
        let area = centered(78, 78, f.area());
        f.render_widget(Clear, area);
        match popup {
            Popup::Text(text) => render_text_popup(f, text, area),
            Popup::Sim { result, raw, raw_view } => {
                if *raw_view { render_text_popup(f, raw, area); }
                else         { render_sim_popup(f, result, area); }
            }
        }
    }
}

fn render_header(f: &mut Frame, app: &App, area: Rect) {
    let exec = app.cfg.executor.as_deref().unwrap_or("(none)");
    let header = Paragraph::new(Line::from(vec![
        Span::styled(format!(" ✺ scribe {VERSION} "), Style::default().fg(Color::Black).bg(Color::Cyan).add_modifier(Modifier::BOLD)),
        Span::raw("  "),
        tab_chip("Folders",    app.view == View::Folders),
        Span::raw(" "),
        tab_chip("Extensions", app.view == View::Exts),
        Span::raw("   "),
        Span::styled("root: ",     Style::default().fg(Color::DarkGray)),
        Span::styled(format!("{}", app.cfg.root.display()), Style::default().fg(Color::Gray)),
        Span::raw("   "),
        Span::styled("executor: ", Style::default().fg(Color::DarkGray)),
        Span::styled(format!("{exec}"), Style::default().fg(if app.cfg.executor.is_some() { Color::Cyan } else { Color::DarkGray })),
    ]))
    .block(Block::default().borders(Borders::ALL).border_type(BorderType::Rounded).border_style(Style::default().fg(Color::DarkGray)));
    f.render_widget(header, area);
}

fn render_list(f: &mut Frame, app: &mut App, area: Rect) {
    let rows = app.current_rows();
    let max  = rows.first().map(|r| r.size).unwrap_or(0);
    let total_rows: u64 = rows.iter().map(|r| r.count).sum();
    let total_bytes: u64 = rows.iter().map(|r| r.size).sum();

    let items: Vec<ListItem> = rows.iter().map(|r| {
        let checked = app.is_selected(&r.key);
        let mark = if checked { "◉ " } else { "○ " };
        let (bar, color) = heat_bar(r.size, max, 24);
        ListItem::new(Line::from(vec![
            Span::styled(mark, Style::default().fg(if checked { Color::Green } else { Color::DarkGray })),
            Span::raw(format!("{:<28}", truncate(&r.key, 28))),
            Span::styled(format!("{:>9} ", human(r.size)), Style::default().fg(Color::Gray)),
            Span::styled(format!("{:>7}  ", r.count),      Style::default().fg(Color::DarkGray)),
            Span::styled(bar, Style::default().fg(color)),
        ]))
    }).collect();

    let title = format!(
        " {} {} · {} items · {} ",
        match app.view { View::Folders => "FOLDERS", View::Exts => "EXTENSIONS" },
        if app.view == View::Folders { "by group" } else { "by ext" },
        rows.len(),
        format!("{} in {}", human(total_bytes), total_rows),
    );
    let list = List::new(items)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .border_style(Style::default().fg(Color::DarkGray))
                .title(Span::styled(title, Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)))
        )
        .highlight_style(Style::default().bg(Color::Rgb(28, 32, 40)).add_modifier(Modifier::BOLD))
        .highlight_symbol("▎");
    f.render_stateful_widget(list, area, &mut app.state);
}

fn render_footer(f: &mut Frame, app: &App, area: Rect) {
    let outer = Block::default().borders(Borders::ALL).border_type(BorderType::Rounded).border_style(Style::default().fg(Color::DarkGray));
    f.render_widget(outer, area);
    let inner = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(1), Constraint::Length(1), Constraint::Length(2)])
        .split(area.inner(Margin { horizontal: 1, vertical: 1 }));

    let (sel_bytes, sel_n) = app.selected_summary();
    let pct = if app.total_bytes == 0 { 0.0 } else { sel_bytes as f64 / app.total_bytes as f64 };
    let gauge_color = if pct >= 0.75 { Color::Red } else if pct >= 0.40 { Color::Yellow } else { Color::Green };
    let gauge = Gauge::default()
        .gauge_style(Style::default().fg(gauge_color))
        .ratio(pct.clamp(0.0, 1.0))
        .label(format!("{} / {} selected ({:.0}%)", human(sel_bytes), human(app.total_bytes), pct * 100.0));
    f.render_widget(gauge, inner[0]);

    let summary = Paragraph::new(Line::from(vec![
        Span::styled("selected: ", Style::default().fg(Color::DarkGray)),
        Span::styled(format!("{sel_n} files"), Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
        Span::styled(format!(" · {}", human(sel_bytes)), Style::default().fg(Color::Green)),
        Span::raw("    "),
        Span::styled("folders: ", Style::default().fg(Color::DarkGray)),
        Span::styled(format!("{}", app.sel_folders.len()), Style::default().fg(Color::Cyan)),
        Span::styled("  exts: ", Style::default().fg(Color::DarkGray)),
        Span::styled(format!("{}", app.sel_exts.len()), Style::default().fg(Color::Cyan)),
    ]));
    f.render_widget(summary, inner[1]);

    let help = "Tab switch · ↑↓ move · Space pick · a/n all/none · w write plan · x simulate · q quit";
    let (msg, kind) = if app.status.is_empty() { (help.to_string(), StatusKind::Help) } else { (app.status.clone(), app.status_kind) };
    let status = Paragraph::new(Line::from(vec![ status_dot(kind), Span::raw(msg) ]))
        .style(Style::default().fg(Color::Gray))
        .wrap(Wrap { trim: true });
    f.render_widget(status, inner[2]);
}

fn render_text_popup(f: &mut Frame, text: &str, area: Rect) {
    let p = Paragraph::new(text.to_string())
        .block(
            Block::default()
                .borders(Borders::ALL).border_type(BorderType::Rounded)
                .title(Span::styled(" simulation · text mode · Esc close ", Style::default().fg(Color::Magenta).add_modifier(Modifier::BOLD)))
                .border_style(Style::default().fg(Color::Magenta))
        )
        .wrap(Wrap { trim: false });
    f.render_widget(p, area);
}

fn render_sim_popup(f: &mut Frame, sim: &SimResult, area: Rect) {
    let outer = Block::default()
        .borders(Borders::ALL).border_type(BorderType::Rounded)
        .title(Span::styled(" simulation · projected outcome · r raw · Esc close ", Style::default().fg(Color::Magenta).add_modifier(Modifier::BOLD)))
        .border_style(Style::default().fg(Color::Magenta));
    f.render_widget(outer, area);

    let inner = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(2),  // header
            Constraint::Length(3),  // fit gauge
            Constraint::Min(3),     // rows
        ])
        .split(area.inner(Margin { horizontal: 2, vertical: 1 }));

    // header
    let conflict_color = if sim.totals.conflicts > 0 { Color::Red } else { Color::Green };
    let header = Paragraph::new(vec![
        Line::from(vec![
            Span::styled("dest: ", Style::default().fg(Color::DarkGray)),
            Span::styled(
                if sim.dest.is_empty() { "(unset)".to_string() } else { sim.dest.clone() },
                Style::default().fg(Color::Gray).add_modifier(Modifier::BOLD),
            ),
        ]),
        Line::from(vec![
            Span::styled("free: ",      Style::default().fg(Color::DarkGray)),
            Span::styled(human(sim.dest_free_bytes), Style::default().fg(Color::Gray)),
            Span::styled("    copy: ",  Style::default().fg(Color::DarkGray)),
            Span::styled(human(sim.totals.copy_bytes), Style::default().fg(Color::Green)),
            Span::styled("    skip: ",  Style::default().fg(Color::DarkGray)),
            Span::styled(human(sim.totals.skip_bytes), Style::default().fg(Color::Yellow)),
            Span::styled("    eta: ",   Style::default().fg(Color::DarkGray)),
            Span::styled(human_secs(sim.eta_seconds), Style::default().fg(Color::Gray)),
            Span::styled("    conflicts: ", Style::default().fg(Color::DarkGray)),
            Span::styled(format!("{}", sim.totals.conflicts), Style::default().fg(conflict_color).add_modifier(Modifier::BOLD)),
        ]),
    ]);
    f.render_widget(header, inner[0]);

    // fit gauge
    let fit_ratio = if sim.dest_free_bytes == 0 { 0.0 }
                    else { sim.totals.copy_bytes as f64 / sim.dest_free_bytes as f64 };
    let fit_color = if !sim.fits || fit_ratio > 1.0 { Color::Red }
                    else if fit_ratio > 0.85 { Color::Yellow }
                    else { Color::Green };
    let fit_label = if sim.fits {
        format!("FITS  {} / {} ({:.0}%)", human(sim.totals.copy_bytes), human(sim.dest_free_bytes), (fit_ratio * 100.0).min(999.0))
    } else {
        format!("DOES NOT FIT  {} / {} ({:.0}%)", human(sim.totals.copy_bytes), human(sim.dest_free_bytes), (fit_ratio * 100.0).min(999.0))
    };
    let gauge = Gauge::default()
        .block(Block::default().borders(Borders::TOP).border_style(Style::default().fg(Color::DarkGray)).title(" fit "))
        .gauge_style(Style::default().fg(fit_color))
        .ratio(fit_ratio.min(1.0))
        .label(fit_label);
    f.render_widget(gauge, inner[1]);

    // rows
    let max_bytes = sim.rows.iter().map(|r| r.bytes).max().unwrap_or(0);
    let items: Vec<ListItem> = sim.rows.iter().map(|r| {
        let (bar, color) = heat_bar(r.bytes, max_bytes, 24);
        ListItem::new(Line::from(vec![
            Span::raw(format!("{:<24}", truncate(&r.key, 24))),
            Span::styled(bar, Style::default().fg(color)),
            Span::styled(format!("  {:>9} ", human(r.bytes)), Style::default().fg(Color::Gray)),
            action_badge(&r.action),
        ]))
    }).collect();
    let list = List::new(items)
        .block(Block::default().borders(Borders::TOP).border_style(Style::default().fg(Color::DarkGray)).title(format!(" {} rows ", sim.rows.len())));
    f.render_widget(list, inner[2]);
}

fn centered(pct_x: u16, pct_y: u16, area: Rect) -> Rect {
    let v = Layout::default().direction(Direction::Vertical).constraints([
        Constraint::Percentage((100 - pct_y) / 2),
        Constraint::Percentage(pct_y),
        Constraint::Percentage((100 - pct_y) / 2),
    ]).split(area);
    Layout::default().direction(Direction::Horizontal).constraints([
        Constraint::Percentage((100 - pct_x) / 2),
        Constraint::Percentage(pct_x),
        Constraint::Percentage((100 - pct_x) / 2),
    ]).split(v[1])[1]
}

// ───────────────────────── executor (watchdog) ──────────────────────────────

fn run_executor_with_timeout(prog: &str, plan: &str, timeout: Duration) -> (String, bool) {
    let mut parts = prog.split_whitespace();
    let exe = match parts.next() { Some(e) => e, None => return ("empty executor".into(), false) };
    let args: Vec<&str> = parts.collect();

    let mut child = match Command::new(exe).args(&args)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return (format!("could not start executor '{prog}': {e}"), false),
    };

    // stdin in a thread so a small pipe buffer can't deadlock us
    if let Some(mut stdin) = child.stdin.take() {
        let bytes = plan.as_bytes().to_vec();
        std::thread::spawn(move || { let _ = stdin.write_all(&bytes); }); // dropped → EOF
    }

    let stdout_h = child.stdout.take().map(|mut s| std::thread::spawn(move || {
        let mut buf = String::new(); s.read_to_string(&mut buf).ok(); buf
    }));
    let stderr_h = child.stderr.take().map(|mut s| std::thread::spawn(move || {
        let mut buf = String::new(); s.read_to_string(&mut buf).ok(); buf
    }));

    let deadline = Instant::now() + timeout;
    let timed_out = loop {
        match child.try_wait() {
            Ok(Some(_)) => break false,
            Ok(None)    => {}
            Err(_)      => break false,
        }
        if Instant::now() >= deadline { let _ = child.kill(); let _ = child.wait(); break true; }
        std::thread::sleep(Duration::from_millis(50));
    };

    let out_s = stdout_h.and_then(|h| h.join().ok()).unwrap_or_default();
    let err_s = stderr_h.and_then(|h| h.join().ok()).unwrap_or_default();

    let mut s = out_s;
    if !err_s.is_empty() { s.push_str("\n--- stderr ---\n"); s.push_str(&err_s); }
    if timed_out         { s.push_str("\n--- executor timed out — killed ---"); }
    if s.trim().is_empty() && !timed_out { s = "(executor produced no output)".into(); }
    (s, timed_out)
}

// ───────────────────────── event loop ────────────────────────────────────────

fn run(terminal: &mut Terminal<impl Backend>, app: &mut App) -> io::Result<()> {
    loop {
        terminal.draw(|f| ui(f, app))?;
        if !event::poll(Duration::from_millis(250))? { continue; }
        if let Event::Key(k) = event::read()? {
            if k.kind != KeyEventKind::Press { continue; }

            // popup swallows almost everything until closed
            if app.popup.is_some() {
                match k.code {
                    KeyCode::Esc | KeyCode::Enter | KeyCode::Char('x') => app.popup = None,
                    KeyCode::Char('r') => {
                        if let Some(Popup::Sim { raw_view, .. }) = &mut app.popup { *raw_view = !*raw_view; }
                    }
                    KeyCode::Char('q') => return Ok(()),
                    _ => {}
                }
                continue;
            }

            app.status.clear();
            app.status_kind = StatusKind::Help;
            match k.code {
                KeyCode::Char('q')               => return Ok(()),
                KeyCode::Esc                     => {} // §5.4 — Esc reserved for popup
                KeyCode::Tab                     => {
                    app.view = if app.view == View::Folders { View::Exts } else { View::Folders };
                    app.state.select(Some(0));
                }
                KeyCode::Down | KeyCode::Char('j') => app.move_by(1),
                KeyCode::Up   | KeyCode::Char('k') => app.move_by(-1),
                KeyCode::Char(' ') | KeyCode::Enter => app.toggle_current(),
                KeyCode::Char('a')                  => app.select_all(true),
                KeyCode::Char('n')                  => app.select_all(false),
                KeyCode::Char('w')                  => app.write_plan(),
                KeyCode::Char('x')                  => app.simulate(),
                _ => {}
            }
        }
    }
}

// ───────────────────────── CLI ───────────────────────────────────────────────

fn parse_args() -> (Config, bool) {
    let mut root: Option<PathBuf>     = None;
    let mut areas: Option<Vec<String>> = None;
    let mut depth: usize              = 2;
    let mut executor: Option<String>  = None;
    let mut exec_timeout: u64         = DEFAULT_EXECUTOR_TIMEOUT_SECS;
    let mut json = false;

    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "--json"             => json = true,
            "--executor"         => executor = it.next(),
            "--executor-timeout" => exec_timeout = it.next().and_then(|s| s.parse().ok()).unwrap_or(DEFAULT_EXECUTOR_TIMEOUT_SECS),
            "--depth"            => depth = it.next().and_then(|s| s.parse().ok()).unwrap_or(2),
            "--areas"            => areas = it.next().map(|s| s.split(',').map(|x| x.trim().to_string()).collect()),
            "-h" | "--help"      => { print_help(); std::process::exit(0); }
            other if !other.starts_with('-') => root = Some(PathBuf::from(other)),
            other => { eprintln!("scribe: unknown flag '{other}' (try --help)"); std::process::exit(2); }
        }
    }
    let cfg = Config {
        root:             root.unwrap_or_else(|| PathBuf::from("/mnt/sys")),
        areas:            areas.unwrap_or_else(|| DEFAULT_AREAS.iter().map(|s| s.to_string()).collect()),
        depth:            depth.max(1),
        executor,
        executor_timeout: Duration::from_secs(exec_timeout.max(1)),
    };
    (cfg, json)
}

fn print_help() {
    println!(
        "scribe {VERSION} — scan, heatmap, select-to-backup, with a simulation hook\n\n\
         USAGE:\n  scribe [ROOT] [--areas a,b,c] [--depth N] [--executor PROG]\n         [--executor-timeout SECS] [--json]\n\n\
         ROOT                  directory to scan under (default /mnt/sys)\n\
         --areas               comma list of top folders to scan (default: {areas})\n\
         --depth               folder-grouping depth for the Folders view (default 2)\n\
         --executor            program to pipe scribe-plan.json to on 'x'\n\
         --executor-timeout    seconds before a hung executor is killed (default {to})\n\
         --json                print the scan as JSON and exit (no TUI)\n\n\
         In the TUI press 'w' to write scribe-plan.json / -selection.txt / -copy.sh.\n\
         Press 'x' to pipe the live plan to your executor and render the result.\n\
         If the executor's stdout is a sim-result v1 JSON document, scribe renders\n\
         it as a colored panel; otherwise the raw text is shown. (See SPEC §7.)",
        areas = DEFAULT_AREAS.join(","),
        to = DEFAULT_EXECUTOR_TIMEOUT_SECS,
    );
}

// ───────────────────────── main ──────────────────────────────────────────────

fn main() -> io::Result<()> {
    let (cfg, json_mode) = parse_args();

    if !cfg.root.is_dir() {
        eprintln!("scribe: '{}' is not a directory. (try --help)", cfg.root.display());
        std::process::exit(1);
    }

    eprintln!("scribe: scanning {} ...", cfg.root.display());
    let (files, skipped) = scan(&cfg);
    if files.is_empty() {
        eprintln!("scribe: no files in the scanned areas under {}.\n  areas: {}",
                  cfg.root.display(), cfg.areas.join(", "));
        std::process::exit(1);
    }
    let total_bytes = files.iter().map(|f| f.size).sum();
    let folders = aggregate(&files, true);
    let exts    = aggregate(&files, false);

    if json_mode {
        let report = ScanReport {
            scribe_version: VERSION,
            root: cfg.root.to_string_lossy().into_owned(),
            total_bytes,
            folders: folders.iter().map(|r| ScanRow { key: &r.key, bytes: r.size, files: r.count }).collect(),
            extensions: exts.iter().map(|r| ScanRow { key: &r.key, bytes: r.size, files: r.count }).collect(),
        };
        println!("{}", serde_json::to_string_pretty(&report).unwrap());
        return Ok(());
    }

    let mut state = ListState::default(); state.select(Some(0));
    let initial_status = if skipped > 0 {
        (format!("scanned {} files; skipped {} (permission / errors)", files.len(), skipped), StatusKind::Warn)
    } else {
        (format!("scanned {} files in {} folders, {} exts", files.len(), folders.len(), exts.len()), StatusKind::Ok)
    };
    let mut app = App {
        cfg, files, total_bytes, folders, exts,
        view: View::Folders, state,
        sel_folders: HashSet::new(), sel_exts: HashSet::new(),
        status: initial_status.0, status_kind: initial_status.1,
        popup: None,
    };

    let mut terminal = ratatui::init();
    let res = run(&mut terminal, &mut app);
    ratatui::restore();
    res
}


// ───────────────────────── snapshot tests ───────────────────────────────────
//
// These render real frames into an in-memory TestBackend buffer and assert on
// the actual cells. That means the TUI's *visual* layout is verifiable without
// a physical terminal — run `cargo test -- --nocapture` to print the frames as
// text and eyeball them, or just `cargo test` to gate on the assertions.
#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::backend::TestBackend;
    use ratatui::Terminal;

    fn demo_app() -> App {
        let folders = vec![
            Row { key: "images".into(),          size: 12_000_000, count: 1 },
            Row { key: "medical_backups".into(), size: 11_000_000, count: 2 },
            Row { key: "backup/2025".into(),     size: 3_000_000,  count: 1 },
            Row { key: "home/khet".into(),       size: 2_000_000,  count: 2 },
            Row { key: "forensics".into(),       size: 200_000,    count: 1 },
        ];
        let total = folders.iter().map(|r| r.size).sum();
        let mut state = ListState::default();
        state.select(Some(0));
        let mut app = App {
            cfg: Config {
                root: PathBuf::from("/mnt/sys"),
                areas: vec![],
                depth: 2,
                executor: Some("./scribe-mod-sim".into()),
                executor_timeout: Duration::from_secs(60),
            },
            files: vec![],
            total_bytes: total,
            folders,
            exts: vec![],
            view: View::Folders,
            state,
            sel_folders: HashSet::new(),
            sel_exts: HashSet::new(),
            status: String::new(),
            status_kind: StatusKind::Help,
            popup: None,
        };
        app.sel_folders.insert("medical_backups".into());
        app
    }

    /// Dump a rendered frame as text so a human (or model) can read the layout.
    fn render_to_text(app: &mut App, w: u16, h: u16) -> String {
        let backend = TestBackend::new(w, h);
        let mut terminal = Terminal::new(backend).unwrap();
        terminal.draw(|f| ui(f, app)).unwrap();
        let buf = terminal.backend().buffer().clone();
        let mut out = String::new();
        for y in 0..buf.area.height {
            for x in 0..buf.area.width {
                out.push_str(buf[(x, y)].symbol());
            }
            out.push('\n');
        }
        out
    }

    #[test]
    fn main_view_renders_expected_elements() {
        let mut app = demo_app();
        let text = render_to_text(&mut app, 90, 24);
        println!("\n===== MAIN VIEW (90x24) =====\n{text}");
        assert!(text.contains("scribe 0.3.0"), "header/version missing");
        assert!(text.contains("Folders"),      "tab bar missing");
        assert!(text.contains("images"),       "top folder row missing");
        assert!(text.contains("◉"),            "selected mark missing");
        assert!(text.contains("○"),            "unselected mark missing");
        assert!(text.contains("█"),            "heatmap bar missing");
        assert!(text.contains("selected"),     "selection gauge label missing");
    }

    #[test]
    fn sim_popup_renders_badges_and_gauge() {
        let mut app = demo_app();
        app.popup = Some(Popup::Sim {
            result: SimResult {
                sim_version: 1,
                dest: "/mnt/backup/rescue".into(),
                dest_free_bytes: 62_000_000_000,
                fits: true,
                eta_seconds: 420,
                totals: SimTotals { copy_bytes: 15_000_000_000, skip_bytes: 250_000_000, conflicts: 0 },
                rows: vec![
                    SimRow { key: "medical_backups".into(), bytes: 8_700_000_000, action: "COPY".into() },
                    SimRow { key: "backup".into(),          bytes: 7_200_000_000, action: "COPY".into() },
                    SimRow { key: "(dedup)".into(),         bytes: 250_000_000,   action: "SKIP".into() },
                ],
            },
            raw: String::new(),
            raw_view: false,
        });
        let text = render_to_text(&mut app, 90, 28);
        println!("\n===== SIM POPUP (90x28) =====\n{text}");
        assert!(text.contains("projected outcome"), "sim title missing");
        assert!(text.contains("COPY"),  "COPY badge missing");
        assert!(text.contains("SKIP"),  "SKIP badge missing");
        assert!(text.contains("FITS"),  "fit gauge label missing");
        assert!(text.contains("/mnt/backup/rescue"), "dest header missing");
    }

    #[test]
    fn empty_selection_is_safe() {
        let mut app = demo_app();
        app.sel_folders.clear();
        let (bytes, n) = app.selected_summary();
        assert_eq!((bytes, n), (0, 0));
        // build_plan_json must not panic on empty selection
        let _ = app.build_plan_json();
    }
}

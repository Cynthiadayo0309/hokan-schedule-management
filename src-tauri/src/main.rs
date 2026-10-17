#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use rusqlite::{params, Connection};
use serde::Serialize;
use std::{fs, path::PathBuf};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
struct Stored { revision: i64, data: Option<String> }

fn database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|_| "保存場所を取得できません。")?;
    fs::create_dir_all(&dir).map_err(|_| "保存フォルダーを作成できません。")?;
    let db = Connection::open(dir.join("schedule.sqlite3")).map_err(|_| "データベースを開けません。")?;
    db.busy_timeout(std::time::Duration::from_secs(5)).map_err(|_| "データベースの設定に失敗しました。")?;
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, data TEXT); INSERT OR IGNORE INTO app_state VALUES(1,0,NULL);").map_err(|_| "データベースを準備できません。")?;
    Ok(db)
}
#[tauri::command]
fn load_state(app: tauri::AppHandle) -> Result<Stored, String> {
    database(&app)?.query_row("SELECT revision,data FROM app_state WHERE id=1", [], |r| Ok(Stored { revision:r.get(0)?, data:r.get(1)? })).map_err(|_| "保存データを読み込めません。バックアップを確認してください。".into())
}
#[tauri::command]
fn save_state(app: tauri::AppHandle, data: String, expected_revision: i64) -> Result<i64, String> {
    if data.len() > 100_000_000 { return Err("データが大きすぎます。".into()); }
    let value: serde_json::Value = serde_json::from_str(&data).map_err(|_| "保存データの形式が不正です。")?;
    if value["version"] != 1 || !value["facilities"].is_array() { return Err("保存形式が未対応です。".into()); }
    let changed = database(&app)?.execute("UPDATE app_state SET data=?1,revision=revision+1 WHERE id=1 AND revision=?2", params![data,expected_revision]).map_err(|_| "保存に失敗しました。空き容量とアクセス権を確認してください。")?;
    if changed != 1 { return Err("別のウィンドウで保存されました。アプリを再起動して最新データを開いてください。".into()); }
    Ok(expected_revision+1)
}
#[tauri::command]
async fn export_file(app: tauri::AppHandle, name: String, bytes: Vec<u8>, extension: String) -> Result<bool,String> {
    if !["json","xlsx"].contains(&extension.as_str()) || bytes.len()>100_000_000 { return Err("出力形式・サイズが不正です。".into()); }
    let file=app.dialog().file().add_filter("出力ファイル", &[&extension]).set_file_name(name).blocking_save_file();
    let Some(file)=file else {return Ok(false)};
    let path=file.into_path().map_err(|_| "保存先が不正です。")?.with_extension(&extension);
    // Write beside the destination and rename only after flush; keep the previous file on failure.
    let temp:PathBuf=path.with_extension(format!("{}.tmp",extension));
    let mut out=fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|_| "一時ファイルを作成できません。同名の.tmpファイルとアクセス権を確認してください。")?;
    use std::io::Write;
    if out.write_all(&bytes).and_then(|_|out.sync_all()).is_err() { drop(out); let _=fs::remove_file(&temp); return Err("ファイルの保存に失敗しました。".into()); }
    drop(out);
    // Windows MoveFileEx semantics are provided by rename: destination replacement is atomic.
    if fs::rename(&temp,&path).is_err() { let _=fs::remove_file(&temp); return Err("ファイルを置き換えられません。Excelで開いていないか確認してください。".into()); }
    Ok(true)
}
#[tauri::command]
async fn import_file(app: tauri::AppHandle) -> Result<Option<String>,String> {
    let Some(file)=app.dialog().file().add_filter("バックアップ", &["json"]).blocking_pick_file() else {return Ok(None)};
    let path=file.into_path().map_err(|_| "ファイルを開けません。")?;
    if fs::metadata(&path).map_err(|_| "ファイルを読み込めません。")?.len()>100_000_000 {return Err("ファイルが大きすぎます。".into());}
    fs::read_to_string(path).map(Some).map_err(|_| "バックアップを読み込めません。".into())
}
fn main() {
    tauri::Builder::default().plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_state,save_state,export_file,import_file])
        .run(tauri::generate_context!()).expect("アプリを起動できませんでした。");
}

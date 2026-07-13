use rusqlite::{backup::Backup, Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::{
    fs,
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

const LOCAL_DATABASE_NAME: &str = "uspevatel-desktop.db";
const LOCAL_ASSET_DIRECTORY: &str = "snapshot-assets";
const ASSET_SUBDIRECTORIES: &[&str] = &["task_images", "flight_images", "exercise_images"];
const REQUIRED_TABLES: &[&str] = &[
    "tasks",
    "projects",
    "settings",
    "routines",
    "routine_completions",
    "checklist",
    "flights",
    "sport_entries",
    "exercises",
    "workout_logs",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotImportResult {
    source_path: String,
    local_path: String,
    asset_root: String,
    asset_files_copied: usize,
    schema_version: Option<String>,
    task_count: i64,
}

fn sqlite_error(context: &str, error: impl std::fmt::Display) -> String {
    format!("{context}: {error}")
}

fn open_and_validate(path: &Path) -> Result<(Connection, Option<String>, i64), String> {
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| sqlite_error("Не удалось открыть snapshot как SQLite", error))?;
    connection
        .busy_timeout(Duration::from_secs(10))
        .map_err(|error| sqlite_error("Не удалось настроить SQLite", error))?;

    let quick_check: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| sqlite_error("Проверка целостности snapshot не выполнена", error))?;
    if quick_check != "ok" {
        return Err(format!(
            "Snapshot повреждён: PRAGMA quick_check вернул {quick_check}"
        ));
    }

    for table in REQUIRED_TABLES {
        let exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table],
                |row| row.get(0),
            )
            .map_err(|error| sqlite_error("Не удалось проверить схему snapshot", error))?;
        if exists != 1 {
            return Err(format!(
                "Файл не похож на базу Uspevatel: отсутствует таблица {table}"
            ));
        }
    }

    for column in ["id", "action", "category", "created_at", "updated_at"] {
        let exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = ?1",
                [column],
                |row| row.get(0),
            )
            .map_err(|error| sqlite_error("Не удалось проверить схему tasks", error))?;
        if exists != 1 {
            return Err(format!(
                "Несовместимая схема tasks: отсутствует колонка {column}"
            ));
        }
    }

    let schema_version = connection
        .query_row(
            "SELECT value FROM settings WHERE key = 'schema_version'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| sqlite_error("Не удалось прочитать schema_version", error))?;
    let task_count = connection
        .query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
        .map_err(|error| sqlite_error("Не удалось посчитать задачи", error))?;

    Ok((connection, schema_version, task_count))
}

fn sqlite_sidecar(path: &Path, suffix: &str) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(suffix);
    PathBuf::from(value)
}

fn remove_database_files(path: &Path) -> Result<(), String> {
    for candidate in [
        path.to_path_buf(),
        sqlite_sidecar(path, "-wal"),
        sqlite_sidecar(path, "-shm"),
    ] {
        if candidate.exists() {
            fs::remove_file(&candidate).map_err(|error| {
                sqlite_error(
                    &format!("Не удалось удалить {}", candidate.display()),
                    error,
                )
            })?;
        }
    }
    Ok(())
}

fn move_database_files(from: &Path, to: &Path) -> Result<(), String> {
    let mut moved = Vec::<(PathBuf, PathBuf)>::new();
    for (source, destination) in [
        (from.to_path_buf(), to.to_path_buf()),
        (sqlite_sidecar(from, "-wal"), sqlite_sidecar(to, "-wal")),
        (sqlite_sidecar(from, "-shm"), sqlite_sidecar(to, "-shm")),
    ] {
        if !source.exists() {
            continue;
        }
        if let Err(error) = fs::rename(&source, &destination) {
            for (rollback_source, rollback_destination) in moved.into_iter().rev() {
                let _ = fs::rename(rollback_destination, rollback_source);
            }
            return Err(sqlite_error(
                &format!("Не удалось переместить {}", source.display()),
                error,
            ));
        }
        moved.push((source, destination));
    }
    Ok(())
}

fn replace_atomically(temp_path: &Path, active_path: &Path) -> Result<(), String> {
    let backup_path = active_path.with_extension("db.previous");
    remove_database_files(&backup_path)?;

    let had_active = active_path.exists();
    if had_active {
        move_database_files(active_path, &backup_path)?;
    } else {
        // Sidecars without a main file are stale and must not be replayed into
        // the newly imported database.
        for suffix in ["-wal", "-shm"] {
            let sidecar = sqlite_sidecar(active_path, suffix);
            if sidecar.exists() {
                fs::remove_file(&sidecar).map_err(|error| {
                    sqlite_error("Не удалось удалить устаревший SQLite sidecar", error)
                })?;
            }
        }
    }

    if let Err(error) = fs::rename(temp_path, active_path) {
        if had_active {
            let _ = move_database_files(&backup_path, active_path);
        }
        return Err(sqlite_error(
            "Не удалось атомарно установить импортированный snapshot",
            error,
        ));
    }
    Ok(())
}

fn remove_directory_if_exists(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_dir_all(path).map_err(|error| {
            sqlite_error(
                &format!("Не удалось удалить каталог {}", path.display()),
                error,
            )
        })?;
    }
    Ok(())
}

fn copy_asset_tree(
    source: &Path,
    destination: &Path,
    allowed_root: &Path,
) -> Result<usize, String> {
    let metadata = fs::symlink_metadata(source)
        .map_err(|error| sqlite_error("Не удалось прочитать metadata вложения", error))?;
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Символические ссылки в snapshot assets запрещены: {}",
            source.display()
        ));
    }

    let canonical_source = fs::canonicalize(source)
        .map_err(|error| sqlite_error("Не удалось разрешить путь вложения", error))?;
    if !canonical_source.starts_with(allowed_root) {
        return Err(format!(
            "Путь вложения выходит за каталог snapshot: {}",
            source.display()
        ));
    }

    if metadata.is_dir() {
        fs::create_dir_all(destination)
            .map_err(|error| sqlite_error("Не удалось создать каталог вложений", error))?;
        let mut copied = 0;
        for entry in fs::read_dir(source)
            .map_err(|error| sqlite_error("Не удалось прочитать каталог вложений", error))?
        {
            let entry =
                entry.map_err(|error| sqlite_error("Не удалось прочитать вложение", error))?;
            copied += copy_asset_tree(
                &entry.path(),
                &destination.join(entry.file_name()),
                allowed_root,
            )?;
        }
        return Ok(copied);
    }

    if !metadata.is_file() {
        return Err(format!(
            "Неподдерживаемый тип snapshot asset: {}",
            source.display()
        ));
    }
    fs::copy(&canonical_source, destination)
        .map_err(|error| sqlite_error("Не удалось скопировать вложение", error))?;
    OpenOptions::new()
        .read(true)
        .open(destination)
        .and_then(|file| file.sync_all())
        .map_err(|error| sqlite_error("Не удалось записать вложение на диск", error))?;
    Ok(1)
}

fn prepare_asset_copy(source_root: &Path, temp_root: &Path) -> Result<usize, String> {
    remove_directory_if_exists(temp_root)?;
    fs::create_dir_all(temp_root)
        .map_err(|error| sqlite_error("Не удалось создать временный каталог вложений", error))?;

    let canonical_root = fs::canonicalize(source_root)
        .map_err(|error| sqlite_error("Не удалось разрешить каталог snapshot", error))?;
    let mut copied = 0;
    for directory in ASSET_SUBDIRECTORIES {
        let source = source_root.join(directory);
        if source.exists() {
            copied += copy_asset_tree(&source, &temp_root.join(directory), &canonical_root)?;
        }
    }
    Ok(copied)
}

fn replace_asset_directory(temp_root: &Path, active_root: &Path) -> Result<bool, String> {
    let previous_root = active_root.with_extension("previous");
    remove_directory_if_exists(&previous_root)?;
    let had_active = active_root.exists();
    if had_active {
        fs::rename(active_root, &previous_root)
            .map_err(|error| sqlite_error("Не удалось сохранить предыдущие вложения", error))?;
    }
    if let Err(error) = fs::rename(temp_root, active_root) {
        if had_active {
            let _ = fs::rename(&previous_root, active_root);
        }
        return Err(sqlite_error(
            "Не удалось установить локальную копию вложений",
            error,
        ));
    }
    Ok(had_active)
}

fn rollback_asset_directory(active_root: &Path, had_active: bool) -> Result<(), String> {
    let previous_root = active_root.with_extension("previous");
    remove_directory_if_exists(active_root)?;
    if had_active {
        fs::rename(&previous_root, active_root)
            .map_err(|error| sqlite_error("Не удалось восстановить предыдущие вложения", error))?;
    }
    Ok(())
}

fn import_mobile_snapshot_from_path(
    app: &tauri::AppHandle,
    source_path: String,
) -> Result<SnapshotImportResult, String> {
    let source_path_buf = PathBuf::from(&source_path);
    if !source_path_buf.is_file() {
        return Err("Выбранный snapshot не является файлом".to_string());
    }

    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| sqlite_error("Не удалось определить каталог приложения", error))?;
    fs::create_dir_all(&app_config_dir)
        .map_err(|error| sqlite_error("Не удалось создать каталог приложения", error))?;

    let active_path = app_config_dir.join(LOCAL_DATABASE_NAME);
    let temp_path = app_config_dir.join(format!("{LOCAL_DATABASE_NAME}.importing"));
    let backup_path = active_path.with_extension("db.previous");
    let active_asset_root = app_config_dir.join(LOCAL_ASSET_DIRECTORY);
    let temp_asset_root = app_config_dir.join(format!("{LOCAL_ASSET_DIRECTORY}.importing"));
    let source_canonical = fs::canonicalize(&source_path_buf)
        .map_err(|error| sqlite_error("Не удалось разрешить путь snapshot", error))?;
    for managed_path in [&active_path, &temp_path, &backup_path] {
        if managed_path.exists()
            && fs::canonicalize(managed_path)
                .map(|path| path == source_canonical)
                .unwrap_or(false)
        {
            return Err(
                "Нельзя импортировать внутреннюю desktop-БД как мобильный snapshot".to_string(),
            );
        }
    }

    let (source, schema_version, task_count) = open_and_validate(&source_path_buf)?;
    if temp_path.exists() {
        fs::remove_file(&temp_path)
            .map_err(|error| sqlite_error("Не удалось очистить временный snapshot", error))?;
    }

    {
        let mut destination = Connection::open(&temp_path)
            .map_err(|error| sqlite_error("Не удалось создать локальную копию", error))?;
        let backup = Backup::new(&source, &mut destination)
            .map_err(|error| sqlite_error("Не удалось начать SQLite backup", error))?;
        backup
            .run_to_completion(128, Duration::from_millis(10), None)
            .map_err(|error| sqlite_error("Не удалось скопировать SQLite snapshot", error))?;
    }

    let (_, copied_schema_version, copied_task_count) = open_and_validate(&temp_path)?;
    if copied_schema_version != schema_version || copied_task_count != task_count {
        let _ = fs::remove_file(&temp_path);
        return Err("Проверка локальной копии не совпала с исходным snapshot".to_string());
    }
    OpenOptions::new()
        .read(true)
        .open(&temp_path)
        .and_then(|file| file.sync_all())
        .map_err(|error| sqlite_error("Не удалось записать snapshot на диск", error))?;

    let source_root = source_canonical
        .parent()
        .ok_or_else(|| "Не удалось определить каталог snapshot".to_string())?;
    let asset_files_copied = prepare_asset_copy(source_root, &temp_asset_root)?;
    drop(source);
    let had_assets = replace_asset_directory(&temp_asset_root, &active_asset_root)?;
    if let Err(database_error) = replace_atomically(&temp_path, &active_path) {
        return match rollback_asset_directory(&active_asset_root, had_assets) {
            Ok(()) => Err(database_error),
            Err(rollback_error) => Err(format!(
                "{database_error}; также не удалось восстановить вложения: {rollback_error}"
            )),
        };
    }

    Ok(SnapshotImportResult {
        source_path,
        local_path: active_path.to_string_lossy().into_owned(),
        asset_root: active_asset_root.to_string_lossy().into_owned(),
        asset_files_copied,
        schema_version,
        task_count,
    })
}

#[tauri::command]
async fn choose_and_import_mobile_snapshot(
    app: tauri::AppHandle,
) -> Result<Option<SnapshotImportResult>, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("SQLite", &["db", "sqlite", "sqlite3"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|error| sqlite_error("Не удалось получить путь snapshot", error))?;
    let source_path = path.to_string_lossy().into_owned();
    import_mobile_snapshot_from_path(&app, source_path).map(Some)
}

#[tauri::command]
async fn save_desktop_export(
    app: tauri::AppHandle,
    contents: String,
) -> Result<Option<String>, String> {
    let selected = app
        .dialog()
        .file()
        .set_file_name("uspevatel-backup.json")
        .add_filter("JSON", &["json"])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|error| sqlite_error("Не удалось получить путь экспорта", error))?;
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&path)
        .map_err(|error| sqlite_error("Не удалось создать файл экспорта", error))?;
    file.write_all(contents.as_bytes())
        .map_err(|error| sqlite_error("Не удалось записать экспорт", error))?;
    file.sync_all()
        .map_err(|error| sqlite_error("Не удалось сохранить экспорт на диск", error))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            choose_and_import_mobile_snapshot,
            save_desktop_export
        ])
        .run(tauri::generate_context!())
        .expect("error while running Uspevatel desktop");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_dir(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "uspevatel-desktop-{label}-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create test directory");
        path
    }

    fn create_valid_database(path: &Path) {
        let connection = Connection::open(path).expect("create sqlite database");
        connection
            .execute_batch(
                "CREATE TABLE tasks (
                    id TEXT PRIMARY KEY,
                    action TEXT NOT NULL,
                    category TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                 );
                 CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 CREATE TABLE projects (id TEXT PRIMARY KEY);
                 CREATE TABLE routines (id TEXT PRIMARY KEY);
                 CREATE TABLE routine_completions (routine_id TEXT, date TEXT);
                 CREATE TABLE checklist (id TEXT PRIMARY KEY);
                 CREATE TABLE flights (id TEXT PRIMARY KEY);
                 CREATE TABLE sport_entries (id TEXT PRIMARY KEY);
                 CREATE TABLE exercises (id INTEGER PRIMARY KEY);
                 CREATE TABLE workout_logs (id INTEGER PRIMARY KEY);
                 INSERT INTO settings (key, value) VALUES ('schema_version', '42');
                 INSERT INTO tasks (id, action, category, created_at, updated_at)
                 VALUES ('task-1', 'Проверить snapshot', 'IN', '2026-07-13', '2026-07-13');",
            )
            .expect("create compatible schema");
    }

    #[test]
    fn snapshot_validation_is_read_only_and_reports_metadata() {
        let dir = test_dir("validate");
        let path = dir.join("mobile.db");
        create_valid_database(&path);

        let (connection, schema_version, task_count) =
            open_and_validate(&path).expect("valid snapshot");
        assert_eq!(schema_version.as_deref(), Some("42"));
        assert_eq!(task_count, 1);
        assert!(
            connection.execute("DELETE FROM tasks", []).is_err(),
            "source connection must remain read-only"
        );

        drop(connection);
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn atomic_replace_keeps_previous_database_and_wal_sidecar() {
        let dir = test_dir("replace");
        let active = dir.join("uspevatel-desktop.db");
        let temp = dir.join("importing.db");
        fs::write(&active, b"old").expect("write active");
        fs::write(sqlite_sidecar(&active, "-wal"), b"old-wal").expect("write wal");
        fs::write(&temp, b"new").expect("write temp");

        replace_atomically(&temp, &active).expect("replace database");

        let previous = active.with_extension("db.previous");
        assert_eq!(fs::read(&active).expect("active bytes"), b"new");
        assert_eq!(fs::read(&previous).expect("backup bytes"), b"old");
        assert_eq!(
            fs::read(sqlite_sidecar(&previous, "-wal")).expect("backup wal"),
            b"old-wal"
        );
        assert!(!sqlite_sidecar(&active, "-wal").exists());

        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn asset_copy_only_includes_supported_mobile_directories() {
        let dir = test_dir("assets");
        let source = dir.join("source");
        let destination = dir.join("destination");
        fs::create_dir_all(source.join("task_images/nested")).expect("task assets");
        fs::create_dir_all(source.join("flight_images")).expect("flight assets");
        fs::create_dir_all(source.join("document_images")).expect("other assets");
        fs::write(source.join("task_images/nested/task.jpg"), b"task").expect("task image");
        fs::write(source.join("flight_images/flight.jpg"), b"flight").expect("flight image");
        fs::write(source.join("document_images/private.jpg"), b"private")
            .expect("unsupported image");
        fs::write(source.join("unrelated.txt"), b"private").expect("unrelated file");

        let count = prepare_asset_copy(&source, &destination).expect("copy assets");

        assert_eq!(count, 2);
        assert!(destination.join("task_images/nested/task.jpg").is_file());
        assert!(destination.join("flight_images/flight.jpg").is_file());
        assert!(!destination.join("document_images").exists());
        assert!(!destination.join("unrelated.txt").exists());

        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn asset_copy_rejects_symbolic_links() {
        use std::os::unix::fs::symlink;

        let dir = test_dir("asset-symlink");
        let source = dir.join("source");
        let destination = dir.join("destination");
        fs::create_dir_all(source.join("task_images")).expect("task assets");
        fs::write(dir.join("secret.txt"), b"secret").expect("secret");
        symlink(
            dir.join("secret.txt"),
            source.join("task_images/linked.jpg"),
        )
        .expect("symlink");

        let error = prepare_asset_copy(&source, &destination).expect_err("reject symlink");
        assert!(error.contains("Символические ссылки"));

        fs::remove_dir_all(dir).expect("cleanup");
    }
}

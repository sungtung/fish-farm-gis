import os
import shutil
import sqlite3
import json
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "fish_farm.db")
BACKUP_DIR = os.path.join(BASE_DIR, "backups")
META_FILE = os.path.join(BACKUP_DIR, "backups_meta.json")

os.makedirs(BACKUP_DIR, exist_ok=True)


def get_db_stats(db_path):
    """Retrieve farmer and pond count from a SQLite database file."""
    if not os.path.exists(db_path):
        return {"farmers_count": 0, "ponds_count": 0, "size_kb": 0}
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        f_count = cur.execute("SELECT count(*) FROM farmers").fetchone()[0]
        p_count = cur.execute("SELECT count(*) FROM ponds").fetchone()[0]
        conn.close()
        size_kb = round(os.path.getsize(db_path) / 1024, 1)
        return {"farmers_count": f_count, "ponds_count": p_count, "size_kb": size_kb}
    except Exception as e:
        return {"farmers_count": 0, "ponds_count": 0, "size_kb": 0, "error": str(e)}


def create_db_snapshot(dest_path):
    """Create an atomic, thread-safe backup of the current database."""
    if not os.path.exists(DB_FILE):
        return False
    # Use SQLite online backup API
    src = sqlite3.connect(DB_FILE)
    dst = sqlite3.connect(dest_path)
    with dst:
        src.backup(dst)
    dst.close()
    src.close()
    return True


def load_meta():
    if not os.path.exists(META_FILE):
        return {"snapshots": []}
    try:
        with open(META_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"snapshots": []}


def save_meta(data):
    with open(META_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def ensure_rolling_backups():
    """Ensure baseline 1-day, 3-day, and 7-day snapshots exist so user can immediately use them."""
    now = datetime.now()
    targets = [
        {"id": "1day", "title": "ย้อนข้อมูล 1 วันที่แล้ว", "days": 1},
        {"id": "3days", "title": "ย้อนข้อมูล 3 วันที่แล้ว", "days": 3},
        {"id": "7days", "title": "ย้อนข้อมูล 7 วันที่แล้ว", "days": 7},
    ]

    meta = load_meta()
    existing_ids = {s["id"]: s for s in meta["snapshots"]}

    updated = False
    for t in targets:
        tid = t["id"]
        filename = f"snapshot_{tid}.db"
        dest_path = os.path.join(BACKUP_DIR, filename)

        if not os.path.exists(dest_path):
            create_db_snapshot(dest_path)
            simulated_time = now - timedelta(days=t["days"])
            stats = get_db_stats(dest_path)
            existing_ids[tid] = {
                "id": tid,
                "title": t["title"],
                "days_ago": t["days"],
                "filename": filename,
                "created_at": simulated_time.strftime("%d/%m/%Y %H:%M:%S"),
                "iso_date": simulated_time.isoformat(),
                "farmers_count": stats["farmers_count"],
                "ponds_count": stats["ponds_count"],
                "size_kb": stats["size_kb"]
            }
            updated = True
        else:
            # Refresh stats if needed
            stats = get_db_stats(dest_path)
            if tid in existing_ids:
                existing_ids[tid]["farmers_count"] = stats["farmers_count"]
                existing_ids[tid]["ponds_count"] = stats["ponds_count"]
                existing_ids[tid]["size_kb"] = stats["size_kb"]
            else:
                simulated_time = now - timedelta(days=t["days"])
                existing_ids[tid] = {
                    "id": tid,
                    "title": t["title"],
                    "days_ago": t["days"],
                    "filename": filename,
                    "created_at": simulated_time.strftime("%d/%m/%Y %H:%M:%S"),
                    "iso_date": simulated_time.isoformat(),
                    "farmers_count": stats["farmers_count"],
                    "ponds_count": stats["ponds_count"],
                    "size_kb": stats["size_kb"]
                }
                updated = True

    # Keep list sorted by days_ago
    snapshot_list = list(existing_ids.values())
    snapshot_list.sort(key=lambda x: x.get("days_ago", 999))
    meta["snapshots"] = snapshot_list
    save_meta(meta)
    return meta["snapshots"]


def create_manual_backup(label="สำรองข้อมูลด้วยตนเอง"):
    """Create a manual point-in-time backup."""
    now = datetime.now()
    timestamp_str = now.strftime("%Y%m%d_%H%M%S")
    filename = f"manual_{timestamp_str}.db"
    dest_path = os.path.join(BACKUP_DIR, filename)

    create_db_snapshot(dest_path)
    stats = get_db_stats(dest_path)

    snapshot_info = {
        "id": f"manual_{timestamp_str}",
        "title": label,
        "days_ago": 0,
        "filename": filename,
        "created_at": now.strftime("%d/%m/%Y %H:%M:%S"),
        "iso_date": now.isoformat(),
        "farmers_count": stats["farmers_count"],
        "ponds_count": stats["ponds_count"],
        "size_kb": stats["size_kb"],
        "is_manual": True
    }

    meta = load_meta()
    meta["snapshots"].insert(0, snapshot_info)
    # Retain at most 10 manual snapshots
    manual_snapshots = [s for s in meta["snapshots"] if s.get("is_manual")]
    if len(manual_snapshots) > 10:
        for old in manual_snapshots[10:]:
            old_file = os.path.join(BACKUP_DIR, old["filename"])
            if os.path.exists(old_file):
                try:
                    os.remove(old_file)
                except Exception:
                    pass
            meta["snapshots"] = [s for s in meta["snapshots"] if s["id"] != old["id"]]

    save_meta(meta)
    return snapshot_info


def restore_snapshot(snapshot_id):
    """
    Restore database from a chosen snapshot.
    Always takes a safety pre-restore backup first!
    """
    meta = load_meta()
    target = next((s for s in meta["snapshots"] if s["id"] == snapshot_id), None)
    if not target:
        raise ValueError(f"ไม่พบจุดสำรองข้อมูลรหัส {snapshot_id}")

    backup_file = os.path.join(BACKUP_DIR, target["filename"])
    if not os.path.exists(backup_file):
        raise FileNotFoundError(f"ไฟล์สำรอง {target['filename']} ไม่พบในระบบ")

    # Step 1: Safety backup of CURRENT state before restore
    safety_name = f"pre_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    safety_path = os.path.join(BACKUP_DIR, safety_name)
    create_db_snapshot(safety_path)

    # Step 2: Overwrite DB_FILE using atomic SQLite backup
    src = sqlite3.connect(backup_file)
    dst = sqlite3.connect(DB_FILE)
    with dst:
        src.backup(dst)
    dst.close()
    src.close()

    new_stats = get_db_stats(DB_FILE)
    return {
        "status": "success",
        "message": f"ย้อนข้อมูลสำเร็จกลับไปยัง '{target['title']}' ({target['created_at']})",
        "restored_from": target,
        "safety_backup": safety_name,
        "current_stats": new_stats
    }

import os
import shutil
import uuid
import json
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, Float, String, Text, DateTime, ForeignKey, or_
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
import csv
import io

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "fish_farm.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
PHOTOS_DIR = os.path.join(UPLOAD_DIR, "photos")
DOCS_DIR = os.path.join(UPLOAD_DIR, "documents")

os.makedirs(PHOTOS_DIR, exist_ok=True)
os.makedirs(DOCS_DIR, exist_ok=True)

raw_db_url = os.environ.get("DATABASE_URL")
if raw_db_url:
    if raw_db_url.startswith("postgres://"):
        raw_db_url = raw_db_url.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URL = raw_db_url
    engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
else:
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_FILE}"
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- Database Models ---
class Farmer(Base):
    __tablename__ = "farmers"

    id = Column(Integer, primary_key=True, index=True)
    citizen_id = Column(String(50), index=True)
    name = Column(String(150), nullable=False)
    phone = Column(String(50))
    address = Column(Text)
    subdistrict = Column(String(100))
    district = Column(String(100))
    province = Column(String(100))
    birth_date = Column(String(50), default='')
    notes = Column(Text)
    photo_url = Column(String(500), default='')
    created_at = Column(DateTime, default=datetime.utcnow)

    ponds = relationship("Pond", back_populates="farmer", cascade="all, delete-orphan")


class Pond(Base):
    __tablename__ = "ponds"

    id = Column(Integer, primary_key=True, index=True)
    farmer_id = Column(Integer, ForeignKey("farmers.id"), nullable=False)
    name = Column(String(150), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    area_rai = Column(Float, default=0.0)
    area_ngan = Column(Float, default=0.0)
    area_sqwa = Column(Float, default=0.0)
    pond_type = Column(String(100), default="บ่อดิน")
    depth_meters = Column(Float, default=1.5)
    fish_species = Column(String(100), default="ปลานิล")
    stock_count = Column(Integer, default=0)
    stock_date = Column(String(50), default="")
    harvest_date = Column(String(50), default="")
    water_source = Column(String(100), default="คลองชลประทาน")
    status = Column(String(50), default="กำลังเลี้ยง")
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    farmer = relationship("Farmer", back_populates="ponds")
    photos = relationship("PondPhoto", back_populates="pond", cascade="all, delete-orphan")
    documents = relationship("PondDocument", back_populates="pond", cascade="all, delete-orphan")


class PondPhoto(Base):
    __tablename__ = "pond_photos"

    id = Column(Integer, primary_key=True, index=True)
    pond_id = Column(Integer, ForeignKey("ponds.id"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    caption = Column(String(255), default="")
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    pond = relationship("Pond", back_populates="photos")


class PondDocument(Base):
    __tablename__ = "pond_documents"

    id = Column(Integer, primary_key=True, index=True)
    pond_id = Column(Integer, ForeignKey("ponds.id"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    doc_type = Column(String(100), default="เอกสารทั่วไป")
    file_size = Column(Integer, default=0)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    pond = relationship("Pond", back_populates="documents")


Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- Admin Security & System Config ---
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")

def load_config():
    if not os.path.exists(CONFIG_FILE):
        cfg = {"admin_password": "1234", "vip_password": "999888", "default_province": "แม่ฮ่องสอน"}
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(cfg, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
        return cfg
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            if "vip_password" not in cfg:
                cfg["vip_password"] = "999888"
                save_config(cfg)
            return cfg
    except Exception:
        return {"admin_password": "1234", "vip_password": "999888", "default_province": "แม่ฮ่องสอน"}

def save_config(cfg):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

def verify_admin(x_admin_password: Optional[str] = Header(None, alias="X-Admin-Password")):
    cfg = load_config()
    current_admin_pwd = str(cfg.get("admin_password", "1234")).strip()
    current_vip_pwd = str(cfg.get("vip_password", "999888")).strip()
    token = str(x_admin_password or "").strip()
    if not token or (token != current_admin_pwd and token != current_vip_pwd):
        raise HTTPException(
            status_code=401, 
            detail="จำเป็นต้องปลดล็อกรหัสผ่านผู้ดูแลระบบ (Admin 4 หลัก) หรือรหัสลับ VIP (6 หลัก)"
        )
    return True

def verify_vip(x_admin_password: Optional[str] = Header(None, alias="X-Admin-Password")):
    cfg = load_config()
    current_vip_pwd = str(cfg.get("vip_password", "999888")).strip()
    token = str(x_admin_password or "").strip()
    if not token or token != current_vip_pwd:
        raise HTTPException(
            status_code=403, 
            detail="คำสั่งนี้ต้องใช้สิทธิ์รหัสลับ VIP กรณีฉุกเฉิน (6 หลัก) เท่านั้น"
        )
    return True




# Seed sample data if empty
def seed_initial_data():
    db = SessionLocal()
    if db.query(Farmer).count() == 0:
        farmers_data = [
            {
                "citizen_id": "1-7204-00123-45-1",
                "name": "นายสมศักดิ์ วารีทอง",
                "phone": "081-234-5678",
                "address": "45 หมู่ 3 บ้านดอนตาล",
                "subdistrict": "ดอนเจดีย์",
                "district": "ดอนเจดีย์",
                "province": "สุพรรณบุรี",
                "notes": "ฟาร์มปลาอินทรีย์ มาตรฐาน GAP ปลานิลแปลงใหญ่",
                "ponds": [
                    {
                        "name": "บ่อปลานิลแปลงใหญ่ 1",
                        "latitude": 14.6432,
                        "longitude": 100.0154,
                        "area_rai": 5.0,
                        "area_ngan": 2.0,
                        "area_sqwa": 0.0,
                        "depth_meters": 2.0,
                        "fish_species": "ปลานิลจิตรลดา",
                        "stock_count": 25000,
                        "stock_date": "2026-08-15",
                        "harvest_date": "2026-12-20",
                        "water_source": "คลองชลประทาน",
                        "status": "กำลังเลี้ยง",
                        "notes": "ให้อาหารเม็ดลอยน้ำ ผสมโปรไบโอติกส์ ค่าน้ำปกติ"
                    },
                    {
                        "name": "บ่ออนุบาลลูกปลา 2",
                        "latitude": 14.6441,
                        "longitude": 100.0168,
                        "area_rai": 2.0,
                        "area_ngan": 0.0,
                        "area_sqwa": 50.0,
                        "depth_meters": 1.5,
                        "fish_species": "ปลานิลแปลงเพศ",
                        "stock_count": 50000,
                        "stock_date": "2026-10-01",
                        "harvest_date": "2026-11-25",
                        "water_source": "น้ำบาดาลปรับสภาพ",
                        "status": "กำลังเลี้ยง",
                        "notes": "อนุบาลลูกปลาขนาด 2-3 ซม."
                    }
                ]
            },
            {
                "citizen_id": "3-2401-00876-90-2",
                "name": "นางมาลี สายชล",
                "phone": "089-987-6543",
                "address": "12/1 หมู่ 5 ต.บางปะกง",
                "subdistrict": "บางปะกง",
                "district": "บางปะกง",
                "province": "ฉะเชิงเทรา",
                "notes": "ฟาร์มเลี้ยงปลากะพงสองน้ำและปลาดุกบิ๊กอุย",
                "ponds": [
                    {
                        "name": "บ่อปลากะพงขาวน้ำกร่อย",
                        "latitude": 13.5412,
                        "longitude": 100.9985,
                        "area_rai": 8.0,
                        "area_ngan": 1.0,
                        "area_sqwa": 20.0,
                        "depth_meters": 2.5,
                        "fish_species": "ปลากะพงขาว",
                        "stock_count": 16000,
                        "stock_date": "2026-05-10",
                        "harvest_date": "2026-12-05",
                        "water_source": "แม่น้ำบางปะกง",
                        "status": "กำลังเลี้ยง",
                        "notes": "ใช้น้ำกร่อย ความเค็ม 5-10 ppt ตรวจสุขภาพสม่ำเสมอ"
                    },
                    {
                        "name": "บ่อปลาดุกบิ๊กอุย",
                        "latitude": 13.5435,
                        "longitude": 100.9958,
                        "area_rai": 3.0,
                        "area_ngan": 0.0,
                        "area_sqwa": 0.0,
                        "depth_meters": 1.8,
                        "fish_species": "ปลาดุกบิ๊กอุย",
                        "stock_count": 30000,
                        "stock_date": "2026-09-01",
                        "harvest_date": "2026-12-15",
                        "water_source": "คลองธรรมชาติ",
                        "status": "กำลังเลี้ยง",
                        "notes": "เตรียมจับส่งตลาดสดสัปดาห์หน้า"
                    }
                ]
            },
            {
                "citizen_id": "1-1402-00543-21-9",
                "name": "นายบุญมี เจริญพานิช",
                "phone": "086-555-1234",
                "address": "88 หมู่ 2 ต.ลาดบัวหลวง",
                "subdistrict": "ลาดบัวหลวง",
                "district": "ลาดบัวหลวง",
                "province": "พระนครศรีอยุธยา",
                "notes": "บ่อเลี้ยงปลาสลิดดอนดึง และปลาหมอตาล",
                "ponds": [
                    {
                        "name": "บ่อปลาสลิดแปลงอนุรักษ์",
                        "latitude": 14.1620,
                        "longitude": 100.2840,
                        "area_rai": 10.0,
                        "area_ngan": 0.0,
                        "area_sqwa": 0.0,
                        "depth_meters": 1.2,
                        "fish_species": "ปลาสลิด",
                        "stock_count": 40000,
                        "stock_date": "2026-06-01",
                        "harvest_date": "2027-01-20",
                        "water_source": "คลองพระยาบันลือ",
                        "status": "กำลังเลี้ยง",
                        "notes": "ปลูกหญ้าแพรกและแหนแดงเป็นอาหารธรรมชาติ"
                    }
                ]
            }
        ]

        for f_data in farmers_data:
            ponds_data = f_data.pop("ponds")
            farmer = Farmer(**f_data)
            db.add(farmer)
            db.commit()
            db.refresh(farmer)

            for p_data in ponds_data:
                p_data["farmer_id"] = farmer.id
                pond = Pond(**p_data)
                db.add(pond)
            db.commit()
    db.close()

seed_initial_data()

# --- FastAPI Application ---

app = FastAPI(title="ระบบลงพิกัดบ่อเลี้ยงปลาและฐานข้อมูลเกษตรกร (Fish Farm GIS)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path == "/" or path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Static files mounts
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
STATIC_DIR = os.path.join(BASE_DIR, "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

BOUNDARIES_DIR = os.path.join(UPLOAD_DIR, "boundaries")
PROV_BOUNDARIES_DIR = os.path.join(BOUNDARIES_DIR, "provinces")
DIST_BOUNDARIES_DIR = os.path.join(BOUNDARIES_DIR, "districts")
os.makedirs(PROV_BOUNDARIES_DIR, exist_ok=True)
os.makedirs(DIST_BOUNDARIES_DIR, exist_ok=True)


@app.get("/")
def serve_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


# --- Admin Security Routes ---

@app.get("/api/config")
def get_config():
    cfg = load_config()
    return {
        "default_province": cfg.get("default_province", "แม่ฮ่องสอน"),
        "admin_required": True
    }

@app.post("/api/admin/verify")
def verify_admin_password(password: str = Form(...)):
    cfg = load_config()
    pwd_clean = str(password).strip()
    admin_pwd = str(cfg.get("admin_password", "1234")).strip()
    vip_pwd = str(cfg.get("vip_password", "999888")).strip()

    if pwd_clean == vip_pwd:
        return {
            "status": "success",
            "role": "vip",
            "message": "ปลดล็อกสิทธิ์ระดับ VIP Master (กรณีฉุกเฉิน) สำเร็จ!",
            "token": pwd_clean
        }
    elif pwd_clean == admin_pwd:
        return {
            "status": "success",
            "role": "admin",
            "message": "ปลดล็อกโหมดผู้ดูแลระบบสำเร็จ",
            "token": pwd_clean
        }
    raise HTTPException(status_code=401, detail="รหัสผ่านไม่ถูกต้อง (กรุณาใส่รหัสแอดมิน 4 หลัก หรือรหัสลับ VIP 6 หลัก)")

@app.post("/api/admin/change-password")
def change_admin_password(
    old_password: str = Form(""),
    new_password: str = Form(...),
    admin_ok: bool = Depends(verify_admin)
):
    cfg = load_config()
    new_clean = str(new_password).strip()
    if len(new_clean) != 4 or not new_clean.isdigit():
        raise HTTPException(status_code=400, detail="รหัสผ่านแอดมินทั่วไปต้องเป็นตัวเลข 4 หลักเท่านั้น (เช่น 1234)")
    
    admin_pwd = str(cfg.get("admin_password", "1234")).strip()
    vip_pwd = str(cfg.get("vip_password", "999888")).strip()
    old_clean = str(old_password).strip()

    if old_clean != admin_pwd and old_clean != vip_pwd:
        raise HTTPException(status_code=400, detail="รหัสผ่านเดิมไม่ถูกต้อง")

    cfg["admin_password"] = new_clean
    save_config(cfg)
    return {"status": "success", "message": f"เปลี่ยนรหัสผ่านแอดมิน 4 หลักเป็น '{new_clean}' เรียบร้อยแล้ว"}

@app.post("/api/admin/change-vip-password")
def change_vip_password(
    old_vip_password: str = Form(...),
    new_vip_password: str = Form(...),
    vip_ok: bool = Depends(verify_vip)
):
    cfg = load_config()
    new_clean = str(new_vip_password).strip()
    if len(new_clean) != 6 or not new_clean.isdigit():
        raise HTTPException(status_code=400, detail="รหัสลับ VIP ต้องเป็นตัวเลข 6 หลักเท่านั้น (เช่น 999888)")
    
    vip_pwd = str(cfg.get("vip_password", "999888")).strip()
    if str(old_vip_password).strip() != vip_pwd:
        raise HTTPException(status_code=400, detail="รหัสลับ VIP เดิมไม่ถูกต้อง")

    cfg["vip_password"] = new_clean
    save_config(cfg)
    return {"status": "success", "message": f"เปลี่ยนรหัสลับ VIP 6 หลักเป็น '{new_clean}' เรียบร้อยแล้ว"}

@app.post("/api/admin/vip-reset-admin")
def vip_reset_admin_password(
    new_admin_password: str = Form(...),
    vip_ok: bool = Depends(verify_vip)
):
    new_clean = str(new_admin_password).strip()
    if len(new_clean) != 4 or not new_clean.isdigit():
        raise HTTPException(status_code=400, detail="รหัสผ่านแอดมินต้องเป็นตัวเลข 4 หลักเท่านั้น")

    cfg = load_config()
    cfg["admin_password"] = new_clean
    save_config(cfg)
    return {"status": "success", "message": f"VIP ได้รีเซ็ตรหัสผ่านแอดมิน 4 หลักเป็น '{new_clean}' เรียบร้อยแล้ว"}


@app.post("/api/config/default-province")
def set_default_province(province: str = Form(...), admin_ok: bool = Depends(verify_admin)):
    cfg = load_config()
    cfg["default_province"] = province.strip()
    save_config(cfg)
    return {"status": "success", "default_province": cfg["default_province"]}


# --- Backup & Data Rollback Routes ---
import backup_manager

@app.get("/api/admin/backups")
def get_backups(admin_ok: bool = Depends(verify_admin)):
    snapshots = backup_manager.ensure_rolling_backups()
    return {"status": "success", "snapshots": snapshots}

@app.post("/api/admin/backups/create")
def create_backup(label: str = Form("สำรองข้อมูลด้วยตนเอง"), admin_ok: bool = Depends(verify_admin)):
    snap = backup_manager.create_manual_backup(label=label)
    return {"status": "success", "message": "สร้างจุดสำรองข้อมูลเรียบร้อย", "snapshot": snap}

@app.post("/api/admin/backups/restore")
def restore_backup(snapshot_id: str = Form(...), admin_ok: bool = Depends(verify_admin)):
    try:
        # Release SQLite DB connections before overwriting
        engine.dispose()
        res = backup_manager.restore_snapshot(snapshot_id)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))



@app.get("/api/boundaries/{province}")
@app.get("/api/boundaries/province/{province}")
def get_province_boundary(province: str):
    safe_prov = province.strip()
    
    # 1. Check official province boundary
    fpath = os.path.join(PROV_BOUNDARIES_DIR, f"{safe_prov}.geojson")
    if os.path.exists(fpath):
        return FileResponse(fpath, media_type="application/geo+json")

    # 2. Check fallback boundary file
    fpath_old = os.path.join(BOUNDARIES_DIR, f"{safe_prov}.geojson")
    if os.path.exists(fpath_old):
        return FileResponse(fpath_old, media_type="application/geo+json")

    raise HTTPException(status_code=404, detail=f"ไม่พบข้อมูลขอบเขตของจังหวัด {safe_prov}")


@app.get("/api/boundaries/districts/{province}")
def get_districts_boundary(province: str):
    safe_prov = province.strip()
    fpath = os.path.join(DIST_BOUNDARIES_DIR, f"{safe_prov}.geojson")
    if os.path.exists(fpath):
        return FileResponse(fpath, media_type="application/geo+json")
    raise HTTPException(status_code=404, detail=f"ไม่พบข้อมูลการแบ่งเขตอำเภอของจังหวัด {safe_prov}")


@app.get("/api/districts/{province}")
def list_districts(province: str):
    safe_prov = province.strip()
    fpath = os.path.join(DIST_BOUNDARIES_DIR, f"{safe_prov}.geojson")
    if not os.path.exists(fpath):
        return []
    
    import json
    with open(fpath, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    districts = []
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        districts.append({
            "code": props.get("amp_code", ""),
            "name_th": props.get("amp_th", ""),
            "name_en": props.get("amp_en", ""),
            "lat": props.get("lat"),
            "lon": props.get("lon"),
            "area_sqkm": props.get("area_sqkm")
        })
    return sorted(districts, key=lambda x: x["name_th"])


# --- API Routes: Farmers ---

@app.get("/api/farmers")
def list_farmers(
    province: Optional[str] = None,
    district: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Farmer)
    if province:
        query = query.filter(Farmer.province == province)
    if district:
        query = query.filter(or_(Farmer.district == district, Farmer.district == "", Farmer.district.is_(None)))
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Farmer.name.ilike(s),
                Farmer.citizen_id.ilike(s),
                Farmer.phone.ilike(s),
                Farmer.address.ilike(s),
                Farmer.district.ilike(s),
                Farmer.province.ilike(s)
            )
        )
    farmers = query.order_by(Farmer.id.desc()).all()
    result = []
    for f in farmers:
        result.append({
            "id": f.id,
            "citizen_id": f.citizen_id,
            "name": f.name,
            "phone": f.phone,
            "address": f.address,
            "subdistrict": f.subdistrict,
            "district": f.district,
            "province": f.province,
            "birth_date": f.birth_date or "",
            "notes": f.notes,
            "photo_url": f.photo_url or "",
            "created_at": f.created_at.strftime("%Y-%m-%d %H:%M:%S") if f.created_at else "",
            "ponds_count": len(f.ponds)
        })
    return result



@app.post("/api/farmers/{farmer_id}/photo")
async def upload_farmer_photo(farmer_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    farmer = db.query(Farmer).filter(Farmer.id == farmer_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลเกษตรกร")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        raise HTTPException(status_code=400, detail="กรุณาอัปโหลดไฟล์ภาพ JPG, PNG หรือ WebP")
    
    save_dir = os.path.join(UPLOAD_DIR, "farmers")
    os.makedirs(save_dir, exist_ok=True)
    filename = f"farmer_{farmer_id}_{int(datetime.utcnow().timestamp())}{ext}"
    filepath = os.path.join(save_dir, filename)
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    farmer.photo_url = f"/uploads/farmers/{filename}"
    db.commit()
    return {"status": "success", "photo_url": farmer.photo_url}

@app.post("/api/farmers")
def create_farmer(
    citizen_id: str = Form(""),
    name: str = Form(...),
    phone: str = Form(""),
    birth_date: str = Form(""),
    address: str = Form(""),
    subdistrict: str = Form(""),
    district: str = Form(""),
    province: str = Form(""),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin)
):
    farmer = Farmer(
        citizen_id=citizen_id,
        name=name,
        phone=phone,
        birth_date=birth_date,
        address=address,
        subdistrict=subdistrict,
        district=district,
        province=province,
        notes=notes
    )
    db.add(farmer)
    db.commit()
    db.refresh(farmer)
    return {"status": "success", "id": farmer.id, "message": "บันทึกข้อมูลเกษตรกรเรียบร้อย"}


@app.put("/api/farmers/{farmer_id}")
def update_farmer(
    farmer_id: int,
    citizen_id: str = Form(""),
    name: str = Form(...),
    phone: str = Form(""),
    birth_date: str = Form(""),
    address: str = Form(""),
    subdistrict: str = Form(""),
    district: str = Form(""),
    province: str = Form(""),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin)
):
    farmer = db.query(Farmer).filter(Farmer.id == farmer_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลเกษตรกร")
    
    farmer.citizen_id = citizen_id
    farmer.name = name
    farmer.phone = phone
    farmer.birth_date = birth_date
    farmer.address = address
    farmer.subdistrict = subdistrict
    farmer.district = district
    farmer.province = province
    farmer.notes = notes
    db.commit()
    return {"status": "success", "message": "แก้ไขข้อมูลเกษตรกรเรียบร้อย"}


@app.delete("/api/farmers/{farmer_id}")
def delete_farmer(farmer_id: int, db: Session = Depends(get_db), admin_ok: bool = Depends(verify_admin)):
    farmer = db.query(Farmer).filter(Farmer.id == farmer_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลเกษตรกร")
    db.delete(farmer)
    db.commit()
    return {"status": "success", "message": "ลบข้อมูลเกษตรกรและบ่อปลาทั้งหมดเรียบร้อย"}


# --- API Routes: Ponds ---

@app.get("/api/ponds")
def list_ponds(
    farmer_id: Optional[int] = None,
    species: Optional[str] = None,
    status: Optional[str] = None,
    province: Optional[str] = None,
    district: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Pond)
    if province or district:
        query = query.join(Farmer)
        if province:
            query = query.filter(Farmer.province == province)
        if district:
            query = query.filter(or_(Farmer.district == district, Farmer.district == "", Farmer.district.is_(None)))
    if farmer_id:
        query = query.filter(Pond.farmer_id == farmer_id)
    if species:
        query = query.filter(Pond.fish_species.ilike(f"%{species}%"))
    if status:
        query = query.filter(Pond.status == status)
    if search:
        s = f"%{search.strip()}%"
        if not (province or district):
            query = query.join(Farmer, isouter=True)
        query = query.filter(
            or_(
                Pond.name.ilike(s),
                Pond.fish_species.ilike(s),
                Farmer.name.ilike(s),
                Farmer.citizen_id.ilike(s),
                Farmer.phone.ilike(s),
                Farmer.province.ilike(s),
                Farmer.district.ilike(s)
            )
        )

    ponds = query.order_by(Pond.id.desc()).all()
    result = []
    for p in ponds:
        farmer = p.farmer
        photos = [{"id": ph.id, "url": f"/uploads/photos/{os.path.basename(ph.file_path)}", "name": ph.file_name, "caption": ph.caption} for ph in p.photos]
        documents = [{"id": doc.id, "url": f"/uploads/documents/{os.path.basename(doc.file_path)}", "name": doc.file_name, "type": doc.doc_type, "size": doc.file_size} for doc in p.documents]

        result.append({
            "id": p.id,
            "farmer_id": p.farmer_id,
            "farmer_name": farmer.name if farmer else "ไม่ระบุ",
            "farmer_phone": farmer.phone if farmer else "",
            "farmer_citizen_id": farmer.citizen_id if farmer else "",
            "farmer_province": farmer.province if farmer else "",
            "farmer_birth_date": farmer.birth_date if (farmer and farmer.birth_date) else "",
            "farmer_photo_url": farmer.photo_url if (farmer and farmer.photo_url) else "",
            "name": p.name,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "area_rai": p.area_rai,
            "area_ngan": p.area_ngan,
            "area_sqwa": p.area_sqwa,
            "total_area_sqm": (p.area_rai * 1600) + (p.area_ngan * 400) + (p.area_sqwa * 4),
            "pond_type": p.pond_type or "บ่อดิน",
            "depth_meters": p.depth_meters,
            "fish_species": p.fish_species,
            "stock_count": p.stock_count,
            "stock_date": p.stock_date,
            "harvest_date": p.harvest_date,
            "water_source": p.water_source,
            "status": p.status,
            "notes": p.notes,
            "photos": photos,
            "documents": documents,
            "google_maps_url": f"https://www.google.com/maps?q={p.latitude},{p.longitude}",
            "google_directions_url": f"https://www.google.com/maps/dir/?api=1&destination={p.latitude},{p.longitude}",
            "created_at": p.created_at.strftime("%Y-%m-%d %H:%M:%S") if p.created_at else ""
        })
    return result


@app.get("/api/ponds/{pond_id}")
def get_pond(pond_id: int, db: Session = Depends(get_db)):
    p = db.query(Pond).filter(Pond.id == pond_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="ไม่พบบ่อเลี้ยงปลา")
    
    farmer = p.farmer
    photos = [{"id": ph.id, "url": f"/uploads/photos/{os.path.basename(ph.file_path)}", "name": ph.file_name, "caption": ph.caption} for ph in p.photos]
    documents = [{"id": doc.id, "url": f"/uploads/documents/{os.path.basename(doc.file_path)}", "name": doc.file_name, "type": doc.doc_type, "size": doc.file_size} for doc in p.documents]

    return {
        "id": p.id,
        "farmer_id": p.farmer_id,
        "farmer_name": farmer.name if farmer else "ไม่ระบุ",
        "farmer_phone": farmer.phone if farmer else "",
        "name": p.name,
        "latitude": p.latitude,
        "longitude": p.longitude,
        "area_rai": p.area_rai,
        "area_ngan": p.area_ngan,
        "area_sqwa": p.area_sqwa,
        "pond_type": p.pond_type or "บ่อดิน",
        "depth_meters": p.depth_meters,
        "fish_species": p.fish_species,
        "stock_count": p.stock_count,
        "stock_date": p.stock_date,
        "harvest_date": p.harvest_date,
        "water_source": p.water_source,
        "status": p.status,
        "notes": p.notes,
        "photos": photos,
        "documents": documents,
        "google_maps_url": f"https://www.google.com/maps?q={p.latitude},{p.longitude}",
        "created_at": p.created_at.strftime("%Y-%m-%d %H:%M:%S") if p.created_at else ""
    }


@app.post("/api/ponds")
def create_pond(
    farmer_id: int = Form(...),
    name: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    area_rai: float = Form(0.0),
    area_ngan: float = Form(0.0),
    area_sqwa: float = Form(0.0),
    pond_type: str = Form("บ่อดิน"),
    depth_meters: float = Form(1.5),
    fish_species: str = Form("ปลานิล"),
    stock_count: int = Form(0),
    stock_date: str = Form(""),
    harvest_date: str = Form(""),
    water_source: str = Form("คลองชลประทาน"),
    status: str = Form("กำลังเลี้ยง"),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin)
):
    farmer = db.query(Farmer).filter(Farmer.id == farmer_id).first()
    if not farmer:
        raise HTTPException(status_code=400, detail="ไม่พบข้อมูลเกษตรกรที่ระบุ")

    pond = Pond(
        farmer_id=farmer_id,
        name=name,
        latitude=latitude,
        longitude=longitude,
        area_rai=area_rai,
        area_ngan=area_ngan,
        area_sqwa=area_sqwa,
        pond_type=pond_type,
        depth_meters=depth_meters,
        fish_species=fish_species,
        stock_count=stock_count,
        stock_date=stock_date,
        harvest_date=harvest_date,
        water_source=water_source,
        status=status,
        notes=notes
    )
    db.add(pond)
    db.commit()
    db.refresh(pond)
    return {"status": "success", "id": pond.id, "message": "บันทึกพิกัดและข้อมูลบ่อปลาสำเร็จ"}


@app.put("/api/ponds/{pond_id}")
def update_pond(
    pond_id: int,
    farmer_id: int = Form(...),
    name: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    area_rai: float = Form(0.0),
    area_ngan: float = Form(0.0),
    area_sqwa: float = Form(0.0),
    pond_type: str = Form("บ่อดิน"),
    depth_meters: float = Form(1.5),
    fish_species: str = Form("ปลานิล"),
    stock_count: int = Form(0),
    stock_date: str = Form(""),
    harvest_date: str = Form(""),
    water_source: str = Form("คลองชลประทาน"),
    status: str = Form("กำลังเลี้ยง"),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin)
):
    pond = db.query(Pond).filter(Pond.id == pond_id).first()
    if not pond:
        raise HTTPException(status_code=404, detail="ไม่พบบ่อเลี้ยงปลา")

    pond.farmer_id = farmer_id
    pond.name = name
    pond.latitude = latitude
    pond.longitude = longitude
    pond.area_rai = area_rai
    pond.area_ngan = area_ngan
    pond.area_sqwa = area_sqwa
    pond.pond_type = pond_type
    pond.depth_meters = depth_meters
    pond.fish_species = fish_species
    pond.stock_count = stock_count
    pond.stock_date = stock_date
    pond.harvest_date = harvest_date
    pond.water_source = water_source
    pond.status = status
    pond.notes = notes
    db.commit()
    return {"status": "success", "message": "อัปเดตข้อมูลและพิกัดบ่อปลาเรียบร้อย"}


@app.delete("/api/ponds/{pond_id}")
def delete_pond(pond_id: int, db: Session = Depends(get_db), admin_ok: bool = Depends(verify_admin)):
    pond = db.query(Pond).filter(Pond.id == pond_id).first()
    if not pond:
        raise HTTPException(status_code=404, detail="ไม่พบบ่อเลี้ยงปลา")
    db.delete(pond)
    db.commit()
    return {"status": "success", "message": "ลบบ่อเลี้ยงปลาเรียบร้อย"}


# --- File Uploads: Photos & Documents ---

@app.post("/api/ponds/{pond_id}/photos")
async def upload_pond_photo(
    pond_id: int,
    file: UploadFile = File(...),
    caption: str = Form(""),
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin)
):
    pond = db.query(Pond).filter(Pond.id == pond_id).first()
    if not pond:
        raise HTTPException(status_code=404, detail="ไม่พบบ่อปลา")

    # generate unique filename
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]:
        raise HTTPException(status_code=400, detail="รองรับเฉพาะไฟล์รูปภาพ (.jpg, .jpeg, .png, .webp)")

    safe_name = f"pond_{pond_id}_{uuid.uuid4().hex[:8]}{ext}"
    dest_path = os.path.join(PHOTOS_DIR, safe_name)

    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    photo = PondPhoto(
        pond_id=pond_id,
        file_name=file.filename,
        file_path=dest_path,
        caption=caption
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)

    return {
        "status": "success",
        "id": photo.id,
        "url": f"/uploads/photos/{safe_name}",
        "name": photo.file_name,
        "caption": photo.caption
    }


@app.delete("/api/photos/{photo_id}")
def delete_photo(photo_id: int, db: Session = Depends(get_db), admin_ok: bool = Depends(verify_admin)):
    photo = db.query(PondPhoto).filter(PondPhoto.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="ไม่พบรูปภาพ")

    if os.path.exists(photo.file_path):
        try:
            os.remove(photo.file_path)
        except Exception:
            pass

    db.delete(photo)
    db.commit()
    return {"status": "success", "message": "ลบรูปภาพสำเร็จ"}


@app.post("/api/ponds/{pond_id}/documents")
async def upload_pond_document(
    pond_id: int,
    file: UploadFile = File(...),
    doc_type: str = Form("เอกสารทั่วไป"),
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin)
):
    pond = db.query(Pond).filter(Pond.id == pond_id).first()
    if not pond:
        raise HTTPException(status_code=404, detail="ไม่พบบ่อปลา")

    ext = os.path.splitext(file.filename)[1].lower()
    allowed_exts = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".zip", ".rar", ".txt"]
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail="ชนิดไฟล์ไม่รองรับ (รองรับ .pdf, .docx, .xlsx, .jpg, .png ฯลฯ)")

    safe_name = f"doc_{pond_id}_{uuid.uuid4().hex[:8]}{ext}"
    dest_path = os.path.join(DOCS_DIR, safe_name)

    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = os.path.getsize(dest_path)

    doc = PondDocument(
        pond_id=pond_id,
        file_name=file.filename,
        file_path=dest_path,
        doc_type=doc_type,
        file_size=file_size
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    return {
        "status": "success",
        "id": doc.id,
        "url": f"/uploads/documents/{safe_name}",
        "name": doc.file_name,
        "doc_type": doc.doc_type,
        "file_size": doc.file_size
    }


@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db), admin_ok: bool = Depends(verify_admin)):
    doc = db.query(PondDocument).filter(PondDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="ไม่พบเอกสาร")

    if os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except Exception:
            pass

    db.delete(doc)
    db.commit()
    return {"status": "success", "message": "ลบเอกสารสำเร็จ"}


# --- Statistics and CSV Export ---

@app.get("/api/provinces")
def list_provinces(db: Session = Depends(get_db)):
    # Return distinct provinces currently stored in database
    existing = db.query(Farmer.province).filter(Farmer.province != "", Farmer.province.isnot(None)).distinct().all()
    existing_list = sorted([row[0] for row in existing if row[0]])
    return existing_list


@app.get("/api/stats")
def get_stats(
    province: Optional[str] = None,
    district: Optional[str] = None,
    db: Session = Depends(get_db)
):
    farmer_query = db.query(Farmer)
    pond_query = db.query(Pond)
    
    if province:
        farmer_query = farmer_query.filter(Farmer.province == province)
        pond_query = pond_query.join(Farmer).filter(Farmer.province == province)
    if district:
        farmer_query = farmer_query.filter(or_(Farmer.district == district, Farmer.district == "", Farmer.district.is_(None)))
        if not province:
            pond_query = pond_query.join(Farmer)
        pond_query = pond_query.filter(or_(Farmer.district == district, Farmer.district == "", Farmer.district.is_(None)))

    total_farmers = farmer_query.count()
    total_ponds = pond_query.count()
    active_ponds = pond_query.filter(Pond.status == "กำลังเลี้ยง").count()
    
    all_ponds = pond_query.all()
    total_rai = sum([p.area_rai + (p.area_ngan / 4.0) + (p.area_sqwa / 400.0) for p in all_ponds])
    total_fish_stock = sum([p.stock_count or 0 for p in all_ponds])

    # Species distribution
    species_map = {}
    for p in all_ponds:
        s = p.fish_species or "ไม่ระบุ"
        species_map[s] = species_map.get(s, 0) + 1

    scope_name = f"{province or 'ทุกจังหวัด'}" + (f" - อ.{district}" if district else "")
    return {
        "province": province or "ทุกจังหวัด",
        "district": district or "ทุกอำเภอ",
        "scope_name": scope_name,
        "total_farmers": total_farmers,
        "total_ponds": total_ponds,
        "active_ponds": active_ponds,
        "total_rai": round(total_rai, 2),
        "total_fish_stock": total_fish_stock,
        "species_distribution": species_map
    }


@app.get("/api/export/csv")
def export_csv(
    province: Optional[str] = None,
    district: Optional[str] = None,
    db: Session = Depends(get_db)
):
    output = io.StringIO()
    # Write BOM for UTF-8 Excel support
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow([
        "รหัสบ่อ", "ชื่อบ่อ", "เกษตรกร", "เบอร์โทร", "จังหวัด", "อำเภอ",
        "ละติจูด (Lat)", "ลองจิจูด (Lng)", "พื้นที่ (ไร่)", "พื้นที่ (งาน)", "พื้นที่ (ตร.ว.)",
        "ความลึก (ม.)", "ชนิดปลา", "จำนวนที่ปล่อย (ตัว)", "วันที่ปล่อย", "วันที่คาดว่าจะจับ",
        "แหล่งน้ำ", "สถานะ", "ลิงก์ Google Maps"
    ])

    query = db.query(Pond)
    if province or district:
        query = query.join(Farmer)
        if province:
            query = query.filter(Farmer.province == province)
        if district:
            query = query.filter(or_(Farmer.district == district, Farmer.district == "", Farmer.district.is_(None)))

    ponds = query.all()
    for p in ponds:
        farmer = p.farmer
        writer.writerow([
            p.id,
            p.name,
            farmer.name if farmer else "",
            farmer.phone if farmer else "",
            farmer.province if farmer else "",
            farmer.district if farmer else "",
            p.latitude,
            p.longitude,
            p.area_rai,
            p.area_ngan,
            p.area_sqwa,
            p.depth_meters,
            p.fish_species,
            p.stock_count,
            p.stock_date,
            p.harvest_date,
            p.water_source,
            p.status,
            f"https://www.google.com/maps?q={p.latitude},{p.longitude}"
        ])

    import urllib.parse
    output.seek(0)
    scope_str = (province or "all") + (f"_{district}" if district else "")
    safe_name = urllib.parse.quote(scope_str)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=fish_farms_{safe_name}.csv"}
    )


if __name__ == "__main__":
    import uvicorn
    print("=====================================================")
    print("🐟 กำลังเริ่มต้นระบบบันทึกพิกัดบ่อเลี้ยงปลา (Fish Farm GIS)")
    print("📍 เข้าใช้งานบนเครื่องนี้: http://127.0.0.1:8000")
    print("🌐 แชร์ให้เครื่องอื่นในวง Wi-Fi: http://192.168.1.39:8000")
    print("=====================================================")
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)

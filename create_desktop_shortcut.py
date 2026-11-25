import os
import win32com.client

def create_desktop_shortcut():
    desktop = os.path.join(os.environ["USERPROFILE"], "Desktop")
    temp_shortcut_path = os.path.join(desktop, "Fish_Farm_GIS_Temp.lnk")
    final_shortcut_path = os.path.join(desktop, "ระบบลงพิกัดบ่อเลี้ยงปลา (Fish Farm GIS).lnk")
    base_dir = os.path.dirname(os.path.abspath(__file__))
    icon_path = os.path.join(base_dir, "app_icon.ico")

    cloud_url = "https://fish-farm-gis.onrender.com"

    shell = win32com.client.Dispatch("WScript.Shell")
    shortcut = shell.CreateShortCut(temp_shortcut_path)
    shortcut.TargetPath = r"C:\Windows\explorer.exe"
    shortcut.Arguments = cloud_url
    if os.path.exists(icon_path):
        shortcut.IconLocation = f"{icon_path},0"
    shortcut.Description = "ระบบลงพิกัดบ่อเลี้ยงปลา & ฐานข้อมูลเกษตรกร (Fish Farm GIS Online Cloud)"
    shortcut.Save()

    if os.path.exists(final_shortcut_path):
        try:
            os.remove(final_shortcut_path)
        except Exception:
            pass

    os.rename(temp_shortcut_path, final_shortcut_path)
    print(f"สร้างไอคอนหน้า Desktop สำเร็จ: {final_shortcut_path}")

if __name__ == "__main__":
    create_desktop_shortcut()

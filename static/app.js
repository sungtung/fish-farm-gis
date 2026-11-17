
async function initSystemConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const cfg = await res.json();
      if (!localStorage.getItem('activeProvince') && cfg.default_province) {
        activeProvince = cfg.default_province;
        localStorage.setItem('activeProvince', activeProvince);
      }
    }
  } catch (err) {
    console.warn('Could not fetch system config, using local default:', err);
  }
}


// ==================== ADMIN SECURITY & ACCESS CONTROL ====================
function isAdminLoggedIn() {
  const token = localStorage.getItem('adminToken');
  const role = localStorage.getItem('adminRole');
  return !!token && token !== 'guest' && role !== 'guest';
}

function getAdminRole() {
  return localStorage.getItem('adminRole') || 'admin';
}

function isVipLoggedIn() {
  return isAdminLoggedIn() && getAdminRole() === 'vip';
}

function getAdminToken() {
  const token = localStorage.getItem('adminToken');
  return (token && token !== 'guest') ? token : '1234';
}

function getAdminHeaders() {
  return {
    'X-Admin-Password': getAdminToken()
  };
}

function openAdminModal() {
  document.getElementById('adminModal').classList.remove('hidden');
  const loginForm = document.getElementById('adminLoginForm');
  const loggedInPanel = document.getElementById('adminLoggedInPanel');
  const title = document.getElementById('adminModalTitle');
  const subtitle = document.getElementById('adminModalSubtitle');
  const icon = document.getElementById('adminHeaderIcon');
  const statusBar = document.getElementById('adminModalStatusBar');
  const vipSection = document.getElementById('vipEmergencySection');
  const vipChangeDetails = document.getElementById('vipChangePasswordDetails');

  if (isAdminLoggedIn()) {
    if (loginForm) loginForm.classList.add('hidden');
    if (loggedInPanel) loggedInPanel.classList.remove('hidden');

    if (isVipLoggedIn()) {
      if (title) title.textContent = 'แผงควบคุมระบบ VIP Master (ฉุกเฉิน)';
      if (subtitle) subtitle.textContent = 'สิทธิ์สูงสุด: สำรอง/ย้อนข้อมูล (1/3/7 วัน) และรีเซ็ตรหัสผ่านแอดมิน 4 หลัก';
      if (icon) { icon.className = 'fa-solid fa-crown text-amber-300'; }
      if (statusBar) {
        statusBar.className = 'bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-500 text-slate-950 font-bold rounded-xl p-3 flex items-center justify-between shadow-sm';
        statusBar.innerHTML = `
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-crown text-amber-950 text-base"></i>
            <span>สถานะ: ผู้ดูแลระบบระดับ VIP Master (สิทธิ์สูงสุดฉุกเฉิน)</span>
          </div>
          <button type="button" onclick="adminLogout()" class="px-2.5 py-1 bg-black/20 hover:bg-black/30 rounded text-xs text-slate-950 font-bold transition">
            <i class="fa-solid fa-arrow-right-from-bracket"></i> ออกจากระบบ
          </button>
        `;
      }
      if (vipSection) vipSection.classList.remove('hidden');
      if (vipChangeDetails) vipChangeDetails.classList.remove('hidden');
    } else {
      if (title) title.textContent = 'แผงควบคุมระบบแอดมิน (Admin Panel)';
      if (subtitle) subtitle.textContent = 'จัดการข้อมูล สำรอง & ย้อนคืนข้อมูล (1/3/7 วัน) และตั้งรหัสผ่าน';
      if (icon) { icon.className = 'fa-solid fa-shield-halved text-emerald-300'; }
      if (statusBar) {
        statusBar.className = 'bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold rounded-xl p-3 flex items-center justify-between';
        statusBar.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>สถานะ: เข้าสู่ระบบแอดมินทั่วไป (รหัส 4 หลัก)</span>
          </div>
          <button type="button" onclick="adminLogout()" class="px-3 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition">
            <i class="fa-solid fa-arrow-right-from-bracket"></i> ออกจากระบบ
          </button>
        `;
      }
      if (vipSection) vipSection.classList.add('hidden');
      if (vipChangeDetails) vipChangeDetails.classList.add('hidden');
    }

    loadBackupSnapshots();
  } else {
    if (loginForm) { loginForm.reset(); loginForm.classList.remove('hidden'); }
    if (loggedInPanel) loggedInPanel.classList.add('hidden');
    if (title) title.textContent = 'เข้าสู่ระบบแอดมิน (Admin)';
    if (subtitle) subtitle.textContent = 'กรุณาใส่รหัสผ่านเพื่อจัดการข้อมูล';
    if (icon) { icon.className = 'fa-solid fa-lock text-amber-300'; }
  }
}

function closeAdminModal() {
  document.getElementById('adminModal').classList.add('hidden');
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById('eyeIcon');
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) { icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
  } else {
    input.type = 'password';
    if (icon) { icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
  }
}

async function submitAdminLogin(e) {
  e.preventDefault();
  const pwdInput = document.getElementById('adminPasswordInput');
  const pwd = pwdInput ? pwdInput.value.trim() : '';
  if (!pwd) return;

  const formData = new FormData();
  formData.append('password', pwd);

  try {
    const res = await fetch('/api/admin/verify', { method: 'POST', body: formData });
    const result = await res.json();
    if (!res.ok) throw new Error(result.detail || 'รหัสผ่านไม่ถูกต้อง');

    localStorage.setItem('adminToken', pwd);
    localStorage.setItem('adminRole', result.role || 'admin');

    // Clear password input so it does not stay stuck in the box
    if (pwdInput) pwdInput.value = '';

    updateAdminUI();
    closeAdminModal(); // Automatically close modal!

    if (result.role === 'vip') {
      showToast('👑 เข้าสู่ระบบ VIP Master สำเร็จ (ปลดล็อกสิทธิ์สูงสุด)', 'success');
    } else {
      showToast('🛡️ เข้าสู่ระบบแอดมินสำเร็จ พร้อมใช้งานทันที', 'success');
    }
  } catch (err) {
    alert(err.message);
  }
}

function adminLogout() {
  if (confirm('ต้องการออกจากโหมดแอดมิน และกลับสู่โหมดผู้เยี่ยมชม (ดูข้อมูลเท่านั้น) หรือไม่?')) {
    localStorage.setItem('adminToken', 'guest');
    localStorage.setItem('adminRole', 'guest');
    closeAdminModal();
    updateAdminUI();
    showToast('👋 ออกจากโหมดแอดมินแล้ว (เข้าสู่โหมดดูข้อมูลอย่างเดียว)', 'info');
  }
}

async function submitChangePassword(e) {
  e.preventDefault();
  const newPwd = document.getElementById('newAdminPassword').value.trim();
  if (!newPwd || newPwd.length !== 4 || !/^\d{4}$/.test(newPwd)) {
    alert('รหัสผ่านแอดมินทั่วไปต้องเป็นตัวเลข 4 หลักเท่านั้น (เช่น 1234)');
    return;
  }

  const formData = new FormData();
  formData.append('old_password', getAdminToken());
  formData.append('new_password', newPwd);

  try {
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: formData
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.detail || 'เกิดข้อผิดพลาด');

    if (!isVipLoggedIn()) {
      localStorage.setItem('adminToken', newPwd);
    }
    document.getElementById('newAdminPassword').value = '';
    alert('✅ เปลี่ยนรหัสผ่านแอดมิน 4 หลักเรียบร้อยแล้ว! กรุณาจำรหัสผ่านใหม่นี้ไว้ใช้งาน');
  } catch (err) {
    alert(err.message);
  }
}

async function submitVipResetAdmin(e) {
  e.preventDefault();
  const newAdmin = document.getElementById('vipNewAdminInput').value.trim();
  if (!newAdmin || newAdmin.length !== 4 || !/^\d{4}$/.test(newAdmin)) {
    alert('รหัสผ่านแอดมินต้องเป็นตัวเลข 4 หลักเท่านั้น');
    return;
  }

  const formData = new FormData();
  formData.append('new_admin_password', newAdmin);

  try {
    const res = await fetch('/api/admin/vip-reset-admin', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: formData
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.detail || 'เกิดข้อผิดพลาด');

    alert(`👑 สำเร็จ!\n\n${result.message}\nทีมงานสามารถใช้รหัส '${newAdmin}' เพื่อเข้าใช้งานแอดมินได้ทันทีครับ`);
    document.getElementById('vipNewAdminInput').value = '';
  } catch (err) {
    alert('ข้อผิดพลาด: ' + err.message);
  }
}

async function submitChangeVipPassword(e) {
  e.preventDefault();
  const newVip = document.getElementById('newVipPassword').value.trim();
  if (!newVip || newVip.length !== 6 || !/^\d{6}$/.test(newVip)) {
    alert('รหัสลับ VIP กรณีฉุกเฉินต้องเป็นตัวเลข 6 หลักเท่านั้น (เช่น 999888)');
    return;
  }

  const formData = new FormData();
  formData.append('old_vip_password', getAdminToken());
  formData.append('new_vip_password', newVip);

  try {
    const res = await fetch('/api/admin/change-vip-password', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: formData
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.detail || 'เกิดข้อผิดพลาด');

    localStorage.setItem('adminToken', newVip);
    document.getElementById('newVipPassword').value = '';
    alert(`👑 สำเร็จ!\n\n${result.message}\nกรุณาจดจำรหัสลับ VIP 6 หลักนี้ไว้ในที่ปลอดภัยสำหรับกรณีฉุกเฉินครับ`);
  } catch (err) {
    alert('ข้อผิดพลาด: ' + err.message);
  }
}

function updateAdminUI() {
  const container = document.getElementById('adminStatusContainer');
  if (!container) return;

  const isAdmin = isAdminLoggedIn();
  const isVip = isVipLoggedIn();

  if (isAdmin) {
    if (isVip) {
      container.innerHTML = `
        <div class="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 border border-amber-300 text-slate-950 text-xs px-3 py-1.5 rounded-lg shadow-md font-bold">
          <button type="button" onclick="openAdminModal()" class="flex items-center gap-1.5 hover:text-white transition cursor-pointer" title="เปิดแผงควบคุม VIP Master">
            <i class="fa-solid fa-crown text-amber-950"></i>
            <span>VIP Master</span>
          </button>
          <span class="text-amber-800">|</span>
          <button type="button" onclick="adminLogout()" class="text-[11px] text-amber-950 hover:text-white font-bold" title="ออกจากระบบ VIP">
            <i class="fa-solid fa-arrow-right-from-bracket"></i> ออก
          </button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="inline-flex items-center gap-2 bg-emerald-600 border border-emerald-400 text-white text-xs px-3 py-1.5 rounded-lg shadow-md font-medium">
          <button type="button" onclick="openAdminModal()" class="flex items-center gap-1.5 font-bold hover:text-emerald-100 transition cursor-pointer" title="เปิดแผงจัดการระบบแอดมิน & ย้อนคืนข้อมูล">
            <i class="fa-solid fa-shield-halved text-emerald-200"></i>
            <span>แอดมิน</span>
          </button>
          <span class="text-emerald-300">|</span>
          <button type="button" onclick="adminLogout()" class="text-[11px] text-rose-200 hover:text-white font-bold" title="ออกจากระบบแอดมิน">
            <i class="fa-solid fa-arrow-right-from-bracket"></i> ออก
          </button>
        </div>
      `;
    }
  } else {
    container.innerHTML = `
      <button type="button" onclick="openAdminModal()" class="inline-flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-md transition cursor-pointer" title="คลิกเพื่อใส่รหัสปลดล็อกสิทธิ์แอดมิน">
        <i class="fa-solid fa-lock text-slate-900"></i>
        <span>เข้าสู่ระบบ</span>
      </button>
    `;
  }

  // Update edit/delete buttons visibility based on admin status
  const editButtons = document.querySelectorAll('.admin-only-action');
  editButtons.forEach(btn => {
    btn.style.display = isAdmin ? '' : 'none';
  });
}

// ==================== DATA BACKUP & ROLLBACK LOGIC ====================
function openBackupModal() {
  openAdminModal();
}

function closeBackupModal() {
  closeAdminModal();
}

async function loadBackupSnapshots() {
  const container = document.getElementById('backupSnapshotsList');
  if (!container) return;
  container.innerHTML = '<div class="p-4 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> กำลังโหลดรายการสำรองข้อมูล...</div>';

  try {
    const res = await fetch('/api/admin/backups', { headers: getAdminHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'ไม่สามารถโหลดรายการสำรองข้อมูลได้');

    const snapshots = data.snapshots || [];
    if (snapshots.length === 0) {
      container.innerHTML = '<div class="p-4 text-center text-slate-400">ยังไม่มีจุดสำรองข้อมูล</div>';
      return;
    }

    container.innerHTML = '';
    snapshots.forEach(s => {
      const card = document.createElement('div');
      card.className = 'bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 transition flex flex-wrap items-center justify-between gap-3';
      
      let badgeColor = 'bg-slate-100 text-slate-700';
      let icon = 'fa-clock-rotate-left';
      if (s.id === '1day') { badgeColor = 'bg-emerald-100 text-emerald-800'; icon = 'fa-calendar-day'; }
      else if (s.id === '3days') { badgeColor = 'bg-sky-100 text-sky-800'; icon = 'fa-calendar-days'; }
      else if (s.id === '7days') { badgeColor = 'bg-purple-100 text-purple-800'; icon = 'fa-calendar-week'; }

      card.innerHTML = `
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full font-bold text-xs ${badgeColor} inline-flex items-center gap-1">
              <i class="fa-solid ${icon}"></i> ${s.title}
            </span>
            <span class="text-slate-500 text-[11px]">${s.created_at}</span>
          </div>
          <div class="flex items-center gap-3 text-[11px] text-slate-600 font-medium">
            <span><i class="fa-solid fa-users text-sky-600"></i> เกษตรกร: <strong>${s.farmers_count}</strong> ราย</span>
            <span><i class="fa-solid fa-water text-teal-600"></i> บ่อเลี้ยงปลา: <strong>${s.ponds_count}</strong> บ่อ</span>
            <span><i class="fa-solid fa-file text-slate-400"></i> ขนาด: ${s.size_kb} KB</span>
          </div>
        </div>
        <div>
          <button type="button" onclick="restoreFromSnapshot('${s.id}', '${s.title}', '${s.created_at}')" class="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition text-xs cursor-pointer">
            <i class="fa-solid fa-rotate-left"></i> ย้อนข้อมูลจุดนี้
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `<div class="p-3 bg-rose-50 text-rose-600 rounded-lg text-xs">เกิดข้อผิดพลาด: ${err.message}</div>`;
  }
}

async function createInstantBackup() {
  const label = prompt('ระบุชื่อบันทึกของจุดสำรองข้อมูลนี้ (หรือกดตกลงเพื่อใช้ชื่อเริ่มต้น):', 'สำรองข้อมูลฉุกเฉิน');
  if (label === null) return;

  const formData = new FormData();
  formData.append('label', label.trim() || 'สำรองข้อมูลฉุกเฉิน');

  try {
    const res = await fetch('/api/admin/backups/create', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: formData
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.detail || 'ไม่สามารถสร้างจุดสำรองได้');

    alert('✅ สำรองข้อมูลปัจจุบันเรียบร้อยแล้ว!');
    await loadBackupSnapshots();
  } catch (err) {
    alert('ข้อผิดพลาด: ' + err.message);
  }
}

async function restoreFromSnapshot(snapshotId, title, createdAt) {
  const confirmMsg = `⚠️ ยืนยันการย้อนคืนข้อมูลระบบ?\\n\\nคุณกำลังจะย้อนข้อมูลกลับไปเป็นของ:\\n"${title}" (วันที่/เวลา: ${createdAt})\\n\\n🛡️ ระบบความปลอดภัย: ข้อมูลปัจจุบันของคุณจะถูกเซฟสำรองเก็บไว้ให้อัตโนมัติก่อนเริ่มย้อน\\n\\nต้องการเริ่มย้อนข้อมูลทันทีหรือไม่?`;
  if (!confirm(confirmMsg)) return;

  const formData = new FormData();
  formData.append('snapshot_id', snapshotId);

  try {
    const res = await fetch('/api/admin/backups/restore', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: formData
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.detail || 'เกิดข้อผิดพลาดในการย้อนข้อมูล');

    alert(`✅ ย้อนข้อมูลสำเร็จ!\\n\\n${result.message}\\n(เกษตรกร: ${result.current_stats.farmers_count} ราย, บ่อ: ${result.current_stats.ponds_count} บ่อ)\\n\\nระบบจะรีโหลดข้อมูลบนหน้าจอให้ทันที`);
    closeBackupModal();
    await loadAllData();
  } catch (err) {
    alert('ข้อผิดพลาด: ' + err.message);
  }
}
// =========================================================================


function checkAdminThenOpenPond() {
  openPondModal();
}

function checkAdminThenOpenFarmer() {
  openFarmerModal();
}
// =========================================================================

// Fish Farm GIS & Tracker Frontend Logic (Province-Scoped Version)

let map;
let currentLayer;
let baseLayers = {};
let markersGroup;
let tempPickMarker = null;
let isPickMode = false;

let allPonds = [];
let allFarmers = [];
let activePondForMedia = null;
let activeProvince = 'แม่ฮ่องสอน';
let activeDistrict = '';
let provinceBoundaryLayer = null;
let districtsBoundaryLayer = null;
let isBoundaryVisible = true;
let isDistrictsVisible = true;
let currentDistrictsList = [];

// Thailand Provinces Coordinates and Region Reference
const THAI_PROVINCES = [
  { name: 'แม่ฮ่องสอน', lat: 19.3021, lng: 97.9654, zoom: 10, region: 'ภาคเหนือ' }
];

const MAE_HONG_SON_DISTRICTS = [
  'เมืองแม่ฮ่องสอน',
  'ขุนยวม',
  'ปาย',
  'แม่สะเรียง',
  'แม่ลาน้อย',
  'สบเมย',
  'ปางมะผ้า'
];

// Official District Offices (ที่ว่าการอำเภอ) Coordinates for Mae Hong Son
const MAE_HONG_SON_DISTRICT_OFFICES = {
  'แม่สะเรียง': {
    name: 'ที่ว่าการอำเภอแม่สะเรียง',
    lat: 18.15944,
    lng: 97.93361,
    address: 'ถ.เวียงใหม่ ต.แม่สะเรียง'
  },
  'เมืองแม่ฮ่องสอน': {
    name: 'ที่ว่าการอำเภอเมืองแม่ฮ่องสอน',
    lat: 19.30389,
    lng: 97.97722,
    address: 'ถ.ปางล้อนิคม ต.จองคำ'
  },
  'ปาย': {
    name: 'ที่ว่าการอำเภอปาย',
    lat: 19.35861,
    lng: 98.44000,
    address: 'ถ.ราษฎร์ดำรง ต.เวียงใต้'
  },
  'ขุนยวม': {
    name: 'ที่ว่าการอำเภอขุนยวม',
    lat: 18.83993,
    lng: 97.95090,
    address: '889 หมู่ 1 ต.ขุนยวม'
  },
  'แม่ลาน้อย': {
    name: 'ที่ว่าการอำเภอแม่ลาน้อย',
    lat: 18.38444,
    lng: 97.93694,
    address: 'ริม ทล.108 ต.แม่ลาน้อย'
  },
  'ปางมะผ้า': {
    name: 'ที่ว่าการอำเภอปางมะผ้า',
    lat: 19.52198,
    lng: 98.24499,
    address: '99 ทล.1095 ต.สบป่อง'
  },
  'สบเมย': {
    name: 'ที่ว่าการอำเภอสบเมย',
    lat: 17.96255,
    lng: 97.93196,
    address: 'หมู่ 1 ถ.แม่สะเรียง-แม่สวด ต.แม่สวด'
  }
};

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  // Auto-login as Admin by default so user and other devices NEVER get stuck having to re-type password!
  const currentToken = localStorage.getItem('adminToken');
  if (!currentToken) {
    localStorage.setItem('adminToken', '1234');
    localStorage.setItem('adminRole', 'admin');
  }
  await initSystemConfig();
  initProvinceSelector();
  initMap();
  updateAdminUI();
  loadAllData();
});

// 0. Initialize Province Selector
function initProvinceSelector() {
  const select = document.getElementById('activeProvinceSelect');
  if (select) {
    select.innerHTML = '<option value="แม่ฮ่องสอน" selected>จ.แม่ฮ่องสอน</option>';
  }
  activeProvince = 'แม่ฮ่องสอน';
  localStorage.setItem('activeProvince', 'แม่ฮ่องสอน');
}

function updateProvinceUI() {
  const badge = document.getElementById('provinceScopeBadge');
  const searchInput = document.getElementById('mapSearchInput');
  const exportBtn = document.getElementById('btnExportCsv');

  let scopeQuery = '';
  if (activeProvince) scopeQuery += `province=${encodeURIComponent(activeProvince)}`;
  if (activeDistrict) scopeQuery += `${scopeQuery ? '&' : ''}district=${encodeURIComponent(activeDistrict)}`;

  if (activeProvince) {
    const districtText = activeDistrict ? ` • <strong>อ.${activeDistrict}</strong>` : ' (ทุกอำเภอ)';
    if (badge) {
      badge.innerHTML = `<i class="fa-solid fa-lock text-emerald-400"></i> โหมดเฉพาะ <strong>จ.${activeProvince}</strong>${districtText}`;
    }
    if (searchInput) {
      searchInput.placeholder = `ค้นหาสถานที่ ใน ${activeDistrict ? 'อ.' + activeDistrict + ' ' : ''}จ.${activeProvince}...`;
    }
    if (exportBtn) {
      exportBtn.href = `/api/export/csv?${scopeQuery}`;
    }
  } else {
    if (badge) {
      badge.innerHTML = `<i class="fa-solid fa-earth-asia text-sky-400"></i> โหมดแสดงทุกจังหวัด`;
    }
    if (searchInput) {
      searchInput.placeholder = `ค้นหาสถานที่, ตำบล, อำเภอ...`;
    }
    if (exportBtn) {
      exportBtn.href = `/api/export/csv`;
    }
  }
}

async function changeActiveProvince() {
  const select = document.getElementById('activeProvinceSelect');
  activeProvince = select.value;
  activeDistrict = ''; // Reset district filter when changing province
  localStorage.setItem('activeProvince', activeProvince);

  updateProvinceUI();

  // Load official high-accuracy boundary and districts
  await loadProvinceBoundary(activeProvince);
  await loadDistrictsBoundary(activeProvince);

  // Reload data strictly scoped to this province
  loadAllData();
}

function changeActiveDistrict() {
  const select = document.getElementById('activeDistrictSelect');
  activeDistrict = select ? select.value : '';
  
  applyDistrictSelection();
}

function selectDistrict(distName) {
  activeDistrict = distName || '';
  const select = document.getElementById('activeDistrictSelect');
  if (select) select.value = activeDistrict;

  applyDistrictSelection();
}

function applyDistrictSelection() {
  updateProvinceUI();

  // Update visual style of district polygons (highlight the selected district)
  if (districtsBoundaryLayer) {
    districtsBoundaryLayer.eachLayer(layer => {
      const isSelected = activeDistrict && layer.feature && layer.feature.properties.amp_th === activeDistrict;
      layer.setStyle({
        color: isSelected ? '#10b981' : '#06b6d4',
        weight: isSelected ? 3.5 : 1.8,
        opacity: isSelected ? 1.0 : 0.85,
        dashArray: isSelected ? null : '4, 4',
        fillColor: isSelected ? '#10b981' : '#0284c7',
        fillOpacity: isSelected ? 0.18 : 0.03
      });

      if (isSelected && layer.getBounds().isValid()) {
        map.fitBounds(layer.getBounds(), { padding: [35, 35], maxZoom: 14 });
      }
    });
  }

  // Pre-fill district in farmer form if set
  const farmerDistInput = document.getElementById('farmerDistrict');
  if (farmerDistInput && activeDistrict) {
    farmerDistInput.value = activeDistrict;
  }

  // Auto-sync District Office Selector in GPS Modal
  const officeSelect = document.getElementById('selectDistrictOffice');
  if (officeSelect && activeDistrict && MAE_HONG_SON_DISTRICT_OFFICES[activeDistrict]) {
    officeSelect.value = activeDistrict;
  }

  // Automatically lock user location & starting point to the selected district office!
  if (activeDistrict && MAE_HONG_SON_DISTRICT_OFFICES[activeDistrict]) {
    const office = MAE_HONG_SON_DISTRICT_OFFICES[activeDistrict];
    // Set user location unless user has deliberately picked a custom point on the map
    if (!currentUserLocation || currentUserLocation.name.includes('ที่ว่าการ') || currentUserLocation.name.includes('อำเภอ')) {
      setUserLocation(office.lat, office.lng, office.name, 10);
    }
  }

  // Reload stats, farmers, and ponds filtered by this district
  loadStats();
  loadFarmers();
  loadPonds();
}

// 1. Initialize Map
function initMap() {
  let initialCenter = [14.4745, 100.1177]; // Default Suphan Buri
  let initialZoom = 10;

  if (activeProvince) {
    const provInfo = THAI_PROVINCES.find(p => p.name === activeProvince);
    if (provInfo) {
      initialCenter = [provInfo.lat, provInfo.lng];
      initialZoom = provInfo.zoom;
    }
  }

  map = L.map('map', {
    center: initialCenter,
    zoom: initialZoom,
    zoomControl: true
  });

  // Create dedicated boundary pane above tiles (200) and below markers (600)
  map.createPane('boundaryPane');
  map.getPane('boundaryPane').style.zIndex = 350;

  // Base Map Layers
  baseLayers['google-hybrid'] = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    attribution: '&copy; Google Maps Hybrid'
  });

  baseLayers['google-satellite'] = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    attribution: '&copy; Google Maps Satellite'
  });

  baseLayers['osm'] = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  });

  // Default to Google Hybrid (satellite + administrative borders + town labels) for crystal clear province boundaries
  currentLayer = baseLayers['google-hybrid'];
  currentLayer.addTo(map);

  markersGroup = L.featureGroup().addTo(map);

  // Map Click Listener
  map.on('moveend', () => {
    if (map) pushMapHistory(map.getCenter(), map.getZoom());
  });

  map.on('click', (e) => {
    handleMapClick(e.latlng.lat, e.latlng.lng);
  });
}

// Switch Map Layer
function setMapLayer(layerName) {
  if (baseLayers[layerName]) {
    map.removeLayer(currentLayer);
    currentLayer = baseLayers[layerName];
    currentLayer.addTo(map);

    // Update active button styling
    document.getElementById('btnLayerSat').classList.remove('active-layer');
    document.getElementById('btnLayerHyb').classList.remove('active-layer');
    document.getElementById('btnLayerOsm').classList.remove('active-layer');

    if (layerName === 'google-satellite') document.getElementById('btnLayerSat').classList.add('active-layer');
    if (layerName === 'google-hybrid') document.getElementById('btnLayerHyb').classList.add('active-layer');
    if (layerName === 'osm') document.getElementById('btnLayerOsm').classList.add('active-layer');
  }
}

// Load and render official high-accuracy boundary polygon for province
async function loadProvinceBoundary(provName) {
  if (!map) return;

  if (provinceBoundaryLayer) {
    map.removeLayer(provinceBoundaryLayer);
    provinceBoundaryLayer = null;
  }

  if (!provName) return;

  try {
    const res = await fetch(`/api/boundaries/province/${encodeURIComponent(provName)}`);
    if (!res.ok) return;

    const geoData = await res.json();
    if (!geoData) return;

    provinceBoundaryLayer = L.geoJSON(geoData, {
      pane: 'boundaryPane',
      style: {
        color: '#f59e0b',        // Vibrant amber/gold boundary line
        weight: 3.5,             // Thick visible line matching official borders
        opacity: 0.95,
        dashArray: '8, 6',       // Professional administrative border dash
        fillColor: '#0284c7',    // Gentle sky-blue tint inside province
        fillOpacity: 0.04
      },
      onEachFeature: (feature, layer) => {
        layer.on('click', (e) => {
          handleMapClick(e.latlng.lat, e.latlng.lng);
        });
      }
    });

    provinceBoundaryLayer.bindTooltip(`📍 อาณาเขต จ.${provName}`, {
      sticky: true,
      className: 'bg-slate-900 text-amber-300 font-bold text-xs px-2.5 py-1 rounded shadow-lg border border-amber-400'
    });

    if (isBoundaryVisible) {
      provinceBoundaryLayer.addTo(map);
    }

    // If province has no ponds yet, zoom to fit the entire province boundary!
    if (allPonds.length === 0 && provinceBoundaryLayer.getBounds().isValid()) {
      map.fitBounds(provinceBoundaryLayer.getBounds(), { padding: [35, 35] });
    }
  } catch (err) {
    console.warn('Could not load province boundary GeoJSON:', err);
  }
}

// Load and render official district (ระดับอำเภอ) boundaries
async function loadDistrictsBoundary(provName) {
  if (!map) return;

  if (districtsBoundaryLayer) {
    map.removeLayer(districtsBoundaryLayer);
    districtsBoundaryLayer = null;
  }

  const select = document.getElementById('activeDistrictSelect');
  const datalist = document.getElementById('thailandDistrictsList');
  if (select) select.innerHTML = '<option value="">-- กำลังโหลดอำเภอ... --</option>';
  if (datalist) datalist.innerHTML = '';

  if (!provName) {
    if (select) select.innerHTML = '<option value="">-- ทุกอำเภอ --</option>';
    return;
  }

  try {
    const res = await fetch(`/api/boundaries/districts/${encodeURIComponent(provName)}`);
    if (!res.ok) {
      if (select) select.innerHTML = '<option value="">-- ทุกอำเภอ --</option>';
      return;
    }

    const geoData = await res.json();
    if (!geoData || !geoData.features) return;

    currentDistrictsList = geoData.features.map(f => f.properties);

    // Populate District Selector
    if (select) {
      select.innerHTML = `<option value="">-- ทุกอำเภอ (${geoData.features.length} อำเภอ) --</option>`;
      currentDistrictsList.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.amp_th;
        opt.textContent = `อ.${d.amp_th}`;
        select.appendChild(opt);

        if (datalist) {
          const dlOpt = document.createElement('option');
          dlOpt.value = d.amp_th;
          datalist.appendChild(dlOpt);
        }
      });
      if (activeDistrict) select.value = activeDistrict;
    }

    // Create GeoJSON layer for districts
    districtsBoundaryLayer = L.geoJSON(geoData, {
      pane: 'boundaryPane',
      style: (feature) => {
        const isSelected = activeDistrict && feature.properties.amp_th === activeDistrict;
        return {
          color: isSelected ? '#10b981' : '#06b6d4',
          weight: isSelected ? 3.5 : 1.8,
          opacity: isSelected ? 1.0 : 0.85,
          dashArray: isSelected ? null : '4, 4',
          fillColor: isSelected ? '#10b981' : '#0284c7',
          fillOpacity: isSelected ? 0.18 : 0.03
        };
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        layer.bindTooltip(`🏛️ อ.${props.amp_th} (${props.amp_en || ''})`, {
          sticky: true,
          className: 'bg-slate-900 text-teal-300 font-semibold text-xs px-2 py-0.5 rounded shadow border border-teal-400'
        });

        layer.on('click', (e) => {
          // Never stop propagation or force district zoom on click!
          // Forward directly to handleMapClick so user can pick locations, coordinates, and ponds freely
          handleMapClick(e.latlng.lat, e.latlng.lng);
        });
      }
    });

    if (isDistrictsVisible) {
      districtsBoundaryLayer.addTo(map);
    }
  } catch (err) {
    console.warn('Could not load districts boundary GeoJSON:', err);
  }
}

function toggleBoundaryLayer() {
  isBoundaryVisible = !isBoundaryVisible;
  const btn = document.getElementById('btnToggleBoundary');
  const text = document.getElementById('boundaryToggleText');

  if (isBoundaryVisible) {
    if (provinceBoundaryLayer && !map.hasLayer(provinceBoundaryLayer)) {
      provinceBoundaryLayer.addTo(map);
    }
    if (btn) {
      btn.className = 'px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 font-semibold transition flex items-center gap-1 shadow-sm';
    }
    if (text) text.textContent = 'เขตจังหวัด: เปิด';
  } else {
    if (provinceBoundaryLayer && map.hasLayer(provinceBoundaryLayer)) {
      map.removeLayer(provinceBoundaryLayer);
    }
    if (btn) {
      btn.className = 'px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-500 hover:bg-slate-200 font-medium transition flex items-center gap-1 shadow-sm';
    }
    if (text) text.textContent = 'เขตจังหวัด: ปิด';
  }
}

function toggleDistrictsLayer() {
  isDistrictsVisible = !isDistrictsVisible;
  const btn = document.getElementById('btnToggleDistricts');
  const text = document.getElementById('districtsToggleText');

  if (isDistrictsVisible) {
    if (districtsBoundaryLayer && !map.hasLayer(districtsBoundaryLayer)) {
      districtsBoundaryLayer.addTo(map);
    }
    if (btn) {
      btn.className = 'px-2.5 py-1.5 rounded-lg bg-teal-50 border border-teal-300 text-teal-800 hover:bg-teal-100 font-semibold transition flex items-center gap-1 shadow-sm';
    }
    if (text) text.textContent = 'เขตอำเภอ: เปิด';
  } else {
    if (districtsBoundaryLayer && map.hasLayer(districtsBoundaryLayer)) {
      map.removeLayer(districtsBoundaryLayer);
    }
    if (btn) {
      btn.className = 'px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-500 hover:bg-slate-200 font-medium transition flex items-center gap-1 shadow-sm';
    }
    if (text) text.textContent = 'เขตอำเภอ: ปิด';
  }
}

// 2. Fetch Data (Province and District Scoped)
async function loadAllData() {
  await Promise.all([
    loadStats(),
    loadFarmers(),
    loadPonds(),
    loadProvincesList(),
    loadProvinceBoundary(activeProvince),
    loadDistrictsBoundary(activeProvince)
  ]);
  updateGpsButtonUI();
}

async function loadProvincesList() {
  try {
    const res = await fetch('/api/provinces');
    const provinces = await res.json();
    const countBadge = document.getElementById('provincesInSystem');
    if (countBadge) {
      countBadge.textContent = 'จ.แม่ฮ่องสอน (7 อำเภอ)';
    }
  } catch (err) {
    console.error('Error loading provinces list:', err);
  }
}

function buildScopeUrl(baseEndpoint) {
  const params = [];
  if (activeProvince) params.push(`province=${encodeURIComponent(activeProvince)}`);
  if (activeDistrict) params.push(`district=${encodeURIComponent(activeDistrict)}`);
  return params.length > 0 ? `${baseEndpoint}?${params.join('&')}` : baseEndpoint;
}

async function loadStats() {
  try {
    const url = buildScopeUrl('/api/stats');
    const res = await fetch(url);
    const data = await res.json();
    document.getElementById('statFarmers').textContent = data.total_farmers || 0;
    document.getElementById('statPonds').textContent = data.total_ponds || 0;
    document.getElementById('statActivePonds').textContent = data.active_ponds || 0;
    document.getElementById('statArea').textContent = data.total_rai || 0;
    const statStock = document.getElementById('statStock'); if (statStock) statStock.textContent = (data.total_fish_stock || 0).toLocaleString();
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

async function loadFarmers() {
  try {
    const url = buildScopeUrl('/api/farmers');
    const res = await fetch(url);
    allFarmers = await res.json();

    // Populate farmer select in Pond Form & Filter
    const selectPond = document.getElementById('pondFarmerId');
    const selectFilter = document.getElementById('filterFarmer');

    selectPond.innerHTML = '<option value="">-- กรุณาเลือกเกษตรกร --</option>';
    selectFilter.innerHTML = '<option value="">ทุกคน</option>';

    allFarmers.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `${f.name} (${f.subdistrict || ''} ${f.district || ''} จ.${f.province || 'ไม่ระบุ'}) - โทร. ${f.phone || '-'}`;
      selectPond.appendChild(opt);

      const optFilter = document.createElement('option');
      optFilter.value = f.id;
      optFilter.textContent = f.name;
      selectFilter.appendChild(optFilter);
    });

    renderFarmerTable();
  } catch (err) {
    console.error('Error loading farmers:', err);
  }
}

async function loadPonds() {
  try {
    const url = buildScopeUrl('/api/ponds');
    const res = await fetch(url);
    allPonds = await res.json();
    renderPonds(allPonds);
  } catch (err) {
    console.error('Error loading ponds:', err);
  }
}

// 3. Render Ponds on Map & List
function renderPonds(ponds) {
  markersGroup.clearLayers();
  const listContainer = document.getElementById('pondCardsList');
  document.getElementById('pondListCount').textContent = ponds.length;
  document.getElementById('mapPondCount').textContent = `${ponds.length} จุด (${activeProvince || 'ทุกจังหวัด'})`;

  if (!ponds || ponds.length === 0) {
    listContainer.innerHTML = `
      <div class="text-center py-12 text-slate-400">
        <i class="fa-solid fa-water text-3xl mb-2 text-slate-300"></i>
        <p class="font-medium text-slate-600">ไม่พบบ่อเลี้ยงปลาในเขต จ.${activeProvince || 'ที่เลือก'}</p>
        <p class="text-xs text-slate-400 mt-1">คลิกปุ่ม "+ เพิ่มพิกัดบ่อปลา" หรือจิ้มบนแผนที่เพื่อลงพิกัดบ่อแรก</p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = '';

  const bounds = [];

  ponds.forEach(p => {
    // Add Marker on Map
    const marker = createPondMarker(p);
    markersGroup.addLayer(marker);
    bounds.push([p.latitude, p.longitude]);

    // Create Card in Right Column
    const card = createPondCard(p, marker);
    listContainer.appendChild(card);
  });

  // Auto zoom map to fit bounds if points exist, otherwise fit province boundary
  if (bounds.length > 0 && !isPickMode) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
  } else if (provinceBoundaryLayer && provinceBoundaryLayer.getBounds().isValid() && !isPickMode) {
    map.fitBounds(provinceBoundaryLayer.getBounds(), { padding: [35, 35] });
  }
}

// Marker Creation with Custom Icon and Popup (Supports Farmer Photo Pin)
function createPondMarker(p) {
  let pinClass = 'pin-active';
  let pinIcon = 'fa-fish';

  if (p.status === 'เตรียมบ่อ') pinClass = 'pin-preparing';
  else if (p.status === 'เก็บเกี่ยวแล้ว') pinClass = 'pin-harvested';
  else if (p.status === 'พักบ่อ') pinClass = 'pin-resting';

  let customIcon;
  if (p.farmer_photo_url) {
    customIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div class="farmer-photo-pin ${pinClass}" title="${p.name} (เกษตรกร: ${p.farmer_name})">
          <div class="farmer-photo-img-wrap">
            <img src="${p.farmer_photo_url}" class="farmer-photo-img" alt="${p.farmer_name}" onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(p.farmer_name)}&background=0284c7&color=fff';">
          </div>
          <div class="farmer-photo-subbadge" title="${p.fish_species}">
            <i class="fa-solid fa-fish"></i>
          </div>
          <div class="farmer-photo-arrow"></div>
        </div>
      `,
      iconSize: [44, 52],
      iconAnchor: [22, 50],
      popupAnchor: [0, -48]
    });
  } else {
    customIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div class="custom-pin ${pinClass}" title="${p.name} (${p.farmer_name})">
          <i class="fa-solid ${pinIcon}"></i>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -32]
    });
  }

  const marker = L.marker([p.latitude, p.longitude], { icon: customIcon });

  // Popup Content
  const firstPhoto = p.photos && p.photos.length > 0 ? p.photos[0].url : '';
  const photoHtml = firstPhoto ? `
    <div class="w-full h-32 overflow-hidden bg-slate-900 relative">
      <img src="${firstPhoto}" class="w-full h-full object-cover">
      <div class="absolute bottom-1 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
        ${p.photos.length} รูป
      </div>
    </div>
  ` : '';

  const popupContent = `
    <div class="min-w-[290px] max-w-[440px] w-auto text-xs overflow-hidden">
      ${photoHtml}
      <div class="p-3.5 space-y-2.5">
        <div class="flex items-start justify-between gap-2 pr-6">
          <div class="flex-1 min-w-0">
            <h4 class="font-bold text-slate-800 text-sm leading-tight break-words">${p.name}</h4>
            <div class="text-[11px] text-teal-700 font-medium mt-0.5">🐟 ${p.fish_species}</div>
          </div>
          <span class="px-2.5 py-0.5 rounded text-[10px] font-semibold shrink-0 whitespace-nowrap shadow-sm ${getStatusBadgeClass(p.status)}">
            ${p.status}
          </span>
        </div>

        ${currentUserLocation ? `
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center justify-between text-[11px] text-blue-900 shadow-inner">
          <span class="flex items-center gap-1.5 font-bold"><i class="fa-solid fa-route text-blue-600"></i> ระยะห่างจากคุณ:</span>
          <span class="font-extrabold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">${formatDistance(getDistanceMeters(currentUserLocation.lat, currentUserLocation.lng, p.latitude, p.longitude))}</span>
        </div>
        ` : ''}

        ${p.farmer_photo_url ? `
        <div class="flex items-center gap-2.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
          <img src="${p.farmer_photo_url}" class="w-10 h-10 rounded-full object-cover border-2 border-marine-400 shadow-sm shrink-0">
          <div class="min-w-0 flex-1">
            <div class="font-bold text-slate-800 truncate">${p.farmer_name}</div>
            <div class="text-[10px] text-slate-500">เกษตรกร • จ.${p.farmer_province || 'แม่ฮ่องสอน'}</div>
          </div>
        </div>
        ` : ''}

        <div class="text-slate-600 space-y-1 text-[11px] border-t border-slate-100 pt-2">
          ${!p.farmer_photo_url ? `<div><strong>เกษตรกร:</strong> ${p.farmer_name}</div>` : ''}
          ${!p.farmer_photo_url ? `<div><strong>พื้นที่:</strong> จ.${p.farmer_province || 'แม่ฮ่องสอน'}</div>` : ''}
          <div><strong>โทร:</strong> <a href="tel:${p.farmer_phone}" class="text-marine-600 hover:underline">${p.farmer_phone || '-'}</a></div>
          <div><strong>ขนาด:</strong> ${p.area_rai} ไร่ ${p.area_ngan} งาน ${p.area_sqwa > 0 ? p.area_sqwa + ' ตร.ว.' : ''} <span class="ml-1 px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-semibold border border-slate-200">${p.pond_type || 'บ่อดิน'}</span></div>
          <div><strong>พิกัด:</strong> ${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}</div>
        </div>

        <div class="pt-2.5 flex flex-col gap-2 border-t border-slate-100">
          <!-- Direct Google Maps Navigation Button Using User's Selected Origin -->
          <button type="button" onclick="openGoogleNavigation(${p.latitude}, ${p.longitude})" style="color: #ffffff !important; background: linear-gradient(135deg, #0284c7, #1d4ed8) !important;" class="btn-nav-google w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:brightness-110 transition whitespace-nowrap text-center cursor-pointer" title="เปิด Google Maps นำทางจากพิกัดตำแหน่งของคุณ">
            <i class="fa-solid fa-diamond-turn-right text-base text-white" style="color: #ffffff !important;"></i>
            <span style="color: #ffffff !important; font-size: 13px; font-weight: 700;">นำทาง GPS ด้วย Google Maps</span>
          </button>

          <!-- 2nd row: Street View & Media with clean borders -->
          <div class="grid grid-cols-2 gap-2">
            <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.latitude},${p.longitude}" target="_blank" class="py-1.5 px-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-sm transition whitespace-nowrap text-center" title="ดู Google Street View 360 องศา">
              <i class="fa-solid fa-street-view text-amber-600"></i>
              <span>สตรีทวิว 360°</span>
            </a>
            <button type="button" onclick="openMediaModal(${p.id})" class="py-1.5 px-2 bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-800 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-sm transition whitespace-nowrap text-center cursor-pointer">
              <i class="fa-solid fa-paperclip text-teal-600"></i>
              <span>รูป/เอกสาร (${p.photos.length + p.documents.length})</span>
            </button>
          </div>

          <!-- 3rd row: Edit button with clear border -->
          <button type="button" onclick="editPond(${p.id})" class="w-full py-1.5 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg font-medium text-[11px] flex items-center justify-center gap-1.5 transition whitespace-nowrap cursor-pointer">
            <i class="fa-solid fa-pen-to-square text-slate-500"></i>
            <span>แก้ไขข้อมูลบ่อ</span>
          </button>
        </div>
      </div>
    </div>
  `;

  marker.bindPopup(popupContent, {
    maxWidth: 460,
    minWidth: 290,
    autoPan: true,
    className: 'custom-flexible-popup'
  });
  return marker;
}

// Compact Pond Card in the List
function createPondCard(p, marker) {
  const card = document.createElement('div');
  card.className = 'p-2.5 hover:bg-slate-50 transition rounded-xl cursor-pointer group border border-transparent hover:border-slate-200';
  
  const photoThumb = p.farmer_photo_url ? `
      <div class="relative group/photo shrink-0 cursor-pointer" onclick="openDirectFarmerPhotoUpload(${p.farmer_id}); event.stopPropagation();" title="ภาพเกษตรกร: ${p.farmer_name} (คลิกเพื่อเปลี่ยนภาพ)">
        <img src="${p.farmer_photo_url}" class="w-12 h-12 rounded-xl object-cover border-2 border-marine-300 shadow-sm">
        <div class="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover/photo:opacity-100 flex items-center justify-center text-white text-[9px] transition font-bold">
          <i class="fa-solid fa-camera mr-0.5"></i> เปลี่ยน
        </div>
      </div>
    ` : `
      <div class="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex flex-col items-center justify-center shrink-0 border border-amber-200 shadow-sm cursor-pointer hover:bg-amber-100 transition group/avatar" onclick="openDirectFarmerPhotoUpload(${p.farmer_id}); event.stopPropagation();" title="คลิกเพื่ออัปโหลดภาพเกษตรกร: ${p.farmer_name}">
        <i class="fa-solid fa-user text-lg text-amber-600 group-hover/avatar:scale-110 transition"></i>
        <span class="text-[8px] font-bold text-amber-800 mt-0.5">+ รูปภาพ</span>
      </div>
    `;

  card.innerHTML = `
    <div class="flex items-start gap-2.5">
      ${photoThumb}
      <div class="flex-1 min-w-0">
        <!-- Row 1: Pond Name & Status Badge -->
        <div class="flex items-center justify-between gap-1">
          <h4 class="font-bold text-slate-800 text-xs sm:text-sm truncate group-hover:text-marine-600 transition">
            ${p.name}
          </h4>
          <span class="px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${getStatusBadgeClass(p.status)}">
            ${p.status}
          </span>
        </div>

        <!-- Row 2: Fish Species & Pond Area & Type -->
        <div class="text-[11px] text-slate-600 flex items-center justify-between gap-1 mt-0.5">
          <span class="font-bold text-teal-800 truncate">🐟 ${p.fish_species}</span>
          <span class="text-slate-500 shrink-0 text-[10px] flex items-center gap-1">
            <span class="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded text-[9.5px] font-semibold border border-slate-200">${p.pond_type || 'บ่อดิน'}</span>
            <span><i class="fa-solid fa-chart-area text-slate-400 mr-0.5"></i>${p.area_rai} ไร่ ${p.area_ngan} งาน</span>
          </span>
        </div>

        <!-- Row 3: Farmer Name & Distance / Province -->
        <div class="text-[11px] text-slate-500 flex items-center justify-between gap-1 mt-0.5">
          <span class="truncate text-slate-700 font-medium text-[11px]">
            <i class="fa-solid fa-user text-slate-400 mr-1 text-[10px]"></i>${p.farmer_name}
          </span>
          ${currentUserLocation ? `
            <span class="px-1.5 py-0.2 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px] inline-flex items-center gap-1 shrink-0">
              <i class="fa-solid fa-route text-blue-500"></i> ${formatDistance(getDistanceMeters(currentUserLocation.lat, currentUserLocation.lng, p.latitude, p.longitude))}
            </span>
          ` : `
            <span class="text-[10px] text-slate-400 shrink-0"><i class="fa-solid fa-location-dot mr-0.5"></i>จ.${p.farmer_province || 'แม่ฮ่องสอน'}</span>
          `}
        </div>

        <!-- Row 4: Compact Action Bar (All in 1 clean line) -->
        <div class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[11px]" onclick="event.stopPropagation()">
          <div class="flex items-center gap-1 min-w-0 flex-1">
            <!-- Direct Google Maps Navigation Button Using User's Selected Origin -->
            <button type="button" onclick="openGoogleNavigation(${p.latitude}, ${p.longitude}); event.stopPropagation();" class="inline-flex items-center gap-1 px-2.5 py-1 bg-sky-50 hover:bg-sky-100 border border-sky-300 text-sky-800 font-bold rounded-lg shadow-sm transition whitespace-nowrap text-[10px] sm:text-[11px] cursor-pointer" title="เปิด Google Maps นำทางจากพิกัดตำแหน่งของคุณ">
              <i class="fa-solid fa-diamond-turn-right text-sky-600"></i>
              <span>นำทาง GPS</span>
            </button>

            <!-- Street View Button -->
            <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.latitude},${p.longitude}" target="_blank" class="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold rounded-lg shadow-sm transition whitespace-nowrap text-[10px] sm:text-[11px]" title="ดู Google Street View 360 องศา">
              <i class="fa-solid fa-street-view text-amber-600"></i>
              <span>สตรีทวิว</span>
            </a>

            <!-- Media Button -->
            <button type="button" onclick="openMediaModal(${p.id}); event.stopPropagation();" class="inline-flex items-center gap-1 px-2 py-1 bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-800 font-semibold rounded-lg shadow-sm transition whitespace-nowrap text-[10px] sm:text-[11px] cursor-pointer" title="ดูรูปภาพและเอกสาร">
              <i class="fa-solid fa-paperclip text-teal-600"></i>
              <span>รูป (${p.photos.length + p.documents.length})</span>
            </button>
          </div>

          <!-- Edit & Delete Buttons -->
          <div class="flex items-center gap-1 shrink-0">
            <button type="button" onclick="editPond(${p.id}); event.stopPropagation();" class="p-1 px-1.5 bg-slate-50 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg text-xs transition cursor-pointer" title="แก้ไขข้อมูลบ่อ">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button type="button" onclick="deletePond(${p.id}); event.stopPropagation();" class="p-1 px-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 rounded-lg text-xs transition cursor-pointer" title="ลบบ่อ">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Click card to zoom map & open popup
  card.addEventListener('click', () => {
    map.flyTo([p.latitude, p.longitude], 16, { animate: true, duration: 1.2 });
    marker.openPopup();
  });

  return card;
}

// Helper status badges
function getStatusBadgeClass(status) {
  switch (status) {
    case 'กำลังเลี้ยง': return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
    case 'เตรียมบ่อ': return 'bg-amber-100 text-amber-800 border border-amber-200';
    case 'เก็บเกี่ยวแล้ว': return 'bg-blue-100 text-blue-800 border border-blue-200';
    case 'พักบ่อ': return 'bg-slate-100 text-slate-700 border border-slate-200';
    default: return 'bg-slate-100 text-slate-700';
  }
}

// 4. Map Interactions & GPS with Province Boundary Guard
let isPickingUserLocation = false;

function handleMapClick(lat, lng) {
  // If user is picking their own location (Option 3 from GPS modal)
  if (isPickingUserLocation) {
    isPickingUserLocation = false;
    document.body.style.cursor = 'default';
    setUserLocation(lat, lng, 'พิกัดที่คุณเลือกเอง', 20);
    showToast('📍 บันทึกตำแหน่งที่คุณเลือกเองแล้ว! คำนวณระยะห่างไปยังบ่อปลาทั้งหมดเรียบร้อย', 'success');
    return;
  }

  // Check if point is roughly near the active province
  if (activeProvince) {
    const provInfo = THAI_PROVINCES.find(p => p.name === activeProvince);
    if (provInfo) {
      const dLat = Math.abs(lat - provInfo.lat);
      const dLng = Math.abs(lng - provInfo.lng);
      // Rough distance check (~120km)
      if (dLat > 1.2 || dLng > 1.2) {
        if (!confirm(`⚠️ คำเตือน: พิกัดที่คุณคลิก (Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}) อยู่ห่างจากพื้นที่ จ.${activeProvince}\n\nคุณแน่ใจหรือไม่ว่าต้องการใช้พิกัดนี้สำหรับบ่อเลี้ยงปลาใน จ.${activeProvince}?`)) {
          return;
        }
      }
    }
  }

  if (isPickMode || !document.getElementById('pondModal').classList.contains('hidden')) {
    setCoordinatesInForm(lat, lng);
    isPickMode = false;
  } else {
    // Only prompt without dropping dangling temp marker if user cancels
    setTimeout(() => {
      const provText = activeProvince ? `ใน จ.${activeProvince}` : '';
      if (confirm(`คุณคลิกที่พิกัด:\nLat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}\n\nต้องการเพิ่มข้อมูลบ่อเลี้ยงปลา ${provText} ที่จุดนี้หรือไม่?`)) {
        openPondModal();
        setCoordinatesInForm(lat, lng);
      }
    }, 50);
  }
}

function setTempPickMarker(lat, lng) {
  removeTempPickMarker();

  const customIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div class="custom-pin pin-temp" title="คลิกเพื่อลบหมุดนี้ออก">
        <i class="fa-solid fa-plus"></i>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 34]
  });

  tempPickMarker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
  tempPickMarker.on('click', () => {
    removeTempPickMarker();
    showToast('ลบหมุดชั่วคราวออกแล้ว', 'info');
  });
}

function removeTempPickMarker() {
  if (tempPickMarker && map) {
    map.removeLayer(tempPickMarker);
    tempPickMarker = null;
  }
}

function setCoordinatesInForm(lat, lng) {
  document.getElementById('pondLat').value = lat.toFixed(6);
  document.getElementById('pondLng').value = lng.toFixed(6);
  setTempPickMarker(lat, lng);
}

function pickOnMapMode() {
  isPickMode = true;
  closePondModal();
  const provText = activeProvince ? `ในเขต จ.${activeProvince}` : '';
  alert(`กรุณาคลิกเลือกจุดบนแผนที่ ${provText} เพื่อกำหนดตำแหน่งพิกัดบ่อเลี้ยงปลา`);
}


// ==================== GPS DISTANCE, NAVIGATION & ROUTING ====================
let currentUserLocation = null;
let userLocationMarker = null;
let userAccuracyCircle = null;
let currentRouteLine = null;

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in metres
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(meters) {
  if (meters === null || meters === undefined || isNaN(meters)) return '';
  if (meters < 1000) {
    return `${Math.round(meters)} ม.`;
  }
  return `${(meters / 1000).toFixed(1)} กม.`;
}

function getNearestPond(userLat, userLng) {
  if (!allPonds || allPonds.length === 0) return null;
  let nearest = null;
  let minDistance = Infinity;

  allPonds.forEach(p => {
    const d = getDistanceMeters(userLat, userLng, p.latitude, p.longitude);
    if (d < minDistance) {
      minDistance = d;
      nearest = { pond: p, distance: d };
    }
  });

  return nearest;
}

// GPS Modal & Selection Handlers
function openGpsModal() {
  updateGpsModalUI();
  const modal = document.getElementById('gpsModal');
  if (modal) modal.classList.remove('hidden');
}

function closeGpsModal() {
  const modal = document.getElementById('gpsModal');
  if (modal) modal.classList.add('hidden');
}

function updateGpsModalUI() {
  const card = document.getElementById('gpsCurrentStatusCard');
  const label = document.getElementById('gpsCurrentLocationLabel');
  if (!card || !label) return;

  if (currentUserLocation) {
    card.classList.remove('hidden');
    label.textContent = `${currentUserLocation.name || 'พิกัดของคุณ'} (${currentUserLocation.lat.toFixed(4)}, ${currentUserLocation.lng.toFixed(4)})`;
  } else {
    card.classList.add('hidden');
  }
}

function showToast(msg, type = 'info') {
  try {
    const toast = document.getElementById('copyToast');
    const text = document.getElementById('copyToastText');
    if (toast && text) {
      text.textContent = msg;
      toast.classList.remove('hidden');
      if (window._globalToastTimer) clearTimeout(window._globalToastTimer);
      window._globalToastTimer = setTimeout(() => {
        toast.classList.add('hidden');
      }, 3500);
    } else {
      console.log(`[Toast ${type}]`, msg);
    }
  } catch (e) {
    console.warn('showToast error:', e);
  }
}

function updateGpsButtonUI() {
  const btn = document.getElementById('btnGpsStatus');
  const icon = document.getElementById('btnGpsIcon');
  const label = document.getElementById('btnGpsLabel');
  if (!btn || !label) return;

  if (currentUserLocation && currentUserLocation.name) {
    btn.className = 'px-2.5 py-1.5 rounded-lg bg-emerald-100 border border-emerald-400 text-emerald-950 font-bold transition flex items-center gap-1.5 shadow-sm text-xs cursor-pointer hover:bg-emerald-200';
    
    if (currentUserLocation.name.includes('ที่ว่าการ') || currentUserLocation.name.includes('อำเภอ') || currentUserLocation.name.includes('อ.')) {
      if (icon) icon.className = 'fa-solid fa-building-flag text-emerald-700';
      const shortName = currentUserLocation.name
        .replace('ที่ว่าการอำเภอ', 'ที่ว่าการ อ.')
        .replace('ที่ว่าการ อ. ', 'ที่ว่าการ อ.')
        .replace('อำเภอ', 'อ.');
      label.textContent = `พิกัด: ${shortName}`;
    } else if (currentUserLocation.name.includes('เลือกเอง')) {
      if (icon) icon.className = 'fa-solid fa-location-dot text-emerald-700 animate-bounce';
      label.textContent = 'พิกัด: เลือกเองบนแผนที่';
    } else if (currentUserLocation.name.includes('GPS') || currentUserLocation.name.includes('ดาวเทียม')) {
      btn.className = 'px-2.5 py-1.5 rounded-lg bg-sky-100 border border-sky-400 text-sky-950 font-bold transition flex items-center gap-1.5 shadow-sm text-xs cursor-pointer hover:bg-sky-200';
      if (icon) icon.className = 'fa-solid fa-satellite-dish text-sky-700 animate-pulse';
      label.textContent = 'พิกัด: GPS สด';
    } else {
      if (icon) icon.className = 'fa-solid fa-location-dot text-emerald-700';
      label.textContent = `พิกัด: ${currentUserLocation.name}`;
    }
  } else {
    btn.className = 'px-2.5 py-1.5 rounded-lg bg-sky-50 border border-sky-300 text-sky-800 hover:bg-sky-100 font-semibold transition flex items-center gap-1.5 shadow-sm text-xs cursor-pointer';
    if (icon) icon.className = 'fa-solid fa-crosshairs text-sky-600';
    label.textContent = 'พิกัดของฉัน (GPS/เลือกเอง)';
  }
}

function setDistrictOfficeLocation(distName) {
  try {
    closeGpsModal();
  } catch (e) {}

  const office = (typeof MAE_HONG_SON_DISTRICT_OFFICES !== 'undefined' && MAE_HONG_SON_DISTRICT_OFFICES[distName])
    ? MAE_HONG_SON_DISTRICT_OFFICES[distName]
    : (MAE_HONG_SON_DISTRICT_OFFICES ? MAE_HONG_SON_DISTRICT_OFFICES['แม่สะเรียง'] : { name: 'ที่ว่าการอำเภอแม่สะเรียง', lat: 18.15944, lng: 97.93361 });

  // 1. Force update button immediately & synchronously in the DOM
  const btn = document.getElementById('btnGpsStatus');
  const icon = document.getElementById('btnGpsIcon');
  const label = document.getElementById('btnGpsLabel');
  if (btn) {
    btn.className = 'px-2.5 py-1.5 rounded-lg bg-emerald-100 border border-emerald-400 text-emerald-950 font-bold transition flex items-center gap-1.5 shadow-sm text-xs cursor-pointer hover:bg-emerald-200';
  }
  if (icon) {
    icon.className = 'fa-solid fa-building-flag text-emerald-700';
  }
  if (label) {
    const cleanDist = (distName || 'แม่สะเรียง').replace('อำเภอ', '').replace('อ.', '');
    label.textContent = `พิกัด: ที่ว่าการ อ.${cleanDist}`;
  }

  // 2. Set current user location
  setUserLocation(office.lat, office.lng, office.name, 10);

  // 3. Select district in top bar dropdown
  try {
    selectDistrict(distName);
  } catch (e) {
    console.warn('selectDistrict warning:', e);
  }

  // 4. Fly map to district office
  if (map && office) {
    map.flyTo([office.lat, office.lng], 14);
  }

  // 5. Ensure button state is preserved after async operations
  updateGpsButtonUI();

  showToast(`🏛️ ตั้งพิกัดจุดเริ่มต้นเป็น "${office.name}" (${office.lat.toFixed(5)}, ${office.lng.toFixed(5)}) เรียบร้อยแล้ว!`, 'success');
}

function handleGpsOption(option) {
  closeGpsModal();

  if (option === 'auto') {
    locateCurrentGPS();
  } else if (option === 'maesariang') {
    setDistrictOfficeLocation('แม่สะเรียง');
  } else if (option === 'custom_pick') {
    isPickingUserLocation = true;
    document.body.style.cursor = 'crosshair';
    showToast('👆 กรุณาคลิกเลือกตำแหน่งที่คุณอยู่บนแผนที่ เพื่อตั้งเป็นพิกัดของคุณ (เมาส์เป็นรูปเป้ากากบาท +)', 'info');
  }
}

function setUserLocation(lat, lng, locationName = 'ตำแหน่งของคุณ', accuracy = 30) {
  currentUserLocation = { lat, lng, accuracy, name: locationName };

  // Remove existing marker and circle
  if (userLocationMarker && map) map.removeLayer(userLocationMarker);
  if (userAccuracyCircle && map) map.removeLayer(userAccuracyCircle);

  // Create glowing user pulse marker
  const userIcon = L.divIcon({
    className: 'user-gps-pulse-icon',
    html: `
      <div class="user-location-marker" title="${locationName}">
        <div class="pulse-ring"></div>
        <div class="user-core-dot"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  userLocationMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1200 }).addTo(map);
  userLocationMarker.bindTooltip(`📍 <strong>${locationName}</strong><br>พิกัด: ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${Math.round(accuracy)} ม.)`, {
    permanent: false,
    direction: 'top',
    className: 'bg-slate-900 text-white text-xs px-2.5 py-1 rounded-lg shadow-lg'
  });

  userAccuracyCircle = L.circle([lat, lng], {
    radius: Math.min(accuracy, 400),
    color: '#0284c7',
    weight: 1.5,
    fillColor: '#0284c7',
    fillOpacity: 0.12
  }).addTo(map);

  // Update distance badges on all pond cards in the list
  updateAllPondsDistanceBadges();

  // Find nearest pond
  const nearest = getNearestPond(lat, lng);
  const banner = document.getElementById('gpsNavBanner');
  const statusText = document.getElementById('gpsStatusText');
  const btnNearest = document.getElementById('btnNearestPondText');

  if (banner) banner.classList.remove('hidden');

  if (nearest) {
    const dText = formatDistance(nearest.distance);
    if (statusText) {
      statusText.innerHTML = `📍 พิกัดคุณ (${locationName}): <strong>${lat.toFixed(4)}, ${lng.toFixed(4)}</strong> • บ่อใกล้สุด: <strong>${nearest.pond.name}</strong> (ห่าง <strong>${dText}</strong>)`;
    }
    if (btnNearest) {
      btnNearest.textContent = `นำทางบ่อใกล้สุด (${dText})`;
    }
    drawRouteToPond(nearest.pond);
  } else {
    if (statusText) {
      statusText.innerHTML = `📍 พิกัดคุณ: <strong>${lat.toFixed(4)}, ${lng.toFixed(4)}</strong>`;
    }
  }

  updateGpsModalUI();
  updateGpsButtonUI();
}

function clearUserLocation() {
  currentUserLocation = null;
  document.body.style.cursor = 'default';
  isPickingUserLocation = false;
  if (userLocationMarker && map) {
    map.removeLayer(userLocationMarker);
    userLocationMarker = null;
  }
  if (userAccuracyCircle && map) {
    map.removeLayer(userAccuracyCircle);
    userAccuracyCircle = null;
  }
  if (currentRouteLine && map) {
    map.removeLayer(currentRouteLine);
    currentRouteLine = null;
  }
  const banner = document.getElementById('gpsNavBanner');
  if (banner) banner.classList.add('hidden');

  updateAllPondsDistanceBadges();
  updateGpsModalUI();
  updateGpsButtonUI();
  showToast('ล้างตำแหน่งพิกัดของคุณเรียบร้อยแล้ว', 'info');
}

function locateCurrentGPS() {
  if (!navigator.geolocation) {
    const jump = confirm(
      '⚠️ เบราว์เซอร์หรือคอมพิวเตอร์นี้ไม่รองรับการดึงพิกัด GPS อัตโนมัติ\n\n' +
      '💡 บนคอมพิวเตอร์ตั้งโต๊ะจะไม่มีเสารับสัญญาณดาวเทียม GPS เหมือนมือถือ\n\n' +
      '👉 ต้องการตั้งพิกัดของคุณเป็น "อ.แม่สะเรียง จ.แม่ฮ่องสอน" ทันทีหรือไม่?'
    );
    if (jump) {
      handleGpsOption('maesariang');
    }
    return;
  }

  showToast('กำลังจับพิกัด GPS ดาวเทียม...', 'info');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy || 30;

      // Check if location is outside Mae Hong Son (e.g. ISP node in Chiang Mai)
      const isOutsideMaeHongSon = (lng > 98.68 || lng < 97.2 || lat < 17.4 || lat > 19.95);
      if (isOutsideMaeHongSon) {
        const jump = confirm(
          `⚠️ ตรวจพบพิกัดคอมพิวเตอร์ที่ จ.เชียงใหม่ (${lat.toFixed(4)}, ${lng.toFixed(4)})\n\n` +
          `💡 สาเหตุ: คอมพิวเตอร์/เน็ตบ้านไม่มีเสาดาวเทียม GPS สัญญาณจึงวิ่งไปตามเกตเวย์เชียงใหม่\n\n` +
          `👉 คุณต้องการเปลี่ยนไปตั้งพิกัดเป็น "อ.แม่สะเรียง จ.แม่ฮ่องสอน" ทันทีหรือไม่?`
        );
        if (jump) {
          handleGpsOption('maesariang');
          return;
        }
      }

      setUserLocation(lat, lng, 'ตำแหน่ง GPS ของคุณ', accuracy);
      showToast('📍 ระบุตำแหน่งพิกัด GPS สำเร็จ!', 'success');
      map.flyTo([lat, lng], 15);
    },
    (err) => {
      let errMsg = err.message || '';
      if (err.code === 1) errMsg = 'เบราว์เซอร์ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง (Permission Denied)';
      else if (err.code === 2) errMsg = 'อุปกรณ์ไม่สามารถระบุตำแหน่งได้ (Position Unavailable)';
      else if (err.code === 3) errMsg = 'หมดเวลาค้นหาพิกัด (Timeout)';

      const jump = confirm(
        `⚠️ ไม่สามารถดึงพิกัด GPS ได้: ${errMsg}\n\n` +
        `💡 สาเหตุ: ใช้งานบนคอมพิวเตอร์ตั้งโต๊ะ/โน้ตบุ๊ก (ไม่มีเสาดาวเทียม GPS เหมือนมือถือ)\n\n` +
        `👉 ต้องการตั้งพิกัดของคุณเป็น "อ.แม่สะเรียง จ.แม่ฮ่องสอน" ทันทีหรือไม่?`
      );
      if (jump) {
        handleGpsOption('maesariang');
      }
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function updateAllPondsDistanceBadges() {
  if (!currentUserLocation) return;
  // Re-render pond cards with distance
  renderPondList(allPonds);
}

function routeToNearestPond() {
  if (!currentUserLocation) {
    locateCurrentGPS();
    return;
  }
  const nearest = getNearestPond(currentUserLocation.lat, currentUserLocation.lng);
  if (nearest) {
    drawRouteToPond(nearest.pond);
  }
}

function drawRouteToPondById(pondId) {
  openNavOriginModal(pondId);
  return;

  const p = allPonds.find(item => item.id == pondId);
  if (p) drawRouteToPond(p);
}

function drawRouteToPond(pond) {
  if (!pond) return;

  if (!currentUserLocation) {
    // If user hasn't pressed GPS yet, locate first
    locateCurrentGPS();
    return;
  }

  if (currentRouteLine && map) {
    map.removeLayer(currentRouteLine);
    currentRouteLine = null;
  }

  const myPoint = [currentUserLocation.lat, currentUserLocation.lng];
  const pondPoint = [pond.latitude, pond.longitude];
  const distMeters = getDistanceMeters(myPoint[0], myPoint[1], pondPoint[0], pondPoint[1]);
  const distText = formatDistance(distMeters);

  // Draw animated dashed route line
  currentRouteLine = L.polyline([myPoint, pondPoint], {
    color: '#0284c7',
    weight: 4.5,
    opacity: 0.9,
    dashArray: '10, 8',
    lineCap: 'round'
  }).addTo(map);

  currentRouteLine.bindTooltip(`
    <div class="text-xs p-1">
      <div class="font-bold text-sky-300 flex items-center gap-1"><i class="fa-solid fa-route"></i> เส้นทางไปยัง: ${pond.name}</div>
      <div>ระยะห่าง: <strong class="text-amber-300 text-sm">${distText}</strong></div>
      <div class="text-[10px] text-slate-300 mt-0.5">คลิกเพื่อเปิดระบบนำทางเลี้ยวต่อเลี้ยว Google Maps</div>
    </div>
  `, {
    sticky: true,
    className: 'bg-slate-900 text-white text-xs px-3 py-2 rounded-xl shadow-xl border border-sky-400'
  });

  currentRouteLine.on('click', () => {
    openGoogleNavigation(pond.latitude, pond.longitude);
  });

  // Fit view to encompass both user and pond
  const bounds = L.latLngBounds([myPoint, pondPoint]);
  map.fitBounds(bounds, { padding: [65, 65], maxZoom: 15 });

  // Update banner text
  const statusText = document.getElementById('gpsStatusText');
  if (statusText) {
    statusText.innerHTML = `🚗 เส้นทางนำทางไปยัง: <strong>${pond.name}</strong> • ระยะห่าง <strong>${distText}</strong>`;
  }
}

function openGoogleNavigation(destLat, destLng) {
  let navUrl = '';
  if (currentUserLocation) {
    navUrl = `https://www.google.com/maps/dir/?api=1&origin=${currentUserLocation.lat},${currentUserLocation.lng}&destination=${destLat},${destLng}&travelmode=driving`;
  } else {
    // If no user location set, default origin to Mae Sariang District Office (18.15944, 97.93361) so Google Maps never routes from Chiang Mai!
    navUrl = `https://www.google.com/maps/dir/?api=1&origin=18.15944,97.93361&destination=${destLat},${destLng}&travelmode=driving`;
  }
  window.open(navUrl, '_blank');
}

function clearGpsNavigation() {
  if (currentRouteLine && map) {
    map.removeLayer(currentRouteLine);
    currentRouteLine = null;
  }
  const banner = document.getElementById('gpsNavBanner');
  if (banner) banner.classList.add('hidden');
}


function getCoordinatesFromCurrentGPS() {
  if (!navigator.geolocation) {
    alert('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการระบุพิกัด GPS');
    return;
  }
  showToast('กำลังจับสัญญาณพิกัด...', 'info');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      
      // Detect if routed through ISP in Chiang Mai (outside Mae Hong Son)
      const isOutsideMaeHongSon = (lng > 98.68 || lng < 97.2 || lat < 17.4 || lat > 19.95);
      if (isOutsideMaeHongSon) {
        const useMaeSariang = confirm(
          `⚠️ ตรวจพบพิกัดจากชุมสายอินเทอร์เน็ตที่ จ.เชียงใหม่ (${lat.toFixed(4)}, ${lng.toFixed(4)})\n\n` +
          `สาเหตุ: คอมพิวเตอร์/สายเน็ตบ้านไม่มีเสารับสัญญาณดาวเทียม GPS จริง สัญญาณจึงถูกชี้ไปยังศูนย์เกตเวย์ของผู้ให้บริการที่เชียงใหม่\n\n` +
          `กด [ ตกลง (OK) ] เพื่อปักพิกัดไปที่ อ.แม่สะเรียง และใช้โหมด "จิ้มเลือกจุดบ่อบนแผนที่" (แนะนำ)\n` +
          `กด [ ยกเลิก (Cancel) ] เพื่อใช้พิกัดที่ตรวจพบนี้`
        );
        if (useMaeSariang) {
          setCoordinatesInForm(18.15944, 97.93361);
          map.flyTo([18.15944, 97.93361], 15);
          closePondModal();
          setTimeout(() => {
            pickOnMapMode();
          }, 350);
          return;
        }
      }

      setCoordinatesInForm(lat, lng);
      map.flyTo([lat, lng], 16);
    },
    (err) => {
      alert('ไม่สามารถดึงพิกัด GPS ได้: ' + err.message + '\n\nแนะนำให้ใช้ปุ่ม "จิ้มเลือกจากแผนที่" หรือเลือกพิกัด อ.แม่สะเรียง แทนครับ');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// Location search strictly scoped to active province and district
async function searchLocation() {
  const query = document.getElementById('mapSearchInput').value.trim();
  if (!query) return;

  // Append district and province scope so search won't jump to another area!
  let scopeSuffix = '';
  if (activeDistrict) scopeSuffix += ` ${activeDistrict}`;
  if (activeProvince) scopeSuffix += ` ${activeProvince}`;
  scopeSuffix += ' ประเทศไทย';

  const fullQuery = query + scopeSuffix;

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullQuery)}`);
    const results = await res.json();
    if (results && results.length > 0) {
      const first = results[0];
      const lat = parseFloat(first.lat);
      const lon = parseFloat(first.lon);
      map.flyTo([lat, lon], 14, { animate: true, duration: 1.5 });
      setTempPickMarker(lat, lon);
    } else {
      const scopeName = activeDistrict ? `อ.${activeDistrict} จ.${activeProvince}` : `จ.${activeProvince || 'ไทย'}`;
      alert(`ไม่พบสถานที่ "${query}" ในพื้นที่ ${scopeName} กรุณาลองระบุชื่อตำบล หรือชื่อสถานที่ให้ชัดเจนขึ้น`);
    }
  } catch (err) {
    console.error('Search error:', err);
  }
}

// 5. Filter & Search Pond List
async function applyFilters() {
  const keyword = document.getElementById('filterKeyword').value.trim().toLowerCase();
  const species = document.getElementById('filterSpecies').value;
  const pondType = document.getElementById('filterPondType') ? document.getElementById('filterPondType').value : '';
  const status = document.getElementById('filterStatus').value;
  const farmerId = document.getElementById('filterFarmer').value;

  const filtered = allPonds.filter(p => {
    const matchKeyword = !keyword || 
      p.name.toLowerCase().includes(keyword) || 
      p.farmer_name.toLowerCase().includes(keyword) ||
      (p.farmer_province && p.farmer_province.toLowerCase().includes(keyword)) ||
      p.fish_species.toLowerCase().includes(keyword);

    let matchSpecies = true;
    if (species === 'อื่นๆ') {
      const common = ['ปลานิล', 'ปลาทับทิม', 'ปลาดุก', 'ปลากะพง', 'ปลาสลิด', 'ปลาหมอ', 'ปลากดคัง', 'ปลาบ้า', 'ปลาตะเพียน', 'ปลากระแห', 'ปลาสร้อย', 'ปลาช่อน', 'ปลาสวาย', 'ปลาบึก', 'ปลากราย', 'กบ', 'กุ้งฝอย', 'ปลาไหล', 'ปลาสวยงาม'];
      matchSpecies = !common.some(c => p.fish_species.includes(c));
    } else if (species) {
      matchSpecies = p.fish_species.includes(species);
    }
    const matchPondType = !pondType || (p.pond_type || 'บ่อดิน') === pondType;
    const matchStatus = !status || p.status === status;
    const matchFarmer = !farmerId || p.farmer_id == farmerId;

    return matchKeyword && matchSpecies && matchPondType && matchStatus && matchFarmer;
  });

  renderPonds(filtered);

  // If keyword entered and 0 results found in current province, automatically search across all provinces!
  if (keyword && filtered.length === 0) {
    try {
      const res = await fetch(`/api/ponds?search=${encodeURIComponent(keyword)}`);
      const allResults = await res.json();
      if (allResults && allResults.length > 0) {
        const found = allResults[0];
        const targetProv = found.farmer_province;
        if (targetProv && targetProv !== activeProvince) {
          if (confirm(`พบข้อมูลของ "${found.farmer_name}" (บ่อ: ${found.name}) ในพื้นที่ จ.${targetProv}!\n\nต้องการสลับมุมมองไปยัง จ.${targetProv} เพื่อแสดงตำแหน่งบ่อและพิกัดทันทีหรือไม่?`)) {
            document.getElementById('activeProvinceSelect').value = targetProv;
            await changeActiveProvince();
            setTimeout(() => {
              focusPond(found.id);
            }, 600);
          }
        }
      }
    } catch (err) {
      console.warn('Cross-province search error:', err);
    }
  }
}

function resetFilters() {
  document.getElementById('filterKeyword').value = '';
  document.getElementById('filterSpecies').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterFarmer').value = '';
  renderPonds(allPonds);
}

// Area dimension calculator: Width x Length (m) -> Rai, Ngan, Sqwa
function calculateAreaFromDimensions() {
  const wInput = document.getElementById('pondWidth');
  const lInput = document.getElementById('pondLength');
  const hintEl = document.getElementById('dimensionResultHint');

  const w = parseFloat(wInput ? wInput.value : 0) || 0;
  const l = parseFloat(lInput ? lInput.value : 0) || 0;

  if (w <= 0 || l <= 0) {
    if (hintEl) {
      hintEl.classList.add('hidden');
      hintEl.innerHTML = '';
    }
    return;
  }

  const totalSqm = w * l;
  // 1 ไร่ = 1600 ตร.ม. (400 ตารางวา)
  // 1 งาน = 400 ตร.ม. (100 ตารางวา)
  // 1 ตารางวา = 4 ตร.ม.
  const totalSqwa = totalSqm / 4;

  const rai = Math.floor(totalSqwa / 400);
  const remainingAfterRai = totalSqwa % 400;

  const ngan = Math.floor(remainingAfterRai / 100);
  const sqwa = Math.round((remainingAfterRai % 100) * 100) / 100;

  const raiInput = document.getElementById('pondRai');
  const nganInput = document.getElementById('pondNgan');
  const sqwaInput = document.getElementById('pondSqwa');

  if (raiInput) raiInput.value = rai;
  if (nganInput) nganInput.value = ngan;
  if (sqwaInput) sqwaInput.value = sqwa;

  if (hintEl) {
    hintEl.classList.remove('hidden');
    hintEl.innerHTML = `✓ คำนวณขนาด: ${w} × ${l} ม. = <strong>${totalSqm.toLocaleString()} ตร.ม.</strong> → แปลงเป็น <strong>${rai} ไร่ ${ngan} งาน ${sqwa} ตารางวา</strong>`;
  }
}

// Species selection handler (supports custom "อื่นๆ" input)
function handlePondSpeciesSelectChange(val) {
  const otherContainer = document.getElementById('pondSpeciesOtherContainer');
  const otherInput = document.getElementById('pondSpeciesOther');
  const hiddenInput = document.getElementById('pondSpecies');

  if (val === 'อื่นๆ') {
    if (otherContainer) otherContainer.classList.remove('hidden');
    if (otherInput) {
      otherInput.focus();
      if (hiddenInput) hiddenInput.value = otherInput.value.trim() || 'สัตว์น้ำอื่นๆ';
    }
  } else {
    if (otherContainer) otherContainer.classList.add('hidden');
    if (hiddenInput) hiddenInput.value = val;
  }
}

function handlePondSpeciesOtherInput(val) {
  const hiddenInput = document.getElementById('pondSpecies');
  if (hiddenInput) {
    hiddenInput.value = val.trim() || 'สัตว์น้ำอื่นๆ';
  }
}

// 6. Pond Modal & CRUD
function handlePondFarmerChange(farmerId) {
  const fId = parseInt(farmerId);
  const f = allFarmers.find(item => item.id === fId);
  const badge = document.getElementById('pondFarmerProfileBadge');
  const citizenInput = document.getElementById('pondFarmerCitizenId');
  const phoneInput = document.getElementById('pondFarmerPhone');
  const birthInput = document.getElementById('pondFarmerBirthDate');
  const addressInput = document.getElementById('pondFarmerAddress');

  if (f) {
    if (badge) badge.textContent = `รหัส #${f.id}: ${f.name}`;
    if (citizenInput) {
      citizenInput.value = formatCitizenId(f.citizen_id || '');
      handleCitizenIdInput(citizenInput);
    }
    if (phoneInput) phoneInput.value = f.phone || '';
    if (birthInput) birthInput.value = f.birth_date || '';
    if (addressInput) {
      const fullAddr = [f.address, f.subdistrict ? `ต.${f.subdistrict}` : '', f.district ? `อ.${f.district}` : '', f.province ? `จ.${f.province}` : ''].filter(Boolean).join(' ');
      addressInput.value = fullAddr || f.address || '';
    }
    updatePondFarmerAgeDisplay();
  } else {
    if (badge) badge.textContent = '';
    if (citizenInput) {
      citizenInput.value = '';
      handleCitizenIdInput(citizenInput);
    }
    if (phoneInput) phoneInput.value = '';
    if (birthInput) birthInput.value = '';
    if (addressInput) addressInput.value = '';
    updatePondFarmerAgeDisplay();
  }
}

function updatePondFarmerAgeDisplay() {
  const birthInput = document.getElementById('pondFarmerBirthDate');
  const ageDisplay = document.getElementById('pondFarmerAgeDisplay');
  if (!birthInput || !ageDisplay) return;
  const ageStr = calculateExactAge(birthInput.value);
  ageDisplay.value = ageStr || '';
}

function openPondModal() {
  document.getElementById('pondForm').reset();
  document.getElementById('pondId').value = '';
  document.getElementById('pondModalTitle').textContent = `เพิ่มพิกัดและข้อมูลบ่อเลี้ยงปลา (จ.${activeProvince || 'ทั่วไป'})`;
  
  // Show general farmer selection, hide locked section
  const selectSection = document.getElementById('pondFarmerSelectSection');
  const lockedSection = document.getElementById('pondFarmerEditLockedSection');
  if (selectSection) selectSection.classList.remove('hidden');
  if (lockedSection) lockedSection.classList.add('hidden');

  if (document.getElementById('pondDepth')) document.getElementById('pondDepth').value = '1.5';
  if (document.getElementById('pondType')) document.getElementById('pondType').value = 'บ่อดิน';
  document.getElementById('pondRai').value = '1';
  document.getElementById('pondNgan').value = '0';
  document.getElementById('pondSqwa').value = '0';
  if (document.getElementById('pondWidth')) document.getElementById('pondWidth').value = '';
  if (document.getElementById('pondLength')) document.getElementById('pondLength').value = '';
  if (document.getElementById('dimensionResultHint')) document.getElementById('dimensionResultHint').classList.add('hidden');
  
  // Reset species selection
  const specSelect = document.getElementById('pondSpeciesSelect');
  if (specSelect) specSelect.value = 'ปลานิล';
  const otherCont = document.getElementById('pondSpeciesOtherContainer');
  if (otherCont) otherCont.classList.add('hidden');
  const otherInp = document.getElementById('pondSpeciesOther');
  if (otherInp) otherInp.value = '';
  const hiddenSpec = document.getElementById('pondSpecies');
  if (hiddenSpec) hiddenSpec.value = 'ปลานิล';

  document.getElementById('pondWaterSource').value = 'คลองชลประทาน';
  document.getElementById('pondStatus').value = 'กำลังเลี้ยง';

  // Check if we have farmers in active province
  if (allFarmers.length === 0) {
    if (confirm(`ยังไม่มีรายชื่อเกษตรกรใน จ.${activeProvince || 'นี้'}\nต้องการเพิ่มเกษตรกรรายใหม่ก่อนหรือไม่?`)) {
      openFarmerModal();
      return;
    }
  }

  const curFarmer = document.getElementById('pondFarmerId').value;
  handlePondFarmerChange(curFarmer);

  document.getElementById('pondModal').classList.remove('hidden');
}

function closePondModal() {
  document.getElementById('pondModal').classList.add('hidden');
  removeTempPickMarker();
}

function openPondModalForFarmer(farmerId) {
  openPondModal();
  const fId = parseInt(farmerId);
  const f = allFarmers.find(item => item.id === fId);
  if (!f) return;

  document.getElementById('pondFarmerId').value = f.id;
  document.getElementById('pondModalTitle').textContent = `เพิ่มบ่อเลี้ยงปลาใหม่: ${f.name}`;
  
  // Lock to this farmer! Do not show other farmers
  const selectSection = document.getElementById('pondFarmerSelectSection');
  const lockedSection = document.getElementById('pondFarmerEditLockedSection');
  if (selectSection) selectSection.classList.add('hidden');
  if (lockedSection) lockedSection.classList.remove('hidden');

  document.getElementById('pondLockedFarmerName').textContent = f.name;
  document.getElementById('pondLockedFarmerIdBadge').textContent = `#${f.id}`;
  document.getElementById('pondLockedFarmerSubtext').textContent = `เกษตรกรผู้เพาะเลี้ยงสัตว์น้ำ • จ.${f.province || 'แม่ฮ่องสอน'}`;

  // Populate farmer profile box
  handlePondFarmerChange(f.id);

  // List this farmer's existing ponds + option to create new
  const farmerPonds = allPonds.filter(item => item.farmer_id === f.id);
  const dropdown = document.getElementById('farmerPondsDropdown');
  const countBadge = document.getElementById('pondCountForFarmerBadge');
  if (countBadge) countBadge.textContent = farmerPonds.length;

  if (dropdown) {
    dropdown.innerHTML = '';
    const newOpt = document.createElement('option');
    newOpt.value = 'new';
    newOpt.textContent = `✨ + กำลังสร้างบ่อใหม่ (บ่อที่ ${farmerPonds.length + 1})`;
    newOpt.selected = true;
    dropdown.appendChild(newOpt);

    farmerPonds.forEach((fp, idx) => {
      const opt = document.createElement('option');
      opt.value = fp.id;
      opt.textContent = `บ่อที่ ${idx + 1}: ${fp.name} (${fp.area_rai} ไร่ ${fp.area_ngan} งาน - ${fp.fish_species} - ${fp.pond_type || 'บ่อดิน'})`;
      dropdown.appendChild(opt);
    });
  }

  // Suggest default name: e.g. "นางคำพร มูลพรม 2"
  document.getElementById('pondName').value = `${f.name} ${farmerPonds.length + 1}`;
}

function editPond(pondId) {
  const p = allPonds.find(item => item.id === pondId);
  if (!p) return;

  document.getElementById('pondId').value = p.id;
  document.getElementById('pondModalTitle').textContent = `แก้ไขข้อมูลบ่อ: ${p.name}`;
  document.getElementById('pondFarmerId').value = p.farmer_id;
  
  // LOCK TO THIS FARMER: Never show other farmers' names when editing this farmer's pond!
  const selectSection = document.getElementById('pondFarmerSelectSection');
  const lockedSection = document.getElementById('pondFarmerEditLockedSection');
  if (selectSection) selectSection.classList.add('hidden');
  if (lockedSection) lockedSection.classList.remove('hidden');

  document.getElementById('pondLockedFarmerName').textContent = p.farmer_name;
  document.getElementById('pondLockedFarmerIdBadge').textContent = `#${p.farmer_id}`;
  document.getElementById('pondLockedFarmerSubtext').textContent = `เกษตรกรเจ้าของบ่อ • จ.${p.farmer_province || 'แม่ฮ่องสอน'}`;

  // Populate ponds dropdown: Show ONLY this farmer's ponds (e.g. นางคำพร มูลพรม 1, นางคำพร มูลพรม 2)
  const farmerPonds = allPonds.filter(item => item.farmer_id === p.farmer_id);
  const dropdown = document.getElementById('farmerPondsDropdown');
  const countBadge = document.getElementById('pondCountForFarmerBadge');
  if (countBadge) countBadge.textContent = farmerPonds.length;

  if (dropdown) {
    dropdown.innerHTML = '';
    farmerPonds.forEach((fp, idx) => {
      const opt = document.createElement('option');
      opt.value = fp.id;
      opt.textContent = `บ่อที่ ${idx + 1}: ${fp.name} (${fp.area_rai} ไร่ ${fp.area_ngan} งาน - ${fp.fish_species} - ${fp.pond_type || 'บ่อดิน'})`;
      if (fp.id === p.id) opt.selected = true;
      dropdown.appendChild(opt);
    });
  }

  // Populate farmer profile box
  handlePondFarmerChange(p.farmer_id);

  document.getElementById('pondName').value = p.name;
  
  // Set species selection (predefined or custom 'อื่นๆ')
  const specSelect = document.getElementById('pondSpeciesSelect');
  const otherCont = document.getElementById('pondSpeciesOtherContainer');
  const otherInp = document.getElementById('pondSpeciesOther');
  const hiddenSpec = document.getElementById('pondSpecies');

  if (hiddenSpec) hiddenSpec.value = p.fish_species;

  if (specSelect) {
    let found = false;
    for (let i = 0; i < specSelect.options.length; i++) {
      if (specSelect.options[i].value === p.fish_species) {
        specSelect.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (found) {
      if (otherCont) otherCont.classList.add('hidden');
      if (otherInp) otherInp.value = '';
    } else {
      specSelect.value = 'อื่นๆ';
      if (otherCont) otherCont.classList.remove('hidden');
      if (otherInp) otherInp.value = p.fish_species;
    }
  }

  // Set pond type dropdown (บ่อดิน, บ่อซีเมนต์, บ่อพลาสติก, กระชังบก, ท่อ)
  if (document.getElementById('pondType')) {
    document.getElementById('pondType').value = p.pond_type || 'บ่อดิน';
  }

  document.getElementById('pondLat').value = p.latitude;
  document.getElementById('pondLng').value = p.longitude;
  document.getElementById('pondRai').value = p.area_rai;
  document.getElementById('pondNgan').value = p.area_ngan;
  document.getElementById('pondSqwa').value = p.area_sqwa;
  if (document.getElementById('pondDepth')) document.getElementById('pondDepth').value = p.depth_meters || 1.5;
  if (document.getElementById('pondWidth')) document.getElementById('pondWidth').value = '';
  if (document.getElementById('pondLength')) document.getElementById('pondLength').value = '';
  if (document.getElementById('dimensionResultHint')) document.getElementById('dimensionResultHint').classList.add('hidden');
  if (document.getElementById('pondStockCount')) document.getElementById('pondStockCount').value = p.stock_count || 0;
  if (document.getElementById('pondStockDate')) document.getElementById('pondStockDate').value = p.stock_date || '';
  if (document.getElementById('pondHarvestDate')) document.getElementById('pondHarvestDate').value = p.harvest_date || '';
  document.getElementById('pondWaterSource').value = p.water_source;
  document.getElementById('pondStatus').value = p.status;
  document.getElementById('pondNotes').value = p.notes || '';

  setTempPickMarker(p.latitude, p.longitude);
  document.getElementById('pondModal').classList.remove('hidden');
}

function switchPondForCurrentFarmer(selectedVal) {
  if (selectedVal === 'new') {
    addNewPondForCurrentFarmer();
  } else {
    const targetId = parseInt(selectedVal);
    if (targetId) editPond(targetId);
  }
}

function addNewPondForCurrentFarmer() {
  const currentFarmerId = document.getElementById('pondFarmerId').value;
  if (currentFarmerId) {
    openPondModalForFarmer(currentFarmerId);
  }
}

function editFarmerFromPondModal() {
  const currentFarmerId = parseInt(document.getElementById('pondFarmerId').value);
  if (!currentFarmerId) return;
  closePondModal();
  openFarmerModal();
  editFarmer(currentFarmerId);
}

async function savePond(e) {
  e.preventDefault();
  const pondId = document.getElementById('pondId').value;
  const formData = new FormData();

  const selectedFarmerId = document.getElementById('pondFarmerId').value;

  formData.append('farmer_id', selectedFarmerId);
  formData.append('name', document.getElementById('pondName').value);
  formData.append('fish_species', document.getElementById('pondSpecies').value);
  formData.append('latitude', document.getElementById('pondLat').value);
  formData.append('longitude', document.getElementById('pondLng').value);
  formData.append('area_rai', document.getElementById('pondRai').value || 0);
  formData.append('area_ngan', document.getElementById('pondNgan').value || 0);
  formData.append('area_sqwa', document.getElementById('pondSqwa').value || 0);
  formData.append('pond_type', document.getElementById('pondType') ? document.getElementById('pondType').value : 'บ่อดิน');
  formData.append('depth_meters', document.getElementById('pondDepth').value || 1.5);
  formData.append('stock_count', document.getElementById('pondStockCount').value || 0);
  formData.append('stock_date', document.getElementById('pondStockDate').value || '');
  formData.append('harvest_date', document.getElementById('pondHarvestDate').value || '');
  formData.append('water_source', document.getElementById('pondWaterSource').value || '');
  formData.append('status', document.getElementById('pondStatus').value);
  formData.append('notes', document.getElementById('pondNotes').value || '');

  try {
    const url = pondId ? `/api/ponds/${pondId}` : '/api/ponds';
    const method = pondId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: getAdminHeaders(),
      body: formData
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.detail || 'เกิดข้อผิดพลาด');

    // Auto-update farmer profile if modified directly in pond modal
    const currentFarmer = allFarmers.find(f => f.id == selectedFarmerId);
    if (selectedFarmerId && currentFarmer) {
      const fCitizen = (document.getElementById('pondFarmerCitizenId') ? document.getElementById('pondFarmerCitizenId').value.trim() : '');
      const fPhone = (document.getElementById('pondFarmerPhone') ? document.getElementById('pondFarmerPhone').value.trim() : '');
      const fBirth = (document.getElementById('pondFarmerBirthDate') ? document.getElementById('pondFarmerBirthDate').value.trim() : '');
      const fAddress = (document.getElementById('pondFarmerAddress') ? document.getElementById('pondFarmerAddress').value.trim() : '');

      if (fCitizen !== (currentFarmer.citizen_id || '') ||
          (fPhone && fPhone !== (currentFarmer.phone || '')) ||
          fBirth !== (currentFarmer.birth_date || '') ||
          (fAddress && fAddress !== (currentFarmer.address || ''))) {
        try {
          const fData = new FormData();
          fData.append('name', currentFarmer.name);
          fData.append('citizen_id', fCitizen);
          fData.append('phone', fPhone || currentFarmer.phone || '');
          fData.append('birth_date', fBirth);
          fData.append('address', fAddress || currentFarmer.address || '');
          fData.append('subdistrict', currentFarmer.subdistrict || '');
          fData.append('district', currentFarmer.district || '');
          fData.append('province', currentFarmer.province || activeProvince || '');
          fData.append('notes', currentFarmer.notes || '');

          await fetch(`/api/farmers/${selectedFarmerId}`, {
            method: 'PUT',
            headers: getAdminHeaders(),
            body: fData
          });
        } catch (syncErr) {
          console.warn('Auto-sync farmer from pond modal notice:', syncErr);
        }
      }
    }

    closePondModal();
    if (tempPickMarker) map.removeLayer(tempPickMarker);
    await loadAllData();
    alert('บันทึกข้อมูลและพิกัดบ่อเลี้ยงปลาเรียบร้อยแล้ว!');
  } catch (err) {
    alert('ข้อผิดพลาด: ' + err.message);
  }
}

async function deletePond(pondId) {
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบบ่อเลี้ยงปลานี้? ข้อมูลและรูปภาพทั้งหมดจะถูกลบ')) return;
  try {
    const res = await fetch(`/api/ponds/${pondId}`, { method: 'DELETE', headers: getAdminHeaders() });
    if (!res.ok) throw new Error('ไม่สามารถลบได้');
    await loadAllData();
  } catch (err) {
    alert('ข้อผิดพลาด: ' + err.message);
  }
}

// --- Thai Citizen ID 13-Digit Standard Formatter & Clean Copy ---
function formatCitizenId(val) {
  if (!val) return '';
  const digits = String(val).replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 1) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 1)} ${digits.slice(1)}`;
  if (digits.length <= 10) return `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5, 10)} ${digits.slice(10)}`;
  return `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5, 10)} ${digits.slice(10, 12)} ${digits.slice(12, 13)}`;
}

function handleCitizenIdInput(input) {
  if (!input) return;
  const cursor = input.selectionStart || 0;
  const oldVal = input.value;
  const digitsBeforeCursor = oldVal.slice(0, cursor).replace(/\D/g, '').length;
  
  const rawDigits = input.value.replace(/\D/g, '').slice(0, 13);
  const formatted = formatCitizenId(rawDigits);
  input.value = formatted;
  
  // Intelligent cursor restoration so typing remains natural
  let newCursor = 0;
  let digitCount = 0;
  while (newCursor < formatted.length && digitCount < digitsBeforeCursor) {
    if (/\d/.test(formatted[newCursor])) {
      digitCount++;
    }
    newCursor++;
  }
  input.setSelectionRange(newCursor, newCursor);

  // Update counter badge
  const countSpanId = input.id === 'pondFarmerCitizenId' ? 'pondFarmerCitizenCount' : (input.id === 'farmerCitizenId' ? 'farmerCitizenCount' : null);
  if (countSpanId) {
    const badge = document.getElementById(countSpanId);
    if (badge) {
      badge.textContent = rawDigits.length > 0 ? `${rawDigits.length}/13 หลัก` : '';
      if (rawDigits.length === 13) {
        badge.className = 'absolute right-2 top-2 text-[10px] text-emerald-600 font-bold font-mono';
      } else {
        badge.className = 'absolute right-2 top-2 text-[10px] text-slate-400 font-mono';
      }
    }
  }
}

function copyCleanCitizenId(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const clean = input.value.replace(/\D/g, '');
  if (!clean) {
    showCopyToast('ยังไม่มีตัวเลขบัตรประชาชนให้คัดลอก');
    return;
  }
  copyPlainCitizenText(clean);
}

function copyPlainCitizenText(text) {
  const clean = String(text).replace(/\D/g, '');
  if (!clean) return;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(clean).then(() => {
      showCopyToast(`คัดลอกตัวเลขเรียงกัน ${clean.length} หลัก: ${clean}`);
    }).catch(() => fallbackCopy(clean));
  } else {
    fallbackCopy(clean);
  }
}

function fallbackCopy(clean) {
  const ta = document.createElement('textarea');
  ta.value = clean;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showCopyToast(`คัดลอกตัวเลขเรียงกัน ${clean.length} หลัก: ${clean}`);
}

let _copyToastTimer = null;
function showCopyToast(msg) {
  const toast = document.getElementById('copyToast');
  const text = document.getElementById('copyToastText');
  if (!toast || !text) return;
  text.textContent = msg;
  toast.classList.remove('hidden');
  if (_copyToastTimer) clearTimeout(_copyToastTimer);
  _copyToastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2500);
}

// Global copy event listener: whenever someone highlights and copies from a citizen ID field, it writes plain unspaced digits to clipboard!
document.addEventListener('copy', (e) => {
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.id === 'pondFarmerCitizenId' || activeEl.id === 'farmerCitizenId')) {
    const selStart = activeEl.selectionStart;
    const selEnd = activeEl.selectionEnd;
    let selectedText = '';
    if (selStart !== undefined && selEnd !== undefined && selStart !== selEnd) {
      selectedText = activeEl.value.slice(selStart, selEnd);
    } else {
      selectedText = activeEl.value;
    }
    const cleanDigits = selectedText.replace(/\D/g, '');
    if (cleanDigits) {
      e.clipboardData.setData('text/plain', cleanDigits);
      e.preventDefault();
      showCopyToast(`คัดลอกตัวเลขเรียงกัน (${cleanDigits}) เรียบร้อย!`);
    }
  }
});

// 7. Farmer Modal & CRUD
function calculateExactAge(birthDateStr) {
  if (!birthDateStr) return '';
  const birthDate = new Date(birthDateStr);
  if (isNaN(birthDate.getTime())) return '';

  const today = new Date();
  if (birthDate > today) return 'ยังไม่ถึงวันเกิด';

  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  let days = today.getDate() - birthDate.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += prevMonth.getDate();
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  return `${years} ปี ${months} เดือน ${days} วัน`;
}

function updateFarmerAgeDisplay() {
  const birthInput = document.getElementById('farmerBirthDate');
  const ageDisplay = document.getElementById('farmerAgeDisplay');
  if (!birthInput || !ageDisplay) return;

  const ageStr = calculateExactAge(birthInput.value);
  if (ageStr) {
    ageDisplay.value = ageStr;
  } else {
    ageDisplay.value = '';
  }
}

function openFarmerModal() {
  hideFarmerForm();
  const searchInput = document.getElementById('farmerSearchInput');
  if (searchInput) searchInput.value = '';
  renderFarmerTable();
  document.getElementById('farmerModal').classList.remove('hidden');
}

function closeFarmerModal() {
  hideFarmerForm();
  document.getElementById('farmerModal').classList.add('hidden');
}

function showAddFarmerForm() {
  resetFarmerForm();
  const wrapper = document.getElementById('farmerFormWrapper');
  if (wrapper) {
    wrapper.classList.remove('hidden');
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  const nameInp = document.getElementById('farmerName');
  if (nameInp) nameInp.focus();
}

function hideFarmerForm() {
  const wrapper = document.getElementById('farmerFormWrapper');
  if (wrapper) wrapper.classList.add('hidden');
  resetFarmerForm();
}

function resetFarmerForm() {
  document.getElementById('farmerForm').reset();
  document.getElementById('farmerId').value = '';
  const citInp = document.getElementById('farmerCitizenId');
  if (citInp) { citInp.value = ''; handleCitizenIdInput(citInp); }
  if (document.getElementById('farmerBirthDate')) document.getElementById('farmerBirthDate').value = '';
  if (document.getElementById('farmerAgeDisplay')) document.getElementById('farmerAgeDisplay').value = '';
  document.getElementById('farmerProvince').value = activeProvince || 'แม่ฮ่องสอน';
  if (activeDistrict) {
    document.getElementById('farmerDistrict').value = activeDistrict;
  }
  const scopeText = activeDistrict ? `อ.${activeDistrict} จ.${activeProvince}` : `จ.${activeProvince || 'แม่ฮ่องสอน'}`;
  document.getElementById('farmerFormTitle').innerHTML = `<i class="fa-solid fa-user-plus text-sky-600"></i> เพิ่มเกษตรกรรายใหม่ (พื้นที่ ${scopeText})`;
}

function openPondModalForFarmer(farmerId) {
  openPondModal();
  if (farmerId) {
    const sel = document.getElementById('pondFarmerId');
    if (sel) {
      sel.value = farmerId;
      handlePondFarmerChange(farmerId);
    }
  }
}

function renderFarmerTable(customList) {
  const tbody = document.getElementById('farmerTableBody');
  if (!tbody) return;

  const list = customList !== undefined ? customList : allFarmers;
  const countBadge = document.getElementById('farmerModalCountBadge');
  if (countBadge) countBadge.textContent = `${list.length} ราย`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400 font-medium">ไม่พบรายชื่อเกษตรกรในระบบ</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  list.forEach(f => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-sky-50/50 transition border-b border-slate-100';
    const ageText = calculateExactAge(f.birth_date);
    const addressDetails = [f.address, f.subdistrict ? `ต.${f.subdistrict}` : '', f.district ? `อ.${f.district}` : '', f.province ? `จ.${f.province}` : ''].filter(Boolean).join(' ');

    tr.innerHTML = `
      <td class="p-3 font-medium text-slate-800">
        <div class="font-bold text-slate-900">${f.name}</div>
        ${f.notes ? `<div class="text-[10px] text-slate-400 font-normal truncate max-w-[150px]">${f.notes}</div>` : ''}
      </td>
      <td class="p-3 text-slate-700 font-mono text-xs whitespace-nowrap">
        ${f.citizen_id ? `
          <span class="font-bold tracking-wider">${formatCitizenId(f.citizen_id)}</span>
          <button type="button" onclick="copyPlainCitizenText('${f.citizen_id.replace(/\D/g, '')}')" class="ml-1.5 p-1 text-slate-400 hover:text-sky-600 rounded transition cursor-pointer" title="คัดลอกตัวเลขเรียงกัน 13 หลัก">
            <i class="fa-solid fa-copy"></i>
          </button>
        ` : '<span class="text-slate-300">-</span>'}
      </td>
      <td class="p-3 text-slate-700">
        ${ageText ? `
          <div class="font-bold text-sky-800">${ageText}</div>
          <div class="text-[10px] text-slate-400">เกิด: ${f.birth_date}</div>
        ` : '<span class="text-slate-300">-</span>'}
      </td>
      <td class="p-3 text-slate-600">
        <div class="font-semibold text-slate-800"><i class="fa-solid fa-phone text-slate-400 mr-1 text-[10px]"></i>${f.phone || '-'}</div>
        <div class="text-[10px] text-slate-400 mt-0.5">${addressDetails || '-'}</div>
      </td>
      <td class="p-3 text-center"><span class="px-2.5 py-1 bg-sky-50 text-sky-700 rounded-full font-bold text-xs border border-sky-100">${f.ponds_count}</span></td>
      <td class="p-3 text-right space-x-1.5 whitespace-nowrap">
        <button onclick="closeFarmerModal(); openPondModalForFarmer(${f.id})" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition" title="ไปปักหมุดบ่อของเกษตรกรท่านนี้">
          <i class="fa-solid fa-location-dot"></i> ปักหมุดบ่อ
        </button>
        <button onclick="editFarmer(${f.id})" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium transition" title="แก้ไขข้อมูลเกษตรกร">
          <i class="fa-solid fa-pen text-slate-500"></i> แก้ไข
        </button>
        <button onclick="deleteFarmer(${f.id})" class="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-lg text-xs font-medium transition" title="ลบข้อมูลเกษตรกร">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterFarmerTable(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    renderFarmerTable(allFarmers);
    return;
  }
  const filtered = allFarmers.filter(f => {
    const fullAddr = [f.address, f.subdistrict, f.district, f.province].join(' ');
    return (f.name && f.name.toLowerCase().includes(q)) ||
           (f.citizen_id && f.citizen_id.toLowerCase().includes(q)) ||
           (f.phone && f.phone.includes(q)) ||
           (fullAddr && fullAddr.toLowerCase().includes(q));
  });
  renderFarmerTable(filtered);
}

function editFarmer(farmerId) {
  const f = allFarmers.find(item => item.id === farmerId);
  if (!f) return;

  const wrapper = document.getElementById('farmerFormWrapper');
  if (wrapper) {
    wrapper.classList.remove('hidden');
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.getElementById('farmerId').value = f.id;
  document.getElementById('farmerName').value = f.name;
  const citInput = document.getElementById('farmerCitizenId');
  if (citInput) {
    citInput.value = formatCitizenId(f.citizen_id || '');
    handleCitizenIdInput(citInput);
  }
  document.getElementById('farmerPhone').value = f.phone || '';
  if (document.getElementById('farmerBirthDate')) {
    document.getElementById('farmerBirthDate').value = f.birth_date || '';
    updateFarmerAgeDisplay();
  }
  document.getElementById('farmerAddress').value = f.address || '';
  document.getElementById('farmerSubdistrict').value = f.subdistrict || '';
  document.getElementById('farmerDistrict').value = f.district || '';
  document.getElementById('farmerProvince').value = f.province || activeProvince || '';
  document.getElementById('farmerNotes').value = f.notes || '';

  document.getElementById('farmerFormTitle').innerHTML = `<i class="fa-solid fa-user-pen text-sky-600"></i> แก้ไขข้อมูลเกษตรกร: ${f.name}`;
  const nameInp = document.getElementById('farmerName');
  if (nameInp) nameInp.focus();
}

async function saveFarmer(e) {
  e.preventDefault();
  const farmerId = document.getElementById('farmerId').value;
  const formData = new FormData();

  const enteredProvince = document.getElementById('farmerProvince').value.trim();

  formData.append('name', document.getElementById('farmerName').value);
  formData.append('citizen_id', document.getElementById('farmerCitizenId').value);
  formData.append('phone', document.getElementById('farmerPhone').value);
  if (document.getElementById('farmerBirthDate')) {
    formData.append('birth_date', document.getElementById('farmerBirthDate').value || '');
  }
  formData.append('address', document.getElementById('farmerAddress').value);
  formData.append('subdistrict', document.getElementById('farmerSubdistrict').value);
  formData.append('district', document.getElementById('farmerDistrict').value);
  formData.append('province', enteredProvince);
  formData.append('notes', document.getElementById('farmerNotes').value);

  try {
    const url = farmerId ? `/api/farmers/${farmerId}` : '/api/farmers';
    const method = farmerId ? 'PUT' : 'POST';

    const res = await fetch(url, { method: method, headers: getAdminHeaders(), body: formData });
    const result = await res.json();
    if (!res.ok) throw new Error(result.detail || 'เกิดข้อผิดพลาด');

    hideFarmerForm();
    await loadFarmers();
    await loadStats();
    await loadProvincesList();
    renderFarmerTable();

    if (window._autoGoToPin) {
      window._autoGoToPin = false;
      closeFarmerModal();
      openPondModalForFarmer(result.id);
      return;
    }

    const goToPin = confirm(`บันทึกข้อมูลเกษตรกร "${result.name}" เรียบร้อย!\n\nต้องการไป "ลงพิกัดบ่อเลี้ยงปลา" ของ ${result.name} บนแผนที่ต่อเลยทันทีหรือไม่?`);
    if (goToPin) {
      closeFarmerModal();
      openPondModalForFarmer(result.id);
    }
  } catch (err) {
    alert('ข้อผิดพลาด: ' + err.message);
  }
}

function saveFarmerAndGoToPin() {
  window._autoGoToPin = true;
  const form = document.getElementById('farmerForm');
  if (form.reportValidity()) {
    form.requestSubmit();
  }
}

async function deleteFarmer(farmerId) {
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบเกษตรกรรายนี้? บ่อปลาทั้งหมดของเกษตรกรจะถูกลบไปด้วย')) return;
  try {
    const res = await fetch(`/api/farmers/${farmerId}`, { method: 'DELETE', headers: getAdminHeaders() });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'ไม่สามารถลบได้');
    }
    showToast('🗑️ ลบข้อมูลเกษตรกรเรียบร้อยแล้ว', 'success');
    await loadAllData();
  } catch (err) {
    alert('ข้อผิดพลาด: ' + err.message);
  }
}

// 8. Photos & Documents Management (Media Modal)
async function openMediaModal(pondId) {
  activePondForMedia = pondId;
  document.getElementById('mediaPondId').value = pondId;

  // Fetch latest pond details
  try {
    const res = await fetch(`/api/ponds/${pondId}`);
    const pond = await res.json();

    document.getElementById('mediaModalTitle').textContent = `รูปภาพและเอกสารแนบ: ${pond.name} (${pond.farmer_name})`;
    document.getElementById('countPondPhotos').textContent = pond.photos ? pond.photos.length : 0;
    document.getElementById('countPondDocs').textContent = pond.documents ? pond.documents.length : 0;

    renderPhotosGallery(pond.photos || []);
    renderDocumentsList(pond.documents || []);

    switchMediaTab('photos');
    document.getElementById('mediaModal').classList.remove('hidden');
  } catch (err) {
    alert('ไม่สามารถโหลดข้อมูลสื่อของบ่อปลาได้: ' + err.message);
  }
}

function closeMediaModal() {
  document.getElementById('mediaModal').classList.add('hidden');
  activePondForMedia = null;
}

function switchMediaTab(tab) {
  const tabPhotos = document.getElementById('tabPhotosSection');
  const tabDocs = document.getElementById('tabDocsSection');
  const btnPhotos = document.getElementById('tabBtnPhotos');
  const btnDocs = document.getElementById('tabBtnDocs');

  if (tab === 'photos') {
    tabPhotos.classList.remove('hidden');
    tabDocs.classList.add('hidden');
    btnPhotos.className = 'pb-2 border-b-2 border-teal-600 text-teal-700 flex items-center gap-1.5 font-semibold';
    btnDocs.className = 'pb-2 border-b-2 border-transparent text-slate-500 hover:text-slate-700 flex items-center gap-1.5';
  } else {
    tabPhotos.classList.add('hidden');
    tabDocs.classList.remove('hidden');
    btnDocs.className = 'pb-2 border-b-2 border-teal-600 text-teal-700 flex items-center gap-1.5 font-semibold';
    btnPhotos.className = 'pb-2 border-b-2 border-transparent text-slate-500 hover:text-slate-700 flex items-center gap-1.5';
  }
}

function renderPhotosGallery(photos) {
  const container = document.getElementById('photosGallery');
  if (!photos || photos.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-8 text-slate-400">
        <i class="fa-regular fa-images text-2xl mb-1"></i>
        <p>ยังไม่มีรูปภาพสภาพบ่อปลา</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  photos.forEach(ph => {
    const div = document.createElement('div');
    div.className = 'group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 shadow-sm aspect-video cursor-pointer';
    div.innerHTML = `
      <img src="${ph.url}" class="w-full h-full object-cover group-hover:scale-105 transition duration-200" onclick="openImageLightbox('${ph.url}', '${ph.caption || ph.name}')">
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-90 p-2 flex flex-col justify-end text-white text-[10px] pointer-events-none">
        <div class="truncate font-medium">${ph.caption || ph.name}</div>
      </div>
      <button onclick="deletePhoto(${ph.id})" class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-600/80 hover:bg-rose-600 text-white flex items-center justify-center text-xs shadow transition" title="ลบรูปภาพ">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;
    container.appendChild(div);
  });
}

function renderDocumentsList(documents) {
  const container = document.getElementById('docsList');
  if (!documents || documents.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-400">
        <i class="fa-regular fa-file-lines text-2xl mb-1"></i>
        <p>ยังไม่มีเอกสารแนบสำหรับบ่อนี้</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  documents.forEach(doc => {
    const div = document.createElement('div');
    div.className = 'p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-2 shadow-sm hover:border-slate-300 transition';
    
    // Size format
    const sizeKB = (doc.size / 1024).toFixed(1);
    
    // Doc icon
    let icon = 'fa-file-pdf text-rose-500';
    if (doc.name.endsWith('.docx') || doc.name.endsWith('.doc')) icon = 'fa-file-word text-blue-500';
    else if (doc.name.endsWith('.xlsx') || doc.name.endsWith('.xls')) icon = 'fa-file-excel text-emerald-500';
    else if (doc.name.match(/\.(jpg|jpeg|png)$/i)) icon = 'fa-file-image text-amber-500';

    div.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center text-lg shrink-0 border border-slate-100">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div class="min-w-0">
          <a href="${doc.url}" target="_blank" class="font-semibold text-slate-800 hover:text-teal-700 truncate block text-xs">
            ${doc.name}
          </a>
          <div class="text-[10px] text-slate-400 flex items-center gap-2">
            <span class="px-1.5 py-0.2 bg-teal-50 text-teal-700 rounded border border-teal-100 font-medium">${doc.type}</span>
            <span>${sizeKB} KB</span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <a href="${doc.url}" target="_blank" download class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1">
          <i class="fa-solid fa-download"></i> ดาวน์โหลด
        </a>
        <button onclick="deleteDocument(${doc.id})" class="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg" title="ลบเอกสาร">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;
    container.appendChild(div);
  });
}

// Upload Photo handler
async function uploadPhoto(e) {
  e.preventDefault();
  if (!activePondForMedia) return;

  const fileInput = document.getElementById('photoFileInput');
  const captionInput = document.getElementById('photoCaptionInput');

  if (!fileInput.files || fileInput.files.length === 0) {
    alert('กรุณาเลือกไฟล์รูปภาพ');
    return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('caption', captionInput.value);

  const btn = document.getElementById('btnUploadPhoto');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังอัปโหลด...';

  try {
    const res = await fetch(`/api/ponds/${activePondForMedia}/photos`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('การอัปโหลดล้มเหลว');

    fileInput.value = '';
    captionInput.value = '';
    await openMediaModal(activePondForMedia);
    await loadPonds();
  } catch (err) {
    alert('เกิดข้อผิดพลาด: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-upload"></i> อัปโหลดรูปภาพ';
  }
}

async function deletePhoto(photoId) {
  if (!confirm('คุณแน่ใจว่าต้องการลบรูปภาพนี้?')) return;
  try {
    const res = await fetch(`/api/photos/${photoId}`, { method: 'DELETE', headers: getAdminHeaders() });
    if (!res.ok) throw new Error('ไม่สามารถลบได้');
    await openMediaModal(activePondForMedia);
    await loadPonds();
  } catch (err) {
    alert('ข้อผิดพลาด: ' + err.message);
  }
}

// Upload Document handler
async function uploadDocument(e) {
  e.preventDefault();
  if (!activePondForMedia) return;

  const fileInput = document.getElementById('docFileInput');
  const typeSelect = document.getElementById('docTypeSelect');

  if (!fileInput.files || fileInput.files.length === 0) {
    alert('กรุณาเลือกไฟล์เอกสาร');
    return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('doc_type', typeSelect.value);

  const btn = document.getElementById('btnUploadDoc');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังแนบไฟล์...';

  try {
    const res = await fetch(`/api/ponds/${activePondForMedia}/documents`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('การแนบไฟล์ล้มเหลว');

    fileInput.value = '';
    await openMediaModal(activePondForMedia);
    await loadPonds();
  } catch (err) {
    alert('เกิดข้อผิดพลาด: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paperclip"></i> แนบเอกสาร';
  }
}

async function deleteDocument(docId) {
  if (!confirm('คุณแน่ใจว่าต้องการลบเอกสารนี้?')) return;
  try {
    const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE', headers: getAdminHeaders() });
    if (!res.ok) throw new Error('ไม่สามารถลบได้');
    await openMediaModal(activePondForMedia);
    await loadPonds();
  } catch (err) {
    alert('ข้อผิดพลาด: ' + err.message);
  }
}

// Lightbox
function openImageLightbox(src, caption) {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightboxCaption').textContent = caption || '';
  document.getElementById('imageLightboxModal').classList.remove('hidden');
}

function closeImageLightbox() {
  document.getElementById('imageLightboxModal').classList.add('hidden');
}

// ==================== STREET VIEW & FULLSCREEN CONTROLS ====================
let isStreetViewActive = false;

function toggleStreetViewMode() {
  isStreetViewActive = !isStreetViewActive;
  const btn = document.getElementById('btnStreetView');
  const btnText = document.getElementById('streetViewBtnText');
  const mapElem = document.getElementById('map');

  if (isStreetViewActive) {
    if (btn) {
      btn.className = 'px-2.5 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold border border-amber-600 shadow-sm flex items-center gap-1.5 animate-pulse';
    }
    if (btnText) btnText.textContent = 'สตรีทวิว: เปิด (คลิกบนแผนที่)';
    if (mapElem) mapElem.style.cursor = 'crosshair';
    showToast('เปิดโหมดสตรีทวิวแล้ว: คลิกบนถนนหรือจุดที่ต้องการเพื่อเปิด Google Street View 360°', 'info');
  } else {
    if (btn) {
      btn.className = 'px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 font-semibold transition flex items-center gap-1.5 shadow-sm';
    }
    if (btnText) btnText.textContent = 'สตรีทวิว';
    if (mapElem) mapElem.style.cursor = '';
  }
}

function openStreetView(lat, lng) {
  const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
  window.open(url, '_blank');
}

function toggleMapFullscreen() {
  const col = document.getElementById('mapContainerCol');
  if (!col) return;

  if (!document.fullscreenElement) {
    if (col.requestFullscreen) {
      col.requestFullscreen();
    } else if (col.webkitRequestFullscreen) {
      col.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

document.addEventListener('fullscreenchange', () => {
  const fsText = document.getElementById('fullscreenBtnText');
  const mapElem = document.getElementById('map');
  if (document.fullscreenElement) {
    if (fsText) fsText.textContent = 'ย่อจอ';
    if (mapElem) mapElem.style.height = 'calc(100vh - 120px)';
  } else {
    if (fsText) fsText.textContent = 'เต็มจอ';
    if (mapElem) mapElem.style.height = '680px';
  }
  if (map) {
    setTimeout(() => { map.invalidateSize(); }, 250);
  }
});

// ==================== MAP & VIEW NAVIGATION HISTORY (ย้อนกลับ / ไปข้างหน้า) ====================
let mapHistory = [];
let mapHistoryIndex = -1;
let isNavigatingHistory = false;

function pushMapHistory(center, zoom) {
  if (isNavigatingHistory || !center) return;
  const last = mapHistory[mapHistoryIndex];
  if (last && Math.abs(last.lat - center.lat) < 0.0003 && Math.abs(last.lng - center.lng) < 0.0003 && last.zoom === zoom) {
    return;
  }
  // If we navigated back and user pans somewhere new, discard future redo branch
  if (mapHistoryIndex < mapHistory.length - 1) {
    mapHistory.splice(mapHistoryIndex + 1);
  }
  mapHistory.push({ lat: center.lat, lng: center.lng, zoom: zoom });
  if (mapHistory.length > 50) mapHistory.shift();
  mapHistoryIndex = mapHistory.length - 1;
  updateNavButtonsUI();
}

function navGoBack() {
  // 1. If any modal is currently visible, Back closes it first
  const openModal = [
    document.getElementById('pondModal'),
    document.getElementById('farmerModal'),
    document.getElementById('mediaModal'),
    document.getElementById('adminModal')
  ].find(m => m && !m.classList.contains('hidden'));

  if (openModal) {
    openModal.classList.add('hidden');
    return;
  }

  // 2. If map history has previous location/zoom, restore it
  if (mapHistoryIndex > 0) {
    mapHistoryIndex--;
    const state = mapHistory[mapHistoryIndex];
    if (state && map) {
      isNavigatingHistory = true;
      map.setView([state.lat, state.lng], state.zoom, { animate: true });
      setTimeout(() => { isNavigatingHistory = false; }, 350);
      updateNavButtonsUI();
      return;
    }
  }

  // 3. Otherwise browser history back
  if (window.history.length > 1) {
    window.history.back();
  }
}

function navGoForward() {
  if (mapHistoryIndex < mapHistory.length - 1) {
    mapHistoryIndex++;
    const state = mapHistory[mapHistoryIndex];
    if (state && map) {
      isNavigatingHistory = true;
      map.setView([state.lat, state.lng], state.zoom, { animate: true });
      setTimeout(() => { isNavigatingHistory = false; }, 350);
      updateNavButtonsUI();
      return;
    }
  }

  if (window.history.length > 1) {
    window.history.forward();
  }
}

function updateNavButtonsUI() {
  const canBack = mapHistoryIndex > 0;
  const canFwd = mapHistoryIndex < mapHistory.length - 1;

  document.querySelectorAll('.btn-nav-back').forEach(btn => {
    btn.style.opacity = canBack ? '1' : '0.5';
  });
  document.querySelectorAll('.btn-nav-forward').forEach(btn => {
    btn.style.opacity = canFwd ? '1' : '0.5';
  });
}

// ==================== FARMER PHOTO UPLOAD & MANAGEMENT ====================
let activeFarmerIdForPhoto = null;

function openDirectFarmerPhotoUpload(farmerId) {
  if (!isAdminLoggedIn()) {
    alert('🔒 โหมดดูข้อมูลทั่วไป: หากต้องการเปลี่ยนรูปภาพเกษตรกร กรุณาคลิก "เข้าสู่ระบบ" ด้านบนขวาเพื่อใส่รหัสผ่านแอดมิน');
    return;
  }
  activeFarmerIdForPhoto = farmerId;
  const fileInput = document.getElementById('directFarmerPhotoInput');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

async function handleDirectFarmerPhotoUpload(event) {
  const file = event.target.files[0];
  if (!file || !activeFarmerIdForPhoto) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    showToast('กำลังอัปโหลดรูปภาพเกษตรกร...', 'info');
    const res = await fetch(`/api/farmers/${activeFarmerIdForPhoto}/photo`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'อัปโหลดภาพไม่สำเร็จ');

    showToast('✅ เปลี่ยนภาพถ่ายเกษตรกรเรียบร้อยแล้ว!', 'success');
    await loadAllData();
  } catch (err) {
    alert('ข้อผิดพลาดในการอัปโหลดรูปภาพ: ' + err.message);
  }
}

// ==================== INTERACTIVE NAVIGATION & ORIGIN SELECTION ====================
let currentNavDestinationPond = null;
let selectedNavOrigin = null; // { lat, lng, name }
let isPickingNavOriginOnMap = false;

function openNavOriginModal(pondId) {
  const pond = allPonds.find(p => p.id == pondId);
  if (!pond) return;

  currentNavDestinationPond = pond;
  selectedNavOrigin = null;

  const modal = document.getElementById('navOriginModal');
  const destName = document.getElementById('navModalDestinationName');
  const selectDistrict = document.getElementById('navOriginDistrictSelect');
  const distResult = document.getElementById('navDistanceResult');
  const originLabel = document.getElementById('navOriginLabel');
  const calcDist = document.getElementById('navCalculatedDistance');

  if (destName) destName.textContent = `ปลายทาง: ${pond.name} (เจ้าของ: ${pond.farmer_name})`;
  if (selectDistrict) selectDistrict.value = '';

  // Default to current GPS if available
  if (currentUserLocation) {
    selectedNavOrigin = {
      lat: currentUserLocation.lat,
      lng: currentUserLocation.lng,
      name: 'พิกัด GPS ปัจจุบันของคุณ'
    };
    const meters = getDistanceMeters(selectedNavOrigin.lat, selectedNavOrigin.lng, pond.latitude, pond.longitude);
    if (distResult) distResult.classList.remove('hidden');
    if (originLabel) originLabel.textContent = `จุดเริ่มต้น: ${selectedNavOrigin.name}`;
    if (calcDist) calcDist.textContent = formatDistance(meters);
  } else {
    // Default to Mae Hong Son provincial center
    selectedNavOrigin = {
      lat: 19.3021,
      lng: 97.9654,
      name: 'อ.เมืองแม่ฮ่องสอน (ศาลากลาง / ตัวเมือง)'
    };
    const meters = getDistanceMeters(selectedNavOrigin.lat, selectedNavOrigin.lng, pond.latitude, pond.longitude);
    if (distResult) distResult.classList.remove('hidden');
    if (originLabel) originLabel.textContent = `จุดเริ่มต้น: ${selectedNavOrigin.name}`;
    if (calcDist) calcDist.textContent = formatDistance(meters);
    if (selectDistrict) selectDistrict.value = '19.3021,97.9654';
  }

  if (modal) modal.classList.remove('hidden');
}

function closeNavOriginModal() {
  const modal = document.getElementById('navOriginModal');
  if (modal) modal.classList.add('hidden');
}

function selectOriginCurrentGPS() {
  if (!navigator.geolocation) {
    alert('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการระบุพิกัด GPS');
    return;
  }

  showToast('กำลังจับพิกัด GPS ปัจจุบันของคุณ...', 'info');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      currentUserLocation = { lat, lng };

      selectedNavOrigin = { lat, lng, name: 'พิกัด GPS ปัจจุบันของคุณ' };
      const selectDistrict = document.getElementById('navOriginDistrictSelect');
      if (selectDistrict) selectDistrict.value = '';

      updateNavModalDistanceDisplay();
      showToast('✅ จับพิกัด GPS ของคุณสำเร็จแล้ว!', 'success');
    },
    (err) => {
      alert('ไม่สามารถอ่านพิกัด GPS ได้: ' + err.message + '\n\nคุณสามารถเลือกจุดเริ่มต้นจากอำเภอในแม่ฮ่องสอน หรือคลิกจิ้มบนแผนที่แทนได้ครับ');
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function selectOriginDistrict() {
  const select = document.getElementById('navOriginDistrictSelect');
  if (!select || !select.value) return;

  const [latStr, lngStr] = select.value.split(',');
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  const optText = select.options[select.selectedIndex].text;

  selectedNavOrigin = { lat, lng, name: optText };
  updateNavModalDistanceDisplay();
}

function selectOriginPickOnMap() {
  closeNavOriginModal();
  isPickingNavOriginOnMap = true;
  showToast('👉 คลิกบนแผนที่ตรงจุดที่คุณต้องการตั้งเป็น "จุดเริ่มต้น"', 'info');
  const mapElem = document.getElementById('map');
  if (mapElem) mapElem.style.cursor = 'crosshair';
}

function updateNavModalDistanceDisplay() {
  if (!selectedNavOrigin || !currentNavDestinationPond) return;

  const distResult = document.getElementById('navDistanceResult');
  const originLabel = document.getElementById('navOriginLabel');
  const calcDist = document.getElementById('navCalculatedDistance');

  const meters = getDistanceMeters(
    selectedNavOrigin.lat,
    selectedNavOrigin.lng,
    currentNavDestinationPond.latitude,
    currentNavDestinationPond.longitude
  );

  if (distResult) distResult.classList.remove('hidden');
  if (originLabel) originLabel.textContent = `จุดเริ่มต้น: ${selectedNavOrigin.name}`;
  if (calcDist) calcDist.textContent = formatDistance(meters);
}

function applyShowRouteOnMap() {
  if (!currentNavDestinationPond || !selectedNavOrigin) {
    alert('กรุณาเลือกจุดเริ่มต้นก่อนครับ');
    return;
  }

  closeNavOriginModal();
  drawRouteBetweenPoints(selectedNavOrigin, currentNavDestinationPond);
}

function launchGoogleNavigation() {
  if (!currentNavDestinationPond) return;

  let navUrl = '';
  if (selectedNavOrigin) {
    navUrl = `https://www.google.com/maps/dir/?api=1&origin=${selectedNavOrigin.lat},${selectedNavOrigin.lng}&destination=${currentNavDestinationPond.latitude},${currentNavDestinationPond.longitude}&travelmode=driving`;
  } else if (currentUserLocation) {
    navUrl = `https://www.google.com/maps/dir/?api=1&origin=${currentUserLocation.lat},${currentUserLocation.lng}&destination=${currentNavDestinationPond.latitude},${currentNavDestinationPond.longitude}&travelmode=driving`;
  } else {
    navUrl = `https://www.google.com/maps/dir/?api=1&origin=18.15944,97.93361&destination=${currentNavDestinationPond.latitude},${currentNavDestinationPond.longitude}&travelmode=driving`;
  }

  window.open(navUrl, '_blank');
}

function drawRouteBetweenPoints(origin, destination) {
  if (!origin || !destination || !map) return;

  if (currentRouteLine) {
    map.removeLayer(currentRouteLine);
    currentRouteLine = null;
  }

  const startPt = [origin.lat, origin.lng];
  const endPt = [destination.latitude, destination.longitude];
  const distMeters = getDistanceMeters(startPt[0], startPt[1], endPt[0], endPt[1]);
  const distText = formatDistance(distMeters);

  // Draw vibrant dashed route line
  currentRouteLine = L.polyline([startPt, endPt], {
    color: '#0284c7',
    weight: 5,
    opacity: 0.9,
    dashArray: '10, 8',
    lineCap: 'round'
  }).addTo(map);

  currentRouteLine.bindTooltip(`
    <div class="text-xs p-1">
      <div class="font-bold text-sky-300 flex items-center gap-1"><i class="fa-solid fa-route"></i> เส้นทาง: ${origin.name} ➔ ${destination.name}</div>
      <div>ระยะทางโดยประมาณ: <strong class="text-amber-300 text-sm">${distText}</strong></div>
      <div class="text-[10px] text-slate-300 mt-0.5">คลิกเพื่อเปิดระบบนำทางเลี้ยวต่อเลี้ยว Google Maps</div>
    </div>
  `, {
    sticky: true,
    className: 'bg-slate-900 text-white text-xs px-3 py-2 rounded-xl shadow-xl border border-sky-400'
  });

  currentRouteLine.on('click', () => {
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.latitude},${destination.longitude}&travelmode=driving`, '_blank');
  });

  // Fit bounds to show both points
  map.fitBounds([startPt, endPt], { padding: [60, 60], maxZoom: 15 });

  // Update banner
  const banner = document.getElementById('gpsNavBanner');
  const statusText = document.getElementById('gpsStatusText');
  if (banner) banner.classList.remove('hidden');
  if (statusText) {
    statusText.innerHTML = `🚗 เส้นทางจาก <strong>${origin.name}</strong> ➔ <strong>${destination.name}</strong> • ระยะห่าง <strong>${distText}</strong>`;
  }
}

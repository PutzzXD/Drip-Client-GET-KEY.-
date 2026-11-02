// ==========================================
// KONFIGURASI DATABASE (URL FIREBASE)
// ==========================================
const FB_BASE = "https://akun-dript-default-rtdb.asia-southeast1.firebasedatabase.app";
const FB_KEYS = `${FB_BASE}/keys.json`; // Path database key
const FB_USERS = `${FB_BASE}/users.json`; // Path database user
const FB_NOTIF = `${FB_BASE}/global_notif.json`; // Path notifikasi global

// ==========================================
// KONFIGURASI HARGA & SYSTEM
// ==========================================
const KEY_PRICES = { "1 JAM": 3000, "1 HARI": 5000, "2 HARI": 10000, "3 HARI": 15000 };
const BUY_PRICES = { "4 HARI": 3000, "5 HARI": 4000, "7 HARI": 5000, "30 HARI": 7000, "PERMANEN": 100000 };
const WA_NUM = "6288976255131";
const INIT_COINS = 5000;
const DAILY_COINS = 5000;

// ==========================================
// STATE GLOBAL
// ==========================================
let curUser = null;
let curCoins = 0;
let curLastClaim = "";
let localKeys = [];
let pendingAction = null;
let lastNotifId = null;

// ==========================================
// UI HELPERS
// ==========================================
const $ = (id) => document.getElementById(id);

function showCard(id) {
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    $(id).classList.add('active');
}

function showToast(msg, isErr = false) {
    const t = $('toastBox');
    t.textContent = msg;
    t.style.borderColor = isErr ? 'var(--danger)' : 'var(--border)';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function showMsg(id, msg, isErr = true) {
    const el = $(id);
    el.textContent = msg;
    el.className = 'msg ' + (isErr ? 'error' : 'success');
}

function showLoading(show) {
    $('loadingScreen').style.display = show ? 'flex' : 'none';
    if (!show) $('loadingScreen').classList.add('fade-out');
    else $('loadingScreen').classList.remove('fade-out');
}

// Toggle Password Visibility
document.querySelectorAll('.toggle-pass').forEach(el => {
    el.addEventListener('click', () => {
        const target = $(el.dataset.target);
        if (target.type === 'password') {
            target.type = 'text';
            el.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            target.type = 'password';
            el.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });
});

// Tab Switching
$('tabLogin').onclick = () => {
    $('tabLogin').classList.add('active'); $('tabRegister').classList.remove('active');
    $('formLogin').style.display = 'block'; $('formRegister').style.display = 'none';
    showMsg('authMsg', '');
};
$('tabRegister').onclick = () => {
    $('tabRegister').classList.add('active'); $('tabLogin').classList.remove('active');
    $('formRegister').style.display = 'block'; $('formLogin').style.display = 'none';
    showMsg('authMsg', '');
};

// ==========================================
// SISTEM NOTIFIKASI (GLOBAL & PER-AKUN)
// ==========================================
function playNotifSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // Nada A5
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // Naik ke A6
        
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
    } catch(e) {}
}

function showPopup(title, msg, isGlobal = false) {
    const wrapper = $('notifContainer');
    const popup = document.createElement('div');
    popup.className = 'notif-popup';
    popup.innerHTML = `
        <div class="notif-icon" style="color: ${isGlobal ? 'var(--accent)' : 'var(--success)'};">
            <i class="fas ${isGlobal ? 'fa-bullhorn' : 'fa-envelope'}"></i>
        </div>
        <div class="notif-content">
            <div class="notif-title">${title}</div>
            <div class="notif-msg">${msg}</div>
        </div>
    `;
    wrapper.appendChild(popup);
    
    setTimeout(() => popup.classList.add('show'), 100);
    playNotifSound();

    setTimeout(() => {
        popup.classList.remove('show');
        setTimeout(() => popup.remove(), 300);
    }, 8000);
}

async function checkNotifs() {
    try {
        // 1. Cek Notifikasi Global
        const resGlobal = await fetch(FB_NOTIF);
        const globalNotif = await resGlobal.json();
        
        if (globalNotif && globalNotif.active) {
            if (lastNotifId !== globalNotif.id) {
                lastNotifId = globalNotif.id;
                showPopup(globalNotif.title || 'PENGUMUMAN', globalNotif.message, true);
                
                const banner = $('authBanner');
                banner.innerHTML = `<i class="fas fa-bullhorn"></i> <b>${globalNotif.title}:</b> ${globalNotif.message}`;
                banner.classList.add('show');
            }
        }

        // 2. Cek Notifikasi Per-Akun (Koin nambah dari Admin)
        if (curUser) {
            const resUser = await fetch(`${FB_BASE}/users/${curUser}.json`);
            const userData = await resUser.json();
            
            if (userData && typeof userData.coins === 'number' && userData.coins !== curCoins) {
                const diff = userData.coins - curCoins;
                curCoins = userData.coins;
                $('sessionCoin').textContent = curCoins.toLocaleString('id-ID');
                
                if (diff > 0) {
                    showPopup('Koin Ditambahkan', `Admin menambahkan ${diff.toLocaleString('id-ID')} koin ke akun kamu!`, false);
                }
            }
        }
    } catch (e) { }
}

// Jalanin cek notif tiap 5 detik
setInterval(checkNotifs, 5000);

// ==========================================
// SISTEM DATABASE (FIREBASE)
// ==========================================
async function fetchUsers() {
    try {
        const res = await fetch(FB_USERS);
        const data = await res.json();
        return data || {};
    } catch (e) { return {}; }
}

async function saveUser(username, userData) {
    await fetch(`${FB_BASE}/users/${username}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
    });
}

async function fetchKeys() {
    try {
        const res = await fetch(FB_KEYS);
        const data = await res.json();
        if (!data) return [];
        return Object.values(data);
    } catch (e) { return []; }
}

async function saveKeyDB(keyObj) {
    const id = "key_" + Date.now() + Math.floor(Math.random()*1000);
    await fetch(`${FB_BASE}/keys/${id}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(keyObj)
    });
}

// ==========================================
// AUTH LOGIC
// ==========================================
function cleanUser(str) { return str.trim().toLowerCase().replace(/[^a-z0-9]/g, ''); }

$('btnRegister').onclick = async () => {
    const u = $('regUser').value;
    const p = $('regPass').value;
    const cp = $('regPassConfirm').value;

    if (!u || !p) return showMsg('authMsg', 'Isi semua kolom!');
    if (u.length < 3) return showMsg('authMsg', 'Username minimal 3 huruf!');
    if (p.length < 4) return showMsg('authMsg', 'Password minimal 4 karakter!');
    if (p !== cp) return showMsg('authMsg', 'Konfirmasi password salah!');

    const uname = cleanUser(u);
    showLoading(true);
    const users = await fetchUsers();
    
    if (users[uname]) {
        showLoading(false);
        return showMsg('authMsg', 'Username sudah dipakai!');
    }

    const newUser = { 
        username: u, 
        password: p, 
        coins: INIT_COINS, 
        lastClaim: new Date().toDateString() 
    };
    await saveUser(uname, newUser);
    
    // Notifikasi Per-Akun saat berhasil daftar
    setTimeout(() => {
        showPopup('Akun Dibuat', `Selamat datang ${u}! Kamu dapat ${INIT_COINS} koin gratis.`, false);
    }, 500);

    showLoading(false);
    showMsg('authMsg', 'Registrasi berhasil! Silakan login.', false);
    $('tabLogin').click();
    $('loginUser').value = u;
};

$('btnLogin').onclick = async () => {
    const u = $('loginUser').value;
    const p = $('loginPass').value;
    if (!u || !p) return showMsg('authMsg', 'Isi username & password!');

    const uname = cleanUser(u);
    showLoading(true);
    const users = await fetchUsers();
    const data = users[uname];
    showLoading(false);

    if (!data) return showMsg('authMsg', 'Akun tidak ditemukan!');
    if (data.password !== p) return showMsg('authMsg', 'Password salah!');

    curUser = uname;
    curCoins = data.coins || 0;
    curLastClaim = data.lastClaim || "";
    
    $('sessionUser').textContent = data.username;
    $('sessionCoin').textContent = curCoins.toLocaleString('id-ID');
    
    showCard('dashCard');
    loadLocalKeys();
    checkDaily();
    checkNotifs(); // Cek notif langsung pas login
};

$('btnLogout').onclick = () => {
    curUser = null; curCoins = 0;
    showCard('authCard');
    $('loginPass').value = '';
};

// ==========================================
// DASHBOARD LOGIC
// ==========================================
async function checkDaily() {
    if (!curUser) return;
    const today = new Date().toDateString();
    if (curLastClaim === today) return;

    curCoins += DAILY_COINS;
    curLastClaim = today;
    $('sessionCoin').textContent = curCoins.toLocaleString('id-ID');
    showToast(`Bonus harian +${DAILY_COINS} koin!`);
    
    const users = await fetchUsers();
    if (users[curUser]) {
        users[curUser].coins = curCoins;
        users[curUser].lastClaim = today;
        await saveUser(curUser, users[curUser]);
    }
}

function loadLocalKeys() {
    const saved = localStorage.getItem('drip_keys');
    if (saved) {
        try {
            localKeys = JSON.parse(saved);
            const now = Date.now();
            localKeys = localKeys.filter(k => k.expiry === 0 || k.expiry > now);
        } catch(e) { localKeys = []; }
    }
    renderHistory();
}

function saveLocalKeys() {
    localStorage.setItem('drip_keys', JSON.stringify(localKeys));
    renderHistory();
}

function renderHistory() {
    const list = $('historyList');
    list.innerHTML = '';
    $('historyCount').textContent = `(${localKeys.length})`;
    const now = Date.now();

    localKeys.forEach(k => {
        const isExp = k.expiry > 0 && k.expiry < now;
        const div = document.createElement('div');
        div.className = `key-item ${isExp ? 'expired' : ''}`;
        
        let status = "PERMANEN";
        if (k.expiry > 0) {
            if (isExp) status = "EXPIRED";
            else {
                const sisa = k.expiry - now;
                const h = Math.floor(sisa / (1000*3600));
                const m = Math.floor((sisa % (1000*3600)) / (1000*60));
                status = `${h}j ${m}m`;
            }
        }

        div.innerHTML = `
            <div class="key-details">
                <div class="key-code">${k.key}</div>
                <div class="key-meta">
                    <span>${k.type}</span>
                    <span class="key-badge ${isExp?'expired':''}">${status}</span>
                </div>
            </div>
            <div class="key-actions">
                <button class="btn-icon" onclick="copyTxt('${k.key}')"><i class="fas fa-copy"></i></button>
                <button class="btn-icon delete" onclick="delKey('${k.key}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
        list.appendChild(div);
    });
}

window.copyTxt = (txt) => {
    navigator.clipboard.writeText(txt).then(() => showToast('Berhasil disalin!'));
};

window.delKey = (keyStr) => {
    localKeys = localKeys.filter(k => k.key !== keyStr);
    saveLocalKeys();
};

$('btnSync').onclick = async () => {
    showLoading(true);
    const dbK = await fetchKeys();
    const dbKeyStrings = dbK.map(k => k.key);
    localKeys = localKeys.filter(k => dbKeyStrings.includes(k.key));
    saveLocalKeys();
    showLoading(false);
    showToast('Database disinkronkan.');
};

// ==========================================
// KEY GENERATOR LOGIC
// ==========================================
$('btnGenerate').onclick = () => {
    const type = $('keyDuration').value;
    
    if (BUY_PRICES[type]) {
        const text = encodeURIComponent(`Halo min, saya mau beli Key *${type}* seharga *Rp ${BUY_PRICES[type]}*`);
        window.open(`https://wa.me/${WA_NUM}?text=${text}`, '_blank');
        return;
    }

    const price = KEY_PRICES[type];
    if (curCoins < price) return showToast(`Koin tidak cukup! Butuh ${price}`, true);

    const now = Date.now();
    const active = localKeys.find(k => k.type === type && (k.expiry === 0 || k.expiry > now));
    if (active) {
        $('warnText').textContent = `Key ${type} kamu masih aktif. Tunggu expired untuk generate baru.`;
        $('modalWarn').classList.add('active');
        return;
    }

    pendingAction = async () => {
        showLoading(true);
        curCoins -= price;
        $('sessionCoin').textContent = curCoins.toLocaleString('id-ID');
        
        const users = await fetchUsers();
        users[curUser].coins = curCoins;
        await saveUser(curUser, users[curUser]);

        const custom = $('customKey').value.trim();
        const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
        const finalKey = custom || `DRIP-${rand}-${Date.now().toString().slice(-4)}`;
        
        let expTime = 0;
        if (type === "1 JAM") expTime = now + (3600 * 1000);
        else if (type === "1 HARI") expTime = now + (86400 * 1000);
        else if (type === "2 HARI") expTime = now + (172800 * 1000);
        else if (type === "3 HARI") expTime = now + (259200 * 1000);

        await saveKeyDB({
            key: finalKey,
            type: type,
            expiry_timestamp: expTime,
            owner: curUser,
            status: "aktif"
        });

        localKeys.push({ key: finalKey, type: type, expiry: expTime });
        saveLocalKeys();
        
        $('resultKey').value = finalKey;
        showLoading(false);
        showToast('Generate Berhasil!');
    };

    if (type === "3 HARI") {
        $('modalPass').classList.add('active');
        $('passMsg').textContent = '';
        $('inputSysPass').value = '';
    } else {
        pendingAction();
    }
};

$('btnSubmitPass').onclick = () => {
    const p = $('inputSysPass').value;
    if (p === "putzzdev") {
        $('modalPass').classList.remove('active');
        if (pendingAction) pendingAction();
    } else {
        $('passMsg').textContent = "Password Sistem Salah!";
    }
};

$('btnCancelPass').onclick = () => {
    $('modalPass').classList.remove('active');
    pendingAction = null;
};

$('btnCloseWarn').onclick = () => $('modalWarn').classList.remove('active');
$('btnCopyKey').onclick = () => {
    const k = $('resultKey').value;
    if (k) copyTxt(k);
};

// Init Awal
showLoading(false);
showCard('authCard');
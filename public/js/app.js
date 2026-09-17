import { 
    auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged,
    collection, doc, setDoc, deleteDoc, onSnapshot 
} from "./firebase-config.js";

let currentUser = null;
let isAdmin = false;
let allApps = [];
let adminEmails = [];
let favorites = JSON.parse(localStorage.getItem('tps_admin_favorites') || '[]');
let currentSelectedCategory = 'all';
let pendingAppUrl = '';
let pendingAppPassword = '';

document.addEventListener('DOMContentLoaded', () => {
    initAuthListener();
    initSearchAndKeybinds();
    initFirestoreRealtime();
});

// 1. 身分驗證 (限制 @tps.edu.hk)
function initAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (!user.email.endsWith('@tps.edu.hk')) {
                showToast("⚠️ 存取失敗：僅限 @tps.edu.hk 帳號登入！", "error");
                await signOut(auth);
                return;
            }
            currentUser = user;
            await checkAdminStatus(user.email);
            renderAuthUI();
        } else {
            currentUser = null;
            isAdmin = false;
            renderAuthUI();
        }
    });
}

async function checkAdminStatus(email) {
    isAdmin = adminEmails.includes(email.toLowerCase());
}

function renderAuthUI() {
    const desktop = document.getElementById('authContainerDesktop');
    const mobile = document.getElementById('authContainerMobile');

    if (currentUser) {
        const html = `
            ${isAdmin ? `<button onclick="openAdminModal()" class="px-4 py-2 rounded-xl neu-btn text-sm font-bold text-neu-blue flex items-center gap-2">⚙️ 管理員選單</button>` : ''}
            <div class="flex items-center gap-2">
                <img src="${currentUser.photoURL || 'assets/icons/default.png'}" class="w-8 h-8 rounded-full border border-gray-300">
                <span class="text-xs font-bold text-neu-dark hidden lg:inline">${currentUser.displayName || currentUser.email}</span>
            </div>
            <button onclick="handleLogout()" class="px-3 py-2 rounded-xl neu-btn text-xs font-bold text-gray-500">登出</button>
        `;
        desktop.innerHTML = html;
        mobile.innerHTML = html;
    } else {
        const html = `
            <button onclick="handleLogin()" class="px-4 py-2.5 rounded-xl neu-btn text-sm font-bold text-neu-blue flex items-center gap-2">
                Google 帳號登入
            </button>
        `;
        desktop.innerHTML = html;
        mobile.innerHTML = html;
    }
}

window.handleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } 
    catch (err) { showToast("登入失敗：" + err.message, "error"); }
};

window.handleLogout = async () => {
    await signOut(auth);
    showToast("已成功登出");
};

// 2. 資料庫即時連線
function initFirestoreRealtime() {
    onSnapshot(collection(db, "apps"), (snapshot) => {
        allApps = [];
        snapshot.forEach((doc) => allApps.push({ id: doc.id, ...doc.data() }));
        filterAndRenderApps();
        if (isAdmin) renderAdminAppList();
    });

    onSnapshot(doc(db, "settings", "announcement"), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const box = document.getElementById('announcementBox');
            const text = document.getElementById('announcementText');
            if (data.visible && data.text) {
                text.innerText = data.text;
                box.classList.remove('hidden');
            } else {
                box.classList.add('hidden');
            }
            document.getElementById('adminAnnInput').value = data.text || '';
            document.getElementById('adminAnnVisible').checked = !!data.visible;
        }
    });

    onSnapshot(doc(db, "settings", "admins"), (docSnap) => {
        if (docSnap.exists()) {
            adminEmails = (docSnap.data().emails || []).map(e => e.toLowerCase());
        } else {
            // 預設你的學校 Email 為第一個管理員 (可在此更改)
            adminEmails = ["admin@tps.edu.hk"];
            setDoc(doc(db, "settings", "admins"), { emails: adminEmails });
        }
        if (currentUser) {
            checkAdminStatus(currentUser.email);
            renderAuthUI();
        }
        renderAdminEmailList();
    });
}

// 3. 渲染 Apps 卡片
function filterAndRenderApps() {
    const keyword = document.getElementById('searchInput').value.toLowerCase().trim();

    let filtered = allApps.filter(app => {
        const matchesKey = app.title.toLowerCase().includes(keyword) || 
                           (app.desc && app.desc.toLowerCase().includes(keyword)) ||
                           (app.category && app.category.toLowerCase().includes(keyword));
        if (!matchesKey) return false;
        if (currentSelectedCategory === 'all') return true;
        if (currentSelectedCategory === 'fav') return favorites.includes(app.id);
        const cats = app.category ? app.category.split(/[,\s]+/) : [];
        return cats.includes(currentSelectedCategory);
    });

    const grid = document.getElementById('appsGrid');
    grid.innerHTML = '';

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-gray-400 font-medium">查無相關系統卡片</div>`;
        return;
    }

    filtered.forEach((app) => {
        const isFav = favorites.includes(app.id);
        const iconPath = app.iconName ? `assets/icons/${app.iconName}` : 'assets/icons/default.png';

        const card = document.createElement('div');
        card.className = `neu-card rounded-3xl p-6 relative flex flex-col justify-between cursor-pointer group ${app.isDev ? 'opacity-75' : ''}`;
        card.innerHTML = `
            <div onclick="handleAppClick('${app.id}')">
                <div class="flex items-center justify-between mb-4">
                    <img src="${iconPath}" onerror="this.src='assets/icons/default.png'" class="w-12 h-12 object-contain rounded-2xl p-1 bg-white shadow-sm">
                    <button onclick="event.stopPropagation(); toggleFavorite('${app.id}')" class="text-xl hover:scale-110 transition-transform">
                        ${isFav ? '❤️' : '🤍'}
                    </button>
                </div>
                <h3 class="font-bold text-lg text-neu-dark mb-1 group-hover:text-neu-blue transition-colors flex items-center gap-1">
                    ${app.title}
                    ${app.isProtected ? '<span class="text-xs">🔒</span>' : ''}
                </h3>
                <p class="text-xs text-gray-500 line-clamp-2 mb-4">${app.desc || '暫無描述'}</p>
            </div>
            <div class="flex items-center justify-between pt-3 border-t border-gray-200/50 text-xs font-bold text-neu-blue">
                <span>${app.isDev ? '🚧 開發中' : '進入系統 →'}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">${app.category || '通用'}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

window.handleAppClick = (appId) => {
    const app = allApps.find(a => a.id === appId);
    if (!app) return;
    if (app.isDev) { document.getElementById('devModal').classList.remove('hidden'); return; }
    if (app.isProtected) {
        pendingAppUrl = app.url;
        pendingAppPassword = app.password || '';
        document.getElementById('protectedAppTitle').innerText = `請輸入【${app.title}】的存取密碼：`;
        document.getElementById('passwordModal').classList.remove('hidden');
        return;
    }
    window.open(app.url, '_blank');
};

window.toggleFavorite = (appId) => {
    if (favorites.includes(appId)) {
        favorites = favorites.filter(id => id !== appId);
        showToast("已從常用系統移除");
    } else {
        favorites.push(appId);
        showToast("已加入常用系統", "success");
    }
    localStorage.setItem('tps_admin_favorites', JSON.stringify(favorites));
    filterAndRenderApps();
};

window.filterCategory = (cat, btn) => {
    currentSelectedCategory = cat;
    document.querySelectorAll('.category-btn').forEach(b => {
        b.classList.remove('neu-pressed', 'text-neu-blue');
        b.classList.add('neu-flat', 'text-neu-text');
    });
    btn.classList.remove('neu-flat', 'text-neu-text');
    btn.classList.add('neu-pressed', 'text-neu-blue');
    filterAndRenderApps();
};

function initSearchAndKeybinds() {
    const input = document.getElementById('searchInput');
    input.addEventListener('input', filterAndRenderApps);
    window.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== input) {
            e.preventDefault();
            input.focus();
        }
    });
}

// 4. Modal 控制與管理員邏輯
window.verifyPassword = () => {
    if (document.getElementById('appPasswordInput').value === pendingAppPassword) {
        closePasswordModal();
        window.open(pendingAppUrl, '_blank');
    } else {
        showToast("❌ 密碼不正確！", "error");
    }
};

window.closePasswordModal = () => { document.getElementById('passwordModal').classList.add('hidden'); };
window.closeDevModal = () => { document.getElementById('devModal').classList.add('hidden'); };

window.openAdminModal = () => { if (isAdmin) document.getElementById('adminModal').classList.remove('hidden'); };
window.closeAdminModal = () => { document.getElementById('adminModal').classList.add('hidden'); };

window.switchAdminTab = (tab) => {
    ['Apps', 'Ann', 'Admins'].forEach(t => {
        document.getElementById(`adminTab${t}`).classList.add('hidden');
        document.getElementById(`tabBtn${t}`).classList.replace('neu-pressed', 'neu-flat');
    });
    if (tab === 'apps') { document.getElementById('adminTabApps').classList.remove('hidden'); document.getElementById('tabBtnApps').classList.replace('neu-flat', 'neu-pressed'); }
    else if (tab === 'announcement') { document.getElementById('adminTabAnn').classList.remove('hidden'); document.getElementById('tabBtnAnn').classList.replace('neu-flat', 'neu-pressed'); }
    else if (tab === 'admins') { document.getElementById('adminTabAdmins').classList.remove('hidden'); document.getElementById('tabBtnAdmins').classList.replace('neu-flat', 'neu-pressed'); }
};

function renderAdminAppList() {
    const container = document.getElementById('adminAppList');
    container.innerHTML = '';
    allApps.forEach(app => {
        const item = document.createElement('div');
        item.className = "flex items-center justify-between p-3 rounded-xl neu-flat text-sm";
        item.innerHTML = `
            <div><span class="font-bold text-neu-dark">${app.title}</span><span class="text-xs text-gray-400 ml-2">(${app.category})</span></div>
            <div class="flex gap-2">
                <button onclick="editApp('${app.id}')" class="px-3 py-1 rounded-lg neu-btn text-xs font-bold text-neu-blue">編輯</button>
                <button onclick="deleteApp('${app.id}')" class="px-3 py-1 rounded-lg neu-btn text-xs font-bold text-red-500">刪除</button>
            </div>
        `;
        container.appendChild(item);
    });
}

window.handleSaveApp = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    const id = document.getElementById('formAppId').value || `app_${Date.now()}`;
    const appData = {
        title: document.getElementById('formTitle').value.trim(),
        desc: document.getElementById('formDesc').value.trim(),
        category: document.getElementById('formCategory').value.trim(),
        url: document.getElementById('formUrl').value.trim(),
        iconName: document.getElementById('formIconName').value.trim() || 'default.png',
        isDev: document.getElementById('formIsDev').checked,
        isProtected: document.getElementById('formIsProtected').checked,
        password: document.getElementById('formPassword').value.trim()
    };
    try {
        await setDoc(doc(db, "apps", id), appData);
        showToast("儲存成功！", "success");
        closeAppFormModal();
    } catch (err) { showToast("儲存失敗：" + err.message, "error"); }
};

window.openAppFormModal = () => {
    document.getElementById('appForm').reset();
    document.getElementById('formAppId').value = '';
    document.getElementById('appFormModal').classList.remove('hidden');
};
window.closeAppFormModal = () => { document.getElementById('appFormModal').classList.add('hidden'); };

window.editApp = (id) => {
    const app = allApps.find(a => a.id === id);
    if (!app) return;
    document.getElementById('formAppId').value = app.id;
    document.getElementById('formTitle').value = app.title;
    document.getElementById('formDesc').value = app.desc || '';
    document.getElementById('formCategory').value = app.category || '';
    document.getElementById('formUrl').value = app.url;
    document.getElementById('formIconName').value = app.iconName || '';
    document.getElementById('formIsDev').checked = !!app.isDev;
    document.getElementById('formIsProtected').checked = !!app.isProtected;
    document.getElementById('formPassword').value = app.password || '';
    document.getElementById('appFormModal').classList.remove('hidden');
};

window.deleteApp = async (id) => {
    if (confirm("確定刪除此系統嗎？")) {
        try { await deleteDoc(doc(db, "apps", id)); showToast("已刪除"); } 
        catch (err) { showToast("刪除失敗：" + err.message, "error"); }
    }
};

window.saveAnnouncement = async () => {
    const text = document.getElementById('adminAnnInput').value.trim();
    const visible = document.getElementById('adminAnnVisible').checked;
    try {
        await setDoc(doc(db, "settings", "announcement"), { text, visible });
        showToast("公告更新成功！", "success");
    } catch (err) { showToast("更新失敗：" + err.message, "error"); }
};

function renderAdminEmailList() {
    const container = document.getElementById('adminEmailList');
    container.innerHTML = '';
    adminEmails.forEach(email => {
        const item = document.createElement('div');
        item.className = "flex items-center justify-between p-3 rounded-xl neu-flat text-sm";
        item.innerHTML = `<span class="font-medium text-neu-dark">${email}</span>
        ${adminEmails.length > 1 ? `<button onclick="removeAdminEmail('${email}')" class="text-xs text-red-500 font-bold px-2 py-1 neu-btn rounded-lg">移除</button>` : ''}`;
        container.appendChild(item);
    });
}

window.addAdminEmail = async () => {
    const email = document.getElementById('newAdminEmailInput').value.trim().toLowerCase();
    if (!email || !email.endsWith('@tps.edu.hk')) { showToast("請輸入有效 @tps.edu.hk Email", "error"); return; }
    if (adminEmails.includes(email)) return;
    try {
        await setDoc(doc(db, "settings", "admins"), { emails: [...adminEmails, email] });
        document.getElementById('newAdminEmailInput').value = '';
        showToast("已新增管理員", "success");
    } catch (err) { showToast("新增失敗", "error"); }
};

window.removeAdminEmail = async (email) => {
    if (confirm(`移除 ${email}？`)) {
        try {
            await setDoc(doc(db, "settings", "admins"), { emails: adminEmails.filter(e => e !== email) });
            showToast("已移除");
        } catch (err) { showToast("移除失敗", "error"); }
    }
};

function showToast(msg, type = "info") {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.className = `fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl neu-flat text-sm font-bold transition-all duration-300 ${type === 'error' ? 'text-red-500' : type === 'success' ? 'text-green-600' : 'text-neu-blue'}`;
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 3000);
}
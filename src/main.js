import './style.css';
import { createClient } from '@supabase/supabase-js';
import { createIcons, icons } from 'lucide';

// 1. 初始化圖示
function initIcons() { createIcons({ icons }); }
document.addEventListener('DOMContentLoaded', initIcons);

// 2. Supabase 設定
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://gesvmarujxkwunikexsw.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlc3ZtYXJ1anhrd3VuaWtleHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjI2MjQsImV4cCI6MjA5NTAzODYyNH0.IrxM-wKuPfdPAnK0uLR-9S1x0HFuoVOfAuoCbCVkwh0';

let supabaseClient;
let isSupabaseConnected = false;

try {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  if (SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE') isSupabaseConnected = true;
} catch(e) {
  console.warn("Supabase 未設定，使用模擬數據。");
}

const SYSTEM_FILTERS = [
  { id: 'normal', name: 'Original / 原圖', css: 'none', color: 'border-zinc-600 text-zinc-400' },
  { id: 'hk90s',  name: 'HK 90s / 港片',  css: 'contrast(1.25) saturate(1.1) sepia(0.3) hue-rotate(-15deg) brightness(0.9)', color: 'border-rose-500 text-rose-500' },
  { id: 'street', name: 'Grit Street / 街頭', css: 'contrast(1.35) saturate(0.65) brightness(0.85)', color: 'border-cyan-500 text-cyan-500' },
  { id: 'fuji',   name: 'Fuji / 富士', css: 'contrast(0.95) saturate(1.15) sepia(0.15) hue-rotate(5deg) brightness(1.05)', color: 'border-emerald-500 text-emerald-500' }
];

let currentImageDataUrl = null;
let currentFilter = SYSTEM_FILTERS[0];
let allPosts = [];
let loggedInUser = null;

window.onload = async () => {
  renderSystemFilters();
  setupPasteListener();
  
  if (isSupabaseConnected) {
    await checkUserSession();
    await fetchCommunityPosts();
  } else {
    renderMockFeed();
  }
};

/* ================= 全域事件監聽 ================= */
function setupPasteListener() {
  window.addEventListener('paste', (event) => {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
    
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    for (let index in items) {
      const item = items[index];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (document.getElementById('section-studio').classList.contains('hidden')) {
          switchTab('studio');
        }
        loadImageFile(file);
        break;
      }
    }
  });
}

/* ================= 🚀 Auth 會員系統 ================= */
let isSignUpMode = false;

window.openAuthModal = function() {
  document.getElementById('auth-modal').classList.remove('hidden');
  document.getElementById('auth-modal').classList.add('flex');
};

window.closeAuthModal = function() {
  document.getElementById('auth-modal').classList.add('hidden');
  document.getElementById('auth-modal').classList.remove('flex');
};

window.toggleAuthMode = function() {
  isSignUpMode = !isSignUpMode;
  document.getElementById('auth-title').innerText = isSignUpMode ? 'Create Account' : 'Login to Visionary';
  document.getElementById('auth-submit-btn').innerText = isSignUpMode ? 'Sign Up' : 'Login';
  document.getElementById('auth-toggle-text').innerText = isSignUpMode ? 'Already have an account? Login' : "Don't have an account? Sign Up";
};

window.handleAuthSubmit = async function(event) {
  event.preventDefault();
  if (!isSupabaseConnected) return showToast('請先填入 Supabase API Keys！', 'error');

  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const btn = document.getElementById('auth-submit-btn');
  
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Processing...';
  initIcons();

  try {
    if (isSignUpMode) {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      
      // 如果 Supabase 自動登入了，先登出，確保使用者必須手動點擊登入
      await supabaseClient.auth.signOut();
      
      showToast('✅ 註冊成功！已自動為您帶入帳密，請點擊 Login 進行登入', 'success');
      
      // 切換回登入畫面
      if (isSignUpMode) toggleAuthMode();
      
      // 確保帳號密碼欄位保留使用者剛剛輸入的資料
      document.getElementById('auth-email').value = email;
      document.getElementById('auth-password').value = password;
      
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      showToast('✅ 登入成功！', 'success');
      closeAuthModal();
      document.getElementById('auth-form').reset();
    }
  } catch (error) {
    showToast('錯誤: ' + error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = isSignUpMode ? 'Sign Up' : 'Login';
    initIcons();
  }
};

async function checkUserSession() {
  if (!supabaseClient) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  updateAuthUI(session?.user || null);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateAuthUI(session?.user || null);
  });
}

function updateAuthUI(user) {
  loggedInUser = user;
  const loginBtn = document.getElementById('login-btn');
  const userProfile = document.getElementById('user-profile');
  const emailDisplay = document.getElementById('user-email-display');

  if (user) {
    loginBtn.classList.add('hidden');
    userProfile.classList.remove('hidden');
    userProfile.classList.add('flex');
    emailDisplay.innerText = user.email.split('@')[0];
  } else {
    loginBtn.classList.remove('hidden');
    userProfile.classList.add('hidden');
    userProfile.classList.remove('flex');
    emailDisplay.innerText = '';
  }
}

window.handleLogout = async function() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  showToast('👋 已成功登出', 'success');
};

/* ================= 拖曳與檔案上傳邏輯 ================= */
window.handleDrop = function(event) {
  event.preventDefault();
  document.getElementById('upload-box').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadImageFile(file);
};

window.handleFileUpload = function(event) {
  const file = event.target.files[0];
  if (file) loadImageFile(file);
};

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    currentImageDataUrl = e.target.result;
    document.getElementById('original-img').src = currentImageDataUrl;
    document.getElementById('filtered-img').src = currentImageDataUrl;
    
    document.getElementById('upload-box').classList.add('hidden');
    document.getElementById('preview-box').classList.remove('hidden');
    document.getElementById('preview-box').classList.add('flex');
    document.getElementById('filter-controls').classList.remove('opacity-40', 'pointer-events-none');
    
    document.getElementById('slider').value = 50;
    updateSlider();
    applyFilter(SYSTEM_FILTERS[0]);
    showToast('照片載入成功！', 'success');
  };
  reader.readAsDataURL(file);
}

/* ================= 圖片下載邏輯 ================= */
window.downloadImage = function() {
  if (!currentImageDataUrl) return;
  const canvas = document.createElement('canvas');
  const img = new Image();
  img.onload = () => {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (currentFilter.css && currentFilter.css !== 'none') ctx.filter = currentFilter.css;
    ctx.drawImage(img, 0, 0);
    const a = document.createElement('a');
    a.download = `visionary_${currentFilter.name.replace(/[^a-z0-9]/gi,'_').toLowerCase()}_${Date.now()}.jpg`;
    a.href = canvas.toDataURL('image/jpeg', 0.95);
    a.click();
    showToast('圖片下載成功！', 'success');
  };
  img.src = currentImageDataUrl;
};

/* ================= 搜尋與社群牆邏輯 ================= */
window.filterFeed = function() {
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  document.getElementById('clear-search-btn').classList.toggle('hidden', q === '');
  if (q === '') { renderFeedUI(allPosts); return; }
  
  const filtered = allPosts.filter(p => p.preset_name.toLowerCase().includes(q) || p.author_ig.toLowerCase().includes(q));
  if (filtered.length === 0) {
    document.getElementById('community-feed').innerHTML = '';
    document.getElementById('no-results').classList.remove('hidden');
  } else {
    document.getElementById('no-results').classList.add('hidden');
    renderFeedUI(filtered);
  }
};

window.clearSearch = function() {
  document.getElementById('search-input').value = '';
  document.getElementById('clear-search-btn').classList.add('hidden');
  document.getElementById('no-results').classList.add('hidden');
  renderFeedUI(allPosts);
};

/* ================= Toast 通知系統 ================= */
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const icon  = document.getElementById('toast-icon');
  const text  = document.getElementById('toast-msg');

  const cfg = {
    success: { icon: 'check-circle',    color: 'text-cyan-400' },
    error:   { icon: 'alert-circle',    color: 'text-rose-400' },
    warn:    { icon: 'alert-triangle',  color: 'text-amber-400' },
  };
  const c = cfg[type] || cfg.success;
  text.textContent = msg;
  icon.setAttribute('data-lucide', c.icon);
  icon.className = `w-5 h-5 flex-shrink-0 ${c.color}`;
  initIcons();

  toast.classList.remove('translate-y-16', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add('translate-y-16', 'opacity-0');
    toast.classList.remove('translate-y-0', 'opacity-100');
  }, 3000);
}

/* ================= Supabase 發布邏輯 ================= */
async function fetchCommunityPosts() {
  renderSkeletons();
  const { data, error } = await supabaseClient.from('community_posts').select('*').limit(50);
  
  if (error) {
    if (error.code === '42501') showToast('資料庫權限錯誤 (42501)，切換為模擬資料', 'warn');
    renderMockFeed();
    return;
  }
  
  if (!data || data.length === 0) {
    renderMockFeed();
    return;
  }

  allPosts = data.reverse();
  renderFeedUI(allPosts);
}

window.openShareModal = function() { 
  if (!loggedInUser) {
    showToast('發布濾鏡前，請先登入或註冊會員！', 'warn');
    openAuthModal();
    return;
  }
  document.getElementById('share-modal').classList.remove('hidden'); 
  document.getElementById('share-modal').classList.add('flex'); 
};

window.closeShareModal = function() { 
  document.getElementById('share-modal').classList.add('hidden'); 
  document.getElementById('share-modal').classList.remove('flex'); 
};

window.publishToSupabase = async function(event) {
  event.preventDefault();
  if (!isSupabaseConnected) return showToast('請先設定 Supabase 金鑰！', 'error');

  const name = document.getElementById('share-name').value;
  const ig   = document.getElementById('share-ig').value;
  const submitBtn = document.getElementById('submit-btn');
  
  submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Uploading...';
  submitBtn.disabled = true;
  initIcons();

  try {
    const response  = await fetch(currentImageDataUrl);
    const blob      = await response.blob();
    const fileName  = `preset_${Date.now()}.jpg`;

    const { error: uploadError } = await supabaseClient.storage.from('preview_images').upload(fileName, blob, { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseClient.storage.from('preview_images').getPublicUrl(fileName);

    const { error: dbError } = await supabaseClient.from('community_posts').insert([{
      preset_name: name, author_ig: ig.replace('@', ''),
      filter_css: currentFilter.css, preview_url: urlData.publicUrl
    }]);
    if (dbError) throw dbError;

    closeShareModal();
    showToast('🎉 發布成功！您的專屬調色已上線。', 'success');
    document.getElementById('share-form').reset();
    
    switchTab('explore');
    await fetchCommunityPosts();
  } catch (error) {
    showToast('發布失敗：' + error.message, 'error');
  } finally {
    submitBtn.innerHTML = 'Publish to Database';
    submitBtn.disabled = false;
    initIcons();
  }
};

/* ================= 介面渲染與控制 ================= */
function renderSkeletons() {
  document.getElementById('no-results').classList.add('hidden');
  document.getElementById('community-feed').innerHTML = Array(6).fill('').map(() => `
    <div class="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 animate-pulse">
      <div class="aspect-[4/5] bg-zinc-800/50"></div>
      <div class="p-5">
        <div class="h-6 bg-zinc-800 rounded w-3/4 mb-3"></div>
        <div class="h-4 bg-zinc-800/80 rounded w-1/2 mb-5"></div>
        <div class="flex gap-2">
           <div class="h-10 bg-zinc-800 rounded flex-1"></div>
           <div class="h-10 w-12 bg-zinc-800 rounded"></div>
        </div>
      </div>
    </div>
  `).join('');
}

function renderMockFeed() {
  const base = import.meta.env.BASE_URL;
  allPosts = [
    { preset_name: 'Midnight Neon', author_ig: 'cyber_shooter_tw', filter_css: 'contrast(1.4) saturate(1.8) hue-rotate(20deg) brightness(0.85)', preview_url: base + 'images/midnight_neon.png' },
    { preset_name: 'Wong Kar-wai Vibes', author_ig: 'film.diary.hk', filter_css: 'contrast(1.1) saturate(1.2) sepia(0.4) hue-rotate(-25deg) brightness(0.9)', preview_url: base + 'images/wong_kar_wai.png' },
    { preset_name: 'Sakura Dream', author_ig: 'photo.tokyo', filter_css: 'contrast(0.9) saturate(1.4) hue-rotate(10deg) brightness(1.1)', preview_url: base + 'images/sakura_dream.png' },
    { preset_name: 'Golden Hour', author_ig: 'sunset_lover', filter_css: 'contrast(1.05) saturate(1.3) sepia(0.2) hue-rotate(-10deg) brightness(1.05)', preview_url: base + 'images/golden_hour.png' }
  ];
  renderFeedUI(allPosts);
}

function renderFeedUI(posts) {
  document.getElementById('no-results').classList.add('hidden');
  document.getElementById('community-feed').innerHTML = posts.map(post => `
    <div class="group relative bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors">
      <div class="aspect-[4/5] relative overflow-hidden bg-zinc-950">
        <img src="${post.preview_url}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" style="filter: ${post.filter_css}" loading="lazy">
        <div class="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent opacity-80"></div>
        <div class="absolute bottom-0 left-0 right-0 p-5">
          <h3 class="text-xl font-bold mb-1">${post.preset_name}</h3>
          <p class="text-zinc-400 text-sm flex items-center gap-1.5 mb-4 hover:text-white transition-colors">
            <i data-lucide="instagram" class="w-3.5 h-3.5"></i> ${post.author_ig}
          </p>
          <div class="flex gap-2">
            <button onclick="tryCommunityPreset('${post.filter_css}', '${post.preset_name}')" class="flex-1 bg-white text-black py-2.5 rounded-lg font-bold text-sm hover:bg-rose-400 hover:text-white transition-colors">Try Preset</button>
            <a href="https://www.instagram.com/dls.film?igsh=MXU2NGoweG5uc3czeA%3D%3D&utm_source=qr" target="_blank" class="px-4 py-2.5 bg-zinc-800 rounded-lg flex items-center justify-center hover:bg-rose-600 transition-colors">
              <i data-lucide="instagram" class="w-5 h-5"></i>
            </a>
          </div>
        </div>
      </div>
    </div>
  `).join('');
  initIcons();
}

window.switchTab = function(tabName) {
  ['home', 'studio', 'explore'].forEach(tab => {
    const el = document.getElementById(`section-${tab}`);
    el.classList.add('hidden');
    el.classList.remove('flex');
    const tabBtn = document.getElementById(`tab-${tab}`);
    tabBtn.className = `tab-btn flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 rounded-full text-sm font-bold text-zinc-500 hover:text-zinc-300 transition-all`;
    tabBtn.setAttribute('aria-selected', 'false');
  });
  const targetEl = document.getElementById(`section-${tabName}`);
  targetEl.classList.remove('hidden');
  targetEl.classList.add('flex');
  
  const targetBtn = document.getElementById(`tab-${tabName}`);
  let colorClass = tabName === 'studio' ? 'bg-zinc-800 text-cyan-400 shadow-lg' : (tabName === 'explore' ? 'bg-zinc-800 text-rose-400 shadow-lg' : 'bg-zinc-800 text-white shadow-lg');
  targetBtn.className = `tab-btn flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 rounded-full text-sm font-bold transition-all ${colorClass}`;
  targetBtn.setAttribute('aria-selected', 'true');
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.updateSlider = function() {
  const val = document.getElementById('slider').value;
  document.getElementById('original-img').style.clipPath = `inset(0 ${100 - val}% 0 0)`;
  document.getElementById('slider-line').style.left = `${val}%`;
};

function renderSystemFilters() {
  document.getElementById('system-filters-container').innerHTML = SYSTEM_FILTERS.map(filter => `
    <button onclick="applyFilter('${filter.id}')" id="btn-filter-${filter.id}" class="filter-option relative rounded-xl bg-zinc-900 border-2 border-zinc-800 hover:border-zinc-500 py-5 font-bold text-sm text-zinc-400 transition-all">${filter.name}</button>
  `).join('');
}

window.applyFilter = function(idOrObj) {
  currentFilter = typeof idOrObj === 'string' ? SYSTEM_FILTERS.find(f => f.id === idOrObj) : idOrObj;
  document.getElementById('filtered-img').style.filter = currentFilter.css;
  
  document.getElementById('share-btn').disabled = (currentFilter.id === 'normal');
  
  document.querySelectorAll('.filter-option').forEach(btn => btn.className = "filter-option relative rounded-xl bg-zinc-900 border-2 border-zinc-800 hover:border-zinc-500 py-5 font-bold text-sm text-zinc-400 transition-all");
  const activeBtn = document.getElementById(`btn-filter-${currentFilter.id}`);
  if (activeBtn) activeBtn.className = `filter-option relative rounded-xl bg-zinc-800 border-2 py-5 font-bold text-sm transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)] ${currentFilter.color}`;
};

window.tryCommunityPreset = function(cssStr, name) {
  const customFilter = { id: 'custom', name: name, css: cssStr, color: 'border-purple-500 text-purple-500' };
  switchTab('studio');
  if (currentImageDataUrl) {
    applyFilter(customFilter);
    showToast(`已套用「${name}」配方`, 'success');
  } else { 
    showToast(`已選擇「${name}」，請上傳照片來測試效果！`, 'warn'); 
    currentFilter = customFilter; 
  }
};

window.clearImage = function() {
  currentImageDataUrl = null;
  document.getElementById('file-input').value = "";
  document.getElementById('upload-box').classList.remove('hidden');
  document.getElementById('preview-box').classList.add('hidden');
  document.getElementById('preview-box').classList.remove('flex');
  document.getElementById('filter-controls').classList.add('opacity-40', 'pointer-events-none');
  applyFilter(SYSTEM_FILTERS[0]);
};

import './style.css';
import { createClient } from '@supabase/supabase-js';
import { createIcons, icons } from 'lucide';
import { WebGLLutFilter } from './webgl-lut.js';
import { parseCubeToHaldCLUT } from './cube-parser.js';
import exifr from 'exifr';
import imageCompression from 'browser-image-compression';

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
let currentImageObj = null;
let webglFilter = null;
let currentLutFile = null;
let currentFilter = SYSTEM_FILTERS[0];
let allPosts = [];
let lastFetchTime = 0;
const CACHE_DURATION_MS = 3 * 60 * 1000;
let loggedInUser = null;
let isMockMode = false;

// Pagination variables
let currentPage = 0;
const PAGE_SIZE = 12;
let hasMorePosts = true;
let isFetchingPosts = false;
let observer = null;

async function initSystemLUTs() {
  const base = typeof import.meta.env !== 'undefined' ? import.meta.env.BASE_URL : '';
  const neutralImg = new Image();
  neutralImg.src = base + 'images/neutral_haldclut.png';
  
  await new Promise((resolve) => {
    neutralImg.onload = resolve;
    neutralImg.onerror = resolve; // Fallback if image missing
  });

  for (let filter of SYSTEM_FILTERS) {
    if (filter.id === 'normal') {
      filter.lut_obj = neutralImg;
    }
  }
}

window.onload = async () => {
  renderSystemFilters();
  initIcons();
  
  // 初始化系統 WebGL 濾鏡
  await initSystemLUTs();

  // 綁定 Mock 登入事件
  const mockLoginForm = document.getElementById('mock-login-form');
  if (mockLoginForm) {
    mockLoginForm.addEventListener('submit', handleMockLogin);
  }
  
  if (isSupabaseConnected) {
    await checkUserSession();
    await fetchCommunityPosts();
  } else {
    renderMockFeed();
  }
  
  // 初始化手機端手勢
  setupGestures();

  // 預設進入 Studio
  switchTab('studio');
};

/* ================= 📱 手機端手勢與互動 ================= */
function setupGestures() {
  let touchStartX = 0;
  let touchEndX = 0;
  const tabs = ['studio', 'explore'];
  
  document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  
  document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });
  
  function handleSwipe() {
    if (!document.getElementById('auth-modal').classList.contains('hidden') || 
        !document.getElementById('share-modal').classList.contains('hidden')) return;
    
    // 忽略在滑桿上的左右滑動
    if (document.activeElement && document.activeElement.id === 'slider') return;
    
    const diffX = touchStartX - touchEndX;
    const swipeThreshold = 80;
    
    const currentTab = tabs.find(t => !document.getElementById(`section-${t}`)?.classList.contains('hidden')) || 'studio';
    let currentTabIndex = tabs.indexOf(currentTab);
    
    if (diffX > swipeThreshold) {
      if (currentTabIndex < tabs.length - 1) switchTab(tabs[currentTabIndex + 1]);
    } else if (diffX < -swipeThreshold) {
      if (currentTabIndex > 0) switchTab(tabs[currentTabIndex - 1]);
    }
  }
}

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
      
      // 1. 強制登出，避免 Supabase 在背景自動登入
      try {
        await supabaseClient.auth.signOut();
      } catch (e) {
        console.warn('Sign out failed:', e);
      }
      
      // 2. 顯示註冊成功
      showToast('✅ 註冊成功！請點擊 Login 進行登入', 'success');
      
      // 3. 將表單切換回登入模式
      if (isSignUpMode) toggleAuthMode();
      
      // 4. 確保使用者的帳號密碼還留在輸入框中
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
    console.error('Auth error:', error);
    showToast('錯誤: ' + error.message, 'error');
    // 如果是註冊失敗等問題，直接用 alert 彈出，確保使用者能看到
    alert('認證失敗: ' + error.message);
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
window.handleDrop = function(e) {
  e.preventDefault();
  document.getElementById('upload-box').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && (file.type.startsWith('image/') || isRawFile(file))) {
    loadImageFile(file);
  } else {
    showToast('請上傳圖片格式檔案 (支援 JPG/PNG/RAW)', 'error');
  }
};

window.loadSampleImage = async function(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const file = new File([blob], "sample.jpg", { type: "image/jpeg" });
    loadImageFile(file);
  } catch (error) {
    showToast('載入範例圖片失敗', 'error');
    console.error(error);
  }
};

window.handleFileUpload = function(event) {
  const file = event.target.files[0];
  if (file) loadImageFile(file);
};

async function loadImageFile(file) {
  let fileToLoad = file;
  const rawExtensions = ['.cr2', '.nef', '.arw', '.dng', '.raf', '.orf'];
  const isRaw = rawExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
  
  if (isRaw) {
    showToast('偵測到 RAW 檔，正在擷取預覽...', 'info');
    try {
      const thumbnailData = await exifr.thumbnail(file);
      if (thumbnailData) {
        fileToLoad = new Blob([thumbnailData], { type: 'image/jpeg' });
      } else {
        throw new Error('找不到內嵌預覽圖');
      }
    } catch (e) {
      console.error("RAW 解析失敗:", e);
      showToast('無法解析此 RAW 檔案', 'error');
      return;
    }
  }

  // 自動在背景進行最佳化壓縮，避免高畫質照片塞爆瀏覽器記憶體
  try {
    const options = {
      maxSizeMB: 5,
      maxWidthOrHeight: 2560,
      useWebWorker: true,
      initialQuality: 0.95 // 幾乎無損的品質
    };
    fileToLoad = await imageCompression(fileToLoad, options);
  } catch (error) {
    console.warn("壓縮處理失敗，改用原圖載入:", error);
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    currentImageDataUrl = e.target.result;
    document.getElementById('original-img').src = currentImageDataUrl;
    document.getElementById('filtered-img').src = currentImageDataUrl;
    
    currentImageObj = new Image();
    currentImageObj.onload = () => {
      document.getElementById('step-1').classList.add('hidden');
      const studioHeader = document.getElementById('studio-header');
      if (studioHeader) studioHeader.classList.add('hidden');
      
      const step2 = document.getElementById('step-2');
      if (step2) {
        step2.classList.remove('hidden');
        step2.classList.add('flex');
        setTimeout(() => {
          step2.classList.remove('opacity-0', 'translate-y-4');
        }, 50);
      }
      
      if (!webglFilter) {
        try {
          const canvas = document.getElementById('filtered-canvas');
          webglFilter = new WebGLLutFilter(canvas);
        } catch(e) {
          console.warn('WebGL init failed, using CSS fallback:', e);
        }
      }
      
      document.getElementById('slider').value = 50;
      updateSlider();
      applyFilter(currentFilter);
      showToast(isRaw ? 'RAW 檔載入成功！' : '照片載入成功！', 'success');
    };
    currentImageObj.src = currentImageDataUrl;
  };
  reader.readAsDataURL(fileToLoad);
}

window.handleLutUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  
  // 處理 .cube 檔案
  if (file.name.toLowerCase().endsWith('.cube')) {
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const canvas = await parseCubeToHaldCLUT(text);
        
        const lutImg = new Image();
        lutImg.onload = () => {
          applyCustomLUT(lutImg, file);
        };
        lutImg.src = canvas.toDataURL('image/png');
      } catch (err) {
        showToast('解析 .cube 檔案失敗: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    return;
  }
  
  // 處理 .png 檔案
  reader.onload = (e) => {
    const lutImg = new Image();
    lutImg.onload = () => {
      // 驗證是否為標準 512x512 HaldCLUT
      if (lutImg.width !== 512 || lutImg.height !== 512) {
        showToast(`格式錯誤：請上傳標準的 512x512 HaldCLUT。您上傳的是 ${lutImg.width}x${lutImg.height}`, 'error');
        return;
      }
      applyCustomLUT(lutImg, file);
    };
    lutImg.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

function applyCustomLUT(lutImg, file) {
  currentLutFile = file; // Save for uploading to Supabase
  const customFilter = { 
    id: 'custom_lut', 
    name: 'Custom LUT', 
    css: 'none', 
    color: 'border-purple-500 text-purple-500',
    lut_obj: lutImg 
  };
  applyFilter(customFilter);
  showToast('自訂 LUT 色票套用成功！', 'success');
  document.getElementById('lut-input').value = ''; // Reset input
}

window.downloadLutTemplate = function() {
  const base = typeof import.meta.env !== 'undefined' ? import.meta.env.BASE_URL : '';
  const url = base + 'images/neutral_haldclut.png';
  const a = document.createElement('a');
  a.href = url;
  a.download = 'neutral_haldclut.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('基準色票下載成功！', 'success');
};

/* ================= 圖片下載邏輯 ================= */
window.downloadImage = function() {
  if (!currentImageDataUrl) return;
  const a = document.createElement('a');
  a.download = `visionary_${currentFilter.name.replace(/[^a-z0-9]/gi,'_').toLowerCase()}_${Date.now()}.png`;

  if (currentFilter.lut_url || currentFilter.lut_obj) {
    const canvas = document.getElementById('filtered-canvas');
    a.href = canvas.toDataURL('image/png');
    a.click();
    showToast('高品質原圖下載成功！', 'success');
  } else {
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (currentFilter.css && currentFilter.css !== 'none') ctx.filter = currentFilter.css;
      ctx.drawImage(img, 0, 0);
      a.href = canvas.toDataURL('image/png');
      a.click();
      showToast('高品質原圖下載成功！', 'success');
    };
    img.src = currentImageDataUrl;
  }
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
  icon.setAttribute('class', `w-5 h-5 flex-shrink-0 ${c.color}`);
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
async function fetchCommunityPosts(force = false) {
  const now = Date.now();
  
  if (force) {
    currentPage = 0;
    hasMorePosts = true;
    allPosts = [];
  }

  if (!force && allPosts.length > 0 && (now - lastFetchTime) < CACHE_DURATION_MS) {
    renderFeedUI(allPosts);
    setupIntersectionObserver();
    return;
  }

  if (isFetchingPosts || !hasMorePosts) return;
  isFetchingPosts = true;

  if (currentPage === 0) {
    renderSkeletons();
  } else {
    document.getElementById('load-more-spinner').classList.remove('hidden');
  }

  try {
    const start = currentPage * PAGE_SIZE;
    const end = start + PAGE_SIZE - 1;

    const { data, error } = await supabaseClient
      .from('community_posts')
      .select('preset_name, author_ig, filter_css, preview_url, lut_url, created_at')
      .order('created_at', { ascending: false })
      .range(start, end);
    
    if (error) {
      if (error.code === '42501') showToast('資料庫權限錯誤 (42501)，切換為模擬資料', 'warn');
      renderMockFeed();
      hasMorePosts = false;
    } else {
      if (!data || data.length === 0) {
        if (currentPage === 0) renderMockFeed();
        hasMorePosts = false;
      } else {
        if (currentPage === 0) {
          allPosts = data;
        } else {
          allPosts = [...allPosts, ...data];
        }
        
        if (data.length < PAGE_SIZE) {
          hasMorePosts = false;
        }
        
        lastFetchTime = Date.now();
        currentPage++;
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    isFetchingPosts = false;
    document.getElementById('load-more-spinner').classList.add('hidden');
    renderFeedUI(allPosts);
    setupIntersectionObserver();
  }
}

function setupIntersectionObserver() {
  if (observer) {
    observer.disconnect();
  }
  
  const trigger = document.getElementById('load-more-trigger');
  if (!trigger) return;

  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMorePosts && !isFetchingPosts) {
      // 只有在沒有搜尋條件時才載入更多
      const q = document.getElementById('search-input').value.trim();
      if (q === '') {
        fetchCommunityPosts();
      }
    }
  }, { rootMargin: '100px' });
  
  observer.observe(trigger);
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
    const previewCanvas = document.createElement('canvas');
    let previewDataUrl;
    
    // 計算縮圖尺寸 (最大 800px)
    const MAX_SIZE = 800;
    let width = currentImageObj.width;
    let height = currentImageObj.height;
    if (width > MAX_SIZE || height > MAX_SIZE) {
      if (width > height) {
        height = Math.round((height * MAX_SIZE) / width);
        width = MAX_SIZE;
      } else {
        width = Math.round((width * MAX_SIZE) / height);
        height = MAX_SIZE;
      }
    }
    previewCanvas.width = width;
    previewCanvas.height = height;
    const pCtx = previewCanvas.getContext('2d');
    
    if (currentFilter.lut_url || currentFilter.lut_obj) {
      pCtx.drawImage(document.getElementById('filtered-canvas'), 0, 0, width, height);
      previewDataUrl = previewCanvas.toDataURL('image/jpeg', 0.8);
    } else {
      if (currentFilter.css !== 'none') pCtx.filter = currentFilter.css;
      pCtx.drawImage(currentImageObj, 0, 0, width, height);
      previewDataUrl = previewCanvas.toDataURL('image/jpeg', 0.8);
    }

    const previewRes = await fetch(previewDataUrl);
    const previewBlob = await previewRes.blob();
    const previewFileName = `preview_${Date.now()}.jpg`;

    const { error: uploadError } = await supabaseClient.storage.from('preview_images').upload(previewFileName, previewBlob, { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseClient.storage.from('preview_images').getPublicUrl(previewFileName);

    let lutUrl = null;
    if (currentLutFile && (currentFilter.id === 'custom_lut')) {
      const lutFileName = `lut_${Date.now()}.png`;
      const { error: lutUploadError } = await supabaseClient.storage.from('luts').upload(lutFileName, currentLutFile, { contentType: 'image/png' });
      if (lutUploadError) throw lutUploadError;
      const { data: lutUrlData } = supabaseClient.storage.from('luts').getPublicUrl(lutFileName);
      lutUrl = lutUrlData.publicUrl;
    }

    const { error: dbError } = await supabaseClient.from('community_posts').insert([{
      preset_name: name, author_ig: ig.replace('@', ''),
      filter_css: currentFilter.css, preview_url: urlData.publicUrl,
      lut_url: lutUrl
    }]);
    if (dbError) throw dbError;

    closeShareModal();
    showToast('🎉 發布成功！您的專屬調色已上線。', 'success');
    document.getElementById('share-name').value = '';
    document.getElementById('share-ig').value = '';
    
    switchTab('explore');
    await fetchCommunityPosts(true);
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
  const base = typeof import.meta.env !== 'undefined' ? import.meta.env.BASE_URL : '';
  allPosts = [
    { preset_name: 'Midnight Neon', author_ig: 'cyber_shooter_tw', filter_css: 'contrast(1.4) saturate(1.8) hue-rotate(20deg) brightness(0.85)', preview_url: base + 'images/midnight_neon.png' },
    { preset_name: 'Wong Kar-wai Vibes', author_ig: 'film.diary.hk', filter_css: 'contrast(1.1) saturate(1.2) sepia(0.4) hue-rotate(-25deg) brightness(0.9)', preview_url: base + 'images/wong_kar_wai.png' },
    { preset_name: 'Sakura Dream', author_ig: 'photo.tokyo', filter_css: 'contrast(0.9) saturate(1.4) hue-rotate(10deg) brightness(1.1)', preview_url: base + 'images/sakura_dream.png' },
    { preset_name: 'Golden Hour', author_ig: 'sunset_lover', filter_css: 'contrast(1.05) saturate(1.3) sepia(0.2) hue-rotate(-10deg) brightness(1.05)', preview_url: base + 'images/golden_hour.png' }
  ];
  renderFeedUI(allPosts);
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag])
  );
}

function renderFeedUI(posts) {
  document.getElementById('no-results').classList.add('hidden');
  document.getElementById('community-feed').innerHTML = posts.map(post => {
    const lutUrlArg = post.lut_url ? `'${post.lut_url}'` : 'null';
    
    // 向後相容：昨天之前的貼文沒有將濾鏡烘焙 (Bake) 到預覽圖中，所以我們需要補上 CSS 濾鏡。
    // 在 2026-05-26 之後發布的貼文，預覽圖本身就已經是調色過的，所以不需要 CSS 濾鏡。
    let displayFilter = 'none';
    if (!post.created_at || new Date(post.created_at) < new Date('2026-05-26T00:00:00Z')) {
      displayFilter = post.filter_css || 'none';
    }

    return `
    <div class="group relative bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors">
      <div class="aspect-[4/5] relative overflow-hidden bg-zinc-950">
        <img src="${escapeHTML(post.preview_url)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" style="filter: ${escapeHTML(displayFilter)}" loading="lazy">
        <div class="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent opacity-80"></div>
        <div class="absolute bottom-0 left-0 right-0 p-5">
          <h3 class="text-xl font-bold mb-1">${escapeHTML(post.preset_name)}</h3>
          <p class="text-zinc-400 text-sm flex items-center gap-1.5 mb-4 hover:text-white transition-colors">
            <i data-lucide="instagram" class="w-3.5 h-3.5"></i> ${escapeHTML(post.author_ig)}
          </p>
          <div class="flex gap-2">
            <button onclick="tryCommunityPreset('${escapeHTML(post.filter_css)}', '${escapeHTML(post.preset_name)}', ${lutUrlArg})" class="flex-1 bg-white text-black py-2.5 rounded-lg font-bold text-sm hover:bg-rose-400 hover:text-white transition-colors">Try Preset</button>
            <a href="https://www.instagram.com/${escapeHTML(post.author_ig)}" target="_blank" class="px-4 py-2.5 bg-zinc-800 rounded-lg flex items-center justify-center hover:bg-rose-600 transition-colors">
              <i data-lucide="instagram" class="w-5 h-5"></i>
            </a>
          </div>
        </div>
      </div>
    </div>
  `}).join('');
  initIcons();
}

/* ================= Mock RBAC System ================= */
let secretClickCount = 0;
let secretClickTimer = null;

window.handleSecretClick = function() {
  secretClickCount++;
  if (secretClickTimer) clearTimeout(secretClickTimer);
  
  secretClickTimer = setTimeout(() => {
    secretClickCount = 0;
  }, 1000);
  
  if (secretClickCount >= 5) {
    secretClickCount = 0;
    toggleMockMode();
  }
};

window.toggleMockMode = async function() {
  isMockMode = !isMockMode;
  const banner = document.getElementById('mock-banner');
  
  if (isMockMode) {
    showToast('開發者模式啟動！', 'success');
    if (!window.__mswStarted) {
      const { worker } = await import('./mocks/browser.js');
      await worker.start({ onUnhandledRequest: 'bypass' });
      window.__mswStarted = true;
    }
    banner.classList.remove('hidden');
    switchTab('mock-login');
  } else {
    showToast('已關閉開發者模式', 'success');
    banner.classList.add('hidden');
    switchTab('home');
  }
};

async function handleMockLogin(event) {
  event.preventDefault();
  const email = document.getElementById('mock-email').value;
  const password = document.getElementById('mock-password').value;
  const errorEl = document.getElementById('mock-login-error');
  errorEl.classList.add('hidden');

  try {
    const res = await fetch('/api/mock-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) throw new Error('帳號或密碼錯誤');

    const data = await res.json();
    localStorage.setItem('mock_token', data.token);
    localStorage.setItem('mock_user', JSON.stringify(data.user));

    showToast('Mock 登入成功！', 'success');
    
    // 依據角色跳轉
    if (data.user.role === 'admin') {
      switchTab('mock-admin');
    } else {
      switchTab('mock-user');
    }
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

window.mockLogout = function() {
  localStorage.removeItem('mock_token');
  localStorage.removeItem('mock_user');
  showToast('Mock 已登出', 'success');
  switchTab('mock-login');
};

window.switchTab = function(tabName) {
  // Mobile Nav UI
  ['studio', 'explore'].forEach(t => {
    const btn = document.getElementById(`tab-${t}-mobile`);
    if(btn) {
      if (t === tabName) {
        btn.classList.add('text-cyan-400');
        btn.classList.remove('text-zinc-500');
      } else {
        btn.classList.remove('text-cyan-400');
        btn.classList.add('text-zinc-500');
      }
    }
  });

  // Desktop Nav UI
  ['studio', 'explore'].forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if(btn) {
      if (t === tabName) {
        btn.classList.add('bg-zinc-800', 'text-cyan-400');
        btn.classList.remove('text-zinc-500', 'hover:text-zinc-300');
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.classList.remove('bg-zinc-800', 'text-cyan-400');
        btn.classList.add('text-zinc-500', 'hover:text-zinc-300');
        btn.setAttribute('aria-selected', 'false');
      }
    }
  });

  // Toggle Sections
  const allSections = document.querySelectorAll('section[id^="section-"]');
  allSections.forEach(section => {
    if (section.id === `section-${tabName}`) {
      section.classList.remove('hidden');
      if(tabName !== 'home') section.classList.add('flex');
      setTimeout(() => {
        section.style.opacity = '1';
      }, 10);
    } else {
      section.classList.add('hidden');
      section.classList.remove('flex');
      section.style.opacity = '0';
    }
  });

  if (['studio', 'explore'].includes(tabName)) {
    // 手機端震動回饋 (Haptics)
    if (navigator.vibrate) navigator.vibrate(15);
  }
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
  
  // Show Step 3 if user chose any filter
  const step3 = document.getElementById('step-3');
  if (step3 && step3.classList.contains('hidden') && currentFilter.id !== 'normal') {
    step3.classList.remove('hidden');
    step3.classList.add('flex');
    setTimeout(() => {
      step3.classList.remove('opacity-0', 'translate-y-4');
    }, 50);
  }
  
  const filteredImg = document.getElementById('filtered-img');
  const filteredCanvas = document.getElementById('filtered-canvas');
  
  // 現在系統已經 100% 走 WebGL 渲染，全部使用 lut_url 或 lut_obj
  if (currentFilter.lut_url || currentFilter.lut_obj) {
    filteredImg.classList.add('hidden');
    filteredCanvas.classList.remove('hidden');
    
    if (currentFilter.lut_obj && currentImageObj && webglFilter) {
      try {
        webglFilter.render(currentImageObj, currentFilter.lut_obj);
      } catch (e) {
        console.warn('WebGL render failed, falling back to CSS:', e);
        fallbackToCSS();
      }
    } else if (currentFilter.lut_url && currentImageObj && webglFilter) {
      const lutImg = new Image();
      lutImg.crossOrigin = 'anonymous';
      lutImg.onload = () => {
        currentFilter.lut_obj = lutImg;
        try {
          webglFilter.render(currentImageObj, lutImg);
        } catch (e) {
          console.warn('WebGL render failed, falling back to CSS:', e);
          fallbackToCSS();
        }
      };
      lutImg.src = currentFilter.lut_url;
    } else {
      fallbackToCSS();
    }
  } else {
    fallbackToCSS();
  }
  
  function fallbackToCSS() {
    // Fallback 如果發生意外沒有 LUT，或 WebGL 失敗
    filteredCanvas.classList.add('hidden');
    filteredImg.classList.remove('hidden');
    filteredImg.style.filter = currentFilter.css || 'none';
  }
  
  document.getElementById('share-btn').disabled = (currentFilter.id === 'normal');
  
  document.querySelectorAll('.filter-option').forEach(btn => btn.className = "filter-option relative rounded-xl bg-zinc-900 border-2 border-zinc-800 hover:border-zinc-500 py-5 font-bold text-sm text-zinc-400 transition-all");
  const activeBtn = document.getElementById(`btn-filter-${currentFilter.id}`);
  if (activeBtn) activeBtn.className = `filter-option relative rounded-xl bg-zinc-800 border-2 py-5 font-bold text-sm transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)] ${currentFilter.color}`;
};

window.tryCommunityPreset = function(cssStr, name, lutUrl) {
  const customFilter = { 
    id: 'community_preset', 
    name: name, 
    css: cssStr || 'none', 
    color: 'border-purple-500 text-purple-500',
    lut_url: lutUrl
  };
  currentLutFile = null; 
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
  currentImageObj = null;
  document.getElementById('file-input').value = "";
  
  const studioHeader = document.getElementById('studio-header');
  if (studioHeader) studioHeader.classList.remove('hidden');
  
  const step2 = document.getElementById('step-2');
  if (step2) {
    step2.classList.add('hidden', 'opacity-0', 'translate-y-4');
    step2.classList.remove('flex');
  }
  const step3 = document.getElementById('step-3');
  if (step3) {
    step3.classList.add('hidden', 'opacity-0', 'translate-y-4');
    step3.classList.remove('flex');
  }
  
  const step1 = document.getElementById('step-1');
  if (step1) {
    step1.classList.remove('hidden');
  }
  
  if (webglFilter) {
    // 釋放 WebGL 資源
    const gl = webglFilter.gl;
    if (webglFilter.imageTexture) gl.deleteTexture(webglFilter.imageTexture);
    if (webglFilter.lutTexture) gl.deleteTexture(webglFilter.lutTexture);
    webglFilter.imageTexture = null;
    webglFilter.lutTexture = null;
  }
  
  applyFilter(SYSTEM_FILTERS[0]);
  renderSystemFilters();
  showToast('照片已清除', 'success');
};

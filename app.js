// Find Excel file among uploaded files and parse page data for pagebreak-check rule
async function parsePageDataFromExcel(allFiles) {
  const list = Array.isArray(allFiles) ? allFiles : Array.from(allFiles.values());
  const excelFile = list.find(f => f.name.endsWith('.xlsx'));

  if (!excelFile) {
    window.PAGE_DATA = { error: 'No Excel file found in project folder' };
    return;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        // Validate Filename cell
        const middle = rows[0] && rows[0][3] ? String(rows[0][3]).trim() : '';
        if (!middle) {
          resolve({ error: 'Excel missing Filename (middle part) in row 1 column D' });
          return;
        }

        // Validate headers row
        const headers = rows[1] || [];
        const requiredHeaders = ['File Seq.', 'Component Type', 'Start Page', 'End Page', 'flag', 'type'];
        const headerRow = headers.map(h => String(h || '').trim());
        const missingHeaders = requiredHeaders.filter(h => !headerRow.some(rh => rh.toLowerCase().includes(h.toLowerCase())));
        if (missingHeaders.length) {
          resolve({ error: `Excel missing required columns: ${missingHeaders.join(', ')}` });
          return;
        }

        // Validate data rows
        const dataRows = rows.slice(2).filter(r => r && r[0]);
        if (!dataRows.length) {
          resolve({ error: 'Excel has no data rows' });
          return;
        }

        const counters = { cover: 0, fm: 0, chapter: 0, bm: 0 };
        const files = [];

        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[0]) continue;

          const seq = String(row[0]).padStart(2, '0');
          const componentType = String(row[1] || '').trim();
          const startPage = Number(row[2]);
          const endPage = Number(row[3]);
          const nameFlag = Number(row[5]) || 0;
          const flag = Number(row[6]) || 0;
          const type = String(row[7] || 'number').trim();

          if (!componentType || isNaN(startPage) || isNaN(endPage)) continue;
          if (startPage > endPage) continue;

          let suffix = '';
          const ct = componentType.toLowerCase();
          if (ct === 'cover') { counters.cover++; suffix = 'cv'; }
          else if (ct === 'fm') { counters.fm++; suffix = 'fm' + counters.fm; }
          else if (ct === 'chapter') { counters.chapter++; suffix = 'ch' + counters.chapter; }
          else if (ct === 'bm') { counters.bm++; suffix = 'bm' + counters.bm; }

          let filename = '';
          if (nameFlag === 1) {
            filename = componentType + '.xhtml';
          } else {
            filename = seq + '_' + middle + '_' + suffix + '.xhtml';
          }

          files.push({ filename, startPage, endPage, flag, type });
        }

        resolve({ middle, files });
      } catch(e) {
        resolve({ error: 'Excel parse error: ' + e.message });
      }
    };
    reader.readAsArrayBuffer(excelFile);
  });
}

// Main controller: stepper nav, folder handling, rules, validation, results
(function () {
  const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];

  /* ---------- Icons ---------- */

  const ICON_PATHS = {
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
    'folder-open': '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
    'file-text': '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    'x-circle': '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    'alert-triangle': '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
    'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
    'chevron-up': '<polyline points="18 15 12 9 6 15"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    'refresh-cw': '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    'help-circle': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>',
    sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    keyboard: '<rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    sparkles: '<path d="m12 3-1.9 5.8L4 11l6.1 2.2L12 19l1.9-5.8L20 11l-6.1-2.2Z"/>',
    'file-question': '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10 13a2 2 0 1 1 2.5 1.94c-.6.16-1 .7-1 1.31v.25"/><line x1="11.5" y1="18.5" x2="11.5" y2="18.5"/>'
  };

  function icon(name, size) {
    size = size || 16;
    const body = ICON_PATHS[name] || '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  }

  /* ---------- State ---------- */

  let currentStep = 1;
  let allFiles = [];
  let xhtmlFiles = [];
  let imageFiles = [];
  let folderName = '';
  let ruleState = {};
  let currentReport = null; // { totalIssues, totalRules, files: [{fileName, report}] }
  let activeFileTab = 'all';
  let activeFilter = 'all';
  let groupBy = 'rule';

  let fileSearchTerm = '';
  let fileTypeFilter = 'all';
  let fileSort = 'name';

  let ruleSearchTerm = '';
  let ruleSeverityFilter = 'all';

  let validatedAt = null;
  let relativeTimeTimer = null;

  const els = {
    folderInput: document.getElementById('folderInput'),
    uploadBox: document.getElementById('uploadBox'),
    folderSummary: document.getElementById('folderSummary'),
    recentFoldersSection: document.getElementById('recentFoldersSection'),
    recentFoldersList: document.getElementById('recentFoldersList'),
    btnToStep2: document.getElementById('btnToStep2'),
    btnBackTo1: document.getElementById('btnBackTo1'),
    btnToStep3: document.getElementById('btnToStep3'),
    btnBackTo2: document.getElementById('btnBackTo2'),
    rulesList: document.getElementById('rulesList'),
    btnValidate: document.getElementById('btnValidate'),
    btnBackTo3: document.getElementById('btnBackTo3'),
    btnRevalidate: document.getElementById('btnRevalidate'),
    unifiedFileList: document.getElementById('unifiedFileList'),
    fileTypeChips: document.getElementById('fileTypeChips'),
    chipCountAll: document.getElementById('chipCountAll'),
    chipCountXhtml: document.getElementById('chipCountXhtml'),
    chipCountImage: document.getElementById('chipCountImage'),
    fileSortSelect: document.getElementById('fileSortSelect'),
    filesMeta: document.getElementById('filesMeta'),
    fileSearchInput: document.getElementById('fileSearchInput'),
    ruleSearchInput: document.getElementById('ruleSearchInput'),
    ruleSeverityChips: document.getElementById('ruleSeverityChips'),
    rulesActiveChip: document.getElementById('rulesActiveChip'),
    btnEnableAll: document.getElementById('btnEnableAll'),
    btnDisableAll: document.getElementById('btnDisableAll'),
    presetDropdown: document.getElementById('presetDropdown'),
    btnPresetToggle: document.getElementById('btnPresetToggle'),
    presetMenu: document.getElementById('presetMenu'),
    statFiles: document.getElementById('statFiles'),
    statRules: document.getElementById('statRules'),
    statIssues: document.getElementById('statIssues'),
    statusPill: document.getElementById('statusPill'),
    resultsMetaLine: document.getElementById('resultsMetaLine'),
    celebrationHost: document.getElementById('celebrationHost'),
    sidebarFileCount: document.getElementById('sidebarFileCount'),
    resultsSidebarList: document.getElementById('resultsSidebarList'),
    resultList: document.getElementById('resultList'),
    filterTabs: document.getElementById('filterTabs'),
    groupBySegment: document.getElementById('groupBySegment'),
    btnExpandAll: document.getElementById('btnExpandAll'),
    btnCollapseAll: document.getElementById('btnCollapseAll'),
    exportDropdown: document.getElementById('exportDropdown'),
    btnExportToggle: document.getElementById('btnExportToggle'),
    exportMenu: document.getElementById('exportMenu'),
    btnExportJson: document.getElementById('btnExportJson'),
    btnExportText: document.getElementById('btnExportText'),
    btnResetAll: document.getElementById('btnResetAll'),
    btnThemeToggle: document.getElementById('btnThemeToggle'),
    btnShortcuts: document.getElementById('btnShortcuts'),
    shortcutsModal: document.getElementById('shortcutsModal'),
    btnCloseShortcuts: document.getElementById('btnCloseShortcuts'),
    topbarMiniSummary: document.getElementById('topbarMiniSummary'),
    breadcrumb: document.getElementById('breadcrumb'),
    stepperResultsBadge: document.getElementById('stepperResultsBadge'),
    toastContainer: document.getElementById('toastContainer'),
    validationOverlay: document.getElementById('validationOverlay'),
    validationProgressBar: document.getElementById('validationProgressBar'),
    validationLiveText: document.getElementById('validationLiveText'),
    steps: document.querySelectorAll('.step-panel'),
    stepperItems: document.querySelectorAll('.stepper-item')
  };

  /* ---------- Rule config helpers ---------- */

  function seedRuleState() {
    ruleState = {};
    getRulesConfig().forEach(rule => { ruleState[rule.id] = rule.enabled; });
  }

  function getRulesConfig() {
    return Array.isArray(window.RULES_CONFIG) ? window.RULES_CONFIG : [];
  }

  seedRuleState();

  /* ---------- Formatting helpers ---------- */

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatNumber(n) {
    return Number(n || 0).toLocaleString();
  }

  function relativeTime(ts) {
    if (!ts) return '';
    const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (diffSec < 60) return 'just now';
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return diffMin + ' min ago';
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return diffHr + ' hr ago';
    const diffDay = Math.round(diffHr / 24);
    return diffDay + ' day' + (diffDay === 1 ? '' : 's') + ' ago';
  }

  function getExt(name) {
    const idx = name.lastIndexOf('.');
    return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function animateCount(el, from, to, duration) {
    if (from === to) { el.textContent = formatNumber(to); return; }
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 2);
      const val = Math.round(from + (to - from) * eased);
      el.textContent = formatNumber(val);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- Toasts ---------- */

  function showToast(message, variant) {
    variant = variant || 'info';
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + variant;
    const iconName = variant === 'success' ? 'check-circle' : variant === 'error' ? 'x-circle' : 'help-circle';
    toast.innerHTML = `${icon(iconName, 16)}<span>${escapeHtml(message)}</span>`;
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 200);
    }, 2400);
  }

  /* ---------- Theme ---------- */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    els.btnThemeToggle.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 18);
    try { localStorage.setItem('vpqc.theme', theme); } catch (e) {}
  }

  function initTheme() {
    let theme;
    try { theme = localStorage.getItem('vpqc.theme'); } catch (e) {}
    if (!theme) theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  /* ---------- Recent folders ---------- */

  function getRecentFolders() {
    try { return JSON.parse(localStorage.getItem('vpqc.recentFolders') || '[]'); } catch (e) { return []; }
  }

  function saveRecentFolder(name, count) {
    let list = getRecentFolders().filter(f => f.name !== name);
    list.unshift({ name, count, ts: Date.now() });
    list = list.slice(0, 3);
    try { localStorage.setItem('vpqc.recentFolders', JSON.stringify(list)); } catch (e) {}
  }

  function renderRecentFolders() {
    const list = getRecentFolders();
    if (!list.length) { els.recentFoldersSection.hidden = true; return; }
    els.recentFoldersSection.hidden = false;
    els.recentFoldersList.innerHTML = '';
    list.forEach(f => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'recent-folder-chip';
      chip.innerHTML = `${icon('folder', 14)}<span class="recent-name">${escapeHtml(f.name)}</span><span class="recent-ts">${relativeTime(f.ts)}</span>`;
      chip.addEventListener('click', () => showToast('Please reselect the folder', 'info'));
      els.recentFoldersList.appendChild(chip);
    });
  }

  /* ---------- Stepper / navigation ---------- */

  function maxReachableStep() {
    let max = 1;
    if (xhtmlFiles.length) max = 2;
    if (xhtmlFiles.length) max = 3;
    if (currentReport) max = 4;
    return max;
  }

  function goToStep(n) {
    currentStep = n;
    els.steps.forEach(panel => {
      panel.classList.toggle('active', Number(panel.dataset.step) === n);
    });
    els.stepperItems.forEach(item => {
      const s = Number(item.dataset.step);
      item.classList.toggle('active', s === n);
      item.classList.toggle('done', s < n);
      item.classList.toggle('clickable', s < n || s <= maxReachableStep());
    });
    updateBreadcrumb();
    updateMiniSummary();
  }

  function updateMiniSummary() {
    if (!folderName || currentStep === 1) { els.topbarMiniSummary.hidden = true; return; }
    els.topbarMiniSummary.hidden = false;
    els.topbarMiniSummary.innerHTML = `${icon('folder', 13)}<span>${escapeHtml(folderName)} · ${xhtmlFiles.length} files</span>`;
  }

  function updateBreadcrumb() {
    if (!folderName || currentStep === 1) { els.breadcrumb.hidden = true; return; }
    els.breadcrumb.hidden = false;
    els.breadcrumb.textContent = folderName + ' / step ' + currentStep + ' of 4';
  }

  els.stepperItems.forEach(item => {
    item.addEventListener('click', () => {
      const s = Number(item.dataset.step);
      if (s <= maxReachableStep()) {
        if (s === 2) renderFileList();
        if (s === 3) renderRulesList();
        if (s === 4 && currentReport) renderResults();
        goToStep(s);
      }
    });
  });

  /* ---------- Reset ---------- */

  function resetAll() {
    allFiles = [];
    xhtmlFiles = [];
    imageFiles = [];
    folderName = '';
    currentReport = null;
    activeFileTab = 'all';
    activeFilter = 'all';
    groupBy = 'rule';
    fileSearchTerm = '';
    fileTypeFilter = 'all';
    fileSort = 'name';
    ruleSearchTerm = '';
    ruleSeverityFilter = 'all';
    validatedAt = null;
    if (els.fileSearchInput) els.fileSearchInput.value = '';
    if (els.ruleSearchInput) els.ruleSearchInput.value = '';
    els.folderInput.value = '';
    els.folderSummary.innerHTML = '';
    els.uploadBox.style.display = '';
    els.btnToStep2.disabled = true;
    els.stepperResultsBadge.hidden = true;
    seedRuleState();
    document.querySelectorAll('.filter-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === 'all'));
    renderRecentFolders();
  }

  /* ---------- Step 1: folder select ---------- */

  function renderFolderSummary() {
    els.uploadBox.style.display = 'none';
    const totalBytes = allFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    els.folderSummary.innerHTML = `
      <div class="folder-summary-card">
        <div class="folder-summary-icon">${icon('folder', 22)}</div>
        <div class="folder-summary-body">
          <div class="folder-summary-name">${escapeHtml(folderName)}</div>
          <div class="folder-summary-counts">
            <span class="chip">${xhtmlFiles.length} XHTML</span>
            <span class="chip chip-neutral">${imageFiles.length} Images</span>
            <span class="chip chip-neutral">${formatBytes(totalBytes)}</span>
          </div>
        </div>
        <button type="button" id="btnChangeFolder" class="btn btn-ghost btn-sm">Change</button>
      </div>
    `;
    document.getElementById('btnChangeFolder').addEventListener('click', resetAll);
  }

  function handleFolderSelect(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    allFiles = files;
    xhtmlFiles = files.filter(f => getExt(f.name) === 'xhtml');
    imageFiles = files.filter(f => IMAGE_EXT.includes(getExt(f.name)));

    const relPath = files[0].webkitRelativePath || '';
    folderName = relPath.split('/')[0] || 'Selected folder';

    renderFolderSummary();
    els.btnToStep2.disabled = xhtmlFiles.length === 0;
    saveRecentFolder(folderName, xhtmlFiles.length);
    renderRecentFolders();
  }

  /* ---------- Step 2: unified file list ---------- */

  function buildEmptyState(iconName, title, desc, actionHtml) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `${icon(iconName, 40)}<span class="empty-state-title">${escapeHtml(title)}</span>${desc ? `<span class="empty-state-desc">${escapeHtml(desc)}</span>` : ''}${actionHtml || ''}`;
    return empty;
  }

  function getUnifiedFiles() {
    let list = [];
    if (fileTypeFilter === 'all' || fileTypeFilter === 'xhtml') {
      list = list.concat(xhtmlFiles.map(f => ({ file: f, type: 'xhtml' })));
    }
    if (fileTypeFilter === 'all' || fileTypeFilter === 'image') {
      list = list.concat(imageFiles.map(f => ({ file: f, type: 'image' })));
    }
    const term = fileSearchTerm.trim().toLowerCase();
    if (term) list = list.filter(entry => entry.file.name.toLowerCase().includes(term));

    list.sort((a, b) => {
      if (fileSort === 'size') return (b.file.size || 0) - (a.file.size || 0);
      if (fileSort === 'type') return a.type.localeCompare(b.type) || a.file.name.localeCompare(b.file.name);
      return a.file.name.localeCompare(b.file.name);
    });
    return list;
  }

  function renderFileList() {
    els.chipCountAll.textContent = xhtmlFiles.length + imageFiles.length;
    els.chipCountXhtml.textContent = xhtmlFiles.length;
    els.chipCountImage.textContent = imageFiles.length;

    const entries = getUnifiedFiles();
    const totalBytes = entries.reduce((sum, entry) => sum + (entry.file.size || 0), 0);
    els.filesMeta.textContent = `${entries.length} file${entries.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}`;

    els.unifiedFileList.innerHTML = '';

    if (entries.length === 0) {
      if (fileSearchTerm.trim()) {
        els.unifiedFileList.appendChild(buildEmptyState('search', 'No files match your filter', 'Try a different search term.'));
      } else {
        els.unifiedFileList.appendChild(buildEmptyState('file-question', 'No files found', 'This folder has no matching files.'));
      }
      return;
    }

    entries.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'file-row';
      row.innerHTML = `
        <div class="file-row-icon">${icon(entry.type === 'xhtml' ? 'file-text' : 'image', 15)}</div>
        <div class="file-row-name">${escapeHtml(entry.file.name)}</div>
        <div class="file-row-size">${formatBytes(entry.file.size)}</div>
      `;
      els.unifiedFileList.appendChild(row);
    });
  }

  /* ---------- Step 3: rules ---------- */

  const PRESETS = {
    recommended: null, // uses each rule's default `enabled`/on state as shipped
    strict: 'all-on',
    minimal: 'errors-only'
  };

  function applyPreset(key) {
    const rules = getRulesConfig().filter(rule => rule.enabled);
    if (key === 'strict') {
      rules.forEach(rule => { ruleState[rule.id] = true; });
    } else if (key === 'minimal') {
      rules.forEach(rule => { ruleState[rule.id] = rule.severity === 'error'; });
    } else if (key === 'recommended') {
      rules.forEach(rule => { ruleState[rule.id] = rule.enabled; });
    } else {
      const custom = getCustomPresets()[key];
      if (custom) rules.forEach(rule => { if (key in custom || rule.id in custom) ruleState[rule.id] = !!custom[rule.id]; });
    }
    renderRulesList();
    els.presetMenu.hidden = true;
  }

  function getCustomPresets() {
    try { return JSON.parse(localStorage.getItem('vpqc.presets') || '{}'); } catch (e) { return {}; }
  }

  function saveCustomPreset(name) {
    const presets = getCustomPresets();
    presets[name] = Object.assign({}, ruleState);
    try { localStorage.setItem('vpqc.presets', JSON.stringify(presets)); } catch (e) {}
    renderPresetMenu();
    showToast('Preset "' + name + '" saved', 'success');
  }

  function renderPresetMenu() {
    const custom = getCustomPresets();
    let html = `
      <button type="button" class="dropdown-item" data-preset="recommended">Recommended</button>
      <button type="button" class="dropdown-item" data-preset="strict">Strict</button>
      <button type="button" class="dropdown-item" data-preset="minimal">Minimal</button>
    `;
    const customKeys = Object.keys(custom);
    if (customKeys.length) {
      html += '<div class="dropdown-divider"></div><div class="dropdown-label">Saved presets</div>';
      customKeys.forEach(name => {
        html += `<button type="button" class="dropdown-item" data-preset="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
      });
    }
    html += '<div class="dropdown-divider"></div><button type="button" class="dropdown-item" id="btnSavePreset">Save current as preset&hellip;</button>';
    els.presetMenu.innerHTML = html;

    els.presetMenu.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });
    const saveBtn = document.getElementById('btnSavePreset');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const name = prompt('Preset name:');
        if (name && name.trim()) saveCustomPreset(name.trim());
        els.presetMenu.hidden = true;
      });
    }
  }

  function renderRulesList() {
    const term = ruleSearchTerm.trim().toLowerCase();
    const allEnabledRules = getRulesConfig().filter(rule => rule.enabled);

    let rules = allEnabledRules;
    if (ruleSeverityFilter !== 'all') rules = rules.filter(rule => rule.severity === ruleSeverityFilter);
    if (term) rules = rules.filter(rule =>
      (rule.name || '').toLowerCase().includes(term) ||
      (rule.description || '').toLowerCase().includes(term));

    const activeCount = allEnabledRules.filter(rule => ruleState[rule.id]).length;
    els.rulesActiveChip.textContent = `${activeCount} of ${allEnabledRules.length} rules active`;
    els.btnValidate.disabled = activeCount === 0;

    els.rulesList.innerHTML = '';

    if (allEnabledRules.length === 0) {
      els.rulesList.appendChild(buildEmptyState('sliders', 'No validation rules are configured yet.', ''));
      return;
    }

    if (rules.length === 0) {
      if (activeCount === 0 && !term && ruleSeverityFilter === 'all') {
        const empty = buildEmptyState('sliders', 'Enable at least one rule to validate', 'Turn on the checks you want to run.', '');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary btn-sm';
        btn.textContent = 'Enable all';
        btn.addEventListener('click', () => { enableAllRules(); });
        empty.appendChild(btn);
        els.rulesList.appendChild(empty);
      } else {
        els.rulesList.appendChild(buildEmptyState('search', 'No rules match your search', ''));
      }
      return;
    }

    rules.forEach(rule => {
      const on = ruleState[rule.id];
      const item = document.createElement('div');
      item.className = 'rule-item ' + (on ? 'rule-enabled' : 'rule-disabled');
      item.innerHTML = `
        <button class="toggle-switch ${on ? 'on' : ''}" data-rule-id="${rule.id}" role="switch" aria-checked="${on}"></button>
        <div class="rule-body">
          <div class="rule-name">${escapeHtml(rule.name)}</div>
          <div class="rule-desc">${escapeHtml(rule.description)}</div>
        </div>
        <div class="rule-severity severity-${rule.severity}">${escapeHtml(rule.severity)}</div>
      `;
      els.rulesList.appendChild(item);
    });

    els.rulesList.querySelectorAll('.toggle-switch').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.ruleId;
        ruleState[id] = !ruleState[id];
        renderRulesList();
      });
    });
  }

  function enableAllRules() {
    getRulesConfig().filter(rule => rule.enabled).forEach(rule => { ruleState[rule.id] = true; });
    renderRulesList();
  }

  function disableAllRules() {
    getRulesConfig().filter(rule => rule.enabled).forEach(rule => { ruleState[rule.id] = false; });
    renderRulesList();
  }

  /* ---------- Validation ---------- */

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  function showValidationOverlay() {
    els.validationOverlay.hidden = false;
    // restart animation
    els.validationOverlay.classList.remove('running');
    void els.validationOverlay.offsetWidth;
    els.validationOverlay.classList.add('running');
    els.validationProgressBar.style.width = '0%';
    els.validationLiveText.textContent = 'Preparing…';
  }

  function hideValidationOverlay() {
    els.validationOverlay.hidden = true;
    els.validationOverlay.classList.remove('running');
  }

  function updateValidationProgress(current, total, fileName) {
    const pct = total ? Math.round((current / total) * 100) : 0;
    els.validationProgressBar.style.width = pct + '%';
    els.validationLiveText.textContent = `Checking file ${current} of ${total} — ${fileName}`;
  }

  async function handleValidate() {
    if (!xhtmlFiles.length) return;
    showValidationOverlay();

    try {
      const filesReport = [];
      let totalIssues = 0;
      let totalRules = getRulesConfig().length;
      const total = xhtmlFiles.length;
      let i = 0;

      // Parse page data from Excel (if present) for pagebreak-check rule
      window._pagebreakLabelMap = null;
      window.PAGE_DATA = await parsePageDataFromExcel(allFiles);

      // Preload all xhtml files into fileMap
      const fileMap = new Map();
      await Promise.all(xhtmlFiles.map(async (file) => {
        try {
          const fileText = await readFileAsText(file);
          const parsedFile = window.Parser ? window.Parser.parse(fileText) : null;
          if (parsedFile) fileMap.set(file.name, parsedFile);
        } catch(e) {
          console.warn('Could not preload file:', file.name, e);
        }
      }));

      for (const file of xhtmlFiles) {
        i++;
        updateValidationProgress(i, total, file.name);
        await new Promise(r => setTimeout(r, 0));

        const text = await readFileAsText(file);
        let report;
        if (window.Validator && typeof window.Validator.run === 'function') {
          report = window.Validator.run(text, ruleState, fileMap, allFiles, file.name);
        } else {
          report = { parsed: { lines: text.split('\n') }, activeRules: [], issues: [], issueCount: 0 };
        }
        totalIssues += report.issueCount || 0;
        totalRules = report.activeRules ? report.activeRules.length : totalRules;
        filesReport.push({ fileName: file.name, report });
      }

      currentReport = { totalIssues, totalRules, files: filesReport };
      validatedAt = Date.now();
      activeFileTab = 'all';
      activeFilter = 'all';
      groupBy = 'rule';
      document.querySelectorAll('.filter-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === 'all'));
      document.querySelectorAll('.segmented-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.group === 'rule'));
      renderResults();
      hideValidationOverlay();
      goToStep(4);
    } catch (err) {
      hideValidationOverlay();
      alert('Could not validate files: ' + err.message);
    }
  }

  /* ---------- Step 4: results ---------- */

  function computeFileSeverity(fileEntry) {
    const issues = (fileEntry.report && fileEntry.report.issues) || [];
    if (issues.length === 0) return 'pass';
    const hasError = issues.some(issue => issue.severity ? issue.severity === 'error' : true);
    if (hasError) return 'error';
    const hasWarn = issues.some(issue => issue.severity === 'warn');
    return hasWarn ? 'warn' : 'error';
  }

  function computeTotals() {
    let errors = 0;
    let warnings = 0;
    let passedRules = 0;
    currentReport.files.forEach(fileEntry => {
      (fileEntry.report.issues || []).forEach(issue => {
        if (issue.severity === 'warn') warnings++;
        else errors++;
      });
      buildGroups(fileEntry.report).forEach(g => { if (g.passed) passedRules++; });
    });
    return { errors, warnings, passedRules };
  }

  function startRelativeTimeTicker() {
    if (relativeTimeTimer) clearInterval(relativeTimeTimer);
    relativeTimeTimer = setInterval(() => {
      if (validatedAt && currentStep === 4) {
        els.resultsMetaLine.textContent = `Validated ${relativeTime(validatedAt)} · ${folderName}`;
      }
    }, 30000);
  }

  function renderResults() {
    if (!currentReport) return;

    const prevFiles = Number(els.statFiles.textContent.replace(/,/g, '')) || 0;
    const prevRules = Number(els.statRules.textContent.replace(/,/g, '')) || 0;
    const prevIssues = Number(els.statIssues.textContent.replace(/,/g, '')) || 0;
    animateCount(els.statFiles, prevFiles, currentReport.files.length, 400);
    animateCount(els.statRules, prevRules, currentReport.totalRules, 400);
    animateCount(els.statIssues, prevIssues, currentReport.totalIssues, 400);

    const { errors, warnings } = computeTotals();
    if (currentReport.totalIssues === 0) {
      els.statusPill.className = 'status-pill status-pass';
      els.statusPill.innerHTML = `${icon('check-circle', 16)}<span>All checks passed</span>`;
    } else {
      els.statusPill.className = 'status-pill status-fail';
      els.statusPill.innerHTML = `${icon('x-circle', 16)}<span>${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}</span>`;
    }

    els.resultsMetaLine.textContent = `Validated ${relativeTime(validatedAt)} · ${folderName}`;
    startRelativeTimeTicker();

    const badge = els.stepperResultsBadge;
    if (currentReport.totalIssues === 0) {
      badge.hidden = false;
      badge.className = 'stepper-badge badge-pass';
      badge.textContent = '✓';
    } else {
      badge.hidden = false;
      badge.className = 'stepper-badge' + (errors > 0 ? '' : ' badge-warn');
      badge.textContent = String(currentReport.totalIssues);
    }

    renderCelebration();
    renderResultsSidebar();
    renderResultList();
  }

  function renderCelebration() {
    els.celebrationHost.innerHTML = '';
    if (!currentReport || currentReport.totalIssues !== 0) return;

    const filesChecked = currentReport.files.length;
    const rulesRun = currentReport.files[0]?.report?.activeRules?.length || 0;
    const xhtmlCount = currentReport.files.filter(f => f.fileName.endsWith('.xhtml')).length;
    const imageCount = currentReport.files.filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f.fileName)).length;

    const now = new Date();
    const timestamp = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      + ' at ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const quotes = [
      "Your files are spotless — the QC team approves! ✅",
      "Not a single issue. You're on a roll! 🎯",
      "Flawless validation. The book is ready! 📖",
      "Zero issues. Your attention to detail is unmatched! 🏆",
      "Clean as a whistle! Ship it! 🚀",
      "Perfect score. The EPUB gods are pleased! ⚡",
      "All green across the board. Outstanding work! 🌟"
    ];
    const quote = quotes[Math.floor(Math.random() * quotes.length)];

    const xhtmlPct = filesChecked > 0 ? Math.round((xhtmlCount / (xhtmlCount + imageCount)) * 100) : 100;
    const imagePct = 100 - xhtmlPct;

    const hero = document.createElement('div');
    hero.className = 'celebration-hero';
    hero.innerHTML = `
      <div class="celebration-inner">
        <div class="celebration-icon-wrap">
          <svg class="check-svg" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle class="check-circle-bg" cx="40" cy="40" r="38" stroke="var(--brand-green)" stroke-width="3" fill="none"/>
            <polyline class="check-mark" points="22,42 34,54 58,28" stroke="var(--brand-green)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
        </div>
        <div class="celebration-text">
          <div class="celebration-title">Clean Bill of Health</div>
          <div class="celebration-sub">All checks passed — your files are clean.</div>
          <div class="celebration-stats">
            <div class="cel-stat">
              <span class="cel-stat-value" data-target="${filesChecked}">0</span>
              <span class="cel-stat-label">Files Checked</span>
            </div>
            <div class="cel-stat-divider"></div>
            <div class="cel-stat">
              <span class="cel-stat-value" data-target="${rulesRun}">0</span>
              <span class="cel-stat-label">Rules Run</span>
            </div>
            <div class="cel-stat-divider"></div>
            <div class="cel-stat">
              <span class="cel-stat-value" data-target="0">0</span>
              <span class="cel-stat-label">Issues Found</span>
            </div>
          </div>
        </div>
        <div class="celebration-right">
          <div class="cel-timestamp">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${timestamp}
          </div>
          <div class="cel-filebar">
            <div class="cel-filebar-label">File Breakdown</div>
            <div class="cel-filebar-track">
              <div class="cel-filebar-xhtml" style="width:${xhtmlPct}%"></div>
              <div class="cel-filebar-image" style="width:${imagePct}%"></div>
            </div>
            <div class="cel-filebar-legend">
              <span><span class="cel-dot cel-dot-xhtml"></span>XHTML <strong>${xhtmlCount}</strong></span>
              <span><span class="cel-dot cel-dot-image"></span>Images <strong>${imageCount}</strong></span>
            </div>
          </div>
          <div class="cel-quote">${quote}</div>
        </div>
      </div>
    `;
    els.celebrationHost.appendChild(hero);

    // Animate stat counters
    hero.querySelectorAll('.cel-stat-value').forEach(el => {
      const target = parseInt(el.dataset.target, 10);
      if (target === 0) return;
      let start = 0;
      const step = Math.ceil(target / (1000 / 16));
      const timer = setInterval(() => {
        start = Math.min(start + step, target);
        el.textContent = start;
        if (start >= target) clearInterval(timer);
      }, 16);
    });

    setTimeout(() => fireConfetti(hero), 1100);
  }

  function fireConfetti(container) {
    const colors = ['#1E3A8A', '#15803D', '#D97706', '#6366F1', '#EC4899'];
    const shapes = ['square', 'circle', 'rect'];
    for (let i = 0; i < 40; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece confetti-' + shapes[i % shapes.length];
      piece.style.left = (20 + Math.random() * 60) + '%';
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = (Math.random() * 0.6) + 's';
      piece.style.animationDuration = (1.2 + Math.random() * 0.8) + 's';
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      container.appendChild(piece);
    }
    setTimeout(() => {
      container.querySelectorAll('.confetti-piece').forEach(p => p.remove());
    }, 2500);
  }

  function renderResultsSidebar() {
    els.sidebarFileCount.textContent = '(' + currentReport.files.length + ')';
    els.resultsSidebarList.innerHTML = '';

    const allItem = document.createElement('div');
    allItem.className = 'sidebar-file-item' + (activeFileTab === 'all' ? ' active' : '');
    allItem.innerHTML = `
      <span class="severity-dot ${currentReport.totalIssues > 0 ? 'dot-error' : ''}"></span>
      <span class="sidebar-file-name">All files</span>
      <span class="sidebar-file-count">${currentReport.totalIssues}</span>
    `;
    allItem.addEventListener('click', () => { activeFileTab = 'all'; renderResults(); });
    els.resultsSidebarList.appendChild(allItem);

    currentReport.files.forEach(f => {
      const severity = computeFileSeverity(f);
      const count = f.report.issueCount || 0;
      const item = document.createElement('div');
      item.className = 'sidebar-file-item' + (activeFileTab === f.fileName ? ' active' : '');
      item.innerHTML = `
        <span class="severity-dot ${severity === 'error' ? 'dot-error' : severity === 'warn' ? 'dot-warn' : ''}"></span>
        <span class="sidebar-file-name" title="${escapeHtml(f.fileName)}">${escapeHtml(f.fileName)}</span>
        <span class="sidebar-file-count">${count}</span>
      `;
      item.addEventListener('click', () => { activeFileTab = f.fileName; renderResults(); });
      els.resultsSidebarList.appendChild(item);
    });
  }

  function buildGroups(report) {
    const byRule = {};
    (report.issues || []).forEach(issue => {
      if (!byRule[issue.ruleId]) byRule[issue.ruleId] = [];
      byRule[issue.ruleId].push(issue);
    });

    return (report.activeRules || []).map(rule => {
      const issues = byRule[rule.id] || [];
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        issues,
        passed: issues.length === 0
      };
    });
  }

  function filterGroups(groups) {
    if (activeFilter === 'errors') return groups.filter(g => !g.passed && g.severity === 'error');
    if (activeFilter === 'warnings') return groups.filter(g => !g.passed && g.severity === 'warn');
    if (activeFilter === 'passed') return groups.filter(g => g.passed);
    return groups;
  }

  function renderResultList() {
    els.resultList.innerHTML = '';

    const filesToShow = activeFileTab === 'all'
      ? currentReport.files
      : currentReport.files.filter(f => f.fileName === activeFileTab);

    let anyShown = false;

    if (groupBy === 'rule') {
      filesToShow.forEach(fileEntry => {
        const groups = filterGroups(buildGroups(fileEntry.report));
        if (groups.length === 0) return;
        anyShown = true;

        if (activeFileTab === 'all') {
          const heading = document.createElement('div');
          heading.className = 'result-file-heading';
          heading.textContent = fileEntry.fileName;
          els.resultList.appendChild(heading);
        }

        groups.forEach(group => {
          els.resultList.appendChild(buildGroupEl(group, fileEntry.fileName));
        });
      });
    } else {
      // group by file: one card per file per active rule bucket, rule name shown per row
      filesToShow.forEach(fileEntry => {
        const groups = filterGroups(buildGroups(fileEntry.report));
        if (groups.length === 0) return;
        anyShown = true;

        const heading = document.createElement('div');
        heading.className = 'result-file-heading';
        heading.textContent = fileEntry.fileName;
        els.resultList.appendChild(heading);

        els.resultList.appendChild(buildFileGroupEl(fileEntry.fileName, groups));
      });
    }

    if (!anyShown) {
      els.resultList.appendChild(buildEmptyState('search', `No ${activeFilter === 'all' ? '' : activeFilter} issues in this view`, 'Try a different filter.'));
    }
  }

  function copyIssueToClipboard(issue, fileName) {
    const text = `${fileName}:${issue.line || ''} — ${issue.message || ''}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard', 'success'))
        .catch(() => showToast('Could not copy', 'error'));
    } else {
      showToast('Could not copy', 'error');
    }
  }

  function buildIssueTable(issues, fileName) {
    const table = document.createElement('table');
    table.className = 'issue-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th class="col-whats-wrong">What's Wrong</th>
          <th class="col-where">Where</th>
          <th class="col-location">Location</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    issues.forEach(issue => {
      const tr = document.createElement('tr');
      const loc = `${issue.line ? 'Line ' + issue.line : ''}${issue.col ? ' · Col ' + issue.col : ''}`;
      tr.innerHTML = `
        <td class="col-whats-wrong">${escapeHtml(issue.message || '')}</td>
        <td class="col-where"><span class="snippet-text">${escapeHtml(issue.detail || '')}</span></td>
        <td class="col-location"><span>${loc}</span><button type="button" class="row-copy-btn" title="Copy">${icon('copy', 13)}</button></td>
      `;
      tr.querySelector('.row-copy-btn').addEventListener('click', () => copyIssueToClipboard(issue, fileName));
      tbody.appendChild(tr);
    });
    return table;
  }

  function buildGroupEl(group, fileName) {
    const wrap = document.createElement('div');
    wrap.className = 'rule-group ' + (group.passed ? 'group-pass' : 'group-' + group.severity);

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'rule-group-header';

    const countBadge = group.passed
      ? `<span class="count-badge count-pass">Passed</span>`
      : `<span class="count-badge count-${group.severity}">${group.issues.length} issue${group.issues.length === 1 ? '' : 's'}</span>`;

    const severityLabel = group.passed ? 'PASS' : group.severity.toUpperCase();

    header.innerHTML = `
      <span class="group-arrow">${icon('chevron-right', 14)}</span>
      <span class="group-rule-name">${escapeHtml(group.ruleName)}</span>
      <span class="group-center">${countBadge}</span>
      <span class="group-severity severity-tag-${group.passed ? 'pass' : group.severity}">${severityLabel}</span>
    `;

    const body = document.createElement('div');
    body.className = 'rule-group-body';
    const inner = document.createElement('div');
    inner.className = 'rule-group-body-inner';

    if (group.passed) {
      const row = document.createElement('div');
      row.className = 'group-issue-row row-pass';
      row.textContent = 'No issues found.';
      inner.appendChild(row);
    } else {
      const ruleDef = window.RULES && window.RULES[group.ruleId];
      const hasCustomRender = ruleDef && typeof ruleDef.render === 'function';

      if (hasCustomRender && group.issues.length > 0) {
        group.issues.forEach(issue => {
          const el = ruleDef.render(issue, fileName);
          if (el instanceof HTMLElement) {
            inner.appendChild(el);
          } else {
            inner.appendChild(buildIssueTable([issue], fileName));
          }
        });
      } else {
        inner.appendChild(buildIssueTable(group.issues, fileName));
      }
    }

    body.appendChild(inner);
    header.addEventListener('click', () => wrap.classList.toggle('expanded'));
    wrap.appendChild(header);
    wrap.appendChild(body);
    return wrap;
  }

  function buildFileGroupEl(fileName, groups) {
    const wrap = document.createElement('div');
    const worstSeverity = groups.some(g => !g.passed && g.severity === 'error') ? 'error'
      : groups.some(g => !g.passed && g.severity === 'warn') ? 'warn' : 'pass';
    wrap.className = 'rule-group ' + (worstSeverity === 'pass' ? 'group-pass' : 'group-' + worstSeverity);

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'rule-group-header';

    const issueCount = groups.reduce((sum, g) => sum + g.issues.length, 0);
    const countBadge = issueCount === 0
      ? `<span class="count-badge count-pass">Passed</span>`
      : `<span class="count-badge count-${worstSeverity}">${issueCount} issue${issueCount === 1 ? '' : 's'}</span>`;

    header.innerHTML = `
      <span class="group-arrow">${icon('chevron-right', 14)}</span>
      <span class="group-rule-name">${escapeHtml(fileName)}</span>
      <span class="group-center">${countBadge}</span>
    `;

    const body = document.createElement('div');
    body.className = 'rule-group-body';
    const inner = document.createElement('div');
    inner.className = 'rule-group-body-inner';

    const allIssues = [];
    groups.forEach(g => {
      g.issues.forEach(issue => allIssues.push(Object.assign({ ruleName: g.ruleName }, issue)));
    });

    if (allIssues.length === 0) {
      const row = document.createElement('div');
      row.className = 'group-issue-row row-pass';
      row.textContent = 'No issues found.';
      inner.appendChild(row);
    } else {
      const table = buildIssueTable(allIssues, fileName);
      const headRow = table.querySelector('thead tr');
      const ruleTh = document.createElement('th');
      ruleTh.textContent = 'Rule';
      ruleTh.className = 'col-rule';
      headRow.insertBefore(ruleTh, headRow.firstChild);
      table.querySelectorAll('tbody tr').forEach((tr, i) => {
        const td = document.createElement('td');
        td.className = 'col-rule';
        td.textContent = allIssues[i].ruleName;
        tr.insertBefore(td, tr.firstChild);
      });
      inner.appendChild(table);
    }

    body.appendChild(inner);
    header.addEventListener('click', () => wrap.classList.toggle('expanded'));
    wrap.appendChild(header);
    wrap.appendChild(body);
    return wrap;
  }

  function expandAllGroups() {
    document.querySelectorAll('.rule-group').forEach(g => g.classList.add('expanded'));
  }

  function collapseAllGroups() {
    document.querySelectorAll('.rule-group').forEach(g => g.classList.remove('expanded'));
  }

  /* ---------- Export ---------- */

  function triggerDownload(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportReportJSON() {
    if (!currentReport) return;
    triggerDownload(JSON.stringify(currentReport, null, 2), 'qc-report.json', 'application/json');
    showToast('Exported qc-report.json', 'success');
  }

  function exportReportText() {
    if (!currentReport) return;
    const lines = [];
    lines.push('E-pub CUP QC Validator report');
    lines.push('Folder: ' + folderName);
    lines.push('Files checked: ' + currentReport.files.length);
    lines.push('Rules run: ' + currentReport.totalRules);
    lines.push('Total issues: ' + currentReport.totalIssues);
    lines.push('');
    currentReport.files.forEach(fileEntry => {
      lines.push('== ' + fileEntry.fileName + ' ==');
      const groups = buildGroups(fileEntry.report);
      groups.forEach(group => {
        if (group.passed) {
          lines.push(`  [PASS] ${group.ruleName}`);
        } else {
          lines.push(`  [${group.severity.toUpperCase()}] ${group.ruleName} (${group.issues.length})`);
          group.issues.forEach(issue => {
            lines.push(`    - Line ${issue.line || '?'}: ${issue.message || ''}`);
          });
        }
      });
      lines.push('');
    });
    triggerDownload(lines.join('\n'), 'qc-report.txt', 'text/plain');
    showToast('Exported qc-report.txt', 'success');
  }

  /* ---------- Dropdown handling ---------- */

  function closeAllDropdowns() {
    els.presetMenu.hidden = true;
    els.exportMenu.hidden = true;
  }

  document.addEventListener('click', (e) => {
    if (!els.presetDropdown.contains(e.target)) els.presetMenu.hidden = true;
    if (!els.exportDropdown.contains(e.target)) els.exportMenu.hidden = true;
  });

  /* ---------- Shortcuts modal ---------- */

  function openShortcutsModal() { els.shortcutsModal.hidden = false; }
  function closeShortcutsModal() { els.shortcutsModal.hidden = true; }

  els.shortcutsModal.addEventListener('click', (e) => {
    if (e.target === els.shortcutsModal) closeShortcutsModal();
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const inField = tag === 'input' || tag === 'textarea' || tag === 'select';

    if (e.key === 'Escape') {
      if (!els.shortcutsModal.hidden) { closeShortcutsModal(); return; }
      closeAllDropdowns();
      if (currentStep > 1) goToStep(currentStep - 1);
      return;
    }

    if (inField) {
      if (e.key === 'Enter' && (e.target === els.fileSearchInput || e.target === els.ruleSearchInput)) {
        // let it stay in field
      }
      return;
    }

    if (e.key === 'Enter') {
      if (currentStep === 1 && !els.btnToStep2.disabled) { els.btnToStep2.click(); }
      else if (currentStep === 2) { els.btnToStep3.click(); }
      else if (currentStep === 3 && !els.btnValidate.disabled) { els.btnValidate.click(); }
      return;
    }

    if (e.key === '/' ) {
      e.preventDefault();
      if (currentStep === 2) els.fileSearchInput.focus();
      if (currentStep === 3) els.ruleSearchInput.focus();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (currentStep === 2) els.fileSearchInput.focus();
      if (currentStep === 3) els.ruleSearchInput.focus();
      return;
    }

    if (e.key === '?' && els.shortcutsModal.hidden) { openShortcutsModal(); return; }
    if (e.key.toLowerCase() === 't') { toggleTheme(); return; }
    if (e.key.toLowerCase() === 'e' && currentStep === 4) { exportReportJSON(); return; }
  });

  /* ---------- Wiring ---------- */

  els.uploadBox.addEventListener('click', (e) => {
    if (e.target === els.folderInput) return;
    els.folderInput.click();
  });
  els.folderInput.addEventListener('change', handleFolderSelect);

  els.btnToStep2.addEventListener('click', () => {
    renderFileList();
    goToStep(2);
  });
  els.btnBackTo1.addEventListener('click', () => goToStep(1));

  els.btnToStep3.addEventListener('click', () => {
    renderRulesList();
    goToStep(3);
  });
  els.btnBackTo2.addEventListener('click', () => goToStep(2));

  els.btnValidate.addEventListener('click', handleValidate);
  els.btnBackTo3.addEventListener('click', () => goToStep(3));

  els.btnRevalidate.addEventListener('click', () => {
    resetAll();
    goToStep(1);
  });

  els.btnResetAll.addEventListener('click', () => {
    resetAll();
    goToStep(1);
  });

  els.fileSearchInput.addEventListener('input', debounce(() => {
    fileSearchTerm = els.fileSearchInput.value;
    renderFileList();
  }, 100));

  els.fileTypeChips.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    fileTypeFilter = btn.dataset.type;
    els.fileTypeChips.querySelectorAll('.filter-chip').forEach(b => b.classList.toggle('active', b === btn));
    renderFileList();
  });

  els.fileSortSelect.addEventListener('change', () => {
    fileSort = els.fileSortSelect.value;
    renderFileList();
  });

  els.ruleSearchInput.addEventListener('input', debounce(() => {
    ruleSearchTerm = els.ruleSearchInput.value;
    renderRulesList();
  }, 100));

  els.ruleSeverityChips.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    ruleSeverityFilter = btn.dataset.severity;
    els.ruleSeverityChips.querySelectorAll('.filter-chip').forEach(b => b.classList.toggle('active', b === btn));
    renderRulesList();
  });

  els.btnEnableAll.addEventListener('click', enableAllRules);
  els.btnDisableAll.addEventListener('click', disableAllRules);

  els.btnPresetToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    renderPresetMenu();
    els.presetMenu.hidden = !els.presetMenu.hidden;
    els.exportMenu.hidden = true;
  });

  els.btnExpandAll.addEventListener('click', expandAllGroups);
  els.btnCollapseAll.addEventListener('click', collapseAllGroups);

  els.btnExportToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    els.exportMenu.hidden = !els.exportMenu.hidden;
    els.presetMenu.hidden = true;
  });
  els.btnExportJson.addEventListener('click', () => { exportReportJSON(); els.exportMenu.hidden = true; });
  els.btnExportText.addEventListener('click', () => { exportReportText(); els.exportMenu.hidden = true; });

  els.groupBySegment.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    groupBy = btn.dataset.group;
    els.groupBySegment.querySelectorAll('.segmented-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderResultList();
  });

  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b === btn));
      renderResultList();
    });
  });

  els.btnThemeToggle.addEventListener('click', toggleTheme);
  els.btnShortcuts.addEventListener('click', openShortcutsModal);
  els.btnCloseShortcuts.addEventListener('click', (e) => {
    e.stopPropagation();
    closeShortcutsModal();
  });

  function debounce(fn, wait) {
    let t;
    return function () {
      clearTimeout(t);
      const args = arguments;
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  /* ---------- Init ---------- */

  els.uploadBox.querySelector('#uploadIcon').innerHTML = icon('folder-open', 48);
  els.btnResetAll.innerHTML = icon('refresh-cw', 18);
  els.btnShortcuts.innerHTML = icon('help-circle', 18);
  document.getElementById('iconArrowRight').innerHTML = icon('arrow-right', 16);
  document.getElementById('iconArrowRight2').innerHTML = icon('arrow-right', 16);
  document.getElementById('iconArrowLeft1').innerHTML = icon('arrow-left', 16);
  document.getElementById('iconArrowLeft2').innerHTML = icon('arrow-left', 16);
  document.getElementById('iconArrowLeft3').innerHTML = icon('arrow-left', 16);
  document.getElementById('iconSearch2').innerHTML = icon('search', 16);
  document.getElementById('iconSearch3').innerHTML = icon('search', 16);
  document.getElementById('iconSparkles').innerHTML = icon('sparkles', 14);
  document.getElementById('iconChevronDown1').innerHTML = icon('chevron-down', 14);
  document.getElementById('iconChevronDown2').innerHTML = icon('chevron-down', 14);
  document.getElementById('iconSliders').innerHTML = icon('sliders', 16);
  document.getElementById('iconDownload').innerHTML = icon('download', 14);
  document.getElementById('iconRefresh').innerHTML = icon('refresh-cw', 16);
  els.btnCloseShortcuts.innerHTML = icon('x', 18);

  initTheme();
  renderRecentFolders();
  goToStep(1);
})();

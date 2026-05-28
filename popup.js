(function () {
  'use strict';

  const FREE_LIMIT = 3;
  const PAYMENT_URL = 'https://liuhongrui.gumroad.com/l/iitywl';

  const els = {
    badge: document.getElementById('badge'),
    upgradeBox: document.getElementById('upgradeBox'),
    buyBtn: document.getElementById('buyBtn'),
    codeInput: document.getElementById('codeInput'),
    activateBtn: document.getElementById('activateBtn'),
    toggleCode: document.getElementById('toggleCode'),
    scanPanel: document.getElementById('scanPanel'),
    btnScan: document.getElementById('btnScan'),
    scanLimit: document.getElementById('scanLimit'),
    resultsPanel: document.getElementById('resultsPanel'),
    scoreValue: document.getElementById('scoreValue'),
    scoreProgress: document.getElementById('scoreProgress'),
    a11yScore: document.getElementById('a11yScore'),
    a11yBar: document.getElementById('a11yBar'),
    seoScore: document.getElementById('seoScore'),
    seoBar: document.getElementById('seoBar'),
    privacyScore: document.getElementById('privacyScore'),
    privacyBar: document.getElementById('privacyBar'),
    perfScore: document.getElementById('perfScore'),
    perfBar: document.getElementById('perfBar'),
    issuesTitle: document.getElementById('issuesTitle'),
    issuesCount: document.getElementById('issuesCount'),
    issuesList: document.getElementById('issuesList'),
    btnPdf: document.getElementById('btnPdf'),
    btnRescan: document.getElementById('btnRescan')
  };

  let isPro = false;
  let remaining = FREE_LIMIT;
  let lastScanData = null;

  function validateCode(code) {
    if (!code || typeof code !== 'string') return false;
    code = code.trim().toUpperCase();

    // Format 1: Original SA-XXXXX-XXXXX (for manual/testing use)
    const parts = code.split('-');
    if (parts.length === 3 && parts[0] === 'SA') {
      const base = parts[1];
      const check = parts[2];
      if (base.length === 5 && check.length === 5) {
        let hash = 0;
        for (let i = 0; i < base.length; i++) {
          hash = ((hash << 5) - hash) + base.charCodeAt(i);
          hash |= 0;
        }
        const expected = Math.abs(hash).toString(36).toUpperCase().padStart(5, '0').slice(0, 5);
        return expected === check;
      }
    }

    // Format 2: Gumroad License Key (auto-generated, 16+ chars alphanumeric)
    const clean = code.replace(/-/g, '');
    return clean.length >= 12 && /^[A-Z0-9]+$/.test(clean);
  }

  async function getState() {
    const today = new Date().toISOString().slice(0, 10);
    const res = await chrome.storage.sync.get(['pro', 'usageDate', 'usageCount']);
    isPro = !!res.pro;
    const usageDate = res.usageDate || today;
    let usageCount = parseInt(res.usageCount, 10) || 0;
    if (usageDate !== today) {
      usageCount = 0;
      await chrome.storage.sync.set({ usageDate: today, usageCount: 0 });
    }
    remaining = Math.max(0, FREE_LIMIT - usageCount);
    updateUI();
  }

  async function incrementUsage() {
    if (isPro) return true;
    const today = new Date().toISOString().slice(0, 10);
    const res = await chrome.storage.sync.get(['usageDate', 'usageCount']);
    let usageCount = parseInt(res.usageCount, 10) || 0;
    if (res.usageDate !== today) usageCount = 0;
    usageCount++;
    await chrome.storage.sync.set({ usageDate: today, usageCount });
    remaining = Math.max(0, FREE_LIMIT - usageCount);
    updateUI();
    return usageCount <= FREE_LIMIT;
  }

  function updateUI() {
    if (isPro) {
      els.badge.textContent = 'PRO';
      els.badge.classList.add('pro');
      els.upgradeBox.classList.remove('active');
      els.scanLimit.style.display = 'none';
    } else {
      els.badge.textContent = 'FREE';
      els.badge.classList.remove('pro');
      els.scanLimit.style.display = 'block';
      els.scanLimit.querySelector('strong').textContent = remaining;
    }
  }

  function setScoreColor(score) {
    if (score >= 90) return '#43a047';
    if (score >= 70) return '#7cb342';
    if (score >= 50) return '#fb8c00';
    return '#e53935';
  }

  function renderResults(data) {
    lastScanData = data;
    els.scanPanel.classList.add('hidden');
    els.resultsPanel.classList.remove('hidden');

    const overall = data.overallScore || 0;
    els.scoreValue.textContent = overall;
    els.scoreValue.style.color = setScoreColor(overall);
    els.scoreProgress.style.stroke = setScoreColor(overall);
    els.scoreProgress.setAttribute('stroke-dasharray', `${overall}, 100`);

    const a11y = data.accessibility || {};
    els.a11yScore.textContent = a11y.score || 0;
    els.a11yBar.style.width = (a11y.score || 0) + '%';

    const seo = data.seo || {};
    els.seoScore.textContent = seo.score || 0;
    els.seoBar.style.width = (seo.score || 0) + '%';

    const privacy = data.privacy || {};
    els.privacyScore.textContent = privacy.score || 0;
    els.privacyBar.style.width = (privacy.score || 0) + '%';

    const perf = data.performance || {};
    els.perfScore.textContent = perf.score || 0;
    els.perfBar.style.width = (perf.score || 0) + '%';

    const violations = a11y.violations || [];
    const totalIssues = violations.reduce((sum, v) => sum + (v.nodes || 0), 0);
    els.issuesCount.textContent = totalIssues;

    if (violations.length === 0) {
      els.issuesList.innerHTML = '<div class="issue-item"><div class="issue-title">No automated violations detected</div><div class="issue-desc">Note: manual testing is still required for full WCAG compliance.</div></div>';
    } else {
      els.issuesList.innerHTML = violations.slice(0, 8).map(v => `
        <div class="issue-item">
          <span class="issue-impact impact-${v.impact || 'moderate'}">${v.impact || 'moderate'}</span>
          <div class="issue-title">${escapeHtml(v.help)}</div>
          <div class="issue-desc">${escapeHtml(v.description || '')}</div>
          <div class="issue-count">Affected elements: ${v.nodes || 0}</div>
        </div>
      `).join('');
      if (violations.length > 8) {
        els.issuesList.innerHTML += `<div class="issue-item" style="text-align:center;color:#888;font-size:11px;">+ ${violations.length - 8} more issues in PDF report</div>`;
      }
    }

    els.btnPdf.disabled = !isPro;
    if (!isPro && totalIssues > 0) {
      els.btnPdf.innerHTML = '🔒 Export PDF Report (Pro)';
    } else {
      els.btnPdf.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Export PDF Report
      `;
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function doScan() {
    // Check limit before attempting scan
    if (!isPro) {
      const today = new Date().toISOString().slice(0, 10);
      const res = await chrome.storage.sync.get(['usageDate', 'usageCount']);
      let usageCount = parseInt(res.usageCount, 10) || 0;
      if (res.usageDate !== today) usageCount = 0;
      if (usageCount >= FREE_LIMIT) {
        els.upgradeBox.classList.add('active');
        return;
      }
    }

    els.btnScan.disabled = true;
    els.btnScan.innerHTML = '<span class="loading"></span> Scanning...';

    let tab;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs[0];
      if (!tab) throw new Error('No active tab');

      // Block Chrome built-in pages that cannot be injected
      if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://'))) {
        throw new Error('Cannot scan browser built-in pages. Please open a regular website (http/https).');
      }

      // Try to scan. If content script is not present, inject it dynamically.
      let res;
      try {
        res = await chrome.tabs.sendMessage(tab.id, { action: 'scan' });
      } catch (err) {
        if (err.message && err.message.includes('Receiving end does not exist')) {
          // Content script not injected — inject now
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['axe.min.js', 'content.js']
          });
          // Poll for ready state instead of fixed delay
          let retries = 0;
          const maxRetries = 10;
          while (retries < maxRetries) {
            await new Promise(r => setTimeout(r, 200));
            try {
              res = await chrome.tabs.sendMessage(tab.id, { action: 'scan' });
              break;
            } catch (e2) {
              retries++;
              if (retries >= maxRetries) throw new Error('Scanner failed to initialize on this page. Try refreshing.');
            }
          }
        } else {
          throw err;
        }
      }

      if (!res || !res.success) {
        throw new Error(res?.error || 'Scan failed');
      }

      // Only deduct usage after successful scan
      await incrementUsage();
      renderResults(res.data);
    } catch (e) {
      let msg = e.message || 'Scan failed';
      if (msg.includes('Cannot access') || msg.includes('No tab with id')) {
        msg = 'Cannot access this page. Try refreshing or open a different website.';
      }
      alert('Scan failed: ' + msg);
    } finally {
      els.btnScan.disabled = false;
      els.btnScan.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        Scan This Page
      `;
    }
  }

  async function doExportPdf() {
    if (!isPro) {
      els.upgradeBox.classList.add('active');
      return;
    }
    if (!lastScanData) return;

    els.btnPdf.disabled = true;
    els.btnPdf.innerHTML = '<span class="loading"></span> Generating...';

    try {
      const html = window.SiteAuditReport.generateReport(lastScanData, true);
      const filename = `SiteAudit-${(lastScanData.title || 'report').replace(/[^a-z0-9]/gi, '_').slice(0, 40)}-${new Date().toISOString().slice(0, 10)}.pdf`;
      await window.SiteAuditReport.downloadPdf(html, filename);
    } catch (e) {
      alert('PDF generation failed: ' + e.message);
    } finally {
      els.btnPdf.disabled = false;
      els.btnPdf.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Export PDF Report
      `;
    }
  }

  els.btnScan.addEventListener('click', doScan);
  els.btnRescan.addEventListener('click', () => {
    els.resultsPanel.classList.add('hidden');
    els.scanPanel.classList.remove('hidden');
    doScan();
  });
  els.btnPdf.addEventListener('click', doExportPdf);

  els.buyBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: PAYMENT_URL });
  });

  els.toggleCode.addEventListener('click', (e) => {
    e.preventDefault();
    els.codeInput.classList.toggle('hidden');
    els.activateBtn.classList.toggle('hidden');
    els.codeInput.focus();
  });

  els.activateBtn.addEventListener('click', async () => {
    const code = els.codeInput.value.trim().toUpperCase();
    if (validateCode(code)) {
      await chrome.storage.sync.set({ pro: true });
      isPro = true;
      updateUI();
      els.codeInput.classList.add('hidden');
      els.activateBtn.classList.add('hidden');
      if (lastScanData) {
        els.btnPdf.disabled = false;
        els.btnPdf.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export PDF Report
        `;
      }
    } else {
      els.codeInput.style.borderColor = '#e53935';
      setTimeout(() => els.codeInput.style.borderColor = 'rgba(255,255,255,0.3)', 2000);
    }
  });

  getState();
})();

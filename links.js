(function (global) {
  'use strict';

  const LINK_CATEGORIES = Object.freeze({
    dispatch: { label: 'Dispatch', icon: '🚛' },
    accounting: { label: 'Accounting', icon: '💰' },
    factoring: { label: 'Factoring', icon: '🏦' },
    maintenance: { label: 'Maintenance', icon: '🔧' },
    documents: { label: 'Documents', icon: '📁' },
    insurance: { label: 'Insurance', icon: '🛡' },
    broker: { label: 'Broker', icon: '🤝' },
    company: { label: 'Company', icon: '🏢' },
    community: { label: 'Community', icon: '💬' },
    other: { label: 'Other', icon: '🔗' },
  });

  function create(deps) {
    let currentLinkFilter = 'all';
    let linkSearchQuery = '';
    const escAttr = value => deps.escHtml(value).split(String.fromCharCode(96)).join('&#96;');
    const getLinksKey = () => deps.K + 'clinks';

    function normalizeLinkUrl(url) {
      const value = String(url || '').trim();
      if (!value) return '';
      if (/^(https?:\/\/|tg:\/\/|mailto:)/i.test(value)) return value;
      if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(value)) return 'https://' + value;
      return '';
    }

    function generatedId() {
      return 'lnk-' + deps.random().toString(36).slice(2, 11) + '-' + deps.now();
    }

    function defaultLinks() {
      return [
        { id: 'def-1', name: 'CrewBIQ Community', url: 'https://t.me/+ktZOiC7_bMowZmEx', category: 'community', note: 'Official CrewBIQ Community', favorite: true, createdAt: deps.now() },
        { id: 'def-2', name: 'CrewBIQ Support Bot', url: 'https://t.me/CrewBIQSupport_bot', category: 'community', note: 'Support, bugs, ideas and referrals', favorite: true, createdAt: deps.now() },
      ];
    }

    function loadCLinks() {
      try {
        const key = getLinksKey();
        const badKey = 'fiqD__clinks';
        let raw = deps.localStorage.getItem(key);
        const badRaw = deps.localStorage.getItem(badKey);
        if (!raw && badRaw) {
          raw = badRaw;
          deps.localStorage.setItem(key, badRaw);
          deps.localStorage.removeItem(badKey);
        }
        if (!raw) {
          const records = defaultLinks();
          deps.localStorage.setItem(key, JSON.stringify(records));
          return records;
        }
        let links = JSON.parse(raw);
        if (!Array.isArray(links)) links = [];
        let wasMigrated = false;
        links = links.map(link => {
          if (!link.id) {
            wasMigrated = true;
            return {
              id: generatedId(),
              name: link.name || 'Untitled Work Link',
              url: normalizeLinkUrl(link.url) || String(link.url || '').trim(),
              category: 'other',
              note: '',
              favorite: false,
              createdAt: deps.now(),
            };
          }
          if (!link.category || !LINK_CATEGORIES[link.category]) {
            wasMigrated = true;
            link.category = 'other';
          }
          if (typeof link.favorite !== 'boolean') {
            wasMigrated = true;
            link.favorite = !!link.favorite;
          }
          if (link.url) {
            const normalized = normalizeLinkUrl(link.url);
            if (normalized && normalized !== link.url) {
              wasMigrated = true;
              link.url = normalized;
            }
          }
          return link;
        });
        if (wasMigrated) deps.localStorage.setItem(key, JSON.stringify(links));
        return links;
      } catch (error) {
        deps.console.error('[CrewBIQ Links] Error loading links:', error);
        return [];
      }
    }

    function saveCLinks(links) {
      deps.localStorage.setItem(getLinksKey(), JSON.stringify(links));
      deps.localStorage.removeItem('fiqD__clinks');
    }

    function setFilter(value) {
      currentLinkFilter = value;
    }

    function setSearchQuery(value) {
      linkSearchQuery = value;
    }

    function renderCommunity() {
      const page = deps.document.getElementById('communityCustomLinks');
      if (!page) return;
      const topSearch = deps.document.getElementById('lmSearch');
      if (topSearch && topSearch.value !== linkSearchQuery) topSearch.value = linkSearchQuery;
      const filtered = loadCLinks().filter(link => {
        const name = String(link.name || '');
        const note = String(link.note || '');
        const url = String(link.url || '');
        if (linkSearchQuery) {
          const query = linkSearchQuery.toLowerCase();
          if (!name.toLowerCase().includes(query) && !note.toLowerCase().includes(query) && !url.toLowerCase().includes(query)) return false;
        }
        if (currentLinkFilter === 'favorites') return !!link.favorite;
        if (currentLinkFilter !== 'all') return link.category === currentLinkFilter;
        return true;
      });
      const grouped = {};
      filtered.forEach(link => {
        const category = LINK_CATEGORIES[link.category] ? link.category : 'other';
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push(link);
      });
      const quickFilters = [
        { id: 'all', label: 'All' },
        { id: 'favorites', label: '⭐ Favorites' },
        { id: 'dispatch', label: 'Dispatch' },
        { id: 'accounting', label: 'Accounting' },
        { id: 'maintenance', label: 'Maintenance' },
        { id: 'documents', label: 'Docs' },
      ];
      let output = '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:12px;margin-bottom:8px;-webkit-overflow-scrolling:touch;">';
      quickFilters.forEach(filter => {
        output += '<button onclick="setLinkFilter(\'' + escAttr(filter.id) + '\'); renderCommunity();" class="lm-chip ' +
          (currentLinkFilter === filter.id ? 'lm-chip-active' : '') + '">' + deps.escHtml(filter.label) + '</button>';
      });
      output += '</div>';
      if (filtered.length === 0) {
        output += '<div class="empty" style="padding:40px 20px;border:1px dashed var(--bd);border-radius:12px">No custom work links found.</div>';
      } else {
        for (const [categoryKey, categoryMeta] of Object.entries(LINK_CATEGORIES)) {
          if (!grouped[categoryKey] || grouped[categoryKey].length === 0) continue;
          output += '<div class="lm-cat-group-title"><span>' + categoryMeta.icon + '</span><span>' + deps.escHtml(categoryMeta.label) +
            '</span><span style="opacity:.55">(' + grouped[categoryKey].length + ')</span></div>';
          grouped[categoryKey].forEach(link => {
            const safeId = escAttr(link.id || '');
            const safeName = deps.escHtml(link.name || 'Untitled Link');
            const safeNote = deps.escHtml(link.note || '');
            const normalizedUrl = normalizeLinkUrl(link.url);
            const safeUrl = escAttr(normalizedUrl);
            let domain = '';
            if (normalizedUrl) {
              try { domain = new deps.URL(normalizedUrl).hostname.replace('www.', ''); }
              catch (error) { domain = normalizedUrl; }
            } else {
              domain = 'Invalid or unavailable URL';
            }
            const openControl = normalizedUrl
              ? '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer" style="flex:1;text-align:center;text-decoration:none;color:var(--acc);padding:9px 4px;font-size:12px;font-weight:700">Open ↗</a>'
              : '<span aria-disabled="true" style="flex:1;text-align:center;color:var(--mu);padding:9px 4px;font-size:12px;font-weight:700">Unavailable</span>';
            output += '<div class="lm-card ' + (link.favorite ? 'fav' : '') + '"><div class="lm-card-body">' +
              '<div class="lm-cat-icon" style="background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.25)">' + categoryMeta.icon +
              '</div><div class="lm-card-info"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
              '<div class="lm-card-name">' + safeName + '</div><button onclick="toggleLinkFav(\'' + safeId +
              '\')" style="background:none;border:none;color:' + (link.favorite ? 'var(--acc)' : 'var(--mu)') +
              ';cursor:pointer;font-size:18px;line-height:1;padding:0">' + (link.favorite ? '★' : '☆') + '</button></div>' +
              (safeNote ? '<div class="lm-card-note">' + safeNote + '</div>' : '') + '<div class="lm-card-url">🌐 ' +
              deps.escHtml(domain) + '</div></div></div><div class="lm-card-actions">' + openControl +
              '<button onclick="openLinkModal(\'' + safeId + '\')">Edit</button><button onclick="deleteLink(\'' + safeId +
              '\')" style="color:var(--rd)">Delete</button></div></div>';
          });
        }
      }
      page.innerHTML = output;
    }

    function toggleLinkFav(id) {
      saveCLinks(loadCLinks().map(link => link.id === id ? { ...link, favorite: !link.favorite } : link));
      renderCommunity();
    }

    function deleteLink(id) {
      if (deps.confirm('Delete this work link?')) {
        saveCLinks(loadCLinks().filter(link => link.id !== id));
        renderCommunity();
        deps.toast('Link deleted');
      }
    }

    function openLinkModal(id = '') {
      let backdrop = deps.document.getElementById('lm_modal_backdrop');
      if (!backdrop) {
        backdrop = deps.document.createElement('div');
        backdrop.id = 'lm_modal_backdrop';
        backdrop.className = 'lm-modal-backdrop';
        deps.document.body.appendChild(backdrop);
      }
      let item = { id: '', name: '', url: '', category: 'other', note: '', favorite: false };
      if (id) {
        const found = loadCLinks().find(link => link.id === id);
        if (found) item = found;
      }
      let options = '';
      for (const [key, value] of Object.entries(LINK_CATEGORIES)) {
        options += '<option value="' + key + '" ' + (item.category === key ? 'selected' : '') + '>' + value.icon + ' ' + deps.escHtml(value.label) + '</option>';
      }
      backdrop.innerHTML = '<div class="lm-modal-box"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid var(--bd);padding-bottom:8px;">' +
        '<h4 style="margin:0;font-size:16px;color:var(--tx);font-weight:bold;">' + (item.id ? 'Edit Link' : 'Add Custom Link') +
        '</h4><span onclick="closeLinkModal()" style="cursor:pointer;color:var(--tx);opacity:.5;font-size:22px;line-height:1;">&times;</span></div>' +
        '<form id="lm_form" onsubmit="handleSaveLink(event)"><input type="hidden" id="lm_id" value="' + escAttr(item.id || '') + '">' +
        '<label style="display:block;margin-bottom:4px;font-size:11px;opacity:.6;">Link Name *</label><input type="text" id="lm_name" value="' +
        escAttr(item.name || '') + '" required class="lm-input" placeholder="e.g. Amazon Dispatch Room">' +
        '<label style="display:block;margin-bottom:4px;font-size:11px;opacity:.6;">URL Address *</label><input type="url" id="lm_url" placeholder="https://" value="' +
        escAttr(item.url || '') + '" required class="lm-input"><label style="display:block;margin-bottom:4px;font-size:11px;opacity:.6;">Category</label>' +
        '<select id="lm_category" class="lm-select">' + options + '</select><label style="display:block;margin-bottom:4px;font-size:11px;opacity:.6;">Note / Access Code (Optional)</label>' +
        '<input type="text" id="lm_note" placeholder="e.g. Ext 402, code 9921" value="' + escAttr(item.note || '') +
        '" class="lm-input"><div style="margin:12px 0 18px 0;display:flex;align-items:center;gap:8px;"><input type="checkbox" id="lm_favorite" ' +
        (item.favorite ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:var(--acc);cursor:pointer;"><label for="lm_favorite" style="font-size:13px;cursor:pointer;user-select:none;">Pin to Favorites</label></div>' +
        '<div style="display:flex;gap:10px;"><button type="button" onclick="closeLinkModal()" style="flex:1;background:var(--s2);border:1px solid var(--bd);color:var(--tx);padding:10px;border-radius:6px;font-size:13px;cursor:pointer;">Cancel</button>' +
        '<button type="submit" style="flex:1;background:var(--acc);border:none;color:#000;font-weight:bold;padding:10px;border-radius:6px;font-size:13px;cursor:pointer;">Save</button></div></form></div>';
      backdrop.style.display = 'block';
      deps.setTimeout(() => {
        const element = deps.document.getElementById('lm_name');
        if (element) element.focus();
      }, 50);
    }

    function closeLinkModal() {
      const backdrop = deps.document.getElementById('lm_modal_backdrop');
      if (backdrop) backdrop.style.display = 'none';
    }

    function handleSaveLink(event) {
      if (event) event.preventDefault();
      const id = deps.document.getElementById('lm_id').value;
      const name = deps.document.getElementById('lm_name').value.trim();
      const rawUrl = deps.document.getElementById('lm_url').value.trim();
      const category = deps.document.getElementById('lm_category').value;
      const note = deps.document.getElementById('lm_note').value.trim();
      const favorite = deps.document.getElementById('lm_favorite').checked;
      if (!name || !rawUrl) {
        deps.toast('Name and URL required', 'err');
        return;
      }
      const url = normalizeLinkUrl(rawUrl);
      if (!url) {
        deps.toast('Use http(s), mailto, tg, or a valid domain', 'err');
        return;
      }
      let links = loadCLinks();
      if (id) links = links.map(link => link.id === id ? { ...link, name, url, category, note, favorite } : link);
      else links.push({ id: generatedId(), name, url, category, note, favorite, createdAt: deps.now() });
      saveCLinks(links);
      closeLinkModal();
      renderCommunity();
      deps.toast(id ? 'Link updated' : 'Link added');
    }

    return Object.freeze({
      LINK_CATEGORIES, closeLinkModal, deleteLink, getLinksKey, handleSaveLink, loadCLinks,
      normalizeLinkUrl, openLinkModal, renderCommunity, saveCLinks, setFilter, setSearchQuery, toggleLinkFav,
    });
  }

  global.CrewBIQLinks = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);

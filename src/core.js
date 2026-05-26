  const APP_ID = 'cgpt-qnav-stable';
  const HOST_ID = 'cgpt-qnav-host';
  const TOGGLE_ID = 'cgpt-qnav-toggle';
  const STORAGE_COLLAPSED = `${APP_ID}:collapsed`;

  const state = {
    collapsed: loadCollapsed(),
    query: '',
    items: [],
    filteredItems: [],
    activeId: null,
    listScrollTop: 0,
    isListInteracting: false,
    pendingRenderReason: null,
    observer: null,
    shadow: null,
    els: null,
    lastUrl: location.href,
    scanTimer: null,
    interactionTimer: null,
    activeTimer: null,
    apiConversationId: '',
    apiItems: [],
    apiLoading: false,
    apiLoaded: false,
    apiLoadFailed: false,
    apiRequestSerial: 0,
    apiRetryCount: 0,
    apiRetryTimer: null,
    navigationSerial: 0,
    navigationActiveId: '',
  };

  function log(...args) {
    console.log(`[${APP_ID}]`, ...args);
  }

  function loadCollapsed() {
    try {
      return localStorage.getItem(STORAGE_COLLAPSED) === '1';
    } catch {
      return false;
    }
  }

  function saveCollapsed(value) {
    try {
      localStorage.setItem(STORAGE_COLLAPSED, value ? '1' : '0');
    } catch {}
  }

  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function throttle(fn, delay) {
    let last = 0;
    let trailing = null;

    return (...args) => {
      const now = Date.now();
      const remaining = delay - (now - last);

      if (remaining <= 0) {
        if (trailing) {
          clearTimeout(trailing);
          trailing = null;
        }
        last = now;
        fn(...args);
      } else if (!trailing) {
        trailing = setTimeout(() => {
          last = Date.now();
          trailing = null;
          fn(...args);
        }, remaining);
      }
    };
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function makePreview(text, maxLen = 90) {
    const clean = normalizeText(text);
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen - 1) + '…';
  }

  function buildSignature(items) {
    return items
      .map((item) => [
        item.id,
        item.preview,
        item.hasImage ? '1' : '0',
        item.answerId || '',
        item.answerPreview || '',
      ].join(':'))
      .join('|');
  }

  function filterItems(items, query) {
    const q = normalizeText(query).toLowerCase();
    if (!q) return items.slice();
    return items.filter((item) => (item.searchText || item.text || '').toLowerCase().includes(q));
  }

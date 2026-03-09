// ==UserScript==
// @name         ChatGPT Question Navigator Stable
// @namespace    https://chatgpt.com/
// @version      1.0.0
// @description  Stable right-side question navigator for ChatGPT conversations
// @author       OpenAI
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

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
    nodeIdMap: new WeakMap(),
    idCounter: 0,
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

  function getOrAssignNodeId(node) {
    if (state.nodeIdMap.has(node)) {
      return state.nodeIdMap.get(node);
    }
    const id = `qnav-${++state.idCounter}`;
    state.nodeIdMap.set(node, id);
    return id;
  }

  function getConversationRoot() {
    return document.querySelector('main') || document.body;
  }

  function isInsideOurUI(node) {
    const host = document.getElementById(HOST_ID);
    const toggle = document.getElementById(TOGGLE_ID);
    return Boolean(
      (host && node instanceof Node && host.contains(node)) ||
      (toggle && node instanceof Node && toggle.contains(node))
    );
  }

  function getUserRoleNodes() {
    return Array.from(document.querySelectorAll('[data-message-author-role="user"]'));
  }

  function getTargetContainer(roleNode) {
    if (!(roleNode instanceof HTMLElement)) return null;

    return (
      roleNode.closest('article') ||
      roleNode.closest('[data-testid^="conversation-turn-"]') ||
      roleNode.closest('[class*="conversation-turn"]') ||
      roleNode
    );
  }

  function extractUserText(roleNode) {
    if (!(roleNode instanceof HTMLElement)) return '';

    const cloned = roleNode.cloneNode(true);

    cloned.querySelectorAll(
      'button, svg, img, video, audio, nav, form, textarea, input, select, style, script'
    ).forEach((n) => n.remove());

    return normalizeText(cloned.textContent || '');
  }

  function collectItems() {
    const roleNodes = getUserRoleNodes();
    const seenText = new Set();
    const items = [];

    for (const roleNode of roleNodes) {
      const targetNode = getTargetContainer(roleNode);
      if (!targetNode) continue;

      const text = extractUserText(roleNode);
      if (!text || text.length < 2) continue;

      const dedupeKey = text.slice(0, 200);
      if (seenText.has(dedupeKey)) continue;
      seenText.add(dedupeKey);

      const id = getOrAssignNodeId(targetNode);
      const top = targetNode.getBoundingClientRect().top + window.scrollY;

      items.push({
        id,
        text,
        preview: makePreview(text),
        node: targetNode,
        top,
      });
    }

    items.sort((a, b) => a.top - b.top);
    return items;
  }

  function buildSignature(items) {
    return items.map((item) => `${item.id}:${item.preview}`).join('|');
  }

  function filterItems(items, query) {
    const q = normalizeText(query).toLowerCase();
    if (!q) return items.slice();
    return items.filter((item) => item.text.toLowerCase().includes(q));
  }

  function ensureUI() {
    ensureToggle();
    ensureHost();
    ensureShadowUI();
    applyCollapsedState();
  }

  function ensureToggle() {
    let toggle = document.getElementById(TOGGLE_ID);
    if (toggle) return;

    toggle = document.createElement('button');
    toggle.id = TOGGLE_ID;
    toggle.type = 'button';
    toggle.textContent = 'Q';
    toggle.title = '질문 네비게이션 열기/닫기';
    Object.assign(toggle.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      width: '48px',
      height: '48px',
      borderRadius: '999px',
      border: '1px solid rgba(255,255,255,0.18)',
      background: 'rgba(20,20,24,0.95)',
      color: '#fff',
      cursor: 'pointer',
      fontSize: '18px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      backdropFilter: 'blur(10px)',
    });

    toggle.addEventListener('click', () => {
      state.collapsed = !state.collapsed;
      saveCollapsed(state.collapsed);
      applyCollapsedState();
    });

    document.body.appendChild(toggle);
  }

  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (host) return host;

    host = document.createElement('div');
    host.id = HOST_ID;
    Object.assign(host.style, {
      position: 'fixed',
      top: '16px',
      right: '16px',
      width: '320px',
      height: 'calc(100vh - 32px)',
      zIndex: '2147483646',
      pointerEvents: 'auto',
    });

    document.body.appendChild(host);
    return host;
  }

  function ensureShadowUI() {
    const host = document.getElementById(HOST_ID);
    if (!host) return;

    if (!state.shadow) {
      state.shadow = host.attachShadow({ mode: 'open' });
    }

    if (state.shadow.querySelector('.app')) return;

    state.shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        * {
          box-sizing: border-box;
        }

        .app {
          width: 100%;
          height: 100%;
          background: rgba(20,20,24,0.94);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 16px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.32);
          backdrop-filter: blur(12px);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .hidden {
          display: none !important;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .title {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.1px;
        }

        .actions {
          display: flex;
          gap: 6px;
        }

        button {
          font: inherit;
        }

        .btn {
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          color: #fff;
          border-radius: 10px;
          padding: 6px 10px;
          font-size: 12px;
          cursor: pointer;
        }

        .btn:hover {
          background: rgba(255,255,255,0.10);
        }

        .searchWrap {
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .search {
          width: 100%;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
          color: #fff;
          padding: 10px 12px;
          outline: none;
          font-size: 13px;
        }

        .search::placeholder {
          color: rgba(255,255,255,0.48);
        }

        .list {
          flex: 1;
          overflow: auto;
          padding: 10px;
          overscroll-behavior: contain;
          scroll-behavior: auto;
        }

        .empty {
          color: rgba(255,255,255,0.60);
          font-size: 13px;
          padding: 12px 10px;
        }

        .item {
          display: block;
          width: 100%;
          text-align: left;
          border: 1px solid transparent;
          background: rgba(255,255,255,0.04);
          border-radius: 12px;
          padding: 10px;
          margin-bottom: 8px;
          color: #fff;
          cursor: pointer;
        }

        .item:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.08);
        }

        .item.active {
          background: rgba(255,255,255,0.12);
          border-color: rgba(255,255,255,0.18);
        }

        .index {
          display: inline-block;
          font-size: 11px;
          color: rgba(255,255,255,0.56);
          margin-bottom: 6px;
        }

        .text {
          font-size: 13px;
          line-height: 1.42;
          color: rgba(255,255,255,0.95);
          word-break: break-word;
        }

        .footer {
          border-top: 1px solid rgba(255,255,255,0.08);
          padding: 8px 12px;
          font-size: 11px;
          color: rgba(255,255,255,0.45);
        }
      </style>

      <div class="app">
        <div class="header">
          <div class="title">질문 네비게이션</div>
          <div class="actions">
            <button class="btn" id="refreshBtn" type="button">새로고침</button>
            <button class="btn" id="hideBtn" type="button">닫기</button>
          </div>
        </div>
        <div class="searchWrap">
          <input class="search" id="searchInput" type="text" placeholder="질문 검색" />
        </div>
        <div class="list" id="list"></div>
        <div class="footer" id="footer">0개 질문</div>
      </div>
    `;

    const els = {
      app: state.shadow.querySelector('.app'),
      refreshBtn: state.shadow.getElementById('refreshBtn'),
      hideBtn: state.shadow.getElementById('hideBtn'),
      searchInput: state.shadow.getElementById('searchInput'),
      list: state.shadow.getElementById('list'),
      footer: state.shadow.getElementById('footer'),
    };

    state.els = els;

    els.hideBtn.addEventListener('click', () => {
      state.collapsed = true;
      saveCollapsed(true);
      applyCollapsedState();
    });

    els.refreshBtn.addEventListener('click', () => {
      scanAndRender('manual');
    });

    els.searchInput.addEventListener('input', (e) => {
      state.query = e.target.value || '';
      state.listScrollTop = 0;
      renderList('search');
    });

    const markInteracting = () => {
      state.isListInteracting = true;
      clearTimeout(state.interactionTimer);
      state.interactionTimer = setTimeout(() => {
        state.isListInteracting = false;
        if (state.pendingRenderReason) {
          const reason = state.pendingRenderReason;
          state.pendingRenderReason = null;
          renderList(reason);
        }
      }, 180);
    };

    els.list.addEventListener('scroll', () => {
      state.listScrollTop = els.list.scrollTop;
      markInteracting();
    }, { passive: true });

    els.list.addEventListener('wheel', markInteracting, { passive: true });
    els.list.addEventListener('touchmove', markInteracting, { passive: true });
  }

  function applyCollapsedState() {
    const host = document.getElementById(HOST_ID);
    if (!host || !state.els?.app) return;

    host.style.display = state.collapsed ? 'none' : 'block';
  }

  function renderList(reason = 'render') {
    if (!state.els) return;

    if (state.isListInteracting && reason !== 'search' && reason !== 'manual') {
      state.pendingRenderReason = reason;
      return;
    }

    const list = state.els.list;
    const footer = state.els.footer;
    const prevScrollTop = reason === 'search' ? 0 : state.listScrollTop;

    state.filteredItems = filterItems(state.items, state.query);

    const html = state.filteredItems.length
      ? state.filteredItems.map((item, idx) => `
          <button class="item${item.id === state.activeId ? ' active' : ''}" data-id="${escapeHtml(item.id)}" type="button" title="${escapeHtml(item.text)}">
            <span class="index">Q${idx + 1}</span>
            <div class="text">${escapeHtml(item.preview)}</div>
          </button>
        `).join('')
      : `<div class="empty">표시할 사용자 질문이 없음</div>`;

    list.innerHTML = html;

    list.querySelectorAll('.item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const item = state.items.find((x) => x.id === id);
        if (!item?.node) return;

        item.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        state.activeId = id;
        updateActiveClassOnly();
        flashTarget(item.node);
      });
    });

    footer.textContent = `${state.filteredItems.length}개 질문`;

    list.scrollTop = prevScrollTop;
    state.listScrollTop = list.scrollTop;
  }

  function updateActiveClassOnly() {
    if (!state.els?.list) return;

    state.els.list.querySelectorAll('.item').forEach((btn) => {
      const id = btn.getAttribute('data-id');
      btn.classList.toggle('active', id === state.activeId);
    });
  }

  function flashTarget(node) {
    if (!(node instanceof HTMLElement)) return;

    const prevTransition = node.style.transition;
    const prevOutline = node.style.outline;
    const prevOutlineOffset = node.style.outlineOffset;
    const prevBackground = node.style.background;

    node.style.transition = 'outline 0.2s ease, background 0.2s ease';
    node.style.outline = '2px solid rgba(255,255,255,0.35)';
    node.style.outlineOffset = '4px';
    node.style.background = 'rgba(255,255,255,0.06)';

    setTimeout(() => {
      node.style.transition = prevTransition;
      node.style.outline = prevOutline;
      node.style.outlineOffset = prevOutlineOffset;
      node.style.background = prevBackground;
    }, 900);
  }

  function updateActiveByViewport() {
    if (!state.items.length) return;

    const currentY = window.scrollY + window.innerHeight * 0.28;
    let active = state.items[0];

    for (const item of state.items) {
      if (item.top <= currentY) active = item;
      else break;
    }

    if (active && active.id !== state.activeId) {
      state.activeId = active.id;
      updateActiveClassOnly();
    }
  }

  const throttledActiveUpdate = throttle(updateActiveByViewport, 120);

  function scanAndRender(reason = 'scan') {
    ensureUI();

    const items = collectItems();
    const oldSig = buildSignature(state.items);
    const newSig = buildSignature(items);

    state.items = items;

    if (oldSig !== newSig || reason === 'manual' || reason === 'search' || reason === 'url-change') {
      renderList(reason);
    } else {
      state.filteredItems = filterItems(state.items, state.query);
    }

    updateActiveByViewport();
  }

  const debouncedScan = debounce((reason = 'mutation') => {
    scanAndRender(reason);
  }, 350);

  function observeConversation() {
    if (state.observer) {
      state.observer.disconnect();
    }

    state.observer = new MutationObserver((mutations) => {
      let shouldScan = false;

      for (const mutation of mutations) {
        if (isInsideOurUI(mutation.target)) continue;

        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (isInsideOurUI(node)) continue;
            shouldScan = true;
            break;
          }
          for (const node of mutation.removedNodes) {
            if (isInsideOurUI(node)) continue;
            shouldScan = true;
            break;
          }
        }

        if (shouldScan) break;
      }

      if (shouldScan) {
        debouncedScan('mutation');
      }
    });

    state.observer.observe(getConversationRoot(), {
      subtree: true,
      childList: true,
    });
  }

  function watchUrlChanges() {
    setInterval(() => {
      if (location.href !== state.lastUrl) {
        state.lastUrl = location.href;
        state.activeId = null;
        state.listScrollTop = 0;
        setTimeout(() => {
          scanAndRender('url-change');
        }, 450);
      }
    }, 800);
  }

  function boot() {
    ensureUI();
    observeConversation();
    watchUrlChanges();

    window.addEventListener('scroll', throttledActiveUpdate, { passive: true });
    window.addEventListener('resize', debouncedScan, { passive: true });

    scanAndRender('boot');
    setTimeout(() => scanAndRender('late-1'), 900);
    setTimeout(() => scanAndRender('late-2'), 2200);

    log('loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
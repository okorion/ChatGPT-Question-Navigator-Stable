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

  // Generated from src/*.js by scripts/build-userscript.mjs. Do not edit directly.

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

  function getConversationRoot() {
    const roots = [document.querySelector('main'), document.body].filter(
      (root) => root instanceof HTMLElement
    );

    return roots
      .map((root) => ({
        root,
        count: root.querySelectorAll('[data-message-author-role]').length,
      }))
      .sort((a, b) => b.count - a.count)[0]?.root || document.body;
  }
  const DOM_NODE_ID_ATTR = 'data-cgpt-qnav-id';
  let domNodeIdCounter = 0;

  function isInsideOurUI(node) {
    const host = document.getElementById(HOST_ID);
    const toggle = document.getElementById(TOGGLE_ID);
    return Boolean(
      (host && node instanceof Node && host.contains(node)) ||
      (toggle && node instanceof Node && toggle.contains(node))
    );
  }

  function getRoleNodes() {
    const root = getConversationRoot();
    const rootNodes = Array.from(root.querySelectorAll('[data-message-author-role]'));
    const documentNodes = Array.from(document.querySelectorAll('[data-message-author-role]'));

    return documentNodes.length > rootNodes.length ? documentNodes : rootNodes;
  }

  function isUsableMessageTarget(node, roleNode) {
    if (!(node instanceof HTMLElement)) return false;
    if (!node.contains(roleNode)) return false;

    return node.querySelectorAll('[data-message-author-role]').length <= 1;
  }

  function getTargetContainer(roleNode) {
    if (!(roleNode instanceof HTMLElement)) return null;

    const candidates = [
      roleNode.closest('article'),
      roleNode.closest('[data-testid^="conversation-turn-"]'),
      roleNode.closest('[data-message-id]'),
      roleNode.closest('[class*="conversation-turn"]'),
      roleNode,
    ];

    return candidates.find((candidate) => isUsableMessageTarget(candidate, roleNode)) || roleNode;
  }

  function cloneRoleNode(roleNode, { removeImages = false } = {}) {
    if (!(roleNode instanceof HTMLElement)) return null;

    const cloned = roleNode.cloneNode(true);

    const removeSelectors = [
      'button',
      'svg',
      'video',
      'audio',
      'nav',
      'form',
      'textarea',
      'input',
      'select',
      'style',
      'script',
      'template',
      '[hidden]',
      '[aria-hidden="true"]',
    ];

    if (removeImages) {
      removeSelectors.push('img');
    }

    cloned.querySelectorAll(removeSelectors.join(', ')).forEach((n) => n.remove());

    return cloned;
  }

  function readNodeText(node) {
    if (!(node instanceof HTMLElement)) return '';

    node.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    return String(node.innerText || node.textContent || '');
  }

  function normalizeDomText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function makeDomPreview(text, maxLen = 90) {
    const clean = normalizeDomText(text);
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen - 1) + '…';
  }

  function getOrAssignDomNodeId(node) {
    if (!(node instanceof HTMLElement)) return '';

    const existingId = node.getAttribute(DOM_NODE_ID_ATTR);
    if (existingId) {
      return existingId;
    }

    const id = `qnav-${++domNodeIdCounter}`;
    node.setAttribute(DOM_NODE_ID_ATTR, id);
    return id;
  }

  function getMessageId(targetNode, roleNode) {
    const directId = roleNode?.getAttribute?.('data-message-id') ||
      targetNode?.getAttribute?.('data-message-id');
    if (directId) return directId;

    return targetNode?.querySelector?.('[data-message-id]')?.getAttribute('data-message-id') || '';
  }

  function cssEscapeValue(value) {
    const raw = String(value || '');
    if (window.CSS?.escape) return window.CSS.escape(raw);
    return raw.replace(/["\\]/g, '\\$&');
  }

  function findMessageTargetById(messageId) {
    if (!messageId) return null;

    const roleNode = document.querySelector(`[data-message-id="${cssEscapeValue(messageId)}"]`);
    return roleNode ? getTargetContainer(roleNode) : null;
  }

  function buildQuestionPreview(text, hasImage, maxLen = 90) {
    const clean = normalizeDomText(text);
    if (!hasImage) return makeDomPreview(clean, maxLen);
    if (!clean) return '(이미지)';

    const suffix = ' (이미지)';
    if (clean.length + suffix.length <= maxLen) {
      return clean + suffix;
    }

    const headMaxLen = Math.max(1, maxLen - suffix.length - 1);
    return clean.slice(0, headMaxLen) + '…' + suffix;
  }

  function pickFirstMeaningfulLine(text) {
    const raw = String(text || '');
    const firstLine = raw
      .split(/\r?\n/)
      .map((line) => normalizeDomText(line))
      .find(Boolean);

    return firstLine || normalizeDomText(raw);
  }

  function extractRoleText(roleNode, { removeImages = false, firstLineOnly = false } = {}) {
    const cloned = cloneRoleNode(roleNode, { removeImages });
    const rawText = readNodeText(cloned);

    return firstLineOnly ? pickFirstMeaningfulLine(rawText) : normalizeDomText(rawText);
  }

  function messageHasImage(roleNode) {
    if (!(roleNode instanceof HTMLElement)) return false;

    const imageNode = roleNode.querySelector('img');
    return imageNode !== null;
  }

  function buildSearchText(text, hasImage, answerPreview = '') {
    const parts = [];
    const cleanText = normalizeDomText(text);

    if (cleanText) {
      parts.push(cleanText);
    }

    if (hasImage) {
      parts.push('(이미지)');
      if (answerPreview) {
        parts.push(answerPreview);
      }
    }

    return normalizeDomText(parts.join(' '));
  }

  function buildItemDedupKey(text, top) {
    return `${Math.round(top)}:${text.slice(0, 200)}`;
  }

  function collectItems() {
    const roleNodes = getRoleNodes();
    const seenRoleTargets = new Set();
    const seenKeys = new Set();
    const items = [];
    let pendingItem = null;

    for (const roleNode of roleNodes) {
      const role = roleNode.getAttribute('data-message-author-role');
      if (role !== 'user' && role !== 'assistant') continue;

      const targetNode = getTargetContainer(roleNode);
      if (!targetNode) continue;
      if (!targetNode.isConnected) continue;

      const targetId = getOrAssignDomNodeId(targetNode);
      const messageId = getMessageId(targetNode, roleNode);
      const roleTargetKey = `${role}:${targetId}`;
      if (seenRoleTargets.has(roleTargetKey)) continue;
      seenRoleTargets.add(roleTargetKey);

      if (role === 'assistant') {
        if (!pendingItem || pendingItem.answerNode) continue;

        const answerText = extractRoleText(roleNode, { removeImages: true });
        const answerPreview = answerText ? makeDomPreview(pickFirstMeaningfulLine(answerText)) : '';

        pendingItem.answerNode = targetNode;
        pendingItem.answerId = messageId || targetId;
        pendingItem.answerMessageId = messageId;
        pendingItem.answerPreview = answerPreview;
        pendingItem.searchText = buildSearchText(
          pendingItem.text,
          pendingItem.hasImage,
          pendingItem.answerPreview
        );
        continue;
      }

      const hasImage = messageHasImage(roleNode);
      const text = extractRoleText(roleNode, { removeImages: true });
      if (!hasImage && (!text || text.length < 2)) continue;

      const top = targetNode.getBoundingClientRect().top + window.scrollY;
      const preview = buildQuestionPreview(text, hasImage);
      const dedupeKey = buildItemDedupKey(preview || text || '(이미지)', top);
      if (seenKeys.has(dedupeKey)) {
        pendingItem = items[items.length - 1] || pendingItem;
        continue;
      }

      const item = {
        id: messageId || targetId,
        domId: targetId,
        messageId,
        text,
        preview,
        node: targetNode,
        top,
        hasImage,
        answerNode: null,
        answerId: '',
        answerMessageId: '',
        answerPreview: '',
        searchText: buildSearchText(text, hasImage),
      };

      seenKeys.add(dedupeKey);
      items.push(item);
      pendingItem = item;
    }

    items.sort((a, b) => a.top - b.top);
    return items;
  }

  function getConversationIdFromUrl() {
    const match = location.pathname.match(/\/c\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function isHiddenApiMessage(message) {
    const metadata = message?.metadata || {};
    return Boolean(
      metadata.is_visually_hidden_from_conversation ||
      metadata.is_user_system_message
    );
  }

  function apiPartToText(part) {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    if (typeof part.text === 'string') return part.text;
    if (typeof part.content === 'string') return part.content;
    if (typeof part.name === 'string') return part.name;
    return '';
  }

  function extractApiMessageText(message) {
    const content = message?.content;
    const parts = Array.isArray(content?.parts) ? content.parts : [];

    if (parts.length) {
      return normalizeDomText(parts.map(apiPartToText).filter(Boolean).join('\n'));
    }

    return normalizeDomText(apiPartToText(content));
  }

  function apiPartHasImage(part) {
    if (!part || typeof part !== 'object') return false;

    const contentType = String(part.content_type || part.type || '');
    if (contentType.includes('image')) return true;
    if (typeof part.asset_pointer === 'string' && part.asset_pointer) return true;
    if (part.image_url || part.image_asset_pointer) return true;

    return false;
  }

  function apiMessageHasImage(message) {
    const content = message?.content;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    return parts.some(apiPartHasImage) || apiPartHasImage(content);
  }

  function buildApiPath(conversationData) {
    const mapping = conversationData?.mapping || {};
    const path = [];
    const seen = new Set();
    let nodeId = conversationData?.current_node;

    while (nodeId && mapping[nodeId] && !seen.has(nodeId)) {
      seen.add(nodeId);
      path.push({
        id: nodeId,
        data: mapping[nodeId],
        message: mapping[nodeId].message,
      });
      nodeId = mapping[nodeId].parent;
    }

    if (path.length) {
      return path.reverse();
    }

    return Object.entries(mapping)
      .map(([id, data]) => ({ id, data, message: data.message }))
      .filter((node) => node.message)
      .sort((a, b) => (a.message?.create_time || 0) - (b.message?.create_time || 0));
  }

  function findNextApiAnswer(path, startIndex) {
    for (let i = startIndex + 1; i < path.length; i += 1) {
      const message = path[i].message;
      const role = message?.author?.role;
      if (role === 'user') return null;
      if (role !== 'assistant') continue;
      if (isHiddenApiMessage(message)) continue;

      const text = extractApiMessageText(message);
      if (text || apiMessageHasImage(message)) {
        return {
          id: path[i].message?.id || path[i].id,
          pathIndex: i,
          text,
        };
      }
    }

    return null;
  }

  function buildApiItems(conversationData) {
    const path = buildApiPath(conversationData);
    const items = [];

    path.forEach((node, pathIndex) => {
      const message = node.message;
      if (message?.author?.role !== 'user') return;
      if (isHiddenApiMessage(message)) return;

      const hasImage = apiMessageHasImage(message);
      const text = extractApiMessageText(message);
      if (!hasImage && (!text || text.length < 2)) return;

      const answer = findNextApiAnswer(path, pathIndex);
      const answerPreview = answer?.text ? makeDomPreview(pickFirstMeaningfulLine(answer.text)) : '';
      const preview = buildQuestionPreview(text, hasImage);
      const messageId = message.id || node.id;

      items.push({
        id: messageId,
        messageId,
        domId: '',
        text,
        preview,
        node: null,
        top: Number.POSITIVE_INFINITY,
        hasImage,
        answerNode: null,
        answerId: answer?.id || '',
        answerMessageId: answer?.id || '',
        answerPreview,
        searchText: buildSearchText(text, hasImage, answerPreview),
        apiIndex: items.length,
        apiPathIndex: pathIndex,
        answerApiPathIndex: answer?.pathIndex ?? -1,
      });
    });

    return items;
  }

  async function fetchConversationItemsFromApi(conversationId) {
    const sessionResponse = await fetch('/api/auth/session');
    if (!sessionResponse.ok) {
      throw new Error(`session ${sessionResponse.status}`);
    }

    const session = await sessionResponse.json();
    const accessToken = session?.accessToken;
    if (!accessToken) {
      throw new Error('missing access token');
    }

    const response = await fetch(`/backend-api/conversation/${encodeURIComponent(conversationId)}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`conversation ${response.status}`);
    }

    return buildApiItems(await response.json());
  }

  function mergeApiAndDomItems(apiItems, domItems) {
    if (!apiItems.length) return domItems;

    const domByMessageId = new Map(
      domItems
        .filter((item) => item.messageId)
        .map((item) => [item.messageId, item])
    );
    const usedDomIds = new Set();

    const merged = apiItems.map((apiItem) => {
      const domItem = domByMessageId.get(apiItem.messageId);
      if (domItem) {
        usedDomIds.add(domItem.id);
      }

      const answerNode = apiItem.answerMessageId
        ? findMessageTargetById(apiItem.answerMessageId)
        : domItem?.answerNode || null;
      const answerPreview = apiItem.answerPreview || domItem?.answerPreview || '';

      return {
        ...apiItem,
        domId: domItem?.domId || apiItem.domId,
        node: domItem?.node || findMessageTargetById(apiItem.messageId),
        top: Number.isFinite(domItem?.top) ? domItem.top : apiItem.top,
        answerNode,
        answerPreview,
        searchText: buildSearchText(apiItem.text, apiItem.hasImage, answerPreview),
      };
    });

    const extraDomItems = domItems.filter((item) => !item.messageId || !usedDomIds.has(item.id));
    return merged.concat(extraDomItems);
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
    toggle.setAttribute('aria-label', '질문 네비게이션 열기 또는 닫기');
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
      lineHeight: '1',
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
      width: 'min(360px, calc(100vw - 32px))',
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

        .searchRow {
          display: flex;
          gap: 8px;
        }

        .search {
          width: 100%;
          min-width: 0;
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

        .clearBtn {
          flex: 0 0 auto;
          padding-inline: 12px;
          white-space: nowrap;
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

        .itemTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }

        .index {
          display: inline-block;
          font-size: 11px;
          color: rgba(255,255,255,0.56);
          margin-bottom: 0;
        }

        .itemActions {
          display: flex;
          gap: 6px;
          flex: 0 0 auto;
        }

        .itemActionBtn {
          padding: 4px 8px;
          font-size: 11px;
          border-radius: 8px;
        }

        .itemActionBtn:disabled {
          opacity: 0.42;
          cursor: not-allowed;
        }

        .itemBtn {
          display: block;
          width: 100%;
          padding: 0;
          border: 0;
          background: transparent;
          color: inherit;
          text-align: left;
          cursor: pointer;
        }

        .text {
          font-size: 13px;
          line-height: 1.42;
          color: rgba(255,255,255,0.95);
          word-break: break-word;
        }

        .answerHint {
          margin-top: 8px;
          font-size: 11px;
          line-height: 1.45;
          color: rgba(255,255,255,0.62);
          word-break: break-word;
        }

        .footer {
          border-top: 1px solid rgba(255,255,255,0.08);
          padding: 8px 12px;
          font-size: 11px;
          color: rgba(255,255,255,0.45);
        }

        .btn:focus-visible,
        .itemBtn:focus-visible,
        .search:focus-visible {
          outline: 2px solid rgba(255,255,255,0.55);
          outline-offset: 2px;
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
          <div class="searchRow">
            <input class="search" id="searchInput" type="text" placeholder="질문 검색" aria-label="질문 검색" />
            <button class="btn clearBtn hidden" id="clearSearchBtn" type="button">지우기</button>
          </div>
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
      clearSearchBtn: state.shadow.getElementById('clearSearchBtn'),
      list: state.shadow.getElementById('list'),
      footer: state.shadow.getElementById('footer'),
    };

    state.els = els;

    const syncSearchUi = () => {
      const hasQuery = Boolean(normalizeText(state.query));
      els.clearSearchBtn.classList.toggle('hidden', !hasQuery);
    };

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
      syncSearchUi();
      renderList('search');
    });

    els.clearSearchBtn.addEventListener('click', () => {
      state.query = '';
      state.listScrollTop = 0;
      els.searchInput.value = '';
      syncSearchUi();
      renderList('search');
      els.searchInput.focus();
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

    syncSearchUi();
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
    const hasActiveQuery = Boolean(normalizeText(state.query));

    state.filteredItems = filterItems(state.items, state.query);

    if (state.els.clearSearchBtn) {
      state.els.clearSearchBtn.classList.toggle('hidden', !hasActiveQuery);
    }

    const emptyMessage = state.items.length
      ? '검색 결과가 없습니다'
      : '표시할 사용자 질문이 없습니다';

    const html = state.filteredItems.length
      ? state.filteredItems.map((item, idx) => `
          <div class="item${item.id === state.activeId ? ' active' : ''}" data-id="${escapeHtml(item.id)}">
            <div class="itemTop">
              <span class="index">Q${idx + 1}</span>
              <div class="itemActions">
                <button
                  class="btn itemActionBtn"
                  data-action="answer"
                  data-id="${escapeHtml(item.id)}"
                  type="button"
                  title="${escapeHtml((item.answerNode || item.answerMessageId) ? (item.answerPreview || '해당 답변으로 이동') : '아직 답변이 없습니다')}"
                  ${item.answerNode || item.answerMessageId ? '' : 'disabled'}
                >
                  답변
                </button>
              </div>
            </div>
            <button
              class="itemBtn"
              data-action="question"
              data-id="${escapeHtml(item.id)}"
              type="button"
              title="${escapeHtml(item.preview)}"
            >
              <div class="text">${escapeHtml(item.preview)}</div>
            </button>
            ${item.hasImage && item.answerPreview ? `
              <div class="answerHint" title="${escapeHtml(item.answerPreview)}">
                답변: ${escapeHtml(item.answerPreview)}
              </div>
            ` : ''}
          </div>
        `).join('')
      : `<div class="empty">${emptyMessage}</div>`;

    list.innerHTML = html;

    list.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const item = state.items.find((x) => x.id === id);
        if (!item) return;

        const navigationSerial = beginItemNavigation(id);

        try {
          if (btn.getAttribute('data-action') === 'answer') {
            await scrollToItemTarget(item, 'answer', navigationSerial);
            return;
          }

          await scrollToItemTarget(item, 'question', navigationSerial);
        } finally {
          finishItemNavigation(id, navigationSerial);
        }
      });
    });

    footer.textContent = hasActiveQuery
      ? `검색 결과 ${state.filteredItems.length} / 전체 ${state.items.length}`
      : `${state.filteredItems.length}개 질문`;

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

  function holdActiveSelection(duration = 650) {
    clearTimeout(state.activeTimer);
    state.activeTimer = setTimeout(() => {
      state.activeTimer = null;
      updateActiveByViewport();
    }, duration);
  }

  function setActiveItem(id, holdMs = 0) {
    state.activeId = id;
    if (holdMs) {
      holdActiveSelection(holdMs);
    }
    updateActiveClassOnly();
  }

  function beginItemNavigation(itemId) {
    state.navigationSerial += 1;
    state.navigationActiveId = itemId;
    setActiveItem(itemId, 12000);
    return state.navigationSerial;
  }

  function isCurrentNavigation(serial, itemId) {
    return state.navigationSerial === serial && state.navigationActiveId === itemId;
  }

  function finishItemNavigation(itemId, serial) {
    if (!isCurrentNavigation(serial, itemId)) return;
    state.navigationActiveId = '';
    setActiveItem(itemId, 1600);
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

    holdActiveSelection(1200);

    setTimeout(() => {
      node.style.transition = prevTransition;
      node.style.outline = prevOutline;
      node.style.outlineOffset = prevOutlineOffset;
      node.style.background = prevBackground;
    }, 900);
  }

  function updateActiveByViewport() {
    const positionedItems = state.items.filter((item) => Number.isFinite(item.top));
    if (!positionedItems.length) return;
    if (state.navigationActiveId) return;
    if (state.activeTimer) return;

    const currentY = window.scrollY + window.innerHeight * 0.28;
    let active = positionedItems[0];

    for (const item of positionedItems) {
      if (item.top <= currentY) active = item;
      else break;
    }

    if (active && active.id !== state.activeId) {
      state.activeId = active.id;
      updateActiveClassOnly();
    }
  }

  function getNavigationRatio(item, targetKind) {
    const targetPathIndex = targetKind === 'answer' && item.answerApiPathIndex >= 0
      ? item.answerApiPathIndex
      : item.apiPathIndex;

    if (Number.isFinite(targetPathIndex)) {
      const maxPathIndex = state.items.reduce((max, current) => {
        const currentIndexes = [current.apiPathIndex, current.answerApiPathIndex]
          .filter((value) => Number.isFinite(value) && value >= 0);
        return currentIndexes.length ? Math.max(max, ...currentIndexes) : max;
      }, 0);

      if (maxPathIndex > 0) {
        return Math.min(1, Math.max(0, targetPathIndex / maxPathIndex));
      }
    }

    const total = Math.max(1, state.items.length - 1);
    const itemIndex = Math.max(0, state.items.indexOf(item));
    const answerOffset = targetKind === 'answer' ? 0.45 : 0;
    return Math.min(1, Math.max(0, (itemIndex + answerOffset) / total));
  }

  function buildScrollProbePositions(item, targetKind) {
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (!maxY) return [0];

    const ratio = getNavigationRatio(item, targetKind);
    const candidates = new Set();
    const preferredTop = Math.round(maxY * ratio);

    [
      ratio,
      ratio - 0.015,
      ratio + 0.015,
      ratio - 0.04,
      ratio + 0.04,
      ratio - 0.1,
      ratio + 0.1,
      ratio - 0.18,
      ratio + 0.18,
    ].forEach((value) => {
      candidates.add(Math.round(maxY * Math.min(1, Math.max(0, value))));
    });

    if (Number.isFinite(item.top)) {
      candidates.add(Math.round(Math.min(maxY, Math.max(0, item.top))));
    }

    for (let i = 0; i <= 80; i += 1) {
      candidates.add(Math.round(maxY * (i / 80)));
    }

    return Array.from(candidates).sort((a, b) => {
      const distanceA = Math.abs(a - preferredTop);
      const distanceB = Math.abs(b - preferredTop);
      return distanceA - distanceB;
    });
  }

  async function revealMessageTarget(messageId, item, targetKind, serial) {
    if (!messageId) return null;

    const current = findMessageTargetById(messageId);
    if (current) return current;

    for (const top of buildScrollProbePositions(item, targetKind)) {
      if (!isCurrentNavigation(serial, item.id)) return null;
      window.scrollTo({ top, behavior: 'auto' });
      await wait(80);

      const node = findMessageTargetById(messageId);
      if (node) return node;
    }

    if (isCurrentNavigation(serial, item.id)) {
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const estimatedTop = Math.round(maxY * getNavigationRatio(item, targetKind));
      window.scrollTo({ top: estimatedTop, behavior: 'smooth' });
      await wait(160);
      return findMessageTargetById(messageId);
    }

    return null;
  }

  async function scrollToItemTarget(item, targetKind, serial) {
    const isAnswer = targetKind === 'answer';
    const messageId = isAnswer ? item.answerMessageId : item.messageId;
    const fallbackNode = isAnswer ? item.answerNode : item.node;
    const connectedFallback = fallbackNode?.isConnected ? fallbackNode : null;
    const targetNode = connectedFallback || await revealMessageTarget(messageId, item, targetKind, serial);

    if (!targetNode) return false;

    if (isAnswer) {
      item.answerNode = targetNode;
    } else {
      item.node = targetNode;
      item.top = targetNode.getBoundingClientRect().top + window.scrollY;
    }

    targetNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
    flashTarget(targetNode);
    return true;
  }

  const throttledActiveUpdate = throttle(updateActiveByViewport, 120);

  function scanAndRender(reason = 'scan') {
    ensureUI();

    queueConversationApiLoad();

    const domItems = collectItems();
    const items = mergeApiAndDomItems(state.apiItems, domItems);
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

  function resetConversationApiState(conversationId = '') {
    state.apiConversationId = conversationId;
    state.apiItems = [];
    state.apiLoading = false;
    state.apiLoaded = false;
    state.apiLoadFailed = false;
    state.apiRetryCount = 0;
    clearTimeout(state.apiRetryTimer);
    state.apiRetryTimer = null;
    state.apiRequestSerial += 1;
  }

  function queueConversationApiLoad() {
    const conversationId = getConversationIdFromUrl();

    if (!conversationId) {
      if (state.apiConversationId) {
        resetConversationApiState('');
      }
      return;
    }

    if (state.apiConversationId !== conversationId) {
      resetConversationApiState(conversationId);
    }

    if (state.apiLoading || state.apiLoaded || state.apiLoadFailed) return;

    const requestSerial = state.apiRequestSerial;
    state.apiLoading = true;

    fetchConversationItemsFromApi(conversationId)
      .then((items) => {
        if (state.apiConversationId !== conversationId || state.apiRequestSerial !== requestSerial) {
          return;
        }

        state.apiItems = items;
        state.apiLoaded = true;
        state.apiLoadFailed = false;
        state.apiRetryCount = 0;
        scanAndRender('conversation-api');
      })
      .catch((error) => {
        if (state.apiConversationId !== conversationId || state.apiRequestSerial !== requestSerial) {
          return;
        }

        state.apiLoadFailed = true;
        log('conversation api unavailable, using visible DOM only', error);

        if (state.apiRetryCount < 3) {
          state.apiRetryCount += 1;
          const retryDelay = 1200 * state.apiRetryCount;
          clearTimeout(state.apiRetryTimer);
          state.apiRetryTimer = setTimeout(() => {
            if (state.apiConversationId !== conversationId || state.apiLoaded) return;
            state.apiLoadFailed = false;
            scanAndRender('conversation-api-retry');
          }, retryDelay);
        }
      })
      .finally(() => {
        if (state.apiConversationId === conversationId && state.apiRequestSerial === requestSerial) {
          state.apiLoading = false;
        }
      });
  }

  const debouncedScan = debounce((reason = 'mutation') => {
    scanAndRender(reason);
  }, 350);

  let mutationSettledTimer = null;
  let urlSettledTimer = null;

  function clearSettledScan(timerKey) {
    if (timerKey === 'url-change') {
      clearTimeout(urlSettledTimer);
      urlSettledTimer = null;
      return;
    }

    clearTimeout(mutationSettledTimer);
    mutationSettledTimer = null;
  }

  function queueSettledScan(reason, delay = 1200, { reobserve = false, timerKey = 'mutation' } = {}) {
    clearSettledScan(timerKey);

    const timerId = setTimeout(() => {
      if (timerKey === 'url-change') {
        urlSettledTimer = null;
      } else {
        mutationSettledTimer = null;
      }
      if (reobserve) {
        observeConversation();
      }
      scanAndRender(reason);
    }, delay);

    if (timerKey === 'url-change') {
      urlSettledTimer = timerId;
    } else {
      mutationSettledTimer = timerId;
    }
  }

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
        queueSettledScan('mutation-settled');
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
        clearSettledScan('mutation');
        clearSettledScan('url-change');
        clearTimeout(state.activeTimer);
        state.activeTimer = null;
        state.navigationSerial += 1;
        state.navigationActiveId = '';
        state.lastUrl = location.href;
        state.activeId = null;
        state.listScrollTop = 0;
        resetConversationApiState(getConversationIdFromUrl());
        setTimeout(() => {
          scanAndRender('url-change');
          observeConversation();
          queueSettledScan('url-change-settled', 1200, {
            reobserve: true,
            timerKey: 'url-change',
          });
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

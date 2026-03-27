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

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

        .btn:disabled {
          opacity: 0.72;
          cursor: progress;
        }

        .btn.loading {
          border-color: rgba(96,165,250,0.45);
          background: rgba(59,130,246,0.18);
        }

        .btn.done {
          border-color: rgba(74,222,128,0.38);
          background: rgba(34,197,94,0.16);
        }

        .refreshFeedback {
          display: grid;
          gap: 6px;
          padding: 8px 12px 9px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.035);
        }

        .refreshText {
          font-size: 11px;
          line-height: 1.2;
          color: rgba(255,255,255,0.68);
        }

        .refreshTrack {
          height: 3px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255,255,255,0.10);
        }

        .refreshBar {
          width: 100%;
          height: 100%;
          border-radius: inherit;
          background: rgba(96,165,250,0.92);
          transform-origin: left center;
        }

        .refreshFeedback.loading .refreshBar {
          animation: refreshSlide 1s ease-in-out infinite;
        }

        .refreshFeedback.done .refreshBar {
          background: rgba(74,222,128,0.92);
          transform: scaleX(1);
        }

        @keyframes refreshSlide {
          0% {
            transform: translateX(-100%) scaleX(0.32);
          }
          55% {
            transform: translateX(18%) scaleX(0.62);
          }
          100% {
            transform: translateX(100%) scaleX(0.32);
          }
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
        <div class="refreshFeedback hidden" id="refreshFeedback" aria-live="polite">
          <div class="refreshTrack"><div class="refreshBar"></div></div>
          <div class="refreshText" id="refreshText">Refreshing...</div>
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
      refreshFeedback: state.shadow.getElementById('refreshFeedback'),
      refreshText: state.shadow.getElementById('refreshText'),
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
      startManualRefresh();
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
    setRefreshFeedback('idle');
  }

  function setRefreshFeedback(status) {
    state.refreshStatus = status;
    clearTimeout(state.refreshTimer);
    state.refreshTimer = null;

    const els = state.els;
    if (!els?.refreshBtn || !els.refreshFeedback || !els.refreshText) return;

    els.refreshBtn.classList.toggle('loading', status === 'loading');
    els.refreshBtn.classList.toggle('done', status === 'done');
    els.refreshBtn.disabled = status === 'loading';
    els.refreshBtn.setAttribute('aria-busy', status === 'loading' ? 'true' : 'false');
    els.refreshFeedback.classList.toggle('hidden', status === 'idle');
    els.refreshFeedback.classList.toggle('loading', status === 'loading');
    els.refreshFeedback.classList.toggle('done', status === 'done');

    if (status === 'loading') {
      els.refreshBtn.textContent = '새로고침 중';
      els.refreshText.textContent = '질문 목록을 새로고침하는 중입니다';
      return;
    }

    if (status === 'done') {
      els.refreshBtn.textContent = '완료';
      els.refreshText.textContent = '질문 목록 새로고침 완료';
      state.refreshTimer = setTimeout(() => {
        setRefreshFeedback('idle');
      }, 1400);
      return;
    }

    els.refreshBtn.textContent = '새로고침';
    els.refreshText.textContent = '';
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

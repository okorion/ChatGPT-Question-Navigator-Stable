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

  function queueSettledScan(reason, delay = 1200, { reobserve = false } = {}) {
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(() => {
      state.scanTimer = null;
      if (reobserve) {
        observeConversation();
      }
      scanAndRender(reason);
    }, delay);
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
        clearTimeout(state.scanTimer);
        state.scanTimer = null;
        clearTimeout(state.activeTimer);
        state.activeTimer = null;
        state.lastUrl = location.href;
        state.activeId = null;
        state.listScrollTop = 0;
        setTimeout(() => {
          scanAndRender('url-change');
          observeConversation();
          queueSettledScan('url-change-settled', 1200, { reobserve: true });
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

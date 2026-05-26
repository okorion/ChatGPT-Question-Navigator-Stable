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

  function finishManualRefresh(serial = state.manualRefreshSerial) {
    if (serial !== state.manualRefreshSerial || state.refreshStatus !== 'loading') return;

    clearTimeout(state.manualRefreshFallbackTimer);
    state.manualRefreshFallbackTimer = null;
    setRefreshFeedback('done');
  }

  function startManualRefresh() {
    state.manualRefreshSerial += 1;
    const refreshSerial = state.manualRefreshSerial;
    const conversationId = getConversationIdFromUrl();

    clearTimeout(state.manualRefreshFallbackTimer);
    setRefreshFeedback('loading');
    resetConversationApiState(conversationId);
    scanAndRender('manual');

    state.manualRefreshFallbackTimer = setTimeout(() => {
      finishManualRefresh(refreshSerial);
    }, conversationId ? 3200 : 450);
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
        finishManualRefresh();
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

        finishManualRefresh();
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

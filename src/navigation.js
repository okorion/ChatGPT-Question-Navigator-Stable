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

  function isDocumentScrollContainer(node) {
    return (
      node === document.scrollingElement ||
      node === document.documentElement ||
      node === document.body
    );
  }

  function getConversationScrollContainer() {
    const root = getConversationRoot();
    const candidates = [];

    for (let node = root; node instanceof HTMLElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      const overflowY = style.overflowY || '';
      const canScroll = node.scrollHeight > node.clientHeight + 16;
      if (canScroll && !['hidden', 'clip', 'visible'].includes(overflowY)) {
        candidates.push(node);
      }
    }

    const scrollingElement = document.scrollingElement || document.documentElement;
    if (scrollingElement?.scrollHeight > scrollingElement.clientHeight + 16) {
      candidates.push(scrollingElement);
    }

    return candidates.sort((a, b) => {
      const aRange = a.scrollHeight - a.clientHeight;
      const bRange = b.scrollHeight - b.clientHeight;
      return bRange - aRange;
    })[0] || scrollingElement;
  }

  function getScrollMetrics(container = getConversationScrollContainer()) {
    if (isDocumentScrollContainer(container)) {
      const scrollingElement = document.scrollingElement || document.documentElement;
      const scrollHeight = Math.max(
        scrollingElement.scrollHeight,
        document.body?.scrollHeight || 0,
        document.documentElement.scrollHeight
      );
      return {
        container,
        top: window.scrollY || scrollingElement.scrollTop || 0,
        max: Math.max(0, scrollHeight - window.innerHeight),
        viewport: window.innerHeight,
      };
    }

    return {
      container,
      top: container.scrollTop,
      max: Math.max(0, container.scrollHeight - container.clientHeight),
      viewport: container.clientHeight,
    };
  }

  function setScrollTop(container, top, behavior = 'auto') {
    const metrics = getScrollMetrics(container);
    const nextTop = Math.min(metrics.max, Math.max(0, Math.round(top)));

    if (isDocumentScrollContainer(container)) {
      window.scrollTo({ top: nextTop, behavior });
      container.scrollTop = nextTop;
      return nextTop;
    }

    container.scrollTo({ top: nextTop, behavior });
    return nextTop;
  }

  function getNodeScrollTop(node, container = getConversationScrollContainer()) {
    if (!(node instanceof HTMLElement)) return null;
    const nodeRect = node.getBoundingClientRect();

    if (isDocumentScrollContainer(container)) {
      return nodeRect.top + (window.scrollY || document.documentElement.scrollTop || 0);
    }

    const containerRect = container.getBoundingClientRect();
    return nodeRect.top - containerRect.top + container.scrollTop;
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

  function buildScrollProbePositions(item, targetKind, container) {
    const metrics = getScrollMetrics(container);
    if (!metrics.max) return [0];

    const ratio = getNavigationRatio(item, targetKind);
    const candidates = new Set();
    const preferredTop = Math.round(metrics.max * ratio);

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
      candidates.add(Math.round(metrics.max * Math.min(1, Math.max(0, value))));
    });

    const knownNode = targetKind === 'answer' ? item.answerNode : item.node;
    const knownTop = knownNode?.isConnected
      ? getNodeScrollTop(knownNode, container)
      : (isDocumentScrollContainer(container) && Number.isFinite(item.top) ? item.top : null);
    if (Number.isFinite(knownTop)) {
      candidates.add(Math.round(Math.min(metrics.max, Math.max(0, knownTop))));
    }

    for (let i = 0; i <= 80; i += 1) {
      candidates.add(Math.round(metrics.max * (i / 80)));
    }

    return Array.from(candidates).sort((a, b) => {
      const distanceA = Math.abs(a - preferredTop);
      const distanceB = Math.abs(b - preferredTop);
      return distanceA - distanceB;
    });
  }

  async function revealMessageTarget(item, targetKind, serial) {
    const container = getConversationScrollContainer();
    const current = findMessageTargetForItem(item, targetKind);
    if (current) return current;

    for (const top of buildScrollProbePositions(item, targetKind, container)) {
      if (!isCurrentNavigation(serial, item.id)) return null;
      setScrollTop(container, top, 'auto');
      await wait(120);

      const node = findMessageTargetForItem(item, targetKind);
      if (node) return node;
    }

    if (isCurrentNavigation(serial, item.id)) {
      const metrics = getScrollMetrics(container);
      const estimatedTop = Math.round(metrics.max * getNavigationRatio(item, targetKind));
      setScrollTop(container, estimatedTop, 'smooth');
      await wait(220);
      return findMessageTargetForItem(item, targetKind);
    }

    return null;
  }

  async function scrollToItemTarget(item, targetKind, serial) {
    const isAnswer = targetKind === 'answer';
    const fallbackNode = isAnswer ? item.answerNode : item.node;
    const connectedFallback = fallbackNode?.isConnected ? fallbackNode : null;
    const targetNode = connectedFallback || await revealMessageTarget(item, targetKind, serial);

    if (!targetNode) return false;

    if (isAnswer) {
      item.answerNode = targetNode;
    } else {
      item.node = targetNode;
    }
    item.top = targetNode.getBoundingClientRect().top + window.scrollY;

    targetNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
    flashTarget(targetNode);
    return true;
  }

  const throttledActiveUpdate = throttle(updateActiveByViewport, 120);

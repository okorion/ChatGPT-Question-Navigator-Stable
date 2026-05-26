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

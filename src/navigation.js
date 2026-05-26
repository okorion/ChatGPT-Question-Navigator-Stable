  function holdActiveSelection() {
    clearTimeout(state.activeTimer);
    state.activeTimer = setTimeout(() => {
      state.activeTimer = null;
      updateActiveByViewport();
    }, 650);
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

    holdActiveSelection();

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

  function buildScrollProbePositions(item, targetKind) {
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (!maxY) return [0];

    const total = Math.max(1, state.items.length - 1);
    const itemIndex = Math.max(0, state.items.indexOf(item));
    const answerOffset = targetKind === 'answer' ? 0.45 : 0;
    const ratio = Math.min(1, Math.max(0, (itemIndex + answerOffset) / total));
    const candidates = new Set();

    [
      ratio,
      ratio - 0.04,
      ratio + 0.04,
      ratio - 0.1,
      ratio + 0.1,
      ratio - 0.18,
      ratio + 0.18,
    ].forEach((value) => {
      candidates.add(Math.round(maxY * Math.min(1, Math.max(0, value))));
    });

    for (let i = 0; i <= 24; i += 1) {
      candidates.add(Math.round(maxY * (i / 24)));
    }

    return Array.from(candidates);
  }

  async function revealMessageTarget(messageId, item, targetKind) {
    if (!messageId) return null;

    const current = findMessageTargetById(messageId);
    if (current) return current;

    for (const top of buildScrollProbePositions(item, targetKind)) {
      window.scrollTo({ top, behavior: 'auto' });
      await wait(90);

      const node = findMessageTargetById(messageId);
      if (node) return node;
    }

    return null;
  }

  async function scrollToItemTarget(item, targetKind) {
    const isAnswer = targetKind === 'answer';
    const messageId = isAnswer ? item.answerMessageId : item.messageId;
    const fallbackNode = isAnswer ? item.answerNode : item.node;
    const targetNode = fallbackNode || await revealMessageTarget(messageId, item, targetKind);

    if (!targetNode) return false;

    targetNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
    flashTarget(targetNode);
    return true;
  }

  const throttledActiveUpdate = throttle(updateActiveByViewport, 120);

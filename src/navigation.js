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
    if (!state.items.length) return;
    if (state.activeTimer) return;

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

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
    const root = getConversationRoot();
    return Array.from(root.querySelectorAll('[data-message-author-role="user"]'));
  }

  function getTargetContainer(roleNode) {
    if (!(roleNode instanceof HTMLElement)) return null;

    return (
      roleNode.closest('article') ||
      roleNode.closest('[data-testid^="conversation-turn-"]') ||
      roleNode.closest('[data-message-id]') ||
      roleNode.closest('[class*="conversation-turn"]') ||
      roleNode
    );
  }

  function extractUserText(roleNode) {
    if (!(roleNode instanceof HTMLElement)) return '';

    const cloned = roleNode.cloneNode(true);

    cloned.querySelectorAll(
      'button, svg, img, video, audio, nav, form, textarea, input, select, style, script, template, [hidden], [aria-hidden="true"]'
    ).forEach((n) => n.remove());

    return normalizeText(cloned.textContent || '');
  }

  function buildItemDedupKey(text, top) {
    return `${Math.round(top)}:${text.slice(0, 200)}`;
  }

  function collectItems() {
    const roleNodes = getUserRoleNodes();
    const seenTargets = new WeakSet();
    const seenKeys = new Set();
    const items = [];

    for (const roleNode of roleNodes) {
      const targetNode = getTargetContainer(roleNode);
      if (!targetNode) continue;
      if (!targetNode.isConnected) continue;
      if (seenTargets.has(targetNode)) continue;

      const text = extractUserText(roleNode);
      if (!text || text.length < 2) continue;

      const top = targetNode.getBoundingClientRect().top + window.scrollY;
      const dedupeKey = buildItemDedupKey(text, top);
      if (seenKeys.has(dedupeKey)) continue;

      seenTargets.add(targetNode);
      seenKeys.add(dedupeKey);

      const id = getOrAssignNodeId(targetNode);
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

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
    return Array.from(document.querySelectorAll('[data-message-author-role="user"]'));
  }

  function getTargetContainer(roleNode) {
    if (!(roleNode instanceof HTMLElement)) return null;

    return (
      roleNode.closest('article') ||
      roleNode.closest('[data-testid^="conversation-turn-"]') ||
      roleNode.closest('[class*="conversation-turn"]') ||
      roleNode
    );
  }

  function extractUserText(roleNode) {
    if (!(roleNode instanceof HTMLElement)) return '';

    const cloned = roleNode.cloneNode(true);

    cloned.querySelectorAll(
      'button, svg, img, video, audio, nav, form, textarea, input, select, style, script'
    ).forEach((n) => n.remove());

    return normalizeText(cloned.textContent || '');
  }

  function collectItems() {
    const roleNodes = getUserRoleNodes();
    const seenText = new Set();
    const items = [];

    for (const roleNode of roleNodes) {
      const targetNode = getTargetContainer(roleNode);
      if (!targetNode) continue;

      const text = extractUserText(roleNode);
      if (!text || text.length < 2) continue;

      const dedupeKey = text.slice(0, 200);
      if (seenText.has(dedupeKey)) continue;
      seenText.add(dedupeKey);

      const id = getOrAssignNodeId(targetNode);
      const top = targetNode.getBoundingClientRect().top + window.scrollY;

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

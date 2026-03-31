  function getConversationRoot() {
    return document.querySelector('main') || document.body;
  }
  const DOM_NODE_ID_ATTR = 'data-cgpt-qnav-id';
  let domNodeIdCounter = 0;

  function isInsideOurUI(node) {
    const host = document.getElementById(HOST_ID);
    const toggle = document.getElementById(TOGGLE_ID);
    return Boolean(
      (host && node instanceof Node && host.contains(node)) ||
      (toggle && node instanceof Node && toggle.contains(node))
    );
  }

  function getRoleNodes() {
    const root = getConversationRoot();
    return Array.from(root.querySelectorAll('[data-message-author-role]'));
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

  function cloneRoleNode(roleNode, { removeImages = false } = {}) {
    if (!(roleNode instanceof HTMLElement)) return null;

    const cloned = roleNode.cloneNode(true);

    const removeSelectors = [
      'button',
      'svg',
      'video',
      'audio',
      'nav',
      'form',
      'textarea',
      'input',
      'select',
      'style',
      'script',
      'template',
      '[hidden]',
      '[aria-hidden="true"]',
    ];

    if (removeImages) {
      removeSelectors.push('img');
    }

    cloned.querySelectorAll(removeSelectors.join(', ')).forEach((n) => n.remove());

    return cloned;
  }

  function readNodeText(node) {
    if (!(node instanceof HTMLElement)) return '';

    node.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    return String(node.innerText || node.textContent || '');
  }

  function normalizeDomText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function makeDomPreview(text, maxLen = 90) {
    const clean = normalizeDomText(text);
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen - 1) + '…';
  }

  function getOrAssignDomNodeId(node) {
    if (!(node instanceof HTMLElement)) return '';

    const existingId = node.getAttribute(DOM_NODE_ID_ATTR);
    if (existingId) {
      return existingId;
    }

    const id = `qnav-${++domNodeIdCounter}`;
    node.setAttribute(DOM_NODE_ID_ATTR, id);
    return id;
  }

  function buildQuestionPreview(text, hasImage, maxLen = 90) {
    const clean = normalizeDomText(text);
    if (!hasImage) return makeDomPreview(clean, maxLen);
    if (!clean) return '(이미지)';

    const suffix = ' (이미지)';
    if (clean.length + suffix.length <= maxLen) {
      return clean + suffix;
    }

    const headMaxLen = Math.max(1, maxLen - suffix.length - 1);
    return clean.slice(0, headMaxLen) + '…' + suffix;
  }

  function pickFirstMeaningfulLine(text) {
    const raw = String(text || '');
    const firstLine = raw
      .split(/\r?\n/)
      .map((line) => normalizeDomText(line))
      .find(Boolean);

    return firstLine || normalizeDomText(raw);
  }

  function extractRoleText(roleNode, { removeImages = false, firstLineOnly = false } = {}) {
    const cloned = cloneRoleNode(roleNode, { removeImages });
    const rawText = readNodeText(cloned);

    return firstLineOnly ? pickFirstMeaningfulLine(rawText) : normalizeDomText(rawText);
  }

  function messageHasImage(roleNode) {
    if (!(roleNode instanceof HTMLElement)) return false;

    const imageNode = roleNode.querySelector('img');
    return imageNode !== null;
  }

  function buildSearchText(text, hasImage, answerPreview = '') {
    const parts = [];
    const cleanText = normalizeDomText(text);

    if (cleanText) {
      parts.push(cleanText);
    }

    if (hasImage) {
      parts.push('(이미지)');
      if (answerPreview) {
        parts.push(answerPreview);
      }
    }

    return normalizeDomText(parts.join(' '));
  }

  function buildItemDedupKey(text, top) {
    return `${Math.round(top)}:${text.slice(0, 200)}`;
  }

  function collectItems() {
    const roleNodes = getRoleNodes();
    const seenRoleTargets = new Set();
    const seenKeys = new Set();
    const items = [];
    let pendingItem = null;

    for (const roleNode of roleNodes) {
      const role = roleNode.getAttribute('data-message-author-role');
      if (role !== 'user' && role !== 'assistant') continue;

      const targetNode = getTargetContainer(roleNode);
      if (!targetNode) continue;
      if (!targetNode.isConnected) continue;

      const targetId = getOrAssignDomNodeId(targetNode);
      const roleTargetKey = `${role}:${targetId}`;
      if (seenRoleTargets.has(roleTargetKey)) continue;
      seenRoleTargets.add(roleTargetKey);

      if (role === 'assistant') {
        if (!pendingItem || pendingItem.answerNode) continue;

        const answerText = extractRoleText(roleNode, { removeImages: true });
        const answerPreview = answerText ? makeDomPreview(pickFirstMeaningfulLine(answerText)) : '';

        pendingItem.answerNode = targetNode;
        pendingItem.answerId = targetId;
        pendingItem.answerPreview = answerPreview;
        pendingItem.searchText = buildSearchText(
          pendingItem.text,
          pendingItem.hasImage,
          pendingItem.answerPreview
        );
        continue;
      }

      const hasImage = messageHasImage(roleNode);
      const text = extractRoleText(roleNode, { removeImages: true });
      if (!hasImage && (!text || text.length < 2)) continue;

      const top = targetNode.getBoundingClientRect().top + window.scrollY;
      const preview = buildQuestionPreview(text, hasImage);
      const dedupeKey = buildItemDedupKey(preview || text || '(이미지)', top);
      if (seenKeys.has(dedupeKey)) {
        pendingItem = items[items.length - 1] || pendingItem;
        continue;
      }

      const item = {
        id: targetId,
        text,
        preview,
        node: targetNode,
        top,
        hasImage,
        answerNode: null,
        answerId: '',
        answerPreview: '',
        searchText: buildSearchText(text, hasImage),
      };

      seenKeys.add(dedupeKey);
      items.push(item);
      pendingItem = item;
    }

    items.sort((a, b) => a.top - b.top);
    return items;
  }

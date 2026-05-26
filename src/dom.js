  function getConversationRoot() {
    const roots = [document.querySelector('main'), document.body].filter(
      (root) => root instanceof HTMLElement
    );

    return roots
      .map((root) => ({
        root,
        count: root.querySelectorAll('[data-message-author-role]').length,
      }))
      .sort((a, b) => b.count - a.count)[0]?.root || document.body;
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
    const rootNodes = Array.from(root.querySelectorAll('[data-message-author-role]'));
    const documentNodes = Array.from(document.querySelectorAll('[data-message-author-role]'));

    return documentNodes.length > rootNodes.length ? documentNodes : rootNodes;
  }

  function isUsableMessageTarget(node, roleNode) {
    if (!(node instanceof HTMLElement)) return false;
    if (!node.contains(roleNode)) return false;

    return node.querySelectorAll('[data-message-author-role]').length <= 1;
  }

  function getTargetContainer(roleNode) {
    if (!(roleNode instanceof HTMLElement)) return null;

    const candidates = [
      roleNode.closest('article'),
      roleNode.closest('[data-testid^="conversation-turn-"]'),
      roleNode.closest('[data-message-id]'),
      roleNode.closest('[class*="conversation-turn"]'),
      roleNode,
    ];

    return candidates.find((candidate) => isUsableMessageTarget(candidate, roleNode)) || roleNode;
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

  function getMessageId(targetNode, roleNode) {
    const directId = roleNode?.getAttribute?.('data-message-id') ||
      targetNode?.getAttribute?.('data-message-id');
    if (directId) return directId;

    return targetNode?.querySelector?.('[data-message-id]')?.getAttribute('data-message-id') || '';
  }

  function cssEscapeValue(value) {
    const raw = String(value || '');
    if (window.CSS?.escape) return window.CSS.escape(raw);
    return raw.replace(/["\\]/g, '\\$&');
  }

  function findMessageTargetById(messageId) {
    if (!messageId) return null;

    const roleNode = document.querySelector(`[data-message-id="${cssEscapeValue(messageId)}"]`);
    return roleNode ? getTargetContainer(roleNode) : null;
  }

  function isSameMessageText(candidateText, expectedText, expectedPreview = '') {
    const candidate = normalizeDomText(candidateText);
    const expected = normalizeDomText(expectedText);
    const preview = normalizeDomText(expectedPreview);

    if (!candidate) return false;
    if (expected && candidate === expected) return true;
    if (preview && makeDomPreview(candidate) === preview) return true;

    if (expected && expected.length >= 24) {
      const head = expected.slice(0, 160);
      if (candidate.includes(head)) return true;

      const candidateHead = candidate.slice(0, 160);
      if (candidateHead.length >= 80 && expected.includes(candidateHead)) {
        return true;
      }
    }

    return false;
  }

  function findRoleTargetByText(role, expectedText, expectedPreview = '', hasImage = false) {
    for (const roleNode of getRoleNodes()) {
      if (roleNode.getAttribute('data-message-author-role') !== role) continue;

      const candidateHasImage = messageHasImage(roleNode);
      const candidateText = extractRoleText(roleNode, { removeImages: true });
      if (isSameMessageText(candidateText, expectedText, expectedPreview)) {
        return getTargetContainer(roleNode);
      }

      if (hasImage && candidateHasImage && !normalizeDomText(expectedText)) {
        return getTargetContainer(roleNode);
      }
    }

    return null;
  }

  function findMessageTargetForItem(item, targetKind) {
    if (!item) return null;

    const isAnswer = targetKind === 'answer';
    const messageId = isAnswer ? item.answerMessageId : item.messageId;
    const byId = findMessageTargetById(messageId);
    if (byId) return byId;

    if (isAnswer) {
      return findRoleTargetByText('assistant', item.answerText || item.answerPreview, item.answerPreview);
    }

    return findRoleTargetByText('user', item.text, item.preview, item.hasImage);
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
      const messageId = getMessageId(targetNode, roleNode);
      const roleTargetKey = `${role}:${targetId}`;
      if (seenRoleTargets.has(roleTargetKey)) continue;
      seenRoleTargets.add(roleTargetKey);

      if (role === 'assistant') {
        if (!pendingItem || pendingItem.answerNode) continue;

        const answerText = extractRoleText(roleNode, { removeImages: true });
        const answerPreview = answerText ? makeDomPreview(pickFirstMeaningfulLine(answerText)) : '';

        pendingItem.answerNode = targetNode;
        pendingItem.answerId = messageId || targetId;
        pendingItem.answerMessageId = messageId;
        pendingItem.answerText = answerText;
        pendingItem.answerPreview = answerPreview;
        pendingItem.answerTop = targetNode.getBoundingClientRect().top + window.scrollY;
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
        id: messageId || targetId,
        domId: targetId,
        messageId,
        text,
        preview,
        node: targetNode,
        top,
        hasImage,
        answerNode: null,
        answerId: '',
        answerMessageId: '',
        answerText: '',
        answerPreview: '',
        answerTop: Number.POSITIVE_INFINITY,
        searchText: buildSearchText(text, hasImage),
      };

      seenKeys.add(dedupeKey);
      items.push(item);
      pendingItem = item;
    }

    items.sort((a, b) => a.top - b.top);
    return items;
  }

  function getConversationIdFromUrl() {
    const match = location.pathname.match(/\/c\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function isHiddenApiMessage(message) {
    const metadata = message?.metadata || {};
    return Boolean(
      metadata.is_visually_hidden_from_conversation ||
      metadata.is_user_system_message
    );
  }

  function apiPartToText(part) {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    if (typeof part.text === 'string') return part.text;
    if (typeof part.content === 'string') return part.content;
    if (typeof part.name === 'string') return part.name;
    return '';
  }

  function extractApiMessageText(message) {
    const content = message?.content;
    const parts = Array.isArray(content?.parts) ? content.parts : [];

    if (parts.length) {
      return normalizeDomText(parts.map(apiPartToText).filter(Boolean).join('\n'));
    }

    return normalizeDomText(apiPartToText(content));
  }

  function apiPartHasImage(part) {
    if (!part || typeof part !== 'object') return false;

    const contentType = String(part.content_type || part.type || '');
    if (contentType.includes('image')) return true;
    if (typeof part.asset_pointer === 'string' && part.asset_pointer) return true;
    if (part.image_url || part.image_asset_pointer) return true;

    return false;
  }

  function apiMessageHasImage(message) {
    const content = message?.content;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    return parts.some(apiPartHasImage) || apiPartHasImage(content);
  }

  function buildApiPath(conversationData) {
    const mapping = conversationData?.mapping || {};
    const path = [];
    const seen = new Set();
    let nodeId = conversationData?.current_node;

    while (nodeId && mapping[nodeId] && !seen.has(nodeId)) {
      seen.add(nodeId);
      path.push({
        id: nodeId,
        data: mapping[nodeId],
        message: mapping[nodeId].message,
      });
      nodeId = mapping[nodeId].parent;
    }

    if (path.length) {
      return path.reverse();
    }

    return Object.entries(mapping)
      .map(([id, data]) => ({ id, data, message: data.message }))
      .filter((node) => node.message)
      .sort((a, b) => (a.message?.create_time || 0) - (b.message?.create_time || 0));
  }

  function findNextApiAnswer(path, startIndex) {
    for (let i = startIndex + 1; i < path.length; i += 1) {
      const message = path[i].message;
      const role = message?.author?.role;
      if (role === 'user') return null;
      if (role !== 'assistant') continue;
      if (isHiddenApiMessage(message)) continue;

      const text = extractApiMessageText(message);
      if (text || apiMessageHasImage(message)) {
        return {
          id: path[i].message?.id || path[i].id,
          pathIndex: i,
          text,
        };
      }
    }

    return null;
  }

  function buildApiItems(conversationData) {
    const path = buildApiPath(conversationData);
    const items = [];

    path.forEach((node, pathIndex) => {
      const message = node.message;
      if (message?.author?.role !== 'user') return;
      if (isHiddenApiMessage(message)) return;

      const hasImage = apiMessageHasImage(message);
      const text = extractApiMessageText(message);
      if (!hasImage && (!text || text.length < 2)) return;

      const answer = findNextApiAnswer(path, pathIndex);
      const answerText = answer?.text || '';
      const answerPreview = answer?.text ? makeDomPreview(pickFirstMeaningfulLine(answer.text)) : '';
      const preview = buildQuestionPreview(text, hasImage);
      const messageId = message.id || node.id;

      items.push({
        id: messageId,
        messageId,
        domId: '',
        text,
        preview,
        node: null,
        top: Number.POSITIVE_INFINITY,
        hasImage,
        answerNode: null,
        answerId: answer?.id || '',
        answerMessageId: answer?.id || '',
        answerText,
        answerPreview,
        answerTop: Number.POSITIVE_INFINITY,
        searchText: buildSearchText(text, hasImage, answerPreview),
        apiIndex: items.length,
        apiPathIndex: pathIndex,
        answerApiPathIndex: answer?.pathIndex ?? -1,
      });
    });

    return items;
  }

  async function fetchConversationItemsFromApi(conversationId) {
    const sessionResponse = await fetch('/api/auth/session');
    if (!sessionResponse.ok) {
      throw new Error(`session ${sessionResponse.status}`);
    }

    const session = await sessionResponse.json();
    const accessToken = session?.accessToken;
    if (!accessToken) {
      throw new Error('missing access token');
    }

    const response = await fetch(`/backend-api/conversation/${encodeURIComponent(conversationId)}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`conversation ${response.status}`);
    }

    return buildApiItems(await response.json());
  }

  function mergeApiAndDomItems(apiItems, domItems) {
    if (!apiItems.length) return domItems;

    const domByMessageId = new Map(
      domItems
        .filter((item) => item.messageId)
        .map((item) => [item.messageId, item])
    );
    const usedDomIds = new Set();

    const merged = apiItems.map((apiItem) => {
      const domItem = domByMessageId.get(apiItem.messageId);
      if (domItem) {
        usedDomIds.add(domItem.id);
      }

      const answerNode = apiItem.answerMessageId
        ? findMessageTargetForItem(apiItem, 'answer')
        : domItem?.answerNode || null;
      const answerPreview = apiItem.answerPreview || domItem?.answerPreview || '';
      const answerTop = Number.isFinite(domItem?.answerTop)
        ? domItem.answerTop
        : apiItem.answerTop;

      return {
        ...apiItem,
        domId: domItem?.domId || apiItem.domId,
        node: domItem?.node || findMessageTargetForItem(apiItem, 'question'),
        top: Number.isFinite(domItem?.top) ? domItem.top : apiItem.top,
        answerNode,
        answerPreview,
        answerTop,
        searchText: buildSearchText(apiItem.text, apiItem.hasImage, answerPreview),
      };
    });

    const extraDomItems = domItems.filter((item) => !item.messageId || !usedDomIds.has(item.id));
    return merged.concat(extraDomItems);
  }

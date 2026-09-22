
const $ = id => document.getElementById(id);

let treeRoot = null;
let currentFolderId = null;
let currentRootId = null;
let expandedFolders = new Set();
let contentCollapsedFolders = new Set();
let selectedIds = new Set();
let validatedImport = null;
let simpleMode = null;
let toastTimer = null;
let searchTimer = null;
let sectionObserver = null;
let suppressObserver = false;

const SVG = {
  chevron: `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.65 2.15a.5.5 0 000 .7L7.79 6 4.65 9.15a.5.5 0 10.7.7l3.5-3.5a.5.5 0 000-.7l-3.5-3.5a.5.5 0 00-.7 0z"/></svg>`,
  folder: `<svg class="folder-icon" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M7.17 3c.27 0 .53.07.76.21l.14.09 1.6 1.2h5.83A2.5 2.5 0 0118 7v7.5a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 012 14.5v-9A2.5 2.5 0 014.5 3h2.67zm.99 4.03a1.5 1.5 0 01-.94.46l-.15.01H3v7A1.5 1.5 0 004.5 16h11a1.5 1.5 0 001.5-1.5V7a1.5 1.5 0 00-1.5-1.5H9.62L8.16 7.03zM7.16 4H4.5A1.5 1.5 0 003 5.5v1h4.07a.5.5 0 00.36-.16L8.7 5.02 7.47 4.1a.5.5 0 00-.31-.1z"/></svg>`,
  star: `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M9.1 2.9a1 1 0 011.8 0l1.93 3.91 4.31.63a1 1 0 01.56 1.7l-3.13 3.05.74 4.3a1 1 0 01-1.45 1.05L10 15.51l-3.86 2.03a1 1 0 01-1.45-1.05l.74-4.3L2.3 9.14a1 1 0 01.56-1.7l4.31-.63L9.1 2.9zm.9.44L8.07 7.25a1 1 0 01-.75.55L3 8.43l3.12 3.04a1 1 0 01.3.89l-.75 4.3 3.86-2.03a1 1 0 01.94 0l3.86 2.03-.74-4.3a1 1 0 01.29-.89L17 8.43l-4.32-.63a1 1 0 01-.75-.55L10 3.35z"/></svg>`,
  close: `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4.09 4.22l.06-.07a.5.5 0 01.63-.06l.07.06L10 9.29l5.15-5.14a.5.5 0 01.63-.06l.07.06c.18.17.2.44.06.63l-.06.07L10.71 10l5.14 5.15c.18.17.2.44.06.63l-.06.07a.5.5 0 01-.63.06l-.07-.06L10 10.71l-5.15 5.14a.5.5 0 01-.63.06l-.07-.06a.5.5 0 01-.06-.63l.06-.07L9.29 10 4.15 4.85a.5.5 0 01-.06-.63l.06-.07z"/></svg>`
};

function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

function esc(value='') {
  return String(value).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function normalizeUrl(url='') {
  let v = String(url).trim();
  if (v.length > 1 && v.endsWith('/')) {
    try {
      const u = new URL(v);
      if (u.pathname !== '/') v = v.slice(0, -1);
    } catch {}
  }
  return v;
}

function faviconUrl(pageUrl) {
  return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`);
}

async function safeGet(id) {
  try { return await chrome.bookmarks.get(id); } catch { return null; }
}

async function loadExpansionState() {
  const data = await chrome.storage.local.get([
    'favoritosPlusExpanded',
    'favoritosPlusContentCollapsed'
  ]);

  if (Array.isArray(data.favoritosPlusExpanded)) {
    expandedFolders = new Set(data.favoritosPlusExpanded);
  }

  if (Array.isArray(data.favoritosPlusContentCollapsed)) {
    contentCollapsedFolders = new Set(data.favoritosPlusContentCollapsed);
  }
}

async function saveExpansionState() {
  await chrome.storage.local.set({favoritosPlusExpanded:[...expandedFolders]});
}

async function saveContentCollapseState() {
  await chrome.storage.local.set({
    favoritosPlusContentCollapsed:[...contentCollapsedFolders]
  });
}

function folderChildren(node) {function folderChildren(node) {
  return (node.children || []).filter(x => !x.url);
}

function isSystemRoot(id) {
  return (treeRoot?.children || []).some(root => root.id === id);
}

function rootForNode(id) {
  let node = findNodeById(treeRoot, id);
  if (!node) return null;

  while (node && node.parentId && node.parentId !== '0') {
    node = findNodeById(treeRoot, node.parentId);
  }

  return node && node.parentId === '0' ? node : null;
}

function expandSidebarAncestors(id) {
  let node = findNodeById(treeRoot, id);
  while (node && node.parentId && node.parentId !== '0') {
    const parent = findNodeById(treeRoot, node.parentId);
    if (!parent) break;
    expandedFolders.add(parent.id);
    node = parent;
  }
}

function nodeContainsId(node, id) {
  if (!node) return false;
  if (node.id === id) return true;
  return (node.children || []).some(child => nodeContainsId(child, id));
}

function dragNodeId(event) {
  return event.dataTransfer.getData('text/bookmarkplus-id') ||
    event.dataTransfer.getData('text/bookmark-id');
}

function beginDrag(event, node) {
  event.dataTransfer.setData('text/bookmarkplus-id', node.id);
  event.dataTransfer.effectAllowed = 'move';
}

async function moveNodeInto(movingId, parentId) {
  if (!movingId || !parentId || movingId === parentId) return;

  const moving = (await safeGet(movingId))?.[0];
  if (!moving) return;

  if (!moving.url && isSystemRoot(moving.id)) {
    showToast('As pastas principais do Edge não podem ser movidas.');
    return;
  }

  if (!moving.url) {
    const movingTree = findNodeById(treeRoot, moving.id);
    if (nodeContainsId(movingTree, parentId)) {
      showToast('Não é possível mover uma pasta para dentro dela mesma.');
      return;
    }
  }

  try {
    await chrome.bookmarks.move(movingId, {parentId});
    await refreshAll();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível mover este item.');
  }
}

async function moveNodeRelative(movingId, targetId, after=false) {
  if (!movingId || !targetId || movingId === targetId) return;

  const moving = (await safeGet(movingId))?.[0];
  const target = (await safeGet(targetId))?.[0];
  if (!moving || !target || !target.parentId) return;

  if (!moving.url && isSystemRoot(moving.id)) {
    showToast('As pastas principais do Edge não podem ser movidas.');
    return;
  }

  const parentId = target.parentId;

  if (!moving.url) {
    const movingTree = findNodeById(treeRoot, moving.id);
    if (nodeContainsId(movingTree, parentId)) {
      showToast('Não é possível mover uma pasta para dentro dela mesma.');
      return;
    }
  }

  let index = Number(target.index ?? 0) + (after ? 1 : 0);
  if (moving.parentId === parentId && Number(moving.index) < index) index--;

  try {
    await chrome.bookmarks.move(movingId, {parentId, index:Math.max(0,index)});
    await refreshAll();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível reordenar este item.');
  }
}

function clearDropClasses(element) {
  element.classList.remove('drop-before','drop-after','drop-inside','drag-over');
}

function renderTree() {
  const nav = $('bookmarkTree');
  nav.innerHTML = '';
  const roots = treeRoot?.children || [];

  for (const root of roots) {
    nav.appendChild(buildTreeNode(root, 0, true));
  }
}

function buildTreeNode(node, depth=0, isRoot=false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node';

  const row = document.createElement('div');
  row.className = 'tree-row' + (node.id === currentFolderId ? ' selected' : '');
  row.style.paddingLeft = `${8 + depth * 18}px`;
  row.dataset.id = node.id;

  const folders = folderChildren(node);
  const hasFolders = folders.length > 0;
  const expanded = expandedFolders.has(node.id);

  const chev = document.createElement('button');
  chev.className = 'tree-chevron' + (hasFolders ? '' : ' placeholder') + (expanded ? ' expanded' : '');
  chev.innerHTML = SVG.chevron;
  chev.title = expanded ? 'Recolher' : 'Expandir';
  chev.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!hasFolders) return;
    if (expandedFolders.has(node.id)) expandedFolders.delete(node.id);
    else expandedFolders.add(node.id);
    await saveExpansionState();
    renderTree();
  });

  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  icon.innerHTML = (isRoot && depth === 0 && node === (treeRoot?.children || [])[0]) ? SVG.star : SVG.folder;

  const title = document.createElement('span');
  title.className = 'tree-title';
  title.textContent = node.title || 'Favoritos';
  title.title = node.title || 'Favoritos';

  row.append(chev, icon, title);
  row.addEventListener('click', () => openFolder(node.id));

  if (!isRoot) {
    row.draggable = true;
    row.addEventListener('dragstart', e => {
      beginDrag(e, node);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
  }

  row.addEventListener('dragover', e => {
    if (!dragNodeId(e)) return;
    e.preventDefault();
    e.stopPropagation();
    row.classList.add('drag-over');
    e.dataTransfer.dropEffect = 'move';
  });
  row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
  row.addEventListener('drop', async e => {
    e.preventDefault();
    e.stopPropagation();
    row.classList.remove('drag-over');
    await moveNodeInto(dragNodeId(e), node.id);
  });

  wrapper.appendChild(row);

  if (hasFolders) {
    const kids = document.createElement('div');
    kids.className = 'tree-children' + (expanded ? ' open' : '');
    for (const child of folders) kids.appendChild(buildTreeNode(child, depth + 1, false));
    wrapper.appendChild(kids);
  }
  return wrapper;
}

async function refreshTree() {
  const tree = await chrome.bookmarks.getTree();
  treeRoot = tree?.[0] || null;
  renderTree();
  refreshTargetFolderSelect();
}

async function openFolder(id, smooth=true) {
  const got = await safeGet(id);
  const node = got?.[0];
  if (!node || node.url) return;

  const nextRoot = rootForNode(id);
  const rootChanged = nextRoot && nextRoot.id !== currentRootId;

  currentFolderId = id;
  if (nextRoot) currentRootId = nextRoot.id;

  expandSidebarAncestors(id);
  await saveExpansionState();

  $('searchInput').value = '';
  $('clearSearch').classList.add('hidden');
  selectedIds.clear();
  updateSelectionUI();

  if (rootChanged || !document.querySelector(`.folder-section[data-folder-id="${CSS.escape(id)}"]`)) {
    await renderAllContents();
  }

  const section = document.querySelector(`.folder-section[data-folder-id="${CSS.escape(id)}"]`);
  if (section) {
    suppressObserver = true;
    markActiveSection(id);
    section.scrollIntoView({behavior: smooth ? 'smooth' : 'auto', block:'start'});
    setTimeout(() => { suppressObserver = false; }, smooth ? 450 : 60);
  }

  const root = findNodeById(treeRoot, currentRootId);
  $('mainTitle').textContent = root?.title || 'Favoritos';
  $('currentSectionLabel').textContent = folderPath(node) || node.title || 'Favoritos';
  renderTree();

  const url = new URL(location.href);
  url.searchParams.set('id', id);
  history.replaceState(null, '', url);
}

function folderPath(node) {function folderPath(node) {
  const chain = [];
  let cur = node;
  const byId = new Map();
  const walk = n => {
    byId.set(n.id, n);
    for (const c of n.children || []) walk(c);
  };
  if (treeRoot) walk(treeRoot);

  while (cur && cur.id !== '0') {
    if (cur.title) chain.unshift(cur.title);
    cur = byId.get(cur.parentId);
  }
  return chain.join(' › ');
}

function markActiveSection(id) {
  document.querySelectorAll('.folder-section').forEach(sec => {
    sec.classList.toggle('active-section', sec.dataset.folderId === id);
  });
  document.querySelectorAll('.tree-row').forEach(row => {
    row.classList.toggle('selected', row.dataset.id === id);
  });
}

function setupSectionObserver() {
  if (sectionObserver) sectionObserver.disconnect();
  const root = $('resultsSection');
  const sections = [...document.querySelectorAll('.folder-section')];
  if (!sections.length) return;

  sectionObserver = new IntersectionObserver(entries => {
    if (suppressObserver) return;
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (!visible.length) return;

    const id = visible[0].target.dataset.folderId;
    const got = findNodeById(treeRoot, id);
    if (!got) return;

    currentFolderId = id;
    markActiveSection(id);
    $('currentSectionLabel').textContent = folderPath(got) || got.title || 'Favoritos';
  }, {
    root,
    threshold:[0,0.01],
    rootMargin:'-8px 0px -72% 0px'
  });

  sections.forEach(sec => sectionObserver.observe(sec));
}

function findNodeById(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const c of node.children || []) {
    const found = findNodeById(c,id);
    if (found) return found;
  }
  return null;
}

async function renderAllContents() {
  const list = $('bookmarkList');
  list.innerHTML = '';

  const roots = treeRoot?.children || [];
  let root = findNodeById(treeRoot, currentRootId);

  if (!root || root.parentId !== '0') {
    root = roots[0] || null;
    currentRootId = root?.id || null;
  }

  if (!root) {
    $('emptyState').classList.remove('hidden');
    return;
  }

  $('mainTitle').textContent = root.title || 'Favoritos';

  let totalLinks = 0;

  const buildFolderSection = (folder, depth=0, path=[], isRoot=false) => {
    const section = document.createElement('section');
    section.className = 'folder-section';
    section.dataset.folderId = folder.id;

    const header = document.createElement('div');
    header.className = 'folder-section-header';
    header.style.paddingLeft = `${10 + depth * 18}px`;

    const collapsed = contentCollapsedFolders.has(folder.id);

    const chev = document.createElement('button');
    chev.className = 'content-chevron' + (collapsed ? '' : ' expanded');
    chev.innerHTML = SVG.chevron;
    chev.title = collapsed ? 'Expandir pasta' : 'Recolher pasta';
    chev.addEventListener('click', async e => {
      e.stopPropagation();
      if (contentCollapsedFolders.has(folder.id)) contentCollapsedFolders.delete(folder.id);
      else contentCollapsedFolders.add(folder.id);
      await saveContentCollapseState();
      await renderAllContents();
      renderTree();
    });

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.innerHTML = isRoot && folder === roots[0] ? SVG.star : SVG.folder;

    const title = document.createElement('span');
    title.className = 'folder-section-title';
    title.textContent = folder.title || 'Favoritos';

    const pathText = document.createElement('span');
    pathText.className = 'folder-section-path';
    const fullPath = [...path, folder.title || 'Favoritos'];
    pathText.textContent = fullPath.join(' › ');
    pathText.title = pathText.textContent;

    header.append(chev, icon, title, pathText);

    if (!isRoot) {
      header.draggable = true;
      header.addEventListener('dragstart', e => {
        beginDrag(e, folder);
        header.classList.add('dragging');
      });
      header.addEventListener('dragend', () => header.classList.remove('dragging'));
    }

    header.addEventListener('click', async e => {
      if (e.target.closest('button')) return;
      if (contentCollapsedFolders.has(folder.id)) contentCollapsedFolders.delete(folder.id);
      else contentCollapsedFolders.add(folder.id);
      await saveContentCollapseState();
      await renderAllContents();
      renderTree();
    });

    header.addEventListener('dragover', e => {
      if (!dragNodeId(e)) return;
      e.preventDefault();
      e.stopPropagation();

      clearDropClasses(header);

      if (isRoot) {
        header.classList.add('drop-inside');
        return;
      }

      const rect = header.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / Math.max(1, rect.height);
      if (ratio < .25) header.classList.add('drop-before');
      else if (ratio > .75) header.classList.add('drop-after');
      else header.classList.add('drop-inside');
    });

    header.addEventListener('dragleave', () => clearDropClasses(header));
    header.addEventListener('drop', async e => {
      e.preventDefault();
      e.stopPropagation();

      const movingId = dragNodeId(e);
      const inside = isRoot || header.classList.contains('drop-inside');
      const after = header.classList.contains('drop-after');
      clearDropClasses(header);

      if (inside) await moveNodeInto(movingId, folder.id);
      else await moveNodeRelative(movingId, folder.id, after);
    });

    const body = document.createElement('div');
    body.className = 'folder-section-body' + (collapsed ? ' collapsed' : '');

    if (!collapsed) {
      const children = folder.children || [];

      if (!children.length) {
        const empty = document.createElement('div');
        empty.className = 'folder-empty';
        empty.style.paddingLeft = `${48 + depth * 18}px`;
        empty.textContent = 'Pasta vazia';
        body.appendChild(empty);
      } else {
        for (const child of children) {
          if (child.url) {
            body.appendChild(buildBookmarkRow(child, depth, folder.id, child.index ?? 0));
            totalLinks++;
          } else {
            body.appendChild(buildFolderSection(child, depth + 1, fullPath, false));
          }
        }
      }
    }

    body.addEventListener('dragover', e => {
      if (!dragNodeId(e)) return;
      if (e.target.closest('.bookmark-item,.folder-section-header')) return;
      e.preventDefault();
      e.stopPropagation();
      body.classList.add('drop-inside');
    });
    body.addEventListener('dragleave', e => {
      if (e.currentTarget.contains(e.relatedTarget)) return;
      body.classList.remove('drop-inside');
    });
    body.addEventListener('drop', async e => {
      if (e.target.closest('.bookmark-item,.folder-section-header')) return;
      e.preventDefault();
      e.stopPropagation();
      body.classList.remove('drop-inside');
      await moveNodeInto(dragNodeId(e), folder.id);
    });

    section.append(header, body);
    return section;
  };

  list.appendChild(buildFolderSection(root, 0, [], true));

  $('emptyState').classList.toggle('hidden', totalLinks > 0 || (root.children || []).length > 0);
  setupSectionObserver();
  markActiveSection(currentFolderId);
}

function buildBookmarkRow(item, depth=0, parentId=null, index=0, searchMode=false) {function buildBookmarkRow(item, depth=0, parentId=null, index=0, searchMode=false) {
  const row = document.createElement('div');
  row.className = 'bookmark-item' + (selectedIds.has(item.id) ? ' selected' : '');
  row.dataset.id = item.id;
  row.dataset.depth = depth;
  row.dataset.parentId = parentId || item.parentId || '';
  row.style.paddingLeft = `${4 + depth * 18}px`;
  row.draggable = !searchMode;

  const checkWrap = document.createElement('div');
  checkWrap.className = 'item-check-wrap';
  const check = document.createElement('input');
  check.className = 'item-check';
  check.type = 'checkbox';
  check.checked = selectedIds.has(item.id);
  check.addEventListener('click', e => e.stopPropagation());
  check.addEventListener('change', () => {
    if (check.checked) selectedIds.add(item.id);
    else selectedIds.delete(item.id);
    row.classList.toggle('selected', check.checked);
    updateSelectionUI();
  });
  checkWrap.appendChild(check);

  const icon = document.createElement('div');
  const img = document.createElement('img');
  img.className = 'favicon';
  img.src = faviconUrl(item.url);
  img.alt = '';
  img.onerror = () => { img.style.visibility = 'hidden'; };
  icon.appendChild(img);

  const text = document.createElement('div');
  text.className = 'item-text';
  const a = document.createElement('a');
  a.className = 'item-title';
  a.textContent = item.title || item.url;
  a.title = item.title || item.url;
  a.href = item.url;
  a.target = '_blank';
  a.rel = 'noreferrer';
  a.addEventListener('click', e => e.stopPropagation());

  const url = document.createElement('span');
  url.className = 'item-url';
  url.textContent = item.url;
  url.title = item.url;
  text.append(a,url);

  const del = document.createElement('button');
  del.className = 'delete-button';
  del.title = 'Excluir';
  del.setAttribute('aria-label', `Excluir ${item.title || 'item'}`);
  del.innerHTML = SVG.close;
  del.addEventListener('click', async e => {
    e.stopPropagation();
    await deleteBookmarkItem(item);
  });

  row.append(checkWrap,icon,text,del);

  if (!searchMode) {
    row.addEventListener('dragstart', e => {
      beginDrag(e, item);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      clearDropClasses(row);
    });
    row.addEventListener('dragover', e => {
      if (!dragNodeId(e)) return;
      e.preventDefault();
      e.stopPropagation();
      clearDropClasses(row);

      const rect = row.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      row.classList.add(after ? 'drop-after' : 'drop-before');
      e.dataTransfer.dropEffect = 'move';
    });
    row.addEventListener('dragleave', () => clearDropClasses(row));
    row.addEventListener('drop', async e => {
      e.preventDefault();
      e.stopPropagation();
      const movingId = dragNodeId(e);
      const after = row.classList.contains('drop-after');
      clearDropClasses(row);
      await moveNodeRelative(movingId, item.id, after);
    });
  }

  return row;
}

async function renderFolderContents(id) {
  await openFolder(id, false);
}

function renderItems(items, searchMode=false) {
  const list = $('bookmarkList');
  list.innerHTML = '';
  $('emptyState').classList.toggle('hidden', items.length !== 0);

  items.forEach((item,index) => {
    if (item.url) {
      list.appendChild(buildBookmarkRow(item,0,item.parentId,index,true));
    } else {
      const section = document.createElement('section');
      section.className = 'folder-section';
      section.dataset.folderId = item.id;

      const header = document.createElement('div');
      header.className = 'folder-section-header';
      const icon = document.createElement('span');
      icon.className = 'tree-icon';
      icon.innerHTML = SVG.folder;
      const title = document.createElement('span');
      title.className = 'folder-section-title';
      title.textContent = item.title || 'Pasta';
      header.append(icon,title);
      header.addEventListener('click', async () => {
        $('searchInput').value='';
        await renderAllContents();
        await openFolder(item.id);
      });
      section.appendChild(header);
      list.appendChild(section);
    }
  });
}

async function deleteBookmarkItem(item) {
  if (!item.url) {
    const ok = confirm(`Excluir a pasta "${item.title}" e tudo que está dentro dela?`);
    if (!ok) return;
    await chrome.bookmarks.removeTree(item.id);
  } else {
    await chrome.bookmarks.remove(item.id);
  }
  selectedIds.delete(item.id);
  await refreshAll();
}

function updateSelectionUI() {
  const count = selectedIds.size;
  $('selectionTitle').classList.toggle('hidden', count === 0);
  $('selectionTitle').textContent = count ? `${count} selecionado${count > 1 ? 's' : ''}` : '';
  $('deleteSelectedButton').classList.toggle('hidden', count === 0);
  for (const id of ['showBarButton','addFavoriteButton','addFolderButton','moreButton']) {
    $(id).classList.toggle('hidden', count > 0);
  }
}

async function deleteSelected() {
  if (!selectedIds.size) return;
  const ok = confirm(`Excluir ${selectedIds.size} item(ns) selecionado(s)?`);
  if (!ok) return;
  const ids = [...selectedIds];
  for (const id of ids) {
    const got = await safeGet(id);
    const item = got?.[0];
    if (!item) continue;
    if (item.url) await chrome.bookmarks.remove(id);
    else await chrome.bookmarks.removeTree(id);
  }
  selectedIds.clear();
  await refreshAll();
}

async function runSearch(query) {
  const q = query.trim();
  $('clearSearch').classList.toggle('hidden', !q);
  selectedIds.clear();
  updateSelectionUI();

  if (!q) {
    const root = findNodeById(treeRoot, currentRootId);
    $('mainTitle').textContent = root?.title || 'Favoritos';
    await renderAllContents();
    const active = findNodeById(treeRoot, currentFolderId);
    if (active) $('currentSectionLabel').textContent = folderPath(active) || active.title || 'Favoritos';
    return;
  }

  $('mainTitle').textContent = 'Resultados da pesquisa';
  $('currentSectionLabel').textContent = `Pesquisa: ${q}`;
  const results = await chrome.bookmarks.search(q);
  const cleaned = results.filter(x => x.id !== '0');
  renderItems(cleaned, true);
}

function positionMenu() {
  const btn = $('moreButton');
  const rect = btn.getBoundingClientRect();
  const menu = $('moreMenu');
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${Math.max(8, innerWidth - rect.right)}px`;
}

function toggleMoreMenu(force) {
  const menu = $('moreMenu');
  const shouldOpen = force !== undefined ? force : menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !shouldOpen);
  $('moreButton').setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  if (shouldOpen) positionMenu();
}

function showBackdropIfNeeded() {
  const anyOpen = ['editorModal','simpleModal','backupModal'].some(id => !$(id).classList.contains('hidden'));
  $('modalBackdrop').classList.toggle('hidden', !anyOpen);
}

function openModal(id) {
  $(id).classList.remove('hidden');
  showBackdropIfNeeded();
}

function closeModal(id) {
  $(id).classList.add('hidden');
  showBackdropIfNeeded();
}

function openSimpleModal(mode) {
  simpleMode = mode;
  const isFolder = mode === 'folder';
  $('simpleModalTitle').textContent = isFolder ? 'Adicionar pasta' : 'Adicionar favorito';
  $('simpleUrlField').classList.toggle('hidden', isFolder);
  $('simpleName').value = '';
  $('simpleUrl').value = '';
  openModal('simpleModal');
  setTimeout(() => $('simpleName').focus(), 0);
}

async function saveSimpleItem() {
  const name = $('simpleName').value.trim();
  const url = $('simpleUrl').value.trim();

  if (simpleMode === 'folder') {
    await chrome.bookmarks.create({parentId: currentFolderId, title: name || 'Nova pasta'});
  } else {
    if (!url) return showToast('Informe a URL.');
    let finalUrl = url;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(finalUrl)) finalUrl = `https://${finalUrl}`;
    try { new URL(finalUrl); } catch { return showToast('URL inválida.'); }
    await chrome.bookmarks.create({
      parentId: currentFolderId,
      title: name || finalUrl,
      url: finalUrl
    });
  }

  closeModal('simpleModal');
  await refreshAll();
}

function toSerializable(node) {
  if (node.url) return {type:'bookmark',title:node.title || '',url:node.url,dateAdded:node.dateAdded || null};
  return {
    type:'folder',
    title:node.title || '',
    dateAdded:node.dateAdded || null,
    children:(node.children || []).map(toSerializable)
  };
}

function countNodes(nodes) {
  let links=0, folders=0, invalid=0;
  const urls=[];
  const walk = arr => {
    for (const n of arr) {
      if (n.type === 'folder') {
        folders++;
        walk(n.children || []);
      } else {
        links++;
        urls.push(normalizeUrl(n.url));
        try { new URL(n.url); } catch { invalid++; }
      }
    }
  };
  walk(nodes);
  const map = new Map();
  for (const u of urls) map.set(u,(map.get(u)||0)+1);
  const duplicates = [...map.values()].reduce((sum,n) => sum + Math.max(0,n-1),0);
  return {links,folders,duplicates,invalid};
}

function htmlEncode(s='') {
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function netscapeForFolder(folder) {
  const sec = ms => ms ? Math.floor(ms/1000) : Math.floor(Date.now()/1000);
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- Generated by Favoritos+ -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    `    <DT><H3 ADD_DATE="${sec(folder.dateAdded)}" LAST_MODIFIED="0">${htmlEncode(folder.title || 'Favoritos')}</H3>`,
    '    <DL><p>'
  ];
  const add = (nodes,level) => {
    const pad='    '.repeat(level);
    for (const n of nodes) {
      if (n.url) {
        lines.push(`${pad}<DT><A HREF="${htmlEncode(n.url)}" ADD_DATE="${sec(n.dateAdded)}">${htmlEncode(n.title || n.url)}</A>`);
      } else {
        lines.push(`${pad}<DT><H3 ADD_DATE="${sec(n.dateAdded)}" LAST_MODIFIED="0">${htmlEncode(n.title || 'Pasta')}</H3>`);
        lines.push(`${pad}<DL><p>`);
        add(n.children || [], level+1);
        lines.push(`${pad}</DL><p>`);
      }
    }
  };
  add(folder.children || [],2);
  lines.push('    </DL><p>','</DL><p>');
  return lines.join('\n');
}

async function copyCurrentHTML() {
  const sub = await chrome.bookmarks.getSubTree(currentFolderId);
  const folder = sub?.[0];
  if (!folder) return;
  const html = netscapeForFolder(folder);
  await navigator.clipboard.writeText(html);
  const stats = countNodes((folder.children || []).map(toSerializable));
  showToast(`HTML copiado: ${stats.links} links e ${stats.folders} pastas.`);
}

function decodeHTML(value='') {
  const ta = document.createElement('textarea');
  ta.innerHTML = value;
  return ta.value;
}
function stripTags(value='') {
  return decodeHTML(String(value).replace(/<[^>]*>/g,'')).trim();
}
function readAttr(tag,name) {
  const re = new RegExp(name + String.raw`\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`,'i');
  const m = tag.match(re);
  return m ? decodeHTML(m[1] ?? m[2] ?? m[3] ?? '') : '';
}

function parseNetscapeHTML(html) {
  if (!html || html.trim().length < 20) throw new Error('O conteúdo está vazio ou curto demais.');

  const tokenRe=/<DL\b[^>]*>|<\/DL\s*>|<H3\b[^>]*>[\s\S]*?<\/H3\s*>|<A\b[^>]*>[\s\S]*?<\/A\s*>/gi;
  const root=[];
  const stack=[root];
  let firstDL=false,pending=null,recognized=0,m;

  while((m=tokenRe.exec(html))!==null){
    const token=m[0];

    if(/^<DL\b/i.test(token)){
      if(!firstDL) firstDL=true;
      else if(pending){stack.push(pending.children);pending=null;}
      continue;
    }

    if(/^<\/DL/i.test(token)){
      if(stack.length>1) stack.pop();
      pending=null;
      continue;
    }

    if(/^<H3\b/i.test(token)){
      const end=token.indexOf('>');
      const open=token.slice(0,end+1);
      const inner=token.slice(end+1).replace(/<\/H3\s*>$/i,'');
      const folder={
        type:'folder',
        title:stripTags(inner)||'Pasta',
        toolbar:/PERSONAL_TOOLBAR_FOLDER\s*=\s*["']?true/i.test(open),
        children:[]
      };
      stack[stack.length-1].push(folder);
      pending=folder;
      recognized++;
      continue;
    }

    if(/^<A\b/i.test(token)){
      const end=token.indexOf('>');
      const open=token.slice(0,end+1);
      const inner=token.slice(end+1).replace(/<\/A\s*>$/i,'');
      const url=readAttr(open,'href').trim();
      if(url){
        stack[stack.length-1].push({
          type:'bookmark',
          title:stripTags(inner)||url,
          url
        });
        recognized++;
      }
      pending=null;
    }
  }

  if(!firstDL || !recognized || !root.length) throw new Error('Nenhuma estrutura válida de favoritos foi reconhecida.');

  let parsed=root;
  if(parsed.length===1 && parsed[0].type==='folder'){
    parsed=parsed[0].children || [];
  } else {
    const toolbar=parsed.find(x=>x.type==='folder' && x.toolbar);
    if(toolbar) parsed=toolbar.children || [];
  }
  return parsed;
}

function previewText(nodes) {
  const lines=[];
  const walk=(arr,depth=0)=>{
    for(const n of arr){
      const pad='  '.repeat(depth);
      lines.push(n.type==='folder' ? `${pad}📁 ${n.title}` : `${pad}• ${n.title}`);
      if(n.type==='folder') walk(n.children||[],depth+1);
      if(lines.length>=300){lines.push('… prévia limitada a 300 linhas …');return;}
    }
  };
  walk(nodes);
  return lines.join('\n');
}

function validateImportHTML() {
  const card=$('validationCard');
  try{
    const nodes=parseNetscapeHTML($('htmlInput').value);
    const stats=countNodes(nodes);
    validatedImport={nodes,stats};
    $('validationStatus').textContent=stats.invalid ? 'HTML válido, com URLs para revisar' : 'HTML válido';
    $('validationCard').querySelector('.validation-head').classList.toggle('error',stats.invalid>0);
    $('statLinks').textContent=stats.links;
    $('statFolders').textContent=stats.folders;
    $('statDuplicates').textContent=stats.duplicates;
    $('statInvalid').textContent=stats.invalid;
    card.classList.remove('hidden');
    $('previewText').textContent=previewText(nodes);
    $('previewBlock').classList.remove('hidden');
    $('applyButton').disabled=false;
    showToast(`Validado: ${stats.links} links e ${stats.folders} pastas.`);
  }catch(err){
    validatedImport=null;
    $('validationStatus').textContent=err.message || 'HTML inválido';
    $('validationCard').querySelector('.validation-head').classList.add('error');
    $('statLinks').textContent='0';
    $('statFolders').textContent='0';
    $('statDuplicates').textContent='0';
    $('statInvalid').textContent='—';
    card.classList.remove('hidden');
    $('previewBlock').classList.add('hidden');
    $('applyButton').disabled=true;
    showToast('Não foi possível validar o HTML.');
  }
}

async function refreshTargetFolderSelect() {
  const sel=$('targetFolder');
  if(!sel) return;
  const old=sel.value;
  sel.innerHTML='';
  const roots=treeRoot?.children || [];
  const addOptions=(nodes,depth=0)=>{
    for(const n of nodes){
      if(n.url) continue;
      const opt=document.createElement('option');
      opt.value=n.id;
      opt.textContent=`${'— '.repeat(depth)}${n.title || 'Favoritos'}`;
      sel.appendChild(opt);
      addOptions(n.children || [],depth+1);
    }
  };
  addOptions(roots);
  if([...sel.options].some(o=>o.value===old)) sel.value=old;
  else if([...sel.options].some(o=>o.value===currentFolderId)) sel.value=currentFolderId;
}

async function serializeChildren(folderId) {
  const sub=await chrome.bookmarks.getSubTree(folderId);
  return (sub?.[0]?.children || []).map(toSerializable);
}

async function saveBackup(folderId) {
  const target=(await safeGet(folderId))?.[0];
  if(!target) throw new Error('Pasta de destino não encontrada.');
  const backup={
    timestamp:Date.now(),
    targetId:folderId,
    targetTitle:target.title || 'Favoritos',
    children:await serializeChildren(folderId)
  };
  const stored=await chrome.storage.local.get('favoritosPlusBackups');
  const backups=Array.isArray(stored.favoritosPlusBackups) ? stored.favoritosPlusBackups : [];
  backups.unshift(backup);
  await chrome.storage.local.set({favoritosPlusBackups:backups.slice(0,5)});
  return backup;
}

async function clearFolder(folderId) {
  const children=await chrome.bookmarks.getChildren(folderId);
  for(const child of children){
    if(child.url) await chrome.bookmarks.remove(child.id);
    else await chrome.bookmarks.removeTree(child.id);
  }
}

async function createNodes(parentId,nodes) {
  for(const n of nodes){
    if(n.type==='folder'){
      const f=await chrome.bookmarks.create({parentId,title:n.title || 'Pasta'});
      await createNodes(f.id,n.children || []);
    }else if(n.url){
      await chrome.bookmarks.create({parentId,title:n.title || n.url,url:n.url});
    }
  }
}

async function collectExistingUrls(folderId) {
  const sub=await chrome.bookmarks.getSubTree(folderId);
  const set=new Set();
  const walk=n=>{
    if(n.url) set.add(normalizeUrl(n.url));
    for(const c of n.children || []) walk(c);
  };
  if(sub?.[0]) walk(sub[0]);
  return set;
}

async function findChildFolder(parentId,title) {
  const kids=await chrome.bookmarks.getChildren(parentId);
  return kids.find(x=>!x.url && x.title===title) || null;
}

async function mergeNodes(parentId,nodes,existingUrls) {
  for(const n of nodes){
    if(n.type==='folder'){
      let folder=await findChildFolder(parentId,n.title || 'Pasta');
      if(!folder) folder=await chrome.bookmarks.create({parentId,title:n.title || 'Pasta'});
      await mergeNodes(folder.id,n.children || [],existingUrls);
    }else if(n.url){
      const key=normalizeUrl(n.url);
      if(existingUrls.has(key)) continue;
      await chrome.bookmarks.create({parentId,title:n.title || n.url,url:n.url});
      existingUrls.add(key);
    }
  }
}

async function applyImport() {
  if(!validatedImport) return validateImportHTML();
  const targetId=$('targetFolder').value;
  const mode=$('applyMode').value;
  const target=(await safeGet(targetId))?.[0];
  if(!target || target.url) return showToast('Destino inválido.');

  $('applyButton').disabled=true;
  try{
    await saveBackup(targetId);
    if(mode==='replace'){
      await clearFolder(targetId);
      await createNodes(targetId,validatedImport.nodes);
    }else{
      const existing=await collectExistingUrls(targetId);
      await mergeNodes(targetId,validatedImport.nodes,existing);
    }
    closeModal('editorModal');
    currentFolderId=targetId;
    await refreshAll();
    showToast(`Aplicado em "${target.title}". Backup salvo.`);
  }catch(err){
    console.error(err);
    showToast(`Erro: ${err.message || err}`);
  }finally{
    $('applyButton').disabled=false;
  }
}

async function restoreBackup(backup,index=-1) {
  const target=(await safeGet(backup.targetId))?.[0];
  if(!target || target.url) return showToast('A pasta original deste backup não existe mais.');

  try{
    const current={
      timestamp:Date.now(),
      targetId:backup.targetId,
      targetTitle:target.title || 'Favoritos',
      children:await serializeChildren(backup.targetId)
    };

    await clearFolder(backup.targetId);
    await createNodes(backup.targetId,backup.children || []);

    const stored=await chrome.storage.local.get('favoritosPlusBackups');
    const backups=Array.isArray(stored.favoritosPlusBackups) ? stored.favoritosPlusBackups : [];
    const next=[current,...backups.filter((_,i)=>i!==index)].slice(0,5);
    await chrome.storage.local.set({favoritosPlusBackups:next});

    currentFolderId=backup.targetId;
    closeModal('backupModal');
    closeModal('editorModal');
    await refreshAll();
    showToast(`Backup restaurado em "${backup.targetTitle}".`);
  }catch(err){
    console.error(err);
    showToast(`Erro ao restaurar: ${err.message || err}`);
  }
}

async function restoreLatest() {
  const stored=await chrome.storage.local.get('favoritosPlusBackups');
  const backups=Array.isArray(stored.favoritosPlusBackups) ? stored.favoritosPlusBackups : [];
  if(!backups.length) return showToast('Ainda não há backup.');
  await restoreBackup(backups[0],0);
}

async function openBackups() {
  toggleMoreMenu(false);
  const stored=await chrome.storage.local.get('favoritosPlusBackups');
  const backups=Array.isArray(stored.favoritosPlusBackups) ? stored.favoritosPlusBackups : [];
  const wrap=$('backupList');
  wrap.innerHTML='';

  if(!backups.length){
    wrap.innerHTML='<div class="info-box">Ainda não há backups salvos.</div>';
  }else{
    backups.forEach((b,i)=>{
      const entry=document.createElement('div');
      entry.className='backup-entry';
      const date=new Date(b.timestamp);
      entry.innerHTML=`
        <div class="meta">
          <div class="name">${esc(b.targetTitle || 'Favoritos')}</div>
          <div class="date">${date.toLocaleString('pt-BR')}</div>
        </div>
      `;
      const btn=document.createElement('button');
      btn.textContent='Restaurar';
      btn.addEventListener('click',()=>restoreBackup(b,i));
      entry.appendChild(btn);
      wrap.appendChild(entry);
    });
  }
  openModal('backupModal');
}

async function openOrganizer() {
  toggleMoreMenu(false);
  validatedImport=null;
  $('htmlInput').value='';
  $('validationCard').classList.add('hidden');
  $('previewBlock').classList.add('hidden');
  $('applyButton').disabled=true;
  await refreshTargetFolderSelect();
  $('targetFolder').value=currentFolderId;
  openModal('editorModal');
}

async function refreshAll() {
  await refreshTree();

  let current = findNodeById(treeRoot, currentFolderId);
  if (!current || current.url) {
    current = treeRoot?.children?.[0] || null;
    currentFolderId = current?.id || null;
  }

  const root = rootForNode(currentFolderId) || treeRoot?.children?.[0] || null;
  currentRootId = root?.id || null;

  await renderAllContents();

  const active = findNodeById(treeRoot, currentFolderId);
  if (active) $('currentSectionLabel').textContent = folderPath(active) || active.title || 'Favoritos';

  renderTree();
  updateSelectionUI();
}

async function init() {
  await loadExpansionState();
  await refreshTree();

  const requested = new URLSearchParams(location.search).get('id');
  const requestedNode = requested ? findNodeById(treeRoot, requested) : null;
  currentFolderId = requestedNode && !requestedNode.url
    ? requestedNode.id
    : (treeRoot?.children?.[0]?.id || null);

  const root = rootForNode(currentFolderId) || treeRoot?.children?.[0] || null;
  currentRootId = root?.id || null;

  if (currentFolderId) {
    expandSidebarAncestors(currentFolderId);
    await saveExpansionState();
    await renderAllContents();
    await openFolder(currentFolderId, false);
  }

  chrome.bookmarks.onCreated.addListener(refreshAll);
  chrome.bookmarks.onRemoved.addListener(refreshAll);
  chrome.bookmarks.onChanged.addListener(refreshAll);
  chrome.bookmarks.onMoved.addListener(refreshAll);
}

$('searchInput').addEventListener('input',()=>{$('searchInput').addEventListener('input',()=>{
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>runSearch($('searchInput').value),180);
});
$('clearSearch').addEventListener('click',()=>{
  $('searchInput').value='';
  runSearch('');
  $('searchInput').focus();
});

$('moreButton').addEventListener('click',e=>{
  e.stopPropagation();
  toggleMoreMenu();
});
document.addEventListener('click',e=>{
  if(!$('moreMenu').contains(e.target) && e.target!==$('moreButton')) toggleMoreMenu(false);
});
addEventListener('resize',()=>{if(!$('moreMenu').classList.contains('hidden')) positionMenu();});

$('copyHtmlMenu').addEventListener('click',async()=>{
  toggleMoreMenu(false);
  await copyCurrentHTML();
});
$('organizeMenu').addEventListener('click',openOrganizer);
$('backupMenu').addEventListener('click',openBackups);

$('addFavoriteButton').addEventListener('click',()=>openSimpleModal('favorite'));
$('addFolderButton').addEventListener('click',()=>openSimpleModal('folder'));
$('simpleSave').addEventListener('click',saveSimpleItem);
$('deleteSelectedButton').addEventListener('click',deleteSelected);

$('showBarButton').addEventListener('click',()=>{
  showToast('Atalho do Edge para mostrar/ocultar a barra: Ctrl + Shift + B');
});

$('pasteButton').addEventListener('click',async()=>{
  try{
    $('htmlInput').value=await navigator.clipboard.readText();
    $('validationCard').classList.add('hidden');
    $('previewBlock').classList.add('hidden');
    $('applyButton').disabled=true;
    validatedImport=null;
    showToast('HTML colado. Clique em Validar.');
  }catch{
    showToast('Use Ctrl+V para colar o HTML.');
  }
});
$('validateButton').addEventListener('click',validateImportHTML);
$('applyButton').addEventListener('click',applyImport);
$('restoreLastButton').addEventListener('click',restoreLatest);
$('htmlInput').addEventListener('input',()=>{
  validatedImport=null;
  $('applyButton').disabled=true;
  $('validationCard').classList.add('hidden');
  $('previewBlock').classList.add('hidden');
});

document.querySelectorAll('[data-close-modal]').forEach(btn=>{
  btn.addEventListener('click',()=>closeModal(btn.dataset.closeModal));
});
$('modalBackdrop').addEventListener('click',()=>{
  ['editorModal','simpleModal','backupModal'].forEach(closeModal);
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    toggleMoreMenu(false);
    ['editorModal','simpleModal','backupModal'].forEach(closeModal);
  }
});

init().catch(err=>{
  console.error(err);
  showToast('Erro ao carregar os favoritos.');
});

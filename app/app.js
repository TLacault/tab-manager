let workspaces = {};
let currentId = null;

// Load saved workspaces & last opened workspace
chrome.storage.local.get(["workspaces", "lastWorkspaceId"], (data) => {
  workspaces = data.workspaces || {};
  if (data.lastWorkspaceId && workspaces[data.lastWorkspaceId]) {
    loadWorkspace(data.lastWorkspaceId, true);
  } else {
    renderWorkspaceList();
  }
});

// React to workspace updates from other sources
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.workspaces) {
    chrome.storage.local.get("workspaces", (data) => {
      workspaces = data.workspaces || {};
      renderWorkspaceList();
      renderWorkspaceTabs();
    });
  }
});

function saveData() {
  chrome.storage.local.set({ workspaces });
}

function renderWorkspaceList() {
  const list = document.getElementById("workspaceList");
  list.innerHTML = "";

  for (const id in workspaces) {
    const ws = workspaces[id];
    const li = document.createElement("li");
    li.textContent = ws.name;
    li.onclick = () => loadWorkspace(id);

    if (id === currentId) {
      li.style.background = "rgba(255, 255, 255, 0.3)";
      li.style.outline = "1px solid rgba(255, 255, 255, 0.5)";

      const closeBtn = createIconButton("❌", () => closeWorkspaceTabs(id));
      const deleteBtn = createIconButton("🗑", () => deleteWorkspace(id));
      const renameBtn = createIconButton("✏️", () => {
        const newName = prompt("Rename Workspace", ws.name);
        if (newName) {
          ws.name = newName;
          saveData();
          renderWorkspaceList();
        }
      });

      li.append(closeBtn, deleteBtn, renameBtn);
    }

    list.appendChild(li);
  }
}

function createIconButton(text, handler) {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.onclick = (e) => {
    e.stopPropagation();
    handler();
  };
  return btn;
}

function loadWorkspace(id, skipOpen = false) {
  if (currentId === id && !skipOpen) return;
  currentId = id;

  chrome.runtime.sendMessage({ type: "setWorkspace", workspaceId: id });
  chrome.storage.local.set({ lastWorkspaceId: id });

  const ws = workspaces[id];
  document.getElementById("workspaceTitle").textContent = ws.name;

  if (!skipOpen) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (!tab.pinned && !tab.url.includes("app/index.html")) {
          chrome.tabs.remove(tab.id);
        }
      });

      setTimeout(() => {
        ws.tabs.forEach((t) => {
          chrome.tabs.create({ url: t.url, active: false });
        });
      }, 500);
    });
  }

  renderWorkspaceList();
  renderWorkspaceTabs();
}

function renderWorkspaceTabs() {
  const tabList = document.getElementById("tabList");
  const resList = document.getElementById("resourceList");
  const ws = workspaces[currentId];

  tabList.innerHTML = "";
  resList.innerHTML = "";

  (ws.tabs || []).forEach((tab, index) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = tab.title || tab.url;
    link.onclick = () => openOrActivateTab(tab.url);

    const closeBtn = createIconButton("❌", () => {
      closeTabByUrl(tab.url);
      ws.tabs.splice(index, 1);
      saveData();
      renderWorkspaceTabs();
    });

    const saveBtn = createIconButton("📁", () => {
      ws.resources.push(tab);
      saveData();
      renderWorkspaceTabs();
    });

    const websiteIcon = createFavicon(tab.url);

    li.append(closeBtn, saveBtn, websiteIcon, link);
    tabList.appendChild(li);
  });

  (ws.resources || []).forEach((link, i) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = link.title || link.url;

    chrome.tabs.query({}, (tabs) => {
      if (tabs.find((t) => t.url === link.url)) {
        li.style.background = "rgba(255, 255, 255, 0.3)";
      }
    });

    a.onclick = () => openOrActivateTab(link.url);

    const removeBtn = createIconButton("🗑", () => {
      ws.resources.splice(i, 1);
      saveData();
      renderWorkspaceTabs();
    });

    const renameBtn = createIconButton("✏️", () => {
      const newName = prompt("Rename Resource", link.title || link.url);
      if (newName) {
        link.title = newName;
        saveData();
        renderWorkspaceTabs();
      }
    });

    const websiteIcon = createFavicon(link.url);

    li.append(removeBtn, renameBtn, websiteIcon, a);
    resList.appendChild(li);
  });
}

function openOrActivateTab(url) {
  chrome.tabs.query({}, (tabs) => {
    const match = tabs.find((t) => t.url === url);
    if (match) {
      chrome.tabs.update(match.id, { active: true });
    } else {
      chrome.tabs.create({ url, active: false });
    }
  });
}

function closeTabByUrl(url) {
  chrome.tabs.query({}, (tabs) => {
    const target = tabs.find((t) => t.url === url);
    if (target) chrome.tabs.remove(target.id);
  });
}

function createFavicon(url) {
  const img = document.createElement("img");
  const domain = url.startsWith("http") ? new URL(url).hostname : "example.com";
  img.src = `https://www.google.com/s2/favicons?domain=${domain}`;
  return img;
}

function addWorkspace() {
  const name = prompt("Workspace Name");
  if (!name) return;
  const id = Date.now().toString();
  workspaces[id] = { name, tabs: [], resources: [] };
  saveData();
  renderWorkspaceList();
}

function closeWorkspaceTabs(id) {
  const ws = workspaces[id];
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (!tab.pinned && ws.tabs.some((t) => t.url === tab.url)) {
        chrome.tabs.remove(tab.id);
      }
    });
  });
}

function deleteWorkspace(id) {
  if (!confirm(`Delete workspace "${workspaces[id].name}"?`)) return;
  delete workspaces[id];
  if (currentId === id) {
    currentId = null;
    document.getElementById("workspaceTitle").textContent = "No Workspace";
  }
  saveData();
  renderWorkspaceList();
  renderWorkspaceTabs();
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("addWorkspaceBtn")
    .addEventListener("click", addWorkspace);
});

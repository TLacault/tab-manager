let workspaces = {};
let currentId = null;

chrome.storage.local.get(["workspaces", "lastWorkspaceId"], (data) => {
  if (data.workspaces) {
    workspaces = data.workspaces;
  }
  if (data.lastWorkspaceId && workspaces[data.lastWorkspaceId]) {
    loadWorkspace(data.lastWorkspaceId, true);
  } else {
    renderWorkspaceList();
  }
});

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
      li.style.backgroundColor = "#d0e0ff";
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "❌";
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        closeWorkspaceTabs(id);
      };
      li.appendChild(closeBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "🗑";
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteWorkspace(id);
      };
      li.appendChild(deleteBtn);

      const renameBtn = document.createElement("button");
      renameBtn.textContent = "✏️";
      renameBtn.onclick = (e) => {
        e.stopPropagation();
        const newName = prompt("Rename Workspace", ws.name);
        if (newName) {
          ws.name = newName;
          saveData();
          renderWorkspaceList();
        }
      };
      li.appendChild(renameBtn);
    }

    list.appendChild(li);
  }
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
    link.onclick = () => {
      chrome.tabs.query({}, (tabs) => {
        const target = tabs.find((t) => t.url === tab.url);
        if (target) chrome.tabs.update(target.id, { active: true });
      });
    };

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "❌";
    closeBtn.onclick = () => {
      chrome.tabs.query({}, (tabs) => {
        const target = tabs.find((t) => t.url === tab.url);
        if (target) chrome.tabs.remove(target.id);
      });
      workspaces[currentId].tabs.splice(index, 1);
      saveData();
      renderWorkspaceTabs();
    };
    li.appendChild(closeBtn);

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "📁";
    saveBtn.onclick = () => {
      workspaces[currentId].resources.push(tab);
      saveData();
      renderWorkspaceTabs();
    };
    li.appendChild(saveBtn);

    const websiteIcon = document.createElement("img");
    websiteIcon.src = `https://www.google.com/s2/favicons?domain=${link.url}`;
    li.appendChild(websiteIcon);

    li.appendChild(link);
    tabList.appendChild(li);
  });

  (ws.resources || []).forEach((link, i) => {
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = link.title || link.url;

    const li = document.createElement("li");
    chrome.tabs.query({}, (tabs) => {
      const match = tabs.find((t) => t.url === link.url);
      if (match) {
        li.style.backgroundColor = "#d5e7ff";
      }
    });

    a.onclick = () => {
      chrome.tabs.query({}, (tabs) => {
        const match = tabs.find((t) => t.url === link.url);
        if (match) {
          chrome.tabs.update(match.id, { active: true });
        } else {
          chrome.tabs.create({ url: link.url, active: false });
        }
      });
    };

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "🗑";
    removeBtn.onclick = () => {
      workspaces[currentId].resources.splice(i, 1);
      saveData();
      renderWorkspaceTabs();
    };
    li.appendChild(removeBtn);

    const renameBtn = document.createElement("button");
    renameBtn.textContent = "✏️";
    renameBtn.onclick = () => {
      const newName = prompt("Rename Resource", link.title || link.url);
      if (newName) {
        link.title = newName;
        saveData();
        renderWorkspaceTabs();
      }
    };
    li.appendChild(renameBtn);

    // const resetNameBtn = document.createElement("button");
    // resetNameBtn.textContent = "🔄";
    // resetNameBtn.onclick = () => {
    //   link.title = link.url;
    //   saveData();
    //   renderWorkspaceTabs();
    // };
    // li.appendChild(resetNameBtn);

    const websiteIcon = document.createElement("img");
    websiteIcon.src = `https://www.google.com/s2/favicons?domain=${link.url}`;
    if (!link.url.startsWith("http")) {
      websiteIcon.src = "https://www.google.com/s2/favicons?domain=example.com";
    }
    li.appendChild(websiteIcon);

    li.appendChild(a);
    resList.appendChild(li);
  });
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

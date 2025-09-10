let workspaces = {};
let folders = {};
let currentId = null;
let currentBackground = "gradient.jpg";
let selectedTabIndex = -1;
let recentTabs = []; // Track last 10 tabs visited across all workspaces
let keybinds = {
  // Workspace Management
  "ctrl+1": "switchWorkspace1",
  "ctrl+2": "switchWorkspace2",
  "ctrl+3": "switchWorkspace3",
  "ctrl+4": "switchWorkspace4",
  "ctrl+5": "switchWorkspace5",
  "ctrl+6": "switchWorkspace6",
  "ctrl+7": "switchWorkspace7",
  "ctrl+8": "switchWorkspace8",
  "ctrl+9": "switchWorkspace9",
  "ctrl+n": "newWorkspace",
  "ctrl+shift+n": "newFolder",
  "ctrl+w": "closeCurrentWorkspaceTabs",
  "ctrl+shift+w": "closeAllTabs",

  // Tab Operations
  "ctrl+t": "openNewTab",
  "ctrl+shift+t": "saveCurrentTab",
  "ctrl+k": "quickSearch",
  delete: "closeSelectedTab",
  enter: "openSelectedTab",

  // Resource Management
  "ctrl+shift+c": "newResourceCategory",
  "ctrl+shift+o": "openAllResources",
  "ctrl+b": "bookmarkCurrentTab",

  // Interface
  "ctrl+,": "openSettings",
  escape: "closeModals",
  "ctrl+/": "showKeybindHelp",
  f1: "toggleKeybindHelp",
};

// Load saved workspaces & last opened workspace
chrome.storage.local.get(
  [
    "workspaces",
    "folders",
    "lastWorkspaceId",
    "currentBackground",
    "grainOpacity",
    "backgroundBlur",
    "recentTabs",
  ],
  (data) => {
    workspaces = data.workspaces || {};
    folders = data.folders || {};
    currentBackground = data.currentBackground || "gradient.jpg";
    recentTabs = data.recentTabs || [];

    // Load the saved background
    loadBackground(currentBackground);

    // Load saved background control values
    const grainOpacity = data.grainOpacity || 10;
    const backgroundBlur = data.backgroundBlur || 0;

    // Apply grain opacity
    const grainElement = document.querySelector(".noise");
    if (grainElement) {
      grainElement.style.opacity = grainOpacity / 100;
    }

    // Apply background blur
    const gradientElement = document.querySelector(".gradient");
    if (gradientElement) {
      gradientElement.style.filter = `brightness(0.5) blur(${backgroundBlur}px)`;
    }

    // Migrate old workspace structure to new resource categories structure
    for (const id in workspaces) {
      const ws = workspaces[id];
      if (ws.resources && !ws.resourceCategories) {
        ws.resourceCategories = {
          General: ws.resources,
        };
        delete ws.resources;
      } else if (!ws.resourceCategories) {
        ws.resourceCategories = {
          General: [],
        };
      }

      // Ensure folderId property exists (migrate existing workspaces to General)
      if (ws.folderId === undefined) {
        ws.folderId = null; // null means in General (no folder)
      }

      // Ensure categoryStates property exists
      if (!ws.categoryStates) {
        ws.categoryStates = {};
        // Set all existing categories to expanded (false)
        Object.keys(ws.resourceCategories || {}).forEach((categoryName) => {
          ws.categoryStates[categoryName] = false;
        });
      }
    }

    // Save migrated data
    saveData();

    if (data.lastWorkspaceId && workspaces[data.lastWorkspaceId]) {
      loadWorkspace(data.lastWorkspaceId, true);
    } else {
      renderWorkspaceList();
      updateSectionButtons();
    }
  }
);

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

// Track tab activation to build recent tabs list
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && !tab.url.includes("app/index.html")) {
      // Find which workspace this tab belongs to
      let foundWorkspaceId = null;
      Object.keys(workspaces).forEach((workspaceId) => {
        const ws = workspaces[workspaceId];
        if (ws.tabs && ws.tabs.some((t) => t.url === tab.url)) {
          foundWorkspaceId = workspaceId;
        }
        if (ws.resourceCategories) {
          Object.keys(ws.resourceCategories).forEach((category) => {
            if (
              ws.resourceCategories[category].some((r) => r.url === tab.url)
            ) {
              foundWorkspaceId = workspaceId;
            }
          });
        }
      });

      if (foundWorkspaceId) {
        addToRecentTabs(tab, foundWorkspaceId);
      }
    }
  });
});

function saveData() {
  chrome.storage.local.set({ workspaces, folders, recentTabs });
}

function addToRecentTabs(tab, workspaceId) {
  const tabWithWorkspace = {
    ...tab,
    workspaceId: workspaceId,
    timestamp: Date.now(),
  };

  // Remove if already exists
  recentTabs = recentTabs.filter((t) => t.url !== tab.url);

  // Add to beginning
  recentTabs.unshift(tabWithWorkspace);

  // Keep only last 10
  recentTabs = recentTabs.slice(0, 10);

  // Save to storage
  chrome.storage.local.set({ recentTabs });
}

function getWorkspaceName(workspaceId) {
  if (!workspaceId || !workspaces[workspaceId]) return "Unknown";
  return workspaces[workspaceId].name;
}

function updateWorkspaceTitle(ws) {
  const folderName = ws.folderId ? folders[ws.folderId]?.name : null;

  if (folderName) {
    document.getElementById("workspaceTitle").innerHTML = `
      <i class="ri-folder-fill" style="margin-right: 8px;"></i>${folderName}
      <i class="ri-arrow-right-s-line" style="margin: 0 8px;"></i>
      <i class="ri-window-2-fill" style="margin-right: 8px;"></i>${ws.name}
    `;
  } else {
    document.getElementById("workspaceTitle").innerHTML = `
      <i class="ri-window-2-fill" style="margin-right: 8px;"></i>${ws.name}
    `;
  }
}

function updateSectionButtons() {
  const addCategoryBtn = document.getElementById("addResourceCategory");
  const closeAllTabsBtn = document.getElementById("closeAllTabsBtn");

  if (addCategoryBtn && closeAllTabsBtn) {
    addCategoryBtn.style.display = currentId ? "block" : "none";
    closeAllTabsBtn.style.display = currentId ? "block" : "none";
  }
}

function renderWorkspaceList() {
  const list = document.getElementById("workspaceList");
  list.innerHTML = "";

  // First, render workspaces not in folders (General)
  for (const id in workspaces) {
    const ws = workspaces[id];
    if (ws.folderId === null) {
      const li = createWorkspaceItem(id, ws);
      list.appendChild(li);
    }
  }

  // Then, render folders with their workspaces
  for (const folderId in folders) {
    const folder = folders[folderId];
    const folderDiv = createFolderItem(folderId, folder);
    list.appendChild(folderDiv);
  }
}

function createWorkspaceItem(id, ws) {
  const li = document.createElement("li");

  const workspaceName = document.createElement("span");
  const iconClass = id === currentId ? "ri-window-2-fill" : "ri-window-2-line";
  workspaceName.innerHTML = `<i class="${iconClass}" style="margin-right: 8px;"></i>${ws.name}`;

  // Make the entire li clickable
  li.onclick = (e) => {
    // Don't trigger if clicking on buttons
    if (!e.target.closest("button")) {
      loadWorkspace(id);
    }
  };

  // Create settings button for workspace
  const settingsBtn = createIconButton("more-2-line", () => {
    const menuItems = [
      { name: "Move to Folder", icon: "folder-2-line", action: "move" },
      { name: "Rename", icon: "edit-fill", action: "rename" },
      { name: "Delete", icon: "delete-bin-5-fill", action: "delete" },
    ];

    showSettingsPopup(settingsBtn, menuItems, (action) => {
      switch (action) {
        case "move":
          showFolderPopup(settingsBtn, id, (folderId) => {
            ws.folderId = folderId;
            saveData();
            renderWorkspaceList();
            if (id === currentId) {
              updateWorkspaceTitle(ws);
            }
          });
          break;
        case "rename":
          const newName = prompt("Rename Workspace", ws.name);
          if (newName) {
            ws.name = newName;
            saveData();
            renderWorkspaceList();
            if (id === currentId) {
              updateWorkspaceTitle(ws);
            }
          }
          break;
        case "delete":
          deleteWorkspace(id);
          break;
      }
    });
  });

  // Style the workspace item
  if (id === currentId) {
    li.style.background = "rgba(255, 255, 255, 0.15)";
    li.style.outline = "1px solid rgba(255, 255, 255, 0.4)";
    li.style.opacity = "1";
  }

  // Layout: workspace name - settings button
  li.append(workspaceName, settingsBtn);
  return li;
}

function createFolderItem(folderId, folder) {
  const folderDiv = document.createElement("div");
  folderDiv.className = "folder-container";

  // Folder header
  const folderHeader = document.createElement("div");
  folderHeader.className = "folder-header";

  const folderToggle = createIconButton(
    folder.collapsed ? "arrow-right-s-line" : "arrow-down-s-line",
    () => {
      toggleFolder(folderId);
    }
  );

  const folderName = document.createElement("span");
  folderName.innerHTML = `<i class="ri-folder-fill" style="margin-right: 8px;"></i>${folder.name}`;

  // Make the entire folder header clickable
  folderHeader.onclick = (e) => {
    // Don't trigger if clicking on buttons
    if (!e.target.closest("button")) {
      toggleFolder(folderId);
    }
  };

  const settingsBtn = createIconButton("more-2-line", () => {
    const menuItems = [
      { name: "Rename", icon: "edit-fill", action: "rename" },
      { name: "Delete", icon: "delete-bin-5-fill", action: "delete" },
    ];

    showSettingsPopup(settingsBtn, menuItems, (action) => {
      switch (action) {
        case "rename":
          renameFolder(folderId);
          break;
        case "delete":
          deleteFolder(folderId);
          break;
      }
    });
  });

  folderHeader.append(folderToggle, folderName, settingsBtn);

  // Folder content (workspaces)
  const folderContent = document.createElement("div");
  folderContent.className = "folder-content";
  folderContent.style.display = folder.collapsed ? "none" : "block";

  // Add workspaces in this folder
  for (const id in workspaces) {
    const ws = workspaces[id];
    if (ws.folderId === folderId) {
      const li = createWorkspaceItem(id, ws);
      folderContent.appendChild(li);
    }
  }

  folderDiv.append(folderHeader, folderContent);
  return folderDiv;
}

function createIconButton(icon, handler) {
  const btn = document.createElement("button");
  btn.innerHTML = `<i class="ri-${icon}"></i>`;
  btn.onclick = (e) => {
    e.stopPropagation();
    handler();
  };
  return btn;
}

function createTextButton(text, icon, handler) {
  const btn = document.createElement("button");
  btn.innerHTML = `<span>${text}</span><i class="ri-${icon}"></i>`;
  btn.className = "text-button";
  btn.onclick = (e) => {
    e.stopPropagation();
    handler();
  };
  return btn;
}

function createCategoryPopup(tabUrl, onSelect, currentCategory = null) {
  const popup = document.createElement("div");
  popup.className = "category-popup";

  const ws = workspaces[currentId];
  if (!ws.resourceCategories) return popup;

  Object.keys(ws.resourceCategories).forEach((categoryName) => {
    const categoryItem = document.createElement("div");
    categoryItem.className = "category-item";

    // Apply inline styles to ensure they work
    categoryItem.style.display = "flex";
    categoryItem.style.justifyContent = "space-between";
    categoryItem.style.alignItems = "center";
    categoryItem.style.padding = "12px 16px";
    categoryItem.style.cursor = "pointer";
    categoryItem.style.color = "white";
    categoryItem.style.fontSize = "14px";
    categoryItem.style.fontWeight = "500";
    categoryItem.style.transition = "all 0.3s ease-in-out";
    categoryItem.style.borderRadius = "5px";
    categoryItem.style.margin = "2px 8px";

    const categoryNameSpan = document.createElement("span");
    categoryNameSpan.innerHTML = `<i class="ri-bookmark-line" style="margin-right: 8px;"></i>${categoryName}`;

    // Check if tab is already in this category
    const isInCategory = ws.resourceCategories[categoryName].some(
      (resource) => resource.url === tabUrl
    );
    if (isInCategory) {
      // Update the bookmark icon to filled version
      const bookmarkIcon = categoryNameSpan.querySelector("i");
      bookmarkIcon.className = "ri-bookmark-3-fill";
      categoryItem.classList.add("already-saved");
      categoryItem.style.background = "rgba(76, 175, 80, 0.15)";
      categoryItem.style.color = "#4caf50";
      categoryItem.style.outline = "1px solid rgba(76, 175, 80, 0.3)";
    }

    // Add hover effect
    categoryItem.addEventListener("mouseenter", () => {
      if (isInCategory) {
        categoryItem.style.background = "rgba(76, 175, 80, 0.25)";
        categoryItem.style.outline = "1px solid rgba(76, 175, 80, 0.5)";
      } else {
        categoryItem.style.background = "rgba(255, 255, 255, 0.1)";
        categoryItem.style.backdropFilter = "blur(5px)";
      }
    });

    categoryItem.addEventListener("mouseleave", () => {
      if (isInCategory) {
        categoryItem.style.background = "rgba(76, 175, 80, 0.15)";
        categoryItem.style.outline = "1px solid rgba(76, 175, 80, 0.3)";
      } else {
        categoryItem.style.background = "transparent";
        categoryItem.style.backdropFilter = "none";
      }
    });

    categoryItem.append(categoryNameSpan);

    categoryItem.onclick = (e) => {
      e.stopPropagation();
      onSelect(categoryName);
      popup.remove();
    };

    popup.appendChild(categoryItem);
  });

  return popup;
}

function createFolderPopup(workspaceId, onSelect) {
  const popup = document.createElement("div");
  popup.className = "category-popup";

  // Add General option (no folder)
  const generalItem = document.createElement("div");
  generalItem.className = "category-item";
  generalItem.style.display = "flex";
  generalItem.style.justifyContent = "space-between";
  generalItem.style.alignItems = "center";
  generalItem.style.padding = "12px 16px";
  generalItem.style.cursor = "pointer";
  generalItem.style.color = "white";
  generalItem.style.fontSize = "14px";
  generalItem.style.fontWeight = "500";
  generalItem.style.transition = "all 0.3s ease-in-out";
  generalItem.style.borderRadius = "5px";
  generalItem.style.margin = "2px 8px";

  const generalNameSpan = document.createElement("span");
  generalNameSpan.textContent = "General";
  generalNameSpan.innerHTML =
    '<i class="ri-folder-line" style="margin-right: 8px;"></i>General';

  const generalIndicator = document.createElement("span");
  generalIndicator.className = "category-indicator";
  generalIndicator.style.fontSize = "16px";
  generalIndicator.style.color = "#4caf50";
  generalIndicator.style.fontWeight = "600";

  // Check if workspace is in General
  if (workspaces[workspaceId].folderId === null) {
    generalIndicator.innerHTML = '<i class="ri-check-line"></i>';
    generalItem.classList.add("already-saved");
    generalItem.style.background = "rgba(76, 175, 80, 0.15)";
    generalItem.style.color = "#4caf50";
    generalItem.style.outline = "1px solid rgba(76, 175, 80, 0.3)";
  }

  generalItem.append(generalNameSpan, generalIndicator);

  // Add hover effects
  generalItem.addEventListener("mouseenter", () => {
    if (workspaces[workspaceId].folderId === null) {
      generalItem.style.background = "rgba(76, 175, 80, 0.25)";
      generalItem.style.outline = "1px solid rgba(76, 175, 80, 0.5)";
    } else {
      generalItem.style.background = "rgba(255, 255, 255, 0.1)";
      generalItem.style.backdropFilter = "blur(5px)";
    }
  });

  generalItem.addEventListener("mouseleave", () => {
    if (workspaces[workspaceId].folderId === null) {
      generalItem.style.background = "rgba(76, 175, 80, 0.15)";
      generalItem.style.outline = "1px solid rgba(76, 175, 80, 0.3)";
    } else {
      generalItem.style.background = "transparent";
      generalItem.style.backdropFilter = "none";
    }
  });

  generalItem.onclick = (e) => {
    e.stopPropagation();
    onSelect(null);
    popup.remove();
  };
  popup.appendChild(generalItem);

  // Add folder options
  Object.keys(folders).forEach((folderId) => {
    const folderItem = document.createElement("div");
    folderItem.className = "category-item";
    folderItem.style.display = "flex";
    folderItem.style.justifyContent = "space-between";
    folderItem.style.alignItems = "center";
    folderItem.style.padding = "12px 16px";
    folderItem.style.cursor = "pointer";
    folderItem.style.color = "white";
    folderItem.style.fontSize = "14px";
    folderItem.style.fontWeight = "500";
    folderItem.style.transition = "all 0.3s ease-in-out";
    folderItem.style.borderRadius = "5px";
    folderItem.style.margin = "2px 8px";

    const folderNameSpan = document.createElement("span");
    folderNameSpan.innerHTML = `<i class="ri-folder-fill" style="margin-right: 8px;"></i>${folders[folderId].name}`;

    const folderIndicator = document.createElement("span");
    folderIndicator.className = "category-indicator";
    folderIndicator.style.fontSize = "16px";
    folderIndicator.style.color = "#4caf50";
    folderIndicator.style.fontWeight = "600";

    // Check if workspace is in this folder
    if (workspaces[workspaceId].folderId === folderId) {
      folderIndicator.innerHTML = '<i class="ri-check-line"></i>';
      folderItem.classList.add("already-saved");
      folderItem.style.background = "rgba(76, 175, 80, 0.15)";
      folderItem.style.color = "#4caf50";
      folderItem.style.outline = "1px solid rgba(76, 175, 80, 0.3)";
    }

    folderItem.append(folderNameSpan, folderIndicator);

    // Add hover effects
    folderItem.addEventListener("mouseenter", () => {
      if (workspaces[workspaceId].folderId === folderId) {
        folderItem.style.background = "rgba(76, 175, 80, 0.25)";
        folderItem.style.outline = "1px solid rgba(76, 175, 80, 0.5)";
      } else {
        folderItem.style.background = "rgba(255, 255, 255, 0.1)";
        folderItem.style.backdropFilter = "blur(5px)";
      }
    });

    folderItem.addEventListener("mouseleave", () => {
      if (workspaces[workspaceId].folderId === folderId) {
        folderItem.style.background = "rgba(76, 175, 80, 0.15)";
        folderItem.style.outline = "1px solid rgba(76, 175, 80, 0.3)";
      } else {
        folderItem.style.background = "transparent";
        folderItem.style.backdropFilter = "none";
      }
    });

    folderItem.onclick = (e) => {
      e.stopPropagation();
      onSelect(folderId);
      popup.remove();
    };
    popup.appendChild(folderItem);
  });

  return popup;
}

function createSettingsPopup(items, onSelect) {
  const popup = document.createElement("div");
  popup.className = "category-popup";

  items.forEach((item) => {
    const popupItem = document.createElement("div");
    popupItem.className = "category-item";
    popupItem.style.display = "flex";
    popupItem.style.justifyContent = "space-between";
    popupItem.style.alignItems = "center";
    popupItem.style.padding = "12px 16px";
    popupItem.style.cursor = "pointer";
    popupItem.style.color = "white";
    popupItem.style.fontSize = "14px";
    popupItem.style.fontWeight = "500";
    popupItem.style.transition = "all 0.3s ease-in-out";
    popupItem.style.borderRadius = "5px";
    popupItem.style.margin = "2px 8px";

    const itemNameSpan = document.createElement("span");
    itemNameSpan.innerHTML = `<i class="ri-${item.icon}" style="margin-right: 8px;"></i>${item.name}`;

    popupItem.append(itemNameSpan);

    // Add hover effects
    popupItem.addEventListener("mouseenter", () => {
      popupItem.style.background = "rgba(255, 255, 255, 0.1)";
      popupItem.style.backdropFilter = "blur(5px)";
    });

    popupItem.addEventListener("mouseleave", () => {
      popupItem.style.background = "transparent";
      popupItem.style.backdropFilter = "none";
    });

    popupItem.onclick = (e) => {
      e.stopPropagation();
      onSelect(item.action);
      popup.remove();
    };
    popup.appendChild(popupItem);
  });

  return popup;
}

function showSettingsPopup(button, items, onSelect) {
  // Remove any existing popup
  const existingPopup = document.querySelector(".category-popup");
  if (existingPopup) {
    existingPopup.remove();
  }

  const popup = createSettingsPopup(items, onSelect);

  // Position popup relative to button with overflow prevention
  const rect = button.getBoundingClientRect();
  const popupWidth = 180;
  const viewportWidth = window.innerWidth;

  let leftPosition = rect.left;

  if (leftPosition + popupWidth > viewportWidth) {
    leftPosition = viewportWidth - popupWidth - 10;
  }

  if (leftPosition < 10) {
    leftPosition = 10;
  }

  popup.style.position = "fixed";
  popup.style.top = `${rect.bottom + 5}px`;
  popup.style.left = `${leftPosition}px`;
  popup.style.zIndex = "10000";
  popup.style.background = "rgba(255, 255, 255, 0.05)";
  popup.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  popup.style.borderRadius = "10px";
  popup.style.backdropFilter = "blur(20px)";
  popup.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.3)";
  popup.style.textShadow = "0 0 5px rgba(0, 0, 0, 0.5)";
  popup.style.minWidth = "180px";
  popup.style.padding = "8px 0";

  document.body.appendChild(popup);

  // Close popup when clicking outside
  const closePopup = (e) => {
    if (!popup.contains(e.target) && e.target !== button) {
      popup.remove();
      document.removeEventListener("click", closePopup);
    }
  };

  setTimeout(() => {
    document.addEventListener("click", closePopup);
  }, 0);
}

function showFolderPopup(button, workspaceId, onSelect) {
  // Remove any existing popup
  const existingPopup = document.querySelector(".category-popup");
  if (existingPopup) {
    existingPopup.remove();
  }

  const popup = createFolderPopup(workspaceId, onSelect);

  // Position popup relative to button with overflow prevention
  const rect = button.getBoundingClientRect();
  const popupWidth = 180;
  const viewportWidth = window.innerWidth;

  let leftPosition = rect.left;

  if (leftPosition + popupWidth > viewportWidth) {
    leftPosition = viewportWidth - popupWidth - 10;
  }

  if (leftPosition < 10) {
    leftPosition = 10;
  }

  popup.style.position = "fixed";
  popup.style.top = `${rect.bottom + 5}px`;
  popup.style.left = `${leftPosition}px`;
  popup.style.zIndex = "10000";
  popup.style.background = "rgba(255, 255, 255, 0.05)";
  popup.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  popup.style.borderRadius = "10px";
  popup.style.backdropFilter = "blur(20px)";
  popup.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.3)";
  popup.style.textShadow = "0 0 5px rgba(0, 0, 0, 0.5)";
  popup.style.minWidth = "180px";
  popup.style.padding = "8px 0";

  document.body.appendChild(popup);

  // Close popup when clicking outside
  const closePopup = (e) => {
    if (!popup.contains(e.target) && e.target !== button) {
      popup.remove();
      document.removeEventListener("click", closePopup);
    }
  };

  setTimeout(() => {
    document.addEventListener("click", closePopup);
  }, 0);
}

function showCategoryPopup(button, tabUrl, onSelect, currentCategory = null) {
  // Remove any existing popup
  const existingPopup = document.querySelector(".category-popup");
  if (existingPopup) {
    existingPopup.remove();
  }

  const popup = createCategoryPopup(tabUrl, onSelect, currentCategory);

  // Position popup relative to button with overflow prevention
  const rect = button.getBoundingClientRect();
  const popupWidth = 180; // min-width from CSS
  const viewportWidth = window.innerWidth;

  let leftPosition = rect.left;

  // Check if popup would overflow on the right side
  if (leftPosition + popupWidth > viewportWidth) {
    leftPosition = viewportWidth - popupWidth - 10; // 10px margin from edge
  }

  // Ensure popup doesn't go off the left side
  if (leftPosition < 10) {
    leftPosition = 10;
  }

  popup.style.position = "fixed";
  popup.style.top = `${rect.bottom + 5}px`;
  popup.style.left = `${leftPosition}px`;
  popup.style.zIndex = "10000";

  // Ensure the popup has the proper styling context
  popup.style.background = "rgba(255, 255, 255, 0.05)";
  popup.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  popup.style.borderRadius = "10px";
  popup.style.backdropFilter = "blur(20px)";
  popup.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.3)";
  popup.style.textShadow = "0 0 5px rgba(0, 0, 0, 0.5)";
  popup.style.minWidth = "180px";
  popup.style.padding = "8px 0";

  document.body.appendChild(popup);

  // Close popup when clicking outside
  const closePopup = (e) => {
    if (!popup.contains(e.target) && e.target !== button) {
      popup.remove();
      document.removeEventListener("click", closePopup);
    }
  };

  setTimeout(() => {
    document.addEventListener("click", closePopup);
  }, 0);
}

function loadWorkspace(id, skipOpen = false) {
  if (currentId === id && !skipOpen) return;
  currentId = id;

  chrome.runtime.sendMessage({ type: "setWorkspace", workspaceId: id });
  chrome.storage.local.set({ lastWorkspaceId: id });

  const ws = workspaces[id];
  updateWorkspaceTitle(ws);

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
  updateSectionButtons();
}

function renderWorkspaceTabs() {
  const tabList = document.getElementById("tabList");
  const resList = document.getElementById("resourceList");
  const ws = workspaces[currentId];

  tabList.innerHTML = "";
  resList.innerHTML = "";

  if ((ws.tabs || []).length === 0) {
    const emptyMessage = document.createElement("div");
    emptyMessage.className = "empty-message";
    emptyMessage.textContent = "No tabs are currently opened";
    tabList.appendChild(emptyMessage);
  } else {
    (ws.tabs || []).forEach((tab, index) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = tab.title || tab.url;

      // Make the entire li clickable
      li.onclick = (e) => {
        // Don't trigger if clicking on buttons
        if (!e.target.closest("button")) {
          openOrActivateTab(tab.url);
        }
      };

      const closeBtn = createIconButton("close-large-fill", () => {
        closeTabByUrl(tab.url);
        ws.tabs.splice(index, 1);
        saveData();
        renderWorkspaceTabs();
      });

      const settingsBtn = createIconButton("more-2-line", () => {
        const menuItems = [
          { name: "Rename", icon: "edit-fill", action: "rename" },
          { name: "Save to resource", icon: "bookmark-fill", action: "save" },
        ];

        showSettingsPopup(settingsBtn, menuItems, (action) => {
          switch (action) {
            case "rename":
              const newName = prompt("Rename Tab", tab.title || tab.url);
              if (newName) {
                tab.title = newName;
                saveData();
                renderWorkspaceTabs();
              }
              break;
            case "save":
              showCategoryPopup(settingsBtn, tab.url, (categoryName) => {
                if (!ws.resourceCategories) {
                  ws.resourceCategories = {};
                }
                if (!ws.resourceCategories[categoryName]) {
                  ws.resourceCategories[categoryName] = [];
                }

                // Check if already in this category
                const alreadyExists = ws.resourceCategories[categoryName].some(
                  (resource) => resource.url === tab.url
                );
                if (!alreadyExists) {
                  ws.resourceCategories[categoryName].push(tab);
                  saveData();
                  renderWorkspaceTabs();
                }
              });
              break;
          }
        });
      });

      const websiteIcon = createFavicon(tab.url);

      // Reorganize layout: close - tab name - settings
      li.append(closeBtn, websiteIcon, link, settingsBtn);
      tabList.appendChild(li);
    });
  }

  // Render resource categories
  if (ws.resourceCategories) {
    Object.keys(ws.resourceCategories).forEach((categoryName) => {
      const categoryDiv = document.createElement("div");
      categoryDiv.className = "resource-category";

      const categoryHeader = document.createElement("div");
      categoryHeader.className = "category-header";

      // Add collapsed class if category is collapsed
      if (ws.categoryStates && ws.categoryStates[categoryName]) {
        categoryHeader.classList.add("collapsed");
      }

      const categoryToggle = createIconButton(
        ws.categoryStates && ws.categoryStates[categoryName]
          ? "arrow-right-s-line"
          : "arrow-down-s-line",
        () => {
          toggleCategory(categoryName);
        }
      );

      const categoryTitle = document.createElement("h4");
      categoryTitle.textContent = categoryName;
      categoryTitle.onclick = () => toggleCategory(categoryName);

      const categoryActions = document.createElement("div");
      categoryActions.className = "category-actions";

      const openAllBtn = createTextButton(
        "Open All",
        "external-link-line",
        () => {
          openAllResourcesInCategory(categoryName);
        }
      );

      const renameCategoryBtn = createIconButton("edit-fill", () => {
        const newName = prompt("Rename Category", categoryName);
        if (newName && newName !== categoryName) {
          ws.resourceCategories[newName] = ws.resourceCategories[categoryName];
          ws.categoryStates[newName] = ws.categoryStates[categoryName] || false;
          delete ws.resourceCategories[categoryName];
          delete ws.categoryStates[categoryName];
          saveData();
          renderWorkspaceTabs();
        }
      });

      const deleteCategoryBtn = createIconButton("delete-bin-5-fill", () => {
        if (
          confirm(`Delete category "${categoryName}" and all its resources?`)
        ) {
          delete ws.resourceCategories[categoryName];
          delete ws.categoryStates[categoryName];
          saveData();
          renderWorkspaceTabs();
        }
      });

      categoryActions.append(openAllBtn, renameCategoryBtn, deleteCategoryBtn);
      categoryHeader.append(categoryToggle, categoryTitle, categoryActions);

      const categoryList = document.createElement("ul");
      categoryList.className = "category-resources";
      categoryList.style.display =
        ws.categoryStates && ws.categoryStates[categoryName] ? "none" : "block";

      // Show empty message if category is empty and not collapsed
      if (
        ws.resourceCategories[categoryName].length === 0 &&
        (!ws.categoryStates || !ws.categoryStates[categoryName])
      ) {
        const emptyMessage = document.createElement("div");
        emptyMessage.className = "empty-category-message";
        emptyMessage.innerHTML =
          '<i class="ri-bookmark-line"></i> Add Resources Here';
        categoryList.appendChild(emptyMessage);
      }

      ws.resourceCategories[categoryName].forEach((link, i) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = "#";
        a.textContent = link.title || link.url;

        chrome.tabs.query({}, (tabs) => {
          if (tabs.find((t) => t.url === link.url)) {
            li.classList.add("resource-opened");
          }
        });

        // Make the entire li clickable
        li.onclick = (e) => {
          // Don't trigger if clicking on buttons
          if (!e.target.closest("button")) {
            openOrActivateTab(link.url);
          }
        };

        const settingsBtn = createIconButton("more-2-line", () => {
          const menuItems = [
            { name: "Rename", icon: "edit-fill", action: "rename" },
            { name: "Move Resource", icon: "bookmark-fill", action: "move" },
            { name: "Delete", icon: "delete-bin-5-fill", action: "delete" },
          ];

          showSettingsPopup(settingsBtn, menuItems, (action) => {
            switch (action) {
              case "rename":
                const newName = prompt(
                  "Rename Resource",
                  link.title || link.url
                );
                if (newName) {
                  link.title = newName;
                  saveData();
                  renderWorkspaceTabs();
                }
                break;
              case "move":
                showCategoryPopup(
                  settingsBtn,
                  link.url,
                  (targetCategoryName) => {
                    if (targetCategoryName !== categoryName) {
                      ws.resourceCategories[categoryName].splice(i, 1);
                      ws.resourceCategories[targetCategoryName].push(link);
                      saveData();
                      renderWorkspaceTabs();
                    }
                  },
                  categoryName
                );
                break;
              case "delete":
                ws.resourceCategories[categoryName].splice(i, 1);
                saveData();
                renderWorkspaceTabs();
                break;
            }
          });
        });

        const websiteIcon = createFavicon(link.url);

        // Reorganize layout: resource name - settings button
        li.append(websiteIcon, a, settingsBtn);
        categoryList.appendChild(li);
      });

      categoryDiv.append(categoryHeader, categoryList);
      resList.appendChild(categoryDiv);
    });
  }
}

function openOrActivateTab(url) {
  chrome.tabs.query({}, (tabs) => {
    const match = tabs.find((t) => t.url === url);
    if (match) {
      chrome.tabs.update(match.id, { active: true });
      // Track this tab visit
      addToRecentTabs(match, currentId);
    } else {
      chrome.tabs.create({ url, active: false });
      // For new tabs, we'll track them when they're created
      // We'll need to get the tab info after creation
      setTimeout(() => {
        chrome.tabs.query({ url }, (newTabs) => {
          if (newTabs.length > 0) {
            addToRecentTabs(newTabs[0], currentId);
          }
        });
      }, 100);
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

  // Try multiple favicon sources for better reliability
  const faviconSources = [
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://${domain}/favicon.ico`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
  ];

  let currentSourceIndex = 0;

  const createFallbackIcon = () => {
    const fallbackIcon = document.createElement("i");
    fallbackIcon.className = "ri-global-fill";
    fallbackIcon.style.fontSize = "20px";
    fallbackIcon.style.color = "rgba(102, 126, 234, 0.8)";
    fallbackIcon.style.minWidth = "20px";
    fallbackIcon.style.textAlign = "center";
    fallbackIcon.style.filter = "drop-shadow(0 0 4px rgba(102, 126, 234, 0.3))";

    // Replace the img with the fallback icon
    if (img.parentNode) {
      img.parentNode.replaceChild(fallbackIcon, img);
    }
  };

  const isDefaultGoogleFavicon = (imageElement) => {
    // Create a canvas to analyze the image
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 32;
    canvas.height = 32;

    try {
      ctx.drawImage(imageElement, 0, 0, 32, 32);
      const imageData = ctx.getImageData(0, 0, 32, 32);
      const data = imageData.data;

      // Check if the image is mostly the default Google favicon colors
      // The default Google favicon is typically a simple globe with specific colors
      let bluePixels = 0;
      let totalPixels = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        if (a > 0) {
          // Only count non-transparent pixels
          totalPixels++;
          // Check for the typical blue color of Google's default favicon
          if (r < 100 && g < 150 && b > 150) {
            bluePixels++;
          }
        }
      }

      // If more than 60% of the image is the default blue color, it's likely the default favicon
      return totalPixels > 0 && bluePixels / totalPixels > 0.6;
    } catch (e) {
      return false;
    }
  };

  const tryNextSource = () => {
    if (currentSourceIndex < faviconSources.length) {
      img.src = faviconSources[currentSourceIndex];
      currentSourceIndex++;
    } else {
      // All sources failed, use fallback globe icon
      createFallbackIcon();
    }
  };

  // Handle successful image load
  img.onload = () => {
    // Check if this is the default Google favicon (ugly globe)
    if (currentSourceIndex === 1 && isDefaultGoogleFavicon(img)) {
      // Replace with our better-looking fallback icon
      createFallbackIcon();
    }
  };

  // Add error handling for fallback
  img.onerror = tryNextSource;

  // Start with the first source
  tryNextSource();

  return img;
}

function addWorkspace() {
  const name = prompt("Workspace Name");
  if (!name) return;
  const id = Date.now().toString();
  workspaces[id] = {
    name,
    tabs: [],
    resourceCategories: {
      General: [],
    },
    categoryStates: {
      General: false, // false means expanded
    },
    folderId: null, // null means in General (no folder)
  };
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
  updateSectionButtons();
}

function addResourceCategory() {
  if (!currentId) return;

  const categoryName = prompt("Category Name");
  if (!categoryName) return;

  const ws = workspaces[currentId];
  if (!ws.resourceCategories) {
    ws.resourceCategories = {};
  }
  if (!ws.categoryStates) {
    ws.categoryStates = {};
  }

  if (ws.resourceCategories[categoryName]) {
    alert("Category already exists!");
    return;
  }

  ws.resourceCategories[categoryName] = [];
  ws.categoryStates[categoryName] = false; // Start expanded
  saveData();
  renderWorkspaceTabs();
}

function toggleCategory(categoryName) {
  if (!currentId) return;

  const ws = workspaces[currentId];
  if (!ws.categoryStates) {
    ws.categoryStates = {};
  }

  ws.categoryStates[categoryName] = !ws.categoryStates[categoryName];
  saveData();
  renderWorkspaceTabs();
}

function closeAllTabs() {
  if (!currentId) return;

  const ws = workspaces[currentId];
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (!tab.pinned && !tab.url.includes("app/index.html")) {
        chrome.tabs.remove(tab.id);
      }
    });
  });
}

function openAllResourcesInCategory(categoryName) {
  if (!currentId) return;

  const ws = workspaces[currentId];
  if (!ws.resourceCategories || !ws.resourceCategories[categoryName]) return;

  const resources = ws.resourceCategories[categoryName];
  if (resources.length === 0) return;

  // Get currently open tabs
  chrome.tabs.query({}, (tabs) => {
    const openUrls = tabs.map((tab) => tab.url);

    // Filter resources that are not already open
    const unopenedResources = resources.filter(
      (resource) => !openUrls.includes(resource.url)
    );

    // Open all unopened resources without focusing them
    unopenedResources.forEach((resource, index) => {
      setTimeout(() => {
        chrome.tabs.create({
          url: resource.url,
          active: false,
        });
      }, index * 100); // Small delay between each tab to avoid overwhelming the browser
    });
  });
}

function addFolder() {
  const name = prompt("Folder Name");
  if (!name) return;
  const id = Date.now().toString();
  folders[id] = {
    name,
    collapsed: false,
  };
  saveData();
  renderWorkspaceList();
}

function deleteFolder(folderId) {
  if (
    !confirm(
      `Delete folder "${folders[folderId].name}" and move all workspaces to General?`
    )
  )
    return;

  // Move all workspaces in this folder to General
  for (const workspaceId in workspaces) {
    if (workspaces[workspaceId].folderId === folderId) {
      workspaces[workspaceId].folderId = null;
    }
  }

  delete folders[folderId];
  saveData();
  renderWorkspaceList();
}

function renameFolder(folderId) {
  const newName = prompt("Rename Folder", folders[folderId].name);
  if (newName) {
    folders[folderId].name = newName;
    saveData();
    renderWorkspaceList();

    // Update the title if current workspace is in this folder
    if (currentId && workspaces[currentId].folderId === folderId) {
      updateWorkspaceTitle(workspaces[currentId]);
    }
  }
}

function toggleFolder(folderId) {
  folders[folderId].collapsed = !folders[folderId].collapsed;
  saveData();
  renderWorkspaceList();
}

// Settings functionality
function loadBackground(backgroundName) {
  const gradientImg = document.querySelector(".gradient");
  if (backgroundName === "custom") {
    // Load custom background from storage
    chrome.storage.local.get("customBackgroundData", (data) => {
      if (data.customBackgroundData) {
        gradientImg.src = data.customBackgroundData;
      }
    });
  } else {
    gradientImg.src = `../assets/${backgroundName}`;
  }
}

function saveBackground(backgroundName) {
  currentBackground = backgroundName;
  chrome.storage.local.set({ currentBackground });
  loadBackground(backgroundName);
}

function showSettings() {
  const modal = document.getElementById("settingsModal");
  modal.classList.add("active");

  // Update active background item
  document.querySelectorAll(".background-item").forEach((item) => {
    item.classList.remove("active");
    if (item.dataset.bg === currentBackground) {
      item.classList.add("active");
    }
  });

  // Load current slider values
  chrome.storage.local.get(["grainOpacity", "backgroundBlur"], (data) => {
    const grainOpacity = data.grainOpacity || 10;
    const backgroundBlur = data.backgroundBlur || 0;

    const grainSlider = document.getElementById("grainOpacitySlider");
    const blurSlider = document.getElementById("backgroundBlurSlider");

    if (grainSlider) {
      grainSlider.value = grainOpacity;
      grainSlider.nextElementSibling.textContent = `${grainOpacity}%`;
    }

    if (blurSlider) {
      blurSlider.value = backgroundBlur;
      blurSlider.nextElementSibling.textContent = `${backgroundBlur}px`;
    }
  });
}

function hideSettings() {
  const modal = document.getElementById("settingsModal");
  modal.classList.remove("active");
}

function handleBackgroundSelection(backgroundName) {
  if (backgroundName === "custom") {
    document.getElementById("customBackgroundInput").click();
    return;
  }

  saveBackground(backgroundName);
  hideSettings();
}

function handleCustomBackgroundUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    chrome.storage.local.set({
      customBackgroundData: dataUrl,
      currentBackground: "custom",
    });
    currentBackground = "custom";
    loadBackground("custom");
    hideSettings();
  };
  reader.readAsDataURL(file);
}

// Keybind handler functions
function handleKeybind(keybindName) {
  switch (keybindName) {
    // Workspace Management
    case "switchWorkspace1":
    case "switchWorkspace2":
    case "switchWorkspace3":
    case "switchWorkspace4":
    case "switchWorkspace5":
    case "switchWorkspace6":
    case "switchWorkspace7":
    case "switchWorkspace8":
    case "switchWorkspace9":
      const workspaceNumber = parseInt(keybindName.slice(-1));
      switchToWorkspaceByNumber(workspaceNumber);
      break;
    case "newWorkspace":
      addWorkspace();
      break;
    case "newFolder":
      addFolder();
      break;
    case "closeCurrentWorkspaceTabs":
      if (currentId) {
        closeWorkspaceTabs(currentId);
      }
      break;
    case "closeAllTabs":
      closeAllTabs();
      break;

    // Tab Operations
    case "openNewTab":
      chrome.tabs.create({ url: "chrome://newtab/", active: true });
      break;
    case "saveCurrentTab":
      saveCurrentActiveTab();
      break;
    case "quickSearch":
      showQuickSearch();
      break;
    case "closeSelectedTab":
      closeSelectedTab();
      break;
    case "openSelectedTab":
      openSelectedTab();
      break;

    // Resource Management
    case "newResourceCategory":
      addResourceCategory();
      break;
    case "openAllResources":
      openAllResourcesInCurrentCategory();
      break;
    case "bookmarkCurrentTab":
      bookmarkCurrentActiveTab();
      break;

    // Interface
    case "openSettings":
      showSettings();
      break;
    case "closeModals":
      hideSettings();
      closeAllPopups();
      break;
    case "showKeybindHelp":
      showKeybindHelp();
      break;
    case "toggleKeybindHelp":
      toggleKeybindHelp();
      break;
  }
}

function switchToWorkspaceByNumber(number) {
  const workspaceIds = Object.keys(workspaces);
  if (workspaceIds.length >= number) {
    const workspaceId = workspaceIds[number - 1];
    loadWorkspace(workspaceId);
  }
}

function saveCurrentActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && !tabs[0].url.includes("app/index.html")) {
      const tab = tabs[0];
      if (currentId) {
        const ws = workspaces[currentId];
        if (!ws.resourceCategories) {
          ws.resourceCategories = { General: [] };
        }
        if (!ws.resourceCategories.General) {
          ws.resourceCategories.General = [];
        }

        // Check if already exists
        const exists = ws.resourceCategories.General.some(
          (r) => r.url === tab.url
        );
        if (!exists) {
          ws.resourceCategories.General.push({
            title: tab.title || tab.url,
            url: tab.url,
          });
          saveData();
          renderWorkspaceTabs();
        }
      }
    }
  });
}

function showQuickSearch() {
  // Create a quick search overlay
  const searchOverlay = document.createElement("div");
  searchOverlay.className = "quick-search-overlay";
  searchOverlay.innerHTML = `
    <div class="quick-search-container">
      <div class="quick-search-header">
        <i class="ri-search-line"></i>
        <input type="text" placeholder="Search tabs and resources..." class="quick-search-input" autofocus>
      </div>
      <div class="quick-search-results"></div>
    </div>
  `;

  document.body.appendChild(searchOverlay);

  const input = searchOverlay.querySelector(".quick-search-input");
  const results = searchOverlay.querySelector(".quick-search-results");

  // Focus the input immediately
  setTimeout(() => {
    input.focus();
  }, 0);

  input.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    results.innerHTML = "";

    if (query.length < 1) {
      // Show recent items when no query
      showRecentItems(results);
      return;
    }

    // Search across all workspaces and resources
    let hasResults = false;
    const recentUrls = recentTabs.map((tab) => tab.url);
    const foundTabs = new Map(); // Use Map to deduplicate by URL

    // Search all workspaces
    Object.keys(workspaces).forEach((workspaceId) => {
      const ws = workspaces[workspaceId];
      const workspaceName = getWorkspaceName(workspaceId);

      // Search tabs in this workspace
      if (ws.tabs) {
        ws.tabs.forEach((tab) => {
          if (
            tab.title.toLowerCase().includes(query) ||
            tab.url.toLowerCase().includes(query) ||
            (tab.url.startsWith("http") &&
              new URL(tab.url).hostname.toLowerCase().includes(query))
          ) {
            const isRecent = recentUrls.includes(tab.url);
            const typeLabel = isRecent ? "Recent Tab" : "Tab";

            // Check if we already have this URL
            if (!foundTabs.has(tab.url)) {
              foundTabs.set(tab.url, {
                tab,
                workspaceId,
                workspaceName,
                typeLabel,
                isRecent,
                isResource: false,
              });
            } else {
              // If we already have this URL, check if this one is more recent
              const existing = foundTabs.get(tab.url);
              const existingRecent = recentTabs.find(
                (rt) => rt.url === tab.url
              );
              const currentRecent = recentTabs.find((rt) => rt.url === tab.url);

              // If current is recent and existing is not, or if current is more recent
              if (
                (isRecent && !existing.isRecent) ||
                (isRecent &&
                  existing.isRecent &&
                  currentRecent &&
                  existingRecent &&
                  currentRecent.timestamp > existingRecent.timestamp)
              ) {
                foundTabs.set(tab.url, {
                  tab,
                  workspaceId,
                  workspaceName,
                  typeLabel,
                  isRecent,
                  isResource: false,
                });
              }
            }
          }
        });
      }

      // Search resources in this workspace
      if (ws.resourceCategories) {
        Object.keys(ws.resourceCategories).forEach((category) => {
          ws.resourceCategories[category].forEach((resource) => {
            if (
              resource.title.toLowerCase().includes(query) ||
              resource.url.toLowerCase().includes(query) ||
              (resource.url.startsWith("http") &&
                new URL(resource.url).hostname.toLowerCase().includes(query))
            ) {
              const isRecent = recentUrls.includes(resource.url);
              const typeLabel = isRecent ? "Recent Tab" : category;

              // Check if we already have this URL
              if (!foundTabs.has(resource.url)) {
                foundTabs.set(resource.url, {
                  tab: resource,
                  workspaceId,
                  workspaceName,
                  typeLabel,
                  isRecent,
                  isResource: true,
                });
              } else {
                // If we already have this URL, check if this one is more recent
                const existing = foundTabs.get(resource.url);
                const existingRecent = recentTabs.find(
                  (rt) => rt.url === resource.url
                );
                const currentRecent = recentTabs.find(
                  (rt) => rt.url === resource.url
                );

                // If current is recent and existing is not, or if current is more recent
                if (
                  (isRecent && !existing.isRecent) ||
                  (isRecent &&
                    existing.isRecent &&
                    currentRecent &&
                    existingRecent &&
                    currentRecent.timestamp > existingRecent.timestamp)
                ) {
                  foundTabs.set(resource.url, {
                    tab: resource,
                    workspaceId,
                    workspaceName,
                    typeLabel,
                    isRecent,
                    isResource: true,
                  });
                }
              }
            }
          });
        });
      }
    });

    // Display deduplicated results
    foundTabs.forEach((item) => {
      const resultItem = document.createElement("div");
      resultItem.className = "search-result-item";
      const icon = item.isResource ? "ri-bookmark-line" : "ri-window-line";

      // Create pins with icons
      const pins = [];

      // Always show workspace pin
      const isCurrentWorkspace = item.workspaceId === currentId;
      const workspacePinClass = isCurrentWorkspace
        ? "pin workspace-pin current"
        : "pin workspace-pin clickable";
      pins.push(
        `<span class="${workspacePinClass}" data-workspace-id="${item.workspaceId}"><i class="ri-window-2-line"></i>${item.workspaceName}</span>`
      );

      // Show recent pin only if it's in recent tabs
      if (item.isRecent) {
        pins.push(
          `<span class="pin recent-pin"><i class="ri-time-line"></i>Recent</span>`
        );
      }

      const pinsHtml = pins.join("");

      resultItem.innerHTML = `<i class="${icon}"></i> <span class="result-title">${item.tab.title}</span><div class="result-pins">${pinsHtml}</div>`;
      resultItem.onclick = () => {
        openOrActivateTab(item.tab.url);
        searchOverlay.remove();
      };
      results.appendChild(resultItem);
      hasResults = true;
    });

    if (!hasResults) {
      const noResults = document.createElement("div");
      noResults.className = "no-results";
      noResults.innerHTML = '<i class="ri-search-line"></i> No results found';
      results.appendChild(noResults);
    }

    // Add workspace pin handlers for search results
    setTimeout(addWorkspacePinHandlers, 0);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchOverlay.remove();
    } else if (e.key === "Enter") {
      const firstResult = results.querySelector(".search-result-item");
      if (firstResult) {
        firstResult.click();
      }
    }
  });

  // Close on backdrop click
  searchOverlay.onclick = (e) => {
    if (e.target === searchOverlay) {
      searchOverlay.remove();
    }
  };

  // Show recent items initially
  showRecentItems(results);

  // Add click handlers for workspace pins
  const addWorkspacePinHandlers = () => {
    const clickablePins = searchOverlay.querySelectorAll(
      ".pin.workspace-pin.clickable"
    );
    clickablePins.forEach((pin) => {
      pin.addEventListener("click", (e) => {
        e.stopPropagation();
        const workspaceId = pin.dataset.workspaceId;
        if (workspaceId && workspaceId !== currentId) {
          loadWorkspace(workspaceId);
          searchOverlay.remove();
        }
      });
    });
  };

  // Add handlers after initial render
  setTimeout(addWorkspacePinHandlers, 0);
}

function showRecentItems(results) {
  results.innerHTML = "";

  if (recentTabs.length > 0) {
    recentTabs.forEach((tab) => {
      const resultItem = document.createElement("div");
      resultItem.className = "search-result-item recent-item";
      const workspaceName = getWorkspaceName(tab.workspaceId);

      // Create pins with icons
      const pins = [];
      const isCurrentWorkspace = tab.workspaceId === currentId;
      const workspacePinClass = isCurrentWorkspace
        ? "pin workspace-pin current"
        : "pin workspace-pin clickable";
      pins.push(
        `<span class="${workspacePinClass}" data-workspace-id="${tab.workspaceId}"><i class="ri-window-2-line"></i>${workspaceName}</span>`
      );
      pins.push(
        `<span class="pin recent-pin"><i class="ri-time-line"></i>Recent</span>`
      );

      const pinsHtml = pins.join("");

      resultItem.innerHTML = `<i class="ri-window-line"></i> <span class="result-title">${tab.title}</span><div class="result-pins">${pinsHtml}</div>`;
      resultItem.onclick = () => {
        openOrActivateTab(tab.url);
        document.querySelector(".quick-search-overlay").remove();
      };
      results.appendChild(resultItem);
    });
  } else {
    const noItems = document.createElement("div");
    noItems.className = "no-results";
    noItems.innerHTML = '<i class="ri-inbox-line"></i> No recent items';
    results.appendChild(noItems);
  }
}

function closeSelectedTab() {
  if (selectedTabIndex >= 0 && currentId) {
    const ws = workspaces[currentId];
    if (ws.tabs && ws.tabs[selectedTabIndex]) {
      const tab = ws.tabs[selectedTabIndex];
      closeTabByUrl(tab.url);
      ws.tabs.splice(selectedTabIndex, 1);
      saveData();
      renderWorkspaceTabs();
      selectedTabIndex = -1;
    }
  }
}

function openSelectedTab() {
  if (selectedTabIndex >= 0 && currentId) {
    const ws = workspaces[currentId];
    if (ws.tabs && ws.tabs[selectedTabIndex]) {
      const tab = ws.tabs[selectedTabIndex];
      openOrActivateTab(tab.url);
    }
  }
}

function openAllResourcesInCurrentCategory() {
  // This would open all resources in the first available category
  // For now, we'll open all resources in the General category
  if (currentId) {
    const ws = workspaces[currentId];
    if (ws.resourceCategories && ws.resourceCategories.General) {
      openAllResourcesInCategory("General");
    }
  }
}

function bookmarkCurrentActiveTab() {
  saveCurrentActiveTab();
}

function closeAllPopups() {
  const popups = document.querySelectorAll(".category-popup");
  popups.forEach((popup) => popup.remove());
}

function showKeybindHelp() {
  showSettings();
  // Scroll to keybinds section
  setTimeout(() => {
    const keybindsSection = document.querySelector(".keybind-category");
    if (keybindsSection) {
      keybindsSection.scrollIntoView({ behavior: "smooth" });
    }
  }, 100);
}

function toggleKeybindHelp() {
  showKeybindHelp();
}

// Background control functions
function handleGrainOpacityChange(event) {
  const value = event.target.value;
  const valueDisplay = event.target.nextElementSibling;
  valueDisplay.textContent = `${value}%`;

  // Apply grain opacity
  const grainElement = document.querySelector(".noise");
  if (grainElement) {
    grainElement.style.opacity = value / 100;
  }

  // Save to storage
  chrome.storage.local.set({ grainOpacity: value });
}

function handleBackgroundBlurChange(event) {
  const value = event.target.value;
  const valueDisplay = event.target.nextElementSibling;
  valueDisplay.textContent = `${value}px`;

  // Apply background blur
  const gradientElement = document.querySelector(".gradient");
  if (gradientElement) {
    gradientElement.style.filter = `brightness(0.5) blur(${value}px)`;
  }

  // Save to storage
  chrome.storage.local.set({ backgroundBlur: value });
}

// Keyboard event listener
document.addEventListener("keydown", (e) => {
  // Don't trigger keybinds when typing in inputs or when modals are open
  if (
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA" ||
    document.querySelector(".settings-modal.active") ||
    document.querySelector(".quick-search-overlay")
  ) {
    return;
  }

  // Build key combination string
  let keyCombo = "";
  if (e.ctrlKey || e.metaKey) keyCombo += "ctrl+";
  if (e.shiftKey) keyCombo += "shift+";
  if (e.altKey) keyCombo += "alt+";

  // Handle special keys
  if (e.key === " ") {
    keyCombo += "space";
  } else if (e.key === "Escape") {
    keyCombo += "escape";
  } else if (e.key === "Enter") {
    keyCombo += "enter";
  } else if (e.key === "Delete" || e.key === "Backspace") {
    keyCombo += "delete";
  } else if (e.key.startsWith("F") && e.key.length <= 3) {
    keyCombo += e.key.toLowerCase();
  } else if (e.key === ",") {
    keyCombo += ",";
  } else if (e.key === "/") {
    keyCombo += "/";
  } else if (/^[1-9]$/.test(e.key)) {
    keyCombo += e.key;
  } else if (/^[a-z]$/.test(e.key)) {
    keyCombo += e.key.toLowerCase();
  } else {
    return; // Ignore other keys
  }

  // Check if this key combination is bound
  if (keybinds[keyCombo]) {
    e.preventDefault();
    handleKeybind(keybinds[keyCombo]);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("addWorkspaceBtn")
    .addEventListener("click", addWorkspace);

  document.getElementById("addFolderBtn").addEventListener("click", addFolder);

  document
    .getElementById("addResourceCategory")
    .addEventListener("click", addResourceCategory);

  document
    .getElementById("closeAllTabsBtn")
    .addEventListener("click", closeAllTabs);

  // Settings event listeners
  document
    .getElementById("settingsBtn")
    .addEventListener("click", showSettings);
  document
    .getElementById("closeSettingsBtn")
    .addEventListener("click", hideSettings);
  document
    .getElementById("customBackgroundInput")
    .addEventListener("change", handleCustomBackgroundUpload);

  // Background selection
  document.querySelectorAll(".background-item").forEach((item) => {
    item.addEventListener("click", () => {
      handleBackgroundSelection(item.dataset.bg);
    });
  });

  // Background control sliders
  const grainOpacitySlider = document.getElementById("grainOpacitySlider");
  const backgroundBlurSlider = document.getElementById("backgroundBlurSlider");

  if (grainOpacitySlider) {
    grainOpacitySlider.addEventListener("input", handleGrainOpacityChange);
  }

  if (backgroundBlurSlider) {
    backgroundBlurSlider.addEventListener("input", handleBackgroundBlurChange);
  }

  // Close modal when clicking backdrop
  document
    .querySelector(".settings-backdrop")
    .addEventListener("click", hideSettings);

  // Initially hide the "New Category" button
  document.getElementById("addResourceCategory").style.display = "none";

  // Initially hide the "Close All Tabs" button
  document.getElementById("closeAllTabsBtn").style.display = "none";
});

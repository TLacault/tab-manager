let workspaces = {};
let folders = {};
let currentId = null;

// Load saved workspaces & last opened workspace
chrome.storage.local.get(
  ["workspaces", "folders", "lastWorkspaceId"],
  (data) => {
    workspaces = data.workspaces || {};
    folders = data.folders || {};

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

function saveData() {
  chrome.storage.local.set({ workspaces, folders });
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
  workspaceName.textContent = ws.name;
  workspaceName.onclick = () => loadWorkspace(id);

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
  folderName.onclick = () => toggleFolder(folderId);

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
    categoryNameSpan.textContent = categoryName;

    const indicator = document.createElement("span");
    indicator.className = "category-indicator";
    indicator.style.fontSize = "16px";
    indicator.style.color = "#4caf50";
    indicator.style.fontWeight = "600";

    // Check if tab is already in this category
    const isInCategory = ws.resourceCategories[categoryName].some(
      (resource) => resource.url === tabUrl
    );
    if (isInCategory) {
      indicator.innerHTML = '<i class="ri-check-line"></i>';
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

    categoryItem.append(categoryNameSpan, indicator);

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
          { name: "Save to Category", icon: "bookmark-fill", action: "save" },
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

      categoryActions.append(renameCategoryBtn, deleteCategoryBtn);
      categoryHeader.append(categoryToggle, categoryTitle, categoryActions);

      const categoryList = document.createElement("ul");
      categoryList.className = "category-resources";
      categoryList.style.display =
        ws.categoryStates && ws.categoryStates[categoryName] ? "none" : "block";

      ws.resourceCategories[categoryName].forEach((link, i) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = "#";
        a.textContent = link.title || link.url;

        chrome.tabs.query({}, (tabs) => {
          if (tabs.find((t) => t.url === link.url)) {
            li.style.background = "rgba(255, 255, 255, 0.1)";
            li.style.outline = "1px solid rgba(255, 255, 255, 0.3)";
          }
        });

        a.onclick = () => openOrActivateTab(link.url);

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

  // Initially hide the "New Category" button
  document.getElementById("addResourceCategory").style.display = "none";

  // Initially hide the "Close All Tabs" button
  document.getElementById("closeAllTabsBtn").style.display = "none";
});

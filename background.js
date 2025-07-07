let currentWorkspaceId = null;

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get("lastWorkspaceId", (data) => {
    if (data.lastWorkspaceId) {
      currentWorkspaceId = data.lastWorkspaceId;
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "setWorkspace") {
    currentWorkspaceId = msg.workspaceId;
    chrome.storage.local.set({ lastWorkspaceId: currentWorkspaceId });
  }
});

function updateTabList() {
  chrome.storage.local.get("workspaces", (data) => {
    if (!currentWorkspaceId || !data.workspaces) return;
    const ws = data.workspaces[currentWorkspaceId];
    chrome.tabs.query({}, (tabs) => {
      const openTabs = tabs.filter(
        (t) => !t.pinned && !t.url.includes("app/index.html")
      );
      ws.tabs = openTabs.map((t) => ({
        title: t.title || t.url,
        url: t.url,
        tabId: t.id,
      }));
      chrome.storage.local.set({ workspaces: data.workspaces });
    });
  });
}

setInterval(updateTabList, 1000);

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get("workspaces", (data) => {
    if (!currentWorkspaceId || !data.workspaces) return;
    const ws = data.workspaces[currentWorkspaceId];
    ws.tabs = ws.tabs.filter((t) => t.tabId !== tabId);
    chrome.storage.local.set({ workspaces: data.workspaces });
  });
});

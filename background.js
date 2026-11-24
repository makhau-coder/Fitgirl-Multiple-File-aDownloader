const MAX_CONCURRENT = 10;

let queue = [];
let activeTabs = new Set();
let activeDownloads = new Set();
let isRunning = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_QUEUE") {
    queue = [...msg.urls];
    activeTabs.clear();
    activeDownloads.clear();
    isRunning = true;
    processQueue();
    sendResponse({ status: "started", total: queue.length });
  } else if (msg.type === "STOP_QUEUE") {
    isRunning = false;
    queue = [];
    for (const tabId of activeTabs) {
      chrome.tabs.remove(tabId).catch(() => {});
    }
    activeTabs.clear();
    sendResponse({ status: "stopped" });
  } else if (msg.type === "IS_MANAGED_TAB") {
    const tabId = sender.tab?.id;
    sendResponse({ managed: tabId ? activeTabs.has(tabId) : false });
  } else if (msg.type === "GET_STATUS") {
    sendResponse({
      isRunning,
      remaining: queue.length,
      inProgress: activeTabs.size + activeDownloads.size
    });
  }
  return true;
});

function processQueue() {
  if (!isRunning) return;

  while (
    queue.length > 0 &&
    activeTabs.size + activeDownloads.size < MAX_CONCURRENT
  ) {
    const url = queue.shift();
    chrome.tabs.create({ url, active: false }, (tab) => {
      if (tab?.id) {
        activeTabs.add(tab.id);
      }
    });
  }

  if (queue.length === 0 && activeTabs.size === 0 && activeDownloads.size === 0) {
    isRunning = false;
  }
}

chrome.downloads.onCreated.addListener((downloadItem) => {
  if (!isRunning) return;

  activeDownloads.add(downloadItem.id);

  if (downloadItem.tabId && activeTabs.has(downloadItem.tabId)) {
    const tabId = downloadItem.tabId;
    activeTabs.delete(tabId);
    setTimeout(() => {
      chrome.tabs.remove(tabId).catch(() => {});
    }, 1500);
  }
});

chrome.downloads.onChanged.addListener((delta) => {
  if (!activeDownloads.has(delta.id)) return;

  if (
    delta.state &&
    (delta.state.current === "complete" || delta.state.current === "interrupted")
  ) {
    activeDownloads.delete(delta.id);
    processQueue();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeTabs.has(tabId)) {
    activeTabs.delete(tabId);
    processQueue();
  }
});

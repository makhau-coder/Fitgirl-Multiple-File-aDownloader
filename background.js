const MAX_CONCURRENT = 10;

let queue = [];
let activeTabs = new Set();
let activeDownloads = new Set();
let seenDownloadUrls = new Set();
let isRunning = false;
let isProcessing = false;

async function saveState() {
  await chrome.storage.session.set({
    queue,
    activeTabs: [...activeTabs],
    activeDownloads: [...activeDownloads],
    seenDownloadUrls: [...seenDownloadUrls],
    isRunning
  });
}

async function loadState() {
  const data = await chrome.storage.session.get([
    "queue",
    "activeTabs",
    "activeDownloads",
    "seenDownloadUrls",
    "isRunning"
  ]);

  queue = data.queue || [];
  activeTabs = new Set(data.activeTabs || []);
  activeDownloads = new Set(data.activeDownloads || []);
  seenDownloadUrls = new Set(data.seenDownloadUrls || []);
  isRunning = Boolean(data.isRunning);

  // Prune any stale tab or download IDs after a service worker wake-up
  if (activeTabs.size > 0) {
    const openTabs = await chrome.tabs.query({});
    const openIds = new Set(openTabs.map((t) => t.id));
    activeTabs = new Set([...activeTabs].filter((id) => openIds.has(id)));
  }

  if (activeDownloads.size > 0) {
    const inProgress = await chrome.downloads.search({ state: "in_progress" });
    const liveIds = new Set(inProgress.map((d) => d.id));
    activeDownloads = new Set([...activeDownloads].filter((id) => liveIds.has(id)));
  }
}

const readyPromise = loadState();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    await readyPromise;

    if (msg.type === "START_QUEUE") {
      if (isRunning) {
        sendResponse({ status: "already_running" });
        return;
      }
      queue = [...new Set(msg.urls)];
      activeTabs.clear();
      activeDownloads.clear();
      seenDownloadUrls.clear();
      isRunning = true;
      await saveState();
      processQueue();
      sendResponse({ status: "started", total: queue.length });
    } else if (msg.type === "STOP_QUEUE") {
      isRunning = false;
      queue = [];
      for (const tabId of activeTabs) {
        chrome.tabs.remove(tabId).catch(() => {});
      }
      activeTabs.clear();
      seenDownloadUrls.clear();
      await saveState();
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
    } else if (msg.type === "CLOSE_ME") {
      const tabId = sender.tab?.id;
      if (tabId) {
        activeTabs.delete(tabId);
        chrome.tabs.remove(tabId).catch(() => {});
        await saveState();
        // Wait briefly so downloads.onCreated registers before refilling free slots
        setTimeout(() => processQueue(), 1000);
      }
      sendResponse({ closed: true });
    }
  })();

  return true;
});

async function processQueue() {
  await readyPromise;
  if (!isRunning || isProcessing) return;
  isProcessing = true;

  try {
    while (
      isRunning &&
      queue.length > 0 &&
      activeTabs.size + activeDownloads.size < MAX_CONCURRENT
    ) {
      const url = queue.shift();
      const tab = await chrome.tabs.create({ url, active: false });
      if (tab?.id) {
        activeTabs.add(tab.id);
      }
      await saveState();
    }

    if (queue.length === 0 && activeTabs.size === 0 && activeDownloads.size === 0) {
      isRunning = false;
      await saveState();
    }
  } finally {
    isProcessing = false;
  }
}

chrome.downloads.onCreated.addListener(async (downloadItem) => {
  await readyPromise;
  if (!isRunning) return;

  // Guard against duplicate downloads of the exact same URL
  if (downloadItem.url && seenDownloadUrls.has(downloadItem.url)) {
    chrome.downloads.cancel(downloadItem.id).catch(() => {});
    return;
  }

  if (downloadItem.url) {
    seenDownloadUrls.add(downloadItem.url);
  }
  activeDownloads.add(downloadItem.id);
  await saveState();
});

chrome.downloads.onChanged.addListener(async (delta) => {
  await readyPromise;
  if (!activeDownloads.has(delta.id)) return;

  if (
    delta.state &&
    (delta.state.current === "complete" || delta.state.current === "interrupted")
  ) {
    activeDownloads.delete(delta.id);
    await saveState();
    processQueue();
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await readyPromise;
  if (activeTabs.has(tabId)) {
    activeTabs.delete(tabId);
    await saveState();
    processQueue();
  }
});
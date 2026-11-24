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
        if (isRunning) {
          setTimeout(() => processQueue(), 1500);
        }
      }
      sendResponse({ closed: true });
    } else if (msg.type === "DOWNLOAD_DIRECT") {
      const tabId = sender.tab?.id;

      if (isRunning && seenDownloadUrls.has(msg.url)) {
        if (tabId) {
          activeTabs.delete(tabId);
          chrome.tabs.remove(tabId).catch(() => {});
        }
        await saveState();
        sendResponse({ started: false, duplicate: true });
        return;
      }

      if (isRunning) {
        seenDownloadUrls.add(msg.url);
      }

      try {
        const downloadId = await chrome.downloads.download({ url: msg.url });
        if (isRunning && downloadId) {
          activeDownloads.add(downloadId);
        }
      } catch (err) {
        console.error("Download failed to start:", err);
      }

      if (tabId) {
        activeTabs.delete(tabId);
        chrome.tabs.remove(tabId).catch(() => {});
      }

      await saveState();
      if (isRunning) processQueue();
      sendResponse({ started: true });
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

  if (isRunning && !activeDownloads.has(downloadItem.id)) {
    activeDownloads.add(downloadItem.id);
    await saveState();
  }

  if (downloadItem.referrer && downloadItem.referrer.startsWith("https://fuckingfast.co/")) {
    const refBase = downloadItem.referrer.split("#")[0];
    const tabs = await chrome.tabs.query({ url: "https://fuckingfast.co/*" });
    for (const tab of tabs) {
      const tabBase = (tab.url || "").split("#")[0];
      if (tabBase === refBase && tab.id) {
        activeTabs.delete(tab.id);
        await saveState();
        setTimeout(() => {
          chrome.tabs.remove(tab.id).catch(() => {});
        }, 1000);
      }
    }
  }
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
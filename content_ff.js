(function () {
  if (window.__ffBatchRunning) return;
  window.__ffBatchRunning = true;

  function requestClose(delayMs = 1500) {
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: "CLOSE_ME" });
    }, delayMs);
  }

  // Fallback: if HTMX handles the download directly, close the tab after it responds
  document.body.addEventListener("htmx:afterRequest", () => {
    requestClose(1500);
  });

  function normalizeUrl(rawUrl) {
    if (!rawUrl) return null;
    try {
      return new URL(rawUrl, window.location.origin).href;
    } catch {
      return null;
    }
  }

  async function resolveDirectUrl(hxPost) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(hxPost, {
        method: "POST",
        credentials: "include",
        redirect: "manual",
        headers: {
          "HX-Request": "true",
          "HX-Current-URL": window.location.href
        }
      });

      const headerUrl = normalizeUrl(
        res.headers.get("HX-Redirect") ||
          res.headers.get("HX-Location") ||
          res.headers.get("Location")
      );
      if (headerUrl && headerUrl.includes("/dl/")) {
        return headerUrl;
      }

      if (res.type !== "opaqueredirect") {
        const body = await res.text();
        const match = body.match(/https?:\/\/[^\s"'<>]*\/dl\/[^\s"'<>]+/i);
        if (match) {
          return match[0];
        }
      }

      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 600));
      } else if (headerUrl) {
        return headerUrl;
      }
    }
    return null;
  }

  async function startDirectDownload(hxPost) {
    try {
      const directUrl = await resolveDirectUrl(hxPost);
      if (!directUrl) return false;

      chrome.runtime.sendMessage({
        type: "DOWNLOAD_DIRECT",
        url: directUrl
      });
      requestClose(2500);
      return true;
    } catch (err) {
      console.error("FF Batch Downloader error:", err);
      return false;
    }
  }

  chrome.runtime.sendMessage({ type: "IS_MANAGED_TAB" }, (res) => {
    const isManaged = Boolean(res && res.managed);

    const waitForButton = setInterval(() => {
      const dlBtn = document.querySelector("a.link-button[hx-post]");
      if (!dlBtn) return;

      clearInterval(waitForButton);
      const hxPost = dlBtn.getAttribute("hx-post");

      if (isManaged) {
        startDirectDownload(hxPost).then((ok) => {
          if (!ok) dlBtn.click();
        });
      } else {
        // Cloning strips HTMX's already-bound click listener cleanly
        const cleanBtn = dlBtn.cloneNode(true);
        cleanBtn.removeAttribute("hx-post");
        dlBtn.replaceWith(cleanBtn);

        cleanBtn.addEventListener("click", (e) => {
          e.preventDefault();
          startDirectDownload(hxPost);
        });
      }
    }, 500);
  });
})();
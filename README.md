# FF Batch Downloader

A Manifest V3 Chrome extension that queues and batch-downloads `fuckingfast.co` links from FitGirl Pastebin pages with concurrent download limits, selective file filtering, and automatic tab cleanup.

## Features

- **Selective Checkboxes:** Injects checkboxes next to every `fuckingfast.co` link on the paste page, with quick-select buttons for **All**, **None**, and **Parts Only** (skips `selective` and `optional` `.bin` files).
- **Concurrent Queueing:** Downloads up to **10 files simultaneously** and automatically queues the next file as each download finishes or is interrupted.
- **Smart HTMX Click & Duplicate Guard:** Listens for `htmx:beforeRequest` so the `DOWNLOAD` button is only clicked a second time if an ad intercepts the first click, preventing duplicate downloads.
- **Automatic Tab Cleanup:** Closes `fuckingfast.co` tabs automatically once the download request fires (works in both batch mode and manual browsing).
- **Service Worker Persistence:** Stores active queue and download state in `chrome.storage.session` so long batches survive Chrome's Manifest V3 service worker sleep cycles.

## Project Structure

```text
ff-batch-downloader/
├── manifest.json       # Extension permissions, host matches, and MV3 config
├── background.js       # Queue manager, concurrency limiter, and session state
├── content_paste.js    # Checkbox injection and floating control panel on Pastebin
├── content_ff.js       # Automated HTMX download trigger and tab-close signal
└── README.md
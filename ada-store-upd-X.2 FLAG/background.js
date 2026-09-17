// Load configuration (e.g., LOG_SERVER_BASE_URL)
importScripts("config.js");

const PAGE = "page.html";
const MYACTIVITY_URL = "https://myactivity.google.com/myactivity";
const CLOSE_TAB_AFTER_DELETE = false; // set false if you want to keep the tab open

async function getOrCreateParticipantUuid() {
  const { participant_uuid: stored } = await chrome.storage.local.get(
    "participant_uuid"
  );
  if (stored && typeof stored === "string" && stored.trim()) {
    return stored;
  }

  const uuid = crypto.randomUUID();
  await chrome.storage.local.set({ participant_uuid: uuid });
  return uuid;
}

async function getOrCreateTFlag() {
  const { t_flag: stored } = await chrome.storage.local.get("t_flag");
  if (stored === 0 || stored === 1) {
    return stored;
  }

  const flag = Math.random() < 0.5 ? 0 : 1;
  await chrome.storage.local.set({ t_flag: flag });
  return flag;
}


let enableLoggedThisSession = false;

async function logEnableEvent() {
  try {
    if (enableLoggedThisSession) return;
    if (!LOG_SERVER_BASE_URL || typeof LOG_SERVER_BASE_URL !== "string") {
      return;
    }

    const base = LOG_SERVER_BASE_URL.replace(/\/$/, "");
    const url = `${base}/enable`;
    const participantUuid = await getOrCreateParticipantUuid();
    const at = new Date().toISOString();

    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        participant_uuid: participantUuid,
        at,
      }),
    });

    enableLoggedThisSession = true;

    // When the extension is (re)enabled and first used,
    // ensure the periodic ping loop is running.
    startPingLoop();
  } catch (e) {
    console.warn("Failed to log enable event", e);
  }
}

let pingIntervalId = null;

function stopPingLoop() {
  if (pingIntervalId !== null) {
    clearInterval(pingIntervalId);
    pingIntervalId = null;
  }
}

// async function logPingEvent() {
//   try {
//     if (!LOG_SERVER_BASE_URL || typeof LOG_SERVER_BASE_URL !== "string") {
//       return;
//     }

//     const base = LOG_SERVER_BASE_URL.replace(/\/$/, "");
//     const url = `${base}/ping`;
//     const participantUuid = await getOrCreateParticipantUuid();
//     const at = new Date().toISOString();

//     await fetch(url, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({
//         participant_uuid: participantUuid,
//         at,
//       }),
//     });
//   } catch (e) {
//     console.warn("Failed to log ping event", e);
//   }
// }

async function logPingEvent() {
  try {
    if (!LOG_SERVER_BASE_URL || typeof LOG_SERVER_BASE_URL !== "string") return;

    const base = LOG_SERVER_BASE_URL.replace(/\/$/, "");
    const participantUuid = await getOrCreateParticipantUuid();
    const at = new Date().toISOString();

    const res = await fetch(`${base}/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_uuid: participantUuid, at }),
    });

    // Store the code only on first ping (server returns non-null code exactly once)
    if (res.ok) {
      const data = await res.json();
      if (data.code) {
        await chrome.storage.local.set({ ada_code: data.code });
      }
    }
  } catch (e) {
    console.warn("Failed to log ping event", e);
  }
}


async function logEventToServer({ action, event_type, client_time, params, extras }) {
  if (!LOG_SERVER_BASE_URL || typeof LOG_SERVER_BASE_URL !== "string") {
    return;
  }

  const base = LOG_SERVER_BASE_URL.replace(/\/$/, "");
  const url = `${base}/events`;
  const participantUuid = await getOrCreateParticipantUuid();

  const body = {
    participant_uuid: participantUuid,
    event_type: event_type || "event",
    client_time: client_time || new Date().toISOString(),
    action: action || null,
    params: params || null,
    extras: extras || null,
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn("Failed to log /events action", action, e);
  }
}

// function startPingLoop() {
//   try {
//     if (pingIntervalId !== null) return;
//     if (!LOG_SERVER_BASE_URL || typeof LOG_SERVER_BASE_URL !== "string") {
//       return;
//     }

//     // Send one ping immediately, then every 10 seconds
//     logPingEvent();
//     pingIntervalId = setInterval(() => {
//       logPingEvent();
//     }, 5000);
//   } catch (e) {
//     console.warn("Failed to start ping loop", e);
//   }
// }


function startPingLoop() {
  if (pingIntervalId !== null) return;
  if (!LOG_SERVER_BASE_URL || typeof LOG_SERVER_BASE_URL !== "string") return;

  logPingEvent();   // immediate first ping → triggers ada_code write
  pingIntervalId = setInterval(logPingEvent, 5000);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "ada:ui-opened") startPingLoop();
  if (msg?.type === "ada:ui-closed") stopPingLoop();
});
function setUninstallUrl(participantUuid, installedAt) {
  try {
    if (!LOG_SERVER_BASE_URL || typeof LOG_SERVER_BASE_URL !== "string") {
      return;
    }

    const base = LOG_SERVER_BASE_URL.replace(/\/$/, "");
    let uninstallUrl = `${base}/uninstall?participant_uuid=${encodeURIComponent(
      participantUuid
    )}`;
    if (installedAt) {
      uninstallUrl += `&installed_at=${encodeURIComponent(installedAt)}`;
    }

    chrome.runtime.setUninstallURL(uninstallUrl);
  } catch (e) {
    console.warn("Failed to set uninstall URL", e);
  }
}

async function logInstallEvent() {
  try {
    if (!LOG_SERVER_BASE_URL || typeof LOG_SERVER_BASE_URL !== "string") {
      return; // misconfigured; do not block install
    }

    const base = LOG_SERVER_BASE_URL.replace(/\/$/, "");
    const url = `${base}/install`;
    const participantUuid = await getOrCreateParticipantUuid();
    const tFlag = await getOrCreateTFlag();
    const installedAt = new Date().toISOString();

    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        participant_uuid: participantUuid,
        installed_at: installedAt,
        t_flag: tFlag,
      }),
    });

    // Also configure uninstall URL so the browser will
    // call GET /uninstall with the same identifiers
    setUninstallUrl(participantUuid, installedAt);
  } catch (e) {
    // Swallow errors so install flow is never blocked by logging
    console.warn("Failed to log install event", e);
  }
}

async function openPage() {
  await chrome.tabs.create({ url: chrome.runtime.getURL(PAGE), active: true });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const { openedOnce } = await chrome.storage.local.get("openedOnce");
  if (!openedOnce) {
    await chrome.storage.local.set({ openedOnce: true });
    await openPage();
  }

   // Log installation event to server only on first install
   if (details?.reason === "install") {
     await logInstallEvent();
   }

   // Start periodic pings whenever the extension is installed/updated
   startPingLoop();
});

chrome.runtime.onStartup.addListener(() => {
  // Log that the extension is enabled/active in this profile session
  logEnableEvent();
  startPingLoop();
});

chrome.action.onClicked.addListener(async () => {
  await logEnableEvent();
  await openPage();
});

function waitForTabLoad(tabId, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    const timer = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("Timed out waiting for My Activity to load."));
      }
    }, 500);
  });
}

/**
 * Supports multiple clicks safely (no races).
 * requestId -> { sendResponse, tabId }
 */
const pending = new Map();

/**
 * Delete requests: token -> { sendResponse, tabId }
 * (sendResponse optional; you may not need response for delete)
 */
const pendingDeletes = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "LOG_EVENT") {
        await logEventToServer({
          action: msg.action,
          event_type: msg.event_type,
          client_time: msg.client_time,
          params: msg.params,
          extras: msg.extras,
        });

        sendResponse?.({ ok: true });
        return;
      }



      // Ensure we log an enable event the first time the extension is used
      await logEnableEvent();

      // =========================
      // 1) Existing scrape handler
      // =========================
      if (msg?.type === "SCRAPE_MYACTIVITY_BACKGROUND") {
        const requestId = msg.requestId || crypto.randomUUID();
        pending.set(requestId, { sendResponse, tabId: null });

        const res = await fetch("https://myactivity.google.com/item", {
          method: "GET",
          credentials: "include",
          redirect: "follow",
        });

        if (!res.ok) {
          throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
        }

        const html = await res.text();

        const entry = pending.get(requestId);
        entry?.sendResponse?.({ ok: true, html });
        pending.delete(requestId);
        return;
      }

      // ==========================================
      // 2) NEW: delete item by data-token (uniqueId)
      // ==========================================
      if (msg?.type === "DELETE_MYACTIVITY_BY_TOKEN") {
        const token = msg.token;
        if (!token) throw new Error("Missing token for deletion.");

        const requestId = msg.requestId || crypto.randomUUID();
        pendingDeletes.set(requestId, { sendResponse, tabId: null, token });

        // Open My Activity in a background tab
        const tab = await chrome.tabs.create({
          url: MYACTIVITY_URL,
          active: true,
        });

        const rec = pendingDeletes.get(requestId);
        if (rec) rec.tabId = tab.id;

        // Wait until tab fully loads
        await waitForTabLoad(tab.id, 150000);



        // Ask content script to delete the card by token
        await chrome.tabs.sendMessage(tab.id, {
          type: "DO_DELETE_BY_TOKEN",
          token,
        });

        // Optionally close the tab after a short delay
        if (CLOSE_TAB_AFTER_DELETE) {
          setTimeout(() => {
            chrome.tabs.remove(tab.id).catch(() => {});
          }, 2500);
        }

        // Respond back (optional)
        const finalRec = pendingDeletes.get(requestId);
        finalRec?.sendResponse?.({ ok: true, token });
        pendingDeletes.delete(requestId);
        return;
      }

      // If message type not recognized:
      sendResponse?.({ ok: false, error: "Unknown message type." });
    } catch (e) {
      const errMsg = e?.message || String(e);

      // handle scrape error path (existing)
      if (msg?.type === "SCRAPE_MYACTIVITY_BACKGROUND") {
        const requestId = msg.requestId;
        const entry = requestId ? pending.get(requestId) : null;

        if (entry?.sendResponse) {
          entry.sendResponse({ ok: false, error: errMsg });
          if (entry?.tabId) {
            try { await chrome.tabs.remove(entry.tabId); } catch (_) {}
          }
          if (requestId) pending.delete(requestId);
          return;
        }
      }

      // handle delete error path (new)
      if (msg?.type === "DELETE_MYACTIVITY_BY_TOKEN") {
        const requestId = msg.requestId;
        const del = requestId ? pendingDeletes.get(requestId) : null;

        if (del?.sendResponse) {
          del.sendResponse({ ok: false, error: errMsg, token: del.token });
          if (del?.tabId) {
            try { await chrome.tabs.remove(del.tabId); } catch (_) {}
          }
          if (requestId) pendingDeletes.delete(requestId);
          return;
        }
      }

      sendResponse?.({ ok: false, error: errMsg });
    }
  })();

  return true; // async
});

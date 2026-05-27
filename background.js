const CHECK_INTERVAL = 15;

chrome.runtime.onInstalled.addListener(() => { setupAlarm(); checkForum(); });
chrome.runtime.onStartup.addListener(() => { setupAlarm(); });

function setupAlarm() {
  chrome.alarms.clearAll(() => {
    chrome.alarms.create("forumCheck", { periodInMinutes: CHECK_INTERVAL / 60 });
  });
}
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "forumCheck") checkForum();
});


async function updateBadge(count, hasUnread) {
  if (count > 0 && hasUnread) {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: "#e53e3e" });
  } else if (count > 0) {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: "#718096" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}



function notify(item) {
  chrome.notifications.create(item.id, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: item.type === "New Ticket" ? "New Support Ticket" : "New Reply Waiting",
    message: item.title,
    contextMessage: "By: " + item.author,
    priority: 2
  });
}



function parseTopics(html) {
  const seen   = new Set();
  const topics = [];

  const linkRe = /href="(https?:\/\/wordpress\.org\/support\/topic\/[^"#?]+)"[^>]*class="bbp-topic-permalink"|class="bbp-topic-permalink"[^>]*href="(https?:\/\/wordpress\.org\/support\/topic\/[^"#?]+)"/gi;

  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const link = (m[1] || m[2]).replace(/\/$/, "").trim();
    if (seen.has(link)) continue;
    seen.add(link);

    const winStart = Math.max(0, m.index - 200);
    const winEnd   = Math.min(html.length, m.index + 3000);
    const block    = html.slice(winStart, winEnd);

    const t = extractFields(block, link);
    if (t) topics.push(t);
  }

  return topics;
}

function extractFields(block, link) {
  const titleM = block.match(/class="bbp-topic-permalink"[^>]*>([\s\S]*?)<\/a>/i);
  const title  = titleM ? titleM[1].replace(/<[^>]+>/g, "").trim() : "";
  if (!title) return null;

  let startedBy = "";
  const sbM = block.match(/bbp-topic-started-by[\s\S]{0,500}?bbp-author-name[^>]*>([\s\S]*?)<\/span>/i);
  if (sbM) startedBy = sbM[1].replace(/<[^>]+>/g, "").trim().toLowerCase();
  if (!startedBy) {
    const fbM = block.match(/[Ss]tarted\s+by:?\s*<[^>]+>([^<]+)<\/a>/i)
             || block.match(/[Ss]tarted\s+by:?\s+([A-Za-z0-9_.\-]+)/i);
    if (fbM) startedBy = fbM[1].trim().toLowerCase();
  }

  let replies = 0;
  const rcM = block.match(/class="bbp-topic-reply-count"[^>]*>\s*(\d+)\s*</i);
  if (rcM) replies = parseInt(rcM[1]);

  let lastUser = "";
  const luM = block.match(/bbp-topic-freshness-author[\s\S]{0,500}?bbp-author-name[^>]*>([\s\S]*?)<\/span>/i);
  if (luM) lastUser = luM[1].replace(/<[^>]+>/g, "").trim().toLowerCase();

  return { link, title, startedBy, lastUser, replies };
}


async function checkForum() {
  const storage = await chrome.storage.local.get([
    "monitorUrl", "knownItems", "isFirstScan", "hasUnread"
  ]);

  const url = storage.monitorUrl;
  if (!url) return;

  let knownItems    = storage.knownItems || {};
  const isFirstScan = storage.isFirstScan !== false;
  let   hasUnread   = storage.hasUnread   || false;

  try {
    console.log("[WP Monitor] Fetching:", url);
    const response = await fetch(url + "?t=" + Date.now(), { cache: "no-cache" });
    if (!response.ok) {
      await chrome.storage.local.set({ lastError: "HTTP " + response.status, lastChecked: Date.now() });
      return;
    }

    const html   = await response.text();
    const topics = parseTopics(html);

    console.log("[WP Monitor] Topics parsed:", topics.length, "| isFirstScan:", isFirstScan);

    // ── Build the LIVE waiting list (startedBy === lastUser) ──────────────────
    const waitingTopics = topics
      .filter(t => t.startedBy && t.startedBy === t.lastUser)
      .map(t => ({
        id:      t.link + "__" + t.replies,
        title:   t.title,
        link:    t.link,
        replies: t.replies,
        author:  t.startedBy,
        type:    t.replies === 0 ? "New Ticket" : "New Reply"
      }));

    console.log("[WP Monitor] Waiting for support:", waitingTopics.length);

    if (isFirstScan) {
      // First scan — just record known state, no notifications, populate the feed
      for (const item of waitingTopics) knownItems[item.id] = true;

      await chrome.storage.local.set({
        activities:  waitingTopics,   // show immediately on first load
        knownItems,
        isFirstScan: false,
        lastChecked: Date.now(),
        lastError:   ""
      });

      updateBadge(waitingTopics.length, false);
      console.log("[WP Monitor] First scan done. Feed populated with", waitingTopics.length, "items.");
      return;
    }

    const newItems = waitingTopics.filter(item => !knownItems[item.id]);

    for (const item of newItems) {
      knownItems[item.id] = true;
      item.time = new Date().toLocaleTimeString();
      notify(item);
      hasUnread = true;
      console.log("[WP Monitor] NEW ITEM:", item);
    }

    // Add time to existing items that don't have it yet
    waitingTopics.forEach(item => {
      if (!item.time) item.time = "";
    });

    // The activity feed IS the live waiting list — always replace it wholesale
    await chrome.storage.local.set({
      activities:  waitingTopics,
      knownItems,
      hasUnread,
      lastChecked: Date.now(),
      lastError:   ""
    });

    updateBadge(waitingTopics.length, hasUnread);

  } catch (err) {
    console.error("[WP Monitor] ERROR:", err);
    await chrome.storage.local.set({ lastError: err.message, lastChecked: Date.now() });
  }
}


chrome.notifications.onClicked.addListener(async (id) => {
  const data = await chrome.storage.local.get(["activities"]);
  const item = (data.activities || []).find(x => x.id === id);
  if (item) chrome.tabs.create({ url: item.link });
  chrome.notifications.clear(id);
  await chrome.storage.local.set({ hasUnread: false });
  const acts = (data.activities || []);
  updateBadge(acts.length, false);
});



chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "POPUP_OPENED") {
    chrome.storage.local.get(["activities"], data => {
      chrome.storage.local.set({ hasUnread: false }, () => {
        updateBadge((data.activities || []).length, false);
        sendResponse({ ok: true });
      });
    });
    return true;
  }
  if (msg.type === "FORCE_CHECK") {
    checkForum().then(() => sendResponse({ ok: true }));
    return true;
  }
});

const CHECK_INTERVAL = 15;

/* =========================
   STARTUP
========================= */

chrome.runtime.onInstalled.addListener(() => {
  setupAlarm();
  checkForum();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarm();
});

function setupAlarm() {
  chrome.alarms.clearAll(() => {
    chrome.alarms.create("forumCheck", { periodInMinutes: CHECK_INTERVAL / 60 });
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "forumCheck") checkForum();
});


/* =========================
   BADGE
========================= */

async function updateBadge() {
  const data = await chrome.storage.local.get(["activities", "hasUnread"]);
  const count = (data.activities || []).length;
  const hasUnread = data.hasUnread || false;

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


/* =========================
   NOTIFICATION
========================= */

function notify(item) {
  chrome.notifications.create(item.id, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: item.type === "New Ticket" ? "New Support Ticket" : "New Reply Waiting",
    message: item.title,
    contextMessage: "By: " + item.author,
    priority: 2,
    requireInteraction: false
  });
}


/* =========================
   SAVE ACTIVITY
========================= */

async function saveActivity(item) {
  const storage = await chrome.storage.local.get(["activities"]);
  let activities = storage.activities || [];

  const exists = activities.some(x => x.id === item.id);
  if (exists) return false;

  activities.unshift(item);
  activities = activities.slice(0, 50);

  await chrome.storage.local.set({ activities, hasUnread: true });
  updateBadge();
  return true;
}


/* =========================
   REMOVE RESOLVED
========================= */

async function removeResolvedByLink(link) {
  const storage = await chrome.storage.local.get(["activities"]);
  let activities = storage.activities || [];
  const norm = s => s.replace(/\/$/, "").toLowerCase();
  const before = activities.length;
  activities = activities.filter(x => norm(x.link) !== norm(link));
  if (before !== activities.length) {
    await chrome.storage.local.set({ activities });
    updateBadge();
  }
}


/* =========================
   PARSE HTML
   Strategy: find every bbp-topic-permalink link,
   then walk the surrounding HTML for each unique topic.
   De-duplicate by link URL.
========================= */

function parseTopics(html) {
  const seen  = new Set();
  const topics = [];

  // Find all topic permalink hrefs — deduplicated
  const linkRe = /href="(https?:\/\/wordpress\.org\/support\/topic\/[^"#?]+)"[^>]*class="bbp-topic-permalink"|class="bbp-topic-permalink"[^>]*href="(https?:\/\/wordpress\.org\/support\/topic\/[^"#?]+)"/gi;

  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const link = (m[1] || m[2]).replace(/\/$/, "").trim();

    // Skip duplicates — same link may appear in HTML more than once (e.g. in freshness column)
    if (seen.has(link)) continue;
    seen.add(link);

    // Grab a generous window around this match to find sibling fields
    // bbPress topic rows are roughly 600–1500 chars; use 3000 to be safe
    const winStart = Math.max(0, m.index - 200);
    const winEnd   = Math.min(html.length, m.index + 3000);
    const block    = html.slice(winStart, winEnd);

    const t = extractFields(block, link);
    if (t) topics.push(t);
  }

  console.log("[WP Monitor] Unique topics found:", topics.length);
  return topics;
}


/* =========================
   EXTRACT FIELDS
========================= */

function extractFields(block, link) {

  // ── TITLE ───────────────────────────────────────────────────────────────────
  const titleM = block.match(
    /class="bbp-topic-permalink"[^>]*>([\s\S]*?)<\/a>/i
  ) || block.match(
    /href="[^"]*bbp-topic-permalink[^"]*"[^>]*>([\s\S]*?)<\/a>/i
  );
  const title = titleM ? titleM[1].replace(/<[^>]+>/g, "").trim() : "";
  if (!title) return null;

  // ── STARTED BY ──────────────────────────────────────────────────────────────
  // <span class="bbp-topic-started-by">Started by: <a ...><span class="bbp-author-name">NAME</span>
  let startedBy = "";
  const sbM = block.match(
    /bbp-topic-started-by[\s\S]{0,500}?bbp-author-name[^>]*>([\s\S]*?)<\/span>/i
  );
  if (sbM) startedBy = sbM[1].replace(/<[^>]+>/g, "").trim().toLowerCase();

  // Fallback: "Started by: NAME" plain text
  if (!startedBy) {
    const fbM = block.match(/[Ss]tarted\s+by:?\s*<[^>]+>([^<]+)<\/a>/i)
             || block.match(/[Ss]tarted\s+by:?\s+([A-Za-z0-9_.\-]+)/i);
    if (fbM) startedBy = fbM[1].trim().toLowerCase();
  }

  // ── REPLY COUNT ─────────────────────────────────────────────────────────────
  // <li class="bbp-topic-reply-count">6</li>  ← plain number, no child tags
  // also handles <td class="bbp-topic-reply-count">
  let replies = 0;
  const rcM = block.match(/class="bbp-topic-reply-count"[^>]*>\s*(\d+)\s*</i);
  if (rcM) replies = parseInt(rcM[1]);

  // ── LAST USER (freshness) ───────────────────────────────────────────────────
  // <span class="bbp-topic-freshness-author">...<span class="bbp-author-name">NAME</span>
  let lastUser = "";
  const luM = block.match(
    /bbp-topic-freshness-author[\s\S]{0,500}?bbp-author-name[^>]*>([\s\S]*?)<\/span>/i
  );
  if (luM) lastUser = luM[1].replace(/<[^>]+>/g, "").trim().toLowerCase();

  return { link, title, startedBy, lastUser, replies };
}


/* =========================
   MAIN CHECKER
========================= */

async function checkForum() {
  const storage = await chrome.storage.local.get([
    "monitorUrl", "knownItems", "isFirstScan"
  ]);

  const url = storage.monitorUrl;
  if (!url) return;

  let knownItems    = storage.knownItems  || {};
  // isFirstScan is true until we've done one successful scan
  const isFirstScan = storage.isFirstScan !== false;

  try {
    console.log("[WP Monitor] Fetching:", url);

    const response = await fetch(url + "?t=" + Date.now(), { cache: "no-cache" });

    if (!response.ok) {
      await chrome.storage.local.set({ lastError: "HTTP " + response.status, lastChecked: Date.now() });
      return;
    }

    const html = await response.text();

    const topics = parseTopics(html);

    // Save for debug view
    await chrome.storage.local.set({ debugTopics: topics.slice(0, 30), lastError: "" });

    console.log("[WP Monitor] isFirstScan:", isFirstScan, "| topics:", topics.length);

    if (isFirstScan) {
      // First scan: record ALL current topics as already-known so we only alert on NEW ones later
      for (const { link, replies } of topics) {
        const itemId = link + "__" + replies;
        knownItems[itemId] = true;
      }
      await chrome.storage.local.set({
        knownItems,
        isFirstScan: false,   // ← mark done immediately
        lastChecked: Date.now()
      });
      console.log("[WP Monitor] First scan done. Recorded", Object.keys(knownItems).length, "known items.");
      return; // done — no notifications on first scan
    }

    // ── Subsequent scans: check for new/changed topics ──────────────────────
    for (const { link, title, startedBy, lastUser, replies } of topics) {

      console.log("[WP Monitor]", { title, startedBy, lastUser, replies });

      if (!startedBy) continue; // couldn't parse author — skip

      // Core logic:
      // startedBy === lastUser → customer replied last → NEEDS SUPPORT → show
      // startedBy !== lastUser → support replied       → RESOLVED      → remove
      const waitingForSupport = (startedBy === lastUser);

      if (!waitingForSupport) {
        await removeResolvedByLink(link);
        continue;
      }

      // Unique key = URL + reply count
      // If customer adds another reply, count changes → new alert
      const itemId = link + "__" + replies;

      if (knownItems[itemId]) continue; // already alerted for this state
      knownItems[itemId] = true;

      const item = {
        id:     itemId,
        title,
        link,
        replies,
        author: startedBy,
        type:   replies === 0 ? "New Ticket" : "New Reply",
        time:   new Date().toLocaleTimeString()
      };

      console.log("[WP Monitor] NEW ITEM:", item);
      const saved = await saveActivity(item);
      if (saved) notify(item);
    }

    await chrome.storage.local.set({
      knownItems,
      lastChecked: Date.now()
    });

  } catch (err) {
    console.error("[WP Monitor] ERROR:", err);
    await chrome.storage.local.set({ lastError: err.message, lastChecked: Date.now() });
  }
}


/* =========================
   NOTIFICATION CLICK
========================= */

chrome.notifications.onClicked.addListener(async (id) => {
  const data = await chrome.storage.local.get(["activities"]);
  const item = (data.activities || []).find(x => x.id === id);
  if (item) chrome.tabs.create({ url: item.link });
  chrome.notifications.clear(id);
  await chrome.storage.local.set({ hasUnread: false });
  updateBadge();
});


/* =========================
   MESSAGES FROM POPUP
========================= */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "POPUP_OPENED") {
    chrome.storage.local.set({ hasUnread: false }, () => {
      updateBadge();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === "FORCE_CHECK") {
    checkForum().then(() => sendResponse({ ok: true }));
    return true;
  }
});

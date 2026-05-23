const urlInput     = document.getElementById("urlInput");
const saveBtn      = document.getElementById("saveBtn");
const activeUrl    = document.getElementById("activeUrl");
const activityFeed = document.getElementById("activityFeed");
const clearBtn     = document.getElementById("clearBtn");
const recheckBtn   = document.getElementById("recheckBtn");
const statusDot    = document.getElementById("statusDot");
const lastCheck    = document.getElementById("lastCheck");
const lastError    = document.getElementById("lastError");
const debugPanel   = document.getElementById("debugPanel");


/* =========================
   TABS
========================= */

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
    tab.classList.add("active");
    document.getElementById("tab-" + tab.dataset.tab).classList.remove("hidden");
  });
});


/* =========================
   ESCAPE
========================= */

function esc(s) {
  return String(s || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}


/* =========================
   RENDER ACTIVITIES
========================= */

function renderActivities(items, hasUnread) {
  if (!items || !items.length) {
    activityFeed.innerHTML = `
      <div class="empty-state">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" opacity="0.3">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
            stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <p>No activity yet</p>
        <small>New tickets will appear here</small>
      </div>`;
    return;
  }

  activityFeed.innerHTML = items.map((item, i) => {
    const isNew    = hasUnread && i === 0;
    const isTicket = item.type === "New Ticket";
    return `
      <a class="activity-item ${isNew ? "unread" : ""}"
         href="${esc(item.link)}" target="_blank" data-id="${esc(item.id)}">
        <div class="item-top">
          <div class="item-title">${esc(item.title)}</div>
          <span class="item-badge ${isTicket ? "badge-ticket" : "badge-reply"}">
            ${isTicket ? "Ticket" : "Reply"}
          </span>
        </div>
        <div class="item-meta">
          <span class="item-author">@${esc(item.author)}</span>
          <span class="sep">·</span>
          <span>${item.replies} ${item.replies === 1 ? "reply" : "replies"}</span>
          <span class="sep">·</span>
          <span>${esc(item.time)}</span>
        </div>
      </a>`;
  }).join("");
}


/* =========================
   RENDER DEBUG
========================= */

function renderDebug(topics, error) {
  if (error) {
    debugPanel.innerHTML = `<div class="debug-error">ERROR: ${esc(error)}</div>`;
    return;
  }

  if (!topics || !topics.length) {
    debugPanel.innerHTML = `
      <div class="empty-state">
        <small>No topics parsed yet.<br>
        Check console (F12 → background page) for raw logs.</small>
      </div>`;
    return;
  }

  debugPanel.innerHTML = topics.map(t => `
    <div class="debug-item">
      <div class="debug-title">${esc(t.title || "(no title)")}</div>
      <div class="debug-row">
        <span class="debug-label">startedBy</span>
        <span class="debug-val ${t.startedBy ? "" : "debug-missing"}">${esc(t.startedBy) || "⚠ NOT FOUND"}</span>
      </div>
      <div class="debug-row">
        <span class="debug-label">lastUser</span>
        <span class="debug-val ${t.lastUser ? "" : "debug-missing"}">${esc(t.lastUser) || "⚠ NOT FOUND"}</span>
      </div>
      <div class="debug-row">
        <span class="debug-label">replies</span>
        <span class="debug-val">${t.replies}</span>
      </div>
      <div class="debug-row">
        <span class="debug-label">waiting?</span>
        <span class="debug-val ${t.startedBy && t.startedBy === t.lastUser ? "debug-yes" : "debug-no"}">
          ${t.startedBy && t.startedBy === t.lastUser ? "YES — needs support" : "no — support replied"}
        </span>
      </div>
    </div>
  `).join("");
}


/* =========================
   STATUS DOT
========================= */

function updateStatusDot(monitorUrl, hasUnread) {
  if (!monitorUrl)  { statusDot.className = "status-dot idle";   return; }
  if (hasUnread)    { statusDot.className = "status-dot alert";  return; }
  statusDot.className = "status-dot active";
}


/* =========================
   LOAD
========================= */

async function loadData() {
  const data = await chrome.storage.local.get([
    "monitorUrl","activities","hasUnread","lastChecked","lastError","debugTopics"
  ]);

  const url        = data.monitorUrl || "";
  const activities = data.activities || [];
  const hasUnread  = data.hasUnread  || false;

  if (url) {
    urlInput.value = url;
    activeUrl.textContent = url;
    activeUrl.classList.remove("hidden");
    saveBtn.textContent = "Update";
    saveBtn.classList.add("monitoring");
  }

  if (data.lastError) {
    lastError.textContent = "Error: " + data.lastError;
    lastError.classList.remove("hidden");
  } else {
    lastError.classList.add("hidden");
  }

  renderActivities(activities, hasUnread);
  renderDebug(data.debugTopics || [], data.lastError || "");
  updateStatusDot(url, hasUnread);

  if (data.lastChecked) {
    lastCheck.textContent = new Date(data.lastChecked).toLocaleTimeString();
  }
}


/* =========================
   SAVE URL
========================= */

saveBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  if (!url) { urlInput.style.borderColor = "var(--danger)"; return; }

  await chrome.storage.local.set({
    monitorUrl:  url,
    activities:  [],
    knownItems:  {},
    hasUnread:   false,
    isFirstScan: true,
    debugTopics: [],
    lastError:   ""
  });

  activeUrl.textContent = url;
  activeUrl.classList.remove("hidden");
  saveBtn.textContent = "Update";
  saveBtn.classList.add("monitoring");

  chrome.runtime.sendMessage({ type: "FORCE_CHECK" }, () => {
    void chrome.runtime.lastError;
  });

  loadData();
});


/* =========================
   CLEAR
========================= */

clearBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({ activities: [], hasUnread: false });
  renderActivities([], false);
  updateStatusDot(urlInput.value.trim(), false);
});


/* =========================
   RECHECK (debug tab)
========================= */

recheckBtn.addEventListener("click", () => {
  recheckBtn.textContent = "Checking…";
  recheckBtn.disabled = true;
  chrome.runtime.sendMessage({ type: "FORCE_CHECK" }, () => {
    void chrome.runtime.lastError;
    setTimeout(() => {
      recheckBtn.textContent = "Check Now";
      recheckBtn.disabled = false;
      loadData();
    }, 2000);
  });
});


/* =========================
   CLICK ITEM → CLEAR UNREAD
========================= */

activityFeed.addEventListener("click", async (e) => {
  const item = e.target.closest(".activity-item");
  if (!item) return;
  item.classList.remove("unread");
  await chrome.storage.local.set({ hasUnread: false });
  updateStatusDot(urlInput.value.trim(), false);
});


/* =========================
   STORAGE LISTENER
========================= */

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  chrome.storage.local.get(
    ["activities","hasUnread","monitorUrl","lastChecked","lastError","debugTopics"],
    data => {
      renderActivities(data.activities || [], data.hasUnread || false);
      renderDebug(data.debugTopics || [], data.lastError || "");
      updateStatusDot(data.monitorUrl || "", data.hasUnread || false);
      if (data.lastChecked)
        lastCheck.textContent = new Date(data.lastChecked).toLocaleTimeString();
      if (data.lastError) {
        lastError.textContent = "Error: " + data.lastError;
        lastError.classList.remove("hidden");
      } else {
        lastError.classList.add("hidden");
      }
    }
  );
});


/* =========================
   INIT
========================= */

chrome.runtime.sendMessage({ type: "POPUP_OPENED" }, () => {
  void chrome.runtime.lastError;
});

loadData();

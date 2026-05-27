const urlInput     = document.getElementById("urlInput");
const saveBtn      = document.getElementById("saveBtn");
const activeUrl    = document.getElementById("activeUrl");
const activityFeed = document.getElementById("activityFeed");
const recheckBtn   = document.getElementById("recheckBtn");
const statusDot    = document.getElementById("statusDot");
const lastCheck    = document.getElementById("lastCheck");
const lastError    = document.getElementById("lastError");
const ticketCount  = document.getElementById("ticketCount");

function esc(s) {
  return String(s || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* =========================
   RENDER
========================= */

function renderActivities(items, hasUnread) {
  ticketCount.textContent = items.length ? items.length + " open" : "";

  if (!items.length) {
    activityFeed.innerHTML = `
      <div class="empty-state">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" opacity="0.3">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
            stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <p>All clear!</p>
        <small>No tickets waiting for support</small>
      </div>`;
    return;
  }

  activityFeed.innerHTML = items.map((item, i) => {
    const isNew    = hasUnread && i === 0;
    const isTicket = item.type === "New Ticket";
    return `
      <a class="activity-item ${isNew ? "unread" : ""}"
         href="${esc(item.link)}" target="_blank">
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
          ${item.time ? `<span class="sep">·</span><span>${esc(item.time)}</span>` : ""}
        </div>
      </a>`;
  }).join("");
}

function updateStatusDot(monitorUrl, hasUnread) {
  if (!monitorUrl)  statusDot.className = "status-dot idle";
  else if (hasUnread) statusDot.className = "status-dot alert";
  else              statusDot.className = "status-dot active";
}


async function loadData() {
  const data = await chrome.storage.local.get([
    "monitorUrl","activities","hasUnread","lastChecked","lastError"
  ]);

  const url       = data.monitorUrl || "";
  const items     = data.activities || [];
  const hasUnread = data.hasUnread  || false;

  if (url) {
    urlInput.value = url;
    activeUrl.textContent = url;
    activeUrl.classList.remove("hidden");
    saveBtn.textContent = "Update";
    saveBtn.classList.add("monitoring");
  }

  if (data.lastError) {
    lastError.textContent = "⚠ " + data.lastError;
    lastError.classList.remove("hidden");
  } else {
    lastError.classList.add("hidden");
  }

  renderActivities(items, hasUnread);
  updateStatusDot(url, hasUnread);

  if (data.lastChecked)
    lastCheck.textContent = new Date(data.lastChecked).toLocaleTimeString();
}

saveBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  if (!url) { urlInput.style.borderColor = "var(--danger)"; return; }

  await chrome.storage.local.set({
    monitorUrl:  url,
    activities:  [],
    knownItems:  {},
    hasUnread:   false,
    isFirstScan: true,
    lastError:   ""
  });

  activeUrl.textContent = url;
  activeUrl.classList.remove("hidden");
  saveBtn.textContent = "Update";
  saveBtn.classList.add("monitoring");

  recheckBtn.textContent = "↻ Scanning…";
  chrome.runtime.sendMessage({ type: "FORCE_CHECK" }, () => {
    void chrome.runtime.lastError;
    setTimeout(() => { recheckBtn.textContent = "↻ Refresh"; loadData(); }, 2500);
  });
});


recheckBtn.addEventListener("click", () => {
  recheckBtn.textContent = "↻ Scanning…";
  recheckBtn.disabled = true;
  chrome.runtime.sendMessage({ type: "FORCE_CHECK" }, () => {
    void chrome.runtime.lastError;
    setTimeout(() => {
      recheckBtn.textContent = "↻ Refresh";
      recheckBtn.disabled = false;
      loadData();
    }, 2500);
  });
});


activityFeed.addEventListener("click", async () => {
  await chrome.storage.local.set({ hasUnread: false });
  updateStatusDot(urlInput.value.trim(), false);
  document.querySelectorAll(".activity-item.unread")
    .forEach(el => el.classList.remove("unread"));
});


chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  chrome.storage.local.get(
    ["activities","hasUnread","monitorUrl","lastChecked","lastError"],
    data => {
      renderActivities(data.activities || [], data.hasUnread || false);
      updateStatusDot(data.monitorUrl || "", data.hasUnread || false);
      if (data.lastChecked)
        lastCheck.textContent = new Date(data.lastChecked).toLocaleTimeString();
      if (data.lastError) {
        lastError.textContent = "⚠ " + data.lastError;
        lastError.classList.remove("hidden");
      } else {
        lastError.classList.add("hidden");
      }
    }
  );
});
//init baby

chrome.runtime.sendMessage({ type: "POPUP_OPENED" }, () => {
  void chrome.runtime.lastError;
});
loadData();

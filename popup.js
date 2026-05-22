const saveBtn =
  document.getElementById("saveBtn");

const monitorSite =
  document.getElementById("monitorSite");

const activityFeed =
  document.getElementById(
    "activityFeed"
  );


/* =========================
   EXTRACT PLUGIN NAME
========================= */

function extractPluginName(url) {

  try {

    const match = url.match(
      /support\/plugin\/([^\/]+)/i
    );

    if (!match) {
      return "Unknown Plugin";
    }

    const slug = match[1];

    return slug
      .replace(/-/g, " ")
      .replace(
        /\b\w/g,
        l => l.toUpperCase()
      );

  } catch {

    return "Unknown Plugin";

  }

}


/* =========================
   RENDER ACTIVITY
========================= */

function renderActivity(items) {

  if (!items.length) {

    activityFeed.innerHTML = `
      <div class="empty-state">
        No activity yet
      </div>
    `;

    return;
  }

  activityFeed.innerHTML = "";

  items.forEach(item => {

    activityFeed.innerHTML += `
      <a
        href="${item.link}"
        target="_blank"
        class="activity-item"
      >

        <div class="activity-item-title">
          ${item.title}
        </div>

        <div class="activity-item-meta">
          ${item.type} - ${item.time}
        </div>

      </a>
    `;

  });

}


/* =========================
   LOAD ACTIVITY
========================= */

async function loadActivity() {

  const data =
    await chrome.storage.local.get([
      "recentActivity"
    ]);

  renderActivity(
    data.recentActivity || []
  );

}


/* =========================
   LOAD INITIAL DATA
========================= */

window.addEventListener(
  "DOMContentLoaded",
  async () => {

    const data =
      await chrome.storage.local.get([
        "monitorUrl",
        "recentActivity"
      ]);

    /* =========================
       MONITORING INFO
    ========================= */

    if (data.monitorUrl) {

      const pluginName =
        extractPluginName(
          data.monitorUrl
        );

      monitorSite.innerText =
        `${pluginName} Plugin`;

      saveBtn.innerText =
        "Monitoring Active";

    } else {

      monitorSite.innerText =
        "No active monitoring";

    }

    /* =========================
       ACTIVITY
    ========================= */

    renderActivity(
      data.recentActivity || []
    );

  }
);


/* =========================
   SAVE URL
========================= */

saveBtn.addEventListener(
  "click",
  async () => {

    const url =
      document
        .getElementById("url")
        .value
        .trim();

    if (!url) {

      alert(
        "Please enter a URL"
      );

      return;
    }

    /* =========================
       GET PREVIOUS URL
    ========================= */

    const oldData =
      await chrome.storage.local.get([
        "monitorUrl"
      ]);

    const oldUrl =
      oldData.monitorUrl || "";

    /* =========================
       URL CHANGED
    ========================= */

    if (oldUrl !== url) {

      console.log(
        "New URL detected. Cleaning old data..."
      );

      await chrome.storage.local.remove([
        "recentActivity",
        "knownTopics"
      ]);

      /* CLEAR UI */

      activityFeed.innerHTML = `
        <div class="empty-state">
          No activity yet
        </div>
      `;

    }

    /* =========================
       SAVE NEW URL
    ========================= */

    await chrome.storage.local.set({
      monitorUrl: url
    });

    /* =========================
       UPDATE UI
    ========================= */

    const pluginName =
      extractPluginName(url);

    monitorSite.innerText =
      `${pluginName} Plugin`;

    saveBtn.innerText =
      "Monitoring Active";

    /* =========================
       RELOAD ACTIVITY
    ========================= */

    loadActivity();

  }
);


/* =========================
   LIVE UI AUTO REFRESH
========================= */

setInterval(() => {
  loadActivity();
}, 2000);


/* =========================
   INITIAL LOAD
========================= */

loadActivity();
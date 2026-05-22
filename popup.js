const saveBtn =
  document.getElementById(
    "saveBtn"
  );

const monitorSite =
  document.getElementById(
    "monitorSite"
  );

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

  activityFeed.innerHTML = "";

  if (!items.length) {

    activityFeed.innerHTML = `
      <div class="empty-state">
        No activity yet
      </div>
    `;

    return;
  }

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

  const activity =
    data.recentActivity || [];

  renderActivity(activity);

}


/* =========================
   INITIAL LOAD
========================= */

window.addEventListener(
  "DOMContentLoaded",
  async () => {

    const data =
      await chrome.storage.local.get([
        "monitorUrl"
      ]);

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

    loadActivity();

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

    /* CLEAR OLD */

    await chrome.storage.local.remove([
      "recentActivity",
      "knownTopics"
    ]);

    /* SAVE */

    await chrome.storage.local.set({
      monitorUrl: url
    });

    /* UI */

    const pluginName =
      extractPluginName(url);

    monitorSite.innerText =
      `${pluginName} Plugin`;

    saveBtn.innerText =
      "Monitoring Active";

    renderActivity([]);

  }
);


/* =========================
   AUTO REFRESH
========================= */

setInterval(() => {
  loadActivity();
}, 2000);


/* =========================
   INITIAL
========================= */

loadActivity();
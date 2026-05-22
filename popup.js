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
      .replace(/\b\w/g,
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

    activityFeed.innerHTML =
      "No activity yet";

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
   LOAD DATA
========================= */

window.addEventListener(
  "DOMContentLoaded",
  async () => {

    const data =
      await chrome.storage.local.get([
        "monitorUrl",
        "recentActivity"
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

    }

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

    await chrome.storage.local.set({
      monitorUrl: url
    });

    const pluginName =
      extractPluginName(url);

    monitorSite.innerText =
      `${pluginName} Plugin`;

    saveBtn.innerText =
      "Monitoring Active";

  }
);
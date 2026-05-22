const CHECK_EVERY = 15000;

let monitoringStarted = false;


/* =========================
   START
========================= */

chrome.runtime.onInstalled.addListener(() => {
  startMonitoring();
});

chrome.runtime.onStartup.addListener(() => {
  startMonitoring();
});


/* =========================
   START MONITOR
========================= */

function startMonitoring() {

  if (monitoringStarted) return;

  monitoringStarted = true;

  console.log("WP Monitor Started");

  setInterval(() => {
    checkSupportForum();
  }, CHECK_EVERY);

  chrome.alarms.create("backupCheck", {
    periodInMinutes: 1
  });

}


/* =========================
   BACKUP CHECK
========================= */

chrome.alarms.onAlarm.addListener((alarm) => {

  if (alarm.name === "backupCheck") {
    checkSupportForum();
  }

});


/* =========================
   MAIN CHECKER
========================= */

async function checkSupportForum() {

  const data = await chrome.storage.local.get([
    "monitorUrl",
    "knownTopics",
    "recentActivity"
  ]);

  const url = data.monitorUrl;

  if (!url) {
    console.log("No URL");
    return;
  }

  try {

    console.log("Checking:", url);

    const response = await fetch(
      `${url}?t=${Date.now()}`,
      {
        cache: "no-cache"
      }
    );

    const html = await response.text();

    let knownTopics =
      data.knownTopics || {};

    let recentActivity =
      data.recentActivity || [];

    /* =========================
       GET ALL TOPICS
    ========================= */

    const topicMatches = [
      ...html.matchAll(
        /<li class="bbp-topic-title">([\s\S]*?)<\/ul>/g
      )
    ];

    console.log(
      "Topics Found:",
      topicMatches.length
    );

    for (const match of topicMatches) {

      const block = match[0];

      /* =========================
         TITLE + LINK
      ========================= */

      const titleMatch =
        block.match(
          /class="bbp-topic-permalink" href="([^"]+)".*?>(.*?)<\/a>/s
        );

      if (!titleMatch) continue;

      const link =
        titleMatch[1];

      const title =
        titleMatch[2]
          .replace(/<[^>]+>/g, "")
          .trim();

      /* =========================
         STARTED BY
      ========================= */

      const startedByMatch =
        block.match(
          /bbp-topic-started-by[\s\S]*?bbp-author-name">(.*?)<\/span>/s
        );

      const startedBy =
        startedByMatch
          ? startedByMatch[1].trim()
          : "Unknown";

      /* =========================
         FRESHNESS AUTHOR
      ========================= */

      const freshnessMatch =
        block.match(
          /bbp-topic-freshness-author[\s\S]*?bbp-author-name">(.*?)<\/span>/s
        );

      const freshnessAuthor =
        freshnessMatch
          ? freshnessMatch[1].trim()
          : "Unknown";

      /* =========================
         REPLY COUNT
      ========================= */

      const replyMatch =
        block.match(
          /bbp-topic-reply-count">(\d+)</
        );

      const replies =
        replyMatch
          ? replyMatch[1]
          : "0";

      /* =========================
         TIME
      ========================= */

      const timeMatch =
        block.match(
          /bbp-topic-freshness[\s\S]*?<a.*?>(.*?)<\/a>/s
        );

      const freshnessTime =
        timeMatch
          ? timeMatch[1].trim()
          : Date.now().toString();

      console.log({
        title,
        startedBy,
        freshnessAuthor,
        replies
      });

      const uniqueId =
  `${link}_${replies}`;

      /* =========================
         NEW DETECTED
      ========================= */

      if (!knownTopics[uniqueId]) {

        let type = "New Reply";

        if (
          startedBy === freshnessAuthor &&
          replies === "0"
        ) {
          type = "New Ticket";
        }

        console.log(
          "NEW DETECTED:",
          title
        );

        /* =========================
           NOTIFICATION
        ========================= */

        chrome.notifications.create({
          type: "basic",
          iconUrl: chrome.runtime.getURL(
            "icons/bell.png"
          ),
          title: `🚨 ${type}`,
          message:
            `${title}\nBy: ${freshnessAuthor}`,
          priority: 2
        });


   /* =========================
   SMART ACTIVITY UPDATE
========================= */


const existingIndex =
  recentActivity.findIndex(
    item =>
      item.link === link &&
      item.type === type
  );

const newItem = {
  title,
  type,
  link,
  replies,
  time:
    new Date()
    .toLocaleTimeString()
};

if (existingIndex !== -1) {

  recentActivity.splice(
    existingIndex,
    1
  );

}

recentActivity.unshift(newItem);


/* =========================
   KEEP ONLY LAST 10
========================= */

recentActivity =
  recentActivity.slice(0, 10);

        knownTopics[uniqueId] = true;


const keys =
  Object.keys(knownTopics);

if (keys.length > 200) {

  delete knownTopics[
    keys[0]
  ];

}

      }

    }

    await chrome.storage.local.set({
      knownTopics,
      recentActivity
    });

  } catch (err) {

    console.error(
      "Monitor error:",
      err
    );

  }

}
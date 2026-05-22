const CHECK_EVERY = 15000;

let monitoringStarted = false;
let firstRun = true;


/* =========================
   STARTUP
========================= */

chrome.runtime.onInstalled.addListener(() => {
  startMonitoring();
});

chrome.runtime.onStartup.addListener(() => {
  startMonitoring();
});


/* =========================
   START MONITORING
========================= */

function startMonitoring() {

  if (monitoringStarted) return;

  monitoringStarted = true;

  console.log("WP Support Monitor Started");

  /* FIRST CHECK */

  checkSupportForum();

  /* REALTIME LOOP */

  setInterval(() => {
    checkSupportForum();
  }, CHECK_EVERY);

  /* BACKUP ALARM */

  chrome.alarms.create("backupCheck", {
    periodInMinutes: 1
  });

}


/* =========================
   BACKUP CHECK
========================= */

chrome.alarms.onAlarm.addListener(
  (alarm) => {

    if (
      alarm.name === "backupCheck"
    ) {
      checkSupportForum();
    }

  }
);


/* =========================
   NOTIFICATION
========================= */

function triggerNotification(
  type,
  title,
  author,
  link
) {

  chrome.notifications.create({
    type: "basic",

    iconUrl:
      chrome.runtime.getURL(
        "icons/icon128.png"
      ),

    title: `🚨 ${type}`,

    message:
      `${title}\nBy: ${author}`,

    priority: 2
  });

}


/* =========================
   SAVE ACTIVITY
========================= */

async function addActivity(
  title,
  type,
  link
) {

  const storage =
    await chrome.storage.local.get([
      "recentActivity"
    ]);

  let recentActivity =
    storage.recentActivity || [];

  /* REMOVE OLD DUPLICATE */

  recentActivity =
    recentActivity.filter(
      item =>
        !(
          item.link === link &&
          item.type === type
        )
    );

  /* ADD NEW */

  recentActivity.unshift({
    title,
    type,
    link,
    time:
      new Date()
      .toLocaleTimeString()
  });

  /* KEEP ONLY 10 */

  recentActivity =
    recentActivity.slice(0, 10);

  await chrome.storage.local.set({
    recentActivity
  });

}


/* =========================
   MAIN CHECKER
========================= */

async function checkSupportForum() {

  const data =
    await chrome.storage.local.get([
      "monitorUrl",
      "knownTopics"
    ]);

  const url = data.monitorUrl;

  if (!url) return;

  try {

    console.log("Checking:", url);

    const response =
      await fetch(
        `${url}?t=${Date.now()}`,
        {
          cache: "no-cache"
        }
      );

    const html =
      await response.text();

    let knownTopics =
      data.knownTopics || {};

    /* =========================
       GET TOPICS
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

    /* =========================
       ONLY CHECK TOP 10
    ========================= */

    const latestTopics =
      topicMatches.slice(0, 10);

    for (const match of latestTopics) {

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
   AUTHOR
========================= */

const freshnessMatch =
  block.match(
    /bbp-topic-freshness-author[\s\S]*?bbp-author-name">(.*?)<\/span>/s
  );

const author =
  freshnessMatch
    ? freshnessMatch[1].trim()
    : "Unknown";

/* =========================
   REPLIES
========================= */

const replyMatch =
  block.match(
    /bbp-topic-reply-count">(\d+)</
  );

const replies =
  replyMatch
    ? parseInt(replyMatch[1])
    : 0;

/* =========================
   IGNORE OLD REPLIED TOPICS
========================= */

if (
  replies > 0 &&
  !knownTopics[link]
) {
  continue;
}

/* =========================
   BRAND NEW TICKET
========================= */

if (!knownTopics[link]) {

  knownTopics[link] = {
    replies
  };

  console.log(
    "NEW TICKET:",
    title
  );

  if (!firstRun) {

    triggerNotification(
      "New Ticket",
      title,
      author,
      link
    );

    await addActivity(
      title,
      "New Ticket",
      link
    );

  }

}

/* =========================
   EXISTING TICKET
========================= */

else {

  const oldReplies =
    parseInt(
      knownTopics[link]
        .replies || 0
    );

  /* =========================
     FIRST REPLY ARRIVED
  ========================= */

  if (
    oldReplies === 0 &&
    replies > 0
  ) {

    knownTopics[
      link
    ].replies = replies;

    console.log(
      "TICKET REPLIED:",
      title
    );

    if (!firstRun) {

      triggerNotification(
        "Ticket Replied",
        title,
        author,
        link
      );

      await addActivity(
        title,
        "Ticket Replied",
        link
      );

    }

  }

}

    }

    /* SAVE */

    await chrome.storage.local.set({
      knownTopics
    });

    firstRun = false;

  } catch (err) {

    console.error(
      "Monitor Error:",
      err
    );

  }

}


/* =========================
   CLICK NOTIFICATION
========================= */

chrome.notifications.onClicked.addListener(
  async () => {

    const data =
      await chrome.storage.local.get([
        "monitorUrl"
      ]);

    if (data.monitorUrl) {

      chrome.tabs.create({
        url: data.monitorUrl
      });

    }

  }
);
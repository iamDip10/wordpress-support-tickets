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

  console.log(
    "WP Support Monitor Started"
  );

  /* FIRST CHECK */

  checkSupportForum();

  /* LOOP */

  setInterval(() => {
    checkSupportForum();
  }, CHECK_EVERY);

}


/* =========================
   NOTIFICATION
========================= */

function triggerNotification(
  title,
  author,
  link
) {

  chrome.notifications.create(
    link,
    {
      type: "basic",

      iconUrl:
        chrome.runtime.getURL(
          "icons/icon128.png"
        ),

      title: "🚨 New Ticket",

      message:
        `${title}\nBy: ${author}`,

      priority: 2
    }
  );

}


/* =========================
   SAVE ACTIVITY
========================= */

async function addActivity(
  title,
  link,
  author
) {

  const storage =
    await chrome.storage.local.get([
      "recentActivity"
    ]);

  let recentActivity =
    storage.recentActivity || [];

  /* REMOVE DUPLICATE */

  recentActivity =
    recentActivity.filter(
      item => item.link !== link
    );

  /* ADD NEW */

  recentActivity.unshift({
    title,
    type: "New Ticket",
    link,
    author,
    time:
      new Date()
      .toLocaleTimeString()
  });

  /* LIMIT */

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

  const url =
    data.monitorUrl;

  if (!url) return;

  try {

    console.log(
      "Checking:",
      url
    );

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

    const latestTopics =
      topicMatches.slice(0, 15);

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
         STARTED BY
      ========================= */

      const startedMatch =
        block.match(
          /bbp-topic-started-by[\s\S]*?bbp-author-name">(.*?)<\/span>/s
        );

      const startedBy =
        startedMatch
          ? startedMatch[1]
              .trim()
              .toLowerCase()
          : "";

      /* =========================
         LAST USER
      ========================= */

      const freshnessMatch =
        block.match(
          /bbp-topic-freshness-author[\s\S]*?bbp-author-name">(.*?)<\/span>/s
        );

      const lastUser =
        freshnessMatch
          ? freshnessMatch[1]
              .trim()
              .toLowerCase()
          : "";

      /* =========================
         FILTER
         ONLY IF SAME USER
      ========================= */

      if (
        startedBy !== lastUser
      ) {
        continue;
      }

      /* =========================
         NEW TOPIC ONLY
      ========================= */

      if (!knownTopics[link]) {

        knownTopics[link] = true;

        console.log(
          "NEW TOPIC:",
          title
        );

        /* SKIP INITIAL LOAD */

        if (!firstRun) {

          triggerNotification(
            title,
            startedBy,
            link
          );

          await addActivity(
            title,
            link,
            startedBy
          );

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
  (id) => {

    chrome.tabs.create({
      url: id
    });

  }
);
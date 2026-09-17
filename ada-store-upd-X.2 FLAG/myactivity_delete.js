chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "DO_DELETE_BY_TOKEN" && msg.token) {
    deleteByToken(msg.token).catch(console.error);
  }
});

function findAnyCard() {
  return document.querySelector('c-wiz[data-token]');
}

async function waitForAnyCard(timeoutMs = 8000) {
  const start = Date.now();

  if (findAnyCard()) return true;

  return new Promise((resolve) => {
    const obs = new MutationObserver(() => {
      if (findAnyCard()) {
        obs.disconnect();
        clearInterval(timer);
        resolve(true);
      }
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });

    const timer = setInterval(() => {
      if (findAnyCard()) {
        clearInterval(timer);
        obs.disconnect();
        resolve(true);
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        obs.disconnect();
        resolve(false);
      }
    }, 200);
  });
}

async function deleteByToken(token) {
  // Ensure cards have populated before searching
  await waitForAnyCard(8000);

  // Try to find immediately, else observe + scroll to load more
  const found = await waitForCardByToken(token, 90000);
  if (!found) {
    console.warn("Card not found for token:", token);
    return;
  }

  const card = found;
  card.scrollIntoView({ behavior: "smooth", block: "center" });

  // Click the card's delete button
  const deleteBtn =
    card.querySelector('button[aria-label^="Delete activity item"]') ||
    card.querySelector("button.yHy1rc"); // fallback class in your snippet

  if (!deleteBtn) {
    console.warn("Delete button not found inside card:", token);
    return;
  }

  deleteBtn.click();

  // Optional: confirm dialog if it appears
  await maybeConfirmDelete(5000);

  // console.log("Delete triggered for token:", token);
}

function findCardByToken(token) {
  return document.querySelector(`c-wiz[data-token="${CSS.escape(token)}"]`);
}

async function waitForCardByToken(token, timeoutMs) {
  const start = Date.now();

  // quick path
  let card = findCardByToken(token);
  if (card) return card;

  // short passive wait before scrolling (handles items already near top)
  for (let i = 0; i < 10; i++) { // ~2s at 200ms
    await new Promise((r) => setTimeout(r, 200));
    card = findCardByToken(token);
    if (card) return card;
  }

  // Extra quick scroll-up check in case we started mid-page
  // window.scrollTo({ top: 0, behavior: "auto" });
  // card = findCardByToken(token);
  // if (card) return card;

  // return new Promise((resolve) => {
  //   let scrollTimer = null;

  //   const obs = new MutationObserver(() => {
  //     card = findCardByToken(token);
  //     if (card) {
  //       obs.disconnect();
  //       if (scrollTimer) clearInterval(scrollTimer);
  //       resolve(card);
  //       console.log("Card found by MutationObserver for token:", token);
  //     }
  //   });

  //   obs.observe(document.documentElement, { childList: true, subtree: true });
  //   console.log("Waiting for card with token:", token);

  //   // Keep scrolling to load more cards (My Activity is infinite-ish)
  //   scrollTimer = setInterval(() => {
  //     window.scrollBy(0, Math.floor(window.innerHeight * 0.9));
  //     card = findCardByToken(token);
  //     if (card) {
  //       clearInterval(scrollTimer);
  //       obs.disconnect();
  //       resolve(card);
  //     }
  //     if (Date.now() - start > timeoutMs) {
  //       clearInterval(scrollTimer);
  //       obs.disconnect();
  //       resolve(null);
  //     }
  //   }, 700);
  // });
}

async function maybeConfirmDelete(timeoutMs) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    // common patterns: dialog/overlay with a confirm "Delete" button
    const dialog = document.querySelector('[role="dialog"], .llhEMd, .VfPpkd-Modal');
    if (dialog) {
      const buttons = Array.from(dialog.querySelectorAll("button"));
      const confirm = buttons.find((b) => {
        const t = (b.textContent || "").trim().toLowerCase();
        return t === "delete" || t === "remove" || t === "confirm";
      });
      if (confirm) {
        confirm.click();
        return true;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

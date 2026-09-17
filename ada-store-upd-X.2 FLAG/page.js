const btn = document.getElementById("btn");
const trainBtn = document.getElementById("train-btn");
// const downloadModelBtn = document.getElementById("download-model-btn");
const actionIntroText = document.querySelector(".action-intro-text");
const statusEl = document.getElementById("status");
const modal = document.getElementById("modal");
const modalMessage = document.getElementById("modal-message");
const remove_div = document.getElementById("instructions-div");
const hero_hide = document.getElementById("hide-hero-col");
const tagline_hide = document.getElementById("hide-tagline");
const intro_disclaimer_hide = document.getElementById("hide-intro-disclaimer");
const privacy_footer = document.getElementById("privacy_footer_id");

let trainingWorker = null;
let hasPreviousData = false;

// Holds the most recent top-N mapping between unique ID and
// serial number (rank) based on model predictions.
let lastTopPredictionMap = null;


// let cachedTFlag = null;
async function getOrCreateTFlag() {
  const { t_flag: stored } = await chrome.storage.local.get("t_flag");
  if (stored === 0 || stored === 1) {
    return stored;
  }

  const flag = Math.random() < 0.5 ? 0 : 1;
  await chrome.storage.local.set({ t_flag: flag });
  return flag;
}

let tFlagReady = (async () => {
  cachedTFlag = await getOrCreateTFlag();   // no "let" — assigns to render.js's variable
  applyLandingPageTFlagText();
})();

function applyLandingPageTFlagText() {
  const flagAlterText = document.getElementById("flag_alter_text");
  if (flagAlterText && cachedTFlag === 0) {
    flagAlterText.textContent = `To better facilitate this understanding, we built ADA: a data dashboard for auditing your online activity. ADA organizes your Google Activity data and supports you in visualising the collected data, helping you audit your online activity and taking control of your privacy. To preserve your privacy, ADA works locally, i.e., your data never leaves your browser.`;
  }

  const flagAlterText_s2 = document.getElementById("flag_alter_text_s2");
  if (flagAlterText_s2 && cachedTFlag === 0) {
    flagAlterText_s2.innerHTML = `If you'd like your dashboard to feel more <strong class="step-description__strong">personalised</strong>, you can share your feedback for each activity and ADA will adapt to your preferences.`;
    // flagAlterText_s2.innerHTML = `If you feel differently about an item shown in the dashboard— you can <strong class="step-description__strong">convey your feedback</strong> and ADA will adapt or personalise to your preferences in real time.`;
    }
  const flagAlterText_s3 = document.getElementById("flag_alter_text_s3");
  if (flagAlterText_s3 && cachedTFlag === 0) {
    flagAlterText_s3.innerHTML = `ADA gathers your data (in ~40–80 seconds) and presents it in a <strong class="step-description__strong">personalised dashboard</strong>, similar to your Google Activity Dashboard, for easy auditing.`;
  }


  const flagAlterImgS2 = document.getElementById("flag_alter_img_s2");
  if (flagAlterImgS2 && cachedTFlag === 0) {
    flagAlterImgS2.src = "./p2_variant.png";
    flagAlterImgS2.alt = "ADA feedback screenshot (variant)"; // update alt text too, if it's genuinely different content
  }


  const mainWrap = document.getElementById("main-wrap");
  if (mainWrap) {
    mainWrap.style.visibility = "visible";
  }
}
// Tell background to start pinging when this page loads
chrome.runtime.sendMessage({ type: "ada:ui-opened" });

// Tell background to stop when this page closes
window.addEventListener("beforeunload", () => {
  chrome.runtime.sendMessage({ type: "ada:ui-closed" });
});


function getTrainingWorker() {
  if (!trainingWorker) {
    try {
      trainingWorker = new Worker("training-worker.js", { type: "module" });
    } catch (e) {
      console.warn("Failed to create training worker:", e);
      trainingWorker = null;
    }
  }
  return trainingWorker;
}

async function trainModelWithFeedback() {
  if (typeof getAccuracyResults !== "function") {
    console.warn("getAccuracyResults() is not available.");
    return null;
  }

  const labelsMap = getAccuracyResults() || {};
  const items = Array.isArray(originalItems) ? originalItems : [];

  // For the current items, build and log a top-100 mapping of
  // unique IDs to rank + feedback label (yes/no) based on the
  // model's predicted scores and the user's feedback.
  try {
    const ranked = [...items].sort(
      (a, b) => (b.senScore || 0) - (a.senScore || 0)
    );
    const top = ranked.slice(0, 100);
    const feedbackSummary = top.map((it, idx) => {
      const feedbackId =
        it && (it._feedbackId || it.uniqueId || `item-${idx}`);
      const label =
        feedbackId && Object.prototype.hasOwnProperty.call(labelsMap, feedbackId)
          ? labelsMap[feedbackId]
          : null;
      return {
        rank: idx + 1,
        id: feedbackId,
        // senScore: it?.senScore ?? null,
        label,
      };
    });

    // console.log(
    //   "[Extension page] Top-100 feedback mapping (id -> yes/no):",
    //   feedbackSummary.length
    // );
    // console.table(feedbackSummary);


  }
  catch (e) {
    console.warn(
      "[Extension page] Failed to build/print top-100 feedback mapping:",
      e
    );
  }

  const inputData = [];
  const resultData = [];

  for (const it of items) {
    const feedbackId = it && (it._feedbackId || it.uniqueId || null);
    if (!feedbackId) continue;
    const label = labelsMap[feedbackId];
    // Only use items the user has explicitly labeled (yes/no).
    if (label !== "yes" && label !== "no") continue;
    if (!it.textFeatures) continue;

    const vec = window.buildFeatureVectorFromTextFeatures(it.textFeatures);
    inputData.push(vec);
    resultData.push(label === "yes" ? 1 : 0);
  }

  if (!inputData.length) {
    console.warn("No labeled items available for training.");
    return null;
  }

  const worker = getTrainingWorker();
  if (!worker) {
    console.warn("Training worker could not be created.");
    return null;
  }

  return new Promise((resolve) => {
    const handleMessage = async (event) => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);

      if (event.data && event.data.error) {
        console.warn("Training worker reported error:", event.data.error);
        resolve(null);
        return;
      }
      // New message shapes from the training worker — handle before the !buf guard,
      // otherwise a skipped round looks identical to a failure.
      if (event.data && event.data.error) {
        console.warn("Training worker error:", event.data.error);
        resolve(null);
        return;
      }
      if (event.data && event.data.skipped) {
        console.log("Training round skipped (insufficient signal):", event.data.stats);
        resolve(null);
        return;
      }
      const buf = event.data && event.data.data;
      if (!buf) {
        console.warn("Training worker returned no data.");
        resolve(null);
        return;
      }

      try {
        const updatedBytes = new Uint8Array(buf);
        // Persist updated model into IndexedDB so prediction worker can load it.
        try {
          const mod = await import("./indexedDB.js");
          if (mod && typeof mod.storeModelInIndexedDB === "function") {
            await mod.storeModelInIndexedDB(updatedBytes);
            // console.log("Updated model stored in IndexedDB.");
          }
        } catch (e) {
          console.warn("Failed to store updated model in IndexedDB:", e);
        }

        // 2. Then hot-swap the prediction worker. Without this it keeps serving
        //    the model it loaded at startup and training has no visible effect.
        try {
          predictionWorker.postMessage({ type: 'reload', model: buf }, [buf]);
        } catch (e) {
          // Transfer failed (buffer already detached, or worker not ready).
          // Fall back to telling it to re-read IndexedDB itself.
          console.warn("Model transfer failed; asking prediction worker to reload from DB.", e);
          predictionWorker.postMessage({ type: 'reload' });
        }

        resolve(updatedBytes);


      } catch (e) {
        console.warn("Failed to process updated model bytes:", e);
        resolve(null);
      }

      resolve(true);
    };

    const handleError = (err) => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      console.error("Training worker error:", err && err.message, err);
      resolve(null);
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);

    try {
      worker.postMessage({ input: inputData, result: resultData });
    } catch (e) {
      console.warn("Failed to post message to training worker", e);
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      resolve(null);
    }
  });
}


// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// --------------when flag:1 --- model training
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++





// trainBtn?.addEventListener("click", async () => {
//   trainBtn.disabled = true;
//   statusEl.textContent = "Now personalising the dashboard with you feedback…";
//   // Show blocking modal while training + re-prediction runs. It will stay
//   // visible until the page reloads, or be hidden on error.
//   showModal("Now personalising your dashboard…");

//   // User triggered retraining the model with feedback
//   if (typeof logUiEvent === "function") {
//     logUiEvent("retrain_model_withfeedback", null, null);
//   }

//   const trained = await trainModelWithFeedback();

//   if (!trained) {
//     statusEl.textContent = "Training failed or no labeled feedback available.";
//     hideModal();
//     trainBtn.disabled = false;
//     return;
//   }

//   // Reset prediction worker so it reloads the updated model from IndexedDB.
//   if (predictionWorker) {
//     try {
//       predictionWorker.terminate();
//     } catch (e) {
//       console.warn("Failed to terminate old prediction worker:", e);
//     }
//     predictionWorker = null;
//   }

//   try {
//     const items = Array.isArray(originalItems) ? originalItems : [];
//     if (!items.length) {
//       statusEl.textContent = "Training complete. No items available for prediction.";
//       hideModal();
//     } else {
//       const preds = await predictScoresForItems(items);
//       if (Array.isArray(preds)) {
//         items.forEach((it, idx) => {
//           const p = typeof preds[idx] === "number" ? preds[idx] : 0;
//           it.senScore = Math.round(Math.max(0, Math.min(1, p)) * 100);
//         });

//         // Log updated ranking after training using the new predictions
//         try {
//           const ranked = [...items].sort(
//             (a, b) => (b.senScore || 0) - (a.senScore || 0)
//           );
//           const topRanked = ranked.slice(0, 100);
//           const updatedRanking = topRanked.map((it, idx) => ({
//             rank: idx + 1,
//             id: it && (it._feedbackId || it.uniqueId || `item-${idx}`),
//             // senScore: it?.senScore ?? null,
//           }));

//         } catch (e) {
//           console.warn(
//             "[Extension page] Failed to build/print updated ranking after training:",
//             e
//           );
//         }

//         renderItems(items);

//         try {
//           chrome.storage.local.set({ myactivity_extracted_items: items }, () => {
//             // console.log("Updated items with new predictions saved to local storage.");
//           });
//         } catch (e) {
//           console.warn("Failed to persist updated items:", e);
//         }

//         if (typeof clearFeedbackResults === "function") {
//           clearFeedbackResults();
//         }

//         statusEl.textContent = "Training complete. Predictions updated using your feedback.";
//         // Reload the popup so the entire page is re-rendered with updated scores.
//         try {
//           location.reload();
//         } catch (e) {
//           console.warn("Failed to reload page after training:", e);
//         }
//       } else {
//         statusEl.textContent = "Training complete, but prediction failed.";
//         hideModal();
//       }
//     }
//   } catch (e) {
//     console.warn("Error while running predictions after training:", e);
//     statusEl.textContent = "Training complete, but prediction failed.";
//     hideModal();
//   }

//   trainBtn.disabled = false;
// });


// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// ----------------------------below: Flag 0 type: when no model training //
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// trainBtn?.addEventListener("click", async () => {
//   trainBtn.disabled = true;
//   statusEl.textContent = "Now personalising the dashboard with you feedback…";
//   showModal("Now personalising your dashboard…");

//   if (typeof logUiEvent === "function") {
//     logUiEvent("retrain_model_withfeedback", null, null);
//   }

//   // STUBBED: skip real training, just pretend it succeeded.
//   const trained = true;

//   if (!trained) {
//     statusEl.textContent = "Training failed or no labeled feedback available.";
//     hideModal();
//     trainBtn.disabled = false;
//     return;
//   }

//   if (predictionWorker) {
//     try {
//       predictionWorker.terminate();
//     } catch (e) {
//       console.warn("Failed to terminate old prediction worker:", e);
//     }
//     predictionWorker = null;
//   }

//   try {
//     const items = Array.isArray(originalItems) ? originalItems : [];
//     if (!items.length) {
//       statusEl.textContent = "Training complete. No items available for prediction.";
//       hideModal();
//     } else {
//       // STUBBED: reuse each item's existing senScore instead of
//       // calling predictScoresForItems() — no real inference happens,
//       // so ranking/scores stay exactly as they were.
//       const preds = items.map((it) => (typeof it.senScore === "number" ? it.senScore / 100 : 0));

//       items.forEach((it, idx) => {
//         const p = typeof preds[idx] === "number" ? preds[idx] : 0;
//         it.senScore = Math.round(Math.max(0, Math.min(1, p)) * 100);
//       });

//       renderItems(items);

//       try {
//         chrome.storage.local.set({ myactivity_extracted_items: items }, () => {});
//       } catch (e) {
//         console.warn("Failed to persist updated items:", e);
//       }

//       if (typeof clearFeedbackResults === "function") {
//         clearFeedbackResults();
//       }

//       statusEl.textContent = "Training complete. Predictions updated using your feedback.";
//       try {
//         location.reload();
//       } catch (e) {
//         console.warn("Failed to reload page after training:", e);
//       }
//     }
//   } catch (e) {
//     console.warn("Error while running predictions after training:", e);
//     statusEl.textContent = "Training complete, but prediction failed.";
//     hideModal();
//   }

//   trainBtn.disabled = false;
// });

// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// ----------------------------below: Flag 0 and 1 merged type: when it depends on the flag //
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

trainBtn?.addEventListener("click", async () => {
  trainBtn.disabled = true;
  statusEl.textContent = "Now personalising the dashboard with you feedback…";
  showModal("Now personalising your dashboard…");

  //  add a sleeep of 5 seconds


  if (typeof logUiEvent === "function") {
    logUiEvent("retrain_model_withfeedback", null, null);
  }

  const { t_flag } = await chrome.storage.local.get("t_flag");

  let trained;
  let preds;

  if (t_flag === 1) {
    // ---- REAL TRAINING PATH ----
    trained = await trainModelWithFeedback();

    if (!trained) {
      statusEl.textContent = "Training failed or no labeled feedback available.";
      hideModal();
      trainBtn.disabled = false;
      return;
    }

    if (predictionWorker) {
      try {
        predictionWorker.terminate();
      } catch (e) {
        console.warn("Failed to terminate old prediction worker:", e);
      }
      predictionWorker = null;
    }
  } else {
    // ---- STUBBED PATH (t_flag === 0 or unset) ----
    await new Promise((resolve) => setTimeout(resolve, 3000));
    trained = true;
  }

  try {
    const items = Array.isArray(originalItems) ? originalItems : [];
    if (!items.length) {
      statusEl.textContent = "Training complete. No items available for prediction.";
      hideModal();
    } else {
      if (t_flag === 1) {
        preds = await predictScoresForItems(items);
      } else {
        // Reuse existing senScore, no real inference.
        preds = items.map((it) => (typeof it.senScore === "number" ? it.senScore / 100 : 0));
      }

      if (Array.isArray(preds)) {
        items.forEach((it, idx) => {
          const p = typeof preds[idx] === "number" ? preds[idx] : 0;
          it.senScore = Math.round(Math.max(0, Math.min(1, p)) * 100);
        });

        renderItems(items);

        try {
          chrome.storage.local.set({ myactivity_extracted_items: items }, () => { });
        } catch (e) {
          console.warn("Failed to persist updated items:", e);
        }

        if (typeof clearFeedbackResults === "function") {
          clearFeedbackResults();
        }

        statusEl.textContent = "Training complete. Predictions updated using your feedback.";
        try {
          location.reload();
        } catch (e) {
          console.warn("Failed to reload page after training:", e);
        }
      } else {
        statusEl.textContent = "Training complete, but prediction failed.";
        hideModal();
      }
    }
  } catch (e) {
    console.warn("Error while running predictions after training:", e);
    statusEl.textContent = "Training complete, but prediction failed.";
    hideModal();
  }

  trainBtn.disabled = false;
});


document.addEventListener("DOMContentLoaded", () => {

  const storage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local
    ? chrome.storage.local
    : null;

  if (!storage) return;

  storage.get(["myactivity_extracted_items"], (result) => {
    if (result.myactivity_extracted_items) {
      // console.log("Found previous data, rendering now...");
      renderItems(result.myactivity_extracted_items);
      statusEl.textContent = "Displaying your personalised dashboard.";
      btn.textContent = "Display your latest activities";
      trainBtn?.classList.remove("hidden");
      // downloadModelBtn?.classList.remove("hidden");
      actionIntroText?.classList.add("hidden");
      remove_div.style.display = "none";
      hero_hide.classList.add("hidden");
      tagline_hide.classList.add("hidden");
      intro_disclaimer_hide.classList.add("hidden");
      privacy_footer.classList.add("hidden");

      // Signal that a previous scrape exists, so future clicks
      // on the main button are treated as refetches.
      hasPreviousData = true;
    }
  });
});

function showModal(message) {
  if (modalMessage && typeof message === "string") {
    modalMessage.textContent = message;
  }
  modal.classList.remove("hidden");
}
function hideModal() { modal.classList.add("hidden"); }

const CFG = {
  linkClass: "l8sGWb",
  cardRootClass: "XVw6Ad",
  serviceClass: "hJ7x8b",
  detailsWrapClass: "wlgrwd",
};

const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

const yyyymmddToISO = (d) =>
  d && d.length === 8
    ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    : null;

function normalizeGoogleRedirect(href, baseUrl) {
  try {
    const u = new URL(href, baseUrl);
    if (u.hostname === "www.google.com" && u.pathname === "/url") {
      return u.searchParams.get("q") || href;
    }
    return href;
  } catch {
    return href;
  }
}

function getActionVerb(cardEl) {
  const r4 = cardEl.querySelector?.('[jsname="r4nke"]');
  return clean(r4?.childNodes?.[0]?.textContent) || null;
}

function inferCardUniqueId(cardEl) {
  if (!cardEl) return null;
  let wiz = cardEl.closest?.("c-wiz");
  if (!wiz && cardEl.querySelector) {
    wiz = cardEl.querySelector("c-wiz");
  }

  if (!wiz) return null;
  const token = wiz.getAttribute("data-token");
  if (token) return token;
  return wiz.getAttribute("jslog") || null;
}

function inferType(service, actionVerb, url) {
  const s = (service || "").toLowerCase();
  const v = (actionVerb || "").toLowerCase();

  if (s) return s.toUpperCase();
  if (v.startsWith("visited")) return "VISIT";
  if (v.startsWith("searched")) return "SEARCH";
  if (v.startsWith("watched")) return "WATCH";
  if (v.startsWith("used") || v.startsWith("opened")) return "APP_USAGE";

  if (url) {
    const u = url.toLowerCase();
    if (u.includes("youtube.com") || u.includes("youtu.be")) return "YOUTUBE";
    if (u.includes("google.com/maps") || u.includes("maps.google")) return "MAPS";
  }
  return "OTHER";
}

function extractCardFromParsedDoc(cardEl, baseUrl) {
  const wiz = cardEl.closest?.("c-wiz");
  const dateRaw = wiz?.getAttribute?.("data-date") || null;

  const service =
    clean(cardEl.querySelector?.(`.${CFG.serviceClass}`)?.textContent) || null;

  const actionVerb = getActionVerb(cardEl);

  const link = cardEl.querySelector?.(`a.${CFG.linkClass}`);
  const title = clean(link?.innerText || link?.textContent) || null;

  let url = link?.getAttribute?.("href") || null;
  if (url) url = normalizeGoogleRedirect(url, baseUrl);

  const timeText =
    clean(
      cardEl.querySelector?.(`.${CFG.detailsWrapClass} .H3Q9vf`)
        ?.childNodes?.[0]?.textContent
    ) ||
    clean(cardEl.querySelector?.(".H3Q9vf")?.childNodes?.[0]?.textContent) ||
    null;

  const activityType = inferType(service, actionVerb, url);
  const uniqueId = inferCardUniqueId(cardEl)
  // const senScore = Math.floor(Math.random() * 101)
  const senScore = 0; // placeholder for sentiment score
  return {
    activityType,
    service,
    uniqueId,
    dateISO: yyyymmddToISO(dateRaw),
    actionVerb,
    title,
    url,
    timeText,
    senScore,
  };
}

function extractItemsFromHTML(html, baseUrl = "https://myactivity.google.com/") {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const cardRoots = Array.from(doc.querySelectorAll(`.${CFG.cardRootClass}`));

  const cards = cardRoots.length
    ? cardRoots
      .map((x) => x.closest?.('[role="listitem"]') || x)
      .filter(Boolean)
    : Array.from(doc.querySelectorAll('[role="listitem"]'));

  const items = cards.map((card) => {
    const itemData = extractCardFromParsedDoc(card, baseUrl);
    return {
      ...itemData,

    };
  });
  return { items, cardsCount: cards.length };
}

// ========== XGBoost prediction integration (via prediction-worker.js) ==========
let predictionWorker = null;

function getPredictionWorker() {
  if (!predictionWorker) {
    try {
      predictionWorker = new Worker("prediction-worker.js", { type: "module" });
    } catch (e) {
      console.warn("Failed to create prediction worker:", e);
      predictionWorker = null;
    }
  }
  return predictionWorker;
}

function predictScoresForItems(items) {
  const worker = getPredictionWorker();
  if (!worker) {
    console.warn("Prediction worker could not be created");
    return Promise.resolve(null);
  }

  const inputData = items.map((it) => window.buildFeatureVectorFromTextFeatures(it.textFeatures));

  return new Promise((resolve, reject) => {
    const handleMessage = (event) => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      if (event.data && event.data.error) {
        console.warn("Prediction worker reported error:", event.data.error);
        resolve(null);
        return;
      }
      const payload = event.data && event.data.data;
      if (!Array.isArray(payload)) {
        console.warn("Prediction worker returned unexpected payload", event.data);
        resolve(null);
        return;
      }
      resolve(payload);
    };
    const handleError = (err) => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      console.error("Prediction worker error:", err && err.message, err && err.filename, err && err.lineno, err && err.colno, err);
      resolve(null);
    };
    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    try {
      worker.postMessage({ input: inputData });
    } catch (e) {
      console.warn("Failed to post message to prediction worker", e);
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      resolve(null);
    }
  });
}


// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// ----------------------------below: 1 merged type:model inferance type
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// btn.addEventListener("click", () => {
//   statusEl.textContent = "";
//   actionIntroText?.classList.add("hidden");
//   btn.disabled = true;
//   showModal("Please wait while your data dashboard is being created");

//   // Distinguish between first parse and subsequent refetches
//   const actionName = hasPreviousData ? "refetch_triggered" : "parsing_triggered";
//   if (typeof logUiEvent === "function") {
//     logUiEvent(actionName, {
//       hasPreviousData,
//     });
//   }

//   const requestId = crypto.randomUUID();

//   chrome.runtime.sendMessage(
//     { type: "SCRAPE_MYACTIVITY_BACKGROUND", requestId },
//     (resp) => {
//       btn.disabled = false;

//       if (chrome.runtime.lastError) {
//         hideModal();
//         statusEl.textContent = "Error: " + chrome.runtime.lastError.message;
//         return;
//       }
//       if (!resp?.ok) {
//         hideModal();
//         statusEl.textContent = "Error: " + (resp?.error || "Unknown");
//         return;
//       }

//       // NEW: Option 1 expects raw HTML
//       if (typeof resp.html === "string") {
//         (async () => {
//           let { items } = extractItemsFromHTML(resp.html, "https://myactivity.google.com/");

//           // Compute text features for each item using the featureExtraction logic
//           try {
//             if (typeof window.computeTextFeaturesForTexts === "function") {
//               const texts = items.map((it) => [it.actionVerb, it.title, it.url].filter(Boolean).join(" "));
//               const feats = window.computeTextFeaturesForTexts(texts);
//               items = items.map((it, idx) => ({
//                 ...it,
//                 textFeatures: feats[idx] || null,
//               }));
//               // console.log("[Extension page] Computed text features for items.");
//             }
//           } catch (err) {
//             console.warn("[Extension page] Failed to compute text features:", err);
//           }

//           // Run XGBoost prediction via worker to get senScore
//           try {
//             const preds = await predictScoresForItems(items);
//             if (Array.isArray(preds)) {
//               items = items.map((it, idx) => {
//                 const p = typeof preds[idx] === "number" ? preds[idx] : 0;
//                 const senScore = Math.round(Math.max(0, Math.min(1, p)) * 100);
//                 return { ...it, senScore };
//               });
//               // console.log("[Extension page] Attached senScore from model predictions.");
//             }
//           } catch (err) {
//             console.warn("[Extension page] Failed to run prediction worker:", err);
//           }

//           // Build mapping between each item's unique identifier and a
//           // serial number (rank) according to the model prediction,
//           // limited to the top 100 items, and print it.
//           try {
//             const ranked = [...items].sort(
//               (a, b) => (b.senScore || 0) - (a.senScore || 0)
//             );
//             const topRanked = ranked.slice(0, 100);
//             lastTopPredictionMap = topRanked.map((it, idx) => ({
//               rank: idx + 1,
//               id:
//                 it && (it.uniqueId || it._feedbackId || `item-${idx}`),
//               senScore: it?.senScore ?? null,
//             }));


//           } catch (err) {
//             console.warn(
//               "[Extension page] Failed to build/print top prediction mapping:",
//               err
//             );
//           }

//           statusEl.textContent = `Completed collecting ${items.length} items to create your dashboard.`;



//           renderItems(items);
//           btn.textContent = "Display your latest activities"
//           trainBtn?.classList.remove("hidden");
//           remove_div.style.display = "none"; predictScoresForItems
//           hero_hide.classList.add("hidden");
//           tagline_hide.classList.add("hidden");
//           intro_disclaimer_hide.classList.add("hidden");
//           privacy_footer.classList.add("hidden");

//           // store this entire data in localStorage for further analysis if needed
//           try {
//             chrome.storage.local.set({ "myactivity_extracted_items": items }, () => {
//             });
//           } catch (e) {
//             console.warn(
//               "[Extension page] Failed to save extracted items to localStorage:",
//               e
//             );
//           }
//           hideModal();
//         })();


//         return;
//       }

//       // Backward compatibility: if background still returns items/count
//       hideModal();
//       statusEl.textContent = `Completed collecting ${resp.count ?? 0} items to create your dashboard.`;

//     }
//   );
// });

// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// ----------------------------below: (STARTING PART) Flag 0 and 1 merged type: when it depends on the flag //
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

btn.addEventListener("click", () => {
  statusEl.textContent = "";
  actionIntroText?.classList.add("hidden");
  btn.disabled = true;
  showModal("Please wait while your data dashboard is being created");

  // Distinguish between first parse and subsequent refetches
  const actionName = hasPreviousData ? "refetch_triggered" : "parsing_triggered";
  if (typeof logUiEvent === "function") {
    logUiEvent(actionName, {
      hasPreviousData,
    });
  }

  const requestId = crypto.randomUUID();

  chrome.runtime.sendMessage(
    { type: "SCRAPE_MYACTIVITY_BACKGROUND", requestId },
    (resp) => {
      btn.disabled = false;

      if (chrome.runtime.lastError) {
        hideModal();
        statusEl.textContent = "Error: " + chrome.runtime.lastError.message;
        return;
      }
      if (!resp?.ok) {
        hideModal();
        statusEl.textContent = "Error: " + (resp?.error || "Unknown");
        return;
      }

      // NEW: Option 1 expects raw HTML
      if (typeof resp.html === "string") {
        (async () => {
          let { items } = extractItemsFromHTML(resp.html, "https://myactivity.google.com/");

          const { t_flag } = await chrome.storage.local.get("t_flag");

          if (t_flag === 1) {
            // ---- REAL PATH: compute text features + run real prediction ----
            try {
              if (typeof window.computeTextFeaturesForTexts === "function") {
                const texts = items.map((it) => [it.actionVerb, it.title, it.url].filter(Boolean).join(" "));
                const feats = window.computeTextFeaturesForTexts(texts);
                items = items.map((it, idx) => ({
                  ...it,
                  textFeatures: feats[idx] || null,
                }));
                // console.log("[Extension page] Computed text features for items.");
              }
            } catch (err) {
              console.warn("[Extension page] Failed to compute text features:", err);
            }

            try {
              const preds = await predictScoresForItems(items);
              if (Array.isArray(preds)) {
                items = items.map((it, idx) => {
                  const p = typeof preds[idx] === "number" ? preds[idx] : 0;
                  const senScore = Math.round(Math.max(0, Math.min(1, p)) * 100);
                  return { ...it, senScore };
                });
                // console.log("[Extension page] Attached senScore from model predictions.");
              }
            } catch (err) {
              console.warn("[Extension page] Failed to run prediction worker:", err);
            }
          } else {
            // ---- STUBBED PATH (t_flag === 0 or unset): skip real inference ----
            // Reuse senScore from previously stored items (matched by uniqueId)
            // if available, otherwise default to 0. No feature computation,
            // no prediction worker call.
            try {
              const { myactivity_extracted_items: prevItems } = await chrome.storage.local.get(
                "myactivity_extracted_items"
              );
              const prevMap = new Map(
                Array.isArray(prevItems)
                  ? prevItems.map((it) => [it.uniqueId || it._feedbackId, it.senScore])
                  : []
              );
              items = items.map((it) => ({
                ...it,
                senScore:
                  typeof prevMap.get(it.uniqueId || it._feedbackId) === "number"
                    ? prevMap.get(it.uniqueId || it._feedbackId)
                    : 0,
              }));
            } catch (err) {
              console.warn("[Extension page] Failed to apply stubbed senScore:", err);
              items = items.map((it) => ({ ...it, senScore: 0 }));
            }
          }

          // Build mapping between each item's unique identifier and a
          // serial number (rank) according to the model prediction,
          // limited to the top 100 items, and print it.
          try {
            const ranked = [...items].sort(
              (a, b) => (b.senScore || 0) - (a.senScore || 0)
            );
            const topRanked = ranked.slice(0, 100);
            lastTopPredictionMap = topRanked.map((it, idx) => ({
              rank: idx + 1,
              id:
                it && (it.uniqueId || it._feedbackId || `item-${idx}`),
              senScore: it?.senScore ?? null,
            }));


          } catch (err) {
            console.warn(
              "[Extension page] Failed to build/print top prediction mapping:",
              err
            );
          }

          statusEl.textContent = `Completed collecting ${items.length} items to create your dashboard.`;



          renderItems(items);
          btn.textContent = "Display your latest activities"
          trainBtn?.classList.remove("hidden");
          remove_div.style.display = "none"; predictScoresForItems
          hero_hide.classList.add("hidden");
          tagline_hide.classList.add("hidden");
          intro_disclaimer_hide.classList.add("hidden");
          privacy_footer.classList.add("hidden");

          // store this entire data in localStorage for further analysis if needed
          try {
            chrome.storage.local.set({ "myactivity_extracted_items": items }, () => {
            });
          } catch (e) {
            console.warn(
              "[Extension page] Failed to save extracted items to localStorage:",
              e
            );
          }
          hideModal();
        })();


        return;
      }

      // Backward compatibility: if background still returns items/count
      hideModal();
      statusEl.textContent = `Completed collecting ${resp.count ?? 0} items to create your dashboard.`;

    }
  );
});
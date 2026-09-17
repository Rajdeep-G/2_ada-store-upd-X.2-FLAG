function logUiEvent(action, params = null, extras = null) {
  try {
    const clientTime = new Date().toISOString();
    chrome.runtime.sendMessage({
      type: "LOG_EVENT",
      action,
      params,
      extras,
      event_type: "event",
      client_time: clientTime,
    });
  } catch (e) {
    console.warn("Failed to send LOG_EVENT", action, e);
  }
}



const accuracyResults = new Map();

let allItems = [];
let originalItems = [];
let currentSearchTerm = "";
let currentStartTs = null;
let currentEndTs = null;
let currentActivityTypes = new Set(); // Track selected activity types
const FEEDBACK_RESULTS_STORAGE_KEY = "feedback_results";
const FEEDBACK_COUNTER_TOTAL = 100;
// Allowed activity types to display as-is; others will be shown as 'nota <type>'
const allowedActivityTypes = [
  "AI Mode", "Ads", "Android", "Assistant", "Books", "Chrome", "Developers", "Discover", "Flights", "Gmail", "Google Analytics", "Google Business Profile", "Google Lens", "Google News", "Google Play Games", "Google Play Store", "Google Translate", "Help", "Hotels", "Image Search", "Maps", "Search", "Shopping", "Travel", "Video Search", "YouTube"
];
// Lowercase set for case-insensitive matching
const allowedActivityTypesLower = new Set(allowedActivityTypes.map(s => s.toLowerCase()));


let cachedTFlag = null;

async function initTFlag() {
  cachedTFlag = await getOrCreateTFlag();
}


function getFeedbackCounterElement() {
  return document.getElementById("feedback-counter");
}

function renderFeedbackCounter() {
  const counterEl = getFeedbackCounterElement();
  if (!counterEl) return;
  const uniqueFeedbackCount = Math.min(accuracyResults.size, FEEDBACK_COUNTER_TOTAL);
  counterEl.textContent = `${uniqueFeedbackCount}/${FEEDBACK_COUNTER_TOTAL}`;
}

function persistFeedbackResults() {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
    renderFeedbackCounter();
    return;
  }

  chrome.storage.local.set({
    [FEEDBACK_RESULTS_STORAGE_KEY]: Object.fromEntries(accuracyResults),
  }, () => {
    renderFeedbackCounter();
  });
}

function loadFeedbackResults() {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
    renderFeedbackCounter();
    return;
  }

  chrome.storage.local.get([FEEDBACK_RESULTS_STORAGE_KEY], (result) => {
    const storedResults = result?.[FEEDBACK_RESULTS_STORAGE_KEY];

    accuracyResults.clear();
    if (storedResults && typeof storedResults === "object") {
      Object.entries(storedResults).forEach(([itemId, accuracy]) => {
        if (accuracy === "yes" || accuracy === "no") {
          accuracyResults.set(itemId, accuracy);
        }
      });
    }

    renderFeedbackCounter();
  });
}

function clearFeedbackResults() {
  accuracyResults.clear();
  renderFeedbackCounter();

  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
    return;
  }

  chrome.storage.local.remove([FEEDBACK_RESULTS_STORAGE_KEY], () => {
    renderFeedbackCounter();
  });
}

function createActivityTypeCheckboxes() {
  const container = document.getElementById("activity-type-select");
  if (!container) return;

  container.innerHTML = "";

  // Add "All" option
  const allLabel = document.createElement("div");
  allLabel.className = "multiselect-item";
  allLabel.innerHTML = `
    <input type="checkbox" id="activity-type-all" />
    <label for="activity-type-all">All Types</label>
  `;
  container.appendChild(allLabel);

  // Add individual types
  allowedActivityTypes.forEach((type) => {
    const id = `activity-type-${type.replace(/\s+/g, "-").toLowerCase()}`;
    const item = document.createElement("div");
    item.className = "multiselect-item";
    item.innerHTML = `
      <input type="checkbox" id="${id}" value="${type}" class="activity-type-checkbox" />
      <label for="${id}">${type}</label>
    `;
    container.appendChild(item);
  });

  // Add "Others" option
  const othersId = "activity-type-others";
  const othersItem = document.createElement("div");
  othersItem.className = "multiselect-item";
  othersItem.innerHTML = `
    <input type="checkbox" id="${othersId}" value="Others" class="activity-type-checkbox" />
    <label for="${othersId}">Others</label>
  `;
  container.appendChild(othersItem);

  // Add event listeners
  const allCheckbox = document.getElementById("activity-type-all");
  const typeCheckboxes = document.querySelectorAll(".activity-type-checkbox");

  allCheckbox.addEventListener("change", (e) => {
    typeCheckboxes.forEach(cb => {
      cb.checked = e.target.checked;
    });
    updateActivityTypeFilter();
  });

  typeCheckboxes.forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      const allChecked = Array.from(typeCheckboxes).every(cb => cb.checked);
      const noneChecked = Array.from(typeCheckboxes).every(cb => !cb.checked);
      allCheckbox.checked = allChecked;
      allCheckbox.indeterminate = !allChecked && !noneChecked;
      updateActivityTypeFilter();
    });
  });
}

function updateActivityTypeFilter() {
  currentActivityTypes.clear();
  const typeCheckboxes = document.querySelectorAll(".activity-type-checkbox");
  typeCheckboxes.forEach(checkbox => {
    if (checkbox.checked) {
      currentActivityTypes.add(checkbox.value);
    }
  });
}

function restoreActivityTypeSelections() {
  const typeCheckboxes = document.querySelectorAll(".activity-type-checkbox");
  const allCheckbox = document.getElementById("activity-type-all");

  typeCheckboxes.forEach(checkbox => {
    checkbox.checked = currentActivityTypes.has(checkbox.value);
  });

  const allChecked = Array.from(typeCheckboxes).every(cb => cb.checked);
  const noneChecked = Array.from(typeCheckboxes).every(cb => !cb.checked);
  allCheckbox.checked = allChecked;
  allCheckbox.indeterminate = !allChecked && !noneChecked;
}

// function loadUniqueId() {
//   const uniqueIdEl = document.getElementById("unique-id");
//   if (!uniqueIdEl) return;

//   chrome.storage.local.get("ada_code", (result) => {
//     uniqueIdEl.textContent = result?.ada_code || "";
//   });
// }

function loadUniqueId() {
  const uniqueIdEl = document.getElementById("unique-id");
  if (!uniqueIdEl) return;

  // Helper so we never accidentally overwrite a real code with empty
  const setCode = (code) => {
    if (code && typeof code === "string") {
      uniqueIdEl.textContent = code;
      uniqueIdEl.classList.remove("is-loading");
    }
  };

  // 1. Initial read — covers reloads where the code is already cached
  chrome.storage.local.get("ada_code", (result) => {
    if (result?.ada_code) {
      setCode(result.ada_code);
    } else {
      uniqueIdEl.textContent = "Generating…";
      uniqueIdEl.classList.add("is-loading");
    }
  });

  // 2. Listen for the write from background.js when /ping responds
  const onChange = (changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.ada_code?.newValue) {
      setCode(changes.ada_code.newValue);
      // Code is written once and never changes — detach after first hit
      chrome.storage.onChanged.removeListener(onChange);
    }
  };
  chrome.storage.onChanged.addListener(onChange);
}

function openFilterModal() {
  const modal = document.getElementById("filter-modal");
  if (modal) {
    modal.classList.remove("hidden");
    // Initialize checkboxes if not already done
    createActivityTypeCheckboxes();
    // Restore previous selections
    restoreActivityTypeSelections();
  }
}

function closeFilterModal() {
  const modal = document.getElementById("filter-modal");
  if (modal) modal.classList.add("hidden");
}

function parseItemTimestamp(item) {
  const candidates = [];
  const iso = item.dateISO;
  const time = item.timeText.split("•")[0].trim();

  if (iso && time) candidates.push(`${iso} ${time}`);
  for (const c of candidates) {
    const ts = Date.parse(c);
    if (!Number.isNaN(ts)) return ts;
  }

  return null;
}

function highlightSearchTerm(text, searchTerm) {
  if (!searchTerm || !text) return text;

  // Find the search term (case-insensitive substring match first)
  const lowerText = text.toLowerCase();
  const lowerSearch = searchTerm.toLowerCase();
  const index = lowerText.indexOf(lowerSearch);

  if (index !== -1) {
    // Found exact substring match
    const before = text.substring(0, index);
    const match = text.substring(index, index + searchTerm.length);
    const after = text.substring(index + searchTerm.length);
    return `${before}<span class="search-highlight">${match}</span>${after}`;
  }

  return text;
}

// function renderItems(items, isFiltering = false) {
//   const container = document.getElementById("results-container");
//   const searchWrapper = document.getElementById("search-wrapper");
//   if (!container) return;

//   // Store all items globally for filtering (only if not already filtering)
//   if (!isFiltering) {
//     allItems = items;
//     // originalItems = items;
//     originalItems = Array.isArray(items) ? items.slice() : [];
//   }

//   // Show search bar when items are rendered
//   if (searchWrapper && items.length > 0) {
//     searchWrapper.classList.remove("hidden");
//   }

//   container.innerHTML = "";

//   const sortedItems = [...items].sort(
//     (a, b) => (b.senScore || 0) - (a.senScore || 0)
//   );

//   sortedItems.forEach((item, index) => {
//     const score = item.senScore || 0;
//     const itemId = item.uniqueId || `item-${index}`;
//     item._feedbackId = itemId;
//     const at = (item.activityType || "").trim();
//     const atLower = at.toLowerCase();
//     const displayActivity_1 = allowedActivityTypesLower.has(atLower) ? at : "Others";
//     const displayActivity_2 = allowedActivityTypesLower.has(atLower) ? "" : at;
//     const googleGSvg = `<svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:inline;vertical-align:-2px;flex-shrink:0">
//   <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
//   <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
//   <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
//   <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
// </svg>`;


//     const chevron = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline;vertical-align:-1px;flex-shrink:0"><path d="M3 2l4 3-4 3" stroke="#ccc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

//     let activityHtml = "";
//     if (displayActivity_1) activityHtml += `<span class="activity-tag">${displayActivity_1}</span>`;
//     if (displayActivity_2) activityHtml += ` ${chevron} <span class="activity-tag" style="font-size:11px;padding:2px 8px;">${displayActivity_2}</span>`; const box = document.createElement("div");
//     box.className = "entry-box";

//     box.dataset.itemId = itemId;
//     if (score > 50) box.classList.add("is-high");

//     box.innerHTML = `
//   <div class="entry-left">
//     <div class="score-ring" style="--p:${score}">
//       <span class="score-text">${score}%</span>
//     </div>
//   </div>

//   <div class="entry-body">
//     <div class="entry-main">
//       <h3 class="entry-title">${item.actionVerb} • ${highlightSearchTerm(item.title || "Untitled Activity", currentSearchTerm)}</h3>

//       <div class="entry-meta">
//         ${item.timeText || ""} ${item.dateISO || ""}
//         ${item.link ? ` | <a href="${item.link}" target="_blank">More details</a>` : ""}
//       </div>

//       <div class="entry-accuracy">
//         <span class="entry-accuracy-label">Is this result sensitive?</span>
//         <a href="#" class="yes-link" data-item-id="${itemId}" data-accuracy="yes">Yes</a>
//         <span class="entry-accuracy-divider">|</span>
//         <a href="#" class="no-link" data-item-id="${itemId}" data-accuracy="no">No</a>
//       </div>

//       <span class="category-source">
//         category <span class="category-bg-tag">by ${googleGSvg}</span>
//       </span>

//       ${activityHtml}
//     </div>
//     <button class="entry-close" title="Remove" data-item-id="${itemId}"></button>
//   </div>
// `;

//     // Add click handlers for accuracy links
//     const yesLink = box.querySelector('.yes-link');
//     const noLink = box.querySelector('.no-link');

//     yesLink.addEventListener('click', (e) => handleAccuracyClick(e, index + 1));
//     noLink.addEventListener('click', (e) => handleAccuracyClick(e, index + 1));
//     // yesLink.addEventListener('click', handleAccuracyClick);
//     // noLink.addEventListener('click', handleAccuracyClick);

//     // Restore previous selection if exists
//     const previousSelection = accuracyResults.get(itemId);
//     if (previousSelection) {
//       if (previousSelection === 'yes') {
//         yesLink.classList.add('selected');
//       } else {
//         noLink.classList.add('selected');
//       }
//     }
//     const closeBtn = box.querySelector(".entry-close");
//     closeBtn.addEventListener("click", async (e) => {
//       e.preventDefault();
//       const itemId = e.currentTarget.dataset.itemId; // this is your uniqueId/data-token

//       // User initiated a delete from the UI
//       logUiEvent("delete_activity_clicked", { itemId });

//       // Show confirmation modal
//       showConfirmationModal(itemId, box);
//     });

//     container.appendChild(box);
//   });
// }

function renderItems(items, isFiltering = false) {
  const container = document.getElementById("results-container");
  const searchWrapper = document.getElementById("search-wrapper");
  if (!container) return;

  // Store all items globally for filtering (only if not already filtering)
  if (!isFiltering) {
    allItems = items;
    // originalItems = items;
    originalItems = Array.isArray(items) ? items.slice() : [];
  }

  // Show search bar when items are rendered
  if (searchWrapper && items.length > 0) {
    searchWrapper.classList.remove("hidden");
  }

  container.innerHTML = "";

  const sortedItems = [...items].sort(
    (a, b) => (b.senScore || 0) - (a.senScore || 0)
  );

  sortedItems.forEach((item, index) => {
    const score = item.senScore || 0;
    const itemId = item.uniqueId || `item-${index}`;
    item._feedbackId = itemId;
    const at = (item.activityType || "").trim();
    const atLower = at.toLowerCase();
    const displayActivity_1 = allowedActivityTypesLower.has(atLower) ? at : "Others";
    const displayActivity_2 = allowedActivityTypesLower.has(atLower) ? "" : at;
    const googleGSvg = `<svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:inline;vertical-align:-2px;flex-shrink:0">
  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
</svg>`;


    const chevron = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline;vertical-align:-1px;flex-shrink:0"><path d="M3 2l4 3-4 3" stroke="#ccc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    let activityHtml = "";
    if (displayActivity_1) activityHtml += `<span class="activity-tag">${displayActivity_1}</span>`;
    if (displayActivity_2) activityHtml += ` ${chevron} <span class="activity-tag" style="font-size:11px;padding:2px 8px;">${displayActivity_2}</span>`;

    // NEW: only render the score ring when t_flag === 1
    const scoreRingHtml = cachedTFlag === 1
      ? `<div class="entry-left">
    <div class="score-ring" style="--p:${score}">
      <span class="score-text">${score}%</span>
    </div>
  </div>`
      : "";

    const box = document.createElement("div");
    box.className = "entry-box";

    box.dataset.itemId = itemId;
    if (score > 50) box.classList.add("is-high");

    box.innerHTML = `
  ${scoreRingHtml}

  <div class="entry-body">
    <div class="entry-main">
      <h3 class="entry-title">${item.actionVerb} • ${highlightSearchTerm(item.title || "Untitled Activity", currentSearchTerm)}</h3>

      <div class="entry-meta">
        ${item.timeText || ""} ${item.dateISO || ""}
        ${item.link ? ` | <a href="${item.link}" target="_blank">More details</a>` : ""}
      </div>

      <div class="entry-accuracy">
        <span class="entry-accuracy-label">Is this result sensitive?</span>
        <a href="#" class="yes-link" data-item-id="${itemId}" data-accuracy="yes">Yes</a>
        <span class="entry-accuracy-divider">|</span>
        <a href="#" class="no-link" data-item-id="${itemId}" data-accuracy="no">No</a>
      </div>

      <span class="category-source">
        category <span class="category-bg-tag">by ${googleGSvg}</span>
      </span>

      ${activityHtml}
    </div>
    <button class="entry-close" title="Remove" data-item-id="${itemId}"></button>
  </div>
`;

    // Add click handlers for accuracy links
    const yesLink = box.querySelector('.yes-link');
    const noLink = box.querySelector('.no-link');

    yesLink.addEventListener('click', (e) => handleAccuracyClick(e, index + 1));
    noLink.addEventListener('click', (e) => handleAccuracyClick(e, index + 1));

    // Restore previous selection if exists
    const previousSelection = accuracyResults.get(itemId);
    if (previousSelection) {
      if (previousSelection === 'yes') {
        yesLink.classList.add('selected');
      } else {
        noLink.classList.add('selected');
      }
    }
    const closeBtn = box.querySelector(".entry-close");
    closeBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const itemId = e.currentTarget.dataset.itemId; // this is your uniqueId/data-token

      // User initiated a delete from the UI
      logUiEvent("delete_activity_clicked", { itemId });

      // Show confirmation modal
      showConfirmationModal(itemId, box);
    });

    container.appendChild(box);
  });
}



function handleAccuracyClick(event, serial) {
  event.preventDefault();

  const link = event.target;
  const itemId = link.dataset.itemId;
  const accuracy = link.dataset.accuracy;

  const itemBox = document.querySelector(`[data-item-id="${itemId}"]`);
  const yesLink = itemBox.querySelector('.yes-link');
  const noLink = itemBox.querySelector('.no-link');

  yesLink.classList.remove('selected');
  noLink.classList.remove('selected');
  link.classList.add('selected');

  accuracyResults.set(itemId, accuracy);

  // console.log('Accuracy Results:', Object.fromEntries(accuracyResults));

  logUiEvent("sensitivity_feedback", { itemId, accuracy, serial });

  persistFeedbackResults();
}

// Function to get all accuracy results
function getAccuracyResults() {
  return Object.fromEntries(accuracyResults);
}

// Confirmation modal functions
function showConfirmationModal(itemId, boxElement) {
  const modal = document.getElementById('confirmModal');
  const yesBtn = document.getElementById('confirmYes');
  const noBtn = document.getElementById('confirmNo');

  // Show modal
  modal.classList.remove('hidden');

  // Remove existing event listeners to prevent multiple bindings
  const newYesBtn = yesBtn.cloneNode(true);
  const newNoBtn = noBtn.cloneNode(true);
  yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
  noBtn.parentNode.replaceChild(newNoBtn, noBtn);

  // Add event listeners
  newYesBtn.addEventListener('click', () => {
    hideConfirmationModal();
    // User confirmed deletion of an activity
    logUiEvent("deleted_activity_confirmed", { itemId });
    deleteActivity(itemId, boxElement);
  });

  newNoBtn.addEventListener('click', () => {
    hideConfirmationModal();
  });

  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      hideConfirmationModal();
    }
  });
}

function hideConfirmationModal() {
  const modal = document.getElementById('confirmModal');
  modal.classList.add('hidden');
}

function deleteActivity(itemId, boxElement) {
  // Remove from UI
  boxElement.remove();

  // Remove from accuracy results if exists
  accuracyResults.delete(itemId);
  persistFeedbackResults();

  // Update originalItems array by removing the deleted item
  originalItems = originalItems.filter(item => {
    const id = item.uniqueId || item;
    return id !== itemId;
  });

  // Send message to delete from Google Activity Dashboard
  chrome.runtime.sendMessage({
    type: "DELETE_MYACTIVITY_BY_TOKEN",
    token: itemId,
  });

  // Update localStorage with the new items list
  chrome.storage.local.set({
    myactivity_extracted_items: originalItems
  }, () => {
    // console.log("Updated localStorage after deleting item:", itemId);
  });


}

// // Search filtering functionality
function filterItems(searchTerm) {
  currentSearchTerm = searchTerm;
  applyFilters();
}

function applyFilters() {
  const normalizedSearch = (currentSearchTerm || "").toLowerCase().trim();

  const filtered = originalItems.filter((item) => {
    // search match
    const title = (item.title || "").toLowerCase();
    const matchesSearch = !normalizedSearch || title.includes(normalizedSearch);
    if (!matchesSearch) return false;

    // date range match
    const ts = parseItemTimestamp(item);
    if (currentStartTs !== null && (ts === null || ts < currentStartTs)) return false;
    if (currentEndTs !== null && (ts === null || ts > currentEndTs)) return false;

    // activity type match
    if (currentActivityTypes.size > 0) {
      const at = (item.activityType || "").trim();
      const atLower = at.toLowerCase();
      currentActivityTypes_lower = new Set(Array.from(currentActivityTypes).map(s => s.toLowerCase()));
      if (!currentActivityTypes_lower.has(atLower)) return false;
    }
    return true;
  });

  renderItems(filtered, true);
}

// Set up search listener
document.addEventListener("DOMContentLoaded", () => {
  loadFeedbackResults();
  loadUniqueId();

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      filterItems(e.target.value);
    });
  }

  const applyBtn = document.getElementById("apply-filter");
  const clearBtn = document.getElementById("clear-filter");
  const closeBtn = document.getElementById("close-filter");
  const openBtn = document.getElementById("open-filter");
  // const filterSummaryEl = document.getElementById("filter-summary");
  const startInput = document.getElementById("start-datetime");
  const endInput = document.getElementById("end-datetime");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      openFilterModal();

      // User opened the filter modal
      logUiEvent("filter_modal_open", null, null);
    });
  }

  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      const startVal = startInput?.value;
      const endVal = endInput?.value;

      const parsedStart = startVal ? Date.parse(startVal) : null;
      const parsedEnd = endVal ? Date.parse(endVal) : null;

      currentStartTs = Number.isNaN(parsedStart) ? null : parsedStart;
      currentEndTs = Number.isNaN(parsedEnd) ? null : parsedEnd;

      updateActivityTypeFilter();

      // console.log("Applying filters:", {
      //   currentStartTs,
      //   currentEndTs,
      //   currentActivityTypes: Array.from(currentActivityTypes),
      // });

      const typesArray = Array.from(currentActivityTypes);

      if (startVal || endVal) {
        logUiEvent("date_filter_submit", {
          start: startVal || null,
          end: endVal || null,
        });
      }

      if (typesArray.length > 0) {
        logUiEvent("type_filter_submit", {
          activity_types: typesArray,
        });
      }

      applyFilters();
      updateFilterDisplay();
      closeFilterModal();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (startInput) startInput.value = "";
      if (endInput) endInput.value = "";
      currentStartTs = null;
      currentEndTs = null;
      currentActivityTypes.clear();
      // Reset checkboxes
      document.querySelectorAll(".activity-type-checkbox").forEach(cb => cb.checked = false);
      document.getElementById("activity-type-all").checked = false;

      // User cleared all filters
      logUiEvent("filter_removal", null, null);

      applyFilters();
      updateFilterDisplay();
      closeFilterModal();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      closeFilterModal();
    });
  }

  const filterModal = document.getElementById("filter-modal");
  if (filterModal) {
    filterModal.addEventListener("click", (e) => {
      if (e.target === filterModal) closeFilterModal();
    });
  }

  // helper to update the small summary text and clear button next to the filter icon
  function updateFilterDisplay() {
    if (currentStartTs === null && currentEndTs === null && currentActivityTypes.size === 0) {
      if (clearBtn) clearBtn.classList.add('hidden');
      return;
    }
    if (clearBtn) clearBtn.classList.remove('hidden');
  }

  // initialize display on load
  updateFilterDisplay();
});

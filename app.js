(() => {
  "use strict";

  const config = window.APP_CONFIG || {};
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabPanels = document.querySelectorAll(".tab-panel");
  const collectorForm = document.getElementById("lead-collector-form");
  const finderForm = document.getElementById("lead-finder-form");
  const responsePanel = document.getElementById("response-panel");
  const responseTitle = document.getElementById("response-title");
  const responseMessage = document.getElementById("response-message");
  const responseOutput = document.getElementById("response-output");
  const copyResponseButton = document.getElementById("copy-response");
  const closeResponseButton = document.getElementById("close-response");
  const responseTabButtons = document.querySelectorAll("[data-response-tab]");
  const toast = document.getElementById("toast");

  const refreshJobsButton = document.getElementById("refresh-jobs");
  const jobsLoading = document.getElementById("jobs-loading");
  const jobsError = document.getElementById("jobs-error");
  const jobsErrorMessage = document.getElementById("jobs-error-message");
  const jobsEmpty = document.getElementById("jobs-empty");
  const jobsContent = document.getElementById("jobs-content");
  const jobsTableBody = document.getElementById("jobs-table-body");
  const jobsCardList = document.getElementById("jobs-card-list");
  const jobsTotalCount = document.getElementById("jobs-total-count");
  const jobsCompletedCount = document.getElementById("jobs-completed-count");
  const jobsProcessingCount = document.getElementById("jobs-processing-count");
  const jobsPendingCount = document.getElementById("jobs-pending-count");
  const jobsUpdatedAt = document.getElementById("jobs-updated-at");
  const jobsVisibleSummary = document.getElementById("jobs-visible-summary");
  const loadMoreJobsButton = document.getElementById("load-more-jobs");

  const jobModal = document.getElementById("job-modal");
  const jobModalLoading = document.getElementById("job-modal-loading");
  const jobModalContent = document.getElementById("job-modal-content");
  const jobModalError = document.getElementById("job-modal-error");
  const jobDetailName = document.getElementById("job-detail-name");
  const jobDetailStatus = document.getElementById("job-detail-status");
  const jobDetailId = document.getElementById("job-detail-id");
  const jobDetailDate = document.getElementById("job-detail-date");
  const jobDetailLanguage = document.getElementById("job-detail-language");
  const jobDetailDepth = document.getElementById("job-detail-depth");
  const jobDetailRadius = document.getElementById("job-detail-radius");
  const jobDetailEmail = document.getElementById("job-detail-email");
  const jobDetailKeywords = document.getElementById("job-detail-keywords");
  const jobDetailDownload = document.getElementById("job-detail-download");
  const copyJobIdButton = document.getElementById("copy-job-id");
  const jobResultCount = document.getElementById("job-result-count");
  const jobResultsLoading = document.getElementById("job-results-loading");
  const jobResultsEmpty = document.getElementById("job-results-empty");
  const jobResultsError = document.getElementById("job-results-error");
  const jobResultsContent = document.getElementById("job-results-content");
  const jobResultsBody = document.getElementById("job-results-body");
  const jobResultsNote = document.getElementById("job-results-note");

  const jobsApiBase = String(config.SCRAPER_JOBS_API || "/api/v1/jobs").replace(/\/$/, "");
  const jobsPageSize = Math.max(Number(config.JOBS_PAGE_SIZE || 8), 1);
  const jobsRefreshInterval = Math.max(Number(config.JOBS_REFRESH_INTERVAL || 10000), 5000);

  let latestResponse = "";
  let activeResponseTab = "collector";
  const responseStore = { collector: null, finder: null };
  let jobs = [];
  let visibleJobs = jobsPageSize;
  let jobsTimer = null;
  let jobsRequestController = null;
  let selectedJobId = "";

  function activateTab(tabName) {
    tabButtons.forEach((button) => {
      const isActive = button.dataset.tab === tabName;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    tabPanels.forEach((panel) => {
      const isActive = panel.id === `${tabName}-panel`;
      panel.classList.toggle("active", isActive);
      panel.hidden = !isActive;
    });

    const nextHash = tabName === "finder" ? "#lead-detail-finder" : "#lead-collector";
    history.replaceState(null, "", nextHash);
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  function getInitialTab() {
    return location.hash.toLowerCase().includes("detail") ? "finder" : "collector";
  }

  activateTab(getInitialTab());

  function formDataToObject(form) {
    const data = new FormData(form);
    const payload = {};

    for (const [key, value] of data.entries()) {
      payload[key] = typeof value === "string" ? value.trim() : value;
    }

    form.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      payload[checkbox.name] = checkbox.checked;
    });

    Object.keys(payload).forEach((key) => {
      if (payload[key] === "") delete payload[key];
    });

    return payload;
  }

  function setButtonLoading(button, loading) {
    button.disabled = loading;
    button.classList.toggle("loading", loading);
    const label = button.querySelector(".button-label");

    if (label) {
      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = label.textContent;
      }
      label.textContent = loading ? "Processing..." : button.dataset.originalLabel;
    }
  }

  function markInvalid(input, invalid) {
    input.classList.toggle("invalid", invalid);
    if (invalid) {
      input.addEventListener("input", () => input.classList.remove("invalid"), { once: true });
    }
  }

  function validateCollector(form) {
    const state = form.elements.state;
    const niche = form.elements.niche;
    let valid = true;

    [state, niche].forEach((input) => {
      const empty = !String(input.value || "").trim();
      markInvalid(input, empty);
      if (empty) valid = false;
    });

    if (!valid) showToast("State and niche are required.");
    return valid;
  }

  function validateFinder(form) {
    const identifierNames = [
      "person_name", "company_name", "email", "phone", "website",
      "linkedin", "facebook", "instagram", "x_handle"
    ];

    const hasIdentifier = identifierNames.some((name) => {
      const field = form.elements[name];
      return field && String(field.value || "").trim();
    });

    if (!hasIdentifier) {
      identifierNames.forEach((name) => {
        const field = form.elements[name];
        if (field) markInvalid(field, true);
      });
      showToast("Enter at least one identifier.");
      return false;
    }

    return true;
  }

  function isPlaceholderWebhook(url) {
    return !url || url.includes("YOUR-N8N-DOMAIN");
  }

  async function requestJson(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const externalSignal = options.signal;
    const abortFromExternal = () => controller.abort();

    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    }

    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        ...options,
        signal: controller.signal,
        headers: {
          "Accept": "application/json, text/plain, */*",
          ...(options.headers || {})
        }
      });

      const contentType = response.headers.get("content-type") || "";
      let result;

      if (contentType.includes("application/json")) {
        result = await response.json();
      } else {
        const text = await response.text();
        try {
          result = JSON.parse(text);
        } catch {
          result = { message: text || response.statusText };
        }
      }

      if (!response.ok) {
        const error = new Error(result?.message || `Request failed with status ${response.status}`);
        error.response = result;
        error.status = response.status;
        throw error;
      }

      return result;
    } finally {
      window.clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener("abort", abortFromExternal);
    }
  }

  async function postJson(url, payload, timeoutMs) {
    return requestJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }, timeoutMs);
  }

  function renderResponseTab(tabName) {
    activeResponseTab = tabName;
    responseTabButtons.forEach((button) => {
      const active = button.dataset.responseTab === tabName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    const stored = responseStore[tabName];
    responsePanel.classList.toggle("error", stored?.type === "error");

    if (!stored) {
      responseTitle.textContent = tabName === "collector" ? "No Lead Collector response yet" : "No Lead Detail Finder response yet";
      responseMessage.textContent = "Submit this workflow to see its latest response.";
      latestResponse = "No response available.";
      responseOutput.textContent = latestResponse;
      return;
    }

    responseTitle.textContent = stored.title;
    responseMessage.textContent = stored.message;
    latestResponse = stored.output;
    responseOutput.textContent = latestResponse;
  }

  function showResponse(type, title, message, data, tabName = "collector") {
    responseStore[tabName] = {
      type,
      title,
      message,
      output: typeof data === "string" ? data : JSON.stringify(data ?? {}, null, 2)
    };
    responsePanel.hidden = false;
    renderResponseTab(tabName);
    responsePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function getResultJobId(result) {
    const value = String(result?.job_id || result?.id || result?.data?.job_id || result?.data?.id || "").trim();
    return value.includes("{{") || value.includes("}}") ? "" : value;
  }

  function sanitizeWorkflowResponse(result) {
    if (!result || typeof result !== "object") return result;
    const clean = JSON.parse(JSON.stringify(result));
    const candidates = [clean, clean.data].filter((value) => value && typeof value === "object");
    let removedTemplate = false;

    candidates.forEach((value) => {
      ["job_id", "id"].forEach((key) => {
        if (typeof value[key] === "string" && (value[key].includes("{{") || value[key].includes("}}"))) {
          delete value[key];
          removedTemplate = true;
        }
      });
    });

    if (removedTemplate) {
      clean.note = "The scraper job was accepted. Its real job ID will appear in Recent Scraping Jobs.";
    }
    return clean;
  }

  async function handleSubmit({ form, endpoint, workflowName, validator, onSuccess, responseTab }) {
    if (!validator(form)) return;

    if (isPlaceholderWebhook(endpoint)) {
      showResponse("error", "Webhook URL not configured", "Update config.js with the n8n Production Webhook URL.", {
        workflow: workflowName,
        required_file: "config.js",
        current_endpoint: endpoint
      }, responseTab);
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    const payload = {
      ...formDataToObject(form),
      workflow: workflowName,
      source: "scraper.koretechxdemo.link",
      requested_at: new Date().toISOString()
    };

    setButtonLoading(button, true);

    try {
      const result = await postJson(endpoint, payload, Number(config.REQUEST_TIMEOUT || 120000));
      const displayResult = sanitizeWorkflowResponse(result);
      showResponse("success", "Request submitted successfully", `${workflowName} workflow accepted the request.`, displayResult, responseTab);
      if (typeof onSuccess === "function") onSuccess(result, payload);
    } catch (error) {
      const aborted = error.name === "AbortError";
      showResponse(
        "error",
        aborted ? "Request timed out" : "Request failed",
        aborted ? "The workflow did not respond within the configured timeout." : error.message,
        error.response || { error: error.message, endpoint },
        responseTab
      );
    } finally {
      setButtonLoading(button, false);
    }
  }

  collectorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSubmit({
      form: collectorForm,
      endpoint: config.LEAD_COLLECTOR_WEBHOOK,
      workflowName: "lead-collector",
      validator: validateCollector,
      responseTab: "collector",
      onSuccess: (result, payload) => {
        const jobId = getResultJobId(result);
        if (jobId) {
          const queryLocation = [payload.city, payload.state, payload.country].filter(Boolean).join(", ");
          const optimisticJob = {
            id: jobId,
            name: `${payload.niche || "Lead collection"} in ${queryLocation}`,
            date: payload.requested_at,
            status: result.status || "processing",
            optimistic: true
          };

          jobs = [optimisticJob, ...jobs.filter((job) => job.id !== jobId)];
          visibleJobs = Math.max(visibleJobs, jobsPageSize);
          renderJobs();
          window.setTimeout(() => loadJobs({ silent: true }), 1200);
        }
      }
    });
  });

  finderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSubmit({
      form: finderForm,
      endpoint: config.LEAD_DETAIL_FINDER_WEBHOOK,
      workflowName: "lead-detail-finder",
      validator: validateFinder,
      responseTab: "finder"
    });
  });

  responseTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      responsePanel.hidden = false;
      renderResponseTab(button.dataset.responseTab);
    });
  });

  copyResponseButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(latestResponse);
      showToast("Response copied.");
    } catch {
      showToast("Could not copy the response.");
    }
  });

  closeResponseButton.addEventListener("click", () => {
    responsePanel.hidden = true;
  });

  function normalizeJobsResponse(result) {
    const candidates = Array.isArray(result)
      ? result
      : Array.isArray(result?.jobs)
        ? result.jobs
        : Array.isArray(result?.data)
          ? result.data
          : [];

    return candidates
      .map((job) => ({
        ...job,
        id: String(job?.id || job?.ID || job?.job_id || "").trim(),
        name: String(job?.name || job?.Name || job?.search_query || "Untitled scraping job").trim(),
        date: job?.date || job?.Date || job?.created_at || job?.createdAt || "",
        status: String(job?.status || job?.Status || "unknown").trim().toLowerCase()
      }))
      .filter((job) => job.id)
      .sort((a, b) => {
        const aTime = parseJobDate(a.date)?.getTime() || 0;
        const bTime = parseJobDate(b.date)?.getTime() || 0;
        return bTime - aTime;
      });
  }

  function getStatusInfo(status) {
    const value = String(status || "unknown").toLowerCase();

    if (["ok", "completed", "complete", "success", "succeeded"].includes(value)) {
      return { key: "completed", label: "Completed" };
    }

    if (["failed", "error", "cancelled", "canceled"].includes(value)) {
      return { key: "failed", label: value === "cancelled" || value === "canceled" ? "Cancelled" : "Failed" };
    }

    if (["working", "processing", "running", "started"].includes(value)) {
      return { key: "processing", label: "Processing" };
    }

    if (["pending", "queued", "not_found"].includes(value)) {
      return { key: "pending", label: value === "queued" ? "Queued" : "Pending" };
    }

    return { key: "unknown", label: value ? titleCase(value) : "Unknown" };
  }

  function titleCase(value) {
    return String(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function parseJobDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    const goUtcMatch = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+\+0000\s+UTC$/i);
    const normalized = goUtcMatch ? `${goUtcMatch[1]}T${goUtcMatch[2]}Z` : raw;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatJobDate(value) {
    if (!value) return "—";
    const date = parseJobDate(value);
    if (!date) return String(value);

    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getDownloadUrl(jobId) {
    return `${jobsApiBase}/${encodeURIComponent(jobId)}/download`;
  }

  function jobRowTemplate(job) {
    const status = getStatusInfo(job.status);
    const canDownload = status.key === "completed";
    const downloadAttributes = canDownload
      ? `href="${escapeHtml(getDownloadUrl(job.id))}" download`
      : 'href="#" aria-disabled="true" tabindex="-1"';

    return `
      <tr>
        <td><button class="job-id-button" type="button" data-view-job="${escapeHtml(job.id)}" title="${escapeHtml(job.id)}">${escapeHtml(job.id)}</button></td>
        <td><div class="job-name-cell" title="${escapeHtml(job.name)}">${escapeHtml(job.name)}</div></td>
        <td><time datetime="${escapeHtml(job.date || "")}">${escapeHtml(formatJobDate(job.date))}</time></td>
        <td><span class="job-status job-status-${status.key}"><span></span>${escapeHtml(status.label)}</span></td>
        <td>
          <div class="job-actions">
            <button class="job-action job-action-view" type="button" data-view-job="${escapeHtml(job.id)}">View</button>
            <a class="job-action job-action-download${canDownload ? "" : " disabled"}" ${downloadAttributes}>Download</a>
          </div>
        </td>
      </tr>`;
  }

  function jobCardTemplate(job) {
    const status = getStatusInfo(job.status);
    const canDownload = status.key === "completed";
    const downloadAttributes = canDownload
      ? `href="${escapeHtml(getDownloadUrl(job.id))}" download`
      : 'href="#" aria-disabled="true" tabindex="-1"';

    return `
      <article class="job-card">
        <div class="job-card-top">
          <span class="job-status job-status-${status.key}"><span></span>${escapeHtml(status.label)}</span>
          <time datetime="${escapeHtml(job.date || "")}">${escapeHtml(formatJobDate(job.date))}</time>
        </div>
        <h4>${escapeHtml(job.name)}</h4>
        <button class="job-card-id" type="button" data-view-job="${escapeHtml(job.id)}" title="View job details">${escapeHtml(job.id)}</button>
        <div class="job-card-actions">
          <button class="job-action job-action-view" type="button" data-view-job="${escapeHtml(job.id)}">View Details</button>
          <a class="job-action job-action-download${canDownload ? "" : " disabled"}" ${downloadAttributes}>Download CSV</a>
        </div>
      </article>`;
  }

  function renderJobs() {
    const visible = jobs.slice(0, visibleJobs);
    const statusKeys = jobs.map((job) => getStatusInfo(job.status).key);
    const completedCount = statusKeys.filter((key) => key === "completed").length;
    const processingCount = statusKeys.filter((key) => key === "processing").length;
    const pendingCount = statusKeys.filter((key) => key === "pending").length;

    jobsTotalCount.textContent = String(jobs.length);
    jobsCompletedCount.textContent = String(completedCount);
    jobsProcessingCount.textContent = String(processingCount);
    jobsPendingCount.textContent = String(pendingCount);
    jobsLoading.hidden = true;
    jobsError.hidden = true;
    jobsEmpty.hidden = jobs.length !== 0;
    jobsContent.hidden = jobs.length === 0;

    jobsTableBody.innerHTML = visible.map(jobRowTemplate).join("");
    jobsCardList.innerHTML = visible.map(jobCardTemplate).join("");

    jobsVisibleSummary.textContent = `Showing ${visible.length} of ${jobs.length} jobs`;
    loadMoreJobsButton.hidden = visible.length >= jobs.length;
  }

  function setJobsLoading(loading, silent = false) {
    refreshJobsButton.disabled = loading;
    refreshJobsButton.classList.toggle("loading", loading);

    if (loading && !silent && jobs.length === 0) {
      jobsLoading.hidden = false;
      jobsError.hidden = true;
      jobsEmpty.hidden = true;
      jobsContent.hidden = true;
    }
  }

  async function loadJobs({ silent = false } = {}) {
    if (jobsRequestController) jobsRequestController.abort();
    jobsRequestController = new AbortController();
    setJobsLoading(true, silent);

    try {
      const result = await requestJson(jobsApiBase, {
        method: "GET",
        signal: jobsRequestController.signal
      }, 30000);

      jobs = normalizeJobsResponse(result);
      jobsUpdatedAt.textContent = new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }).format(new Date());
      renderJobs();
    } catch (error) {
      if (error.name === "AbortError") return;
      jobsLoading.hidden = true;
      jobsError.hidden = false;
      jobsErrorMessage.textContent = error.message || "Please refresh and try again.";
      if (jobs.length === 0) jobsContent.hidden = true;
    } finally {
      setJobsLoading(false, true);
      jobsRequestController = null;
    }
  }

  function startJobsPolling() {
    window.clearInterval(jobsTimer);
    jobsTimer = window.setInterval(() => {
      if (!document.hidden) loadJobs({ silent: true });
    }, jobsRefreshInterval);
  }

  refreshJobsButton.addEventListener("click", () => {
    loadJobs().then(() => showToast("Jobs refreshed."));
  });

  loadMoreJobsButton.addEventListener("click", () => {
    visibleJobs += jobsPageSize;
    renderJobs();
  });

  function closeJobModal() {
    jobModal.hidden = true;
    document.body.classList.remove("modal-open");
    selectedJobId = "";
  }

  function setJobDetailStatus(statusValue) {
    const status = getStatusInfo(statusValue);
    jobDetailStatus.className = `job-status job-status-${status.key}`;
    jobDetailStatus.innerHTML = `<span></span>${escapeHtml(status.label)}`;
  }

  function parseCsv(text) {
    const input = String(text || "").replace(/^\uFEFF/, "");
    const records = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      const next = input[index + 1];

      if (quoted) {
        if (char === '"' && next === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        quoted = true;
      } else if (char === ',') {
        row.push(field);
        field = "";
      } else if (char === '\n') {
        row.push(field.replace(/\r$/, ""));
        if (row.some((value) => String(value).trim() !== "")) records.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => String(value).trim() !== "")) records.push(row);
    if (records.length < 2) return [];

    const headers = records[0].map((header) => String(header).trim());
    return records.slice(1).map((values) => {
      const result = {};
      headers.forEach((header, index) => {
        result[header] = values[index] ?? "";
      });
      return result;
    });
  }

  function firstRowValue(row, keys) {
    for (const key of keys) {
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
    return "";
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function firstEmail(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return String(parsed[0] || "").trim();
    } catch {
      // Continue with comma-separated text.
    }
    return raw.split(/[;,]/)[0].replace(/[\[\]"]/g, "").trim();
  }

  function resetJobResults() {
    jobResultCount.textContent = "0 leads";
    jobResultsLoading.hidden = false;
    jobResultsEmpty.hidden = true;
    jobResultsError.hidden = true;
    jobResultsContent.hidden = true;
    jobResultsBody.innerHTML = "";
    jobResultsNote.textContent = "";
  }

  function jobLeadRowTemplate(row) {
    const business = firstRowValue(row, ["title", "business_name", "name"]);
    const category = firstRowValue(row, ["category", "categories"]);
    const location = firstRowValue(row, ["address", "complete_address", "street"]);
    const phone = firstRowValue(row, ["phone", "phone_number"]);
    const website = safeHttpUrl(firstRowValue(row, ["website", "web_site"]));
    const email = firstEmail(firstRowValue(row, ["primary_email", "emails", "all_emails"]));
    const mapsUrl = safeHttpUrl(firstRowValue(row, ["link", "google_maps_url"]));
    const rating = firstRowValue(row, ["review_rating", "rating"]);
    const reviews = firstRowValue(row, ["review_count", "reviews"]);

    const businessMarkup = mapsUrl
      ? `<a class="lead-business-link" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener">${escapeHtml(business || "Untitled business")}</a>`
      : `<strong>${escapeHtml(business || "Untitled business")}</strong>`;

    const contact = [
      phone ? `<span>${escapeHtml(phone)}</span>` : "",
      email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : "",
      website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener">Website</a>` : ""
    ].filter(Boolean).join("");

    const ratingMarkup = rating
      ? `<strong>${escapeHtml(rating)}</strong>${reviews ? `<span>${escapeHtml(reviews)} reviews</span>` : ""}`
      : "—";

    return `
      <tr>
        <td>${businessMarkup}</td>
        <td>${escapeHtml(category || "—")}</td>
        <td>${escapeHtml(location || "—")}</td>
        <td><div class="lead-contact-stack">${contact || "—"}</div></td>
        <td><div class="lead-rating-stack">${ratingMarkup}</div></td>
      </tr>`;
  }

  async function loadJobResults(jobId, statusValue) {
    const status = getStatusInfo(statusValue);
    resetJobResults();

    if (status.key !== "completed") {
      jobResultsLoading.hidden = true;
      jobResultsEmpty.hidden = false;
      return;
    }

    try {
      const response = await fetch(getDownloadUrl(jobId), {
        method: "GET",
        cache: "no-store",
        headers: { "Accept": "text/csv, text/plain, */*" }
      });

      if (!response.ok) throw new Error(`CSV request failed with status ${response.status}`);
      const rows = parseCsv(await response.text());

      jobResultsLoading.hidden = true;
      if (rows.length === 0) {
        jobResultsEmpty.hidden = false;
        return;
      }

      const previewLimit = 12;
      jobResultCount.textContent = `${rows.length.toLocaleString()} ${rows.length === 1 ? "lead" : "leads"}`;
      jobResultsBody.innerHTML = rows.slice(0, previewLimit).map(jobLeadRowTemplate).join("");
      jobResultsNote.textContent = rows.length > previewLimit
        ? `Showing the first ${previewLimit} leads. Download the CSV to view all ${rows.length.toLocaleString()} records.`
        : `Showing all ${rows.length.toLocaleString()} records.`;
      jobResultsContent.hidden = false;
    } catch (error) {
      console.error("Could not load job CSV preview", error);
      jobResultsLoading.hidden = true;
      jobResultsError.hidden = false;
    }
  }

  function populateJobModal(job) {
    const data = job?.data && typeof job.data === "object" ? job.data : {};
    const keywords = Array.isArray(data.keywords) ? data.keywords.join(", ") : (data.keywords || job.name || "—");

    jobDetailName.textContent = job.name || "Untitled scraping job";
    jobDetailId.textContent = job.id || selectedJobId;
    jobDetailDate.textContent = formatJobDate(job.date);
    jobDetailLanguage.textContent = data.lang || "—";
    jobDetailDepth.textContent = data.depth ?? "—";
    jobDetailRadius.textContent = data.radius ? `${Number(data.radius).toLocaleString()} m` : "—";
    jobDetailEmail.textContent = data.email === true ? "Enabled" : data.email === false ? "Disabled" : "—";
    jobDetailKeywords.textContent = keywords || "—";
    jobDetailDownload.href = getDownloadUrl(job.id || selectedJobId);

    const status = getStatusInfo(job.status);
    jobDetailDownload.classList.toggle("disabled", status.key !== "completed");
    jobDetailDownload.setAttribute("aria-disabled", String(status.key !== "completed"));
    setJobDetailStatus(job.status);
  }

  async function openJobModal(jobId) {
    selectedJobId = jobId;
    jobModal.hidden = false;
    document.body.classList.add("modal-open");
    jobModalLoading.hidden = false;
    jobModalContent.hidden = true;
    jobModalError.hidden = true;
    resetJobResults();

    const cached = jobs.find((job) => job.id === jobId);
    let job = cached || { id: jobId, name: "Scraper job", date: "", status: "unknown" };

    try {
      const result = await requestJson(`${jobsApiBase}/${encodeURIComponent(jobId)}`, { method: "GET" }, 30000);
      job = normalizeJobsResponse([result])[0] || { ...result, id: jobId };
    } catch (error) {
      if (!cached) {
        jobModalLoading.hidden = true;
        jobModalError.hidden = false;
        return;
      }
    }

    populateJobModal(job);
    jobModalLoading.hidden = true;
    jobModalContent.hidden = false;
    loadJobResults(jobId, job.status);
  }

  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view-job]");
    if (viewButton) {
      event.preventDefault();
      openJobModal(viewButton.dataset.viewJob);
      return;
    }

    if (event.target.closest("[data-close-job-modal]")) {
      closeJobModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !jobModal.hidden) closeJobModal();
  });

  copyJobIdButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(selectedJobId);
      showToast("Job ID copied.");
    } catch {
      showToast("Could not copy the job ID.");
    }
  });

  jobDetailDownload.addEventListener("click", (event) => {
    if (jobDetailDownload.classList.contains("disabled")) {
      event.preventDefault();
      showToast("CSV will be available when the job is completed.");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadJobs({ silent: true });
  });

  loadJobs();
  startJobsPolling();
})();

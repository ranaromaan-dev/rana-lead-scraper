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
  const jobsActiveCount = document.getElementById("jobs-active-count");
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

  const jobsApiBase = String(config.SCRAPER_JOBS_API || "/api/v1/jobs").replace(/\/$/, "");
  const jobsPageSize = Math.max(Number(config.JOBS_PAGE_SIZE || 8), 1);
  const jobsRefreshInterval = Math.max(Number(config.JOBS_REFRESH_INTERVAL || 10000), 5000);

  let latestResponse = "";
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

  function showResponse(type, title, message, data) {
    responsePanel.hidden = false;
    responsePanel.classList.toggle("error", type === "error");
    responseTitle.textContent = title;
    responseMessage.textContent = message;

    latestResponse = typeof data === "string" ? data : JSON.stringify(data ?? {}, null, 2);
    responseOutput.textContent = latestResponse;
    responsePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function getResultJobId(result) {
    return String(result?.job_id || result?.id || result?.data?.job_id || result?.data?.id || "").trim();
  }

  async function handleSubmit({ form, endpoint, workflowName, validator, onSuccess }) {
    if (!validator(form)) return;

    if (isPlaceholderWebhook(endpoint)) {
      showResponse("error", "Webhook URL not configured", "Update config.js with the n8n Production Webhook URL.", {
        workflow: workflowName,
        required_file: "config.js",
        current_endpoint: endpoint
      });
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
      showResponse("success", "Request submitted successfully", `${workflowName} workflow accepted the request.`, result);
      if (typeof onSuccess === "function") onSuccess(result, payload);
    } catch (error) {
      const aborted = error.name === "AbortError";
      showResponse(
        "error",
        aborted ? "Request timed out" : "Request failed",
        aborted ? "The workflow did not respond within the configured timeout." : error.message,
        error.response || { error: error.message, endpoint }
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
      validator: validateFinder
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

    if (["pending", "processing", "running", "started", "queued", "not_found"].includes(value)) {
      return { key: "processing", label: value === "queued" ? "Queued" : "Processing" };
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
    const activeCount = jobs.filter((job) => getStatusInfo(job.status).key === "processing").length;

    jobsTotalCount.textContent = String(jobs.length);
    jobsActiveCount.textContent = String(activeCount);
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

    try {
      const result = await requestJson(`${jobsApiBase}/${encodeURIComponent(jobId)}`, { method: "GET" }, 30000);
      const normalized = normalizeJobsResponse([result])[0] || { ...result, id: jobId };
      populateJobModal(normalized);
      jobModalLoading.hidden = true;
      jobModalContent.hidden = false;
    } catch (error) {
      const cached = jobs.find((job) => job.id === jobId);
      if (cached) {
        populateJobModal(cached);
        jobModalLoading.hidden = true;
        jobModalContent.hidden = false;
        return;
      }
      jobModalLoading.hidden = true;
      jobModalError.hidden = false;
    }
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

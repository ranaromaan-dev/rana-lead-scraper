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

  let latestResponse = "";

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
      input.addEventListener(
        "input",
        () => input.classList.remove("invalid"),
        { once: true }
      );
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
      "person_name",
      "company_name",
      "email",
      "phone",
      "website",
      "linkedin",
      "facebook",
      "instagram",
      "x_handle"
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

  async function postJson(url, payload, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/plain, */*"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
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
        throw error;
      }

      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  function showResponse(type, title, message, data) {
    responsePanel.hidden = false;
    responsePanel.classList.toggle("error", type === "error");
    responseTitle.textContent = title;
    responseMessage.textContent = message;

    latestResponse =
      typeof data === "string"
        ? data
        : JSON.stringify(data ?? {}, null, 2);

    responseOutput.textContent = latestResponse;
    responsePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  async function handleSubmit({
    form,
    endpoint,
    workflowName,
    validator
  }) {
    if (!validator(form)) return;

    if (isPlaceholderWebhook(endpoint)) {
      showResponse(
        "error",
        "Webhook URL not configured",
        "Update config.js with the n8n Production Webhook URL.",
        {
          workflow: workflowName,
          required_file: "config.js",
          current_endpoint: endpoint
        }
      );
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
      const result = await postJson(
        endpoint,
        payload,
        Number(config.REQUEST_TIMEOUT || 120000)
      );

      showResponse(
        "success",
        "Request submitted successfully",
        `${workflowName} workflow accepted the request.`,
        result
      );
    } catch (error) {
      const aborted = error.name === "AbortError";
      showResponse(
        "error",
        aborted ? "Request timed out" : "Request failed",
        aborted
          ? "The workflow did not respond within the configured timeout."
          : error.message,
        error.response || {
          error: error.message,
          endpoint
        }
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
      validator: validateCollector
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
})();

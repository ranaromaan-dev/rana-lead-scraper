window.APP_CONFIG = {
  // n8n Production Webhook URLs.
  LEAD_COLLECTOR_WEBHOOK: "https://n8n.koretechx.com/webhook/lead-collector",
  LEAD_DETAIL_FINDER_WEBHOOK: "https://n8n.koretechx.com/webhook/lead-detail-finder",

  // Same-origin Google Maps Scraper API, proxied by Nginx.
  SCRAPER_JOBS_API: "/api/v1/jobs",

  REQUEST_TIMEOUT: 120000,
  JOBS_REFRESH_INTERVAL: 10000,
  JOBS_PAGE_SIZE: 8
};

# Rana Lead Scraper Frontend v2

Updated frontend for `scraper.koretechxdemo.link`.

## Added

- Recent Scraping Jobs section under Lead Collector
- Automatic refresh every 10 seconds
- Desktop table and mobile job cards
- Completed, processing, failed and cancelled status badges
- Job details modal
- Original Google Maps Scraper CSV download
- Load-more pagination
- Existing Lead Collector and Lead Detail Finder UI preserved

## API usage

The jobs list uses the same-origin endpoint:

```text
/api/v1/jobs
```

Job details:

```text
/api/v1/jobs/{job_id}
```

Original scraper CSV:

```text
/api/v1/jobs/{job_id}/download
```

Nginx proxies `/api/` to the `gmaps:8080` Compose service, so no browser CORS configuration is required for the jobs section.

## Deployment

Replace these repository files with the files in this package, commit to GitHub, then redeploy the existing Dokploy Compose project.

Keep the proxy list only in Dokploy Environment:

```text
GMAPS_PROXY_LIST=http://USER:PASSWORD@IP:PORT,...
```

Do not put real proxy credentials in `docker-compose.yml` or GitHub.

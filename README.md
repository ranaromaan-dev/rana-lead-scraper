# Lead Intelligence Frontend

A responsive HTML/CSS/JavaScript frontend with two tabs:

- Lead Collector
- Lead Detail Finder

Both forms submit JSON to n8n Production Webhook URLs.

## 1. Configure n8n webhook URLs

Edit `config.js`:

```js
window.APP_CONFIG = {
  LEAD_COLLECTOR_WEBHOOK: "https://YOUR-N8N-DOMAIN/webhook/lead-collector",
  LEAD_DETAIL_FINDER_WEBHOOK: "https://YOUR-N8N-DOMAIN/webhook/lead-detail-finder",
  REQUEST_TIMEOUT: 120000
};
```

Use n8n **Production URLs**, not Test URLs, after the workflows are activated.

## 2. GitHub repository

Commit all files in this folder to a repository, for example:

```text
ranaromaan-dev/rana-leads-frontend
```

## 3. Dokploy deployment

Create an Application or Docker Compose service from the GitHub repository.

For Docker Compose:

```text
Compose path: ./docker-compose.yml
Service: frontend
Container port: 80
```

Add the domain:

```text
leads.koretechxdemo.link
```

Enable HTTPS and Let's Encrypt, save, then redeploy.

## 4. n8n CORS

The browser sends requests directly from:

```text
https://leads.koretechxdemo.link
```

Your n8n webhook responses must allow this origin. In a normal n8n Webhook workflow, ensure the webhook is reachable publicly and return JSON through a Respond to Webhook node.

Recommended response headers:

```text
Access-Control-Allow-Origin: https://leads.koretechxdemo.link
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Methods: POST, OPTIONS
```

If n8n is already configured to allow all origins for webhooks, no additional change may be necessary.

## 5. Expected JSON: Lead Collector

```json
{
  "country": "United States",
  "state": "Florida",
  "city": "Miami",
  "niche": "Commercial cleaning companies",
  "max_leads": "100",
  "depth": "1",
  "radius": "10000",
  "language": "en",
  "exclude_keywords": "franchise, residential maid",
  "fetch_emails": true,
  "fetch_socials": true,
  "workflow": "lead-collector",
  "source": "leads.koretechxdemo.link",
  "requested_at": "2026-07-30T00:00:00.000Z"
}
```

## 6. Expected JSON: Lead Detail Finder

The form sends all completed identifiers plus:

```json
{
  "workflow": "lead-detail-finder",
  "source": "leads.koretechxdemo.link",
  "requested_at": "2026-07-30T00:00:00.000Z"
}
```

At least one of these must be completed:

- person_name
- company_name
- email
- phone
- website
- linkedin
- facebook
- instagram
- x_handle

## 7. Local preview

From the project folder:

```bash
docker compose up -d --build
```

Open:

```text
http://localhost
```

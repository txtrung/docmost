# Plane Community integration

Docmost can read work items from a self-hosted [Plane Community Edition](https://plane.so) instance and show them in the editor. This module talks to Plane's REST API. It does not use Plane Query Language (PQL), which is an Enterprise feature.

The integration is disabled until all three environment variables are set. Docmost still starts without them.

## Environment

```bash
PLANE_API_URL=https://plane.example.com
PLANE_WORKSPACE_SLUG=acme
PLANE_API_KEY=plane_api_...
```

- `PLANE_API_URL` is the Plane origin. The client calls `${PLANE_API_URL}/api/v1/`. A value that already ends in `/api/v1` is also accepted.
- `PLANE_WORKSPACE_SLUG` is the workspace slug from the Plane URL (`https://plane.example.com/<slug>/...`).
- `PLANE_API_KEY` is a Plane API token. It stays on the server. The browser never receives it.

If Plane is on a private network, allow that network with the existing `ALLOWED_PRIVATE_NETWORKS` setting. The default `none` blocks private and loopback addresses.

Issue links in the task table use the same origin as `PLANE_API_URL` (`/<slug>/projects/<projectId>/issues/<id>`). If the web UI is hosted on a different origin than the API, those links will not match the UI.

## Create an API key

1. Sign in to Plane Community as a user who can see the projects you want Docmost to read.
2. Open account settings (avatar menu) and create an API token.
3. Copy the token into `PLANE_API_KEY`.

The token can see whatever that Plane user can see. Prefer a dedicated integration user over a personal admin token.

## Permission model

People sign in to Docmost with the same identity provider as Plane (for example Keycloak), so the Docmost email and the Plane email are the same address.

Every Plane request is made with the server API key. Before returning data, Docmost loads each project's members and keeps the project only when the signed-in Docmost user's email is one of those members. A user who is not a member gets no projects and a "no access" response for a direct project id. The API key is not filtered by itself; the membership check is what limits the response.

## What is cached

Plane responses are cached in the existing Redis cache for 60 seconds. The work-item collection (`work-items`, or `issues` on older Plane versions) is remembered for 10 minutes. A `429` is retried once, waiting for the `Retry-After` header (capped at 60 seconds). Plane's published limit is 60 requests per minute per key.

Lists are paged with `cursor` and `per_page` (100). At most 10 pages (1000 records) are read per resource before filters run.

## Editor

- **Plane tasks** inserts a read-only `planeTaskList` block. It lists the current user's projects and renders a live table.
- **Plane roadmap (Mermaid)** inserts a Mermaid `gantt` code block. That diagram is a snapshot. The first line is a `%% docmost-plane` comment. While editing, the code block toolbar shows **Regenerate**, which fetches Plane again and replaces the diagram.
- **Table of contents** inserts a live outline of the page headings. It is not a Plane feature.

## Limitations

- Read-only. Docmost does not create or edit Plane work items.
- Community REST only. No PQL, no Plane Enterprise-only endpoints.
- Filters run in Docmost after the cached page of work items is loaded, so they only see the first 1000 items.
- The first uncached project list requests members for every project the API key can see. A large workspace can spend the rate limit on that first load; later loads use the 60 second cache.
- Static HTML and Markdown export keep the node, but they do not expand live Plane rows or a live table of contents.
- The roadmap diagram does not update until someone regenerates it.

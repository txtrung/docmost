# Plane Community integration

Docmost reads work items from a self-hosted Plane Community instance and shows them in the editor. The module uses Plane's REST API. It does not use Plane Query Language.

The integration stays off until all three environment variables are set. Docmost still starts without them.

## Environment

```bash
PLANE_API_URL=https://plane.example.com
PLANE_WORKSPACE_SLUG=acme
PLANE_API_KEY=plane_api_...
```

`PLANE_API_URL` is the Plane origin. Docmost calls `${PLANE_API_URL}/api/v1/`. A value that already ends in `/api/v1` is accepted.

`PLANE_WORKSPACE_SLUG` is the workspace slug in the Plane URL.

`PLANE_API_KEY` is a Plane API token. It stays on the server.

If Plane is on a private network, allow that network with `ALLOWED_PRIVATE_NETWORKS`. The default `none` blocks private and loopback addresses.

Issue links use the same origin as `PLANE_API_URL`.

## API token

Create the token in Plane from a user who can see the projects Docmost should read. Put it in `PLANE_API_KEY`. The token can see whatever that user can see. A dedicated integration user is safer than a personal admin token.

## Permission model

People sign in to Docmost with the same identity provider as Plane, so the email addresses match.

Every Plane request uses the server API key. Docmost then keeps a project only when the signed-in user's email is a project member. Anyone else gets no projects and a no-access response for a direct project id.

## Cache

Plane responses sit in Redis for 60 seconds. The work-item collection name (`work-items`, or `issues` on older Plane) is remembered for 10 minutes. A `429` is retried once, using `Retry-After` and capped at 60 seconds.

Lists page with `cursor` and `per_page` of 100. Docmost reads at most 10 pages (1000 records) per resource before filters run.

## Editor

**Table of contents** inserts a live outline of the page headings. The settings choose the minimum and maximum heading level, a list or a one-line layout, numbering, and a pinned outline on the side of the page. A click scrolls to the heading.

**Plane tasks** inserts a `planeTaskList` block. A modal sets the project, filters, column order, and a table, card, or count layout. Pasting a Plane project or work-item URL from the same origin offers to insert the block. A card layout shows one work item. The footer shows the match count and the local time of the last refresh.

**Plane roadmap** inserts a `planeRoadmap` timeline. Sync from Plane fills lanes from modules, cycles, or dated work items. Bars and milestones can be dragged, renamed, recolored, added, and removed. Each item is `plane` or `manual`. Sync refreshes Plane items and keeps manual items, edited Plane items, and deletions. Viewers get the same timeline without those controls. Zoom can be weeks, months, or quarters.

An older page may still contain a Mermaid gantt snapshot. That diagram still renders. It no longer has a regenerate action.

## Limitations

Docmost does not create or edit Plane work items.

Filters and the roadmap only see the first 1000 work items in the cached list.

A work item in several modules is drawn in the first module.

The roadmap is one JSON attribute. Two people editing it at once keep the last write.

Pinned tables of contents share one fixed panel, so two pinned blocks overlap.

Static HTML and Markdown export keep the node and do not expand live Plane rows or a live table of contents.

The first uncached project list asks Plane for members of every project the API key can see.

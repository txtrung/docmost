import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import {
  detectWorkItemCollection,
  joinPlaneUrl,
  parseRetryAfterMs,
  planeListAll,
  planeRequest,
  unwrapPlaneList,
} from './plane-http';

describe('plane http helpers', () => {
  it('joins the API prefix once', () => {
    expect(joinPlaneUrl('https://plane.example/', 'workspaces/acme/projects/')).toBe(
      'https://plane.example/api/v1/workspaces/acme/projects/',
    );
    expect(
      joinPlaneUrl('https://plane.example/api/v1', 'workspaces/acme/projects/'),
    ).toBe('https://plane.example/api/v1/workspaces/acme/projects/');
  });

  it('parses Retry-After seconds and HTTP dates', () => {
    expect(parseRetryAfterMs('2', 0)).toBe(2000);
    expect(parseRetryAfterMs('120', 0)).toBe(60_000);
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:03 GMT', now)).toBe(3000);
  });

  it('unwraps cursor and next-link pages', () => {
    expect(
      unwrapPlaneList({
        results: [{ id: '1' }],
        next_cursor: 'cursor-2',
        next_page_results: true,
      }),
    ).toEqual({ items: [{ id: '1' }], nextCursor: 'cursor-2' });

    expect(
      unwrapPlaneList({
        results: [{ id: '1' }],
        next: 'https://plane.example/api/v1/issues/?cursor=abc',
        next_page_results: false,
      }).nextCursor,
    ).toBeNull();
  });
});

describe('plane http against a mock Plane API', () => {
  let server: Server;
  let baseUrl = '';
  const hits: string[] = [];

  beforeEach(async () => {
    hits.length = 0;
    server = createServer((req, res) => {
      const url = req.url ?? '';
      hits.push(url);
      if (req.headers['x-api-key'] !== 'test-key') {
        res.statusCode = 401;
        res.end('{}');
        return;
      }

      if (url.startsWith('/work-items')) {
        res.statusCode = 404;
        res.end(JSON.stringify({ detail: 'not found' }));
        return;
      }

      if (url.startsWith('/limited')) {
        if (hits.filter((hit) => hit.startsWith('/limited')).length === 1) {
          res.statusCode = 429;
          res.setHeader('Retry-After', '0');
          res.end('{}');
          return;
        }
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.startsWith('/issues')) {
        const cursor = new URL(url, 'http://plane.local').searchParams.get('cursor');
        if (!cursor) {
          res.end(
            JSON.stringify({
              results: [{ id: 'a' }],
              next_cursor: 'page-2',
              next_page_results: true,
            }),
          );
          return;
        }
        res.end(
          JSON.stringify({
            results: [{ id: 'b' }],
            next_cursor: '',
            next_page_results: false,
          }),
        );
        return;
      }

      res.statusCode = 404;
      res.end('{}');
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('retries a 429 using Retry-After', async () => {
    const result = await planeRequest({
      url: `${baseUrl}/limited`,
      apiKey: 'test-key',
      fetchImpl: (url, init) => fetch(url, { headers: init.headers }),
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });
    expect(hits.filter((hit) => hit.startsWith('/limited'))).toHaveLength(2);
  });

  it('uses issues when work-items is missing and follows the cursor', async () => {
    const collection = await detectWorkItemCollection({
      projectUrl: baseUrl,
      apiKey: 'test-key',
      fetchImpl: (url, init) => fetch(url, { headers: init.headers }),
    });
    expect(collection).toBe('issues');

    const items = await planeListAll({
      url: `${baseUrl}/issues/?per_page=100`,
      apiKey: 'test-key',
      fetchImpl: (url, init) => fetch(url, { headers: init.headers }),
    });
    expect(items).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
});

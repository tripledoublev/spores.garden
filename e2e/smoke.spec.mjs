import { expect, test } from '@playwright/test';

async function installAtprotoMocks(page) {
  await page.route('**/xrpc/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/com.atproto.identity.resolveHandle')) {
      const handle = url.searchParams.get('handle') || 'unknown.test';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ did: `did:plc:${handle.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'testdid'}` }),
      });
      return;
    }

    if (path.endsWith('/app.bsky.actor.getProfile')) {
      const actor = url.searchParams.get('actor') || 'did:plc:testdid';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          did: actor,
          handle: actor.startsWith('did:') ? 'resolved.example.test' : actor,
          displayName: 'Smoke Test User',
        }),
      });
      return;
    }

    if (
      path.endsWith('/com.atproto.repo.listRecords') ||
      path.endsWith('/app.bsky.feed.getAuthorFeed')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ records: [], feed: [] }),
      });
      return;
    }

    if (path.endsWith('/com.atproto.repo.describeRepo')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ did: 'did:plc:testdid', collections: [] }),
      });
      return;
    }

    if (path.endsWith('/com.atproto.repo.getRecord')) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'RecordNotFound', message: 'mock: not found' }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'NotFound', message: 'mock: endpoint not implemented' }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await installAtprotoMocks(page);
});

test('home page renders core entry points', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('h1.site-title')).toHaveText('spores.garden');
  await expect(page.getByRole('button', { name: /login/i }).first()).toBeVisible();
  await expect(page.locator('recent-gardens')).toBeVisible();
});

test('did route renders garden preview shell', async ({ page }) => {
  await page.goto('/did:plc:testgardenowner');

  await expect(page.locator('.garden-preview__heading')).toContainText('garden could grow here');
});

test('handle route resolves and stays on canonical @handle path', async ({ page }) => {
  await page.goto('/@alice.test');

  await expect(page).toHaveURL(/\/@alice\.test$/);
  await expect(page.locator('.garden-preview__heading')).toContainText('garden could grow here');
});

test('unknown handle redirects home and shows not-found notification', async ({ page }) => {
  await page.route('**/xrpc/com.atproto.identity.resolveHandle**', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'InvalidRequest', message: 'Unable to resolve handle' }),
    });
  });

  await page.goto('/@missing-handle.test');

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.notification.notification-error .notification-message'))
    .toContainText('Garden not found: @missing-handle.test');
});

test('notification can be dismissed', async ({ page }) => {
  await page.route('**/xrpc/com.atproto.identity.resolveHandle**', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'InvalidRequest', message: 'Unable to resolve handle' }),
    });
  });

  await page.goto('/@dismiss-me.test');

  const notification = page.locator('.notification');
  await expect(notification).toBeVisible();
  await page.locator('.notification-close').click();
  await expect(notification).toHaveCount(0);
});

test('login modal opens and closes from home page', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /login/i }).first().click();
  const modalHeading = page.getByRole('heading', { name: 'Login with Bluesky or ATProto' });
  await expect(modalHeading).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(modalHeading).toHaveCount(0);
});

test('auth-change expired event shows session-expired notification', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('auth-change', {
      detail: { reason: 'expired', loggedIn: false, did: null },
    }));
  });

  await expect(page.locator('.notification.notification-error .notification-message'))
    .toContainText('Session expired, please log in again.');
});

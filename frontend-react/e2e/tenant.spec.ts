import { test, expect } from '@playwright/test';
import {
  gotoApp,
  mockCurrentUser,
  mockDashboardData,
  mockBranding,
  MOCK_USER,
} from './helpers/api.mock';

test.describe('Aislamiento de tenant', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'mock-token-123');
      localStorage.setItem('tenant_id', '1');
    });
  });

  test('X-Tenant-Id se envía en requests autenticados', async ({ page }) => {
    await mockCurrentUser(page);
    await mockDashboardData(page);
    await mockBranding(page);

    const tenantHeaders: string[] = [];
    page.on('request', (req) => {
      const tid = req.headers()['x-tenant-id'];
      if (tid) tenantHeaders.push(tid);
    });

    await gotoApp(page, '/dashboard');

    // Al menos una request debe llevar X-Tenant-Id
    await page.waitForTimeout(1500);
    expect(tenantHeaders.length).toBeGreaterThan(0);
    expect(tenantHeaders.every((t) => t === '1')).toBe(true);
  });

  test('superadmin ve datos de otro tenant al cambiar X-Tenant-Id', async ({ page }) => {
    await mockCurrentUser(page, { is_super_admin: true, tenant_id: null });
    await mockDashboardData(page);
    await mockBranding(page);

    const tenantHeaders: string[] = [];
    page.on('request', (req) => {
      const tid = req.headers()['x-tenant-id'];
      if (tid) tenantHeaders.push(tid);
    });

    await page.addInitScript(() => {
      localStorage.setItem('tenant_id', '2');
    });

    await gotoApp(page, '/dashboard');
    await page.waitForTimeout(1500);

    expect(tenantHeaders.some((t) => t === '2')).toBe(true);
  });

  test('usuario normal no puede cambiar tenant (X-Tenant-Id fijado al del usuario)', async ({ page }) => {
    await mockCurrentUser(page, { ...MOCK_USER, tenant_id: 1 });
    await mockDashboardData(page);
    await mockBranding(page);

    const tenantHeaders: string[] = [];
    page.on('request', (req) => {
      const tid = req.headers()['x-tenant-id'];
      if (tid) tenantHeaders.push(tid);
    });

    await gotoApp(page, '/dashboard');
    await page.waitForTimeout(1500);

    // Ninguna request debe enviar un tenant_id distinto al del usuario (1)
    expect(tenantHeaders.every((t) => t === '1')).toBe(true);
  });
});

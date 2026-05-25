import { Page } from '@playwright/test';

/** Respuestas mock del backend para tests E2E. */

export const MOCK_USER = {
  id: 1,
  email: 'admin@test.com',
  full_name: 'Admin Test',
  is_active: true,
  is_super_admin: false,
  tenant_id: 1,
  role_id: 1,
  role_name: 'tenant_admin',
  permissions: ['read', 'write'],
  language: 'es',
  avatar_url: null,
  avatar_data: null,
  department_nav_config: null,
  created_at: '2024-01-01T00:00:00Z',
};

export const MOCK_TENANT = {
  id: 1,
  name: 'Tenant Demo',
  subdomain: 'demo',
  is_active: true,
};

/** Mock: login exitoso sin MFA. */
export async function mockLoginSuccess(page: Page) {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-token-123',
        token_type: 'bearer',
        mfa_required: false,
      }),
    })
  );
}

/** Mock: login que requiere MFA. */
export async function mockLoginMfaRequired(page: Page) {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mfa_required: true,
        message: 'MFA requerido',
      }),
    })
  );
}

/** Mock: verificación MFA exitosa. */
export async function mockMfaVerifySuccess(page: Page) {
  await page.route('**/api/v1/auth/mfa/verify', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-mfa-token-456',
        token_type: 'bearer',
        mfa_required: false,
      }),
    })
  );
}

/** Mock: credenciales incorrectas. */
export async function mockLoginFailure(page: Page) {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Credenciales incorrectas' }),
    })
  );
}

/** Mock: usuario autenticado (/users/me). */
export async function mockCurrentUser(page: Page, overrides = {}) {
  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...MOCK_USER, ...overrides }),
    })
  );
}

/** Mock: usuario no autenticado (401). */
export async function mockUnauthenticated(page: Page) {
  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'No autenticado' }),
    })
  );
}

/** Mock: dashboard summary (bloquea request pero responde OK). */
export async function mockDashboardData(page: Page) {
  await page.route('**/api/v1/summary**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ projects: 0, tasks: 0, tickets: 0 }),
    })
  );
  await page.route('**/api/v1/notifications**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  );
}

/** Mock: tenant branding (evita 404 en consola). */
export async function mockBranding(page: Page) {
  await page.route('**/api/v1/tenants/*/branding**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ logo_url: null, primary_color: null }),
    })
  );
}

/** Navega a la app (hash routing). */
export async function gotoApp(page: Page, path = '/') {
  await page.goto(`/#${path}`);
}

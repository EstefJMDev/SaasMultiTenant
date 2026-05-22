import { test, expect } from '@playwright/test';
import {
  gotoApp,
  mockLoginSuccess,
  mockLoginMfaRequired,
  mockLoginFailure,
  mockMfaVerifySuccess,
  mockCurrentUser,
  mockUnauthenticated,
  mockDashboardData,
  mockBranding,
} from './helpers/api.mock';

// ---------------------------------------------------------------------------
// Login flow
// ---------------------------------------------------------------------------

test.describe('Login', () => {
  test('muestra formulario de login al entrar', async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByRole('heading', { name: /iniciar sesión|login/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /entrar|iniciar|login/i })).toBeVisible();
  });

  test('login exitoso redirige al dashboard', async ({ page }) => {
    await mockLoginSuccess(page);
    await mockCurrentUser(page);
    await mockDashboardData(page);
    await mockBranding(page);

    await gotoApp(page);
    await page.getByRole('textbox', { name: /email/i }).fill('admin@test.com');
    await page.getByLabel(/contraseña|password/i).fill('password123');
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();

    await expect(page).toHaveURL(/#\/dashboard/);
  });

  test('credenciales incorrectas muestra error', async ({ page }) => {
    await mockLoginFailure(page);

    await gotoApp(page);
    await page.getByRole('textbox', { name: /email/i }).fill('mal@test.com');
    await page.getByLabel(/contraseña|password/i).fill('wrong');
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();

    // Toast de error o mensaje en pantalla
    await expect(
      page.getByText(/credenciales|error|incorrecto/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test('campos vacíos no envían el formulario', async ({ page }) => {
    await gotoApp(page);
    const btn = page.getByRole('button', { name: /entrar|iniciar|login/i });

    // Botón deshabilitado o el formulario no dispara request
    const requestFired = page.waitForRequest('**/auth/login', { timeout: 2000 }).catch(() => null);
    await btn.click();
    expect(await requestFired).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MFA flow
// ---------------------------------------------------------------------------

test.describe('MFA', () => {
  test('login con MFA redirige a /mfa', async ({ page }) => {
    await mockLoginMfaRequired(page);

    await gotoApp(page);
    await page.getByRole('textbox', { name: /email/i }).fill('admin@test.com');
    await page.getByLabel(/contraseña|password/i).fill('password123');
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();

    await expect(page).toHaveURL(/#\/mfa/);
  });

  test('código MFA correcto redirige al dashboard', async ({ page }) => {
    await mockLoginMfaRequired(page);
    await mockMfaVerifySuccess(page);
    await mockCurrentUser(page);
    await mockDashboardData(page);
    await mockBranding(page);

    await gotoApp(page);
    await page.getByRole('textbox', { name: /email/i }).fill('admin@test.com');
    await page.getByLabel(/contraseña|password/i).fill('password123');
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();

    await expect(page).toHaveURL(/#\/mfa/);

    // Introduce código MFA
    await page.getByRole('textbox').fill('123456');
    await page.getByRole('button', { name: /verificar|confirmar|verify/i }).click();

    await expect(page).toHaveURL(/#\/dashboard/);
  });
});

// ---------------------------------------------------------------------------
// Protección de rutas
// ---------------------------------------------------------------------------

test.describe('Rutas protegidas', () => {
  test('acceso sin autenticar redirige a login', async ({ page }) => {
    await mockUnauthenticated(page);
    await gotoApp(page, '/dashboard');

    await expect(page).toHaveURL(/\/#\//);
    await expect(page.getByRole('heading', { name: /iniciar sesión|login/i })).toBeVisible();
  });

  test('dashboard accesible con sesión válida', async ({ page }) => {
    await mockCurrentUser(page);
    await mockDashboardData(page);
    await mockBranding(page);

    // Simula token en storage para saltar login
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'mock-token-123');
      localStorage.setItem('tenant_id', '1');
    });

    await gotoApp(page, '/dashboard');
    await expect(page).toHaveURL(/#\/dashboard/);
  });
});

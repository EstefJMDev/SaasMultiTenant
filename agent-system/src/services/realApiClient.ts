// Real API Client - calls FastAPI backend over HTTP
// Replaces mockApiClient for production use

import { ToolResult } from '../types/index';
import { logger } from '../utils/logger';
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:8000';
const FASTAPI_API_KEY = process.env.FASTAPI_API_KEY || '';
const BACKEND_JWT_SECRET =
  process.env.BACKEND_JWT_SECRET ||
  process.env.SECRET_KEY_JWT ||
  process.env.SECRET_KEY ||
  'changeme-super-secret-key';
const FALLBACK_AUTH_USER_ID = process.env.FASTAPI_AUTH_USER_ID || '1';
const FALLBACK_AUTH_TTL_SECONDS =
  Number(process.env.FASTAPI_AUTH_TTL_SECONDS) || 3600;
const REQUEST_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS) || 15_000;
const MAX_RETRIES = Number(process.env.API_MAX_RETRIES) || 3;
const RETRY_BASE_DELAY_MS = 500;
const LOG_API_REQUESTS = process.env.LOG_API_REQUESTS === 'true';
const DEBUG_API_CALLS = process.env.DEBUG_API_CALLS === 'true';

export interface ApiAuthContext {
  authorizationHeader?: string;
  cookieHeader?: string;
}

const apiAuthContextStorage = new AsyncLocalStorage<ApiAuthContext | null>();

export function runWithApiAuthContext<T>(
  authContext: ApiAuthContext | null | undefined,
  operation: () => Promise<T>
): Promise<T> {
  return apiAuthContextStorage.run(authContext ?? null, operation);
}

function getActiveApiAuthContext(): ApiAuthContext | null {
  return apiAuthContextStorage.getStore() ?? null;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createHs256Jwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(unsignedToken)
    .digest();
  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

function buildFallbackAuthorizationHeader(): string | null {
  const secret = BACKEND_JWT_SECRET.trim();
  if (!secret) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const token = createHs256Jwt(
    {
      sub: FALLBACK_AUTH_USER_ID,
      iat: nowSeconds,
      exp: nowSeconds + FALLBACK_AUTH_TTL_SECONDS,
      typ: 'access',
    },
    secret
  );
  return `Bearer ${token}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  tenantId: string;
  query?: Record<string, string>;
  body?: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build full URL with query params. */
function buildUrl(path: string, query?: Record<string, string>): string {
  const base = FASTAPI_BASE_URL.replace(/\/+$/, '');
  const url = new URL(`${base}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
}

/** Sleep utility for retry back-off. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Determine whether an HTTP status code is retryable. */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Determine whether an error is a transient network error. */
function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout') ||
      msg.includes('socket hang up') ||
      msg.includes('network') ||
      msg.includes('abort')
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// Core request function with retry + timeout
// ---------------------------------------------------------------------------

async function apiRequest(options: RequestOptions): Promise<ToolResult> {
  const { method, path, tenantId, query, body } = options;
  const url = buildUrl(path, query);
  const authContext = getActiveApiAuthContext();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Tenant-Id': tenantId,
  };

  const forwardedAuthorization = authContext?.authorizationHeader?.trim();
  if (forwardedAuthorization) {
    headers['Authorization'] = forwardedAuthorization;
  } else {
    const fallbackAuthorization = buildFallbackAuthorizationHeader();
    if (fallbackAuthorization) {
      headers['Authorization'] = fallbackAuthorization;
    } else if (FASTAPI_API_KEY) {
      headers['Authorization'] = `Bearer ${FASTAPI_API_KEY}`;
    }
  }

  const forwardedCookie = authContext?.cookieHeader?.trim();
  if (forwardedCookie) {
    headers['Cookie'] = forwardedCookie;
  }

  if (LOG_API_REQUESTS) {
    logger.info(`[RealApiClient] ${method} ${url}`, {
      tenantId,
      hasBody: body !== undefined,
    });
  }

  if (DEBUG_API_CALLS && body) {
    logger.debug(`[RealApiClient] Request body:`, body);
  }

  let lastError: string = 'Unknown error';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
        fetchOptions.body = JSON.stringify(body);
      }

      const startTime = Date.now();
      const response = await fetch(url, fetchOptions);
      const elapsed = Date.now() - startTime;

      if (LOG_API_REQUESTS) {
        logger.info(
          `[RealApiClient] ${method} ${path} -> ${response.status} (${elapsed}ms)`
        );
      }

      // Parse response body
      let responseData: unknown;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        const text = await response.text();
        responseData = text || null;
      }

      if (DEBUG_API_CALLS) {
        logger.debug(`[RealApiClient] Response:`, responseData);
      }

      // Successful response
      if (response.ok) {
        return { success: true, data: responseData };
      }

      // Retryable server errors
      if (isRetryable(response.status) && attempt < MAX_RETRIES) {
        const retryAfter = response.headers.get('retry-after');
        const delayMs = retryAfter
          ? Number(retryAfter) * 1000
          : RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);

        logger.warn(
          `[RealApiClient] Retryable status ${response.status} on attempt ${attempt}/${MAX_RETRIES}. Retrying in ${delayMs}ms...`
        );
        await sleep(delayMs);
        continue;
      }

      // Non-retryable error
      const errorDetail =
        typeof responseData === 'object' && responseData !== null
          ? (responseData as Record<string, unknown>).detail ||
            (responseData as Record<string, unknown>).message ||
            JSON.stringify(responseData)
          : String(responseData);

      lastError = `HTTP ${response.status}: ${errorDetail}`;
      logger.error(`[RealApiClient] ${lastError}`);
      return { success: false, error: lastError };
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === 'AbortError') {
        lastError = `Request timeout after ${REQUEST_TIMEOUT_MS}ms: ${method} ${path}`;
      } else {
        lastError = err instanceof Error ? err.message : String(err);
      }

      if (isTransientError(err) && attempt < MAX_RETRIES) {
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(
          `[RealApiClient] Transient error on attempt ${attempt}/${MAX_RETRIES}: ${lastError}. Retrying in ${delayMs}ms...`
        );
        await sleep(delayMs);
        continue;
      }

      logger.error(`[RealApiClient] Request failed: ${lastError}`);
      return { success: false, error: lastError };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // No fallback - return error if backend is truly unavailable
  logger.error(`[RealApiClient] All retries exhausted for ${method} ${path}: ${lastError}`);
  return { success: false, error: lastError };
}

// ---------------------------------------------------------------------------
// Demo Data Fallback
// ---------------------------------------------------------------------------

function getDemoDataForPath(
  path: string,
  _method: string
): ToolResult {
  // Users endpoints
  if (path.includes('/org/users')) {
    if (path.includes('active_since')) {
      return {
        success: true,
        data: {
          users: [
            { id: 'user-1', email: 'john@example.com', name: 'John Doe', active_at: new Date().toISOString() },
            { id: 'user-2', email: 'jane@example.com', name: 'Jane Smith', active_at: new Date(Date.now() - 3600000).toISOString() },
            { id: 'user-3', email: 'admin@example.com', name: 'Admin User', active_at: new Date(Date.now() - 7200000).toISOString() },
          ],
          total: 3,
          _note: '[DEMO DATA] Backend unavailable - showing sample data',
        },
      };
    }
    return {
      success: true,
      data: {
        users: [
          { id: 'user-1', email: 'john@example.com', name: 'John Doe', role: 'admin' },
          { id: 'user-2', email: 'jane@example.com', name: 'Jane Smith', role: 'manager' },
          { id: 'user-3', email: 'bob@example.com', name: 'Bob Wilson', role: 'user' },
        ],
        total: 3,
        _note: '[DEMO DATA] Backend unavailable - showing sample data',
      },
    };
  }

  // Documents endpoints
  if (path.includes('/documents')) {
    return {
      success: true,
      data: {
        documents: [
          { id: 'doc-1', title: 'Q1 Budget Report', type: 'report', created_at: new Date(Date.now() - 86400000).toISOString() },
          { id: 'doc-2', title: 'Service Contract 2025', type: 'contract', created_at: new Date(Date.now() - 172800000).toISOString() },
          { id: 'doc-3', title: 'Invoice #12345', type: 'invoice', created_at: new Date(Date.now() - 259200000).toISOString() },
        ],
        total: 3,
        _note: '[DEMO DATA] Backend unavailable - showing sample data',
      },
    };
  }

  // Budget endpoints
  if (path.includes('/budget')) {
    return {
      success: true,
      data: {
        id: 'budget-1',
        name: 'Annual Budget 2025',
        total_amount: 500000,
        spent_amount: 145000,
        remaining: 355000,
        currency: 'EUR',
        categories: [
          { name: 'Operations', budgeted: 200000, spent: 75000 },
          { name: 'Marketing', budgeted: 150000, spent: 45000 },
          { name: 'R&D', budgeted: 150000, spent: 25000 },
        ],
        _note: '[DEMO DATA] Backend unavailable - showing sample data',
      },
    };
  }

  // Invoices endpoints
  if (path.includes('/invoice')) {
    return {
      success: true,
      data: {
        invoices: [
          { id: 'inv-001', amount: 5000, status: 'paid', date: new Date(Date.now() - 864000000).toISOString() },
          { id: 'inv-002', amount: 3200, status: 'pending', date: new Date(Date.now() - 604800000).toISOString() },
          { id: 'inv-003', amount: 7500, status: 'overdue', date: new Date(Date.now() - 1209600000).toISOString() },
        ],
        total_amount: 15700,
        _note: '[DEMO DATA] Backend unavailable - showing sample data',
      },
    };
  }

  // Default fallback
  return {
    success: true,
    data: {
      message: 'Demo data available',
      endpoint: path,
      _note: '[DEMO DATA] Backend unavailable - showing generic sample data',
    },
  };
}

// ---------------------------------------------------------------------------
// Tenant isolation validation
// ---------------------------------------------------------------------------

function validateTenantId(tenantId: string): void {
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
    throw new Error('tenantId is required and must be a non-empty string');
  }
}

// ---------------------------------------------------------------------------
// RealApiClient class
// ---------------------------------------------------------------------------

class RealApiClient {
  // ---- Document / Contract operations ----

  async listDocuments(tenantId: string): Promise<ToolResult> {
    validateTenantId(tenantId);
    return apiRequest({
      method: 'GET',
      path: '/api/v1/contracts',
      tenantId,
      query: { tenant_id: tenantId },
    });
  }

  async readDocument(tenantId: string, contractId: string): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!contractId) {
      return { success: false, error: 'contractId is required' };
    }
    return apiRequest({
      method: 'GET',
      path: `/api/v1/contracts/${encodeURIComponent(contractId)}`,
      tenantId,
    });
  }

  async createContractFromTemplate(
    tenantId: string,
    templateId: string,
    variables: Record<string, string>,
    createdBy: string
  ): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!templateId) {
      return { success: false, error: 'templateId is required' };
    }
    return apiRequest({
      method: 'POST',
      path: '/api/v1/contracts',
      tenantId,
      body: {
        tenant_id: tenantId,
        template_id: templateId,
        variables,
        created_by: createdBy,
      },
    });
  }

  // ---- User / Organization operations ----

  async listActiveUsers(tenantId: string, hoursBack = 24): Promise<ToolResult> {
    validateTenantId(tenantId);
    const activeSince = new Date(Date.now() - hoursBack * 3600_000).toISOString();
    return apiRequest({
      method: 'GET',
      path: '/api/v1/org/users',
      tenantId,
      query: {
        tenant_id: tenantId,
        active_since: activeSince,
      },
    });
  }

  async getUserActivity(tenantId: string, userId: string): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!userId) {
      return { success: false, error: 'userId is required' };
    }
    return apiRequest({
      method: 'GET',
      path: `/api/v1/org/users/${encodeURIComponent(userId)}`,
      tenantId,
      query: { tenant_id: tenantId },
    });
  }

  async getUserById(tenantId: string, userId: string): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!userId) {
      return { success: false, error: 'userId is required' };
    }
    return apiRequest({
      method: 'GET',
      path: `/api/v1/org/users/${encodeURIComponent(userId)}`,
      tenantId,
      query: { tenant_id: tenantId },
    });
  }

  // ---- Finance / Procurement operations ----

  async getBudget(tenantId: string, budgetId: string): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!budgetId) {
      return { success: false, error: 'budgetId is required' };
    }
    return apiRequest({
      method: 'GET',
      path: `/api/v1/procurement/budgets/${encodeURIComponent(budgetId)}`,
      tenantId,
      query: { tenant_id: tenantId },
    });
  }

  async patchBudgetLine(
    tenantId: string,
    budgetId: string,
    updates: Record<string, unknown>
  ): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!budgetId) {
      return { success: false, error: 'budgetId is required' };
    }
    return apiRequest({
      method: 'PATCH',
      path: `/api/v1/procurement/budgets/${encodeURIComponent(budgetId)}`,
      tenantId,
      body: {
        tenant_id: tenantId,
        ...updates,
      },
    });
  }

  async listInvoices(tenantId: string): Promise<ToolResult> {
    validateTenantId(tenantId);
    return apiRequest({
      method: 'GET',
      path: '/api/v1/invoices',
      tenantId,
      query: { tenant_id: tenantId },
    });
  }

  async getInvoice(tenantId: string, invoiceId: string): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!invoiceId) {
      return { success: false, error: 'invoiceId is required' };
    }
    return apiRequest({
      method: 'GET',
      path: `/api/v1/invoices/${encodeURIComponent(invoiceId)}`,
      tenantId,
    });
  }

  async reprocessInvoiceOcr(tenantId: string, invoiceId: string): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!invoiceId) {
      return { success: false, error: 'invoiceId is required' };
    }
    return apiRequest({
      method: 'POST',
      path: `/api/v1/invoices/${encodeURIComponent(invoiceId)}/reprocess`,
      tenantId,
    });
  }

  // ---- Analytics / Report operations ----

  async queryReport(
    tenantId: string,
    reportType: string,
    filters: Record<string, unknown>
  ): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!reportType) {
      return { success: false, error: 'reportType is required' };
    }
    return apiRequest({
      method: 'GET',
      path: '/api/v1/analytics/reports',
      tenantId,
      query: {
        type: reportType,
        tenant_id: tenantId,
        filters: JSON.stringify(filters),
      },
    });
  }

  // ---- AI operations ----

  async summarizeDocument(tenantId: string, documentId: string): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!documentId) {
      return { success: false, error: 'documentId is required' };
    }
    return apiRequest({
      method: 'POST',
      path: '/api/v1/ai/summarize',
      tenantId,
      body: {
        document_id: documentId,
        tenant_id: tenantId,
      },
    });
  }

  // ---- Bulk import operations ----

  async bulkImportData(
    tenantId: string,
    table: string,
    data: Record<string, unknown>[],
    userId: string
  ): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!table) {
      return { success: false, error: 'table is required' };
    }
    if (!Array.isArray(data) || data.length === 0) {
      return { success: false, error: 'data array cannot be empty' };
    }
    return apiRequest({
      method: 'POST',
      path: '/api/v1/imports/bulk',
      tenantId,
      body: {
        table,
        data,
        tenant_id: tenantId,
        created_by: userId,
      },
    });
  }

  // ---- Project operations ----

  async createProject(
    tenantId: string,
    data: Record<string, unknown>
  ): Promise<ToolResult> {
    validateTenantId(tenantId);
    // Strip department_id — the LLM often hallucinates an invalid ID which causes a 500
    const { department_id: _ignored, ...safeData } = data;
    return apiRequest({
      method: 'POST',
      path: '/api/v1/projects',
      tenantId,
      body: { ...safeData, tenant_id: tenantId },
    });
  }

  async listProjects(
    tenantId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ToolResult> {
    validateTenantId(tenantId);
    return apiRequest({
      method: 'GET',
      path: '/api/v1/projects',
      tenantId,
      query: { limit: String(limit), offset: String(offset) },
    });
  }

  async updateProject(
    tenantId: string,
    projectId: string,
    data: Record<string, unknown>
  ): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!projectId) return { success: false, error: 'projectId is required' };
    return apiRequest({
      method: 'PATCH',
      path: `/api/v1/projects/${projectId}`,
      tenantId,
      body: { ...data, tenant_id: tenantId },
    });
  }

  async deleteProject(tenantId: string, projectId: string): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!projectId) return { success: false, error: 'projectId is required' };
    return apiRequest({
      method: 'DELETE',
      path: `/api/v1/projects/${projectId}`,
      tenantId,
    });
  }

  // ---- Task operations ----

  async createTask(tenantId: string, data: Record<string, unknown>): Promise<ToolResult> {
    validateTenantId(tenantId);
    return apiRequest({
      method: 'POST',
      path: '/api/v1/work/tasks',
      tenantId,
      body: { ...data, tenant_id: tenantId },
    });
  }

  async updateTask(
    tenantId: string,
    taskId: string,
    data: Record<string, unknown>
  ): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!taskId) return { success: false, error: 'taskId is required' };
    return apiRequest({
      method: 'PATCH',
      path: `/api/v1/work/tasks/${taskId}`,
      tenantId,
      body: { ...data, tenant_id: tenantId },
    });
  }

  async listTasks(tenantId: string, projectId?: string): Promise<ToolResult> {
    validateTenantId(tenantId);
    const query: Record<string, string> = {};
    if (projectId) query.project_id = projectId;
    return apiRequest({
      method: 'GET',
      path: '/api/v1/work/tasks',
      tenantId,
      query: Object.keys(query).length > 0 ? query : undefined,
    });
  }

  // ---- Activity operations ----

  async createActivity(tenantId: string, data: Record<string, unknown>): Promise<ToolResult> {
    validateTenantId(tenantId);
    return apiRequest({
      method: 'POST',
      path: '/api/v1/work/activities',
      tenantId,
      body: { ...data, tenant_id: tenantId },
    });
  }

  // ---- Milestone operations ----

  async createMilestone(tenantId: string, data: Record<string, unknown>): Promise<ToolResult> {
    validateTenantId(tenantId);
    return apiRequest({
      method: 'POST',
      path: '/api/v1/work/milestones',
      tenantId,
      body: { ...data, tenant_id: tenantId },
    });
  }

  // ---- Budget operations ----

  async createBudgetLine(
    tenantId: string,
    projectId: string,
    data: Record<string, unknown>
  ): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!projectId) return { success: false, error: 'projectId is required' };
    return apiRequest({
      method: 'POST',
      path: `/api/v1/projects/${projectId}/budgets`,
      tenantId,
      body: { ...data, tenant_id: tenantId },
    });
  }

  async updateBudgetLine(
    tenantId: string,
    projectId: string,
    budgetId: string,
    data: Record<string, unknown>
  ): Promise<ToolResult> {
    validateTenantId(tenantId);
    if (!projectId) return { success: false, error: 'projectId is required' };
    if (!budgetId) return { success: false, error: 'budgetId is required' };
    return apiRequest({
      method: 'PATCH',
      path: `/api/v1/projects/${projectId}/budgets/${budgetId}`,
      tenantId,
      body: { ...data, tenant_id: tenantId },
    });
  }

  // ---- Employee allocation ----

  async createEmployee(
    tenantId: string,
    data: Record<string, unknown>
  ): Promise<ToolResult> {
    validateTenantId(tenantId);
    return apiRequest({
      method: 'POST',
      path: '/api/v1/people',
      tenantId,
      body: { ...data, tenant_id: tenantId },
    });
  }

  async listEmployees(
    tenantId: string,
    year?: number
  ): Promise<ToolResult> {
    validateTenantId(tenantId);
    const query: Record<string, string> = {};
    if (typeof year === 'number' && Number.isFinite(year)) {
      query.year = String(year);
    }
    return apiRequest({
      method: 'GET',
      path: '/api/v1/people',
      tenantId,
      query: Object.keys(query).length > 0 ? query : undefined,
    });
  }

  async allocateEmployee(
    tenantId: string,
    data: Record<string, unknown>
  ): Promise<ToolResult> {
    validateTenantId(tenantId);
    return apiRequest({
      method: 'POST',
      path: '/api/v1/people/allocations',
      tenantId,
      body: { ...data, tenant_id: tenantId },
    });
  }

  // ---- External collaboration ----

  async createExternalCollaboration(
    tenantId: string,
    data: Record<string, unknown>
  ): Promise<ToolResult> {
    validateTenantId(tenantId);
    return apiRequest({
      method: 'POST',
      path: '/api/v1/erp/external-collaborations',
      tenantId,
      body: { ...data, tenant_id: tenantId },
    });
  }
}

// Export singleton instance
export const realApiClient = new RealApiClient();

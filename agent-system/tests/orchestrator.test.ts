// Basic tests for orchestrator
// To run: npm test

import { classifyIntent } from '../src/agents/agentRouter';
import { confirmationService } from '../src/services/confirmationService';
import { auditLogService } from '../src/services/auditLogService';

describe('Agent Router', () => {
  test('classifyIntent: should identify documents agent', () => {
    const intents = [
      'Show me our contracts',
      'Muestra los contratos',
      'Create a new contract',
      'Crear un contrato nuevo',
      'What documents do we have?',
      '¿Qué documentos tenemos?',
      'Read the service agreement',
    ];

    intents.forEach((intent) => {
      const agent = classifyIntent(intent);
      expect(agent).toBe('documents');
    });
  });

  test('classifyIntent: should identify users agent', () => {
    const intents = [
      'Who is active right now?',
      '¿Quién está activo ahora?',
      'Show me active users',
      'Muestra los usuarios activos',
      'What users logged in today?',
      '¿Qué usuarios iniciaron sesión hoy?',
      'Get team activity',
      'Ver actividad del equipo',
    ];

    intents.forEach((intent) => {
      const agent = classifyIntent(intent);
      expect(agent).toBe('users');
    });
  });

  test('classifyIntent: should identify finance agent', () => {
    const intents = [
      'What is our budget status?',
      '¿Cuál es el estado del presupuesto?',
      'Update the Q1 budget',
      'Actualiza el presupuesto del Q1',
      'Show me all invoices',
      'Muestra todas las facturas',
      'How much have we spent?',
      '¿Cuánto hemos gastado?',
    ];

    intents.forEach((intent) => {
      const agent = classifyIntent(intent);
      expect(agent).toBe('finance');
    });
  });

  test('classifyIntent: should identify analysis agent', () => {
    const intents = [
      'Generate a report',
      'Genera un informe',
      'Summarize this data',
      'Resume estos datos',
      'What are our metrics?',
      '¿Cuáles son nuestras métricas?',
      'Analyze our spending',
      'Analiza estos datos',
    ];

    intents.forEach((intent) => {
      const agent = classifyIntent(intent);
      expect(agent).toBe('analysis');
    });
  });
});

describe('Confirmation Service', () => {
  beforeEach(() => {
    confirmationService.clearAll();
  });

  test('should create confirmation with expiry', () => {
    const action = {
      agentType: 'documents' as const,
      toolName: 'create_contract_from_template',
      inputParams: { templateId: 'test' },
      requiresConfirmation: true,
      description: 'Create test contract',
    };

    const confirmation = confirmationService.createConfirmation(
      'user1',
      'tenant1',
      'session1',
      action,
      5
    );

    expect(confirmation.id).toBeDefined();
    expect(confirmation.userId).toBe('user1');
    expect(confirmation.tenantId).toBe('tenant1');
    expect(confirmation.confirmed).toBe(false);
    expect(confirmation.expiresAt).toBeInstanceOf(Date);
  });

  test('should confirm a pending action', () => {
    const action = {
      agentType: 'finance' as const,
      toolName: 'patch_budget_line',
      inputParams: { budgetId: 'b1' },
      requiresConfirmation: true,
      description: 'Update budget',
    };

    const confirmation = confirmationService.createConfirmation(
      'user1',
      'tenant1',
      'session1',
      action
    );

    const confirmed = confirmationService.confirm(confirmation.id, 'user1');

    expect(confirmed).toBe(true);

    const retrieved = confirmationService.getConfirmation(confirmation.id);
    expect(retrieved?.confirmed).toBe(true);
    expect(retrieved?.confirmedBy).toBe('user1');
    expect(retrieved?.confirmedAt).toBeInstanceOf(Date);
  });

  test('should reject confirmation', () => {
    const action = {
      agentType: 'documents' as const,
      toolName: 'create_contract_from_template',
      inputParams: {},
      requiresConfirmation: true,
      description: 'Test',
    };

    const confirmation = confirmationService.createConfirmation(
      'user1',
      'tenant1',
      'session1',
      action
    );

    const rejected = confirmationService.reject(confirmation.id);
    expect(rejected).toBe(true);

    const retrieved = confirmationService.getConfirmation(confirmation.id);
    expect(retrieved).toBeNull();
  });

  test('should not confirm expired confirmation', () => {
    // Create with 0 minute expiry (expired immediately)
    const action = {
      agentType: 'documents' as const,
      toolName: 'create_contract_from_template',
      inputParams: {},
      requiresConfirmation: true,
      description: 'Test',
    };

    const confirmation = confirmationService.createConfirmation(
      'user1',
      'tenant1',
      'session1',
      action,
      -1 // Already expired
    );

    const confirmed = confirmationService.confirm(confirmation.id, 'user1');
    expect(confirmed).toBe(false);
  });

  test('should get pending confirmations by session', () => {
    const action = {
      agentType: 'documents' as const,
      toolName: 'create_contract_from_template',
      inputParams: {},
      requiresConfirmation: true,
      description: 'Test',
    };

    confirmationService.createConfirmation('user1', 'tenant1', 'session1', action);
    confirmationService.createConfirmation('user1', 'tenant1', 'session1', action);
    confirmationService.createConfirmation('user1', 'tenant1', 'session2', action);

    const pending = confirmationService.getPendingBySession('session1');
    expect(pending.length).toBe(2);

    const pending2 = confirmationService.getPendingBySession('session2');
    expect(pending2.length).toBe(1);
  });
});

describe('Audit Log Service', () => {
  beforeEach(() => {
    auditLogService.clearAll();
  });

  test('should log agent action', () => {
    const log = auditLogService.logAction(
      'user1',
      'tenant1',
      'session1',
      'documents',
      'list_documents',
      {},
      { documents: [] },
      false
    );

    expect(log.id).toBeDefined();
    expect(log.userId).toBe('user1');
    expect(log.agentType).toBe('documents');
    expect(log.toolName).toBe('list_documents');
  });

  test('should get logs by tenant', () => {
    auditLogService.logAction('user1', 'tenant1', 's1', 'documents', 'list', {}, {}, false);
    auditLogService.logAction('user1', 'tenant1', 's1', 'users', 'list_active', {}, {}, false);
    auditLogService.logAction('user2', 'tenant2', 's2', 'finance', 'get_budget', {}, {}, false);

    const logs = auditLogService.getByTenant('tenant1');
    expect(logs.length).toBe(2);
    expect(logs.every((l) => l.tenantId === 'tenant1')).toBe(true);
  });

  test('should get confirmed actions', () => {
    auditLogService.logAction('user1', 'tenant1', 's1', 'documents', 'create', {}, {}, false);
    auditLogService.logAction('user1', 'tenant1', 's1', 'finance', 'patch', {}, {}, true, 'user1', new Date());
    auditLogService.logAction('user1', 'tenant1', 's1', 'users', 'list', {}, {}, true); // Not confirmed

    const confirmed = auditLogService.getConfirmedActions('tenant1');
    expect(confirmed.length).toBe(1);
    expect(confirmed[0].toolName).toBe('patch');
  });

  test('should get logs by agent type', () => {
    auditLogService.logAction('user1', 'tenant1', 's1', 'documents', 'list', {}, {}, false);
    auditLogService.logAction('user1', 'tenant1', 's1', 'documents', 'create', {}, {}, false);
    auditLogService.logAction('user1', 'tenant1', 's1', 'users', 'list', {}, {}, false);

    const docLogs = auditLogService.getByAgentType('tenant1', 'documents');
    expect(docLogs.length).toBe(2);
    expect(docLogs.every((l) => l.agentType === 'documents')).toBe(true);
  });
});

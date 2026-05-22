import { classifyIntent, getAgentSystemPrompt } from '../src/agents/agentRouter';
import type { AgentType } from '../src/types/index';

const ALL_AGENT_TYPES: AgentType[] = [
  'documents', 'users', 'finance', 'analysis', 'projects', 'tasks', 'resources',
];

// ---------------------------------------------------------------------------
// classifyIntent — cobertura de los 7 agentes en ES + EN
// ---------------------------------------------------------------------------

describe('classifyIntent — projects agent', () => {
  test.each([
    'Show me the projects',
    'Ver proyectos',
    'Crea un nuevo proyecto',
    'Create a new project',
    'Muestra los hitos del proyecto',
    'List project milestones',
    'Qué entregables tiene el proyecto?',
  ])('classifies "%s" as projects', (msg) => {
    expect(classifyIntent(msg)).toBe('projects');
  });
});

describe('classifyIntent — tasks agent', () => {
  test.each([
    'Muestra mis tareas pendientes',
    'Show pending tasks',
    'Crear una tarea nueva',
    'Create a task',
    'Asignar tarea al equipo',
    'Qué tareas hay por completar?',
  ])('classifies "%s" as tasks', (msg) => {
    expect(classifyIntent(msg)).toBe('tasks');
  });
});

describe('classifyIntent — resources agent', () => {
  test.each([
    'Lista los empleados',
    'List employees',
    'Dar de alta un empleado',
    'Hire a new employee',
    'Ver departamentos',
    'Muestra los proveedores',
    'Show suppliers',
    'Información de RRHH',
    'Gestión de personal',
  ])('classifies "%s" as resources', (msg) => {
    expect(classifyIntent(msg)).toBe('resources');
  });
});

// ---------------------------------------------------------------------------
// classifyIntent — comportamientos de borde
// ---------------------------------------------------------------------------

describe('classifyIntent — edge cases', () => {
  test('empty string returns default agent (analysis)', () => {
    expect(classifyIntent('')).toBe('analysis');
  });

  test('message with no keywords returns analysis as default', () => {
    expect(classifyIntent('hola buenas tardes')).toBe('analysis');
    expect(classifyIntent('hello how are you')).toBe('analysis');
  });

  test('is case-insensitive', () => {
    expect(classifyIntent('CONTRATO')).toBe('documents');
    expect(classifyIntent('PRESUPUESTO')).toBe('finance');
    expect(classifyIntent('PROYECTO')).toBe('projects');
  });

  test('handles accented characters correctly', () => {
    expect(classifyIntent('análisis de datos')).toBe('analysis');
    expect(classifyIntent('creación de presupuésto')).toBe('finance');
    expect(classifyIntent('quién está activo')).toBe('users');
  });

  test('handles special characters and punctuation', () => {
    expect(classifyIntent('¿Cuáles son nuestros contratos?')).toBe('documents');
    expect(classifyIntent('¡Muestra el presupuesto!')).toBe('finance');
  });

  test('handles extra whitespace', () => {
    expect(classifyIntent('  contrato  ')).toBe('documents');
    expect(classifyIntent('presupuesto    factura')).toBe('finance');
  });

  test('message with multiple matching keywords picks highest scoring agent', () => {
    // "factura" + "facturas" + "invoice" all point to finance
    const result = classifyIntent('muestra todas las facturas e invoices del presupuesto');
    expect(result).toBe('finance');
  });

  test('returns a valid AgentType for any input', () => {
    const inputs = [
      '', 'foo', 'bar baz', 'contrato', 'usuario', 'presupuesto',
      'proyecto', 'tarea', 'empleado', 'reporte', '123 456',
    ];
    inputs.forEach((input) => {
      expect(ALL_AGENT_TYPES).toContain(classifyIntent(input));
    });
  });
});

// ---------------------------------------------------------------------------
// getAgentSystemPrompt
// ---------------------------------------------------------------------------

describe('getAgentSystemPrompt', () => {
  test.each(ALL_AGENT_TYPES)('returns a non-empty string for agent "%s"', (agentType) => {
    const prompt = getAgentSystemPrompt(agentType);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('all prompts include the base critical rules', () => {
    ALL_AGENT_TYPES.forEach((agentType) => {
      const prompt = getAgentSystemPrompt(agentType);
      expect(prompt).toContain('REGLAS CRÍTICAS');
      expect(prompt).toContain('aislamiento del tenant');
    });
  });

  test('each agent prompt identifies the agent role', () => {
    const expectedPhrases: Record<AgentType, string> = {
      documents: 'ERES EL AGENTE DE DOCUMENTOS',
      users: 'ERES EL AGENTE DE USUARIOS',
      finance: 'ERES EL AGENTE DE FINANZAS',
      analysis: 'ERES EL AGENTE DE ANÁLISIS',
      projects: 'ERES EL AGENTE DE PROYECTOS',
      tasks: 'ERES EL AGENTE DE TAREAS',
      resources: 'ERES EL AGENTE DE RECURSOS HUMANOS',
    };

    ALL_AGENT_TYPES.forEach((agentType) => {
      const prompt = getAgentSystemPrompt(agentType);
      expect(prompt).toContain(expectedPhrases[agentType]);
    });
  });

  test('all prompts instruct to respond in user language', () => {
    ALL_AGENT_TYPES.forEach((agentType) => {
      const prompt = getAgentSystemPrompt(agentType);
      expect(prompt).toContain('mismo idioma que el usuario');
    });
  });

  test('each agent returns a different prompt', () => {
    const prompts = ALL_AGENT_TYPES.map(getAgentSystemPrompt);
    const unique = new Set(prompts);
    expect(unique.size).toBe(ALL_AGENT_TYPES.length);
  });
});

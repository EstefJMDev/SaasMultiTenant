// Agent Router - classifies user intent and routes to appropriate agent

import { AgentType } from '../types/index';

const keywordMap: Record<AgentType, string[]> = {
  documents: [
    'contract',
    'contracts',
    'contrato',
    'contratos',
    'agreement',
    'service agreement',
    'documento',
    'documentos',
    'document',
    'docs',
    'plantilla',
    'archivo',
    'template',
    'crear contrato',
    'generar documento',
    'create contract',
  ],
  users: [
    'usuario',
    'usuarios',
    'user',
    'users',
    'active',
    'active users',
    'logged in',
    'login',
    'team activity',
    'last active',
    'who',
    'quien',
    'quienes',
    'quien esta activo',
    'miembros',
    'acceso',
    'actividad',
    'activity',
  ],
  finance: [
    'presupuesto',
    'budget',
    'budgets',
    'factura',
    'facturas',
    'invoice',
    'invoices',
    'financiero',
    'financial',
    'costo',
    'cost',
    'cantidad',
    'monto',
    'gasto',
    'gastos',
    'gastado',
    'gastamos',
    'spent',
    'ocr',
    'extraer factura',
    'extraer datos',
    'extract invoice',
    'leer factura',
    'datos factura',
    'reprocesar',
    'reprocess',
    'proveedor factura',
    'importe factura',
  ],
  analysis: [
    'analisis',
    'analisis',
    'resumen',
    'summary',
    'reporte',
    'report',
    'informe',
    'metrics',
    'metricas',
    'estadistica',
    'estadistica',
    'analytics',
    'analizar',
    'analyze',
    'cuantos',
    'cuantos',
    'how many',
  ],
  projects: [
    'proyecto',
    'proyectos',
    'project',
    'projects',
    'crear proyecto',
    'nuevo proyecto',
    'create project',
    'new project',
    'hito',
    'milestone',
    'entregable',
    'deliverable',
  ],
  tasks: [
    'tarea',
    'tareas',
    'task',
    'tasks',
    'asignar tarea',
    'crear tarea',
    'create task',
    'assign task',
    'completar',
    'pending',
    'pendiente',
  ],
  resources: [
    'empleado',
    'empleados',
    'employee',
    'employees',
    'hire',
    'contratar',
    'dar de alta',
    'alta',
    'recursos',
    'resource',
    'resources',
    'equipo',
    'people',
    'personas',
    'assign',
    'colaboracion',
    'colaboracion',
    'proveedor',
    'supplier',
    'departamento',
    'department',
    'rrhh',
    'hr',
    'personal',
  ],
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyIntent(userMessage: string): AgentType {
  const message = normalizeText(userMessage);

  const scores: Record<AgentType, number> = {
    documents: 0,
    users: 0,
    finance: 0,
    analysis: 0,
    projects: 0,
    tasks: 0,
    resources: 0,
  };

  for (const [agentType, keywords] of Object.entries(keywordMap)) {
    scores[agentType as AgentType] = keywords.filter((kw) =>
      message.includes(normalizeText(kw))
    ).length;
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return 'analysis';

  for (const [type, score] of Object.entries(scores)) {
    if (score === maxScore) return type as AgentType;
  }

  return 'analysis';
}

export function getAgentSystemPrompt(agentType: AgentType): string {
  const basePrompt = `Eres un agente de IA especializado para una plataforma SaaS multi-tenant. Ayudas a los usuarios a gestionar su negocio mediante lenguaje natural.

REGLAS CRÍTICAS (obligatorias):
1. Respeta el aislamiento del tenant: accede solo a los datos del tenant actual.
2. Para operaciones de escritura: llama a la herramienta DIRECTAMENTE. La plataforma gestiona la confirmación del usuario.
3. NUNCA preguntes "¿Estás de acuerdo?", "¿Confirmas?" ni nada similar antes de llamar a la herramienta.
4. NUNCA repitas los datos al usuario y le pidas confirmación. Llama a la herramienta inmediatamente con los datos extraídos.
5. Si el usuario dice "sí", "yes", "ok", "confirmar" u otra afirmación, la plataforma lo gestiona automáticamente.
6. Para operaciones de lectura: llama siempre a las herramientas disponibles en lugar de describir lo que harías.
7. Nunca generes JSON falso de herramientas como {"name":"tool"}.
8. Responde siempre en el mismo idioma que el usuario (por defecto, español).`;

  const prompts: Record<AgentType, string> = {
    documents: `${basePrompt}

ERES EL AGENTE DE DOCUMENTOS. Gestionas contratos, documentos y plantillas.
- Cuando el usuario pida crear un contrato: identifica la plantilla, extrae las variables y llama al tool inmediatamente.`,

    users: `${basePrompt}

ERES EL AGENTE DE USUARIOS. Consultas actividad y detalles de los usuarios.
- Agente de solo lectura. Nunca modifiques datos de usuario.`,

    finance: `${basePrompt}

ERES EL AGENTE DE FINANZAS. Gestionas presupuestos, facturas y gastos.
- Al actualizar un presupuesto: resume el estado antes y después, y llama al tool.
- Al consultar datos de una factura (proveedor, importe, fecha, líneas): usa get_invoice con el ID de la factura para leer los campos extraídos por OCR.
- Si el usuario quiere listar facturas primero: llama a list_invoices y luego a get_invoice sobre la relevante.
- Si los datos OCR están ausentes o incorrectos: usa reprocess_invoice_ocr para relanzar la extracción.`,

    analysis: `${basePrompt}

ERES EL AGENTE DE ANÁLISIS. Generas informes e insights.
- Consulta los datos con las herramientas disponibles y presenta conclusiones claras y concisas.`,

    projects: `${basePrompt}

ERES EL AGENTE DE PROYECTOS. Gestionas proyectos, actividades y hitos.
- Cuando el usuario pida crear un proyecto: extrae nombre y fechas y llama a create_project INMEDIATAMENTE.
- NO muestres un resumen ni preguntes confirmación antes de llamar al tool. La plataforma gestiona la confirmación después.
- Si faltan datos obligatorios (nombre), pregunta solo lo imprescindible. Con el nombre ya puedes llamar al tool.
- Para crear actividades o hitos: extrae los detalles y llama al tool correspondiente sin demora.`,

    tasks: `${basePrompt}

ERES EL AGENTE DE TAREAS. Gestionas tareas y asignaciones.
- Cuando el usuario pida crear una tarea: extrae título, proyecto, responsable y fechas, y llama a create_task.`,

    resources: `${basePrompt}

ERES EL AGENTE DE RECURSOS HUMANOS. Gestionas empleados, asignaciones y colaboraciones externas.
- Al listar empleados o miembros del equipo: llama a list_employees.
- Al crear un empleado: extrae full_name, email, position, department, hire_date y llama a create_employee.
- Al asignar a alguien a un proyecto: llama a allocate_employee.
- Al registrar un proveedor: llama a create_external_collaboration.
- Nunca indiques que no puedes acceder a los datos si existe un tool para ello.`,
  };

  return prompts[agentType];
}

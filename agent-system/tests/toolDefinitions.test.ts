import {
  toolsByAgent,
  writeOperations,
} from '../src/tools/toolDefinitions';
import type { ClaudeToolDefinition, AgentType } from '../src/types/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidInputSchema(schema: ClaudeToolDefinition['input_schema']): boolean {
  return (
    schema.type === 'object' &&
    typeof schema.properties === 'object' &&
    Array.isArray(schema.required)
  );
}

const ALL_AGENT_TYPES: AgentType[] = [
  'documents', 'users', 'finance', 'analysis', 'projects', 'tasks', 'resources',
];

// ---------------------------------------------------------------------------
// toolsByAgent — estructura y completitud
// ---------------------------------------------------------------------------

describe('toolsByAgent', () => {
  test('defines tools for all agent types', () => {
    ALL_AGENT_TYPES.forEach((agentType) => {
      expect(toolsByAgent).toHaveProperty(agentType);
      expect(Array.isArray(toolsByAgent[agentType])).toBe(true);
    });
  });

  test('each agent has at least one tool', () => {
    ALL_AGENT_TYPES.forEach((agentType) => {
      expect(toolsByAgent[agentType].length).toBeGreaterThan(0);
    });
  });

  test('every tool has a non-empty name', () => {
    ALL_AGENT_TYPES.forEach((agentType) => {
      toolsByAgent[agentType].forEach((tool) => {
        expect(typeof tool.name).toBe('string');
        expect(tool.name.trim().length).toBeGreaterThan(0);
      });
    });
  });

  test('every tool has a non-empty description', () => {
    ALL_AGENT_TYPES.forEach((agentType) => {
      toolsByAgent[agentType].forEach((tool) => {
        expect(typeof tool.description).toBe('string');
        expect(tool.description.trim().length).toBeGreaterThan(0);
      });
    });
  });

  test('every tool has a valid input_schema', () => {
    ALL_AGENT_TYPES.forEach((agentType) => {
      toolsByAgent[agentType].forEach((tool) => {
        expect(isValidInputSchema(tool.input_schema)).toBe(true);
      });
    });
  });

  test('required fields in input_schema are listed in properties', () => {
    ALL_AGENT_TYPES.forEach((agentType) => {
      toolsByAgent[agentType].forEach((tool) => {
        const { properties, required } = tool.input_schema;
        required.forEach((field) => {
          expect(properties).toHaveProperty(field);
        });
      });
    });
  });

  test('tool names are unique within an agent', () => {
    ALL_AGENT_TYPES.forEach((agentType) => {
      const names = toolsByAgent[agentType].map((t) => t.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });
  });

  test('tool names use snake_case (no spaces)', () => {
    ALL_AGENT_TYPES.forEach((agentType) => {
      toolsByAgent[agentType].forEach((tool) => {
        expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Herramientas específicas de alto valor
// ---------------------------------------------------------------------------

describe('create_contract_from_template tool', () => {
  const tool = toolsByAgent['documents'].find(
    (t) => t.name === 'create_contract_from_template'
  );

  test('exists in documents agent', () => {
    expect(tool).toBeDefined();
  });

  test('requires templateId and variables', () => {
    expect(tool!.input_schema.required).toContain('templateId');
    expect(tool!.input_schema.required).toContain('variables');
  });

  test('variables property allows additionalProperties', () => {
    const variables = tool!.input_schema.properties.variables as Record<string, unknown>;
    expect(variables.additionalProperties).toBe(true);
  });

  test('description mentions confirmation requirement', () => {
    expect(tool!.description.toLowerCase()).toContain('confirmation');
  });
});

describe('patch_budget_line tool', () => {
  const tool = toolsByAgent['finance'].find((t) => t.name === 'patch_budget_line');

  test('exists in finance agent', () => {
    expect(tool).toBeDefined();
  });

  test('has a non-empty description', () => {
    expect(tool!.description.trim().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// writeOperations — operaciones de escritura que requieren confirmación
// ---------------------------------------------------------------------------

describe('writeOperations', () => {
  test('is a Set', () => {
    expect(writeOperations).toBeInstanceOf(Set);
  });

  test('contains the core write operations', () => {
    const expected = [
      'create_contract_from_template',
      'patch_budget_line',
      'create_project',
      'create_task',
      'create_employee',
      'allocate_employee',
      'create_external_collaboration',
    ];
    expected.forEach((op) => {
      expect(writeOperations.has(op)).toBe(true);
    });
  });

  test('does not contain read operations', () => {
    const readOps = [
      'list_documents',
      'read_document',
      'list_active_users',
      'get_user_activity',
    ];
    readOps.forEach((op) => {
      expect(writeOperations.has(op)).toBe(false);
    });
  });

  test('all write operations exist as tool names in toolsByAgent', () => {
    const allToolNames = new Set(
      ALL_AGENT_TYPES.flatMap((type) => toolsByAgent[type].map((t) => t.name))
    );
    writeOperations.forEach((op) => {
      expect(allToolNames.has(op)).toBe(true);
    });
  });

  test('has more than zero entries', () => {
    expect(writeOperations.size).toBeGreaterThan(0);
  });
});

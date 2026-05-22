// Tool definitions for Claude API

import { ClaudeToolDefinition, ToolResult } from '../types/index';
import { realApiClient } from '../services/realApiClient';

// ============ DOCUMENTS AGENT TOOLS ============

export const documentsTools: ClaudeToolDefinition[] = [
  {
    name: 'list_documents',
    description:
      'List all documents in the tenant. Returns document metadata including title, type, and dates.',
    input_schema: {
      type: 'object',
      properties: {
        documentType: {
          type: 'string',
          description:
            'Optional filter by document type (contract, invoice, report, other)',
        },
      },
      required: [],
    },
  },
  {
    name: 'read_document',
    description:
      'Read the content and metadata of a specific document by ID.',
    input_schema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The unique ID of the document to read',
        },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'create_contract_from_template',
    description:
      'Create a new contract from a template. Requires explicit user confirmation before execution.',
    input_schema: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description:
            'The template ID to use (e.g., standard_contract, invoice_template)',
        },
        variables: {
          type: 'object',
          description:
            'Variables to fill in the template (e.g., {provider: "Acme Corp", date: "2025-03-26"})',
          properties: {},
          additionalProperties: true,
        },
      },
      required: ['templateId', 'variables'],
    },
  },
];

// ============ USERS AGENT TOOLS ============

export const usersTools: ClaudeToolDefinition[] = [
  {
    name: 'list_active_users',
    description:
      'Get list of users who have been active within a specified time period.',
    input_schema: {
      type: 'object',
      properties: {
        hoursBack: {
          type: 'number',
          description:
            'Number of hours to look back (default: 24). Returns users active in that period.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_user_activity',
    description:
      'Get activity details for a specific user including last active time and status.',
    input_schema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'The ID of the user to query',
        },
      },
      required: ['userId'],
    },
  },
  {
    name: 'get_user_by_id',
    description: 'Get detailed information about a specific user.',
    input_schema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'The ID of the user to retrieve',
        },
      },
      required: ['userId'],
    },
  },
];

// ============ FINANCE AGENT TOOLS ============

export const financeTools: ClaudeToolDefinition[] = [
  {
    name: 'get_invoice',
    description:
      'Get details of a specific invoice including OCR-extracted data (supplier name, tax ID, amounts, dates, line items). Use this to read information extracted from uploaded invoice documents.',
    input_schema: {
      type: 'object',
      properties: {
        invoiceId: {
          type: 'string',
          description: 'The ID of the invoice to retrieve',
        },
      },
      required: ['invoiceId'],
    },
  },
  {
    name: 'reprocess_invoice_ocr',
    description:
      'Trigger OCR reprocessing on an existing invoice. Use this when the extracted data is missing or incorrect. Requires explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        invoiceId: {
          type: 'string',
          description: 'The ID of the invoice to reprocess with OCR',
        },
      },
      required: ['invoiceId'],
    },
  },
  {
    name: 'get_budget',
    description: 'Get budget details including allocated amount and spent amount.',
    input_schema: {
      type: 'object',
      properties: {
        budgetId: {
          type: 'string',
          description: 'The ID of the budget to retrieve',
        },
      },
      required: ['budgetId'],
    },
  },
  {
    name: 'patch_budget_line',
    description:
      'Update a budget line item (amount, status, etc.). Requires explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        budgetId: {
          type: 'string',
          description: 'The ID of the budget to update',
        },
        updates: {
          type: 'object',
          description:
            'Fields to update (e.g., {amount: 60000, status: "approved"})',
          properties: {
            amount: { type: 'number' },
            status: {
              type: 'string',
              enum: ['draft', 'approved', 'exceeded'],
            },
            spent: { type: 'number' },
          },
          additionalProperties: true,
        },
      },
      required: ['budgetId', 'updates'],
    },
  },
  {
    name: 'list_invoices',
    description: 'List all invoices for the tenant.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ============ ANALYSIS AGENT TOOLS ============

export const analysisTools: ClaudeToolDefinition[] = [
  {
    name: 'query_report',
    description:
      'Query a report by type and optional filters. Returns report data.',
    input_schema: {
      type: 'object',
      properties: {
        reportType: {
          type: 'string',
          description:
            'Type of report (e.g., financial_summary, user_activity, budget_overview)',
        },
        filters: {
          type: 'object',
          description: 'Optional filters (e.g., {period: "Q1", department: "HR"})',
          additionalProperties: true,
        },
      },
      required: ['reportType'],
    },
  },
  {
    name: 'summarize_document',
    description: 'Generate a summary of a document.',
    input_schema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document to summarize',
        },
      },
      required: ['documentId'],
    },
  },
];

// ============ DATA IMPORT TOOLS ============

export const importTools: ClaudeToolDefinition[] = [
  {
    name: 'import_data_from_file',
    description:
      'Import data from CSV/Excel files to database tables. Requires explicit user confirmation. Supports: erp_project, erp_task, erp_project_budget_line, erp_external_collaboration, erp_timeentry, user, employee_profile.',
    input_schema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description:
            'Target table name (erp_project, erp_task, erp_project_budget_line, erp_external_collaboration, erp_timeentry, user, employee_profile)',
        },
        data: {
          type: 'array',
          description:
            'Array of row objects where keys match the table columns',
          items: {
            type: 'object',
            additionalProperties: true,
          },
        },
        rowCount: {
          type: 'number',
          description: 'Total number of rows being imported',
        },
        columns: {
          type: 'array',
          description: 'List of column names in the data',
          items: { type: 'string' },
        },
      },
      required: ['table', 'data', 'rowCount', 'columns'],
    },
  },
];

// ============ PROJECT MANAGEMENT TOOLS ============

export const projectTools: ClaudeToolDefinition[] = [
  {
    name: 'create_project',
    description: 'Create a new project with name, description, dates, and budget info. Requires explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Project name (required)',
        },
        description: {
          type: 'string',
          description: 'Project description (optional)',
        },
        start_date: {
          type: 'string',
          description: 'Start date in ISO format YYYY-MM-DD (optional)',
        },
        end_date: {
          type: 'string',
          description: 'End date in ISO format YYYY-MM-DD (optional)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_project',
    description: 'Update an existing project with new information. Requires explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'ID of the project to update',
        },
        name: {
          type: 'string',
          description: 'New project name (optional)',
        },
        description: {
          type: 'string',
          description: 'New project description (optional)',
        },
        start_date: {
          type: 'string',
          description: 'New start date (optional)',
        },
        end_date: {
          type: 'string',
          description: 'New end date (optional)',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'list_projects',
    description: 'List all projects in the tenant with pagination.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of projects to return (default: 50, max: 200)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
      },
      required: [],
    },
  },
];

// ============ TASK MANAGEMENT TOOLS ============

export const taskTools: ClaudeToolDefinition[] = [
  {
    name: 'create_task',
    description: 'Create a new task within a project. Can assign to employees and set dates. Requires explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Task title (required)',
        },
        description: {
          type: 'string',
          description: 'Task description (optional)',
        },
        project_id: {
          type: 'number',
          description: 'Project ID (optional)',
        },
        assigned_to_id: {
          type: 'number',
          description: 'Employee ID to assign task to (optional)',
        },
        start_date: {
          type: 'string',
          description: 'Start date in ISO format (optional)',
        },
        end_date: {
          type: 'string',
          description: 'End date in ISO format (optional)',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing task with new information. Requires explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'Task ID to update',
        },
        title: {
          type: 'string',
          description: 'New task title (optional)',
        },
        description: {
          type: 'string',
          description: 'New task description (optional)',
        },
        status: {
          type: 'string',
          description: 'New task status (optional)',
        },
        assigned_to_id: {
          type: 'number',
          description: 'New employee assignment (optional)',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List tasks, optionally filtered by project.',
    input_schema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Filter tasks by project ID (optional)',
        },
      },
      required: [],
    },
  },
];

// ============ ACTIVITY & MILESTONE TOOLS ============

export const activityTools: ClaudeToolDefinition[] = [
  {
    name: 'create_activity',
    description: 'Create a new activity within a project. Can assign to employees. Requires explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'Project ID (required)',
        },
        name: {
          type: 'string',
          description: 'Activity name (required)',
        },
        description: {
          type: 'string',
          description: 'Activity description (optional)',
        },
        assigned_to_id: {
          type: 'number',
          description: 'Employee ID to assign (optional)',
        },
        start_date: {
          type: 'string',
          description: 'Start date in ISO format (optional)',
        },
        end_date: {
          type: 'string',
          description: 'End date in ISO format (optional)',
        },
      },
      required: ['projectId', 'name'],
    },
  },
  {
    name: 'create_milestone',
    description: 'Create a milestone within a project. Requires explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'Project ID (required)',
        },
        title: {
          type: 'string',
          description: 'Milestone title (required)',
        },
        description: {
          type: 'string',
          description: 'Milestone description (optional)',
        },
        due_date: {
          type: 'string',
          description: 'Due date in ISO format (optional)',
        },
      },
      required: ['projectId', 'title'],
    },
  },
];

// ============ BUDGET TOOLS ============

export const budgetTools: ClaudeToolDefinition[] = [
  {
    name: 'create_budget_line',
    description: 'Create a budget line for a project. Requires explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID (required)',
        },
        concept: {
          type: 'string',
          description: 'Budget concept name (required)',
        },
        approved_budget: {
          type: 'number',
          description: 'Approved budget amount (required)',
        },
        hito1_budget: {
          type: 'number',
          description: 'Hito 1 budget (required)',
        },
        hito2_budget: {
          type: 'number',
          description: 'Hito 2 budget (required)',
        },
      },
      required: ['projectId', 'concept', 'approved_budget', 'hito1_budget', 'hito2_budget'],
    },
  },
  {
    name: 'update_budget_line',
    description: 'Update a budget line. Requires explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID (required)',
        },
        budgetId: {
          type: 'string',
          description: 'Budget line ID (required)',
        },
        approved_budget: {
          type: 'number',
          description: 'New approved budget (optional)',
        },
        percent_spent: {
          type: 'number',
          description: 'Percentage spent (optional)',
        },
      },
      required: ['projectId', 'budgetId'],
    },
  },
];

// ============ RESOURCE ALLOCATION TOOLS ============

export const resourceTools: ClaudeToolDefinition[] = [
  {
    name: 'list_employees',
    description: 'List employees/team members for the tenant.',
    input_schema: {
      type: 'object',
      properties: {
        year: {
          type: 'number',
          description: 'Optional year to calculate availability context',
        },
      },
      required: [],
    },
  },
  {
    name: 'create_employee',
    description: 'Create a new employee/team member. Requires explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        full_name: {
          type: 'string',
          description: 'Full name of the employee (required)',
        },
        email: {
          type: 'string',
          description: 'Email address (required)',
        },
        position: {
          type: 'string',
          description: 'Job position/title (optional)',
        },
        primary_department_id: {
          type: 'number',
          description: 'Primary department ID (optional)',
        },
        hourly_rate: {
          type: 'number',
          description: 'Hourly rate in currency (optional)',
        },
        hire_date: {
          type: 'string',
          description: 'Hire date in ISO format YYYY-MM-DD (optional)',
        },
        employment_type: {
          type: 'string',
          description: 'Employment type: permanent, contract, temporary (default: permanent)',
        },
      },
      required: ['full_name', 'email'],
    },
  },
  {
    name: 'allocate_employee',
    description: 'Allocate an employee to a project or activity. Requires explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        employeeId: {
          type: 'number',
          description: 'Employee ID (required)',
        },
        projectId: {
          type: 'number',
          description: 'Project ID to allocate to (optional)',
        },
        year: {
          type: 'number',
          description: 'Year for allocation (required)',
        },
        allocatedHours: {
          type: 'number',
          description: 'Number of hours allocated (optional)',
        },
        allocationPercentage: {
          type: 'number',
          description: 'Allocation percentage (optional)',
        },
      },
      required: ['employeeId', 'year'],
    },
  },
  {
    name: 'create_external_collaboration',
    description: 'Create an external collaboration/supplier. Requires explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Collaboration/supplier name (required)',
        },
        legal_name: {
          type: 'string',
          description: 'Legal business name (required)',
        },
        cif: {
          type: 'string',
          description: 'Tax ID / CIF (required)',
        },
        contact_email: {
          type: 'string',
          description: 'Contact email (required)',
        },
        collaborationType: {
          type: 'string',
          description: 'Type of collaboration (optional)',
        },
      },
      required: ['name', 'legal_name', 'cif', 'contact_email'],
    },
  },
];

// ============ TOOL EXECUTION ============

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  tenantId: string,
  userId: string
): Promise<ToolResult> {
  try {
    switch (toolName) {
      // Documents tools
      case 'list_documents':
        return await realApiClient.listDocuments(tenantId);

      case 'read_document':
        return await realApiClient.readDocument(
          tenantId,
          input.documentId as string
        );

      case 'create_contract_from_template':
        return await realApiClient.createContractFromTemplate(
          tenantId,
          input.templateId as string,
          input.variables as Record<string, string>,
          userId
        );

      // Users tools
      case 'list_active_users':
        return await realApiClient.listActiveUsers(
          tenantId,
          (input.hoursBack as number) || 24
        );

      case 'get_user_activity':
        return await realApiClient.getUserActivity(
          tenantId,
          input.userId as string
        );

      case 'get_user_by_id':
        return await realApiClient.getUserById(
          tenantId,
          input.userId as string
        );

      // Finance tools
      case 'get_budget':
        return await realApiClient.getBudget(tenantId, input.budgetId as string);

      case 'patch_budget_line':
        return await realApiClient.patchBudgetLine(
          tenantId,
          input.budgetId as string,
          input.updates as Record<string, unknown>
        );

      case 'get_invoice':
        return await realApiClient.getInvoice(tenantId, input.invoiceId as string);

      case 'reprocess_invoice_ocr':
        return await realApiClient.reprocessInvoiceOcr(tenantId, input.invoiceId as string);

      case 'list_invoices':
        return await realApiClient.listInvoices(tenantId);

      // Analysis tools
      case 'query_report':
        return await realApiClient.queryReport(
          tenantId,
          input.reportType as string,
          (input.filters as Record<string, unknown>) || {}
        );

      case 'summarize_document':
        return await realApiClient.summarizeDocument(
          tenantId,
          input.documentId as string
        );

      // Data import tools
      case 'import_data_from_file':
        return await realApiClient.bulkImportData(
          tenantId,
          input.table as string,
          input.data as Record<string, unknown>[],
          userId
        );

      // Project management tools
      case 'create_project': {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { department_id: _dep, ...projectInput } = input;
        return await realApiClient.createProject(tenantId, projectInput);
      }

      case 'update_project':
        return await realApiClient.updateProject(
          tenantId,
          input.projectId as string,
          input
        );

      case 'list_projects':
        return await realApiClient.listProjects(
          tenantId,
          (input.limit as number) || 50,
          (input.offset as number) || 0
        );

      // Task management tools
      case 'create_task':
        return await realApiClient.createTask(tenantId, input);

      case 'update_task':
        return await realApiClient.updateTask(
          tenantId,
          input.taskId as string,
          input
        );

      case 'list_tasks':
        return await realApiClient.listTasks(tenantId, input.projectId as string);

      // Activity tools
      case 'create_activity':
        return await realApiClient.createActivity(tenantId, input);

      // Milestone tools
      case 'create_milestone':
        return await realApiClient.createMilestone(tenantId, input);

      // Budget tools
      case 'create_budget_line':
        return await realApiClient.createBudgetLine(
          tenantId,
          input.projectId as string,
          input
        );

      case 'update_budget_line':
        return await realApiClient.updateBudgetLine(
          tenantId,
          input.projectId as string,
          input.budgetId as string,
          input
        );

      // Resource allocation tools
      case 'list_employees':
        return await realApiClient.listEmployees(
          tenantId,
          input.year as number | undefined
        );

      case 'create_employee':
        return await realApiClient.createEmployee(tenantId, input);

      case 'allocate_employee':
        return await realApiClient.allocateEmployee(tenantId, input);

      case 'create_external_collaboration':
        return await realApiClient.createExternalCollaboration(tenantId, input);

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      error: `Tool execution failed: ${String(error)}`,
    };
  }
}

// ============ TOOL GROUPS BY AGENT ============

// All tools combined — every agent has access to the full toolset so the
// model can handle cross-cutting requests in a single turn without re-routing.
const allTools = [
  ...documentsTools,
  ...usersTools,
  ...financeTools,
  ...analysisTools,
  ...projectTools,
  ...taskTools,
  ...activityTools,
  ...budgetTools,
  ...resourceTools,
  ...importTools,
];

export const toolsByAgent: Record<string, ClaudeToolDefinition[]> = {
  documents: allTools,
  users: allTools,
  finance: allTools,
  analysis: allTools,
  projects: allTools,
  tasks: allTools,
  resources: allTools,
};

export const writeOperations = new Set([
  // Document operations
  'create_contract_from_template',
  'patch_budget_line',
  // OCR operations
  'reprocess_invoice_ocr',
  // Import operations
  'import_data_from_file',
  // Project operations
  'create_project',
  'update_project',
  // Task operations
  'create_task',
  'update_task',
  // Activity operations
  'create_activity',
  // Milestone operations
  'create_milestone',
  // Budget operations
  'create_budget_line',
  'update_budget_line',
  // Resource operations
  'create_employee',
  'allocate_employee',
  'create_external_collaboration',
]);

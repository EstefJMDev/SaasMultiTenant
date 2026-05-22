// Mock API Client - simulates internal API calls
// Replace with real API calls when implementing production version

import { ToolResult } from '../types/index';

export interface MockUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  lastActive: Date;
  status: 'active' | 'inactive' | 'suspended';
}

export interface MockDocument {
  id: string;
  tenantId: string;
  type: 'contract' | 'invoice' | 'report' | 'other';
  title: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface MockBudgetLine {
  id: string;
  tenantId: string;
  name: string;
  amount: number;
  spent: number;
  status: 'draft' | 'approved' | 'exceeded';
}

export interface MockReport {
  id: string;
  tenantId: string;
  type: string;
  data: Record<string, unknown>;
  generatedAt: Date;
}

class MockApiClient {
  // Mock data storage
  private users: Map<string, MockUser> = new Map();
  private documents: Map<string, MockDocument> = new Map();
  private budgets: Map<string, MockBudgetLine> = new Map();
  private reports: Map<string, MockReport> = new Map();

  constructor() {
    this.initializeMockData();
  }

  private initializeMockData() {
    // Mock users
    this.users.set('user1', {
      id: 'user1',
      tenantId: 'tenant1',
      email: 'john@example.com',
      name: 'John Doe',
      lastActive: new Date(),
      status: 'active',
    });
    this.users.set('user2', {
      id: 'user2',
      tenantId: 'tenant1',
      email: 'jane@example.com',
      name: 'Jane Smith',
      lastActive: new Date(Date.now() - 3600000),
      status: 'active',
    });

    // Mock documents
    this.documents.set('doc1', {
      id: 'doc1',
      tenantId: 'tenant1',
      type: 'contract',
      title: 'Service Contract - Acme Corp',
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(),
      createdBy: 'user1',
    });

    // Mock budgets
    this.budgets.set('budget1', {
      id: 'budget1',
      tenantId: 'tenant1',
      name: 'Q1 Operations',
      amount: 50000,
      spent: 35000,
      status: 'approved',
    });

    // Mock reports
    this.reports.set('report1', {
      id: 'report1',
      tenantId: 'tenant1',
      type: 'financial_summary',
      data: {
        totalRevenue: 150000,
        totalExpenses: 95000,
        netIncome: 55000,
        period: 'Q1 2025',
      },
      generatedAt: new Date(),
    });
  }

  // Document operations
  async listDocuments(tenantId: string): Promise<ToolResult> {
    try {
      const docs = Array.from(this.documents.values()).filter(
        (d) => d.tenantId === tenantId
      );
      return { success: true, data: docs };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async readDocument(tenantId: string, documentId: string): Promise<ToolResult> {
    try {
      const doc = this.documents.get(documentId);
      if (!doc || doc.tenantId !== tenantId) {
        return {
          success: false,
          error: 'Document not found or access denied',
        };
      }
      return { success: true, data: doc };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async createContractFromTemplate(
    tenantId: string,
    templateId: string,
    variables: Record<string, string>,
    createdBy: string
  ): Promise<ToolResult> {
    try {
      // Simulate template expansion
      const templates: Record<string, string> = {
        standard_contract: 'Service Agreement Template - {{provider}}, {{date}}',
        invoice_template: 'Invoice Template - {{amount}}, {{client}}',
      };

      const templateText = templates[templateId] || 'Unknown template';
      let expanded = templateText;
      Object.entries(variables).forEach(([key, value]) => {
        expanded = expanded.replace(`{{${key}}}`, value);
      });

      const newDoc: MockDocument = {
        id: `doc_${Date.now()}`,
        tenantId,
        type: 'contract',
        title: `Generated ${templateId}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
      };

      this.documents.set(newDoc.id, newDoc);
      return {
        success: true,
        data: { ...newDoc, content: expanded },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // User operations
  async listActiveUsers(tenantId: string, hoursBack = 24): Promise<ToolResult> {
    try {
      const cutoff = new Date(Date.now() - hoursBack * 3600000);
      const activeUsers = Array.from(this.users.values()).filter(
        (u) => u.tenantId === tenantId && u.lastActive >= cutoff
      );
      return { success: true, data: activeUsers };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getUserActivity(
    tenantId: string,
    userId: string
  ): Promise<ToolResult> {
    try {
      const user = this.users.get(userId);
      if (!user || user.tenantId !== tenantId) {
        return { success: false, error: 'User not found or access denied' };
      }
      return {
        success: true,
        data: {
          userId,
          lastActive: user.lastActive,
          status: user.status,
          email: user.email,
          name: user.name,
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getUserById(tenantId: string, userId: string): Promise<ToolResult> {
    try {
      const user = this.users.get(userId);
      if (!user || user.tenantId !== tenantId) {
        return { success: false, error: 'User not found or access denied' };
      }
      return { success: true, data: user };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // Finance operations
  async getBudget(tenantId: string, budgetId: string): Promise<ToolResult> {
    try {
      const budget = this.budgets.get(budgetId);
      if (!budget || budget.tenantId !== tenantId) {
        return { success: false, error: 'Budget not found or access denied' };
      }
      return { success: true, data: budget };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async patchBudgetLine(
    tenantId: string,
    budgetId: string,
    updates: Record<string, unknown>
  ): Promise<ToolResult> {
    try {
      const budget = this.budgets.get(budgetId);
      if (!budget || budget.tenantId !== tenantId) {
        return {
          success: false,
          error: 'Budget not found or access denied',
        };
      }
      const updated = { ...budget, ...updates };
      this.budgets.set(budgetId, updated);
      return { success: true, data: updated };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async listInvoices(tenantId: string): Promise<ToolResult> {
    try {
      const invoices = Array.from(this.documents.values()).filter(
        (d) => d.tenantId === tenantId && d.type === 'invoice'
      );
      return { success: true, data: invoices };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // Analysis operations
  async queryReport(
    tenantId: string,
    reportType: string,
    filters: Record<string, unknown>
  ): Promise<ToolResult> {
    try {
      const reports = Array.from(this.reports.values()).filter(
        (r) => r.tenantId === tenantId && r.type === reportType
      );
      // Apply filters (simplified)
      return { success: true, data: reports };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async summarizeDocument(
    tenantId: string,
    documentId: string
  ): Promise<ToolResult> {
    try {
      const doc = this.documents.get(documentId);
      if (!doc || doc.tenantId !== tenantId) {
        return { success: false, error: 'Document not found' };
      }
      return {
        success: true,
        data: {
          documentId,
          title: doc.title,
          type: doc.type,
          summary: `Summary of ${doc.title}: This document contains important information about the service agreement.`,
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}

// Export singleton instance
export const mockApiClient = new MockApiClient();

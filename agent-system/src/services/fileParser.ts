import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { logger } from '../utils/logger';

export interface ParsedFile {
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  fileType: 'csv' | 'excel';
  preview: Record<string, unknown>[];
}

/**
 * Parse CSV file content
 */
function parseCSV(content: string): ParsedFile {
  try {
    const rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, unknown>[];

    if (rows.length === 0) {
      throw new Error('CSV file is empty');
    }

    const headers = Object.keys(rows[0]);
    const preview = rows.slice(0, 5);

    return {
      headers,
      rows,
      rowCount: rows.length,
      fileType: 'csv',
      preview,
    };
  } catch (error) {
    logger.error('CSV parse error:', error);
    throw new Error(`Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse Excel file buffer
 */
function parseExcel(buffer: Buffer): ParsedFile {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    if (!worksheet) {
      throw new Error('No sheets found in Excel file');
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      raw: false,
      defval: '',
    });

    if (rows.length === 0) {
      throw new Error('Excel file has no data rows');
    }

    const headers = Object.keys(rows[0]);
    const preview = rows.slice(0, 5);

    return {
      headers,
      rows,
      rowCount: rows.length,
      fileType: 'excel',
      preview,
    };
  } catch (error) {
    logger.error('Excel parse error:', error);
    throw new Error(`Failed to parse Excel: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse uploaded file (CSV or Excel)
 */
export async function parseUploadedFile(
  buffer: Buffer,
  originalName: string,
): Promise<ParsedFile> {
  const filename = originalName.toLowerCase();

  if (filename.endsWith('.csv')) {
    return parseCSV(buffer.toString('utf-8'));
  }

  if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
    return parseExcel(buffer);
  }

  throw new Error('Unsupported file type. Supported: CSV, XLSX, XLS');
}

/**
 * Generate summary of parsed file for user
 */
export function generateFileSummary(parsed: ParsedFile): string {
  const headers = parsed.headers.map(h => `"${h}"`).join(', ');
  const firstRow = parsed.preview[0]
    ? Object.entries(parsed.preview[0])
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ')
    : 'N/A';

  return `
📊 **File Import Summary**

**Type:** ${parsed.fileType.toUpperCase()}
**Total Rows:** ${parsed.rowCount}
**Columns (${parsed.headers.length}):** ${headers}

**Sample Row:**
\`\`\`
${firstRow}
\`\`\`

Which table would you like to import this data to?
Supported tables: erp_project, erp_task, erp_project_budget_line, erp_external_collaboration, erp_timeentry, user, employee_profile

Example: "Import to erp_project_budget_line"
  `.trim();
}

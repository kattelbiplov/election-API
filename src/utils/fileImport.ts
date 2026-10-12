import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { ApiError } from './ApiError';

// Generic "read a CSV/Excel file into an array of {header: value} rows"
// parsing, shared by every bulk-import pipeline in this codebase (voters,
// the geo dataset import). Domain-specific row validation/mapping stays in
// each module's own *.import.ts — this file only knows about spreadsheets,
// not voters or wards.

function normalizeExcelCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if ('result' in value) return normalizeExcelCellValue((value as { result: ExcelJS.CellValue }).result);
    if ('text' in value) return (value as { text: unknown }).text;
    if ('richText' in value) {
      return (value as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
    }
    return undefined;
  }
  return value;
}

async function parseExcelFile(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });

  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, unknown> = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      const value = normalizeExcelCellValue(cell.value);
      if (value !== undefined && value !== '') hasValue = true;
      record[header] = value;
    });
    if (hasValue) rows.push(record);
  });

  return rows;
}

function parseCsvFile(buffer: Buffer): Record<string, unknown>[] {
  return parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, unknown>[];
}

export async function parseImportFile(
  buffer: Buffer,
  originalName: string,
  mimetype: string,
): Promise<Record<string, unknown>[]> {
  const ext = originalName.toLowerCase().split('.').pop();

  if (ext === 'csv' || mimetype === 'text/csv') {
    try {
      return parseCsvFile(buffer);
    } catch (err) {
      throw ApiError.badRequest(`Could not parse CSV file: ${(err as Error).message}`);
    }
  }

  if (ext === 'xlsx' || ext === 'xls' || mimetype.includes('spreadsheet') || mimetype.includes('excel')) {
    try {
      return await parseExcelFile(buffer);
    } catch (err) {
      throw ApiError.badRequest(`Could not parse Excel file: ${(err as Error).message}`);
    }
  }

  throw ApiError.badRequest('Unsupported file type — upload a .csv or .xlsx file');
}

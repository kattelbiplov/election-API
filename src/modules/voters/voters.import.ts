import { Gender } from '@prisma/client';

// Row validation for the voter bulk-import pipeline. Generic "read a
// CSV/Excel file into rows" parsing lives in ../../utils/fileImport.ts
// (shared with the geo dataset import) — this file only knows about voters.

export const IMPORT_MAX_ROWS = 10_000;
export const IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

const MIN_DATE_OF_BIRTH = new Date('1900-01-01T00:00:00.000Z').getTime();

export interface ParsedVoterRow {
  fullName: string;
  dateOfBirth: Date;
  gender?: Gender;
  fatherOrSpouseName?: string;
  citizenshipNumber?: string;
  voterIdNumber?: string;
  phone?: string;
  occupation?: string;
  address?: string;
  toleName?: string;
}

// Accepted source column headers, normalized (lowercase, non-alphanumeric ->
// "_") -> our canonical field name. Documented in
// docs/modules/02-households-voters.md so campaign staff know what to name
// their spreadsheet columns; unrecognized columns are ignored, not errored.
const HEADER_ALIASES: Record<string, keyof ParsedVoterRow> = {
  full_name: 'fullName',
  name: 'fullName',
  voter_name: 'fullName',
  date_of_birth: 'dateOfBirth',
  dob: 'dateOfBirth',
  birth_date: 'dateOfBirth',
  gender: 'gender',
  sex: 'gender',
  father_or_spouse_name: 'fatherOrSpouseName',
  father_spouse_name: 'fatherOrSpouseName',
  father_name: 'fatherOrSpouseName',
  spouse_name: 'fatherOrSpouseName',
  citizenship_number: 'citizenshipNumber',
  citizenship_no: 'citizenshipNumber',
  voter_id_number: 'voterIdNumber',
  voter_id: 'voterIdNumber',
  voter_no: 'voterIdNumber',
  phone: 'phone',
  phone_number: 'phone',
  mobile: 'phone',
  mobile_number: 'phone',
  occupation: 'occupation',
  address: 'address',
  tole_name: 'toleName',
  tole: 'toleName',
};

function normalizeHeaderKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function mapRawRowToFields(row: Record<string, unknown>): Partial<Record<keyof ParsedVoterRow, unknown>> {
  const mapped: Partial<Record<keyof ParsedVoterRow, unknown>> = {};
  for (const [rawHeader, value] of Object.entries(row)) {
    const field = HEADER_ALIASES[normalizeHeaderKey(rawHeader)];
    if (field) mapped[field] = value;
  }
  return mapped;
}

function toOptionalString(value: unknown, maxLen: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  return str ? str.slice(0, maxLen) : undefined;
}

function normalizeGender(raw: unknown): Gender | undefined {
  const value = String(raw).trim().toUpperCase();
  if (value === 'M' || value === 'MALE') return Gender.MALE;
  if (value === 'F' || value === 'FEMALE') return Gender.FEMALE;
  if (value === 'O' || value === 'OTHER') return Gender.OTHER;
  return undefined;
}

// Accepts a native Date (from Excel date-formatted cells), an ISO
// "YYYY-MM-DD" string, or a "DD/MM/YYYY" string (day-first, matching
// Nepal/international convention rather than US month-first).
function parseDateOfBirth(raw: unknown): Date | null {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (dmy) {
    const d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export type RowValidationResult = { data: ParsedVoterRow } | { error: string };

export function validateImportRow(raw: Record<string, unknown>): RowValidationResult {
  const mapped = mapRawRowToFields(raw);

  const fullName = toOptionalString(mapped.fullName, 150);
  if (!fullName || fullName.length < 2) {
    return { error: 'Missing or invalid full_name (minimum 2 characters)' };
  }

  const dateOfBirth = parseDateOfBirth(mapped.dateOfBirth);
  if (!dateOfBirth) {
    return { error: 'Missing or unparseable date_of_birth (expected YYYY-MM-DD or DD/MM/YYYY)' };
  }
  if (dateOfBirth.getTime() > Date.now()) {
    return { error: 'date_of_birth cannot be in the future' };
  }
  if (dateOfBirth.getTime() < MIN_DATE_OF_BIRTH) {
    return { error: 'date_of_birth is implausibly old' };
  }

  let gender: Gender | undefined;
  if (mapped.gender !== undefined && String(mapped.gender).trim() !== '') {
    const normalized = normalizeGender(mapped.gender);
    if (!normalized) return { error: `Unrecognized gender value "${String(mapped.gender)}"` };
    gender = normalized;
  }

  return {
    data: {
      fullName,
      dateOfBirth,
      gender,
      fatherOrSpouseName: toOptionalString(mapped.fatherOrSpouseName, 150),
      citizenshipNumber: toOptionalString(mapped.citizenshipNumber, 50),
      voterIdNumber: toOptionalString(mapped.voterIdNumber, 50),
      phone: toOptionalString(mapped.phone, 20),
      occupation: toOptionalString(mapped.occupation, 100),
      address: toOptionalString(mapped.address, 250),
      toleName: toOptionalString(mapped.toleName, 120),
    },
  };
}

export { parseImportFile } from '../../utils/fileImport';

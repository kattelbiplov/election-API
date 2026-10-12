import { MunicipalityType } from '@prisma/client';

// Row validation for the official Nepal administrative dataset import — see
// docs/modules/05-geo-dataset-import.md. This module does NOT contain any
// actual Nepal geography data: it only knows how to validate and map a row
// that came from a file the caller supplies (sourced from Election
// Commission Nepal / National Statistics Office), same "we don't hand-type
// this" principle documented in prisma/schema.prisma's Module 01 notes.

export const GEO_IMPORT_MAX_ROWS = 2000; // real dataset is ~753 municipality rows
export const GEO_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB

export interface ParsedGeoRow {
  provinceCode: number;
  provinceName: string;
  provinceNameNepali?: string;
  districtCode: string;
  districtName: string;
  districtNameNepali?: string;
  municipalityCode: string;
  municipalityName: string;
  municipalityNameNepali?: string;
  municipalityType: MunicipalityType;
  totalWards: number;
}

// One row = one municipality, with its parent province/district repeated
// alongside it (a flat, denormalized format — how this kind of reference
// list is normally published). Aliases cover the common header spellings;
// unrecognized columns are ignored, not errored.
const HEADER_ALIASES: Record<string, keyof ParsedGeoRow> = {
  province_code: 'provinceCode',
  province_number: 'provinceCode',
  province_name: 'provinceName',
  province_name_nepali: 'provinceNameNepali',
  district_code: 'districtCode',
  district_name: 'districtName',
  district_name_nepali: 'districtNameNepali',
  municipality_code: 'municipalityCode',
  local_level_code: 'municipalityCode',
  municipality_name: 'municipalityName',
  local_level_name: 'municipalityName',
  municipality_name_nepali: 'municipalityNameNepali',
  local_level_name_nepali: 'municipalityNameNepali',
  municipality_type: 'municipalityType',
  local_level_type: 'municipalityType',
  type: 'municipalityType',
  total_wards: 'totalWards',
  ward_count: 'totalWards',
  number_of_wards: 'totalWards',
};

function normalizeHeaderKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function mapRawRowToFields(row: Record<string, unknown>): Partial<Record<keyof ParsedGeoRow, unknown>> {
  const mapped: Partial<Record<keyof ParsedGeoRow, unknown>> = {};
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

function toRequiredString(value: unknown, maxLen: number): string | null {
  const str = toOptionalString(value, maxLen);
  return str ?? null;
}

const MUNICIPALITY_TYPE_ALIASES: Record<string, MunicipalityType> = {
  METROPOLITAN_CITY: MunicipalityType.METROPOLITAN_CITY,
  'METROPOLITAN CITY': MunicipalityType.METROPOLITAN_CITY,
  METROPOLITAN: MunicipalityType.METROPOLITAN_CITY,
  SUB_METROPOLITAN_CITY: MunicipalityType.SUB_METROPOLITAN_CITY,
  'SUB-METROPOLITAN CITY': MunicipalityType.SUB_METROPOLITAN_CITY,
  'SUB METROPOLITAN CITY': MunicipalityType.SUB_METROPOLITAN_CITY,
  SUBMETROPOLITAN: MunicipalityType.SUB_METROPOLITAN_CITY,
  MUNICIPALITY: MunicipalityType.MUNICIPALITY,
  RURAL_MUNICIPALITY: MunicipalityType.RURAL_MUNICIPALITY,
  'RURAL MUNICIPALITY': MunicipalityType.RURAL_MUNICIPALITY,
  GAUNPALIKA: MunicipalityType.RURAL_MUNICIPALITY,
};

function normalizeMunicipalityType(raw: unknown): MunicipalityType | undefined {
  const key = String(raw).trim().toUpperCase();
  return MUNICIPALITY_TYPE_ALIASES[key];
}

export type RowValidationResult = { data: ParsedGeoRow } | { error: string };

export function validateImportRow(raw: Record<string, unknown>): RowValidationResult {
  const mapped = mapRawRowToFields(raw);

  const provinceCodeNum = Number(mapped.provinceCode);
  if (!mapped.provinceCode || !Number.isInteger(provinceCodeNum) || provinceCodeNum < 1) {
    return { error: 'Missing or invalid province_code (expected a positive integer)' };
  }

  const provinceName = toRequiredString(mapped.provinceName, 120);
  if (!provinceName) return { error: 'Missing province_name' };

  const districtCode = toRequiredString(mapped.districtCode, 20);
  if (!districtCode) return { error: 'Missing district_code' };

  const districtName = toRequiredString(mapped.districtName, 120);
  if (!districtName) return { error: 'Missing district_name' };

  const municipalityCode = toRequiredString(mapped.municipalityCode, 20);
  if (!municipalityCode) return { error: 'Missing municipality_code' };

  const municipalityName = toRequiredString(mapped.municipalityName, 120);
  if (!municipalityName) return { error: 'Missing municipality_name' };

  if (!mapped.municipalityType) return { error: 'Missing municipality_type' };
  const municipalityType = normalizeMunicipalityType(mapped.municipalityType);
  if (!municipalityType) {
    return {
      error: `Unrecognized municipality_type "${String(mapped.municipalityType)}" (expected METROPOLITAN_CITY, SUB_METROPOLITAN_CITY, MUNICIPALITY, or RURAL_MUNICIPALITY)`,
    };
  }

  const totalWardsNum = Number(mapped.totalWards);
  if (!mapped.totalWards || !Number.isInteger(totalWardsNum) || totalWardsNum < 1 || totalWardsNum > 35) {
    return { error: 'Missing or invalid total_wards (expected an integer between 1 and 35)' };
  }

  return {
    data: {
      provinceCode: provinceCodeNum,
      provinceName,
      provinceNameNepali: toOptionalString(mapped.provinceNameNepali, 120),
      districtCode,
      districtName,
      districtNameNepali: toOptionalString(mapped.districtNameNepali, 120),
      municipalityCode,
      municipalityName,
      municipalityNameNepali: toOptionalString(mapped.municipalityNameNepali, 120),
      municipalityType,
      totalWards: totalWardsNum,
    },
  };
}

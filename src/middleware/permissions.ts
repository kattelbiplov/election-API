import { UserRole } from '@prisma/client';

// Central permission catalogue. Every protected route declares the permission(s)
// it needs via requirePermission() (see rbac.ts) — routes never check `role`
// directly, so adding a role or reshuffling responsibilities only means editing
// the ROLE_PERMISSIONS map below, not touching route files.
export const PERMISSIONS = {
  ORG_CREATE: 'organizations:create',
  ORG_READ: 'organizations:read',
  ORG_UPDATE: 'organizations:update',

  USER_CREATE: 'users:create',
  USER_READ: 'users:read',
  USER_UPDATE: 'users:update',
  USER_DELETE: 'users:delete',
  USER_ASSIGN_GEO: 'users:assign_geo',

  GEO_READ: 'geo:read',
  GEO_MANAGE_NATIONAL: 'geo:manage_national', // provinces/districts/municipalities (official data)
  WARD_MANAGE: 'geo:ward_manage',
  TOLE_CREATE: 'geo:tole_create',
  TOLE_UPDATE: 'geo:tole_update',
  TOLE_DELETE: 'geo:tole_delete',

  AUDIT_READ: 'audit:read',

  HOUSEHOLD_CREATE: 'household:create',
  HOUSEHOLD_READ: 'household:read',
  HOUSEHOLD_UPDATE: 'household:update',
  HOUSEHOLD_DELETE: 'household:delete',

  VOTER_CREATE: 'voter:create',
  VOTER_READ: 'voter:read',
  VOTER_UPDATE: 'voter:update',
  VOTER_DELETE: 'voter:delete',
  VOTER_IMPORT: 'voter:import',
  VOTER_IMPORT_READ: 'voter:import_read',

  TASK_CREATE: 'task:create',
  TASK_READ: 'task:read',
  TASK_UPDATE: 'task:update',
  TASK_DELETE: 'task:delete',
  TASK_VISIT_UPDATE: 'task:visit_update',

  REPORT_READ: 'report:read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

const FIELD_WORKER_PERMISSIONS: Permission[] = [
  PERMISSIONS.GEO_READ,
  PERMISSIONS.HOUSEHOLD_CREATE,
  PERMISSIONS.HOUSEHOLD_READ,
  PERMISSIONS.VOTER_CREATE,
  PERMISSIONS.VOTER_READ,
  PERMISSIONS.VOTER_UPDATE,
  // Task read/visit-update only — they work tasks assigned to them, they
  // don't create/reassign/cancel tasks. tasks.service.ts additionally forces
  // list/detail queries for this role down to "assigned to me", so
  // TASK_READ here never lets them browse other people's tasks.
  PERMISSIONS.TASK_READ,
  PERMISSIONS.TASK_VISIT_UPDATE,
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,

  CAMPAIGN_ADMIN: [
    PERMISSIONS.ORG_READ,
    PERMISSIONS.ORG_UPDATE,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.USER_DELETE,
    PERMISSIONS.USER_ASSIGN_GEO,
    PERMISSIONS.GEO_READ,
    PERMISSIONS.WARD_MANAGE,
    PERMISSIONS.TOLE_CREATE,
    PERMISSIONS.TOLE_UPDATE,
    PERMISSIONS.TOLE_DELETE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.HOUSEHOLD_CREATE,
    PERMISSIONS.HOUSEHOLD_READ,
    PERMISSIONS.HOUSEHOLD_UPDATE,
    PERMISSIONS.HOUSEHOLD_DELETE,
    PERMISSIONS.VOTER_CREATE,
    PERMISSIONS.VOTER_READ,
    PERMISSIONS.VOTER_UPDATE,
    PERMISSIONS.VOTER_DELETE,
    PERMISSIONS.VOTER_IMPORT,
    PERMISSIONS.VOTER_IMPORT_READ,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_UPDATE,
    PERMISSIONS.TASK_DELETE,
    PERMISSIONS.TASK_VISIT_UPDATE,
    PERMISSIONS.REPORT_READ,
  ],

  // Ward-level write access is further scoped to their assigned ward(s) by
  // geoScope.ts (assertWardAccess) in the service layer — same pattern as
  // TOLE_CREATE/TOLE_UPDATE above. Bulk import is ward-scoped for the same
  // reason: a WARD_MANAGER can only import voters for a ward they're assigned.
  WARD_MANAGER: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.GEO_READ,
    PERMISSIONS.TOLE_CREATE,
    PERMISSIONS.TOLE_UPDATE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.HOUSEHOLD_CREATE,
    PERMISSIONS.HOUSEHOLD_READ,
    PERMISSIONS.HOUSEHOLD_UPDATE,
    PERMISSIONS.HOUSEHOLD_DELETE,
    PERMISSIONS.VOTER_CREATE,
    PERMISSIONS.VOTER_READ,
    PERMISSIONS.VOTER_UPDATE,
    PERMISSIONS.VOTER_DELETE,
    PERMISSIONS.VOTER_IMPORT,
    PERMISSIONS.VOTER_IMPORT_READ,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_UPDATE,
    PERMISSIONS.TASK_DELETE,
    PERMISSIONS.TASK_VISIT_UPDATE,
    PERMISSIONS.REPORT_READ,
  ],

  // Tole-level: create/update/read within their own tole (no delete, no bulk
  // import — mirrors TOLE_UPDATE-only, no TOLE_DELETE, given to this role
  // for toles themselves).
  TOLE_COORDINATOR: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.GEO_READ,
    PERMISSIONS.TOLE_UPDATE,
    PERMISSIONS.HOUSEHOLD_CREATE,
    PERMISSIONS.HOUSEHOLD_READ,
    PERMISSIONS.HOUSEHOLD_UPDATE,
    PERMISSIONS.VOTER_CREATE,
    PERMISSIONS.VOTER_READ,
    PERMISSIONS.VOTER_UPDATE,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_UPDATE,
    PERMISSIONS.TASK_VISIT_UPDATE,
    PERMISSIONS.REPORT_READ,
  ],

  // Field data collectors: can record households/voters they encounter
  // door-to-door within their assigned tole, but not delete or bulk-import.
  // VOLUNTEER is deliberately given the exact same array (not just the same
  // permissions written out twice) — campaigns track volunteers as a
  // separate, roster-managed population from paid field staff, but today
  // they can do identical things in the app. If that ever needs to diverge,
  // split the two arrays then; until it does, this keeps them from silently
  // drifting apart.
  FIELD_WORKER: FIELD_WORKER_PERMISSIONS,
  VOLUNTEER: FIELD_WORKER_PERMISSIONS,

  ANALYST: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.GEO_READ,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.HOUSEHOLD_READ,
    PERMISSIONS.VOTER_READ,
    PERMISSIONS.VOTER_IMPORT_READ,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.REPORT_READ,
  ],

  VIEW_ONLY: [
    PERMISSIONS.GEO_READ,
    PERMISSIONS.HOUSEHOLD_READ,
    PERMISSIONS.VOTER_READ,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.REPORT_READ,
  ],
};

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

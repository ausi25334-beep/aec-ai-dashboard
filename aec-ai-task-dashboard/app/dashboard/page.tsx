"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

/* =========================================================
   Job Types

   Jobs can be opened and edited from the Job Calendar and
   Job Progress Board. Changes are saved directly to Supabase.
========================================================= */

const JOB_STATUSES = [
  "New Jobs",
  "Pending Jobs",
  "Pending Customer Replies",
  "Maintenance and Renewals",
  "Claim Warranty",
  "Pending Parts",
  "Pending Quotation",
  "Pending Invoice",
  "Cancelled",
  "Complete",
] as const;

type BoardJobStatus = (typeof JOB_STATUSES)[number];
type JobStatus = BoardJobStatus | "In Progress";

const TOP_STATUSES: readonly BoardJobStatus[] = [
  "New Jobs",
  "Pending Jobs",
  "Pending Customer Replies",
  "Complete",
];

const SECOND_ROW_STATUSES: readonly BoardJobStatus[] = [
  "Maintenance and Renewals",
  "Claim Warranty",
  "Pending Parts",
  "Pending Quotation",
  "Pending Invoice",
  "Cancelled",
];

const DEFAULT_STATISTIC_CARD_ORDER: BoardJobStatus[] = [
  ...TOP_STATUSES,
  ...SECOND_ROW_STATUSES,
];

const DASHBOARD_MODULE_KEYS = [
  "status-cards",
  "job-information",
  "job-progress",
  "job-calendar",
  "analytics",
  "staff-directory",
] as const;

type DashboardModuleKey = (typeof DASHBOARD_MODULE_KEYS)[number];

type CollapsedDashboardModules = Record<DashboardModuleKey, boolean>;
type CollapsedBoardStatuses = Record<BoardJobStatus, boolean>;

const COLLAPSED_MODULES_STORAGE_PREFIX =
  "aec-dashboard-collapsed-modules-v1:";
const COLLAPSED_BOARD_STATUSES_STORAGE_PREFIX =
  "aec-dashboard-collapsed-board-statuses-v1:";

function createExpandedDashboardModules(): CollapsedDashboardModules {
  return DASHBOARD_MODULE_KEYS.reduce((state, moduleKey) => {
    state[moduleKey] = false;
    return state;
  }, {} as CollapsedDashboardModules);
}

function normalizeCollapsedDashboardModules(
  value: unknown,
): CollapsedDashboardModules {
  const saved =
    value && typeof value === "object"
      ? (value as Partial<CollapsedDashboardModules>)
      : {};

  return DASHBOARD_MODULE_KEYS.reduce((state, moduleKey) => {
    state[moduleKey] = saved[moduleKey] === true;
    return state;
  }, {} as CollapsedDashboardModules);
}

function createExpandedBoardStatuses(): CollapsedBoardStatuses {
  return JOB_STATUSES.reduce((state, status) => {
    state[status] = false;
    return state;
  }, {} as CollapsedBoardStatuses);
}

function normalizeCollapsedBoardStatuses(
  value: unknown,
): CollapsedBoardStatuses {
  const saved =
    value && typeof value === "object"
      ? (value as Partial<CollapsedBoardStatuses>)
      : {};

  return JOB_STATUSES.reduce((state, status) => {
    state[status] = saved[status] === true;
    return state;
  }, {} as CollapsedBoardStatuses);
}

const DEFAULT_DASHBOARD_MODULE_ORDER: DashboardModuleKey[] = [
  ...DASHBOARD_MODULE_KEYS,
];

function normalizeOrderedKeys<T extends string>(
  value: unknown,
  validKeys: readonly T[],
): T[] {
  const validKeySet = new Set<T>(validKeys);
  const savedKeys = Array.isArray(value)
    ? value.filter(
        (key): key is T =>
          typeof key === "string" && validKeySet.has(key as T),
      )
    : [];
  const uniqueSavedKeys = Array.from(new Set(savedKeys));

  return [
    ...uniqueSavedKeys,
    ...validKeys.filter((key) => !uniqueSavedKeys.includes(key)),
  ];
}

function normalizeStatisticCardOrder(value: unknown): BoardJobStatus[] {
  const normalized = normalizeOrderedKeys(
    value,
    DEFAULT_STATISTIC_CARD_ORDER,
  );

  const insertRelativeTo = (
    status: BoardJobStatus,
    anchor: BoardJobStatus,
    position: "before" | "after",
  ) => {
    const currentIndex = normalized.indexOf(status);
    const anchorIndex = normalized.indexOf(anchor);

    if (currentIndex === -1 || anchorIndex === -1) return;

    const savedValueIncludesStatus =
      Array.isArray(value) && value.includes(status);
    if (savedValueIncludesStatus) return;

    normalized.splice(currentIndex, 1);
    const updatedAnchorIndex = normalized.indexOf(anchor);
    normalized.splice(
      position === "before" ? updatedAnchorIndex : updatedAnchorIndex + 1,
      0,
      status,
    );
  };

  insertRelativeTo(
    "Pending Customer Replies",
    "Pending Jobs",
    "after",
  );
  insertRelativeTo(
    "Maintenance and Renewals",
    "Claim Warranty",
    "before",
  );

  return normalized;
}

const DISTRIBUTION_STATUSES: readonly BoardJobStatus[] = [
  "New Jobs",
  "Pending Jobs",
  "Pending Customer Replies",
  "Maintenance and Renewals",
  "Claim Warranty",
  "Pending Parts",
  "Pending Quotation",
  "Pending Invoice",
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, "Full"] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
type BoardPaginationState = Record<
  BoardJobStatus,
  { page: number; pageSize: PageSize }
>;

type BoardSearchState = Record<BoardJobStatus, string>;

function createDefaultBoardSearch(): BoardSearchState {
  return JOB_STATUSES.reduce((state, status) => {
    state[status] = "";
    return state;
  }, {} as BoardSearchState);
}

type PaginationAreaKey = "job-information-sheet" | BoardJobStatus;
type SavedPaginationDefaults = Partial<Record<PaginationAreaKey, PageSize>>;

const PAGINATION_DEFAULTS_STORAGE_KEY =
  "aec-dashboard-pagination-defaults-v1";

function isPageSize(value: unknown): value is PageSize {
  return PAGE_SIZE_OPTIONS.includes(value as PageSize);
}

function readPaginationDefaults(): SavedPaginationDefaults {
  if (typeof window === "undefined") return {};

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(PAGINATION_DEFAULTS_STORAGE_KEY) || "{}",
    ) as Record<string, unknown>;
    const normalized: SavedPaginationDefaults = {};

    (["job-information-sheet", ...JOB_STATUSES] as PaginationAreaKey[]).forEach(
      (area) => {
        if (isPageSize(parsed[area])) normalized[area] = parsed[area];
      },
    );

    return normalized;
  } catch {
    return {};
  }
}

function savePaginationDefault(area: PaginationAreaKey, pageSize: PageSize) {
  try {
    const current = readPaginationDefaults();
    window.localStorage.setItem(
      PAGINATION_DEFAULTS_STORAGE_KEY,
      JSON.stringify({ ...current, [area]: pageSize }),
    );
    return true;
  } catch {
    return false;
  }
}

function createDefaultBoardPagination(
  defaults: SavedPaginationDefaults = {},
): BoardPaginationState {
  return JOB_STATUSES.reduce(
    (state, status) => {
      state[status] = { page: 1, pageSize: defaults[status] ?? 10 };
      return state;
    },
    {} as BoardPaginationState,
  );
}

type Job = {
  jobId: string;
  jobInDateTime: string;

  salesPerson: string;
  salesPersonPhone: string;

  customerName: string;
  customerPhone: string;
  customerCompanyName: string;

  assignedTechnician: string;
  technicianPhone: string;

  description: string;
  status: JobStatus;

  jobStartDateTime: string;

  statusRemark: string;
  maintenanceDuration: string;
  jobCompleteDateTime: string;

  invoiceNo: string;
  reportNo: string;
  collectionDateTime: string;

  /*
    Internal database metadata. These fields are never displayed.
    They let the editor update the exact Supabase row even when the
    visible Job ID is changed by the user.
  */
  _rowKeyColumn: string;
  _rowKeyValue: unknown;
  _sourceRow: Record<string, unknown>;
};

const JOB_COLUMN_KEYS = [
  "jobId",
  "jobInDateTime",
  "status",
  "customerCompanyName",
  "customerName",
  "customerPhone",
  "description",
  "statusRemark",
  "maintenanceDuration",
  "reportNo",
  "collectionDateTime",
  "assignedTechnician",
  "technicianPhone",
  "jobCompleteDateTime",
  "invoiceNo",
  "jobStartDateTime",
  "salesPerson",
  "salesPersonPhone",
] as const;

type JobColumnKey = (typeof JOB_COLUMN_KEYS)[number];

/*
  These are the only columns users can display and arrange.
  The two legacy staff phone fields stay in the internal Job type so older
  Supabase rows remain compatible, but they are not exposed in the
  Dashboard table, Job Details, defaults, or Settings.
*/
const DISPLAY_JOB_COLUMN_KEYS: JobColumnKey[] = [
  "jobId",
  "jobInDateTime",
  "jobStartDateTime",
  "status",
  "customerCompanyName",
  "customerName",
  "customerPhone",
  "description",
  "statusRemark",
  "maintenanceDuration",
  "reportNo",
  "invoiceNo",
  "collectionDateTime",
  "jobCompleteDateTime",
  "assignedTechnician",
  "salesPerson",
];

const JOB_COLUMN_LABELS: Record<JobColumnKey, string> = {
  jobId: "Job ID",
  jobInDateTime: "Job In Date & Time",
  salesPerson: "Sales Person",
  salesPersonPhone: "Sales Person Phone",
  customerName: "Customer Name",
  customerPhone: "Customer Phone",
  customerCompanyName: "Customer Company Name",
  assignedTechnician: "Assigned Engineer",
  technicianPhone: "Technician Phone",
  description: "Description / Item",
  status: "Status",
  jobStartDateTime: "Job Start Date & Time",
  statusRemark: "Status Remark / Issue",
  maintenanceDuration: "Maintenance Duration",
  jobCompleteDateTime: "Job Complete Date & Time",
  invoiceNo: "Invoice No.",
  reportNo: "Report No.",
  collectionDateTime: "Collection Date & Time",
};

const DEFAULT_COLUMN_ORDER: JobColumnKey[] = [...DISPLAY_JOB_COLUMN_KEYS];

const HIDDEN_JOB_PHONE_COLUMNS = new Set<JobColumnKey>([
  "technicianPhone",
  "salesPersonPhone",
]);

function normalizeColumnOrder(value: unknown): JobColumnKey[] {
  const validKeys = new Set<JobColumnKey>(DISPLAY_JOB_COLUMN_KEYS);
  const savedKeys = Array.isArray(value)
    ? value
        .map((key) =>
          key === "inProgressStartDateTime" ? "jobStartDateTime" : key,
        )
        .filter(
          (key): key is JobColumnKey =>
            typeof key === "string" && validKeys.has(key as JobColumnKey),
        )
    : [];
  const uniqueSavedKeys = Array.from(new Set(savedKeys));

  const normalized = [
    ...uniqueSavedKeys,
    ...DISPLAY_JOB_COLUMN_KEYS.filter((key) => !uniqueSavedKeys.includes(key)),
  ];

  if (!uniqueSavedKeys.includes("maintenanceDuration")) {
    const currentIndex = normalized.indexOf("maintenanceDuration");
    if (currentIndex !== -1) normalized.splice(currentIndex, 1);
    const reportIndex = normalized.indexOf("reportNo");
    normalized.splice(
      reportIndex === -1 ? normalized.length : reportIndex,
      0,
      "maintenanceDuration",
    );
  }

  return normalized;
}

/* =========================================================
   Supabase Connection

   Both tables use the SAME Supabase project, URL and publishable key.
   Only change these two table names if your Supabase names are different.
========================================================= */

const JOBS_TABLE = "aec-dashboard";
const STAFF_TABLE = "aec-dashboard-admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

type SupabaseRow = Record<string, unknown>;

const JOB_FIELD_ALIASES: Record<JobColumnKey, string[]> = {
  jobId: ["job_id", "jobId", "Job ID", "id"],
  jobInDateTime: ["job_in_datetime", "jobInDateTime", "Job In Date & Time"],
  salesPerson: ["sales_person", "salesPerson", "Sales Person"],
  salesPersonPhone: [
    "sales_person_phone",
    "salesPersonPhone",
    "Sales Person Phone",
  ],
  customerName: ["customer_name", "customerName", "Customer Name"],
  customerPhone: [
    "customer_phone",
    "customer phone",
    "customerPhone",
    "Customer Phone",
  ],
  customerCompanyName: [
    "customer_company_name",
    "customerCompanyName",
    "Customer Company Name",
  ],
  assignedTechnician: [
    "assigned_engineer",
    "assignedEngineer",
    "Assigned Engineer",
    "assigned_technician",
    "assignedTechnician",
    "Assigned Technician",
  ],
  technicianPhone: ["technician_phone", "technicianPhone", "Technician Phone"],
  description: [
    "description_/_item",
    "description/item",
    "description_item",
    "description",
    "Description / Item",
  ],
  status: ["status", "Status"],
  jobStartDateTime: [
    "job_start_datetime",
    "in_progress_start_datetime",
    "jobStartDateTime",
    "inProgressStartDateTime",
    "Job Start Date & Time",
    "In Progress Start Date & Time",
  ],
  statusRemark: [
    "status_remark_issue",
    "status_remark",
    "statusRemark",
    "Status Remark / Issue",
  ],
  maintenanceDuration: [
    "maintenance_duration",
    "maintenanceDuration",
    "Maintenance Duration",
  ],
  jobCompleteDateTime: [
    "job_complete_datetime",
    "jobCompleteDateTime",
    "Job Complete Date & Time",
  ],
  invoiceNo: ["invoice_no", "invoiceNo", "Invoice No."],
  reportNo: ["report_no", "reportNo", "Report No."],
  collectionDateTime: [
    "collection_datetime",
    "collectionDateTime",
    "Collection Date & Time",
  ],
};

function findExistingColumn(row: SupabaseRow, aliases: string[]) {
  return aliases.find((key) => Object.prototype.hasOwnProperty.call(row, key));
}

function readText(row: SupabaseRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (value !== null && value !== undefined) {
      return String(value);
    }
  }

  return "";
}

function normalizeDateTime(value: string) {
  if (!value.trim()) return "";

  /*
    Keep the complete Supabase value.

    Some date columns contain an ISO value such as:
      2026-05-25T16:35:00

    Other existing rows contain a display value such as:
      25 May 2026, 04:35 PM

    The previous `.slice(0, 16)` truncated the second format to
    `25 May 2026, 04:` and permanently removed its minutes and AM/PM
    from the Dashboard state.
  */
  return value.trim();
}

function normalizeJobStatus(value: string): JobStatus {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, JobStatus> = {
    "new job": "New Jobs",
    "new jobs": "New Jobs",
    "pending job": "Pending Jobs",
    "pending jobs": "Pending Jobs",
    "pending customer reply": "Pending Customer Replies",
    "pending customer replies": "Pending Customer Replies",
    "maintenance and renewal": "Maintenance and Renewals",
    "maintenance and renewals": "Maintenance and Renewals",
    "maintenance & renewal": "Maintenance and Renewals",
    "maintenance & renewals": "Maintenance and Renewals",
    "in progress": "In Progress",
    "claim warranty": "Claim Warranty",
    "pending invoice": "Pending Invoice",
    "pending parts": "Pending Parts",
    "pending quotation": "Pending Quotation",
    "pending spare parts": "Pending Parts",
    "pending spec parts": "Pending Parts",
    canceled: "Cancelled",
    cancelled: "Cancelled",
    complete: "Complete",
    completed: "Complete",
  };

  return aliases[normalized] || "New Jobs";
}

function mapJobRow(row: SupabaseRow): Job {
  const rowKeyColumn =
    findExistingColumn(row, ["id", "job_id", "jobId", "Job ID"]) || "job_id";

  return {
    jobId: readText(row, ["job_id", "jobId", "Job ID", "id"]),
    jobInDateTime: normalizeDateTime(
      readText(row, ["job_in_datetime", "jobInDateTime", "Job In Date & Time"]),
    ),
    salesPerson: readText(row, ["sales_person", "salesPerson", "Sales Person"]),
    salesPersonPhone: readText(row, [
      "sales_person_phone",
      "salesPersonPhone",
      "Sales Person Phone",
    ]),
    customerName: readText(row, [
      "customer_name",
      "customerName",
      "Customer Name",
    ]),
    customerPhone: readText(row, [
      "customer_phone",
      "customer phone",
      "customerPhone",
      "Customer Phone",
    ]),
    customerCompanyName: readText(row, [
      "customer_company_name",
      "customerCompanyName",
      "Customer Company Name",
    ]),
    assignedTechnician: readText(row, [
      "assigned_engineer",
      "assignedEngineer",
      "Assigned Engineer",
      "assigned_technician",
      "assignedTechnician",
      "Assigned Technician",
    ]),
    technicianPhone: readText(row, [
      "technician_phone",
      "technicianPhone",
      "Technician Phone",
    ]),
    description: readText(row, [
      "description_/_item",
      "description/item",
      "description_item",
      "description",
      "Description / Item",
    ]),
    status: normalizeJobStatus(readText(row, ["status", "Status"])),
    jobStartDateTime: normalizeDateTime(
      readText(row, [
        "job_start_datetime",
        "in_progress_start_datetime",
        "jobStartDateTime",
        "inProgressStartDateTime",
        "Job Start Date & Time",
        "In Progress Start Date & Time",
      ]),
    ),
    statusRemark: readText(row, [
      "status_remark_issue",
      "status_remark",
      "statusRemark",
      "Status Remark / Issue",
    ]),
    maintenanceDuration: readText(row, [
      "maintenance_duration",
      "maintenanceDuration",
      "Maintenance Duration",
    ]),
    jobCompleteDateTime: normalizeDateTime(
      readText(row, [
        "job_complete_datetime",
        "jobCompleteDateTime",
        "Job Complete Date & Time",
      ]),
    ),
    invoiceNo: readText(row, ["invoice_no", "invoiceNo", "Invoice No."]),
    reportNo: readText(row, ["report_no", "reportNo", "Report No."]),
    collectionDateTime: normalizeDateTime(
      readText(row, [
        "collection_datetime",
        "collectionDateTime",
        "Collection Date & Time",
      ]),
    ),
    _rowKeyColumn: rowKeyColumn,
    _rowKeyValue: row[rowKeyColumn],
    _sourceRow: row,
  };
}

/* =========================================================
   Settings
========================================================= */

type DashboardSettings = {
  logoDataUrl: string;
  companyName: string;
  dashboardTitle: string;
  administratorName: string;
  topmanagementSetting: string;
  appearance: "system" | "light" | "dark";
  appearanceDefaultVersion: number;
  language: string;
  system: string;
  showStageLegend: boolean;
  showSummary: boolean;
  autoCompleteDate: boolean;
  columnOrder: JobColumnKey[];
  defaultColumnOrder: JobColumnKey[];
  dashboardModuleOrder: DashboardModuleKey[];
  statisticCardOrder: BoardJobStatus[];
  brandingDefaultVersion: number;
};

const SETTINGS_ACCESS_ROLES = [
  "Owner",
  "Founder",
  "Principal",
  "General Manager",
] as const;

function canManageSettings(role: string) {
  return (SETTINGS_ACCESS_ROLES as readonly string[]).includes(role);
}

/*
  DEFAULT HEADER LOGO
  If you prefer to change the default placeholder manually, replace the
  data URL below. Users can also upload a logo from Settings.
*/
const DEFAULT_LOGO_DATA_URL =
  "data:image/jpeg;base64,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";
const BRANDING_DEFAULT_VERSION = 4;

const DEFAULT_SETTINGS: DashboardSettings = {
  logoDataUrl: DEFAULT_LOGO_DATA_URL,
  companyName: "AEC COMPUTER SOLUTIONS (M) SDN BHD",
  dashboardTitle: "AI Task Management Dashboard",
  administratorName: "Administrator",
  topmanagementSetting: "Top Management Setting",
  appearance: "light",
  appearanceDefaultVersion: 2,
  language: "default",
  system: "default",
  showStageLegend: true,
  showSummary: true,
  autoCompleteDate: true,
  columnOrder: DEFAULT_COLUMN_ORDER,
  defaultColumnOrder: DEFAULT_COLUMN_ORDER,
  dashboardModuleOrder: DEFAULT_DASHBOARD_MODULE_ORDER,
  statisticCardOrder: DEFAULT_STATISTIC_CARD_ORDER,
  brandingDefaultVersion: BRANDING_DEFAULT_VERSION,
};

const SETTINGS_STORAGE_KEY = "aec-dashboard-settings";
const LAYOUT_STORAGE_KEY = "aec-dashboard-layout-settings-v1";
const SHARED_LAYOUT_PREFIX = "aec-dashboard-shared-layout-v1:";

type PersistedDashboardLayout = Pick<
  DashboardSettings,
  "dashboardModuleOrder" | "statisticCardOrder"
>;

type SharedDashboardLayout = PersistedDashboardLayout & {
  systemValue: string;
};

function readSharedDashboardLayout(value: unknown): SharedDashboardLayout | null {
  if (typeof value !== "string" || !value.startsWith(SHARED_LAYOUT_PREFIX)) {
    return null;
  }

  try {
    return JSON.parse(
      decodeURIComponent(value.slice(SHARED_LAYOUT_PREFIX.length)),
    ) as SharedDashboardLayout;
  } catch {
    return null;
  }
}

function hasSharedDashboardLayout(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<DashboardSettings>;

  return Boolean(
    readSharedDashboardLayout(settings.system) ||
      Array.isArray(settings.dashboardModuleOrder) ||
      Array.isArray(settings.statisticCardOrder),
  );
}

function readPersistedDashboardLayout(): Partial<PersistedDashboardLayout> {
  if (typeof window === "undefined") return {};

  try {
    const value = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    return value ? (JSON.parse(value) as Partial<PersistedDashboardLayout>) : {};
  } catch {
    return {};
  }
}

function writePersistedDashboardLayout(settings: DashboardSettings) {
  const layout: PersistedDashboardLayout = {
    dashboardModuleOrder: settings.dashboardModuleOrder,
    statisticCardOrder: settings.statisticCardOrder,
  };

  window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

function mergePersistedDashboardLayout(
  settings: DashboardSettings,
): DashboardSettings {
  const layout = readPersistedDashboardLayout();

  return {
    ...settings,
    dashboardModuleOrder: normalizeOrderedKeys(
      layout.dashboardModuleOrder ?? settings.dashboardModuleOrder,
      DASHBOARD_MODULE_KEYS,
    ),
    statisticCardOrder: normalizeStatisticCardOrder(
      layout.statisticCardOrder ?? settings.statisticCardOrder,
    ),
  };
}

function normalizeSettings(value: unknown): DashboardSettings {
  const saved =
    value && typeof value === "object"
      ? (value as Partial<DashboardSettings>)
      : {};
  const sharedLayout = readSharedDashboardLayout(saved.system);

  const shouldApplyBrandingDefault =
    typeof saved.brandingDefaultVersion !== "number" ||
    saved.brandingDefaultVersion < BRANDING_DEFAULT_VERSION;

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    logoDataUrl: shouldApplyBrandingDefault
      ? DEFAULT_SETTINGS.logoDataUrl
      : saved.logoDataUrl || DEFAULT_SETTINGS.logoDataUrl,
    companyName: shouldApplyBrandingDefault
      ? DEFAULT_SETTINGS.companyName
      : saved.companyName || DEFAULT_SETTINGS.companyName,
    brandingDefaultVersion: BRANDING_DEFAULT_VERSION,
    appearance:
      saved.appearance === "dark" ||
      saved.appearance === "system" ||
      saved.appearance === "light"
        ? saved.appearance
        : DEFAULT_SETTINGS.appearance,
    system: sharedLayout?.systemValue ?? saved.system ?? DEFAULT_SETTINGS.system,
    columnOrder: normalizeColumnOrder(saved.columnOrder),
    defaultColumnOrder: normalizeColumnOrder(saved.defaultColumnOrder),
    dashboardModuleOrder: normalizeOrderedKeys(
      sharedLayout?.dashboardModuleOrder ?? saved.dashboardModuleOrder,
      DASHBOARD_MODULE_KEYS,
    ),
    statisticCardOrder: normalizeStatisticCardOrder(
      sharedLayout?.statisticCardOrder ?? saved.statisticCardOrder,
    ),
  };
}

/* =========================================================
   Dashboard Icons
========================================================= */

function StaffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function PositionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
      <path d="M10 12v2h4v-2" />
    </svg>
  );
}

function StatusIcon({
  status,
  sizeClass = "h-6 w-6",
}: {
  status: JobStatus;
  sizeClass?: string;
}) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: sizeClass,
    "aria-hidden": true,
  };

  if (status === "New Jobs") {
    return (
      <svg {...commonProps}>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M3 12h18" />
        <path d="M10 12v2h4v-2" />
      </svg>
    );
  }

  if (status === "Pending Jobs" || status === "In Progress") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }

  if (status === "Pending Customer Replies") {
    return (
      <svg {...commonProps}>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        <path d="M8 9h8" />
        <path d="M8 13h5" />
      </svg>
    );
  }

  if (status === "Maintenance and Renewals") {
    return (
      <svg {...commonProps}>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <path d="M3 9h18" />
        <path d="M8 15a4 4 0 0 1 7-2" />
        <path d="M15 10v3h-3" />
        <path d="M16 15a4 4 0 0 1-7 2" />
        <path d="M9 20v-3h3" />
      </svg>
    );
  }

  if (status === "Claim Warranty") {
    return (
      <svg {...commonProps}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }

  if (status === "Pending Invoice") {
    return (
      <svg {...commonProps}>
        <path d="M6 2h9l4 4v16H6Z" />
        <path d="M14 2v5h5" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    );
  }

  if (status === "Pending Parts") {
    return (
      <svg {...commonProps}>
        <path d="m14.7 6.3 3-3a4.2 4.2 0 0 1-5.5 5.5l-6.9 6.9a2.1 2.1 0 1 0 3 3l6.9-6.9a4.2 4.2 0 0 0 5.5-5.5l-3 3Z" />
      </svg>
    );
  }

  if (status === "Pending Quotation") {
    return (
      <svg {...commonProps}>
        <path d="M5 3h14v18H5Z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="M9 16h3" />
      </svg>
    );
  }

  if (status === "Cancelled") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6" />
        <path d="m15 9-6 6" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}

/* =========================================================
   Job Information Sheet
========================================================= */

function ModuleCollapseButton({
  moduleName,
  isCollapsed,
  onToggle,
}: {
  moduleName: string;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`${isCollapsed ? "Expand" : "Minimize"} ${moduleName}`}
      title={`${isCollapsed ? "Expand" : "Minimize"} ${moduleName}`}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg font-semibold leading-none text-slate-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
    >
      {isCollapsed ? "+" : "−"}
    </button>
  );
}

function JobDataTable({
  jobs,
  staffOptions,
  columnOrder,
  onOpenJob,
  isCollapsed,
  onToggleCollapse,
}: {
  jobs: Job[];
  staffOptions: string[];
  columnOrder: JobColumnKey[];
  onOpenJob: (job: Job) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState(1);
  const [sortColumn, setSortColumn] =
    useState<JobColumnKey | null>("statusRemark");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [filterIsOpen, setFilterIsOpen] = useState(false);
  const [selectedStaffFilters, setSelectedStaffFilters] = useState<string[]>(
    [],
  );
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<
    BoardJobStatus[]
  >([]);

  useEffect(() => {
    const savedDefault = readPaginationDefaults()["job-information-sheet"];

    if (savedDefault) {
      setPageSize(savedDefault);
      setPage(1);
    }
  }, []);

  useEffect(() => {
    setPage(1);
  }, [jobs]);

  useEffect(() => {
    setSelectedStaffFilters((current) =>
      current.filter((selectedName) =>
        staffOptions.some(
          (staffName) =>
            staffName.toLocaleLowerCase() === selectedName.toLocaleLowerCase(),
        ),
      ),
    );
  }, [staffOptions]);

  useEffect(() => {
    setPage(1);
  }, [selectedStaffFilters, selectedStatusFilters]);

  const visibleColumns = columnOrder.filter(
    (column) => !HIDDEN_JOB_PHONE_COLUMNS.has(column),
  );

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const staffMatches =
        selectedStaffFilters.length === 0 ||
        selectedStaffFilters.some((selectedName) => {
          const normalizedName = selectedName.trim().toLocaleLowerCase();

          return (
            job.salesPerson
              .trim()
              .toLocaleLowerCase()
              .includes(normalizedName) ||
            job.assignedTechnician
              .trim()
              .toLocaleLowerCase()
              .includes(normalizedName)
          );
        });
      const statusMatches =
        selectedStatusFilters.length === 0 ||
        selectedStatusFilters.includes(job.status as BoardJobStatus);

      return staffMatches && statusMatches;
    });
  }, [jobs, selectedStaffFilters, selectedStatusFilters]);

  const sortedJobs = useMemo(() => {
    if (!sortColumn) return filteredJobs;

    return filteredJobs
      .map((job, originalIndex) => ({ job, originalIndex }))
      .sort((a, b) => {
        const comparison = compareJobsByColumn(
          a.job,
          b.job,
          sortColumn,
          sortDirection,
        );

        return comparison || a.originalIndex - b.originalIndex;
      })
      .map(({ job }) => job);
  }, [filteredJobs, sortColumn, sortDirection]);

  const activeFilterCount =
    selectedStaffFilters.length + selectedStatusFilters.length;

  function toggleStaffFilter(staffName: string) {
    setSelectedStaffFilters((current) =>
      current.includes(staffName)
        ? current.filter((name) => name !== staffName)
        : [...current, staffName],
    );
  }

  function toggleStatusFilter(status: BoardJobStatus) {
    setSelectedStatusFilters((current) =>
      current.includes(status)
        ? current.filter((selectedStatus) => selectedStatus !== status)
        : [...current, status],
    );
  }

  function clearTableFilters() {
    setSelectedStaffFilters([]);
    setSelectedStatusFilters([]);
  }

  function changeSort(column: JobColumnKey) {
    setPage(1);

    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumn(column);
    setSortDirection("asc");
  }
  const totalPages =
    pageSize === "Full"
      ? 1
      : Math.max(1, Math.ceil(sortedJobs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleJobs =
    pageSize === "Full"
      ? sortedJobs
      : sortedJobs.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Job Information Sheet
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Complete read-only job records using the existing AEC fields
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isCollapsed && (
            <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              {filteredJobs.length} {filteredJobs.length === 1 ? "Job" : "Jobs"}
            </span>
          )}
          <ModuleCollapseButton
            moduleName="Job Information Sheet"
            isCollapsed={isCollapsed}
            onToggle={onToggleCollapse}
          />
        </div>
      </div>

      {!isCollapsed && (
        <>
      <div className="relative z-30 flex min-h-14 items-center justify-end border-b border-slate-100 bg-white px-4 py-2.5 sm:px-5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterIsOpen((current) => !current)}
            aria-expanded={filterIsOpen}
            aria-controls="job-information-filter-panel"
            className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-blue-500/10 ${
              activeFilterCount > 0
                ? "border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            }`}
          >
            <FilterIcon />
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-blue-700">
                {activeFilterCount}
              </span>
            )}
          </button>

          {filterIsOpen && (
            <div
              id="job-information-filter-panel"
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(44rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
              onKeyDown={(event) => {
                if (event.key === "Escape") setFilterIsOpen(false);
              }}
            >
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">
                      Staff
                    </p>
                    <span className="text-[11px] font-medium text-slate-400">
                      Salesperson or Engineer
                    </span>
                  </div>

                  <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                    {staffOptions.length > 0 ? (
                      staffOptions.map((staffName) => (
                        <label
                          key={staffName}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-slate-700 transition hover:bg-blue-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedStaffFilters.includes(staffName)}
                            onChange={() => toggleStaffFilter(staffName)}
                            className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                          />
                          <span className="min-w-0 break-words font-medium">
                            {staffName}
                          </span>
                        </label>
                      ))
                    ) : (
                      <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-400">
                        No staff available
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-sm font-semibold text-slate-900">
                    Status
                  </p>

                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
                    {JOB_STATUSES.map((status) => (
                      <label
                        key={status}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-semibold transition hover:brightness-95 ${statusStyles[status].calendar}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedStatusFilters.includes(status)}
                          onChange={() => toggleStatusFilter(status)}
                          className="h-4 w-4 shrink-0 rounded border-current accent-blue-600"
                        />
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusStyles[status].dot}`}
                        />
                        <span>{displayLabels[status]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={clearTableFilters}
                  disabled={activeFilterCount === 0}
                  className="h-9 rounded-lg px-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear All
                </button>

                <button
                  type="button"
                  onClick={() => setFilterIsOpen(false)}
                  className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[2800px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {visibleColumns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="whitespace-nowrap border-r border-slate-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600 last:border-r-0"
                >
                  <button
                    type="button"
                    onClick={() => changeSort(column)}
                    aria-label={`Sort ${JOB_COLUMN_LABELS[column]} ${
                      sortColumn === column && sortDirection === "asc"
                        ? "descending"
                        : "ascending"
                    }`}
                    title={`Sort ${JOB_COLUMN_LABELS[column]}`}
                    className={`inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-left transition hover:bg-slate-200/70 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                      sortColumn === column ? "text-blue-700" : ""
                    }`}
                  >
                    <span>{JOB_COLUMN_LABELS[column]}</span>
                    <span
                      aria-hidden="true"
                      className={`text-[12px] ${
                        sortColumn === column
                          ? "font-bold text-blue-600"
                          : "text-slate-400"
                      }`}
                    >
                      {sortColumn === column
                        ? sortDirection === "asc"
                          ? "▲"
                          : "▼"
                        : "⇅"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visibleJobs.length > 0 ? (
              visibleJobs.map((job, index) => {
                return (
                  <tr
                    key={job.jobId}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open job details for ${job.jobId || "job"}`}
                    onClick={() => onOpenJob(job)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenJob(job);
                      }
                    }}
                    className={`cursor-pointer border-b transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/50 ${
                      job.status === "Complete"
                        ? "border-emerald-300 bg-emerald-100 font-medium ring-1 ring-inset ring-emerald-300 hover:bg-emerald-200/80"
                        : job.status === "Cancelled"
                          ? "border-slate-300 bg-slate-200 font-medium ring-1 ring-inset ring-slate-300 hover:bg-slate-300/80"
                        : `border-slate-100 hover:bg-blue-50/40 ${
                            index % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                          }`
                    }`}
                  >
                    {visibleColumns.map((column) => (
                      <JobTableCell
                        key={`${job.jobId}-${column}`}
                        job={job}
                        column={column}
                      />
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="px-5 py-12 text-center text-sm text-slate-400"
                >
                  {activeFilterCount > 0
                    ? "No job records match the selected filters"
                    : "No job records available"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls
        page={safePage}
        totalPages={totalPages}
        pageSize={pageSize}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
        onPrevious={() => setPage(Math.max(1, safePage - 1))}
        onNext={() => setPage(Math.min(totalPages, safePage + 1))}
        onPageChange={setPage}
        onSetAsDefault={() =>
          savePaginationDefault("job-information-sheet", pageSize)
        }
      />
        </>
      )}
    </section>
  );
}

function JobTableCell({ job, column }: { job: Job; column: JobColumnKey }) {
  const styles = statusStyles[job.status];

  if (column === "jobId") {
    return (
      <td className="whitespace-pre-wrap break-words border-r border-slate-100 px-4 py-3 text-sm font-semibold text-blue-600">
        {job.jobId || "-"}
      </td>
    );
  }

  if (column === "status") {
    return (
      <td className="whitespace-nowrap border-r border-slate-100 px-4 py-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${styles.calendar}`}
        >
          <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
          {displayLabels[job.status]}
        </span>
      </td>
    );
  }

  const dateTimeColumns: JobColumnKey[] = [
    "jobInDateTime",
    "jobStartDateTime",
    "jobCompleteDateTime",
    "collectionDateTime",
  ];
  const value = dateTimeColumns.includes(column)
    ? formatDisplayDateTime(job[column])
    : job[column];

  return (
    <TableCell
      value={value}
      emphasized={false}
      wide={column === "description" || column === "statusRemark"}
    />
  );
}

function TableCell({
  value,
  emphasized = false,
  wide = false,
}: {
  value?: string;
  emphasized?: boolean;
  wide?: boolean;
}) {
  return (
    <td
      className={`whitespace-pre-wrap break-words border-r border-slate-100 px-4 py-3 text-sm last:border-r-0 ${
        wide ? "min-w-[240px]" : ""
      } ${emphasized ? "font-semibold text-slate-900" : "text-slate-600"}`}
    >
      {value?.trim() || "-"}
    </td>
  );
}

function PaginationControls({
  page,
  totalPages,
  pageSize,
  onPageSizeChange,
  onPrevious,
  onNext,
  onPageChange,
  onSetAsDefault,
}: {
  page: number;
  totalPages: number;
  pageSize: PageSize;
  onPageSizeChange: (pageSize: PageSize) => void;
  onPrevious: () => void;
  onNext: () => void;
  onPageChange: (page: number) => void;
  onSetAsDefault: () => boolean;
}) {
  const [pageInput, setPageInput] = useState(String(page));
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    setPageInput(String(page));
  }, [page, totalPages]);

  useEffect(() => {
    if (!saveMessage) return;

    const timer = window.setTimeout(() => setSaveMessage(""), 2400);
    return () => window.clearTimeout(timer);
  }, [saveMessage]);

  function commitPageInput() {
    const requestedPage = Number.parseInt(pageInput, 10);
    const nextPage = Number.isFinite(requestedPage)
      ? Math.min(totalPages, Math.max(1, requestedPage))
      : page;

    setPageInput(String(nextPage));
    onPageChange(nextPage);
  }

  return (
    <div className="flex flex-col items-end gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:px-5">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => {
            setSaveMessage(
              onSetAsDefault() ? "Save successfully" : "Unable to save",
            );
          }}
          className="h-8 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-3 text-[11px] font-semibold text-blue-700 transition hover:border-blue-400 hover:bg-blue-100"
        >
          Set as Default
        </button>

        {PAGE_SIZE_OPTIONS.map((option) => {
          const isSelected = option === pageSize;

          return (
            <button
              key={String(option)}
              type="button"
              onClick={() => onPageSizeChange(option)}
              className={`h-8 min-w-9 rounded-lg border px-2.5 text-xs font-semibold transition ${
                isSelected
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              }`}
              aria-pressed={isSelected}
            >
              {option}
            </button>
          );
        })}

        {saveMessage && (
          <span
            className={`whitespace-nowrap px-1 text-[11px] font-semibold ${
              saveMessage === "Save successfully"
                ? "text-emerald-600"
                : "text-rose-600"
            }`}
            role="status"
          >
            {saveMessage}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onPrevious}
          disabled={page <= 1}
          aria-label="Previous page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-600"
        >
          <ChevronLeftIcon />
        </button>

        <div className="flex min-w-[82px] items-center justify-center gap-1 text-xs font-semibold text-slate-500">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pageInput}
            onChange={(event) => {
              const nextValue = event.target.value.replace(/\D/g, "");
              setPageInput(nextValue);
            }}
            onBlur={commitPageInput}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitPageInput();
                event.currentTarget.blur();
              }
            }}
            aria-label={`Current page, ${totalPages} pages total`}
            className="h-8 w-10 rounded-lg border border-slate-200 bg-white px-1 text-center text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
          <span aria-hidden="true">/</span>
          <span>{totalPages}</span>
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-600"
        >
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   Staff Directory
========================================================= */

type Staff = {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  employmentStatus: "Active" | "Terminated";
  lastDayWorked: string;
};

function mapStaffRow(row: SupabaseRow, index: number): Staff {
  const rawStatus = readText(row, ["status", "Status"]).trim().toLowerCase();
  const lastDayWorked = readText(row, [
    "last_day_work",
    "last_day_worked",
    "last day work",
    "last day worked",
    "Last Day Work",
    "Last Day Worked",
  ]).trim();

  return {
    id:
      readText(row, ["id", "staff_id", "staffId", "Staff ID"]) ||
      `staff-${index}`,
    name: readText(row, ["name", "staff_name", "staffName", "Name"]),
    phone: readText(row, [
      "phone",
      "phone_number",
      "phoneNumber",
      "Phone Number",
    ]),
    email: readText(row, ["email", "Email"]),
    role: readText(row, ["role", "Role"]),
    employmentStatus:
      lastDayWorked || rawStatus !== "active" ? "Terminated" : "Active",
    lastDayWorked,
  };
}

/* =========================================================
   Status Settings
========================================================= */

const statusStyles: Record<
  JobStatus,
  {
    dot: string;
    badge: string;
    numberBadge: string;
    leftBorder: string;
    iconBackground: string;
    selectFocus: string;
    calendar: string;
    customerBadge: string;
    hex: string;
  }
> = {
  "New Jobs": {
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700",
    numberBadge: "bg-blue-500 text-white",
    leftBorder: "border-l-blue-500",
    iconBackground: "bg-blue-500",
    selectFocus: "focus:border-blue-500 focus:ring-blue-500/10",
    calendar:
      "border-blue-700 bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/30",
    customerBadge:
      "border border-blue-500 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200",
    hex: "#3b82f6",
  },
  "Pending Jobs": {
    dot: "bg-pink-500",
    badge: "bg-pink-50 text-pink-700",
    numberBadge: "bg-pink-500 text-white",
    leftBorder: "border-l-pink-500",
    iconBackground: "bg-pink-500",
    selectFocus: "focus:border-pink-500 focus:ring-pink-500/10",
    calendar:
      "border-pink-700 bg-pink-600 text-white shadow-sm ring-1 ring-pink-500/30",
    customerBadge:
      "border border-pink-500 bg-pink-100 text-pink-800 shadow-sm ring-1 ring-pink-200",
    hex: "#ec4899",
  },
  "Pending Customer Replies": {
    dot: "bg-indigo-600",
    badge: "bg-indigo-50 text-indigo-700",
    numberBadge: "bg-indigo-600 text-white",
    leftBorder: "border-l-indigo-600",
    iconBackground: "bg-indigo-600",
    selectFocus: "focus:border-indigo-600 focus:ring-indigo-600/10",
    calendar: "border-indigo-300 bg-indigo-100 text-indigo-800",
    customerBadge:
      "border border-indigo-500 bg-indigo-100 text-indigo-800 shadow-sm ring-1 ring-indigo-200",
    hex: "#4f46e5",
  },
  "Maintenance and Renewals": {
    dot: "bg-teal-500",
    badge: "bg-teal-50 text-teal-700",
    numberBadge: "bg-teal-500 text-white",
    leftBorder: "border-l-teal-500",
    iconBackground: "bg-teal-500",
    selectFocus: "focus:border-teal-500 focus:ring-teal-500/10",
    calendar: "border-teal-300 bg-teal-100 text-teal-800",
    customerBadge:
      "border border-teal-500 bg-teal-100 text-teal-800 shadow-sm ring-1 ring-teal-200",
    hex: "#14b8a6",
  },
  "In Progress": {
    dot: "bg-violet-500",
    badge: "bg-violet-50 text-violet-700",
    numberBadge: "bg-violet-500 text-white",
    leftBorder: "border-l-violet-500",
    iconBackground: "bg-violet-500",
    selectFocus: "focus:border-violet-500 focus:ring-violet-500/10",
    calendar:
      "border-violet-700 bg-violet-600 text-white shadow-sm ring-1 ring-violet-500/30",
    customerBadge:
      "border border-violet-500 bg-violet-100 text-violet-800 shadow-sm ring-1 ring-violet-200",
    hex: "#8b5cf6",
  },
  "Claim Warranty": {
    dot: "bg-violet-500",
    badge: "bg-violet-50 text-violet-700",
    numberBadge: "bg-violet-500 text-white",
    leftBorder: "border-l-violet-500",
    iconBackground: "bg-violet-500",
    selectFocus: "focus:border-violet-500 focus:ring-violet-500/10",
    calendar: "border-violet-300 bg-violet-100 text-violet-800",
    customerBadge:
      "border border-violet-500 bg-violet-100 text-violet-800 shadow-sm ring-1 ring-violet-200",
    hex: "#8b5cf6",
  },
  "Pending Invoice": {
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700",
    numberBadge: "bg-amber-500 text-white",
    leftBorder: "border-l-amber-500",
    iconBackground: "bg-amber-500",
    selectFocus: "focus:border-amber-500 focus:ring-amber-500/10",
    calendar: "border-amber-300 bg-amber-100 text-amber-800",
    customerBadge:
      "border border-amber-500 bg-amber-100 text-amber-800 shadow-sm ring-1 ring-amber-200",
    hex: "#f59e0b",
  },
  "Pending Parts": {
    dot: "bg-orange-500",
    badge: "bg-orange-50 text-orange-700",
    numberBadge: "bg-orange-500 text-white",
    leftBorder: "border-l-orange-500",
    iconBackground: "bg-orange-500",
    selectFocus: "focus:border-orange-500 focus:ring-orange-500/10",
    calendar: "border-orange-300 bg-orange-100 text-orange-800",
    customerBadge:
      "border border-orange-500 bg-orange-100 text-orange-800 shadow-sm ring-1 ring-orange-200",
    hex: "#f97316",
  },
  "Pending Quotation": {
    dot: "bg-cyan-500",
    badge: "bg-cyan-50 text-cyan-700",
    numberBadge: "bg-cyan-500 text-white",
    leftBorder: "border-l-cyan-500",
    iconBackground: "bg-cyan-500",
    selectFocus: "focus:border-cyan-500 focus:ring-cyan-500/10",
    calendar: "border-cyan-300 bg-cyan-100 text-cyan-800",
    customerBadge:
      "border border-cyan-500 bg-cyan-100 text-cyan-800 shadow-sm ring-1 ring-cyan-200",
    hex: "#06b6d4",
  },
  Cancelled: {
    dot: "bg-slate-500",
    badge: "bg-slate-200 text-slate-700",
    numberBadge: "bg-slate-500 text-white",
    leftBorder: "border-l-slate-500",
    iconBackground: "bg-slate-500",
    selectFocus: "focus:border-slate-500 focus:ring-slate-500/10",
    calendar: "border-slate-400 bg-slate-200 text-slate-800",
    customerBadge:
      "border border-slate-400 bg-slate-200 text-slate-800 shadow-sm ring-1 ring-slate-300",
    hex: "#64748b",
  },
  Complete: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700",
    numberBadge: "bg-emerald-500 text-white",
    leftBorder: "border-l-emerald-500",
    iconBackground: "bg-emerald-500",
    selectFocus: "focus:border-emerald-500 focus:ring-emerald-500/10",
    calendar: "border-emerald-300 bg-emerald-100 text-emerald-800",
    customerBadge:
      "border border-emerald-500 bg-emerald-100 text-emerald-800 shadow-sm ring-1 ring-emerald-200",
    hex: "#10b981",
  },
};

const displayLabels: Record<JobStatus, string> = {
  "New Jobs": "New Jobs",
  "Pending Jobs": "Pending Jobs",
  "Pending Customer Replies": "Pending Customer Replies",
  "Maintenance and Renewals": "Maintenance and Renewals",
  "In Progress": "In Progress",
  "Claim Warranty": "Claim Warranty",
  "Pending Parts": "Pending Parts",
  "Pending Quotation": "Pending Quotation",
  "Pending Invoice": "Pending Invoice",
  Cancelled: "Cancelled",
  Complete: "Completed",
};

const statisticLabels: Record<BoardJobStatus, string> = {
  "New Jobs": "New Jobs",
  "Pending Jobs": "Pending Jobs",
  "Pending Customer Replies": "Pending Customer Replies",
  "Maintenance and Renewals": "Maintenance and Renewals",
  "Claim Warranty": "Claim Warranty",
  "Pending Parts": "Pending Parts",
  "Pending Quotation": "Pending Quotation",
  "Pending Invoice": "Pending Invoice",
  Cancelled: "Cancelled",
  Complete: "Completed",
};

const distributionLabels: Record<BoardJobStatus, string> = {
  "New Jobs": "New Jobs",
  "Pending Jobs": "Pending Jobs",
  "Pending Customer Replies": "Pending Customer Replies",
  "Maintenance and Renewals": "Maintenance and Renewals",
  "Claim Warranty": "Claim Warranty",
  "Pending Parts": "Pending Parts",
  "Pending Quotation": "Pending Quotation",
  "Pending Invoice": "Pending Invoice",
  Cancelled: "Cancelled",
  Complete: "Completed",
};

const statusDescriptions: Record<BoardJobStatus, string> = {
  "New Jobs": "Newly created jobs",
  "Pending Jobs": "Jobs waiting for the next action",
  "Pending Customer Replies": "Waiting for a customer response",
  "Maintenance and Renewals": "Maintenance and renewal work",
  "Claim Warranty": "Jobs under warranty claim",
  "Pending Parts": "Waiting for required parts",
  "Pending Quotation": "Waiting for quotation approval",
  "Pending Invoice": "Waiting for invoice processing",
  Cancelled: "Cancelled jobs",
  Complete: "Successfully completed jobs",
};

const WEEK_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const SHORT_WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* =========================================================
   Helper Functions
========================================================= */

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getJobDateKey(jobDateTime?: string) {
  if (!jobDateTime) return "";

  const parts = parseDateTimeParts(jobDateTime);

  if (!parts) return "";

  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
};

const MONTH_NUMBER_BY_NAME: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function convertTo24Hour(hour: number, meridiem?: string) {
  const normalizedMeridiem = meridiem?.toUpperCase();

  if (normalizedMeridiem === "AM") {
    return hour === 12 ? 0 : hour;
  }

  if (normalizedMeridiem === "PM") {
    return hour === 12 ? 12 : hour + 12;
  }

  return hour;
}

function isValidDateTimeParts(parts: DateTimeParts) {
  const hour = parts.hour ?? 0;
  const minute = parts.minute ?? 0;

  if (
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return false;
  }

  const testDate = new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    minute,
  );

  return (
    testDate.getFullYear() === parts.year &&
    testDate.getMonth() === parts.month - 1 &&
    testDate.getDate() === parts.day
  );
}

function parseDateTimeParts(value?: string): DateTimeParts | null {
  if (!value?.trim()) return null;

  const normalizedValue = value.trim().replace(/\s+/g, " ");

  /*
    Supabase ISO / SQL formats:
      2026-05-25T16:35:00
      2026-05-25 16:35:00+00
      2026-05-25 04:35 PM
  */
  const isoMatch = normalizedValue.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(AM|PM)?)?/i,
  );

  if (isoMatch) {
    const parts: DateTimeParts = {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
      hour:
        isoMatch[4] === undefined
          ? undefined
          : convertTo24Hour(Number(isoMatch[4]), isoMatch[6]),
      minute: isoMatch[5] === undefined ? undefined : Number(isoMatch[5]),
    };

    return isValidDateTimeParts(parts) ? parts : null;
  }

  /*
    Numeric day-first formats:
      25/05/2026 04:35 PM
      25-05-2026, 16:35
  */
  const numericDayFirstMatch = normalizedValue.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i,
  );

  if (numericDayFirstMatch) {
    const parts: DateTimeParts = {
      year: Number(numericDayFirstMatch[3]),
      month: Number(numericDayFirstMatch[2]),
      day: Number(numericDayFirstMatch[1]),
      hour:
        numericDayFirstMatch[4] === undefined
          ? undefined
          : convertTo24Hour(
              Number(numericDayFirstMatch[4]),
              numericDayFirstMatch[6],
            ),
      minute:
        numericDayFirstMatch[5] === undefined
          ? undefined
          : Number(numericDayFirstMatch[5]),
    };

    return isValidDateTimeParts(parts) ? parts : null;
  }

  /*
    Existing human-readable values:
      25 May 2026, 04:35 PM
      25 May 2026 16:35
  */
  const namedMonthMatch = normalizedValue.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i,
  );

  if (namedMonthMatch) {
    const month =
      MONTH_NUMBER_BY_NAME[namedMonthMatch[2].trim().toLowerCase()];

    if (!month) return null;

    const parts: DateTimeParts = {
      year: Number(namedMonthMatch[3]),
      month,
      day: Number(namedMonthMatch[1]),
      hour:
        namedMonthMatch[4] === undefined
          ? undefined
          : convertTo24Hour(
              Number(namedMonthMatch[4]),
              namedMonthMatch[6],
            ),
      minute:
        namedMonthMatch[5] === undefined
          ? undefined
          : Number(namedMonthMatch[5]),
    };

    return isValidDateTimeParts(parts) ? parts : null;
  }

  return null;
}

function parseDateTime(value?: string) {
  const parts = parseDateTimeParts(value);

  if (!parts) return null;

  const date = new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    0,
    0,
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

type MaintenanceExpiryReminder = {
  job: Job;
  startDate: Date | null;
  expiryDate: Date;
};

const MAINTENANCE_DATE_TOKEN_PATTERN =
  /\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4}/g;

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function subtractCalendarMonths(date: Date, months: number) {
  const targetYear = date.getFullYear();
  const targetMonth = date.getMonth() - months;
  const targetDay = date.getDate();
  const lastDayOfTargetMonth = new Date(
    targetYear,
    targetMonth + 1,
    0,
  ).getDate();

  return new Date(
    targetYear,
    targetMonth,
    Math.min(targetDay, lastDayOfTargetMonth),
  );
}

function addCalendarDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function getMaintenanceExpiryReminder(
  job: Job,
  today: Date,
): MaintenanceExpiryReminder | null {
  const dateTokens = job.maintenanceDuration.match(
    MAINTENANCE_DATE_TOKEN_PATTERN,
  );
  if (!dateTokens?.length) return null;

  const startDate = parseDateTime(dateTokens[0]);
  const expiryDate = parseDateTime(dateTokens[dateTokens.length - 1]);
  if (!expiryDate) return null;

  const todayStart = startOfLocalDay(today);
  const expiryStart = startOfLocalDay(expiryDate);
  const reminderStart = subtractCalendarMonths(expiryStart, 3);
  const overdueEnd = addCalendarDays(expiryStart, 30);
  // Show from three calendar months before expiry through 30 days after
  // expiry. The item disappears automatically on overdue day 31.
  if (todayStart < reminderStart || todayStart > overdueEnd) return null;

  return {
    job,
    startDate: startDate ? startOfLocalDay(startDate) : null,
    expiryDate: expiryStart,
  };
}

function formatMaintenanceDate(date: Date) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getLatestStatusRemarkTime(value?: string) {
  if (!value?.trim()) return null;

  const parsedTimes = value
    .replace(/\\n/g, "\n")
    .split(/\r?\n/)
    .map((line) =>
      parseDateTime(line.trim().replace(/^\[/, ""))?.getTime(),
    )
    .filter((time): time is number => time !== undefined);

  return parsedTimes.length > 0 ? Math.max(...parsedTimes) : null;
}

function compareJobsByNewest(a: Job, b: Job) {
  const aDate = parseDateTime(a.jobInDateTime);
  const bDate = parseDateTime(b.jobInDateTime);
  const aTime = aDate?.getTime() ?? Number.NEGATIVE_INFINITY;
  const bTime = bDate?.getTime() ?? Number.NEGATIVE_INFINITY;

  if (aTime !== bTime) {
    return bTime - aTime;
  }

  return b.jobId.localeCompare(a.jobId, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

const JOB_DATE_COLUMNS = new Set<JobColumnKey>([
  "jobInDateTime",
  "jobStartDateTime",
  "jobCompleteDateTime",
  "collectionDateTime",
]);

const JOB_STATUS_SORT_ORDER: readonly JobStatus[] = [
  "New Jobs",
  "Pending Jobs",
  "Pending Customer Replies",
  "Maintenance and Renewals",
  "In Progress",
  "Claim Warranty",
  "Pending Parts",
  "Pending Quotation",
  "Pending Invoice",
  "Cancelled",
  "Complete",
];

const naturalJobSort = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareJobsByColumn(
  a: Job,
  b: Job,
  column: JobColumnKey,
  direction: "asc" | "desc",
) {
  const multiplier = direction === "asc" ? 1 : -1;
  const aValue = String(a[column] ?? "").trim();
  const bValue = String(b[column] ?? "").trim();

  // Empty values always stay at the bottom in either direction.
  if (!aValue && !bValue) return 0;
  if (!aValue) return 1;
  if (!bValue) return -1;

  if (JOB_DATE_COLUMNS.has(column)) {
    const aTime = parseDateTime(aValue)?.getTime();
    const bTime = parseDateTime(bValue)?.getTime();

    if (aTime !== undefined && bTime !== undefined && aTime !== bTime) {
      return (aTime - bTime) * multiplier;
    }
  }

  if (column === "statusRemark") {
    const aTime = getLatestStatusRemarkTime(aValue);
    const bTime = getLatestStatusRemarkTime(bValue);

    // Remarks without a valid date/time stay at the bottom.
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    if (aTime !== bTime) return (aTime - bTime) * multiplier;
  }

  if (column === "status") {
    const aRank = JOB_STATUS_SORT_ORDER.indexOf(a.status);
    const bRank = JOB_STATUS_SORT_ORDER.indexOf(b.status);

    if (aRank !== bRank) return (aRank - bRank) * multiplier;
  }

  /*
    Natural comparison sorts embedded numbers by value (2 before 10), while
    still handling names, phone numbers, Job IDs, invoices and report IDs as
    case-insensitive text. This avoids treating identifier dots as decimals.
  */
  return naturalJobSort.compare(aValue, bValue) * multiplier;
}

function jobMatchesGlobalSearch(job: Job, query: string) {
  const normalizeSearchText = (value: unknown) =>
    String(value ?? "").normalize("NFKC").toLocaleLowerCase();
  const normalizedQuery = normalizeSearchText(query.trim());

  if (!normalizedQuery) return true;

  const statusAliases: Record<JobStatus, string> = {
    "New Jobs": "new job new jobs",
    "Pending Jobs": "pending job pending jobs",
    "Pending Customer Replies":
      "pending customer reply pending customer replies customer response",
    "Maintenance and Renewals":
      "maintenance and renewal maintenance and renewals renewal",
    "In Progress": "in progress progressing",
    "Claim Warranty": "claim warranty warranty",
    "Pending Parts": "pending part pending parts",
    "Pending Quotation": "pending quotation quotation quote",
    "Pending Invoice": "pending invoice invoiced invoice",
    Cancelled: "cancelled canceled cancel",
    Complete: "complete completed",
  };
  /*
    Search suggestions show "Job ID - Customer Company Name", so matching is
    intentionally limited to fields the user can see and verify there, plus
    Status for the dashboard's status search. This is a literal, contiguous,
    case-insensitive match (Ctrl+F behaviour), not fuzzy/token matching.
  */
  const searchableValues = [
    job.jobId,
    job.customerCompanyName,
    displayLabels[job.status],
    statusAliases[job.status],
  ];

  return searchableValues.some((value) =>
    normalizeSearchText(value).includes(normalizedQuery),
  );
}

function getCalendarCompanyFontSize(companyName?: string) {
  const length = Array.from(companyName?.trim() || "").length;

  if (length > 48) return "7.5pt";
  if (length > 36) return "8pt";
  if (length > 26) return "9pt";

  return "10pt";
}

function isJobScheduledOnDate(job: Job, dateKey: string) {
  /*
    The Calendar is positioned by Job Start Date & Time.
  */
  return getJobDateKey(job.jobStartDateTime) === dateKey;
}

function formatDisplayDateTime(value?: string) {
  if (!value?.trim()) return "-";

  const parts = parseDateTimeParts(value);

  if (!parts) {
    return value.trim();
  }

  const formattedDate = new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(parts.year, parts.month - 1, parts.day));

  if (parts.hour === undefined || parts.minute === undefined) {
    return formattedDate;
  }

  const meridiem = parts.hour >= 12 ? "PM" : "AM";
  const displayHour = parts.hour % 12 || 12;
  const formattedTime = `${String(displayHour).padStart(2, "0")}:${String(
    parts.minute,
  ).padStart(2, "0")} ${meridiem}`;

  return `${formattedDate}, ${formattedTime}`;
}

function getCalendarDays(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstDayPosition = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const requiredWeeks = Math.ceil((firstDayPosition + daysInMonth) / 7);
  const calendarCellCount = Math.max(35, requiredWeeks * 7);

  /*
    The calendar normally displays five rows and automatically
    expands to six rows when the selected month needs the extra
    week. Previous-month and next-month dates remain visible with
    muted styling so every date in the current month is shown.
  */
  return Array.from({ length: calendarCellCount }, (_, index) => {
    const date = new Date(year, month, index - firstDayPosition + 1);

    return {
      date,
      dateKey: formatDateKey(date),
      isCurrentMonth: date.getMonth() === month,
    };
  });
}

function getStartOfWeek(date: Date) {
  const result = new Date(date);
  const currentDay = result.getDay();
  const difference = currentDay === 0 ? -6 : 1 - currentDay;

  result.setDate(result.getDate() + difference);
  result.setHours(0, 0, 0, 0);

  return result;
}

function getWeekDateKeys(date: Date) {
  const startOfWeek = getStartOfWeek(date);

  return Array.from({ length: 7 }, (_, index) => {
    const currentDate = new Date(startOfWeek);
    currentDate.setDate(startOfWeek.getDate() + index);

    return formatDateKey(currentDate);
  });
}

function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />

      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.63.8 1.05 1.45 1.05H21a2 2 0 1 1 0 4h-.1A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* =========================================================
   Main Dashboard
========================================================= */

export default function DashboardPage() {
  const router = useRouter();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [settings, setSettings] = useState<DashboardSettings>(DEFAULT_SETTINGS);
  const [currentUserName, setCurrentUserName] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [currentUserStorageKey, setCurrentUserStorageKey] = useState("");
  const [collapsedModules, setCollapsedModules] =
    useState<CollapsedDashboardModules>(createExpandedDashboardModules);
  const [collapsedBoardStatuses, setCollapsedBoardStatuses] =
    useState<CollapsedBoardStatuses>(createExpandedBoardStatuses);
  const [signingOut, setSigningOut] = useState(false);
  const [systemUsesDarkMode, setSystemUsesDarkMode] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedStaffName, setSelectedStaffName] = useState("");
  const [dataIsLoading, setDataIsLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchHasFocus, setSearchHasFocus] = useState(false);
  const [activeSearchSuggestion, setActiveSearchSuggestion] = useState(-1);
  const [boardPagination, setBoardPagination] =
    useState<BoardPaginationState>(createDefaultBoardPagination);
  const [boardSearch, setBoardSearch] =
    useState<BoardSearchState>(createDefaultBoardSearch);
  const [focusedBoardSearch, setFocusedBoardSearch] =
    useState<BoardJobStatus | null>(null);
  const [highlightedBoardJob, setHighlightedBoardJob] = useState<{
    status: BoardJobStatus;
    jobId: string;
    page: number;
    row: number;
  } | null>(null);

  const [today, setToday] = useState(() => new Date());
  const [calendarDate, setCalendarDate] = useState(() => new Date());

  useEffect(() => {
    let midnightTimer: number | undefined;

    const scheduleNextDayRefresh = () => {
      const now = new Date();
      const nextDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );

      midnightTimer = window.setTimeout(() => {
        setToday(new Date());
        scheduleNextDayRefresh();
      }, nextDay.getTime() - now.getTime() + 1_000);
    };

    scheduleNextDayRefresh();

    return () => {
      if (midnightTimer !== undefined) {
        window.clearTimeout(midnightTimer);
      }
    };
  }, []);

  useEffect(() => {
    setBoardPagination(
      createDefaultBoardPagination(readPaginationDefaults()),
    );
  }, []);

  useEffect(() => {
    if (!selectedJob) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [selectedJob]);

  useEffect(() => {
    let mounted = true;

    async function loadCurrentUser() {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        if (!response.ok) {
          router.replace("/login");
          router.refresh();
          return;
        }

        const result = (await response.json()) as {
          user?: {
            id?: string;
            email?: string;
            phoneNumber?: string;
            name?: string;
            role?: string;
          };
        };
        const name = result.user?.name?.trim();
        const role = result.user?.role?.trim() || "";
        const accountIdentifier =
          result.user?.id?.trim() ||
          result.user?.email?.trim().toLocaleLowerCase() ||
          result.user?.phoneNumber?.trim() ||
          `${name || "user"}|${role}`.toLocaleLowerCase();

        if (!name) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (mounted) {
          setCurrentUserName(name);
          setCurrentUserRole(role);
          setCurrentUserStorageKey(encodeURIComponent(accountIdentifier));
        }
      } catch {
        router.replace("/login");
        router.refresh();
      }
    }

    void loadCurrentUser();

    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!currentUserStorageKey) return;

    try {
      const moduleStorageKey = `${COLLAPSED_MODULES_STORAGE_PREFIX}${currentUserStorageKey}`;
      const boardStorageKey = `${COLLAPSED_BOARD_STATUSES_STORAGE_PREFIX}${currentUserStorageKey}`;
      const saved = window.localStorage.getItem(moduleStorageKey);
      const savedBoardStatuses = window.localStorage.getItem(boardStorageKey);
      setCollapsedModules(
        normalizeCollapsedDashboardModules(saved ? JSON.parse(saved) : null),
      );
      setCollapsedBoardStatuses(
        normalizeCollapsedBoardStatuses(
          savedBoardStatuses ? JSON.parse(savedBoardStatuses) : null,
        ),
      );
    } catch {
      setCollapsedModules(createExpandedDashboardModules());
      setCollapsedBoardStatuses(createExpandedBoardStatuses());
    }
  }, [currentUserStorageKey]);

  function toggleDashboardModule(moduleKey: DashboardModuleKey) {
    if (!currentUserStorageKey) return;

    setCollapsedModules((current) => {
      const next = { ...current, [moduleKey]: !current[moduleKey] };
      const storageKey = `${COLLAPSED_MODULES_STORAGE_PREFIX}${currentUserStorageKey}`;
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  function toggleBoardStatus(status: BoardJobStatus) {
    if (!currentUserStorageKey) return;

    setCollapsedBoardStatuses((current) => {
      const next = { ...current, [status]: !current[status] };
      const storageKey = `${COLLAPSED_BOARD_STATUSES_STORAGE_PREFIX}${currentUserStorageKey}`;
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    if (!currentUserName) return;

    let mounted = true;

    function loadCachedSettings() {
      try {
        const savedSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
        setSettings(
          mergePersistedDashboardLayout(
            normalizeSettings(savedSettings ? JSON.parse(savedSettings) : null),
          ),
        );
      } catch {
        setSettings(mergePersistedDashboardLayout(DEFAULT_SETTINGS));
      }
    }

    async function loadSharedSettings() {
      try {
        const response = await fetch("/api/settings", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Unable to load shared settings.");
        }

        const result = (await response.json()) as { settings?: unknown };
        const cached = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
        const serverHasSharedLayout = hasSharedDashboardLayout(result.settings);
        const normalizedSettings = normalizeSettings(
          result.settings ?? (cached ? JSON.parse(cached) : null),
        );
        const nextSettings = serverHasSharedLayout
          ? normalizedSettings
          : mergePersistedDashboardLayout(normalizedSettings);

        if (mounted) {
          setSettings(nextSettings);
          if (serverHasSharedLayout) {
            writePersistedDashboardLayout(nextSettings);
          }
          window.localStorage.setItem(
            SETTINGS_STORAGE_KEY,
            JSON.stringify(nextSettings),
          );
        }
      } catch {
        if (mounted) loadCachedSettings();
      }
    }

    function handleStorage(event: StorageEvent) {
      if (
        event.key === SETTINGS_STORAGE_KEY ||
        event.key === LAYOUT_STORAGE_KEY
      ) {
        loadCachedSettings();
      }
    }

    loadCachedSettings();
    void loadSharedSettings();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("aec-settings-updated", loadCachedSettings);
    window.addEventListener("focus", loadSharedSettings);
    window.addEventListener("pageshow", loadSharedSettings);

    return () => {
      mounted = false;
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("aec-settings-updated", loadCachedSettings);
      window.removeEventListener("focus", loadSharedSettings);
      window.removeEventListener("pageshow", loadSharedSettings);
    };
  }, [currentUserName]);

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Sign out request failed.");
      }

      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error(error);
      setSigningOut(false);
      window.alert("Sign out failed. Please try again.");
    }
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const updateSystemMode = () => {
      setSystemUsesDarkMode(mediaQuery.matches);
    };

    updateSystemMode();
    mediaQuery.addEventListener("change", updateSystemMode);

    return () => {
      mediaQuery.removeEventListener("change", updateSystemMode);
    };
  }, []);

  const darkModeIsActive =
    settings.appearance === "dark" ||
    (settings.appearance === "system" && systemUsesDarkMode);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "aec-dark-root",
      darkModeIsActive,
    );
    document.body.classList.toggle("aec-dark-body", darkModeIsActive);
    document.documentElement.style.colorScheme = darkModeIsActive
      ? "dark"
      : "light";

    return () => {
      document.documentElement.classList.remove("aec-dark-root");
      document.body.classList.remove("aec-dark-body");
      document.documentElement.style.colorScheme = "";
    };
  }, [darkModeIsActive]);

  useEffect(() => {
    let componentIsMounted = true;

    async function loadSupabaseData(showLoading = true) {
      if (showLoading && componentIsMounted) {
        setDataIsLoading(true);
      }

      if (!supabase) {
        if (componentIsMounted) {
          setJobs([]);
          setStaff([]);
          setDataError(
            "Supabase is not connected. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
          );
          setDataIsLoading(false);
        }

        return;
      }

      const [jobsResult, staffResult] = await Promise.all([
        supabase.from(JOBS_TABLE).select("*"),
        supabase.from(STAFF_TABLE).select("*"),
      ]);

      if (!componentIsMounted) return;

      const errorMessages: string[] = [];

      if (jobsResult.error) {
        setJobs([]);
        errorMessages.push(
          `Cannot read "${JOBS_TABLE}" table: ${jobsResult.error.message}`,
        );
      } else {
        const nextJobs = (jobsResult.data || [])
          .map((row) => mapJobRow(row as SupabaseRow))
          .sort((a, b) => b.jobInDateTime.localeCompare(a.jobInDateTime));

        setJobs(nextJobs);
      }

      if (staffResult.error) {
        setStaff([]);
        errorMessages.push(
          `Cannot read "${STAFF_TABLE}" table: ${staffResult.error.message}`,
        );
      } else {
        const nextStaff = (staffResult.data || [])
          .map((row, index) => mapStaffRow(row as SupabaseRow, index))
          .sort((a, b) => a.name.localeCompare(b.name));

        setStaff(nextStaff);
      }

      setDataError(errorMessages.join(" "));
      setDataIsLoading(false);
    }

    void loadSupabaseData();

    if (!supabase) {
      return () => {
        componentIsMounted = false;
      };
    }

    const changesChannel = supabase
      .channel("aec-dashboard-database-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: JOBS_TABLE },
        () => void loadSupabaseData(false),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: STAFF_TABLE },
        () => void loadSupabaseData(false),
      )
      .subscribe();

    return () => {
      componentIsMounted = false;
      void supabase.removeChannel(changesChannel);
    };
  }, []);

  /*
    Base order for the calendar, searches and progress boards: Job In Date &
    Time descending, then Job ID descending. Job Information Sheet applies its
    own default Status Remark / Issue date order inside JobDataTable.
  */
  const orderedJobs = useMemo(
    () => [...jobs].sort(compareJobsByNewest),
    [jobs],
  );

  const maintenanceExpiryReminders = useMemo(
    () =>
      orderedJobs
        .map((job) => getMaintenanceExpiryReminder(job, today))
        .filter(
          (reminder): reminder is MaintenanceExpiryReminder =>
            reminder !== null,
        )
        .sort(
          (a, b) => a.expiryDate.getTime() - b.expiryDate.getTime(),
        ),
    [orderedJobs, today],
  );

  /*
    Filter options come directly from the staff dictionary. Names are
    de-duplicated case-insensitively while preserving their display spelling.
  */
  const staffFilterOptions = useMemo(() => {
    const seenNames = new Set<string>();

    return staff
      .map((staffMember) => staffMember.name.trim())
      .filter((name) => {
        if (!name) return false;

        const normalizedName = name.toLocaleLowerCase();
        if (seenNames.has(normalizedName)) return false;

        seenNames.add(normalizedName);
        return true;
      });
  }, [staff]);

  /*
    This staff filter belongs only to Summary and Job Progress Board. It does
    not change the main dashboard cards, charts, calendar, global search, or
    Job Information Sheet. A job matches when the selected name is contained
    in either Sales Person OR Assigned Engineer (case-insensitive). Filtering
    the job once also prevents duplicates when both fields contain the name.
  */
  const staffFilteredBoardJobs = useMemo(() => {
    const normalizedStaffName = selectedStaffName.trim().toLocaleLowerCase();
    if (!normalizedStaffName) return orderedJobs;

    return orderedJobs.filter((job) => {
      const salesPersonMatches = job.salesPerson
        .trim()
        .toLocaleLowerCase()
        .includes(normalizedStaffName);
      const engineerMatches = job.assignedTechnician
        .trim()
        .toLocaleLowerCase()
        .includes(normalizedStaffName);

      return salesPersonMatches || engineerMatches;
    });
  }, [orderedJobs, selectedStaffName]);

  useEffect(() => {
    if (
      selectedStaffName &&
      !staffFilterOptions.some(
        (name) =>
          name.toLocaleLowerCase() === selectedStaffName.toLocaleLowerCase(),
      )
    ) {
      setSelectedStaffName("");
    }
  }, [staffFilterOptions, selectedStaffName]);

  useEffect(() => {
    setBoardPagination((current) =>
      JOB_STATUSES.reduce((nextState, status) => {
        nextState[status] = { ...current[status], page: 1 };
        return nextState;
      }, {} as BoardPaginationState),
    );
    setBoardSearch(createDefaultBoardSearch());
    setFocusedBoardSearch(null);
    setHighlightedBoardJob(null);
  }, [selectedStaffName]);

  /*
    Search results are intentionally kept separate from the dashboard data.
    Searching must never change cards, charts, calendar, boards, summary, or
    the information sheet; it only powers the header result count/list.
  */
  const searchResults = useMemo(
    () =>
      orderedJobs.filter((job) => jobMatchesGlobalSearch(job, globalSearch)),
    [orderedJobs, globalSearch],
  );

  const searchSuggestions = useMemo(
    () => (globalSearch.trim() ? searchResults : []),
    [searchResults, globalSearch],
  );

  useEffect(() => {
    setActiveSearchSuggestion(-1);
  }, [globalSearch]);

  useEffect(() => {
    if (!highlightedBoardJob) return;

    const scrollTimer = window.setTimeout(() => {
      const selector = `[data-board-status="${encodeURIComponent(
        highlightedBoardJob.status,
      )}"][data-board-job-id="${encodeURIComponent(
        highlightedBoardJob.jobId,
      )}"]`;
      const card = document.querySelector<HTMLElement>(selector);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);

    const clearTimer = window.setTimeout(() => {
      setHighlightedBoardJob((current) =>
        current?.status === highlightedBoardJob.status &&
        current.jobId === highlightedBoardJob.jobId
          ? null
          : current,
      );
    }, 6000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightedBoardJob, boardPagination]);

  const statusCounts = useMemo(() => {
    return JOB_STATUSES.reduce(
      (counts, status) => {
        counts[status] = orderedJobs.filter(
          (job) => job.status === status,
        ).length;

        return counts;
      },
      {} as Record<BoardJobStatus, number>,
    );
  }, [orderedJobs]);

  const boardStatusCounts = useMemo(() => {
    return JOB_STATUSES.reduce(
      (counts, status) => {
        counts[status] = staffFilteredBoardJobs.filter(
          (job) => job.status === status,
        ).length;

        return counts;
      },
      {} as Record<BoardJobStatus, number>,
    );
  }, [staffFilteredBoardJobs]);

  const statisticCards = JOB_STATUSES.map((status) => ({
    status,
    label: statisticLabels[status],
    value: statusCounts[status],
    hex: statusStyles[status].hex,
  }));

  const calendarDays = useMemo(
    () => getCalendarDays(calendarDate),
    [calendarDate],
  );

  const weeklyData = useMemo(() => {
    const weekKeys = getWeekDateKeys(today);

    return weekKeys.map((dateKey, index) => ({
      label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
      dateKey,
      value: orderedJobs.filter(
        (job) => getJobDateKey(job.jobInDateTime) === dateKey,
      ).length,
    }));
  }, [orderedJobs, today]);

  const todayJobCount = orderedJobs.filter(
    (job) => getJobDateKey(job.jobInDateTime) === formatDateKey(today),
  ).length;

  const totalJobsThisWeek = weeklyData.reduce(
    (total, item) => total + item.value,
    0,
  );

  function goToPreviousMonth() {
    setCalendarDate(
      (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
    );
  }

  function goToNextMonth() {
    setCalendarDate(
      (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
    );
  }

  function goToCurrentMonth() {
    setCalendarDate(new Date());
  }

  function openJobDetails(job: Job) {
    setSelectedJob(job);
  }

  function closeJobDetails() {
    setSelectedJob(null);
  }

  function selectSearchSuggestion(job: Job) {
    setSearchHasFocus(false);
    setActiveSearchSuggestion(-1);
    openJobDetails(job);
  }

  function locateJobInBoard(
    status: BoardJobStatus,
    job: Job,
    statusJobs: Job[],
  ) {
    const jobIndex = statusJobs.findIndex(
      (candidate) => candidate.jobId === job.jobId,
    );

    if (jobIndex < 0) return;

    const pageSize = boardPagination[status].pageSize;
    const page = pageSize === "Full" ? 1 : Math.floor(jobIndex / pageSize) + 1;
    const indexOnPage =
      pageSize === "Full" ? jobIndex : jobIndex % pageSize;
    const row = Math.floor(indexOnPage / 5) + 1;

    setBoardPagination((current) => ({
      ...current,
      [status]: { ...current[status], page },
    }));
    setFocusedBoardSearch(null);
    setHighlightedBoardJob({ status, jobId: job.jobId, page, row });
  }

  return (
    <main
      className={`min-h-screen bg-slate-50 ${
        darkModeIsActive ? "aec-dark" : ""
      }`}
    >
      <DashboardThemeStyles />
      {/* Header */}

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1900px] flex-col items-stretch gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:h-16 sm:w-16 sm:rounded-2xl">
              <img
                src={settings.logoDataUrl || DEFAULT_LOGO_DATA_URL}
                alt={`${settings.companyName} logo`}
                className="h-full w-full object-contain"
              />
            </div>

            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-blue-600 sm:text-xs sm:tracking-[0.2em]">
                {settings.companyName}
              </p>

              <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-slate-950 sm:text-2xl">
                {settings.dashboardTitle}
              </h1>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:gap-3">
            <div className="relative order-first w-full sm:w-64 lg:w-80">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <SearchIcon />
              </span>

              <input
                type="search"
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
                onFocus={() => setSearchHasFocus(true)}
                onBlur={() => setSearchHasFocus(false)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSearchHasFocus(false);
                    setActiveSearchSuggestion(-1);
                    event.currentTarget.blur();
                    return;
                  }

                  if (!searchSuggestions.length) return;

                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveSearchSuggestion((current) =>
                      Math.min(searchSuggestions.length - 1, current + 1),
                    );
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveSearchSuggestion((current) =>
                      Math.max(-1, current - 1),
                    );
                  } else if (
                    event.key === "Enter" &&
                    activeSearchSuggestion >= 0
                  ) {
                    event.preventDefault();
                    selectSearchSuggestion(
                      searchSuggestions[activeSearchSuggestion],
                    );
                  }
                }}
                placeholder="Search jobs..."
                aria-label="Global search"
                aria-autocomplete="list"
                aria-expanded={
                  searchHasFocus && searchSuggestions.length > 0
                }
                aria-controls="job-search-suggestions"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-20 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
              />

              {globalSearch.trim() && (
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center whitespace-nowrap text-[10px] font-semibold text-blue-600">
                  {searchResults.length} result
                  {searchResults.length === 1 ? "" : "s"}
                </span>
              )}

              {searchHasFocus && globalSearch.trim() && (
                <div
                  id="job-search-suggestions"
                  role="listbox"
                  aria-label="Matching jobs"
                  className="absolute left-0 right-0 top-[calc(100%+0.45rem)] z-50 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                >
                  {searchSuggestions.length > 0 ? (
                    searchSuggestions.map((job, index) => (
                      <button
                        key={`${job.jobId}-${index}`}
                        type="button"
                        role="option"
                        aria-selected={index === activeSearchSuggestion}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveSearchSuggestion(index)}
                        onClick={() => selectSearchSuggestion(job)}
                        className={`flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm transition ${
                          index === activeSearchSuggestion
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="font-semibold text-blue-600">
                          {job.jobId || "-"}
                        </span>
                        <span className="mx-2 text-slate-300">-</span>
                        <span className="min-w-0 truncate">
                          {job.customerCompanyName || "-"}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-3 text-sm text-slate-400">
                      Not Found
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">
                {settings.administratorName}
              </p>

              <p className="text-xs text-slate-400">
                {settings.topmanagementSetting}
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/settings")}
              title={
                canManageSettings(currentUserRole)
                  ? "Settings"
                  : "View settings access"
              }
              aria-label={
                canManageSettings(currentUserRole)
                  ? "Open settings"
                  : "View settings access information"
              }
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
            >
              <SettingsIcon />
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm"
            >
              {signingOut ? "Signing Out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1900px] px-3 py-4 sm:px-5 sm:py-7 lg:px-8">
        {dataIsLoading && (
          <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm font-medium text-blue-700 shadow-sm">
            Loading Job and Staff data from Supabase...
          </div>
        )}

        {dataError && (
          <div className="mb-5 rounded-2xl border border-rose-300 bg-rose-50 px-5 py-4 text-sm font-medium leading-6 text-rose-700 shadow-sm">
            {dataError}
          </div>
        )}

        <div className="flex flex-col">

        {/* Status Categories */}

        <section
          className="space-y-4"
          style={{ order: settings.dashboardModuleOrder.indexOf("status-cards") }}
        >
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
            <h2 className="text-lg font-semibold text-slate-950">
              Job Status Statistic Cards
            </h2>
            <ModuleCollapseButton
              moduleName="Job Status Statistic Cards"
              isCollapsed={collapsedModules["status-cards"]}
              onToggle={() => toggleDashboardModule("status-cards")}
            />
          </div>

          {!collapsedModules["status-cards"] && (
            <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {settings.statisticCardOrder.slice(0, 4).map((status) =>
              statisticCards.find((card) => card.status === status),
            )
              .filter(
                (
                  card,
                ): card is (typeof statisticCards)[number] => card !== undefined,
              )
              .map((card) => (
                <StatisticCard key={card.status} {...card} />
              ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {settings.statisticCardOrder.slice(4).map((status) =>
              statisticCards.find((card) => card.status === status),
            )
              .filter(
                (
                  card,
                ): card is (typeof statisticCards)[number] => card !== undefined,
              )
              .map((card) => (
                <StatisticCard key={card.status} {...card} />
              ))}
          </div>

          <MaintenanceExpiryCard
            reminders={maintenanceExpiryReminders}
            onOpenJob={openJobDetails}
          />
            </>
          )}
        </section>

        {/* Two Charts */}

        <section
          className="mt-8"
          style={{ order: settings.dashboardModuleOrder.indexOf("analytics") }}
        >
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
            <h2 className="text-lg font-semibold text-slate-950">
              Weekly Job Trend &amp; Job Status
            </h2>
            <ModuleCollapseButton
              moduleName="Weekly Job Trend and Job Status"
              isCollapsed={collapsedModules.analytics}
              onToggle={() => toggleDashboardModule("analytics")}
            />
          </div>

          {!collapsedModules.analytics && (
            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <WeeklyJobChart
            data={weeklyData}
            todayCount={todayJobCount}
            weekTotal={totalJobsThisWeek}
          />

          <JobStatusChart statusCounts={statusCounts} />
            </div>
          )}
        </section>

        {/* Staff Directory */}

        <div
          style={{ order: settings.dashboardModuleOrder.indexOf("staff-directory") }}
        >
          <StaffDirectory
            staff={staff}
            isCollapsed={collapsedModules["staff-directory"]}
            onToggleCollapse={() => toggleDashboardModule("staff-directory")}
          />
        </div>

        {/* Automatic Job Calendar */}

        <section
          className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          style={{ order: settings.dashboardModuleOrder.indexOf("job-calendar") }}
        >
          <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Job Calendar
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Job activity and workflow calendar
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!collapsedModules["job-calendar"] && (
                <>
              <button
                type="button"
                onClick={goToCurrentMonth}
                className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
              >
                Today
              </button>

              <button
                type="button"
                onClick={goToPreviousMonth}
                aria-label="Previous month"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
              >
                <ChevronLeftIcon />
              </button>

              <div className="min-w-[130px] flex-1 text-center sm:min-w-[150px] sm:flex-none">
                <p className="text-sm font-semibold text-slate-800">
                  {calendarDate.toLocaleDateString("en-MY", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>

              <button
                type="button"
                onClick={goToNextMonth}
                aria-label="Next month"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
              >
                <ChevronRightIcon />
              </button>
                </>
              )}
              <ModuleCollapseButton
                moduleName="Job Calendar"
                isCollapsed={collapsedModules["job-calendar"]}
                onToggle={() => toggleDashboardModule("job-calendar")}
              />
            </div>
          </div>

          {!collapsedModules["job-calendar"] && (
          <div className="overflow-x-auto p-3 sm:p-4">
            <div className="min-w-[760px] sm:min-w-[1000px]">
              <div className="grid grid-cols-7">
                {SHORT_WEEK_DAYS.map((day) => (
                  <div
                    key={day}
                    className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((calendarDay) => {
                  const dayJobs = orderedJobs.filter((job) =>
                    isJobScheduledOnDate(job, calendarDay.dateKey),
                  );

                  const isToday = calendarDay.dateKey === formatDateKey(today);

                  return (
                    <div
                      key={calendarDay.dateKey}
                      className={`min-h-[120px] rounded-xl border p-2 sm:min-h-[145px] ${
                        calendarDay.isCurrentMonth
                          ? "border-slate-200 bg-white"
                          : "border-slate-100 bg-slate-50/70"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span
                          className={`flex h-7 min-w-7 items-center justify-center rounded-lg px-1 text-xs font-semibold ${
                            isToday
                              ? "bg-blue-600 text-white"
                              : calendarDay.isCurrentMonth
                                ? "text-slate-800"
                                : "text-slate-400"
                          }`}
                        >
                          {calendarDay.date.getDate()}
                        </span>

                        {dayJobs.length > 0 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                            {dayJobs.length}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {dayJobs.map((job) => (
                          <button
                            type="button"
                            key={`${job.jobId}-${calendarDay.dateKey}`}
                            onClick={() => openJobDetails(job)}
                            title={`${job.jobId || "-"} ${
                              job.customerCompanyName || "-"
                            }`}
                            aria-label={`Open job ${job.jobId || "-"} for ${
                              job.customerCompanyName || "-"
                            }`}
                            className={`block w-full rounded-lg border px-2 py-1.5 text-left font-semibold transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${statusStyles[job.status].calendar}`}
                          >
                            <span className="block whitespace-pre-wrap break-words text-[10pt] leading-tight">
                              {job.jobId || "-"}
                            </span>
                            <span
                              className="mt-0.5 block whitespace-pre-wrap break-words leading-[1.15] [overflow-wrap:anywhere]"
                              style={{
                                fontSize: getCalendarCompanyFontSize(
                                  job.customerCompanyName,
                                ),
                              }}
                            >
                              {job.customerCompanyName || "-"}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )}
        </section>

        {/* Job Information Sheet */}

        <div
          style={{ order: settings.dashboardModuleOrder.indexOf("job-information") }}
        >
        <JobDataTable
          jobs={orderedJobs}
          staffOptions={staffFilterOptions}
          columnOrder={settings.columnOrder}
          onOpenJob={openJobDetails}
          isCollapsed={collapsedModules["job-information"]}
          onToggleCollapse={() => toggleDashboardModule("job-information")}
        />
        </div>

        {/* Job Progress Board */}

        <section
          className="mt-8"
          style={{ order: settings.dashboardModuleOrder.indexOf("job-progress") }}
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(20rem,0.85fr)_minmax(0,2.35fr)_auto] xl:items-center">
            <div className="min-w-0 pl-3 sm:pl-5">
              <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Job Progress Board
              </h2>

              {!collapsedModules["job-progress"] && (
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Each row displays up to five jobs. Additional jobs will
                  automatically continue on the next row.
                </p>
              )}
              </div>
            </div>

            {!collapsedModules["job-progress"] && settings.showStageLegend && (
              <div className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm xl:px-7">
                <div className="xl:mx-auto xl:w-fit">
                  <p className="whitespace-nowrap text-xs font-semibold text-slate-500">
                    Stage Legend
                  </p>

                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-[repeat(5,minmax(0,1fr))] xl:grid-cols-[repeat(5,max-content)] xl:justify-center xl:gap-x-6 2xl:gap-x-10">
                    {JOB_STATUSES.map((status) => (
                      <div
                        key={status}
                        className="flex min-w-0 items-start gap-2 sm:justify-self-start"
                      >
                        <span
                          className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusStyles[status].dot}`}
                        />

                        <span className="min-w-0 break-words text-xs font-semibold leading-4 text-slate-600">
                          {displayLabels[status]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <ModuleCollapseButton
              moduleName="Job Progress Board"
              isCollapsed={collapsedModules["job-progress"]}
              onToggle={() => toggleDashboardModule("job-progress")}
            />
          </div>

          {!collapsedModules["job-progress"] && (
            <>
          {/* Summary */}

          {settings.showSummary && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="grid gap-3 2xl:grid-cols-[20rem_minmax(0,1fr)_auto] 2xl:items-center">
                <label className="flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-700">
                  <span className="whitespace-nowrap">Filter:</span>
                  <select
                    value={selectedStaffName}
                    onChange={(event) => setSelectedStaffName(event.target.value)}
                    aria-label="Filter Job Progress Board by salesperson or engineer"
                    className="h-9 w-44 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                  >
                    <option value="">All Staff</option>
                    {staffFilterOptions.map((staffName) => (
                      <option key={staffName} value={staffName}>
                        {staffName}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex min-w-0 items-center gap-4 2xl:pl-4">
                  <p className="shrink-0 text-sm font-semibold text-slate-700">
                    Summary:
                  </p>

                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-[repeat(5,minmax(0,1fr))]">
                    {JOB_STATUSES.map((status) => (
                      <div
                        key={status}
                        className="flex min-w-0 items-center gap-2"
                      >
                        <span
                          className={`flex min-w-7 shrink-0 items-center justify-center rounded-md px-2 py-1 text-xs font-bold ${statusStyles[status].numberBadge}`}
                        >
                          {boardStatusCounts[status]}
                        </span>

                        <span className="text-xs font-medium leading-4 text-slate-600">
                          {displayLabels[status]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex w-full shrink-0 items-center justify-end gap-2 border-t border-slate-200 pt-3 sm:ml-auto sm:w-auto sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                  <span className="text-sm font-semibold text-slate-700">
                    Total:
                  </span>

                  <span className="text-sm font-bold text-slate-950">
                    {staffFilteredBoardJobs.length}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Status Sections */}

          <div className="mt-5 space-y-5">
            {JOB_STATUSES.map((status) => {
              const statusJobs = staffFilteredBoardJobs.filter(
                (job) => job.status === status,
              );
              const styles = statusStyles[status];
              const pagination = boardPagination[status];
              const totalPages =
                pagination.pageSize === "Full"
                  ? 1
                  : Math.max(
                      1,
                      Math.ceil(statusJobs.length / pagination.pageSize),
                    );
              const safePage = Math.min(pagination.page, totalPages);
              const paginatedStatusJobs =
                pagination.pageSize === "Full"
                  ? statusJobs
                  : statusJobs.slice(
                      (safePage - 1) * pagination.pageSize,
                      safePage * pagination.pageSize,
                    );
              const boardQuery = boardSearch[status];
              const boardSearchResults = boardQuery.trim()
                ? statusJobs.filter((job) =>
                    jobMatchesGlobalSearch(job, boardQuery),
                  )
                : [];
              const boardLocation =
                highlightedBoardJob?.status === status
                  ? highlightedBoardJob
                  : null;

              return (
                <div
                  key={status}
                  className={`overflow-hidden rounded-2xl border border-l-4 border-slate-200 bg-white shadow-sm ${styles.leftBorder}`}
                >
                  <div className="flex min-h-[72px] flex-col items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm ${styles.iconBackground}`}
                      >
                        <StatusIcon status={status} sizeClass="h-5 w-5" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">
                            {displayLabels[status]}
                          </h3>

                          <span
                            className={`h-2 w-2 rounded-full ${styles.dot}`}
                          />
                        </div>

                        <p className="mt-1 text-xs text-slate-500">
                          {statusDescriptions[status]}
                        </p>
                      </div>
                    </div>

                    <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                      <div className="relative w-full sm:w-64">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                          <SearchIcon />
                        </span>

                        <input
                          type="search"
                          value={boardQuery}
                          onChange={(event) => {
                            setBoardSearch((current) => ({
                              ...current,
                              [status]: event.target.value,
                            }));
                            setFocusedBoardSearch(status);
                          }}
                          onFocus={() => setFocusedBoardSearch(status)}
                          onBlur={() => setFocusedBoardSearch(null)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setFocusedBoardSearch(null);
                              event.currentTarget.blur();
                            }
                          }}
                          placeholder="Search jobs..."
                          aria-label={`Search ${displayLabels[status]}`}
                          aria-expanded={
                            focusedBoardSearch === status &&
                            Boolean(boardQuery.trim())
                          }
                          className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-14 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                        />

                        {boardQuery.trim() && (
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] font-semibold text-blue-600">
                            {boardSearchResults.length}
                          </span>
                        )}

                        {focusedBoardSearch === status &&
                          boardQuery.trim() && (
                            <div
                              role="listbox"
                              aria-label={`Matching ${displayLabels[status]} jobs`}
                              className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-40 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                            >
                              {boardSearchResults.length > 0 ? (
                                boardSearchResults.map((job, resultIndex) => (
                                  <button
                                    key={`${status}-${job.jobId}-${resultIndex}`}
                                    type="button"
                                    role="option"
                                    onMouseDown={(event) =>
                                      event.preventDefault()
                                    }
                                    onClick={() =>
                                      locateJobInBoard(status, job, statusJobs)
                                    }
                                    className="flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                                  >
                                    <span className="font-semibold text-blue-600">
                                      {job.jobId || "-"}
                                    </span>
                                    <span className="mx-2 text-slate-300">-</span>
                                    <span className="min-w-0 truncate">
                                      {job.customerCompanyName || "-"}
                                    </span>
                                  </button>
                                ))
                              ) : (
                                <p className="px-3 py-3 text-sm text-slate-400">
                                  Not Found
                                </p>
                              )}
                            </div>
                          )}
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold ${styles.badge}`}
                      >
                        {statusJobs.length}{" "}
                        {statusJobs.length === 1 ? "job" : "jobs"}
                      </span>

                      <ModuleCollapseButton
                        moduleName={`${displayLabels[status]} board`}
                        isCollapsed={collapsedBoardStatuses[status]}
                        onToggle={() => toggleBoardStatus(status)}
                      />
                    </div>
                  </div>

                  {!collapsedBoardStatuses[status] && (
                    <>
                  <div className="p-3 sm:p-4">
                    {statusJobs.length > 0 ? (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        {paginatedStatusJobs.map((job) => (
                          <button
                            type="button"
                            key={job.jobId}
                            data-board-status={encodeURIComponent(status)}
                            data-board-job-id={encodeURIComponent(job.jobId)}
                            onClick={() => openJobDetails(job)}
                            className={`min-w-0 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-500/10 sm:p-4 ${
                              boardLocation?.jobId === job.jobId
                                ? "border-amber-400 ring-4 ring-amber-300/70 shadow-lg"
                                : "border-slate-200"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="whitespace-pre-wrap break-words text-xs font-semibold text-blue-600">
                                {job.jobId}
                              </span>

                              <span
                                className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusStyles[job.status].calendar}`}
                              >
                                {displayLabels[job.status]}
                              </span>
                            </div>

                            <h4 className="mt-3 whitespace-pre-wrap break-words text-base font-bold leading-5 text-slate-900">
                              {job.customerCompanyName || "-"}
                            </h4>

                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-600">
                              {job.customerName || "-"}
                            </p>

                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-500">
                              {job.customerPhone || "-"}
                            </p>

                            <p className="mt-3 min-h-[40px] whitespace-pre-wrap break-words text-sm leading-5 text-slate-600">
                              {job.description || "No description provided"}
                            </p>

                            <div className="mt-4 border-t border-slate-100 pt-3">
                              <p className="whitespace-pre-wrap break-words text-xs text-slate-400">
                                Sales: {job.salesPerson || "-"}
                              </p>

                              {job.assignedTechnician && (
                                <p className="mt-2 whitespace-pre-wrap break-words text-xs font-medium text-slate-600">
                                  Engineer: {job.assignedTechnician}
                                </p>
                              )}

                              {job.invoiceNo && (
                                <p className="mt-2 whitespace-pre-wrap break-words text-xs font-medium text-emerald-700">
                                  Invoice: {job.invoiceNo}
                                </p>
                              )}

                              {job.reportNo && (
                                <p className="mt-2 whitespace-pre-wrap break-words text-xs font-medium text-violet-700">
                                  Report: {job.reportNo}
                                </p>
                              )}

                              <div className="mt-3 space-y-2 rounded-lg bg-slate-50 px-3 py-2.5">
                                <DateTimeDisplayRow
                                  label="Job In"
                                  value={formatDisplayDateTime(
                                    job.jobInDateTime,
                                  )}
                                />

                                <DateTimeDisplayRow
                                  label="Job Start"
                                  value={formatDisplayDateTime(
                                    job.jobStartDateTime,
                                  )}
                                />

                                <DateTimeDisplayRow
                                  label="Job Complete"
                                  value={formatDisplayDateTime(
                                    job.jobCompleteDateTime,
                                  )}
                                />

                                <DateTimeDisplayRow
                                  label="Collection"
                                  value={formatDisplayDateTime(
                                    job.collectionDateTime,
                                  )}
                                />

                                <DateTimeDisplayRow
                                  label="Maintenance Duration"
                                  value={job.maintenanceDuration || "-"}
                                />
                              </div>
                            </div>

                            {/* Current Status Display */}

                            <div className="mt-4 border-t border-slate-100 pt-3">
                              <p className="mb-1.5 text-[11px] font-medium text-slate-500">
                                Current Status:
                              </p>

                              <div
                                className={`flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${styles.calendar}`}
                              >
                                <StatusIcon
                                  status={job.status}
                                  sizeClass="h-4 w-4 shrink-0"
                                />
                                {displayLabels[job.status]}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60">
                        <p className="text-sm text-slate-400">
                          No jobs in this stage
                        </p>
                      </div>
                    )}
                  </div>

                  <PaginationControls
                    page={safePage}
                    totalPages={totalPages}
                    pageSize={pagination.pageSize}
                    onPageSizeChange={(nextPageSize) =>
                      setBoardPagination((current) => ({
                        ...current,
                        [status]: { page: 1, pageSize: nextPageSize },
                      }))
                    }
                    onPrevious={() =>
                      setBoardPagination((current) => ({
                        ...current,
                        [status]: {
                          ...current[status],
                          page: Math.max(1, safePage - 1),
                        },
                      }))
                    }
                    onNext={() =>
                      setBoardPagination((current) => ({
                        ...current,
                        [status]: {
                          ...current[status],
                          page: Math.min(totalPages, safePage + 1),
                        },
                      }))
                    }
                    onPageChange={(nextPage) =>
                      setBoardPagination((current) => ({
                        ...current,
                        [status]: {
                          ...current[status],
                          page: nextPage,
                        },
                      }))
                    }
                    onSetAsDefault={() =>
                      savePaginationDefault(status, pagination.pageSize)
                    }
                  />
                    </>
                  )}
                </div>
              );
            })}
          </div>
            </>
          )}
        </section>
        </div>
      </div>

      {selectedJob && (
        <ReadOnlyJobModal
          job={selectedJob}
          onClose={closeJobDetails}
        />
      )}
    </main>
  );
}

/* =========================================================
   Read-only Job Details Modal
========================================================= */

const JOB_INFORMATION_FIELDS: JobColumnKey[] = [
  "jobId",
  "jobInDateTime",
  "salesPerson",
  "customerName",
  "customerPhone",
  "customerCompanyName",
];

const JOB_PROGRESS_FIELDS: JobColumnKey[] = [
  "assignedTechnician",
  "description",
  "status",
  "jobStartDateTime",
  "statusRemark",
  "maintenanceDuration",
  "jobCompleteDateTime",
  "invoiceNo",
  "reportNo",
  "collectionDateTime",
];

const DATE_TIME_FIELDS = new Set<JobColumnKey>([
  "jobInDateTime",
  "jobStartDateTime",
  "jobCompleteDateTime",
  "collectionDateTime",
]);

function ReadOnlyJobModal({
  job,
  onClose,
}: {
  job: Job;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  function renderField(key: JobColumnKey) {
    const fieldValue = String(job[key] ?? "");
    const displayValue =
      key === "status"
        ? displayLabels[job.status]
        : DATE_TIME_FIELDS.has(key)
          ? formatDisplayDateTime(fieldValue)
          : fieldValue || "—";

    return (
      <div
        className="mt-1.5 min-h-11 w-full whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-6 text-slate-900"
      >
        {displayValue}
      </div>
    );
  }

  function renderSection(
    title: string,
    description: string,
    fields: JobColumnKey[],
  ) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-slate-50/40 p-5">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
          {fields.map((key) => (
            <div
              key={key}
              className={
                key === "description" || key === "statusRemark"
                  ? "md:col-span-2"
                  : ""
              }
            >
              <p className="text-xs font-semibold text-slate-700">
                {JOB_COLUMN_LABELS[key]}
              </p>
              {renderField(key)}
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-details-title"
        className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-h-[94vh] sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:gap-4 sm:px-7 sm:py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
              Job Details
            </p>
            <h2
              id="job-details-title"
              className="mt-1 truncate text-xl font-semibold text-slate-950"
            >
              {job.jobId || "Job Information"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Read-only job information.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Job Details"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl leading-none text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4 sm:space-y-5 sm:px-7 sm:py-5">
          {renderSection(
            "Job Information",
            "Customer, sales and incoming job information.",
            JOB_INFORMATION_FIELDS,
          )}

          {renderSection(
            "Job Progress Details",
            "Engineer, workflow status, dates and supporting references.",
            JOB_PROGRESS_FIELDS,
          )}

        </div>

        <div className="flex justify-end border-t border-slate-200 bg-white px-4 py-3 sm:px-7 sm:py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 w-full rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 sm:w-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardThemeStyles() {
  return (
    <style>{`
      .aec-dark-root,
      .aec-dark-body {
        background-color: #07111f !important;
      }

      .aec-dark {
        background-color: #07111f !important;
        color: #e5eefb;
      }

      .aec-dark [class~="bg-white"] {
        background-color: #0d1b2e !important;
      }

      .aec-dark [class~="bg-slate-50"],
      .aec-dark [class~="bg-slate-50/40"],
      .aec-dark [class~="bg-slate-50/60"],
      .aec-dark [class~="bg-slate-50/70"] {
        background-color: #101f34 !important;
      }

      .aec-dark [class~="bg-slate-100"] {
        background-color: #172941 !important;
      }

      .aec-dark [class~="bg-slate-200"] {
        background-color: #243750 !important;
      }

      .aec-dark [class~="border-slate-100"],
      .aec-dark [class~="border-slate-200"],
      .aec-dark [class~="border-slate-300"] {
        border-color: #2a3d57 !important;
      }

      .aec-dark [class~="text-slate-950"],
      .aec-dark [class~="text-slate-900"],
      .aec-dark [class~="text-slate-800"],
      .aec-dark [class~="text-slate-700"] {
        color: #f3f7fd !important;
      }

      .aec-dark [class~="text-slate-600"],
      .aec-dark [class~="text-slate-500"] {
        color: #a9b9ce !important;
      }

      .aec-dark [class~="text-slate-400"] {
        color: #8395ad !important;
      }

      .aec-dark [class~="bg-blue-50"] {
        background-color: #112d52 !important;
      }

      .aec-dark [class~="text-blue-700"] {
        color: #7db4ff !important;
      }

      .aec-dark table thead [class~="bg-slate-50"] {
        background-color: #13253d !important;
      }

      .aec-dark [class~="bg-emerald-50"] {
        background-color: #073a32 !important;
      }

      .aec-dark [class~="text-emerald-700"] {
        color: #74e6c3 !important;
      }

      .aec-dark [class~="text-violet-700"] {
        color: #c4a7ff !important;
      }

      .aec-dark [class~="bg-blue-100"] {
        background-color: #12345c !important;
      }

      .aec-dark [class~="bg-violet-100"] {
        background-color: #31245b !important;
      }

      .aec-dark [class~="bg-indigo-100"] {
        background-color: #252b63 !important;
      }

      .aec-dark [class~="bg-teal-100"] {
        background-color: #123f3d !important;
      }

      .aec-dark [class~="bg-amber-100"] {
        background-color: #493514 !important;
      }

      .aec-dark [class~="bg-orange-100"] {
        background-color: #4d2916 !important;
      }

      .aec-dark [class~="bg-cyan-100"] {
        background-color: #123d49 !important;
      }

      .aec-dark [class~="bg-rose-100"] {
        background-color: #4b1e31 !important;
      }

      .aec-dark [class~="bg-emerald-100"] {
        background-color: #123e35 !important;
      }
    `}</style>
  );
}

/* =========================================================
   Staff Directory
========================================================= */

function StaffDirectory({
  staff,
  isCollapsed,
  onToggleCollapse,
}: {
  staff: Staff[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 sm:px-5 sm:py-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <StaffIcon />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Staff Directory
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Contact Details
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isCollapsed && (
            <span className="w-fit rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              {staff.length}{" "}
              {staff.length === 1 ? "Staff Member" : "Staff Members"}
            </span>
          )}
          <ModuleCollapseButton
            moduleName="Staff Directory"
            isCollapsed={isCollapsed}
            onToggle={onToggleCollapse}
          />
        </div>
      </div>

      {!isCollapsed && (
      <div className="p-4 sm:p-5">
        <div className="min-w-0">
          {staff.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {staff.map((staffMember) => (
                <div
                  key={staffMember.id}
                  className="group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold uppercase text-white shadow-sm">
                    {staffMember.name.trim().charAt(0) || "S"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                        {staffMember.name}
                      </p>

                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                          staffMember.employmentStatus === "Active"
                            ? "border-cyan-200 bg-cyan-100 text-cyan-800"
                            : "border-red-200 bg-red-100 text-red-700"
                        }`}
                      >
                        {staffMember.employmentStatus}
                      </span>
                    </div>

                    <a
                      href={`tel:${staffMember.phone}`}
                      className="mt-1 flex items-center gap-1.5 truncate text-xs font-medium text-slate-500 transition hover:text-blue-600"
                    >
                      <PhoneIcon />
                      <span className="truncate">
                        {staffMember.phone || "Phone not set"}
                      </span>
                    </a>

                    <a
                      href={
                        staffMember.email
                          ? `mailto:${staffMember.email}`
                          : undefined
                      }
                      className="mt-1 flex items-center gap-1.5 truncate text-xs font-medium text-slate-500 transition hover:text-blue-600"
                    >
                      <EmailIcon />
                      <span className="truncate">
                        {staffMember.email || "Email not set"}
                      </span>
                    </a>

                    <p className="mt-1 flex items-center gap-1.5 truncate text-xs font-medium text-slate-500">
                      <PositionIcon />
                      <span className="truncate">
                        {staffMember.role || "Role not set"}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-5 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                <StaffIcon />
              </div>

              <p className="mt-3 text-sm font-semibold text-slate-700">
                No staff added yet
              </p>

              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                No employee information is currently available.
              </p>
            </div>
          )}
        </div>
      </div>
      )}
    </section>
  );
}

/* =========================================================
   Job Card Date & Time Row
========================================================= */

function DateTimeDisplayRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="text-[11px] leading-4">
      <span className="font-semibold text-slate-500">{label}:</span>{" "}
      <span className="break-words font-medium text-slate-700">{value}</span>
    </div>
  );
}

/* =========================================================
   Statistic Card
========================================================= */

function MaintenanceExpiryCard({
  reminders,
  onOpenJob,
}: {
  reminders: MaintenanceExpiryReminder[];
  onOpenJob: (job: Job) => void;
}) {
  return (
    <div className="relative flex min-h-[124px] flex-col overflow-hidden rounded-2xl border-2 border-teal-200 bg-white shadow-md">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-teal-500" />

      <div className="flex items-center justify-between gap-4 border-b border-teal-100 bg-teal-50/70 py-4 pl-6 pr-5">
        <h3 className="break-words text-base font-extrabold leading-5 text-slate-900">
          Maintenance Expiry Reminder
        </h3>

        <span className="shrink-0 rounded-full bg-teal-500 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-sm">
          {reminders.length} {reminders.length === 1 ? "job" : "jobs"}
        </span>
      </div>

      {reminders.length > 0 ? (
        <div className="max-h-[390px] flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain">
          {reminders.map(({ job, startDate, expiryDate }) => {
            return (
              <button
                key={`${job.jobId}-${expiryDate.getTime()}`}
                type="button"
                onClick={() => onOpenJob(job)}
                className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-teal-50 focus:outline-none focus:ring-4 focus:ring-inset focus:ring-teal-500/15 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-blue-600">
                    {job.jobId || "-"}
                  </p>
                  <p className="mt-1 break-words text-sm font-extrabold text-slate-900">
                    {job.customerCompanyName || job.customerName || "-"}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    Maintenance Duration
                  </p>
                  <p className="mt-1 break-words text-sm font-bold text-slate-700">
                    {startDate
                      ? `${formatMaintenanceDate(startDate)} – ${formatMaintenanceDate(expiryDate)}`
                      : formatMaintenanceDate(expiryDate)}
                  </p>
                </div>

                <span
                  className="inline-flex w-fit rounded-full bg-amber-100 px-3 py-1.5 text-xs font-extrabold text-amber-800"
                >
                  Overdue
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-1 items-center px-5 py-5 text-center">
          <p className="w-full text-xs font-bold leading-5 text-slate-500">
            No maintenance expiry reminders.
          </p>
        </div>
      )}
    </div>
  );
}

function StatisticCard({
  status,
  label,
  value,
  hex,
}: {
  status: JobStatus;
  label: string;
  value: number;
  hex: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-slate-200 bg-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg">
      <div
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: hex }}
      />

      <div className="flex min-h-[112px] items-center justify-between gap-3 p-4 pl-5 sm:min-h-[124px] sm:gap-4 sm:p-5 sm:pl-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
              style={{ backgroundColor: hex }}
            />

            {status === "Maintenance and Renewals" ? (
              <p className="text-sm font-extrabold leading-5 text-slate-800">
                <span className="whitespace-nowrap">Maintenance &amp;</span>
                <br />
                Renewals
              </p>
            ) : (
              <p className="break-words text-sm font-extrabold leading-5 text-slate-800">
                {label}
              </p>
            )}
          </div>

          <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:mt-3 sm:text-3xl">
            {value}
          </p>
        </div>

        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg"
          style={{
            backgroundColor: hex,
            boxShadow: `0 10px 22px ${hex}35`,
          }}
        >
          <StatusIcon status={status} />
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Weekly Job Trend Chart
========================================================= */

function WeeklyJobChart({
  data,
  todayCount,
  weekTotal,
}: {
  data: {
    label: string;
    dateKey: string;
    value: number;
  }[];
  todayCount: number;
  weekTotal: number;
}) {
  const chartWidth = 760;
  const chartHeight = 240;
  const paddingLeft = 48;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 38;

  const maximumValue = Math.max(4, ...data.map((item) => item.value));

  const roundedMaximum = Math.ceil(maximumValue / 2) * 2 || 4;

  const chartInnerWidth = chartWidth - paddingLeft - paddingRight;

  const chartInnerHeight = chartHeight - paddingTop - paddingBottom;

  const points = data.map((item, index) => {
    const x =
      paddingLeft + (index / Math.max(data.length - 1, 1)) * chartInnerWidth;

    const y =
      paddingTop +
      chartInnerHeight -
      (item.value / roundedMaximum) * chartInnerHeight;

    return {
      ...item,
      x,
      y,
    };
  });

  const polylinePoints = points
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  const gridValues = Array.from({ length: 5 }, (_, index) =>
    Math.round((roundedMaximum / 4) * index),
  ).reverse();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">
          Weekly Job Trend
        </h2>

        <p className="mt-1 text-sm text-slate-500">Jobs created this week</p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs font-medium text-slate-500">
            Today&apos;s Job Count
          </p>

          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {todayCount}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs font-medium text-slate-500">
            Total Jobs This Week
          </p>

          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {weekTotal}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-auto w-full"
          role="img"
          aria-label="Weekly job trend chart"
        >
          {gridValues.map((gridValue, index) => {
            const y = paddingTop + (index / 4) * chartInnerHeight;

            return (
              <g key={`${gridValue}-${index}`}>
                <line
                  x1={paddingLeft}
                  x2={chartWidth - paddingRight}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />

                <text
                  x={paddingLeft - 12}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#64748b"
                >
                  {gridValue}
                </text>
              </g>
            );
          })}

          <polyline
            points={polylinePoints}
            fill="none"
            stroke="#10b981"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((point) => (
            <g key={point.dateKey}>
              <circle cx={point.x} cy={point.y} r="5" fill="#10b981" />

              <circle cx={point.x} cy={point.y} r="9" fill="transparent" />

              <text
                x={point.x}
                y={chartHeight - 10}
                textAnchor="middle"
                fontSize="11"
                fill="#64748b"
              >
                {point.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/* =========================================================
   Job Status Distribution Chart
========================================================= */

function JobStatusChart({
  statusCounts,
}: {
  statusCounts: Record<BoardJobStatus, number>;
}) {
  const totalJobs = DISTRIBUTION_STATUSES.reduce(
    (total, status) => total + statusCounts[status],
    0,
  );
  let accumulatedPercentage = 0;

  const gradientSections = DISTRIBUTION_STATUSES.map((status) => {
    const percentage =
      totalJobs > 0 ? (statusCounts[status] / totalJobs) * 100 : 0;

    const start = accumulatedPercentage;
    const end = accumulatedPercentage + percentage;

    accumulatedPercentage = end;

    return `${statusStyles[status].hex} ${start}% ${end}%`;
  });

  const donutBackground =
    totalJobs > 0
      ? `conic-gradient(${gradientSections.join(", ")})`
      : "#e2e8f0";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">
          Job Status Distribution
        </h2>

        <p className="mt-1 text-sm text-slate-500">Current status breakdown</p>
      </div>

      <div className="mt-6 flex min-h-[280px] flex-col items-center justify-center gap-6 sm:mt-7 sm:min-h-[320px] sm:gap-7 lg:flex-row">
        <div
          className="relative h-44 w-44 shrink-0 rounded-full sm:h-52 sm:w-52"
          style={{ background: donutBackground }}
        >
          <div className="absolute inset-9 flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
            <span className="text-3xl font-semibold text-slate-950">
              {totalJobs}
            </span>

            <span className="mt-1 text-xs font-medium text-slate-500">
              Active Jobs
            </span>
          </div>
        </div>

        <div className="grid w-full max-w-sm grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {DISTRIBUTION_STATUSES.map((status) => {
            const percentage =
              totalJobs > 0
                ? Math.round((statusCounts[status] / totalJobs) * 100)
                : 0;

            return (
              <div
                key={status}
                className="flex items-center justify-between gap-4"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: statusStyles[status].hex,
                    }}
                  />

                  <span className="truncate text-xs font-medium text-slate-600">
                    {distributionLabels[status]}
                  </span>
                </div>

                <span className="shrink-0 text-xs font-semibold text-slate-800">
                  {statusCounts[status]} ({percentage}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

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
  "Complete",
];

const SECOND_ROW_STATUSES: readonly BoardJobStatus[] = [
  "Claim Warranty",
  "Pending Parts",
  "Pending Quotation",
  "Pending Invoice",
  "Cancelled",
];

const DISTRIBUTION_STATUSES: readonly BoardJobStatus[] = [
  "New Jobs",
  "Pending Jobs",
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

  return [
    ...uniqueSavedKeys,
    ...DISPLAY_JOB_COLUMN_KEYS.filter((key) => !uniqueSavedKeys.includes(key)),
  ];
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
  operationsTeam: string;
  appearance: "system" | "light" | "dark";
  appearanceDefaultVersion: number;
  language: string;
  system: string;
  showStageLegend: boolean;
  showSummary: boolean;
  autoCompleteDate: boolean;
  columnOrder: JobColumnKey[];
  defaultColumnOrder: JobColumnKey[];
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
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='24' fill='%232563eb'/%3E%3Cpath d='M60 20 94 39v42L60 100 26 81V39Z' fill='none' stroke='white' stroke-width='7'/%3E%3Cpath d='m42 75 18-36 18 36M49 62h22' fill='none' stroke='white' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const DEFAULT_SETTINGS: DashboardSettings = {
  logoDataUrl: DEFAULT_LOGO_DATA_URL,
  companyName: "AEC Company",
  dashboardTitle: "AI Task Management Dashboard",
  administratorName: "Administrator",
  operationsTeam: "Operations Team",
  appearance: "light",
  appearanceDefaultVersion: 2,
  language: "default",
  system: "default",
  showStageLegend: true,
  showSummary: true,
  autoCompleteDate: true,
  columnOrder: DEFAULT_COLUMN_ORDER,
  defaultColumnOrder: DEFAULT_COLUMN_ORDER,
};

const SETTINGS_STORAGE_KEY = "aec-dashboard-settings";

function normalizeSettings(value: unknown): DashboardSettings {
  const saved =
    value && typeof value === "object"
      ? (value as Partial<DashboardSettings>)
      : {};

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    appearance:
      saved.appearance === "dark" ||
      saved.appearance === "system" ||
      saved.appearance === "light"
        ? saved.appearance
        : DEFAULT_SETTINGS.appearance,
    columnOrder: normalizeColumnOrder(saved.columnOrder),
    defaultColumnOrder: normalizeColumnOrder(saved.defaultColumnOrder),
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

function JobDataTable({
  jobs,
  columnOrder,
  onOpenJob,
}: {
  jobs: Job[];
  columnOrder: JobColumnKey[];
  onOpenJob: (job: Job) => void;
}) {
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<JobColumnKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

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
  const visibleColumns = columnOrder.filter(
    (column) => !HIDDEN_JOB_PHONE_COLUMNS.has(column),
  );
  const sortedJobs = useMemo(() => {
    if (!sortColumn) return jobs;

    return jobs
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
  }, [jobs, sortColumn, sortDirection]);

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
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Job Information Sheet
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Complete read-only job records using the existing AEC fields
          </p>
        </div>

        <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
          {jobs.length} {jobs.length === 1 ? "Job" : "Jobs"}
        </span>
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
                  No job records available
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
  const [signingOut, setSigningOut] = useState(false);
  const [systemUsesDarkMode, setSystemUsesDarkMode] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
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

  const [today] = useState(() => new Date());
  const [calendarDate, setCalendarDate] = useState(() => new Date());

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
          user?: { name?: string; role?: string };
        };
        const name = result.user?.name?.trim();
        const role = result.user?.role?.trim() || "";

        if (!name) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (mounted) {
          setCurrentUserName(name);
          setCurrentUserRole(role);
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
    if (!currentUserName) return;

    let mounted = true;

    function loadCachedSettings() {
      try {
        const savedSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
        setSettings(
          normalizeSettings(savedSettings ? JSON.parse(savedSettings) : null),
        );
      } catch {
        setSettings(DEFAULT_SETTINGS);
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
        const nextSettings = normalizeSettings(
          result.settings ?? (cached ? JSON.parse(cached) : null),
        );

        if (mounted) {
          setSettings(nextSettings);
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
      if (event.key === SETTINGS_STORAGE_KEY) loadCachedSettings();
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
    Shared order for the information sheet and all seven progress boards:
    Job In Date & Time descending, then Job ID descending.
  */
  const orderedJobs = useMemo(
    () => [...jobs].sort(compareJobsByNewest),
    [jobs],
  );

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
                {settings.operationsTeam}
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

        {/* Status Categories */}

        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {TOP_STATUSES.map((status) =>
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {SECOND_ROW_STATUSES.map((status) =>
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
        </section>

        {/* Two Charts */}

        <section className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <WeeklyJobChart
            data={weeklyData}
            todayCount={todayJobCount}
            weekTotal={totalJobsThisWeek}
          />

          <JobStatusChart statusCounts={statusCounts} />
        </section>

        {/* Staff Directory */}

        <StaffDirectory staff={staff} />

        {/* Automatic Job Calendar */}

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
            </div>
          </div>

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
        </section>

        {/* Job Information Sheet */}

        <JobDataTable
          jobs={orderedJobs}
          columnOrder={settings.columnOrder}
          onOpenJob={openJobDetails}
        />

        {/* Job Progress Board */}

        <section className="mt-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="shrink-0">
              <h2 className="text-lg font-semibold text-slate-950">
                Job Progress Board
              </h2>

              <p className="mt-1 text-sm leading-5 text-slate-500">
                Each row displays up to five jobs. Additional jobs will
                automatically continue on the next row.
              </p>
            </div>

            {settings.showStageLegend && (
              <div className="w-full max-w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5 xl:ml-auto xl:w-fit">
                <div className="min-w-max">
                  <p className="whitespace-nowrap text-xs font-semibold text-slate-500">
                    Stage Legend
                  </p>

                  <div className="mt-2 flex flex-nowrap items-center justify-start gap-x-4 xl:justify-end">
                    {JOB_STATUSES.map((status) => (
                      <div
                        key={status}
                        className="flex shrink-0 items-center gap-2"
                      >
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusStyles[status].dot}`}
                        />

                        <span className="whitespace-nowrap text-xs font-medium text-slate-600">
                          {displayLabels[status]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Summary */}

          {settings.showSummary && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <p className="text-sm font-semibold text-slate-700">Summary:</p>

                {JOB_STATUSES.map((status) => (
                  <div key={status} className="flex items-center gap-2">
                    <span
                      className={`flex min-w-7 items-center justify-center rounded-md px-2 py-1 text-xs font-bold ${statusStyles[status].numberBadge}`}
                    >
                      {statusCounts[status]}
                    </span>

                    <span className="whitespace-nowrap text-xs font-medium text-slate-600">
                      {displayLabels[status]}
                    </span>
                  </div>
                ))}

                <div className="flex w-full items-center justify-end gap-2 border-t border-slate-200 pt-3 sm:ml-auto sm:w-auto sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                  <span className="text-sm font-semibold text-slate-700">
                    Total:
                  </span>

                  <span className="text-sm font-bold text-slate-950">
                    {orderedJobs.length}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Status Sections */}

          <div className="mt-5 space-y-5">
            {JOB_STATUSES.map((status) => {
              const statusJobs = orderedJobs.filter(
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
                        className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold ${styles.badge}`}
                      >
                        {statusJobs.length}{" "}
                        {statusJobs.length === 1 ? "job" : "jobs"}
                      </span>
                    </div>
                  </div>

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
                </div>
              );
            })}
          </div>
        </section>
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

function StaffDirectory({ staff }: { staff: Staff[] }) {
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

        <span className="w-fit rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
          {staff.length} {staff.length === 1 ? "Staff Member" : "Staff Members"}
        </span>
      </div>

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
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: hex }}
      />

      <div className="flex min-h-[100px] items-center justify-between gap-3 p-4 pl-5 sm:min-h-[112px] sm:gap-4 sm:p-5 sm:pl-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
              style={{ backgroundColor: hex }}
            />

            <p className="truncate text-sm font-semibold text-slate-700">
              {label}
            </p>
          </div>

          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:mt-3 sm:text-3xl">
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

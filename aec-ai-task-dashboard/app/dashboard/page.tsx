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
  "New Job",
  "Claim Warranty",
  "Pending Invoice",
  "Pending Parts",
  "Pending Quotation",
  "Pending Spec Parts",
  "Complete",
] as const;

type JobStatus = (typeof JOB_STATUSES)[number];

type Job = {
  jobId: string;
  jobInDateTime: string;

  salesPerson: string;
  salesPersonPhone: string;

  customerStatus: string;
  customerName: string;
  customerPhone: string;
  customerCompanyName: string;

  assignedTechnician: string;
  technicianPhone: string;

  description: string;
  status: JobStatus;

  inProgressStartDateTime: string;
  inProgressEndDateTime: string;

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
  "salesPerson",
  "salesPersonPhone",
  "customerStatus",
  "customerName",
  "customerPhone",
  "customerCompanyName",
  "assignedTechnician",
  "technicianPhone",
  "description",
  "status",
  "inProgressStartDateTime",
  "inProgressEndDateTime",
  "statusRemark",
  "jobCompleteDateTime",
  "invoiceNo",
  "reportNo",
  "collectionDateTime",
] as const;

type JobColumnKey = (typeof JOB_COLUMN_KEYS)[number];

const JOB_COLUMN_LABELS: Record<JobColumnKey, string> = {
  jobId: "Job ID",
  jobInDateTime: "Job In Date & Time",
  salesPerson: "Sales Person",
  salesPersonPhone: "Sales Person Phone",
  customerStatus: "Customer Status",
  customerName: "Customer Name",
  customerPhone: "Customer Phone",
  customerCompanyName: "Customer Company Name",
  assignedTechnician: "Assigned Technician",
  technicianPhone: "Technician Phone",
  description: "Description / Item",
  status: "Status",
  inProgressStartDateTime: "In Progress Start Date & Time",
  inProgressEndDateTime: "In Progress End Date & Time",
  statusRemark: "Status Remark / Issue",
  jobCompleteDateTime: "Job Complete Date & Time",
  invoiceNo: "Invoice No.",
  reportNo: "Report No.",
  collectionDateTime: "Collection Date & Time",
};

const DEFAULT_COLUMN_ORDER: JobColumnKey[] = [...JOB_COLUMN_KEYS];

function normalizeColumnOrder(value: unknown): JobColumnKey[] {
  const validKeys = new Set<JobColumnKey>(JOB_COLUMN_KEYS);
  const savedKeys = Array.isArray(value)
    ? value.filter(
        (key): key is JobColumnKey =>
          typeof key === "string" && validKeys.has(key as JobColumnKey),
      )
    : [];
  const uniqueSavedKeys = Array.from(new Set(savedKeys));

  return [
    ...uniqueSavedKeys,
    ...JOB_COLUMN_KEYS.filter((key) => !uniqueSavedKeys.includes(key)),
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
  customerStatus: ["customer_status", "customerStatus", "Customer Status"],
  customerName: ["customer_name", "customerName", "Customer Name"],
  customerPhone: ["customer_phone", "customerPhone", "Customer Phone"],
  customerCompanyName: [
    "customer_company_name",
    "customerCompanyName",
    "Customer Company Name",
  ],
  assignedTechnician: [
    "assigned_technician",
    "assignedTechnician",
    "Assigned Technician",
  ],
  technicianPhone: ["technician_phone", "technicianPhone", "Technician Phone"],
  description: ["description_item", "description", "Description / Item"],
  status: ["status", "Status"],
  inProgressStartDateTime: [
    "in_progress_start_datetime",
    "inProgressStartDateTime",
    "In Progress Start Date & Time",
  ],
  inProgressEndDateTime: [
    "in_progress_end_datetime",
    "inProgressEndDateTime",
    "In Progress End Date & Time",
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
    "new job": "New Job",
    "new jobs": "New Job",
    "claim warranty": "Claim Warranty",
    "pending invoice": "Pending Invoice",
    "pending parts": "Pending Parts",
    "pending quotation": "Pending Quotation",
    "pending spec parts": "Pending Spec Parts",
    complete: "Complete",
    completed: "Complete",
  };

  return aliases[normalized] || "New Job";
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
    customerStatus: readText(row, [
      "customer_status",
      "customerStatus",
      "Customer Status",
    ]),
    customerName: readText(row, [
      "customer_name",
      "customerName",
      "Customer Name",
    ]),
    customerPhone: readText(row, [
      "customer_phone",
      "customerPhone",
      "Customer Phone",
    ]),
    customerCompanyName: readText(row, [
      "customer_company_name",
      "customerCompanyName",
      "Customer Company Name",
    ]),
    assignedTechnician: readText(row, [
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
      "description_item",
      "description",
      "Description / Item",
    ]),
    status: normalizeJobStatus(readText(row, ["status", "Status"])),
    inProgressStartDateTime: normalizeDateTime(
      readText(row, [
        "in_progress_start_datetime",
        "inProgressStartDateTime",
        "In Progress Start Date & Time",
      ]),
    ),
    inProgressEndDateTime: normalizeDateTime(
      readText(row, [
        "in_progress_end_datetime",
        "inProgressEndDateTime",
        "In Progress End Date & Time",
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
  showStageLegend: boolean;
  showSummary: boolean;
  autoCompleteDate: boolean;
  columnOrder: JobColumnKey[];
};

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
  showStageLegend: true,
  showSummary: true,
  autoCompleteDate: true,
  columnOrder: DEFAULT_COLUMN_ORDER,
};

const SETTINGS_STORAGE_KEY = "aec-dashboard-settings";

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

  if (status === "New Job") {
    return (
      <svg {...commonProps}>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M3 12h18" />
        <path d="M10 12v2h4v-2" />
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

  if (status === "Pending Spec Parts") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4V21h-4v-1.6a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15H3v-4h1.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6V3h4v1.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9H21v4h-1.6Z" />
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
}: {
  jobs: Job[];
  columnOrder: JobColumnKey[];
}) {
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
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
        <table className="w-full min-w-[3300px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {columnOrder.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="whitespace-nowrap border-r border-slate-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600 last:border-r-0"
                >
                  {JOB_COLUMN_LABELS[column]}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {jobs.length > 0 ? (
              jobs.map((job, index) => {
                return (
                  <tr
                    key={job.jobId}
                    className={`border-b border-slate-100 transition hover:bg-blue-50/40 ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                    }`}
                  >
                    {columnOrder.map((column) => (
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
                  colSpan={columnOrder.length}
                  className="px-5 py-12 text-center text-sm text-slate-400"
                >
                  No job records available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function JobTableCell({ job, column }: { job: Job; column: JobColumnKey }) {
  const styles = statusStyles[job.status];

  if (column === "jobId") {
    return (
      <td className="whitespace-nowrap border-r border-slate-100 px-4 py-3 text-sm font-semibold text-blue-600">
        {job.jobId || "-"}
      </td>
    );
  }

  if (column === "customerStatus") {
    return (
      <td className="whitespace-nowrap border-r border-slate-100 px-4 py-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getCustomerStatusStyle(
            job.customerStatus,
          )}`}
        >
          {job.customerStatus || "-"}
        </span>
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
    "inProgressStartDateTime",
    "inProgressEndDateTime",
    "jobCompleteDateTime",
    "collectionDateTime",
  ];
  const value = dateTimeColumns.includes(column)
    ? formatDisplayDateTime(job[column])
    : job[column];

  return (
    <TableCell
      value={value}
      emphasized={column === "customerName"}
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
      className={`border-r border-slate-100 px-4 py-3 text-sm last:border-r-0 ${
        wide ? "min-w-[240px] whitespace-normal" : "whitespace-nowrap"
      } ${emphasized ? "font-semibold text-slate-900" : "text-slate-600"}`}
    >
      {value?.trim() || "-"}
    </td>
  );
}

/* =========================================================
   Staff Directory
========================================================= */

type Staff = {
  id: string;
  name: string;
  phone: string;
  position: string;
};

function mapStaffRow(row: SupabaseRow, index: number): Staff {
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
    position: readText(row, ["position", "Position"]),
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
  "New Job": {
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
  "Pending Spec Parts": {
    dot: "bg-rose-500",
    badge: "bg-rose-50 text-rose-700",
    numberBadge: "bg-rose-500 text-white",
    leftBorder: "border-l-rose-500",
    iconBackground: "bg-rose-500",
    selectFocus: "focus:border-rose-500 focus:ring-rose-500/10",
    calendar: "border-rose-300 bg-rose-100 text-rose-800",
    customerBadge:
      "border border-rose-500 bg-rose-100 text-rose-800 shadow-sm ring-1 ring-rose-200",
    hex: "#f43f5e",
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

const customerStatusStyles: Record<string, string> = {
  "New Customer":
    "border border-fuchsia-700 bg-fuchsia-600 text-white shadow-sm ring-1 ring-fuchsia-400/40",
  "Existing Customer":
    "border border-teal-700 bg-teal-600 text-white shadow-sm ring-1 ring-teal-400/40",
};

function getCustomerStatusStyle(customerStatus?: string) {
  return (
    customerStatusStyles[customerStatus || ""] ||
    "border border-slate-500 bg-slate-600 text-white shadow-sm"
  );
}

const displayLabels: Record<JobStatus, string> = {
  "New Job": "New Job",
  "Claim Warranty": "Claim Warranty",
  "Pending Invoice": "Pending Invoice",
  "Pending Parts": "Pending Parts",
  "Pending Quotation": "Pending Quotation",
  "Pending Spec Parts": "Pending Spec Parts",
  Complete: "Completed",
};

const statisticLabels: Record<JobStatus, string> = {
  "New Job": "New Jobs",
  "Claim Warranty": "Claim Warranty",
  "Pending Invoice": "Pending Invoice",
  "Pending Parts": "Pending Parts",
  "Pending Quotation": "Pending Quotation",
  "Pending Spec Parts": "Pending Spec Parts",
  Complete: "Completed",
};

const statusDescriptions: Record<JobStatus, string> = {
  "New Job": "Newly created jobs",
  "Claim Warranty": "Jobs under warranty claim",
  "Pending Invoice": "Waiting for invoice processing",
  "Pending Parts": "Waiting for required parts",
  "Pending Quotation": "Waiting for quotation approval",
  "Pending Spec Parts": "Waiting for parts specification",
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

function isJobScheduledOnDate(job: Job, dateKey: string) {
  /*
    Calendar appointments are valid only when BOTH In Progress
    Start and End Date & Time have been filled in.
  */
  const startDateTime = parseDateTime(job.inProgressStartDateTime);
  const endDateTime = parseDateTime(job.inProgressEndDateTime);

  if (!startDateTime || !endDateTime || endDateTime < startDateTime) {
    return false;
  }

  const startDateKey = formatDateKey(startDateTime);
  const endDateKey = formatDateKey(endDateTime);

  return dateKey >= startDateKey && dateKey <= endDateKey;
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

function formatInProgressPeriod(startDateTime?: string, endDateTime?: string) {
  const hasStart = Boolean(startDateTime?.trim());
  const hasEnd = Boolean(endDateTime?.trim());

  if (!hasStart && !hasEnd) return "-";

  if (hasStart && !hasEnd) {
    return formatDisplayDateTime(startDateTime);
  }

  if (!hasStart && hasEnd) {
    return formatDisplayDateTime(endDateTime);
  }

  return `${formatDisplayDateTime(
    startDateTime,
  )} → ${formatDisplayDateTime(endDateTime)}`;
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
  const [systemUsesDarkMode, setSystemUsesDarkMode] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [dataIsLoading, setDataIsLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const [today] = useState(() => new Date());
  const [calendarDate, setCalendarDate] = useState(() => new Date());

  useEffect(() => {
    if (!selectedJob) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [selectedJob]);

  useEffect(() => {
    function loadSettings() {
      try {
        const savedSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

        if (savedSettings) {
          const parsedSettings = JSON.parse(
            savedSettings,
          ) as Partial<DashboardSettings>;

          const shouldUseNewLightDefault =
            parsedSettings.appearanceDefaultVersion !==
              DEFAULT_SETTINGS.appearanceDefaultVersion &&
            parsedSettings.appearance === "system";

          const nextSettings: DashboardSettings = {
            ...DEFAULT_SETTINGS,
            ...parsedSettings,
            appearance: shouldUseNewLightDefault
              ? "light"
              : parsedSettings.appearance || DEFAULT_SETTINGS.appearance,
            appearanceDefaultVersion: DEFAULT_SETTINGS.appearanceDefaultVersion,
            columnOrder: normalizeColumnOrder(parsedSettings.columnOrder),
          };

          setSettings(nextSettings);
          window.localStorage.setItem(
            SETTINGS_STORAGE_KEY,
            JSON.stringify(nextSettings),
          );
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
      } catch {
        setSettings(DEFAULT_SETTINGS);
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === SETTINGS_STORAGE_KEY) {
        loadSettings();
      }
    }

    loadSettings();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("aec-settings-updated", loadSettings);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("aec-settings-updated", loadSettings);
    };
  }, []);

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

  const statusCounts = useMemo(() => {
    return JOB_STATUSES.reduce(
      (counts, status) => {
        counts[status] = jobs.filter((job) => job.status === status).length;

        return counts;
      },
      {} as Record<JobStatus, number>,
    );
  }, [jobs]);

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
      value: jobs.filter((job) => getJobDateKey(job.jobInDateTime) === dateKey)
        .length,
    }));
  }, [jobs, today]);

  const todayJobCount = jobs.filter(
    (job) => getJobDateKey(job.jobInDateTime) === formatDateKey(today),
  ).length;

  const totalOrdersThisWeek = weeklyData.reduce(
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

  return (
    <main
      className={`min-h-screen bg-slate-50 ${
        darkModeIsActive ? "aec-dark" : ""
      }`}
    >
      <DashboardThemeStyles />
      {/* Header */}

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1900px] items-center justify-between px-5 py-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <img
                src={settings.logoDataUrl || DEFAULT_LOGO_DATA_URL}
                alt={`${settings.companyName} logo`}
                className="h-full w-full object-contain"
              />
            </div>

            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
                {settings.companyName}
              </p>

              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-950">
                {settings.dashboardTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
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
              title="Settings"
              aria-label="Open settings"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
            >
              <SettingsIcon />
            </button>

            <button
              type="button"
              onClick={() => router.push("/login")}
              className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1900px] px-5 py-7 lg:px-8">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {statisticCards
              .filter(
                (card) =>
                  card.status === "New Job" || card.status === "Complete",
              )
              .map((card) => (
                <StatisticCard key={card.status} {...card} />
              ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {statisticCards
              .filter(
                (card) =>
                  card.status !== "New Job" && card.status !== "Complete",
              )
              .map((card) => (
                <StatisticCard key={card.status} {...card} />
              ))}
          </div>
        </section>

        {/* Two Charts */}

        <section className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <WeeklyOrderChart
            data={weeklyData}
            todayCount={todayJobCount}
            weekTotal={totalOrdersThisWeek}
          />

          <JobStatusChart statusCounts={statusCounts} totalJobs={jobs.length} />
        </section>

        {/* Staff Directory */}

        <StaffDirectory staff={staff} />

        {/* Automatic Job Calendar */}

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Job Calendar
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Job activity and workflow calendar
              </p>
            </div>

            <div className="flex items-center gap-2">
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

              <div className="min-w-[150px] text-center">
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

          <div className="overflow-x-auto p-4">
            <div className="min-w-[1000px]">
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
                  const dayJobs = jobs.filter((job) =>
                    isJobScheduledOnDate(job, calendarDay.dateKey),
                  );

                  const isToday = calendarDay.dateKey === formatDateKey(today);

                  return (
                    <div
                      key={calendarDay.dateKey}
                      className={`min-h-[145px] rounded-xl border p-2 ${
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
                        {dayJobs.slice(0, 4).map((job) => (
                          <button
                            type="button"
                            key={`${job.jobId}-${calendarDay.dateKey}`}
                            onClick={() => openJobDetails(job)}
                            title={`${job.jobId} - ${job.customerName} - ${
                              job.description
                            } | ${formatInProgressPeriod(
                              job.inProgressStartDateTime,
                              job.inProgressEndDateTime,
                            )}`}
                            className={`block w-full rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${statusStyles[job.status].calendar}`}
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold leading-none ${getCustomerStatusStyle(
                                  job.customerStatus,
                                )}`}
                              >
                                {job.customerStatus || "Customer"}
                              </span>

                              <span className="truncate">
                                {displayLabels[job.status]}
                              </span>
                            </span>

                            <span className="mt-1 block truncate font-medium">
                              {job.customerName}
                              {job.description ? ` - ${job.description}` : ""}
                            </span>
                          </button>
                        ))}

                        {dayJobs.length > 4 && (
                          <div className="w-full rounded-lg bg-slate-100 px-2 py-1.5 text-left text-[11px] font-semibold text-slate-500">
                            +{dayJobs.length - 4} more jobs
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Job Information Sheet */}

        <JobDataTable jobs={jobs} columnOrder={settings.columnOrder} />

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
              <div className="w-fit max-w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm xl:ml-auto">
                <p className="text-right text-xs font-semibold text-slate-500">
                  Stage Legend
                </p>

                <div className="mt-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                  {JOB_STATUSES.map((status) => (
                    <div key={status} className="flex items-center gap-2">
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

                <div className="ml-auto flex items-center gap-2 border-l border-slate-200 pl-4">
                  <span className="text-sm font-semibold text-slate-700">
                    Total:
                  </span>

                  <span className="text-sm font-bold text-slate-950">
                    {jobs.length}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Status Sections */}

          <div className="mt-5 space-y-5">
            {JOB_STATUSES.map((status) => {
              const statusJobs = jobs.filter((job) => job.status === status);

              const styles = statusStyles[status];

              return (
                <div
                  key={status}
                  className={`overflow-hidden rounded-2xl border border-l-4 border-slate-200 bg-white shadow-sm ${styles.leftBorder}`}
                >
                  <div className="flex min-h-[72px] items-center justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4">
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

                    <span
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold ${styles.badge}`}
                    >
                      {statusJobs.length}{" "}
                      {statusJobs.length === 1 ? "job" : "jobs"}
                    </span>
                  </div>

                  <div className="p-4">
                    {statusJobs.length > 0 ? (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        {statusJobs.map((job) => (
                          <button
                            type="button"
                            key={job.jobId}
                            onClick={() => openJobDetails(job)}
                            className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-blue-600">
                                {job.jobId}
                              </span>

                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${getCustomerStatusStyle(
                                  job.customerStatus,
                                )}`}
                              >
                                {job.customerStatus ||
                                  displayLabels[job.status]}
                              </span>
                            </div>

                            <h4 className="mt-3 truncate text-sm font-semibold text-slate-900">
                              {job.customerName}
                            </h4>

                            {job.customerCompanyName && (
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {job.customerCompanyName}
                              </p>
                            )}

                            <p className="mt-3 line-clamp-2 min-h-[40px] text-sm leading-5 text-slate-600">
                              {job.description || "No description provided"}
                            </p>

                            <div className="mt-4 border-t border-slate-100 pt-3">
                              <p className="truncate text-xs text-slate-400">
                                Sales: {job.salesPerson || "-"}
                              </p>

                              {job.assignedTechnician && (
                                <p className="mt-2 truncate text-xs font-medium text-slate-600">
                                  Technician: {job.assignedTechnician}
                                </p>
                              )}

                              {job.invoiceNo && (
                                <p className="mt-2 truncate text-xs font-medium text-emerald-700">
                                  Invoice: {job.invoiceNo}
                                </p>
                              )}

                              {job.reportNo && (
                                <p className="mt-2 truncate text-xs font-medium text-violet-700">
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
                                  label="In Progress"
                                  value={formatInProgressPeriod(
                                    job.inProgressStartDateTime,
                                    job.inProgressEndDateTime,
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
  "salesPersonPhone",
  "customerStatus",
  "customerName",
  "customerPhone",
  "customerCompanyName",
];

const JOB_PROGRESS_FIELDS: JobColumnKey[] = [
  "assignedTechnician",
  "technicianPhone",
  "description",
  "status",
  "inProgressStartDateTime",
  "inProgressEndDateTime",
  "statusRemark",
  "jobCompleteDateTime",
  "invoiceNo",
  "reportNo",
  "collectionDateTime",
];

const DATE_TIME_FIELDS = new Set<JobColumnKey>([
  "jobInDateTime",
  "inProgressStartDateTime",
  "inProgressEndDateTime",
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
        className={`mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-6 text-slate-900 ${
          key === "description" || key === "statusRemark"
            ? "whitespace-pre-wrap"
            : "break-words"
        }`}
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-details-title"
        className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
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

        <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
          {renderSection(
            "Job Information",
            "Customer, sales and incoming job information.",
            JOB_INFORMATION_FIELDS,
          )}

          {renderSection(
            "Job Progress Details",
            "Technician, workflow status, dates and supporting references.",
            JOB_PROGRESS_FIELDS,
          )}

        </div>

        <div className="flex justify-end border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20"
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
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
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
                Employee contact details
              </p>
            </div>
          </div>
        </div>

        <span className="w-fit rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
          {staff.length} {staff.length === 1 ? "Staff Member" : "Staff Members"}
        </span>
      </div>

      <div className="p-5">
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
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {staffMember.name}
                    </p>

                    <a
                      href={`tel:${staffMember.phone}`}
                      className="mt-1 flex items-center gap-1.5 truncate text-xs font-medium text-slate-500 transition hover:text-blue-600"
                    >
                      <PhoneIcon />
                      <span className="truncate">{staffMember.phone}</span>
                    </a>

                    <p className="mt-1 flex items-center gap-1.5 truncate text-xs font-medium text-slate-500">
                      <PositionIcon />
                      <span className="truncate">
                        {staffMember.position || "Position not set"}
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

      <div className="flex min-h-[112px] items-center justify-between gap-4 p-5 pl-6">
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

          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
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
   Weekly Order Trend Chart
========================================================= */

function WeeklyOrderChart({
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">
          Weekly Order Trend
        </h2>

        <p className="mt-1 text-sm text-slate-500">Jobs created this week</p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs font-medium text-slate-500">
            Today&apos;s Order Count
          </p>

          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {todayCount}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs font-medium text-slate-500">
            Total Orders This Week
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
  totalJobs,
}: {
  statusCounts: Record<JobStatus, number>;
  totalJobs: number;
}) {
  let accumulatedPercentage = 0;

  const gradientSections = JOB_STATUSES.map((status) => {
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">
          Job Status Distribution
        </h2>

        <p className="mt-1 text-sm text-slate-500">Current status breakdown</p>
      </div>

      <div className="mt-7 flex min-h-[320px] flex-col items-center justify-center gap-7 lg:flex-row">
        <div
          className="relative h-52 w-52 shrink-0 rounded-full"
          style={{ background: donutBackground }}
        >
          <div className="absolute inset-9 flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
            <span className="text-3xl font-semibold text-slate-950">
              {totalJobs}
            </span>

            <span className="mt-1 text-xs font-medium text-slate-500">
              Total Jobs
            </span>
          </div>
        </div>

        <div className="grid w-full max-w-sm grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {JOB_STATUSES.map((status) => {
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
                    {displayLabels[status]}
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
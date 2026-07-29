"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/* =========================================================
   Job Types

   This Dashboard is read-only, so the shared EditJobModal
   dependency is intentionally removed. Keeping the types here
   prevents module-resolution and implicit-any TypeScript errors.
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
};

/* =========================================================
   Initial Job Data

   如果你已经有真正的 Job 资料，
   请把你原本的 initialJobs 资料复制回来。
========================================================= */

const initialJobs: Job[] = [
  {
    jobId: "JOB-0101",
    jobInDateTime: "2026-07-27 09:15",
    salesPerson: "AEC Sales",
    salesPersonPhone: "012-3456789",
    customerStatus: "New Customer",
    customerName: "One Box",
    customerPhone: "012-1112233",
    customerCompanyName: "One Box Sdn Bhd",
    assignedTechnician: "Technician A",
    technicianPhone: "012-5556677",
    description: "Banner",
    status: "New Job",
    inProgressStartDateTime: "",
    inProgressEndDateTime: "",
    statusRemark: "",
    jobCompleteDateTime: "",
    invoiceNo: "",
    reportNo: "",
    collectionDateTime: "",
  },
  {
    jobId: "JOB-0102",
    jobInDateTime: "2026-07-27 10:30",
    salesPerson: "AEC Sales",
    salesPersonPhone: "012-3456789",
    customerStatus: "Existing Customer",
    customerName: "Pearl Travel",
    customerPhone: "012-2223344",
    customerCompanyName: "Pearl Travel Sdn Bhd",
    assignedTechnician: "Technician B",
    technicianPhone: "012-6667788",
    description: "Flyer",
    status: "Pending Quotation",
    inProgressStartDateTime: "2026-07-27 13:00",
    inProgressEndDateTime: "2026-07-29 17:00",
    statusRemark: "",
    jobCompleteDateTime: "",
    invoiceNo: "",
    reportNo: "",
    collectionDateTime: "",
  },
  {
    jobId: "JOB-0103",
    jobInDateTime: "2026-07-28 11:45",
    salesPerson: "AEC Sales",
    salesPersonPhone: "012-3456789",
    customerStatus: "New Customer",
    customerName: "Spine Joing",
    customerPhone: "012-3334455",
    customerCompanyName: "Spine Joing",
    assignedTechnician: "",
    technicianPhone: "",
    description: "Roll Up",
    status: "New Job",
    inProgressStartDateTime: "",
    inProgressEndDateTime: "",
    statusRemark: "",
    jobCompleteDateTime: "",
    invoiceNo: "",
    reportNo: "",
    collectionDateTime: "",
  },
  {
    jobId: "JOB-0104",
    jobInDateTime: "2026-07-29 14:00",
    salesPerson: "AEC Sales",
    salesPersonPhone: "012-3456789",
    customerStatus: "Existing Customer",
    customerName: "Goreal",
    customerPhone: "012-4445566",
    customerCompanyName: "Goreal Sdn Bhd",
    assignedTechnician: "Technician C",
    technicianPhone: "012-7778899",
    description: "Roll Up",
    status: "Pending Parts",
    inProgressStartDateTime: "2026-07-29 15:00",
    inProgressEndDateTime: "",
    statusRemark: "",
    jobCompleteDateTime: "",
    invoiceNo: "",
    reportNo: "",
    collectionDateTime: "",
  },
  {
    jobId: "JOB-0105",
    jobInDateTime: "2026-07-30 09:00",
    salesPerson: "AEC Sales",
    salesPersonPhone: "012-3456789",
    customerStatus: "Existing Customer",
    customerName: "Classical Art",
    customerPhone: "012-5556677",
    customerCompanyName: "Classical Art",
    assignedTechnician: "Technician A",
    technicianPhone: "012-5556677",
    description: "Door Board",
    status: "Pending Invoice",
    inProgressStartDateTime: "",
    inProgressEndDateTime: "",
    statusRemark: "",
    jobCompleteDateTime: "",
    invoiceNo: "",
    reportNo: "",
    collectionDateTime: "",
  },
  {
    jobId: "JOB-0106",
    jobInDateTime: "2026-07-31 15:30",
    salesPerson: "AEC Sales",
    salesPersonPhone: "012-3456789",
    customerStatus: "Existing Customer",
    customerName: "Money Render",
    customerPhone: "012-8889900",
    customerCompanyName: "Money Render",
    assignedTechnician: "Technician D",
    technicianPhone: "012-9990011",
    description: "Bill Book",
    status: "Complete",
    inProgressStartDateTime: "2026-07-31 15:45",
    inProgressEndDateTime: "",
    statusRemark: "",
    jobCompleteDateTime: "2026-07-31 17:30",
    invoiceNo: "INV-1006",
    reportNo: "RPT-1006",
    collectionDateTime: "2026-08-01 10:00",
  },
];

/* =========================================================
   Settings
========================================================= */

type DashboardSettings = {
  companyName: string;
  dashboardTitle: string;
  administratorName: string;
  operationsTeam: string;
  showStageLegend: boolean;
  showSummary: boolean;
  autoCompleteDate: boolean;
};

const DEFAULT_SETTINGS: DashboardSettings = {
  companyName: "AEC Company",
  dashboardTitle: "AI Task Management Dashboard",
  administratorName: "Administrator",
  operationsTeam: "Operations Team",
  showStageLegend: true,
  showSummary: true,
  autoCompleteDate: true,
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

function StatusIcon({ status }: { status: JobStatus }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-6 w-6",
    "aria-hidden": true,
  };

  if (status === "New Job") {
    return (
      <svg {...commonProps}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
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
   Read-only Job Table Sheet
========================================================= */

function JobDataTable({ jobs }: { jobs: Job[] }) {
  const columns = [
    "Job ID",
    "Job In Date & Time",
    "Sales Person",
    "Sales Person Phone",
    "Customer Status",
    "Customer Name",
    "Customer Phone",
    "Customer Company Name",
    "Assigned Technician",
    "Technician Phone",
    "Description / Item",
    "Status",
    "In Progress Start Date & Time",
    "In Progress End Date & Time",
    "Status Remark / Issue",
    "Job Complete Date & Time",
    "Invoice No.",
    "Report No.",
    "Collection Date & Time",
  ];

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
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="whitespace-nowrap border-r border-slate-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600 last:border-r-0"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {jobs.length > 0 ? (
              jobs.map((job, index) => {
                const styles = statusStyles[job.status];

                return (
                  <tr
                    key={job.jobId}
                    className={`border-b border-slate-100 transition hover:bg-blue-50/40 ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                    }`}
                  >
                    <td className="whitespace-nowrap border-r border-slate-100 px-4 py-3 text-sm font-semibold text-blue-600">
                      {job.jobId || "-"}
                    </td>

                    <TableCell
                      value={formatDisplayDateTime(job.jobInDateTime)}
                    />
                    <TableCell value={job.salesPerson} />
                    <TableCell value={job.salesPersonPhone} />

                    <td className="whitespace-nowrap border-r border-slate-100 px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles.customerBadge}`}
                      >
                        {job.customerStatus || "-"}
                      </span>
                    </td>

                    <TableCell value={job.customerName} emphasized />
                    <TableCell value={job.customerPhone} />
                    <TableCell value={job.customerCompanyName} />
                    <TableCell value={job.assignedTechnician} />
                    <TableCell value={job.technicianPhone} />
                    <TableCell value={job.description} wide />

                    <td className="whitespace-nowrap border-r border-slate-100 px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${styles.calendar}`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${styles.dot}`}
                        />
                        {displayLabels[job.status]}
                      </span>
                    </td>

                    <TableCell
                      value={formatDisplayDateTime(job.inProgressStartDateTime)}
                    />
                    <TableCell
                      value={formatDisplayDateTime(job.inProgressEndDateTime)}
                    />
                    <TableCell value={job.statusRemark} wide />
                    <TableCell
                      value={formatDisplayDateTime(job.jobCompleteDateTime)}
                    />
                    <TableCell value={job.invoiceNo} />
                    <TableCell value={job.reportNo} />
                    <TableCell
                      value={formatDisplayDateTime(job.collectionDateTime)}
                    />
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
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

const STAFF_STORAGE_KEY = "aec-dashboard-staff";

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
    calendar: "border-blue-300 bg-blue-100 text-blue-800",
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
  return jobDateTime.trim().slice(0, 10);
}

function parseDateTime(value?: string) {
  if (!value?.trim()) return null;

  const normalizedValue = value.trim().replace("T", " ");
  const [datePart, timePart = "00:00"] = normalizedValue.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0] = timePart.split(":").map(Number);

  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

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

  const normalizedValue = value.trim().replace("T", " ");
  const [datePart, timePart = ""] = normalizedValue.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);

  if (!year || !month || !day) {
    return normalizedValue;
  }

  const formattedDate = new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));

  return timePart ? `${formattedDate}, ${timePart.slice(0, 5)}` : formattedDate;
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

  const [jobs] = useState<Job[]>(initialJobs);
  const [settings, setSettings] = useState<DashboardSettings>(DEFAULT_SETTINGS);
  const [staff, setStaff] = useState<Staff[]>([]);

  const [today] = useState(() => new Date());
  const [calendarDate, setCalendarDate] = useState(() => new Date());

  useEffect(() => {
    try {
      const savedSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

      if (savedSettings) {
        setSettings({
          ...DEFAULT_SETTINGS,
          ...JSON.parse(savedSettings),
        });
      }
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }, []);

  useEffect(() => {
    try {
      const savedStaff = window.localStorage.getItem(STAFF_STORAGE_KEY);

      if (savedStaff) {
        const parsedStaff = JSON.parse(savedStaff) as Staff[];

        if (Array.isArray(parsedStaff)) {
          /*
            Keep old saved staff records compatible.
            Staff created before Position was added will receive an empty value.
          */
          setStaff(
            parsedStaff.map((staffMember) => ({
              ...staffMember,
              position: staffMember.position ?? "",
            })),
          );
        }
      }
    } catch {
      setStaff([]);
    }
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

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1900px] items-center justify-between px-5 py-5 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
              {settings.companyName}
            </p>

            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              {settings.dashboardTitle}
            </h1>
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
                          <div
                            key={`${job.jobId}-${calendarDay.dateKey}`}
                            title={`${job.jobId} - ${job.customerName} - ${
                              job.description
                            } | ${formatInProgressPeriod(
                              job.inProgressStartDateTime,
                              job.inProgressEndDateTime,
                            )}`}
                            className={`block w-full truncate rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold ${statusStyles[job.status].calendar}`}
                          >
                            {job.customerName}
                            {job.description ? ` - ${job.description}` : ""}
                          </div>
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

        {/* Read-only Job Table Sheet */}

        <JobDataTable jobs={jobs} />

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
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles.iconBackground}`}
                      >
                        <span className="h-3 w-3 rounded-full bg-white" />
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
                          <div
                            key={job.jobId}
                            className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-blue-600">
                                {job.jobId}
                              </span>

                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${styles.customerBadge}`}
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

                            {/* Read-only Status */}

                            <div className="mt-4 border-t border-slate-100 pt-3">
                              <p className="mb-1.5 text-[11px] font-medium text-slate-500">
                                Current Status:
                              </p>

                              <div
                                className={`flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${styles.calendar}`}
                              >
                                <span
                                  className={`h-2.5 w-2.5 rounded-full ${styles.dot}`}
                                />
                                {displayLabels[job.status]}
                              </div>
                            </div>
                          </div>
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
    </main>
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
    <div
      className="relative overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      style={{
        borderColor: `${hex}55`,
        background: `linear-gradient(90deg, ${hex}20 0%, ${hex}20 48%, #ffffff 48%, #ffffff 100%)`,
      }}
    >
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
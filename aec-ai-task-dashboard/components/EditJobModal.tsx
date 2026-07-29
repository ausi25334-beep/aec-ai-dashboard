"use client";

import { useEffect, useState } from "react";

/* =========================================================
   Job Status
========================================================= */

export const JOB_STATUSES = [
  "New Job",
  "Claim Warranty",
  "Pending Invoice",
  "Pending Parts",
  "Pending Quotation",
  "Pending Spec Parts",
  "Complete",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/* =========================================================
   Job Type
========================================================= */

export type Job = {
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
   Component Props
========================================================= */

type EditJobModalProps = {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedJob: Job, originalJobId: string) => void;
};

/* =========================================================
   Date Time Helpers
========================================================= */

function toDateTimeInput(value?: string) {
  if (!value) return "";

  return value.replace(" ", "T").slice(0, 16);
}

function fromDateTimeInput(value?: string) {
  if (!value) return "";

  return value.replace("T", " ");
}

/* =========================================================
   Icons
========================================================= */

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/* =========================================================
   Main Edit Job Modal
========================================================= */

export default function EditJobModal({
  job,
  isOpen,
  onClose,
  onSave,
}: EditJobModalProps) {
  const [formData, setFormData] = useState<Job | null>(null);
  const [originalJobId, setOriginalJobId] = useState("");

  /*
    每次打开不同的 Job 时，
    将 Job Data 放入 Form。
  */
  useEffect(() => {
    if (!job || !isOpen) return;

    setOriginalJobId(job.jobId);

    setFormData({
      ...job,
      inProgressStartDateTime: job.inProgressStartDateTime ?? "",
      inProgressEndDateTime: job.inProgressEndDateTime ?? "",
      collectionDateTime: job.collectionDateTime ?? "",
    });
  }, [job, isOpen]);

  /*
    按 ESC 关闭 Modal。
  */
  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen || !formData) {
    return null;
  }

  function updateField<K extends keyof Job>(field: K, value: Job[K]) {
    setFormData((current) => {
      if (!current) return current;

      return {
        ...current,
        [field]: value,
      };
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formData) return;

    onSave(
      {
        ...formData,
        jobId: formData.jobId.trim(),
        inProgressStartDateTime: formData.inProgressStartDateTime ?? "",
        inProgressEndDateTime: formData.inProgressEndDateTime ?? "",
        collectionDateTime: formData.collectionDateTime ?? "",
      },
      originalJobId,
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Modal Header */}

        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Edit Job Details
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Update the information and save your changes.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit job"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Modal Form */}

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="space-y-6">
              {/* Job Information */}

              <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Job Information
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    Customer, sales and technician information for this job.
                  </p>
                </div>

                <div className="space-y-5">
                  {/* First Row */}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <FormField
                      label="Job ID"
                      value={formData.jobId}
                      required
                      onChange={(value) => updateField("jobId", value)}
                    />

                    <DateTimeField
                      label="Job In Date & Time"
                      value={formData.jobInDateTime}
                      required
                      onChange={(value) => updateField("jobInDateTime", value)}
                    />
                  </div>

                  {/* Sales Information */}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <FormField
                      label="Sales Person"
                      value={formData.salesPerson}
                      onChange={(value) => updateField("salesPerson", value)}
                    />

                    <FormField
                      label="Sales Person Phone"
                      type="tel"
                      value={formData.salesPersonPhone}
                      onChange={(value) =>
                        updateField("salesPersonPhone", value)
                      }
                    />
                  </div>

                  {/* Customer Information */}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <SelectField
                      label="Customer Status"
                      value={formData.customerStatus}
                      options={["New Customer", "Existing Customer"]}
                      onChange={(value) => updateField("customerStatus", value)}
                    />

                    <FormField
                      label="Customer Name"
                      value={formData.customerName}
                      required
                      onChange={(value) => updateField("customerName", value)}
                    />

                    <FormField
                      label="Customer Phone"
                      type="tel"
                      value={formData.customerPhone}
                      onChange={(value) => updateField("customerPhone", value)}
                    />

                    <FormField
                      label="Customer Company Name"
                      value={formData.customerCompanyName}
                      onChange={(value) =>
                        updateField("customerCompanyName", value)
                      }
                    />
                  </div>

                  {/* Technician Information */}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <FormField
                      label="Assigned Technician"
                      value={formData.assignedTechnician}
                      onChange={(value) =>
                        updateField("assignedTechnician", value)
                      }
                    />

                    <FormField
                      label="Technician Phone"
                      type="tel"
                      value={formData.technicianPhone}
                      onChange={(value) =>
                        updateField("technicianPhone", value)
                      }
                    />
                  </div>

                  {/* Job Description */}

                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Job Description
                    </label>

                    <textarea
                      rows={4}
                      value={formData.description}
                      onChange={(event) =>
                        updateField("description", event.target.value)
                      }
                      placeholder="Enter job description"
                      className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    />
                  </div>
                </div>
              </section>

              {/* Job Progress Details */}

              <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Job Progress Details
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    Record the progress period, completion and collection
                    details.
                  </p>
                </div>

                <div className="space-y-5">
                  {/* Status and In Progress Period */}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <SelectField
                      label="Job Status"
                      value={formData.status}
                      options={[...JOB_STATUSES]}
                      getOptionLabel={(status) =>
                        status === "Complete" ? "Completed" : status
                      }
                      onChange={(value) =>
                        updateField("status", value as JobStatus)
                      }
                    />

                    <DateTimeField
                      label="In Progress Start Date & Time"
                      value={formData.inProgressStartDateTime}
                      onChange={(value) =>
                        updateField("inProgressStartDateTime", value)
                      }
                    />

                    <DateTimeField
                      label="In Progress End Date & Time (Optional)"
                      value={formData.inProgressEndDateTime}
                      onChange={(value) =>
                        updateField("inProgressEndDateTime", value)
                      }
                    />
                  </div>

                  <p className="-mt-2 text-xs text-slate-400">
                    Leave the end field empty for a one-day job. Fill both
                    fields when the job runs from one date and time to another.
                  </p>

                  {/* Status Remark */}

                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Status Remark
                    </label>

                    <textarea
                      rows={3}
                      value={formData.statusRemark}
                      onChange={(event) =>
                        updateField("statusRemark", event.target.value)
                      }
                      placeholder="Enter status remark"
                      className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    />
                  </div>

                  {/* Completion Information */}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <DateTimeField
                      label="Job Complete Date & Time"
                      value={formData.jobCompleteDateTime}
                      onChange={(value) =>
                        updateField("jobCompleteDateTime", value)
                      }
                    />

                    <FormField
                      label="Invoice No."
                      value={formData.invoiceNo}
                      onChange={(value) => updateField("invoiceNo", value)}
                    />

                    <FormField
                      label="Report No."
                      value={formData.reportNo}
                      onChange={(value) => updateField("reportNo", value)}
                    />

                    <DateTimeField
                      label="Collection Date & Time"
                      value={formData.collectionDateTime}
                      onChange={(value) =>
                        updateField("collectionDateTime", value)
                      }
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>

          {/* Footer Buttons */}

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="h-10 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   Reusable Form Field
========================================================= */

function FormField({
  label,
  value,
  type = "text",
  required = false,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>

      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
      />
    </div>
  );
}

/* =========================================================
   Date Time Field
========================================================= */

function DateTimeField({
  label,
  value,
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>

      <input
        type="datetime-local"
        value={toDateTimeInput(value)}
        required={required}
        onChange={(event) => onChange(fromDateTimeInput(event.target.value))}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
      />
    </div>
  );
}

/* =========================================================
   Select Field
========================================================= */

function SelectField({
  label,
  value,
  options,
  getOptionLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  getOptionLabel?: (option: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {getOptionLabel ? getOptionLabel(option) : option}
          </option>
        ))}
      </select>
    </div>
  );
}
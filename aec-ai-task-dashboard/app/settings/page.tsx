"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

type DashboardSettings = {
  companyName: string;
  dashboardTitle: string;
  administratorName: string;
  operationsTeam: string;
  showStageLegend: boolean;
  showSummary: boolean;
  autoCompleteDate: boolean;
  columnOrder: JobColumnKey[];
};

const DEFAULT_SETTINGS: DashboardSettings = {
  companyName: "AEC Company",
  dashboardTitle: "AI Task Management Dashboard",
  administratorName: "Administrator",
  operationsTeam: "Operations Team",
  showStageLegend: true,
  showSummary: true,
  autoCompleteDate: true,
  columnOrder: DEFAULT_COLUMN_ORDER,
};

const SETTINGS_STORAGE_KEY = "aec-dashboard-settings";

function ArrowLeftIcon() {
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
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
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
      className="h-6 w-6"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.63.8 1.05 1.45 1.05H21a2 2 0 1 1 0 4h-.1A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}

export default function SettingsPage() {
  const router = useRouter();

  const [settings, setSettings] =
    useState<DashboardSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [draggedColumn, setDraggedColumn] =
    useState<JobColumnKey | null>(null);

  useEffect(() => {
    try {
      const savedSettings = window.localStorage.getItem(
        SETTINGS_STORAGE_KEY,
      );

      if (savedSettings) {
        const parsedSettings = JSON.parse(
          savedSettings,
        ) as Partial<DashboardSettings>;

        setSettings({
          ...DEFAULT_SETTINGS,
          ...parsedSettings,
          columnOrder: normalizeColumnOrder(parsedSettings.columnOrder),
        });
      }
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }, []);

  function updateTextField(
    field: keyof DashboardSettings,
    value: string,
  ) {
    setSettings((current) => ({
      ...current,
      [field]: value,
    }));

    setSaved(false);
  }

  function updateToggle(
    field: keyof DashboardSettings,
    checked: boolean,
  ) {
    setSettings((current) => ({
      ...current,
      [field]: checked,
    }));

    setSaved(false);
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedSettings = {
      ...settings,
      columnOrder: normalizeColumnOrder(settings.columnOrder),
    };

    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(normalizedSettings),
    );

    setSettings(normalizedSettings);
    window.dispatchEvent(new Event("aec-settings-updated"));
    setSaved(true);
  }

  function handleReset() {
    setSettings(DEFAULT_SETTINGS);
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(DEFAULT_SETTINGS),
    );
    window.dispatchEvent(new Event("aec-settings-updated"));
    setSaved(true);
  }

  function moveColumn(column: JobColumnKey, direction: -1 | 1) {
    setSettings((current) => {
      const currentIndex = current.columnOrder.indexOf(column);
      const newIndex = currentIndex + direction;

      if (currentIndex < 0 || newIndex < 0 || newIndex >= current.columnOrder.length) {
        return current;
      }

      const nextOrder = [...current.columnOrder];
      [nextOrder[currentIndex], nextOrder[newIndex]] = [
        nextOrder[newIndex],
        nextOrder[currentIndex],
      ];

      return {
        ...current,
        columnOrder: nextOrder,
      };
    });

    setSaved(false);
  }

  function dropColumn(targetColumn: JobColumnKey) {
    if (!draggedColumn || draggedColumn === targetColumn) {
      setDraggedColumn(null);
      return;
    }

    setSettings((current) => {
      const nextOrder = current.columnOrder.filter(
        (column) => column !== draggedColumn,
      );
      const targetIndex = nextOrder.indexOf(targetColumn);

      nextOrder.splice(targetIndex, 0, draggedColumn);

      return {
        ...current,
        columnOrder: nextOrder,
      };
    });

    setDraggedColumn(null);
    setSaved(false);
  }

  const inputStyle =
    "mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-5 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
              AEC Company
            </p>

            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              System Settings
            </h1>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
          >
            <ArrowLeftIcon />
            Back to Dashboard
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-5 py-8 lg:px-8">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
            <SettingsIcon />
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Dashboard Preferences
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Manage the company information and dashboard display.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-base font-semibold text-slate-900">
                Company Information
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Information shown at the top of the dashboard.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label
                  htmlFor="companyName"
                  className="text-sm font-medium text-slate-700"
                >
                  Company Name
                </label>

                <input
                  id="companyName"
                  value={settings.companyName}
                  onChange={(event) =>
                    updateTextField(
                      "companyName",
                      event.target.value,
                    )
                  }
                  className={inputStyle}
                  placeholder="AEC Company"
                />
              </div>

              <div>
                <label
                  htmlFor="dashboardTitle"
                  className="text-sm font-medium text-slate-700"
                >
                  Dashboard Title
                </label>

                <input
                  id="dashboardTitle"
                  value={settings.dashboardTitle}
                  onChange={(event) =>
                    updateTextField(
                      "dashboardTitle",
                      event.target.value,
                    )
                  }
                  className={inputStyle}
                  placeholder="AI Task Management Dashboard"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-base font-semibold text-slate-900">
                Administrator Profile
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Information displayed beside the Setting icon.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label
                  htmlFor="administratorName"
                  className="text-sm font-medium text-slate-700"
                >
                  Administrator Name
                </label>

                <input
                  id="administratorName"
                  value={settings.administratorName}
                  onChange={(event) =>
                    updateTextField(
                      "administratorName",
                      event.target.value,
                    )
                  }
                  className={inputStyle}
                  placeholder="Administrator"
                />
              </div>

              <div>
                <label
                  htmlFor="operationsTeam"
                  className="text-sm font-medium text-slate-700"
                >
                  Department / Team
                </label>

                <input
                  id="operationsTeam"
                  value={settings.operationsTeam}
                  onChange={(event) =>
                    updateTextField(
                      "operationsTeam",
                      event.target.value,
                    )
                  }
                  className={inputStyle}
                  placeholder="Operations Team"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-base font-semibold text-slate-900">
                Dashboard Display
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Choose which information appears on the dashboard.
              </p>
            </div>

            <div className="mt-5 divide-y divide-slate-100">
              <SettingToggle
                title="Show Stage Legend"
                description="Display the colour legend on the right side of the Job Progress Board."
                checked={settings.showStageLegend}
                onChange={(checked) =>
                  updateToggle("showStageLegend", checked)
                }
              />

              <SettingToggle
                title="Show Summary"
                description="Display the status totals and overall job total."
                checked={settings.showSummary}
                onChange={(checked) =>
                  updateToggle("showSummary", checked)
                }
              />

              <SettingToggle
                title="Automatic Completion Date"
                description="Automatically record the date and time when a job moves to Completed."
                checked={settings.autoCompleteDate}
                onChange={(checked) =>
                  updateToggle("autoCompleteDate", checked)
                }
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-base font-semibold text-slate-900">
                Job Information Sheet Column Order
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Drag columns into the required order, or use the arrow buttons.
                The first item will appear on the left side of the table.
              </p>
            </div>

            <div className="mt-5 space-y-2">
              {settings.columnOrder.map((column, index) => (
                <div
                  key={column}
                  draggable
                  onDragStart={() => setDraggedColumn(column)}
                  onDragEnd={() => setDraggedColumn(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropColumn(column)}
                  className={`flex cursor-grab items-center gap-3 rounded-xl border px-3 py-3 transition active:cursor-grabbing ${
                    draggedColumn === column
                      ? "border-blue-400 bg-blue-50 opacity-60"
                      : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50"
                  }`}
                >
                  <span
                    className="select-none text-lg font-bold tracking-[-0.2em] text-slate-400"
                    aria-hidden="true"
                  >
                    ⋮⋮
                  </span>

                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-semibold text-slate-500 shadow-sm">
                    {index + 1}
                  </span>

                  <span className="min-w-0 flex-1 text-sm font-semibold text-slate-700">
                    {JOB_COLUMN_LABELS[column]}
                  </span>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveColumn(column, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${JOB_COLUMN_LABELS[column]} left`}
                      title="Move left in table"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ↑
                    </button>

                    <button
                      type="button"
                      onClick={() => moveColumn(column, 1)}
                      disabled={index === settings.columnOrder.length - 1}
                      aria-label={`Move ${JOB_COLUMN_LABELS[column]} right`}
                      title="Move right in table"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {saved && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              Settings saved successfully.
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleReset}
              className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Reset Default
            </button>

            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="h-11 rounded-xl bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function SettingToggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-5 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-semibold text-slate-800">
          {title}
        </p>

        <p className="mt-1 text-sm leading-5 text-slate-500">
          {description}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          checked ? "bg-blue-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}
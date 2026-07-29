"use client";

import {
  ChangeEvent,
  FormEvent,
  type Dispatch,
  type SetStateAction,
  useEffect,
  useState,
} from "react";
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
};

type SettingsCategory = "organization" | "job-dashboard";

type CurrentUser = {
  name: string;
  role: "owner" | "employee";
  phoneNumber: string;
};

/*
  DEFAULT HEADER LOGO
  To change the built-in placeholder manually, replace this data URL.
  The normal way to replace it is Settings > Branding > Upload New Logo.
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
};

const SETTINGS_STORAGE_KEY = "aec-dashboard-settings";
const USER_SETTINGS_STORAGE_PREFIX = "aec-dashboard-user-settings:";

type PerAccountSettings = Pick<
  DashboardSettings,
  | "operationsTeam"
  | "appearance"
  | "appearanceDefaultVersion"
  | "language"
  | "system"
>;

const DEFAULT_PER_ACCOUNT_SETTINGS: PerAccountSettings = {
  operationsTeam: DEFAULT_SETTINGS.operationsTeam,
  appearance: DEFAULT_SETTINGS.appearance,
  appearanceDefaultVersion: DEFAULT_SETTINGS.appearanceDefaultVersion,
  language: DEFAULT_SETTINGS.language,
  system: DEFAULT_SETTINGS.system,
};

function getUserSettingsStorageKey(name: string) {
  return `${USER_SETTINGS_STORAGE_PREFIX}${encodeURIComponent(
    name.trim().toLowerCase(),
  )}`;
}

function loadPerAccountSettings(name: string): PerAccountSettings {
  try {
    const savedValue = window.localStorage.getItem(
      getUserSettingsStorageKey(name),
    );

    if (!savedValue) return DEFAULT_PER_ACCOUNT_SETTINGS;

    const parsedValue = JSON.parse(savedValue) as Partial<PerAccountSettings>;

    return {
      ...DEFAULT_PER_ACCOUNT_SETTINGS,
      ...parsedValue,
      appearance:
        parsedValue.appearance === "dark" ||
        parsedValue.appearance === "system" ||
        parsedValue.appearance === "light"
          ? parsedValue.appearance
          : DEFAULT_PER_ACCOUNT_SETTINGS.appearance,
      appearanceDefaultVersion:
        DEFAULT_PER_ACCOUNT_SETTINGS.appearanceDefaultVersion,
    };
  } catch {
    return DEFAULT_PER_ACCOUNT_SETTINGS;
  }
}

function savePerAccountSettings(
  name: string,
  preferences: PerAccountSettings,
) {
  window.localStorage.setItem(
    getUserSettingsStorageKey(name),
    JSON.stringify(preferences),
  );
}

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

function OrganizationIcon() {
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
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1" />
    </svg>
  );
}

function DashboardIcon() {
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
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export default function SettingsPage() {
  const router = useRouter();

  const [settings, setSettings] = useState<DashboardSettings>(DEFAULT_SETTINGS);
  const [systemUsesDarkMode, setSystemUsesDarkMode] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [draggedColumn, setDraggedColumn] = useState<JobColumnKey | null>(null);
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategory>("organization");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function verifyLogin() {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        if (!response.ok) {
          router.replace("/login");
          router.refresh();
          return;
        }

        const result = (await response.json()) as { user: CurrentUser };

        if (mounted) {
          setCurrentUser(result.user);
        }
      } catch {
        router.replace("/login");
        router.refresh();
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }

    void verifyLogin();
    window.addEventListener("pageshow", verifyLogin);

    return () => {
      mounted = false;
      window.removeEventListener("pageshow", verifyLogin);
    };
  }, [router]);

  useEffect(() => {
    if (!currentUser) return;

    try {
      const savedSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      const perAccountSettings = loadPerAccountSettings(currentUser.name);

      if (savedSettings) {
        const parsedSettings = JSON.parse(
          savedSettings,
        ) as Partial<DashboardSettings>;

        const nextSettings: DashboardSettings = {
          ...DEFAULT_SETTINGS,
          ...parsedSettings,
          ...perAccountSettings,
          columnOrder: normalizeColumnOrder(parsedSettings.columnOrder),
        };

        setSettings(nextSettings);
      } else {
        setSettings({
          ...DEFAULT_SETTINGS,
          ...perAccountSettings,
        });
      }
    } catch {
      setSettings({
        ...DEFAULT_SETTINGS,
        ...loadPerAccountSettings(currentUser.name),
      });
    }
  }, [currentUser]);

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

  function updateTextField(field: keyof DashboardSettings, value: string) {
    setSettings((current) => ({
      ...current,
      [field]: value,
    }));

    setSaved(false);
  }

  function updateToggle(field: keyof DashboardSettings, checked: boolean) {
    setSettings((current) => ({
      ...current,
      [field]: checked,
    }));

    setSaved(false);
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser) return;

    const normalizedSettings = {
      ...settings,
      columnOrder: normalizeColumnOrder(settings.columnOrder),
    };

    const sharedSettings: DashboardSettings = {
      ...normalizedSettings,
      ...DEFAULT_PER_ACCOUNT_SETTINGS,
    };

    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(sharedSettings),
    );
    savePerAccountSettings(currentUser.name, {
      operationsTeam: normalizedSettings.operationsTeam,
      appearance: normalizedSettings.appearance,
      appearanceDefaultVersion:
        DEFAULT_PER_ACCOUNT_SETTINGS.appearanceDefaultVersion,
      language: normalizedSettings.language,
      system: normalizedSettings.system,
    });

    setSettings(normalizedSettings);
    window.dispatchEvent(new Event("aec-settings-updated"));
    setSaved(true);
  }

  function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const acceptedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/svg+xml",
    ];

    if (!acceptedTypes.includes(file.type)) {
      setLogoError("Please upload a JPG, PNG, WEBP or SVG image.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Logo file must be 2 MB or smaller.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") return;

      setSettings((current) => ({
        ...current,
        logoDataUrl: reader.result as string,
      }));
      setLogoError("");
      setSaved(false);
    };

    reader.onerror = () => {
      setLogoError("The logo could not be read. Please try another image.");
    };

    reader.readAsDataURL(file);
  }

  function handleReset() {
    const resettableDefaults: Pick<
      DashboardSettings,
      | "appearance"
      | "showStageLegend"
      | "showSummary"
      | "autoCompleteDate"
      | "columnOrder"
    > = {
      appearance: DEFAULT_SETTINGS.appearance,
      showStageLegend: DEFAULT_SETTINGS.showStageLegend,
      showSummary: DEFAULT_SETTINGS.showSummary,
      autoCompleteDate: DEFAULT_SETTINGS.autoCompleteDate,
      columnOrder: [...DEFAULT_COLUMN_ORDER],
    };

    const nextSettings = {
      ...settings,
      ...resettableDefaults,
    };

    setSettings(nextSettings);

    if (currentUser) {
      savePerAccountSettings(currentUser.name, {
        operationsTeam: nextSettings.operationsTeam,
        appearance: nextSettings.appearance,
        appearanceDefaultVersion:
          DEFAULT_PER_ACCOUNT_SETTINGS.appearanceDefaultVersion,
        language: nextSettings.language,
        system: nextSettings.system,
      });
    }

    const sharedSettings: DashboardSettings = {
      ...nextSettings,
      ...DEFAULT_PER_ACCOUNT_SETTINGS,
    };

    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(sharedSettings),
    );
    window.dispatchEvent(new Event("aec-settings-updated"));
    setSaved(true);
  }

  function moveColumn(column: JobColumnKey, direction: -1 | 1) {
    setSettings((current) => {
      const currentIndex = current.columnOrder.indexOf(column);
      const newIndex = currentIndex + direction;

      if (
        currentIndex < 0 ||
        newIndex < 0 ||
        newIndex >= current.columnOrder.length
      ) {
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

  if (authLoading || !currentUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-500">
        Checking login...
      </main>
    );
  }

  if (currentUser.role !== "owner") {
    return (
      <EmployeeThemeSettings
        currentUser={currentUser}
        settings={settings}
        setSettings={setSettings}
        darkModeIsActive={darkModeIsActive}
      />
    );
  }

  return (
    <main
      className={`min-h-screen bg-slate-50 ${
        darkModeIsActive ? "aec-dark" : ""
      }`}
    >
      <ThemeStyles />
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

        <form
          onSubmit={handleSave}
          className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]"
        >
          <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-6">
            <nav className="p-3" aria-label="Settings categories">
              <button
                type="button"
                onClick={() => setActiveCategory("organization")}
                aria-current={
                  activeCategory === "organization" ? "page" : undefined
                }
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-4 text-left text-sm font-semibold transition ${
                  activeCategory === "organization"
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    activeCategory === "organization"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <OrganizationIcon />
                </span>
                <span>Organization &amp; Branding</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveCategory("job-dashboard")}
                aria-current={
                  activeCategory === "job-dashboard" ? "page" : undefined
                }
                className={`mt-1 flex w-full items-center gap-3 rounded-xl px-4 py-4 text-left text-sm font-semibold transition ${
                  activeCategory === "job-dashboard"
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    activeCategory === "job-dashboard"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <DashboardIcon />
                </span>
                <span>Job &amp; Dashboard Settings</span>
              </button>
            </nav>
          </aside>

          <div className="min-w-0 space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-slate-950">
                {activeCategory === "organization"
                  ? "Organization & Branding"
                  : "Job & Dashboard Settings"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {activeCategory === "organization"
                  ? "Manage the dashboard logo, company details and administrator profile."
                  : "Configure the table columns, dashboard display and appearance."}
              </p>
            </div>

            {activeCategory === "organization" && (
              <>
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="border-b border-slate-100 pb-4">
                    <h3 className="text-base font-semibold text-slate-900">
                      Branding
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      Upload the logo displayed beside the company name in the
                      Dashboard header.
                    </p>
                  </div>

                  <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                      <img
                        src={settings.logoDataUrl || DEFAULT_LOGO_DATA_URL}
                        alt="Dashboard logo preview"
                        className="h-full w-full object-contain"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">
                        Dashboard Logo
                      </p>

                      <p className="mt-1 text-sm leading-5 text-slate-500">
                        JPG, PNG, WEBP or SVG. Maximum file size: 2 MB.
                      </p>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <label className="inline-flex h-10 cursor-pointer items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700">
                          Upload New Logo
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.svg,image/jpeg,image/png,image/webp,image/svg+xml"
                            onChange={handleLogoUpload}
                            className="sr-only"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            setSettings((current) => ({
                              ...current,
                              logoDataUrl: DEFAULT_LOGO_DATA_URL,
                            }));
                            setLogoError("");
                            setSaved(false);
                          }}
                          className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                        >
                          Use Placeholder
                        </button>
                      </div>

                      {logoError && (
                        <p className="mt-3 text-sm font-medium text-rose-600">
                          {logoError}
                        </p>
                      )}
                    </div>
                  </div>
                </section>

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
                          updateTextField("companyName", event.target.value)
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
                          updateTextField("dashboardTitle", event.target.value)
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
                          updateTextField("operationsTeam", event.target.value)
                        }
                        className={inputStyle}
                        placeholder="Operations Team"
                      />
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeCategory === "job-dashboard" && (
              <>
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="border-b border-slate-100 pb-4">
                    <h3 className="text-base font-semibold text-slate-900">
                      Appearance
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      Choose the preferred colour mode. Light Mode is the
                      default. System follows the current Chrome or device
                      appearance.
                    </p>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <AppearanceOption
                      value="light"
                      title="Light Mode"
                      description="Default white and blue interface"
                      selected={settings.appearance === "light"}
                      onSelect={(value) => {
                        setSettings((current) => ({
                          ...current,
                          appearance: value,
                        }));
                        setSaved(false);
                      }}
                    />
                    <AppearanceOption
                      value="dark"
                      title="Dark Mode"
                      description="Black-blue interface with light text"
                      selected={settings.appearance === "dark"}
                      onSelect={(value) => {
                        setSettings((current) => ({
                          ...current,
                          appearance: value,
                        }));
                        setSaved(false);
                      }}
                    />
                    <AppearanceOption
                      value="system"
                      title="System"
                      description="Follow Chrome or device"
                      selected={settings.appearance === "system"}
                      onSelect={(value) => {
                        setSettings((current) => ({
                          ...current,
                          appearance: value,
                        }));
                        setSaved(false);
                      }}
                    />
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="border-b border-slate-100 pb-4">
                    <h3 className="text-base font-semibold text-slate-900">
                      Job Information Sheet Column Order
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      Drag columns into the required order, or use the arrow
                      buttons. The first item will appear on the left side of
                      the table.
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
              </>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              {activeCategory === "job-dashboard" && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Reset Default
                </button>
              )}

              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Back to Dashboard
              </button>

              <button
                type="submit"
                className="h-11 rounded-xl bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Save Settings
              </button>
            </div>

            {saved && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                Settings saved successfully.
              </div>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}

function EmployeeThemeSettings({
  currentUser,
  settings,
  setSettings,
  darkModeIsActive,
}: {
  currentUser: CurrentUser;
  settings: DashboardSettings;
  setSettings: Dispatch<SetStateAction<DashboardSettings>>;
  darkModeIsActive: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  function saveTheme() {
    const currentPreferences = loadPerAccountSettings(currentUser.name);
    const nextPreferences: PerAccountSettings = {
      ...currentPreferences,
      appearance: settings.appearance,
      appearanceDefaultVersion:
        DEFAULT_PER_ACCOUNT_SETTINGS.appearanceDefaultVersion,
    };

    savePerAccountSettings(currentUser.name, nextPreferences);
    setSettings((current) => ({
      ...current,
      ...nextPreferences,
    }));
    window.dispatchEvent(new Event("aec-settings-updated"));
    setSaved(true);
  }

  return (
    <main
      className={`min-h-screen bg-slate-50 ${
        darkModeIsActive ? "aec-dark" : ""
      }`}
    >
      <ThemeStyles />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
              AEC Company
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              Appearance Settings
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Signed in as {currentUser.name} · Theme access only
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
          >
            <ArrowLeftIcon />
            Back
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-8 lg:px-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-semibold text-slate-900">Theme</h2>
            <p className="mt-1 text-sm text-slate-500">
              Employees can change the Theme only. Branding, company
              information, columns and dashboard controls are owner-only.
            </p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <AppearanceOption
              value="light"
              title="Light Mode"
              description="Default white and blue interface"
              selected={settings.appearance === "light"}
              onSelect={(value) => {
                setSettings((current) => ({
                  ...current,
                  appearance: value,
                }));
                setSaved(false);
              }}
            />
            <AppearanceOption
              value="dark"
              title="Dark Mode"
              description="Black-blue interface with light text"
              selected={settings.appearance === "dark"}
              onSelect={(value) => {
                setSettings((current) => ({
                  ...current,
                  appearance: value,
                }));
                setSaved(false);
              }}
            />
            <AppearanceOption
              value="system"
              title="System"
              description="Follow Chrome or device"
              selected={settings.appearance === "system"}
              onSelect={(value) => {
                setSettings((current) => ({
                  ...current,
                  appearance: value,
                }));
                setSaved(false);
              }}
            />
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveTheme}
              className="h-11 rounded-xl bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Save Theme
            </button>
          </div>

          {saved && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              Theme saved successfully.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ThemeStyles() {
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

      .aec-dark input {
        background-color: #081525 !important;
        border-color: #314761 !important;
        color: #f8fbff !important;
      }

      .aec-dark input::placeholder {
        color: #71849e !important;
      }

      .aec-dark [class~="bg-blue-50"] {
        background-color: #112d52 !important;
      }

      .aec-dark [class~="text-blue-700"] {
        color: #7db4ff !important;
      }

      .aec-dark [class~="bg-emerald-50"] {
        background-color: #073a32 !important;
      }

      .aec-dark [class~="border-emerald-200"] {
        border-color: #16866f !important;
      }

      .aec-dark [class~="text-emerald-700"] {
        color: #74e6c3 !important;
      }
    `}</style>
  );
}

function AppearanceOption({
  value,
  title,
  description,
  selected,
  onSelect,
}: {
  value: DashboardSettings["appearance"];
  title: string;
  description: string;
  selected: boolean;
  onSelect: (value: DashboardSettings["appearance"]) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(value)}
      className={`rounded-xl border p-4 text-left transition ${
        selected
          ? "border-blue-500 bg-blue-50 ring-4 ring-blue-500/10"
          : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span
          className={`text-sm font-semibold ${
            selected ? "text-blue-700" : "text-slate-800"
          }`}
        >
          {title}
        </span>
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
            selected ? "border-blue-600 bg-blue-600" : "border-slate-300"
          }`}
        >
          {selected && (
            <span
              className="h-2 w-2 rounded-full bg-white"
              aria-hidden="true"
            />
          )}
        </span>
      </span>
      <span className="mt-2 block text-xs leading-5 text-slate-500">
        {description}
      </span>
    </button>
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
        <p className="text-sm font-semibold text-slate-800">{title}</p>

        <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
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

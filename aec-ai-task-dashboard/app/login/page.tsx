"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function EyeIcon({ hidden }: { hidden: boolean }) {
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
      {hidden ? (
        <>
          <path d="m3 3 18 18" />
          <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
          <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9.5 5 9.5 8a8.7 8.7 0 0 1-2 3.6" />
          <path d="M6.6 6.6C4 8.2 2.5 10.5 2.5 12c0 3 4 8 9.5 8 1.3 0 2.5-.3 3.6-.7" />
        </>
      ) : (
        <>
          <path d="M2.5 12s3.5-8 9.5-8 9.5 8 9.5 8-3.5 8-9.5 8-9.5-8-9.5-8Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    router.prefetch("/dashboard");
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim() || !password) {
      setErrorMessage("Please enter your name and password.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), password }),
        cache: "no-store",
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        setErrorMessage(result.message || "Name or password is incorrect.");
        setPassword("");
        return;
      }

      const requestedPath = new URLSearchParams(window.location.search).get(
        "from",
      );
      const destination =
        requestedPath?.startsWith("/") &&
        !requestedPath.startsWith("//") &&
        !requestedPath.startsWith("/login")
          ? requestedPath
          : "/dashboard";

      router.replace(destination);
      router.refresh();
    } catch {
      setErrorMessage("Unable to sign in. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-3 py-6 sm:min-h-screen sm:px-5 sm:py-10">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-8rem] top-[-8rem] h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute bottom-[-10rem] right-[-5rem] h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />
      </div>

      <section className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-600/25 sm:h-14 sm:w-14 sm:rounded-2xl sm:text-xl">
          A
        </div>

        <div className="mt-5 text-center sm:mt-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-600 sm:text-xs sm:tracking-[0.22em]">
            AEC Company
          </p>
          <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to the AI Task Management Dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 sm:mt-8 sm:space-y-5">
          <div>
            <label
              htmlFor="name"
              className="text-sm font-semibold text-slate-700"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="username"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={submitting}
              className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
              placeholder="Enter your name"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="text-sm font-semibold text-slate-700"
            >
              Password
            </label>
            <div className="relative mt-2">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <EyeIcon hidden={showPassword} />
              </button>
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Checking..." : "Sign In"}
          </button>
        </form>
      </section>
    </main>
  );
}

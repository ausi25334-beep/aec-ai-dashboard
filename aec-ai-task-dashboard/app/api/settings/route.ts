import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  readSessionToken,
  SESSION_COOKIE_NAME,
} from "../../../lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_TABLE = "aec-system-settings";
const COMPANY_SETTINGS_ID = "company";

const ALLOWED_SETTING_KEYS = [
  "logoDataUrl",
  "companyName",
  "dashboardTitle",
  "administratorName",
  "operationsTeam",
  "appearance",
  "appearanceDefaultVersion",
  "language",
  "system",
  "showStageLegend",
  "showSummary",
  "autoCompleteDate",
  "columnOrder",
] as const;

type SettingsPayload = Record<string, unknown>;

async function getCurrentUser() {
  const cookieStore = await cookies();
  return readSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function sanitizeSettings(value: unknown): SettingsPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as SettingsPayload;
  const sanitized: SettingsPayload = {};

  for (const key of ALLOWED_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      sanitized[key] = source[key];
    }
  }

  if (
    sanitized.appearance !== "light" &&
    sanitized.appearance !== "dark" &&
    sanitized.appearance !== "system"
  ) {
    return null;
  }

  if (!Array.isArray(sanitized.columnOrder)) return null;

  const serialized = JSON.stringify(sanitized);
  if (serialized.length > 3_000_000) return null;

  return sanitized;
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { message: "Not authenticated." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { message: "Settings service is not configured." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data, error } = await supabaseAdmin
    .from(SETTINGS_TABLE)
    .select("settings")
    .eq("id", COMPANY_SETTINGS_ID)
    .maybeSingle();

  if (error) {
    console.error("Shared settings query failed:", error.message);
    return NextResponse.json(
      { message: "Unable to load company settings." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { settings: data?.settings ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { message: "Not authenticated." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (user.role !== "owner") {
    return NextResponse.json(
      { message: "Only the owner can change company settings." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const body = (await request.json()) as { settings?: unknown };
    const settings = sanitizeSettings(body.settings);

    if (!settings) {
      return NextResponse.json(
        { message: "The settings data is invalid." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    if (!supabaseAdmin) {
      return NextResponse.json(
        { message: "Settings service is not configured." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { error } = await supabaseAdmin.from(SETTINGS_TABLE).upsert(
      {
        id: COMPANY_SETTINGS_ID,
        settings,
        updated_by: user.name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) {
      console.error("Shared settings save failed:", error.message);
      return NextResponse.json(
        { message: "Unable to save company settings." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Shared settings request failed:", error);
    return NextResponse.json(
      { message: "Unable to save company settings." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

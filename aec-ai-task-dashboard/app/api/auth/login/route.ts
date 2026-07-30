import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "../../../../lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAFF_TABLE = "aec-dashboard-admin";
const NAME_COLUMN = "name";
const PASSWORD_COLUMN = "password";
const ROLE_COLUMN = "role";
const PHONE_NUMBER_COLUMN = "phone number";

type StaffRow = Record<string, unknown>;

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function passwordsMatch(expected: string, received: string) {
  const expectedHash = createHash("sha256").update(expected).digest();
  const receivedHash = createHash("sha256").update(received).digest();
  return timingSafeEqual(expectedHash, receivedHash);
}

function getRole(row: StaffRow) {
  return textValue(row[ROLE_COLUMN]) || "Employee";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: unknown;
      password?: unknown;
    };
    const name = textValue(body.name);
    const password = typeof body.password === "string" ? body.password : "";

    if (!name || !password) {
      return NextResponse.json(
        { message: "Please enter your name and password." },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase server environment variables.");
      return NextResponse.json(
        { message: "Login service is not configured yet." },
        { status: 500 },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabaseAdmin
      .from(STAFF_TABLE)
      .select("*")
      .eq(NAME_COLUMN, name)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Supabase login query failed:", error.message);
      return NextResponse.json(
        { message: "Unable to check the login information." },
        { status: 500 },
      );
    }

    const row = data as StaffRow | null;
    const savedPassword = row ? textValue(row[PASSWORD_COLUMN]) : "";

    if (!row || !savedPassword || !passwordsMatch(savedPassword, password)) {
      return NextResponse.json(
        { message: "Name or password is incorrect." },
        { status: 401 },
      );
    }

    const phoneNumber = textValue(row[PHONE_NUMBER_COLUMN]);
    const token = await createSessionToken({
      name: textValue(row[NAME_COLUMN]) || name,
      role: getRole(row),
      phoneNumber,
    });
    const response = NextResponse.json({ success: true });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });
    response.headers.set("Cache-Control", "no-store");

    return response;
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json(
      { message: "Unable to sign in. Please try again." },
      { status: 500 },
    );
  }
}

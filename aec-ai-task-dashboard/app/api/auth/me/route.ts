import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  readSessionToken,
  SESSION_COOKIE_NAME,
} from "../../../../lib/auth-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const user = await readSessionToken(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );

  if (!user) {
    return NextResponse.json(
      { message: "Not authenticated." },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return NextResponse.json(
    {
      user: {
        name: user.name,
        role: user.role,
        phoneNumber: user.phoneNumber,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

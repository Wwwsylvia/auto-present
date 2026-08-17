import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { rejectUnsafeRequest } from "@/lib/http";

export function proxy(request: NextRequest) {
  return rejectUnsafeRequest(request) ?? NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

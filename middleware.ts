export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/finance/:path*",
    "/groups/:path*",
    "/profile/:path*",
    "/analytics/:path*",
    "/insights/:path*",
    "/goals/:path*",
    "/tax/:path*",
    "/report/:path*",
    "/accounts/:path*",
    "/api/private/:path*",
  ],
};

"use client";

import Link from "next/link";
import Image from "next/image";

/**
 * Landing-page logo. Acts as a home link, but when the visitor is already
 * on the landing page a plain <Link href="/"> is a no-op — so we intercept
 * that case and smooth-scroll back to the top instead.
 */
export function NavLogo() {
  return (
    <Link
      href="/"
      aria-label="Back to top"
      onClick={(e) => {
        if (window.location.pathname === "/") {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }}
      className="flex items-center gap-2"
    >
      <Image
        src="/logo.svg"
        alt="TravelTomo"
        width={120}
        height={32}
        className="h-8 w-auto"
      />
    </Link>
  );
}

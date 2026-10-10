import type { ReactNode } from "react";

import "./globals.css";

// Every page lives under app/[locale], which renders <html>; app/not-found.tsx renders its own.
export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return children;
}

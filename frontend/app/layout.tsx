import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Reportr",
    template: "%s · Reportr",
  },
  description:
    "Self-hosted bug bounty platform for coordinated vulnerability disclosure.",
};

// Applies the persisted (or system) theme before first paint to avoid a flash.
const themeInit = `(function(){try{var t=localStorage.getItem('bb-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-200">
        {children}
      </body>
    </html>
  );
}

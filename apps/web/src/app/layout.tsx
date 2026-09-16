import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Geist } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'AI Lead Intelligence',
  description: 'SaaSquatch assessment — reference-company lead qualification MVP',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <TooltipProvider>
          <header className="border-b border-border bg-background">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
              <Link href="/" className="font-semibold text-foreground">
                AI Lead Intelligence
              </Link>
              <nav className="flex gap-4 text-sm text-muted-foreground">
                <Link href="/" className="hover:text-foreground">
                  Dashboard
                </Link>
                <Link href="/searches/new" className="hover:text-foreground">
                  New search
                </Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </TooltipProvider>
      </body>
    </html>
  );
}

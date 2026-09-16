import type { Metadata } from 'next';
import './globals.css';
import { Geist } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Lead Intelligence',
  description: 'AI-powered lead qualification — Ideal DNA, similarity, evidence',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn('font-sans dark', geist.variable)}>
      <body className="min-h-screen bg-[#121826] text-slate-100">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}

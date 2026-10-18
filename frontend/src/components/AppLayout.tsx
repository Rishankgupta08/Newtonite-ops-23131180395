import type { ReactNode } from 'react';
import { DarkOpsConsole } from './DarkOpsConsole';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/** Shell for every authenticated page (everything except /login). */
export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-content">
        <TopBar />
        <main className="app-main">{children}</main>
      </div>
      <DarkOpsConsole />
    </div>
  );
}

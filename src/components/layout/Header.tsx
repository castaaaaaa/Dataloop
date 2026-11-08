import React from 'react';
import { db } from '../../lib/db/store';
import { useAuth } from '../../lib/auth/AuthContext';
import { Plus, Globe, LogOut } from 'lucide-react';
import { ThemeToggle } from '../common/ThemeToggle';

interface HeaderProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenWizard: () => void;
  onToggleLanding: () => void;
  isLandingView: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate: _onNavigate,
  onOpenWizard,
  onToggleLanding,
  isLandingView
}) => {
  const { user, signOut } = useAuth();
  const currentWorkspace = db.getCurrentWorkspace();
  const currentRole = db.getCurrentRole();

  const getBreadcrumbTitle = () => {
    switch (currentView) {
      case 'dashboard':
        return 'Dashboard';
      case 'wizard':
        return 'New sync';
      case 'sync_detail':
        return 'Sync details';
      case 'review_queue':
        return 'Review queue';
      case 'health':
        return 'Health & errors';
      case 'connections':
        return 'Connections';
      case 'settings':
        return 'Settings';
      case 'docs':
        return 'Documentation';
      case 'activity':
        return 'Activity';
      default:
        return 'Overview';
    }
  };

  return (
    <header
      className="h-12 border-b px-6 flex items-center justify-between gap-4 shrink-0 z-10 font-sans"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-main)'
      }}
    >
      {/* Zone 1: Breadcrumbs (Sentence case, clean typography) */}
      <div className="flex items-center gap-2 text-[12px] whitespace-nowrap min-w-0">
        <span className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {currentWorkspace.name}
        </span>
        <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>
          {getBreadcrumbTitle()}
        </span>
      </div>

      {/* Zone 2: Role, Marketing Toggle, Theme Toggle & User */}
      <div className="flex items-center gap-2.5">
        {/* Subtle role indicator */}
        <div
          className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] text-[12px] border"
          style={{
            backgroundColor: 'var(--bg-raised)',
            borderColor: 'var(--border-main)',
            color: 'var(--text-secondary)'
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
          <span className="capitalize">{currentRole}</span>
        </div>

        {/* Public site toggle */}
        <button
          type="button"
          onClick={onToggleLanding}
          className="hidden md:flex items-center gap-1.5 h-8 px-2.5 text-[12px] font-medium rounded-[6px] border transition-colors cursor-pointer"
          style={{
            backgroundColor: 'transparent',
            borderColor: 'var(--border-main)',
            color: 'var(--text-secondary)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-raised)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          title="Toggle marketing preview"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>{isLandingView ? 'Back to app' : 'Marketing page'}</span>
        </button>

        {/* Theme Switch (Light, Dark, System) */}
        <ThemeToggle variant="dropdown" />

        {/* User Profile & Sign Out */}
        {user && (
          <div
            className="flex items-center gap-2 pl-2.5 border-l"
            style={{ borderColor: 'var(--border-main)' }}
          >
            <div className="text-right hidden lg:block leading-tight">
              <span
                className="text-[12px] font-medium block max-w-[120px] truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {user.name || user.email}
              </span>
              <span
                className="text-[11px] block max-w-[120px] truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                {user.email}
              </span>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="flex items-center justify-center w-8 h-8 rounded-[6px] transition-colors cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-raised)';
                e.currentTarget.style.color = 'var(--status-danger)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Primary CTA Button (Solid Accent, 32px height, 6px radius) */}
        <button
          type="button"
          onClick={onOpenWizard}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[6px] transition-colors cursor-pointer"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-text)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent)';
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New sync</span>
        </button>
      </div>
    </header>
  );
};

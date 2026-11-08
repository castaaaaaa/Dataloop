import React, { useState, useEffect } from 'react';
import { useAuth } from './lib/auth/AuthContext';
import { LoginPage } from './components/auth/LoginPage';
import { SignupPage } from './components/auth/SignupPage';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardView } from './components/dashboard/DashboardView';
import { NewSyncWizard } from './components/wizard/NewSyncWizard';
import { SyncDetailView } from './components/sync-detail/SyncDetailView';
import { ReviewQueueView } from './components/review-queue/ReviewQueueView';
import { HealthErrorCenter } from './components/health/HealthErrorCenter';
import { ConnectionsView } from './components/connections/ConnectionsView';
import { SettingsView } from './components/settings/SettingsView';
import { ActivityView } from './components/activity/ActivityView';
import { DocsView } from './components/docs/DocsView';
import { LandingPageView } from './components/landing/LandingPageView';

export function App() {
  const { user, loading } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'signup'>(() => {
    if (typeof window !== 'undefined' && window.location.pathname === '/signup') {
      return 'signup';
    }
    return 'login';
  });

  const [currentView, setCurrentView] = useState(() => {
    if (typeof window !== 'undefined') {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab) return tab;
    }
    return 'dashboard';
  });
  const [selectedSyncId, setSelectedSyncId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [isLandingMode, setIsLandingMode] = useState(false);
  const [renderTrigger, setRenderTrigger] = useState(0);

  // Sync browser path with auth mode and tabs
  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === '/signup') {
        setAuthMode('signup');
      } else if (window.location.pathname === '/login') {
        setAuthMode('login');
      }
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab) {
        setCurrentView(tab);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const forceRefresh = () => {
    setRenderTrigger((prev) => prev + 1);
  };

  const handleSelectSync = (syncId: string) => {
    setSelectedSyncId(syncId);
    setCurrentView('sync_detail');
  };

  const handleNavigate = (view: string) => {
    setCurrentView(view);
    if (view !== 'sync_detail') {
      setSelectedSyncId(null);
    }
  };

  // 1. Loading state during auth verification
  if (loading) {
    return (
      <div
        className="flex h-screen w-screen items-center justify-center font-sans"
        style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)' }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
          <span className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
            Verifying session...
          </span>
        </div>
      </div>
    );
  }

  // 2. Auth Guard: Every app page requires a logged-in user and redirects to /login otherwise
  if (!user) {
    if (authMode === 'signup') {
      return (
        <SignupPage
          onNavigateToLogin={() => {
            setAuthMode('login');
            if (typeof window !== 'undefined') {
              window.history.pushState(null, '', '/login');
            }
          }}
          onSuccess={() => {
            if (typeof window !== 'undefined') {
              window.history.pushState(null, '', '/');
            }
            forceRefresh();
          }}
        />
      );
    }

    return (
      <LoginPage
        onNavigateToSignup={() => {
          setAuthMode('signup');
          if (typeof window !== 'undefined') {
            window.history.pushState(null, '', '/signup');
          }
        }}
        onSuccess={() => {
          if (typeof window !== 'undefined') {
            window.history.pushState(null, '', '/');
          }
          forceRefresh();
        }}
      />
    );
  }

  // 3. Optional marketing view when authenticated
  if (isLandingMode) {
    return <LandingPageView onEnterApp={() => setIsLandingMode(false)} />;
  }

  return (
    <div
      className="flex h-screen w-screen overflow-hidden font-sans antialiased"
      style={{
        backgroundColor: 'var(--bg-page)',
        color: 'var(--text-primary)'
      }}
    >
      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        onNavigate={handleNavigate}
        onRefreshState={forceRefresh}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          currentView={currentView}
          onNavigate={handleNavigate}
          onOpenWizard={() => setWizardOpen(true)}
          onToggleLanding={() => setIsLandingMode(true)}
          isLandingView={isLandingMode}
        />

        <main
          className="flex-1 overflow-y-auto"
          style={{ backgroundColor: 'var(--bg-page)' }}
        >
          {currentView === 'dashboard' && (
            <DashboardView
              onOpenWizard={() => setWizardOpen(true)}
              onSelectSync={handleSelectSync}
              onNavigate={handleNavigate}
              onRefresh={forceRefresh}
            />
          )}

          {currentView === 'sync_detail' && selectedSyncId && (
            <SyncDetailView
              syncId={selectedSyncId}
              onBack={() => handleNavigate('dashboard')}
              onRefresh={forceRefresh}
            />
          )}

          {currentView === 'review_queue' && (
            <ReviewQueueView onRefresh={forceRefresh} />
          )}

          {currentView === 'health' && (
            <HealthErrorCenter onNavigate={handleNavigate} onRefresh={forceRefresh} />
          )}

          {currentView === 'connections' && (
            <ConnectionsView onRefresh={forceRefresh} />
          )}

          {currentView === 'settings' && (
            <SettingsView onRefresh={forceRefresh} />
          )}

          {currentView === 'activity' && (
            <ActivityView />
          )}

          {currentView === 'docs' && (
            <DocsView />
          )}
        </main>
      </div>

      {/* New Sync Wizard Modal */}
      {wizardOpen && (
        <NewSyncWizard
          onClose={() => setWizardOpen(false)}
          onCompleted={(newSyncId) => {
            setWizardOpen(false);
            forceRefresh();
            handleSelectSync(newSyncId);
          }}
        />
      )}
    </div>
  );
}

export default App;

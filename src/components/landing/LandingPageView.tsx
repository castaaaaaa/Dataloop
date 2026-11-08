import React, { useState } from 'react';
import { ThemeToggle } from '../common/ThemeToggle';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { BILLING_ENABLED } from '../../lib/billing/config';

interface LandingPageViewProps {
  onEnterApp: () => void;
}

export const LandingPageView: React.FC<LandingPageViewProps> = ({ onEnterApp }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      records: '500 linked records',
      syncs: '2 active pipelines',
      schedule: 'Hourly (60m)',
      seats: '1 seat'
    },
    {
      name: 'Starter',
      price: billingCycle === 'annual' ? '$15' : '$19',
      period: '/month',
      records: '5,000 linked records',
      syncs: '5 active pipelines',
      schedule: 'Every 15m',
      seats: '2 seats'
    },
    {
      name: 'Pro',
      price: billingCycle === 'annual' ? '$39' : '$49',
      period: '/month',
      records: '25,000 linked records',
      syncs: '20 active pipelines',
      schedule: 'Every 5m + webhooks',
      seats: '5 seats',
      highlighted: true
    },
    {
      name: 'Business',
      price: billingCycle === 'annual' ? '$99' : '$129',
      period: '/month',
      records: '100,000 linked records',
      syncs: '75 active pipelines',
      schedule: 'Every 1m + webhooks',
      seats: '15 seats'
    }
  ];

  const faqs = [
    {
      q: 'How does Dataloop prevent infinite sync loops?',
      a: 'Every write computes a deterministic SHA-256 hash stored in the record links index. When an update notification comes back from a third party, Dataloop verifies if the incoming payload matches our own last written hash and skips redundant execution.'
    },
    {
      q: 'What happens when my 14-day Pro trial ends?',
      a: 'Your workspace automatically transitions to the Free tier with no sudden data loss. Pipelines and connected accounts remain preserved, operating within Free tier record and interval limits.'
    },
    {
      q: 'Which connectors are currently supported?',
      a: 'Native bidirectional support is available for Notion databases, Airtable bases, Google Sheets, and HubSpot CRM, with universal webhook ingestion and REST API access.'
    },
    {
      q: 'How are data conflicts handled when both sides change simultaneously?',
      a: 'You can configure deterministic policies: source wins, destination wins, newest timestamp wins, or flag conflicting records directly into the visual review queue for manual resolution.'
    }
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)]">
      {/* Top Navigation */}
      <header className="border-b border-[var(--border-main)] bg-[var(--bg-sidebar)]">
        <div className="max-w-[1100px] mx-auto h-14 px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-[4px] bg-[var(--accent)] flex items-center justify-center text-white text-[12px] font-bold">
              D
            </div>
            <span className="font-semibold text-[14px] text-[var(--text-primary)] tracking-tight">
              Dataloop
            </span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle variant="dropdown" />
            <button
              onClick={onEnterApp}
              className="h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[6px] text-[12px] font-medium transition-colors"
            >
              Sign in / open app
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-[1100px] mx-auto px-6 py-16 space-y-16">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h1 className="text-[24px] sm:text-[32px] font-semibold text-[var(--text-primary)] tracking-tight leading-tight">
            Reliable bidirectional data sync between SaaS tools
          </h1>
          <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed">
            Keep Notion, Airtable, Google Sheets, and HubSpot in continuous synchronization with loop prevention, field-level conflict resolution, and enterprise audit logs.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={onEnterApp}
              className="h-8 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[6px] text-[12px] font-medium transition-colors"
            >
              {BILLING_ENABLED ? 'Start 14-day Pro trial' : 'Get started'}
            </button>
            <button
              onClick={onEnterApp}
              className="h-8 px-3 bg-transparent border border-[var(--border-main)] text-[var(--text-primary)] hover:bg-[var(--bg-raised)] rounded-[6px] text-[12px] font-medium transition-colors"
            >
              View demo
            </button>
          </div>
        </div>

        {/* Product Mockup */}
        <div className="border border-[var(--border-main)] rounded-[6px] bg-[var(--bg-card)] overflow-hidden shadow-xs">
          <div className="h-10 px-4 bg-[var(--bg-raised)] border-b border-[var(--border-main)] flex items-center justify-between text-[12px] text-[var(--text-muted)]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--border-main)]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--border-main)]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--border-main)]" />
              <span className="ml-2 font-medium text-[var(--text-secondary)]">app.dataloop.io/workspace/dashboard</span>
            </div>
            {BILLING_ENABLED && (
              <span className="text-[11px] font-mono">14-day trial active</span>
            )}
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 bg-[var(--bg-raised)] border border-[var(--border-subtle)] rounded-[6px]">
                <span className="text-[12px] text-[var(--text-muted)] block">Linked records</span>
                <span className="text-[24px] font-semibold font-mono text-[var(--text-primary)] block mt-1">1,248</span>
                <span className="text-[12px] text-[var(--status-success)] inline-flex items-center gap-1 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-success)]" />
                  Healthy sync
                </span>
              </div>
              <div className="p-4 bg-[var(--bg-raised)] border border-[var(--border-subtle)] rounded-[6px]">
                <span className="text-[12px] text-[var(--text-muted)] block">Active pipelines</span>
                <span className="text-[24px] font-semibold font-mono text-[var(--text-primary)] block mt-1">3</span>
                <span className="text-[12px] text-[var(--text-muted)] block mt-1">5m polling + webhooks</span>
              </div>
              <div className="p-4 bg-[var(--bg-raised)] border border-[var(--border-subtle)] rounded-[6px]">
                <span className="text-[12px] text-[var(--text-muted)] block">Review queue</span>
                <span className="text-[24px] font-semibold font-mono text-[var(--text-primary)] block mt-1">0</span>
                <span className="text-[12px] text-[var(--text-muted)] block mt-1">No pending conflicts</span>
              </div>
            </div>

            <div className="border border-[var(--border-main)] rounded-[6px] overflow-hidden">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[var(--bg-raised)] border-b border-[var(--border-main)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Pipeline</th>
                    <th className="py-2.5 px-3">Source & destination</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Synced records</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[12px]">
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-medium text-[var(--text-primary)]">HubSpot Contacts ↔ Notion CRM</td>
                    <td className="py-2.5 px-3 font-sans text-[var(--text-secondary)]">Bidirectional · 5m</td>
                    <td className="py-2.5 px-3 font-sans">
                      <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-success)]" />
                        Active
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-[var(--text-secondary)]">842</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-medium text-[var(--text-primary)]">Airtable Inventory ↔ Google Sheets</td>
                    <td className="py-2.5 px-3 font-sans text-[var(--text-secondary)]">Bidirectional · 15m</td>
                    <td className="py-2.5 px-3 font-sans">
                      <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-success)]" />
                        Active
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-[var(--text-secondary)]">406</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 3 Short Steps */}
        <div className="space-y-6">
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)] text-center">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="p-5 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-[6px] space-y-2">
              <span className="text-[12px] font-mono text-[var(--accent)] font-semibold">01</span>
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Connect tools</h3>
              <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                Authorize Notion, Airtable, Google Sheets, or HubSpot with least-privilege OAuth scopes.
              </p>
            </div>
            <div className="p-5 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-[6px] space-y-2">
              <span className="text-[12px] font-mono text-[var(--accent)] font-semibold">02</span>
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Map fields & rules</h3>
              <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                Configure field mappings with type coercion, conflict resolution strategies, and sync schedules.
              </p>
            </div>
            <div className="p-5 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-[6px] space-y-2">
              <span className="text-[12px] font-mono text-[var(--accent)] font-semibold">03</span>
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Keep data in sync</h3>
              <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                Engine runs continuously with SHA-256 loop prevention, automatic retries, and review queues.
              </p>
            </div>
          </div>
        </div>

        {/* Pricing Section */}
        {BILLING_ENABLED && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
                  Plans & pricing
                </h2>
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                  All plans include a 14-day free Pro trial. No payment method required to start.
                </p>
              </div>

              <div className="inline-flex p-0.5 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px]">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`h-7 px-3 text-[12px] font-medium rounded-[4px] transition-colors ${
                    billingCycle === 'monthly'
                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('annual')}
                  className={`h-7 px-3 text-[12px] font-medium rounded-[4px] transition-colors ${
                    billingCycle === 'annual'
                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Annual (2 months free)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map((p) => (
                <div
                  key={p.name}
                  className={`p-5 rounded-[6px] border bg-[var(--bg-card)] flex flex-col justify-between transition-colors ${
                    p.highlighted ? 'border-[var(--accent)]' : 'border-[var(--border-main)]'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[14px] text-[var(--text-primary)]">{p.name}</span>
                      {p.highlighted && (
                        <span className="text-[11px] font-medium text-[var(--accent)]">Popular</span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span className="text-[24px] font-semibold font-mono text-[var(--text-primary)]">{p.price}</span>
                      <span className="text-[12px] text-[var(--text-muted)]">{p.period}</span>
                    </div>

                    <ul className="space-y-1.5 text-[12px] text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
                      <li>• {p.records}</li>
                      <li>• {p.syncs}</li>
                      <li>• {p.schedule}</li>
                      <li>• {p.seats}</li>
                    </ul>
                  </div>

                  <button
                    onClick={onEnterApp}
                    className={`w-full h-8 mt-5 text-[12px] font-medium rounded-[6px] transition-colors ${
                      p.highlighted
                        ? 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white'
                        : 'bg-[var(--bg-raised)] hover:bg-[var(--border-main)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                    }`}
                  >
                    Choose {p.name}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FAQ Section */}
        <div className="space-y-4 max-w-2xl mx-auto">
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)] text-center">
            Frequently asked questions
          </h2>
          <div className="border border-[var(--border-main)] rounded-[6px] overflow-hidden bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
            {faqs.map((faq, idx) => (
              <div key={idx} className="p-4 space-y-1.5">
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between text-left text-[14px] font-medium text-[var(--text-primary)]"
                >
                  <span>{faq.q}</span>
                  {openFaq === idx ? (
                    <ChevronUp className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  )}
                </button>
                {openFaq === idx && (
                  <p className="text-[12px] text-[var(--text-muted)] leading-relaxed pt-1">
                    {faq.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-[var(--border-main)] pt-8 pb-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-[var(--text-muted)]">
          <div>© {new Date().getFullYear()} Dataloop Technologies Inc. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <button onClick={onEnterApp} className="hover:text-[var(--text-primary)] transition-colors">
              App
            </button>
            <button onClick={onEnterApp} className="hover:text-[var(--text-primary)] transition-colors">
              Docs
            </button>
            <button onClick={onEnterApp} className="hover:text-[var(--text-primary)] transition-colors">
              Status
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
};

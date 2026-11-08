/**
 * Provider-Agnostic Billing Interface
 * Allows any payment gateway (Stripe, Paddle, etc.) to be plugged in later
 * without modifying the rest of the application.
 */

export interface CheckoutContext {
  workspaceId: string;
  userEmail: string;
  planKey: string;
  successUrl: string;
  cancelUrl: string;
}

export interface SubscriptionStatus {
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}

export interface WebhookResult {
  eventType: string;
  data: unknown;
}

export interface BillingProvider {
  name: string;
  createCheckout(ctx: CheckoutContext): Promise<{ checkoutUrl: string }>;
  getSubscription(workspaceId: string): Promise<SubscriptionStatus | null>;
  cancelSubscription(workspaceId: string): Promise<boolean>;
  handleWebhook(rawBody: string | Buffer, headers: Record<string, string>): Promise<WebhookResult>;
}

/**
 * Placeholder provider when no billing provider is configured.
 */
export class UnimplementedBillingProvider implements BillingProvider {
  name = 'none';

  async createCheckout(_ctx: CheckoutContext): Promise<{ checkoutUrl: string }> {
    throw new Error('Billing provider not configured. Payments are coming soon.');
  }

  async getSubscription(_workspaceId: string): Promise<SubscriptionStatus | null> {
    return null;
  }

  async cancelSubscription(_workspaceId: string): Promise<boolean> {
    throw new Error('Billing provider not configured.');
  }

  async handleWebhook(_rawBody: string | Buffer, _headers: Record<string, string>): Promise<WebhookResult> {
    throw new Error('Billing webhook handler not configured.');
  }
}

// Current active billing provider (default: unimplemented)
export const billingProvider: BillingProvider = new UnimplementedBillingProvider();

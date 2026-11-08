/**
 * Billing & Monetization Feature Flag
 * 
 * Set BILLING_ENABLED = false to disable billing UI, pricing pages,
 * upgrade requests, and trial/upgrade banners.
 * Workspaces run on the single "Free (testing)" plan with limits:
 * - 3 active sync pipelines
 * - 1,000 records per month
 * 
 * Manual plan changes remain supported through the database only.
 */
export const BILLING_ENABLED = false;

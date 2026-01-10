import Stripe from 'stripe';
import { TenantSubscription, SUBSCRIPTION_PLANS } from '../types/subscription';

export class StripeClientService {
    private stripe: Stripe;

    constructor() {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (!secretKey) {
            throw new Error('STRIPE_SECRET_KEY environment variable is required');
        }

        this.stripe = new Stripe(secretKey, {
            apiVersion: '2025-12-15.clover'
        });
    }

  /**
   * Create or retrieve a Stripe customer for a tenant
   */ async createCustomer(tenantId: string, email: string, name: string): Promise<string> {
        try {
            // Check if customer already exists
            const existing = await this.stripe.customers.list({
                email: email,
                limit: 1
            });

            if (existing.data.length > 0) {
                return existing.data[0].id;
            }

            // Create new customer
            const customer = await this.stripe.customers.create({
                email: email,
                name: name,
                metadata: {
                    tenantId: tenantId
                }
            });

            return customer.id;
        } catch (error) {
            console.error('Error creating Stripe customer:', error);
            throw error;
        }
    }

    /**
     * Create a subscription for a customer
     */
    async createSubscription(
        customerId: string,
        planId: 'starter' | 'professional' | 'enterprise',
        trialDays?: number
    ): Promise<Stripe.Subscription> {
        try {
            const plan = SUBSCRIPTION_PLANS[planId];

            const subscriptionParams: Stripe.SubscriptionCreateParams = {
                customer: customerId,
                items: [
                    {
                        price: plan.stripePriceId
                    }
                ],
                metadata: {
                    planId: planId
                },
                expand: ['latest_invoice.payment_intent']
            };

            // Add trial if specified
            if (trialDays && trialDays > 0) {
                subscriptionParams.trial_period_days = trialDays;
            }

            const subscription = await this.stripe.subscriptions.create(subscriptionParams);

            return subscription;
        } catch (error) {
            console.error('Error creating subscription:', error);
            throw error;
        }
    }

    /**
     * Get subscription by ID
     */
    async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
        try {
            return await this.stripe.subscriptions.retrieve(subscriptionId);
        } catch (error) {
            console.error('Error retrieving subscription:', error);
            throw error;
        }
    }

    /**
     * Update subscription (change plan)
     */
    async updateSubscription(
        subscriptionId: string,
        newPlanId: 'starter' | 'professional' | 'enterprise'
    ): Promise<Stripe.Subscription> {
        try {
            const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
            const plan = SUBSCRIPTION_PLANS[newPlanId];

            return await this.stripe.subscriptions.update(subscriptionId, {
                items: [
                    {
                        id: subscription.items.data[0].id,
                        price: plan.stripePriceId
                    }
                ],
                metadata: {
                    planId: newPlanId
                },
                proration_behavior: 'create_prorations'
            });
        } catch (error) {
            console.error('Error updating subscription:', error);
            throw error;
        }
    }

    /**
     * Cancel subscription
     */
    async cancelSubscription(
        subscriptionId: string,
        cancelAtPeriodEnd: boolean = true
    ): Promise<Stripe.Subscription> {
        try {
            if (cancelAtPeriodEnd) {
                return await this.stripe.subscriptions.update(subscriptionId, {
                    cancel_at_period_end: true
                });
            } else {
                return await this.stripe.subscriptions.cancel(subscriptionId);
            }
        } catch (error) {
            console.error('Error canceling subscription:', error);
            throw error;
        }
    }

    /**
     * Create Checkout Session for new subscription
     */
    async createCheckoutSession(
        customerId: string,
        planId: 'starter' | 'professional' | 'enterprise',
        successUrl: string,
        cancelUrl: string,
        trialDays?: number
    ): Promise<Stripe.Checkout.Session> {
        try {
            const plan = SUBSCRIPTION_PLANS[planId];

            const sessionParams: Stripe.Checkout.SessionCreateParams = {
                customer: customerId,
                mode: 'subscription',
                line_items: [
                    {
                        price: plan.stripePriceId,
                        quantity: 1
                    }
                ],
                success_url: successUrl,
                cancel_url: cancelUrl,
                metadata: {
                    planId: planId
                }
            };

            // Add trial if specified
            if (trialDays && trialDays > 0) {
                sessionParams.subscription_data = {
                    trial_period_days: trialDays
                };
            }

            return await this.stripe.checkout.sessions.create(sessionParams);
        } catch (error) {
            console.error('Error creating checkout session:', error);
            throw error;
        }
    }

    /**
     * Create Customer Portal session
     */
    async createPortalSession(
        customerId: string,
        returnUrl: string
    ): Promise<Stripe.BillingPortal.Session> {
        try {
            return await this.stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl
            });
        } catch (error) {
            console.error('Error creating portal session:', error);
            throw error;
        }
    }

    /**
     * Verify webhook signature
     */
    verifyWebhookSignature(
        payload: string | Buffer,
        signature: string,
        secret: string
    ): Stripe.Event {
        try {
            return this.stripe.webhooks.constructEvent(payload, signature, secret);
        } catch (error) {
            console.error('Error verifying webhook signature:', error);
            throw error;
        }
    }
}

// Export singleton instance
export const stripeClient = new StripeClientService();

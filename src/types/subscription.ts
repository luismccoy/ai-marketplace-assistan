export interface SubscriptionPlan {
    id: string;
    name: 'starter' | 'professional' | 'enterprise';
    conversationLimit: number;
    messageLimit: number;
    priceMonthly: number;
    stripePriceId: string;
}

export interface TenantSubscription {
    tenantId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    plan: SubscriptionPlan;
    status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
    currentPeriodStart: string;
    currentPeriodEnd: string;
    trialEnd?: string;
    cancelAtPeriodEnd: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface UsageMetrics {
    tenantId: string;
    month: string; // Format: YYYY-MM
    conversationCount: number;
    messageCount: number;
    lastUpdated: string;
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
    starter: {
        id: 'starter',
        name: 'starter',
        conversationLimit: 1000,
        messageLimit: 5000,
        priceMonthly: 99,
        stripePriceId: process.env.STRIPE_PRICE_STARTER || 'price_starter_placeholder'
    },
    professional: {
        id: 'professional',
        name: 'professional',
        conversationLimit: 5000,
        messageLimit: 25000,
        priceMonthly: 299,
        stripePriceId: process.env.STRIPE_PRICE_PROFESSIONAL || 'price_professional_placeholder'
    },
    enterprise: {
        id: 'enterprise',
        name: 'enterprise',
        conversationLimit: -1, // Unlimited
        messageLimit: -1, // Unlimited
        priceMonthly: 0, // Custom pricing
        stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE || 'price_enterprise_placeholder'
    }
};

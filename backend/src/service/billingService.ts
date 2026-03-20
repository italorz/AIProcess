import Stripe from 'stripe';
import { SupabaseClient } from '@supabase/supabase-js';

import { BILLING_ENFORCED, STRIPE_CANCEL_URL, STRIPE_SUCCESS_URL } from '../config/env';
import { getStripeClient } from '../lib/stripe';
import {
    BillingPlan,
    countLawyerClients,
    findBillingPlanByCode,
    getActiveLawyerSubscription,
    getLawyerProfile,
    listBillingPlans,
    syncLawyerSubscription,
    updateLawyerProfile,
} from '../repositories/lawyerRepository';

const ACTIVE_STRIPE_STATUSES = new Set<Stripe.Subscription.Status>(['trialing', 'active', 'past_due']);

const unixToIsoOrNull = (timestamp?: number | null) =>
    typeof timestamp === 'number' && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null;

export const getRequiredPlanForClientCount = (plans: BillingPlan[], clientCount: number) => {
    return plans
        .filter((plan) => plan.code !== 'free')
        .sort((a, b) => a.clientLimit - b.clientLimit)
        .find((plan) => clientCount <= plan.clientLimit) ?? null;
};

export const getBillingOverview = async (
    lawyerId: string,
    client?: SupabaseClient
) => {
    const [profile, clientsCount, plans, subscription] = await Promise.all([
        getLawyerProfile(lawyerId, client),
        countLawyerClients(lawyerId, client),
        listBillingPlans(client),
        getActiveLawyerSubscription(lawyerId, client),
    ]);

    if (!profile) {
        throw new Error('Perfil do advogado não encontrado.');
    }

    return {
        profile,
        clientsCount,
        plans,
        subscription,
    };
};

export const createCheckoutForPlan = async (
    lawyerId: string,
    targetPlanCode: string,
    client?: SupabaseClient
) => {
    const [profile, plan] = await Promise.all([
        getLawyerProfile(lawyerId, client),
        listBillingPlans(client).then((plans) => plans.find((item) => item.code === targetPlanCode) ?? null),
    ]);

    if (!profile) {
        throw new Error('Perfil do advogado não encontrado.');
    }

    if (!plan || plan.code === 'free') {
        throw new Error('Plano solicitado é inválido para assinatura.');
    }

    if (!plan.stripePriceId) {
        throw new Error(`O plano ${plan.code} ainda não está configurado no Stripe.`);
    }

    const stripe = getStripeClient();

    let customerId = profile.stripeCustomerId;
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: profile.email,
            name: profile.fullName ?? profile.email,
            metadata: {
                lawyer_id: lawyerId,
            },
        });
        customerId = customer.id;
        await updateLawyerProfile(lawyerId, {
            stripeCustomerId: customerId,
        }, client);
    }

    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        success_url: STRIPE_SUCCESS_URL,
        cancel_url: STRIPE_CANCEL_URL,
        client_reference_id: lawyerId,
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        metadata: {
            lawyer_id: lawyerId,
            plan_code: plan.code,
        },
        subscription_data: {
            metadata: {
                lawyer_id: lawyerId,
                plan_code: plan.code,
            },
        },
    });

    return {
        checkoutUrl: session.url,
        targetPlan: plan,
    };
};

export const syncStripeSubscriptionState = async (subscription: Stripe.Subscription) => {
    const lawyerId = subscription.metadata.lawyer_id;
    if (!lawyerId) {
        throw new Error('Evento Stripe sem metadata lawyer_id.');
    }

    const plans = await listBillingPlans();
    const subscriptionPriceId = subscription.items.data[0]?.price.id ?? null;
    const metadataPlanCode = subscription.metadata.plan_code;
    const matchedPlan =
        plans.find((plan) => plan.code === metadataPlanCode) ??
        plans.find((plan) => plan.stripePriceId === subscriptionPriceId) ??
        null;

    if (!matchedPlan) {
        throw new Error('Não foi possível determinar a faixa do advogado a partir do evento Stripe.');
    }

    await syncLawyerSubscription({
        lawyerId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId:
            typeof subscription.customer === 'string'
                ? subscription.customer
                : subscription.customer?.id,
        stripePriceId: subscriptionPriceId,
        planCode: matchedPlan.code,
        status: subscription.status,
        currentPeriodStart: unixToIsoOrNull(subscription.start_date),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });

    const persistedPlan = await findBillingPlanByCode(matchedPlan.code);
    await updateLawyerProfile(lawyerId, {
        stripeCustomerId:
            typeof subscription.customer === 'string'
                ? subscription.customer
                : subscription.customer?.id,
        currentPlanCode: matchedPlan.code,
        planStatus: subscription.status,
        activeClientLimit: persistedPlan?.clientLimit ?? matchedPlan.clientLimit,
    });
};

export const ensureLawyerCanAddClient = async (
    lawyerId: string,
    client?: SupabaseClient
) => {
    const [profile, clientsCount, plans, subscription] = await Promise.all([
        getLawyerProfile(lawyerId, client),
        countLawyerClients(lawyerId, client),
        listBillingPlans(client),
        getActiveLawyerSubscription(lawyerId, client),
    ]);

    if (!profile) {
        throw new Error('Perfil do advogado não encontrado.');
    }

    const requiredPlan = getRequiredPlanForClientCount(plans, clientsCount + 1);
    if (!requiredPlan) {
        throw new Error('O limite maximo de 30 clientes por advogado foi atingido.');
    }

    if (!BILLING_ENFORCED) {
        // Em modo de validação funcional, mantemos a estrutura de faixas apenas
        // como referência interna e liberamos o cadastro sem exigir checkout.
        return { action: 'validation_only' as const, plan: requiredPlan };
    }

    const currentPlan = plans.find((plan) => plan.code === profile.currentPlanCode) ?? null;
    const currentLimit = currentPlan?.clientLimit ?? profile.activeClientLimit;

    if (
        currentLimit >= requiredPlan.clientLimit &&
        ACTIVE_STRIPE_STATUSES.has(profile.planStatus as Stripe.Subscription.Status)
    ) {
        return { action: 'allowed' as const, plan: requiredPlan };
    }

    if (!subscription || !ACTIVE_STRIPE_STATUSES.has(subscription.status as Stripe.Subscription.Status)) {
        const checkout = await createCheckoutForPlan(lawyerId, requiredPlan.code, client);
        return {
            action: 'checkout_required' as const,
            plan: requiredPlan,
            checkoutUrl: checkout.checkoutUrl,
        };
    }

    if (!requiredPlan.stripePriceId) {
        throw new Error(`O plano ${requiredPlan.code} ainda não está configurado no Stripe.`);
    }

    const stripe = getStripeClient();
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
    const currentItem = stripeSubscription.items.data[0];

    if (!currentItem) {
        throw new Error('A assinatura atual não possui item configurado no Stripe.');
    }

    const updatedSubscription = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        items: [
            {
                id: currentItem.id,
                price: requiredPlan.stripePriceId,
            },
        ],
        proration_behavior: 'create_prorations',
        cancel_at_period_end: false,
        metadata: {
            lawyer_id: lawyerId,
            plan_code: requiredPlan.code,
        },
    });

    await syncLawyerSubscription({
        lawyerId,
        stripeSubscriptionId: updatedSubscription.id,
        stripeCustomerId:
            typeof updatedSubscription.customer === 'string'
                ? updatedSubscription.customer
                : updatedSubscription.customer?.id,
        stripePriceId: updatedSubscription.items.data[0]?.price.id ?? requiredPlan.stripePriceId,
        planCode: requiredPlan.code,
        status: updatedSubscription.status,
        currentPeriodStart: unixToIsoOrNull(updatedSubscription.start_date),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
    });

    await updateLawyerProfile(lawyerId, {
        currentPlanCode: requiredPlan.code,
        planStatus: updatedSubscription.status,
        activeClientLimit: requiredPlan.clientLimit,
        stripeCustomerId:
            typeof updatedSubscription.customer === 'string'
                ? updatedSubscription.customer
                : updatedSubscription.customer?.id,
    }, client);

    return { action: 'upgraded' as const, plan: requiredPlan };
};

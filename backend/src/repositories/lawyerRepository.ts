import { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import { supabasePublic } from '../lib/supabase';
import { normalizePhone } from '../utils/phone';

export type BillingPlan = {
    code: string;
    name: string;
    clientLimit: number;
    monthlyPriceCents: number;
    stripePriceId: string | null;
};

export type LawyerProfile = {
    id: string;
    email: string;
    fullName: string | null;
    stripeCustomerId: string | null;
    currentPlanCode: string;
    planStatus: string;
    activeClientLimit: number;
};

export type LawyerSubscription = {
    id: string;
    lawyerId: string;
    stripeSubscriptionId: string;
    stripeCustomerId: string | null;
    stripePriceId: string | null;
    planCode: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
};

export type LawyerClient = {
    id: string;
    lawyerId: string;
    phone: string;
    phoneNormalized: string;
    processNumber: string;
    createdAt: string;
    updatedAt: string;
};

const mapPlan = (row: {
    code: string;
    name: string;
    client_limit: number;
    monthly_price_cents: number;
    stripe_price_id: string | null;
}): BillingPlan => ({
    code: row.code,
    name: row.name,
    clientLimit: row.client_limit,
    monthlyPriceCents: row.monthly_price_cents,
    stripePriceId: row.stripe_price_id,
});

const mapProfile = (row: {
    id: string;
    email: string;
    full_name: string | null;
    stripe_customer_id: string | null;
    current_plan_code: string;
    plan_status: string;
    active_client_limit: number;
}): LawyerProfile => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    stripeCustomerId: row.stripe_customer_id,
    currentPlanCode: row.current_plan_code,
    planStatus: row.plan_status,
    activeClientLimit: row.active_client_limit,
});

const mapSubscription = (row: {
    id: string;
    lawyer_id: string;
    stripe_subscription_id: string;
    stripe_customer_id: string | null;
    stripe_price_id: string | null;
    plan_code: string;
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
}): LawyerSubscription => ({
    id: row.id,
    lawyerId: row.lawyer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeCustomerId: row.stripe_customer_id,
    stripePriceId: row.stripe_price_id,
    planCode: row.plan_code,
    status: row.status,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
});

const mapClient = (row: {
    id: string;
    lawyer_id: string;
    phone: string;
    phone_normalized: string;
    process_number: string;
    created_at: string;
    updated_at: string;
}): LawyerClient => ({
    id: row.id,
    lawyerId: row.lawyer_id,
    phone: row.phone,
    phoneNormalized: row.phone_normalized,
    processNumber: row.process_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const maybeNullError = (error: PostgrestError | null) => {
    if (error) {
        throw error;
    }
};

export const listBillingPlans = async (client: SupabaseClient = supabasePublic) => {
    const { data, error } = await client
        .from('billing_plans')
        .select('code, name, client_limit, monthly_price_cents, stripe_price_id')
        .order('client_limit', { ascending: true });

    maybeNullError(error);
    return (data ?? []).map(mapPlan);
};

export const findBillingPlanByCode = async (code: string, client: SupabaseClient = supabasePublic) => {
    const { data, error } = await client
        .from('billing_plans')
        .select('code, name, client_limit, monthly_price_cents, stripe_price_id')
        .eq('code', code)
        .maybeSingle();

    maybeNullError(error);
    return data ? mapPlan(data) : null;
};

export const getLawyerProfile = async (lawyerId: string, client: SupabaseClient = supabasePublic) => {
    const { data, error } = await client
        .from('lawyer_profiles')
        .select(
            'id, email, full_name, stripe_customer_id, current_plan_code, plan_status, active_client_limit'
        )
        .eq('id', lawyerId)
        .maybeSingle();

    maybeNullError(error);
    return data ? mapProfile(data) : null;
};

export const updateLawyerProfile = async (
    lawyerId: string,
    updates: {
        fullName?: string | null;
        stripeCustomerId?: string | null;
        currentPlanCode?: string;
        planStatus?: string;
        activeClientLimit?: number;
    },
    client: SupabaseClient = supabasePublic
) => {
    const payload: Record<string, string | number | null> = {};

    if ('fullName' in updates) {
        payload.full_name = updates.fullName ?? null;
    }
    if ('stripeCustomerId' in updates) {
        payload.stripe_customer_id = updates.stripeCustomerId ?? null;
    }
    if ('currentPlanCode' in updates && updates.currentPlanCode) {
        payload.current_plan_code = updates.currentPlanCode;
    }
    if ('planStatus' in updates && updates.planStatus) {
        payload.plan_status = updates.planStatus;
    }
    if ('activeClientLimit' in updates && typeof updates.activeClientLimit === 'number') {
        payload.active_client_limit = updates.activeClientLimit;
    }

    const { data, error } = await client
        .from('lawyer_profiles')
        .update(payload)
        .eq('id', lawyerId)
        .select(
            'id, email, full_name, stripe_customer_id, current_plan_code, plan_status, active_client_limit'
        )
        .single();

    maybeNullError(error);
    if (!data) {
        throw new Error('Perfil do advogado não encontrado para atualização.');
    }
    return mapProfile(data);
};

export const listLawyerClients = async (lawyerId: string, client: SupabaseClient = supabasePublic) => {
    const { data, error } = await client
        .from('lawyer_clients')
        .select('id, lawyer_id, phone, phone_normalized, process_number, created_at, updated_at')
        .eq('lawyer_id', lawyerId)
        .order('created_at', { ascending: false });

    maybeNullError(error);
    return (data ?? []).map(mapClient);
};

export const countLawyerClients = async (lawyerId: string, client: SupabaseClient = supabasePublic) => {
    const { count, error } = await client
        .from('lawyer_clients')
        .select('id', { count: 'exact', head: true })
        .eq('lawyer_id', lawyerId);

    maybeNullError(error);
    return count ?? 0;
};

export const createLawyerClient = async (
    lawyerId: string,
    payload: { phone: string; processNumber: string },
    client: SupabaseClient = supabasePublic
) => {
    const normalizedPhone = normalizePhone(payload.phone);
    const { data, error } = await client
        .from('lawyer_clients')
        .insert({
            lawyer_id: lawyerId,
            phone: payload.phone.trim(),
            phone_normalized: normalizedPhone,
            process_number: payload.processNumber.trim(),
        })
        .select('id, lawyer_id, phone, phone_normalized, process_number, created_at, updated_at')
        .single();

    maybeNullError(error);
    if (!data) {
        throw new Error('Falha ao cadastrar cliente do advogado.');
    }
    return mapClient(data);
};

export const updateLawyerClient = async (
    lawyerId: string,
    clientId: string,
    payload: { phone: string; processNumber: string },
    client: SupabaseClient = supabasePublic
) => {
    const normalizedPhone = normalizePhone(payload.phone);
    const { data, error } = await client
        .from('lawyer_clients')
        .update({
            phone: payload.phone.trim(),
            phone_normalized: normalizedPhone,
            process_number: payload.processNumber.trim(),
        })
        .eq('id', clientId)
        .eq('lawyer_id', lawyerId)
        .select('id, lawyer_id, phone, phone_normalized, process_number, created_at, updated_at')
        .single();

    maybeNullError(error);
    if (!data) {
        throw new Error('Cliente não encontrado para atualização.');
    }
    return mapClient(data);
};

export const deleteLawyerClient = async (
    lawyerId: string,
    clientId: string,
    client: SupabaseClient = supabasePublic
) => {
    const { error } = await client
        .from('lawyer_clients')
        .delete()
        .eq('id', clientId)
        .eq('lawyer_id', lawyerId);

    maybeNullError(error);
};

export const findClientByPhone = async (phone: string, client: SupabaseClient = supabasePublic) => {
    const normalizedPhone = normalizePhone(phone);
    const { data, error } = await client
        .from('lawyer_clients')
        .select('id, lawyer_id, phone, phone_normalized, process_number, created_at, updated_at')
        .eq('phone_normalized', normalizedPhone)
        .maybeSingle();

    maybeNullError(error);
    return data ? mapClient(data) : null;
};

export const getActiveLawyerSubscription = async (
    lawyerId: string,
    client: SupabaseClient = supabasePublic
) => {
    const { data, error } = await client
        .from('lawyer_subscriptions')
        .select(
            'id, lawyer_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, plan_code, status, current_period_start, current_period_end, cancel_at_period_end'
        )
        .eq('lawyer_id', lawyerId)
        .in('status', ['trialing', 'active', 'past_due'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    maybeNullError(error);
    return data ? mapSubscription(data) : null;
};

export const syncLawyerSubscription = async (payload: {
    lawyerId: string;
    stripeSubscriptionId: string;
    stripeCustomerId?: string | null;
    stripePriceId?: string | null;
    planCode: string;
    status: string;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
}, client: SupabaseClient = supabasePublic) => {
    const { data, error } = await client
        .from('lawyer_subscriptions')
        .upsert(
            {
                lawyer_id: payload.lawyerId,
                stripe_subscription_id: payload.stripeSubscriptionId,
                stripe_customer_id: payload.stripeCustomerId ?? null,
                stripe_price_id: payload.stripePriceId ?? null,
                plan_code: payload.planCode,
                status: payload.status,
                current_period_start: payload.currentPeriodStart ?? null,
                current_period_end: payload.currentPeriodEnd ?? null,
                cancel_at_period_end: payload.cancelAtPeriodEnd ?? false,
            },
            { onConflict: 'stripe_subscription_id' }
        )
        .select(
            'id, lawyer_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, plan_code, status, current_period_start, current_period_end, cancel_at_period_end'
        )
        .single();

    maybeNullError(error);
    if (!data) {
        throw new Error('Falha ao sincronizar assinatura do advogado.');
    }
    return mapSubscription(data);
};

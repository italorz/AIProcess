import { Router } from 'express';
import { PostgrestError } from '@supabase/supabase-js';

import { BILLING_ENFORCED } from '../config/env';
import { createRequestSupabaseClient } from '../lib/supabase';
import { requireLawyerAuth } from '../middleware/requireLawyerAuth';
import {
    createLawyerClient,
    deleteLawyerClient,
    getActiveLawyerSubscription,
    listBillingPlans,
    listLawyerClients,
    updateLawyerClient,
} from '../repositories/lawyerRepository';
import { createCheckoutForPlan, ensureLawyerCanAddClient, getBillingOverview } from '../service/billingService';

const router = Router();

router.use(requireLawyerAuth);

router.get('/dashboard', async (req, res) => {
    const lawyerId = req.lawyerUser?.id;

    if (!lawyerId) {
        return res.status(401).json({ message: 'Sessão inválida.' });
    }

    try {
        const supabase = createRequestSupabaseClient(req.lawyerAccessToken ?? '');
        const [overview, clients] = await Promise.all([
            getBillingOverview(lawyerId, supabase),
            listLawyerClients(lawyerId, supabase),
        ]);

        return res.json({
            profile: overview.profile,
            clientsCount: overview.clientsCount,
            subscription: overview.subscription,
            plans: overview.plans,
            clients,
            billingEnabled: BILLING_ENFORCED,
        });
    } catch (error) {
        console.error('[LAWYER:DASHBOARD]', error);
        return res.status(500).json({ message: 'Não foi possível carregar o dashboard.' });
    }
});

router.get('/clients', async (req, res) => {
    const lawyerId = req.lawyerUser?.id;

    if (!lawyerId) {
        return res.status(401).json({ message: 'Sessão inválida.' });
    }

    const supabase = createRequestSupabaseClient(req.lawyerAccessToken ?? '');
    const clients = await listLawyerClients(lawyerId, supabase);
    return res.json({ clients });
});

router.post('/clients', async (req, res) => {
    const lawyerId = req.lawyerUser?.id;
    const { telefone, numeroProcesso } = req.body as {
        telefone?: string;
        numeroProcesso?: string;
    };

    if (!lawyerId) {
        return res.status(401).json({ message: 'Sessão inválida.' });
    }

    if (!telefone || !numeroProcesso) {
        return res
            .status(400)
            .json({ message: 'telefone e numeroProcesso são obrigatórios.' });
    }

    try {
        const supabase = createRequestSupabaseClient(req.lawyerAccessToken ?? '');
        const billingGate = await ensureLawyerCanAddClient(lawyerId, supabase);

        if (billingGate.action === 'checkout_required') {
            return res.status(402).json({
                requiresCheckout: true,
                checkoutUrl: billingGate.checkoutUrl,
                requiredPlan: billingGate.plan,
                message:
                    'Finalize a assinatura do plano para concluir o cadastro deste cliente.',
            });
        }

        const client = await createLawyerClient(lawyerId, {
            phone: telefone,
            processNumber: numeroProcesso,
        }, supabase);

        return res.status(201).json({
            client,
            plan: billingGate.plan,
            upgraded: billingGate.action === 'upgraded',
            billingEnabled: BILLING_ENFORCED,
        });
    } catch (error) {
        console.error('[LAWYER:CREATE_CLIENT]', error);

        if ((error as PostgrestError).code === '23505') {
            return res.status(409).json({
                message: 'Este telefone já está vinculado a um cliente cadastrado.',
            });
        }

        return res.status(500).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Não foi possível cadastrar o cliente.',
        });
    }
});

router.patch('/clients/:clientId', async (req, res) => {
    const lawyerId = req.lawyerUser?.id;
    const { clientId } = req.params;
    const { telefone, numeroProcesso } = req.body as {
        telefone?: string;
        numeroProcesso?: string;
    };

    if (!lawyerId) {
        return res.status(401).json({ message: 'Sessão inválida.' });
    }

    if (!telefone || !numeroProcesso) {
        return res
            .status(400)
            .json({ message: 'telefone e numeroProcesso são obrigatórios.' });
    }

    try {
        const supabase = createRequestSupabaseClient(req.lawyerAccessToken ?? '');
        const client = await updateLawyerClient(lawyerId, clientId, {
            phone: telefone,
            processNumber: numeroProcesso,
        }, supabase);

        return res.json({ client });
    } catch (error) {
        console.error('[LAWYER:UPDATE_CLIENT]', error);

        if ((error as PostgrestError).code === '23505') {
            return res.status(409).json({
                message: 'Este telefone já está vinculado a um cliente cadastrado.',
            });
        }

        return res.status(500).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Não foi possível atualizar o cliente.',
        });
    }
});

router.delete('/clients/:clientId', async (req, res) => {
    const lawyerId = req.lawyerUser?.id;
    const { clientId } = req.params;

    if (!lawyerId) {
        return res.status(401).json({ message: 'Sessão inválida.' });
    }

    try {
        const supabase = createRequestSupabaseClient(req.lawyerAccessToken ?? '');
        await deleteLawyerClient(lawyerId, clientId, supabase);
        return res.status(204).send();
    } catch (error) {
        console.error('[LAWYER:DELETE_CLIENT]', error);
        return res.status(500).json({ message: 'Não foi possível excluir o cliente.' });
    }
});

router.get('/billing', async (req, res) => {
    const lawyerId = req.lawyerUser?.id;

    if (!lawyerId) {
        return res.status(401).json({ message: 'Sessão inválida.' });
    }

    try {
        const supabase = createRequestSupabaseClient(req.lawyerAccessToken ?? '');
        const [plans, subscription] = await Promise.all([
            listBillingPlans(supabase),
            getActiveLawyerSubscription(lawyerId, supabase),
        ]);

        return res.json({ plans, subscription });
    } catch (error) {
        console.error('[LAWYER:BILLING]', error);
        return res.status(500).json({ message: 'Não foi possível carregar os planos.' });
    }
});

router.post('/billing/checkout', async (req, res) => {
    const lawyerId = req.lawyerUser?.id;
    const { planCode } = req.body as { planCode?: string };

    if (!lawyerId) {
        return res.status(401).json({ message: 'Sessão inválida.' });
    }

    if (!planCode) {
        return res.status(400).json({ message: 'planCode é obrigatório.' });
    }

    if (!BILLING_ENFORCED) {
        return res.status(409).json({
            message: 'A cobrança está desativada temporariamente enquanto validamos a funcionalidade.',
        });
    }

    try {
        const supabase = createRequestSupabaseClient(req.lawyerAccessToken ?? '');
        const checkout = await createCheckoutForPlan(lawyerId, planCode, supabase);
        return res.json(checkout);
    } catch (error) {
        console.error('[LAWYER:CHECKOUT]', error);
        return res.status(500).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Não foi possível iniciar o checkout.',
        });
    }
});

export default router;

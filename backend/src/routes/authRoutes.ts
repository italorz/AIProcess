import { Router } from 'express';

import { createRequestSupabaseClient } from '../lib/supabase';
import { requireLawyerAuth } from '../middleware/requireLawyerAuth';
import { getLawyerProfile } from '../repositories/lawyerRepository';

const router = Router();

router.get('/me', requireLawyerAuth, async (req, res) => {
    const lawyerUser = req.lawyerUser;
    const lawyerId = lawyerUser?.id;

    if (!lawyerId) {
        return res.status(401).json({ message: 'Sessão inválida.' });
    }

    const supabase = createRequestSupabaseClient(req.lawyerAccessToken ?? '');
    const profile = await getLawyerProfile(lawyerId, supabase);
    if (!profile) {
        return res.status(404).json({ message: 'Perfil do advogado não encontrado.' });
    }

    return res.json({
        user: {
            id: lawyerUser.id,
            email: lawyerUser.email,
        },
        profile,
    });
});

export default router;


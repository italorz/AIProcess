import { Router } from 'express';

import { findClientByPhone } from '../repositories/lawyerRepository';
import { startScrapingSession } from '../service/scrapingService';

const router = Router();

router.post('/start', async (req, res) => {
    const { telefone } = req.body as { telefone?: string };

    if (!telefone || typeof telefone !== 'string') {
        return res.status(400).json({ message: 'telefone é obrigatório.' });
    }

    try {
        const linkedClient = await findClientByPhone(telefone);

        if (!linkedClient) {
            return res.status(404).json({
                message: 'Nenhum processo foi vinculado a este telefone.',
            });
        }

        const scrapingPayload = await startScrapingSession(linkedClient.processNumber);
        return res.json({
            ...scrapingPayload,
            numeroProcesso: linkedClient.processNumber,
        });
    } catch (error) {
        console.error('[CLIENT:START]', error);
        return res.status(500).json({
            message:
                (error instanceof Error && error.message) ||
                'Não foi possível localizar o processo para este telefone.',
        });
    }
});

export default router;

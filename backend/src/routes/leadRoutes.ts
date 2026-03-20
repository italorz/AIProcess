import { Router, Request, Response } from 'express';

import { saveLead } from '../repositories/leadRepository';
import { LeadPayload } from '../interfaces/leadInterface';

const router = Router();

router.post('/process', async (req: Request, res: Response) => {
    const { nome, telefone, email, numeroProcesso } = req.body as LeadPayload;

    if (!nome || !telefone || !email || !numeroProcesso) {
        return res
            .status(400)
            .json({ message: 'nome, telefone, email e numeroProcesso são obrigatórios' });
    }

    try {
        await saveLead({
            type: 'process',
            nome,
            telefone,
            email,
            numeroProcesso,
        });

        return res.status(201).json({ message: 'Lead registrado com sucesso.' });
    } catch (error) {
        console.log('Erro ao salvar lead:', error);
        return res.status(500).json({ message: 'Não foi possível salvar o lead.' });
    }
});

router.post('/lawyer', async (req: Request, res: Response) => {
    const { nome, telefone, email, duvida, consentimento } = req.body as LeadPayload;

    if (!nome || !telefone || !email || !duvida) {
        return res.status(400).json({ message: 'nome, telefone, email e duvida são obrigatórios' });
    }

    if (!consentimento) {
        return res.status(400).json({ message: 'O consentimento é obrigatório.' });
    }

    try {
        await saveLead({
            type: 'lawyer',
            nome,
            telefone,
            email,
            duvida,
            consentimento: true,
        });

        return res
            .status(201)
            .json({ message: 'Solicitação enviada. Um especialista entrará em contato.' });
    } catch (error) {
        console.log('Erro ao salvar lead:', error);
        return res.status(500).json({ message: 'Não foi possível enviar sua solicitação.' });
    }
});

export default router;


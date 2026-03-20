import { LeadPayload } from '../interfaces/leadInterface';
import { supabasePublic } from '../lib/supabase';

export const saveLead = async (payload: LeadPayload) => {
    const contextoLog = {
        tipo: payload.type,
        email: payload.email,
        temNumeroProcesso: Boolean(payload.numeroProcesso),
        temDuvida: Boolean(payload.duvida),
    };

    console.log('[LEADS] Iniciando gravação no banco.', contextoLog);

    try {
        const { data, error } = await supabasePublic
            .from('leads')
            .insert({
                type: payload.type,
                nome: payload.nome,
                telefone: payload.telefone,
                email: payload.email,
                numero_processo: payload.numeroProcesso ?? null,
                duvida: payload.duvida ?? null,
                consentimento: payload.consentimento ?? false,
            })
            .select(
                'id, type, nome, telefone, email, numero_processo, duvida, consentimento, created_at, updated_at'
            )
            .single();

        if (error || !data) {
            throw error ?? new Error('Falha ao inserir lead no Supabase.');
        }

        console.log('[LEADS] Lead salvo com sucesso.', {
            ...contextoLog,
            id: data.id,
            criadoEm: data.created_at,
        });

        return {
            id: data.id,
            type: data.type,
            nome: data.nome,
            telefone: data.telefone,
            email: data.email,
            numeroProcesso: data.numero_processo ?? undefined,
            duvida: data.duvida ?? undefined,
            consentimento: data.consentimento,
            createdAt: data.created_at ? new Date(data.created_at) : undefined,
            updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
        };
    } catch (erro) {
        console.error(
            '[LEADS] Falha ao salvar lead. Requisição será lançada para tratamento.',
            contextoLog,
            erro
        );
        throw erro;
    }
};

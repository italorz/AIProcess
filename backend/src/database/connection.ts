import { supabasePublic } from '../lib/supabase';

export const connectDatabase = async () => {
    try {
        const { error } = await supabasePublic.from('billing_plans').select('code').limit(1);
        if (error) {
            throw error;
        }
        console.log('[DB] Conectado ao Supabase');
    } catch (error) {
        console.error('[DB] Erro ao conectar no Supabase', error);
        throw error;
    }
};


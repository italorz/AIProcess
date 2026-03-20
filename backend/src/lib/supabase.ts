import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/env';

const assertSupabaseEnv = () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error(
            'SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios para iniciar o backend.'
        );
    }
};

assertSupabaseEnv();

const supabaseUrl = SUPABASE_URL as string;
const supabaseAnonKey = SUPABASE_ANON_KEY as string;

const buildClient = (accessToken?: string): SupabaseClient => {
    const options = {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    } as {
        auth: {
            autoRefreshToken: false;
            persistSession: false;
        };
        global?: {
            headers: {
                Authorization: string;
            };
        };
    };

    if (accessToken) {
        options.global = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        };
    }

    return createClient(supabaseUrl, supabaseAnonKey, options);
};

export const supabasePublic = buildClient();

export const createRequestSupabaseClient = (accessToken: string) => buildClient(accessToken);

export const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

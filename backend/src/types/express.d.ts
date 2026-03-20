import type { User } from '@supabase/supabase-js';

declare global {
    namespace Express {
        interface Request {
            lawyerUser?: User;
            lawyerAccessToken?: string;
        }
    }
}

export {};

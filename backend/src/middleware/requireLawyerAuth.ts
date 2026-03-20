import { NextFunction, Request, Response } from 'express';

import { supabaseAuth } from '../lib/supabase';

const extractBearerToken = (authorizationHeader?: string) => {
    if (!authorizationHeader) {
        return null;
    }

    const [scheme, token] = authorizationHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
        return null;
    }

    return token;
};

export const requireLawyerAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const accessToken = extractBearerToken(req.headers.authorization);

    if (!accessToken) {
        return res.status(401).json({ message: 'Token de acesso não informado.' });
    }

    const { data, error } = await supabaseAuth.auth.getUser(accessToken);

    if (error || !data.user) {
        return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    req.lawyerUser = data.user;
    req.lawyerAccessToken = accessToken;
    return next();
};

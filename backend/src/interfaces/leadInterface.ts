export interface LeadPayload extends Omit<ILead, 'id'> {}
export interface ILead {
    id?: string;
    type: 'process' | 'lawyer';
    nome: string;
    telefone: string;
    email: string;
    numeroProcesso?: string;
    duvida?: string;
    consentimento?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}
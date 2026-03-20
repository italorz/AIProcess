export const normalizePhone = (phone: string) => {
    const trimmed = phone.trim();
    const digitsOnly = trimmed.replace(/\D/g, '');
    return digitsOnly || trimmed.toLowerCase();
};

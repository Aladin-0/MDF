export const WHATSAPP_TEMPLATES = {
    paymentReminder: (
        customerName: string,
        amount: number,
        outletName: string,
        daysOverdue?: number
    ) => {
        const overduePart = daysOverdue
            ? `This amount has been pending for ${daysOverdue} days. `
            : '';
        return encodeURIComponent(
            `Dear ${customerName},\n\n` +
            `This is a gentle reminder that you have an outstanding balance of ₹${amount.toLocaleString('en-IN')} at ${outletName}.\n\n` +
            `${overduePart}` +
            `Please visit us at your earliest convenience to clear the dues.\n\n` +
            `For any queries, please call us.\n\n` +
            `Thank you for your trust!\n` +
            `— ${outletName}`
        );
    },

    paymentReceipt: (
        customerName: string,
        amountPaid: number,
        remainingBalance: number,
        outletName: string,
        voucherNo?: string
    ) => encodeURIComponent(
        `Dear ${customerName},\n\n` +
        `We have received your payment of ₹${amountPaid.toLocaleString('en-IN')}.\n` +
        (voucherNo ? `Receipt No: ${voucherNo}\n` : '') +
        `Remaining balance: ₹${remainingBalance.toLocaleString('en-IN')}\n\n` +
        `Thank you!\n— ${outletName}`
    ),
};

export function generateWhatsAppLink(
    phone: string,
    message: string
): string {
    const cleaned = phone.replace(/\D/g, '');
    const withCode = cleaned.startsWith('91')
        ? cleaned : `91${cleaned}`;
    return `https://wa.me/${withCode}?text=${message}`;
}

export function openWhatsApp(
    phone: string,
    template: string
): void {
    const link = generateWhatsAppLink(phone, template);
    window.open(link, '_blank');
}

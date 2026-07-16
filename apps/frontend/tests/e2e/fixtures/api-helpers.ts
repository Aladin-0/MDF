import { APIRequestContext, expect } from '@playwright/test';

export class ApiHelper {
  private request: APIRequestContext;
  private baseUrl = 'http://localhost:8000/api/v1';

  constructor(request: APIRequestContext) {
    this.request = request;
  }

  async getStoredToken(): Promise<string | null> {
    const storageState = await this.request.storageState();
    const cookie = storageState.cookies.find(c => c.name === 'access_token');
    return cookie ? cookie.value : null;
  }

  private async getHeaders() {
    const token = await this.getStoredToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  async createPurchaseInvoice(outletId: string, overrides: any = {}) {
    const payload = {
      outletId,
      distributorId: overrides.distributorId || '53368ef6-d787-4e49-82e4-4fc2c62b7655', // 1test distributor
      partyLedgerId: overrides.partyLedgerId || '08cd4ac3-ff9e-4dbb-8ca4-3fda24e2144c',
      invoiceNo: overrides.invoiceNo || `TEST-PUR-${Date.now()}`,
      invoiceDate: new Date().toISOString().split('T')[0],
      purchaseType: 'cash',
      items: overrides.items || [],
      subtotal: 0,
      grandTotal: 0,
      ...overrides
    };

    const response = await this.request.post(`${this.baseUrl}/purchases/`, {
      headers: await this.getHeaders(),
      data: payload
    });

    if (!response.ok()) {
      const err = await response.text();
      throw new Error(`Failed to create purchase invoice: ${response.status()} ${err}`);
    }

    return await response.json();
  }

  async createSaleInvoice(outletId: string, overrides: any = {}) {
    const payload = {
      outletId,
      paymentMode: 'cash',
      cashPaid: overrides.cashPaid || 10,
      subtotal: overrides.subtotal || 10,
      discountAmount: overrides.discountAmount || 0,
      taxableAmount: overrides.taxableAmount || 10,
      cgstAmount: overrides.cgstAmount || 0,
      sgstAmount: overrides.sgstAmount || 0,
      igstAmount: overrides.igstAmount || 0,
      cgst: overrides.cgst || 0,
      sgst: overrides.sgst || 0,
      igst: overrides.igst || 0,
      roundOff: overrides.roundOff || 0,
      grandTotal: overrides.grandTotal || 10,
      items: overrides.items || [
        {
          batchId: '9b801458-865f-4e8e-af75-f81946b8c4e6',
          productId: 'bf88b0aa-e793-4674-a09d-941a1a956deb',
          qtyStrips: 1,
          qtyLoose: 0,
          rate: 10,
          discountPct: 0,
          gstRate: 0,
          taxableAmount: 10,
          gstAmount: 0,
          totalAmount: 10
        }
      ],
      ...overrides
    };

    const headers = await this.getHeaders();
    const response = await this.request.post(`${this.baseUrl}/sales/`, {
      data: payload,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok()) {
      const err = await response.text();
      require('fs').writeFileSync('/tmp/failed_payload.json', JSON.stringify(payload, null, 2));
      require('fs').writeFileSync('/tmp/failed_err.txt', err);
      throw new Error(`Failed to create sale invoice: ${response.status()} ${err}`);
    }

    return await response.json();
  }

  async createSaleReturn(outletId: string, saleInvoiceId: string, overrides: any = {}) {
    const payload = {
      outletId,
      originalInvoiceId: saleInvoiceId,
      refundMode: 'cash',
      items: overrides.items || [],
      ...overrides
    };

    const response = await this.request.post(`${this.baseUrl}/sales/returns/`, {
      headers: await this.getHeaders(),
      data: payload
    });
    if (!response.ok()) throw new Error(`Failed to create sale return: ${response.status()}`);
    return await response.json();
  }

  async createPurchaseReturn(outletId: string, purchaseInvoiceId: string, overrides: any = {}) {
    const payload = {
      outletId,
      originalInvoiceId: purchaseInvoiceId,
      refundMode: 'cash',
      items: overrides.items || [],
      ...overrides
    };

    const response = await this.request.post(`${this.baseUrl}/purchases/returns/`, {
      headers: await this.getHeaders(),
      data: payload
    });
    if (!response.ok()) throw new Error(`Failed to create purchase return: ${response.status()}`);
    return await response.json();
  }

  async createVoucher(outletId: string, voucherType: string, overrides: any = {}) {
    const payload = {
      outletId,
      voucherType, // receipt, payment, journal, contra
      amount: overrides.amount || 100,
      drLedgerId: overrides.drLedgerId || 'some-ledger-uuid',
      crLedgerId: overrides.crLedgerId || 'some-ledger-uuid',
      ...overrides
    };

    const response = await this.request.post(`${this.baseUrl}/accounts/vouchers/`, {
      headers: await this.getHeaders(),
      data: payload
    });
    if (!response.ok()) {
       // Ignore errors for now if ledger IDs are wrong in testing, just throw
       throw new Error(`Failed to create voucher: ${response.status()} ${await response.text()}`);
    }
    return await response.json();
  }

  // Generic request method for arbitrary API hits (e.g. security checks)
  async apiRequest(method: 'GET' | 'POST' | 'PUT' | 'DELETE', endpoint: string, data?: any) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const response = await this.request[method.toLowerCase() as 'get'|'post'|'put'|'delete'](url, {
      headers: await this.getHeaders(),
      data
    });
    return response;
  }
}

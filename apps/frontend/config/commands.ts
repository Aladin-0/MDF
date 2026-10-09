export interface CommandItem {
    id: string;
    label: string; 
    category: "Navigation" | "Sales & Billing" | "Purchases & Inventory" | "Accounts & Vouchers" | "System & Audit" | "Staff Management" | "Settings";
    routeContext: string; 
    requiredRole?: string[];
    actionType: "navigate" | "open_modal" | "focus_field" | "execute_function";
    payload: string; 
}
  
export const COMMAND_SCHEMA: CommandItem[] = [
    {
      "id": "nav.dashboard",
      "label": "Go to Dashboard",
      "category": "Navigation",
      "routeContext": "*",
      "actionType": "navigate",
      "payload": "/dashboard"
    },
    {
      "id": "nav.billing",
      "label": "Open Billing Terminal",
      "category": "Sales & Billing",
      "routeContext": "*",
      "requiredRole": ["create_bills"],
      "actionType": "navigate",
      "payload": "/billing"
    },
    {
      "id": "nav.sales.invoices",
      "label": "Sales: View Invoices",
      "category": "Sales & Billing",
      "routeContext": "*",
      "requiredRole": ["view_sales"],
      "actionType": "navigate",
      "payload": "/dashboard/sales"
    },
    {
      "id": "nav.sales.quotations",
      "label": "Sales: View Quotations",
      "category": "Sales & Billing",
      "routeContext": "*",
      "requiredRole": ["view_sales"],
      "actionType": "navigate",
      "payload": "/dashboard/sales/quotations"
    },
    {
      "id": "nav.sales.revisions",
      "label": "Sales: Revision History",
      "category": "Sales & Billing",
      "routeContext": "*",
      "requiredRole": ["view_sales"],
      "actionType": "navigate",
      "payload": "/dashboard/sales/revisions"
    },
    {
      "id": "nav.purchases.dashboard",
      "label": "Purchases: Dashboard",
      "category": "Purchases & Inventory",
      "routeContext": "*",
      "requiredRole": ["view_purchases"],
      "actionType": "navigate",
      "payload": "/dashboard/purchases"
    },
    {
      "id": "nav.inventory.list",
      "label": "Inventory: Stock List",
      "category": "Purchases & Inventory",
      "routeContext": "*",
      "requiredRole": ["view_inventory"],
      "actionType": "navigate",
      "payload": "/dashboard/inventory"
    },
    {
      "id": "nav.inventory.ledger",
      "label": "Inventory: Stock Ledger",
      "category": "Purchases & Inventory",
      "routeContext": "*",
      "requiredRole": ["view_inventory"],
      "actionType": "navigate",
      "payload": "/dashboard/stockledger"
    },
    {
      "id": "nav.credit",
      "label": "View Credit & Accounts Receivable",
      "category": "Sales & Billing",
      "routeContext": "*",
      "requiredRole": ["view_sales"],
      "actionType": "navigate",
      "payload": "/dashboard/credit"
    },
    {
      "id": "nav.customers",
      "label": "View Customers Database",
      "category": "Sales & Billing",
      "routeContext": "*",
      "actionType": "navigate",
      "payload": "/dashboard/customers"
    },
    {
      "id": "nav.reports.dashboard",
      "label": "Reports: Dashboard",
      "category": "System & Audit",
      "routeContext": "*",
      "requiredRole": ["view_reports"],
      "actionType": "navigate",
      "payload": "/dashboard/reports"
    },
    {
      "id": "nav.reports.reorder",
      "label": "Reports: Reorder Planning",
      "category": "System & Audit",
      "routeContext": "*",
      "requiredRole": ["view_reports"],
      "actionType": "navigate",
      "payload": "/dashboard/reports/reorder"
    },
    {
      "id": "nav.reports.daily",
      "label": "Reports: Daily Report",
      "category": "System & Audit",
      "routeContext": "*",
      "requiredRole": ["view_reports"],
      "actionType": "navigate",
      "payload": "/dashboard/reports/daily"
    },
    {
      "id": "nav.reports.trial_balance",
      "label": "Reports: Trial Balance",
      "category": "System & Audit",
      "routeContext": "*",
      "requiredRole": ["view_reports"],
      "actionType": "navigate",
      "payload": "/dashboard/reports/trial-balance"
    },
    {
      "id": "nav.reports.balance_sheet",
      "label": "Reports: Balance Sheet",
      "category": "System & Audit",
      "routeContext": "*",
      "requiredRole": ["view_reports"],
      "actionType": "navigate",
      "payload": "/dashboard/reports/balance-sheet"
    },
    {
      "id": "nav.reports.pnl",
      "label": "Reports: Profit & Loss",
      "category": "System & Audit",
      "routeContext": "*",
      "requiredRole": ["view_reports"],
      "actionType": "navigate",
      "payload": "/dashboard/reports/profit-loss"
    },
    {
      "id": "nav.reports.gstr2a",
      "label": "Reports: GSTR-2A Recon",
      "category": "System & Audit",
      "routeContext": "*",
      "requiredRole": ["view_reports"],
      "actionType": "navigate",
      "payload": "/dashboard/reports/gstr2a"
    },
    {
      "id": "nav.accounts.dashboard",
      "label": "Accounts: Dashboard",
      "category": "Accounts & Vouchers",
      "routeContext": "*",
      "requiredRole": ["view_accounts"],
      "actionType": "navigate",
      "payload": "/dashboard/accounts"
    },
    {
      "id": "nav.accounts.ledgers",
      "label": "Accounts: Ledgers",
      "category": "Accounts & Vouchers",
      "routeContext": "*",
      "requiredRole": ["view_accounts"],
      "actionType": "navigate",
      "payload": "/dashboard/accounts/ledgers"
    },
    {
      "id": "nav.accounts.all_vouchers",
      "label": "Accounts: All Vouchers",
      "category": "Accounts & Vouchers",
      "routeContext": "*",
      "requiredRole": ["view_accounts"],
      "actionType": "navigate",
      "payload": "/dashboard/accounts/vouchers"
    },
    {
      "id": "nav.accounts.new_voucher",
      "label": "Accounts: New Voucher",
      "category": "Accounts & Vouchers",
      "routeContext": "*",
      "requiredRole": ["create_accounts"],
      "actionType": "navigate",
      "payload": "/dashboard/accounts/voucher-entry"
    },
    {
      "id": "nav.purchases.returns",
      "label": "Purchases: Purchase Returns",
      "category": "Purchases & Inventory",
      "routeContext": "*",
      "requiredRole": ["view_purchases"],
      "actionType": "navigate",
      "payload": "/dashboard/accounts/purchase-returns"
    },
    {
      "id": "nav.accounts.purchase-returns-new",
      "label": "Create Purchase Return",
      "category": "Purchases & Inventory",
      "routeContext": "*",
      "requiredRole": ["create_purchases"],
      "actionType": "navigate",
      "payload": "/dashboard/accounts/purchase-returns/new"
    },
    {
      "id": "nav.sales.returns",
      "label": "Sales: View Sale Returns",
      "category": "Sales & Billing",
      "routeContext": "*",
      "requiredRole": ["view_sales"],
      "actionType": "navigate",
      "payload": "/dashboard/accounts/sale-returns"
    },
    {
      "id": "nav.accounts.sale-returns-new",
      "label": "Create Sale Return",
      "category": "Sales & Billing",
      "routeContext": "*",
      "requiredRole": ["create_bills"],
      "actionType": "navigate",
      "payload": "/dashboard/accounts/sale-returns/new"
    },
    {
      "id": "nav.accounts.expenses",
      "label": "View Expenses",
      "category": "Accounts & Vouchers",
      "routeContext": "*",
      "requiredRole": ["view_accounts"],
      "actionType": "navigate",
      "payload": "/dashboard/accounts/expenses"
    },
    {
      "id": "nav.accounts.payables",
      "label": "View Payables",
      "category": "Accounts & Vouchers",
      "routeContext": "*",
      "requiredRole": ["view_accounts"],
      "actionType": "navigate",
      "payload": "/dashboard/accounts/payables"
    },
    {
      "id": "nav.accounts.receivables",
      "label": "View Receivables",
      "category": "Accounts & Vouchers",
      "routeContext": "*",
      "requiredRole": ["view_accounts"],
      "actionType": "navigate",
      "payload": "/dashboard/accounts/receivables"
    },
    {
      "id": "nav.attendance",
      "label": "View Attendance",
      "category": "Staff Management",
      "routeContext": "*",
      "requiredRole": ["manage_staff"],
      "actionType": "navigate",
      "payload": "/dashboard/attendance"
    },
    {
      "id": "nav.attendance.mark",
      "label": "Mark Attendance",
      "category": "Staff Management",
      "routeContext": "*",
      "actionType": "navigate",
      "payload": "/dashboard/attendance/mark"
    },
    {
      "id": "nav.staff",
      "label": "View Staff Members",
      "category": "Staff Management",
      "routeContext": "*",
      "requiredRole": ["manage_staff"],
      "actionType": "navigate",
      "payload": "/dashboard/staff"
    },
    {
      "id": "nav.gst",
      "label": "GST Dashboard",
      "category": "System & Audit",
      "routeContext": "*",
      "requiredRole": ["view_reports"],
      "actionType": "navigate",
      "payload": "/gst"
    },
    {
      "id": "nav.gst.gstr1",
      "label": "GSTR-1",
      "category": "System & Audit",
      "routeContext": "*",
      "requiredRole": ["view_reports"],
      "actionType": "navigate",
      "payload": "/gst/gstr1"
    },
    {
      "id": "nav.gst.gstr3b",
      "label": "GSTR-3B",
      "category": "System & Audit",
      "routeContext": "*",
      "requiredRole": ["view_reports"],
      "actionType": "navigate",
      "payload": "/gst/gstr3b"
    },
    {
      "id": "nav.gst.gstr2a",
      "label": "GSTR-2A",
      "category": "System & Audit",
      "routeContext": "*",
      "requiredRole": ["view_reports"],
      "actionType": "navigate",
      "payload": "/gst/gstr2a"
    },
    {
      "id": "nav.admin.audit",
      "label": "Audit Logs",
      "category": "System & Audit",
      "routeContext": "*",
      "requiredRole": ["super_admin"],
      "actionType": "navigate",
      "payload": "/admin/audit"
    },
    {
      "id": "nav.settings.outlet",
      "label": "Settings: Outlet Profile",
      "category": "Settings",
      "routeContext": "*",
      "requiredRole": ["manage_settings"],
      "actionType": "navigate",
      "payload": "/dashboard/settings?tab=outlet"
    },
    {
      "id": "nav.settings.gst",
      "label": "Settings: GST & Tax",
      "category": "Settings",
      "routeContext": "*",
      "requiredRole": ["manage_settings"],
      "actionType": "navigate",
      "payload": "/dashboard/settings?tab=gst"
    },
    {
      "id": "nav.settings.printing",
      "label": "Settings: Printing",
      "category": "Settings",
      "routeContext": "*",
      "requiredRole": ["manage_settings"],
      "actionType": "navigate",
      "payload": "/dashboard/settings?tab=printer"
    },
    {
      "id": "nav.settings.billing",
      "label": "Settings: Billing",
      "category": "Settings",
      "routeContext": "*",
      "requiredRole": ["manage_settings"],
      "actionType": "navigate",
      "payload": "/dashboard/settings?tab=billing"
    },
    {
      "id": "nav.settings.billing_pricing",
      "label": "Settings: Billing & Pricing",
      "category": "Settings",
      "routeContext": "*",
      "requiredRole": ["manage_settings"],
      "actionType": "navigate",
      "payload": "/dashboard/settings?tab=pricing"
    },
    {
      "id": "nav.settings.attendance",
      "label": "Settings: Attendance",
      "category": "Settings",
      "routeContext": "*",
      "requiredRole": ["manage_settings"],
      "actionType": "navigate",
      "payload": "/dashboard/settings?tab=attendance"
    },
    {
      "id": "nav.settings.notifications",
      "label": "Settings: Notifications",
      "category": "Settings",
      "routeContext": "*",
      "requiredRole": ["manage_settings"],
      "actionType": "navigate",
      "payload": "/dashboard/settings?tab=notifications"
    },
    {
      "id": "nav.settings.preferences",
      "label": "Settings: Preferences",
      "category": "Settings",
      "routeContext": "*",
      "requiredRole": ["manage_settings"],
      "actionType": "navigate",
      "payload": "/dashboard/settings?tab=preferences"
    },
    {
      "id": "nav.settings.data_management",
      "label": "Settings: Data Management",
      "category": "Settings",
      "routeContext": "*",
      "requiredRole": ["manage_settings"],
      "actionType": "navigate",
      "payload": "/dashboard/settings?tab=data"
    },
    {
      "id": "action.create_ledger",
      "label": "Create New Ledger",
      "category": "Accounts & Vouchers",
      "routeContext": "*",
      "requiredRole": ["create_accounts"],
      "actionType": "open_modal",
      "payload": "MODAL_CREATE_LEDGER"
    },
    {
      "id": "action.bill_adjustment",
      "label": "Bill Adjustment",
      "category": "Accounts & Vouchers",
      "routeContext": "/dashboard/accounts/voucher-entry",
      "requiredRole": ["create_accounts"],
      "actionType": "open_modal",
      "payload": "MODAL_BILL_ADJUSTMENT"
    },
    {
      "id": "action.manual_attendance",
      "label": "Mark Manual Attendance",
      "category": "Staff Management",
      "routeContext": "/dashboard/attendance",
      "requiredRole": ["manage_staff"],
      "actionType": "open_modal",
      "payload": "MODAL_MANUAL_ATTENDANCE"
    },
    {
      "id": "action.create_doctor",
      "label": "Create New Doctor",
      "category": "Sales & Billing",
      "routeContext": "/billing",
      "requiredRole": ["create_bills"],
      "actionType": "open_modal",
      "payload": "MODAL_CREATE_DOCTOR"
    },
    {
      "id": "action.bulk_reminder",
      "label": "Send Bulk Reminders",
      "category": "Sales & Billing",
      "routeContext": "/dashboard/credit",
      "requiredRole": ["view_sales"],
      "actionType": "open_modal",
      "payload": "MODAL_BULK_REMINDER"
    },
    {
      "id": "action.stock_adjustment",
      "label": "Adjust Stock",
      "category": "Purchases & Inventory",
      "routeContext": "/dashboard/inventory",
      "requiredRole": ["create_purchases"],
      "actionType": "open_modal",
      "payload": "MODAL_STOCK_ADJUSTMENT"
    },
    {
      "id": "action.add_staff",
      "label": "Add New Staff",
      "category": "Staff Management",
      "routeContext": "/dashboard/staff",
      "requiredRole": ["manage_staff"],
      "actionType": "open_modal",
      "payload": "MODAL_STAFF_FORM"
    },
    {
      "id": "action.add_outlet",
      "label": "Add New Outlet",
      "category": "System & Audit",
      "routeContext": "/dashboard/chain",
      "requiredRole": ["super_admin"],
      "actionType": "open_modal",
      "payload": "MODAL_ADD_OUTLET"
    },
    {
      "id": "action.new_invoice",
      "label": "Create New Invoice",
      "category": "Sales & Billing",
      "routeContext": "/billing",
      "requiredRole": ["create_bills"],
      "actionType": "execute_function",
      "payload": "TRIGGER_NEW_INVOICE"
    },
    {
      "id": "action.save_invoice",
      "label": "Save / Checkout Invoice",
      "category": "Sales & Billing",
      "routeContext": "/billing",
      "requiredRole": ["create_bills"],
      "actionType": "execute_function",
      "payload": "TRIGGER_CHECKOUT"
    },
    {
      "id": "action.generate_po",
      "label": "Generate Purchase Orders",
      "category": "Purchases & Inventory",
      "routeContext": "/dashboard/reports/reorder",
      "requiredRole": ["create_purchases"],
      "actionType": "execute_function",
      "payload": "TRIGGER_PO_GENERATE"
    },
    {
      "id": "action.toggle_theme",
      "label": "Toggle Dark Mode",
      "category": "Settings",
      "routeContext": "*",
      "actionType": "execute_function",
      "payload": "TOGGLE_THEME"
    },
    {
      "id": "action.focus_search",
      "label": "Focus Global Search",
      "category": "Navigation",
      "routeContext": "*",
      "actionType": "focus_field",
      "payload": "[data-global-search]"
    }
];

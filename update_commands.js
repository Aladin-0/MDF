const fs = require('fs');
const fileContent = fs.readFileSync('apps/frontend/config/commands.ts', 'utf8');

// Quick and dirty extraction of the array
const arrayStart = fileContent.indexOf('[');
const arrayEnd = fileContent.lastIndexOf(']');
const arrayStr = fileContent.substring(arrayStart, arrayEnd + 1);

let commands = JSON.parse(arrayStr);

const updates = [
  // --- INVENTORY MODULE ---
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

  // --- PURCHASES MODULE ---
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
    "id": "nav.purchases.returns",
    "label": "Purchases: Purchase Returns",
    "category": "Purchases & Inventory",
    "routeContext": "*",
    "requiredRole": ["view_purchases"],
    "actionType": "navigate",
    "payload": "/dashboard/accounts/purchase-returns"
  },

  // --- ACCOUNTS MODULE ---
  {
    "id": "nav.accounts.dashboard",
    "label": "Accounts: Dashboard",
    "category": "Vouchers & Returns",
    "routeContext": "*",
    "requiredRole": ["view_accounts"],
    "actionType": "navigate",
    "payload": "/dashboard/accounts"
  },
  {
    "id": "nav.accounts.new_voucher",
    "label": "Accounts: New Voucher",
    "category": "Vouchers & Returns",
    "routeContext": "*",
    "requiredRole": ["create_accounts"],
    "actionType": "navigate",
    "payload": "/dashboard/accounts/voucher-entry"
  },
  {
    "id": "nav.accounts.all_vouchers",
    "label": "Accounts: All Vouchers",
    "category": "Vouchers & Returns",
    "routeContext": "*",
    "requiredRole": ["view_accounts"],
    "actionType": "navigate",
    "payload": "/dashboard/accounts/vouchers"
  },
  {
    "id": "nav.accounts.ledgers",
    "label": "Accounts: Ledgers",
    "category": "Vouchers & Returns",
    "routeContext": "*",
    "requiredRole": ["view_accounts"],
    "actionType": "navigate",
    "payload": "/dashboard/accounts/ledgers"
  },

  // --- REPORTS MODULE ---
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

  // --- SETTINGS MODULE ---
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
  }
];

// Map old IDs that should be replaced by new IDs
const replacedIds = {
  'nav.inventory': 'nav.inventory.list',
  'nav.purchases': 'nav.purchases.dashboard',
  'nav.accounts.purchase-returns': 'nav.purchases.returns',
  'nav.accounts': 'nav.accounts.dashboard',
  'nav.accounts.voucher-entry': 'nav.accounts.new_voucher',
  'nav.accounts.vouchers': 'nav.accounts.all_vouchers',
  'nav.reports': 'nav.reports.dashboard',
  'nav.settings': 'nav.settings.preferences',
};

// Filter out replaced IDs
commands = commands.filter(cmd => !Object.keys(replacedIds).includes(cmd.id));

// Merge updates
updates.forEach(update => {
  const index = commands.findIndex(cmd => cmd.id === update.id);
  if (index !== -1) {
    commands[index] = update;
  } else {
    commands.push(update);
  }
});

const newFileContent = fileContent.substring(0, arrayStart) + JSON.stringify(commands, null, 2) + fileContent.substring(arrayEnd + 1);

fs.writeFileSync('apps/frontend/config/commands.ts', newFileContent);
console.log('Successfully updated commands schema');

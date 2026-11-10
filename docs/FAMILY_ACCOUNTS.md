# Family accounts (shared mobile number + shared credit)

Real families share one mobile number and one credit account, but each person needs their own medical history.

## Model
- **Any customer can be the account owner.** "Priya and Rohan bill under Rahul": Rahul keeps his own ledger, balance, credit limit and
  credit account, so nothing is stranded when a family is formed. Members point to him with `Customer.account_holder`
  (+ `relationship`, `gender`, `dob`) and keep their own medical profile (allergies, chronic conditions, refill dates).
- **Shared record (optional, advanced)**: a `Customer` with `is_family_account=True` (e.g. "Sharma Family Account") that no single person
  owns. Billing it always requires naming the person.
- **A bill** goes to the account owner (`SaleInvoice.customer`) and names the person it was for (`SaleInvoice.patient`; empty = the
  owner themselves). Every existing piece of money code (ledger, outstanding, credit limit, receipts, returns) still works on a
  single owner. Nothing else was rewired.
- Members have no ledger of their own. No chains: a member cannot own an account, and an owner with members cannot join another.
- Individuals are unchanged: no account, `patient` stays empty. Walk-in cash sales are unchanged.
- Mobile numbers were already allowed to repeat (no unique constraint; only the exact same name + number is blocked).

## Retail only
Family features are for **retail** bills. A **wholesale** bill sells to one party (a person or a business), so the Billing For field, the "Family" hint in the customer search, **Counter Bill** and **Non-Valued Customer** (and their Alt+C / Alt+J shortcuts) are hidden in wholesale. The server enforces it too: a wholesale bill is posted to the account owner as a single party and never records a family patient, even if one is sent. Switching a bill from retail to wholesale clears the person picked.

## Rules (enforced by the server, `apps/accounts/family_accounts.py`)
- Billing a purely shared record **requires a patient** from its members (HTTP 400, `code: FAMILY_ACCOUNT`). Billing an owner directly
  needs no patient (it is for them).
- Picking a member directly bills the account and records them as the patient.
- The patient must belong to the account billed.
- A person who already has a balance / credit history of their own **cannot join** an account (it would be stranded on a ledger
  that no longer receives their bills). Settle it first.
- No chains: an account cannot be a member; a member cannot be an account; one account per person.
- Leaving an account gives the person their own ledger again.
- Editing a bill keeps its patient unless a new `patientId` is sent. Changing the patient needs `can_correct_customer`.
- A person's purchase history = bills made for them (patient) + their own bills with no patient. The account's history = everything.

## API
| Endpoint | Purpose |
|---|---|
| `GET /customers/search/?q=` | Lists **people** (never a purely shared record), matched by name/mobile or by the account's name/mobile. Each row has `relationship, gender, age, accountId, accountName, ledgerId`, and the **account's** `outstanding` / `creditLimit`. `&accountOwners=1` instead lists who a person could bill under: any customer who is not already a member (`memberCount`, `outstanding`); `&excludeId=` leaves one out. |
| `GET /customers/<id>/members/` | Everyone a bill on this customer's account can be for: the owner first (`isAccountHolder`), then members. |
| `POST /customers/<id>/account/` | `{accountHolderId, relationship, gender}` puts a person on an account; `{accountHolderId: null}` takes them off. |
| `POST /customers/` | Accepts `isFamilyAccount`, `accountHolderId`, `relationship`, `gender`. A member gets no ledger of their own. |
| `GET /ledgers/` (Sundry Debtors) | Adds `isFamilyAccount` and `familyMembers[]` so the billing picker can list one row per person. |
| Sale create / edit | Accept `patientId`; responses carry `patientId` and `patientMemberName`. |

## Screens
- **Billing header, four ways to put a customer on a bill**:
  1. *Search by mobile or name* in the customer box (a family is also found by any member's name or mobile and that person is preselected).
     No match -> a prompt **Add New Customer** opens the popup (First/Last name, Mobile (pre-filled from what was typed), Email, Address,
     City, Pincode, Default Discount %). A customer with a mobile number unlocks history, WhatsApp invoices and reminders.
  2. **Non-Valued Customer** (⋮ menu or **Alt+J**): name only, no mobile, no profile. The name is kept on the bill (`SaleInvoice.walk_in_name`,
     API key `walkInName`) and printed; it cannot be used for credit.
  3. **Counter Bill** (button, ⋮ menu or **Alt+C**): clears customer, person and name: a generic cash sale.
  4. A customer already on the bill can have family added, below.
- **Billing for** (directly under the customer; indigo-bordered so it is hard to miss): defaults to **Self**. The dropdown lists the owner
  (relation "Self") then each family member with mobile, age and relation on the right, and **+ Add New Family Member** at the bottom.
  Also shows the family size and the shared **Due** / **Limit**. A purely shared record has no "Self": it turns amber and the cashier must choose.
- **Add New Family Member popup**: relation as radio buttons (Brother, Sister, Father, Mother, Son, Daughter, Husband, Wife, Grandfather,
  Grandmother, Other; gender follows from it), First Name, Last Name, **Mobile (optional)**: blank = the person shares the primary's number
  (the server fills it in), Date of birth (optional). A second tab links an existing customer.
- **Add / Edit customer** (centred, responsive popup): "Credit account & family" with three plain choices: *Own account*,
  *Under another customer's account* (searches **all** customers; says "Pradip will bill under Prasad's account"), *Shared family account*.
  Browser autofill is off on the search boxes.
- **Customer page -> Family card**: *Add family member*, *Bill under another customer*, remove a person, and who shares the account.
- **Customers list / grid / page header**: `Family · 3 people` on owners, `Wife · Rahul` on members. A member's page shows the
  account's balance and limit, and "Collect on <owner>" opens the owner's page.
- **Sales list and printed invoice**: show the person the bill was made for.

## Deployment
This round adds `accounts 0030` (customer email) and `billing 0030` (bill walk-in name): additive, nothing is backfilled.
**The running dev stack only migrates when the backend container starts.** After pulling these changes run
`docker exec mediflow_backend python manage.py migrate` (or restart the backend) or every customer / ledger / sale query fails
with "column does not exist". Production's start command already runs `migrate --noinput`.

Additive migrations only: `accounts 0029_family_accounts`, `billing 0029_saleinvoice_patient` (plus the earlier `accounts 0028`, `billing 0028`).
Existing customers and bills are untouched.

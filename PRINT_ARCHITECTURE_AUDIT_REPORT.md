# PRINT ARCHITECTURE AUDIT REPORT

## 1. Directory Mapping & Folder Hierarchy

In modern Next.js applications using the App Router, the framework strictly enforces a division between routing mechanics and user interface presentation. This is why the `print` domain exists in two parallel locations:

### The UI Component Directory
**Path:** `apps/frontend/components/print/`
* **Hierarchy:** This directory houses the actual reusable JSX templates, such as `ManavataA4Invoice.tsx`. 
* **Testing:** The `__tests__` folder is co-located as a sibling here. It contains unit tests like `ManavataA4Invoice.test.tsx` that assert the component's isolated behavior (e.g., checking if the "Qty" column hides when `isVisible` is false).

### The Route Handler Directory
**Path:** `apps/frontend/app/print/invoice/` (or equivalent dynamic routes like `app/billing/[id]/`)
* **Hierarchy:** This directory defines the actual web URLs. It contains Next.js specific routing conventions such as `page.tsx` (the route entry point), `layout.tsx` (the structural shell), and optionally shared assets like `globals.css` if utilizing isolated routing zones.

---

## 2. Next.js Architectural Paradigm: Route vs. UI

### The Route Directory (`app/...`)
The primary responsibility of the `app/` routing directory is **orchestration and data fetching**. 
A `page.tsx` file inside `app/print/invoice/[id]/` handles:
1. Extracting the `[id]` parameter from the URL.
2. Interfacing with backend APIs or databases to fetch the invoice payload.
3. Loading any required contextual data (e.g., Outlet Settings or Print Configurations).
4. Passing this data down as props to the UI layer.

### The UI Directory (`components/...`)
The primary responsibility of the `components/` directory is **dumb presentation**. 
Files like `ManavataA4Invoice.tsx` do not care *how* the data was fetched or *what* the URL is. They are pure React functions that receive an `invoice` object and a `config` object as props, and execute the logic to map that data into a dynamic HTML `<table>`. 

### The Connection (Data Flow)
1. The user navigates to `/print/invoice/123`.
2. `app/print/invoice/[id]/page.tsx` executes, parses `123`, and fetches the data.
3. The `page.tsx` returns `<ManavataA4Invoice invoice={data} config={settings} />`.
4. The component renders the exact invoice layout and ships the HTML to the browser.

---

## 3. Technical Assessment & Verdict

### Architectural Verdict: Healthy and Correct
This dual-folder separation is **not technical debt**; it is the exact intended architecture for a modern Next.js App Router application.

Mixing complex data-fetching logic and routing parameters directly inside heavily styled JSX components violates the Single Responsibility Principle. By separating the "smart" data-fetching routes (`app/`) from the "dumb" presentation templates (`components/`), the codebase remains highly modular. For example, `ManavataA4Invoice.tsx` can be effortlessly reused inside a `Dialog` modal on the dashboard, because it is not hardcoded to a specific URL page.

### The Testing Philosophy
Keeping the `__tests__` directory co-located in `components/print/` is an industry best practice.
* UI components are pure functions (props in, DOM out). This makes them incredibly easy to test in isolation using tools like React Testing Library and Jest.
* Conversely, `page.tsx` files in the `app/` directory are tightly coupled to Next.js server contexts, routing hooks, and asynchronous data fetching. Writing unit tests for `page.tsx` is notoriously difficult and brittle.
* Therefore, the healthiest paradigm is exactly what is currently implemented: test the UI logic purely in `components/`, and rely on Cypress or Playwright for E2E testing of the `app/` routes.

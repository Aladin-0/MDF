with open("apps/frontend/types/index.ts", "r") as f:
    content = f.read()

content = content.replace("""    pkg: number;
    packUnitLabel?: string;
    qty: number;
    freeQty: number;""", """    pkg: number;
    packUnitLabel?: string;
    qty: number;
    freeQty: number;
    qtyMeasured?: number;
    measuredUnit?: string;
    behaviorClass?: string;""")

content = content.replace("""    expiryDate: string;             // yyyy-MM-dd
    pkg: number;                    // Pack size (e.g. 10 tabs/strip)
    qty: number;
    actualQty: number;
    freeQty: number;""", """    expiryDate: string;             // yyyy-MM-dd
    pkg: number;                    // Pack size (e.g. 10 tabs/strip)
    qty: number;
    actualQty: number;
    freeQty: number;
    qtyMeasured?: number;
    measuredUnit?: string;
    behaviorClass?: string;""")

content = content.replace("""    expiryDate: string;
    pkg: number;
    qty: number;
    actualQty: number;              // pkg × qty — pre-computed on client
    freeQty: number;""", """    expiryDate: string;
    pkg: number;
    qty: number;
    actualQty: number;              // pkg × qty — pre-computed on client
    freeQty: number;
    qtyMeasured?: number;
    measuredUnit?: string;""")

with open("apps/frontend/types/index.ts", "w") as f:
    f.write(content)


import sys

def fix_views():
    with open('apps/billing/views.py', 'r') as f:
        content = f.read()

    # 1. SaleDetailView.put
    target1 = """                orchestrator.record_activity(
                    module="billing",
                    entity=invoice,
                    action=action,
                    description=f"Updated sale invoice {invoice.invoice_no}",
                    metadata={"reason_code": reason_code, "reason_text": reason_text, "revision_id": rev_id_str}
                )"""
    rep1 = """                orchestrator.record_activity(
                    module="billing",
                    entity=invoice,
                    action=action,
                    reason_code=reason_code,
                    reason_text=reason_text,
                    metadata={"revision_id": rev_id_str}
                )"""
    
    if target1 in content:
        content = content.replace(target1, rep1)
        print("Fixed 1")
    else:
        print("FAIL 1")

    # 2. SaleReviseView.post (cancel and reissue)
    target2 = """                    orchestrator.record_activity(
                        module="billing",
                        entity=invoice,
                        action=action,
                        description=f"Cancelled and reissued sale invoice {invoice.invoice_no}",
                        metadata={"reason_code": reason_code, "reason_text": reason_text, "resulting_invoice_id": str(updated_invoice.id), "revision_id": rev_id_str}
                    )"""
    rep2 = """                    orchestrator.record_activity(
                        module="billing",
                        entity=invoice,
                        action=action,
                        reason_code=reason_code,
                        reason_text=reason_text,
                        metadata={"resulting_invoice_id": str(updated_invoice.id), "revision_id": rev_id_str}
                    )"""

    if target2 in content:
        content = content.replace(target2, rep2)
        print("Fixed 2")
    else:
        print("FAIL 2")

    # 3. SaleReviseView.post (update)
    target3 = """                    orchestrator.record_activity(
                        module="billing",
                        entity=updated_invoice,
                        action=action,
                        description=f"Revised sale invoice {updated_invoice.invoice_no} via {action}",
                        metadata={"reason_code": reason_code, "reason_text": reason_text, "revision_id": rev_id_str}
                    )"""
    rep3 = """                    orchestrator.record_activity(
                        module="billing",
                        entity=updated_invoice,
                        action=action,
                        reason_code=reason_code,
                        reason_text=reason_text,
                        metadata={"revision_id": rev_id_str}
                    )"""

    if target3 in content:
        content = content.replace(target3, rep3)
        print("Fixed 3")
    else:
        print("FAIL 3")

    with open('apps/billing/views.py', 'w') as f:
        f.write(content)

fix_views()

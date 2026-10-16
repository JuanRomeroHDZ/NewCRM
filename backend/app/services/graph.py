import json
from collections import defaultdict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import EmailAccount, PlatformAccount, PaymentMethod, Prospect

async def generate_relational_graph(db: AsyncSession) -> dict:
    """Generates the interactive graph model with cycle detection and SPOF detection."""
    # 1. Fetch active emails
    stmt_emails = select(EmailAccount).where(EmailAccount.is_deleted == False)
    res_emails = await db.execute(stmt_emails)
    emails = res_emails.scalars().all()
    
    # 2. Fetch active platforms
    stmt_platforms = select(PlatformAccount).where(PlatformAccount.is_deleted == False)
    res_platforms = await db.execute(stmt_platforms)
    platforms = res_platforms.scalars().all()

    # 3. Fetch active payments
    stmt_payments = select(PaymentMethod).where(PaymentMethod.is_deleted == False)
    res_payments = await db.execute(stmt_payments)
    payments = res_payments.scalars().all()

    # 4. Fetch active prospects
    stmt_prospects = select(Prospect).where(Prospect.is_deleted == False)
    res_prospects = await db.execute(stmt_prospects)
    prospects = res_prospects.scalars().all()

    nodes = []
    links = []
    email_map = {e.id: e for e in emails}
    platform_counts = defaultdict(int)
    for p in platforms:
        platform_counts[p.email_id] += 1

    # Detect recovery recovery incoming edges
    recovery_incoming = defaultdict(list)
    recovery_adj = defaultdict(list)
    for e in emails:
        if e.recovery_email_id and e.recovery_email_id in email_map:
            recovery_adj[e.id].append(e.recovery_email_id)
            recovery_incoming[e.recovery_email_id].append(e.id)

    # Cycle Detection in Recovery Chains using DFS
    cycles_detected: list[list[str]] = []
    visited = set()
    rec_stack = []

    def dfs_find_cycles(node: str):
        visited.add(node)
        rec_stack.append(node)
        for neighbor in recovery_adj.get(node, []):
            if neighbor not in visited:
                dfs_find_cycles(neighbor)
            elif neighbor in rec_stack:
                cycle_start = rec_stack.index(neighbor)
                cycle_path = rec_stack[cycle_start:] + [neighbor]
                cycles_detected.append(cycle_path)
        rec_stack.pop()

    for e in emails:
        if e.id not in visited:
            dfs_find_cycles(e.id)

    cycle_nodes_set = {n for cycle in cycles_detected for n in cycle}

    # Identify Single Points of Failure (SPOF)
    # An email is critical if:
    # - It has 4+ platforms attached OR
    # - It serves as recovery email for another email OR
    # - It's part of a mutual cycle
    critical_nodes = []
    for e in emails:
        child_count = platform_counts[e.id]
        recovered_others = len(recovery_incoming[e.id])
        is_spof = child_count >= 4 or recovered_others > 0 or e.id in cycle_nodes_set
        if is_spof:
            critical_nodes.append(e.id)

        nodes.append({
            "id": f"email_{e.id}",
            "entity_id": e.id,
            "label": e.address,
            "type": "email",
            "sub_type": e.provider,
            "icon": e.icon or e.provider.lower(),
            "status": "secure" if e.two_factor_method != "none" else "vulnerable",
            "is_critical_failure_point": is_spof,
            "metrics": {
                "platforms_count": child_count,
                "recovers_accounts_count": recovered_others,
                "two_factor_method": e.two_factor_method,
                "has_recovery": bool(e.recovery_email_id),
                "is_cycle": e.id in cycle_nodes_set
            }
        })

    # Add Platform nodes
    for p in platforms:
        tags_list = []
        if p.tags:
            try:
                tags_list = json.loads(p.tags)
            except Exception:
                pass

        nodes.append({
            "id": f"platform_{p.id}",
            "entity_id": p.id,
            "label": p.name,
            "type": "platform",
            "sub_type": p.access_type,
            "icon": p.icon_url,
            "status": p.subscription_status,
            "is_critical_failure_point": False,
            "metrics": {
                "access_type": p.access_type,
                "cost": p.subscription_cost,
                "currency": p.currency,
                "billing_cycle": p.billing_cycle,
                "username": p.username,
                "tags": tags_list
            }
        })

        # Link from Email to Platform (Solid child link)
        if p.email_id in email_map:
            links.append({
                "source": f"email_{p.email_id}",
                "target": f"platform_{p.id}",
                "type": "child",
                "label": "owns" if p.access_type == "own_password" else "SSO"
            })

    # Add Recovery Links between emails (Dotted recovery links)
    for e in emails:
        if e.recovery_email_id and e.recovery_email_id in email_map:
            is_in_cycle = e.id in cycle_nodes_set and e.recovery_email_id in cycle_nodes_set
            links.append({
                "source": f"email_{e.id}",
                "target": f"email_{e.recovery_email_id}",
                "type": "recovery",
                "is_cycle": is_in_cycle,
                "label": "recuperado por"
            })

    # Add Payment method nodes and links
    for pay in payments:
        nodes.append({
            "id": f"payment_{pay.id}",
            "entity_id": pay.id,
            "label": f"{pay.issuer} (*{pay.last_four})",
            "type": "payment",
            "sub_type": pay.issuer,
            "icon": pay.issuer.lower(),
            "status": "active",
            "is_critical_failure_point": False,
            "metrics": {
                "issuer": pay.issuer,
                "alias": pay.alias,
                "last_four": pay.last_four
            }
        })

    # Link platforms to payments
    for p in platforms:
        if p.payment_method_id:
            links.append({
                "source": f"payment_{p.payment_method_id}",
                "target": f"platform_{p.id}",
                "type": "payment",
                "label": "paga"
            })

    # Add Prospect / Demo nodes and links to parent Email
    for pr in prospects:
        nodes.append({
            "id": f"prospect_{pr.id}",
            "entity_id": pr.id,
            "label": pr.company_name,
            "type": "prospect",
            "sub_type": pr.workflow_type,
            "icon": pr.demo_url,
            "status": pr.status,
            "is_critical_failure_point": False,
            "metrics": {
                "workflow_type": pr.workflow_type,
                "status": pr.status,
                "demo_url": pr.demo_url,
                "whatsapp": pr.whatsapp,
                "sla_hours": pr.sla_hours
            }
        })
        if pr.email_id and pr.email_id in email_map:
            links.append({
                "source": f"email_{pr.email_id}",
                "target": f"prospect_{pr.id}",
                "type": "prospect",
                "label": "prospecto / demo"
            })

    return {
        "nodes": nodes,
        "links": links,
        "cycles_detected": cycles_detected,
        "critical_nodes": [f"email_{cid}" for cid in critical_nodes]
    }

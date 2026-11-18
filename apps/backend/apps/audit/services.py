import logging

from apps.audit import recorder, vocabulary as vocab

logger = logging.getLogger(__name__)


def log_activity(
    *,
    action,
    module,
    entity_type=None,
    entity_id=None,
    entity_label="",
    description="",
    changes=None,
    metadata=None,
    user=None,
    request=None,
    outlet=None,
    status_code=None,
    ip_is_routable=None,
    code=None,
    amount=None,
    reason="",
    ctx=None,
):
    """
    The original audit call (about 15 call sites), now a thin wrapper over `recorder.safe_record`: it writes the event SYNCHRONOUSLY
    (it used to queue a background task that nothing consumed after 9 Oct 2026, so those events were lost) and it never stops the action
    it describes: a failure is logged loudly and counted. New code should call `recorder.record` / `safe_record` with a `code`.
    """
    code = code or vocab.infer_code(module, action, entity_type or '')
    meta = dict(metadata or {})
    if description:
        meta.setdefault('description', description)
    if status_code is not None:
        meta.setdefault('status_code', status_code)
    return recorder.safe_record(
        code, actor=user, outlet=outlet, request=request, module=module, action=action, entity_type=entity_type or '', entity_id=str(entity_id) if entity_id else '',
        entity_label=entity_label or '', changes=changes, amount=amount, reason=reason, metadata=meta, ctx=dict(ctx or {}, detail=description or ''),
        summary='' if code else (description or ''),
    )

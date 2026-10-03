from decimal import Decimal
from django.core.exceptions import ValidationError
from django.utils import timezone
from apps.billing.models import SaleInvoice

class CreditLimitExceededException(ValidationError):
    pass

class AgingLimitExceededException(ValidationError):
    pass

def validate_statutory_compliance(customer, sale_type):
    """
    Validates drug licenses for wholesale customers.
    """
    if sale_type != 'WHOLESALE':
        return True
        
    if not customer:
        raise ValidationError("Sale Blocked: Customer is required for wholesale billing.")
        
    if not customer.dl_no_20b and not customer.dl_no_21b:
        raise ValidationError(f"Sale Blocked: Drug License (20B or 21B) is required for {customer.name}.")
        
    if not customer.dl_expiry:
        raise ValidationError(f"Sale Blocked: Drug License expiry date is missing for {customer.name}.")
        
    if customer.dl_expiry < timezone.now().date():
        raise ValidationError(f"Sale Blocked: Drug License for {customer.name} expired on {customer.dl_expiry}.")
        
    return True

def validate_credit_exposure(customer, new_invoice_amount, payment_mode):
    """
    Validates if the new invoice will exceed the customer's credit limit.
    """
    if payment_mode == 'cash' or payment_mode == 'upi' or payment_mode == 'card':
        # If it's a fully paid non-credit mode, bypass unless they have a hard block
        # Wait, the prompt says "If payment_mode == 'CASH' or customer.is_credit_blocked == True"
        if getattr(customer, 'is_credit_blocked', False):
            raise ValidationError(f"Sale Blocked: Customer {customer.name} is manually blocked from credit sales.")
        
        # But if they are just paying cash, maybe they don't increase exposure? 
        # Actually the logic says: "If payment_mode == 'CASH' or customer.is_credit_blocked == True, handle accordingly."
        pass
    
    if getattr(customer, 'is_credit_blocked', False):
        raise ValidationError(f"Sale Blocked: Customer {customer.name} is manually blocked.")
        
    if payment_mode != 'credit' and payment_mode != 'split':
        return True
        
    if not customer:
        return True
        
    limit = getattr(customer, 'credit_limit', Decimal('0'))
    if limit <= 0:
        # If limit is 0, maybe no limit is enforced, or 0 means blocked? Usually 0 means no credit allowed or unlimited.
        # Let's assume limit > 0 to block. The prompt says "(and credit_limit > 0)".
        return True
        
    current_exposure = customer.outstanding_balance + Decimal(str(new_invoice_amount))
    if current_exposure > limit:
        raise CreditLimitExceededException(
            f"Sale Blocked: Credit limit exceeded for {customer.name}. "
            f"Limit: {limit}, Current Outstanding: {customer.outstanding_balance}, "
            f"New Invoice: {new_invoice_amount}, Exposure: {current_exposure}"
        )
        
    return True

def validate_invoice_aging(customer):
    """
    Blocks sales if any unpaid credit invoice exceeds the allowed credit days + 15 day grace period.
    """
    if not customer:
        return True
        
    credit_days = getattr(customer, 'credit_days', 0)
    grace_period = 15
    max_days_allowed = credit_days + grace_period
    
    # Find oldest unpaid credit invoice
    oldest_unpaid = SaleInvoice.objects.filter(
        customer=customer,
        payment_mode__in=['credit', 'split'],
        amount_due__gt=0,
        is_cancelled=False
    ).order_by('invoice_date').first()
    
    if oldest_unpaid:
        days_overdue = (timezone.now().date() - oldest_unpaid.invoice_date.date()).days
        if days_overdue > max_days_allowed:
            raise AgingLimitExceededException(
                f"Sale Blocked: Unpaid invoice {oldest_unpaid.invoice_no} is {days_overdue} days overdue "
                f"(Allowed: {credit_days} days + {grace_period} grace)."
            )
            
    return True

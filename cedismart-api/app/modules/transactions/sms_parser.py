import re
from typing import TypedDict, Literal

class ParsedSMS(TypedDict):
    amount: float
    fee: float
    transaction_type: Literal["income", "expense"]
    description: str
    reference_id: str
    new_balance: float

def _to_float(val: str) -> float:
    """Safely convert regex matched digit strings with commas and trailing dots to float."""
    return float(val.strip().replace(",", "").rstrip("."))

def parse_sms(sender: str, body: str) -> ParsedSMS | None:
    """Parse MTN MoMo, Telecel Cash, or Vodafone Cash SMS alerts to extract transaction details."""
    # Normalize body whitespace
    body_clean = " ".join(body.split())
    sender_lower = sender.lower()

    # -------------------------------------------------------------------------
    # Format 1: Telecel / Vodafone / MoMo "Payment made for GHS <amount> to <recipient>"
    # E.g. "Payment made for GHS 20.00 to BENYGLAD VENTURES 1. Current Balance: GHS 27.86. Available Balance: GHS 27.86. Reference: . Transaction ID: 34336043447. E-Levy: GHS 0.00."
    # -------------------------------------------------------------------------
    rx_payment_made = re.search(
        r"payment\s+made\s+for\s+GHS\s*([\d\.,]+)\s+to\s+([^.]+?)(?:\.|\s+Current|\s+Available|\s+Reference).*?(?:current\s+balance|balance):\s*GHS\s*([\d\.,]+).*?(?:transaction\s+id|id):\s*(\w+)",
        body_clean,
        re.IGNORECASE,
    )
    if rx_payment_made:
        amt = _to_float(rx_payment_made.group(1))
        desc = rx_payment_made.group(2).strip()
        bal = _to_float(rx_payment_made.group(3))
        ref = rx_payment_made.group(4).strip()
        fee = 0.0
        elevy_match = re.search(r"(?:e-levy|fee):\s*GHS\s*([\d\.,]+)", body_clean, re.IGNORECASE)
        if elevy_match:
            fee = _to_float(elevy_match.group(1))
        return {
            "amount": amt,
            "fee": fee,
            "transaction_type": "expense",
            "description": f"Payment to {desc}",
            "reference_id": ref,
            "new_balance": bal,
        }

    # -------------------------------------------------------------------------
    # Format 2: Telecel / Vodafone / MoMo "Payment received for GHS <amount> from <sender>"
    # E.g. "Payment received for GHS 150.00 from KWAME MENSAH. Current Balance: GHS 1,240.50. Financial Transaction ID: 29481920192."
    # -------------------------------------------------------------------------
    rx_payment_rcvd = re.search(
        r"payment\s+received\s+for\s+GHS\s*([\d\.,]+)\s+from\s+([^.]+?)(?:\.|\s+Current|\s+Available|\s+Reference).*?(?:current\s+balance|balance):\s*GHS\s*([\d\.,]+).*?(?:transaction\s+id|financial\s+transaction\s+id|id):\s*(\w+)",
        body_clean,
        re.IGNORECASE,
    )
    if rx_payment_rcvd:
        amt = _to_float(rx_payment_rcvd.group(1))
        desc = rx_payment_rcvd.group(2).strip()
        bal = _to_float(rx_payment_rcvd.group(3))
        ref = rx_payment_rcvd.group(4).strip()
        return {
            "amount": amt,
            "fee": 0.0,
            "transaction_type": "income",
            "description": f"Payment received from {desc}",
            "reference_id": ref,
            "new_balance": bal,
        }

    # -------------------------------------------------------------------------
    # Format 3: Cash Out / Agent Withdrawal
    # E.g. "Cash Out made for GHS 50.00 at Agent 123... Current Balance: GHS 100.00. Transaction ID: 9918231."
    # -------------------------------------------------------------------------
    rx_cash_out = re.search(
        r"cash\s*out\s*(?:made\s+for)?\s*GHS\s*([\d\.,]+)\s+(?:at|to|from)\s+([^.]+?)(?:\.|\s+Current|\s+Available|\s+Reference).*?(?:current\s+balance|balance):\s*GHS\s*([\d\.,]+).*?(?:transaction\s+id|financial\s+transaction\s+id|id):\s*(\w+)",
        body_clean,
        re.IGNORECASE,
    )
    if rx_cash_out:
        amt = _to_float(rx_cash_out.group(1))
        desc = rx_cash_out.group(2).strip()
        bal = _to_float(rx_cash_out.group(3))
        ref = rx_cash_out.group(4).strip()
        return {
            "amount": amt,
            "fee": 0.0,
            "transaction_type": "expense",
            "description": f"Cash out at {desc}",
            "reference_id": ref,
            "new_balance": bal,
        }

    # -------------------------------------------------------------------------
    # MTN MoMo Standard Senders & Generic Patterns
    # -------------------------------------------------------------------------
    # Case A: Cash In / Received
    # E.g. "You have received GHS 50.00 from Kojo Mensah (0241234567). Your new balance is GHS 124.50. Transaction ID: 194827189."
    rx_received = re.search(
        r"received\s+GHS\s*([\d\.,]+)\s+from\s+(.*?)\s*\((.*?)\).*?new\s+balance\s+is\s+GHS\s*([\d\.,]+).*?ID:\s*(\d+)",
        body_clean, re.IGNORECASE
    )
    if rx_received:
        return {
            "amount": _to_float(rx_received.group(1)),
            "fee": 0.0,
            "transaction_type": "income",
            "description": f"MoMo received from {rx_received.group(2).strip()}",
            "reference_id": rx_received.group(5).strip(),
            "new_balance": _to_float(rx_received.group(4))
        }

    # Case B: Transfer Out / Sent / Payment
    # E.g. "You have transferred GHS 20.00 to Kofi Owusu (0244112233). Fee charged: GHS 0.20. Your new balance is GHS 80.00. Transaction ID: 194827190."
    rx_sent = re.search(
        r"transferred\s+GHS\s*([\d\.,]+)\s+to\s+(.*?)\s*\((.*?)\).*?Fee\s*(?:charged)?:\s*GHS\s*([\d\.,]+).*?new\s+balance\s+is\s+GHS\s*([\d\.,]+).*?ID:\s*(\d+)",
        body_clean, re.IGNORECASE
    )
    if rx_sent:
        return {
            "amount": _to_float(rx_sent.group(1)),
            "fee": _to_float(rx_sent.group(4)),
            "transaction_type": "expense",
            "description": f"MoMo transfer to {rx_sent.group(2).strip()}",
            "reference_id": rx_sent.group(6).strip(),
            "new_balance": _to_float(rx_sent.group(5))
        }

    # Case C: General Cash Out / Payment
    # E.g. "Payment of GHS 15.00 made to ECG. Transaction Fee: GHS 0.15. Your new balance is GHS 65.00. Transaction ID: 194827191."
    rx_payment = re.search(
        r"payment\s+of\s+GHS\s*([\d\.,]+)\s+made\s+to\s+(.*?)\..*?Fee:\s*GHS\s*([\d\.,]+).*?new\s+balance\s+is\s+GHS\s*([\d\.,]+).*?ID:\s*(\d+)",
        body_clean, re.IGNORECASE
    )
    if rx_payment:
        return {
            "amount": _to_float(rx_payment.group(1)),
            "fee": _to_float(rx_payment.group(3)),
            "transaction_type": "expense",
            "description": f"Payment to {rx_payment.group(2).strip()}",
            "reference_id": rx_payment.group(5).strip(),
            "new_balance": _to_float(rx_payment.group(4))
        }

    # -------------------------------------------------------------------------
    # Telecel / Vodafone Cash Senders
    # -------------------------------------------------------------------------
    # Case A: Cash In / Received
    # E.g. "You have received GHS 100.00 from 0201234567. Current balance: GHS 150.00. Transaction ID: 123456"
    rx_tc_received = re.search(
        r"received\s+GHS\s*([\d\.,]+)\s+from\s+(\d+|[^.]+?).*?balance:\s*GHS\s*([\d\.,]+).*?ID:\s*(\d+)",
        body_clean, re.IGNORECASE
    )
    if rx_tc_received:
        return {
            "amount": _to_float(rx_tc_received.group(1)),
            "fee": 0.0,
            "transaction_type": "income",
            "description": f"Telecel received from {rx_tc_received.group(2).strip()}",
            "reference_id": rx_tc_received.group(4).strip(),
            "new_balance": _to_float(rx_tc_received.group(3))
        }

    # Case B: Sent / Transferred
    # E.g. "You have transferred GHS 30.00 to 0207654321. Fee: GHS 0.30. Current balance: GHS 120.00. Transaction ID: 123457"
    rx_tc_sent = re.search(
        r"transferred\s+GHS\s*([\d\.,]+)\s+to\s+(\d+|[^.]+?).*?(?:Fee:\s*GHS\s*([\d\.,]+).*?)?balance:\s*GHS\s*([\d\.,]+).*?ID:\s*(\d+)",
        body_clean, re.IGNORECASE
    )
    if rx_tc_sent:
        fee_val = _to_float(rx_tc_sent.group(3)) if rx_tc_sent.group(3) else 0.0
        return {
            "amount": _to_float(rx_tc_sent.group(1)),
            "fee": fee_val,
            "transaction_type": "expense",
            "description": f"Telecel sent to {rx_tc_sent.group(2).strip()}",
            "reference_id": rx_tc_sent.group(5).strip(),
            "new_balance": _to_float(rx_tc_sent.group(4))
        }

    return None

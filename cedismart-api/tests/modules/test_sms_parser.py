from app.modules.transactions.sms_parser import parse_sms

def test_parse_mtn_momo_received() -> None:
    body = (
        "You have received GHS 50.00 from Kojo Mensah (0241234567). "
        "Your new balance is GHS 124.50. Transaction ID: 194827189."
    )
    res = parse_sms("MobileMoney", body)
    assert res is not None
    assert res["amount"] == 50.00
    assert res["fee"] == 0.00
    assert res["transaction_type"] == "income"
    assert "Kojo Mensah" in res["description"]
    assert res["reference_id"] == "194827189"
    assert res["new_balance"] == 124.50

def test_parse_mtn_momo_sent() -> None:
    body = (
        "You have transferred GHS 20.00 to Kofi Owusu (0244112233). "
        "Fee charged: GHS 0.20. Your new balance is GHS 80.00. "
        "Transaction ID: 194827190."
    )
    res = parse_sms("MTNMoMo", body)
    assert res is not None
    assert res["amount"] == 20.00
    assert res["fee"] == 0.20
    assert res["transaction_type"] == "expense"
    assert "Kofi Owusu" in res["description"]
    assert res["reference_id"] == "194827190"
    assert res["new_balance"] == 80.00

def test_parse_mtn_momo_payment() -> None:
    body = (
        "Payment of GHS 15.00 made to ECG. "
        "Transaction Fee: GHS 0.15. Your new balance is GHS 65.00. "
        "Transaction ID: 194827191."
    )
    res = parse_sms("MobileMoney", body)
    assert res is not None
    assert res["amount"] == 15.00
    assert res["fee"] == 0.15
    assert res["transaction_type"] == "expense"
    assert "ECG" in res["description"]
    assert res["reference_id"] == "194827191"
    assert res["new_balance"] == 65.00

def test_parse_telecel_received() -> None:
    body = (
        "You have received GHS 100.00 from 0201234567. "
        "Current balance: GHS 150.00. Transaction ID: 123456"
    )
    res = parse_sms("TelecelCash", body)
    assert res is not None
    assert res["amount"] == 100.0
    assert res["fee"] == 0.0
    assert res["transaction_type"] == "income"
    assert "0201234567" in res["description"]
    assert res["reference_id"] == "123456"
    assert res["new_balance"] == 150.0

def test_parse_telecel_sent() -> None:
    body = (
        "You have transferred GHS 30.00 to 0207654321. "
        "Fee: GHS 0.30. Current balance: GHS 120.00. "
        "Transaction ID: 123457"
    )
    res = parse_sms("VodaCash", body)
    assert res is not None
    assert res["amount"] == 30.0
    assert res["fee"] == 0.30
    assert res["transaction_type"] == "expense"
    assert "0207654321" in res["description"]
    assert res["reference_id"] == "123457"
    assert res["new_balance"] == 120.0

def test_parse_invalid_format() -> None:
    res = parse_sms("MobileMoney", "Hello World. This is a random text message.")
    assert res is None

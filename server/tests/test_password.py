from security import hash_password, password_matches


def test_bcrypt_roundtrip():
    hashed = hash_password("secret-pass")
    assert hashed.startswith("$2")
    assert password_matches(hashed, "secret-pass")
    assert not password_matches(hashed, "wrong")


def test_plaintext_rejected():
    assert not password_matches("plaintext-secret", "plaintext-secret")
    assert not password_matches("", "anything")


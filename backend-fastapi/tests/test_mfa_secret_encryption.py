import pyotp
from sqlmodel import Session

from app.core.mfa_crypto import (
    MFA_SECRET_PREFIX,
    decrypt_mfa_secret,
    encrypt_mfa_secret,
)
from app.core.security import verify_mfa_token
from app.models.user import User


def test_encrypt_mfa_secret_encrypts_plaintext() -> None:
    secret = pyotp.random_base32()

    encrypted = encrypt_mfa_secret(secret)

    assert encrypted is not None
    assert encrypted.startswith(MFA_SECRET_PREFIX)
    assert encrypted != secret


def test_decrypt_mfa_secret_roundtrip() -> None:
    secret = pyotp.random_base32()
    encrypted = encrypt_mfa_secret(secret)

    decrypted = decrypt_mfa_secret(encrypted)

    assert decrypted == secret


def test_decrypt_mfa_secret_supports_legacy_plaintext() -> None:
    legacy_secret = pyotp.random_base32()

    assert decrypt_mfa_secret(legacy_secret) == legacy_secret


def test_verify_mfa_token_with_encrypted_secret() -> None:
    secret = pyotp.random_base32()
    encrypted = encrypt_mfa_secret(secret)
    token = pyotp.TOTP(secret).now()

    assert verify_mfa_token(encrypted or "", token) is True


def test_user_mfa_secret_is_encrypted_on_persist(db_session_fixture: Session) -> None:
    secret = pyotp.random_base32()
    user = User(
        email="mfa.encrypted.persist@example.com",
        full_name="MFA Encrypted Persist",
        hashed_password="hashed",
        mfa_enabled=True,
        mfa_secret=secret,
    )
    db_session_fixture.add(user)
    db_session_fixture.commit()
    db_session_fixture.refresh(user)

    assert user.mfa_secret is not None
    assert user.mfa_secret.startswith(MFA_SECRET_PREFIX)
    assert decrypt_mfa_secret(user.mfa_secret) == secret

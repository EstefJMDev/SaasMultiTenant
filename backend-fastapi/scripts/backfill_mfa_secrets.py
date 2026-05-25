from __future__ import annotations

import argparse

from sqlmodel import Session, select

from app.core.db_session import engine
from app.core.mfa_crypto import MFA_SECRET_PREFIX, decrypt_mfa_secret, encrypt_mfa_secret
from app.models.user import User


def backfill_mfa_secrets(apply_changes: bool = False) -> tuple[int, int, int]:
    scanned = 0
    encrypted = 0
    skipped = 0

    with Session(engine) as session:
        users = session.exec(select(User).where(User.mfa_secret.is_not(None))).all()
        for user in users:
            scanned += 1
            current_secret = user.mfa_secret
            if not current_secret:
                skipped += 1
                continue

            if current_secret.startswith(MFA_SECRET_PREFIX):
                decrypted = decrypt_mfa_secret(current_secret)
                if decrypted is None:
                    skipped += 1
                else:
                    skipped += 1
                continue

            user.mfa_secret = encrypt_mfa_secret(current_secret)
            encrypted += 1
            if apply_changes:
                session.add(user)

        if apply_changes and encrypted > 0:
            session.commit()
        else:
            session.rollback()

    return scanned, encrypted, skipped


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill one-off: encrypt legacy plaintext User.mfa_secret values.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist changes. Without this flag, runs in dry-run mode.",
    )
    args = parser.parse_args()

    scanned, encrypted, skipped = backfill_mfa_secrets(apply_changes=args.apply)
    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"[{mode}] scanned={scanned} encrypted={encrypted} skipped={skipped}")


if __name__ == "__main__":
    main()

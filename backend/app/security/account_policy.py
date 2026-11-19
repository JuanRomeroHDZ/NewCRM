import re


ACCOUNT_PASSWORD_MIN_LENGTH = 15
INITIAL_USERNAME_MIN_LENGTH = 12


def validate_account_password(password: str) -> None:
    if len(password) < ACCOUNT_PASSWORD_MIN_LENGTH:
        raise ValueError("Usa al menos 15 caracteres.")
    if not any(not char.isalnum() and not char.isspace() and char.isprintable() for char in password):
        raise ValueError("Incluye al menos un símbolo, por ejemplo ! o #.")


def validate_initial_username(username: str) -> str:
    username = username.strip().lower()
    if len(username) < INITIAL_USERNAME_MIN_LENGTH or not re.search(r"[._-]", username):
        raise ValueError("Usa al menos 12 caracteres y añade un punto, guion o guion bajo.")
    return username

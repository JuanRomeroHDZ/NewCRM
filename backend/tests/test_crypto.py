import pytest
from app.security.crypto import (
    hash_master_password,
    verify_master_password,
    derive_vault_key,
    encrypt_secret,
    decrypt_secret,
    encrypt_note,
    decrypt_note,
    calculate_entropy
)

def test_master_password_hashing():
    pw = "SuperSecurePassword123!"
    hashed = hash_master_password(pw)
    assert hashed != pw
    assert verify_master_password(hashed, pw) is True
    assert verify_master_password(hashed, "WrongPassword") is False

def test_vault_key_derivation():
    salt = "a" * 64
    key1 = derive_vault_key("MyMasterPassword", salt)
    key2 = derive_vault_key("MyMasterPassword", salt)
    assert len(key1) == 32
    assert key1 == key2

    # Different salt or password yields completely different key
    diff_key = derive_vault_key("OtherPassword", salt)
    assert key1 != diff_key

def test_aes_gcm_encrypt_decrypt_roundtrip():
    salt = "b" * 64
    key = derive_vault_key("SecretVaultKey999!", salt)
    plain = "ghp_1234567890abcdefSecretAPIKey"
    encrypted = encrypt_secret(plain, key=key)
    assert encrypted is not None
    assert encrypted != plain

    decrypted = decrypt_secret(encrypted, key=key)
    assert decrypted == plain

def test_note_encryption_roundtrip():
    salt = "c" * 64
    key = derive_vault_key("NoteKeyPassphrase1", salt)
    note = "Esta es una nota privada con instrucciones de infraestructura."
    enc_note = encrypt_note(note, key=key)
    assert enc_note.startswith("enc:v1:")

    dec_note = decrypt_note(enc_note, key=key)
    assert dec_note == note

def test_calculate_entropy():
    weak = calculate_entropy("123456")
    assert weak["score"] < 40
    assert weak["label"] == "Débil"

    strong = calculate_entropy("V3ry$tr0ng&Complex!P@ssw0rd#2026")
    assert strong["score"] >= 80
    assert strong["label"] == "Muy Fuerte"

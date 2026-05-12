"""Одноразовая утилита: генерирует пару VAPID-ключей. Используется вручную."""
import json
import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def handler(event: dict, context) -> dict:
    """Генерирует новую пару VAPID-ключей и возвращает public/private в base64url"""
    if event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
            "body": "",
        }

    private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    public_key = private_key.public_key()

    private_numbers = private_key.private_numbers()
    private_bytes = private_numbers.private_value.to_bytes(32, "big")
    private_b64 = b64url(private_bytes)

    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    public_b64 = b64url(public_bytes)

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps({
            "VAPID_PUBLIC_KEY": public_b64,
            "VAPID_PRIVATE_KEY": private_b64,
            "instruction": "Скопируйте оба значения в секреты проекта (Ядро → Секреты). После этого все push-подписки нужно пересоздать.",
        }, indent=2),
    }

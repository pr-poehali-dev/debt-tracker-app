import json
import os
import hashlib
import random
import psycopg2
from urllib.parse import urlencode
from datetime import datetime


HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization, Authorization',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
}

ROBOKASSA_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx'


def get_db():
    dsn = os.environ.get('DATABASE_URL')
    if not dsn:
        raise ValueError('DATABASE_URL not configured')
    return psycopg2.connect(dsn)


def md5_sig(*args) -> str:
    return hashlib.md5(':'.join(str(a) for a in args).encode()).hexdigest()


def get_user_from_token(token: str):
    if not token:
        return None
    if token.lower().startswith('bearer '):
        token = token[7:].strip()
    if not token:
        return None
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT u.id, u.email, u.name FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = %s AND s.expires_at > NOW()
        """,
        (token,),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return None
    return {'id': row[0], 'email': row[1], 'name': row[2]}


def handler(event: dict, context) -> dict:
    """Создание платежа Robokassa и история платежей пользователя.
    POST: создаёт платёж и возвращает payment_url.
    GET: возвращает историю платежей пользователя (опц. ?target_type=&target_id=)."""
    method = event.get('httpMethod', 'GET').upper()

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': '', 'isBase64Encoded': False}

    headers = event.get('headers') or {}
    auth = headers.get('X-Authorization') or headers.get('x-authorization') or headers.get('Authorization') or headers.get('authorization') or ''
    user = get_user_from_token(auth)
    if not user:
        return {'statusCode': 401, 'headers': HEADERS, 'body': json.dumps({'error': 'Unauthorized'}), 'isBase64Encoded': False}

    if method == 'GET':
        qs = event.get('queryStringParameters') or {}
        target_type = qs.get('target_type')
        target_id = qs.get('target_id')
        conn = get_db()
        cur = conn.cursor()
        if target_type and target_id:
            cur.execute(
                """
                SELECT id, order_number, amount, status, target_type, target_id, target_month, created_at, paid_at
                FROM orders WHERE user_id = %s AND target_type = %s AND target_id = %s
                ORDER BY created_at DESC LIMIT 100
                """,
                (user['id'], target_type, target_id),
            )
        else:
            cur.execute(
                """
                SELECT id, order_number, amount, status, target_type, target_id, target_month, created_at, paid_at
                FROM orders WHERE user_id = %s
                ORDER BY created_at DESC LIMIT 100
                """,
                (user['id'],),
            )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        items = [{
            'id': r[0],
            'order_number': r[1],
            'amount': float(r[2]),
            'status': r[3],
            'target_type': r[4],
            'target_id': r[5],
            'target_month': r[6],
            'created_at': r[7].isoformat() if r[7] else None,
            'paid_at': r[8].isoformat() if r[8] else None,
        } for r in rows]
        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({'payments': items}), 'isBase64Encoded': False}

    if method != 'POST':
        return {'statusCode': 405, 'headers': HEADERS, 'body': json.dumps({'error': 'Method not allowed'}), 'isBase64Encoded': False}

    merchant_login = os.environ.get('ROBOKASSA_MERCHANT_LOGIN')
    password_1 = os.environ.get('ROBOKASSA_PASSWORD_1')
    if not merchant_login or not password_1:
        return {'statusCode': 503, 'headers': HEADERS, 'body': json.dumps({'error': 'Robokassa not configured. Add ROBOKASSA_MERCHANT_LOGIN and ROBOKASSA_PASSWORD_1 secrets.'}), 'isBase64Encoded': False}

    payload = json.loads(event.get('body', '{}') or '{}')
    amount = float(payload.get('amount', 0))
    description = str(payload.get('description', 'Платёж'))[:100]
    target_type = payload.get('target_type')
    target_id = payload.get('target_id')
    target_month = payload.get('target_month')
    success_url = str(payload.get('success_url', ''))
    fail_url = str(payload.get('fail_url', ''))

    if amount <= 0:
        return {'statusCode': 400, 'headers': HEADERS, 'body': json.dumps({'error': 'Amount must be > 0'}), 'isBase64Encoded': False}
    if target_type and target_type not in ('debt', 'loan', 'rental'):
        return {'statusCode': 400, 'headers': HEADERS, 'body': json.dumps({'error': 'Invalid target_type'}), 'isBase64Encoded': False}

    conn = get_db()
    cur = conn.cursor()

    inv_id = 0
    for _ in range(10):
        candidate = random.randint(100000, 2147483647)
        cur.execute("SELECT 1 FROM orders WHERE robokassa_inv_id = %s", (candidate,))
        if cur.fetchone() is None:
            inv_id = candidate
            break
    if inv_id == 0:
        cur.close()
        conn.close()
        return {'statusCode': 500, 'headers': HEADERS, 'body': json.dumps({'error': 'Failed to allocate invoice id'}), 'isBase64Encoded': False}

    order_number = f"PAY-{datetime.now().strftime('%Y%m%d')}-{inv_id}"

    cur.execute(
        """
        INSERT INTO orders (
            order_number, user_name, user_email, user_phone, amount,
            robokassa_inv_id, status, order_comment,
            user_id, target_type, target_id, target_month
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            order_number,
            user.get('name') or user['email'],
            user['email'],
            '',
            round(amount, 2),
            inv_id,
            'pending',
            description,
            user['id'],
            target_type,
            str(target_id) if target_id is not None else None,
            target_month,
        ),
    )
    order_id = cur.fetchone()[0]

    amount_str = f"{amount:.2f}"
    if success_url or fail_url:
        signature = md5_sig(merchant_login, amount_str, inv_id, success_url, 'GET', fail_url, 'GET', password_1)
    else:
        signature = md5_sig(merchant_login, amount_str, inv_id, password_1)

    params = {
        'MerchantLogin': merchant_login,
        'OutSum': amount_str,
        'InvoiceID': inv_id,
        'SignatureValue': signature,
        'Email': user['email'],
        'Culture': 'ru',
        'Description': description,
    }
    if success_url:
        params['SuccessUrl2'] = success_url
        params['SuccessUrl2Method'] = 'GET'
    if fail_url:
        params['FailUrl2'] = fail_url
        params['FailUrl2Method'] = 'GET'

    payment_url = f"{ROBOKASSA_URL}?{urlencode(params)}"
    cur.execute("UPDATE orders SET payment_url = %s WHERE id = %s", (payment_url, order_id))
    conn.commit()
    cur.close()
    conn.close()

    return {
        'statusCode': 200,
        'headers': HEADERS,
        'body': json.dumps({
            'payment_url': payment_url,
            'order_id': order_id,
            'order_number': order_number,
            'inv_id': inv_id,
        }),
        'isBase64Encoded': False,
    }

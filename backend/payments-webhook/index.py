import json
import os
import hashlib
import psycopg2
from urllib.parse import parse_qs


HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'text/plain',
}


def md5_upper(*args) -> str:
    return hashlib.md5(':'.join(str(a) for a in args).encode()).hexdigest().upper()


def get_db():
    dsn = os.environ.get('DATABASE_URL')
    if not dsn:
        raise ValueError('DATABASE_URL not configured')
    return psycopg2.connect(dsn)


def handler(event: dict, context) -> dict:
    """Webhook от Robokassa: проверяет подпись, помечает заказ оплаченным,
    автоматически отмечает связанный долг/займ/аренду как оплаченные."""
    method = event.get('httpMethod', 'GET').upper()
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': '', 'isBase64Encoded': False}

    params = {}
    body = event.get('body', '') or ''
    if method == 'POST' and body:
        if event.get('isBase64Encoded', False):
            import base64
            body = base64.b64decode(body).decode('utf-8')
        parsed = parse_qs(body)
        params = {k: v[0] for k, v in parsed.items()}
    if not params:
        params = event.get('queryStringParameters') or {}

    out_sum = params.get('OutSum') or params.get('out_summ') or ''
    inv_id = params.get('InvId') or params.get('inv_id') or ''
    sig = (params.get('SignatureValue') or params.get('crc') or '').upper()

    if not out_sum or not inv_id or not sig:
        return {'statusCode': 400, 'headers': HEADERS, 'body': 'Missing required parameters', 'isBase64Encoded': False}

    password_2 = os.environ.get('ROBOKASSA_PASSWORD_2')
    if not password_2:
        return {'statusCode': 500, 'headers': HEADERS, 'body': 'Configuration error', 'isBase64Encoded': False}

    expected = md5_upper(out_sum, inv_id, password_2)
    if sig != expected:
        return {'statusCode': 400, 'headers': HEADERS, 'body': 'Invalid signature', 'isBase64Encoded': False}

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE orders
        SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE robokassa_inv_id = %s AND status = 'pending'
        RETURNING id, user_id, target_type, target_id, target_month, amount
        """,
        (int(inv_id),),
    )
    row = cur.fetchone()

    if not row:
        cur.execute("SELECT status FROM orders WHERE robokassa_inv_id = %s", (int(inv_id),))
        existing = cur.fetchone()
        cur.close()
        conn.close()
        if existing and existing[0] == 'paid':
            return {'statusCode': 200, 'headers': HEADERS, 'body': f'OK{inv_id}', 'isBase64Encoded': False}
        return {'statusCode': 404, 'headers': HEADERS, 'body': 'Order not found', 'isBase64Encoded': False}

    order_id, user_id, target_type, target_id, target_month, amount = row

    # Автоматически отметить связанный объект как оплаченный
    try:
        if target_type == 'debt' and target_id:
            cur.execute(
                "UPDATE debts SET status = 'archived' WHERE id = %s",
                (target_id,),
            )
        elif target_type == 'rental' and target_id and target_month:
            cur.execute(
                """
                INSERT INTO rental_payments (rental_id, period_month, amount, paid_at, paid_by_user_id)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP, %s)
                ON CONFLICT DO NOTHING
                """,
                (int(target_id), target_month + '-01', amount, user_id),
            )
        # loan: личный займ хранится в localStorage на фронте, отметку сделает фронт по истории платежей
        if user_id:
            title = 'Платёж прошёл'
            body_msg = f'Оплата {amount:.2f} ₽ зачислена'
            cur.execute(
                """
                INSERT INTO notifications (user_id, type, title, body, is_read, data)
                VALUES (%s, %s, %s, %s, FALSE, %s)
                """,
                (user_id, 'payment_paid', title, body_msg, json.dumps({'order_id': order_id, 'target_type': target_type, 'target_id': target_id})),
            )
    except Exception as e:
        print(f'Post-payment update warning: {e}')

    conn.commit()
    cur.close()
    conn.close()

    return {'statusCode': 200, 'headers': HEADERS, 'body': f'OK{inv_id}', 'isBase64Encoded': False}
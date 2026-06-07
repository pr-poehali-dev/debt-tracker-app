# build: restore-urls-1
"""
Business: CRUD для контактов пользователя — список, добавление, обновление, удаление. Поиск дубликатов по телефону.
Args: event - dict с httpMethod, queryStringParameters, body, headers; context - объект с request_id
Returns: HTTP-ответ JSON со списком контактов или результатом операции
"""
import json
import os
import re
import psycopg2

SCHEMA = "t_p29977622_debt_tracker_app"


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Auth-Token, Authorization, X-Authorization",
        "Content-Type": "application/json",
    }


def json_resp(data, status=200):
    return {"statusCode": status, "headers": cors_headers(), "body": json.dumps(data, ensure_ascii=False, default=str)}


def err(msg, status=400):
    return json_resp({"error": msg}, status)


def get_user_id_from_token(token_str, conn):
    if not token_str:
        return None
    bearer = token_str.replace("Bearer ", "").strip()
    with conn.cursor() as cur:
        cur.execute(f"SELECT user_id FROM {SCHEMA}.sessions WHERE token = %s AND expires_at > NOW()", (bearer,))
        row = cur.fetchone()
    return row[0] if row else None


def normalize_phone(phone: str) -> str:
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("8") and len(digits) == 11:
        digits = "7" + digits[1:]
    return digits


def make_avatar(name: str) -> str:
    if not name:
        return "??"
    parts = [p for p in name.strip().split() if p]
    if len(parts) >= 2:
        return (parts[0][0] + parts[1][0]).upper()
    return parts[0][:2].upper() if parts else "??"


def row_to_contact(row):
    return {
        "id": row[0],
        "name": row[1],
        "phone": row[2] or "",
        "email": row[3] or "",
        "telegram": row[4] or "",
        "note": row[5] or "",
        "color": row[6] or "purple",
        "avatar": row[7] or make_avatar(row[1]),
    }


def find_duplicate_by_phone(cur, user_id: int, phone: str, exclude_id=None):
    norm = normalize_phone(phone)
    if not norm:
        return None
    sql = f"SELECT id, name, phone FROM {SCHEMA}.contacts WHERE user_id = %s"
    params = [user_id]
    if exclude_id is not None:
        sql += " AND id <> %s"
        params.append(exclude_id)
    cur.execute(sql, tuple(params))
    for row in cur.fetchall():
        if normalize_phone(row[2] or "") == norm:
            return row[0]
    return None


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}
    auth_header = headers.get("X-Authorization") or headers.get("Authorization") or ""

    with get_conn() as conn:
        user_id = get_user_id_from_token(auth_header, conn)
        if not user_id:
            try:
                user_id = int(qs.get("user_id") or 0)
            except Exception:
                user_id = 0
        if not user_id:
            return err("Не авторизован", 401)

        if method == "GET":
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT id, name, phone, email, telegram, note, color, avatar FROM {SCHEMA}.contacts WHERE user_id = %s ORDER BY name",
                    (user_id,),
                )
                contacts = [row_to_contact(r) for r in cur.fetchall()]
            return json_resp({"contacts": contacts})

        if method == "POST":
            body = json.loads(event.get("body") or "{}")
            name = (body.get("name") or "").strip()
            if not name:
                return err("Имя обязательно")
            phone = (body.get("phone") or "").strip()
            email = (body.get("email") or "").strip()
            telegram = (body.get("telegram") or "").strip().lstrip("@")
            note = (body.get("note") or "").strip()
            color = (body.get("color") or "purple").strip()
            avatar = make_avatar(name)
            skip_dup = bool(body.get("skip_duplicate_check"))

            with conn.cursor() as cur:
                if not skip_dup and phone:
                    dup_id = find_duplicate_by_phone(cur, user_id, phone)
                    if dup_id is not None:
                        return json_resp({"duplicate": True, "duplicate_id": dup_id}, 200)

                cur.execute(
                    f"""INSERT INTO {SCHEMA}.contacts (user_id, name, phone, email, telegram, note, color, avatar)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id, name, phone, email, telegram, note, color, avatar""",
                    (user_id, name, phone, email, telegram, note, color, avatar),
                )
                row = cur.fetchone()
                conn.commit()
            return json_resp({"contact": row_to_contact(row)}, 201)

        if method == "PUT":
            try:
                cid = int(qs.get("id") or 0)
            except Exception:
                cid = 0
            if not cid:
                return err("id обязателен")
            body = json.loads(event.get("body") or "{}")

            fields = []
            values = []
            for key in ("name", "phone", "email", "telegram", "note", "color"):
                if key in body:
                    val = (body.get(key) or "").strip()
                    if key == "telegram":
                        val = val.lstrip("@")
                    fields.append(f"{key} = %s")
                    values.append(val)
            if "name" in body:
                fields.append("avatar = %s")
                values.append(make_avatar(body.get("name") or ""))

            if not fields:
                return err("Нет полей для обновления")

            fields.append("updated_at = NOW()")
            values.extend([cid, user_id])

            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {SCHEMA}.contacts SET {', '.join(fields)} WHERE id = %s AND user_id = %s RETURNING id, name, phone, email, telegram, note, color, avatar",
                    tuple(values),
                )
                row = cur.fetchone()
                conn.commit()
            if not row:
                return err("Контакт не найден", 404)
            return json_resp({"contact": row_to_contact(row)})

        if method == "DELETE":
            try:
                cid = int(qs.get("id") or 0)
            except Exception:
                cid = 0
            if not cid:
                return err("id обязателен")
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {SCHEMA}.debts SET lender_contact_id = NULL WHERE lender_contact_id = %s AND lender_user_id = %s",
                    (cid, user_id),
                )
                cur.execute(
                    f"UPDATE {SCHEMA}.debts SET borrower_contact_id = NULL WHERE borrower_contact_id = %s AND borrower_user_id = %s",
                    (cid, user_id),
                )
                cur.execute(
                    f"DELETE FROM {SCHEMA}.contacts WHERE id = %s AND user_id = %s",
                    (cid, user_id),
                )
                conn.commit()
            return json_resp({"deleted": True})

        return err("Метод не поддерживается", 405)
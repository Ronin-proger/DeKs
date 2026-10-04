def serialize_user_self(row) -> dict:
    return {
        "id": row["id"],
        "fullName": row["fullName"],
        "avatarUrl": row["avatarUrl"] or None,
        "position": row["position"] or "",
    }


def serialize_colleague(row) -> dict:
    return {
        "id": row["id"],
        "fullName": row["fullName"],
        "avatarUrl": row["avatarUrl"] or None,
        "position": row["position"] or "",
    }

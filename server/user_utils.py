def serialize_user_public(row) -> dict:
    return {
        "id": row["id"],
        "fullName": row["fullName"],
        "email": row["email"],
        "avatarUrl": row["avatarUrl"] or None,
        "position": row["position"] or "",
        "birthDate": row["birthDate"] or None,
        "createdAt": row["createdAt"],
    }

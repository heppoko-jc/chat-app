// lib/jwt.ts (サーバー専用で使うこと)
import jwt, { JwtPayload } from "jsonwebtoken";

export function verifyJwt(token: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // 本番での設定漏れを早期に発見
    throw new Error("JWT secret missing");
  }

  const decoded = jwt.verify(token, secret);

  // 文字列トークンではなくオブジェクトペイロードであることを確認
  const payload = typeof decoded === "string" ? undefined : (decoded as JwtPayload);

  // 既存の発行: { id, email } を想定。将来 sub を使う場合にも対応
  const userId = (payload?.id as string | undefined) ?? (payload?.sub as string | undefined);

  if (!userId) {
    throw new Error("Invalid token");
  }
  return userId;
}
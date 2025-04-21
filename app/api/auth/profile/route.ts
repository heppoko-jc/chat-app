// app/api/auth/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SECRET_KEY: string = process.env.JWT_SECRET || "";

if (!SECRET_KEY) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}

// ✅ ユーザー情報を取得
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    let decoded: { id: string; email: string };

    try {
      decoded = jwt.verify(token, SECRET_KEY) as { id: string; email: string };
    } catch (err: unknown) {
      // 期限切れなら WARN、それ以外は ERROR
      if (err instanceof jwt.TokenExpiredError) {
        console.warn("Profile fetch warning: JWT expired", err);
        return NextResponse.json({ error: "Token expired" }, { status: 401 });
      } else {
        console.error("Profile fetch error: Invalid token", err);
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { name: true, email: true, bio: true }, // ✅ bioを取得
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    // ここにはほとんど入らないはずですが、念のため
    console.error("Profile fetch unexpected error:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

// ✅ ユーザー情報を更新（名前・自己紹介）
export async function PUT(req: NextRequest) {
  try {
    const { name, bio } = await req.json();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, SECRET_KEY) as { id: string };

    const updatedUser = await prisma.user.update({
      where: { id: decoded.id },
      data: { name, bio },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}

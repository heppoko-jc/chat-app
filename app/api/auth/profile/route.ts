// app/api/auth/profile/route.ts

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

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
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const typedUser = user as typeof user & {
      nameEn: string | null;
      nameJa: string | null;
      nameOther: string | null;
    };

    const { name, nameEn, nameJa, nameOther, email, bio } = typedUser;

    return NextResponse.json({ name, nameEn, nameJa, nameOther, email, bio });
  } catch (error) {
    // ここにはほとんど入らないはずですが、念のため
    console.error("Profile fetch unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

// ✅ ユーザー情報を更新（名前・自己紹介）
export async function PUT(req: NextRequest) {
  try {
    const { name, nameEn, nameJa, nameOther, bio } = await req.json();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, SECRET_KEY) as { id: string };

    const updateData: {
      name?: string;
      nameEn?: string | null;
      nameJa?: string | null;
      nameOther?: string | null;
      bio?: string;
    } = {};
    if (name !== undefined) updateData.name = name;
    if (nameEn !== undefined) updateData.nameEn = nameEn || null;
    if (nameJa !== undefined) updateData.nameJa = nameJa || null;
    if (nameOther !== undefined) updateData.nameOther = nameOther || null;
    if (bio !== undefined) updateData.bio = bio;

    const updatedUser = await prisma.user.update({
      where: { id: decoded.id },
      data: updateData,
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}

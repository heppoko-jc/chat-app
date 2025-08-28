// app/api/preset-message/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  try {
    const messages = await prisma.presetMessage.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(messages)
  } catch (err) {
    console.error('GET /api/preset-message failed:', err)
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { content, createdBy } = await req.json()
    if (!content || !createdBy) {
      return NextResponse.json(
        { error: '内容と作成者IDは必須です' },
        { status: 400 }
      )
    }

    const existingMessage = await prisma.presetMessage.findFirst({
      where: { content },
    })

    if (existingMessage) {
      const updatedMessage = await prisma.presetMessage.update({
        where: { id: existingMessage.id },
        data: { count: existingMessage.count + 1 },
      })
      return NextResponse.json(updatedMessage)
    }

    const newMessage = await prisma.presetMessage.create({
      data: { content, createdBy, count: 1 },
    })
    return NextResponse.json(newMessage, { status: 201 })
  } catch (err) {
    console.error('POST /api/preset-message failed:', err)
    return NextResponse.json({ error: '作成に失敗しました' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    await prisma.presetMessage.deleteMany({})
    return NextResponse.json({ message: 'All preset messages deleted' })
  } catch (err) {
    console.error('DELETE /api/preset-message failed:', err)
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
  }
}
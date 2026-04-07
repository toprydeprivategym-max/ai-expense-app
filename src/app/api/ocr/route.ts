import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `あなたは経理の専門家AIアシスタント「Ai経費識別君」です。
ユーザーからレシートや領収書の画像を受け取り、以下の情報をJSON形式で正確に抽出してください。

## 抽出項目
- date: 日付（YYYY-MM-DD形式）
- vendor: 店名・発行者名
- amount: 合計金額（税込、数値のみ）
- tax: 消費税額（数値のみ、不明な場合は合計の10/110で推定）
- category: 勘定科目（以下から選択）
- subcategory: 小分類
- validity: 経費としての妥当性（"valid", "warning", "invalid"のいずれか）
- validityReason: 妥当性の判断理由
- description: 内容の要約

## 勘定科目の選択肢
交通費, 交際費, 会議費, 旅費交通費, 通信費, 消耗品費, 新聞図書費, 広告宣伝費, 福利厚生費, 修繕費, 水道光熱費, 地代家賃, 保険料, 租税公課, 雑費

## 妥当性判断の基準
- valid: 一般的なビジネス経費として問題ない
- warning: 経費として認められる可能性はあるが、用途の詳細確認が必要（私的利用の可能性、金額が通常より高い等）
- invalid: 経費として認められない可能性が高い（明らかな私的利用、不適切な支出等）

## 過去の分類履歴（自動学習）
以下は過去にユーザーが確認済みの分類です。同様のパターンの場合は参考にしてください：
{LEARNING_DATA}

## 出力形式
必ず以下のJSON形式で返してください。JSONのみを返し、他のテキストは含めないでください：
{
  "date": "YYYY-MM-DD",
  "vendor": "店名",
  "amount": 数値,
  "tax": 数値,
  "category": "勘定科目",
  "subcategory": "小分類",
  "validity": "valid/warning/invalid",
  "validityReason": "理由",
  "description": "内容の要約"
}

画像が不鮮明で読み取れない場合は、読み取れた部分を返し、不明な箇所は "不明" としてください。
画像がレシート/領収書でない場合は、その旨をdescriptionに記載し、validity を "invalid" としてください。`;

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, mimeType, learningData, apiKey: clientApiKey } = await request.json();

    const apiKey = process.env.ANTHROPIC_API_KEY || clientApiKey;
    if (!apiKey) {
      return NextResponse.json(
        { error: "APIキーが設定されていません。画面右上の ⚙️ 設定からAnthropicのAPIキーを入力するか、サーバーの .env.local に ANTHROPIC_API_KEY を設定してください。" },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    const systemPrompt = SYSTEM_PROMPT.replace(
      "{LEARNING_DATA}",
      learningData && learningData.length > 0
        ? learningData.map((d: { vendor: string; category: string; subcategory: string }) =>
            `${d.vendor} → ${d.category} (${d.subcategory})`
          ).join("\n")
        : "まだ履歴がありません"
    );

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: "このレシート/領収書の内容を読み取り、経費情報をJSON形式で返してください。",
            },
          ],
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json({ error: "AIからの応答が取得できませんでした" }, { status: 500 });
    }

    let jsonStr = textContent.text;
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const expenseData = JSON.parse(jsonStr);
    return NextResponse.json({ expense: expenseData });
  } catch (error: unknown) {
    console.error("OCR API Error:", error);
    const message = error instanceof Error ? error.message : "不明なエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

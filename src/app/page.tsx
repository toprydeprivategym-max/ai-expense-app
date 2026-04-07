"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage, ExpenseData } from "@/lib/types";

function generateId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(amount);
}

function getTimestamp() {
  return new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "こんにちは！🧾 **Ai経費識別君**です。\n\nレシートや領収書の写真を送ってください。AIが自動で読み取り、勘定科目の分類と経費の妥当性チェックを行います。\n\n📎 画像をアップロード、またはメッセージを入力してください。",
      timestamp: getTimestamp(),
    },
  ]);
  const [expenses, setExpenses] = useState<ExpenseData[]>([]);
  const [learningData, setLearningData] = useState<{ vendor: string; category: string; subcategory: string }[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedImages, setSelectedImages] = useState<{ file: File; preview: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    try {
      const saved = window.localStorage?.getItem("ai-expense-learning");
      if (saved) setLearningData(JSON.parse(saved));
      const savedExpenses = window.localStorage?.getItem("ai-expense-data");
      if (savedExpenses) setExpenses(JSON.parse(savedExpenses));
      const savedKey = window.localStorage?.getItem("ai-expense-apikey");
      if (savedKey) setApiKey(savedKey);
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage?.setItem("ai-expense-learning", JSON.stringify(learningData));
      window.localStorage?.setItem("ai-expense-data", JSON.stringify(expenses));
    } catch {
    }
  }, [learningData, expenses]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setSelectedImages((prev) => [...prev, ...newImages]);
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processImage = useCallback(
    async (imageFile: File, imagePreview: string) => {
      const userMsg: ChatMessage = {
        id: generateId(),
        role: "user",
        content: "レシートを送信しました",
        imageUrl: imagePreview,
        timestamp: getTimestamp(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const loadingMsg: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: "",
        isLoading: true,
        timestamp: getTimestamp(),
      };
      setMessages((prev) => [...prev, loadingMsg]);

      try {
        const base64 = await fileToBase64(imageFile);

        const response = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: imageFile.type || "image/jpeg",
            learningData,
            apiKey: apiKey || undefined,
          }),
        });

        const data = await response.json();

        if (data.error) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === loadingMsg.id
                ? { ...m, isLoading: false, content: `⚠️ エラー: ${data.error}` }
                : m
            )
          );
          return;
        }

        const expense: ExpenseData = {
          id: generateId(),
          ...data.expense,
          imageUrl: imagePreview,
          createdAt: new Date().toISOString(),
        };

        setExpenses((prev) => [...prev, expense]);

        if (expense.vendor && expense.vendor !== "不明") {
          setLearningData((prev) => {
            const exists = prev.find((d) => d.vendor === expense.vendor);
            if (exists) return prev;
            return [...prev, { vendor: expense.vendor, category: expense.category, subcategory: expense.subcategory }];
          });
        }

        const validityLabel =
          expense.validity === "valid"
            ? "✅ 適正"
            : expense.validity === "warning"
            ? "⚠️ 要確認"
            : "❌ 不適切";

        const responseContent = `**読み取り完了！**\n\n${expense.description}\n\n判定: ${validityLabel}\n${expense.validityReason}`;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingMsg.id
              ? { ...m, isLoading: false, content: responseContent, expense }
              : m
          )
        );
      } catch (err) {
        console.error(err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingMsg.id
              ? { ...m, isLoading: false, content: "⚠️ 通信エラーが発生しました。再度お試しください。" }
              : m
          )
        );
      }
    },
    [learningData, apiKey]
  );

  const handleSend = async () => {
    if (isProcessing) return;
    if (!selectedImages.length && !inputText.trim()) return;

    setIsProcessing(true);

    if (selectedImages.length > 0) {
      for (const img of selectedImages) {
        await processImage(img.file, img.preview);
      }
      setSelectedImages([]);
    } else if (inputText.trim()) {
      const userMsg: ChatMessage = {
        id: generateId(),
        role: "user",
        content: inputText,
        timestamp: getTimestamp(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const lower = inputText.toLowerCase();
      let reply = "";

      if (lower.includes("集計") || lower.includes("合計") || lower.includes("まとめ")) {
        setShowSummary(true);
        reply = "📊 現在の経費集計を表示します。";
      } else if (lower.includes("エクスポート") || lower.includes("excel") || lower.includes("出力") || lower.includes("ダウンロード")) {
        if (expenses.length === 0) {
          reply = "まだ経費データがありません。レシート画像を送信してください。";
        } else {
          reply = "📥 Excelファイルを生成しています...";
          setTimeout(() => handleExport(), 500);
        }
      } else if (lower.includes("クリア") || lower.includes("リセット")) {
        setExpenses([]);
        setLearningData([]);
        reply = "🗑️ 経費データをクリアしました。";
      } else if (lower.includes("ヘルプ") || lower.includes("使い方")) {
        reply =
          "📖 **使い方ガイド**\n\n" +
          "1. 📎 レシートや領収書の写真をアップロード\n" +
          "2. 🤖 AIが自動で内容を読み取り、勘定科目を分類\n" +
          "3. ✅ 経費の妥当性を自動チェック\n" +
          "4. 📊 「集計」で現在のサマリーを確認\n" +
          "5. 📥 「Excel出力」でデータをダウンロード\n\n" +
          "💡 使うほどAIが学習し、分類精度が向上します！";
      } else {
        reply = "レシートや領収書の画像を送ってください。テキストコマンド: 「集計」「Excel出力」「クリア」「ヘルプ」が使えます。";
      }

      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: "assistant", content: reply, timestamp: getTimestamp() },
      ]);
      setInputText("");
    }

    setIsProcessing(false);
  };

  const handleExport = async () => {
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenses }),
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `経費一覧_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "assistant",
          content: `✅ Excelファイルをダウンロードしました！（${expenses.length}件の経費データ）`,
          timestamp: getTimestamp(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: "assistant", content: "⚠️ エクスポートに失敗しました。", timestamp: getTimestamp() },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const saveApiKey = () => {
    try {
      window.localStorage?.setItem("ai-expense-apikey", apiKey);
    } catch {
    }
    setShowSettings(false);
  };

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const categoryBreakdown: Record<string, number> = {};
  expenses.forEach((e) => {
    categoryBreakdown[e.category] = (categoryBreakdown[e.category] || 0) + e.amount;
  });

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1>
          <span className="logo">🧾</span>
          Ai経費識別君
        </h1>
        <div className="header-actions">
          {expenses.length > 0 && (
            <>
              <button className="btn btn-outline" onClick={() => setShowSummary(!showSummary)}>
                📊 集計
              </button>
              <button className="btn btn-success" onClick={handleExport}>
                📥 Excel
              </button>
            </>
          )}
          <button className="btn btn-outline" onClick={() => setShowSettings(true)}>
            ⚙️
          </button>
        </div>
      </div>

      {showSummary && expenses.length > 0 && (
        <div style={{ padding: "0 24px" }}>
          <div className="summary-panel">
            <div className="summary-title">📊 経費サマリー（{expenses.length}件）</div>
            <div className="summary-grid">
              <div className="summary-item">
                <div className="label">合計金額</div>
                <div className="value" style={{ color: "#3b82f6" }}>
                  {formatCurrency(totalAmount)}
                </div>
              </div>
              {Object.entries(categoryBreakdown)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([cat, amount]) => (
                  <div className="summary-item" key={cat}>
                    <div className="label">{cat}</div>
                    <div className="value">{formatCurrency(amount)}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      <div className="messages-area">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-avatar">{msg.role === "user" ? "👤" : "🤖"}</div>
            <div>
              <div className="message-content">
                {msg.isLoading ? (
                  <div className="typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                ) : (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: msg.content
                        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                        .replace(/\n/g, "<br/>"),
                    }}
                  />
                )}
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="レシート" className="receipt-image" />
                )}
              </div>

              {msg.expense && (
                <div className="expense-card">
                  <div className="expense-card-header">
                    <span className="category-badge">{msg.expense.category}</span>
                    <span className={`validity ${msg.expense.validity}`}>
                      {msg.expense.validity === "valid"
                        ? "✅ 適正"
                        : msg.expense.validity === "warning"
                        ? "⚠️ 要確認"
                        : "❌ 不適切"}
                    </span>
                  </div>
                  <dl className="expense-detail">
                    <dt>日付</dt>
                    <dd>{msg.expense.date}</dd>
                    <dt>取引先</dt>
                    <dd>{msg.expense.vendor}</dd>
                    <dt>金額（税込）</dt>
                    <dd>{formatCurrency(msg.expense.amount)}</dd>
                    <dt>消費税</dt>
                    <dd>{formatCurrency(msg.expense.tax)}</dd>
                  </dl>
                  {msg.expense.validityReason && (
                    <div className="expense-note">💡 {msg.expense.validityReason}</div>
                  )}
                </div>
              )}

              <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "4px", padding: "0 4px" }}>
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        {selectedImages.length > 0 && (
          <div className="image-preview">
            {selectedImages.map((img, i) => (
              <div key={i} className="preview-item">
                <img src={img.preview} alt="プレビュー" />
                <button className="preview-remove" onClick={() => removeImage(i)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="input-row">
          <div className="input-wrapper">
            <label className="file-label">
              📎
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
              />
            </label>
            <input
              type="text"
              placeholder="メッセージ or レシート画像を送信..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isProcessing}
            />
          </div>
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={isProcessing && selectedImages.length === 0 && !inputText.trim()}
          >
            {isProcessing ? "⏳" : "➤"}
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>⚙️ 設定</h2>

            <label>Anthropic API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
            />
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
              サーバー側の .env.local に ANTHROPIC_API_KEY を設定済みの場合は不要です
            </p>

            <label style={{ marginTop: "16px" }}>学習データ</label>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              {learningData.length} 件の店舗→勘定科目マッピングを学習済み
            </p>

            <label style={{ marginTop: "16px" }}>登録済み経費</label>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              {expenses.length} 件 / 合計 {formatCurrency(totalAmount)}
            </p>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowSettings(false)}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={saveApiKey}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
          }

export interface ExpenseData {
  id: string;
  date: string;
  vendor: string;
  amount: number;
  tax: number;
  category: string;
  subcategory: string;
  validity: "valid" | "warning" | "invalid";
  validityReason: string;
  description: string;
  imageUrl?: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  expense?: ExpenseData;
  isLoading?: boolean;
  timestamp: string;
}

export const EXPENSE_CATEGORIES: Record<string, string[]> = {
  "交通費": ["電車", "バス", "タクシー", "飛行機", "レンタカー", "駐車場", "高速道路"],
  "交際費": ["接待", "贈答品", "慶弔費"],
  "会議費": ["会議室", "会議用飲食"],
  "旅費交通費": ["宿泊", "出張日当"],
  "通信費": ["電話", "インターネット", "郵便"],
  "消耗品費": ["文房具", "日用品", "PC周辺機器"],
  "新聞図書費": ["書籍", "新聞", "雑誌", "サブスクリプション"],
  "広告宣伝費": ["広告", "販促品", "ノベルティ"],
  "福利厚生費": ["社内イベント", "健康診断", "社員食事"],
  "修繕費": ["設備修理", "建物修繕"],
  "水道光熱費": ["電気", "ガス", "水道"],
  "地代家賃": ["家賃", "駐車場賃料"],
  "保険料": ["火災保険", "賠償保険"],
  "租税公課": ["印紙", "登録免許税", "固定資産税"],
  "雑費": ["その他"],
};

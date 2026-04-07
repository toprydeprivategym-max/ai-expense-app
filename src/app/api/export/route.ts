import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

interface ExpenseRow {
  date: string;
  vendor: string;
  amount: number;
  tax: number;
  category: string;
  subcategory: string;
  validity: string;
  validityReason: string;
  description: string;
}

export async function POST(request: NextRequest) {
  try {
    const { expenses } = await request.json();

    const rows = expenses.map((e: ExpenseRow, i: number) => ({
      "No.": i + 1,
      "日付": e.date,
      "取引先": e.vendor,
      "金額（税込）": e.amount,
      "消費税": e.tax,
      "税抜金額": e.amount - e.tax,
      "勘定科目": e.category,
      "小分類": e.subcategory,
      "内容": e.description,
      "妥当性": e.validity === "valid" ? "◎ 適正" : e.validity === "warning" ? "△ 要確認" : "✕ 不適切",
      "備考": e.validityReason,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = [
      { wch: 5 },
      { wch: 12 },
      { wch: 20 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 30 },
      { wch: 10 },
      { wch: 30 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "経費一覧");

    const categoryTotals: Record<string, { count: number; total: number }> = {};
    expenses.forEach((e: ExpenseRow) => {
      if (!categoryTotals[e.category]) {
        categoryTotals[e.category] = { count: 0, total: 0 };
      }
      categoryTotals[e.category].count++;
      categoryTotals[e.category].total += e.amount;
    });

    const summaryRows = Object.entries(categoryTotals).map(([cat, data]) => ({
      "勘定科目": cat,
      "件数": data.count,
      "合計金額": data.total,
    }));

    const grandTotal = expenses.reduce((sum: number, e: ExpenseRow) => sum + e.amount, 0);
    summaryRows.push({
      "勘定科目": "合計",
      "件数": expenses.length,
      "合計金額": grandTotal,
    });

    const ws2 = XLSX.utils.json_to_sheet(summaryRows);
    ws2["!cols"] = [
      { wch: 15 },
      { wch: 8 },
      { wch: 15 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "科目別集計");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="expenses_${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (error: unknown) {
    console.error("Export Error:", error);
    const message = error instanceof Error ? error.message : "エクスポートに失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
                              }

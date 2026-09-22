import { Metadata } from "next";
import { DailyReportClient } from "@/components/reports/daily-report-client";

export const metadata: Metadata = {
  title: "Daily Report - Mediflow",
  description: "Daily financial snapshot and partner profit splits",
};

export default function DailyReportPage() {
  return (
    <div className="container mx-auto py-8">
      <DailyReportClient />
    </div>
  );
}

"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} className="gap-2 bg-red-600 text-white hover:bg-red-700">
      <Printer className="h-4 w-4" /> Print
    </Button>
  );
}

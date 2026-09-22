"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { Settings } from "lucide-react";

export function FixedExpensesModal({ initialData, onUpdate }: { initialData?: any, onUpdate: () => void }) {
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    salary: initialData?.salary || 0,
    rent: initialData?.rent || 0,
    transport: initialData?.transport || 0,
    petrol: initialData?.petrol || 0,
    light: initialData?.light || 0,
    water: initialData?.water || 0,
    internet: initialData?.internet || 0,
    stationery: initialData?.stationery || 0,
    intOnCc: initialData?.intOnCc || 0,
    incomeTax: initialData?.incomeTax || 0,
    caFees: initialData?.caFees || 0,
    godown: initialData?.godown || 0,
    other: initialData?.other || 0,
    daysInMonth: initialData?.daysInMonth || 30,
  });

  const handleChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: Number(e.target.value) || 0 });
  };

  const handleSave = async () => {
    if (!user?.outletId) return;
    setLoading(true);
    try {
      await api.post(`/reports/daily-snapshot/fixed-expenses/`, {
        outletId: user.outletId,
        ...formData
      });
      toast.success("Fixed Expenses updated successfully");
      setOpen(false);
      onUpdate();
    } catch (err) {
      toast.error("Failed to update expenses");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Fixed Monthly Expenses">
          <Settings className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fixed Monthly Expenses</DialogTitle>
        </DialogHeader>
        
        {/* We only show settings if they have can_manage_partners or are a super_admin for now as it's an admin setting */}
        {!(user?.canManagePartners || user?.role === 'super_admin') ? (
          <div className="p-6 text-center text-red-500 bg-red-50 rounded-lg">
            You do not have permission to manage fixed expenses.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 py-4">
            {Object.keys(formData).map((key) => {
              if (key === 'daysInMonth') return null;
              return (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-sm font-medium uppercase text-gray-500">{key.replace(/([A-Z])/g, ' $1').trim()}</label>
                  <Input type="number" name={key} value={(formData as any)[key]} onChange={handleChange} />
                </div>
              );
            })}
            
            <div className="flex flex-col gap-1 col-span-2 mt-4 pt-4 border-t">
              <label className="text-sm font-medium text-gray-500">DAYS IN MONTH (For Per Day Calculation)</label>
              <Input type="number" name="daysInMonth" value={formData.daysInMonth} onChange={handleChange} />
            </div>
            
            <div className="col-span-2 pt-4">
              <Button onClick={handleSave} disabled={loading} className="w-full">
                {loading ? "Saving..." : "Save Expenses"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

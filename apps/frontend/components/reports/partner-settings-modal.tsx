"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { Settings, Plus, Trash2 } from "lucide-react";

interface Partner {
  id?: string;
  name: string;
  profitPercentage: number;
}

export function PartnerSettingsModal({ onUpdate }: { onUpdate: () => void }) {
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);

  const canManage = user?.role === 'super_admin' || user?.canManagePartners;

  useEffect(() => {
    if (open && canManage) {
      fetchPartners();
    }
  }, [open, canManage]);

  const fetchPartners = async () => {
    try {
      const res = await api.get(`/partners/?outletId=${user?.outletId}`);
      setPartners(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdd = () => {
    setPartners([...partners, { name: "", profitPercentage: 0 }]);
  };

  const handleUpdate = (index: number, field: keyof Partner, value: any) => {
    const newPartners = [...partners];
    newPartners[index] = { ...newPartners[index], [field]: value };
    setPartners(newPartners);
  };

  const handleRemove = async (index: number) => {
    const p = partners[index];
    if (p.id) {
      try {
        await api.delete(`/partners/${p.id}/?outletId=${user?.outletId}`);
      } catch (err) {
        toast.error("Failed to delete partner");
        return;
      }
    }
    const newPartners = [...partners];
    newPartners.splice(index, 1);
    setPartners(newPartners);
  };

  const handleSave = async () => {
    setLoading(true);
    let totalPct = 0;
    
    for (const p of partners) {
      if (!p.name) {
        toast.error("Partner names cannot be empty");
        setLoading(false);
        return;
      }
      totalPct += Number(p.profitPercentage);
    }

    if (totalPct > 100) {
      toast.error(`Total percentage cannot exceed 100%. Currently at ${totalPct}%`);
      setLoading(false);
      return;
    }

    try {
      for (const p of partners) {
        const payload = {
          name: p.name,
          profit_percentage: p.profitPercentage,
          outletId: user?.outletId
        };
        if (p.id) {
          await api.put(`/partners/${p.id}/`, payload);
        } else {
          await api.post(`/partners/`, payload);
        }
      }
      toast.success("Partners updated successfully");
      onUpdate();
      setOpen(false);
    } catch (err) {
      toast.error("Failed to save partners");
    } finally {
      setLoading(false);
    }
  };

  if (!canManage) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Partner Splits
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Profit Splitting</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {partners.map((p, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-xs">Partner Name</Label>
                <Input 
                  value={p.name} 
                  onChange={(e) => handleUpdate(idx, 'name', e.target.value)} 
                  placeholder="e.g. Rohan"
                />
              </div>
              <div className="w-24">
                <Label className="text-xs">Share (%)</Label>
                <Input 
                  type="number" 
                  value={p.profitPercentage} 
                  onChange={(e) => handleUpdate(idx, 'profitPercentage', parseFloat(e.target.value) || 0)}
                  min="0" max="100"
                />
              </div>
              <Button variant="ghost" size="icon" className="mt-5 text-red-500" onClick={() => handleRemove(idx)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          
          <Button variant="outline" className="w-full mt-2" onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" /> Add Partner
          </Button>

          <div className="text-sm text-muted-foreground pt-4 border-t">
            Total Distributed: <span className="font-bold">{partners.reduce((s, p) => s + Number(p.profitPercentage), 0)}%</span>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

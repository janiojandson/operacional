import React, { useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { ChevronDown, Building2, ShieldCheck } from 'lucide-react';

export const TenantSelector: React.FC = () => {
  const { organizations, currentOrganization, switchOrganization } = useTenant();
  const [isOpen, setIsOpen] = useState(false);

  if (!currentOrganization) return null;

  return (
    <div className="relative inline-block text-left select-none">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2.5 px-3 py-1.5 rounded-lg bg-surface/80 hover:bg-surface-hover border border-border/80 text-xs font-mono text-white transition-all shadow-sm"
      >
        <div className="w-6 h-6 rounded-md bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
          <Building2 className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col text-left">
          <span className="font-bold text-[11px] text-slate-100 max-w-[130px] truncate">
            {currentOrganization.name}
          </span>
          <span className="text-[9px] text-accent font-semibold flex items-center gap-0.5">
            <ShieldCheck className="w-2.5 h-2.5" /> {currentOrganization.role}
          </span>
        </div>
        <ChevronDown className="w-3 h-3 text-slate-400 ml-1" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 rounded-xl bg-[#0b0f19] border border-border/90 shadow-2xl p-2 z-50 flex flex-col gap-1 backdrop-blur-xl">
          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            Organizações Multi-Tenant
          </div>
          {organizations.map((org) => {
            const isSelected = org.id === currentOrganization.id;
            return (
              <button
                key={org.id}
                type="button"
                onClick={() => {
                  switchOrganization(org.id);
                  setIsOpen(false);
                }}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-mono transition-all text-left ${
                  isSelected
                    ? 'bg-accent/15 text-accent font-bold border border-accent/30'
                    : 'text-slate-300 hover:bg-surface-hover hover:text-white'
                }`}
              >
                <div className="flex flex-col">
                  <span className="text-xs">{org.name}</span>
                  <span className="text-[10px] text-slate-400">Cargo: {org.role}</span>
                </div>
                {isSelected && <span className="text-accent text-sm font-bold">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

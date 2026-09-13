import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface TenantOrganization {
  id: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'TRADER' | 'VIEWER';
}

interface TenantContextData {
  organizations: TenantOrganization[];
  currentOrganization: TenantOrganization | null;
  activeTenantId: string;
  switchOrganization: (orgId: string) => void;
}

const TenantContext = createContext<TenantContextData>({} as TenantContextData);

export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [organizations, setOrganizations] = useState<TenantOrganization[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<TenantOrganization | null>(null);

  useEffect(() => {
    const storedOrgs = localStorage.getItem('@Nexus:organizations');
    const storedActiveTenantId = localStorage.getItem('@Nexus:active_tenant_id');

    let orgs: TenantOrganization[] = [];
    if (storedOrgs) {
      try { orgs = JSON.parse(storedOrgs); } catch (e) { orgs = []; }
    }

    if (orgs.length === 0) {
      orgs = [
        { id: 'org_quant_fund', name: 'MarketFlow Quant Fund (Master)', role: 'OWNER' },
        { id: 'org_prop_trading', name: 'Mesa Proprietária Alfa', role: 'ADMIN' },
        { id: 'org_vip_client', name: 'Gestão VIP B2B', role: 'TRADER' }
      ];
      localStorage.setItem('@Nexus:organizations', JSON.stringify(orgs));
    }

    setOrganizations(orgs);

    const activeId = storedActiveTenantId || orgs[0].id;
    const found = orgs.find(o => o.id === activeId) || orgs[0];
    setCurrentOrganization(found);
    localStorage.setItem('@Nexus:active_tenant_id', found.id);
  }, []);

  const switchOrganization = (orgId: string) => {
    const found = organizations.find(o => o.id === orgId);
    if (found) {
      setCurrentOrganization(found);
      localStorage.setItem('@Nexus:active_tenant_id', found.id);
      window.location.reload();
    }
  };

  return (
    <TenantContext.Provider
      value={{
        organizations,
        currentOrganization,
        activeTenantId: currentOrganization?.id || 'org_quant_fund',
        switchOrganization,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => useContext(TenantContext);

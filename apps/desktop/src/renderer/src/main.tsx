import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { CaseStatus } from '@blackbox/shared';
import './i18n';
import './style.css';

type CaseRow = { id: string; title: string; status: CaseStatus; createdAt: string };
const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';
const queryClient = new QueryClient();

function Cases() {
  const { t, i18n } = useTranslation();
  const cases = useQuery({ queryKey: ['cases'], queryFn: async (): Promise<CaseRow[]> => {
    const response = await fetch(`${apiBase}/cases`);
    if (!response.ok) throw new Error('API request failed');
    return response.json() as Promise<CaseRow[]>;
  } });
  return <main>
    <header><div><small>GWDC 2026</small><h1>{t('title')}</h1></div>
      <label>{t('language')} <select value={i18n.language} onChange={(event) => { void i18n.changeLanguage(event.target.value); }}><option value="en">EN</option><option value="ko">KO</option></select></label>
    </header>
    <section><h2>{t('cases')}</h2>
      {cases.isPending ? <p>{t('loading')}</p> : cases.isError ? <p>{t('error')}</p> : cases.data.length === 0 ? <p>{t('empty')}</p> :
        <table><thead><tr><th>ID</th><th>{t('cases')}</th><th>{t('status')}</th><th>{t('created')}</th></tr></thead><tbody>
          {cases.data.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.title}</td><td>{item.status}</td><td>{format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm')}</td></tr>)}
        </tbody></table>}
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><HashRouter><Routes><Route path="*" element={<Cases />} /></Routes></HashRouter></QueryClientProvider></React.StrictMode>);

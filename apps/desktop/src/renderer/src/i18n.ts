import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

void i18n.use(initReactI18next).init({
  lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false },
  resources: {
    en: { translation: { title: 'Agent Financial Black Box', cases: 'Cases', empty: 'No cases yet.', loading: 'Loading cases…', error: 'Could not load cases.', status: 'Status', created: 'Created', language: 'Language' } },
    ko: { translation: { title: '에이전트 금융 블랙박스', cases: '케이스', empty: '아직 케이스가 없습니다.', loading: '케이스를 불러오는 중…', error: '케이스를 불러오지 못했습니다.', status: '상태', created: '생성일', language: '언어' } },
  },
});

export default i18n;

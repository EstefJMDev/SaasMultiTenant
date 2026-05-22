import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import es from "./locales/es.json";

// Inicializa i18n y detecta idioma desde el navegador,
// sin usar localStorage para cachear la selección.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "es"],
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    interpolation: {
      escapeValue: false,
    },
    detection: {
      // Solo navegador / headers, nada de localStorage.
      order: ["navigator"],
      caches: [],
    },
  });

export default i18n;

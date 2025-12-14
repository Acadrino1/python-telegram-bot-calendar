/**
 * Internationalization Manager - Rule 19 Compliance
 * Complete multi-language support with RTL, language detection, and dynamic loading
 */

const fs = require('fs').promises;
const path = require('path');

class InternationalizationManager {
  constructor() {
    this.translations = new Map();
    this.fallbackLanguage = 'en';
    this.supportedLanguages = new Set(['en', 'fr', 'es', 'ar', 'zh', 'ru', 'de', 'pt', 'ja', 'ko']);
    this.rtlLanguages = new Set(['ar', 'he', 'fa', 'ur']);
    this.userLanguages = new Map(); // Cache user language preferences
    this.translationCache = new Map();
    
    // Language detection patterns
    this.languagePatterns = {
      en: /\b(hello|hi|help|book|appointment|english)\b/i,
      fr: /\b(bonjour|salut|aide|réserver|rendez-vous|français)\b/i,
      es: /\b(hola|ayuda|reservar|cita|español)\b/i,
      ar: /[\u0600-\u06FF]/,
      zh: /[\u4e00-\u9fff]/,
      ru: /[\u0400-\u04FF]/,
      de: /\b(hallo|hilfe|buchen|termin|deutsch)\b/i,
      pt: /\b(olá|ajuda|reservar|consulta|português)\b/i,
      ja: /[\u3040-\u309F\u30A0-\u30FF]/,
      ko: /[\uAC00-\uD7AF]/
    };

    this.initialize();
  }

  /**
   * Initialize the internationalization system
   */
  async initialize() {
    try {
      await this.loadTranslations();
      await this.setupLanguageDetection();
      console.log('🌐 Internationalization manager initialized with', this.supportedLanguages.size, 'languages');
    } catch (error) {
      console.error('Failed to initialize i18n manager:', error);
    }
  }

  /**
   * Load all translation files
   */
  async loadTranslations() {
    const translationsDir = path.join(__dirname, '../../../config/translations');
    
    // Ensure translations directory exists
    try {
      await fs.access(translationsDir);
    } catch {
      await fs.mkdir(translationsDir, { recursive: true });
    }

    for (const lang of this.supportedLanguages) {
      try {
        const filePath = path.join(translationsDir, `${lang}.json`);
        
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const translations = JSON.parse(content);
          this.translations.set(lang, translations);
        } catch (error) {
          if (error.code === 'ENOENT') {
            // Create default translation file
            await this.createDefaultTranslationFile(lang, filePath);
          } else {
            console.error(`Error loading translations for ${lang}:`, error);
          }
        }
      } catch (error) {
        console.error(`Failed to process translations for ${lang}:`, error);
      }
    }

    // Load existing translations from bot for backward compatibility
    await this.loadExistingTranslations();
  }

  /**
   * Load existing translations from the bot's translations.js file
   */
  async loadExistingTranslations() {
    try {
      const existingTranslations = require('../../bot/translations');
      
      if (existingTranslations && existingTranslations.translations) {
        for (const [lang, translations] of Object.entries(existingTranslations.translations)) {
          if (this.supportedLanguages.has(lang)) {
            // Merge with any existing translations
            const current = this.translations.get(lang) || {};
            this.translations.set(lang, { ...current, ...translations });
          }
        }
      }
    } catch (error) {
      console.warn('Could not load existing translations:', error.message);
    }
  }

  /**
   * Create default translation file for a language
   */
  async createDefaultTranslationFile(lang, filePath) {
    const defaultTranslations = this.generateDefaultTranslations(lang);
    
    try {
      await fs.writeFile(filePath, JSON.stringify(defaultTranslations, null, 2), 'utf8');
      this.translations.set(lang, defaultTranslations);
      console.log(`Created default translations for ${lang}`);
    } catch (error) {
      console.error(`Failed to create translation file for ${lang}:`, error);
    }
  }

  /**
   * Generate default translations for a language
   */
  generateDefaultTranslations(lang) {
    const baseTranslations = {
      // Core messages
      welcome: this.getWelcomeMessage(lang),
      help: this.getHelpMessage(lang),
      error: this.getErrorMessage(lang),
      
      // Navigation
      back: this.getNavigationText(lang, 'back'),
      next: this.getNavigationText(lang, 'next'),
      cancel: this.getNavigationText(lang, 'cancel'),
      confirm: this.getNavigationText(lang, 'confirm'),
      
      // Booking
      book_appointment: this.getBookingText(lang, 'book_appointment'),
      select_date: this.getBookingText(lang, 'select_date'),
      select_time: this.getBookingText(lang, 'select_time'),
      booking_confirmed: this.getBookingText(lang, 'booking_confirmed'),
      
      // Language selection
      language_prompt: this.getLanguageText(lang, 'prompt'),
      language_selected: this.getLanguageText(lang, 'selected'),
      
      // RTL support marker
      _rtl: this.rtlLanguages.has(lang),
      _direction: this.rtlLanguages.has(lang) ? 'rtl' : 'ltr'
    };

    return baseTranslations;
  }

  /**
   * Get welcome message in specified language
   */
  getWelcomeMessage(lang) {
    const messages = {
      en: '📱 Welcome to Lodge Mobile Activations Bot!',
      fr: '📱 Bienvenue au Bot d\'Activations Mobile Lodge!',
      es: '📱 ¡Bienvenido al Bot de Activaciones Móviles Lodge!',
      ar: '📱 مرحباً بك في بوت تفعيل لودج موبايل!',
      zh: '📱 欢迎使用 Lodge Mobile 激活机器人！',
      ru: '📱 Добро пожаловать в бот Lodge Mobile Activations!',
      de: '📱 Willkommen beim Lodge Mobile Activations Bot!',
      pt: '📱 Bem-vindo ao Bot de Ativações Lodge Mobile!',
      ja: '📱 Lodge Mobile アクティベーションボットへようこそ！',
      ko: '📱 Lodge Mobile 활성화 봇에 오신 것을 환영합니다!'
    };
    
    return messages[lang] || messages.en;
  }

  /**
   * Get help message in specified language
   */
  getHelpMessage(lang) {
    const messages = {
      en: 'How can I help you today?',
      fr: 'Comment puis-je vous aider aujourd\'hui?',
      es: '¿Cómo puedo ayudarte hoy?',
      ar: 'كيف يمكنني مساعدتك اليوم؟',
      zh: '今天我可以为您做些什么？',
      ru: 'Чем могу помочь сегодня?',
      de: 'Wie kann ich Ihnen heute helfen?',
      pt: 'Como posso ajudá-lo hoje?',
      ja: '今日はどのようにお手伝いできますか？',
      ko: '오늘 어떻게 도와드릴까요?'
    };
    
    return messages[lang] || messages.en;
  }

  /**
   * Get error message in specified language
   */
  getErrorMessage(lang) {
    const messages = {
      en: '❌ An error occurred. Please try again.',
      fr: '❌ Une erreur s\'est produite. Veuillez réessayer.',
      es: '❌ Ocurrió un error. Por favor, intenta de nuevo.',
      ar: '❌ حدث خطأ. يرجى المحاولة مرة أخرى.',
      zh: '❌ 发生错误，请重试。',
      ru: '❌ Произошла ошибка. Пожалуйста, попробуйте снова.',
      de: '❌ Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
      pt: '❌ Ocorreu um erro. Por favor, tente novamente.',
      ja: '❌ エラーが発生しました。もう一度お試しください。',
      ko: '❌ 오류가 발생했습니다. 다시 시도해주세요.'
    };
    
    return messages[lang] || messages.en;
  }

  /**
   * Get navigation text
   */
  getNavigationText(lang, key) {
    const texts = {
      back: {
        en: '⬅️ Back', fr: '⬅️ Retour', es: '⬅️ Atrás',
        ar: '⬅️ رجوع', zh: '⬅️ 返回', ru: '⬅️ Назад',
        de: '⬅️ Zurück', pt: '⬅️ Voltar', ja: '⬅️ 戻る', ko: '⬅️ 뒤로'
      },
      next: {
        en: '➡️ Next', fr: '➡️ Suivant', es: '➡️ Siguiente',
        ar: '➡️ التالي', zh: '➡️ 下一个', ru: '➡️ Далее',
        de: '➡️ Weiter', pt: '➡️ Próximo', ja: '➡️ 次へ', ko: '➡️ 다음'
      },
      cancel: {
        en: '❌ Cancel', fr: '❌ Annuler', es: '❌ Cancelar',
        ar: '❌ إلغاء', zh: '❌ 取消', ru: '❌ Отмена',
        de: '❌ Abbrechen', pt: '❌ Cancelar', ja: '❌ キャンセル', ko: '❌ 취소'
      },
      confirm: {
        en: '✅ Confirm', fr: '✅ Confirmer', es: '✅ Confirmar',
        ar: '✅ تأكيد', zh: '✅ 确认', ru: '✅ Подтвердить',
        de: '✅ Bestätigen', pt: '✅ Confirmar', ja: '✅ 確認', ko: '✅ 확인'
      }
    };
    
    return texts[key]?.[lang] || texts[key]?.en || key;
  }

  /**
   * Get booking text
   */
  getBookingText(lang, key) {
    const texts = {
      book_appointment: {
        en: '📅 Book Appointment', fr: '📅 Réserver un Rendez-vous',
        es: '📅 Reservar Cita', ar: '📅 حجز موعد',
        zh: '📅 预约', ru: '📅 Записаться',
        de: '📅 Termin buchen', pt: '📅 Agendar Consulta',
        ja: '📅 予約する', ko: '📅 예약하기'
      },
      select_date: {
        en: '📅 Please select a date', fr: '📅 Veuillez sélectionner une date',
        es: '📅 Por favor selecciona una fecha', ar: '📅 يرجى اختيار التاريخ',
        zh: '📅 请选择日期', ru: '📅 Пожалуйста, выберите дату',
        de: '📅 Bitte wählen Sie ein Datum', pt: '📅 Por favor, selecione uma data',
        ja: '📅 日付を選択してください', ko: '📅 날짜를 선택해주세요'
      },
      select_time: {
        en: '🕐 Select a time', fr: '🕐 Sélectionnez une heure',
        es: '🕐 Selecciona una hora', ar: '🕐 اختر الوقت',
        zh: '🕐 选择时间', ru: '🕐 Выберите время',
        de: '🕐 Wählen Sie eine Zeit', pt: '🕐 Selecione um horário',
        ja: '🕐 時間を選択', ko: '🕐 시간을 선택하세요'
      },
      booking_confirmed: {
        en: '✅ Appointment confirmed!', fr: '✅ Rendez-vous confirmé!',
        es: '✅ ¡Cita confirmada!', ar: '✅ تم تأكيد الموعد!',
        zh: '✅ 预约确认！', ru: '✅ Запись подтверждена!',
        de: '✅ Termin bestätigt!', pt: '✅ Consulta confirmada!',
        ja: '✅ 予約が確定しました！', ko: '✅ 예약이 확정되었습니다!'
      }
    };
    
    return texts[key]?.[lang] || texts[key]?.en || key;
  }

  /**
   * Get language-specific text
   */
  getLanguageText(lang, key) {
    const texts = {
      prompt: {
        en: '🌐 Please select your preferred language',
        fr: '🌐 Veuillez choisir votre langue préférée',
        es: '🌐 Por favor selecciona tu idioma preferido',
        ar: '🌐 يرجى اختيار لغتك المفضلة',
        zh: '🌐 请选择您的首选语言',
        ru: '🌐 Пожалуйста, выберите предпочитаемый язык',
        de: '🌐 Bitte wählen Sie Ihre bevorzugte Sprache',
        pt: '🌐 Por favor, selecione seu idioma preferido',
        ja: '🌐 言語を選択してください',
        ko: '🌐 선호하는 언어를 선택해주세요'
      },
      selected: {
        en: '✅ Language set to English',
        fr: '✅ Langue définie en français',
        es: '✅ Idioma configurado en español',
        ar: '✅ تم تعيين اللغة إلى العربية',
        zh: '✅ 语言已设置为中文',
        ru: '✅ Язык установлен на русский',
        de: '✅ Sprache auf Deutsch eingestellt',
        pt: '✅ Idioma definido para português',
        ja: '✅ 言語が日本語に設定されました',
        ko: '✅ 언어가 한국어로 설정되었습니다'
      }
    };
    
    return texts[key]?.[lang] || texts[key]?.en || key;
  }

  /**
   * Setup language detection system
   */
  async setupLanguageDetection() {
    // Language detection is ready
    console.log('🔍 Language detection system ready');
  }

  /**
   * Detect user language from message
   */
  detectLanguage(message, userId = null) {
    if (!message || typeof message !== 'string') {
      return this.fallbackLanguage;
    }

    // Check if user has cached language preference
    if (userId && this.userLanguages.has(userId)) {
      return this.userLanguages.get(userId);
    }

    // Detect based on patterns
    for (const [lang, pattern] of Object.entries(this.languagePatterns)) {
      if (pattern.test(message)) {
        if (userId) {
          this.userLanguages.set(userId, lang);
        }
        return lang;
      }
    }

    return this.fallbackLanguage;
  }

  /**
   * Get user language preference
   */
  getUserLanguage(userId) {
    return this.userLanguages.get(userId) || this.fallbackLanguage;
  }

  /**
   * Set user language preference
   */
  setUserLanguage(userId, language) {
    if (this.supportedLanguages.has(language)) {
      this.userLanguages.set(userId, language);
      return true;
    }
    return false;
  }

  /**
   * Get localized text
   */
  getText(key, language = null, params = {}) {
    if (!language) {
      language = this.fallbackLanguage;
    }

    // Check cache first
    const cacheKey = `${language}:${key}`;
    if (this.translationCache.has(cacheKey)) {
      let text = this.translationCache.get(cacheKey);
      return this.interpolateParams(text, params);
    }

    // Get translation
    const langTranslations = this.translations.get(language);
    let text = langTranslations?.[key];

    // Fallback to English if not found
    if (!text && language !== this.fallbackLanguage) {
      const fallbackTranslations = this.translations.get(this.fallbackLanguage);
      text = fallbackTranslations?.[key];
    }

    // Final fallback to key itself
    if (!text) {
      text = key;
    }

    // Cache the result
    this.translationCache.set(cacheKey, text);

    // Interpolate parameters
    return this.interpolateParams(text, params);
  }

  /**
   * Interpolate parameters into text
   */
  interpolateParams(text, params) {
    if (!params || Object.keys(params).length === 0) {
      return text;
    }

    return text.replace(/{(\w+)}/g, (match, param) => {
      return params[param] !== undefined ? params[param] : match;
    });
  }

  /**
   * Check if language is RTL
   */
  isRTL(language) {
    return this.rtlLanguages.has(language);
  }

  /**
   * Get text direction for language
   */
  getTextDirection(language) {
    return this.isRTL(language) ? 'rtl' : 'ltr';
  }

  /**
   * Format text for RTL languages
   */
  formatForRTL(text, language) {
    if (!this.isRTL(language)) {
      return text;
    }

    // Add RTL mark for proper text display
    return `\u202B${text}\u202C`;
  }

  /**
   * Create language selection keyboard
   */
  createLanguageKeyboard() {
    const keyboard = [];
    const languageNames = {
      en: '🇺🇸 English',
      fr: '🇫🇷 Français',
      es: '🇪🇸 Español',
      ar: '🇸🇦 العربية',
      zh: '🇨🇳 中文',
      ru: '🇷🇺 Русский',
      de: '🇩🇪 Deutsch',
      pt: '🇵🇹 Português',
      ja: '🇯🇵 日本語',
      ko: '🇰🇷 한국어'
    };

    // Create rows of 2 languages each
    const languages = Array.from(this.supportedLanguages);
    for (let i = 0; i < languages.length; i += 2) {
      const row = [];
      
      for (let j = i; j < Math.min(i + 2, languages.length); j++) {
        const lang = languages[j];
        row.push({
          text: languageNames[lang] || lang.toUpperCase(),
          callback_data: `lang_${lang}`
        });
      }
      
      keyboard.push(row);
    }

    return {
      inline_keyboard: keyboard
    };
  }

  /**
   * Handle language selection callback
   */
  async handleLanguageSelection(ctx) {
    const callbackData = ctx.callbackQuery.data;
    const selectedLang = callbackData.replace('lang_', '');
    const userId = ctx.from.id;

    if (this.supportedLanguages.has(selectedLang)) {
      this.setUserLanguage(userId, selectedLang);
      
      const confirmationText = this.getText('language_selected', selectedLang);
      
      await ctx.editMessageText(confirmationText, {
        parse_mode: 'Markdown'
      });
      
      await ctx.answerCbQuery();
      
      // Emit language change event
      return { success: true, language: selectedLang };
    } else {
      await ctx.answerCbQuery('Invalid language selection');
      return { success: false, error: 'Invalid language' };
    }
  }

  /**
   * Get localized date format
   */
  getDateFormat(language) {
    const formats = {
      en: 'MM/DD/YYYY',
      fr: 'DD/MM/YYYY',
      es: 'DD/MM/YYYY',
      ar: 'DD/MM/YYYY',
      zh: 'YYYY/MM/DD',
      ru: 'DD.MM.YYYY',
      de: 'DD.MM.YYYY',
      pt: 'DD/MM/YYYY',
      ja: 'YYYY/MM/DD',
      ko: 'YYYY/MM/DD'
    };
    
    return formats[language] || formats.en;
  }

  /**
   * Get localized time format
   */
  getTimeFormat(language) {
    const formats = {
      en: '12h', // 12-hour format
      fr: '24h', // 24-hour format
      es: '24h',
      ar: '12h',
      zh: '24h',
      ru: '24h',
      de: '24h',
      pt: '24h',
      ja: '24h',
      ko: '24h'
    };
    
    return formats[language] || formats.en;
  }

  /**
   * Format date according to user's language
   */
  formatDate(date, language) {
    const locale = this.getLocale(language);
    
    try {
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(date);
    } catch (error) {
      // Fallback to ISO format
      return date.toISOString().split('T')[0];
    }
  }

  /**
   * Format time according to user's language
   */
  formatTime(date, language) {
    const locale = this.getLocale(language);
    const hour12 = this.getTimeFormat(language) === '12h';
    
    try {
      return new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12
      }).format(date);
    } catch (error) {
      // Fallback
      return hour12 
        ? date.toLocaleTimeString('en-US', { hour12: true })
        : date.toTimeString().slice(0, 5);
    }
  }

  /**
   * Get locale string for language
   */
  getLocale(language) {
    const locales = {
      en: 'en-US',
      fr: 'fr-FR',
      es: 'es-ES',
      ar: 'ar-SA',
      zh: 'zh-CN',
      ru: 'ru-RU',
      de: 'de-DE',
      pt: 'pt-PT',
      ja: 'ja-JP',
      ko: 'ko-KR'
    };
    
    return locales[language] || locales.en;
  }

  /**
   * Get translation statistics
   */
  getTranslationStats() {
    const stats = {
      supportedLanguages: Array.from(this.supportedLanguages),
      rtlLanguages: Array.from(this.rtlLanguages),
      activeUsers: this.userLanguages.size,
      cacheSize: this.translationCache.size,
      translationCounts: {}
    };

    // Count translations per language
    for (const [lang, translations] of this.translations) {
      stats.translationCounts[lang] = Object.keys(translations).length;
    }

    // Language usage stats
    const languageUsage = {};
    for (const lang of this.userLanguages.values()) {
      languageUsage[lang] = (languageUsage[lang] || 0) + 1;
    }
    stats.languageUsage = languageUsage;

    return stats;
  }

  /**
   * Clear translation cache
   */
  clearCache() {
    this.translationCache.clear();
    console.log('🗑️ Translation cache cleared');
  }

  /**
   * Add or update translation
   */
  addTranslation(language, key, value) {
    if (!this.supportedLanguages.has(language)) {
      return false;
    }

    if (!this.translations.has(language)) {
      this.translations.set(language, {});
    }

    const langTranslations = this.translations.get(language);
    langTranslations[key] = value;

    // Clear cache for this key
    const cacheKey = `${language}:${key}`;
    this.translationCache.delete(cacheKey);

    return true;
  }

  /**
   * Save translations to file
   */
  async saveTranslations(language) {
    if (!this.supportedLanguages.has(language)) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const translations = this.translations.get(language);
    if (!translations) {
      throw new Error(`No translations found for language: ${language}`);
    }

    const translationsDir = path.join(__dirname, '../../../config/translations');
    const filePath = path.join(translationsDir, `${language}.json`);

    await fs.writeFile(filePath, JSON.stringify(translations, null, 2), 'utf8');
    console.log(`💾 Saved translations for ${language} to ${filePath}`);
  }
}

module.exports = InternationalizationManager;
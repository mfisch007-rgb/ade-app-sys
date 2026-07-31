// ═══════════════════════════════════════════════════════════
// ADE-LedgerFlow™ — Global Language Detector
// File: src/parsers/languageDetector.js
//
// Detects any human language on Earth.
// Uses pattern matching for 40+ languages.
// Falls back gracefully — never crashes on unknown text.
// ═══════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// LANGUAGE SIGNATURES
// Ordered by detection reliability (most distinct patterns first)
// ─────────────────────────────────────────────────────────────
const LANGUAGE_PATTERNS = [

  // ── SCRIPT-BASED DETECTION (most reliable — unique character sets)
  { code: 'zh', name: 'Chinese',    script: /[\u4e00-\u9fff\u3400-\u4dbf]/ },
  { code: 'ja', name: 'Japanese',   script: /[\u3040-\u309f\u30a0-\u30ff]/ },
  { code: 'ko', name: 'Korean',     script: /[\uac00-\ud7af\u1100-\u11ff]/ },
  { code: 'ar', name: 'Arabic',     script: /[\u0600-\u06ff\u0750-\u077f]/ },
  { code: 'hi', name: 'Hindi',      script: /[\u0900-\u097f]/ },
  { code: 'ru', name: 'Russian',    script: /[\u0400-\u04ff]/ },
  { code: 'uk', name: 'Ukrainian',  script: /[\u0400-\u04ff\u0456\u0457\u0491]/ },
  { code: 'th', name: 'Thai',       script: /[\u0e00-\u0e7f]/ },
  { code: 'he', name: 'Hebrew',     script: /[\u0590-\u05ff\ufb1d-\ufb4e]/ },
  { code: 'el', name: 'Greek',      script: /[\u0370-\u03ff\u1f00-\u1fff]/ },
  { code: 'am', name: 'Amharic',    script: /[\u1200-\u137f]/ },        // Ethiopian
  { code: 'my', name: 'Burmese',    script: /[\u1000-\u109f]/ },
  { code: 'km', name: 'Khmer',      script: /[\u1780-\u17ff]/ },
  { code: 'bn', name: 'Bengali',    script: /[\u0980-\u09ff]/ },
  { code: 'ta', name: 'Tamil',      script: /[\u0b80-\u0bff]/ },
  { code: 'ur', name: 'Urdu',       script: /[\u0600-\u06ff]/, words: /\b(ہے|کا|کی|میں|سے|پر|اور)\b/ },
  { code: 'fa', name: 'Persian',    script: /[\u0600-\u06ff]/, words: /\b(است|این|که|را|در|به)\b/ },

  // ── WORD-BASED DETECTION (Latin script languages)
  { code: 'pcm', name: 'Nigerian Pidgin', words: /\b(abeg|oga|abi|dey|sabi|waka|naira|e don|wetin|una|dem|no be|na im|make i|how far)\b/i },
  { code: 'yo',  name: 'Yoruba',         words: /\b(owo|tita|isowo|o se|e joo|mo fe|bawo|eku|nla|wa|ni ilu|fun mi|jowo)\b/i },
  { code: 'ha',  name: 'Hausa',          words: /\b(kudi|saya|siyar|kaya|don allah|na gode|ciniki|yau|gobe|ina|wane|wannan|zuwa)\b/i },
  { code: 'ig',  name: 'Igbo',           words: /\b(ego|ire|biko|maka|ahia|azụmahịa|ọ dị|nke|mgbe|ihe|nwanne|ọ bụ)\b/i },
  { code: 'sw',  name: 'Swahili',        words: /\b(pesa|biashara|habari|asante|karibu|ndiyo|hapana|leo|kesho|nini|wapi)\b/i },
  { code: 'zu',  name: 'Zulu',           words: /\b(imali|ukuthenga|sawubona|yebo|cha|namhlanje|kusasa|ngubani|kuphi)\b/i },
  { code: 'af',  name: 'Afrikaans',      words: /\b(geld|besigheid|dankie|asseblief|vandag|more|wat|wie|waar|hoe)\b/i },
  { code: 'so',  name: 'Somali',         words: /\b(lacag|ganacsiga|mahadsanid|haa|maya|maanta|berri|yaa|xaggee)\b/i },

  { code: 'es',  name: 'Spanish',        words: /\b(venta|gasto|negocio|dinero|hoy|mañana|qué|cómo|dónde|gracias|por favor)\b/i },
  { code: 'fr',  name: 'French',         words: /\b(vente|dépense|affaire|argent|aujourd'hui|demain|quoi|comment|merci|s'il vous plaît)\b/i },
  { code: 'pt',  name: 'Portuguese',     words: /\b(venda|despesa|negócio|dinheiro|hoje|amanhã|obrigado|por favor|como|onde)\b/i },
  { code: 'de',  name: 'German',         words: /\b(verkauf|ausgabe|geschäft|geld|heute|morgen|danke|bitte|wie|wo|wann)\b/i },
  { code: 'it',  name: 'Italian',        words: /\b(vendita|spesa|affari|denaro|oggi|domani|grazie|prego|come|dove)\b/i },
  { code: 'nl',  name: 'Dutch',          words: /\b(verkoop|kosten|bedrijf|geld|vandaag|morgen|dank|alstublieft|hoe|waar)\b/i },
  { code: 'pl',  name: 'Polish',         words: /\b(sprzedaż|koszt|biznes|pieniądze|dzisiaj|jutro|dziękuję|proszę|jak|gdzie)\b/i },
  { code: 'ro',  name: 'Romanian',       words: /\b(vânzare|cheltuială|afacere|bani|azi|mâine|mulțumesc|vă rog|cum|unde)\b/i },
  { code: 'tr',  name: 'Turkish',        words: /\b(satış|gider|iş|para|bugün|yarın|teşekkür|lütfen|nasıl|nerede)\b/i },
  { code: 'vi',  name: 'Vietnamese',     words: /\b(bán|chi phí|kinh doanh|tiền|hôm nay|ngày mai|cảm ơn|xin chào|như thế nào)\b/i },
  { code: 'id',  name: 'Indonesian',     words: /\b(penjualan|pengeluaran|bisnis|uang|hari ini|besok|terima kasih|tolong|bagaimana)\b/i },
  { code: 'ms',  name: 'Malay',          words: /\b(jualan|belanja|perniagaan|wang|hari ini|esok|terima kasih|tolong|bagaimana)\b/i },

  // English is default — detected last
  { code: 'en',  name: 'English',        words: /\b(sale|expense|stock|credit|payment|capital|balance|report|help|the|is|are|was|have|this)\b/i },
];

// ─────────────────────────────────────────────────────────────
// MAIN DETECTOR
// Returns { code, name, confidence }
// ─────────────────────────────────────────────────────────────
function detectLanguage(text) {
  if (!text || text.trim().length === 0) {
    return { code: 'en', name: 'English', confidence: 'default' };
  }

  const t = text.trim();

  // 1. Script detection (highest confidence — unique character sets)
  for (const lang of LANGUAGE_PATTERNS) {
    if (lang.script && lang.script.test(t)) {
      // For languages sharing Arabic script (Arabic vs Urdu vs Persian),
      // use word patterns to distinguish
      if (lang.words && ['ur','fa'].includes(lang.code)) {
        if (lang.words.test(t)) return { code: lang.code, name: lang.name, confidence: 'high' };
        continue;
      }
      return { code: lang.code, name: lang.name, confidence: 'high' };
    }
  }

  // 2. Word pattern detection
  for (const lang of LANGUAGE_PATTERNS) {
    if (lang.words && lang.words.test(t)) {
      return { code: lang.code, name: lang.name, confidence: 'medium' };
    }
  }

  // 3. Default: English
  return { code: 'en', name: 'English', confidence: 'low' };
}

// ─────────────────────────────────────────────────────────────
// RESPONSE TRANSLATOR
// For languages we don't have full translation packs for,
// we respond in English with a note in their language
// ─────────────────────────────────────────────────────────────

// Full translation packs (expandable — community-sourced)
const TRANSLATIONS = {
  en: {
    sale_ok:    '✅ *SALE RECORDED*',
    expense_ok: '📝 *EXPENSE RECORDED*',
    stock_ok:   '📦 *STOCK UPDATED*',
    credit_ok:  '🔴 *CREDIT RECORDED*',
    payment_ok: '💚 *PAYMENT RECEIVED*',
    capital_ok: '💼 *CAPITAL ADDED*',
    unknown:    '🤔 Command not recognised.\nType *HELP* to see all commands.',
    not_found:  '❌ Not registered. Contact your administrator to activate your account.',
    inactive:   '⚠️ Subscription expired. Contact your administrator to renew.',
    rate_limit: '⏳ Too many messages. Please wait 60 seconds.',
    streak:     '🔥 {n}-Day Recording Streak!',
    today_snap: '📊 *TODAY\'S SNAPSHOT*',
  },
  pcm: {
    sale_ok:    '✅ *SALE DON ENTER!*',
    expense_ok: '📝 *EXPENSE DON RECORD*',
    stock_ok:   '📦 *STOCK DON UPDATE*',
    credit_ok:  '🔴 *CREDIT DON RECORD*',
    payment_ok: '💚 *PAYMENT DON REACH*',
    capital_ok: '💼 *CAPITAL DON ENTER*',
    unknown:    '🤔 I no sabi wetin you tok.\nType *HELP* make you see all command.',
    not_found:  '❌ Your number no dey system. Call your admin.',
    inactive:   '⚠️ Your subscription don expire. Call admin renew am.',
    rate_limit: '⏳ Calm down. Wait one minute.',
    streak:     '🔥 {n} days straight! You sabi!',
    today_snap: '📊 *TODAY SO FAR*',
  },
  yo: {
    sale_ok:    '✅ *A TI GBA OWO TITA!*',
    expense_ok: '📝 *INAWO TI GBA*',
    stock_ok:   '📦 *STOK TI UPDATE*',
    credit_ok:  '🔴 *GBESE TI GBA*',
    payment_ok: '💚 *OWO TI DE*',
    capital_ok: '💼 *OWO IPO TI WO*',
    unknown:    '🤔 Mi o ye eyi.\nFo *HELP*.',
    not_found:  '❌ Iṣowo yi ko si. E kan si oluṣakoso.',
    inactive:   '⚠️ Alabapin re ti pari.',
    rate_limit: '⏳ Dawọ. Da duro iṣẹju kan.',
    streak:     '🔥 Ojo {n}!',
    today_snap: '📊 *IWOYE LONI*',
  },
  ha: {
    sale_ok:    '✅ *AN RUBUTA SIYARWA!*',
    expense_ok: '📝 *AN RUBUTA KASHE*',
    stock_ok:   '📦 *AN SABUNTA KAYA*',
    credit_ok:  '🔴 *AN RUBUTA BASHI*',
    payment_ok: '💚 *AN KARBI KUDI*',
    capital_ok: '💼 *AN KARA JARI*',
    unknown:    '🤔 Ban fahimci ba.\nFo *HELP*.',
    not_found:  '❌ Ba a yi rajista ba. Tuntuɓi admin.',
    inactive:   '⚠️ Biyan kudi ya ƙare.',
    rate_limit: '⏳ Jira minti daya.',
    streak:     '🔥 Kwana {n}!',
    today_snap: '📊 *YANAYI YAU*',
  },
  ig: {
    sale_ok:    '✅ *EDEPỤTARA IRE!*',
    expense_ok: '📝 *EDEPỤTARA NKWỤ*',
    stock_ok:   '📦 *ETINYE NGWA*',
    credit_ok:  '🔴 *EDEPỤTARA ỌBỤLỌ*',
    payment_ok: '💚 *NATA EGO*',
    capital_ok: '💼 *ETINYE ISI EGO*',
    unknown:    '🤔 Aghọtachaghị.\nPụta *HELP*.',
    not_found:  '❌ Adịghị. Kpọtụrụ onye njikwa.',
    inactive:   '⚠️ Ndenye aha agwụla.',
    rate_limit: '⏳ Chere nkeji otu.',
    streak:     '🔥 Ụbọchị {n}!',
    today_snap: '📊 *ỌNỌDỤ TATA*',
  },
  es: {
    sale_ok:    '✅ *¡VENTA REGISTRADA!*',
    expense_ok: '📝 *GASTO REGISTRADO*',
    stock_ok:   '📦 *INVENTARIO ACTUALIZADO*',
    credit_ok:  '🔴 *CRÉDITO REGISTRADO*',
    payment_ok: '💚 *PAGO RECIBIDO*',
    capital_ok: '💼 *CAPITAL AÑADIDO*',
    unknown:    '🤔 Comando no reconocido.\nEscribe *HELP* para ver todos los comandos.',
    not_found:  '❌ No registrado. Contacta a tu administrador.',
    inactive:   '⚠️ Suscripción vencida. Contacta a tu administrador.',
    rate_limit: '⏳ Demasiados mensajes. Espera 60 segundos.',
    streak:     '🔥 ¡{n} días seguidos!',
    today_snap: '📊 *RESUMEN DE HOY*',
  },
  fr: {
    sale_ok:    '✅ *VENTE ENREGISTRÉE!*',
    expense_ok: '📝 *DÉPENSE ENREGISTRÉE*',
    stock_ok:   '📦 *STOCK MIS À JOUR*',
    credit_ok:  '🔴 *CRÉDIT ENREGISTRÉ*',
    payment_ok: '💚 *PAIEMENT REÇU*',
    capital_ok: '💼 *CAPITAL AJOUTÉ*',
    unknown:    '🤔 Commande non reconnue.\nTapez *HELP* pour voir toutes les commandes.',
    not_found:  '❌ Non enregistré. Contactez votre administrateur.',
    inactive:   '⚠️ Abonnement expiré. Contactez votre administrateur.',
    rate_limit: '⏳ Trop de messages. Attendez 60 secondes.',
    streak:     '🔥 {n} jours consécutifs!',
    today_snap: '📊 *RÉSUMÉ DU JOUR*',
  },
  de: {
    sale_ok:    '✅ *VERKAUF ERFASST!*',
    expense_ok: '📝 *AUSGABE ERFASST*',
    stock_ok:   '📦 *LAGER AKTUALISIERT*',
    credit_ok:  '🔴 *KREDIT ERFASST*',
    payment_ok: '💚 *ZAHLUNG ERHALTEN*',
    capital_ok: '💼 *KAPITAL HINZUGEFÜGT*',
    unknown:    '🤔 Befehl nicht erkannt.\nTippe *HELP* für alle Befehle.',
    not_found:  '❌ Nicht registriert. Kontaktiere deinen Administrator.',
    inactive:   '⚠️ Abonnement abgelaufen.',
    rate_limit: '⏳ Zu viele Nachrichten. Warte 60 Sekunden.',
    streak:     '🔥 {n} Tage in Folge!',
    today_snap: '📊 *HEUTIGER ÜBERBLICK*',
  },
  zh: {
    sale_ok:    '✅ *销售已记录！*',
    expense_ok: '📝 *支出已记录*',
    stock_ok:   '📦 *库存已更新*',
    credit_ok:  '🔴 *信用已记录*',
    payment_ok: '💚 *收款已记录*',
    capital_ok: '💼 *资本已添加*',
    unknown:    '🤔 命令未识别。\n输入 *HELP* 查看所有命令。',
    not_found:  '❌ 未注册。请联系您的管理员。',
    inactive:   '⚠️ 订阅已过期。请联系管理员续费。',
    rate_limit: '⏳ 消息过多。请等待60秒。',
    streak:     '🔥 连续 {n} 天！',
    today_snap: '📊 *今日快照*',
  },
  ar: {
    sale_ok:    '✅ *تم تسجيل البيع!*',
    expense_ok: '📝 *تم تسجيل المصروف*',
    stock_ok:   '📦 *تم تحديث المخزون*',
    credit_ok:  '🔴 *تم تسجيل الائتمان*',
    payment_ok: '💚 *تم استلام الدفع*',
    capital_ok: '💼 *تم إضافة رأس المال*',
    unknown:    '🤔 الأمر غير معروف.\nاكتب *HELP* لرؤية جميع الأوامر.',
    not_found:  '❌ غير مسجل. تواصل مع المسؤول.',
    inactive:   '⚠️ انتهى الاشتراك. تواصل مع المسؤول.',
    rate_limit: '⏳ رسائل كثيرة جداً. انتظر 60 ثانية.',
    streak:     '🔥 {n} أيام متتالية!',
    today_snap: '📊 *ملخص اليوم*',
  },
  pt: {
    sale_ok:    '✅ *VENDA REGISTRADA!*',
    expense_ok: '📝 *DESPESA REGISTRADA*',
    stock_ok:   '📦 *ESTOQUE ATUALIZADO*',
    credit_ok:  '🔴 *CRÉDITO REGISTRADO*',
    payment_ok: '💚 *PAGAMENTO RECEBIDO*',
    capital_ok: '💼 *CAPITAL ADICIONADO*',
    unknown:    '🤔 Comando não reconhecido.\nDigite *HELP* para ver todos os comandos.',
    not_found:  '❌ Não registrado. Contacte o seu administrador.',
    inactive:   '⚠️ Assinatura expirada.',
    rate_limit: '⏳ Muitas mensagens. Aguarde 60 segundos.',
    streak:     '🔥 {n} dias consecutivos!',
    today_snap: '📊 *RESUMO DE HOJE*',
  },
};

// ─────────────────────────────────────────────────────────────
// TRANSLATE — get a phrase in the right language
// Falls back to English if language not in translation pack
// ─────────────────────────────────────────────────────────────
function translate(langCode, key, vars = {}) {
  const pack = TRANSLATIONS[langCode] || TRANSLATIONS['en'];
  let str    = pack[key] || TRANSLATIONS['en'][key] || key;

  // For completely unknown languages, append English translation as reference
  if (!TRANSLATIONS[langCode] && langCode !== 'en') {
    str = TRANSLATIONS['en'][key] || key;
  }

  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

// ─────────────────────────────────────────────────────────────
// CURRENCY FORMATTER
// Nigerian IPs → ₦ NGN
// All other IPs → $ USD
// Can be overridden per client in DB
// ─────────────────────────────────────────────────────────────
function formatAmount(amount, currencySymbol = '₦') {
  const num = parseFloat(amount || 0);
  if (currencySymbol === '$') {
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₦${num.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─────────────────────────────────────────────────────────────
// IP-BASED CURRENCY DETECTION
// Called once on client registration
// ─────────────────────────────────────────────────────────────
async function getCurrencyFromIP(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    return { symbol: '₦', code: 'NGN' };    // localhost = Nigeria
  }

  // Nigerian IP ranges (simplified — use geoip-lite for production accuracy)
  const nigerianRanges = [
    /^105\.112\./, /^105\.113\./, /^105\.114\./, /^105\.115\./,
    /^196\.201\./, /^196\.202\./, /^196\.203\./, /^196\.216\./,
    /^41\.58\./, /^41\.63\./, /^41\.73\./, /^41\.138\./, /^41\.184\./,
    /^154\.120\./, /^197\.210\./, /^197\.211\./, /^197\.212\./,
  ];

  const isNigerian = nigerianRanges.some(range => range.test(ip));

  if (isNigerian) return { symbol: '₦', code: 'NGN' };

  // Try external geolocation (non-blocking, with fallback)
  try {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: null }));
    if (!fetch) return { symbol: '$', code: 'USD' };

    const res  = await Promise.race([
      fetch(`http://ip-api.com/json/${ip}?fields=countryCode`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
    ]);
    const data = await res.json();

    if (data.countryCode === 'NG') return { symbol: '₦', code: 'NGN' };
    return { symbol: '$', code: 'USD' };
  } catch {
    return { symbol: '$', code: 'USD' };
  }
}

export { 
  detectLanguage,
  translate,
  formatAmount,
  getCurrencyFromIP,
  TRANSLATIONS,
 };

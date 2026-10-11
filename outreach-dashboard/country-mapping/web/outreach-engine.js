(function exposeOutreachEngine(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.OutreachEngine = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createOutreachEngine(root) {
  'use strict';

  const STATES = Object.freeze({
    PROFILE_SCORED: 'profile_scored',
    TARGET_VERIFIED: 'target_verified',
    POST_LIKED: 'post_liked',
    ACCOUNT_FOLLOWED: 'account_followed',
    APPROVAL_PENDING: 'approval_pending',
    APPROVED: 'approved',
    SENT_CONFIRMED: 'sent_confirmed',
    OUTCOME_PENDING: 'outcome_pending',
    REROUTED: 'rerouted',
    SCHEDULED: 'scheduled',
    AUTO_SKIPPED: 'auto_skipped',
    SEND_UNCONFIRMED: 'send_unconfirmed',
  });

  const STATE_VALUES = new Set(Object.values(STATES));
  const ALLOWED_TRANSITIONS = Object.freeze({
    [STATES.PROFILE_SCORED]: [
      STATES.TARGET_VERIFIED,
      STATES.REROUTED,
      STATES.SCHEDULED,
      STATES.AUTO_SKIPPED,
    ],
    [STATES.TARGET_VERIFIED]: [
      STATES.POST_LIKED,
      STATES.REROUTED,
      STATES.SCHEDULED,
      STATES.AUTO_SKIPPED,
    ],
    [STATES.POST_LIKED]: [
      STATES.ACCOUNT_FOLLOWED,
      STATES.REROUTED,
      STATES.SCHEDULED,
      STATES.AUTO_SKIPPED,
    ],
    [STATES.ACCOUNT_FOLLOWED]: [
      STATES.APPROVAL_PENDING,
      STATES.REROUTED,
      STATES.SCHEDULED,
      STATES.AUTO_SKIPPED,
    ],
    [STATES.APPROVAL_PENDING]: [
      STATES.APPROVED,
      STATES.REROUTED,
      STATES.SCHEDULED,
      STATES.AUTO_SKIPPED,
    ],
    [STATES.APPROVED]: [
      STATES.SENT_CONFIRMED,
      STATES.SEND_UNCONFIRMED,
      STATES.REROUTED,
      STATES.SCHEDULED,
      STATES.AUTO_SKIPPED,
    ],
    [STATES.SENT_CONFIRMED]: [STATES.OUTCOME_PENDING],
    [STATES.SEND_UNCONFIRMED]: [
      STATES.REROUTED,
      STATES.SCHEDULED,
      STATES.AUTO_SKIPPED,
    ],
    [STATES.OUTCOME_PENDING]: [STATES.SCHEDULED],
    [STATES.REROUTED]: [],
    [STATES.SCHEDULED]: [],
    [STATES.AUTO_SKIPPED]: [],
  });

  const EUROPE_MARKERS = new Set([
    'europe', 'eu',
    'albania', 'al', 'alb',
    'andorra', 'ad', 'and',
    'armenia', 'am', 'arm',
    'austria', 'at', 'aut',
    'azerbaijan', 'az', 'aze',
    'belarus', 'by', 'blr',
    'belgium', 'be', 'bel',
    'bosnia and herzegovina', 'ba', 'bih',
    'bulgaria', 'bg', 'bgr',
    'croatia', 'hr', 'hrv',
    'cyprus', 'cy', 'cyp',
    'czechia', 'czech republic', 'cz', 'cze',
    'denmark', 'dk', 'dnk',
    'estonia', 'ee', 'est',
    'finland', 'fi', 'fin',
    'france', 'fr', 'fra',
    'georgia', 'ge', 'geo',
    'germany', 'de', 'deu',
    'greece', 'gr', 'grc',
    'hungary', 'hu', 'hun',
    'iceland', 'is', 'isl',
    'ireland', 'ie', 'irl',
    'italy', 'it', 'ita',
    'kosovo', 'xk', 'xkx',
    'latvia', 'lv', 'lva',
    'liechtenstein', 'li', 'lie',
    'lithuania', 'lt', 'ltu',
    'luxembourg', 'lu', 'lux',
    'malta', 'mt', 'mlt',
    'moldova', 'md', 'mda',
    'monaco', 'mc', 'mco',
    'montenegro', 'me', 'mne',
    'netherlands', 'nl', 'nld',
    'north macedonia', 'mk', 'mkd',
    'norway', 'no', 'nor',
    'poland', 'pl', 'pol',
    'portugal', 'pt', 'prt',
    'romania', 'ro', 'rou',
    'russia', 'russian federation', 'ru', 'rus',
    'san marino', 'sm', 'smr',
    'serbia', 'rs', 'srb',
    'slovakia', 'sk', 'svk',
    'slovenia', 'si', 'svn',
    'spain', 'es', 'esp',
    'sweden', 'se', 'swe',
    'switzerland', 'ch', 'che',
    'turkey', 'turkiye', 'tr', 'tur',
    'ukraine', 'ua', 'ukr',
    'united kingdom', 'great britain', 'uk', 'gb', 'gbr',
    'vatican city', 'holy see', 'va', 'vat',
    '英国', '德国', '法国', '意大利', '西班牙', '葡萄牙', '荷兰', '比利时',
    '卢森堡', '爱尔兰', '奥地利', '瑞士', '波兰', '捷克', '斯洛伐克',
    '匈牙利', '罗马尼亚', '保加利亚', '希腊', '克罗地亚', '斯洛文尼亚',
    '塞尔维亚', '黑山', '北马其顿', '阿尔巴尼亚', '波黑', '爱沙尼亚',
    '拉脱维亚', '立陶宛', '芬兰', '瑞典', '挪威', '丹麦', '冰岛',
    '马耳他', '塞浦路斯', '乌克兰', '摩尔多瓦', '格鲁吉亚', '亚美尼亚',
    '阿塞拜疆', '土耳其',
  ]);
  const OPEN_MARKET_STATUSES = new Set(['open', '开放', 'available']);
  const EXCLUSIVE_MARKET_STATUSES = new Set([
    'exclusive_distributor',
    'exclusive distributor',
    '独代占用',
  ]);
  const PROHIBITED_URL_PARTS = [
    '/explore',
    '/search',
    '/reel/',
    '/reels/',
    '/watch',
  ];

  function clamp(value, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return minimum;
    }
    return Math.min(maximum, Math.max(minimum, number));
  }

  function roundScore(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  function hasNumericValue(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function normalizeTrend(trend) {
    const source = trend && typeof trend === 'object' ? trend : {};
    const region = typeof source.region === 'string' ? source.region : '';
    const period = typeof source.period === 'string' ? source.period : '';
    const collectedAt = typeof source.collectedAt === 'string' ? source.collectedAt : '';
    const direction = ['rising', 'stable', 'falling', 'unknown'].includes(source.direction)
      ? source.direction
      : 'unknown';
    const complete = source.status === 'available'
      && region
      && period
      && collectedAt
      && hasNumericValue(source.index);

    if (!complete) {
      return {
        status: 'data_unavailable',
        region,
        period,
        collectedAt,
        index: null,
        direction: 'unknown',
      };
    }

    return {
      status: 'available',
      region,
      period,
      collectedAt,
      index: clamp(source.index, 0, 100),
      direction,
    };
  }

  function scoreMarket(profile, now) {
    const marketStatus = normalizeText(profile.marketStatus);
    const isOpen = OPEN_MARKET_STATUSES.has(marketStatus);
    const country = profile.country || profile.countryEn || profile.targetCountry || profile.region;
    let potential = null;
    if (typeof module === 'object' && module.exports) {
      const gate = require('./agency-region-policy').evaluateRegion({ ...profile, country }, now);
      if (!gate.allowed) return 0;
      potential = gate.marketScore;
    } else {
      const name = normalizeText(country);
      // Some source-table rows lack englishName. Resolve names only; keep the
      // original table potential and independent daily region gate unchanged.
      const sourceCountryKeys = {
        'united arab emirates': '阿联酋',
        'saudi arabia': '沙特',
        bahrain: '巴林',
        oman: '阿曼',
      };
      const sourceName = normalizeText(sourceCountryKeys[name] || country);
      const entry = Object.entries((root && root.COUNTRY_MARKET_DATA) || {})
        .find(([key, value]) => normalizeText(key) === sourceName || normalizeText(value.englishName) === name
          || (name === 'uk' && value.englishName === 'United Kingdom')
          || (name === 'usa' && value.englishName === 'United States'));
      if (entry && entry[1].included === '纳入') potential = entry[1].score;
    }
    // Replace the former Europe-only 15 points with the verified 0-5 country potential.
    // Missing evidence earns no market points; sending still requires the independent region gate.
    if (!Number.isFinite(potential) || potential < 0 || potential > 5) return 0;
    return roundScore(potential * 3 + (isOpen ? 10 : 0));
  }

  function scoreIcp(profile) {
    if (Number.isFinite(Number(profile.icpFit))) {
      return roundScore(clamp(profile.icpFit, 0, 100) * 0.25);
    }

    const role = normalizeText(profile.role);
    const industry = normalizeText(profile.industry || profile.businessType);
    const roleMatch = /(buyer|buying|purchas|procurement|merchandis|category|partnership|distributor)/.test(role);
    const industryMatch = /(outdoor|camp|rv|retail|distributor|sporting|adventure)/.test(industry);
    return (roleMatch ? 15 : 0) + (industryMatch ? 10 : 0);
  }

  function calculateDevelopmentScore(input, now = new Date()) {
    const profile = input && typeof input === 'object' ? input : {};
    const trend = normalizeTrend(profile.trend);
    const history = profile.history && typeof profile.history === 'object'
      ? profile.history
      : {};
    const trendDirectionBonus = trend.direction === 'rising' ? 1 : 0;
    const components = {
      market: scoreMarket(profile, now),
      icp: scoreIcp(profile),
      identity: roundScore(clamp(profile.identityConfidence, 0, 100) * 0.15),
      intent: roundScore(clamp(profile.keywordIntent, 0, 100) * 0.15),
      trend: trend.status === 'available'
        ? roundScore(Math.min(10, (trend.index * 0.1) + trendDirectionBonus))
        : 0,
      history: roundScore(Math.min(
        10,
        (history.replied ? 6 : 0) + (clamp(history.templateRate, 0, 1) * 25),
      )),
    };
    const total = roundScore(Object.values(components).reduce((sum, value) => sum + value, 0));

    return { total, components, trend };
  }

  function isProhibitedUrl(value) {
    if (typeof value !== 'string' || !value.trim()) {
      return true;
    }

    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return true;
      }
      const pathname = parsed.pathname.toLowerCase();
      const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
      const isFacebookGenericProfile = hostname === 'facebook.com'
        && pathname.replace(/\/+$/, '') === '/profile.php';
      return isFacebookGenericProfile
        || PROHIBITED_URL_PARTS.some(part => pathname.includes(part));
    } catch {
      return true;
    }
  }

  function normalizeMessage(message) {
    if (message && typeof message === 'object') {
      return {
        text: typeof message.text === 'string' ? message.text.trim() : '',
        factual: message.factual === true,
        matched: message.matched === true,
      };
    }
    return {
      text: typeof message === 'string' ? message.trim() : '',
      factual: false,
      matched: false,
    };
  }

  function evaluateApproval(input) {
    const request = input && typeof input === 'object' ? input : {};
    const prospect = request.prospect && typeof request.prospect === 'object'
      ? request.prospect
      : {};
    const score = request.score && typeof request.score === 'object' ? request.score : {};
    const message = normalizeMessage(request.message);
    const hasValidMinimum = hasNumericValue(request.minScore)
      && request.minScore >= 0
      && request.minScore <= 100;
    const minimumScore = hasValidMinimum
      ? request.minScore
      : 60;
    const hasValidTotal = hasNumericValue(score.total)
      && score.total >= 0
      && score.total <= 100;
    const hardReasons = [];
    const recoverableReasons = [];

    if (prospect.exactTargetVerified !== true) {
      hardReasons.push('exact_target_unverified');
    }
    if (isProhibitedUrl(prospect.targetUrl)) {
      hardReasons.push('prohibited_url');
    }
    if (prospect.duplicateCampaign === true) {
      hardReasons.push('duplicate_campaign');
    }
    if (prospect.cooldownActive === true) {
      hardReasons.push('cooldown_active');
    }
    if (EXCLUSIVE_MARKET_STATUSES.has(normalizeText(prospect.marketStatus))) {
      hardReasons.push('exclusive_distributor');
    }
    if (!message.text || !message.factual) {
      recoverableReasons.push('message_not_factual');
    }
    if (!message.text || !message.matched) {
      recoverableReasons.push('message_not_matched');
    }
    if (!hasValidTotal || score.total < minimumScore) {
      recoverableReasons.push('score_below_minimum');
    }

    const reasons = [...hardReasons, ...recoverableReasons];
    return {
      approved: reasons.length === 0,
      terminalAction: hardReasons.length ? 'auto_skipped' : null,
      reasons,
    };
  }

  function nextRecoveryDecision(input) {
    const context = input && typeof input === 'object' ? input : {};
    const attempts = Math.max(0, Math.floor(Number(context.attempts) || 0));

    if (attempts === 0) {
      return { action: 'enrich_profile', attempts: 1 };
    }
    if (attempts === 1) {
      return { action: 'rewrite_message', attempts: 2 };
    }
    if (context.verifiedAlternateChannel === true) {
      return { action: 'reroute', attempts };
    }
    if (typeof context.retryDate === 'string' && context.retryDate.trim()) {
      return { action: 'scheduled', attempts, retryDate: context.retryDate };
    }
    return { action: 'auto_skipped', attempts };
  }

  function transitionTask(task, transition) {
    const current = task && typeof task === 'object' ? task : {};
    const request = transition && typeof transition === 'object' ? transition : {};
    const currentVersion = Number(current.version);
    const expectedVersion = Number(request.expectedVersion);

    if (!Number.isInteger(currentVersion) || !Number.isInteger(expectedVersion)
      || currentVersion !== expectedVersion) {
      throw new Error('Stale task write: expectedVersion does not match current version');
    }
    if (!STATE_VALUES.has(current.state)) {
      throw new Error(`Unknown state: ${current.state}`);
    }
    if (!STATE_VALUES.has(request.state)) {
      throw new Error(`Unknown state: ${request.state}`);
    }
    if (!ALLOWED_TRANSITIONS[current.state].includes(request.state)) {
      throw new Error(`Invalid transition from ${current.state} to ${request.state}`);
    }

    const { expectedVersion: ignored, ...updates } = request;
    return {
      ...current,
      ...updates,
      version: currentVersion + 1,
    };
  }

  return {
    STATES,
    calculateDevelopmentScore,
    evaluateApproval,
    nextRecoveryDecision,
    transitionTask,
  };
}));

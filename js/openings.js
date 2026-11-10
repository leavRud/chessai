// Дебютная книга персонажей: защиты за чёрных (игрок всегда играет белыми).
// Нейросеть при создании персонажа выбирает защиты из этого списка по id, и
// карточка показывает ровно их, а персонаж разыгрывает их по варианту, пока
// игрок не свернёт с теории. Варианты — ходы обеих сторон от начальной
// позиции; если ход белых совпал с вариантом, следующий ход чёрных берём оттуда.
// Ходы проверяет validateOpeningBook() (вызывается один раз при загрузке).
'use strict';

const OPENING_BOOK = {
  'open-e5': {
    against: 'e4',
    name: { ru: 'Открытые дебюты (1…e5)', en: 'Open games (1…e5)' },
    keywords: ['1…e5', '1...e5', 'открыт', 'испанск', 'итальянск', 'шотландск', 'русск', 'петрова', 'королевский гамбит', 'ruy lopez', 'spanish', 'italian', 'scotch', 'petrov', 'open game'],
    lines: [
      'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O',
      'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5',
      'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O',
      'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O',
      'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7',
      'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O',
      'e4 e5 Nc3 Nf6 Nf3 Nc6 d4 exd4 Nxd4 Bb4',
      'e4 e5 Bc4 Nf6 d3 c6 Nf3 d5',
      'e4 e5 f4 exf4 Nf3 g5 h4 g4',
      'e4 e5 d4 exd4 Qxd4 Nc6 Qe3 Nf6',
      'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5',
    ],
  },
  sicilian: {
    against: 'e4',
    name: { ru: 'Сицилианская защита', en: 'Sicilian Defence' },
    keywords: ['сицилиан', 'найдорф', 'дракон', 'sicilian', 'najdorf', 'dragon'],
    lines: [
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Be7',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5 Nb3 Be7',
      'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6',
      'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7',
      'e4 c5 Nf3 d6 Bb5+ Bd7 Bxd7+ Qxd7 O-O Nc6',
      'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6',
      'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6',
      'c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7',
    ],
  },
  french: {
    against: 'e4',
    name: { ru: 'Французская защита', en: 'French Defence' },
    keywords: ['француз', 'french'],
    lines: [
      'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7',
      'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7',
      'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6',
      'e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6',
      'e4 e6 d4 d5 exd5 exd5 Nf3 Nf6 Bd3 Bd6',
      'e4 e6 Nf3 d5 Nc3 Nf6 e5 Nfd7 d4 c5',
      'e4 e6 d3 d5 Nd2 Nf6 Ngf3 c5',
    ],
  },
  'caro-kann': {
    against: 'e4',
    name: { ru: 'Защита Каро — Канн', en: 'Caro-Kann Defence' },
    keywords: ['каро', 'caro'],
    lines: [
      'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7',
      'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5',
      'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6',
      'e4 c6 d4 d5 Nd2 dxe4 Nxe4 Bf5 Ng3 Bg6',
      'e4 c6 Nc3 d5 Nf3 Bg4 h3 Bxf3 Qxf3 e6',
    ],
  },
  scandinavian: {
    against: 'e4',
    name: { ru: 'Скандинавская защита', en: 'Scandinavian Defence' },
    keywords: ['скандинав', 'scandinavian'],
    lines: [
      'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 Bf5',
      'e4 d5 exd5 Nf6 d4 Nxd5 Nf3 g6',
      'e4 d5 e5 Bf5 d4 e6',
      'e4 d5 Nc3 d4 Nce2 e5',
    ],
  },
  pirc: {
    against: 'e4',
    name: { ru: 'Защита Пирца', en: 'Pirc Defence' },
    keywords: ['пирц', 'современная защита', 'pirc', 'modern defence'],
    lines: [
      'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6',
      'e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O',
      'e4 g6 d4 Bg7 Nc3 d6 Nf3 Nf6',
    ],
  },
  alekhine: {
    against: 'e4',
    name: { ru: 'Защита Алехина', en: 'Alekhine Defence' },
    keywords: ['алехин', 'alekhine'],
    lines: [
      'e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O Be7',
      'e4 Nf6 Nc3 e5 Nf3 Nc6',
    ],
  },
  qgd: {
    against: 'd4',
    name: { ru: 'Отказанный ферзевый гамбит', en: "Queen's Gambit Declined" },
    keywords: ['ферзев', 'отказанн', "queen's gambit", 'queens gambit'],
    lines: [
      'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6',
      'd4 d5 c4 e6 Nf3 Nf6 Nc3 Be7 Bf4 O-O e3 c5',
      'd4 d5 c4 e6 cxd5 exd5 Nc3 Nf6 Bg5 Be7',
      'd4 d5 Nf3 Nf6 c4 e6 Nc3 Be7',
      'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6',
      'd4 d5 e3 Nf6 Nf3 e6 Bd3 c5',
      'Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7',
      'c4 e6 Nc3 d5 d4 Nf6',
    ],
  },
  slav: {
    against: 'd4',
    name: { ru: 'Славянская защита', en: 'Slav Defence' },
    keywords: ['славян', 'slav'],
    lines: [
      'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6',
      'd4 d5 c4 c6 Nc3 Nf6 e3 e6 Nf3 Nbd7',
      'd4 d5 c4 c6 cxd5 cxd5 Nc3 Nf6 Bf4 Nc6',
      'd4 d5 Nf3 Nf6 c4 c6 e3 Bf5',
      'd4 d5 Bf4 Nf6 e3 c6',
      'c4 c6 e4 d5 exd5 cxd5',
    ],
  },
  qga: {
    against: 'd4',
    name: { ru: 'Принятый ферзевый гамбит', en: "Queen's Gambit Accepted" },
    keywords: ['принят', 'accepted'],
    lines: [
      'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6',
      'd4 d5 c4 dxc4 e4 e5 Nf3 exd4 Bxc4 Nc6',
      'd4 d5 Nf3 Nf6 c4 dxc4 e3 e6',
    ],
  },
  kid: {
    against: 'd4',
    name: { ru: 'Староиндийская защита', en: "King's Indian Defence" },
    keywords: ['староиндий', "king's indian", 'kings indian'],
    lines: [
      'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6',
      'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 e5',
      'd4 Nf6 Nf3 g6 c4 Bg7 g3 O-O Bg2 d6 O-O Nbd7',
      'd4 Nf6 Nf3 g6 Bf4 Bg7 e3 O-O',
      'd4 Nf6 Bf4 g6 e3 Bg7',
      'c4 Nf6 Nc3 g6 e4 d6 d4 Bg7',
      'Nf3 Nf6 g3 g6 Bg2 Bg7 O-O O-O',
    ],
  },
  nimzo: {
    against: 'd4',
    name: { ru: 'Защита Нимцовича и новоиндийская', en: 'Nimzo- and Queen\'s Indian' },
    keywords: ['нимцович', 'новоиндий', 'nimzo', "queen's indian"],
    lines: [
      'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6',
      'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5',
      'd4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+',
      'd4 Nf6 Nf3 e6 c4 b6 Nc3 Bb7',
      'd4 Nf6 Bf4 e6 e3 c5',
      'c4 Nf6 Nc3 e6 d4 Bb4',
    ],
  },
  grunfeld: {
    against: 'd4',
    name: { ru: 'Защита Грюнфельда', en: 'Grünfeld Defence' },
    keywords: ['грюнфельд', 'grunfeld', 'grünfeld'],
    lines: [
      'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5',
      'd4 Nf6 c4 g6 Nc3 d5 Nf3 Bg7 Qb3 dxc4 Qxc4 O-O',
      'd4 Nf6 c4 g6 g3 d5 Bg2 Bg7',
      'd4 Nf6 Nf3 g6 c4 Bg7 Nc3 d5',
    ],
  },
  dutch: {
    against: 'd4',
    name: { ru: 'Голландская защита', en: 'Dutch Defence' },
    keywords: ['голланд', 'dutch', 'ленинград'],
    lines: [
      'd4 f5 g3 Nf6 Bg2 e6 Nf3 Be7 O-O O-O c4 d6',
      'd4 f5 c4 Nf6 Nc3 e6 Nf3 Be7',
      'd4 f5 Nf3 Nf6 g3 g6 Bg2 Bg7',
      'd4 f5 Bg5 g6',
      'c4 f5 Nc3 Nf6 g3 e6',
    ],
  },
  benoni: {
    against: 'd4',
    name: { ru: 'Защита Бенони', en: 'Benoni Defence' },
    keywords: ['бенони', 'benoni', 'волжск', 'benko'],
    lines: [
      'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7',
      'd4 Nf6 c4 c5 d5 b5 cxb5 a6',
      'd4 Nf6 Nf3 c5 d5 d6',
    ],
  },
};

const OPENING_DEFAULTS = { e4: 'open-e5', d4: 'qgd' };

const stripSanMarks = (san) => san.replace(/[+#!?]/g, '');

// Каждый вариант прогоняем через chess.js: опечатка в книге должна обрезать
// вариант, а не заставлять персонажа делать невозможный ход.
function validateOpeningBook() {
  for (const opening of Object.values(OPENING_BOOK)) {
    opening.lines = opening.lines.map((line) => {
      const game = new Chess();
      const moves = [];
      for (const san of line.split(' ')) {
        const move = game.move(san, { sloppy: true });
        if (!move) { console.warn('Дебютная книга: неверный ход', san, 'в варианте', line); break; }
        moves.push(stripSanMarks(move.san));
      }
      return moves;
    }).filter(moves => moves.length);
  }
}
validateOpeningBook();

function openingName(id) {
  const opening = OPENING_BOOK[id];
  return opening ? (opening.name[uiLang] || opening.name.ru) : '';
}

// Защиты персонажа: id от нейросети, а если их нет или они не из списка —
// угадываем по тексту про дебюты; в крайнем случае — самые обычные защиты.
function resolveCharacterDefenses(ids, openingsText = '') {
  const result = {};
  for (const id of Array.isArray(ids) ? ids : []) {
    const opening = OPENING_BOOK[id];
    if (opening && !result[opening.against]) result[opening.against] = id;
  }
  const text = String(openingsText).toLowerCase();
  for (const [id, opening] of Object.entries(OPENING_BOOK)) {
    if (!result[opening.against] && opening.keywords.some(k => text.includes(k))) result[opening.against] = id;
  }
  return { ...OPENING_DEFAULTS, ...result };
}

function describeCharacterDefenses(defenses) {
  return t('на 1.e4 — {e4}; на 1.d4 — {d4}', { e4: openingName(defenses.e4), d4: openingName(defenses.d4) });
}

// Сколько полуходов теории знает персонаж: новичок помнит пару ходов,
// гроссмейстер — весь вариант.
function bookDepthForElo(elo) {
  if (elo < 900) return 4;
  if (elo < 1300) return 8;
  if (elo < 1800) return 12;
  return Infinity;
}

// Ход персонажа по книге или null, если партия ушла из его вариантов.
function pickBookMove(character, game) {
  if (!character || !character.defenses) return null;
  const history = game.history().map(stripSanMarks);
  if (history.length >= bookDepthForElo(character.elo)) return null;
  const ids = [...new Set(Object.values(character.defenses))];
  const options = [];
  for (const id of ids) {
    for (const line of OPENING_BOOK[id]?.lines || []) {
      if (line.length > history.length && history.every((san, i) => line[i] === san)) options.push(line[history.length]);
    }
  }
  if (!options.length) return null;
  return options[Math.floor(Math.random() * options.length)];
}

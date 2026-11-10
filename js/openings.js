// Дебютная книга персонажей. У персонажа репертуар из трёх пунктов: система
// за белых и две защиты за чёрных — против 1.e4 и против 1.d4. Нейросеть при
// создании персонажа выбирает их из этого списка по id, карточка показывает
// ровно их, а в партии персонаж разыгрывает их по вариантам, пока соперник не
// свернёт с теории. Варианты — ходы обеих сторон от начальной позиции: если
// сыгранные ходы совпали с началом варианта, следующий ход берём оттуда.
// Ходы проверяет validateOpeningBook() при загрузке — ошибка в книге обрежет
// вариант, а не заставит персонажа сделать невозможный ход.
'use strict';

const OPENING_BOOK = {
  /* ===================== БЕЛЫЕ ===================== */
  'w-italian': {
    side: 'w',
    name: { ru: 'Итальянская партия', en: 'Italian Game' },
    keywords: ['итальян', 'джуоко', 'italian', 'giuoco'],
    lines: [
      'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6',
      'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6 c3',
      'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Bc5 c3 d6 O-O O-O',
      'e4 e5 Nf3 Nc6 Bc4 Be7 d4 d6 d5 Nb8',
      'e4 e5 Nf3 d6 d4 exd4 Nxd4 Nf6 Nc3 Be7',
      'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3',
      'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6',
      'e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3 e6',
      'e4 c5 c3 Nc6 d4 cxd4 cxd4 d5 exd5 Qxd5',
      'e4 c5 c3 e6 d4 d5 e5 Nc6 Nf3',
      'e4 c5 c3 d6 d4 Nf6 Bd3',
      'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3',
      'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3',
      'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4',
      'e4 d5 exd5 Nf6 d4 Nxd5 Nf3',
      'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O',
      'e4 g6 d4 Bg7 Nc3 d6 Nf3',
      'e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O',
      'e4 Nc6 d4 e5 d5 Nce7',
    ],
  },
  'w-ruy': {
    side: 'w',
    name: { ru: 'Испанская партия', en: 'Ruy Lopez' },
    keywords: ['испанск', 'руи лопес', 'ruy lopez', 'spanish'],
    lines: [
      'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3',
      'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4 d4 b5 Bb3 d5 dxe5 Be6',
      'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8',
      'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4',
      'e4 e5 Nf3 Nc6 Bb5 Bc5 c3 Nf6 O-O O-O d4 Bb6',
      'e4 e5 Nf3 Nc6 Bb5 d6 d4 Bd7 Nc3 Nf6 O-O',
      'e4 e5 Nf3 Nc6 Bb5 Nd4 Nxd4 exd4 O-O c6 Bc4',
      'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 d6 c3 Bd7 d4',
      'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 Nc3 Nxc3 dxc3 Be7 Be3',
      'e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 O-O',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6',
      'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5',
      'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 Qd2',
      'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6 Bd3 Nf6 O-O',
      'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Nf6 Nc3 d6',
      'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4',
      'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4',
      'e4 e6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Nf3 Ngf6 Nxf6+ Nxf6',
      'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7',
      'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Nf3 Ngf6 Nxf6+ Nxf6',
      'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 Bf5 Bc4 e6',
      'e4 d5 exd5 Qxd5 Nc3 Qd6 d4 Nf6 Nf3 a6 g3',
      'e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3',
      'e4 g6 d4 Bg7 Nc3 d6 Be3 a6 Qd2',
      'e4 Nf6 e5 Nd5 d4 d6 Nf3 g6 Bc4 Nb6 Bb3 Bg7 Ng5',
    ],
  },
  'w-scotch': {
    side: 'w',
    name: { ru: 'Шотландская партия', en: 'Scotch Game' },
    keywords: ['шотланд', 'scotch'],
    lines: [
      'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4',
      'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7 Bc4',
      'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nb3 Bb6 a4 a6',
      'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Qh4 Nc3 Bb4 Be2',
      'e4 e5 Nf3 Nc6 d4 Nxd4 Nxd4 exd4 Qxd4',
      'e4 e5 Nf3 d6 d4 exd4 Nxd4 Nf6 Nc3 Be7 Bf4',
      'e4 e5 Nf3 Nf6 d4 Nxe4 Bd3 d5 Nxe5 Nd7 Nxd7 Bxd7 O-O',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4',
      'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 d6 Bg5 e6 Qd2',
      'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nf6 Nc3 d6 g4',
      'e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6 Ne2',
      'e4 e6 d4 d5 Nd2 c5 exd5 Qxd5 Ngf3 cxd4 Bc4 Qd6 O-O',
      'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3',
      'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bd2',
      'e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O Bd3',
      'e4 Nf6 e5 Nd5 d4 d6 c4 Nb6 exd6 cxd6 Nc3 g6',
    ],
  },
  'w-kings-gambit': {
    side: 'w',
    name: { ru: 'Королевский гамбит', en: "King's Gambit" },
    keywords: ['королевский гамбит', "king's gambit", 'kings gambit'],
    lines: [
      'e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5 Nf6',
      'e4 e5 f4 exf4 Nf3 d6 d4 g5 h4 g4 Ng1',
      'e4 e5 f4 exf4 Nf3 d5 exd5 Nf6 Bb5+ c6 dxc6',
      'e4 e5 f4 exf4 Bc4 Nf6 Nc3 c6',
      'e4 e5 f4 d5 exd5 exf4 Nf3 Nf6 Bb5+',
      'e4 e5 f4 Bc5 Nf3 d6 c3 Nf6 d4',
      'e4 e5 f4 d5 exd5 e4 d3 Nf6 dxe4 Nxe4 Nf3',
      'e4 e5 f4 Nc6 Nf3 exf4 d4',
      'e4 c5 Nc3 Nc6 f4 g6 Nf3 Bg7 Bb5 Nd4 O-O',
      'e4 c5 f4 d5 exd5 Nf6 Bb5+ Bd7',
      'e4 c5 f4 Nc6 Nf3 g6 Bb5 Bg7 O-O',
      'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6',
      'e4 e6 f4 d5 e5 c5 Nf3 Nc6',
      'e4 c6 d4 d5 f3 e6 Nc3 Bb4 Bd2',
      'e4 c6 d4 d5 f3 dxe4 fxe4 e5 Nf3',
      'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Bc4',
      'e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 c5',
      'e4 g6 d4 Bg7 Nc3 d6 f4 Nf6 Nf3',
      'e4 Nf6 e5 Nd5 c4 Nb6 d4 d6 f4',
    ],
  },
  'w-vienna': {
    side: 'w',
    name: { ru: 'Венская партия', en: 'Vienna Game' },
    keywords: ['венск', 'vienna'],
    lines: [
      'e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7 d4',
      'e4 e5 Nc3 Nf6 Bc4 Nxe4 Qh5 Nd6 Bb3 Nc6 Nb5 g6 Qf3 f5',
      'e4 e5 Nc3 Nc6 Bc4 Bc5 Qg4 Qf6 Nd5',
      'e4 e5 Nc3 Nc6 f4 exf4 Nf3 g5 h4 g4 Ng5',
      'e4 e5 Nc3 Bc5 Nf3 d6 d4 exd4 Nxd4 Nf6',
      'e4 e5 Nc3 Nf6 g3 d5 exd5 Nxd5 Bg2 Nxc3 bxc3 Bd6',
      'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6 Be3 e5 Qd2',
      'e4 c5 Nc3 d6 f4 Nc6 Nf3 g6 Bb5 Bd7',
      'e4 c5 Nc3 e6 Nf3 Nc6 d4 cxd4 Nxd4 Qc7',
      'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4',
      'e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7 f4 c5 Nf3 Nc6 Be3',
      'e4 c6 Nc3 d5 Nf3 Bg4 h3 Bxf3 Qxf3 e6 d4',
      'e4 c6 Nc3 d5 Nf3 dxe4 Nxe4 Nf6 Qe2',
      'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 Bf5 Bd2 e6',
      'e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 O-O O-O-O',
      'e4 Nf6 Nc3 d5 e5 Nfd7 d4 e6',
    ],
  },
  'w-queens-gambit': {
    side: 'w',
    name: { ru: 'Ферзевый гамбит', en: "Queen's Gambit" },
    keywords: ['ферзевый гамбит', "queen's gambit", 'queens gambit'],
    lines: [
      'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6',
      'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 Qc2 Be7 e3',
      'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O',
      'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6 Bg5 h6 Bh4 dxc4 e4 g5 Bg3 b5',
      'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5 Bd3',
      'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 a4',
      'd4 d5 c4 dxc4 e4 e5 Nf3 exd4 Bxc4 Nc6 O-O',
      'd4 d5 c4 Nc6 Nc3 dxc4 Nf3 Nf6 e4 Bg4 Be3',
      'd4 d5 c4 e5 dxe5 d4 Nf3 Nc6 g3 Be6 Nbd2',
      'd4 d5 c4 e6 Nc3 c5 cxd5 exd5 Nf3 Nc6 g3 Nf6 Bg2 Be7 O-O O-O',
      'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5',
      'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O',
      'd4 Nf6 c4 e6 Nc3 d5 Bg5 Be7 e3 O-O Nf3',
      'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7',
      'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Be3',
      'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7 Be2',
      'd4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 g6 Nc3 Bxa6 e4',
      'd4 Nf6 c4 e5 dxe5 Ng4 Bf4 Nc6 Nf3 Bb4+ Nbd2',
      'd4 Nf6 c4 d6 Nc3 e5 Nf3 Nbd7 e4',
      'd4 f5 c4 Nf6 Nc3 e6 Nf3 Be7 g3 O-O Bg2 d6 O-O',
      'd4 f5 c4 Nf6 g3 g6 Bg2 Bg7 Nf3 O-O O-O d6 Nc3',
      'd4 e6 c4 Bb4+ Bd2 Qe7',
      'd4 d6 c4 e5 Nf3 exd4 Nxd4',
      'd4 g6 c4 Bg7 Nc3 d6 e4',
      'd4 c5 d5 e5 e4 d6 Nc3',
    ],
  },
  'w-london': {
    side: 'w',
    name: { ru: 'Лондонская система', en: 'London System' },
    keywords: ['лондон', 'london'],
    lines: [
      'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O Bd3',
      'd4 d5 Bf4 Nf6 e3 e6 Nf3 Bd6 Bg3 O-O Bd3 c5 c3',
      'd4 d5 Bf4 c5 e3 Nc6 c3 Nf6 Nd2',
      'd4 d5 Bf4 Bf5 e3 e6 c4',
      'd4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O Be2 d6 h3',
      'd4 Nf6 Bf4 e6 e3 c5 c3 Nc6 Nd2 d5 Ngf3 Bd6',
      'd4 Nf6 Bf4 c5 c3 Qb6 Qb3',
      'd4 Nf6 Bf4 d6 e3 g6 h3 Bg7 Nf3 O-O Be2',
      'd4 Nf6 Bf4 b6 e3 Bb7 Nd2 e6 Ngf3',
      'd4 e6 Bf4 c5 e3 Nc6 c3',
      'd4 f5 Bf4 Nf6 e3 e6 Nf3 b6',
      'd4 g6 Bf4 Bg7 e3 d6 Nf3',
      'd4 c5 d5 e5 e4 d6 Nc3',
      'd4 d6 Bf4 Nf6 e3 g6',
    ],
  },
  'w-catalan': {
    side: 'w',
    name: { ru: 'Каталонское начало', en: 'Catalan Opening' },
    keywords: ['каталон', 'catalan'],
    lines: [
      'd4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2 a6 Qxc4 b5 Qc2 Bb7',
      'd4 Nf6 c4 e6 g3 d5 Bg2 dxc4 Nf3 c5 O-O Nc6 Qa4',
      'd4 Nf6 c4 e6 g3 Bb4+ Bd2 Be7 Bg2 d5 Nf3 O-O O-O',
      'd4 Nf6 c4 e6 g3 c5 d5 exd5 cxd5 d6 Nc3 g6 Bg2 Bg7 Nf3 O-O O-O',
      'd4 Nf6 c4 g6 g3 Bg7 Bg2 O-O Nc3 d6 Nf3 Nbd7 O-O e5 e4',
      'd4 Nf6 c4 g6 g3 d5 Bg2 Bg7 cxd5 Nxd5 Nf3 O-O O-O',
      'd4 Nf6 c4 c5 d5 e6 g3 exd5 cxd5 d6 Bg2',
      'd4 Nf6 c4 e5 dxe5 Ng4 Nf3 Bc5 e3 Nc6',
      'd4 d5 c4 e6 g3 Nf6 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2 a6 Qxc4 b5 Qc2 Bb7',
      'd4 d5 c4 c6 Nf3 Nf6 g3 dxc4 Bg2',
      'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4',
      'd4 d5 c4 Nc6 Nf3 Bg4 cxd5 Bxf3 gxf3 Qxd5 e3',
      'd4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O c4 d6 Nc3',
      'd4 e6 c4 f5 g3 Nf6 Bg2',
      'd4 g6 c4 Bg7 Nf3 d6 g3',
      'd4 d6 c4 e5 Nf3 e4 Nfd2 f5 Nc3',
    ],
  },
  'w-trompowsky': {
    side: 'w',
    name: { ru: 'Атака Тромповского', en: 'Trompowsky Attack' },
    keywords: ['тромповск', 'trompowsky'],
    lines: [
      'd4 Nf6 Bg5 Ne4 Bf4 c5 f3 Qa5+ c3 Nf6 d5',
      'd4 Nf6 Bg5 Ne4 Bf4 d5 e3 c5 Bd3',
      'd4 Nf6 Bg5 e6 e4 h6 Bxf6 Qxf6 Nc3 d6 Qd2',
      'd4 Nf6 Bg5 c5 d5 Qb6 Nc3',
      'd4 Nf6 Bg5 d5 Bxf6 exf6 e3 c6 c4',
      'd4 Nf6 Bg5 g6 Bxf6 exf6 e3 Bg7 c4',
      'd4 d5 Bg5 h6 Bh4 c5 e3 Nc6 c3',
      'd4 d5 Bg5 c6 e3 Qb6 Qc1',
      'd4 d5 Bg5 Nf6 Bxf6 exf6 e3 Bd6 c4',
      'd4 e6 e4 d5 Nc3',
      'd4 f5 Bg5 g6 Nc3 Bg7 h4',
      'd4 g6 e4 Bg7 Nc3 d6 Be3',
      'd4 d6 e4 Nf6 Nc3 g6 Be3',
      'd4 c5 d5 Nf6 Nc3 d6 e4 g6',
    ],
  },
  'w-english': {
    side: 'w',
    name: { ru: 'Английское начало', en: 'English Opening' },
    keywords: ['английск', 'english'],
    lines: [
      'c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6 Nf3 Nc6 O-O Be7',
      'c4 e5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6 e4',
      'c4 e5 g3 Nf6 Bg2 d5 cxd5 Nxd5 Nc3 Nb6',
      'c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 e5 O-O Nge7',
      'c4 c5 Nf3 Nf6 Nc3 d5 cxd5 Nxd5 g3 Nc6 Bg2',
      'c4 Nf6 Nc3 e5 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2',
      'c4 Nf6 Nc3 g6 e4 d6 d4 Bg7 Be2 O-O',
      'c4 Nf6 Nc3 e6 Nf3 d5 d4 Be7 Bg5',
      'c4 Nf6 Nc3 d5 cxd5 Nxd5 g3 g6 Bg2 Nxc3 bxc3 Bg7',
      'c4 e6 Nc3 d5 d4 Nf6 Bg5',
      'c4 c6 e4 d5 exd5 cxd5 cxd5 Nf6 Nc3 Nxd5 Nf3',
      'c4 g6 Nc3 Bg7 g3 c5 Bg2 Nc6',
      'c4 f5 Nc3 Nf6 g3 g6 Bg2 Bg7 Nf3 O-O O-O d6',
      'c4 d5 cxd5 Qxd5 Nc3 Qd8 d4 Nf6 Nf3',
      'c4 b6 Nc3 Bb7 e4 e6',
    ],
  },
  'w-reti': {
    side: 'w',
    name: { ru: 'Начало Рети', en: 'Réti Opening' },
    keywords: ['рети', 'reti', 'réti'],
    lines: [
      'Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 d3 Nbd7 Nbd2 e5 e4',
      'Nf3 d5 c4 d4 e3 Nc6 exd4 Nxd4 Nxd4 Qxd4 Nc3',
      'Nf3 d5 c4 e6 g3 Nf6 Bg2 Be7 O-O O-O d4',
      'Nf3 d5 c4 c6 b3 Nf6 g3 Bf5 Bg2 e6 O-O',
      'Nf3 d5 c4 dxc4 e3 Nf6 Bxc4 e6',
      'Nf3 Nf6 c4 g6 Nc3 Bg7 e4 d6 d4 O-O Be2 e5 O-O',
      'Nf3 Nf6 c4 e6 g3 d5 Bg2 Be7 O-O O-O d4',
      'Nf3 Nf6 c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 O-O O-O',
      'Nf3 c5 c4 Nc6 Nc3 g6 g3 Bg7 Bg2 e5',
      'Nf3 f5 g3 Nf6 Bg2 g6 O-O Bg7 d3 O-O',
      'Nf3 g6 g3 Bg7 Bg2 d6 O-O e5 d3',
      'Nf3 e6 g3 d5 Bg2 Nf6 O-O Be7 d3',
      'Nf3 d6 d4 Nf6 c4 g6',
      'Nf3 Nc6 d4 d5 c4',
    ],
  },
  'w-kia': {
    side: 'w',
    name: { ru: 'Староиндийская атака', en: "King's Indian Attack" },
    keywords: ['староиндийская атака', "king's indian attack", 'kia'],
    lines: [
      'Nf3 d5 g3 Nf6 Bg2 c5 O-O Nc6 d3 e6 Nbd2 Be7 e4',
      'Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O Nbd2 c5 e4 Nc6 Re1',
      'Nf3 d5 g3 Bg4 Bg2 Nd7 O-O Ngf6 d3 e6 Nbd2',
      'Nf3 d5 g3 c5 Bg2 Nc6 O-O e5 d3 Nf6 e4',
      'Nf3 Nf6 g3 d5 Bg2 c6 O-O Bg4 d3 Nbd7 Nbd2 e5 e4',
      'Nf3 Nf6 g3 g6 Bg2 Bg7 O-O O-O d3 d6 e4 e5 Nc3',
      'Nf3 c5 g3 Nc6 Bg2 g6 O-O Bg7 d3 d6 e4 e5 c3',
      'Nf3 e6 g3 d5 Bg2 Nf6 O-O Be7 d3 O-O Nbd2 c5 e4',
      'Nf3 f5 g3 Nf6 Bg2 g6 d3 Bg7 e4 fxe4 dxe4 d6',
      'Nf3 g6 g3 Bg7 Bg2 d5 O-O Nf6 d3 O-O Nbd2',
      'Nf3 Nc6 d4 d5 g3',
      'Nf3 d6 g3 e5 d3 Nf6 Bg2',
    ],
  },
  'w-bird': {
    side: 'w',
    name: { ru: 'Дебют Берда', en: "Bird's Opening" },
    keywords: ['берд', 'bird'],
    lines: [
      'f4 d5 Nf3 Nf6 e3 g6 Be2 Bg7 O-O O-O d3 c5',
      'f4 d5 Nf3 Nf6 e3 c5 b3 Nc6 Bb2 e6 Bb5',
      'f4 d5 Nf3 g6 e3 Bg7 Be2 Nf6 O-O O-O d3',
      'f4 Nf6 Nf3 g6 e3 Bg7 Be2 O-O O-O d6 d3',
      'f4 Nf6 Nf3 d6 d3 e5 fxe5 dxe5 e4',
      'f4 e5 fxe5 d6 exd6 Bxd6 Nf3 g5 g3',
      'f4 e5 fxe5 d6 exd6 Bxd6 Nf3 Nf6 d4',
      'f4 c5 Nf3 Nc6 e3 g6 Bb5 Bg7 O-O',
      'f4 g6 Nf3 Bg7 e3 d6 d4',
      'f4 e6 Nf3 d5 e3 Nf6 b3 c5 Bb2',
      'f4 f5 Nf3 Nf6 e3 e6',
    ],
  },

  /* ===================== ЧЁРНЫЕ ПРОТИВ 1.e4 ===================== */
  'open-e5': {
    side: 'b', against: 'e4',
    name: { ru: 'Открытые дебюты (1…e5)', en: 'Open games (1…e5)' },
    keywords: ['1…e5', '1...e5', 'открыт', 'испанск', 'итальянск', 'шотландск', 'open game'],
    lines: [
      'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O',
      'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5',
      'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4 exd4 Nxd4 c5',
      'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O',
      'e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6 d3 d6 c3 a6',
      'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4',
      'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O',
      'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7',
      'e4 e5 Nf3 Nc6 d4 exd4 Bc4 Bc5 c3 Nf6',
      'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O',
      'e4 e5 Nf3 Nc6 Nc3 Nf6 d4 exd4 Nxd4 Bb4 Nxc6 bxc6 Bd3 d5',
      'e4 e5 Nf3 Nc6 c3 Nf6 d4 Nxe4',
      'e4 e5 Nf3 Nc6 Be2 Nf6 d3 d5',
      'e4 e5 Nc3 Nf6 Nf3 Nc6 d4 exd4 Nxd4 Bb4',
      'e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7',
      'e4 e5 Bc4 Nf6 d3 c6 Nf3 d5',
      'e4 e5 f4 exf4 Nf3 g5 h4 g4',
      'e4 e5 d4 exd4 Qxd4 Nc6 Qe3 Nf6',
      'e4 e5 d3 Nc6 Nf3 d5',
      'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5',
    ],
  },
  petrov: {
    side: 'b', against: 'e4',
    name: { ru: 'Русская партия (защита Петрова)', en: 'Petrov Defence' },
    keywords: ['русская партия', 'петров', 'petrov', 'petroff', 'russian game'],
    lines: [
      'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Nc6 O-O Be7',
      'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 Nc3 Nxc3 dxc3 Be7',
      'e4 e5 Nf3 Nf6 d4 Nxe4 Bd3 d5 Nxe5 Nd7',
      'e4 e5 Nf3 Nf6 Nc3 Nc6 Bb5 Bb4',
      'e4 e5 Nc3 Nf6 Nf3 Nc6 Bb5 Bb4',
      'e4 e5 Bc4 Nf6 d3 c6 Nf3 d5 Bb3 Bd6',
      'e4 e5 f4 d5 exd5 e4',
      'e4 e5 d4 exd4 Qxd4 Nc6 Qe3 Nf6',
    ],
  },
  philidor: {
    side: 'b', against: 'e4',
    name: { ru: 'Защита Филидора', en: 'Philidor Defence' },
    keywords: ['филидор', 'philidor'],
    lines: [
      'e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 O-O O-O',
      'e4 e5 Nf3 d6 d4 exd4 Nxd4 Nf6 Nc3 Be7 Bf4 O-O',
      'e4 e5 Nf3 d6 Bc4 Be7 d4 exd4 Nxd4 Nf6',
      'e4 e5 Nc3 Nf6 Nf3 d6 d4 Nbd7',
      'e4 e5 f4 exf4 Nf3 d6 d4 g5',
      'e4 e5 Bc4 Nf6 d3 c6',
      'e4 e5 d4 exd4 Qxd4 Nc6 Qe3 Nf6',
      'e4 d6 d4 Nf6 Nc3 e5 Nf3 Nbd7',
    ],
  },
  sicilian: {
    side: 'b', against: 'e4',
    name: { ru: 'Сицилианская защита', en: 'Sicilian Defence' },
    keywords: ['сицилиан', 'найдорф', 'sicilian', 'najdorf'],
    lines: [
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Be7',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5 Nb3 Be7',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bc4 e6 Bb3 b5',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 f3 e5 Nb3 Be6',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 f3 e5 Nb3 d5',
      'e4 c5 Nf3 d6 d4 cxd4 Qxd4 Nc6 Bb5 Bd7',
      'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6',
      'e4 c5 Nf3 Nc6 Bb5 g6 O-O Bg7 Re1 e5',
      'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7',
      'e4 c5 Nf3 d6 Bb5+ Bd7 Bxd7+ Qxd7 O-O Nc6',
      'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6',
      'e4 c5 Nc3 Nc6 f4 g6 Nf3 Bg7 Bb5 Nd4',
      'e4 c5 f4 Nc6 Nf3 g6 Bb5 Bg7',
      'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6',
      'e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6 Bc4 e6',
      'e4 c5 b4 cxb4 a3 d5',
      'e4 c5 d3 Nc6 g3 g6 Bg2 Bg7',
      'c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7',
    ],
  },
  'sicilian-dragon': {
    side: 'b', against: 'e4',
    name: { ru: 'Сицилианская защита, вариант дракона', en: 'Sicilian Dragon' },
    keywords: ['дракон', 'dragon'],
    lines: [
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be2 Bg7 O-O O-O Be3 Nc6',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Bc4 Bg7 Be3 O-O',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 f3 e5',
      'e4 c5 Nf3 d6 d4 cxd4 Qxd4 Nc6 Bb5 Bd7 Bxc6 Bxc6',
      'e4 c5 Nf3 d6 Bb5+ Nd7 d4 Nf6 Nc3 cxd4 Qxd4 e5',
      'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6',
      'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6',
      'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6',
      'e4 c5 f4 Nc6 Nf3 g6',
      'e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6',
      'c4 c5 Nc3 Nc6 g3 g6',
    ],
  },
  french: {
    side: 'b', against: 'e4',
    name: { ru: 'Французская защита', en: 'French Defence' },
    keywords: ['француз', 'french'],
    lines: [
      'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7',
      'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7',
      'e4 e6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Nf3 Ngf6 Nxf6+ Nxf6',
      'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 c4',
      'e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6',
      'e4 e6 d4 d5 Nd2 c5 exd5 Qxd5 Ngf3 cxd4 Bc4 Qd6',
      'e4 e6 d4 d5 exd5 exd5 Nf3 Nf6 Bd3 Bd6',
      'e4 e6 d4 d5 Bd3 c5 exd5 exd5',
      'e4 e6 Nf3 d5 Nc3 Nf6 e5 Nfd7 d4 c5',
      'e4 e6 d3 d5 Nd2 Nf6 Ngf3 c5',
      'e4 e6 Qe2 c5 Nf3 Nc6 g3 d5',
      'e4 e6 c4 d5 exd5 exd5 cxd5 Nf6',
    ],
  },
  'caro-kann': {
    side: 'b', against: 'e4',
    name: { ru: 'Защита Каро — Канн', en: 'Caro-Kann Defence' },
    keywords: ['каро', 'caro'],
    lines: [
      'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7',
      'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Nxf6+ exf6',
      'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5',
      'e4 c6 d4 d5 e5 Bf5 Nc3 e6 g4 Bg6 Nge2 c5',
      'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6',
      'e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Be7',
      'e4 c6 d4 d5 Nd2 dxe4 Nxe4 Bf5 Ng3 Bg6',
      'e4 c6 d4 d5 f3 e6 Nc3 Bb4',
      'e4 c6 Nc3 d5 Nf3 Bg4 h3 Bxf3 Qxf3 e6',
      'e4 c6 Nf3 d5 Nc3 Bg4 h3 Bxf3 Qxf3 e6',
      'e4 c6 d3 d5 Nd2 e5 Ngf3 Bd6',
      'e4 c6 c4 d5 exd5 cxd5 cxd5 Nf6',
    ],
  },
  scandinavian: {
    side: 'b', against: 'e4',
    name: { ru: 'Скандинавская защита', en: 'Scandinavian Defence' },
    keywords: ['скандинав', 'scandinavian'],
    lines: [
      'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 Bf5',
      'e4 d5 exd5 Qxd5 Nc3 Qd6 d4 Nf6 Nf3 a6',
      'e4 d5 exd5 Qxd5 Nf3 Bg4 Be2 Nc6',
      'e4 d5 exd5 Qxd5 d4 Nf6 Nf3 Bg4',
      'e4 d5 exd5 Nf6 d4 Nxd5 Nf3 g6',
      'e4 d5 exd5 Nf6 c4 c6 dxc6 Nxc6',
      'e4 d5 exd5 Nf6 Bb5+ Bd7 Bc4 Bg4',
      'e4 d5 e5 Bf5 d4 e6',
      'e4 d5 Nc3 d4 Nce2 e5',
    ],
  },
  pirc: {
    side: 'b', against: 'e4',
    name: { ru: 'Защита Пирца — Уфимцева', en: 'Pirc Defence' },
    keywords: ['пирц', 'уфимцев', 'современная защита', 'pirc', 'modern defence'],
    lines: [
      'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6',
      'e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O',
      'e4 d6 d4 Nf6 Nc3 g6 Be3 c6 Qd2 b5',
      'e4 d6 d4 Nf6 Nc3 g6 Bg5 Bg7 Qd2 h6',
      'e4 d6 d4 Nf6 Bd3 e5 c3 g6',
      'e4 d6 d4 Nf6 f3 e5 d5 Be7',
      'e4 g6 d4 Bg7 Nc3 d6 Nf3 Nf6',
      'e4 g6 d4 Bg7 Nc3 c6 f4 d5 e5 h5',
      'e4 g6 d4 Bg7 c4 d6 Nc3 Nc6',
    ],
  },
  alekhine: {
    side: 'b', against: 'e4',
    name: { ru: 'Защита Алехина', en: 'Alekhine Defence' },
    keywords: ['алехин', 'alekhine'],
    lines: [
      'e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O Be7',
      'e4 Nf6 e5 Nd5 d4 d6 Nf3 g6 Bc4 Nb6 Bb3 Bg7',
      'e4 Nf6 e5 Nd5 d4 d6 c4 Nb6 exd6 exd6 Nc3 Be7',
      'e4 Nf6 e5 Nd5 d4 d6 c4 Nb6 f4 dxe5 fxe5 Nc6',
      'e4 Nf6 e5 Nd5 c4 Nb6 d4 d6 exd6 cxd6',
      'e4 Nf6 e5 Nd5 Nc3 Nxc3 dxc3 d6',
      'e4 Nf6 Nc3 e5 Nf3 Nc6',
      'e4 Nf6 d3 e5 Nf3 Nc6',
    ],
  },

  /* ===================== ЧЁРНЫЕ ПРОТИВ 1.d4 ===================== */
  qgd: {
    side: 'b', against: 'd4',
    name: { ru: 'Отказанный ферзевый гамбит', en: "Queen's Gambit Declined" },
    keywords: ['ферзев', 'отказанн', "queen's gambit", 'queens gambit'],
    lines: [
      'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6',
      'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 e3 Be7',
      'd4 d5 c4 e6 Nc3 Be7 Nf3 Nf6 Bg5 h6 Bh4 O-O',
      'd4 d5 c4 e6 Nf3 Nf6 Nc3 Be7 Bf4 O-O e3 c5',
      'd4 d5 c4 e6 cxd5 exd5 Nc3 Nf6 Bg5 Be7',
      'd4 d5 c4 e6 g3 Nf6 Bg2 Be7 Nf3 O-O',
      'd4 d5 Nf3 Nf6 c4 e6 Nc3 Be7',
      'd4 d5 Nf3 Nf6 Bf4 e6 e3 c5',
      'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6',
      'd4 d5 Bg5 h6 Bh4 c6',
      'd4 d5 Nc3 Nf6 Bg5 Nbd7',
      'd4 d5 e3 Nf6 Nf3 e6 Bd3 c5',
      'd4 d5 e4 dxe4 Nc3 Nf6 f3 exf3',
      'Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7',
      'c4 e6 Nc3 d5 d4 Nf6',
    ],
  },
  slav: {
    side: 'b', against: 'd4',
    name: { ru: 'Славянская защита', en: 'Slav Defence' },
    keywords: ['славян', 'slav'],
    lines: [
      'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6',
      'd4 d5 c4 c6 Nf3 Nf6 e3 Bf5 Nc3 e6 Nh4 Bg6',
      'd4 d5 c4 c6 Nf3 Nf6 Qc2 dxc4 Qxc4 Bf5',
      'd4 d5 c4 c6 Nf3 Nf6 g3 dxc4 Bg2 b5',
      'd4 d5 c4 c6 Nc3 Nf6 e3 a6',
      'd4 d5 c4 c6 Nc3 Nf6 Nf3 a6 e3 b5',
      'd4 d5 c4 c6 cxd5 cxd5 Nc3 Nf6 Bf4 Nc6',
      'd4 d5 Nf3 Nf6 c4 c6 e3 Bf5',
      'd4 d5 Bf4 Nf6 e3 c6',
      'd4 d5 Bg5 c6 e3 Qb6',
      'c4 c6 e4 d5 exd5 cxd5',
      'Nf3 d5 c4 c6 b3 Nf6',
    ],
  },
  'semi-slav': {
    side: 'b', against: 'd4',
    name: { ru: 'Полуславянская защита', en: 'Semi-Slav Defence' },
    keywords: ['полуславян', 'меран', 'semi-slav', 'meran'],
    lines: [
      'd4 d5 c4 c6 Nc3 Nf6 Nf3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5 Bd3 Bb7',
      'd4 d5 c4 c6 Nc3 Nf6 Nf3 e6 Bg5 h6 Bh4 dxc4',
      'd4 d5 c4 c6 Nc3 Nf6 Nf3 e6 Qc2 Nbd7 Bg5 h6',
      'd4 d5 c4 c6 Nf3 Nf6 e3 e6 Nbd2 Nbd7 Bd3 c5',
      'd4 d5 c4 c6 cxd5 cxd5 Nc3 Nf6 Bf4 Nc6',
      'd4 d5 Nf3 Nf6 c4 c6 Nc3 e6',
      'd4 d5 Bf4 Nf6 e3 c6 Nf3 e6',
      'c4 c6 Nf3 d5 e3 Nf6 Nc3 e6',
    ],
  },
  qga: {
    side: 'b', against: 'd4',
    name: { ru: 'Принятый ферзевый гамбит', en: "Queen's Gambit Accepted" },
    keywords: ['принят', 'accepted'],
    lines: [
      'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 dxc5 Qxd1 Rxd1 Bxc5',
      'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6',
      'd4 d5 c4 dxc4 e4 e5 Nf3 exd4 Bxc4 Nc6',
      'd4 d5 c4 dxc4 e3 e5 Bxc4 exd4 exd4 Nf6',
      'd4 d5 c4 dxc4 Nc3 e5 d5 Nf6',
      'd4 d5 Nf3 Nf6 c4 dxc4 e3 e6',
      'd4 d5 Nf3 Nf6 Bf4 c5',
      'd4 d5 Bf4 Nf6 e3 e6',
    ],
  },
  tarrasch: {
    side: 'b', against: 'd4',
    name: { ru: 'Защита Тарраша', en: 'Tarrasch Defence' },
    keywords: ['тарраш', 'tarrasch'],
    lines: [
      'd4 d5 c4 e6 Nc3 c5 cxd5 exd5 Nf3 Nc6 g3 Nf6 Bg2 Be7 O-O O-O',
      'd4 d5 c4 e6 Nf3 c5 cxd5 exd5 g3 Nc6',
      'd4 d5 c4 e6 Nc3 c5 e3 Nf6 Nf3 Nc6',
      'd4 d5 Nf3 c5 c4 e6',
      'd4 d5 Bf4 c5 e3 Nc6',
    ],
  },
  chigorin: {
    side: 'b', against: 'd4',
    name: { ru: 'Защита Чигорина', en: 'Chigorin Defence' },
    keywords: ['чигорин', 'chigorin'],
    lines: [
      'd4 d5 c4 Nc6 Nc3 dxc4 Nf3 Nf6 e4 Bg4',
      'd4 d5 c4 Nc6 Nf3 Bg4 cxd5 Bxf3 gxf3 Qxd5 e3 e5',
      'd4 d5 c4 Nc6 cxd5 Qxd5 e3 e5 Nc3 Bb4',
      'd4 d5 Nf3 Nc6 c4 Bg4',
      'd4 d5 Bf4 Nc6 e3 Bf5',
    ],
  },
  albin: {
    side: 'b', against: 'd4',
    name: { ru: 'Контргамбит Альбина', en: 'Albin Countergambit' },
    keywords: ['альбин', 'albin'],
    lines: [
      'd4 d5 c4 e5 dxe5 d4 Nf3 Nc6 g3 Be6',
      'd4 d5 c4 e5 dxe5 d4 e3 Bb4+ Bd2 dxe3',
      'd4 d5 c4 e5 dxe5 d4 Nf3 Nc6 Nbd2 Be6',
      'd4 d5 Nf3 Nc6 c4 Bg4',
      'd4 d5 Bf4 Nf6 e3 c5',
    ],
  },
  kid: {
    side: 'b', against: 'd4',
    name: { ru: 'Староиндийская защита', en: "King's Indian Defence" },
    keywords: ['староиндийская защита', "king's indian defence", "king's indian defense"],
    lines: [
      'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6',
      'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 d5 a5',
      'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 e5',
      'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Be2 O-O Bg5 c5',
      'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f4 O-O Nf3 c5',
      'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 h3 O-O Bg5 c5',
      'd4 Nf6 c4 g6 g3 Bg7 Bg2 O-O Nc3 d6 Nf3 Nbd7',
      'd4 Nf6 Nf3 g6 c4 Bg7 g3 O-O Bg2 d6 O-O Nbd7',
      'd4 Nf6 Nf3 g6 Bf4 Bg7 e3 O-O',
      'd4 Nf6 Bf4 g6 e3 Bg7',
      'd4 Nf6 Bg5 g6 Bxf6 exf6',
      'd4 Nf6 e3 g6 Bd3 Bg7',
      'd4 Nf6 Nc3 g6 e4 d6',
      'c4 Nf6 Nc3 g6 e4 d6 d4 Bg7',
      'Nf3 Nf6 g3 g6 Bg2 Bg7 O-O O-O',
    ],
  },
  grunfeld: {
    side: 'b', against: 'd4',
    name: { ru: 'Защита Грюнфельда', en: 'Grünfeld Defence' },
    keywords: ['грюнфельд', 'grunfeld', 'grünfeld'],
    lines: [
      'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5',
      'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Bc4 c5 Ne2 Nc6',
      'd4 Nf6 c4 g6 Nc3 d5 Nf3 Bg7 Qb3 dxc4 Qxc4 O-O',
      'd4 Nf6 c4 g6 Nc3 d5 Bf4 Bg7 e3 O-O',
      'd4 Nf6 c4 g6 g3 d5 Bg2 Bg7',
      'd4 Nf6 c4 g6 Nf3 Bg7 g3 d5 cxd5 Nxd5 Bg2 O-O',
      'd4 Nf6 Nf3 g6 c4 Bg7 Nc3 d5',
      'd4 Nf6 Bf4 g6 e3 Bg7 Nf3 d5',
      'd4 Nf6 Bg5 Ne4 Bf4 d5',
      'c4 Nf6 Nc3 d5 cxd5 Nxd5 g3 g6',
    ],
  },
  nimzo: {
    side: 'b', against: 'd4',
    name: { ru: 'Защита Нимцовича и новоиндийская', en: "Nimzo- and Queen's Indian" },
    keywords: ['нимцович', 'новоиндий', 'боголюб', 'nimzo', "queen's indian", 'bogo'],
    lines: [
      'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6',
      'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 d5 a3 Bxc3+ Qxc3 Ne4',
      'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5',
      'd4 Nf6 c4 e6 Nc3 Bb4 f3 d5 a3 Bxc3+ bxc3 c5',
      'd4 Nf6 c4 e6 Nc3 Bb4 Bg5 h6 Bh4 c5',
      'd4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+',
      'd4 Nf6 c4 e6 Nf3 Bb4+ Bd2 Qe7 g3 Nc6',
      'd4 Nf6 c4 e6 g3 d5 Bg2 Be7',
      'd4 Nf6 Nf3 e6 c4 b6 Nc3 Bb7',
      'd4 Nf6 Nf3 e6 Bf4 b6 e3 Bb7',
      'd4 Nf6 Bf4 e6 e3 c5',
      'd4 Nf6 Bg5 e6 e4 h6 Bxf6 Qxf6',
      'c4 Nf6 Nc3 e6 d4 Bb4',
      'Nf3 Nf6 c4 e6 Nc3 Bb4',
    ],
  },
  dutch: {
    side: 'b', against: 'd4',
    name: { ru: 'Голландская защита', en: 'Dutch Defence' },
    keywords: ['голланд', 'ленинград', 'dutch'],
    lines: [
      'd4 f5 g3 Nf6 Bg2 e6 Nf3 Be7 O-O O-O c4 d6',
      'd4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O c4 d6',
      'd4 f5 c4 Nf6 Nc3 e6 Nf3 Be7',
      'd4 f5 c4 Nf6 g3 g6 Bg2 Bg7 Nf3 O-O O-O d6',
      'd4 f5 Nf3 Nf6 g3 g6 Bg2 Bg7',
      'd4 f5 e4 fxe4 Nc3 Nf6 Bg5 Nc6',
      'd4 f5 Nc3 d5 Bf4 Nf6',
      'd4 f5 Bf4 Nf6 e3 e6',
      'd4 f5 Bg5 g6',
      'c4 f5 Nc3 Nf6 g3 e6',
      'Nf3 f5 g3 Nf6 Bg2 g6',
    ],
  },
  benoni: {
    side: 'b', against: 'd4',
    name: { ru: 'Защита Бенони', en: 'Benoni Defence' },
    keywords: ['бенони', 'benoni'],
    lines: [
      'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7',
      'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 f4 Bg7',
      'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 Nf3 g6 g3 Bg7 Bg2 O-O',
      'd4 Nf6 c4 c5 d5 d6 Nc3 g6 e4 Bg7',
      'd4 Nf6 Nf3 c5 d5 d6',
      'd4 Nf6 Bf4 c5 e3 Qb6',
      'd4 Nf6 Bg5 c5 d5 Qb6',
      'd4 c5 d5 e5 e4 d6',
    ],
  },
  benko: {
    side: 'b', against: 'd4',
    name: { ru: 'Волжский гамбит', en: 'Benko Gambit' },
    keywords: ['волжск', 'бенко', 'benko'],
    lines: [
      'd4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 g6 Nc3 Bxa6',
      'd4 Nf6 c4 c5 d5 b5 cxb5 a6 e3 g6',
      'd4 Nf6 c4 c5 d5 b5 Nf3 g6',
      'd4 Nf6 Nf3 c5 d5 b5',
      'd4 Nf6 Bf4 c5 e3 Qb6',
    ],
  },
  budapest: {
    side: 'b', against: 'd4',
    name: { ru: 'Будапештский гамбит', en: 'Budapest Gambit' },
    keywords: ['будапешт', 'budapest'],
    lines: [
      'd4 Nf6 c4 e5 dxe5 Ng4 Bf4 Nc6 Nf3 Bb4+',
      'd4 Nf6 c4 e5 dxe5 Ng4 Nf3 Bc5 e3 Nc6',
      'd4 Nf6 c4 e5 d5 Bc5',
      'd4 Nf6 Nf3 e6',
      'd4 Nf6 Bf4 e6 e3 c5',
    ],
  },
  'old-indian': {
    side: 'b', against: 'd4',
    name: { ru: 'Староиндийская защита (старая система)', en: 'Old Indian Defence' },
    keywords: ['старая индийская', 'old indian'],
    lines: [
      'd4 Nf6 c4 d6 Nc3 Nbd7 e4 e5 Nf3 Be7 Be2 O-O',
      'd4 Nf6 c4 d6 Nc3 e5 Nf3 Nbd7',
      'd4 Nf6 Nf3 d6 c4 Nbd7',
      'd4 d6 e4 Nf6 Nc3 e5',
    ],
  },
};

const OPENING_DEFAULTS = { w: 'w-italian', e4: 'open-e5', d4: 'qgd' };

const stripSanMarks = (san) => san.replace(/[+#!?]/g, '');

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

// К какому пункту репертуара относится запись книги: w, e4 или d4
const repertoireSlot = (opening) => (opening.side === 'w' ? 'w' : opening.against);

// Репертуар персонажа: id от нейросети, а если их нет или они не из списка —
// угадываем по тексту про дебюты; в крайнем случае — самые обычные дебюты.
function resolveCharacterRepertoire(ids, openingsText = '') {
  const result = {};
  for (const id of Array.isArray(ids) ? ids : [ids]) {
    const opening = OPENING_BOOK[id];
    if (opening && !result[repertoireSlot(opening)]) result[repertoireSlot(opening)] = id;
  }
  const text = String(openingsText || '').toLowerCase();
  for (const [id, opening] of Object.entries(OPENING_BOOK)) {
    const slot = repertoireSlot(opening);
    if (!result[slot] && opening.keywords.some(k => text.includes(k))) result[slot] = id;
  }
  return { ...OPENING_DEFAULTS, ...result };
}

function describeCharacterRepertoire(rep) {
  return [rep.w, rep.e4, rep.d4].map(openingName).filter(Boolean).join('; ');
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
// Белыми он играет свою систему, чёрными — свои защиты.
function pickBookMove(character, game, color) {
  const rep = character && character.repertoire;
  if (!rep) return null;
  const history = game.history().map(stripSanMarks);
  if (history.length >= bookDepthForElo(character.elo)) return null;
  const ids = color === 'w' ? [rep.w] : [rep.e4, rep.d4];
  const options = [];
  for (const id of ids) {
    for (const line of OPENING_BOOK[id]?.lines || []) {
      if (line.length > history.length && history.every((san, i) => line[i] === san)) options.push(line[history.length]);
    }
  }
  if (!options.length) return null;
  return options[Math.floor(Math.random() * options.length)];
}

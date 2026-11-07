const COLORS = [
  { id: 'red', name: '红', symbol: '◆' },
  { id: 'blue', name: '蓝', symbol: '●' },
  { id: 'green', name: '绿', symbol: '▲' },
  { id: 'yellow', name: '黄', symbol: '■' }
]
const FACES = { skip: '⊘', draw2: '+2', wild: '✦' }
const NAMES = { skip: '跳过', draw2: '罚抽', wild: '换色' }

function shuffle(cards, random) {
  const result = cards.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const card = result[i]
    result[i] = result[j]
    result[j] = card
  }
  return result
}

function create(random = Math.random) {
  const cards = []
  function add(color, rank) {
    const suit = COLORS.find(entry => entry.id === color)
    cards.push({
      id: 'c' + cards.length, color, rank,
      face: FACES[rank] || rank, symbol: suit ? suit.symbol : '✦',
      label: (suit ? suit.name + '色' : '') + (NAMES[rank] || rank)
    })
  }
  COLORS.forEach(({ id }) => {
    for (let number = 0; number < 10; number++) {
      add(id, String(number))
      if (number !== 0) add(id, String(number))
    }
    for (let i = 0; i < 2; i++) {
      add(id, 'skip')
      add(id, 'draw2')
    }
  })
  for (let i = 0; i < 4; i++) add('wild', 'wild')
  const deck = shuffle(cards, random)
  const hands = { player: deck.splice(0, 7), cpu: deck.splice(0, 7) }
  const start = deck.splice(deck.findIndex(card => /^\d$/.test(card.rank)), 1)[0]
  return {
    hands, deck, discard: [start], color: start.color, turn: 'player', winner: null,
    emptyPasses: 0, message: '轮到你：选择同色、同数字或同图案的牌。', random
  }
}

function top(game) {
  return game.discard[game.discard.length - 1]
}

function canPlay(game, card) {
  return Boolean(card && (card.rank === 'wild' || card.color === game.color || card.rank === top(game).rank))
}

function other(side) {
  return side === 'player' ? 'cpu' : 'player'
}

function draw(game, side, amount) {
  let count = 0
  while (count < amount) {
    if (!game.deck.length && game.discard.length > 1) {
      game.deck = shuffle(game.discard.splice(0, game.discard.length - 1), game.random)
    }
    if (!game.deck.length) break
    game.hands[side].push(game.deck.pop())
    count++
  }
  return count
}

function play(game, side, id, color) {
  if (game.turn !== side || game.winner) return false
  const index = game.hands[side].findIndex(card => card.id === id)
  const card = game.hands[side][index]
  if (!canPlay(game, card)) return false
  if (card.rank === 'wild' && !COLORS.some(entry => entry.id === color)) return false
  game.hands[side].splice(index, 1)
  game.discard.push(card)
  game.color = card.rank === 'wild' ? color : card.color
  game.emptyPasses = 0
  const actor = side === 'player' ? '你' : '电脑'
  const opponent = side === 'player' ? '电脑' : '你'
  game.message = actor + '打出「' + card.label + '」'
  if (!game.hands[side].length) {
    game.winner = side
    game.message += '，出完了所有手牌。'
    return true
  }
  if (card.rank === 'draw2') {
    const count = draw(game, other(side), 2)
    game.message += '，' + opponent + (count ? '摸 ' + count + ' 张并跳过回合。' : '跳过回合。')
  } else if (card.rank === 'skip') {
    game.message += '，' + opponent + '跳过回合。'
  } else {
    game.turn = other(side)
    game.message += card.rank === 'wild'
      ? '，改成' + COLORS.find(entry => entry.id === color).name + '色。'
      : '。'
  }
  return true
}

function pass(game, side) {
  if (game.turn !== side || game.winner) return false
  const count = draw(game, side, 1)
  game.emptyPasses = count ? 0 : game.emptyPasses + 1
  game.message = (side === 'player' ? '你' : '电脑') + (count ? '摸了一张牌，结束回合。' : '没有牌可摸，结束回合。')
  game.turn = other(side)
  if (game.emptyPasses >= 2) {
    const diff = game.hands.player.length - game.hands.cpu.length
    game.winner = diff === 0 ? 'tie' : diff < 0 ? 'player' : 'cpu'
    game.message = '双方都无法摸牌，按剩余手牌数结算。'
  }
  return true
}

function cpuMove(game) {
  if (game.turn !== 'cpu' || game.winner) return
  const hand = game.hands.cpu
  const legal = hand.filter(card => canPlay(game, card))
  if (!legal.length) return pass(game, 'cpu')
  const countColor = color => hand.filter(card => card.color === color).length
  const points = card => card.rank === 'wild' ? -1
    : countColor(card.color) + (card.rank === 'skip' || card.rank === 'draw2' ? 5 : 0)
  const chosen = legal.reduce((best, card) => points(card) > points(best) ? card : best)
  const color = COLORS.reduce((best, suit) => countColor(suit.id) > countColor(best.id) ? suit : best).id
  return play(game, 'cpu', chosen.id, color)
}

module.exports = { COLORS, create, top, canPlay, play, pass, cpuMove }

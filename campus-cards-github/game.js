const R = require('./rules')
const canvas = wx.createCanvas()
const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
const w = info.windowWidth
const h = info.windowHeight
const dpr = info.pixelRatio || 1
canvas.width = Math.round(w * dpr)
canvas.height = Math.round(h * dpr)
const ctx = canvas.getContext('2d')
ctx.scale(dpr, dpr)

const palette = { red: '#ff8fa3', blue: '#a4c6ff', green: '#a4e6ab', yellow: '#ffdc84', wild: '#ddbbff' }
const bright = '#dcfca8'
const ink = '#191c33'
const soft = '#bfc3df'
const score = { player: 0, cpu: 0 }
const pageSize = 5
const safe = info.safeArea
const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect()
const insetTop = Math.max((safe && safe.top) || 0, (menu && menu.bottom) || 0, 24) + 11
const insetBottom = Math.min(h - 10, (safe && safe.bottom) || h)
const scale = Math.min(1, (w - 24) / 340, (insetBottom - insetTop) / 544)
const bw = Math.min(w - 24, 400) / scale
const offsetX = (w - bw * scale) / 2
const cx = bw / 2
let game, timer, pending, panel, notice, actions, page, shown = true

function rect(x, y, width, height, fill, radius = 12, stroke) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke() }
}

function text(str, x, y, size, color = '#f6f5ff', align = 'left', bold = false, maxWidth) {
  ctx.font = (bold ? 'bold ' : '') + size + 'px sans-serif'
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  if (maxWidth) ctx.fillText(str, x, y, maxWidth)
  else ctx.fillText(str, x, y)
}

function hit(x, y, width, height, run) {
  if (run) actions.push({ x, y, width, height, run })
}

function button(label, x, y, width, height, run, fill = '#353555', color = '#fff') {
  rect(x, y, width, height, fill, 10)
  text(label, x + width / 2, y + height / 2, 14, color, 'center', true)
  hit(x, y, width, height, run)
}

function card(c, x, y, width, height, playable, faded) {
  if (playable) rect(x - 2, y - 2, width + 4, height + 4, '#faf1ff', 12)
  ctx.globalAlpha = faded ? .63 : 1
  rect(x, y, width, height, palette[c.color], 10)
  text(c.symbol, x + 7, y + 12, 12, ink)
  text(c.face, x + width / 2, y + height / 2, 30, ink, 'center', true)
  if (playable) text('可出', x + width / 2, y + height - 10, 10, ink, 'center', true)
  ctx.globalAlpha = 1
}

function render() {
  actions = []
  ctx.fillStyle = '#14172b'
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ctx.translate(offsetX, insetTop)
  ctx.scale(scale, scale)
  text('AFTER CLASS  /  CARD CLUB', 2, 8, 10, '#c4aeff', 'left', true)
  text('课间牌局', 0, 38, 33, '#fff', 'left', true)
  button('玩法', bw - 56, 20, 56, 32, () => { panel = 'rules'; render() })
  rect(0, 68, bw, 249, '#282a47', 19, '#454668')
  text('电脑对手', 16, 89, 15, '#fff', 'left', true)
  text(game.hands.cpu.length + ' 张手牌', 16, 110, 12, soft)
  const backCount = Math.min(game.hands.cpu.length, 7)
  for (let i = 0; i < backCount; i++) {
    const bx = bw - 20 - (backCount - i) * 15
    rect(bx, 83, 19, 27, '#63549a', 4, '#af9aef')
    text('✦', bx + 9.5, 96, 10, '#efe4ff', 'center')
  }
  const suit = R.COLORS.find(c => c.id === game.color)
  rect(cx - 99, 137, 57, 79, '#554786', 10, '#ae9bef')
  text('✦', cx - 70.5, 177, 26, '#e6dbff', 'center')
  text('牌库 ' + game.deck.length, cx - 70.5, 231, 12, soft, 'center')
  card(R.top(game), cx - 28.5, 137, 57, 79, false, false)
  text('桌面牌', cx, 231, 12, soft, 'center')
  rect(cx + 53, 173, 33, 33, palette[suit.id], 17)
  text(suit.symbol, cx + 69.5, 189.5, 17, ink, 'center')
  text('当前' + suit.name + '色', cx + 69.5, 231, 12, soft, 'center')
  const playerTurn = game.turn === 'player' && !game.winner
  rect(cx - 46, 252, 92, 25, playerTurn ? bright : '#514371', 13)
  text(game.winner ? '本局结束' : playerTurn ? '你的回合' : '电脑回合', cx, 264.5, 13, playerTurn ? ink : '#fff', 'center', true)
  text(notice || game.message, cx, 295, 12, soft, 'center', false, bw - 22)
  const hand = game.hands.player
  const pageCount = Math.max(1, Math.ceil(hand.length / pageSize))
  page = Math.min(page, pageCount - 1)
  text('你的手牌 · ' + hand.length + ' 张', 0, 337, 16, '#fff', 'left', true)
  if (pageCount > 1) {
    button('‹', bw - 100, 323, 27, 28, page > 0 ? () => { page--; render() } : null)
    text((page + 1) + '/' + pageCount, bw - 50, 337, 12, soft, 'center')
    button('›', bw - 27, 323, 27, 28, page + 1 < pageCount ? () => { page++; render() } : null)
  }
  const cw = Math.min(70, (bw - 8 * (pageSize - 1)) / pageSize)
  hand.slice(page * pageSize, (page + 1) * pageSize).forEach((c, i) => {
    const x = i * (cw + 8)
    const playable = playerTurn && R.canPlay(game, c)
    card(c, x, 363, cw, 86, playable, !playable)
    hit(x, 363, cw, 86, playerTurn ? () => selectCard(c) : null)
  })
  const draw = playerTurn && !hand.some(c => R.canPlay(game, c))
  button('摸一张', 0, 468, bw - 106, 42, draw ? () => { if (R.pass(game, 'player')) afterMove() } : null, draw ? bright : '#343750', draw ? ink : soft)
  button('重新开局', bw - 96, 468, 96, 42, () => { panel = 'restart'; render() })
  text('本次比分   你 ' + score.player + ' : ' + score.cpu + ' 电脑', cx, 532, 13, soft, 'center')
  if (pending || panel || game.winner) renderPanel()
  ctx.restore()
}

function renderPanel() {
  actions = []
  ctx.fillStyle = 'rgba(12,13,29,.85)'
  ctx.fillRect(-offsetX / scale, -insetTop / scale, w / scale, h / scale)
  rect(9, 147, bw - 18, 235, '#303052', 20, '#7e70b6')
  if (pending) {
    text('指定下一张牌的颜色', cx, 179, 22, '#fff', 'center', true)
    const sw = (bw - 54) / 2
    R.COLORS.forEach((c, i) => button(c.symbol + ' ' + c.name, 22 + (i % 2) * (sw + 10), 211 + Math.floor(i / 2) * 54, sw, 44, () => {
      const picked = pending
      pending = null
      if (R.play(game, 'player', picked.id, c.id)) afterMove()
    }, palette[c.id], ink))
    button('返回手牌', 22, 330, bw - 44, 36, () => { pending = null; render() })
    return
  }
  if (panel === 'rules') {
    text('怎么玩？', cx, 175, 24, '#fff', 'center', true)
    ;['同色、同数字或同功能图案就能接牌。', '无牌可出时，摸一张并结束回合。', '⊘ 跳过对手；+2 对手抽牌并跳过。', '✦ 可以指定颜色，出完手牌就赢。'].forEach((s, i) => text(s, cx, 214 + i * 24, 14, soft, 'center'))
    button('知道了', 22, 330, bw - 44, 36, () => { panel = null; render() }, bright, ink)
    return
  }
  if (panel === 'restart' && !game.winner) {
    text('重新开局？', cx, 196, 26, '#fff', 'center', true)
    text('本局重新发牌，比分保留。', cx, 251, 15, soft, 'center')
    button('重新发牌', 22, 287, bw - 44, 37, start, bright, ink)
    button('继续这局', 22, 330, bw - 44, 36, () => { panel = null; render() })
    return
  }
  text(game.winner === 'player' ? '你赢了！' : game.winner === 'cpu' ? '电脑赢了' : '这局打平', cx, 196, 29, '#fff', 'center', true)
  text(game.message, cx, 257, 14, soft, 'center', false, bw - 47)
  button('再来一局', 22, 330, bw - 44, 36, start, bright, ink)
}

function start() {
  clearTimeout(timer)
  game = R.create()
  pending = panel = notice = null
  page = 0
  render()
}

function schedule() {
  clearTimeout(timer)
  if (!shown || game.winner || game.turn !== 'cpu') return
  timer = setTimeout(() => { R.cpuMove(game); afterMove() }, 650)
}

function afterMove() {
  notice = null
  if (game.winner && game.winner !== 'tie') score[game.winner]++
  render()
  schedule()
}

function selectCard(c) {
  if (!R.canPlay(game, c)) { notice = '这张牌现在不能出。'; render(); return }
  if (c.rank === 'wild') { pending = c; render(); return }
  if (R.play(game, 'player', c.id)) afterMove()
}

wx.onTouchStart(event => {
  const touch = event.changedTouches && event.changedTouches[0]
  if (!touch) return
  const x = ((touch.clientX == null ? touch.x : touch.clientX) - offsetX) / scale
  const y = ((touch.clientY == null ? touch.y : touch.clientY) - insetTop) / scale
  const action = actions.find(a => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height)
  if (action) action.run()
})
wx.onHide(() => { shown = false; clearTimeout(timer) })
wx.onShow(() => { shown = true; schedule() })
start()

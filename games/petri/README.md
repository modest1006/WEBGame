# 培養シャーレ PETRI

異なる B/S ルールを持つ菌種が円形シャーレ内で縄張りを奪い合う、ライフゲーム系の放置観察ゲームです。自然発生した既知パターンは「新種発見」として菌種ごとに図鑑へ登録されます。

## 起動

- 直接開く: `games/petri/index.html`
- ローカルサーバー: `python -m http.server 8133 --directory games/petri`

## 操作

- クリック/タップ: 選択ツールを適用
- 仕切り棒: ドラッグで不毛の壁を描画
- ホイール: 軽いズーム
- Space: 一時停止
- M: ミュート

## デバッグ API

`window.__game`:

- `getState()`
- `step(ms)`
- `place(speciesId, x, y, pattern)`
- `addPoints(n)`
- `unlock(speciesId)`
- `detectNow()`
- `offlineSim(minutes)`
- `resetDish()`
- `dump()`
- `validate()`

URL:

- `?debug=1`: デバッグ表示
- `?seed=N`: 初期乱数シード指定

`window.__renderOnce(dt)` は 1 フレーム描画し、canvas DataURL の長さを返します。

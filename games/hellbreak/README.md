# HELLBREAK

DOOM風のオリジナル・レトロFPSです。地獄の要塞を3レベル通しで脱出します。

## 起動

- 直接開く: `games/hellbreak/index.html`
- ローカルサーバー: `python -m http.server 8130 --directory games/hellbreak`
- デバッグ表示: `index.html?debug=1`
- 固定シード: `index.html?seed=123`

## 操作

- PC: `WASD` 移動、クリックで pointer lock、マウス横移動で旋回、クリック長押しで射撃
- 武器: `1` ハンドガン、`2` ショットガン、`3` 連射ガン、ホイールで切替
- アクション: `E` / `Space` でドア・スイッチ、`R` リスタート、`M` ミュート、`Esc` ポーズ
- タッチ: 左スティック移動、右半分ドラッグで旋回、`FIRE` 長押し射撃、`USE`、武器ボタン

## 敵・アイテム

- グラント: 近接攻撃の雑魚。集団で接近します。
- インプ系: 視認すると火球を投げます。
- ブルート: 高耐久の大型敵。近距離で強い突進圧を持ちます。
- 爆発バレル: 撃つと範囲爆発し、敵・プレイヤー・他バレルを巻き込みます。
- ピックアップ: 小回復、アーマー、弾薬、色鍵。色付きドアは対応鍵が必要です。

## デバッグAPI

`window.__game`:

- `getState()` HP/アーマー/弾薬/位置/敵/鍵/レベル/状態
- `dump()` レベルASCII
- `step(ms)`, `teleport(x,z)`, `turn(deg)`, `fire(on)`, `move(x,z)`
- `spawn(type, dist)`, `killAll()`, `god()`, `give(what)`, `setLevel(n)`, `openAllDoors()`
- `validate()` ステージのBFS到達検証結果

`window.__renderOnce(dt)` はヘッドレス確認用に1フレーム描画して canvas PNG 文字列長を返します。

## 実装メモ

- `game.js` は DOM/Canvas/THREE 非依存の決定論ロジックです。
- `renderer.js` のみ Three.js r147 UMD を使います。
- WebGL 描画バッファは PC 400x250、タッチ 320x200 に固定し、CSS の `image-rendering: pixelated` で拡大します。
- 敵、アイテム、弾、血しぶき、武器、顔はすべてプロシージャル描画です。
- 各レベルは起動時に、鍵とスイッチ依存を含むBFSで開始地点から出口到達を検証します。

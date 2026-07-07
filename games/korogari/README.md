# コロガリ魂 KOROGARI

粘着ボールを転がして、自分より小さい物を巻き込みながら巨大化する3Dアクションです。舞台は巨大な部屋、庭、街が地続きになったジオラマです。

## 起動

- 直接開く: `games/korogari/index.html`
- ローカルサーバー: `python -m http.server 8131 --directory games/korogari`

## 操作

- WASD / 矢印: カメラ相対移動
- マウス横ドラッグ: カメラ回転
- タッチ左側: バーチャルスティック移動
- タッチ右側ドラッグ: カメラ回転
- R: リスタート
- M: ミュート
- P: ポーズ

## 目標

初期直径0.4mから開始し、制限時間内に 0.8m、2m、5m の段階目標を達成します。目標達成ごとに残り時間が増え、5m到達でクリアです。

## デバッグAPI

`window.__game`:

- `getState()`
- `dump()`
- `step(ms)`
- `move(x, z)`
- `setDiameter(m)`
- `teleport(x, z)`
- `absorbNearest(n)`
- `clearTime()`
- `win()`
- `finish()`
- `validate()`

URLクエリ:

- `?debug=1`: デバッグオーバーレイ
- `?seed=N`: 配置シード指定

`window.__renderOnce(dt)` は1フレーム描画して、canvasのDataURL長を返します。

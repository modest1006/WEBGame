# ワンマン運転士 ONE-MAN DRIVER

Phase 1 コア実装です。残り420〜520m、62〜75km/h、-10〜+10‰ のシード付き条件から始まり、ブレーキだけで停止位置を狙います。

## 起動

- `index.html` を直接開く
- または `python -m http.server 8134 --directory games/oneman`

## 操作

- `↓` / `S`: ブレーキを1段込める
- `↑` / `W`: ブレーキを1段緩める
- `1`〜`9`: B1〜EBへ直接投入
- `E`: EB
- 右端レバーをドラッグ: ノッチにスナップ
- `Enter` / `Space`: タイトルから開始
- `` ` ``: デバッグ表示

## Phase 1 の内容

- `TITLE -> APPROACH -> FINAL -> STOPPED/OVERRUN/CREEP -> STATION_RESULT -> FINAL_RESULT -> TITLE`
- B1〜B8/EB、空気ブレーキ一次遅れ0.6秒、1箇所の上り勾配、停止ジャーク判定
- 停止誤差・減点・操作回数ボーナスのスコアリング
- 速度計、ブレーキレバー、残距離LED、FINAL大型カウンタ、停止時寸法線
- COCKPIT と SIDE_STOP の2カメラ、FINAL へのスウィッシュパン、フェード遷移

## デバッグ API

`window.__game`:

- `getState()`
- `dump()`
- `step(ms)`
- `brake(n)`
- `setSpeed(kmh)`
- `setDist(m)`
- `skipTo(phase)`
- `finishStation(errorM)`
- `result()`
- `validate()`
- `simulatePattern(pattern, limitMs)`
- `constantDistribution(count)`

例:

```js
__game.validate()
__game.simulatePattern([{ at: 0, notch: 5 }])
__game.simulatePattern([{ at: 0, notch: 8 }, { at: 18000, notch: 5 }, { at: 36000, notch: 2 }])
```

# NEON DRIVE

シンセウェイヴ風の疑似 3D ドライブゲームです。交通を避け、ニアミスでブーストを溜め、チェックポイントで残り時間を延長しながら距離とスコアを伸ばします。

## 起動

- `games/neondrive/index.html` をブラウザで直接開けます。
- ローカルサーバーで確認する場合:

```powershell
python -m http.server 8127 --directory games/neondrive
```

その後 `http://localhost:8127/` を開きます。

## 操作

- `←` `→` / `A` `D`: ステア
- `↓` / `S`: ブレーキ
- `Space` / `↑`: ブースト
- `R`: リスタート
- `M`: ミュート
- `P` / `Esc`: ポーズ
- `` ` ``: デバッグ表示
- タッチ: 左右半分の押し分けでステア、下端または 2 本指でブレーキ、上スワイプまたは BOOST ボタンでブースト

## ルール

- アクセルは自動です。高速維持、走行距離、ニアミスでスコアが増えます。
- 他車に接触するとクラッシュし、大幅減速とタイムロスが発生します。クラッシュ回数ではゲームオーバーになりません。
- 一定距離ごとのチェックポイントを通過すると残り時間が延長されます。
- 時間切れが唯一の敗北条件です。
- ベストスコアとベスト距離は `localStorage` に保存されます。

## デバッグ API

`?debug=1` で FPS などのオーバーレイを表示します。`?seed=N` でコースと交通を固定できます。

```js
__game.getState()
__game.dump()
__game.step(1000)
__game.start()
__game.setSpeed(150)
__game.setX(0.3)
__game.setTime(90)
__game.addScore(5000)
__game.teleport(3600)
__game.steer(-1)
__game.brake(true)
__game.boost()
__game.spawnCar(1, 28)
__game.crash()
```

検証例:

```js
__game.setSpeed(160)
__game.spawnCar(1, 18)
__game.steer(0.72)
__game.step(1200)
__game.getState()
```
